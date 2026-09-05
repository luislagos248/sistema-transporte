import { SignedXml } from 'xml-crypto';

/**
 * Firma digital XML-DSig del comprobante, según lo exige SUNAT:
 * firma "enveloped" sobre todo el documento (Reference URI=""),
 * RSA-SHA1 + C14N inclusiva, colocada dentro de ext:ExtensionContent.
 *
 * Nota: SUNAT sigue validando RSA-SHA1 para CPE; el certificado usado es el
 * Certificado Digital Tributario emitido por SUNAT (o uno de prueba en beta).
 */

export interface Certificado {
  /** Clave privada en PEM (-----BEGIN PRIVATE KEY-----). */
  privateKeyPem: string;
  /** Certificado X.509 en PEM (-----BEGIN CERTIFICATE-----). */
  certPem: string;
}

const ALG = {
  c14n: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
  rsaSha1: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
  sha1: 'http://www.w3.org/2000/09/xmldsig#sha1',
  enveloped: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
};

export function firmarXml(xml: string, cert: Certificado): string {
  const sig = new SignedXml({
    privateKey: cert.privateKeyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: ALG.rsaSha1,
    canonicalizationAlgorithm: ALG.c14n,
  });
  // C14N va explícita como transformada de la Reference: xml-crypto aplica al
  // firmar exactamente las transformadas listadas (sin C14N implícita), y así
  // firma y verificación usan el mismo pipeline.
  sig.addReference({
    xpath: '/*',
    isEmptyUri: true,
    digestAlgorithm: ALG.sha1,
    transforms: [ALG.enveloped, ALG.c14n],
  });
  // xml-crypto inserta la firma ANTES de calcular el digest y su transformada
  // enveloped solo descuenta firmas hijas directas del nodo referenciado, así
  // que se firma con la firma como hija directa de la raíz (digest correcto)
  // y luego se mueve el nodo a ext:ExtensionContent, donde SUNAT la espera.
  // El contexto de namespaces en scope es el mismo en ambas posiciones (todo
  // se declara en la raíz), por lo que la firma sigue verificando.
  sig.computeSignature(xml, {
    prefix: 'ds',
    location: { reference: '/*', action: 'append' },
    attrs: { Id: 'SignatureSP' },
  });
  const firmadoEnRaiz = sig.getSignedXml();
  const m = firmadoEnRaiz.match(/<ds:Signature[\s\S]*?<\/ds:Signature>/);
  if (!m) throw new Error('No se encontró la firma generada');
  const sinFirma = firmadoEnRaiz.replace(m[0], '');
  // xmldom puede serializar el elemento vacío en cualquiera de sus dos formas.
  const conFirma = sinFirma
    .replace('<ext:ExtensionContent></ext:ExtensionContent>', `<ext:ExtensionContent>${m[0]}</ext:ExtensionContent>`)
    .replace('<ext:ExtensionContent/>', `<ext:ExtensionContent>${m[0]}</ext:ExtensionContent>`);
  if (!conFirma.includes('<ds:Signature')) {
    throw new Error('El XML no tiene ext:ExtensionContent vacío donde colocar la firma');
  }
  return conFirma;
}

/** Verifica la firma de un XML firmado (para pruebas y auditoría). */
export function verificarFirma(signedXml: string, certPem: string): boolean {
  const sig = new SignedXml({ publicCert: certPem });
  const match = signedXml.match(/<ds:Signature[\s\S]*?<\/ds:Signature>/);
  if (!match) return false;
  sig.loadSignature(match[0]);
  return sig.checkSignature(signedXml);
}

/**
 * Extrae el valor de digest (hash) de la firma, usado para el código QR y la
 * representación impresa del comprobante.
 */
export function extraerDigest(signedXml: string): string | null {
  const m = signedXml.match(/<ds:DigestValue>([^<]+)<\/ds:DigestValue>/);
  return m?.[1] ?? null;
}
