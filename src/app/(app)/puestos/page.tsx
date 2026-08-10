import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
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
