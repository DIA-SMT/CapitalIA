import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Estructura organizativa de la Municipalidad. Hoy son 2 niveles: secretarías
 * (parent_id null) y direcciones (cuelgan de su secretaría). Datos provisionales
 * del POA 2026 (migración 0011), hasta la integración con Civitas.
 */

export type ReparticionNodo = {
  id: string;
  code: string;
  nombre: string;
  activa: boolean;
};

export type Secretaria = ReparticionNodo & {
  direcciones: ReparticionNodo[];
};

/** Secretarías con sus direcciones anidadas, ordenadas por código. */
export async function listarReparticiones(): Promise<Secretaria[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reparticiones")
    .select("id, code, nombre, parent_id, is_active")
    .order("code");

  if (error) {
    console.error("[reparticiones] listarReparticiones:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    code: string;
    nombre: string;
    parent_id: string | null;
    is_active: boolean;
  };

  const filas = (data ?? []) as Fila[];
  const nodo = (f: Fila): ReparticionNodo => ({
    id: f.id,
    code: f.code,
    nombre: f.nombre,
    activa: f.is_active,
  });

  // Direcciones agrupadas por su secretaría.
  const porPadre = new Map<string, ReparticionNodo[]>();
  for (const f of filas) {
    if (f.parent_id === null) continue;
    const hijos = porPadre.get(f.parent_id) ?? [];
    hijos.push(nodo(f));
    porPadre.set(f.parent_id, hijos);
  }

  return filas
    .filter((f) => f.parent_id === null)
    .map((s) => ({
      ...nodo(s),
      direcciones: porPadre.get(s.id) ?? [],
    }));
}
