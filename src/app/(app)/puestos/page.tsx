import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Nomenclador" };

export default function PuestosPage() {
  return (
    <>
      <PageHeader
        title="Nomenclador"
        description="Consulta y administración de puestos municipales."
        action={
          <Button render={<Link href="/puestos/nuevo" />}>
            <FilePlus2 className="h-4 w-4" aria-hidden />
            Nuevo puesto
          </Button>
        }
      />

      <EmptyState
        title="Sin puestos cargados"
        description="Cuando se importen las fichas históricas o se creen puestos, se listarán aquí con búsqueda y filtros."
        action={
          <Button variant="outline" render={<Link href="/puestos/nuevo" />}>
            <FilePlus2 className="h-4 w-4" aria-hidden />
            Crear el primer puesto
          </Button>
        }
      />
    </>
  );
}
