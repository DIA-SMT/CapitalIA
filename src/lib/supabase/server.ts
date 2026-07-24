import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 *
 * En Server Components la escritura de cookies no está permitida; el `setAll`
 * se envuelve en try/catch porque el refresco de sesión lo maneja el middleware.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Invocado desde un Server Component: lo ignora (lo cubre el middleware).
        }
      },
    },
  });
}

/**
 * Devuelve el usuario autenticado validado contra el servidor de Auth, o `null`.
 * Nunca lanza: si Supabase no está configurado o no hay sesión, retorna `null`.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  if (!isSupabaseConfigured()) return null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
  } catch {
    return null;
  }
});

/**
 * Rol de aplicación del usuario actual ('admin' | 'director') o null. Cacheado por
 * request: se puede llamar desde el layout y varias páginas sin repetir la consulta.
 * La RLS de profiles permite a cada usuario leer su propia fila.
 */
export const getSessionRole = cache(
  async (): Promise<"admin" | "director" | null> => {
    const user = await getSessionUser();
    if (!user) return null;
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      const role = data?.role;
      return role === "admin" || role === "director" ? role : null;
    } catch {
      return null;
    }
  },
);
