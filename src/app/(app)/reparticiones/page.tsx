import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
        description={`Organigrama de la Municipalidad: ${secretarias.length} secretarías y ${totalDirecciones} direcciones. Datos provisionales del POA 2026, hasta la integración con Civitas.`}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {secretarias.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{s.nombre}</CardTitle>
                  <CardDescription className="mt-1 font-mono text-xs">
                    {s.code}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {s.direcciones.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
