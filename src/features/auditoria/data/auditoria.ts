import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/**
 * Bitácora: todo lo que se hizo sobre el nomenclador, quién y cuándo.
 *
 * La escriben los triggers `record_audit()` sobre `positions`,
 * `position_versions`, `personas` y `asignaciones` (migraciones 0003 y 0008).
 * Hasta ahora se escribía y nadie la leía.
 *
 * Dos cosas importantes sobre `audit_logs`:
 *
 * 1. La columna `diff` NO es un diff: guarda `to_jsonb(new)`, o sea el snapshot
 *    completo de la fila después del cambio. Para saber qué cambió respecto de
 *    lo anterior hay que comparar contra el registro previo, y eso ya lo hace
 *    `obtenerHistorial()` en la ficha de cada puesto. Acá se usa el snapshot solo
 *    para describir el hecho (qué puesto, qué motivo, qué estado quedó) y se
 *    linkea a la ficha para el detalle campo por campo. No se re-implementa.
 *
 * 2. `actor_id` nulo significa "se hizo sin sesión", no "es de 2016". Hoy son los
 *    641 registros: la ingesta de las 210 fichas más un puñado de correcciones
 *    técnicas hechas por SQL directo (entre ellas el borrado del puesto duplicado
 *    que menciona CONTEXT.md §3, que el trigger registró antes de que lo
 *    desactivaran a mano). Por eso el filtro por defecto se llama "desde la app" y
 *    no "cambios posteriores al original": de ahora en más todo cambio real entra
 *    con sesión, pero lo que ya está no se puede atribuir a nadie.
 *
 *    Consecuencia operativa: un cambio hecho desde el SQL Editor de Supabase no
 *    aparece en la vista por defecto. Queda registrado, pero sin autor.
 *
 * Filtros y paginación van del lado del servidor, a diferencia de `/puestos`, que
 * filtra en el cliente. Ahí son 210 filas y no crecen; acá la tabla crece con cada
 * cambio y traerla entera se rompe solo con el tiempo.
 */

/** Tablas que tienen trigger de auditoría, con su etiqueta para mostrar. */
export const TABLAS_AUDITADAS: Record<string, string> = {
  positions: "Puestos",
  position_versions: "Versiones",
  personas: "Personas",
  asignaciones: "Asignaciones",
};

export const ACCIONES: Record<string, string> = {
  insert: "Alta",
  update: "Modificación",
  delete: "Baja",
};

export type FiltrosAuditoria = {
  tabla?: string;
  accion?: string;
  /**
   * Si es false (por defecto), deja a la vista solo lo hecho desde la app, con
   * usuario identificado: en la práctica, lo que se apartó del nomenclador
   * impreso.
   */
  incluirSinSesion?: boolean;
  pagina?: number;
};

export type EventoAuditoria = {
  id: string;
  fecha: string;
  /** Qué pasó, en una línea legible. */
  descripcion: string;
  /** Sobre qué objeto, con su link si se puede resolver. */
  objeto: string;
  href: string | null;
  /** Motivo del cambio, cuando la versión lo declara. */
  motivo: string | null;
  autor: string;
  /** Se hizo sin sesión (script o SQL directo), así que no tiene autor. */
  sinSesion: boolean;
  /** Es una de las 210 fichas transcriptas del PDF de 2016. */
  esFichaOriginal: boolean;
  tabla: string;
  accion: string;
};

export type PaginaAuditoria = {
  eventos: EventoAuditoria[];
  total: number;
  pagina: number;
  paginas: number;
};

export const POR_PAGINA = 50;

/** Forma cruda de `audit_logs` tal como la devuelve PostgREST. */
type FilaAudit = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  actor_id: string | null;
  diff: Record<string, unknown> | null;
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
};

