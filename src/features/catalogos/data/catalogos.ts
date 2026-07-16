import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type EntradaCatalogo = { code: string; name: string; activo: boolean };
export type Catalogo = {
  clave: string;
  titulo: string;
  descripcion: string;
  entradas: EntradaCatalogo[];
};

/**
 * Catálogos de referencia del nomenclador. Se traen todos de una: son listas
 * cortas (la más larga, riesgos, ronda los 95 valores).
 *
 * `knowledge_items` queda fuera a propósito: tiene ~167 entradas y el 71% se usa
 * una sola vez. No se comporta como catálogo (ver data/nomenclador/README.md §8);
 * mostrarlo acá daría a entender que es una lista curada, y no lo es.
 */
export async function listarCatalogos(): Promise<Catalogo[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const defs = [
    {
      tabla: "groupings",
      clave: "agrupamientos",
      titulo: "Agrupamientos",
      descripcion: "Las cinco familias del nomenclador. Definen el prefijo del código interno.",
    },
    {
      tabla: "technical_areas",
      clave: "areas",
      titulo: "Áreas técnicas",
      descripcion: "Las cuatro áreas del agrupamiento Técnico, que usa área en lugar de nivel.",
    },
    {
      tabla: "risk_levels",
      clave: "riesgos-nivel",
      titulo: "Niveles de riesgo",
      descripcion:
        "Escala de riesgo. Incluye rangos porque la ficha de 2016 los usa en 45 de los 210 puestos.",
    },
    {
      tabla: "competencies",
      clave: "competencias",
      titulo: "Competencias",
      descripcion: "Competencias requeridas. Se curaron desde las 210 fichas del nomenclador.",
    },
    {
      tabla: "risks",
      clave: "riesgos",
      titulo: "Riesgos de trabajo",
      descripcion: "Riesgos identificados en las fichas.",
    },
    {
      tabla: "responsibilities",
      clave: "responsabilidades",
      titulo: "Responsabilidades",
      descripcion: "Sobre qué responde cada puesto.",
    },
  ] as const;

  const resultados = await Promise.all(
    defs.map((d) =>
      supabase.from(d.tabla).select("code, name, is_active").order("name"),
    ),
  );

  return defs.map((d, i) => {
    const r = resultados[i];
    if (r.error) console.error(`[catalogos] ${d.tabla}:`, r.error.message);
    return {
      clave: d.clave,
      titulo: d.titulo,
      descripcion: d.descripcion,
      entradas: ((r.data ?? []) as { code: string; name: string; is_active: boolean }[]).map(
        (e) => ({ code: e.code, name: e.name, activo: e.is_active }),
      ),
    };
  });
}
