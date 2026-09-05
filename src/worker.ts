import { Hono } from 'hono';
import type { Comprobante, Empresa, NotaCredito, TipoDocIdentidad, AfectacionIgv } from './sunat/types.js';
import { MOTIVOS_NC } from './sunat/types.js';
import { generarInvoiceXml, generarNotaCreditoXml } from './sunat/ubl.js';
import { firmarXml, extraerDigest } from './sunat/sign.js';
import { ENDPOINTS, getStatus, sendBill, sendSummary, SunatError } from './sunat/soap.js';
import { generarResumenXml, type BoletaResumen } from './sunat/resumen.js';
import { textoQr } from './sunat/qr.js';
import { fmt } from './sunat/calculo.js';

/**
 * API del sistema de facturación (Cloudflare Worker + D1 + R2).
 *
 * La emisión nunca se bloquea por SUNAT: el comprobante se firma y archiva al
 * instante ('pendiente') y el envío corre en segundo plano con reintentos.
 * Facturas: sendBill inmediato. Boletas: según MODO_ENVIO_BOLETAS,
 * 'individual' (sendBill, útil en beta) o 'resumen' (Resumen Diario nocturno,
 * como corresponde en producción).
 */

export interface Env {
  DB: D1Database;
  ARCHIVO: R2Bucket;
  // Secrets (wrangler secret put ...):
  CERT_PEM: string;
  CERT_KEY: string;
  SOL_USUARIO: string;
  SOL_CLAVE: string;
  APP_CLAVE: string; // clave de acceso de la app (pantalla de ingreso)
  // Vars:
  SUNAT_AMBIENTE: 'beta' | 'produccion';
  MODO_ENVIO_BOLETAS: 'individual' | 'resumen';
  EMPRESA_JSON: string;
}

interface NuevoComprobanteBody {
  serie: string;
  cliente: { tipoDoc: TipoDocIdentidad; numDoc: string; nombre: string };
  items: Array<{
    descripcion: string;
    montoCentimos: number; // precio final que fija la emisora
    cantidad?: number;
    afectacion?: AfectacionIgv;
  }>;
  moneda?: 'PEN' | 'USD';
}

function ahoraLima(): { fecha: string; hora: string } {
  // Perú es UTC-5 todo el año.
  const d = new Date(Date.now() - 5 * 3600 * 1000);
  return { fecha: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 19) };
}

function empresa(env: Env): Empresa {
  return JSON.parse(env.EMPRESA_JSON) as Empresa;
}

function claveValida(entregada: string | undefined, esperada: string): boolean {
  if (!entregada || !esperada) return false;
  const a = new TextEncoder().encode(entregada);
  const b = new TextEncoder().encode(esperada);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/salud', (c) => c.json({ ok: true }));

// Toda la API (salvo salud) exige la clave de la app.
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/salud') return next();
  const clave = c.req.header('X-Clave') ?? c.req.query('clave');
  if (!claveValida(clave, c.env.APP_CLAVE)) {
    return c.json({ error: 'Clave incorrecta' }, 401);
  }
  return next();
});

app.get('/api/yo', (c) => c.json({ ok: true, empresa: empresa(c.env).razonSocial }));

app.get('/api/series', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT serie, tipo, rubro FROM series ORDER BY serie').all();
  return c.json(results);
});

