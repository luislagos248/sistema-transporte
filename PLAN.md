# Plan del Proyecto — Sistema de Facturación Tourismo Irasola

**Empresa:** Tourismo Irasola (un solo RUC, dos rubros)
- **Rubro 1 — Transporte:** pasajes (ruta Pucallpa ↔ km 86 San Alejandro), encomiendas/carga, y servicios contratados puntuales (Huánuco, Tingo María, etc.). Flota propia + carros de terceros inscritos en la empresa.
- **Rubro 2 — Hospedaje:** alquiler de habitaciones / estadías.

**Situación actual:** emisora electrónica que factura por el portal SOL de SUNAT (lento, se cae, poco práctico para una persona de la tercera edad).

**Objetivo:** sistema propio de emisión, usable desde el celular en pocos pasos, que no dependa de que el portal SOL esté arriba, con **costo cero de infraestructura** (sin dominio propio, sin VPS, sin proveedores de facturación de pago), fácil de mantener, para ~800 comprobantes/mes, con exportación de reportes a la computadora.

---

## 1. Aclaración legal importante (leer primero)

**No existe camino legal para dejar de emitir electrónicamente.** La empresa ya es emisor electrónico designado (emite por SOL). Lo que sí podemos hacer —y es exactamente lo que este plan hace— es dejar de depender del *portal* SOL y emitir desde un **sistema propio del contribuyente (SEE–Del Contribuyente)**, que es una modalidad oficial de SUNAT, **sin pagar** a un PSE/OSE (NubeFact, etc.), usando el **Certificado Digital Tributario gratuito** que SUNAT entrega a las MYPE.

En esta modalidad:
- Nuestro sistema genera el comprobante (XML UBL 2.1), lo firma con el certificado, se lo envía a SUNAT por su servicio web, y guarda la constancia de recepción (CDR).
- El cliente recibe su comprobante al instante (PDF/ticket por WhatsApp o impreso); el envío a SUNAT puede hacerse después, dentro del plazo legal. **Por eso, aunque SUNAT esté caída, la abuelita puede seguir emitiendo sin detenerse** — el sistema reintenta el envío solo.
- El portal SOL queda como respaldo/contingencia, no como herramienta diaria.

## 2. Requisitos SUNAT que el plan cumple

| Requisito | Qué haremos |
|---|---|
| Certificado digital | Solicitar el **Certificado Digital Tributario gratuito** en SOL (Empresas → Comprobantes de Pago → Certificado Digital Tributario). Vigencia 3 años; el programa gratuito está vigente hasta fines de 2027. Requisitos: RUC activo y habido, renta de 3.ª categoría. |
| Alta en SEE-Del Contribuyente | Registrar el certificado en SOL y dar de alta las **series propias** del nuevo sistema (p. ej. F001/B001 para transporte y F002/B002 para hospedaje). Las series del portal SOL (E001…) siguen existiendo aparte. |
| Formato del comprobante | XML **UBL 2.1** firmado digitalmente (XML-DSig), según los formatos oficiales de SUNAT, validado primero en el **ambiente beta** de SUNAT antes de pasar a producción. |
| Plazo de envío — facturas | Envío a SUNAT máximo **3 días calendario** desde el día siguiente de la emisión. El sistema envía al toque y, si SUNAT está caída, reintenta automáticamente con alarma si se acerca el límite. |
| Plazo de envío — boletas | Se envían mediante **Resumen Diario** (máximo 7 días calendario). El sistema genera y envía el resumen automáticamente cada noche. |
| Notas de crédito/débito | Módulo de anulación/corrección: toda anulación de factura o boleta se hace con nota de crédito electrónica, como exige SUNAT (nada de "borrar" comprobantes). |
| Conservación | XML firmados + CDR guardados por **5 años**, con descarga/backup a la computadora. |
| Representación impresa | PDF/ticket con todos los campos obligatorios + **código QR** reglamentario; enviable por WhatsApp o imprimible en ticketera Bluetooth. |
| Encomiendas (GRE-T) | Desde **julio 2026 la Guía de Remisión Electrónica es obligatoria** para todo traslado de bienes; como la empresa transporta carga de terceros, el sistema incluirá módulo de **GRE-Transportista** (se emite por la API REST de GRE de SUNAT, con las reglas nuevas de la R.S. 108-2026). |
| Pasajes | El transporte interprovincial de pasajeros emite factura/boleta electrónica por pasaje (los boletos de viaje físicos ya no aplican para emisores electrónicos). El manifiesto de pasajeros (exigencia MTC) se puede generar como reporte del sistema. |
| IGV — Amazonía | Pucallpa/Ucayali está en zona de **Amazonía (Ley 27037)**: los servicios prestados dentro de la zona por empresas acogidas suelen estar **exonerados de IGV** (se emite con código de afectación "exonerado", catálogo 07). ⚠️ **Esto debe confirmarlo el contador de la empresa** (si está acogida y qué operaciones califican, p. ej. viajes contratados fuera de la zona como Huánuco/Tingo María podrían tratarse distinto). El sistema soportará operaciones gravadas y exoneradas por ítem, así que cualquiera sea la respuesta, se configura y listo. |

