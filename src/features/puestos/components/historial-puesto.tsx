import { History } from "lucide-react";

import type { VersionHistorial } from "../data/puestos";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function recortar(s: string | null, n = 90) {
  if (!s) return null;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/**
 * Historial de versiones de un puesto: quién, cuándo, por qué y qué cambió.
 * Server Component: solo lee y muestra.
 */
export function HistorialPuesto({ versiones }: { versiones: VersionHistorial[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" aria-hidden />
          Historial
        </CardTitle>
        <CardDescription>
          {versiones.length === 1
            ? "Una versión. Cada corrección crea una nueva y conserva esta."
            : `${versiones.length} versiones. Ninguna se borra.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-0">
          {versiones.map((v, i) => (
            <li key={v.id} className="relative flex gap-3 pb-5 last:pb-0">
              {/* Línea de tiempo: se corta en el último ítem. */}
              {i < versiones.length - 1 && (
                <span
                  className="absolute left-[7px] top-4 h-full w-px bg-border"
                  aria-hidden
                />
              )}
              <span
                className={`relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                  v.estado === "current"
                    ? "border-primary bg-primary"
                    : "border-border bg-background"
                }`}
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">Versión {v.numero}</span>
                  {v.estado === "current" && (
                    <Badge variant="secondary" className="text-[10px]">
                      Vigente
                    </Badge>
                  )}
                  {v.esFuenteHistorica && (
                    <Badge variant="outline" className="text-[10px]">
                      Transcripta del PDF 2016
                    </Badge>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  {v.autor} · {FMT.format(new Date(v.fecha))}
                </p>

                {v.motivo && (
                  <p className="mt-1.5 text-sm text-foreground">{v.motivo}</p>
                )}
                {v.documentoRespaldo && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Respaldo: {v.documentoRespaldo}
                  </p>
                )}

                {v.cambios.length > 0 && (
                  <ul className="mt-2 space-y-1.5 rounded-lg border border-border bg-secondary/30 p-2.5">
                    {v.cambios.map((c) => (
                      <li key={c.campo} className="text-xs">
                        <span className="font-medium">{c.campo}</span>
                        <div className="mt-0.5 space-y-0.5 text-muted-foreground">
                          <p>
                            <span className="text-destructive">−</span>{" "}
                            {recortar(c.antes) ?? <em>vacío</em>}
                          </p>
                          <p>
                            <span className="text-emerald-600">+</span>{" "}
                            {recortar(c.despues) ?? <em>vacío</em>}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
