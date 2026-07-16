import type { Metadata } from "next";
import { CircleAlert, FileText } from "lucide-react";

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
import { listarDocumentos } from "@/features/documentos/data/documentos";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentosPage() {
  const documentos = await listarDocumentos();

  if (documentos.length === 0) {
    return (
      <>
        <PageHeader
          title="Documentos"
          description="Fuentes documentales del nomenclador."
        />
        <EmptyState
          title="Sin documentos cargados"
          description="Acá se registran los documentos de los que provienen las fichas."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Documentos"
        description="Fuentes documentales del nomenclador y su vínculo con cada ficha."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {documentos.map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <FileText className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <CardTitle className="text-base">{d.titulo}</CardTitle>
                    <CardDescription className="mt-1 font-mono text-xs">
                      {d.code}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {d.fichas} fichas
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {d.descripcion && (
                <p className="text-sm text-muted-foreground">{d.descripcion}</p>
              )}
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Páginas del PDF
                  </dt>
                  <dd className="mt-0.5 tabular-nums">{d.totalPaginas ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    Páginas impresas
                  </dt>
                  <dd className="mt-0.5 tabular-nums">
                    {d.paginaDesde != null ? `${d.paginaDesde} – ${d.paginaHasta}` : "—"}
                  </dd>
                </div>
              </dl>
              {d.pendientes > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700">
                  <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {d.pendientes} fichas sin verificar contra el original
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        Los PDF originales no se almacenan en el sistema: pesan 287 MB y 149 MB. Cada
        ficha guarda su documento y su página, que es lo que permite volver al original
        para verificarla.
      </p>
    </>
  );
}
