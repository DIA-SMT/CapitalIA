import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Solicitudes de acceso (pedidos de cuenta desde el login).
 *
 * Solo las ve un admin: la RLS de la 0020 (`solicitudes_acceso_admin_all`) no deja
 * leerlas a nadie más, así que para un no-admin estas consultas devuelven vacío.
 */

export type SolicitudAccesoEstado = "pendiente" | "aprobada" | "rechazada";

export type SolicitudAcceso = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  legajo: string;
  estado: SolicitudAccesoEstado;
  motivoRechazo: string | null;
  creada: string;
  resuelta: string | null;
};

export async function listarSolicitudesAcceso(): Promise<SolicitudAcceso[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("solicitudes_acceso")
    .select(
      `id, nombre, apellido, email, legajo, estado, motivo_rechazo,
       created_at, resuelta_at`,
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[solicitudes-acceso] listar:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    nombre: string;
    apellido: string;
    email: string;
    legajo: string;
    estado: SolicitudAccesoEstado;
    motivo_rechazo: string | null;
    created_at: string;
    resuelta_at: string | null;
  };

  return ((data ?? []) as unknown as Fila[]).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    apellido: s.apellido,
    email: s.email,
    legajo: s.legajo,
    estado: s.estado,
    motivoRechazo: s.motivo_rechazo,
    creada: s.created_at,
    resuelta: s.resuelta_at,
  }));
}

/**
 * Cuántas solicitudes de acceso esperan respuesta, para el badge del menú y el
 * dashboard. Vacío/0 para quien no sea admin (lo resuelve la RLS).
 */
export async function contarSolicitudesAccesoPendientes(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const supabase = await createClient();
  const { count, error } = await supabase
    .from("solicitudes_acceso")
    .select("*", { count: "exact", head: true })
    .eq("estado", "pendiente");

  if (error) {
    console.error("[solicitudes-acceso] contar:", error.message);
    return 0;
  }
  return count ?? 0;
}
