import { empaquetarZip, fromBase64, toBase64, extraerXmlDeZip } from './zip.js';
import { SunatError } from './soap.js';

/**
 * Cliente de la API REST de Guías de Remisión Electrónicas de SUNAT.
 *
 * Flujo: token OAuth2 (credenciales API generadas en SOL) -> POST del ZIP
 * (base64 + hash SHA-256) -> ticket -> GET del estado con el CDR.
 */

export interface EndpointsGre {
  auth: string; // .../v1  (api-seguridad)
  cpe: string; // .../v1  (api-cpe)
}

export const ENDPOINTS_GRE: Record<string, EndpointsGre> = {
  produccion: {
    auth: 'https://api-seguridad.sunat.gob.pe/v1',
    cpe: 'https://api-cpe.sunat.gob.pe/v1',
  },
  // Servidor de pruebas mantenido por la comunidad Greenter (imita la API
  // real; SUNAT no ofrece un beta público para la API de GRE).
  prueba: {
    auth: 'https://gre-test.nubefact.com/v1',
    cpe: 'https://gre-test.nubefact.com/v1',
  },
};

export interface CredencialesGre {
  ruc: string;
  usuario: string; // usuario secundario SOL
  clave: string;
  clientId: string; // credenciales API generadas en SOL
  clientSecret: string;
}

export async function obtenerTokenGre(
  endpoints: EndpointsGre,
  cred: CredencialesGre,
  fetchImpl = fetch,
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'password',
    scope: 'https://api-cpe.sunat.gob.pe',
    client_id: cred.clientId,
    client_secret: cred.clientSecret,
    username: `${cred.ruc}${cred.usuario}`,
    password: cred.clave,
  });
  const res = await fetchImpl(`${endpoints.auth}/clientessol/${encodeURIComponent(cred.clientId)}/oauth2/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const datos = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!res.ok || !datos.access_token) {
    throw new SunatError(`GRE-AUTH-${res.status}`, datos.error_description ?? 'No se pudo obtener el token');
  }
  return datos.access_token;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Envía la guía firmada; devuelve el número de ticket. */
export async function enviarGuia(
  endpoints: EndpointsGre,
  token: string,
  nombreBase: string,
  xmlFirmado: string,
  fetchImpl = fetch,
): Promise<string> {
  const zip = empaquetarZip(nombreBase, xmlFirmado);
  const res = await fetchImpl(`${endpoints.cpe}/contribuyente/gem/comprobantes/${encodeURIComponent(nombreBase)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      archivo: {
        nomArchivo: `${nombreBase}.zip`,
        arcGreZip: toBase64(zip),
        hashZip: await sha256Hex(zip),
      },
    }),
  });
  const datos = (await res.json().catch(() => ({}))) as { numTicket?: string; msg?: string; cod?: string; errors?: unknown };
  if (!res.ok || !datos.numTicket) {
    throw new SunatError(`GRE-${datos.cod ?? res.status}`, datos.msg ?? JSON.stringify(datos).slice(0, 300));
  }
  return datos.numTicket;
}

export interface EstadoGuia {
  /** '0' aceptada, '98' en proceso, '99' rechazada. */
  codigo: string;
  cdrXml?: string;
  cdrZipBase64?: string;
  /** Mensaje de error si fue rechazada. */
  error?: string;
}

export async function consultarGuia(
  endpoints: EndpointsGre,
  token: string,
  ticket: string,
  fetchImpl = fetch,
): Promise<EstadoGuia> {
  const res = await fetchImpl(`${endpoints.cpe}/contribuyente/gem/comprobantes/envios/${encodeURIComponent(ticket)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const datos = (await res.json().catch(() => ({}))) as {
    codRespuesta?: string;
    arcCdr?: string;
    indCdrGenerado?: string;
    error?: { numError?: string; desError?: string };
  };
  if (!res.ok) {
    throw new SunatError(`GRE-STATUS-${res.status}`, JSON.stringify(datos).slice(0, 300));
  }
  const codigo = datos.codRespuesta ?? '';
  const out: EstadoGuia = { codigo };
  if (datos.arcCdr && datos.indCdrGenerado === '1') {
    out.cdrZipBase64 = datos.arcCdr.replace(/\s+/g, '');
    out.cdrXml = extraerXmlDeZip(fromBase64(datos.arcCdr)).xml;
  }
  if (datos.error?.desError) out.error = `${datos.error.numError ?? ''} ${datos.error.desError}`.trim();
  return out;
}
