# Auditoría de paths de pérdida silenciosa en `merge.ts` y `store.ts`

Fecha: 2026-05-06

Contexto: la usuaria perdió metas anuales por rama/hoja del árbol 2026,
hojas creadas como "PSI Mapas" y vínculos MAPA→Árbol entre entregables
y hojas. El presente documento es **solo el reporte**: los fixes se
acometerán en otra conversación. La salvaguarda anti-pisada (Bloque 3
de este mismo PR) y el backup versionado en cloud (Bloque 4) son
parches de contención que NO sustituyen los fixes que aquí se
identifican; son la red de seguridad mientras se aplican.

Convenciones de este reporte:

- "primer arg / segundo arg" se refiere a `mergeStates(a, b)`.
- "gana X en empate" se refiere a `unionById` con dos elementos del
  mismo `id`: la implementación devuelve `existing` (es decir, el
  primer arg) cuando no hay `prefer`. Ver `merge.ts:203-212`.

---

## 1. `unionById` para `arbol.nodos` no usa `prefer` y no es un merge profundo

**Archivo:** `src/lib/merge.ts:548`
**Severidad:** alta. Path principal de pérdida de `metaValor`,
`metaPorTrimestre` y `entregableIds`.

```ts
arbol: {
  nodos: unionById(
    a.arbol?.nodos ?? EMPTY_ARBOL.nodos,
    b.arbol?.nodos ?? EMPTY_ARBOL.nodos,
  ).filter((n) => !delArbolNodos.has(n.id)),
  // ...
}
```

`unionById` sin `prefer` devuelve el primer elemento que ve para cada
id. Para nodos del árbol esto significa que, en cualquier llamada a
`mergeStates`, el lado "ganador" se decide por orden de argumentos y
**el ganador aporta TODOS los campos del nodo** (no se mezclan
`metaValor`, `metaPorTrimestre`, `entregableIds`, `proyectoIds`,
`nombre`, `descripcion`).

### Escenario reproducible (la pérdida que probablemente sufrió la usuaria)

1. Cliente A abre la app y carga del cloud el nodo `aulas` con
   `metaValor=92100`, `metaPorTrimestre={Q1:23000,...}`,
   `entregableIds=["e1","e2","e3"]`.
2. Cliente A modifica algo NO relacionado con el nodo (ej. un paso de
   un entregable distinto). El reducer crea un nuevo `state` con un
   array `arbol.nodos` que sigue conteniendo `aulas` con todos sus
   campos.
3. Cliente B (otra pestaña / móvil) edita el nodo `aulas` y sube a
   cloud `metaValor=92100`, `entregableIds=["e1","e2","e3","e4"]`.
4. Cliente A hace flush y `saveStateCloud` ejecuta:
   `mergeStates(stateToSave_A, cloudState_B)`.
5. En empate, `unionById` se queda con `aulas` del primer arg
   (`stateToSave_A`). El nuevo `entregableIds` que añadió el cliente B
   se pierde.

**Variante peor:** si entre el load inicial y el save el cliente A
abrió el formulario de edición del nodo y por cualquier glitch
(reducer roto, drag-and-drop fallido, deserialización defectuosa) el
nodo quedó con `metaValor=undefined`, ese `undefined` viaja al cloud y
sobrescribe el `92100` de cloud. Se pierde la meta anual entera.

### Llamadas afectadas (orden de argumentos)

| Sitio | Llamada | Quién gana en empate |
|---|---|---|
| `store.ts:349` (saveStateCloud) | `mergeStates(stateToSave, cloudState)` | local (sospechoso) |
| `store.ts:367` (saveStateCloud, fallback snapshot) | `mergeStates(stateToSave, fallback)` | local (sospechoso) |
| `store.ts:499` (flushPendingCloudSave) | `mergeStates(merged, _lastCloudSnapshot)` | local |
| `context.tsx:207` (init con local existente) | `mergeStates(cloudResult.data, localState)` | cloud |
| `context.tsx:288` (polling pullAndMerge) | `mergeStates(stateRef.current, result.data)` | local |

