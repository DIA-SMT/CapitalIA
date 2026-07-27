import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { AltaPersona } from "@/features/personas/components/alta-persona";
import { TablaPersonas } from "@/features/personas/components/tabla-personas";
import { listarPersonas } from "@/features/personas/data/personas";
import { listarPuestosParaSelector } from "@/features/puestos/data/puestos";
import { listarReparticionesQuePuedoGestionar } from "@/features/reparticiones/data/reparticiones";
import { getSessionRole } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Personas" };

export default async function PersonasPage() {
  // El rol va primero porque decide qué reparticiones se pueden ofrecer.
  // `getSessionRole` está cacheado por request, así que no cuesta una consulta más.
  const rol = await getSessionRole();
  const esAdmin = rol === "admin";
  // Desde la 0018 el director y el secretario también cargan personal, acotado a
  // su repartición. El listado ya venía acotado por RLS.
  const puedeCargar = rol !== null;

  const [personas, puestos, reparticiones] = await Promise.all([
    listarPersonas(),
    listarPuestosParaSelector(),
    listarReparticionesQuePuedoGestionar(esAdmin),
  ]);

  return (
    <>
      <PageHeader
        title="Personas"
        description="Empleados municipales y el puesto que ocupan."
      />

      {puedeCargar && (
        <div className="mb-6">
          <AltaPersona
            puestos={puestos}
            reparticiones={reparticiones}
            // El admin puede cargar a alguien sin repartición; para el resto es
            // obligatoria, y la base la exige igual (personas_insert_director).
            reparticionObligatoria={!esAdmin}
          />
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
