import { fmt } from './calculo.js';
import type { Empresa } from './types.js';

/**
 * Resumen Diario de boletas (SummaryDocuments, formato RC).
 *
 * En producción, las boletas y sus notas se informan a SUNAT mediante este
 * resumen (sendSummary + getStatus con ticket), dentro del plazo legal.
 * Formato: UBL 2.0 con CustomizationID 1.1, firmado igual que los comprobantes.
 */

export interface BoletaResumen {
  /** 03 = boleta, 07 = nota de crédito de boleta. */
  tipo: '03' | '07';
  serie: string;
  correlativo: number;
  /** Solo para tipo 07: comprobante que la nota modifica. */
  docReferencia?: { tipo: '03'; serie: string; correlativo: number };
  clienteTipoDoc: string;
  clienteNumDoc: string;
  moneda: 'PEN' | 'USD';
  gravado: number; // céntimos
  exonerado: number;
  inafecto: number;
  igv: number;
  total: number;
  /**
   * 1 = adicionar, 2 = modificar, 3 = anular. La baja de una boleta ya
   * informada se hace enviándola con condición 3 en un resumen posterior.
   */
  condicion: 1 | 2 | 3;
}

export interface ResumenDiario {
  emisor: Empresa;
  /** Fecha de emisión de las boletas incluidas (YYYY-MM-DD). */
  fechaReferencia: string;
  /** Fecha en que se genera/envía el resumen (YYYY-MM-DD). */
  fechaGeneracion: string;
  /** Número de resumen del día (1, 2, ...): ID = RC-YYYYMMDD-N. */
  numero: number;
  boletas: BoletaResumen[];
}

const NS = {
  root: 'urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  sac: 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
};

function lineaResumen(i: number, b: BoletaResumen): string {
  const m = b.moneda;
  // Importes por tipo de operación (catálogo 11 de instrucciones de pago).
  const pagos: string[] = [];
  const pago = (monto: number, instruccion: string) =>
    `<sac:BillingPayment><cbc:PaidAmount currencyID="${m}">${fmt(monto)}</cbc:PaidAmount><cbc:InstructionID>${instruccion}</cbc:InstructionID></sac:BillingPayment>`;
  if (b.gravado > 0) pagos.push(pago(b.gravado, '01'));
  if (b.exonerado > 0) pagos.push(pago(b.exonerado, '02'));
  if (b.inafecto > 0) pagos.push(pago(b.inafecto, '03'));
  if (pagos.length === 0) pagos.push(pago(0, '01'));

  return (
    `<sac:SummaryDocumentsLine>` +
    `<cbc:LineID>${i}</cbc:LineID>` +
    `<cbc:DocumentTypeCode>${b.tipo}</cbc:DocumentTypeCode>` +
    `<cbc:ID>${b.serie}-${b.correlativo}</cbc:ID>` +
    `<cac:AccountingCustomerParty>` +
    `<cbc:CustomerAssignedAccountID>${b.clienteNumDoc === '-' ? '0' : b.clienteNumDoc}</cbc:CustomerAssignedAccountID>` +
    `<cbc:AdditionalAccountID>${b.clienteTipoDoc === '0' ? '1' : b.clienteTipoDoc}</cbc:AdditionalAccountID>` +
    `</cac:AccountingCustomerParty>` +
    (b.docReferencia
      ? `<cac:BillingReference><cac:InvoiceDocumentReference>` +
        `<cbc:ID>${b.docReferencia.serie}-${b.docReferencia.correlativo}</cbc:ID>` +
        `<cbc:DocumentTypeCode>${b.docReferencia.tipo}</cbc:DocumentTypeCode>` +
        `</cac:InvoiceDocumentReference></cac:BillingReference>`
      : '') +
    `<cac:Status><cbc:ConditionCode>${b.condicion}</cbc:ConditionCode></cac:Status>` +
    `<sac:TotalAmount currencyID="${m}">${fmt(b.total)}</sac:TotalAmount>` +
    pagos.join('') +
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="${m}">${fmt(b.igv)}</cbc:TaxAmount>` +
    `<cac:TaxSubtotal>` +
    `<cbc:TaxAmount currencyID="${m}">${fmt(b.igv)}</cbc:TaxAmount>` +
    `<cac:TaxCategory>` +
    `<cac:TaxScheme><cbc:ID>1000</cbc:ID><cbc:Name>IGV</cbc:Name><cbc:TaxTypeCode>VAT</cbc:TaxTypeCode></cac:TaxScheme>` +
    `</cac:TaxCategory>` +
    `</cac:TaxSubtotal>` +
    `</cac:TaxTotal>` +
    `</sac:SummaryDocumentsLine>`
  );
}

export interface ResumenGenerado {
  xml: string;
  /** Identificador RC-YYYYMMDD-N. */
  id: string;
  /** Nombre base del archivo: RUC-RC-YYYYMMDD-N. */
  nombre: string;
}

export function generarResumenXml(r: ResumenDiario): ResumenGenerado {
  if (r.boletas.length === 0) throw new Error('El resumen no tiene boletas');
  const e = r.emisor;
  const id = `RC-${r.fechaGeneracion.replaceAll('-', '')}-${r.numero}`;

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<SummaryDocuments xmlns="${NS.root}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ds="${NS.ds}" xmlns:ext="${NS.ext}" xmlns:sac="${NS.sac}">` +
    `<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>` +
    `<cbc:UBLVersionID>2.0</cbc:UBLVersionID>` +
    `<cbc:CustomizationID>1.1</cbc:CustomizationID>` +
    `<cbc:ID>${id}</cbc:ID>` +
    `<cbc:ReferenceDate>${r.fechaReferencia}</cbc:ReferenceDate>` +
    `<cbc:IssueDate>${r.fechaGeneracion}</cbc:IssueDate>` +
    `<cac:Signature>` +
    `<cbc:ID>${e.ruc}</cbc:ID>` +
    `<cac:SignatoryParty>` +
    `<cac:PartyIdentification><cbc:ID>${e.ruc}</cbc:ID></cac:PartyIdentification>` +
    `<cac:PartyName><cbc:Name><![CDATA[${e.razonSocial}]]></cbc:Name></cac:PartyName>` +
    `</cac:SignatoryParty>` +
    `<cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference></cac:DigitalSignatureAttachment>` +
    `</cac:Signature>` +
    `<cac:AccountingSupplierParty>` +
    `<cbc:CustomerAssignedAccountID>${e.ruc}</cbc:CustomerAssignedAccountID>` +
    `<cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>` +
    `<cac:Party><cac:PartyLegalEntity><cbc:RegistrationName><![CDATA[${e.razonSocial}]]></cbc:RegistrationName></cac:PartyLegalEntity></cac:Party>` +
    `</cac:AccountingSupplierParty>` +
    r.boletas.map((b, i) => lineaResumen(i + 1, b)).join('') +
    `</SummaryDocuments>`;

  return { xml, id, nombre: `${e.ruc}-${id}` };
}
