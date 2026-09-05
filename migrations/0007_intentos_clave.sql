-- Freno a la fuerza bruta del PIN: 5 claves erradas en 15 minutos bloquean
-- la IP por 15 minutos. La fila se reutiliza por IP.
CREATE TABLE intentos_clave (
  ip TEXT PRIMARY KEY,
  fallos INTEGER NOT NULL DEFAULT 0,
  ultimo TEXT NOT NULL,
  bloqueado_hasta TEXT
);