app.post('/api/comprobantes', async (c) => {
  const body = await c.req.json<NuevoComprobanteBody>();
  if (!body.serie || !body.items?.length || !body.cliente) {
    return c.json({ error: 'Faltan datos: serie, cliente o items' }, 400);
  }
  for (const it of body.items) {
    if (!it.descripcion?.trim()) return c.json({ error: 'Cada ítem necesita descripción' }, 400);
    if (!Number.isInteger(it.montoCentimos) || it.montoCentimos <= 0) {
      return c.json({ error: 'Cada ítem necesita un monto en céntimos mayor a 0' }, 400);
    }
  }

  const serie = await c.env.DB.prepare(
    'UPDATE series SET ultimo_correlativo = ultimo_correlativo + 1 WHERE serie = ? RETURNING tipo, ultimo_correlativo',
  )
    .bind(body.serie)
    .first<{ tipo: '01' | '03'; ultimo_correlativo: number }>();
  if (!serie) return c.json({ error: `Serie no registrada: ${body.serie}` }, 400);

  const { fecha, hora } = ahoraLima();
  const cpe: Comprobante = {
    tipo: serie.tipo,
    serie: body.serie,
    correlativo: serie.ultimo_correlativo,
    fechaEmision: fecha,
    horaEmision: hora,
    moneda: body.moneda ?? 'PEN',
    emisor: empresa(c.env),
    cliente: body.cliente,
    items: body.items.map((it) => ({
      descripcion: it.descripcion.trim(),
      cantidad: it.cantidad ?? 1,
      unidad: 'ZZ',
      precioUnitarioConImpuesto: it.montoCentimos,
      afectacion: it.afectacion ?? '20', // Amazonía: exonerado por defecto
    })),
    tasaIgv: 18,
  };

  let g;
  try {
    g = generarInvoiceXml(cpe);
  } catch (e) {
    return c.json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
  const firmado = firmarXml(g.xml, { privateKeyPem: c.env.CERT_KEY, certPem: c.env.CERT_PEM });
  const xmlKey = `xml/${g.nombre}.xml`;
  await c.env.ARCHIVO.put(xmlKey, firmado);

  const ins = await c.env.DB.prepare(
    `INSERT INTO comprobantes (tipo, serie, correlativo, fecha_emision, hora_emision, moneda,
       cliente_tipo_doc, cliente_num_doc, cliente_nombre,
       total_gravado, total_exonerado, total_inafecto, total_igv, total, leyenda, hash_firma, xml_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      cpe.tipo, cpe.serie, cpe.correlativo, fecha, hora, cpe.moneda,
      cpe.cliente.tipoDoc, cpe.cliente.numDoc, cpe.cliente.nombre,
      g.totales.gravado, g.totales.exonerado, g.totales.inafecto, g.totales.igv, g.totales.total,
      g.leyenda, extraerDigest(firmado), xmlKey,
    )
    .first<{ id: number }>();
  const id = ins!.id;

  const stmtItems = c.env.DB.prepare(
    'INSERT INTO comprobante_items (comprobante_id, descripcion, cantidad, unidad, precio_unitario, afectacion) VALUES (?, ?, ?, ?, ?, ?)',
  );
  await c.env.DB.batch(
    cpe.items.map((it) => stmtItems.bind(id, it.descripcion, it.cantidad, it.unidad, it.precioUnitarioConImpuesto, it.afectacion)),
  );

  // Facturas siempre al toque; boletas solo si el modo es individual.
  if (cpe.tipo === '01' || c.env.MODO_ENVIO_BOLETAS === 'individual') {
    c.executionCtx.waitUntil(enviarASunat(c.env, id));
  }

  return c.json({ id, numero: `${cpe.serie}-${cpe.correlativo}`, total: g.totales.total, leyenda: g.leyenda, estado: 'pendiente' });
});

app.get('/api/comprobantes', async (c) => {
  const desde = c.req.query('desde');
  const hasta = c.req.query('hasta');
  const filtro = desde && hasta ? 'WHERE fecha_emision BETWEEN ? AND ?' : '';
  const stmt = c.env.DB.prepare(
    `SELECT id, tipo, serie, correlativo, fecha_emision, hora_emision, cliente_nombre, cliente_num_doc,
            total, total_igv, estado, cdr_codigo, cdr_descripcion, referencia_id, anulado_por
     FROM comprobantes ${filtro} ORDER BY id DESC LIMIT 500`,
  );
  const { results } = await (filtro ? stmt.bind(desde, hasta) : stmt).all();
  return c.json(results);
});

// Anulación/corrección: emite una nota de crédito por el total del comprobante.
app.post('/api/comprobantes/:id/nota-credito', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ motivoCodigo?: string }>().catch(() => ({}) as { motivoCodigo?: string });
  const motivoCodigo = body.motivoCodigo ?? '01';
  const motivoDescripcion = MOTIVOS_NC[motivoCodigo];
  if (!motivoDescripcion) return c.json({ error: `Motivo no soportado: ${motivoCodigo}` }, 400);

  const orig = await c.env.DB.prepare('SELECT * FROM comprobantes WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!orig) return c.json({ error: 'No existe el comprobante' }, 404);
  if (orig.tipo !== '01' && orig.tipo !== '03') {
    return c.json({ error: 'Solo se puede anular una factura o boleta' }, 400);
  }
  if (orig.anulado_por) return c.json({ error: 'Este comprobante ya fue anulado' }, 400);
  if (orig.estado === 'rechazado') {
    return c.json({ error: 'Un comprobante rechazado no se anula: no fue informado a SUNAT' }, 400);
  }

  const { results: itemsOrig } = await c.env.DB.prepare(
    'SELECT descripcion, cantidad, unidad, precio_unitario, afectacion FROM comprobante_items WHERE comprobante_id = ?',
  )
    .bind(id)
    .all<Record<string, unknown>>();

  // Serie de la NC: misma letra y numeración propia (F001 -> FC01, B002 -> BC02).
  const serieNc = `${String(orig.serie)[0]}C${String(orig.serie).slice(2)}`;
  const serie = await c.env.DB.prepare(
    "UPDATE series SET ultimo_correlativo = ultimo_correlativo + 1 WHERE serie = ? AND tipo = '07' RETURNING ultimo_correlativo",
  )
    .bind(serieNc)
    .first<{ ultimo_correlativo: number }>();
  if (!serie) return c.json({ error: `Serie de nota de crédito no registrada: ${serieNc}` }, 400);

  const { fecha, hora } = ahoraLima();
  const nc: NotaCredito = {
    tipo: '07',
    serie: serieNc,
    correlativo: serie.ultimo_correlativo,
    fechaEmision: fecha,
    horaEmision: hora,
    moneda: orig.moneda as 'PEN' | 'USD',
    emisor: empresa(c.env),
    cliente: {
      tipoDoc: String(orig.cliente_tipo_doc) as TipoDocIdentidad,
      numDoc: String(orig.cliente_num_doc),
      nombre: String(orig.cliente_nombre),
    },
    items: itemsOrig.map((it) => ({
      descripcion: String(it.descripcion),
      cantidad: Number(it.cantidad),
      unidad: String(it.unidad),
      precioUnitarioConImpuesto: Number(it.precio_unitario),
      afectacion: String(it.afectacion) as AfectacionIgv,
    })),
    tasaIgv: 18,
    motivoCodigo,
    motivoDescripcion,
    afectadoTipo: orig.tipo as '01' | '03',
    afectadoSerie: String(orig.serie),
    afectadoCorrelativo: Number(orig.correlativo),
  };

  let g;
  try {
    g = generarNotaCreditoXml(nc);
  } catch (e) {
    return c.json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
  const firmado = firmarXml(g.xml, { privateKeyPem: c.env.CERT_KEY, certPem: c.env.CERT_PEM });
  const xmlKey = `xml/${g.nombre}.xml`;
  await c.env.ARCHIVO.put(xmlKey, firmado);

  const ins = await c.env.DB.prepare(
    `INSERT INTO comprobantes (tipo, serie, correlativo, fecha_emision, hora_emision, moneda,
       cliente_tipo_doc, cliente_num_doc, cliente_nombre,
       total_gravado, total_exonerado, total_inafecto, total_igv, total, leyenda, hash_firma, xml_key,
       referencia_id, motivo_nota)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(
      '07', serieNc, nc.correlativo, fecha, hora, nc.moneda,
      nc.cliente.tipoDoc, nc.cliente.numDoc, nc.cliente.nombre,
      g.totales.gravado, g.totales.exonerado, g.totales.inafecto, g.totales.igv, g.totales.total,
      g.leyenda, extraerDigest(firmado), xmlKey,
      id, `${motivoCodigo} - ${motivoDescripcion}`,
    )
    .first<{ id: number }>();
  const ncId = ins!.id;

  const stmtItems = c.env.DB.prepare(
    'INSERT INTO comprobante_items (comprobante_id, descripcion, cantidad, unidad, precio_unitario, afectacion) VALUES (?, ?, ?, ?, ?, ?)',
  );
  await c.env.DB.batch([
    ...nc.items.map((it) => stmtItems.bind(ncId, it.descripcion, it.cantidad, it.unidad, it.precioUnitarioConImpuesto, it.afectacion)),
    c.env.DB.prepare('UPDATE comprobantes SET anulado_por = ? WHERE id = ?').bind(ncId, id),
  ]);

  // NC de factura: envío individual. NC de boleta: como las boletas.
  if (serieNc.startsWith('F') || c.env.MODO_ENVIO_BOLETAS === 'individual') {
    c.executionCtx.waitUntil(enviarASunat(c.env, ncId));
  }

  return c.json({ id: ncId, numero: `${serieNc}-${nc.correlativo}`, total: g.totales.total, estado: 'pendiente' });
});

app.get('/api/comprobantes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT * FROM comprobantes WHERE id = ?').bind(id).first<Record<string, unknown>>();
  if (!row) return c.json({ error: 'No existe' }, 404);
  const { results: items } = await c.env.DB.prepare(
    'SELECT descripcion, cantidad, unidad, precio_unitario, afectacion FROM comprobante_items WHERE comprobante_id = ?',
  )
    .bind(id)
    .all();
  // Datos de referencia para notas de crédito y comprobantes anulados.
  let referencia = null;
  if (row.referencia_id) {
    referencia = await c.env.DB.prepare('SELECT tipo, serie, correlativo FROM comprobantes WHERE id = ?')
      .bind(row.referencia_id)
      .first();
  }
  let anuladoPor = null;
  if (row.anulado_por) {
    anuladoPor = await c.env.DB.prepare('SELECT id, serie, correlativo, estado FROM comprobantes WHERE id = ?')
      .bind(row.anulado_por)
      .first();
  }
  const e = empresa(c.env);
  const qr = textoQr({
    rucEmisor: e.ruc,
    tipo: String(row.tipo),
    serie: String(row.serie),
    correlativo: Number(row.correlativo),
    igvCentimos: Number(row.total_igv),
    totalCentimos: Number(row.total),
    fechaEmision: String(row.fecha_emision),
    clienteTipoDoc: String(row.cliente_tipo_doc),
    clienteNumDoc: String(row.cliente_num_doc),
  });
  return c.json({ ...row, items, qr, empresa: e, referencia, anuladoPor });
});

