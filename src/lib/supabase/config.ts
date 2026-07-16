/**
 * Configuración compartida de Supabase.
 *
 * Las variables se leen desde el entorno (ver `.env.example`). `isSupabaseConfigured`
 * permite que la app arranque (y que `build` funcione) aún sin credenciales,
 * mostrando estados de configuración en lugar de romper.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}
