import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Acceso a datos de puestos. Solo servidor: las consultas corren con la sesión
 * del usuario, así que RLS decide qué se ve (hoy: solo `admin`).
 *
 * Los tipos se declaran a mano porque `database.types.ts` todavía no está
 * generado (`npm run db:types` requiere `supabase login`). Al generarlo,
 * reemplazar estas formas por las de `Database["public"]["Tables"]`.
 */

export type PuestoListado = {
  id: string;
  internalCode: string;
  nombre: string;
  variante: string | null;
  agrupamiento: string;
  nivel: string | null;
  area: string | null;
  riesgo: string | null;
  riesgoImpreso: string | null;
  estado: string;
  paginaImpresa: number | null;
  verificacion: string | null;
};

/** Forma cruda que devuelve PostgREST para la consulta de abajo. */
type FilaCruda = {
  id: string;
  internal_code: string;
  status: string;
  current_version: {
    name: string;
    variant: string | null;
    risk_level_raw: string | null;
    groupings: { name: string } | null;
    levels: { code: string } | null;
    technical_areas: { name: string } | null;
    risk_levels: { name: string } | null;
    source_references: { printed_page_number: number | null; verification_status: string }[];
  } | null;
};

/**
 * Trae los puestos con su versión vigente para el listado.
 *
 * Una sola consulta con embeds en lugar de N+1: PostgREST resuelve los joins
 * contra `positions.current_version_id`. Son ~210 filas, así que se traen todas
 * y el filtrado/orden se hace en el cliente (criterio del roadmap para el MVP).
 */
export async function listarPuestos(): Promise<PuestoListado[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("positions")
    .select(
      `id, internal_code, status,
       current_version:position_versions!positions_current_version_fk (
         name, variant, risk_level_raw,
         groupings ( name ),
         levels ( code ),
         technical_areas ( name ),
         risk_levels ( name ),
         source_references ( printed_page_number, verification_status )
       )`,
    )
    .neq("status", "archived")
    .order("internal_code");

  if (error) {
    // La página muestra el estado de error; acá se deja rastro para el servidor.
    console.error("[puestos] listarPuestos:", error.message);
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as FilaCruda[]).map((fila) => {
    const v = fila.current_version;
    const ref = v?.source_references?.[0];
    return {
      id: fila.id,
      internalCode: fila.internal_code,
      nombre: v?.name ?? "(sin versión vigente)",
      variante: v?.variant ?? null,
      agrupamiento: v?.groupings?.name ?? "—",
      nivel: v?.levels?.code ?? null,
      area: v?.technical_areas?.name ?? null,
      riesgo: v?.risk_levels?.name ?? null,
      riesgoImpreso: v?.risk_level_raw ?? null,
      estado: fila.status,
      paginaImpresa: ref?.printed_page_number ?? null,
      verificacion: ref?.verification_status ?? null,
    };
  });
}
