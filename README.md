# Laguna del Tiempo (laguna-time-app)

Aplicación de planificación y seguimiento (proyectos, resultados,
entregables, pasos, árbol de objetivos, mapa y plan diario/semanal/
mensual/trimestral/anual). Es una app Next.js 100% cliente: todo el
estado vive en un único `AppState` que se guarda en el navegador
(localStorage) y se sincroniza con Supabase.

## Stack

- **Next.js 16** (App Router, Turbopack, React Compiler)
- **React 19**
- **Supabase** (`@supabase/ssr`) para auth y persistencia del estado
- **Tailwind CSS 4**
- **Vitest** para los tests

## Puesta en marcha

1. Instalar dependencias:

```bash
npm install
```

2. Crear `.env.local` en la raíz con las variables de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<tu-proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<tu-anon-key>
```

Sin estas variables la app arranca en modo local (sin nube), usando
solo el almacenamiento del navegador.

3. Arrancar en desarrollo:

```bash
npm run dev
```

Abrir http://localhost:3000.

## Scripts

- `npm run dev` — servidor de desarrollo.
- `npm run build` — build de producción.
- `npm run start` — sirve el build de producción.
- `npm run lint` — ESLint.
- `npm test` — tests (Vitest).

## Modelo de datos y sincronización

- El estado completo (`AppState`, ver `src/lib/types.ts`) se serializa
  como un único blob JSONB en Supabase, en la tabla `user_data`, en una
  fila compartida `user_id = "workspace-laguna"` (ver
  `src/lib/store.ts`). Gabi y Beltrán comparten ese mismo workspace.
- La sincronización entre sesiones (varias pestañas/dispositivos) se
  resuelve con un merge tipo CRDT en cliente (`src/lib/merge.ts`),
  salvaguardas anti-pisada (`src/lib/store-safeguard.ts`) y un historial
  de versiones restaurable (`src/lib/cloud-history.ts`).
- Las "migraciones" del estado se hacen en cliente
  (`src/lib/migrations.ts`). Ver `docs/` para notas de auditoría del
  merge y de trabajo multi-sesión.

## Autenticación

Login por email/contraseña con Supabase Auth. **No hay alta pública de
usuarios**: las cuentas se crean a mano desde el panel de Supabase.

## Migraciones SQL (Supabase)

Los cambios de esquema y de políticas RLS están en
`supabase/migrations/` y se aplican **a mano** desde el SQL Editor de
Supabase. Ver `supabase/migrations/README.md`. Importante aplicar
`2026_07_21_rls_lockdown.sql`, que blinda el acceso a los datos.
