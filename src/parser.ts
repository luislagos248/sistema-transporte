/**
 * Analizador de mensajes de WhatsApp / notas dictadas.
 *
 * Los clientes y choferes mandan textos como:
 *   "Ruc 20123456789 Transportes El Rapido SAC 2 pasajes pucallpa aguaytia 60 soles"
 *   "dni 44556677 juan perez encomienda 1 caja S/ 25"
 * El analizador extrae documento, nombre, cantidad, monto y descripción con
 * reglas deterministas; lo que no se pueda deducir queda en `faltantes` para
 * que la app se lo pregunte a la emisora.
 */

export interface MensajeAnalizado {
  tipoDoc?: '1' | '6'; // DNI | RUC
  numDoc?: string;
  /** Nombre/razón social detectado en el texto (la consulta RUC/DNI manda). */
  nombre?: string;
  descripcion?: string;
  cantidad: number;
  /** Monto TOTAL en céntimos (si se detectó). */
  montoTotalCentimos?: number;
  /** Campos que faltan y hay que preguntar: 'documento' | 'monto' | 'descripcion'. */
  faltantes: string[];
  /** Notas para mostrar (ej. se asumió que el monto es el total). */
  avisos: string[];
  /** Rango de fechas dicho/escrito ("del 3 al 5 de agosto"), en YYYY-MM-DD. */
  fechas?: { desde: string; hasta: string; dias: number };
  /** true si el monto se dijo por unidad ("a 40 soles", "40 por día/cada uno"). */
  montoPorUnidad?: boolean;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** "del 3 de agosto al 5 de agosto", "del 3 al 5 de agosto", "del 03/08 al 05/08". */
function extraerFechas(texto: string): MensajeAnalizado['fechas'] {
  const anio = new Date(Date.now() - 5 * 3600 * 1000).getFullYear();
  const arma = (d1: number, m1: number, d2: number, m2: number) => {
    const desde = new Date(Date.UTC(anio, m1 - 1, d1));
    const hasta = new Date(Date.UTC(anio, m2 - 1, d2));
    if (!(hasta > desde)) return undefined;
    const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000);
    const iso = (x: Date) => x.toISOString().slice(0, 10);
    return { desde: iso(desde), hasta: iso(hasta), dias };
  };
  const nombreMes = texto.match(
    /del?\s+(\d{1,2})(?:\s+de\s+([a-zñ]+))?\s+(?:al|hasta(?:\s+el)?)\s+(\d{1,2})\s+de\s+([a-zñ]+)/i,
  );
  if (nombreMes) {
    const m2 = MESES[nombreMes[4]!.toLowerCase()];
    const m1 = nombreMes[2] ? MESES[nombreMes[2].toLowerCase()] : m2;
    if (m1 && m2) return arma(parseInt(nombreMes[1]!, 10), m1, parseInt(nombreMes[3]!, 10), m2);
  }
  const numerico = texto.match(/del?\s+(\d{1,2})\/(\d{1,2})\s+(?:al|hasta(?:\s+el)?)\s+(\d{1,2})\/(\d{1,2})/i);
  if (numerico) {
    return arma(parseInt(numerico[1]!, 10), parseInt(numerico[2]!, 10), parseInt(numerico[3]!, 10), parseInt(numerico[4]!, 10));
  }
  return undefined;
}

const PALABRAS_CANTIDAD =
  /(\d{1,3})\s*(pasajes?|boletos?|encomiendas?|cajas?|bultos?|sacos?|paquetes?|sobres?|noches?|d[ií]as?|habitaci[oó]n(?:es)?|personas?|unidades?)/i;

const PALABRAS_SERVICIO =
  /pasajes?|boletos?|encomiendas?|cajas?|bultos?|sacos?|paquetes?|sobres?|noches?|hospedaje|habitaci[oó]n|carga|flete|viaje|traslado|servicio/i;

