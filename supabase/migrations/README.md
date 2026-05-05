# Migraciones SQL para Supabase

Este proyecto persiste el `AppState` como un único blob JSONB en
`user_data.state` (una fila por workspace). La mayor parte de las
"migraciones" se hacen en cliente (`src/lib/migrations.ts`).

Los archivos `.sql` de esta carpeta son cambios de esquema que SÍ
requieren ejecutarse en el SQL Editor de Supabase. No hay un mecanismo
de aplicación automática; cada migración debe aplicarse a mano.

## Cómo aplicar una migración

1. Abrir el panel de Supabase del proyecto.
2. Ir a **SQL Editor → New query**.
3. Copiar el contenido del fichero `.sql` correspondiente.
4. Ejecutar.

## Migraciones existentes

- `2026_04_26_entregables_chips_planning.sql` — Documentación. Sin
  cambios de esquema (la planificación por chips se migra en cliente).
- `2026_05_06_state_history.sql` — **Aplicar manualmente.** Crea la
  tabla `user_data_history` que almacena versiones del AppState para
  poder restaurarlas. El cliente (`src/lib/cloud-history.ts`) inserta
  entradas tras cada save significativo; si la tabla no existe, los
  inserts fallan en silencio y la app sigue funcionando con normalidad
  (solo se pierde la posibilidad de restaurar versiones anteriores).
