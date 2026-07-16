import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, FileStack, GitCompareArrows, Library } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

const indicadores = [
  { label: "Puestos", icon: FileStack, hint: "Total en el nomenclador" },
  { label: "Catálogos", icon: Library, hint: "Listas de referencia" },
  { label: "Comparaciones", icon: GitCompareArrows, hint: "Análisis realizados" },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen general del Nomenclador de Puestos."
        action={
          <Button render={<Link href="/puestos/nuevo" />}>
            <FilePlus2 className="h-4 w-4" aria-hidden />
            Nuevo puesto
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {indicadores.map(({ label, icon: Icon, hint }) => (
          <Card key={label}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardDescription>{label}</CardDescription>
                <Icon className="h-4 w-4 text-brand-celeste" aria-hidden />
              </div>
              <CardTitle className="text-3xl">—</CardTitle>
              <CardDescription className="text-xs">{hint}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <EmptyState
          title="Todavía no hay datos"
          description="Los indicadores se completarán al cargar las fichas del nomenclador en las próximas etapas."
        />
      </div>
    </>
  );
}
