import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { SUPABASE_URL } from "./config";

/**
 * Cliente con `service_role`. ⚠️ SALTEA TODA LA RLS.
 *
 * Dos usos, y ninguno más:
 *
 * 1. Crear usuarios en Supabase Auth: la Admin API no acepta la anon key.
 * 2. Leer el padrón para `/api/padron`, que consume otro sistema municipal. Ahí
 *    no hay sesión de nadie, así que la RLS por repartición no devolvería ni una
 *    fila —no poco: ninguna—.
 *
 * Todo lo demás sigue yendo por el cliente normal, con la sesión del usuario y su
 * RLS.
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
