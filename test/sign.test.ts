import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generarInvoiceXml } from '../src/sunat/ubl.js';
import { extraerDigest, firmarXml, verificarFirma } from '../src/sunat/sign.js';
import { facturaGravada } from './fixtures/comprobantes.js';

const dir = join(process.cwd(), 'test', 'fixtures', 'generated');
const cert = {
  privateKeyPem: readFileSync(join(dir, 'key.pem'), 'utf8'),
  certPem: readFileSync(join(dir, 'cert.pem'), 'utf8'),
};

describe('firma digital XML-DSig', () => {
  it('firma según lo que exige SUNAT y la firma verifica', () => {
    const { xml } = generarInvoiceXml(facturaGravada());
    const firmado = firmarXml(xml, cert);
    // La firma queda dentro de ext:ExtensionContent
    expect(firmado).toMatch(/<ext:ExtensionContent><ds:Signature/);
    // Enveloped, RSA-SHA1, C14N inclusiva, Reference a todo el documento
    expect(firmado).toContain('http://www.w3.org/2000/09/xmldsig#enveloped-signature');
    expect(firmado).toContain('http://www.w3.org/2000/09/xmldsig#rsa-sha1');
    expect(firmado).toContain('http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    expect(firmado).toContain('<ds:Reference URI="">');
    // Certificado embebido para que SUNAT lo valide
    expect(firmado).toContain('<ds:X509Certificate>');
    expect(verificarFirma(firmado, cert.certPem)).toBe(true);
    expect(extraerDigest(firmado)).toBeTruthy();
  });

  it('detecta un XML adulterado', () => {
    const { xml } = generarInvoiceXml(facturaGravada());
    const firmado = firmarXml(xml, cert);
    const adulterado = firmado.replace('590.00', '111.00');
    expect(verificarFirma(adulterado, cert.certPem)).toBe(false);
  });
});
