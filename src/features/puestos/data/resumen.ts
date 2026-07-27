import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ResumenNomenclador = {
  puestos: number;
  porAgrupamiento: { nombre: string; cantidad: number }[];
  /** Fichas transcriptas del nomenclador impreso de 2016. */
  fichas: number;
};

/**
 * Indicadores del dashboard. Los conteos van con `head: true` para que Postgres
 * devuelva solo el total y no las filas.
 *
 * Las fichas se cuentan enteras y no separadas por `verification_status`: las 210
 * están en `pending` porque nadie las contrastó contra el papel, pero todavía no
 * existe la pantalla para marcarlas verificadas. Anunciar 210 pendientes en el
 * dashboard sería reclamar una tarea que hoy no se puede hacer. El dato sigue en
 * `source_references` para cuando esa pantalla exista.
 */
export async function obtenerResumen(): Promise<ResumenNomenclador | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  const [puestos, fichas, versiones] = await Promise.all([
    supabase
      .from("positions")
      .select("*", { count: "exact", head: true })
      .neq("status", "archived"),
    supabase
      .from("source_references")
      .select("*", { count: "exact", head: true }),
    // `validity_status = 'current'` no alcanza: un puesto archivado conserva su
    // versión vigente, así que el puesto de prueba ZZZ se colaba y el reparto
    // sumaba 211 abajo del título "los 210 puestos vigentes". El `!inner` sobre
    // `positions` es lo que hace que el filtro descarte la fila entera y no solo
    // el embed. El hint `!position_id` es obligatorio: hay dos FK entre las dos
    // tablas (esta y `positions_current_version_fk`) y sin él PostgREST no sabe
    // por cuál embeber.
    supabase
      .from("position_versions")
      .select("groupings ( name ), positions!position_id!inner ( status )")
      .eq("validity_status", "current")
      .neq("positions.status", "archived"),
  ]);

  if (versiones.error) {
    console.error("[resumen] obtenerResumen:", versiones.error.message);
    return null;
  }

  const cuenta = new Map<string, number>();
  for (const v of (versiones.data ?? []) as unknown as {
    groupings: { name: string } | null;
  }[]) {
    const n = v.groupings?.name ?? "—";
    cuenta.set(n, (cuenta.get(n) ?? 0) + 1);
  }

  return {
    puestos: puestos.count ?? 0,
    fichas: fichas.count ?? 0,
    porAgrupamiento: [...cuenta.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}
