import { DOMParser } from '@xmldom/xmldom';
import { empaquetarZip, extraerXmlDeZip, fromBase64, toBase64 } from './zip.js';

/**
 * Cliente del servicio web de SUNAT (billService, SOAP 1.1) para el
 * SEE-Del Contribuyente: sendBill (facturas y notas), sendSummary
 * (resumen diario de boletas / bajas) y getStatus (ticket del resumen).
 */

export const ENDPOINTS = {
  beta: 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService',
  produccion: 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService',
} as const;

export interface CredencialesSol {
  ruc: string;
  usuario: string; // usuario secundario SOL (en beta: MODDATOS)
  clave: string;
}

export interface RespuestaCdr {
  /** true si SUNAT aceptó el comprobante (ResponseCode 0). */
  aceptado: boolean;
  codigo: string;
  descripcion: string;
  /** Observaciones (notas) que SUNAT haya devuelto aunque acepte. */
  notas: string[];
  /** XML completo del CDR, para archivarlo 5 años. */
  cdrXml: string;
  /** ZIP original del CDR en base64 (tal como lo devolvió SUNAT). */
  cdrZipBase64: string;
}

export class SunatError extends Error {
  constructor(
    public codigo: string,
    mensaje: string,
  ) {
    super(`SUNAT ${codigo}: ${mensaje}`);
    this.name = 'SunatError';
  }
}

function envelope(cred: CredencialesSol, body: string): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">` +
    `<soapenv:Header>` +
    `<wsse:Security>` +
    `<wsse:UsernameToken>` +
    `<wsse:Username>${cred.ruc}${cred.usuario}</wsse:Username>` +
    `<wsse:Password>${escXml(cred.clave)}</wsse:Password>` +
    `</wsse:UsernameToken>` +
    `</wsse:Security>` +
    `</soapenv:Header>` +
    `<soapenv:Body>${body}</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function llamarSoap(endpoint: string, soapXml: string, fetchImpl = fetch): Promise<string> {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
    body: soapXml,
  });
  const texto = await res.text();
  if (!res.ok && !texto.includes('Envelope')) {
    throw new SunatError(`HTTP-${res.status}`, texto.slice(0, 500));
  }
  return texto;
}

function textoDe(doc: ReturnType<DOMParser['parseFromString']>, localName: string): string | null {
  const els = doc.getElementsByTagName('*');
  for (let i = 0; i < els.length; i++) {
    const el = els.item(i);
    if (el && (el.localName === localName || el.nodeName.endsWith(`:${localName}`))) {
      return el.textContent;
    }
  }
  return null;
}

function chequearFault(respuesta: string): void {
  if (respuesta.includes('faultcode') || respuesta.includes('Fault>')) {
    const doc = new DOMParser().parseFromString(respuesta, 'text/xml');
    const code = textoDe(doc, 'faultcode') ?? 'desconocido';
    const msg = textoDe(doc, 'faultstring') ?? respuesta.slice(0, 300);
    throw new SunatError(code.replace(/^.*:/, ''), msg);
  }
}

/** Interpreta el CDR (ApplicationResponse) que SUNAT devuelve dentro del ZIP. */
export function parsearCdr(cdrXml: string, cdrZipBase64: string): RespuestaCdr {
  const doc = new DOMParser().parseFromString(cdrXml, 'text/xml');
  const codigo = textoDe(doc, 'ResponseCode') ?? '';
  const descripcion = textoDe(doc, 'Description') ?? '';
  const notas: string[] = [];
  const els = doc.getElementsByTagName('*');
  for (let i = 0; i < els.length; i++) {
    const el = els.item(i);
    if (el && el.localName === 'Note' && el.textContent) notas.push(el.textContent);
  }
  return {
    aceptado: codigo === '0',
    codigo,
    descripcion,
    notas,
    cdrXml,
    cdrZipBase64,
  };
}

/**
 * Envía una factura, nota de crédito o nota de débito (envío individual).
 * `nombreBase` = RUC-TIPO-SERIE-CORRELATIVO (sin extensión).
 */
export async function sendBill(
  endpoint: string,
  cred: CredencialesSol,
  nombreBase: string,
  xmlFirmado: string,
  fetchImpl = fetch,
): Promise<RespuestaCdr> {
  const zip = empaquetarZip(nombreBase, xmlFirmado);
  const body =
    `<ser:sendBill>` +
    `<fileName>${nombreBase}.zip</fileName>` +
    `<contentFile>${toBase64(zip)}</contentFile>` +
    `</ser:sendBill>`;
  const respuesta = await llamarSoap(endpoint, envelope(cred, body), fetchImpl);
  chequearFault(respuesta);
  const doc = new DOMParser().parseFromString(respuesta, 'text/xml');
  const appRes = textoDe(doc, 'applicationResponse');
  if (!appRes) throw new SunatError('SIN-CDR', `Respuesta sin applicationResponse: ${respuesta.slice(0, 300)}`);
  const { xml } = extraerXmlDeZip(fromBase64(appRes));
  return parsearCdr(xml, appRes.replace(/\s+/g, ''));
}

/** Envía un resumen diario o comunicación de baja; devuelve el número de ticket. */
export async function sendSummary(
  endpoint: string,
  cred: CredencialesSol,
  nombreBase: string,
  xmlFirmado: string,
  fetchImpl = fetch,
): Promise<string> {
  const zip = empaquetarZip(nombreBase, xmlFirmado);
  const body =
    `<ser:sendSummary>` +
    `<fileName>${nombreBase}.zip</fileName>` +
    `<contentFile>${toBase64(zip)}</contentFile>` +
    `</ser:sendSummary>`;
  const respuesta = await llamarSoap(endpoint, envelope(cred, body), fetchImpl);
  chequearFault(respuesta);
  const doc = new DOMParser().parseFromString(respuesta, 'text/xml');
  const ticket = textoDe(doc, 'ticket');
  if (!ticket) throw new SunatError('SIN-TICKET', `Respuesta sin ticket: ${respuesta.slice(0, 300)}`);
  return ticket;
}

export interface EstadoTicket {
  /** 0 = procesó bien (CDR adjunto), 98 = en proceso, 99 = procesó con errores. */
  codigo: string;
  cdr?: RespuestaCdr;
}

/** Consulta el estado de un ticket de sendSummary. */
export async function getStatus(
  endpoint: string,
  cred: CredencialesSol,
  ticket: string,
  fetchImpl = fetch,
): Promise<EstadoTicket> {
  const body = `<ser:getStatus><ticket>${escXml(ticket)}</ticket></ser:getStatus>`;
  const respuesta = await llamarSoap(endpoint, envelope(cred, body), fetchImpl);
  chequearFault(respuesta);
  const doc = new DOMParser().parseFromString(respuesta, 'text/xml');
  const codigo = textoDe(doc, 'statusCode') ?? '';
  const contenido = textoDe(doc, 'content');
  if (contenido && codigo === '0') {
    const { xml } = extraerXmlDeZip(fromBase64(contenido));
    return { codigo, cdr: parsearCdr(xml, contenido.replace(/\s+/g, '')) };
  }
  return { codigo };
}
