/**
 * Convierte un monto en céntimos a su leyenda SUNAT (código 1000):
 * "SON CIENTO DIECIOCHO CON 50/100 SOLES".
 */

const UNIDADES = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE',
  'DIECIOCHO', 'DIECINUEVE', 'VEINTE',
];

const DECENAS = ['', '', 'VEINTI', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];

const CENTENAS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS',
];

function menorQueMil(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  let out = CENTENAS[c] ?? '';
  if (resto > 0) {
    if (out) out += ' ';
    if (resto <= 20) {
      out += UNIDADES[resto];
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      if (d === 2) {
        out += u === 0 ? 'VEINTE' : `VEINTI${UNIDADES[u]}`;
      } else {
        out += DECENAS[d] ?? '';
        if (u > 0) out += ` Y ${UNIDADES[u]}`;
      }
    }
  }
  return out;
}

function enteroEnLetras(n: number): string {
  if (n === 0) return 'CERO';
  let out = '';
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  if (millones > 0) {
    out += millones === 1 ? 'UN MILLON' : `${enteroEnLetras(millones)} MILLONES`;
  }
  if (miles > 0) {
    if (out) out += ' ';
    out += miles === 1 ? 'MIL' : `${menorQueMil(miles)} MIL`;
  }
  if (resto > 0) {
    if (out) out += ' ';
    out += menorQueMil(resto);
  }
  return out;
}

export function montoEnLetras(centimos: number, moneda: 'PEN' | 'USD'): string {
  const entero = Math.floor(centimos / 100);
  const dec = centimos % 100;
  const nombre = moneda === 'PEN' ? 'SOLES' : 'DOLARES AMERICANOS';
  return `SON ${enteroEnLetras(entero)} CON ${String(dec).padStart(2, '0')}/100 ${nombre}`;
}
