import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type Opcion = { id: string; nombre: string };
export type Nivel = Opcion & { groupingId: string };

export type OpcionesFormulario = {
  agrupamientos: Opcion[];
  /** Todos los niveles: el formulario filtra por agrupamiento en el cliente. */
  niveles: Nivel[];
  areas: Opcion[];
  nivelesRiesgo: Opcion[];
  competencias: Opcion[];
  riesgos: Opcion[];
  responsabilidades: Opcion[];
  conocimientos: Opcion[];
};

/**
 * Opciones de catálogo para el formulario. Solo las activas: los valores
 * desactivados (ej. `Crítico`, que no figura en ninguna ficha de 2016) se
 * conservan por historia pero no se ofrecen para elegir.
 */
export async function obtenerOpciones(): Promise<OpcionesFormulario> {
  const vacio: OpcionesFormulario = {
    agrupamientos: [],
    niveles: [],
    areas: [],
    nivelesRiesgo: [],
    competencias: [],
    riesgos: [],
    responsabilidades: [],
    conocimientos: [],
  };
  if (!isSupabaseConfigured()) return vacio;

  const supabase = await createClient();

  const [g, l, a, rl, c, r, resp, k] = await Promise.all([
    supabase.from("groupings").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("levels").select("id, code, grouping_id").eq("is_active", true).order("sort_order"),
    supabase.from("technical_areas").select("id, name").eq("is_active", true).order("name"),
    supabase.from("risk_levels").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("competencies").select("id, name").eq("is_active", true).order("name"),
    supabase.from("risks").select("id, name").eq("is_active", true).order("name"),
    supabase.from("responsibilities").select("id, name").eq("is_active", true).order("name"),
    supabase.from("knowledge_items").select("id, name").eq("is_active", true).order("name"),
  ]);

  const opciones = (d: { id: string; name: string }[] | null): Opcion[] =>
    (d ?? []).map((x) => ({ id: x.id, nombre: x.name }));

  return {
    agrupamientos: opciones(g.data),
    niveles: ((l.data ?? []) as { id: string; code: string; grouping_id: string }[]).map((x) => ({
      id: x.id,
      nombre: x.code,
      groupingId: x.grouping_id,
    })),
    areas: opciones(a.data),
    nivelesRiesgo: opciones(rl.data),
    competencias: opciones(c.data),
    riesgos: opciones(r.data),
    responsabilidades: opciones(resp.data),
    conocimientos: opciones(k.data),
  };
}
