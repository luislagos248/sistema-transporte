import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generarGuiaTransportistaXml } from '../src/sunat/gre.js';
import { firmarXml } from '../src/sunat/sign.js';
import { consultarGuia, ENDPOINTS_GRE, enviarGuia, obtenerTokenGre } from '../src/sunat/greApi.js';
import { guiaPrueba } from './gre.test.js';

/**
 * Integración contra el servidor de pruebas de la API GRE (gre-test.nubefact.com,
 * mantenido por la comunidad Greenter: imita la API real de SUNAT, que no tiene
 * ambiente beta público para guías). Credenciales públicas de prueba.
 *
 *   GRE_TEST=1 npx vitest run test/gre-api.integration.test.ts
 */

const CRED = {
  ruc: '20161515648',
  usuario: 'MODDATOS',
  clave: 'MODDATOS',
  clientId: 'test-85e5b0ae-255c-4891-a595-0b98c65c9854',
  clientSecret: 'test-Hty/M6QshYvPgItX2P0+Kw==',
};

describe.runIf(process.env.GRE_TEST === '1')('API GRE (servidor de pruebas)', () => {
  it('token + envío + consulta de la guía', { timeout: 120_000 }, async () => {
    const endpoints = ENDPOINTS_GRE.prueba!;
    const token = await obtenerTokenGre(endpoints, CRED);
    expect(token).toBeTruthy();

    const dir = join(process.cwd(), 'test', 'fixtures', 'generated');
    const cert = {
      privateKeyPem: readFileSync(join(dir, 'key.pem'), 'utf8'),
      certPem: readFileSync(join(dir, 'cert.pem'), 'utf8'),
    };
    const g0 = guiaPrueba();
    g0.emisor = { ...g0.emisor, ruc: CRED.ruc, razonSocial: 'GREENTER S.A.C. (PRUEBAS)' };
    g0.correlativo = Math.floor(Date.now() / 1000) % 90000000;
    const g = generarGuiaTransportistaXml(g0);
    const firmado = firmarXml(g.xml, cert, 'sha256');

    const ticket = await enviarGuia(endpoints, token, g.nombre, firmado);
    console.log(`Guía ${g0.serie}-${g0.correlativo}: ticket ${ticket}`);
    expect(ticket).toBeTruthy();

    let estado = '98';
    for (let i = 0; i < 10 && estado === '98'; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const st = await consultarGuia(endpoints, token, ticket);
      estado = st.codigo;
      if (st.codigo === '0') {
        console.log(`Guía aceptada; CDR ${st.cdrXml ? 'recibido' : 'sin adjunto'}`);
      } else if (st.codigo === '99') {
        console.log(`Guía rechazada: ${st.error}`);
      }
    }
    expect(estado).toBe('0');
  });
});
