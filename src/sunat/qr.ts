import { fmt } from './calculo.js';

/**
 * Contenido del código QR de la representación impresa, según el Reglamento
 * de Comprobantes de Pago (R.S. 193-2020/SUNAT y modificatorias):
 *
 * RUC | TIPO | SERIE | NUMERO | IGV | TOTAL | FECHA | TIPO_DOC_CLIENTE | NUM_DOC_CLIENTE |
 */
export function textoQr(datos: {
  rucEmisor: string;
  tipo: string;
  serie: string;
  correlativo: number;
  igvCentimos: number;
  totalCentimos: number;
  fechaEmision: string; // YYYY-MM-DD
  clienteTipoDoc: string;
  clienteNumDoc: string;
}): string {
  return [
    datos.rucEmisor,
    datos.tipo,
    datos.serie,
    String(datos.correlativo),
    fmt(datos.igvCentimos),
    fmt(datos.totalCentimos),
    datos.fechaEmision,
    datos.clienteTipoDoc,
    datos.clienteNumDoc,
    '',
  ].join('|');
}
