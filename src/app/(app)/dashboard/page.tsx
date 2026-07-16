import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, FileStack, FileText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { obtenerResumen } from "@/features/puestos/data/resumen";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const r = await obtenerResumen();

  if (!r || r.puestos === 0) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Resumen general del Nomenclador de Puestos."
        />
        <EmptyState
          title="Todavía no hay datos"
          description="Los indicadores se completan al cargar las fichas del nomenclador."
        />
      </>
    );
  }

  const fichas = r.fichasPendientes + r.fichasVerificadas;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen general del Nomenclador de Puestos."
        action={
          <Button variant="outline" render={<Link href="/puestos" />}>
            <FileStack className="h-4 w-4" aria-hidden />
            Ver el nomenclador
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardDescription>Puestos</CardDescription>
              <FileStack className="h-4 w-4 text-brand-celeste" aria-hidden />
            </div>
            <CardTitle className="text-3xl">{r.puestos}</CardTitle>
            <CardDescription className="text-xs">
              Vigentes en el nomenclador
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardDescription>Fichas históricas</CardDescription>
              <FileText className="h-4 w-4 text-brand-celeste" aria-hidden />
            </div>
            <CardTitle className="text-3xl">{fichas}</CardTitle>
            <CardDescription className="text-xs">
              Transcritas del nomenclador 2016
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardDescription>Pendientes de verificar</CardDescription>
              <CircleAlert className="h-4 w-4 text-amber-500" aria-hidden />
            </div>
            <CardTitle className="text-3xl">{r.fichasPendientes}</CardTitle>
            <CardDescription className="text-xs">
              Sin contrastar contra el PDF original
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Puestos por agrupamiento</CardTitle>
          <CardDescription>
            Distribución de los {r.puestos} puestos vigentes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {r.porAgrupamiento.map(({ nombre, cantidad }) => (
              <li key={nombre} className="flex items-center gap-3">
                <span className="w-52 shrink-0 truncate text-sm">{nombre}</span>
                <div
                  className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(cantidad / r.puestos) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {cantidad}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
