import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { PuestoFormValues } from "../schemas/puesto";

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
  /**
   * Índice de búsqueda: todo el texto de la ficha, ya normalizado (minúsculas,
   * sin tildes). No es para mostrar, solo para buscar. Permite encontrar por
   * contenido —"vehiculos", "caidas", "secundario"— y no solo por nombre.
   */
  buscable: string;
};

/** Fila de tabla puente que solo trae el nombre del catálogo, para el índice. */
type PuenteNombre<K extends string> = Record<K, { name: string } | null>;

/** Forma cruda que devuelve PostgREST para la consulta de abajo. */
type FilaCruda = {
  id: string;
  internal_code: string;
  status: string;
  current_version: {
    name: string;
    variant: string | null;
    risk_level_raw: string | null;
    general_description: string | null;
    specific_description: string | null;
    minimum_education: string | null;
    required_title: string | null;
    minimum_experience: string | null;
    physical_requirement: string | null;
    working_conditions: string | null;
    groupings: { name: string } | null;
    levels: { code: string } | null;
    technical_areas: { name: string } | null;
    risk_levels: { name: string } | null;
    position_version_competencies: PuenteNombre<"competencies">[];
    position_version_risks: PuenteNombre<"risks">[];
    position_version_responsibilities: PuenteNombre<"responsibilities">[];
    position_version_knowledge: PuenteNombre<"knowledge_items">[];
    source_references: { printed_page_number: number | null; verification_status: string }[];
  } | null;
};

/** Minúsculas y sin tildes: "MECÁNICO" y "mecanico" tienen que coincidir. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trae los puestos con su versión vigente para el listado.
 *
 * Una sola consulta con embeds en lugar de N+1: PostgREST resuelve los joins
 * contra `positions.current_version_id`. Son ~210 filas y se traen todas: el
 * filtrado y el orden se hacen en el cliente, como fija architecture.md para el
 * MVP.
 *
 * El payload ronda los 230 KB (~40 KB gzipeado) porque incluye el texto completo
 * de cada ficha para poder buscar por contenido. Si el nomenclador crece mucho,
 * el criterio del mismo documento es migrar el filtrado al servidor.
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
         general_description, specific_description,
         minimum_education, required_title, minimum_experience,
         physical_requirement, working_conditions,
         groupings ( name ),
         levels ( code ),
         technical_areas ( name ),
         risk_levels ( name ),
         position_version_competencies ( competencies ( name ) ),
         position_version_risks ( risks ( name ) ),
         position_version_responsibilities ( responsibilities ( name ) ),
         position_version_knowledge ( knowledge_items ( name ) ),
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

    const nombresDe = <K extends string>(filas: PuenteNombre<K>[] | undefined, k: K) =>
      (filas ?? []).map((f) => f[k]?.name ?? "").filter(Boolean);

    // Todo lo que se pueda buscar, en un solo string ya normalizado. Se arma acá
    // y no en el cliente para no normalizar 210 fichas en cada tecla.
    const buscable = normalizar(
      [
        v?.name,
        fila.internal_code,
        v?.variant,
        v?.groupings?.name,
        v?.levels?.code,
        v?.technical_areas?.name,
        v?.general_description,
        v?.specific_description,
        v?.minimum_education,
        v?.required_title,
        v?.minimum_experience,
        v?.physical_requirement,
        v?.working_conditions,
        v?.risk_levels?.name,
        ...nombresDe(v?.position_version_competencies, "competencies"),
        ...nombresDe(v?.position_version_risks, "risks"),
        ...nombresDe(v?.position_version_responsibilities, "responsibilities"),
        ...nombresDe(v?.position_version_knowledge, "knowledge_items"),
      ]
        .filter(Boolean)
        .join(" "),
    );

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
      buscable,
    };
  });
}

export type PuestoOpcion = {
  id: string;
  internalCode: string;
  nombre: string;
  agrupamiento: string;
};

/**
 * Los puestos vigentes en su forma mínima, para selectores.
 *
 * Existe aparte de `listarPuestos` a propósito: aquella trae el índice de
 * búsqueda de las 210 fichas (~190 KB) y acá solo hacen falta el id y el nombre.
 */
