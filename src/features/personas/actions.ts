"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Alta de personas y asignación a puestos.
 *
 * Igual que en puestos: la validación se repite en el servidor y el trabajo que
 * toca varias tablas lo hacen funciones de Postgres (migración 0008).
 */

export const personaSchema = z.object({
  legajo: z.string().trim().min(1, "El legajo es obligatorio").max(30),
  full_name: z.string().trim().min(3, "El nombre es obligatorio").max(200),
  email: z
    .union([z.email("Email inválido"), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  area: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export const asignacionSchema = z.object({
  persona_id: z.uuid("Elegí una persona"),
  desde: z.iso.date().optional(),
  notas: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

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

/** Da de alta una persona. Sin asignar a ningún puesto todavía. */
export async function crearPersona(values: unknown): Promise<ResultadoPersona> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = personaSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("personas").insert({
    legajo: parsed.data.legajo,
    full_name: parsed.data.full_name,
    email: parsed.data.email ?? null,
    area: parsed.data.area ?? null,
  });

  if (error) return { error: mensaje(error) };

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
    p_desde: parsed.data.desde ?? new Date().toISOString().slice(0, 10),
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
    p_hasta: new Date().toISOString().slice(0, 10),
  });

  if (error) return { error: mensaje(error) };

  revalidatePath(`/puestos/${positionId}`);
  revalidatePath("/personas");
  return { ok: true };
}
