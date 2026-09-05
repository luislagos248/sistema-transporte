import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { ENDPOINTS, getStatus, parsearCdr, sendBill, SunatError } from '../src/sunat/soap.js';
import { empaquetarZip, extraerXmlDeZip, fromBase64, toBase64 } from '../src/sunat/zip.js';

const CRED = { ruc: '20000000001', usuario: 'MODDATOS', clave: 'moddatos' };

function cdrXml(codigo: string, descripcion: string): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<ar:ApplicationResponse xmlns:ar="urn:oasis:names:specification:ubl:schema:xsd:ApplicationResponse-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">` +
    `<cbc:ID>1</cbc:ID>` +
    `<cac:DocumentResponse><cac:Response>` +
    `<cbc:ResponseCode>${codigo}</cbc:ResponseCode>` +
    `<cbc:Description>${descripcion}</cbc:Description>` +
    `</cac:Response></cac:DocumentResponse>` +
    `</ar:ApplicationResponse>`
  );
}

function soapSendBillOk(cdr: string): string {
  const zip = zipSync({ 'R-20000000001-01-F001-1.xml': strToU8(cdr) });
  return (
    `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap-env:Body><br:sendBillResponse xmlns:br="http://service.sunat.gob.pe">` +
    `<applicationResponse>${toBase64(zip)}</applicationResponse>` +
    `</br:sendBillResponse></soap-env:Body></soap-env:Envelope>`
  );
}

function fakeFetch(respuesta: string, status = 200) {
  return (async () => new Response(respuesta, { status })) as unknown as typeof fetch;
}

describe('zip', () => {
  it('empaqueta y extrae ida y vuelta', () => {
    const zip = empaquetarZip('20000000001-01-F001-1', '<Invoice/>');
    const { nombre, xml } = extraerXmlDeZip(zip);
    expect(nombre).toBe('20000000001-01-F001-1.xml');
    expect(xml).toBe('<Invoice/>');
  });

  it('base64 ida y vuelta con datos binarios', () => {
    const data = new Uint8Array([0, 1, 2, 250, 255, 128]);
    expect(Array.from(fromBase64(toBase64(data)))).toEqual(Array.from(data));
  });
});

describe('cliente SOAP SUNAT', () => {
  it('sendBill: interpreta un CDR de aceptación', async () => {
    const cdr = cdrXml('0', 'La Factura numero F001-1, ha sido aceptada');
    const res = await sendBill(ENDPOINTS.beta, CRED, '20000000001-01-F001-1', '<Invoice/>', fakeFetch(soapSendBillOk(cdr)));
    expect(res.aceptado).toBe(true);
    expect(res.codigo).toBe('0');
    expect(res.descripcion).toContain('aceptada');
    expect(res.cdrXml).toContain('ApplicationResponse');
  });

  it('sendBill: un CDR de rechazo no es aceptado', async () => {
    const cdr = cdrXml('2335', 'El documento electrónico ingresado ha sido alterado');
    const res = await sendBill(ENDPOINTS.beta, CRED, '20000000001-01-F001-1', '<Invoice/>', fakeFetch(soapSendBillOk(cdr)));
    expect(res.aceptado).toBe(false);
    expect(res.codigo).toBe('2335');
  });

  it('sendBill: un soap Fault se convierte en SunatError', async () => {
    const fault =
      `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body>` +
      `<soap-env:Fault><faultcode>soap-env:Client.0102</faultcode><faultstring>El usuario o contraseña son incorrectos</faultstring></soap-env:Fault>` +
      `</soap-env:Body></soap-env:Envelope>`;
    await expect(
      sendBill(ENDPOINTS.beta, CRED, '20000000001-01-F001-1', '<Invoice/>', fakeFetch(fault, 500)),
    ).rejects.toThrowError(SunatError);
  });

  it('getStatus: ticket en proceso (98) no trae CDR', async () => {
    const resp =
      `<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/"><soap-env:Body>` +
      `<br:getStatusResponse xmlns:br="http://service.sunat.gob.pe"><status><statusCode>98</statusCode></status></br:getStatusResponse>` +
      `</soap-env:Body></soap-env:Envelope>`;
    const st = await getStatus(ENDPOINTS.beta, CRED, '12345', fakeFetch(resp));
    expect(st.codigo).toBe('98');
    expect(st.cdr).toBeUndefined();
  });

  it('parsearCdr recoge observaciones (notas)', () => {
    const conNota = cdrXml('0', 'aceptada').replace(
      '</cac:Response>',
      '</cac:Response>',
    ).replace('<cac:DocumentResponse>', '<cbc:Note>4287 - Alguna observacion</cbc:Note><cac:DocumentResponse>');
    const res = parsearCdr(conNota, '');
    expect(res.aceptado).toBe(true);
    expect(res.notas[0]).toContain('4287');
  });
});
