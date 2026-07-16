"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { archivarSchema, puestoSchema, type PuestoFormParsed } from "./schemas/puesto";

/**
 * Mutaciones del nomenclador.
 *
 * La validación se repite acá aunque el formulario ya valide: el cliente se
 * puede saltear. El trabajo real lo hacen funciones de Postgres (migración
 * 0007) porque cada operación toca varias tablas y tiene que ser atómica; ver
 * el comentario de esa migración.
 */

export type ResultadoAccion = { error: string } | { ok: true; id?: string };

const SIN_CONFIG =
  "La conexión con Supabase no está configurada. Completá las variables de entorno.";

/** Traduce errores de Postgres a algo que el usuario pueda entender. */
function mensajeDeError(error: { code?: string; message: string }): string {
  if (error.code === "42501") {
    return "No tenés permisos para hacer este cambio.";
  }
  if (error.message.includes("obligatorio")) {
    return error.message;
  }
  if (error.code === "23505") {
    return "Ya existe un registro con esos datos.";
  }
  console.error("[puestos] acción:", error.code, error.message);
  return "No se pudo guardar el cambio. Intentá de nuevo.";
}

/** Arma los parámetros comunes de las funciones de base. */
function parametros(d: PuestoFormParsed) {
  return {
    p_grouping_id: d.grouping_id,
    p_level_id: d.level_id ?? null,
    p_technical_area_id: d.technical_area_id ?? null,
    p_name: d.name,
    p_variant: d.variant ?? null,
    p_general_description: d.general_description ?? null,
    p_specific_description: d.specific_description ?? null,
    p_minimum_education: d.minimum_education ?? null,
    p_required_title: d.required_title ?? null,
    p_minimum_experience: d.minimum_experience ?? null,
    p_physical_requirement: d.physical_requirement ?? null,
    p_working_conditions: d.working_conditions ?? null,
    p_risk_level_id: d.risk_level_id ?? null,
    p_risk_level_raw: d.risk_level_raw ?? null,
    p_additional_notes: d.additional_notes ?? null,
    p_change_reason: d.change_reason,
    p_change_document_reference: d.change_document_reference ?? null,
    p_competencias: d.competencias,
    p_riesgos: d.riesgos,
    p_responsabilidades: d.responsabilidades,
    p_conocimientos: d.conocimientos,
  };
}

/**
 * Crea una versión nueva de un puesto. La anterior pasa a histórica y se
 * conserva entera: nunca se sobreescribe una ficha.
 */
export async function crearVersion(
  positionId: string,
  values: unknown,
): Promise<ResultadoAccion> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = puestoSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos del formulario." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_version_puesto", {
    p_position_id: positionId,
    ...parametros(parsed.data),
  });

  if (error) return { error: mensajeDeError(error) };

  revalidatePath("/puestos");
  revalidatePath(`/puestos/${positionId}`);
  revalidatePath("/dashboard");
  return { ok: true, id: positionId };
}

/** Da de alta un puesto nuevo. El código interno lo genera la base. */
export async function crearPuesto(values: unknown): Promise<ResultadoAccion> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = puestoSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos del formulario." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crear_puesto", parametros(parsed.data));

  if (error) return { error: mensajeDeError(error) };

  revalidatePath("/puestos");
  revalidatePath("/dashboard");
  redirect(`/puestos/${data as string}`);
}

/**
 * Baja lógica de un puesto que ya no existe en el organigrama.
 * No borra: el nomenclador conserva lo que existió.
 */
export async function archivarPuesto(
  positionId: string,
  values: unknown,
): Promise<ResultadoAccion> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = archivarSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Indicá el motivo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("archivar_puesto", {
    p_position_id: positionId,
    p_motivo: parsed.data.motivo,
  });

  if (error) return { error: mensajeDeError(error) };

  revalidatePath("/puestos");
  revalidatePath(`/puestos/${positionId}`);
  revalidatePath("/dashboard");
  return { ok: true, id: positionId };
}

/** Restaura un puesto archivado. */
export async function restaurarPuesto(positionId: string): Promise<ResultadoAccion> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const supabase = await createClient();
  const { error } = await supabase.rpc("restaurar_puesto", { p_position_id: positionId });

  if (error) return { error: mensajeDeError(error) };

  revalidatePath("/puestos");
  revalidatePath(`/puestos/${positionId}`);
  revalidatePath("/dashboard");
  return { ok: true, id: positionId };
}
