import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Estructura organizativa de la Municipalidad, hasta tres niveles:
 * Secretaría → Subsecretaría → Dirección.
 *
 * El árbol se arma acá y no en la consulta porque `parent_id` admite cualquier
 * profundidad: si mañana aparece un cuarto nivel, no hay que tocar nada.
 * Datos provisionales del POA 2026 (migraciones 0011 y 0016).
 */

export type NodoReparticion = {
  id: string;
  code: string;
  nombre: string;
  activa: boolean;
  hijos: NodoReparticion[];
  /** Cuántas unidades cuelgan de esta, a cualquier profundidad. */
  totalDescendientes: number;
};

/** Fila para selectores: el árbol aplanado, con su profundidad. */
export type ReparticionPlana = {
  id: string;
  code: string;
  nombre: string;
  /** 0 = secretaría, 1 = subsecretaría, 2 = dirección. */
  nivel: number;
};

type Fila = {
  id: string;
  code: string;
  nombre: string;
  parent_id: string | null;
  is_active: boolean;
};

async function traerFilas(): Promise<Fila[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reparticiones")
    .select("id, code, nombre, parent_id, is_active")
    .order("code");

  if (error) {
    console.error("[reparticiones] traerFilas:", error.message);
    return [];
  }
  return (data ?? []) as Fila[];
}

/** Arma el árbol a partir de las filas planas. */
function construirArbol(filas: Fila[]): NodoReparticion[] {
  const hijosDe = new Map<string | null, Fila[]>();
  for (const f of filas) {
    const lista = hijosDe.get(f.parent_id) ?? [];
    lista.push(f);
    hijosDe.set(f.parent_id, lista);
  }

  function construir(f: Fila): NodoReparticion {
    const hijos = (hijosDe.get(f.id) ?? []).map(construir);
    return {
      id: f.id,
      code: f.code,
      nombre: f.nombre,
      activa: f.is_active,
      hijos,
      totalDescendientes: hijos.reduce(
        (n, h) => n + 1 + h.totalDescendientes,
        0,
      ),
    };
  }

  return (hijosDe.get(null) ?? []).map(construir);
}

/** Organigrama completo: secretarías con sus subsecretarías y direcciones. */
export async function listarReparticiones(): Promise<NodoReparticion[]> {
  return construirArbol(await traerFilas());
}

/**
 * El mismo árbol aplanado en orden de lectura, con la profundidad de cada fila.
 * Es lo que consumen los selectores, que necesitan una lista y no un árbol.
 */
export async function listarReparticionesPlanas(): Promise<ReparticionPlana[]> {
  const arbol = construirArbol(await traerFilas());
  const salida: ReparticionPlana[] = [];

  function recorrer(nodos: NodoReparticion[], nivel: number) {
    for (const n of nodos) {
      salida.push({ id: n.id, code: n.code, nombre: n.nombre, nivel });
      recorrer(n.hijos, nivel + 1);
    }
  }

  recorrer(arbol, 0);
  return salida;
}
