"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { rechazoSchema, solicitudSchema } from "./schemas/solicitud";

/**
 * Alta y resolución de solicitudes de puestos nuevos.
 *
 * Igual que en el resto: la validación se repite en el servidor y el trabajo lo
 * hacen funciones de Postgres (migración 0013), que re-chequean los permisos por
 * dentro. La aprobación vive en `features/puestos/actions.ts` porque va con la
 * ficha técnica completa.
 */

export type ResultadoSolicitud = { error: string } | { ok: true };

const SIN_CONFIG = "La conexión con Supabase no está configurada.";

function mensaje(e: { code?: string; message: string }): string {
  if (e.code === "42501" || e.message.includes("No autorizado")) {
    return "No tenés permisos para hacer esto.";
  }
  if (e.message.includes("obligatorio") || e.message.includes("Describí")) {
    return e.message;
  }
  if (e.message.includes("ya fue resuelta")) {
    return "Esa solicitud ya fue resuelta por otra persona.";
  }
  console.error("[solicitudes] acción:", e.code, e.message);
  return "No se pudo completar la operación. Intentá de nuevo.";
}

/** Crea una solicitud de puesto nuevo (director para su repartición, o admin). */
export async function crearSolicitud(values: unknown): Promise<ResultadoSolicitud> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = solicitudSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_solicitud", {
    p_nombre: parsed.data.nombre,
    p_descripcion: parsed.data.descripcion,
    p_reparticion_id: parsed.data.reparticion_id,
  });

  if (error) return { error: mensaje(error) };

  revalidatePath("/solicitudes");
  return { ok: true };
}

/** Rechaza una solicitud indicando el motivo, que ve el solicitante. */
export async function rechazarSolicitud(
  solicitudId: string,
  values: unknown,
): Promise<ResultadoSolicitud> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = rechazoSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Indicá el motivo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("rechazar_solicitud", {
    p_solicitud_id: solicitudId,
    p_motivo: parsed.data.motivo,
  });

  if (error) return { error: mensaje(error) };

  revalidatePath("/solicitudes");
  return { ok: true };
}
