import { describe, expect, it } from 'vitest';
import { calcularTotales, fmt } from '../src/sunat/calculo.js';
import { montoEnLetras } from '../src/sunat/montoEnLetras.js';
import { boletaExonerada, facturaGravada } from './fixtures/comprobantes.js';

describe('cálculo de importes', () => {
  it('desagrega el IGV de un precio con impuesto incluido', () => {
    const { lineas, totales } = calcularTotales(facturaGravada());
    expect(fmt(lineas[0]!.valorVenta)).toBe('500.00'); // 590 / 1.18
    expect(fmt(lineas[0]!.igv)).toBe('90.00');
    expect(fmt(totales.total)).toBe('590.00');
    expect(totales.gravado + totales.igv).toBe(totales.total);
  });

  it('las operaciones exoneradas no llevan IGV', () => {
    const { totales } = calcularTotales(boletaExonerada());
    expect(totales.igv).toBe(0);
    expect(fmt(totales.exonerado)).toBe('65.00'); // 2x25 + 15
    expect(fmt(totales.total)).toBe('65.00');
  });

  it('cantidades decimales redondean a céntimos', () => {
    const cpe = facturaGravada();
    cpe.items[0]!.cantidad = 1.5;
    cpe.items[0]!.precioUnitarioConImpuesto = 1000; // 15.00 bruto
    const { lineas } = calcularTotales(cpe);
    expect(lineas[0]!.valorVenta + lineas[0]!.igv).toBe(1500);
  });
});

describe('monto en letras (leyenda 1000)', () => {
  const casos: Array<[number, string]> = [
    [59000, 'SON QUINIENTOS NOVENTA CON 00/100 SOLES'],
    [11850, 'SON CIENTO DIECIOCHO CON 50/100 SOLES'],
    [100, 'SON UNO CON 00/100 SOLES'],
    [2100, 'SON VEINTIUNO CON 00/100 SOLES'],
    [3305, 'SON TREINTA Y TRES CON 05/100 SOLES'],
    [10000000, 'SON CIEN MIL CON 00/100 SOLES'],
    [100000000, 'SON UN MILLON CON 00/100 SOLES'],
    [123456789, 'SON UN MILLON DOSCIENTOS TREINTA Y CUATRO MIL QUINIENTOS SESENTA Y SIETE CON 89/100 SOLES'],
    [0, 'SON CERO CON 00/100 SOLES'],
  ];
  for (const [centimos, esperado] of casos) {
    it(`${centimos} => ${esperado}`, () => {
      expect(montoEnLetras(centimos, 'PEN')).toBe(esperado);
    });
  }
});
