import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Dotación: quién ocupa cada puesto.
 *
 * Alcance mínimo a propósito (ver cabecera de la migración 0008): identificación
 * y área, nada sensible.
 */

export type PersonaEnPuesto = {
  id: string;
  personaId: string;
  legajo: string;
  nombre: string;
  reparticion: string | null;
  desde: string;
  hasta: string | null;
  activa: boolean;
};

export type PersonaListado = {
  id: string;
  legajo: string;
  nombre: string;
  email: string | null;
  reparticion: string | null;
  activa: boolean;
  puesto: { id: string; nombre: string; internalCode: string } | null;
};

/** Personas asignadas a un puesto. Primero las vigentes. */
export async function listarPersonasDePuesto(
  positionId: string,
): Promise<PersonaEnPuesto[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("asignaciones")
    .select(
      `id, valid_from, valid_until,
       personas ( id, legajo, full_name, is_active, reparticiones ( nombre ) )`,
    )
    .eq("position_id", positionId)
    .order("valid_until", { ascending: true, nullsFirst: true })
    .order("valid_from", { ascending: false });

  if (error) {
    // La 0008 puede no estar aplicada todavía: la ficha no debe romperse por eso.
    console.error("[personas] listarPersonasDePuesto:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    valid_from: string;
    valid_until: string | null;
    personas: {
      id: string;
      legajo: string;
      full_name: string;
      is_active: boolean;
      reparticiones: { nombre: string } | null;
    } | null;
  };

  return ((data ?? []) as unknown as Fila[])
    .filter((f) => f.personas)
    .map((f) => ({
      id: f.id,
      personaId: f.personas!.id,
      legajo: f.personas!.legajo,
      nombre: f.personas!.full_name,
      reparticion: f.personas!.reparticiones?.nombre ?? null,
      desde: f.valid_from,
      hasta: f.valid_until,
      activa: f.personas!.is_active,
    }));
}

/** Todas las personas con su puesto vigente, para el listado. */
export async function listarPersonas(): Promise<PersonaListado[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personas")
    .select(
      `id, legajo, full_name, email, is_active,
       reparticiones ( nombre ),
       asignaciones ( valid_until,
         positions ( id, internal_code,
           current_version:position_versions!positions_current_version_fk ( name )
         )
       )`,
    )
    .order("full_name");

  if (error) {
    console.error("[personas] listarPersonas:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    legajo: string;
    full_name: string;
    email: string | null;
    is_active: boolean;
    reparticiones: { nombre: string } | null;
    asignaciones: {
      valid_until: string | null;
      positions: {
        id: string;
        internal_code: string;
        current_version: { name: string } | null;
      } | null;
    }[];
  };

  return ((data ?? []) as unknown as Fila[]).map((p) => {
    // La vigente es la que no tiene fecha de fin.
    const vigente = p.asignaciones?.find((a) => a.valid_until === null);
    return {
      id: p.id,
      legajo: p.legajo,
      nombre: p.full_name,
      email: p.email,
      reparticion: p.reparticiones?.nombre ?? null,
      activa: p.is_active,
      puesto: vigente?.positions
        ? {
            id: vigente.positions.id,
            nombre: vigente.positions.current_version?.name ?? "—",
            internalCode: vigente.positions.internal_code,
          }
        : null,
    };
  });
}

/** Personas sin puesto asignado, para el selector de la ficha. */
export async function listarPersonasSinPuesto(): Promise<
  { id: string; nombre: string; legajo: string }[]
> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personas")
    .select("id, legajo, full_name, asignaciones ( valid_until )")
    .eq("is_active", true)
    .order("full_name");

  if (error) {
    console.error("[personas] listarPersonasSinPuesto:", error.message);
    return [];
  }

  type Fila = {
    id: string;
    legajo: string;
    full_name: string;
    asignaciones: { valid_until: string | null }[];
  };

  return ((data ?? []) as unknown as Fila[])
    .filter((p) => !p.asignaciones?.some((a) => a.valid_until === null))
    .map((p) => ({ id: p.id, nombre: p.full_name, legajo: p.legajo }));
}
