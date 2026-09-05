import { strToU8, strFromU8, zipSync, unzipSync } from 'fflate';

/** Empaqueta el XML en un ZIP con el nombre que exige SUNAT. */
export function empaquetarZip(nombreBase: string, xml: string): Uint8Array {
  return zipSync({ [`${nombreBase}.xml`]: strToU8(xml) }, { level: 6 });
}

/** Extrae el primer .xml de un ZIP (el CDR que devuelve SUNAT). */
export function extraerXmlDeZip(zip: Uint8Array): { nombre: string; xml: string } {
  const files = unzipSync(zip);
  for (const [nombre, data] of Object.entries(files)) {
    if (nombre.toLowerCase().endsWith('.xml')) {
      return { nombre, xml: strFromU8(data) };
    }
  }
  throw new Error('El ZIP no contiene ningún XML');
}

export function toBase64(data: Uint8Array): string {
  // Compatible con Workers y Node sin depender de Buffer.
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    bin += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
