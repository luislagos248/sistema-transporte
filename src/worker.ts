import { Hono } from 'hono';
import type { Comprobante, Empresa, TipoDocIdentidad, AfectacionIgv } from './sunat/types.js';
import { generarInvoiceXml } from './sunat/ubl.js';
import { firmarXml, extraerDigest } from './sunat/sign.js';
import { ENDPOINTS, sendBill, SunatError } from './sunat/soap.js';

/**
 * API del sistema de facturación (Cloudflare Worker + D1 + R2).
 *
 * La emisión nunca se bloquea por SUNAT: el comprobante se firma y archiva al
 * instante ('pendiente') y el envío corre en segundo plano con reintentos
 * (waitUntil + cron). El ticket para el cliente sale de inmediato.
 */

export interface Env {
  DB: D1Database;
  ARCHIVO: R2Bucket;
  // Secrets (wrangler secret put ...):
  CERT_PEM: string; // certificado X.509 PEM
  CERT_KEY: string; // clave privada PEM
  SOL_USUARIO: string; // usuario secundario SOL (beta: MODDATOS)
  SOL_CLAVE: string;
  // Vars:
  SUNAT_AMBIENTE: 'beta' | 'produccion';
  EMPRESA_JSON: string; // datos del emisor (Empresa) en JSON
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
  return {
    fecha: d.toISOString().slice(0, 10),
    hora: d.toISOString().slice(11, 19),
  };
}

function empresa(env: Env): Empresa {
  return JSON.parse(env.EMPRESA_JSON) as Empresa;
}

const app = new Hono<{ Bindings: Env }>();

app.get('/api/salud', (c) => c.json({ ok: true }));

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
      afectacion: it.afectacion ?? '20', // Amazonía: exonerado por defecto (confirmado por el contador)
    })),
    tasaIgv: 18,
  };

  const g = generarInvoiceXml(cpe);
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

  // Envío a SUNAT en segundo plano: el ticket no espera.
  c.executionCtx.waitUntil(enviarASunat(c.env, id));

  return c.json({
    id,
    numero: `${cpe.serie}-${cpe.correlativo}`,
    total: g.totales.total,
    leyenda: g.leyenda,
    estado: 'pendiente',
  });
});

app.get('/api/comprobantes', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, tipo, serie, correlativo, fecha_emision, cliente_nombre, total, estado, cdr_codigo, cdr_descripcion
     FROM comprobantes ORDER BY id DESC LIMIT 100`,
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
    // TODO(fase resumen diario): en producción las boletas (tipo 03) se
    // informarán vía Resumen Diario nocturno en lugar de sendBill.
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

const worker: ExportedHandler<Env> = {
  fetch: app.fetch,
  // Cron: reintenta los pendientes (el plazo legal de facturas es 3 días
  // calendario; el cron corre cada hora, ver wrangler.toml).
  async scheduled(_event, env, ctx) {
    const { results } = await env.DB.prepare(
      "SELECT id FROM comprobantes WHERE estado = 'pendiente' ORDER BY id LIMIT 50",
    ).all<{ id: number }>();
    for (const r of results) ctx.waitUntil(enviarASunat(env, r.id));
  },
};

export default worker;
