import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { generarResumenXml, type ResumenDiario } from '../src/sunat/resumen.js';
import { textoQr } from '../src/sunat/qr.js';
import { EMPRESA_PRUEBA } from './fixtures/comprobantes.js';

export function resumenPrueba(): ResumenDiario {
  return {
    emisor: EMPRESA_PRUEBA,
    fechaReferencia: '2026-09-05',
    fechaGeneracion: '2026-09-05',
    numero: 1,
    boletas: [
      {
        tipo: '03',
        serie: 'B001',
        correlativo: 101,
        clienteTipoDoc: '1',
        clienteNumDoc: '44556677',
        moneda: 'PEN',
        gravado: 0,
        exonerado: 6500,
        inafecto: 0,
        igv: 0,
        total: 6500,
        condicion: 1,
      },
      {
        tipo: '03',
        serie: 'B001',
        correlativo: 102,
        clienteTipoDoc: '0',
        clienteNumDoc: '-',
        moneda: 'PEN',
        gravado: 1000,
        exonerado: 0,
        inafecto: 0,
        igv: 180,
        total: 1180,
        condicion: 1,
      },
    ],
  };
}

describe('resumen diario (SummaryDocuments)', () => {
  it('genera RC bien formado con las líneas y montos', () => {
    const g = generarResumenXml(resumenPrueba());
    expect(g.id).toBe('RC-20260905-1');
    expect(g.nombre).toBe('20000000001-RC-20260905-1');
    const doc = new DOMParser().parseFromString(g.xml, 'text/xml');
    expect(doc.documentElement!.localName).toBe('SummaryDocuments');
    expect(g.xml).toContain('<cbc:UBLVersionID>2.0</cbc:UBLVersionID>');
    expect(g.xml).toContain('<cbc:CustomizationID>1.1</cbc:CustomizationID>');
    expect((g.xml.match(/<sac:SummaryDocumentsLine>/g) ?? []).length).toBe(2);
    // Boleta exonerada: pago con instrucción 02
    expect(g.xml).toContain('<cbc:PaidAmount currencyID="PEN">65.00</cbc:PaidAmount><cbc:InstructionID>02</cbc:InstructionID>');
    // Boleta gravada: instrucción 01 e IGV
    expect(g.xml).toContain('<cbc:PaidAmount currencyID="PEN">10.00</cbc:PaidAmount><cbc:InstructionID>01</cbc:InstructionID>');
    expect(g.xml).toContain('<sac:TotalAmount currencyID="PEN">11.80</sac:TotalAmount>');
    // Cliente varios: cuenta 0 / tipo doc 1
    expect(g.xml).toContain('<cbc:CustomerAssignedAccountID>0</cbc:CustomerAssignedAccountID>');
    // Extension lista para la firma
    expect(g.xml).toContain('<ext:ExtensionContent></ext:ExtensionContent>');
  });

  it('rechaza un resumen sin boletas', () => {
    const r = resumenPrueba();
    r.boletas = [];
    expect(() => generarResumenXml(r)).toThrow(/sin boletas|no tiene boletas/);
  });
});

describe('texto del QR reglamentario', () => {
  it('arma los campos separados por barras', () => {
    const qr = textoQr({
      rucEmisor: '20000000001',
      tipo: '03',
      serie: 'B001',
      correlativo: 101,
      igvCentimos: 0,
      totalCentimos: 6500,
      fechaEmision: '2026-09-05',
      clienteTipoDoc: '1',
      clienteNumDoc: '44556677',
    });
    expect(qr).toBe('20000000001|03|B001|101|0.00|65.00|2026-09-05|1|44556677|');
  });
});
