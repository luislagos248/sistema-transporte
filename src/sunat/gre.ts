import type { Empresa, TipoDocIdentidad } from './types.js';

/**
 * Guía de Remisión Electrónica - Transportista (tipo 31, serie V###).
 *
 * Estructura según el Estándar UBL 2.1 GRE Transportista (Anexo N° 14 de la
 * R.S. 123-2022/SUNAT): el transportista (emisor) va en DespatchSupplierParty,
 * el remitente en Shipment/Delivery/Despatch/DespatchParty, el destinatario en
 * DeliveryCustomerParty; vehículo, conductor y registro MTC dentro de Shipment.
 */

export interface ParteGre {
  tipoDoc: TipoDocIdentidad;
  numDoc: string;
  nombre: string;
}

export interface DireccionGre {
  /** Ubigeo INEI de 6 dígitos. */
  ubigeo: string;
  direccion: string;
}

export interface BienGre {
  descripcion: string;
  cantidad: number;
  /** UN/ECE rec 20: NIU unidad, ZZ servicio, KGM kilos, etc. */
  unidad: string;
}

export interface DocRelacionadoGre {
  /** Catálogo 61 (01 = factura, 03 = boleta, 09 = GRE remitente, ...). */
  tipo: string;
  descripcion: string;
  numero: string; // ej. F001-123
  rucEmisor?: string;
}

export interface GuiaTransportista {
  serie: string; // V###
  correlativo: number;
  fechaEmision: string; // YYYY-MM-DD
  horaEmision: string; // HH:MM:SS
  /** El emisor transportista (la empresa). */
  emisor: Empresa;
  /** Número de registro MTC del transportista (si lo tiene). */
  registroMtc?: string;
  remitente: ParteGre;
  destinatario: ParteGre;
  fechaInicioTraslado: string; // YYYY-MM-DD
  /** Peso bruto total en kilogramos (hasta 3 decimales). */
  pesoTotalKg: number;
  vehiculo: {
    placa: string;
    /** Tarjeta Única de Circulación / CHV (MTC). */
    tarjetaCirculacion?: string;
  };
  conductor: {
    tipoDoc: TipoDocIdentidad;
    numDoc: string;
    nombres: string;
    apellidos: string;
    licencia: string;
  };
  partida: DireccionGre;
  llegada: DireccionGre;
  bienes: BienGre[];
  docsRelacionados?: DocRelacionadoGre[];
  observacion?: string;
}

const NS = {
  root: 'urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
};

const CAT06 =
  'schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06"';

function pesoFmt(kg: number): string {
  return kg.toFixed(3);
}

function cantidadFmt(n: number): string {
  return Number.isInteger(n) ? `${n}.00` : String(n);
}

/** `conParty`: DespatchSupplierParty y DeliveryCustomerParty envuelven los
 *  datos en cac:Party; DespatchParty (remitente) los lleva directos. */
function parte(tag: string, p: ParteGre, conParty: boolean): string {
  const interior =
    `<cac:PartyIdentification><cbc:ID schemeID="${p.tipoDoc}" ${CAT06}>${p.numDoc}</cbc:ID></cac:PartyIdentification>` +
    `<cac:PartyLegalEntity><cbc:RegistrationName><![CDATA[${p.nombre}]]></cbc:RegistrationName></cac:PartyLegalEntity>`;
  return `<cac:${tag}>${conParty ? `<cac:Party>${interior}</cac:Party>` : interior}</cac:${tag}>`;
}

function direccion(tag: string, d: DireccionGre): string {
  return (
    `<cac:${tag}>` +
    `<cbc:ID schemeName="Ubigeos" schemeAgencyName="PE:INEI">${d.ubigeo}</cbc:ID>` +
    `<cac:AddressLine><cbc:Line><![CDATA[${d.direccion}]]></cbc:Line></cac:AddressLine>` +
    `</cac:${tag}>`
  );
}

export interface GuiaGenerada {
  xml: string;
  /** RUC-31-SERIE-CORRELATIVO. */
  nombre: string;
}

