import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generarInvoiceXml } from '../src/sunat/ubl.js';
import { firmarXml } from '../src/sunat/sign.js';
import { ENDPOINTS, sendBill } from '../src/sunat/soap.js';
import { boletaExonerada, facturaGravada } from './fixtures/comprobantes.js';

/**
 * Prueba de integración contra el AMBIENTE BETA de SUNAT (credenciales
 * públicas de prueba). Se ejecuta solo con SUNAT_BETA=1 porque depende de
 * la disponibilidad del servicio de SUNAT.
 *
 *   SUNAT_BETA=1 npx vitest run test/sunat-beta.integration.test.ts
 */

const CRED = { ruc: '20000000001', usuario: 'MODDATOS', clave: 'moddatos' };

const dir = join(process.cwd(), 'test', 'fixtures', 'generated');
const cert = {
  privateKeyPem: readFileSync(join(dir, 'key.pem'), 'utf8'),
  certPem: readFileSync(join(dir, 'cert.pem'), 'utf8'),
};

function correlativoUnico(): number {
  // Correlativo distinto por corrida para no chocar con envíos previos.
  return Math.floor(Date.now() / 1000) % 90000000;
}

describe.runIf(process.env.SUNAT_BETA === '1')('SUNAT beta (integración real)', () => {
  it('factura gravada aceptada por SUNAT', { timeout: 90_000 }, async () => {
    const cpe = facturaGravada();
    cpe.correlativo = correlativoUnico();
    const g = generarInvoiceXml(cpe);
    const firmado = firmarXml(g.xml, cert);
    const res = await sendBill(ENDPOINTS.beta, CRED, g.nombre, firmado);
    console.log(`Factura ${cpe.serie}-${cpe.correlativo}: [${res.codigo}] ${res.descripcion}`, res.notas);
    expect(res.aceptado).toBe(true);
  });

  it('boleta exonerada aceptada por SUNAT', { timeout: 90_000 }, async () => {
    const cpe = boletaExonerada();
    cpe.correlativo = correlativoUnico() + 1;
    const g = generarInvoiceXml(cpe);
    const firmado = firmarXml(g.xml, cert);
    const res = await sendBill(ENDPOINTS.beta, CRED, g.nombre, firmado);
    console.log(`Boleta ${cpe.serie}-${cpe.correlativo}: [${res.codigo}] ${res.descripcion}`, res.notas);
    expect(res.aceptado).toBe(true);
  });
});
