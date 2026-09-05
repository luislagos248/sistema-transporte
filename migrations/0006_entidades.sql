-- Caché de consultas RUC/DNI: cada documento consultado queda guardado,
-- así los clientes frecuentes no vuelven a golpear la API externa.

CREATE TABLE entidades (
  num_doc TEXT PRIMARY KEY,
  tipo_doc TEXT NOT NULL,        -- '1' DNI, '6' RUC
  nombre TEXT NOT NULL,
  direccion TEXT,
  fuente TEXT NOT NULL,          -- 'apis.net.pe' | 'manual'
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
