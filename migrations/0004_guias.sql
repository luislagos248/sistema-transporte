-- Guías de Remisión Electrónicas - Transportista (tipo 31).

INSERT INTO series (serie, tipo, rubro) VALUES ('V001', '31', 'transporte');

CREATE TABLE guias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serie TEXT NOT NULL,
  correlativo INTEGER NOT NULL,
  fecha_emision TEXT NOT NULL,
  hora_emision TEXT NOT NULL,
  fecha_traslado TEXT NOT NULL,
  remitente_tipo_doc TEXT NOT NULL,
  remitente_num_doc TEXT NOT NULL,
  remitente_nombre TEXT NOT NULL,
  destinatario_tipo_doc TEXT NOT NULL,
  destinatario_num_doc TEXT NOT NULL,
  destinatario_nombre TEXT NOT NULL,
  placa TEXT NOT NULL,
  tarjeta_circulacion TEXT,
  conductor_num_doc TEXT NOT NULL,
  conductor_nombres TEXT NOT NULL,
  conductor_apellidos TEXT NOT NULL,
  conductor_licencia TEXT NOT NULL,
  partida_ubigeo TEXT NOT NULL,
  partida_direccion TEXT NOT NULL,
  llegada_ubigeo TEXT NOT NULL,
  llegada_direccion TEXT NOT NULL,
  peso_kg REAL NOT NULL,
  -- pendiente -> enviada (con ticket) -> aceptada | rechazada
  estado TEXT NOT NULL DEFAULT 'pendiente',
  ticket TEXT,
  cdr_codigo TEXT,
  cdr_descripcion TEXT,
  xml_key TEXT NOT NULL,
  cdr_key TEXT,
  comprobante_id INTEGER REFERENCES comprobantes(id), -- boleta/factura de la encomienda
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (serie, correlativo)
);

CREATE INDEX idx_guias_estado ON guias (estado);

CREATE TABLE guia_bienes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guia_id INTEGER NOT NULL REFERENCES guias(id),
  descripcion TEXT NOT NULL,
  cantidad REAL NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'NIU'
);

-- Flota y conductores frecuentes (para autocompletar en la app).
CREATE TABLE vehiculos (
  placa TEXT PRIMARY KEY,
  tarjeta_circulacion TEXT
);

CREATE TABLE conductores (
  num_doc TEXT PRIMARY KEY,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  licencia TEXT NOT NULL
);
