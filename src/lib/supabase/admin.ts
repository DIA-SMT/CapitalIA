import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL } from "./config";

/**
 * Cliente con `service_role`. ⚠️ SALTEA TODA LA RLS.
 *
 * Existe por una sola razón: crear usuarios en Supabase Auth (la Admin API no
 * acepta la anon key). No se usa para leer ni escribir datos del dominio — eso
 * sigue yendo por el cliente normal, con la sesión del usuario y su RLS.
 *
 * `server-only` impide que este módulo entre en un bundle del navegador. Aun así,
 * **quien lo invoque tiene que verificar por su cuenta que el usuario es admin**:
 * la clave no distingue quién la usa.
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isAdminApiConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0;
}

export function createAdminClient() {
  return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
