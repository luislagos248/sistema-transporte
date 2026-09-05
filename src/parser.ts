/**
 * Analizador de mensajes de WhatsApp / notas dictadas.
 *
 * Los clientes y choferes mandan textos como:
 *   "10729755520 3 pasajes pucallpa san alejandro a 50
 *    2 pasajes san alejandro pucallpa 50"
 * El analizador saca el documento y nombre del mensaje completo, y luego
 * analiza LÍNEA POR LÍNEA para detectar varios ítems (cantidad, monto,
 * descripción, fechas). Lo que no se pueda deducir queda en `faltantes`.
 */

export interface ItemAnalizado {
  descripcion?: string;
  cantidad: number;
  /** Monto TOTAL del ítem en céntimos (si se detectó). */
  montoTotalCentimos?: number;
  /** true si el monto se dijo por unidad ("a 50", "50 por día/cada uno"). */
  montoPorUnidad?: boolean;
  /** true si dijeron explícitamente que es el total ("total 150", "son 150"). */
  montoEsTotalExplicito?: boolean;
  /** Rango de fechas ("del 3 al 5 de agosto"), en YYYY-MM-DD. */
  fechas?: { desde: string; hasta: string; dias: number };
  /** 'monto' | 'descripcion' que falten en este ítem. */
  faltantes: string[];
}

