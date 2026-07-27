"use client";

import type { ReparticionPlana } from "@/features/reparticiones/data/reparticiones";

export type OpcionReparticion = ReparticionPlana;

/**
 * Elección de las reparticiones a cargo de un usuario.
 *
 * Lista con casillas en vez de un `<select multiple>`: son casi 70 opciones y el
 * multiselect nativo obliga a hacer ctrl+click, que nadie descubre solo. Cada
 * unidad va sangrada según su nivel para que se lea el organigrama.
 */
export function SelectorReparticiones({
  opciones,
  seleccionadas,
  onChange,
}: {
  opciones: OpcionReparticion[];
  seleccionadas: string[];
  onChange: (ids: string[]) => void;
}) {
  function alternar(id: string) {
    onChange(
      seleccionadas.includes(id)
        ? seleccionadas.filter((s) => s !== id)
        : [...seleccionadas, id],
    );
  }

  return (
    <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-2">
      {opciones.map((r) => (
        <label
          key={r.id}
          style={{ paddingLeft: `${0.5 + r.nivel * 1.25}rem` }}
          className={`flex cursor-pointer items-center gap-2 rounded py-1 pr-2 text-sm hover:bg-secondary/50 ${
            r.nivel === 0
              ? "font-medium text-foreground"
              : r.nivel === 1
                ? "text-foreground"
                : "text-muted-foreground"
          }`}
        >
          <input
            type="checkbox"
            checked={seleccionadas.includes(r.id)}
            onChange={() => alternar(r.id)}
            className="h-3.5 w-3.5 shrink-0 accent-[var(--primary)]"
          />
          <span className="truncate">{r.nombre}</span>
        </label>
      ))}
    </div>
  );
}
