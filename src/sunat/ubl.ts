import type { Cliente, Comprobante, LineaCalculada, Totales } from './types.js';
import { calcularTotales, fmt } from './calculo.js';
import { montoEnLetras } from './montoEnLetras.js';

/**
 * Generador del XML UBL 2.1 para Factura (01) y Boleta de Venta (03),
 * según los formatos del SEE-Del Contribuyente (CustomizationID 2.0).
 *
 * El XML se genera como texto ya "canónico" (atributos en orden fijo, sin
 * espacios superfluos) y la firma se agrega después en ext:ExtensionContent.
 */

const NS = {
  inv: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Info de tributo por afectación (catálogos 05 y 07). */
function tributo(afectacion: '10' | '20' | '30'): { id: string; nombre: string; tipo: string } {
  switch (afectacion) {
    case '10':
      return { id: '1000', nombre: 'IGV', tipo: 'VAT' };
    case '20':
      return { id: '9997', nombre: 'EXO', tipo: 'VAT' };
    case '30':
      return { id: '9998', nombre: 'INA', tipo: 'FRE' };
  }
}

function taxScheme(t: { id: string; nombre: string; tipo: string }): string {
  return (
    `<cac:TaxScheme>` +
    `<cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">${t.id}</cbc:ID>` +
    `<cbc:Name>${t.nombre}</cbc:Name>` +
    `<cbc:TaxTypeCode>${t.tipo}</cbc:TaxTypeCode>` +
    `</cac:TaxScheme>`
  );
}

function partyCliente(c: Cliente): string {
  return (
    `<cac:AccountingCustomerParty>` +
    `<cac:Party>` +
    `<cac:PartyIdentification>` +
    `<cbc:ID schemeID="${c.tipoDoc}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${esc(c.numDoc)}</cbc:ID>` +
    `</cac:PartyIdentification>` +
    `<cac:PartyLegalEntity>` +
    `<cbc:RegistrationName><![CDATA[${c.nombre}]]></cbc:RegistrationName>` +
    (c.direccion
      ? `<cac:RegistrationAddress><cac:AddressLine><cbc:Line><![CDATA[${c.direccion}]]></cbc:Line></cac:AddressLine></cac:RegistrationAddress>`
      : '') +
    `</cac:PartyLegalEntity>` +
    `</cac:Party>` +
    `</cac:AccountingCustomerParty>`
  );
}

function linea(idx: number, l: LineaCalculada, moneda: string, tasaIgv: number): string {
  const t = tributo(l.item.afectacion);
  const cantidad = String(l.item.cantidad);
  const percent = l.item.afectacion === '10' ? String(tasaIgv) : '0';
  return (
    `<cac:InvoiceLine>` +
    `<cbc:ID>${idx}</cbc:ID>` +
    `<cbc:InvoicedQuantity unitCode="${esc(l.item.unidad)}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${cantidad}</cbc:InvoicedQuantity>` +
    `<cbc:LineExtensionAmount currencyID="${moneda}">${fmt(l.valorVenta)}</cbc:LineExtensionAmount>` +
    `<cac:PricingReference>` +
    `<cac:AlternativeConditionPrice>` +
    `<cbc:PriceAmount currencyID="${moneda}">${fmt(l.precioUnitario)}</cbc:PriceAmount>` +
    `<cbc:PriceTypeCode listName="Tipo de Precio" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo16">01</cbc:PriceTypeCode>` +
    `</cac:AlternativeConditionPrice>` +
    `</cac:PricingReference>` +
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="${moneda}">${fmt(l.igv)}</cbc:TaxAmount>` +
    `<cac:TaxSubtotal>` +
    `<cbc:TaxableAmount currencyID="${moneda}">${fmt(l.valorVenta)}</cbc:TaxableAmount>` +
    `<cbc:TaxAmount currencyID="${moneda}">${fmt(l.igv)}</cbc:TaxAmount>` +
    `<cac:TaxCategory>` +
    `<cbc:Percent>${percent}</cbc:Percent>` +
    `<cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${l.item.afectacion}</cbc:TaxExemptionReasonCode>` +
    taxScheme(t) +
    `</cac:TaxCategory>` +
    `</cac:TaxSubtotal>` +
    `</cac:TaxTotal>` +
    `<cac:Item><cbc:Description><![CDATA[${l.item.descripcion}]]></cbc:Description></cac:Item>` +
    `<cac:Price><cbc:PriceAmount currencyID="${moneda}">${fmt(l.valorUnitario)}</cbc:PriceAmount></cac:Price>` +
    `</cac:InvoiceLine>`
  );
}

function taxSubtotalGlobal(base: number, igv: number, af: '10' | '20' | '30', moneda: string): string {
  return (
    `<cac:TaxSubtotal>` +
    `<cbc:TaxableAmount currencyID="${moneda}">${fmt(base)}</cbc:TaxableAmount>` +
    `<cbc:TaxAmount currencyID="${moneda}">${fmt(igv)}</cbc:TaxAmount>` +
    `<cac:TaxCategory>` +
    taxScheme(tributo(af)) +
    `</cac:TaxCategory>` +
    `</cac:TaxSubtotal>`
  );
}

export interface XmlGenerado {
  xml: string;
  /** Nombre base del archivo según SUNAT: RUC-TIPO-SERIE-CORRELATIVO. */
  nombre: string;
  totales: Totales;
  leyenda: string;
}

export function generarInvoiceXml(cpe: Comprobante): XmlGenerado {
  if (cpe.tipo !== '01' && cpe.tipo !== '03') {
    throw new Error(`Tipo de comprobante no soportado por generarInvoiceXml: ${cpe.tipo}`);
  }
  if (cpe.items.length === 0) throw new Error('El comprobante no tiene ítems');
  if (!/^[FB][A-Z0-9]{3}$/.test(cpe.serie)) throw new Error(`Serie inválida: ${cpe.serie}`);
  if (cpe.tipo === '01' && cpe.cliente.tipoDoc !== '6') {
    throw new Error('Una factura requiere cliente con RUC (catálogo 06, tipo 6)');
  }

  const { lineas, totales } = calcularTotales(cpe);
  const m = cpe.moneda;
  const id = `${cpe.serie}-${cpe.correlativo}`;
  const leyenda = montoEnLetras(totales.total, m);
  const e = cpe.emisor;

  const subtotales: string[] = [];
  if (totales.gravado > 0) subtotales.push(taxSubtotalGlobal(totales.gravado, totales.igv, '10', m));
  if (totales.exonerado > 0) subtotales.push(taxSubtotalGlobal(totales.exonerado, 0, '20', m));
  if (totales.inafecto > 0) subtotales.push(taxSubtotalGlobal(totales.inafecto, 0, '30', m));

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<Invoice xmlns="${NS.inv}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ds="${NS.ds}" xmlns:ext="${NS.ext}">` +
    `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>` +
    `<cbc:UBLVersionID>2.1</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>2.0</cbc:CustomizationID>` +
    `<cbc:ID>${id}</cbc:ID>` +
    `<cbc:IssueDate>${cpe.fechaEmision}</cbc:IssueDate>` +
    `<cbc:IssueTime>${cpe.horaEmision}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode listAgencyName="PE:SUNAT" listID="0101" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${cpe.tipo}</cbc:InvoiceTypeCode>` +
    `<cbc:Note languageLocaleID="1000"><![CDATA[${leyenda}]]></cbc:Note>` +
    `<cbc:DocumentCurrencyCode listID="ISO 4217 Alpha" listName="Currency" listAgencyName="United Nations Economic Commission for Europe">${m}</cbc:DocumentCurrencyCode>` +
    // Bloque cac:Signature (referencia informativa a la firma digital)
    `<cac:Signature>` +
    `<cbc:ID>${e.ruc}</cbc:ID>` +
    `<cac:SignatoryParty>` +
    `<cac:PartyIdentification><cbc:ID>${e.ruc}</cbc:ID></cac:PartyIdentification>` +
    `<cac:PartyName><cbc:Name><![CDATA[${e.razonSocial}]]></cbc:Name></cac:PartyName>` +
    `</cac:SignatoryParty>` +
    `<cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>` +
    `</cac:Signature>` +
    // Emisor
    `<cac:AccountingSupplierParty>` +
    `<cac:Party>` +
    `<cac:PartyIdentification>` +
    `<cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${e.ruc}</cbc:ID>` +
    `</cac:PartyIdentification>` +
    `<cac:PartyName><cbc:Name><![CDATA[${e.nombreComercial ?? e.razonSocial}]]></cbc:Name></cac:PartyName>` +
    `<cac:PartyLegalEntity>` +
    `<cbc:RegistrationName><![CDATA[${e.razonSocial}]]></cbc:RegistrationName>` +
    `<cac:RegistrationAddress>` +
    `<cbc:ID>${e.ubigeo}</cbc:ID>` +
    `<cbc:AddressTypeCode>${e.codigoEstablecimiento ?? '0000'}</cbc:AddressTypeCode>` +
    `<cbc:CityName><![CDATA[${e.provincia}]]></cbc:CityName>` +
    `<cbc:CountrySubentity><![CDATA[${e.departamento}]]></cbc:CountrySubentity>` +
    `<cbc:District><![CDATA[${e.distrito}]]></cbc:District>` +
    `<cac:AddressLine><cbc:Line><![CDATA[${e.direccion}]]></cbc:Line></cac:AddressLine>` +
    `<cac:Country><cbc:IdentificationCode listID="ISO 3166-1" listAgencyName="United Nations Economic Commission for Europe" listName="Country">PE</cbc:IdentificationCode></cac:Country>` +
    `</cac:RegistrationAddress>` +
    `</cac:PartyLegalEntity>` +
    `</cac:Party>` +
    `</cac:AccountingSupplierParty>` +
    partyCliente(cpe.cliente) +
    // Forma de pago (obligatoria desde 2021): este sistema emite al contado.
    `<cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID><cbc:PaymentMeansID>Contado</cbc:PaymentMeansID></cac:PaymentTerms>` +
    // Totales de impuestos
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="${m}">${fmt(totales.igv)}</cbc:TaxAmount>` +
    subtotales.join('') +
    `</cac:TaxTotal>` +
    `<cac:LegalMonetaryTotal>` +
    `<cbc:LineExtensionAmount currencyID="${m}">${fmt(totales.gravado + totales.exonerado + totales.inafecto)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxInclusiveAmount currencyID="${m}">${fmt(totales.total)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount currencyID="${m}">${fmt(totales.total)}</cbc:PayableAmount>` +
    `</cac:LegalMonetaryTotal>` +
    lineas.map((l, i) => linea(i + 1, l, m, cpe.tasaIgv)).join('') +
    `</Invoice>`;

  return {
    xml,
    nombre: `${e.ruc}-${cpe.tipo}-${id}`,
    totales,
    leyenda,
  };
}
