import type { Metadata } from "next";
import { Download } from "lucide-react";

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
  // Trae también los archivados: la tabla filtra a "Vigentes" por defecto y deja
  // consultarlos con el selector de estado.
  const puestos = await listarPuestos({ incluirArchivados: true });

  return (
    <>
      <PageHeader
        title="Nomenclador"
        description="Consulta de los puestos municipales."
        action={
          // La descarga no espeja los filtros de la tabla (son estado del cliente,
          // no de la URL): baja el nomenclador completo y el recorte se hace en la
          // planilla. Por eso el rótulo dice "todo".
          puestos.length > 0 ? (
            <Button variant="outline" render={<a href="/api/puestos/csv" />}>
              <Download className="h-4 w-4" aria-hidden />
              Descargar todo en CSV
            </Button>
          ) : undefined
        }
      />

      {puestos.length === 0 ? (
        <EmptyState
          title="Sin puestos cargados"
          description="Cuando se importen las fichas históricas o se creen puestos, se listarán aquí con búsqueda y filtros."
        />
      ) : (
        <TablaPuestos puestos={puestos} />
      )}
    </>
  );
}
