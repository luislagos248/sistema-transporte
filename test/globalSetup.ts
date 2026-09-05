import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Genera un certificado autofirmado SOLO PARA PRUEBAS (el ambiente beta de
 * SUNAT acepta certificados de prueba). Nunca se versiona ni se usa en
 * producción: en producción va el Certificado Digital Tributario de SUNAT.
 */
export default function setup() {
  const dir = join(process.cwd(), 'test', 'fixtures', 'generated');
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  if (existsSync(key) && existsSync(cert)) return;
  mkdirSync(dir, { recursive: true });
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-keyout', key, '-out', cert,
    '-days', '365', '-nodes',
    '-subj', '/CN=CERTIFICADO DE PRUEBA - NO USAR EN PRODUCCION/O=TEST/C=PE',
  ]);
}
