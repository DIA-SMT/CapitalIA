"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getSessionRole } from "@/lib/supabase/server";
import { reparticionSchema } from "./schemas/reparticion";

/**
 * Alta y edición del organigrama.
 *
 * Toca una sola tabla, así que va por el cliente normal (con RLS) y no por una
 * función de Postgres: la regla del proyecto es usar funciones cuando la
 * operación abarca varias tablas y tiene que ser atómica.
 *
 * Nada se borra: una repartición que ya no existe se DESACTIVA. Tiene personas,
 * usuarios y solicitudes colgando, y el historial tiene que seguir cerrando.
 */

export type ResultadoReparticion = { error: string } | { ok: true };

const SIN_CONFIG = "La conexión con Supabase no está configurada.";

function mensaje(e: { code?: string; message: string }): string {
  if (e.code === "23505") return "Ya existe una repartición con ese código.";
  if (e.code === "42501") return "No tenés permisos para hacer este cambio.";
  if (e.message.includes("depender de sí misma")) {
    return "No podés hacer que dependa de sí misma ni de una que dependa de ella.";
  }
  if (e.message.includes("ciclo") || e.message.includes("profunda")) {
    return "Esa dependencia arma un círculo en el organigrama.";
  }
  console.error("[reparticiones] acción:", e.code, e.message);
  return "No se pudo guardar. Intentá de nuevo.";
}

async function exigirAdmin(): Promise<string | null> {
  const rol = await getSessionRole();
  return rol === "admin" ? null : "No tenés permisos para editar el organigrama.";
}

export async function crearReparticion(values: unknown): Promise<ResultadoReparticion> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const sinPermiso = await exigirAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const parsed = reparticionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reparticiones").insert({
    code: parsed.data.code,
    nombre: parsed.data.nombre,
    parent_id: parsed.data.parent_id ?? null,
    is_active: parsed.data.is_active,
  });

  if (error) return { error: mensaje(error) };

  revalidatePath("/reparticiones");
  redirect("/reparticiones");
}

export async function actualizarReparticion(
  id: string,
  values: unknown,
): Promise<ResultadoReparticion> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const sinPermiso = await exigirAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const parsed = reparticionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  // `.select()` a propósito: sin él, cero filas afectadas devuelve éxito y la app
  // redirige anunciando "Repartición actualizada" sin haber guardado nada. Pasa si
  // la RLS filtró la fila o si el id ya no existe —una unidad borrada desde el SQL
  // Editor, por ejemplo—, y es el defecto que `editarPersona` ya había esquivado.
  const { data, error } = await supabase
    .from("reparticiones")
    .update({
      code: parsed.data.code,
      nombre: parsed.data.nombre,
      parent_id: parsed.data.parent_id ?? null,
      is_active: parsed.data.is_active,
    })
    .eq("id", id)
    .select("id");

  if (error) return { error: mensaje(error) };
  if (!data?.length) {
    return { error: "No se encontró esa repartición. Actualizá la página." };
  }

  revalidatePath("/reparticiones");
  redirect("/reparticiones");
}
