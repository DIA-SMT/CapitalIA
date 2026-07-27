"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createAdminClient, isAdminApiConfigured } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getSessionRole, getSessionUser } from "@/lib/supabase/server";
import { cambioUsuarioSchema, usuarioSchema } from "./schemas/usuario";

/**
 * Alta y edición de usuarios del sistema.
 *
 * Crear una cuenta necesita la Admin API de Supabase, que solo funciona con la
 * `service_role` key — y esa clave saltea la RLS. Por eso TODA acción de este
 * archivo verifica primero que quien la invoca sea admin: es el único control que
 * queda cuando la clave está en juego.
 *
 * La contraseña es temporal y se muestra UNA vez, para que Capital Humano se la
 * pase al usuario por fuera del sistema (no hay envío de mails configurado).
 */

export type ResultadoUsuario =
  | { error: string }
  | { ok: true; clave?: string };

const SIN_CONFIG = "La conexión con Supabase no está configurada.";

/**
 * Contraseña temporal legible para dictar por teléfono: sin I, O, 0 ni 1, que se
 * confunden al leerlas en voz alta.
 */
function generarClaveTemporal(): string {
  const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bloque = () =>
    Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  return `Muni-${bloque()}-${bloque()}`;
}

/** Puerta común: nadie toca usuarios si no es admin activo. */
async function exigirAdmin(): Promise<string | null> {
  const rol = await getSessionRole();
  return rol === "admin" ? null : "No tenés permisos para gestionar usuarios.";
}

function mensaje(e: { code?: string; message: string }): string {
  const m = e.message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered")) {
    return "Ya existe un usuario con ese email.";
  }
  if (e.code === "42501") return "No tenés permisos para hacer este cambio.";
  console.error("[usuarios] acción:", e.code, e.message);
  return "No se pudo completar la operación. Intentá de nuevo.";
}

/** Reemplaza las reparticiones a cargo de un usuario. */
async function fijarReparticiones(
  perfilId: string,
  reparticiones: string[],
  actorId: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { error: errorBorrar } = await supabase
    .from("perfil_reparticiones")
    .delete()
    .eq("perfil_id", perfilId);
  if (errorBorrar) return mensaje(errorBorrar);

  if (reparticiones.length === 0) return null;

  const { error } = await supabase.from("perfil_reparticiones").insert(
    reparticiones.map((reparticionId) => ({
      perfil_id: perfilId,
      reparticion_id: reparticionId,
      created_by: actorId,
    })),
  );
  return error ? mensaje(error) : null;
}

/**
 * Crea la cuenta y le deja su rol y sus reparticiones.
 *
 * Devuelve la contraseña temporal para mostrarla una vez. El trigger
 * `handle_new_user` crea el perfil como 'director'; acá se corrige al rol pedido.
 */
export async function crearUsuario(values: unknown): Promise<ResultadoUsuario> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };
  if (!isAdminApiConfigured()) {
    return {
      error:
        "Falta la clave de servicio de Supabase (SUPABASE_SERVICE_ROLE_KEY) para poder crear usuarios.",
    };
  }

  const sinPermiso = await exigirAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const parsed = usuarioSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const actor = await getSessionUser();
  if (!actor) return { error: "Sesión vencida. Volvé a entrar." };

  const clave = generarClaveTemporal();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: clave,
    // Sin envío de mails no hay forma de confirmar la casilla: se da por buena.
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (error) return { error: mensaje(error) };
  const nuevoId = data.user?.id;
  if (!nuevoId) return { error: "No se pudo crear el usuario." };

  // El perfil ya existe (lo creó el trigger) con rol 'director' por defecto.
  const supabase = await createClient();
  const { error: errorPerfil } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role, full_name: parsed.data.full_name })
    .eq("id", nuevoId);
  if (errorPerfil) {
    return {
      error: `Se creó la cuenta pero no se pudo fijar el rol: ${mensaje(errorPerfil)} Corregilo desde la lista.`,
    };
  }

  const errorRep = await fijarReparticiones(
    nuevoId,
    parsed.data.reparticiones,
    actor.id,
  );
  if (errorRep) {
    return {
      error: `Se creó la cuenta pero no se pudieron asignar las reparticiones: ${errorRep} Corregilo desde la lista.`,
    };
  }

  revalidatePath("/usuarios");
  return { ok: true, clave };
}

/** Cambia rol, reparticiones y estado (activo/inactivo) de un usuario. */
export async function actualizarUsuario(
  usuarioId: string,
  values: unknown,
): Promise<ResultadoUsuario> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const sinPermiso = await exigirAdmin();
  if (sinPermiso) return { error: sinPermiso };

  const parsed = cambioUsuarioSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const actor = await getSessionUser();
  if (!actor) return { error: "Sesión vencida. Volvé a entrar." };

  // Quitarse a uno mismo el admin (o desactivarse) deja el sistema sin quien lo
  // administre y sin forma de volver atrás desde la app.
  if (actor.id === usuarioId && (parsed.data.role !== "admin" || !parsed.data.is_active)) {
    return { error: "No podés quitarte a vos mismo el acceso de administrador." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role, is_active: parsed.data.is_active })
    .eq("id", usuarioId);
  if (error) return { error: mensaje(error) };

  const errorRep = await fijarReparticiones(
    usuarioId,
    parsed.data.reparticiones,
    actor.id,
  );
  if (errorRep) return { error: errorRep };

  revalidatePath("/usuarios");
  return { ok: true };
}
