# Tourismo Irasola — Sistema de Facturación

Sistema de facturación electrónica **SEE-Del Contribuyente (SUNAT)** para los
dos rubros de la empresa (transporte y hospedaje), pensado para emitir desde
el celular en pocos pasos y con costo cero de infraestructura
(Cloudflare Workers + D1 + R2, plan gratuito).

Ver el plan completo del proyecto en [PLAN.md](PLAN.md).

## Estado — Fases 1, 2, notas de crédito y GRE-Transportista completadas ✔

**GRE-Transportista (tipo 31, serie V001):** guía de remisión electrónica para
el traslado de encomiendas/carga (obligatoria desde julio 2026). XML
DespatchAdvice UBL 2.1 según el Anexo N° 14 de la R.S. 123-2022/SUNAT
(transportista en DespatchSupplierParty, remitente en Delivery/Despatch/
DespatchParty, registro MTC, vehículo, conductor, ruta con ubigeos), firmado
con RSA-SHA256 y enviado por la **API REST de GRE** (token OAuth2 con las
Credenciales API de SOL -> envío ZIP+SHA256 -> ticket -> CDR). La app agrega
"Guía de carga" con autocompletado de flota/conductores y lista de guías con
estado. Flujo completo validado contra el servidor de pruebas de la API
(SUNAT no ofrece beta pública para GRE): guía enviada, ticket consultado por
cron y **aceptada con CDR**.

> Producción GRE: generar las Credenciales API en SOL y cargarlas como
> secrets `GRE_CLIENT_ID` / `GRE_CLIENT_SECRET`; poner `GRE_AMBIENTE =
> "produccion"` y el `GRE_REGISTRO_MTC` si corresponde.

**Notas de crédito (tipo 07):** anulación/corrección guiada desde el ticket
(motivos del catálogo 09: anulación de la operación, error en RUC, devolución
total). La NC copia los ítems del original por el total, usa series propias
(F001→FC01, B002→BC02), referencia al documento afectado
(DiscrepancyResponse + BillingReference) y sigue su canal de envío: NC de
factura por sendBill, NC de boleta dentro del Resumen Diario. El original
queda marcado "anulado" y nunca se borra. Validado contra SUNAT beta:
factura emitida y su NC ambas ACEPTADAS con CDR.

**Fase 2** agrega la aplicación usable (celular y PC) y el circuito completo de boletas:

- **PWA responsive** (`public/`): instalable en el celular, cómoda en PC.
  Emisión en 3 pasos con descripción libre y monto que fija la emisora,
  sugerencias de descripciones recientes, boleta/factura, cliente varios o
  con DNI/RUC, IGV opcional (exonerado Amazonía por defecto).
- **Ticket** con QR reglamentario, botón compartir (WhatsApp) e imprimir
  (formato ticketera), y estado SUNAT visible.
- **Lista de comprobantes** (tarjetas en móvil, tabla en PC) y **reportes**
  con **exportación CSV/Excel** para la computadora.
- **Resumen Diario de boletas** (SummaryDocuments RC): generación, firma,
  `sendSummary` + `getStatus` por ticket, cron nocturno (22:00 Perú) y
  reintentos. Formato verificado contra Greenter; la cola de resúmenes del
  ambiente beta de SUNAT devuelve 0135 de forma intermitente (limitación de
  beta, no del formato).
- **Clave de acceso** para toda la API/app (secret `APP_CLAVE`).
- Flujo verificado de punta a punta en el runtime real de Workers
  (`wrangler dev` local + envío real a SUNAT beta: factura y boleta
  ACEPTADAS emitidas desde la API).

## Fase 1 (núcleo SUNAT)

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