// Exportación CSV para la computadora (rango de fechas).
app.get('/api/export.csv', async (c) => {
  const desde = c.req.query('desde') ?? '0000-01-01';
  const hasta = c.req.query('hasta') ?? '9999-12-31';
  const { results } = await c.env.DB.prepare(
    `SELECT tipo, serie, correlativo, fecha_emision, hora_emision, cliente_tipo_doc, cliente_num_doc,
            cliente_nombre, moneda, total_gravado, total_exonerado, total_inafecto, total_igv, total,
            estado, cdr_codigo
     FROM comprobantes WHERE fecha_emision BETWEEN ? AND ? ORDER BY fecha_emision, serie, correlativo`,
  )
    .bind(desde, hasta)
    .all<Record<string, unknown>>();
  const esc = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const cab = 'Tipo,Serie,Numero,Fecha,Hora,TipoDocCliente,DocCliente,Cliente,Moneda,Gravado,Exonerado,Inafecto,IGV,Total,Estado,CodigoCDR';
  const filas = results.map((r) =>
    [
      r.tipo === '01' ? 'FACTURA' : r.tipo === '07' ? 'NOTA CREDITO' : 'BOLETA', r.serie, r.correlativo, r.fecha_emision, r.hora_emision,
      r.cliente_tipo_doc, r.cliente_num_doc, r.cliente_nombre, r.moneda,
      fmt(Number(r.total_gravado)), fmt(Number(r.total_exonerado)), fmt(Number(r.total_inafecto)),
      fmt(Number(r.total_igv)), fmt(Number(r.total)), r.estado, r.cdr_codigo,
    ]
      .map(esc)
      .join(','),
  );
  return new Response('﻿' + [cab, ...filas].join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ventas_${desde}_a_${hasta}.csv"`,
    },
  });
});

