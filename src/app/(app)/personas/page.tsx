import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { AltaPersona } from "@/features/personas/components/alta-persona";
import { TablaPersonas } from "@/features/personas/components/tabla-personas";
import { listarPersonas } from "@/features/personas/data/personas";
import { listarPuestosParaSelector } from "@/features/puestos/data/puestos";
import { listarReparticiones } from "@/features/reparticiones/data/reparticiones";
import { getSessionRole } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Personas" };

export default async function PersonasPage() {
  const [personas, puestos, reparticiones] = await Promise.all([
    listarPersonas(),
    listarPuestosParaSelector(),
    listarReparticiones(),
  ]);
  const esAdmin = (await getSessionRole()) === "admin";

  return (
    <>
      <PageHeader
        title="Personas"
        description="Empleados municipales y el puesto que ocupan."
      />

      {esAdmin && (
        <div className="mb-6">
          <AltaPersona puestos={puestos} reparticiones={reparticiones} />
        </div>
      )}

      {personas.length === 0 ? (
        <EmptyState
          title="Sin personas cargadas"
          description="Cuando se carguen empleados, se listarán acá con búsqueda y filtros."
        />
      ) : (
        <TablaPersonas personas={personas} />
      )}
    </>
  );
}
