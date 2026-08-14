import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Dotación: quién ocupa cada puesto.
 *
 * Alcance mínimo a propósito (ver cabecera de la migración 0008): identificación
 * y área, nada sensible.
 */

export type PersonaEnPuesto = {
  id: string;
  personaId: string;
  legajo: string;
  nombre: string;
  reparticion: string | null;
  desde: string;
  hasta: string | null;
  activa: boolean;
};

export type PersonaListado = {
  id: string;
  legajo: string;
  nombre: string;
  email: string | null;
  reparticion: string | null;
  activa: boolean;
  puesto: { id: string; nombre: string; internalCode: string } | null;
};

/** Personas asignadas a un puesto. Primero las vigentes. */
export async function listarPersonasDePuesto(
  positionId: string,
): Promise<PersonaEnPuesto[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("asignaciones")
    .select(
      `id, valid_from, valid_until,
       personas ( id, legajo, full_name, is_active, reparticiones ( nombre ) )`,
    )
    .eq("position_id", positionId)
    .order("valid_until", { ascending: true, nullsFirst: true })
    .order("valid_from", { ascending: false });

  if (error) {
    // La 0008 puede no estar aplicada todavía: la ficha no debe romperse por eso.
    console.error("[personas] listarPersonasDePuesto:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    valid_from: string;
    valid_until: string | null;
    personas: {
      id: string;
      legajo: string;
      full_name: string;
      is_active: boolean;
      reparticiones: { nombre: string } | null;
    } | null;
  };

  return ((data ?? []) as unknown as Fila[])
    .filter((f) => f.personas)
    .map((f) => ({
      id: f.id,
      personaId: f.personas!.id,
      legajo: f.personas!.legajo,
      nombre: f.personas!.full_name,
      reparticion: f.personas!.reparticiones?.nombre ?? null,
      desde: f.valid_from,
      hasta: f.valid_until,
      activa: f.personas!.is_active,
    }));
}

export const POR_PAGINA = 50;

export type FiltrosPersonas = {
  /** Texto libre: nombre, legajo o email. */
  q?: string;
  /** UUID de repartición. */
  rep?: string;
  estado?: "activa" | "baja";
};

export type ListadoPersonas = {
  personas: PersonaListado[];
  /** Cuántas cumplen el filtro en la base, no cuántas vinieron en esta página. */
  total: number;
  pagina: number;
  paginas: number;
};

/**
 * Normaliza igual que la columna generada `personas.busqueda` (migración 0023):
 * NFD, borrar los combining marks, minúsculas.
 *
 * Es la MISMA operación de los dos lados, no dos listas de caracteres que haya
 * que mantener en sincronía — la 0022 lo intentó así y se le escapaban los
 * diacríticos fuera del set español y cualquier dato que llegara descompuesto.
 * Si los dos lados se desincronizan, buscar "Gómez" deja de encontrar a "Gómez"
 * y el síntoma es "Sin coincidencias", indistinguible de que no exista.
 */
function normalizarBusqueda(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Escapa los comodines de LIKE, para que un `%` tecleado no traiga todo. */
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Un tramo del padrón con su puesto vigente, filtrado y paginado POR LA BASE.
 *
 * Antes traía todas las filas y la tabla filtraba en el navegador. Eso funcionó
 * mientras hubo un puñado de personas, pero PostgREST corta en 1.000 filas y
 * devuelve HTTP 200 sin error ni aviso: con 4.771 la pantalla habría mostrado el
 * primer tramo alfabético como si fuera todo, y buscar a alguien de la segunda
 * mitad del abecedario habría contestado "Sin coincidencias".
 *
 * `count: "exact"` está para que el total salga de la base y no de `data.length`:
 * es lo que hace que el corte sea imposible de disimular.
 */
export async function listarPersonas(
  filtros: FiltrosPersonas = {},
  pagina = 1,
): Promise<ListadoPersonas> {
  const vacio: ListadoPersonas = { personas: [], total: 0, pagina: 1, paginas: 0 };
  if (!isSupabaseConfigured()) return vacio;

  const paginaActual = Math.max(1, Math.trunc(pagina) || 1);
  const desde = (paginaActual - 1) * POR_PAGINA;

  const supabase = await createClient();
  let consulta = supabase
    .from("personas")
    .select(
      `id, legajo, full_name, email, is_active,
       reparticiones ( nombre ),
       asignaciones ( valid_until,
         positions ( id, internal_code,
           current_version:position_versions!positions_current_version_fk ( name )
         )
       )`,
      { count: "exact" },
    )
    // `id` desempata: sin un orden total, dos homónimos pueden repetirse en una
    // página y faltar en la siguiente.
    .order("full_name")
    .order("id")
    .range(desde, desde + POR_PAGINA - 1);

  // Cada palabra tiene que aparecer: "perez juan" no trae a todos los Pérez.
  for (const termino of normalizarBusqueda(filtros.q ?? "").split(/\s+/).filter(Boolean)) {
    consulta = consulta.ilike("busqueda", `%${escaparLike(termino)}%`);
  }
  if (filtros.rep) consulta = consulta.eq("reparticion_id", filtros.rep);
  if (filtros.estado === "activa") consulta = consulta.eq("is_active", true);
  if (filtros.estado === "baja") consulta = consulta.eq("is_active", false);

  const { data, error, count } = await consulta;

  if (error) {
    // PGRST103: se pidió una página más allá del final (URL escrita a mano, o un
    // filtro que achicó el resultado). Devolver vacío haría que la pantalla diga
    // "Sin personas cargadas", que es mentira: hay gente, pero no en esa página.
    if (error.code === "PGRST103" && paginaActual > 1) {
      return listarPersonas(filtros, 1);
    }
    console.error("[personas] listarPersonas:", error.message);
    return vacio;
  }

  type Fila = {
    id: string;
    legajo: string;
    full_name: string;
    email: string | null;
    is_active: boolean;
    reparticiones: { nombre: string } | null;
    asignaciones: {
      valid_until: string | null;
      positions: {
        id: string;
        internal_code: string;
        current_version: { name: string } | null;
      } | null;
    }[];
  };

  const personas = ((data ?? []) as unknown as Fila[]).map((p) => {
    // La vigente es la que no tiene fecha de fin.
    const vigente = p.asignaciones?.find((a) => a.valid_until === null);
    return {
      id: p.id,
      legajo: p.legajo,
      nombre: p.full_name,
      email: p.email,
      reparticion: p.reparticiones?.nombre ?? null,
      activa: p.is_active,
      puesto: vigente?.positions
        ? {
            id: vigente.positions.id,
            nombre: vigente.positions.current_version?.name ?? "—",
            internalCode: vigente.positions.internal_code,
          }
        : null,
    };
  });

  const total = count ?? 0;
  return {
    personas,
    total,
    pagina: paginaActual,
    paginas: Math.ceil(total / POR_PAGINA),
  };
}

export type ResumenDotacion = {
  /** Personas activas. */
  personas: number;
  /** Cuántas de ellas tienen un puesto vigente. */
  conPuesto: number;
};

/**
 * La dotación en dos números, para el dashboard. Van con `head: true`: Postgres
 * devuelve el total y ninguna fila.
 *
 * `conPuesto` cuenta asignaciones abiertas, no personas, pero
 * `uq_asig_una_vigente_por_persona` garantiza una sola vigente por persona, así
 * que es el mismo número.
 */
export async function resumenDotacion(): Promise<ResumenDotacion> {
  const vacio: ResumenDotacion = { personas: 0, conPuesto: 0 };
  if (!isSupabaseConfigured()) return vacio;

  const supabase = await createClient();
  const [personas, asignadas] = await Promise.all([
    supabase
      .from("personas")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("asignaciones")
      .select("*", { count: "exact", head: true })
      .is("valid_until", null),
  ]);

  if (personas.error) {
    // La 0008 puede no estar aplicada: el dashboard no debe romperse por eso.
    console.error("[personas] resumenDotacion:", personas.error.message);
    return vacio;
  }

  return { personas: personas.count ?? 0, conPuesto: asignadas.count ?? 0 };
}

/** Cuántos candidatos se ofrecen de una. Por encima de eso, hay que buscar. */
export const MAX_SIN_PUESTO = 100;

export type CandidatosSinPuesto = {
  personas: { id: string; nombre: string; legajo: string }[];
  /** Cuántos hay dentro del alcance del usuario, no cuántos vinieron. */
  total: number;
};

/**
 * Candidatos para asignar a un puesto: personas activas sin asignación abierta.
 *
 * El filtro y el recorte los hace la base (`personas_sin_puesto`, migración
 * 0024). Antes traía las personas sin límite y descartaba en JS a las que ya
 * tenían puesto, con lo cual el corte de 1.000 filas de PostgREST pegaba ANTES
 * del filtro: el selector ofrecía un tramo del abecedario como si fuera todo, y
 * si esas primeras mil ya estaban asignadas imprimía "No hay personas activas
 * sin puesto asignado" siendo falso.
 *
 * `total` viene de la base para que la UI pueda decir que está mostrando un
 * recorte. Un recorte anunciado es utilizable; uno silencioso es una mentira.
 */
export async function listarPersonasSinPuesto(q = ""): Promise<CandidatosSinPuesto> {
  const vacio: CandidatosSinPuesto = { personas: [], total: 0 };
  if (!isSupabaseConfigured()) return vacio;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("personas_sin_puesto", {
    q: normalizarBusqueda(q),
    limite: MAX_SIN_PUESTO,
  });

  if (error) {
    console.error("[personas] listarPersonasSinPuesto:", error.message);
    return vacio;
  }

  type Fila = { id: string; legajo: string; full_name: string; total: number };
  const filas = (data ?? []) as Fila[];

  return {
    personas: filas.map((p) => ({ id: p.id, nombre: p.full_name, legajo: p.legajo })),
    total: filas[0]?.total ?? 0,
  };
}
