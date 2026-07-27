import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getSessionUser } from "@/lib/supabase/server";

/**
 * Solicitudes de puestos nuevos.
 *
 * El alcance de lo que se ve lo resuelve la RLS (migración 0013): el admin ve
 * todas; el director, solo las de su repartición.
 */

export type SolicitudEstado = "pendiente" | "aprobada" | "rechazada";

export type Solicitud = {
  id: string;
  nombre: string;
  descripcion: string;
  estado: SolicitudEstado;
  reparticion: string | null;
  solicitante: string | null;
  motivoRechazo: string | null;
  creada: string;
  resuelta: string | null;
  puesto: { id: string; internalCode: string } | null;
};

export async function listarSolicitudes(): Promise<Solicitud[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes")
    .select(
      `id, nombre, descripcion, estado, motivo_rechazo, created_at, resuelta_at,
       reparticiones ( nombre ),
       solicitante:profiles!solicitudes_solicitante_id_fkey ( full_name, email ),
       positions ( id, internal_code )`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[solicitudes] listarSolicitudes:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    nombre: string;
    descripcion: string;
    estado: SolicitudEstado;
    motivo_rechazo: string | null;
    created_at: string;
    resuelta_at: string | null;
    reparticiones: { nombre: string } | null;
    solicitante: { full_name: string | null; email: string } | null;
    positions: { id: string; internal_code: string } | null;
  };

  return ((data ?? []) as unknown as Fila[]).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    descripcion: s.descripcion,
    estado: s.estado,
    reparticion: s.reparticiones?.nombre ?? null,
    solicitante: s.solicitante?.full_name ?? s.solicitante?.email ?? null,
    motivoRechazo: s.motivo_rechazo,
    creada: s.created_at,
    resuelta: s.resuelta_at,
    puesto: s.positions
      ? { id: s.positions.id, internalCode: s.positions.internal_code }
      : null,
  }));
}

/** Una solicitud puntual, para precargar el formulario al evaluarla. */
export async function obtenerSolicitud(id: string): Promise<Solicitud | null> {
  const todas = await listarSolicitudes();
  return todas.find((s) => s.id === id) ?? null;
}

/**
 * Reparticiones para las que el usuario puede pedir un puesto.
 *
 * El director, solo las suyas. El admin puede pedir para cualquiera, así que si
 * no tiene ninguna asignada se le ofrecen todas.
 */
export async function listarReparticionesParaSolicitar(
  esAdmin: boolean,
): Promise<{ id: string; nombre: string }[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("perfil_reparticiones")
    .select("reparticiones ( id, nombre )")
    .eq("perfil_id", user.id);

  if (error) console.error("[solicitudes] mis reparticiones:", error.message);

  type Fila = { reparticiones: { id: string; nombre: string } | null };
  const propias = ((data ?? []) as unknown as Fila[])
    .map((f) => f.reparticiones)
    .filter((r): r is { id: string; nombre: string } => r !== null);

  if (propias.length > 0) return propias.sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (!esAdmin) return [];

  const { data: todas } = await supabase
    .from("reparticiones")
    .select("id, nombre")
    .eq("is_active", true)
    .order("nombre");
  return (todas ?? []) as { id: string; nombre: string }[];
}
