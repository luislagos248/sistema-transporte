-- Resúmenes diarios de boletas (SummaryDocuments RC).

CREATE TABLE resumenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha_referencia TEXT NOT NULL,      -- fecha de emisión de las boletas
  fecha_generacion TEXT NOT NULL,
  numero_dia INTEGER NOT NULL,         -- N de RC-YYYYMMDD-N
  nombre TEXT NOT NULL,                -- RUC-RC-YYYYMMDD-N
  ticket TEXT,                         -- ticket de sendSummary
  -- pendiente -> enviado (con ticket) -> aceptado | rechazado
  estado TEXT NOT NULL DEFAULT 'pendiente',
  cdr_codigo TEXT,
  cdr_descripcion TEXT,
  xml_key TEXT NOT NULL,
  cdr_key TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (fecha_generacion, numero_dia)
);

-- Boleta informada por qué resumen (NULL = aún no incluida en ninguno).
ALTER TABLE comprobantes ADD COLUMN resumen_id INTEGER REFERENCES resumenes(id);