export interface MensajeAnalizado extends ItemAnalizado {
  tipoDoc?: '1' | '6'; // DNI | RUC
  numDoc?: string;
  /** Nombre/razón social detectado en el texto (la consulta RUC/DNI manda). */
  nombre?: string;
  /** Todos los ítems detectados (los campos heredados son los del primero). */
  items: ItemAnalizado[];
  /** Notas para mostrar (ej. se asumió que el monto es el total). */
  avisos: string[];
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** "del 3 de agosto al 5 de agosto", "del 3 al 5 de agosto", "del 03/08 al 05/08". */
function extraerFechas(texto: string): ItemAnalizado['fechas'] {
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
  /pasajes?|boletos?|encomiendas?|cajas?|bultos?|sacos?|paquetes?|sobres?|noches?|hospedaje|habitaci[oó]n|alquiler|carga|flete|viaje|traslado|servicio/i;

function limpiar(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Convierte "60", "60.50", "60,50" a céntimos. */
function aCentimos(num: string): number {
  return Math.round(parseFloat(num.replace(',', '.')) * 100);
}

/** Analiza UNA línea como ítem: fechas, cantidad, monto y descripción. */
function analizarItem(lineaCruda: string): ItemAnalizado {
  const out: ItemAnalizado = { cantidad: 1, faltantes: [] };
  let texto = ` ${lineaCruda} `;

  // Fechas ("del 3 al 5 de agosto"): fijan los días y no son montos.
  out.fechas = extraerFechas(texto);
  if (out.fechas) {
    texto = texto.replace(
      /del?\s+\d{1,2}(?:\s+de\s+[a-zñ]+|\/\d{1,2})?\s+(?:al|hasta(?:\s+el)?)\s+\d{1,2}(?:\s+de\s+[a-zñ]+|\/\d{1,2})/gi,
      ' FECHASRANGO ',
    );
    if (out.fechas.dias > 0) out.cantidad = out.fechas.dias;
  } else {
    const cant = texto.match(PALABRAS_CANTIDAD) ?? texto.match(/\bx\s?(\d{1,3})\b/i);
    if (cant) {
      const n = parseInt(cant[1]!, 10);
      if (n >= 1 && n <= 200) out.cantidad = n;
    }
  }

  // Monto: con S/ o "soles", o con decimales; entre varios, el último.
  const montos: Array<{ valor: number; texto: string; fuerte: boolean }> = [];
  const reMonto = /(?:s\/\.?\s*)?(\d{1,6}(?:[.,]\d{1,2})?)(\s*(?:soles|sol)\b)?/gi;
  for (const m of texto.matchAll(reMonto)) {
    const conSimbolo = /s\//i.test(m[0]) || Boolean(m[2]);
    const conDecimales = /[.,]\d{1,2}$/.test(m[1]!);
    const valor = aCentimos(m[1]!);
    if (valor <= 0) continue;
    if (!conSimbolo && !conDecimales && valor === out.cantidad * 100) continue; // es la cantidad
    if (conSimbolo || conDecimales) montos.push({ valor, texto: m[0], fuerte: true });
    else if (valor >= 300) montos.push({ valor, texto: m[0], fuerte: false }); // >= S/3 suelto
  }
  const elegido = montos.filter((m) => m.fuerte).pop() ?? montos.pop();
  if (elegido) {
    // "a 50", "50 por día", "50 cada uno": el monto es por unidad.
    const idx = texto.indexOf(elegido.texto);
    const antes = texto.slice(Math.max(0, idx - 12), idx);
    const despues = texto.slice(idx + elegido.texto.length, idx + elegido.texto.length + 22);
    // "total 150", "son 150", "150 en total": es el total, dicho con todas sus letras.
    out.montoEsTotalExplicito =
      /\b(total|son|hacen?)\s*[:.]?\s*$/i.test(antes) || /^\s*en\s+total\b/i.test(despues);
    out.montoPorUnidad =
      !out.montoEsTotalExplicito &&
      out.cantidad > 1 &&
      (/\ba\s*$/i.test(antes) || /^\s*(por|cada)\b/i.test(despues) || /\b(por\s+(d[ií]a|noche|pasaje|persona|unidad)|cada\s+un[oa])\b/i.test(despues));
    out.montoTotalCentimos = out.montoPorUnidad ? elegido.valor * out.cantidad : elegido.valor;
    texto = texto.replace(elegido.texto, ' ');
  } else {
    out.faltantes.push('monto');
  }
  texto = texto.replace(/\b(s\/\.?|soles?|monto|total|precio|costo)\b\s*[:.]?/gi, ' ');

  // Descripción: lo que queda de la línea, sin números largos ni símbolos.
  let desc = limpiar(
    texto
      .replace(/(?<![\d.,])\d{4,}(?![\d.,])/g, ' ') // números largos sueltos (teléfonos)
      .replace(/[|•*_~]/g, ' '),
  );
  if (out.fechas) {
    const f = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    desc = limpiar(desc.replace(/FECHASRANGO/g, `del ${f(out.fechas.desde)} al ${f(out.fechas.hasta)}`));
  }
  desc = desc.replace(/\s+(a|de|por|con|y|en)$/i, '').trim();
  if (desc.length >= 3 && /[a-záéíóúñ]/i.test(desc)) {
    out.descripcion = desc.charAt(0).toUpperCase() + desc.slice(1);
  } else {
    out.faltantes.push('descripcion');
  }
  return out;
}

export function analizarMensaje(textoCrudo: string): MensajeAnalizado {
  const global: Pick<MensajeAnalizado, 'tipoDoc' | 'numDoc' | 'nombre'> = {};
  let texto = ` ${textoCrudo.replace(/\r/g, '')} `;

  // 1) Documento (una sola vez para todo el mensaje).
  const ruc = texto.match(/\b(?:10|15|17|20)\d{9}\b/);
  if (ruc) {
    global.tipoDoc = '6';
    global.numDoc = ruc[0];
    texto = texto.replace(ruc[0], ' ');
  } else {
    const dni = texto.match(/(?<![\d.,])(\d{8})(?![\d.,])/);
    if (dni) {
      global.tipoDoc = '1';
      global.numDoc = dni[1]!;
      texto = texto.replace(dni[1]!, ' ');
    }
  }
  texto = texto.replace(/\b(ruc|dni|doc(?:umento)?|n[uú]mero)\b\s*[:.]?/gi, ' ');

  // 2) Nombre: tras etiquetas típicas, o con sufijo societario.
  const etiquetaNombre = texto.match(
    /(?:raz[oó]n social|a nombre de|nombre|sr\.?a?|se[nñ]or(?:a)?|cliente)\s*[:.]?\s+([a-záéíóúñ&.\- ]{6,60})/i,
  );
  if (etiquetaNombre) {
    global.nombre = limpiar(etiquetaNombre[1]!).replace(/\b(con|por|para)\b.*$/i, '').trim();
    texto = texto.replace(etiquetaNombre[0], ' '); // fuera la etiqueta Y el nombre
  } else {
    const empresa = texto.match(/([A-ZÁÉÍÓÚÑa-záéíóúñ&.\- ]{5,60}\b(?:s\.?a\.?c\.?|e\.?i\.?r\.?l\.?|s\.?r\.?l\.?|s\.?a\.?a?\.?))(?=\s|$)/i);
    if (empresa) {
      global.nombre = limpiar(empresa[1]!);
      texto = texto.replace(empresa[1]!, ' ');
    }
  }

  // 3) Ítems: una línea = un ítem; las líneas sueltas se pegan a la anterior.
  const items: ItemAnalizado[] = [];
  const avisos: string[] = [];
  for (const linea of texto.split('\n')) {
    if (!limpiar(linea)) continue;
    const cand = analizarItem(linea);
    const sinNada = cand.faltantes.includes('descripcion') && cand.faltantes.includes('monto');
    if (sinNada) continue;
    const previo = items[items.length - 1];
    if (cand.faltantes.includes('descripcion') && cand.montoTotalCentimos && previo?.faltantes.includes('monto')) {
      // Línea solo-monto ("total 35.50"): completa el ítem anterior.
      previo.montoTotalCentimos = cand.montoTotalCentimos;
      previo.faltantes = previo.faltantes.filter((f) => f !== 'monto');
    } else if (cand.faltantes.includes('monto') && cand.descripcion && !PALABRAS_SERVICIO.test(cand.descripcion) && previo) {
      // Línea solo-texto sin pinta de servicio: alarga la descripción anterior.
      previo.descripcion = limpiar(`${previo.descripcion ?? ''} ${cand.descripcion}`);
    } else {
      items.push(cand);
    }
  }
  if (items.length === 0) items.push({ cantidad: 1, faltantes: ['descripcion', 'monto'] });

  // 4) Si un ítem fijó precio POR UNIDAD, las líneas hermanas con el mismo
  //    número suelto también son por unidad ("3 pasajes a 50 / 2 pasajes 50").
  const unitarios = items.filter((it) => it.montoPorUnidad);
  for (const it of items) {
    if (it.montoPorUnidad || it.montoEsTotalExplicito || !it.montoTotalCentimos || it.cantidad <= 1) continue;
    if (unitarios.some((u) => u.montoTotalCentimos! / u.cantidad === it.montoTotalCentimos)) {
      it.montoPorUnidad = true;
      it.montoTotalCentimos = it.montoTotalCentimos * it.cantidad;
    }
  }

  for (const it of items) {
    if (!it.montoTotalCentimos) continue;
    if (it.montoPorUnidad) {
      avisos.push(`${it.descripcion ?? 'Ítem'}: S/ ${(it.montoTotalCentimos / it.cantidad / 100).toFixed(2)} por unidad × ${it.cantidad} = S/ ${(it.montoTotalCentimos / 100).toFixed(2)}.`);
    } else if (it.cantidad > 1) {
      avisos.push(`${it.descripcion ?? 'Ítem'}: se asumió que S/ ${(it.montoTotalCentimos / 100).toFixed(2)} es el TOTAL por las ${it.cantidad} unidades.`);
    }
  }

  const primero = items[0]!;
  const faltantes = [...(global.numDoc ? [] : ['documento']), ...primero.faltantes];
  return { ...primero, ...global, items, faltantes, avisos };
}

/**
 * Distribuye el monto total del ítem en cantidad y precio unitario (céntimos).
 * Si no divide exacto, se emite como 1 ítem por el total para que los
 * céntimos siempre cuadren.
 */
export function repartirMonto(a: ItemAnalizado): { cantidad: number; precioUnitarioCentimos: number } | null {
  if (!a.montoTotalCentimos) return null;
  if (a.cantidad > 1 && a.montoTotalCentimos % a.cantidad === 0) {
    return { cantidad: a.cantidad, precioUnitarioCentimos: a.montoTotalCentimos / a.cantidad };
  }
  return { cantidad: 1, precioUnitarioCentimos: a.montoTotalCentimos };
}