**Riesgo de multas — cómo lo evitamos:** las contingencias típicas (comprobante emitido y nunca informado, envío fuera de plazo, anular "borrando", series no autorizadas) quedan cubiertas por diseño: cola de reintentos con semáforo de plazos, resumen diario automático, notas de crédito obligatorias y series dadas de alta antes de emitir. Además, nada pasa a producción sin haber pasado el ambiente beta de SUNAT.

## 3. Arquitectura técnica (costo S/ 0)

Elegida para cumplir "sin dominio, sin VPS, gratis y confiable":

- **Cloudflare Pages + Workers (plan gratuito, uso comercial permitido)** — la aplicación vive en un subdominio gratuito (`irasola.pages.dev`); el plan gratuito aguanta de sobra 800 comprobantes/mes (límite: 100 000 solicitudes/día).
- **Base de datos: Cloudflare D1** (SQLite gestionado, gratis hasta 5 GB — décadas de comprobantes).
- **Archivos XML/CDR/PDF: Cloudflare R2** (10 GB gratis).
- **Tareas programadas (Cron Triggers)**: envío del resumen diario de boletas cada noche y reintentos automáticos de envíos pendientes.
- **Certificado digital**: guardado cifrado como *secret* del Worker, nunca en el código ni en el repositorio.
- **App móvil = PWA** (aplicación web instalable): se agrega a la pantalla de inicio del celular como si fuera una app, sin pasar por Play Store. Interfaz pensada para adulta mayor: botones grandes, máximo 3 pasos por comprobante, textos claros, sin jerga.
- **Lenguaje: TypeScript** en todo el proyecto (frontend y Worker). La generación del XML UBL 2.1 y la firma digital se implementan como librería propia del proyecto, usando los formatos oficiales de SUNAT y tomando como referencia probada la librería open-source **Greenter** (PHP). Se valida contra el ambiente beta de SUNAT antes de emitir de verdad.

**Plan B declarado:** si en la práctica la firma/envío SOAP desde Workers diera problemas insalvables, el respaldo es el mismo sistema con backend PHP + Greenter en un hosting compartido de ~S/10–20/mes. Se decide al final de la Fase 2, no antes; el resto del sistema (pantallas, base de datos, reportes) no cambia.

### Flujo de un comprobante

1. La abuelita toca "Pasaje" (o "Encomienda", "Hospedaje"…), escribe la **descripción y el monto que ella decide**, pone DNI/RUC del cliente (o "cliente varios" para boletas menores) → **Emitir**. Para escribir menos, el sistema le sugiere sus descripciones recientes (p. ej. "Pasaje Pucallpa – San Alejandro"), pero el precio siempre lo pone ella.
2. El sistema crea el comprobante con numeración correlativa, genera el XML, lo firma y muestra el ticket al instante (compartir por WhatsApp / imprimir).
3. En segundo plano: facturas se envían a SUNAT de inmediato (reintentos si está caída); boletas entran al resumen diario nocturno.
4. El CDR de SUNAT queda archivado junto al XML. Un semáforo en pantalla muestra si hay algo pendiente de envío y cuántos días de plazo quedan.

## 4. Módulos funcionales

