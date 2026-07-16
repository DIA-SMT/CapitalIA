"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loginSchema } from "./schema";

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
