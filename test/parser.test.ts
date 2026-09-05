import { describe, expect, it } from 'vitest';
import { analizarMensaje, repartirMonto } from '../src/parser.js';

describe('analizador de mensajes de WhatsApp', () => {
  it('mensaje típico con RUC, razón social, cantidad y monto', () => {
    const a = analizarMensaje('Ruc 20123456789 Transportes El Rapido SAC 2 pasajes pucallpa aguaytia 60 soles');
    expect(a.tipoDoc).toBe('6');
    expect(a.numDoc).toBe('20123456789');
    expect(a.nombre).toMatch(/El Rapido SAC/i);
    expect(a.cantidad).toBe(2);
    expect(a.montoTotalCentimos).toBe(6000);
    expect(a.descripcion).toMatch(/pasajes pucallpa aguaytia/i);
    expect(a.faltantes).toEqual([]);
    expect(repartirMonto(a)).toEqual({ cantidad: 2, precioUnitarioCentimos: 3000 });
  });

  it('DNI con S/ y descripción de encomienda', () => {
    const a = analizarMensaje('dni 44556677 juan perez encomienda 1 caja S/ 25');
    expect(a.tipoDoc).toBe('1');
    expect(a.numDoc).toBe('44556677');
    expect(a.montoTotalCentimos).toBe(2500);
    expect(a.descripcion).toMatch(/encomienda/i);
  });

  it('varias líneas, monto con decimales y etiqueta de nombre', () => {
    const a = analizarMensaje('A nombre de: Maria Lopez Diaz\nDNI 40950090\n1 encomienda sobre documentos\ntotal 35.50');
    expect(a.numDoc).toBe('40950090');
    expect(a.nombre).toMatch(/Maria Lopez Diaz/i);
    expect(a.montoTotalCentimos).toBe(3550);
    expect(a.descripcion).toMatch(/encomienda sobre documentos/i);
  });

  it('sin documento: lo marca como faltante', () => {
    const a = analizarMensaje('2 pasajes a san alejandro 50 soles');
    expect(a.tipoDoc).toBeUndefined();
    expect(a.faltantes).toContain('documento');
    expect(a.montoTotalCentimos).toBe(5000);
    expect(a.cantidad).toBe(2);
  });

  it('sin monto: lo marca como faltante', () => {
    const a = analizarMensaje('RUC 20601030013 encomienda 3 cajas de repuestos');
    expect(a.numDoc).toBe('20601030013');
    expect(a.faltantes).toContain('monto');
    expect(a.cantidad).toBe(3);
  });

  it('no confunde el teléfono con el DNI ni con el monto', () => {
    const a = analizarMensaje('Sra Rosa Quispe dni 45288569 cel 961234567 1 caja 20 soles');
    expect(a.numDoc).toBe('45288569');
    expect(a.montoTotalCentimos).toBe(2000);
  });

  it('monto que no divide exacto se emite por el total', () => {
    const a = analizarMensaje('dni 44556677 3 paquetes 25 soles');
    expect(repartirMonto(a)).toEqual({ cantidad: 1, precioUnitarioCentimos: 2500 });
  });

  it('x2 como cantidad y s/ pegado', () => {
    const a = analizarMensaje('20131312955 flete km 86 x2 s/80');
    expect(a.tipoDoc).toBe('6');
    expect(a.cantidad).toBe(2);
    expect(a.montoTotalCentimos).toBe(8000);
    expect(repartirMonto(a)).toEqual({ cantidad: 2, precioUnitarioCentimos: 4000 });
  });

  it('fechas habladas: "del 3 de agosto al 5 de agosto" fija los días', () => {
    const a = analizarMensaje('alquiler de cuarto del 3 de agosto al 5 de agosto a 40 soles');
    expect(a.fechas).toBeTruthy();
    expect(a.fechas!.desde.endsWith('-08-03')).toBe(true);
    expect(a.fechas!.hasta.endsWith('-08-05')).toBe(true);
    expect(a.cantidad).toBe(2); // 2 noches
    // "a 40 soles" = por día -> total 80
    expect(a.montoPorUnidad).toBe(true);
    expect(a.montoTotalCentimos).toBe(8000);
    expect(repartirMonto(a)).toEqual({ cantidad: 2, precioUnitarioCentimos: 4000 });
    expect(a.descripcion).toMatch(/alquiler de cuarto del 03\/08 al 05\/08$/i);
  });

  it('"por día" también marca el monto como unitario', () => {
    const a = analizarMensaje('hospedaje 3 noches 40 soles por dia');
    expect(a.cantidad).toBe(3);
    expect(a.montoPorUnidad).toBe(true);
    expect(a.montoTotalCentimos).toBe(12000);
  });

  it('fechas abreviadas: "del 3 al 5 de agosto"', () => {
    const a = analizarMensaje('hospedaje del 3 al 5 de agosto');
    expect(a.fechas?.dias).toBe(2);
    expect(a.descripcion).toMatch(/hospedaje del 03\/08 al 05\/08/i);
  });

  it('cada línea es un producto distinto (caso real de ida y vuelta)', () => {
    const a = analizarMensaje('10729755520 3 pasajes pucallpa san alejandro a 50\n2 pasajes san alejandro pucallpa 50');
    expect(a.tipoDoc).toBe('6'); // RUC de persona natural (empieza en 10)
    expect(a.numDoc).toBe('10729755520');
    expect(a.items.length).toBe(2);
    const [ida, vuelta] = a.items;
    expect(ida!.descripcion).toMatch(/pasajes pucallpa san alejandro/i);
    expect(ida!.cantidad).toBe(3);
    expect(ida!.montoPorUnidad).toBe(true);
    expect(ida!.montoTotalCentimos).toBe(15000); // 3 × 50
    expect(vuelta!.descripcion).toMatch(/pasajes san alejandro pucallpa/i);
    expect(vuelta!.cantidad).toBe(2);
    // el "50" suelto hereda el precio por unidad del ítem hermano
    expect(vuelta!.montoPorUnidad).toBe(true);
    expect(vuelta!.montoTotalCentimos).toBe(10000); // 2 × 50
  });

  it('mensajes separados unidos: documento en uno, detalle en otro', () => {
    const a = analizarMensaje('ruc 20123456789\n\nhospedaje 2 noches habitacion doble 160.00');
    expect(a.numDoc).toBe('20123456789');
    expect(a.cantidad).toBe(2);
    expect(a.montoTotalCentimos).toBe(16000);
    expect(a.descripcion).toMatch(/hospedaje.*habitacion doble/i);
  });
});
