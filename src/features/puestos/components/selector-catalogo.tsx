"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";

import type { Opcion } from "../data/opciones";
import { Input } from "@/components/ui/input";

export type ItemSeleccionado = { id: string; raw_text?: string };

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Selección múltiple sobre un catálogo, con búsqueda.
 *
 * Los catálogos son grandes (90 riesgos, 64 competencias), así que un <select
 * multiple> no sirve. Lo elegido se muestra como etiquetas arriba y el resto se
 * filtra escribiendo.
 *
 * `raw_text` (el literal de la ficha) se conserva al editar: si el ítem ya
 * estaba, se mantiene; si se agrega uno nuevo, queda vacío y la ficha muestra el
 * nombre canónico.
 */
export function SelectorCatalogo({
  etiqueta,
  descripcion,
  opciones,
  valor,
  onChange,
}: {
  etiqueta: string;
  descripcion?: string;
  opciones: Opcion[];
  valor: ItemSeleccionado[];
  onChange: (v: ItemSeleccionado[]) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const elegidos = useMemo(() => new Set(valor.map((v) => v.id)), [valor]);
  const porId = useMemo(() => new Map(opciones.map((o) => [o.id, o])), [opciones]);

  const filtradas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return opciones;
    return opciones.filter((o) => normalizar(o.nombre).includes(q));
  }, [opciones, busqueda]);

  function alternar(id: string) {
    if (elegidos.has(id)) {
      onChange(valor.filter((v) => v.id !== id));
    } else {
      onChange([...valor, { id }]);
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {etiqueta}
        {valor.length > 0 && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {valor.length} seleccionado{valor.length === 1 ? "" : "s"}
          </span>
        )}
      </legend>
      {descripcion && <p className="text-xs text-muted-foreground">{descripcion}</p>}

      {valor.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {valor.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                onClick={() => alternar(v.id)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground hover:bg-secondary/70"
                aria-label={`Quitar ${porId.get(v.id)?.nombre ?? ""}`}
                // El literal de la ficha original, si difiere del canónico.
                title={v.raw_text && v.raw_text !== porId.get(v.id)?.nombre ? `Ficha original: “${v.raw_text}”` : undefined}
              >
                {porId.get(v.id)?.nombre ?? "—"}
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar en ${opciones.length} opciones…`}
          className="h-9 pl-8 text-sm"
          aria-label={`Buscar ${etiqueta.toLowerCase()}`}
        />
      </div>

      <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
        {filtradas.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Sin coincidencias
          </p>
        ) : (
          <ul>
            {filtradas.map((o) => {
              const activo = elegidos.has(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => alternar(o.id)}
                    aria-pressed={activo}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        activo ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}
                      aria-hidden
                    >
                      {activo && <Check className="h-3 w-3" />}
                    </span>
                    {o.nombre}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