La inconsistencia de orden entre `init` y `pullAndMerge` ya es
sospechosa por sí misma: los nodos del árbol pueden quedar con valores
distintos según si el evento que disparó la sincronización fue
"abrir pestaña" o "polling".

### Propuesta de fix (a aplicar en otro PR)

- Añadir un `prefer` específico para `NodoArbol` que haga merge
  profundo:
  - `metaValor`: el más reciente por `actualizado` (campo que ya existe
    en `NodoArbol`); si solo uno define `actualizado`, gana ese; si
    ninguno, conservar el que sea `Number.isFinite && > 0`.
  - `metaPorTrimestre`: unión por trimestre, ganando el del nodo con
    `actualizado` más reciente (LWW por trimestre, no por nodo entero).
  - `entregableIds` / `proyectoIds`: unión de IDs, sin tombstone implícito
    (ver §3 para una propuesta complementaria con tombstones).
  - `nombre`, `descripcion`, `notaAnioAnterior`, `tipo`, `cadencia`,
    `relacionConPadre`, `parentId`, `orden`: gana el `actualizado` más
    reciente.
- Como salvaguarda extra, conservar el campo del lado que NO sea
  `undefined` cuando uno de los dos lo tiene definido, en vez de
  sobrescribir con `undefined`.

---

## 2. `arbol.registros` también usa `unionById` sin `prefer`

**Archivo:** `src/lib/merge.ts:550-551`
**Severidad:** media. Pierde ediciones de Real concurrentes.

```ts
registros: unionById(
  a.arbol?.registros ?? EMPTY_ARBOL.registros,
  b.arbol?.registros ?? EMPTY_ARBOL.registros,
).filter((r) => !delArbolRegs.has(r.id) && !delArbolNodos.has(r.nodoId)),
```

Mismo problema que §1. Si dos clientes editan un mismo registro
(`valor`, `unidades`, `nota`, `estadoRealidad`), gana el del primer
arg, se pierde el del segundo.

`RegistroNodo` ya tiene un campo `actualizado: string`, así que el fix
es directo: `prefer: (x, y) => x.actualizado >= y.actualizado ? x : y`.

---

## 3. No hay tombstones para `entregableIds`/`proyectoIds` dentro de un nodo

**Archivos:** `src/lib/merge.ts:548`, `src/lib/types.ts:585-602`
(estructura `DeletedTombstones`).
**Severidad:** alta. Path silencioso de pérdida de vínculos MAPA→Árbol.

`entregableIds` es un `string[]` plano dentro del nodo. Cuando dos
clientes lo editan, el merge actual (junto al fix propuesto en §1 de
unión de IDs) provoca que **un borrado de vínculo en un cliente sea
indistinguible de un cliente antiguo que aún no lo había añadido**.
Resultado: si A borra `e1` del nodo `aulas` y B nunca había sincronizado
ese borrado, la unión de IDs vuelve a meter `e1` en `entregableIds`.

Reciprocamente, si simplemente reemplazamos por el más reciente (sin
unión), el cliente que añade `e2` mientras el otro borraba `e1` pierde
su `e2`.

### Propuesta de fix

- Añadir tombstones explícitos para vínculos:
  ```ts
  deleted.entregableHojaLinks?: string[]; // claves "${nodoId}::${entregableId}"
  ```
- En el reducer, cuando se quita un vínculo MAPA→Árbol, registrar el
  tombstone.
- En el merge, hacer unión de IDs y restar los tombstones, igual que
  ya se hace para `implicados` (`merge.ts:526-532`).

---

## 4. Tombstones de árbol-nodo borran en cascada todos los registros

**Archivo:** `src/lib/merge.ts:551`
**Severidad:** media. No se ha disparado por la usuaria (no parece que
borrara nodos), pero queda como riesgo amplificador.

```ts
.filter((r) => !delArbolRegs.has(r.id) && !delArbolNodos.has(r.nodoId))
```