export async function listarPuestosParaSelector(): Promise<PuestoOpcion[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("positions")
    .select(
      `id, internal_code,
       current_version:position_versions!positions_current_version_fk (
         name, groupings ( name )
       )`,
    )
    .neq("status", "archived")
    .order("internal_code");

  if (error) {
    console.error("[puestos] listarPuestosParaSelector:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    internal_code: string;
    current_version: { name: string; groupings: { name: string } | null } | null;
  };

  return ((data ?? []) as unknown as Fila[])
    .filter((f) => f.current_version)
    .map((f) => ({
      id: f.id,
      internalCode: f.internal_code,
      nombre: f.current_version!.name,
      agrupamiento: f.current_version!.groupings?.name ?? "—",
    }));
}

/** Un ítem de catálogo tal como se muestra en la ficha. */
export type ItemFicha = {
  /** Entrada canónica del catálogo: sirve para filtrar y comparar. */
  canonico: string;
  /** Literal como está impreso en la hoja de 2016. Puede diferir del canónico. */
  impreso: string | null;
  notas: string | null;
};

export type PuestoDetalle = {
  id: string;
  internalCode: string;
  estado: string;
  versionId: string;
  versionNumero: number;
  nombre: string;
  variante: string | null;
  agrupamiento: string;
  nivel: string | null;
  area: string | null;
  descripcionGeneral: string | null;
  descripcionEspecifica: string | null;
  instruccion: string | null;
  titulo: string | null;
  experiencia: string | null;
  requisitoFisico: string | null;
  condicionesTrabajo: string | null;
  riesgo: string | null;
  riesgoImpreso: string | null;
  notasAdicionales: string | null;
  esFuenteHistorica: boolean;
  competencias: ItemFicha[];
  riesgos: ItemFicha[];
  responsabilidades: ItemFicha[];
  conocimientos: ItemFicha[];
  fuente: {
    documento: string;
    paginaImpresa: number | null;
    paginaPdf: number | null;
    verificacion: string;
  } | null;
};

type Puente = { raw_text: string | null; notes: string | null; sort_order: number };
type FilaDetalle = {
  id: string;
  internal_code: string;
  status: string;
  current_version: {
    id: string;
    version_number: number;
    name: string;
    variant: string | null;
    general_description: string | null;
    specific_description: string | null;
    minimum_education: string | null;
    required_title: string | null;
    minimum_experience: string | null;
    physical_requirement: string | null;
    working_conditions: string | null;
    risk_level_raw: string | null;
    additional_notes: string | null;
    is_historical_source: boolean;
    groupings: { name: string } | null;
    levels: { code: string } | null;
    technical_areas: { name: string } | null;
    risk_levels: { name: string } | null;
    position_version_competencies: (Puente & { competencies: { name: string } | null })[];
    position_version_risks: (Puente & { risks: { name: string } | null })[];
    position_version_responsibilities: (Puente & { responsibilities: { name: string } | null })[];
    position_version_knowledge: (Puente & { knowledge_items: { name: string } | null })[];
    source_references: {
      printed_page_number: number | null;
      pdf_page_number: number | null;
      verification_status: string;
      source_documents: { title: string } | null;
    }[];
  } | null;
};

/** Ordena por sort_order (el orden en que figuran en la ficha) y normaliza. */
function aItems<T extends Puente>(filas: T[], nombre: (f: T) => string | undefined): ItemFicha[] {
  return [...(filas ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => ({
      canonico: nombre(f) ?? "—",
      impreso: f.raw_text,
      notas: f.notes,
    }));
}

/**
 * Trae una ficha completa: la versión vigente con todos sus campos, los ítems de
 * catálogo con su literal impreso, y la procedencia documental.
 * Devuelve `null` si el puesto no existe o RLS no lo deja ver.
 */
export async function obtenerPuesto(id: string): Promise<PuestoDetalle | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("positions")
    .select(
      `id, internal_code, status,
       current_version:position_versions!positions_current_version_fk (
         id, version_number, name, variant,
         general_description, specific_description,
         minimum_education, required_title, minimum_experience,
         physical_requirement, working_conditions,
         risk_level_raw, additional_notes, is_historical_source,
         groupings ( name ), levels ( code ), technical_areas ( name ),
         risk_levels ( name ),
         position_version_competencies ( raw_text, notes, sort_order, competencies ( name ) ),
         position_version_risks ( raw_text, notes, sort_order, risks ( name ) ),
         position_version_responsibilities ( raw_text, notes, sort_order, responsibilities ( name ) ),
         position_version_knowledge ( raw_text, notes, sort_order, knowledge_items ( name ) ),
         source_references (
           printed_page_number, pdf_page_number, verification_status,
           source_documents ( title )
         )
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[puestos] obtenerPuesto:", error.message);
    throw new Error(error.message);
  }
  if (!data) return null;

  const fila = data as unknown as FilaDetalle;
  const v = fila.current_version;
  if (!v) return null;

  const ref = v.source_references?.[0];

  return {
    id: fila.id,
    internalCode: fila.internal_code,
    estado: fila.status,
    versionId: v.id,
    versionNumero: v.version_number,
    nombre: v.name,
    variante: v.variant,
    agrupamiento: v.groupings?.name ?? "—",
    nivel: v.levels?.code ?? null,
    area: v.technical_areas?.name ?? null,
    descripcionGeneral: v.general_description,
    descripcionEspecifica: v.specific_description,
    instruccion: v.minimum_education,
    titulo: v.required_title,
    experiencia: v.minimum_experience,
    requisitoFisico: v.physical_requirement,
    condicionesTrabajo: v.working_conditions,
    riesgo: v.risk_levels?.name ?? null,
    riesgoImpreso: v.risk_level_raw,
    notasAdicionales: v.additional_notes,
    esFuenteHistorica: v.is_historical_source,
    competencias: aItems(v.position_version_competencies, (f) => f.competencies?.name),
    riesgos: aItems(v.position_version_risks, (f) => f.risks?.name),
    responsabilidades: aItems(v.position_version_responsibilities, (f) => f.responsibilities?.name),
    conocimientos: aItems(v.position_version_knowledge, (f) => f.knowledge_items?.name),
    fuente: ref
      ? {
          documento: ref.source_documents?.title ?? "—",
          paginaImpresa: ref.printed_page_number,
          paginaPdf: ref.pdf_page_number,
          verificacion: ref.verification_status,
        }
      : null,
  };
}

export type CambioEnVersion = { campo: string; antes: string | null; despues: string | null };

export type VersionHistorial = {
  id: string;
  numero: number;
  estado: string;
  nombre: string;
  motivo: string | null;
  documentoRespaldo: string | null;
  autor: string;
  fecha: string;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  esFuenteHistorica: boolean;
  /** Qué cambió respecto de la versión anterior. Vacío en la versión 1. */
  cambios: CambioEnVersion[];
};

/** Campos que se comparan entre versiones, con su nombre para mostrar. */
const CAMPOS_COMPARABLES: [string, string][] = [
  ["name", "Nombre"],
  ["variant", "Variante"],
  ["general_description", "Descripción general"],
  ["specific_description", "Descripción específica"],
  ["minimum_education", "Instrucción"],
  ["required_title", "Título"],
  ["minimum_experience", "Antigüedad y experiencia"],
  ["physical_requirement", "Requisito físico"],
  ["working_conditions", "Condiciones de trabajo"],
  ["risk_level_raw", "Nivel de riesgo"],
  ["additional_notes", "Observaciones"],
];

/**
 * Historial de un puesto: todas sus versiones, quién las creó, cuándo y por qué,
 * y qué cambió en cada una respecto de la anterior.
 *
 * El diff se calcula acá comparando versiones consecutivas. `audit_logs` guarda
 * además el registro crudo de cada insert/update (lo escriben los triggers), que
 * sirve para forense pero no para leer.
 *
 * Solo compara campos de texto de la versión. Los cambios en catálogos
 * (competencias, riesgos) se ven entrando a cada versión: contarlos acá pediría
 * traer las puentes de todas las versiones.
 */
export async function obtenerHistorial(positionId: string): Promise<VersionHistorial[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("position_versions")
    .select(
      `id, version_number, validity_status, name, variant,
       general_description, specific_description,
       minimum_education, required_title, minimum_experience,
       physical_requirement, working_conditions, risk_level_raw, additional_notes,
       change_reason, change_document_reference, is_historical_source,
       created_at, valid_from, valid_until,
       profiles ( full_name, email )`,
    )
    .eq("position_id", positionId)
    .order("version_number", { ascending: true });

  if (error) {
    console.error("[puestos] obtenerHistorial:", error.message);
    return [];
  }

  type Fila = Record<string, unknown> & {
    id: string;
    version_number: number;
    validity_status: string;
    name: string;
    change_reason: string | null;
    change_document_reference: string | null;
    is_historical_source: boolean;
    created_at: string;
    valid_from: string | null;
    valid_until: string | null;
    profiles: { full_name: string | null; email: string } | null;
  };

  const filas = (data ?? []) as unknown as Fila[];

  return filas
    .map((f, i) => {
      const previa = i > 0 ? filas[i - 1] : null;
      const cambios: CambioEnVersion[] = [];
      if (previa) {
        for (const [clave, etiqueta] of CAMPOS_COMPARABLES) {
          const antes = (previa[clave] as string | null) ?? null;
          const despues = (f[clave] as string | null) ?? null;
          if (antes !== despues) cambios.push({ campo: etiqueta, antes, despues });
        }
      }
      return {
        id: f.id,
        numero: f.version_number,
        estado: f.validity_status,
        nombre: f.name,
        motivo: f.change_reason,
        documentoRespaldo: f.change_document_reference,
        // El perfil puede faltar si el usuario se borró; la carga inicial la hizo
        // un script sin sesión, así que esas 210 no tienen autor.
        autor: f.profiles?.full_name ?? f.profiles?.email ?? "Carga inicial del nomenclador",
        fecha: f.created_at,
        vigenteDesde: f.valid_from,
        vigenteHasta: f.valid_until,
        esFuenteHistorica: f.is_historical_source,
        cambios,
      };
    })
    .reverse(); // la más reciente primero
}

export type PuestoParaEditar = {
  internalCode: string;
  nombre: string;
  versionNumero: number;
  valores: PuestoFormValues;
};

/**
 * La versión vigente en la forma que espera el formulario, para precargarlo.
 *
 * Reusa `obtenerPuesto` en vez de una consulta propia: la ficha ya trae todo lo
 * necesario. Falta solo resolver los ids de los catálogos, que la ficha no
 * expone porque para mostrar alcanza con el nombre.
 *
 * `change_reason` va vacío a propósito: es del cambio que se está por hacer, no
 * del anterior.
 */
export async function obtenerPuestoParaEditar(
  id: string,
): Promise<PuestoParaEditar | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("positions")
    .select(
      `internal_code,
       current_version:position_versions!positions_current_version_fk (
         version_number, name, variant, grouping_id, level_id, technical_area_id,
         general_description, specific_description,
         minimum_education, required_title, minimum_experience,
         physical_requirement, working_conditions,
         risk_level_id, risk_level_raw, additional_notes,
         position_version_competencies ( competency_id, raw_text, sort_order ),
         position_version_risks ( risk_id, raw_text, sort_order ),
         position_version_responsibilities ( responsibility_id, raw_text, sort_order ),
         position_version_knowledge ( knowledge_item_id, raw_text, sort_order )
       )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[puestos] obtenerPuestoParaEditar:", error.message);
    throw new Error(error.message);
  }
  if (!data) return null;

  type Fila = {
    internal_code: string;
    current_version: (Record<string, unknown> & { version_number: number }) | null;
  };
  const fila = data as unknown as Fila;
  const v = fila.current_version;
  if (!v) return null;

  const items = (filas: unknown, fk: string) =>
    [...((filas ?? []) as Record<string, unknown>[])]
      .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
      .map((f) => ({
        id: f[fk] as string,
        raw_text: (f.raw_text as string | null) ?? undefined,
      }));

  const texto = (k: string) => (v[k] as string | null) ?? undefined;

  return {
    internalCode: fila.internal_code,
    nombre: v.name as string,
    versionNumero: v.version_number,
    valores: {
      name: v.name as string,
      variant: texto("variant"),
      grouping_id: v.grouping_id as string,
      level_id: (v.level_id as string | null) ?? undefined,
      technical_area_id: (v.technical_area_id as string | null) ?? undefined,
      general_description: texto("general_description"),
      specific_description: texto("specific_description"),
      minimum_education: texto("minimum_education"),
      required_title: texto("required_title"),
      minimum_experience: texto("minimum_experience"),
      physical_requirement: texto("physical_requirement"),
      working_conditions: texto("working_conditions"),
      risk_level_id: (v.risk_level_id as string | null) ?? undefined,
      risk_level_raw: texto("risk_level_raw"),
      additional_notes: texto("additional_notes"),
      competencias: items(v.position_version_competencies, "competency_id"),
      riesgos: items(v.position_version_risks, "risk_id"),
      responsabilidades: items(v.position_version_responsibilities, "responsibility_id"),
      conocimientos: items(v.position_version_knowledge, "knowledge_item_id"),
      change_reason: "",
      change_document_reference: undefined,
    },
  };
}