export function generarGuiaTransportistaXml(g: GuiaTransportista): GuiaGenerada {
  if (!/^V[A-Z0-9]{3}$/.test(g.serie)) throw new Error(`Serie de GRE transportista inválida (V###): ${g.serie}`);
  if (g.bienes.length === 0) throw new Error('La guía no tiene bienes a transportar');
  if (!(g.pesoTotalKg > 0)) throw new Error('El peso bruto total debe ser mayor a 0');
  if (!/^\d{6}$/.test(g.partida.ubigeo) || !/^\d{6}$/.test(g.llegada.ubigeo)) {
    throw new Error('Los ubigeos de partida y llegada deben tener 6 dígitos');
  }

  const e = g.emisor;
  const id = `${g.serie}-${g.correlativo}`;

  const docs = (g.docsRelacionados ?? [])
    .map(
      (d) =>
        `<cac:AdditionalDocumentReference>` +
        `<cbc:ID>${d.numero}</cbc:ID>` +
        `<cbc:DocumentTypeCode listAgencyName="PE:SUNAT" listName="Documento relacionado al transporte" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo61">${d.tipo}</cbc:DocumentTypeCode>` +
        `<cbc:DocumentType><![CDATA[${d.descripcion}]]></cbc:DocumentType>` +
        (d.rucEmisor
          ? `<cac:IssuerParty><cac:PartyIdentification><cbc:ID schemeID="6" ${CAT06}>${d.rucEmisor}</cbc:ID></cac:PartyIdentification></cac:IssuerParty>`
          : '') +
        `</cac:AdditionalDocumentReference>`,
    )
    .join('');

  const lineas = g.bienes
    .map(
      (b, i) =>
        `<cac:DespatchLine>` +
        `<cbc:ID>${i + 1}</cbc:ID>` +
        `<cbc:DeliveredQuantity unitCode="${b.unidad}" unitCodeListID="UN/ECE rec 20" unitCodeListAgencyName="United Nations Economic Commission for Europe">${cantidadFmt(b.cantidad)}</cbc:DeliveredQuantity>` +
        `<cac:OrderLineReference><cbc:LineID>${i + 1}</cbc:LineID></cac:OrderLineReference>` +
        `<cac:Item><cbc:Description><![CDATA[${b.descripcion}]]></cbc:Description></cac:Item>` +
        `</cac:DespatchLine>`,
    )
    .join('');

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<DespatchAdvice xmlns="${NS.root}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ds="${NS.ds}" xmlns:ext="${NS.ext}">` +
    `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>` +
    `<cbc:UBLVersionID>2.1</cbc:UBLVersionID>` +
    `<cbc:CustomizationID schemeAgencyName="PE:SUNAT">2.0</cbc:CustomizationID>` +
    `<cbc:ID>${id}</cbc:ID>` +
    `<cbc:IssueDate>${g.fechaEmision}</cbc:IssueDate>` +
    `<cbc:IssueTime>${g.horaEmision}</cbc:IssueTime>` +
    `<cbc:DespatchAdviceTypeCode listAgencyName="PE:SUNAT" listName="Tipo de Documento" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">31</cbc:DespatchAdviceTypeCode>` +
    (g.observacion ? `<cbc:Note><![CDATA[${g.observacion}]]></cbc:Note>` : '') +
    docs +
    `<cac:Signature>` +
    `<cbc:ID>${e.ruc}</cbc:ID>` +
    `<cac:SignatoryParty>` +
    `<cac:PartyIdentification><cbc:ID>${e.ruc}</cbc:ID></cac:PartyIdentification>` +
    `<cac:PartyName><cbc:Name><![CDATA[${e.razonSocial}]]></cbc:Name></cac:PartyName>` +
    `</cac:SignatoryParty>` +
    `<cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>` +
    `</cac:Signature>` +
    parte('DespatchSupplierParty', { tipoDoc: '6', numDoc: e.ruc, nombre: e.razonSocial }, true) +
    parte('DeliveryCustomerParty', g.destinatario, true) +
    `<cac:Shipment>` +
    `<cbc:ID>SUNAT_Envio</cbc:ID>` +
    `<cbc:GrossWeightMeasure unitCode="KGM">${pesoFmt(g.pesoTotalKg)}</cbc:GrossWeightMeasure>` +
    `<cac:ShipmentStage>` +
    `<cac:TransitPeriod><cbc:StartDate>${g.fechaInicioTraslado}</cbc:StartDate></cac:TransitPeriod>` +
    (g.registroMtc
      ? `<cac:CarrierParty><cac:PartyLegalEntity><cbc:CompanyID>${g.registroMtc}</cbc:CompanyID></cac:PartyLegalEntity></cac:CarrierParty>`
      : '') +
    `<cac:DriverPerson>` +
    `<cbc:ID schemeID="${g.conductor.tipoDoc}" ${CAT06}>${g.conductor.numDoc}</cbc:ID>` +
    `<cbc:FirstName><![CDATA[${g.conductor.nombres}]]></cbc:FirstName>` +
    `<cbc:FamilyName><![CDATA[${g.conductor.apellidos}]]></cbc:FamilyName>` +
    `<cbc:JobTitle>Principal</cbc:JobTitle>` +
    `<cac:IdentityDocumentReference><cbc:ID>${g.conductor.licencia}</cbc:ID></cac:IdentityDocumentReference>` +
    `</cac:DriverPerson>` +
    `</cac:ShipmentStage>` +
    `<cac:Delivery>` +
    direccion('DeliveryAddress', g.llegada) +
    `<cac:Despatch>` +
    direccion('DespatchAddress', g.partida) +
    parte('DespatchParty', g.remitente, false) +
    `</cac:Despatch>` +
    `</cac:Delivery>` +
    `<cac:TransportHandlingUnit>` +
    `<cac:TransportEquipment>` +
    `<cbc:ID>${g.vehiculo.placa}</cbc:ID>` +
    (g.vehiculo.tarjetaCirculacion
      ? `<cac:ShipmentDocumentReference><cbc:ID>${g.vehiculo.tarjetaCirculacion}</cbc:ID></cac:ShipmentDocumentReference>`
      : '') +
    `</cac:TransportEquipment>` +
    `</cac:TransportHandlingUnit>` +
    `</cac:Shipment>` +
    lineas +
    `</DespatchAdvice>`;

  return { xml, nombre: `${e.ruc}-31-${id}` };
}
