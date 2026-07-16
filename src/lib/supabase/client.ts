import { createBrowserClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Cliente de Supabase para Client Components.
 *
 * Debe instanciarse dentro de manejadores de eventos / efectos (no en el cuerpo
 * de render) para no ejecutarse durante el prerender del servidor.
 */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
