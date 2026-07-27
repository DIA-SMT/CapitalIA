import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Usuarios del sistema (perfiles de Supabase Auth) y su alcance.
 *
 * Solo lo ve un admin: la RLS de `profiles` deja que cada usuario lea su propia
 * fila y que el admin las lea todas.
 */

export type UsuarioListado = {
  id: string;
  email: string;
  nombre: string | null;
  rol: string;
  activo: boolean;
  reparticiones: { id: string; nombre: string }[];
};

export async function listarUsuarios(): Promise<UsuarioListado[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      // perfil_reparticiones tiene dos FK a profiles (perfil_id y created_by):
      // hay que nombrar la relación o PostgREST no sabe por cuál embeber.
      `id, email, full_name, role, is_active,
       perfil_reparticiones!perfil_reparticiones_perfil_id_fkey (
         reparticiones ( id, nombre )
       )`,
    )
    .order("email");

  if (error) {
    console.error("[usuarios] listarUsuarios:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
    perfil_reparticiones: { reparticiones: { id: string; nombre: string } | null }[];
  };

  return ((data ?? []) as unknown as Fila[]).map((p) => ({
    id: p.id,
    email: p.email,
    nombre: p.full_name,
    rol: p.role,
    activo: p.is_active,
    reparticiones: (p.perfil_reparticiones ?? [])
      .map((pr) => pr.reparticiones)
      .filter((r): r is { id: string; nombre: string } => r !== null)
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
  }));
}

// El selector de reparticiones del panel usa `listarReparticionesPlanas` de
// features/reparticiones: es el mismo árbol aplanado que consume el alta de
// personas, y tenerlo en un solo lugar evita que se desincronicen.