Si por cualquier path entra accidentalmente un id en
`deleted.arbolNodos` (p.ej. un reducer mal escrito, una migración
defectuosa, un import roto), **TODOS los registros de ese nodo
desaparecen sin posibilidad de recuperación** (no se trasladan a otro
nodo ni quedan como huérfanos).

### Propuesta de fix

- Considerar separar el filtrado: un nodo borrado quita el nodo, pero
  los registros pueden conservarse "huérfanos" para que la usuaria
  pueda decidir reasignarlos. Alternativamente, añadir un log
  `console.warn` cuando un tombstone esté eliminando >N registros, y
  que la salvaguarda del Bloque 3 lo trate también como pérdida
  sospechosa.

---

## 5. `runMigrations` puede vaciar `arbol` si `state.arbol` viene `undefined`

**Archivo:** `src/lib/migrations.ts:271-276` (v21
`migrateArbolDriversV21`).
**Severidad:** baja-media. Improbable en steady state, pero
catastrófico si se da.

```ts
if (changed || !state.arbol) {
  dispatch({
    type: "REPLACE_ARBOL_STATE",
    arbol: { ...base, configs: configs.sort((a, b) => a.anio - b.anio) },
  });
}
```

`base = state.arbol ?? EMPTY_ARBOL`. Si `state.arbol` es `undefined`
(p.ej. cuota local llena que descartó el campo, JSON corrupto, fetch
parcial), el dispatch reemplaza el árbol entero con
`{ nodos: [], registros: [], configs: [...defaults] }` y el siguiente
save sube ese árbol vacío al cloud. Sin la salvaguarda del Bloque 3,
esto destruye todo el árbol del workspace.

`REPLACE_ARBOL_STATE` se usa también en v22, v23, v24, v25 y v26
(siempre con `base = state.arbol ?? EMPTY_ARBOL`). Las otras versiones
solo dispatchean si `changed`, así que no se disparan con árbol vacío,
pero v21 sí se dispara en ese caso (por el `|| !state.arbol`).

### Propuesta de fix

- Si `state.arbol === undefined`, NO ejecutar las migraciones que
  hacen `REPLACE_ARBOL_STATE` y abortar `runMigrations` con un
  `console.error` claro: el cliente debe re-cargar de cloud antes de
  migrar nada.
- Más a fondo: cualquier path que pueda producir `state.arbol ===
  undefined` debe rellenarlo con `EMPTY_ARBOL` ANTES de guardar y NO
  dispatchear `REPLACE_ARBOL_STATE` con un cuerpo vacío.
- Añadir un test: `runMigrations(stateConArbolUndefined)` no debe
  producir un dispatch que dejaría `arbol.nodos = []` si el cloud
  tenía nodos.

`migrateDedupSesionesEntregable` (v27) dispatch
`REPLACE_ENTREGABLE_SESIONES` solo, NO toca nodos: descartado como
fuente del bug actual.

No existe ningún `RESET_DATA` / `RESET_ARBOL` / `case "RESET"` en el
reducer (verificado con `rg`); descartado como fuente.

---

## 6. `saveStateCloud` solo aborta si `proyectos+entregables+pasos` están vacíos

**Archivo:** `src/lib/store.ts:318-321`
**Severidad:** media. Específico al árbol.

```ts
if (state.proyectos.length === 0 && state.entregables.length === 0 && state.pasos.length === 0) {
  console.warn("[saveStateCloud] blocked: refusing to save empty state over cloud");
  return;
}
```

El árbol está completamente fuera de este check. Si el árbol queda
vaciado por cualquiera de los paths anteriores pero los entregables
siguen poblados, el save SE EJECUTA. La salvaguarda añadida en el
Bloque 3 (`detectarPerdidaInjustificada`) cubre este caso, pero:

- La salvaguarda solo se compara contra `_lastCloudSnapshot` cuando
  está disponible. Si la app arranca y el snapshot todavía no se ha
  hidratado de localStorage o cloud, la salvaguarda no se dispara y
  el upsert pasa.
