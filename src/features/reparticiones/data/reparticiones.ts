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

export type ResumenOrganigrama = {
  secretarias: number;
  subsecretarias: number;
  direcciones: number;
  /** Cuántas unidades cuelgan de cada secretaría, de mayor a menor. */
  porSecretaria: { id: string; nombre: string; unidades: number }[];
};

/**
 * El organigrama en números, para el dashboard.
 *
 * ⚠️ `reparticiones` no guarda el tipo de unidad: lo único que hay es la relación
 * padre-hijo, así que el tipo se deduce de la forma del árbol —raíz = secretaría,
 * con dependientes = subsecretaría, sin dependientes = dirección—. Con los datos
 * del POA 2026 da exacto (9 / 7 / 53), incluidas las 13 direcciones que cuelgan
 * directo de su secretaría y que contar por profundidad clasificaría mal. Pero es
 * una deducción, no un dato: si mañana una dirección pasa a tener unidades a
 * cargo, va a contar como subsecretaría. Si el tipo llega a importar de verdad,
 * corresponde una columna en la tabla y no una heurística acá.
 *
 * Los totales se calculan sobre todas las unidades, activas o no, para que el
 * número coincida con el que muestra `/reparticiones`.
 */
export async function resumenOrganigrama(): Promise<ResumenOrganigrama> {
  const secretarias = construirArbol(await traerFilas());

  let subsecretarias = 0;
  let direcciones = 0;

  function contar(nodos: NodoReparticion[]) {
    for (const n of nodos) {
      if (n.hijos.length > 0) {
        subsecretarias += 1;
        contar(n.hijos);
      } else {
        direcciones += 1;
      }
    }
  }
  for (const s of secretarias) contar(s.hijos);

  return {
    secretarias: secretarias.length,
    subsecretarias,
    direcciones,
    porSecretaria: secretarias
      .map((s) => ({
        id: s.id,
        nombre: s.nombre,
        unidades: s.totalDescendientes,
      }))
      .sort((a, b) => b.unidades - a.unidades),
  };
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

/** Una repartición puntual, para precargar el formulario de edición. */
export async function obtenerReparticion(id: string): Promise<{
  id: string;
  code: string;
  nombre: string;
  parentId: string | null;
  activa: boolean;
} | null> {
  const fila = (await traerFilas()).find((f) => f.id === id);
  if (!fila) return null;
  return {
    id: fila.id,
    code: fila.code,
    nombre: fila.nombre,
    parentId: fila.parent_id,
    activa: fila.is_active,
  };
}

/**
 * Posibles "padres" para una repartición.
 *
 * Al editar hay que excluir a la propia unidad y a todo lo que cuelga de ella:
 * elegir una descendiente como padre armaría un ciclo y las dejaría a todas fuera
 * del organigrama. La base igual lo rechaza (trigger de la 0017); esto es para que
 * ni siquiera aparezca como opción.
 */
export async function listarPosiblesPadres(
  excluirId?: string,
): Promise<ReparticionPlana[]> {
  const planas = await listarReparticionesPlanas();
  if (!excluirId) return planas;

  const filas = await traerFilas();
  const vedados = new Set<string>([excluirId]);
  // Las filas vienen en orden de código, así que puede hacer falta más de una
  // pasada para arrastrar la exclusión hasta las hojas.
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const f of filas) {
      if (f.parent_id && vedados.has(f.parent_id) && !vedados.has(f.id)) {
        vedados.add(f.id);
        cambio = true;
      }
    }
  }

  return planas.filter((p) => !vedados.has(p.id));
}
