import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { generarInvoiceXml } from '../src/sunat/ubl.js';
import { boletaExonerada, facturaGravada } from './fixtures/comprobantes.js';

function texto(xml: string, localName: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const out: string[] = [];
  const els = doc.getElementsByTagName('*');
  for (let i = 0; i < els.length; i++) {
    const el = els.item(i);
    if (el && el.localName === localName && el.textContent) out.push(el.textContent);
  }
  return out;
}

describe('generación XML UBL 2.1', () => {
  it('factura gravada: estructura y montos correctos', () => {
    const g = generarInvoiceXml(facturaGravada());
    expect(g.nombre).toBe('20000000001-01-F001-1');
    // Bien formado (xmldom lanza si hay error fatal)
    const doc = new DOMParser().parseFromString(g.xml, 'text/xml');
    expect(doc.documentElement!.localName).toBe('Invoice');
    expect(texto(g.xml, 'UBLVersionID')[0]).toBe('2.1');
    expect(texto(g.xml, 'CustomizationID')[0]).toBe('2.0');
    expect(texto(g.xml, 'ID')[0]).toBe('F001-1');
    expect(g.xml).toContain('listID="0101"');
    expect(g.xml).toContain('>01</cbc:InvoiceTypeCode>');
    expect(texto(g.xml, 'PayableAmount')[0]).toBe('590.00');
    expect(texto(g.xml, 'Note')[0]).toContain('QUINIENTOS NOVENTA');
    // Tributo IGV (catálogo 05: 1000)
    expect(g.xml).toContain('>1000</cbc:ID>');
    expect(g.xml).toContain('<cbc:TaxExemptionReasonCode');
    // Extension vacía lista para la firma
    expect(g.xml).toContain('<ext:ExtensionContent></ext:ExtensionContent>');
  });

  it('boleta exonerada: usa tributo 9997/EXO y IGV cero', () => {
    const g = generarInvoiceXml(boletaExonerada());
    expect(g.nombre).toBe('20000000001-03-B001-1');
    expect(g.xml).toContain('>03</cbc:InvoiceTypeCode>');
    expect(g.xml).toContain('>9997</cbc:ID>');
    expect(g.xml).toContain('>EXO</cbc:Name>');
    // TaxTotal global en 0
    expect(texto(g.xml, 'TaxAmount')[0]).toBe('0.00');
    expect(texto(g.xml, 'PayableAmount')[0]).toBe('65.00');
    // Dos líneas
    expect((g.xml.match(/<cac:InvoiceLine>/g) ?? []).length).toBe(2);
  });

  it('rechaza factura sin RUC de cliente', () => {
    const cpe = facturaGravada();
    cpe.cliente = { tipoDoc: '1', numDoc: '44556677', nombre: 'PERSONA NATURAL' };
    expect(() => generarInvoiceXml(cpe)).toThrow(/RUC/);
  });

  it('escapa caracteres especiales en descripciones', () => {
    const cpe = boletaExonerada();
    cpe.items[0]!.descripcion = 'Pasaje <ida & vuelta> "km 86"';
    const g = generarInvoiceXml(cpe);
    const doc = new DOMParser().parseFromString(g.xml, 'text/xml');
    expect(doc.documentElement!.localName).toBe('Invoice');
    expect(texto(g.xml, 'Description')[0]).toBe('Pasaje <ida & vuelta> "km 86"');
  });
});
