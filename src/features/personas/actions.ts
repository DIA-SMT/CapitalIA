"use server";

import { revalidatePath } from "next/cache";

import { hoy } from "@/lib/fechas";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient, getSessionRole } from "@/lib/supabase/server";
import { listarPersonasSinPuesto, type CandidatosSinPuesto } from "./data/personas";
import { asignacionSchema, edicionPersonaSchema, personaSchema } from "./schemas/persona";

/**
 * Alta de personas y asignación a puestos.
 *
 * Igual que en puestos: la validación se repite en el servidor y el trabajo que
 * toca varias tablas lo hacen funciones de Postgres (migración 0008).
 *
 * Los esquemas viven en schemas/persona.ts: este archivo tiene "use server" y
 * solo puede exportar funciones async.
 */

export type ResultadoPersona = { error: string } | { ok: true };

const SIN_CONFIG = "La conexión con Supabase no está configurada.";

function mensaje(e: { code?: string; message: string }): string {
  if (e.code === "42501") return "No tenés permisos para hacer este cambio.";
  if (e.code === "23505") return "Ya existe una persona con ese legajo.";
  if (e.message.includes("No autorizado")) return "No tenés permisos.";
  if (e.message.includes("no existe") || e.message.includes("archivado")) return e.message;
  console.error("[personas] acción:", e.code, e.message);
  return "No se pudo guardar. Intentá de nuevo.";
}

/**
 * Busca candidatos para asignar, sin recargar la ficha entera.
 *
 * Existe porque el selector no puede ofrecer 4.771 opciones de una: muestra las
 * primeras y el resto se alcanza buscando. No valida permisos a propósito —es
 * una lectura, y el alcance lo pone la RLS de `personas` a través de
 * `personas_sin_puesto`, que corre con los permisos de quien llama.
 */
export async function buscarSinPuesto(q: string): Promise<CandidatosSinPuesto> {
  if (!isSupabaseConfigured()) return { personas: [], total: 0 };
  return listarPersonasSinPuesto(q);
}

/**
 * Da de alta una persona y, si se indicó puesto, la asigna.
 *
 * Son dos operaciones y no una transacción: si el alta sale y la asignación
 * falla, la persona queda cargada sin puesto y se avisa. Es recuperable (se
 * asigna después desde la ficha) y evita una función de base más para un caso
 * que no rompe nada.
 */
export async function crearPersona(values: unknown): Promise<ResultadoPersona> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = personaSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("personas")
    .insert({
      legajo: parsed.data.legajo,
      full_name: parsed.data.full_name,
      email: parsed.data.email ?? null,
      reparticion_id: parsed.data.reparticion_id ?? null,
    })
    .select("id")
    .single();

  if (error) return { error: mensaje(error) };

  if (parsed.data.position_id) {
    const { error: errorAsig } = await supabase.rpc("asignar_persona", {
      p_persona_id: data.id,
      p_position_id: parsed.data.position_id,
      p_desde: hoy(),
      p_notas: null,
    });
    if (errorAsig) {
      revalidatePath("/personas");
      return {
        error: `Se cargó la persona, pero no se pudo asignar al puesto: ${mensaje(errorAsig)} Asignala desde la ficha del puesto.`,
      };
    }
    revalidatePath(`/puestos/${parsed.data.position_id}`);
  }

  revalidatePath("/personas");
  return { ok: true };
}

/**
 * Asigna una persona a un puesto. Si ya ocupaba otro, esa asignación se cierra
 * (no se borra: es la dotación histórica).
 */
export async function asignarPersona(
  positionId: string,
  values: unknown,
): Promise<ResultadoPersona> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const parsed = asignacionSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("asignar_persona", {
    p_persona_id: parsed.data.persona_id,
    p_position_id: positionId,
    p_desde: parsed.data.desde ?? hoy(),
    p_notas: parsed.data.notas ?? null,
  });

  if (error) return { error: mensaje(error) };

  revalidatePath(`/puestos/${positionId}`);
  revalidatePath("/personas");
  return { ok: true };
}

/** Cierra la asignación vigente de una persona. */
/**
 * Corrige una persona ya cargada: nombre, email, repartición y alta/baja.
 *
 * POR QUÉ EXISTE. Las 4.706 personas entraron con la repartición que dice la
 * liquidación, y la liquidación dice dónde se le PAGA a alguien, no siempre dónde
 * trabaja: la Dirección de IA tiene 4 personas y la liquidación imputa 2. Sin esta
 * acción, CapitalIA es una foto de sueldos que nadie puede corregir, y la
 * sincronización mensual no la va a arreglar porque nunca vuelve a escribir
 * `reparticion_id` (ver scripts/importacion/importar.mjs).
 *
 * Solo admin, por la decisión #10 del plan: el director carga y asigna; corregir o
 * dar de baja es de Capital Humano. No hace falta migración —`personas_admin`
 * (0008) ya le da `for all`—, pero se chequea igual acá para dar un mensaje
 * legible en vez de un 42501 pelado.
 *
 * El legajo no se toca: es la clave con la que la sincronización reconoce a la
 * persona.
 */
export async function editarPersona(
  personaId: string,
  values: unknown,
): Promise<ResultadoPersona> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  if ((await getSessionRole()) !== "admin") {
    return { error: "Solo Capital Humano puede corregir o dar de baja personas." };
  }

  const parsed = edicionPersonaSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  }

  const supabase = await createClient();

  // Dar de baja a alguien que ocupa un puesto tiene que cerrar esa asignación: si
  // no, el puesto sigue figurando ocupado por una persona que ya no presta
  // servicios. Va ANTES del update para que un fallo acá no deje el estado a
  // medias con la persona ya inactiva.
  if (!parsed.data.is_active) {
    const { data: abierta } = await supabase
      .from("asignaciones")
      .select("id")
      .eq("persona_id", personaId)
      .is("valid_until", null)
      .maybeSingle();

    if (abierta) {
      const { error: errorCierre } = await supabase.rpc("desasignar_persona", {
        p_persona_id: personaId,
        p_hasta: hoy(),
      });
      if (errorCierre) return { error: mensaje(errorCierre) };
    }
  }

  // `.select()` a propósito: sin él, cero filas afectadas devuelve éxito y la app
  // dice "guardado" sin haber guardado nada. Pasa si la RLS filtró la fila o si el
  // id no existe, y es exactamente el defecto que tiene `actualizarReparticion`.
  const { data, error } = await supabase
    .from("personas")
    .update({
      full_name: parsed.data.full_name,
      email: parsed.data.email ?? null,
      reparticion_id: parsed.data.reparticion_id,
      is_active: parsed.data.is_active,
    })
    .eq("id", personaId)
    .select("id");

  if (error) return { error: mensaje(error) };
  if (!data?.length) {
    return { error: "No se encontró esa persona. Actualizá la página." };
  }

  revalidatePath("/personas");
  return { ok: true };
}

export async function desasignarPersona(
  personaId: string,
  positionId: string,
): Promise<ResultadoPersona> {
  if (!isSupabaseConfigured()) return { error: SIN_CONFIG };

  const supabase = await createClient();
  const { error } = await supabase.rpc("desasignar_persona", {
    p_persona_id: personaId,
    p_hasta: hoy(),
  });

  if (error) return { error: mensaje(error) };

  revalidatePath(`/puestos/${positionId}`);
  revalidatePath("/personas");
  return { ok: true };
}
