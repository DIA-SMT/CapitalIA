"use client";

export type OpcionReparticion = {
  id: string;
  nombre: string;
  esSecretaria: boolean;
};

/**
 * Elección de las reparticiones a cargo de un usuario.
 *
 * Lista con casillas en vez de un `<select multiple>`: son 62 opciones y el
 * multiselect nativo obliga a hacer ctrl+click, que nadie descubre solo. Las
 * direcciones van indentadas bajo su secretaría para que se lea el organigrama.
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
          className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-secondary/50 ${
            r.esSecretaria ? "font-medium text-foreground" : "pl-6 text-muted-foreground"
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