- El check inicial de "empty state" debería extenderse al árbol:

  ```ts
  if (state.arbol?.nodos?.length === 0 && _lastCloudSnapshot?.arbol?.nodos?.length > 0) {
    console.warn("[saveStateCloud] blocked: refusing to wipe arbol over cloud");
    return;
  }
  ```

  Esto es complementario a la salvaguarda del Bloque 3 (no la
  reemplaza), porque cubre el caso "arranco con `_lastCloudSnapshot`
  vacío y el state actual también vacío" donde la salvaguarda se rinde.

---

## 7. `flushPendingCloudSave` (beforeunload) hace upsert SIN re-leer cloud

**Archivo:** `src/lib/store.ts:497-505`
**Severidad:** media-alta. Ventana de pisada en cierre de pestaña.

```ts
let merged = state;
if (_lastCloudSnapshot) {
  merged = mergeStates(merged, _lastCloudSnapshot);
  merged = mergeCloudReviews(merged, _lastCloudSnapshot);
}
const payload = JSON.stringify({
  user_id: userId,
  state: merged,
  updated_at: new Date().toISOString(),
});
// fetch keepalive ...
```

A diferencia del path normal de `saveStateCloud`, este flush NO hace
GET previo del cloud actual: solo merge contra el snapshot guardado en
memoria/localStorage. Si entre el último GET y el flush, otro cliente
subió cambios que NO están en el snapshot, el flush los pisa.

Es deliberado (estamos en `beforeunload` y no podemos esperar a un
GET), pero amplifica el riesgo cuando dos clientes están abiertos a la
vez. La salvaguarda del Bloque 3 está aplicada SOLO en el path de
`saveStateCloud`, NO en `flushPendingCloudSave`. Esto es un agujero a
cerrar.

### Propuesta de fix

- Aplicar también `detectarPerdidaInjustificada` en
  `flushPendingCloudSave` antes del fetch keepalive.
- Considerar abandonar el fetch si la salvaguarda dispara, persistiendo
  en localStorage el estado pendiente como `aborted-save` (mismo patrón
  que el Bloque 3).

---

## 8. `mergeCloudReviews` solo cubre 4 entidades, NO los nodos del árbol

**Archivo:** `src/lib/store.ts:396-424`
**Severidad:** baja, pero relevante.

```ts
merged.proyectos = mergeReviewField(local.proyectos, cloud.proyectos ?? []);
merged.resultados = mergeReviewField(local.resultados, cloud.resultados ?? []);
merged.entregables = mergeReviewField(local.entregables, cloud.entregables ?? []);
merged.plantillas = mergeReviewField(local.plantillas, cloud.plantillas ?? []);
```

Si en el futuro se añaden notas o reviews a `NodoArbol`, este post-merge
no las recogerá. Hoy `NodoArbol` no tiene `review`/`notas`, así que es
solo un riesgo prospectivo, pero conviene anotarlo: cualquier campo
nuevo de tipo "review/nota" en el árbol necesita su propio merge
explícito.

---

## Resumen ejecutivo

Los 4 paths probables de la pérdida que sufrió la usuaria, ordenados
por probabilidad:

1. **`unionById` sin merge profundo en nodos del árbol (§1).** Cualquier
   save donde el cliente local tenga campos `undefined` o vacíos en un
   nodo y el cloud los tenga rellenos, sobrescribe cloud. Probable
   causa raíz de la pérdida de `metaValor` y `entregableIds`.
2. **No hay tombstones para `entregableIds` (§3).** El borrado o el
   reorden de vínculos MAPA→Árbol se pisa entre clientes.
3. **`saveStateCloud` no protege el árbol (§6).** El check de "empty
   state" no incluye el árbol; el Bloque 3 añadido en este PR cubre el
   hueco operativamente, pero el check primario debería extenderse.
4. **`flushPendingCloudSave` no re-lee cloud ni aplica salvaguarda
   (§7).** Ventana de pisada en cierre de pestaña.

Los hallazgos §2, §4, §5 y §8 son riesgos secundarios que deberían
incluirse en el mismo PR de fixes para no dejar agujeros.

**Prioridad de fix recomendada (orden):** §1 → §3 → §7 → §6 → §2 → §5 → §4 → §8.
