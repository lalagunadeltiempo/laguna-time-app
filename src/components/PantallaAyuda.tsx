"use client";

import { useState } from "react";

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
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

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function PantallaAyuda() {
  return (
    <div className="space-y-4 pb-20">
      <h2 className="text-lg font-bold text-foreground">Guía de uso</h2>
      <p className="text-sm text-muted">
        Cómo funciona la app y cómo sacarle el máximo partido.
      </p>

      <Section title="¿Para qué sirve Laguna del Tiempo?" defaultOpen>
        <p>
          Laguna del Tiempo es una app de planificación pensada para <strong>trabajo enfocado</strong>:
          ayudar a una persona o equipo pequeño a decidir <em>qué hacer hoy, esta semana y este mes</em>
          respetando su capacidad real, sus tiempos de descanso y sus prioridades.
        </p>
        <p>
          A diferencia de un gestor de tareas clásico, aquí cada cosa que haces vive dentro de un{" "}
          <strong>proyecto con un objetivo y una fecha límite</strong>, y la app calcula
          si <em>te da el tiempo</em> con tu capacidad declarada.
        </p>
        <ul className="ml-4 list-disc space-y-1 text-[13px]">
          <li><strong>Trabajas en sesiones</strong>, no en jornadas completas.</li>
          <li>La app <strong>asigna fechas y esfuerzo automáticamente</strong> según unas proporciones simples.</li>
          <li>Marcas tus <strong>vacaciones y festivos</strong> para que no se planifique sobre ellos.</li>
          <li>Las decisiones manuales <strong>siempre mandan</strong>; la app solo avisa si rompes algo.</li>
        </ul>
      </Section>

      <Section title="El modelo: Ámbito → Área → Proyecto → Resultado → Entregable → Paso" defaultOpen>
        <p>Toda la app gira alrededor de esta jerarquía. Cada nivel responde a una pregunta:</p>
        <ul className="ml-4 list-disc space-y-1 text-[13px]">
          <li><strong>Ámbito</strong>: ¿personal o empresa?</li>
          <li><strong>Área</strong>: ¿en qué dimensión de tu vida o negocio? (físico, emocional, mental, espiritual / financiera, operativa, comercial, administrativa).</li>
          <li><strong>Proyecto</strong>: ¿cuál es el resultado mayor que persigues, con fecha de inicio y deadline?</li>
          <li><strong>Resultado</strong>: ¿qué hito intermedio del proyecto?</li>
          <li><strong>Entregable</strong>: ¿qué pieza concreta de trabajo produce ese resultado?</li>
          <li><strong>Paso</strong>: ¿qué micro-acción ejecutas para sacar el entregable?</li>
        </ul>
        <Tip>Cuando empiezas el primer paso de cualquier entregable, el proyecto pasa automáticamente a estado <strong>En marcha</strong>.</Tip>
      </Section>

      <Section title="Sesiones, no jornadas">
        <p>
          La unidad de trabajo en la app es la <strong>sesión</strong>: un bloque enfocado de
          aproximadamente <strong>1 a 3 horas</strong>. No una jornada completa de 8h.
        </p>
        <p>Esto importa porque:</p>
        <ul className="ml-4 list-disc space-y-1 text-[13px]">
          <li>En un día normal puedes hacer <strong>2-5 sesiones</strong>.</li>
          <li>Un entregable de &quot;3 sesiones&quot; significa 3 bloques de 1-3h, no 3 días enteros.</li>
          <li>Tu capacidad diaria (sesiones/día) la declaras tú en <strong>Equipo</strong>.</li>
        </ul>
        <Tip>Si trabajas en varios proyectos a la vez, reparte tu capacidad mentalmente. Ej: 4 sesiones/día y 4 proyectos activos = 1 sesión/día por proyecto.</Tip>
      </Section>

      <Section title="Auto-plan: cómo la app calcula fechas y esfuerzo">
        <p>Para que no tengas que estimar todo a mano, la app aplica dos proporciones automáticas:</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Mini label="Resultado" value="1 semana / 3 entregables" />
          <Mini label="Entregable" value="1 sesión / 5 pasos" />
        </div>
        <p className="text-[13px]">
          Ejemplo: un resultado con <strong>7 entregables</strong> ocupa ⌈7÷3⌉ = <strong>3 semanas</strong>.
          Un entregable con <strong>12 pasos</strong> son ⌈12÷5⌉ = <strong>3 sesiones</strong>.
        </p>
        <p className="text-[13px]">
          Estas proporciones son <strong>configurables</strong> desde la sección <strong>Equipo → Configuración de planificación</strong>.
          Empieza con los valores por defecto (3 y 5) y ajústalos cuando en la revisión semanal veas que la realidad es otra.
        </p>
        <Tip>
          Cuando añades, quitas o mueves un paso/entregable/resultado, la app <strong>recalcula automáticamente</strong> las
          fechas y sesiones sugeridas. No tienes que hacer nada.
        </Tip>
      </Section>

      <Section title="Override manual: tus decisiones mandan">
        <p>
          La auto-asignación es un punto de partida. Tú puedes <strong>fijar manualmente</strong>:
        </p>
        <ul className="ml-4 list-disc space-y-1 text-[13px]">
          <li>Fechas de inicio y fin de un resultado o entregable.</li>
          <li>Sesiones estimadas concretas de un entregable (sustituye la estimación automática).</li>
        </ul>
        <p>
          Cuando fijas algo a mano, la app lo respeta y reorganiza el resto alrededor.
          Si tu decisión <strong>rompe el plan</strong> (no cabe en el deadline, se solapa con vacaciones, etc.)
          aparece un aviso con <strong>tres opciones</strong>: extender deadline, subir capacidad o recortar.
        </p>
        <Tip>Para volver al cálculo automático en un entregable, deja vacío el campo de sesiones; verás &quot;auto&quot; en su lugar.</Tip>
      </Section>

      <Section title="Días no disponibles (vacaciones y festivos)">
        <p>
          Cada miembro del equipo declara sus <strong>días no disponibles</strong> desde la sección
          <strong> Equipo</strong> (haz clic en tu nombre y abajo verás el panel).
        </p>
        <p>La app:</p>
        <ul className="ml-4 list-disc space-y-1 text-[13px]">
          <li>Salta esos días al distribuir resultados automáticamente.</li>
          <li>Los excluye al calcular tu capacidad real entre hoy y el deadline.</li>
          <li>Te avisa si has fijado manualmente algo que cae dentro de un periodo no disponible.</li>
        </ul>
        <Tip>Marca también los días laborables de la semana en ese mismo panel (por defecto L-V).</Tip>
      </Section>

      <Section title="El semáforo de ritmo: A tiempo, Ajustado, Crítico, No llegas">
        <p>
          Cada proyecto y resultado muestra un <strong>indicador de ritmo</strong> que compara
          el trabajo pendiente con tu capacidad real entre hoy y el deadline.
        </p>
        <ul className="ml-4 list-disc space-y-1 text-[13px]">
          <li><strong>A tiempo</strong>: necesitas hasta el 60% de tu capacidad diaria.</li>
          <li><strong>Ajustado</strong>: entre 60% y 90%. Es manejable pero con poco margen.</li>
          <li><strong>Crítico</strong>: entre 90% y 100%. Apenas hay colchón para imprevistos.</li>
          <li><strong>No llegas</strong>: necesitarías más del 100% (no es viable sin acción).</li>
        </ul>
        <p className="text-[13px]">
          Pasa el ratón sobre el indicador para ver el <strong>desglose por persona</strong>
          (cuántas sesiones le tocan a cada responsable y a qué ritmo necesita ir).
        </p>
      </Section>

      <Section title="Cuando no cabe: extender, subir capacidad o recortar">
        <p>Si el plan no cabe, en el detalle del proyecto aparece un banner rojo con tres alternativas:</p>
        <ol className="ml-4 list-decimal space-y-1 text-[13px]">
          <li><strong>Extender deadline</strong>: la app calcula la fecha donde sí cabe y la propone.</li>
          <li><strong>Subir capacidad</strong>: ve a Equipo y aumenta tu &quot;sesiones/día&quot; (si es realista).</li>
          <li><strong>Recortar</strong>: quita resultados, entregables o pasos no imprescindibles.</li>
        </ol>
        <Tip>La opción recomendada es siempre la más honesta con la realidad. No subas tu capacidad si sabes que no la vas a tener.</Tip>
      </Section>

      <Section title="Cómo crear y estructurar un proyecto">
        <Step n={1}>
          <p>En la vista <strong>Mapa</strong>, abre el área correspondiente y pulsa <strong>+ Proyecto</strong>.</p>
        </Step>
        <Step n={2}>
          <p>Asigna nombre, fecha de inicio y deadline. Estos dos definen la <strong>ventana</strong> del proyecto.</p>
        </Step>
        <Step n={3}>
          <p>Crea <strong>Resultados</strong> (hitos intermedios). No hace falta darles fechas: las recibirán automáticamente del proyecto y del auto-plan.</p>
        </Step>
        <Step n={4}>
          <p>Dentro de cada resultado, crea <strong>Entregables</strong>. Tampoco hace falta darles fechas ni estimar sesiones; la app lo hace por ti.</p>
        </Step>
        <Step n={5}>
          <p>Cuando vayas a ejecutar un entregable, abre la vista <strong>Hoy</strong> o <strong>Plan</strong> y dale a <strong>Iniciar</strong> al primer paso.</p>
        </Step>
      </Section>

      <Section title="Las cuatro vistas principales">
        <ul className="ml-4 list-disc space-y-1.5 text-[13px]">
          <li><strong>Hoy</strong>: pasos activos del día. Punto de partida cada mañana.</li>
          <li><strong>Plan</strong>: organización por día / semana / mes / trimestre. Aquí planificas.</li>
          <li><strong>Mapa</strong>: vista jerárquica completa de todos tus proyectos y áreas.</li>
          <li><strong>Equipo</strong>: miembros, capacidades, días no disponibles y configuración de planificación.</li>
        </ul>
      </Section>

      <Section title="SOPs: procesos recurrentes">
        <p>Los SOPs son <strong>plantillas de procesos</strong> que se repiten (diarios, semanales, mensuales...).</p>
        <Step n={1}>
          <p>En <strong>Mapa</strong>, baja a la sección de SOPs de cada área y pulsa <strong>+ SOP</strong>.</p>
        </Step>
        <Step n={2}>
          <p>Define los pasos de la plantilla. Cada paso puede tener notas y URLs de referencia.</p>
        </Step>
        <Step n={3}>
          <p>Configura la <strong>frecuencia</strong> y vincula el SOP a un <strong>proyecto y resultado destino</strong>.</p>
        </Step>
        <Step n={4}>
          <p>Pulsa el icono de calendario en el SOP para <strong>materializarlo en lote</strong>: la app crea todos los entregables de una vez.</p>
        </Step>
        <Tip>Los SOPs no aparecen en la vista Hoy. Aparecen como entregables planificables una vez los materializas.</Tip>
      </Section>

      <Section title="Mover cosas entre niveles">
        <p>Puedes <strong>reasignar</strong> un paso a otro entregable, un entregable a otro resultado, o un resultado a otro proyecto.</p>
        <Step n={1}>
          <p>Busca el botón <strong>Mover</strong> (flecha →) junto al elemento.</p>
        </Step>
        <Step n={2}>
          <p>Selecciona la nueva ubicación paso a paso (área → proyecto → resultado → entregable según corresponda).</p>
        </Step>
        <Step n={3}>
          <p>El elemento conserva su historial y notas.</p>
        </Step>
      </Section>

      <Section title="Resumen visual del flujo">
        <ol className="ml-4 list-decimal space-y-1 text-[13px]">
          <li>Defines un <strong>proyecto</strong> con deadline.</li>
          <li>Lo descompones en <strong>resultados</strong> y <strong>entregables</strong>.</li>
          <li>La app <strong>auto-plan</strong> distribuye fechas y sesiones.</li>
          <li>El <strong>semáforo de ritmo</strong> te dice si te da el tiempo.</li>
          <li>Si no cabe, eliges entre <strong>extender / subir capacidad / recortar</strong>.</li>
          <li>Ejecutas paso a paso desde <strong>Hoy</strong>.</li>
          <li>En la <strong>revisión semanal</strong> ajustas las proporciones si la realidad pide.</li>
        </ol>
      </Section>
    </div>
  );
}
