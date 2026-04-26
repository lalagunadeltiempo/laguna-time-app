-- Migración planificación por chips: nuevos campos canónicos en `entregables`.
--
-- IMPORTANTE: en este proyecto el `AppState` se persiste como JSONB en
-- `user_data.state` (un único blob por workspace). Por tanto NO hay tablas
-- normalizadas para `entregables`, y los nuevos campos se añaden vía la
-- migración soft del cliente (`src/lib/migrations.ts`,
-- `migrateEntregableSemanasActivas` v18) sin necesidad de tocar el esquema.
--
-- Este archivo se incluye para documentación y para el día en que el modelo
-- se normalice en tablas SQL: ahí estos serían los `ALTER TABLE` requeridos.
--
-- Si en el futuro se crea una tabla `entregables` normalizada, ejecutar:

-- ALTER TABLE entregables
--   ADD COLUMN IF NOT EXISTS semanas_activas JSONB NOT NULL DEFAULT '[]'::jsonb,
--   ADD COLUMN IF NOT EXISTS fecha_compromiso DATE NULL;
--
-- COMMENT ON COLUMN entregables.semanas_activas IS
--   'Lista de claves de lunes ISO (YYYY-MM-DD) en las que el entregable está
--    planificado activo. Es la fuente de verdad para programación semanal.';
-- COMMENT ON COLUMN entregables.fecha_compromiso IS
--   'Fecha-evento informativa (taller, reunión, entrega). NO condiciona la
--    programación; sólo es un dato visible para el equipo.';

-- Mientras tanto, no hay nada que ejecutar en Supabase: la migración del
-- estado se aplica en cliente al cargar (CURRENT_MIGRATION = 18).
SELECT 1;
