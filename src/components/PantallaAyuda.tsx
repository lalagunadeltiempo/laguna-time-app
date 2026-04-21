"use client";

import { useState } from "react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface/80"
      >
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <div className="border-t border-border/60 px-4 py-3 text-sm text-foreground/80 leading-relaxed space-y-3">{children}</div>}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
        {n}
      </span>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-blue-50 px-3 py-2 text-[13px] text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
      <span className="shrink-0 font-bold">Tip:</span>
      <span>{children}</span>
    </div>
  );
}

export function PantallaAyuda() {
  return (
    <div className="space-y-4 pb-20">
      <h2 className="text-lg font-bold text-foreground">Guía de uso</h2>
      <p className="text-sm text-muted">
        Instrucciones paso a paso para sacar el máximo partido a la app.
      </p>

      <Section title="1. Estructurar un proyecto">
        <p>Los proyectos se organizan en una jerarquía: <strong>Proyecto → Resultado → Entregable → Paso</strong>.</p>
        <Step n={1}>
          <p>Abre la vista <strong>Mapa</strong> y pulsa el botón <strong>+ Proyecto</strong> en la sección del área correspondiente.</p>
        </Step>
        <Step n={2}>
          <p>Dale un nombre y asigna fechas de inicio y fin. El proyecto se crea en estado <strong>Plan</strong>.</p>
        </Step>
        <Step n={3}>
          <p>Dentro del proyecto, pulsa <strong>+ Resultado</strong> para crear un resultado. Un resultado agrupa entregables que persiguen un mismo objetivo.</p>
        </Step>
        <Step n={4}>
          <p>Dentro de cada resultado, pulsa <strong>+ Entregable</strong>. Cada entregable es una pieza concreta de trabajo con días estimados.</p>
        </Step>
        <Step n={5}>
          <p>Para asignar pasos a un entregable, ábrelo y añade los pasos necesarios. Al iniciar el primer paso de cualquier entregable del proyecto, el estado del proyecto cambia automáticamente a <strong>En marcha</strong>.</p>
        </Step>
        <Tip>Usa los campos de días estimados directamente en la vista Mapa para planificar la duración de cada entregable.</Tip>
      </Section>

      <Section title="2. Estados de proyecto">
        <p>Un proyecto puede estar en uno de estos estados:</p>
        <ul className="ml-4 list-disc space-y-1">
          <li><strong>Plan</strong>: Proyecto definido pero sin trabajo iniciado.</li>
          <li><strong>En marcha</strong>: Al menos un paso de un entregable ha sido iniciado. La transición es automática.</li>
          <li><strong>Pausado</strong>: Puedes pausar un proyecto manualmente desde el selector de estado.</li>
          <li><strong>Completado</strong>: Todos los entregables están marcados como &quot;hecho&quot;, o lo marcas manualmente.</li>
        </ul>
        <Tip>El estado de un resultado se calcula automáticamente a partir de sus entregables. Si todos los entregables están &quot;hecho&quot;, el resultado se marca como completado.</Tip>
      </Section>

      <Section title="3. Usar SOPs (Procesos recurrentes)">
        <p>Los SOPs son plantillas de procesos que se repiten (diarios, semanales, mensuales, etc.).</p>
        <Step n={1}>
          <p>En la vista <strong>Mapa</strong>, busca la sección de SOPs al final de cada área. Pulsa <strong>+ SOP</strong> para crear uno nuevo.</p>
        </Step>
        <Step n={2}>
          <p>Define los pasos del SOP. Cada paso puede tener notas y URLs de referencia.</p>
        </Step>
        <Step n={3}>
          <p>Configura la <strong>frecuencia</strong> (diario, semanal, mensual, etc.) y la programación (días de la semana, hora).</p>
        </Step>
        <Step n={4}>
          <p>Vincula el SOP a un <strong>proyecto y resultado destino</strong> usando la sección &quot;Destino&quot;. Esto es imprescindible para la materialización en lote.</p>
        </Step>
        <Tip>Si intentas programar un SOP que tiene proyecto pero no resultado, la app te guiará para vincular uno antes de continuar.</Tip>
      </Section>

      <Section title="4. Materializar SOPs en lote">
        <p>Materializar un SOP significa crear entregables concretos a partir de la plantilla para un periodo determinado.</p>
        <Step n={1}>
          <p>Asegúrate de que el SOP tiene <strong>proyecto y resultado</strong> vinculados (ver sección anterior).</p>
        </Step>
        <Step n={2}>
          <p>Pulsa el icono de <strong>calendario</strong> en el SOP y selecciona un periodo.</p>
        </Step>
        <Step n={3}>
          <p>Se abrirá el <strong>diálogo de lote</strong> donde puedes elegir cuántas repeticiones crear, editar el nombre de cada entregable y ajustar las fechas.</p>
        </Step>
        <Step n={4}>
          <p>Los nombres se generan automáticamente con el formato &quot;Nombre del SOP - Periodo&quot; (ej: &quot;Ciclo de Pagos - Abril 2026&quot;).</p>
        </Step>
        <Step n={5}>
          <p>Confirma para crear todos los entregables de una vez. Cada uno incluirá todos los pasos del SOP como pasos pendientes.</p>
        </Step>
        <Tip>Los SOPs diarios se materializan como entregables semanales o mensuales para evitar saturar la planificación.</Tip>
      </Section>

      <Section title="5. Planificación semanal">
        <p>La vista <strong>Plan → Semana</strong> te permite organizar el trabajo día a día.</p>
        <Step n={1}>
          <p>Navega a <strong>Plan</strong> y selecciona la semana que quieres planificar.</p>
        </Step>
        <Step n={2}>
          <p>Verás los entregables asignados a cada día. Puedes mover entregables entre días usando el menú contextual (mantén pulsado o haz clic derecho).</p>
        </Step>
        <Step n={3}>
          <p>Desde el menú contextual también puedes: cambiar responsable, marcar como hecho, o abrir el proyecto para planificación detallada.</p>
        </Step>
        <Tip>Asigna entregables a días desde la vista Mapa usando el icono de calendario en cada entregable.</Tip>
      </Section>

      <Section title="6. Planificación mensual">
        <p>La vista <strong>Plan → Mes</strong> muestra un resumen del mes con Gantt y proyectos activos.</p>
        <Step n={1}>
          <p>Selecciona el mes en la parte superior. Solo se muestran proyectos con trabajo en ese mes (no completados ni pausados).</p>
        </Step>
        <Step n={2}>
          <p>El <strong>Gantt multi-proyecto</strong> te muestra todos los proyectos con sus barras de progreso. Puedes expandirlo para ver resultados y entregables.</p>
        </Step>
        <Step n={3}>
          <p>Usa los presets de rango (Mes, Trimestre, Todo) o define un rango personalizado para ajustar la escala del Gantt.</p>
        </Step>
        <Step n={4}>
          <p>Debajo del Gantt, cada proyecto muestra un resumen con ritmo de avance, entregables pendientes y carga de trabajo.</p>
        </Step>
      </Section>

      <Section title="7. Ejecución del trabajo diario">
        <p>La vista <strong>Hoy</strong> es tu punto de partida cada día.</p>
        <Step n={1}>
          <p>Revisa los pasos activos del día. Si hay SOPs programados para hoy, aparecerán como sugerencias.</p>
        </Step>
        <Step n={2}>
          <p>Para iniciar un paso, ábrelo y pulsa <strong>Iniciar</strong>. Se registra la hora de inicio.</p>
        </Step>
        <Step n={3}>
          <p>Al terminar, pulsa <strong>Completar</strong>. Se registra la hora de fin y se activa el siguiente paso.</p>
        </Step>
        <Step n={4}>
          <p>Cuando completas el último paso de un entregable, éste se marca como <strong>hecho</strong> automáticamente.</p>
        </Step>
        <Tip>Si un entregable viene de un SOP y has modificado los pasos, al marcarlo como hecho la app te preguntará si quieres actualizar el SOP con los cambios.</Tip>
      </Section>

      <Section title="8. Marcar entregables como completados">
        <p>Puedes marcar entregables como &quot;hecho&quot; directamente desde la vista <strong>Mapa</strong>.</p>
        <Step n={1}>
          <p>Expande el proyecto y resultado hasta ver los entregables.</p>
        </Step>
        <Step n={2}>
          <p>Marca el checkbox junto al nombre del entregable. El estado cambiará a <strong>hecho</strong>.</p>
        </Step>
        <Step n={3}>
          <p>Si necesitas desmarcar, vuelve a pulsar el checkbox. El estado volverá a <strong>en_curso</strong> o <strong>pendiente</strong>.</p>
        </Step>
        <Tip>Esto es útil para registrar trabajo histórico que ya completaste antes de empezar a usar la app.</Tip>
      </Section>

      <Section title="9. Gantt multi-proyecto">
        <p>El Gantt es una herramienta visual para ver el avance de todos tus proyectos.</p>
        <Step n={1}>
          <p>Accede al Gantt desde <strong>Plan → Mes</strong> (aparece automáticamente) o desde <strong>Plan → Trimestre</strong>.</p>
        </Step>
        <Step n={2}>
          <p>Usa los controles de rango: <strong>Mes</strong>, <strong>Trimestre</strong>, <strong>Todo</strong> o <strong>Rango personalizado</strong> para ajustar el periodo visible.</p>
        </Step>
        <Step n={3}>
          <p>Expande cada proyecto para ver resultados y entregables con sus barras de progreso coloreadas por estado.</p>
        </Step>
        <Step n={4}>
          <p>La línea vertical indica el día de <strong>hoy</strong>. Las barras a la izquierda son trabajo pasado, las de la derecha son futuro.</p>
        </Step>
      </Section>
    </div>
  );
}