// Genera y envía el Resumen Diario con las boletas pendientes de una fecha.
app.post('/api/resumenes', async (c) => {
  const fecha = c.req.query('fecha') ?? ahoraLima().fecha;
  const res = await generarYEnviarResumen(c.env, fecha);
  return c.json(res, res.error ? 400 : 200);
});

app.get('/api/resumenes', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, fecha_referencia, fecha_generacion, numero_dia, nombre, ticket, estado, cdr_codigo, cdr_descripcion FROM resumenes ORDER BY id DESC LIMIT 100',
  ).all();
  return c.json(results);
});

async function enviarASunat(env: Env, comprobanteId: number): Promise<void> {
  const row = await env.DB.prepare(
    'SELECT tipo, serie, correlativo, xml_key, estado FROM comprobantes WHERE id = ?',
  )
    .bind(comprobanteId)
    .first<{ tipo: string; serie: string; correlativo: number; xml_key: string; estado: string }>();
  if (!row || row.estado !== 'pendiente') return;

  const obj = await env.ARCHIVO.get(row.xml_key);
  if (!obj) return;
  const xml = await obj.text();
  const emp = empresa(env);
  const nombre = `${emp.ruc}-${row.tipo}-${row.serie}-${row.correlativo}`;
  const endpoint = ENDPOINTS[env.SUNAT_AMBIENTE];
  const cred = { ruc: emp.ruc, usuario: env.SOL_USUARIO, clave: env.SOL_CLAVE };

  try {
    const res = await sendBill(endpoint, cred, nombre, xml);
    const cdrKey = `cdr/R-${nombre}.zip`;
    await env.ARCHIVO.put(cdrKey, Uint8Array.from(atob(res.cdrZipBase64), (ch) => ch.charCodeAt(0)));
    await env.DB.prepare(
      `UPDATE comprobantes SET estado = ?, cdr_codigo = ?, cdr_descripcion = ?, cdr_key = ?,
         intentos_envio = intentos_envio + 1 WHERE id = ?`,
    )
      .bind(res.aceptado ? 'aceptado' : 'rechazado', res.codigo, res.descripcion, cdrKey, comprobanteId)
      .run();
  } catch (e) {
    // SUNAT caído o error transitorio: queda 'pendiente' y lo reintenta el cron.
    const msg = e instanceof SunatError ? `${e.codigo}: ${e.message}` : String(e);
    await env.DB.prepare(
      'UPDATE comprobantes SET intentos_envio = intentos_envio + 1, cdr_descripcion = ? WHERE id = ?',
    )
      .bind(`(sin CDR aún) ${msg}`.slice(0, 500), comprobanteId)
      .run();
  }
}

