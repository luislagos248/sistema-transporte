-- Esquema inicial del sistema de facturación (Cloudflare D1 / SQLite).
-- Montos en céntimos (enteros).

CREATE TABLE series (
  serie TEXT PRIMARY KEY,              -- 'F001', 'B001', ...
  tipo TEXT NOT NULL,                  -- '01' factura, '03' boleta
  rubro TEXT NOT NULL,                 -- 'transporte' | 'hospedaje'
  ultimo_correlativo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE comprobantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,                  -- '01' | '03'
  serie TEXT NOT NULL REFERENCES series(serie),
  correlativo INTEGER NOT NULL,
  fecha_emision TEXT NOT NULL,         -- YYYY-MM-DD (hora local Perú)
  hora_emision TEXT NOT NULL,          -- HH:MM:SS
  moneda TEXT NOT NULL DEFAULT 'PEN',
  cliente_tipo_doc TEXT NOT NULL,      -- catálogo 06
  cliente_num_doc TEXT NOT NULL,
  cliente_nombre TEXT NOT NULL,
  total_gravado INTEGER NOT NULL DEFAULT 0,
  total_exonerado INTEGER NOT NULL DEFAULT 0,
  total_inafecto INTEGER NOT NULL DEFAULT 0,
  total_igv INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  leyenda TEXT NOT NULL,
  hash_firma TEXT,                     -- DigestValue para el QR del ticket
  -- Ciclo de vida ante SUNAT:
  --   pendiente  = emitido y firmado, aún no informado (o reintentando)
  --   aceptado   = CDR con código 0 archivado
  --   rechazado  = CDR de rechazo: requiere corrección (nota de crédito / reemisión)
  estado TEXT NOT NULL DEFAULT 'pendiente',
  cdr_codigo TEXT,
  cdr_descripcion TEXT,
  intentos_envio INTEGER NOT NULL DEFAULT 0,
  xml_key TEXT NOT NULL,               -- clave del XML firmado en R2
  cdr_key TEXT,                        -- clave del ZIP del CDR en R2
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (tipo, serie, correlativo)
);

CREATE INDEX idx_comprobantes_estado ON comprobantes (estado);
CREATE INDEX idx_comprobantes_fecha ON comprobantes (fecha_emision);

CREATE TABLE comprobante_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comprobante_id INTEGER NOT NULL REFERENCES comprobantes(id),
  descripcion TEXT NOT NULL,
  cantidad REAL NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'ZZ',
  precio_unitario INTEGER NOT NULL,    -- céntimos, con impuesto si gravado
  afectacion TEXT NOT NULL             -- '10' gravado, '20' exonerado, '30' inafecto
);

CREATE INDEX idx_items_comprobante ON comprobante_items (comprobante_id);

-- Series iniciales (se ajustan al dar de alta las series reales en SOL).
INSERT INTO series (serie, tipo, rubro) VALUES
  ('F001', '01', 'transporte'),
  ('B001', '03', 'transporte'),
  ('F002', '01', 'hospedaje'),
  ('B002', '03', 'hospedaje');
