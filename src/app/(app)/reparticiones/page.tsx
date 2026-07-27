import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import {
  listarReparticiones,
  type NodoReparticion,
} from "@/features/reparticiones/data/reparticiones";

export const metadata: Metadata = { title: "Reparticiones" };

/**
 * Una unidad sin dependencias. Como línea, salvo que sea una secretaría sin nada
 * colgando (Contaduría General): ahí va con tarjeta, para que no quede suelta
 * entre las demás secretarías.
 */
function Hoja({ nodo, raiz }: { nodo: NodoReparticion; raiz: boolean }) {
  if (raiz) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
        {/* Espacio del chevron, para que el nombre alinee con el de las demás. */}
        <span className="h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="font-medium text-foreground">{nodo.nombre}</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {nodo.code}
          </span>
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          Sin dependencias
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2 py-1 text-sm">
      <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
        {nodo.code}
      </span>
      <span
        className={
          nodo.activa ? "text-foreground" : "text-muted-foreground line-through"
        }
      >
        {nodo.nombre}
      </span>
    </div>
  );
}

/**
 * Una unidad con dependencias. Es un `<details>` nativo: se abre y cierra sin JS.
 * Las secretarías (nivel 0) arrancan cerradas para que el organigrama entre en una
 * pantalla; las subsecretarías, abiertas, así al desplegar una secretaría se ve
 * todo lo que cuelga de ella de una vez.
 */
function Rama({ nodo, nivel }: { nodo: NodoReparticion; nivel: number }) {
  const raiz = nivel === 0;
  if (nodo.hijos.length === 0) return <Hoja nodo={nodo} raiz={raiz} />;

  return (
    <details
      className={`group ${raiz ? "rounded-xl border border-border bg-card" : "mt-1"}`}
      open={!raiz}
    >
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden ${
          raiz
            ? "rounded-xl px-4 py-3 transition-colors hover:bg-secondary/40"
            : "rounded-md px-2 py-1 hover:bg-secondary/40"
        }`}
      >
        <ChevronRight
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <span
            className={
              raiz ? "font-medium text-foreground" : "text-sm font-medium text-foreground"
            }
          >
            {nodo.nombre}
          </span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {nodo.code}
          </span>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {nodo.totalDescendientes}
        </Badge>
      </summary>

      <div
        className={
          raiz
            ? "border-t border-border px-4 py-3"
            : "ml-2 border-l border-border pl-4"
        }
      >
        {nodo.hijos.map((h) => (
          <Rama key={h.id} nodo={h} nivel={nivel + 1} />
        ))}
      </div>
    </details>
  );
}

export default async function ReparticionesPage() {
  const secretarias = await listarReparticiones();

  const totales = secretarias.reduce(
    (acc, s) => acc + s.totalDescendientes,
    0,
  );

  if (secretarias.length === 0) {
    return (
      <>
        <PageHeader
          title="Reparticiones"
          description="Estructura organizativa de la Municipalidad."
        />
        <EmptyState
          title="Sin reparticiones cargadas"
          description="Cuando se cargue el organigrama, las secretarías y direcciones aparecerán acá."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reparticiones"
        description={`Organigrama de la Municipalidad: ${secretarias.length} secretarías y ${totales} unidades dependientes. Tocá una secretaría para desplegarla. Datos provisionales del POA 2026.`}
      />

      <div className="space-y-2">
        {secretarias.map((s) => (
          <Rama key={s.id} nodo={s} nivel={0} />
        ))}
      </div>
    </>
  );
}
