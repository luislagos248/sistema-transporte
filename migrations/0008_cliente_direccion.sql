-- Dirección del cliente (opcional): se llena sola con la consulta RUC/DNI y
-- sale en el ticket y en el XML. SUNAT no la exige, pero da formalidad.
ALTER TABLE comprobantes ADD COLUMN cliente_direccion TEXT;