1. **Pasajes** — descripción libre y **precio que fija la abuelita en el momento**; selección opcional de carro/chofer (propio o de tercero inscrito); boleta o factura en 3 toques. Las descripciones usadas antes aparecen como sugerencias para no tipear de nuevo.
2. **Encomiendas** — remitente, destinatario, descripción libre y monto que ella pone; comprobante + **GRE-Transportista** cuando corresponda; estado entregado/pendiente.
3. **Servicios contratados** — viajes puntuales (Huánuco, Tingo María…): factura con detalle libre y precio negociado.
4. **Hospedaje** — igual: descripción libre (p. ej. "Hospedaje 2 noches, hab. 5") y monto que ella decide; boleta/factura por estadía.
5. **Notas de crédito** — anulación o corrección guiada ("¿qué comprobante quieres anular?") sin conocimientos técnicos.
6. **Clientes** — autocompletado por DNI/RUC (consulta a padrones vía API gratuita) y memoria de clientes frecuentes.
7. **Panel y reportes** — ventas del día/mes por rubro, comprobantes pendientes de envío, **exportación a Excel/CSV** para descargar en la computadora (formato listo para el contador: base para el Registro de Ventas), y backup descargable de XML+CDR.
8. **Contingencia** — si algo falla de verdad, guía en pantalla de cómo emitir esa venta por el portal SOL, para nunca dejar de vender.

## 5. Fases de implementación

| Fase | Contenido | Resultado verificable |
|---|---|---|
| **0. Trámites** (la familia, con guía nuestra) | Solicitar Certificado Digital Tributario gratuito en SOL; confirmar con el contador el tema Amazonía/IGV y las series a usar. | Certificado emitido y registrado; series definidas. |
| **1. Núcleo de emisión (beta)** | Modelo de datos, generación UBL 2.1, firma digital, envío a **SUNAT beta**, CDR. | Factura y boleta de prueba **aceptadas por SUNAT beta**. |
| **2. App móvil — pasajes y encomiendas** | PWA con los flujos de venta, tickets con QR, WhatsApp/impresión, resumen diario, cola de reintentos. | La abuelita emite un pasaje de prueba en < 30 segundos desde su celular. |
| **3. Producción** | Alta de series reales, cambio a endpoints de producción, periodo de marcha blanca en paralelo con SOL. | Primeros comprobantes reales aceptados por SUNAT con CDR. |
| **4. Hospedaje + notas de crédito** | Módulo hotel y anulaciones. | Estadía facturada y una anulación completa hecha desde el celular. |
| **5. GRE-Transportista** | Emisión de guías por la API REST de GRE (obligatoria desde jul-2026). | GRE-T aceptada por SUNAT. |
| **6. Reportes y cierre** | Exportaciones Excel/CSV, backups, manifiesto de pasajeros, manual con capturas para la abuelita. | Reporte mensual descargado en la computadora; ella opera sola. |

## 6. Riesgos y mitigaciones

- **SUNAT caída** → la emisión nunca se bloquea (se emite local y se envía después, dentro del plazo); cola de reintentos + semáforo de plazos.
- **Rechazos de SUNAT por formato** → todo se prueba primero en beta; los rechazos reales quedan en una bandeja "observados" con explicación en cristiano y corrección guiada.
- **Vencimiento del certificado (3 años)** → recordatorio automático 60 días antes.
- **Límites del plan gratuito** → el volumen (≈27 comprobantes/día) usa menos del 1 % de los límites gratuitos de Cloudflare; aún así, backups descargables para no depender de nadie.
- **Cambios normativos SUNAT** → el diseño separa "formatos SUNAT" del resto del sistema, para actualizar solo esa pieza.

## 7. Lo que necesito de ustedes para arrancar

1. **RUC** de la empresa y confirmación de razón social/dirección fiscal (para los datos del emisor en el XML).
2. Que hagan el **trámite del certificado gratuito** en SOL (les paso el paso a paso; es 100 % en línea, sin costo).
3. **Confirmación del contador** sobre la exoneración de IGV por Amazonía (qué operaciones van exoneradas y cuáles gravadas).
4. Logo (opcional) para los tickets.

*(No hace falta lista de rutas ni tarifas: la abuelita escribe la descripción y fija el precio en cada comprobante; el sistema solo le sugiere sus descripciones recientes para escribir menos.)*

> **Nota de seguridad:** la Clave SOL y el certificado digital nunca deben compartirse por chat ni subirse al repositorio. El sistema los usará solo como secretos cifrados en la infraestructura.
