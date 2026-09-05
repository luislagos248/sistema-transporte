import type { Comprobante, LineaCalculada, Totales } from './types.js';

/**
 * Cálculo de importes según reglas SUNAT.
 *
 * La emisora fija el PRECIO FINAL (con IGV incluido cuando la operación es
 * gravada). A partir de él se desagrega el valor de venta y el IGV, que es
 * como SUNAT espera recibir los importes en el XML.
 */

/** Redondeo half-up sobre céntimos. */
function round(n: number): number {
  return Math.round(n);
}

export function calcularLinea(
  item: Comprobante['items'][number],
  tasaIgv: number,
): LineaCalculada {
  const bruto = round(item.precioUnitarioConImpuesto * item.cantidad);
  if (item.afectacion === '10') {
    const factor = 1 + tasaIgv / 100;
    const valorVenta = round(bruto / factor);
    return {
      item,
      valorVenta,
      igv: bruto - valorVenta,
      valorUnitario: round(item.precioUnitarioConImpuesto / factor),
      precioUnitario: item.precioUnitarioConImpuesto,
    };
  }
  // Exonerado o inafecto: el precio es el valor, no hay IGV que desagregar.
  return {
    item,
    valorVenta: bruto,
    igv: 0,
    valorUnitario: item.precioUnitarioConImpuesto,
    precioUnitario: item.precioUnitarioConImpuesto,
  };
}

export function calcularTotales(cpe: Comprobante): { lineas: LineaCalculada[]; totales: Totales } {
  const lineas = cpe.items.map((it) => calcularLinea(it, cpe.tasaIgv));
  const totales: Totales = { gravado: 0, exonerado: 0, inafecto: 0, igv: 0, total: 0 };
  for (const l of lineas) {
    if (l.item.afectacion === '10') totales.gravado += l.valorVenta;
    else if (l.item.afectacion === '20') totales.exonerado += l.valorVenta;
    else totales.inafecto += l.valorVenta;
    totales.igv += l.igv;
  }
  totales.total = totales.gravado + totales.exonerado + totales.inafecto + totales.igv;
  return { lineas, totales };
}

/** Formatea céntimos como decimal con 2 dígitos: 11850 -> "118.50". */
export function fmt(centimos: number): string {
  const sign = centimos < 0 ? '-' : '';
  const abs = Math.abs(centimos);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