async function generarYEnviarResumen(
  env: Env,
  fechaReferencia: string,
): Promise<{ error?: string; id?: number; rc?: string; ticket?: string; boletas?: number }> {
  // Boletas y notas de crédito de boletas (serie B...) del día.
  const { results: boletas } = await env.DB.prepare(
    `SELECT c.id, c.tipo, c.serie, c.correlativo, c.cliente_tipo_doc, c.cliente_num_doc, c.moneda,
            c.total_gravado, c.total_exonerado, c.total_inafecto, c.total_igv, c.total,
            r.serie AS ref_serie, r.correlativo AS ref_correlativo
     FROM comprobantes c
     LEFT JOIN comprobantes r ON r.id = c.referencia_id
     WHERE c.tipo IN ('03', '07') AND c.serie LIKE 'B%'
       AND c.estado = 'pendiente' AND c.resumen_id IS NULL AND c.fecha_emision = ?
     ORDER BY c.serie, c.correlativo`,
  )
    .bind(fechaReferencia)
    .all<Record<string, unknown>>();
  if (boletas.length === 0) return { error: `No hay boletas pendientes del ${fechaReferencia}` };

  const hoy = ahoraLima().fecha;
  const previo = await env.DB.prepare(
    'SELECT COALESCE(MAX(numero_dia), 0) AS n FROM resumenes WHERE fecha_generacion = ?',
  )
    .bind(hoy)
    .first<{ n: number }>();
  const numero = (previo?.n ?? 0) + 1;

  const emp = empresa(env);
  const lineas: BoletaResumen[] = boletas.map((b) => ({
    tipo: b.tipo as '03' | '07',
    docReferencia:
      b.tipo === '07' && b.ref_serie
        ? { tipo: '03', serie: String(b.ref_serie), correlativo: Number(b.ref_correlativo) }
        : undefined,
    serie: String(b.serie),
    correlativo: Number(b.correlativo),
    clienteTipoDoc: String(b.cliente_tipo_doc),
    clienteNumDoc: String(b.cliente_num_doc),
    moneda: b.moneda as 'PEN' | 'USD',
    gravado: Number(b.total_gravado),
    exonerado: Number(b.total_exonerado),
    inafecto: Number(b.total_inafecto),
    igv: Number(b.total_igv),
    total: Number(b.total),
    condicion: 1,
  }));

  const g = generarResumenXml({ emisor: emp, fechaReferencia, fechaGeneracion: hoy, numero, boletas: lineas });
  const firmado = firmarXml(g.xml, { privateKeyPem: env.CERT_KEY, certPem: env.CERT_PEM });
  const xmlKey = `resumen/${g.nombre}.xml`;
  await env.ARCHIVO.put(xmlKey, firmado);

  const ins = await env.DB.prepare(
    `INSERT INTO resumenes (fecha_referencia, fecha_generacion, numero_dia, nombre, xml_key)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(fechaReferencia, hoy, numero, g.nombre, xmlKey)
    .first<{ id: number }>();
  const resumenId = ins!.id;
  await env.DB.batch(
    boletas.map((b) => env.DB.prepare('UPDATE comprobantes SET resumen_id = ? WHERE id = ?').bind(resumenId, b.id)),
  );

  const endpoint = ENDPOINTS[env.SUNAT_AMBIENTE];
  const cred = { ruc: emp.ruc, usuario: env.SOL_USUARIO, clave: env.SOL_CLAVE };
  try {
    const ticket = await sendSummary(endpoint, cred, g.nombre, firmado);
    await env.DB.prepare("UPDATE resumenes SET ticket = ?, estado = 'enviado' WHERE id = ?").bind(ticket, resumenId).run();
    return { id: resumenId, rc: g.id, ticket, boletas: boletas.length };
  } catch (e) {
    // Queda 'pendiente' (sin ticket); el cron lo reintenta.
    const msg = e instanceof SunatError ? `${e.codigo}: ${e.message}` : String(e);
    await env.DB.prepare('UPDATE resumenes SET cdr_descripcion = ? WHERE id = ?').bind(msg.slice(0, 500), resumenId).run();
    return { id: resumenId, rc: g.id, boletas: boletas.length };
  }
}

async function reintentarResumen(env: Env, resumenId: number): Promise<void> {
  const r = await env.DB.prepare('SELECT nombre, xml_key FROM resumenes WHERE id = ? AND estado = ?')
    .bind(resumenId, 'pendiente')
    .first<{ nombre: string; xml_key: string }>();
  if (!r) return;
  const obj = await env.ARCHIVO.get(r.xml_key);
  if (!obj) return;
  const emp = empresa(env);
  try {
    const ticket = await sendSummary(
      ENDPOINTS[env.SUNAT_AMBIENTE],
      { ruc: emp.ruc, usuario: env.SOL_USUARIO, clave: env.SOL_CLAVE },
      r.nombre,
      await obj.text(),
    );
    await env.DB.prepare("UPDATE resumenes SET ticket = ?, estado = 'enviado' WHERE id = ?").bind(ticket, resumenId).run();
  } catch {
    // sigue pendiente
  }
}

async function consultarTicketResumen(env: Env, resumenId: number): Promise<void> {
  const r = await env.DB.prepare('SELECT nombre, ticket FROM resumenes WHERE id = ? AND estado = ?')
    .bind(resumenId, 'enviado')
    .first<{ nombre: string; ticket: string }>();
  if (!r?.ticket) return;
  const emp = empresa(env);
  try {
    const st = await getStatus(
      ENDPOINTS[env.SUNAT_AMBIENTE],
      { ruc: emp.ruc, usuario: env.SOL_USUARIO, clave: env.SOL_CLAVE },
      r.ticket,
    );
    if (st.codigo === '98') return; // aún en proceso
    if (st.cdr) {
      const cdrKey = `cdr/R-${r.nombre}.zip`;
      await env.ARCHIVO.put(cdrKey, Uint8Array.from(atob(st.cdr.cdrZipBase64), (ch) => ch.charCodeAt(0)));
      const estado = st.cdr.aceptado ? 'aceptado' : 'rechazado';
      await env.DB.prepare(
        'UPDATE resumenes SET estado = ?, cdr_codigo = ?, cdr_descripcion = ?, cdr_key = ? WHERE id = ?',
      )
        .bind(estado, st.cdr.codigo, st.cdr.descripcion, cdrKey, resumenId)
        .run();
      // Las boletas del resumen heredan el estado.
      await env.DB.prepare(
        'UPDATE comprobantes SET estado = ?, cdr_codigo = ?, cdr_descripcion = ? WHERE resumen_id = ?',
      )
        .bind(estado, st.cdr.codigo, st.cdr.descripcion, resumenId)
        .run();
    } else if (st.codigo === '99') {
      await env.DB.prepare("UPDATE resumenes SET estado = 'rechazado', cdr_codigo = '99' WHERE id = ?").bind(resumenId).run();
    }
  } catch {
    // se reintenta en el siguiente cron
  }
}

const worker: ExportedHandler<Env> = {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    if (event.cron === '0 3 * * *') {
      // 22:00 hora de Perú: resumen diario de las boletas del día.
      if (env.MODO_ENVIO_BOLETAS === 'resumen') {
        ctx.waitUntil(generarYEnviarResumen(env, ahoraLima().fecha).then(() => undefined));
      }
      return;
    }
    // Cron horario: reintentos y consultas de ticket.
    // En modo resumen, por sendBill solo van facturas y sus notas (serie F...).
    const { results: pendientes } = await env.DB.prepare(
      env.MODO_ENVIO_BOLETAS === 'individual'
        ? "SELECT id FROM comprobantes WHERE estado = 'pendiente' ORDER BY id LIMIT 50"
        : "SELECT id FROM comprobantes WHERE estado = 'pendiente' AND serie LIKE 'F%' ORDER BY id LIMIT 50",
    ).all<{ id: number }>();
    for (const r of pendientes) ctx.waitUntil(enviarASunat(env, r.id));

    const { results: resPend } = await env.DB.prepare(
      "SELECT id, estado FROM resumenes WHERE estado IN ('pendiente', 'enviado') ORDER BY id LIMIT 20",
    ).all<{ id: number; estado: string }>();
    for (const r of resPend) {
      ctx.waitUntil(r.estado === 'pendiente' ? reintentarResumen(env, r.id) : consultarTicketResumen(env, r.id));
    }
  },
};

export default worker;
