import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, NoResultsState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  csvHref,
  FiltrosAuditoria,
  href,
  type ParamsAuditoria,
} from "@/features/auditoria/components/filtros-auditoria";
import {
  listarAuditoria,
  resumenAuditoria,
  type EventoAuditoria,
} from "@/features/auditoria/data/auditoria";

export const metadata: Metadata = { title: "Bitácora" };

const FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Color del punto según qué tan invasiva fue la acción. */
function tono(e: EventoAuditoria): string {
  if (e.accion === "delete" || e.descripcion.startsWith("Archivó")) {
    return "border-destructive bg-destructive";
  }
  if (e.esFichaOriginal) return "border-border bg-background";
  if (e.accion === "insert") return "border-emerald-600 bg-emerald-600";
  return "border-primary bg-primary";
}

function Dato({ valor, etiqueta }: { valor: number; etiqueta: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-2xl font-semibold tabular-nums text-foreground">{valor}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{etiqueta}</p>
      </CardContent>
    </Card>
  );
}

export default async function AuditoriaPage({
  searchParams,
}: {
  // Next 16: `searchParams` es una Promesa.
  searchParams: Promise<ParamsAuditoria>;
}) {
  const params = await searchParams;
  const pagina = Number(params.pagina ?? "1") || 1;

  const [datos, resumen] = await Promise.all([
    listarAuditoria({
      tabla: params.tabla,
      accion: params.accion,
      incluirSinSesion: params.inicial === "1",
      pagina,
    }),
    resumenAuditoria(),
  ]);

  const hayFiltros = Boolean(params.tabla || params.accion);

  return (
    <>
      <PageHeader
        title="Bitácora"
        description="Todo lo que se hizo sobre el nomenclador: quién, cuándo y por qué."
        action={
          datos.total > 0 ? (
            <Button variant="outline" render={<a href={csvHref(params)} />}>
              <Download className="h-4 w-4" aria-hidden />
              Descargar CSV
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato valor={resumen.cambios} etiqueta="Movimientos desde la app" />
        <Dato valor={resumen.puestosCreados} etiqueta="Puestos creados" />
        <Dato valor={resumen.puestosArchivados} etiqueta="Puestos archivados" />
        <Dato valor={resumen.versionesNuevas} etiqueta="Fichas corregidas" />
      </div>

      <FiltrosAuditoria params={params} />

      {datos.total === 0 ? (
        hayFiltros ? (
          <NoResultsState
            title="Sin movimientos para estos filtros"
            description="Probá quitar algún filtro."
            action={
              <Link
                href="/auditoria"
                className="text-sm underline underline-offset-4 hover:no-underline"
              >
                Ver todo
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="El nomenclador está igual que el papel de 2016"
            description="Nadie creó, editó ni archivó puestos desde la app todavía. Cuando lo hagan, cada movimiento va a quedar registrado acá con su autor."
            action={
              <Link
                href={href(params, { inicial: "1" })}
                className="text-sm underline underline-offset-4 hover:no-underline"
              >
                Ver la ingesta original
              </Link>
            }
          />
        )
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
            {datos.total} movimiento{datos.total === 1 ? "" : "s"}
            {datos.paginas > 1 && ` · página ${datos.pagina} de ${datos.paginas}`}
          </p>

          <ol className="space-y-0">
            {datos.eventos.map((e, i) => (
              <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < datos.eventos.length - 1 && (
                  <span
                    className="absolute left-[7px] top-4 h-full w-px bg-border"
                    aria-hidden
                  />
                )}
                <span
                  className={`relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${tono(e)}`}
                  aria-hidden
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-medium">{e.descripcion}</span>
                    {e.href ? (
                      <Link
                        href={e.href}
                        className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      >
                        {e.objeto}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">{e.objeto}</span>
                    )}
                    {e.esFichaOriginal ? (
                      <Badge variant="outline" className="text-[10px]">
                        Ficha original 2016
                      </Badge>
                    ) : (
                      e.sinSesion && (
                        <Badge variant="outline" className="text-[10px]">
                          Sin sesión
                        </Badge>
                      )
                    )}
                  </div>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.autor} · {FMT.format(new Date(e.fecha))}
                  </p>

                  {e.motivo && (
                    <p className="mt-1.5 rounded-lg border border-border bg-secondary/30 p-2 text-sm">
                      {e.motivo}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {datos.paginas > 1 && (
            <nav
              className="mt-6 flex items-center justify-between border-t border-border pt-4"
              aria-label="Paginación"
            >
              {datos.pagina > 1 ? (
                <Link
                  href={href(params, { pagina: String(datos.pagina - 1) })}
                  className="text-sm underline-offset-4 hover:underline"
                >
                  ← Más recientes
                </Link>
              ) : (
                <span />
              )}
              {datos.pagina < datos.paginas ? (
                <Link
                  href={href(params, { pagina: String(datos.pagina + 1) })}
                  className="text-sm underline-offset-4 hover:underline"
                >
                  Más antiguos →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Para ver qué cambió campo por campo en un puesto, entrá a su ficha: el
        historial compara cada versión con la anterior. Acá se registra el hecho, no
        el detalle. Los cambios hechos directamente en la base, fuera de la app,
        quedan registrados pero sin autor: aparecen en{" "}
        <Link
          href={href(params, { inicial: "1" })}
          className="underline underline-offset-4 hover:no-underline"
        >
          «incluir la ingesta y los scripts»
        </Link>
        .
      </p>
    </>
  );
}
