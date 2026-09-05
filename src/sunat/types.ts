/**
 * Tipos de dominio para la emisión de comprobantes electrónicos SUNAT.
 *
 * Todos los montos se manejan en CÉNTIMOS (enteros) para evitar errores de
 * redondeo con números de punto flotante. Ej: S/ 118.50 => 11850.
 */

/** Catálogo 06 — tipo de documento de identidad. */
export type TipoDocIdentidad =
  | '0' // Sin RUC / varios
  | '1' // DNI
  | '4' // Carnet de extranjería
  | '6' // RUC
  | '7'; // Pasaporte

/** Catálogo 01 — tipo de comprobante (los que usa este sistema). */
export type TipoComprobante = '01' | '03' | '07' | '08'; // factura, boleta, NC, ND

/** Catálogo 07 — afectación del IGV por línea (subset usado). */
export type AfectacionIgv =
  | '10' // Gravado - operación onerosa
  | '20' // Exonerado - operación onerosa
  | '30'; // Inafecto - operación onerosa

export interface Empresa {
  ruc: string;
  razonSocial: string;
  nombreComercial?: string;
  /** Ubigeo INEI de 6 dígitos, ej. 250101 (Callería, Coronel Portillo, Ucayali). */
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  direccion: string;
  /** Código de establecimiento anexo declarado en el RUC ("0000" = principal). */
  codigoEstablecimiento?: string;
}

export interface Cliente {
  tipoDoc: TipoDocIdentidad;
  /** Número de DNI/RUC/etc. Para tipo '0' (varios) usar '-'. */
  numDoc: string;
  nombre: string;
  direccion?: string;
}

export interface ItemComprobante {
  descripcion: string;
  cantidad: number; // puede ser decimal (ej. 1.5)
  /** Código de unidad UN/ECE rec 20. 'NIU' unidad, 'ZZ' servicio. */
  unidad: string;
  /** Precio unitario CON IGV (si gravado) en céntimos: lo que fija la emisora. */
  precioUnitarioConImpuesto: number;
  afectacion: AfectacionIgv;
}

export interface Comprobante {
  tipo: TipoComprobante;
  serie: string; // ej. 'F001' | 'B001'
  correlativo: number; // 1..99999999
  /** Fecha local de emisión en formato YYYY-MM-DD. */
  fechaEmision: string;
  /** Hora local HH:MM:SS. */
  horaEmision: string;
  moneda: 'PEN' | 'USD';
  emisor: Empresa;
  cliente: Cliente;
  items: ItemComprobante[];
  /** Tasa de IGV en puntos porcentuales (18 = 18%). */
  tasaIgv: number;
}

/** Catálogo 09 — motivos de nota de crédito (subset usado por el sistema). */
export const MOTIVOS_NC: Record<string, string> = {
  '01': 'ANULACION DE LA OPERACION',
  '02': 'ANULACION POR ERROR EN EL RUC',
  '06': 'DEVOLUCION TOTAL',
};

export interface NotaCredito extends Omit<Comprobante, 'tipo'> {
  tipo: '07';
  /** Motivo según catálogo 09 (p. ej. '01' anulación de la operación). */
  motivoCodigo: string;
  motivoDescripcion: string;
  /** Comprobante que modifica. */
  afectadoTipo: '01' | '03';
  afectadoSerie: string;
  afectadoCorrelativo: number;
}

/** Totales calculados de un comprobante, todo en céntimos. */
export interface Totales {
  gravado: number; // base imponible operaciones gravadas
  exonerado: number;
  inafecto: number;
  igv: number;
  total: number; // importe total a pagar
}

export interface LineaCalculada {
  item: ItemComprobante;
  /** Valor de venta de la línea (sin IGV) en céntimos. */
  valorVenta: number;
  /** IGV de la línea en céntimos (0 si exonerada/inafecta). */
  igv: number;
  /** Valor unitario sin IGV en céntimos (para cac:Price). */
  valorUnitario: number;
  /** Precio unitario con impuestos en céntimos (para PricingReference). */
  precioUnitario: number;
}
