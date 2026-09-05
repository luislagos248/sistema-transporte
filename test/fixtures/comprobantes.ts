import type { Comprobante, Empresa } from '../../src/sunat/types.js';

/** RUC y credenciales del ambiente BETA de SUNAT (públicos, solo pruebas). */
export const EMPRESA_PRUEBA: Empresa = {
  ruc: '20000000001',
  razonSocial: 'EMPRESA DE PRUEBA S.A.C.',
  nombreComercial: 'Turismo Irazola (pruebas)',
  ubigeo: '250101',
  departamento: 'UCAYALI',
  provincia: 'CORONEL PORTILLO',
  distrito: 'CALLERIA',
  direccion: 'JR. DE PRUEBA NRO. 123',
};

export function facturaGravada(): Comprobante {
  return {
    tipo: '01',
    serie: 'F001',
    correlativo: 1,
    fechaEmision: '2026-09-05',
    horaEmision: '10:30:00',
    moneda: 'PEN',
    emisor: EMPRESA_PRUEBA,
    cliente: { tipoDoc: '6', numDoc: '20000000002', nombre: 'CLIENTE EMPRESA S.A.C.' },
    items: [
      {
        descripcion: 'Servicio de transporte contratado Pucallpa - Huanuco',
        cantidad: 1,
        unidad: 'ZZ',
        precioUnitarioConImpuesto: 59000, // S/ 590.00 con IGV
        afectacion: '10',
      },
    ],
    tasaIgv: 18,
  };
}

export function boletaExonerada(): Comprobante {
  return {
    tipo: '03',
    serie: 'B001',
    correlativo: 1,
    fechaEmision: '2026-09-05',
    horaEmision: '11:00:00',
    moneda: 'PEN',
    emisor: EMPRESA_PRUEBA,
    cliente: { tipoDoc: '1', numDoc: '44556677', nombre: 'JUAN PEREZ QUISPE' },
    items: [
      {
        descripcion: 'Pasaje Pucallpa - San Alejandro km 86',
        cantidad: 2,
        unidad: 'ZZ',
        precioUnitarioConImpuesto: 2500, // S/ 25.00 exonerado (Amazonía)
        afectacion: '20',
      },
      {
        descripcion: 'Encomienda: caja mediana',
        cantidad: 1,
        unidad: 'ZZ',
        precioUnitarioConImpuesto: 1500,
        afectacion: '20',
      },
    ],
    tasaIgv: 18,
  };
}
