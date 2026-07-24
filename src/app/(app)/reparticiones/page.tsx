import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { listarReparticiones } from "@/features/reparticiones/data/reparticiones";

export const metadata: Metadata = { title: "Reparticiones" };

export default async function ReparticionesPage() {
  const secretarias = await listarReparticiones();
  const totalDirecciones = secretarias.reduce(
    (n, s) => n + s.direcciones.length,
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
        description={`Organigrama de la Municipalidad: ${secretarias.length} secretarías y ${totalDirecciones} direcciones. Tocá una secretaría para ver sus direcciones. Datos provisionales del POA 2026, hasta la integración con Civitas.`}
      />

      {/* Cada secretaría es un <details> nativo: se abre/cierra sin JS y arranca
          colapsado para que la página no ocupe tanto scroll. */}
      <div className="space-y-2">
        {secretarias.map((s) => (
          <details
            key={s.id}
            className="group rounded-xl border border-border bg-card"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">{s.nombre}</span>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {s.code}
                </span>
              </div>
              <Badge variant="secondary" className="shrink-0 tabular-nums">
                {s.direcciones.length}
              </Badge>
            </summary>

            <div className="border-t border-border px-4 py-3">
              {s.direcciones.length === 0 ? (
                <p className="text-sm italic text-muted-foreground">
                  Sin direcciones cargadas.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {s.direcciones.map((d) => (
                    <li key={d.id} className="flex items-baseline gap-2 text-sm">
                      <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                        {d.code}
                      </span>
                      <span
                        className={
                          d.activa
                            ? "text-foreground"
                            : "text-muted-foreground line-through"
                        }
                      >
                        {d.nombre}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
