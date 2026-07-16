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
import { listarCatalogos } from "@/features/catalogos/data/catalogos";

export const metadata: Metadata = { title: "Catálogos" };

export default async function CatalogosPage() {
  const catalogos = await listarCatalogos();
  const total = catalogos.reduce((n, c) => n + c.entradas.length, 0);

  if (total === 0) {
    return (
      <>
        <PageHeader
          title="Catálogos"
          description="Listas de referencia del nomenclador."
        />
        <EmptyState
          title="Sin catálogos definidos"
          description="Los catálogos se cargan junto con las fichas del nomenclador."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Catálogos"
        description="Listas de referencia del nomenclador, curadas desde las 210 fichas de 2016."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {catalogos.map((c) => (
          <Card key={c.clave}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{c.titulo}</CardTitle>
                  <CardDescription className="mt-1">{c.descripcion}</CardDescription>
                </div>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {c.entradas.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-1.5">
                {c.entradas.map((e) => (
                  <li key={e.code}>
                    <span
                      className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${
                        e.activo
                          ? "border-border bg-secondary text-secondary-foreground"
                          : "border-dashed border-border text-muted-foreground line-through"
                      }`}
                      title={
                        e.activo
                          ? undefined
                          : "Desactivado: no aparece en el nomenclador de 2016"
                      }
                    >
                      {e.name}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