function limpiar(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Convierte "60", "60.50", "60,50" a céntimos. */
function aCentimos(num: string): number {
  return Math.round(parseFloat(num.replace(',', '.')) * 100);
}

export function analizarMensaje(textoCrudo: string): MensajeAnalizado {
  const out: MensajeAnalizado = { cantidad: 1, faltantes: [], avisos: [] };
  let texto = ` ${textoCrudo.replace(/\r/g, '')} `;

  // 0) Fechas habladas/escritas ("del 3 al 5 de agosto"): sirven de cantidad
  //    de días en hospedaje y no deben confundirse con montos o cantidades.
  out.fechas = extraerFechas(texto);
  if (out.fechas) {
    texto = texto.replace(
      /del?\s+\d{1,2}(?:\s+de\s+[a-zñ]+|\/\d{1,2})?\s+(?:al|hasta(?:\s+el)?)\s+\d{1,2}(?:\s+de\s+[a-zñ]+|\/\d{1,2})/gi,
      ` FECHASRANGO `,
    );
    if (out.fechas.dias > 0) out.cantidad = out.fechas.dias;
  }

  // 1) Documento: RUC (11 dígitos, empieza en 10/15/17/20) o DNI (8 dígitos).
  const ruc = texto.match(/\b(?:10|15|17|20)\d{9}\b/);
  if (ruc) {
    out.tipoDoc = '6';
    out.numDoc = ruc[0];
    texto = texto.replace(ruc[0], ' ');
  } else {
    // DNI: 8 dígitos que no sean parte de un número mayor ni un monto decimal.
    const dni = texto.match(/(?<![\d.,])(\d{8})(?![\d.,])/);
    if (dni) {
      out.tipoDoc = '1';
      out.numDoc = dni[1]!;
      texto = texto.replace(dni[1]!, ' ');
    } else {
      out.faltantes.push('documento');
    }
  }

  // Quitar etiquetas del documento para que no ensucien la descripción.
  texto = texto.replace(/\b(ruc|dni|doc(?:umento)?|n[uú]mero)\b\s*[:.]?/gi, ' ');

  // 2) Cantidad ("2 pasajes", "x2"); las fechas ya fijaron los días si las hubo.
  if (!out.fechas) {
    const cant = texto.match(PALABRAS_CANTIDAD) ?? texto.match(/\bx\s?(\d{1,3})\b/i);
    if (cant) {
      const n = parseInt(cant[1]!, 10);
      if (n >= 1 && n <= 200) out.cantidad = n;
    }
  }

  // 3) Monto: con S/ o "soles", o con decimales; si hay varios, el último.
  const montos: Array<{ valor: number; texto: string; fuerte: boolean }> = [];
  const reMonto = /(?:s\/\.?\s*)?(\d{1,6}(?:[.,]\d{1,2})?)(\s*(?:soles|sol)\b)?/gi;
  for (const m of texto.matchAll(reMonto)) {
    const conSimbolo = /s\//i.test(m[0]) || Boolean(m[2]);
    const conDecimales = /[.,]\d{1,2}$/.test(m[1]!);
    const valor = aCentimos(m[1]!);
    if (valor <= 0) continue;
    // Un entero suelto igual a la cantidad detectada no es un monto.
    if (!conSimbolo && !conDecimales && valor === out.cantidad * 100) continue;
    if (conSimbolo || conDecimales) montos.push({ valor, texto: m[0], fuerte: true });
    else if (valor >= 300) montos.push({ valor, texto: m[0], fuerte: false }); // >= S/3 suelto
  }
  const elegido = montos.filter((m) => m.fuerte).pop() ?? montos.pop();
  if (elegido) {
    out.montoTotalCentimos = elegido.valor;
    // "a 40 soles", "40 por día", "40 cada uno": el monto es por unidad.
    const idx = texto.indexOf(elegido.texto);
    const antes = texto.slice(Math.max(0, idx - 12), idx);
    const despues = texto.slice(idx + elegido.texto.length, idx + elegido.texto.length + 22);
    out.montoPorUnidad =
      out.cantidad > 1 &&
      (/\ba\s*$/i.test(antes) || /^\s*(por|cada)\b/i.test(despues) || /\b(por\s+(d[ií]a|noche|pasaje|persona|unidad)|cada\s+un[oa])\b/i.test(despues));
    texto = texto.replace(elegido.texto, ' ');
    if (out.montoPorUnidad) {
      out.montoTotalCentimos = elegido.valor * out.cantidad;
      out.avisos.push(`S/ ${(elegido.valor / 100).toFixed(2)} por unidad × ${out.cantidad} = S/ ${((elegido.valor * out.cantidad) / 100).toFixed(2)} en total.`);
    } else if (out.cantidad > 1) {
      out.avisos.push(`Se asumió que S/ ${(elegido.valor / 100).toFixed(2)} es el TOTAL por las ${out.cantidad} unidades.`);
    }
  } else {
    out.faltantes.push('monto');
  }
  texto = texto.replace(/\b(s\/\.?|soles?|monto|total|precio|costo)\b\s*[:.]?/gi, ' ');

  // 4) Nombre: tras etiquetas típicas, o línea con forma de razón social.
  const etiquetaNombre = textoCrudo.match(
    /(?:raz[oó]n social|a nombre de|nombre|sr\.?a?|se[nñ]or(?:a)?|cliente)\s*[:.]?\s+([a-záéíóúñ&.\- ]{6,60})/i,
  );
  if (etiquetaNombre) {
    out.nombre = limpiar(etiquetaNombre[1]!).replace(/\b(con|por|para|ruc|dni)\b.*$/i, '').trim();
  } else {
    const empresa = textoCrudo.match(/([A-ZÁÉÍÓÚÑa-záéíóúñ&.\- ]{5,60}\b(?:s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|s\.?a\.?a?\.?))(?=\s|$)/i);
    if (empresa) out.nombre = limpiar(empresa[1]!);
  }
  if (out.nombre) texto = texto.replace(out.nombre, ' ');

  // 5) Descripción: la línea con palabras de servicio; si no, lo que quede.
  const lineas = texto
    .split('\n')
    .map(limpiar)
    .filter((l) => l.length >= 3 && /[a-záéíóúñ]/i.test(l));
  const conServicio = lineas.filter((l) => PALABRAS_SERVICIO.test(l));
  let desc = (conServicio.length ? conServicio : lineas).join(' ');
  desc = limpiar(
    desc
      .replace(/(?<![\d.,])\d{4,}(?![\d.,])/g, ' ') // números largos sueltos (teléfonos)
      .replace(/[|•*_~]/g, ' '),
  );
  if (out.fechas) {
    const f = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    desc = limpiar(desc.replace(/FECHASRANGO/g, `del ${f(out.fechas.desde)} al ${f(out.fechas.hasta)}`));
  }
  desc = desc.replace(/\s+(a|de|por|con|y|en)$/i, '').trim();
  if (desc.length >= 3) {
    out.descripcion = desc.charAt(0).toUpperCase() + desc.slice(1);
  } else {
    out.faltantes.push('descripcion');
  }

  return out;
}

/**
 * Distribuye el monto total en cantidad y precio unitario en céntimos.
 * Si no divide exacto, se emite como 1 ítem por el total (con la cantidad
 * mencionada en la descripción) para que los totales cuadren al céntimo.
 */
export function repartirMonto(a: MensajeAnalizado): { cantidad: number; precioUnitarioCentimos: number } | null {
  if (!a.montoTotalCentimos) return null;
  if (a.cantidad > 1 && a.montoTotalCentimos % a.cantidad === 0) {
    return { cantidad: a.cantidad, precioUnitarioCentimos: a.montoTotalCentimos / a.cantidad };
  }
  return { cantidad: 1, precioUnitarioCentimos: a.montoTotalCentimos };
}
