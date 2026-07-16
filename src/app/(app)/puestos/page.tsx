import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { TablaPuestos } from "@/features/puestos/components/tabla-puestos";
import { listarPuestos } from "@/features/puestos/data/puestos";

export const metadata: Metadata = { title: "Nomenclador" };

// Server Component: la consulta corre con la sesión del usuario, así que aplica
// RLS y no se puede cachear. Sin `use cache` a propósito; loading.tsx cubre la
// espera. El estado vacío queda para cuando de verdad no haya puestos.
export default async function PuestosPage() {
  const puestos = await listarPuestos();

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

      {puestos.length === 0 ? (
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
      ) : (
        <TablaPuestos puestos={puestos} />
      )}
    </>
  );
}
