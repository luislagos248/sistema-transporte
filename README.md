# Tourismo Irasola — Sistema de Facturación

Sistema de facturación electrónica **SEE-Del Contribuyente (SUNAT)** para los
dos rubros de la empresa (transporte y hospedaje), pensado para emitir desde
el celular en pocos pasos y con costo cero de infraestructura
(Cloudflare Workers + D1 + R2, plan gratuito).

Ver el plan completo del proyecto en [PLAN.md](PLAN.md).

## Estado — Fase 1 completada ✔

Núcleo de emisión validado contra el **ambiente beta real de SUNAT**:

- Generación de XML **UBL 2.1** (factura `01` y boleta `03`), con operaciones
  gravadas, exoneradas (Amazonía) e inafectas.
- **Firma digital** XML-DSig (enveloped, RSA-SHA1, C14N) en `ext:ExtensionContent`.
- Empaquetado ZIP + cliente **SOAP** `billService` (sendBill / sendSummary /
  getStatus) y parseo del **CDR**.
- Esquema **D1** (series, comprobantes, ítems) y API mínima del Worker con
  emisión no bloqueante (firma al instante, envío a SUNAT en segundo plano
  con reintentos por cron).

Comprobantes de prueba **aceptados por SUNAT beta** (CDR código 0):
factura gravada y boleta exonerada.

## Estructura

```
src/sunat/       Núcleo SUNAT (independiente del hosting)
  types.ts       Tipos de dominio (montos en céntimos)
  calculo.ts     Desagregación de IGV y totales
  montoEnLetras.ts  Leyenda "SON ... CON xx/100 SOLES"
  ubl.ts         Generador XML UBL 2.1
  sign.ts        Firma XML-DSig
  zip.ts         ZIP + base64
  soap.ts        Cliente billService + CDR
src/worker.ts    API (Hono) + cron de reintentos
migrations/      Esquema D1
test/            Unitarias + integración beta
```

## Desarrollo

```bash
npm install
npm test                 # unitarias (generan cert de prueba con openssl)
npm run typecheck
SUNAT_BETA=1 npx vitest run test/sunat-beta.integration.test.ts  # contra SUNAT beta real
```

## Despliegue (resumen)

1. `npx wrangler d1 create irasola-facturacion` y `npx wrangler r2 bucket create irasola-archivo`
   (copiar el `database_id` a `wrangler.toml`).
2. `npx wrangler d1 migrations apply irasola-facturacion --remote`
3. Secrets: `npx wrangler secret put CERT_PEM | CERT_KEY | SOL_USUARIO | SOL_CLAVE`
4. `npx wrangler deploy`

> **Nunca** subir al repositorio la Clave SOL ni el certificado digital.
> En producción se usa el Certificado Digital Tributario gratuito de SUNAT y
> las series reales dadas de alta en SOL.
