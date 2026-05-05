-- Migración: tabla `user_data_history` para guardar versiones anteriores del
-- estado del workspace. Pensada como red de seguridad para poder restaurar el
-- AppState a un punto anterior si alguna pisada accidental destruye datos.
--
-- Modelo igual que `user_data` (un blob JSONB por entrada), pero append-only:
-- cada entrada es una "foto" del estado en el momento del guardado, con un
-- contador de nodos/relaciones para previsualizar la versión sin parsear el
-- JSON completo desde el cliente.
--
-- El cliente decide cuándo materializar una entrada (ver
-- `src/lib/cloud-history.ts`): solo cuando ha pasado >5 minutos desde la
-- última entrada O cuando hay un cambio significativo en nodos/metas/
-- relaciones del árbol. Hardcap: el cliente borra entradas antiguas si pasan
-- de 50 por user_id. Si se prefiere centralizar el cap en el servidor, ver
-- el bloque opcional al final de este archivo.

CREATE TABLE IF NOT EXISTS user_data_history (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  state JSONB NOT NULL,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nodos_count INT,
  relaciones_count INT
);

CREATE INDEX IF NOT EXISTS idx_user_data_history_user_saved
  ON user_data_history(user_id, saved_at DESC);

ALTER TABLE user_data_history ENABLE ROW LEVEL SECURITY;

-- RLS: misma política que `user_data`. La fila la dueñe `user_id`.
-- Se permite también el workspace compartido `workspace-laguna` para que
-- la usuaria autenticada pueda leer y crear entradas de la fila común.
DROP POLICY IF EXISTS "user_data_history_select_own" ON user_data_history;
CREATE POLICY "user_data_history_select_own" ON user_data_history
  FOR SELECT USING (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

DROP POLICY IF EXISTS "user_data_history_insert_own" ON user_data_history;
CREATE POLICY "user_data_history_insert_own" ON user_data_history
  FOR INSERT WITH CHECK (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

-- Permitir DELETE para que el cliente pueda aplicar hardcap.
DROP POLICY IF EXISTS "user_data_history_delete_own" ON user_data_history;
CREATE POLICY "user_data_history_delete_own" ON user_data_history
  FOR DELETE USING (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

-- Opcional: cap en servidor. Si se prefiere, descomentar el siguiente trigger
-- para que cada INSERT borre automáticamente las entradas que sobrepasan 50.
--
-- CREATE OR REPLACE FUNCTION user_data_history_cap_50()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   DELETE FROM user_data_history
--    WHERE id IN (
--      SELECT id FROM user_data_history
--       WHERE user_id = NEW.user_id
--       ORDER BY saved_at DESC
--       OFFSET 50
--    );
--   RETURN NEW;
-- END; $$ LANGUAGE plpgsql;
--
-- DROP TRIGGER IF EXISTS user_data_history_cap_50_trg ON user_data_history;
-- CREATE TRIGGER user_data_history_cap_50_trg
--   AFTER INSERT ON user_data_history
--   FOR EACH ROW EXECUTE FUNCTION user_data_history_cap_50();
