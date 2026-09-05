-- Almacén de archivos (XML firmados y CDR) dentro de D1.
-- Se usa en lugar de R2 para mantener el costo en cero sin exigir tarjeta:
-- cada archivo pesa pocos KB y D1 gratuito ofrece 5 GB.

CREATE TABLE archivos (
  clave TEXT PRIMARY KEY,        -- ej. 'xml/RUC-01-F001-1.xml' | 'cdr/R-....zip'
  contenido TEXT NOT NULL,       -- XML en texto plano; ZIP del CDR en base64
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
