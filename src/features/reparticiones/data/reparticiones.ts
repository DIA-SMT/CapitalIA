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
  /**
   * Profundidad en el árbol, para sangrar en los selectores. NO es el tipo de
   * unidad: el organigrama que viene tiene cuatro escalones y una dirección
   * puede colgar directo de su secretaría. Para saber qué es cada una, `tipo`.
   */
  nivel: number;
};

type Fila = {
  id: string;
  code: string;
  nombre: string;
  parent_id: string | null;
  is_active: boolean;
  tipo: TipoReparticion | null;
};

async function traerFilas(): Promise<Fila[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reparticiones")
    .select("id, code, nombre, parent_id, is_active, tipo")
    .order("code");

  if (!error) return (data ?? []) as Fila[];

  // 42703 = la columna no existe: la 0025 todavía no se aplicó. Se reintenta sin
  // ella en vez de devolver vacío, porque de estas filas dependen el organigrama,
  // el dashboard y TODOS los selectores de repartición: sin ellas un director no
  // puede ni cargar personal. El tipo se deduce después, como se hacía antes.
  if (error.code === "42703") {
    const { data: viejo, error: error2 } = await supabase
      .from("reparticiones")
      .select("id, code, nombre, parent_id, is_active")
      .order("code");
    if (!error2) {
      return ((viejo ?? []) as Omit<Fila, "tipo">[]).map((f) => ({ ...f, tipo: null }));
    }
  }

  console.error("[reparticiones] traerFilas:", error.message);
  return [];
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

/** Los cuatro escalones del organigrama, tal como los nombra el origen. */
export type TipoReparticion =
  | "secretaria"
  | "subsecretaria"
  | "direccion"
  | "subdireccion";

export type ResumenOrganigrama = {
  secretarias: number;
  subsecretarias: number;
  direcciones: number;
  /** Cuarto nivel. Es 0 hasta que se importe el organigrama de sueldos. */
  subdirecciones: number;
  /** Cuántas unidades cuelgan de cada secretaría, de mayor a menor. */
  porSecretaria: { id: string; nombre: string; unidades: number }[];
};

/**
 * El organigrama en números, para el dashboard.
 *
 * El tipo sale de la columna `tipo` (migración 0025), no de la forma del árbol.
 * Antes se deducía —raíz = secretaría, con dependientes = subsecretaría, sin
 * dependientes = dirección—, lo que daba exacto con los datos del POA 2026
 * (9 / 7 / 53). Con el organigrama de sueldos, que tiene cuatro escalones, esa
 * deducción cruza categorías por construcción: una dirección con subdirecciones
 * a cargo contaría como subsecretaría, y sus subdirecciones como direcciones.
 * Los totales quedarían mal y la suma igual cerraría.
 *
 * Las filas sin `tipo` caen a la heurística vieja para que el total siga
 * cerrando —puede pasar durante la importación, o si la 0025 no está aplicada—.
 *
 * Los totales se calculan sobre todas las unidades, activas o no, para que el
 * número coincida con el que muestra `/reparticiones`.
 */
export async function resumenOrganigrama(): Promise<ResumenOrganigrama> {
  const filas = await traerFilas();
  const secretarias = construirArbol(filas);

  const porTipo: Record<TipoReparticion, number> = {
    secretaria: 0,
    subsecretaria: 0,
    direccion: 0,
    subdireccion: 0,
  };
  const tipoDe = new Map(filas.map((f) => [f.id, f.tipo]));

  function contar(nodos: NodoReparticion[], esRaiz: boolean) {
    for (const n of nodos) {
      const tipo =
        tipoDe.get(n.id) ??
        // Sin dato: la deducción de siempre.
        (esRaiz ? "secretaria" : n.hijos.length > 0 ? "subsecretaria" : "direccion");
      porTipo[tipo] += 1;
      contar(n.hijos, false);
    }
  }
  contar(secretarias, true);

  return {
    secretarias: porTipo.secretaria,
    subsecretarias: porTipo.subsecretaria,
    direcciones: porTipo.direccion,
    subdirecciones: porTipo.subdireccion,
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

/**
 * Las reparticiones en las que el usuario puede cargar personal.
 *
 * El admin, todas. El director y el secretario, solo su alcance — y ese alcance
 * sale de `mis_reparticiones()` en la base y no de leer `perfil_reparticiones`
 * derecho, porque para un secretario incluye todo lo que cuelga de su secretaría.
 * Es la misma función que usa la RLS, así que lo que ofrece el formulario y lo que
 * acepta la base no se pueden desincronizar: si acá apareciera una de más, la
 * `personas_insert_director` de la 0018 la rechaza igual.
 */
export async function listarReparticionesQuePuedoGestionar(
  esAdmin: boolean,
): Promise<ReparticionPlana[]> {
  if (!isSupabaseConfigured()) return [];

  const planas = await listarReparticionesPlanas();
  if (esAdmin) return planas;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mis_reparticiones");
  if (error) {
    console.error("[reparticiones] mis_reparticiones:", error.message);
    return [];
  }

  // `mis_reparticiones()` es `returns setof uuid`. PostgREST devuelve eso como
  // array de strings, pero se acepta también la forma objeto: sin
  // `database.types.ts` generado no hay nada que fije la forma, y equivocarse acá
  // dejaría al director sin ninguna repartición para elegir.
  const mias = new Set(
    ((data ?? []) as unknown[])
      .map((f) =>
        typeof f === "string"
          ? f
          : (f as Record<string, string> | null)?.mis_reparticiones,
      )
      .filter((id): id is string => typeof id === "string"),
  );

  return planas.filter((p) => mias.has(p.id));
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
