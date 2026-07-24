"use server";

import { revalidatePath } from "next/cache";

import { hoy } from "@/lib/fechas";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { asignacionSchema, personaSchema } from "./schemas/persona";

/**
 * Alta de personas y asignación a puestos.
 *
 * Igual que en puestos: la validación se repite en el servidor y el trabajo que
 * toca varias tablas lo hacen funciones de Postgres (migración 0008).
 *
 * Los esquemas viven en schemas/persona.ts: este archivo tiene "use server" y
 * solo puede exportar funciones async.
 */

export type ResultadoPersona = { error: string } | { ok: true };

const SIN_CONFIG = "La conexión con Supabase no está configurada.";

function mensaje(e: { code?: string; message: string }): string {
  if (e.code === "42501") return "No tenés permisos para hacer este cambio.";
  if (e.code === "23505") return "Ya existe una persona con ese legajo.";
  if (e.message.includes("No autorizado")) return "No tenés permisos.";
  if (e.message.includes("no existe") || e.message.includes("archivado")) return e.message;
  console.error("[personas] acción:", e.code, e.message);
  return "No se pudo guardar. Intentá de nuevo.";
}

/**
 * Da de alta una persona y, si se indicó puesto, la asigna.
 *
 * Son dos operaciones y no una transacción: si el alta sale y la asignación
 * falla, la persona queda cargada sin puesto y se avisa. Es recuperable (se
 * asigna después desde la ficha) y evita una función de base más para un caso
 * que no rompe nada.
 */
export async function crearPersona(values: unknown): Promise<ResultadoPersona> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = personaSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personas")
    .insert({
      legajo: parsed.data.legajo,
      full_name: parsed.data.full_name,
      email: parsed.data.email ?? null,
      reparticion_id: parsed.data.reparticion_id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: mensaje(error) };

  if (parsed.data.position_id) {
    const { error: errorAsig } = await supabase.rpc("asignar_persona", {
      p_persona_id: data.id,
      p_position_id: parsed.data.position_id,
      p_desde: hoy(),
      p_notas: null,
    });
    if (errorAsig) {
      revalidatePath("/personas");
      return {
        error: `Se cargó la persona, pero no se pudo asignar al puesto: ${mensaje(errorAsig)} Asignala desde la ficha del puesto.`,
      };
    }
    revalidatePath(`/puestos/${parsed.data.position_id}`);
  }

  revalidatePath("/personas");
  return { ok: true };
}

/**
 * Asigna una persona a un puesto. Si ya ocupaba otro, esa asignación se cierra
 * (no se borra: es la dotación histórica).
 */
export async function asignarPersona(
  positionId: string,
  values: unknown,
): Promise<ResultadoPersona> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = asignacionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("asignar_persona", {
    p_persona_id: parsed.data.persona_id,
    p_position_id: positionId,
    p_desde: parsed.data.desde ?? hoy(),
    p_notas: parsed.data.notas ?? null,
  });

  if (error) return { error: mensaje(error) };

  revalidatePath(`/puestos/${positionId}`);
  revalidatePath("/personas");
  return { ok: true };
}

/** Cierra la asignación vigente de una persona. */
export async function desasignarPersona(
  personaId: string,
  positionId: string,
): Promise<ResultadoPersona> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const supabase = await createClient();
  const { error } = await supabase.rpc("desasignar_persona", {
    p_persona_id: personaId,
    p_hasta: hoy(),
  });

  if (error) return { error: mensaje(error) };

  revalidatePath(`/puestos/${positionId}`);
  revalidatePath("/personas");
  return { ok: true };
}
