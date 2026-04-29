"use client";

/** Pasos concretos para montar un árbol tipo facturación anual → semanal → líneas → palancas → acciones. */
export function ArbolGuiaReceta() {
  return (
    <details className="mb-6 rounded-lg border border-border bg-surface/30 text-sm">
      <summary className="cursor-pointer list-none px-4 py-3 font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        Cómo montar tu ejemplo (530k al año → 10k semana → líneas de negocio → acciones)
        <span className="ml-2 text-xs font-normal text-muted"> — guía paso a paso</span>
      </summary>
      <div className="space-y-4 border-t border-border px-4 pb-4 pt-3 text-muted">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <strong className="text-foreground">Raíz del año:</strong> pulsa «Objetivo raíz». Pon nombre (ej. Facturación anual),{" "}
            <strong>530000</strong> y <strong>€</strong>. En «más opciones» deja «una vez al año». Guarda.{" "}
            <em>No verás «respecto a la meta de arriba»: no hay nada encima.</em>
          </li>
          <li>
            <strong className="text-foreground">Objetivo semanal total:</strong> en esa meta, «+ Aquí». Nombre ej. «Facturación semanal»,{" "}
            <strong>10000</strong> €, cada semana. En más opciones elige <strong>«suma con lo de arriba»</strong> si quieres que cuadre con los 530k repartidos en semanas activas (la app avisa si los números no encajan).
          </li>
          <li>
            <strong className="text-foreground">Tres ramas de ingreso (7k + 2,5k + 0,5k):</strong> tres veces «+ Aquí» en el nivel que prefieras (suelen ser hijos del semanal o de la raíz). Pon 7000, 2500 y 500 € según tu caso, cadencia semanal, relación <strong>suma</strong> donde quieras cuadre.
          </li>
          <li>
            <strong className="text-foreground">Dos palancas (retener / captar):</strong> debajo de cada rama o al mismo nivel, «+ Aquí», tipo «hábito o palanca», cadencia semanal, relación «va relacionado» si no suman € directamente.
          </li>
          <li>
            <strong className="text-foreground">Acciones semanales:</strong> bajo cada palanca, hijos con números (directos, emails, posts…) — cadencia <strong>semana</strong> y vista arriba en <strong>Semana</strong> para apuntar cada lunes–domingo.
          </li>
          <li>
            <strong className="text-foreground">Extras:</strong> mismos pasos para colaboraciones/afiliados o charlas; puedes añadir ramas nuevas cuando quieras.
          </li>
        </ol>
        <p className="text-xs">
          Vista <strong className="text-foreground">Semana</strong> para registrar lo que haces cada semana; <strong className="text-foreground">Mes</strong> o{" "}
          <strong className="text-foreground">Trimestre</strong> para ver cómo van sumando los registros.
        </p>
      </div>
    </details>
  );
}