function texto(diff: Record<string, unknown> | null, clave: string): string | null {
  const v = diff?.[clave];
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function uuid(diff: Record<string, unknown> | null, clave: string): string | null {
  const v = diff?.[clave];
  return typeof v === "string" ? v : null;
}

/**
 * Trae un tramo de la bitácora ya traducido a eventos legibles.
 *
 * La comparte la pantalla (de a `POR_PAGINA`) con la descarga (de a mil): si cada
 * una armara su consulta, el CSV terminaría diciendo algo distinto de lo que se ve
 * en la pantalla, que es justo lo que no puede pasar en un registro de auditoría.
 */
async function traerEventos(
  filtros: FiltrosAuditoria,
  desde: number,
  cantidad: number,
): Promise<{ eventos: EventoAuditoria[]; total: number }> {
  const supabase = await createClient();

  let consulta = supabase
    .from("audit_logs")
    .select(
      `id, table_name, record_id, action, actor_id, diff, created_at,
       profiles ( full_name, email )`,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(desde, desde + cantidad - 1);

  if (filtros.tabla && filtros.tabla in TABLAS_AUDITADAS) {
    consulta = consulta.eq("table_name", filtros.tabla);
  }
  if (filtros.accion && filtros.accion in ACCIONES) {
    consulta = consulta.eq("action", filtros.accion);
  }
  if (!filtros.incluirSinSesion) {
    consulta = consulta.not("actor_id", "is", null);
  }

  const { data, error, count } = await consulta;

  if (error) {
    console.error("[auditoria] traerEventos:", error.message);
    return { eventos: [], total: 0 };
  }

  const filas = (data ?? []) as unknown as FilaAudit[];

  // Los snapshots de `positions` y `asignaciones` no traen el nombre del puesto
  // ni el de la persona (viven en otras tablas), así que se resuelven en dos
  // consultas por lote en vez de una por fila.
  const positionIds = new Set<string>();
  const personaIds = new Set<string>();

  // También se resuelven los puestos de `position_versions`, aunque el snapshot ya
  // traiga el nombre: sirve para saber si el puesto todavía existe y no ofrecer un
  // link roto. Pasa con las versiones de puestos borrados a mano.
  for (const f of filas) {
    if (f.table_name === "positions" && f.record_id) positionIds.add(f.record_id);
    if (f.table_name === "position_versions") {
      const pid = uuid(f.diff, "position_id");
      if (pid) positionIds.add(pid);
    }
    if (f.table_name === "asignaciones") {
      const pid = uuid(f.diff, "position_id");
      const perId = uuid(f.diff, "persona_id");
      if (pid) positionIds.add(pid);
      if (perId) personaIds.add(perId);
    }
  }

  const [puestos, personas] = await Promise.all([
    resolverPuestos(supabase, [...positionIds]),
    resolverPersonas(supabase, [...personaIds]),
  ]);

  return {
    eventos: filas.map((f) => describir(f, puestos, personas)),
    total: count ?? 0,
  };
}

/** Una página de la bitácora, para la pantalla. */
export async function listarAuditoria(
  filtros: FiltrosAuditoria = {},
): Promise<PaginaAuditoria> {
  const pagina = Math.max(1, filtros.pagina ?? 1);
  if (!isSupabaseConfigured()) return { eventos: [], total: 0, pagina, paginas: 0 };

  const { eventos, total } = await traerEventos(
    filtros,
    (pagina - 1) * POR_PAGINA,
    POR_PAGINA,
  );

  return { eventos, total, pagina, paginas: Math.ceil(total / POR_PAGINA) };
}

/** Tope de la descarga. Es un techo de memoria, no una regla del dominio. */
export const TOPE_EXPORTACION = 10_000;

/**
 * La bitácora entera (según los filtros) para descargar.
 *
 * Va por lotes de mil porque PostgREST no devuelve más que eso de una y una
 * exportación silenciosamente cortada en la fila 1000 sería peor que no tenerla.
 * Si se llega al tope, se avisa: `completa: false`.
 */
export async function exportarAuditoria(
  filtros: FiltrosAuditoria = {},
): Promise<{ eventos: EventoAuditoria[]; total: number; completa: boolean }> {
  if (!isSupabaseConfigured()) return { eventos: [], total: 0, completa: true };

  const LOTE = 1000;
  const acumulados: EventoAuditoria[] = [];
  let total = 0;

  for (let desde = 0; desde < TOPE_EXPORTACION; desde += LOTE) {
    const r = await traerEventos(filtros, desde, LOTE);
    total = r.total;
    acumulados.push(...r.eventos);
    if (r.eventos.length < LOTE || acumulados.length >= total) break;
  }

  return { eventos: acumulados, total, completa: acumulados.length >= total };
}

type NombrePuesto = { nombre: string; internalCode: string };

async function resolverPuestos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, NombrePuesto>> {
  const mapa = new Map<string, NombrePuesto>();
  if (ids.length === 0) return mapa;

  const { data, error } = await supabase
    .from("positions")
    // El embed lleva el nombre del constraint porque hay dos FK entre `positions`
    // y `position_versions`, y sin eso PostgREST no sabe cuál seguir.
    .select(`id, internal_code, current_version:position_versions!positions_current_version_fk ( name )`)
    .in("id", ids);

  if (error) {
    console.error("[auditoria] resolverPuestos:", error.message);
    return mapa;
  }

  type Fila = {
    id: string;
    internal_code: string;
    current_version: { name: string } | null;
  };

  for (const f of (data ?? []) as unknown as Fila[]) {
    mapa.set(f.id, {
      nombre: f.current_version?.name ?? f.internal_code,
      internalCode: f.internal_code,
    });
  }
  return mapa;
}

async function resolverPersonas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (ids.length === 0) return mapa;

  const { data, error } = await supabase
    .from("personas")
    .select("id, full_name, legajo")
    .in("id", ids);

  if (error) {
    console.error("[auditoria] resolverPersonas:", error.message);
    return mapa;
  }

  type Fila = { id: string; full_name: string; legajo: string };
  for (const f of (data ?? []) as unknown as Fila[]) {
    mapa.set(f.id, `${f.full_name} (leg. ${f.legajo})`);
  }
  return mapa;
}

/**
 * Traduce un registro crudo a una línea legible.
 *
 * Se describe solo lo que el snapshot afirma; no se infiere qué campos cambiaron
 * (para eso está el historial de la ficha). Por eso un cambio de versión aparece
 * como dos eventos: el alta de la versión y la actualización del puesto que la
 * apunta. Es fiel a lo que pasó en la base.
 */
function describir(
  f: FilaAudit,
  puestos: Map<string, NombrePuesto>,
  personas: Map<string, string>,
): EventoAuditoria {
  const sinSesion = f.actor_id === null;
  // Solo las versiones transcriptas del PDF se pueden afirmar como "el original".
  // El resto de lo que no tiene autor son correcciones técnicas por SQL directo, y
  // llamarlas "original" sería mentir.
  const esFichaOriginal = f.diff?.["is_historical_source"] === true;

  // "Carga inicial" solo cabe en el alta de una ficha original: modificarla o
  // borrarla es, por definición, algo que pasó después. Los updates de versiones
  // sin sesión que hay hoy son la migración 0006 de ajustes, no la ingesta.
  const autor = !sinSesion
    ? (f.profiles?.full_name ?? f.profiles?.email ?? "Usuario eliminado")
    : esFichaOriginal && f.action === "insert"
      ? "Carga inicial del nomenclador"
      : "Sin sesión (script o SQL directo)";

  const base = {
    id: f.id,
    fecha: f.created_at,
    autor,
    sinSesion,
    esFichaOriginal,
    tabla: f.table_name,
    accion: f.action,
    motivo: null as string | null,
  };

  switch (f.table_name) {
    case "positions": {
      const p = f.record_id ? puestos.get(f.record_id) : undefined;
      const objeto = p?.nombre ?? texto(f.diff, "internal_code") ?? "Puesto";
      // Sin `p` el puesto ya no está: linkearlo daría 404.
      const href = p && f.record_id ? `/puestos/${f.record_id}` : null;
      const estado = texto(f.diff, "status");

      let descripcion: string;
      if (f.action === "insert") descripcion = "Creó el puesto";
      else if (f.action === "delete") descripcion = "Borró el puesto";
      else if (estado === "archived") descripcion = "Archivó el puesto";
      else descripcion = "Actualizó el puesto";

      return { ...base, descripcion, objeto, href };
    }

    case "position_versions": {
      const positionId = uuid(f.diff, "position_id");
      const objeto = texto(f.diff, "name") ?? "Versión";
      const href =
        positionId && puestos.has(positionId) ? `/puestos/${positionId}` : null;
      const numero = f.diff?.["version_number"];
      const esFuente = f.diff?.["is_historical_source"] === true;

      let descripcion: string;
      if (f.action === "delete") {
        descripcion = "Borró la versión";
      } else if (f.action === "update") {
        descripcion = "Modificó una versión";
      } else if (esFuente) {
        descripcion = "Cargó la ficha original del nomenclador";
      } else {
        descripcion =
          typeof numero === "number"
            ? `Creó la versión ${numero}`
            : "Creó una versión nueva";
      }

      return { ...base, descripcion, objeto, href, motivo: texto(f.diff, "change_reason") };
    }

    case "personas": {
      const objeto = texto(f.diff, "full_name") ?? "Persona";
      const legajo = texto(f.diff, "legajo");
      const activa = f.diff?.["is_active"];

      let descripcion: string;
      if (f.action === "insert") descripcion = "Cargó a la persona";
      else if (f.action === "delete") descripcion = "Borró a la persona";
      else if (activa === false) descripcion = "Dio de baja a la persona";
      else descripcion = "Actualizó los datos de la persona";

      return {
        ...base,
        descripcion,
        objeto: legajo ? `${objeto} (leg. ${legajo})` : objeto,
        href: "/personas",
      };
    }

    case "asignaciones": {
      const positionId = uuid(f.diff, "position_id");
      const personaId = uuid(f.diff, "persona_id");
      const puesto = positionId ? puestos.get(positionId) : undefined;
      const persona = personaId ? personas.get(personaId) : undefined;
      const hasta = texto(f.diff, "valid_until");

      const objeto = `${persona ?? "Una persona"} — ${puesto?.nombre ?? "un puesto"}`;
      const href = puesto && positionId ? `/puestos/${positionId}` : "/personas";

      let descripcion: string;
      if (f.action === "insert") descripcion = "Asignó a la persona al puesto";
      else if (f.action === "delete") descripcion = "Borró la asignación";
      else if (hasta) descripcion = "Cerró la asignación";
      else descripcion = "Actualizó la asignación";

      return { ...base, descripcion, objeto, href };
    }

    default:
      return {
        ...base,
        descripcion: `${ACCIONES[f.action] ?? f.action} en ${f.table_name}`,
        objeto: f.record_id ?? "—",
        href: null,
      };
  }
}

export type ResumenAuditoria = {
  /** Movimientos hechos desde la app, con usuario identificado. */
  cambios: number;
  puestosCreados: number;
  puestosArchivados: number;
  /** Versiones nuevas, o sea fichas corregidas respecto del papel. */
  versionesNuevas: number;
};

/**
 * Cuánto se apartó el nomenclador del papel de 2016.
 *
 * Cada número es un `count` sin traer filas. Cuenta solo lo hecho con sesión: un
 * cambio por SQL directo no suma acá (ver la nota 2 de la cabecera).
 */
export async function resumenAuditoria(): Promise<ResumenAuditoria> {
  const vacio: ResumenAuditoria = {
    cambios: 0,
    puestosCreados: 0,
    puestosArchivados: 0,
    versionesNuevas: 0,
  };
  if (!isSupabaseConfigured()) return vacio;

  const supabase = await createClient();
  const humanos = () => supabase.from("audit_logs").select("id", { count: "exact", head: true }).not("actor_id", "is", null);

  const [cambios, creados, archivados, versiones] = await Promise.all([
    humanos(),
    humanos().eq("table_name", "positions").eq("action", "insert"),
    humanos().eq("table_name", "positions").eq("action", "update").eq("diff->>status", "archived"),
    // `version_number != 1` deja afuera la primera versión de un puesto nuevo: esa
    // no es una ficha corregida sino el alta, y ya la cuenta `puestosCreados`.
    // Se excluye por desigualdad y no con `gt` porque el JSON devuelve texto y la
    // comparación sería lexicográfica ("10" < "9").
    humanos()
      .eq("table_name", "position_versions")
      .eq("action", "insert")
      .eq("diff->>is_historical_source", "false")
      .not("diff->>version_number", "eq", "1"),
  ]);

  if (cambios.error) {
    console.error("[auditoria] resumenAuditoria:", cambios.error.message);
    return vacio;
  }

  return {
    cambios: cambios.count ?? 0,
    puestosCreados: creados.count ?? 0,
    puestosArchivados: archivados.count ?? 0,
    versionesNuevas: versiones.count ?? 0,
  };
}
