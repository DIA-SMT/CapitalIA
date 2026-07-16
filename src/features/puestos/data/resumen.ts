import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ResumenNomenclador = {
  puestos: number;
  porAgrupamiento: { nombre: string; cantidad: number }[];
  fichasPendientes: number;
  fichasVerificadas: number;
};

/**
 * Indicadores del dashboard. Los conteos van con `head: true` para que Postgres
 * devuelva solo el total y no las filas.
 */
export async function obtenerResumen(): Promise<ResumenNomenclador | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  const [puestos, pendientes, verificadas, versiones] = await Promise.all([
    supabase
      .from("positions")
      .select("*", { count: "exact", head: true })
      .neq("status", "archived"),
    supabase
      .from("source_references")
      .select("*", { count: "exact", head: true })
      .eq("verification_status", "pending"),
    supabase
      .from("source_references")
      .select("*", { count: "exact", head: true })
      .eq("verification_status", "verified"),
    supabase
      .from("position_versions")
      .select("groupings ( name )")
      .eq("validity_status", "current"),
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
    fichasPendientes: pendientes.count ?? 0,
    fichasVerificadas: verificadas.count ?? 0,
    porAgrupamiento: [...cuenta.entries()]
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad),
  };
}
