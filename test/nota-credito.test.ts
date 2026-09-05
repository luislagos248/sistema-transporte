import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { generarNotaCreditoXml } from '../src/sunat/ubl.js';
import type { NotaCredito } from '../src/sunat/types.js';
import { EMPRESA_PRUEBA, facturaGravada } from './fixtures/comprobantes.js';

export function notaCreditoDeFactura(): NotaCredito {
  const f = facturaGravada();
  return {
    tipo: '07',
    serie: 'FC01',
    correlativo: 1,
    fechaEmision: f.fechaEmision,
    horaEmision: f.horaEmision,
    moneda: 'PEN',
    emisor: EMPRESA_PRUEBA,
    cliente: f.cliente,
    items: f.items,
    tasaIgv: 18,
    motivoCodigo: '01',
    motivoDescripcion: 'ANULACION DE LA OPERACION',
    afectadoTipo: '01',
    afectadoSerie: 'F001',
    afectadoCorrelativo: 123,
  };
}

describe('nota de crédito UBL 2.1', () => {
  it('genera CreditNote con referencia y motivo', () => {
    const g = generarNotaCreditoXml(notaCreditoDeFactura());
    expect(g.nombre).toBe('20000000001-07-FC01-1');
    const doc = new DOMParser().parseFromString(g.xml, 'text/xml');
    expect(doc.documentElement!.localName).toBe('CreditNote');
    expect(g.xml).toContain('<cbc:ReferenceID>F001-123</cbc:ReferenceID>');
    expect(g.xml).toContain('<cbc:ResponseCode>01</cbc:ResponseCode>');
    expect(g.xml).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
    expect(g.xml).toContain('<cac:CreditNoteLine>');
    expect(g.xml).toContain('<cbc:CreditedQuantity');
    expect(g.xml).not.toContain('InvoiceLine');
    // Mismos totales que la factura original
    expect(g.xml).toContain('<cbc:PayableAmount currencyID="PEN">590.00</cbc:PayableAmount>');
    expect(g.xml).toContain('<ext:ExtensionContent></ext:ExtensionContent>');
  });

  it('rechaza serie que no corresponde al comprobante afectado', () => {
    const nc = notaCreditoDeFactura();
    nc.serie = 'BC01'; // afectado es factura (F)
    expect(() => generarNotaCreditoXml(nc)).toThrow(/misma letra/);
  });

  it('exige motivo', () => {
    const nc = notaCreditoDeFactura();
    nc.motivoDescripcion = '';
    expect(() => generarNotaCreditoXml(nc)).toThrow(/motivo/);
  });
});
