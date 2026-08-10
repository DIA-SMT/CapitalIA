"use server";

import { revalidatePath } from "next/cache";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getSessionRole } from "@/lib/supabase/server";
import { crearUsuario } from "@/features/usuarios/actions";
import {
  aprobarAccesoSchema,
  rechazoAccesoSchema,
  solicitudAccesoSchema,
} from "./schemas/solicitud-acceso";

/**
 * Alta y resolución de solicitudes de acceso.
 *
 * El alta la hace cualquiera desde el login (sin sesión) contra `solicitar_acceso`
 * (0020), que es la única vía de escritura. La resolución es solo de admin: rechazar
 * llama a `resolver_solicitud_acceso`, y aprobar reusa `crearUsuario` (Admin API +
 * rol + reparticiones + contraseña temporal) y después marca la solicitud aprobada.
 */

export type ResultadoAcceso = { error: string };
export type ResultadoAprobar =
  | { error: string }
  | { ok: true; clave?: string; aviso?: string };
export type ResultadoOk = { error: string } | { ok: true };

const SIN_CONFIG = "La conexión con Supabase no está configurada.";

async function exigirAdmin(): Promise<string | null> {
  const rol = await getSessionRole();
  return rol === "admin" ? null : "No tenés permisos para gestionar solicitudes.";
}

/**
 * Alta pública: la persona sin cuenta pide acceso desde el login.
 *
 * No revela si el email ya existe o ya pidió: `solicitar_acceso` traga el duplicado
 * pendiente en silencio, así que la respuesta es siempre la misma.
 */
export async function solicitarAcceso(values: unknown): Promise<ResultadoOk> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = solicitudAccesoSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("solicitar_acceso", {
    p_nombre: parsed.data.nombre,
    p_apellido: parsed.data.apellido,
    p_email: parsed.data.email,
    p_legajo: parsed.data.legajo,
  });

  if (error) {
    // Los errores de validación de la función son legibles; el resto, genérico.
    if (error.message.includes("Ingresá")) return { error: error.message };
    console.error("[solicitudes-acceso] solicitar:", error.code, error.message);
    return { error: "No se pudo enviar la solicitud. Intentá de nuevo." };
  }

  return { ok: true };
}

/**
 * Aprueba una solicitud: crea el usuario y marca la solicitud como aprobada.
 *
 * Crea el usuario PRIMERO y resuelve después: al revés, un email ya registrado
 * dejaría la solicitud aprobada sin cuenta detrás. Devuelve la contraseña temporal
 * para mostrarla una vez.
 */
export async function aprobarSolicitudAcceso(
  solicitudId: string,
  values: unknown,
): Promise<ResultadoAprobar> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const sinPermiso = await exigirAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const parsed = aprobarAccesoSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { data: sol, error: errorSol } = await supabase
    .from("solicitudes_acceso")
    .select("email, nombre, apellido, estado")
    .eq("id", solicitudId)
    .maybeSingle();

  if (errorSol) return { error: "No se pudo leer la solicitud. Intentá de nuevo." };
  if (!sol) return { error: "No se encontró la solicitud." };
  if (sol.estado !== "pendiente") {
    return { error: "Esa solicitud ya fue resuelta." };
  }

  // Reusa el alta de usuarios: crea la cuenta con rol, reparticiones y temporal.
  const alta = await crearUsuario({
    email: sol.email,
    full_name: `${sol.nombre} ${sol.apellido}`.trim(),
    role: parsed.data.role,
    reparticiones: parsed.data.reparticiones ?? [],
  });
  if ("error" in alta) return { error: alta.error };

  // Cuenta creada: marca la solicitud aprobada. Si esto fallara, la cuenta ya
  // existe y no se revierte; se avisa para que el admin rechace la que quedó.
  const { error: errorResolver } = await supabase.rpc("resolver_solicitud_acceso", {
    p_id: solicitudId,
    p_estado: "aprobada",
  });

  revalidatePath("/solicitudes-acceso");
  revalidatePath("/usuarios");

  if (errorResolver) {
    console.error(
      "[solicitudes-acceso] aprobar/resolver:",
      errorResolver.code,
      errorResolver.message,
    );
    return {
      ok: true,
      clave: alta.clave,
      aviso:
        "Se creó la cuenta, pero la solicitud quedó pendiente. Rechazala para sacarla de la bandeja.",
    };
  }

  return { ok: true, clave: alta.clave };
}

/** Rechaza una solicitud de acceso indicando el motivo. */
export async function rechazarSolicitudAcceso(
  solicitudId: string,
  values: unknown,
): Promise<ResultadoOk> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const sinPermiso = await exigirAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const parsed = rechazoAccesoSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Indicá el motivo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("resolver_solicitud_acceso", {
    p_id: solicitudId,
    p_estado: "rechazada",
    p_motivo: parsed.data.motivo,
  });

  if (error) {
    if (error.message.includes("ya fue resuelta")) {
      return { error: "Esa solicitud ya fue resuelta por otra persona." };
    }
    console.error("[solicitudes-acceso] rechazar:", error.code, error.message);
    return { error: "No se pudo rechazar la solicitud. Intentá de nuevo." };
  }

  revalidatePath("/solicitudes-acceso");
  return { ok: true };
}
