-- Migración: blindar el acceso a la fila del workspace.
--
-- PROBLEMA (severidad ALTA): las políticas anteriores permitían el acceso
-- con `... OR user_id = 'workspace-laguna'`. Esa condición es cierta para
-- CUALQUIER rol, incluido `anon`. Como la anon key viaja pública en el
-- bundle del navegador, cualquiera podía leer y escribir TODO el workspace
-- vía la API REST de Supabase SIN iniciar sesión.
--
-- SOLUCIÓN: exigir sesión iniciada (rol `authenticated`) para tocar la fila
-- compartida. Además, en el panel de Supabase hay que DESACTIVAR el alta de
-- usuarios nuevos (Authentication → Sign In / Providers → "Allow new users
-- to sign up" = OFF) para que solo Gabi y Beltrán tengan cuenta.
--
-- Aplicar a mano en: Supabase → SQL Editor → New query → pegar → Run.

-- ─────────────────────────────────────────────────────────────
-- Tabla principal: user_data
-- ─────────────────────────────────────────────────────────────
ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_data_select_own" ON user_data;
DROP POLICY IF EXISTS "user_data_insert_own" ON user_data;
DROP POLICY IF EXISTS "user_data_update_own" ON user_data;
DROP POLICY IF EXISTS "user_data_delete_own" ON user_data;
-- Nombres antiguos que pudieran existir en el proyecto desplegado:
DROP POLICY IF EXISTS "user_data_all_own" ON user_data;
DROP POLICY IF EXISTS "Enable read access for all users" ON user_data;

-- Solo usuarios autenticados pueden tocar su propia fila o la compartida.
CREATE POLICY "user_data_select" ON user_data
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

CREATE POLICY "user_data_insert" ON user_data
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

CREATE POLICY "user_data_update" ON user_data
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id OR user_id = 'workspace-laguna')
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

CREATE POLICY "user_data_delete" ON user_data
  FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

-- ─────────────────────────────────────────────────────────────
-- Tabla de historial: user_data_history
-- ─────────────────────────────────────────────────────────────
ALTER TABLE user_data_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_data_history_select_own" ON user_data_history;
DROP POLICY IF EXISTS "user_data_history_insert_own" ON user_data_history;
DROP POLICY IF EXISTS "user_data_history_delete_own" ON user_data_history;

CREATE POLICY "user_data_history_select_own" ON user_data_history
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

CREATE POLICY "user_data_history_insert_own" ON user_data_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

CREATE POLICY "user_data_history_delete_own" ON user_data_history
  FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id OR user_id = 'workspace-laguna');

-- ─────────────────────────────────────────────────────────────
-- (OPCIONAL, MÁS ESTRICTO) Restringir a UIDs concretos.
-- Si prefieres que SOLO las cuentas de Gabi y Beltrán accedan, sustituye
-- los `USING (...)` de arriba por esta forma (rellenando los UIDs reales,
-- que ves en Supabase → Authentication → Users):
--
--   USING (auth.uid() IN (
--     '00000000-0000-0000-0000-000000000000',  -- Gabi
--     '11111111-1111-1111-1111-111111111111'   -- Beltrán
--   ))
-- ─────────────────────────────────────────────────────────────
