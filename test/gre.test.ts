import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { generarGuiaTransportistaXml, type GuiaTransportista } from '../src/sunat/gre.js';
import { firmarXml, verificarFirma } from '../src/sunat/sign.js';
import { EMPRESA_PRUEBA } from './fixtures/comprobantes.js';

export function guiaPrueba(): GuiaTransportista {
  return {
    serie: 'V001',
    correlativo: 1,
    fechaEmision: '2026-09-05',
    horaEmision: '08:00:00',
    emisor: EMPRESA_PRUEBA,
    registroMtc: '1234567890',
    remitente: { tipoDoc: '6', numDoc: '20602712592', nombre: 'CARGO ENVIOS S.A.C.' },
    destinatario: { tipoDoc: '1', numDoc: '40950090', nombre: 'BERTA ATENCIA LLANOS' },
    fechaInicioTraslado: '2026-09-05',
    pesoTotalKg: 12.5,
    vehiculo: { placa: 'ABC123', tarjetaCirculacion: '123456789' },
    conductor: { tipoDoc: '1', numDoc: '45288569', nombres: 'JHON LARRY', apellidos: 'VELEZMORO SOZA', licencia: 'Q45288569' },
    partida: { ubigeo: '250101', direccion: 'JR. DE PRUEBA NRO. 123 - PUCALLPA' },
    llegada: { ubigeo: '250102', direccion: 'KM 86 CARRETERA FEDERICO BASADRE - SAN ALEJANDRO' },
    bienes: [{ descripcion: 'Caja mediana con repuestos', cantidad: 2, unidad: 'NIU' }],
    docsRelacionados: [{ tipo: '03', descripcion: 'Boleta', numero: 'B001-45', rucEmisor: EMPRESA_PRUEBA.ruc }],
  };
}

describe('GRE Transportista (tipo 31)', () => {
  it('genera DespatchAdvice según el estándar oficial', () => {
    const g = generarGuiaTransportistaXml(guiaPrueba());
    expect(g.nombre).toBe('20000000001-31-V001-1');
    const doc = new DOMParser().parseFromString(g.xml, 'text/xml');
    expect(doc.documentElement!.localName).toBe('DespatchAdvice');
    expect(g.xml).toContain('>31</cbc:DespatchAdviceTypeCode>');
    // Transportista (emisor) en DespatchSupplierParty
    expect(g.xml).toMatch(/<cac:DespatchSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="6"[^>]*>20000000001</);
    // Remitente dentro de Delivery/Despatch/DespatchParty (sin cac:Party)
    expect(g.xml).toMatch(/<cac:Despatch>.*<cac:DespatchParty><cac:PartyIdentification>.*20602712592.*<\/cac:DespatchParty><\/cac:Despatch>/);
    // Envío
    expect(g.xml).toContain('<cbc:ID>SUNAT_Envio</cbc:ID>');
    expect(g.xml).toContain('<cbc:GrossWeightMeasure unitCode="KGM">12.500</cbc:GrossWeightMeasure>');
    expect(g.xml).toContain('<cbc:StartDate>2026-09-05</cbc:StartDate>');
    // Registro MTC, conductor y vehículo
    expect(g.xml).toContain('<cac:CarrierParty><cac:PartyLegalEntity><cbc:CompanyID>1234567890</cbc:CompanyID>');
    expect(g.xml).toContain('<cbc:JobTitle>Principal</cbc:JobTitle>');
    expect(g.xml).toContain('<cac:IdentityDocumentReference><cbc:ID>Q45288569</cbc:ID></cac:IdentityDocumentReference>');
    expect(g.xml).toContain('<cac:TransportEquipment><cbc:ID>ABC123</cbc:ID>');
    // Documento relacionado (catálogo 61)
    expect(g.xml).toContain('catalogo61">03</cbc:DocumentTypeCode>');
    // Línea de bienes
    expect(g.xml).toContain('<cbc:DeliveredQuantity unitCode="NIU"');
    expect(g.xml).toContain('>2.00</cbc:DeliveredQuantity>');
  });

  it('se firma con RSA-SHA256 y la firma verifica', () => {
    const dir = join(process.cwd(), 'test', 'fixtures', 'generated');
    const cert = {
      privateKeyPem: readFileSync(join(dir, 'key.pem'), 'utf8'),
      certPem: readFileSync(join(dir, 'cert.pem'), 'utf8'),
    };
    const g = generarGuiaTransportistaXml(guiaPrueba());
    const firmado = firmarXml(g.xml, cert, 'sha256');
    expect(firmado).toContain('rsa-sha256');
    expect(firmado).toContain('xmlenc#sha256');
    expect(firmado).toMatch(/<ext:ExtensionContent><ds:Signature/);
    expect(verificarFirma(firmado, cert.certPem)).toBe(true);
  });

  it('valida serie, peso y ubigeos', () => {
    const mal = guiaPrueba();
    mal.serie = 'T001';
    expect(() => generarGuiaTransportistaXml(mal)).toThrow(/Serie/);
    const mal2 = guiaPrueba();
    mal2.pesoTotalKg = 0;
    expect(() => generarGuiaTransportistaXml(mal2)).toThrow(/peso/);
    const mal3 = guiaPrueba();
    mal3.llegada.ubigeo = '12';
    expect(() => generarGuiaTransportistaXml(mal3)).toThrow(/ubigeo/i);
  });
});
