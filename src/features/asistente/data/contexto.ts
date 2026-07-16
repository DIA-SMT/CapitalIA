import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Arma el nomenclador completo como texto, para pasárselo al modelo.
 *
 * Son ~61k tokens: entra entero en el contexto. Por eso este asistente NO usa
 * embeddings, chunks ni base vectorial. Toda esa maquinaria existe para
 * documentos que no entran; este entra, y pasarlo completo es más simple y más
 * exacto — no hay chunk que se pierda ni similitud que falle.
 *
 * ALCANCE: solo puestos. La dotación (personas) queda deliberadamente afuera;
 * ver `roadmap.md` Etapa 7 y `CONTEXT.md` §4.
 */

type Puente<K extends string> = Record<K, { name: string } | null>;

type Fila = {
  internal_code: string;
  current_version: {
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
    groupings: { name: string } | null;
    levels: { code: string } | null;
    technical_areas: { name: string } | null;
    risk_levels: { name: string } | null;
    position_version_competencies: Puente<"competencies">[];
    position_version_risks: Puente<"risks">[];
    position_version_responsibilities: Puente<"responsibilities">[];
    position_version_knowledge: Puente<"knowledge_items">[];
    source_references: { printed_page_number: number | null }[];
  } | null;
};

export async function construirContextoNomenclador(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("positions")
    .select(
      `internal_code,
       current_version:position_versions!positions_current_version_fk (
         name, variant, general_description, specific_description,
         minimum_education, required_title, minimum_experience,
         physical_requirement, working_conditions, risk_level_raw,
         groupings ( name ), levels ( code ), technical_areas ( name ),
         risk_levels ( name ),
         position_version_competencies ( competencies ( name ) ),
         position_version_risks ( risks ( name ) ),
         position_version_responsibilities ( responsibilities ( name ) ),
         position_version_knowledge ( knowledge_items ( name ) ),
         source_references ( printed_page_number )
       )`,
    )
    .neq("status", "archived")
    .order("internal_code");

  if (error) {
    console.error("[asistente] construirContexto:", error.message);
    return null;
  }

  const filas = ((data ?? []) as unknown as Fila[]).filter((f) => f.current_version);
  if (filas.length === 0) return null;

  const nombres = <K extends string>(fs: Puente<K>[] | undefined, k: K) =>
    (fs ?? []).map((f) => f[k]?.name).filter(Boolean).join("; ");

  const fichas = filas.map((f) => {
    const v = f.current_version!;
    const clas = v.technical_areas?.name
      ? `Técnico / ${v.technical_areas.name}`
      : `${v.groupings?.name ?? "—"} / Nivel ${v.levels?.code ?? "—"}`;

    const lineas = [
      `### ${v.name}${v.variant ? ` "${v.variant}"` : ""} [${f.internal_code}]`,
      `Agrupamiento: ${v.groupings?.name ?? "—"} | Clasificación: ${clas}`,
    ];
    const campo = (etiqueta: string, valor: string | null | undefined) => {
      if (valor) lineas.push(`${etiqueta}: ${valor}`);
    };
    campo("Descripción general", v.general_description);
    campo("Descripción específica", v.specific_description);
    campo("Instrucción", v.minimum_education);
    campo("Título", v.required_title);
    campo("Antigüedad y experiencia", v.minimum_experience);
    campo("Otros conocimientos", nombres(v.position_version_knowledge, "knowledge_items"));
    campo("Competencias", nombres(v.position_version_competencies, "competencies"));
    campo("Requisito físico", v.physical_requirement);
    campo("Condiciones de trabajo", v.working_conditions);
    campo("Riesgos de trabajo", nombres(v.position_version_risks, "risks"));
    campo("Nivel de riesgo", v.risk_levels?.name ?? v.risk_level_raw);
    campo("Responsabilidad sobre", nombres(v.position_version_responsibilities, "responsibilities"));

    const pag = v.source_references?.[0]?.printed_page_number;
    if (pag) lineas.push(`Página del nomenclador impreso: ${pag}`);

    return lineas.join("\n");
  });

  return [
    `# Nomenclador de Puestos — Municipalidad de San Miguel de Tucumán`,
    `Impreso en septiembre de 2016. ${filas.length} puestos.`,
    ``,
    fichas.join("\n\n"),
  ].join("\n");
}
