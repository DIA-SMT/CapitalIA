import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, CircleAlert, FileText, Pencil } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PersonasDelPuesto } from "@/features/personas/components/personas-del-puesto";
import {
  listarPersonasDePuesto,
  listarPersonasSinPuesto,
} from "@/features/personas/data/personas";
import { BajaPuesto } from "@/features/puestos/components/baja-puesto";
import { HistorialPuesto } from "@/features/puestos/components/historial-puesto";
import {
  obtenerHistorial,
  obtenerPuesto,
  type ItemFicha,
} from "@/features/puestos/data/puestos";
import { getSessionRole } from "@/lib/supabase/server";

// Next.js 16: `params` es una Promesa y hay que await-earla.
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const puesto = await obtenerPuesto(id);
  return { title: puesto ? puesto.nombre : "Puesto" };
}

/** Campo de texto de la ficha. Si no está impreso en el original, se dice. */
function Campo({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </dt>
      <dd className="mt-1 text-sm text-foreground">
        {valor ?? (
          <span className="italic text-muted-foreground">No figura en la ficha</span>
        )}
      </dd>
    </div>
  );
}

/**
 * Lista de ítems de catálogo. Muestra el canónico; si el literal impreso difiere,
 * lo aclara — así se ve que el dato es fiel a la hoja de 2016 aunque el catálogo
 * lo haya unificado.
 */
function ListaItems({ items }: { items: ItemFicha[] }) {
  if (items.length === 0) {
    return <p className="text-sm italic text-muted-foreground">No figura en la ficha</p>;
  }
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => {
        const difiere =
          it.impreso &&
          it.impreso.replace(/[.\-–\s]+$/, "").toLowerCase() !==
            it.canonico.replace(/[.\-–\s]+$/, "").toLowerCase();
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-foreground">{it.canonico}</span>
            {difiere && (
              <span
                className="font-mono text-xs text-muted-foreground"
                title="Así está escrito en el nomenclador original"
              >
                impreso: “{it.impreso}”
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default async function PuestoPage({ params }: Props) {
  const { id } = await params;
  const [p, historial, personas, disponibles] = await Promise.all([
    obtenerPuesto(id),
    obtenerHistorial(id),
    listarPersonasDePuesto(id),
    listarPersonasSinPuesto(),
  ]);
  if (!p) notFound();

  const esAdmin = (await getSessionRole()) === "admin";

  return (
    <>
      <PageHeader
        title={p.nombre}
        description={`${p.internalCode} · ${p.agrupamiento}${
          p.area ? ` · ${p.area}` : p.nivel ? ` · Nivel ${p.nivel}` : ""
        }`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href="/puestos" />}>
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Volver
            </Button>
            {esAdmin && <BajaPuesto positionId={p.id} estado={p.estado} />}
            {esAdmin && (
              <Button render={<Link href={`/puestos/${p.id}/editar`} />}>
                <Pencil className="h-4 w-4" aria-hidden />
                Editar
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {p.estado === "archived" && <Badge variant="destructive">Archivado</Badge>}
        {p.variante && <Badge variant="outline">Variante {p.variante}</Badge>}
        {p.esFuenteHistorica && (
          <Badge variant="secondary">Ficha histórica 2016</Badge>
        )}
        <Badge variant="outline">Versión {p.versionNumero}</Badge>
        {p.riesgo && (
          <Badge variant="outline" title={p.riesgoImpreso ?? undefined}>
            Riesgo: {p.riesgo}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Análisis del puesto</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Campo etiqueta="Descripción general" valor={p.descripcionGeneral} />
                <Campo etiqueta="Descripción específica" valor={p.descripcionEspecifica} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Requisitos intelectuales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-5 sm:grid-cols-2">
                <Campo etiqueta="Instrucción" valor={p.instruccion} />
                <Campo etiqueta="Título" valor={p.titulo} />
                {p.experiencia && (
                  <Campo etiqueta="Antigüedad y experiencia" valor={p.experiencia} />
                )}
              </dl>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Otros conocimientos
                </h3>
                <div className="mt-2">
                  <ListaItems items={p.conocimientos} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Competencias requeridas</CardTitle>
              <CardDescription>
                {p.competencias.length} del catálogo del nomenclador.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ListaItems items={p.competencias} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Condiciones y riesgos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-5 sm:grid-cols-2">
                <Campo etiqueta="Requisito físico" valor={p.requisitoFisico} />
                <Campo etiqueta="Condiciones de trabajo" valor={p.condicionesTrabajo} />
              </dl>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Riesgos de trabajo
                </h3>
                <div className="mt-2">
                  <ListaItems items={p.riesgos} />
                </div>
              </div>
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Nivel de riesgo
                </h3>
                <p className="mt-1 text-sm">
                  {p.riesgo ?? "—"}
                  {p.riesgoImpreso && p.riesgoImpreso !== p.riesgo && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      impreso: “{p.riesgoImpreso}”
                    </span>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Responsabilidad sobre</CardTitle>
            </CardHeader>
            <CardContent>
              <ListaItems items={p.responsabilidades} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <PersonasDelPuesto
            positionId={p.id}
            personas={personas}
            disponibles={disponibles}
            puedeEditar={esAdmin}
          />

          {historial.length > 0 && <HistorialPuesto versiones={historial} />}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4" aria-hidden />
                Procedencia
              </CardTitle>
              <CardDescription>De dónde salió cada dato de esta ficha.</CardDescription>
            </CardHeader>
            <CardContent>
              {p.fuente ? (
                <dl className="space-y-4">
                  <Campo etiqueta="Documento" valor={p.fuente.documento} />
                  <Campo
                    etiqueta="Página impresa"
                    valor={p.fuente.paginaImpresa?.toString() ?? null}
                  />
                  <Campo
                    etiqueta="Página del PDF"
                    valor={p.fuente.paginaPdf?.toString() ?? null}
                  />
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Verificación
                    </dt>
                    <dd className="mt-1">
                      {p.fuente.verificacion === "verified" ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                          <BadgeCheck className="h-4 w-4" aria-hidden />
                          Verificada contra el original
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-amber-700">
                          <CircleAlert className="h-4 w-4" aria-hidden />
                          Pendiente de verificar
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm italic text-muted-foreground">Sin fuente registrada</p>
              )}
            </CardContent>
          </Card>

          {p.notasAdicionales && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notas de la transcripción</CardTitle>
                <CardDescription>
                  Observaciones de quien transcribió la ficha: erratas del original,
                  campos ausentes o lecturas dudosas.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {p.notasAdicionales}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
