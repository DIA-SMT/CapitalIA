"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cambioClaveSchema, loginSchema } from "./schema";

export type SignInResult = { error: string };

/**
 * Inicia sesión con email y contraseña (Supabase Auth).
 *
 * La validación se repite en el servidor: nunca se confía solo en el cliente.
 * En éxito, redirige a `redirectTo` (o `/dashboard`). En error, devuelve un
 * mensaje para mostrar en el formulario.
 */
export async function signIn(
  values: unknown,
  redirectTo?: string,
): Promise<SignInResult> {
  if (!isSupabaseConfigured()) {
    return {
      error:
        "La conexión con Supabase no está configurada. Completá las variables de entorno.",
    };
  }

  const parsed = loginSchema.safeParse(values);
  if (!parsed.success) {
    return { error: "Revisá el email y la contraseña ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Credenciales inválidas. Verificá tus datos e intentá de nuevo." };
  }

  const safePath =
    redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
      ? redirectTo
      : "/dashboard";

  redirect(safePath);
}

/** Cierra la sesión y vuelve al login. */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export type CambioClaveResult = { error: string };

/** Traduce los mensajes de Supabase Auth al cambiar la contraseña. */
function traducirErrorClave(m: string): string {
  const s = m.toLowerCase();
  if (s.includes("different from the old")) {
    return "La nueva contraseña tiene que ser distinta de la actual.";
  }
  if (s.includes("at least") || s.includes("too short")) {
    return "La contraseña es demasiado corta.";
  }
  if (s.includes("weak") || s.includes("pwned") || s.includes("compromised")) {
    return "Esa contraseña es demasiado común. Elegí una más segura.";
  }
  if (s.includes("reauthentication") || s.includes("aal")) {
    return "Por seguridad, volvé a iniciar sesión y cambiala de nuevo.";
  }
  console.error("[auth] cambiarClave:", m);
  return "No se pudo cambiar la contraseña. Intentá de nuevo.";
}

/**
 * Cambia la contraseña del usuario autenticado.
 *
 * Usa la sesión propia (no la Admin API): `updateUser` corre con las credenciales
 * del usuario. En éxito baja `must_change_password` con la función de la 0019 y
 * redirige al dashboard; en error devuelve un mensaje para el formulario.
 */
export async function cambiarClave(
  values: unknown,
): Promise<CambioClaveResult> {
  if (!isSupabaseConfigured()) {
    return { error: "La conexión con Supabase no está configurada." };
  }

  const parsed = cambioClaveSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: traducirErrorClave(error.message) };
  }

  // Baja el flag para no volver a exigir el cambio. Si esto fallara, la única
  // consecuencia es que la app vuelva a pedir el cambio: no es un problema de
  // seguridad, así que no se revierte la contraseña ya cambiada.
  await supabase.rpc("marcar_clave_cambiada");

  redirect("/dashboard");
}
