import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { AltaPersona } from "@/features/personas/components/alta-persona";
import { TablaPersonas } from "@/features/personas/components/tabla-personas";
import {
  listarPersonas,
  resumenDotacion,
  type FiltrosPersonas,
} from "@/features/personas/data/personas";
import { listarPuestosParaSelector } from "@/features/puestos/data/puestos";
import { listarReparticionesQuePuedoGestionar } from "@/features/reparticiones/data/reparticiones";
import { getSessionRole } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Personas" };

/** Filtros y página viajan en la URL: se pueden compartir y sobreviven al refresh. */
type ParamsPersonas = {
  q?: string;
  rep?: string;
  estado?: string;
  pagina?: string;
};

export default async function PersonasPage({
  searchParams,
}: {
  // Next 16: `searchParams` es una Promesa.
  searchParams: Promise<ParamsPersonas>;
}) {
  const params = await searchParams;
  const pagina = Number(params.pagina ?? "1") || 1;
  const filtros: FiltrosPersonas = {
    q: params.q?.trim() || undefined,
    rep: params.rep || undefined,
    // Cualquier otro valor se ignora en vez de filtrar por algo inexistente y
    // devolver una lista vacía sin explicación.
    estado:
      params.estado === "activa" || params.estado === "baja" ? params.estado : undefined,
  };

  // El rol va primero porque decide qué reparticiones se pueden ofrecer.
  // `getSessionRole` está cacheado por request, así que no cuesta una consulta más.
  const rol = await getSessionRole();
  const esAdmin = rol === "admin";
  // Desde la 0018 el director y el secretario también cargan personal, acotado a
  // su repartición. El listado ya venía acotado por RLS.
  const puedeCargar = rol !== null;
  // Misma condición que usa la ficha del puesto: asignan admin, secretario y
  // director. Va aparte de `puedeCargar` aunque hoy valga lo mismo, porque son dos
  // permisos distintos y el día que uno cambie no tiene que arrastrar al otro.
  const puedeAsignar = rol !== null;

  const [listado, puestos, reparticiones, dotacion] = await Promise.all([
    listarPersonas(filtros, pagina),
    listarPuestosParaSelector(),
    listarReparticionesQuePuedoGestionar(esAdmin),
    resumenDotacion(),
  ]);

  const hayFiltro = Boolean(filtros.q || filtros.rep || filtros.estado);

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
            // La repartición es obligatoria para todos, admin incluido: una
            // persona sin repartición no la ve ningún director ni secretario
            // —solo el admin— y no hay ninguna señal de que quedó afuera.
            // Esto es solo para aclarar en pantalla por qué la lista viene corta.
            alcanceAcotado={!esAdmin}
          />
        </div>
      )}

      {/* Sin filtros y sin resultados es que no hay nadie cargado. Con filtros,
          la tabla muestra "sin coincidencias", que dice otra cosa. */}
      {listado.total === 0 && !hayFiltro ? (
        <EmptyState
          title="Sin personas cargadas"
          description="Cuando se carguen empleados, se listarán acá con búsqueda y filtros."
        />
      ) : (
        <TablaPersonas
          listado={listado}
          reparticiones={reparticiones}
          // Ya están cargados para el alta: se reusan para asignar desde la fila,
          // sin una consulta más.
          puestos={puestos}
          filtros={filtros}
          // Global y no de la página: es un pendiente del padrón entero.
          sinPuesto={Math.max(0, dotacion.personas - dotacion.conPuesto)}
          esAdmin={esAdmin}
          puedeAsignar={puedeAsignar}
        />
      )}
    </>
  );
}
