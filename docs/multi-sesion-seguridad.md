# Trabajar segura con la app abierta en varios sitios a la vez

_Última revisión: 2026-05-06_

Esta nota es para ti, Gabi (y para Beltrán cuando lo necesite). No es
técnica: explica qué pasa cuando abres la app en dos ordenadores —o
tú en el portátil y Beltrán en el suyo— y qué tienes que mirar para
estar tranquila.

## ¿Qué cambió?

Hasta ahora, si abrías la app en dos ordenadores y editabas el árbol
en uno mientras el otro estaba abierto, podías perder cosas: una meta
anual, una hoja recién creada, o un vínculo entre un entregable del
MAPA y una hoja del Árbol. Esta semana hemos blindado eso:

- Cuando dos sesiones tocan el mismo nodo del árbol, la app se queda
  con la versión más reciente _por nodo_, no descarta el lado
  "perdedor" entero. Antes, si tu portátil tenía una meta vacía y la
  nube tenía 92 100 €, podías sobrescribir el 92 100 con vacío sin
  enterarte.
- Cuando rompes un vínculo MAPA→Árbol (quitar un entregable de una
  hoja), queda anotado con timestamp. Si otro ordenador todavía
  tenía el vínculo en su copia, ya no lo "resucita" al sincronizar.
- La salvaguarda anti-pisada bloquea cualquier guardado que dejaría
  el árbol vacío sin justificación, incluso al cerrar la pestaña.

## ¿Cómo sé que hay otra sesión activa?

Cuando otra sesión (otro ordenador, móvil, otra pestaña) acaba de
guardar algo, te aparece arriba a la derecha una pastilla discreta:

> **↻ Cambios remotos disponibles**

Si la pulsas, la app sincroniza enseguida con la nube y trae lo nuevo.
Si estabas tecleando en algún campo, la sincronización **espera a que
sueltes el campo** para no borrarte lo que estás escribiendo.

Si no la pulsas, la sincronización ocurre igualmente cada pocos
segundos en segundo plano (Realtime); el chip es solo para que sepas
que algo se movió antes de meterte en faena.

## Recomendaciones cuando trabajas con la app abierta en dos sitios

1. **Antes de empezar una sesión seria de edición** —sobre todo si
   vas a tocar el árbol o a re-vincular MAPA↔Árbol— pulsa el botón
   **Backup** de la barra lateral. Te descarga un JSON con todo el
   estado actual (proyectos, entregables, árbol, configs). Si algo
   sale mal, ese JSON es tu red de seguridad.
2. **Si ves la pastilla "Cambios remotos disponibles"**, pulsa antes
   de empezar. Así parteis de lo último, no de una copia antigua.
3. **Si notas algo raro** (una rama del árbol que ya no tiene meta,
   una hoja que falta, un entregable que parece desvinculado), abre
   el menú **Historial** de la barra lateral antes de seguir
   editando. Te muestra las últimas versiones del estado guardadas
   en la nube; puedes restaurar cualquiera de ellas.
4. **Si la app abre una alerta roja "Guardado bloqueado para
   proteger tus datos"**, es buena señal: la app ha detectado una
   posible pérdida y ha cancelado el guardado. Sigue las
   instrucciones (descarga el backup) y avísanos para revisar el
   archivo `laguna-time-app-aborted-save-*` (queda en el almacén
   local del navegador). El guardado quedó cancelado: ningún cambio
   tuyo se perdió en cloud, simplemente no se subió.

## ¿Cuándo NO te avisa la pastilla?

- Si haces tú misma el guardado (no es "remoto", es tu propio cliente).
- Si Realtime cae (sin Internet, conexión rota): la app sigue haciendo
  un sync periódico cada 15 segundos, pero el chip "remoto" no
  aparecerá hasta que vuelva Realtime. Mientras tanto, los datos se
  siguen sincronizando.

## En resumen

- Sí puedes tener la app abierta en dos ordenadores. **Tus datos del
  árbol y los vínculos MAPA↔Árbol no se pierden silenciosamente.**
- Si te aparece **↻ Cambios remotos disponibles**, púlsalo antes de
  ponerte a editar.
- Pulsa **Backup** antes de sesiones de edición serias del árbol.
- Si dudas de algo, **Historial** es tu mejor amigo: ver versiones
  anteriores y volver a una de ellas.
