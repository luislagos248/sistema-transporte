-- Notas de crédito (tipo 07).

-- Series propias de las notas: empiezan con la misma letra que la serie del
-- comprobante que modifican (F -> facturas, B -> boletas).
INSERT INTO series (serie, tipo, rubro) VALUES
  ('FC01', '07', 'transporte'),
  ('BC01', '07', 'transporte'),
  ('FC02', '07', 'hospedaje'),
  ('BC02', '07', 'hospedaje');

-- La NC apunta al comprobante que modifica; el comprobante anulado apunta a
-- su NC. El motivo es del catálogo 09.
ALTER TABLE comprobantes ADD COLUMN referencia_id INTEGER REFERENCES comprobantes(id);
ALTER TABLE comprobantes ADD COLUMN motivo_nota TEXT;
ALTER TABLE comprobantes ADD COLUMN anulado_por INTEGER REFERENCES comprobantes(id);
