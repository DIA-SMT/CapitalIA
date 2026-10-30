import "server-only";

import { createAdminClient, isAdminApiConfigured } from "@/lib/supabase/admin";

/**
 * El padrón tal como lo ve otro sistema: agentes con su repartición, y el
 * organigrama.
 *
 * POR QUÉ VA CON LA SERVICE ROLE KEY Y NO CON LA SESIÓN DEL USUARIO. El que
 * consume esto no es una persona con sesión: es otro sistema municipal pegándole
 * a una URL. Sin sesión, la RLS por repartición no devuelve ni una fila —no es
 * que devuelva poco, devuelve nada—, así que la consulta tiene que saltearla.
 *
 * La contrapartida es que **la puerta la pone la ruta**, no la base: quien use
 * estas funciones está obligado a verificar el token antes. Es el mismo trato que
 * ya tenía `createAdminClient` para el alta de usuarios.
 *
 * Lo que sale de acá es deliberadamente menos de lo que hay en la tabla: no sale
 * el `id` interno de la persona (es la llave de la base y afuera no le sirve a
 * nadie) ni sus notas. Agregar una columna es una decisión, no un descuido.
 */

export type AgenteDelPadron = {
  legajo: string;
  nombre: string;
  activo: boolean;
  email: string | null;
  reparticionCodigo: string | null;
  reparticion: string | null;
  reparticionTipo: string | null;
  /** Id de la unidad en GRH. Es la columna para cruzar con otro sistema. */
  reparticionIdGrh: string | null;
  secretaria: string | null;
};

export type UnidadDelPadron = {
  codigo: string;
  nombre: string;
  tipo: string | null;
  idGrh: string | null;
  /** Código de la unidad de la que depende; null si es una secretaría. */
  dependeDe: string | null;
  activa: boolean;
};

type FilaReparticion = {
  id: string;
  code: string;
  nombre: string;
  tipo: string | null;
  parent_id: string | null;
  external_id: string | null;
  is_active: boolean;
};

/**
 * PostgREST no devuelve más de mil filas por pedido, y con 4.706 personas eso no
 * es un detalle: sin paginar, el otro sistema recibe un recorte sin enterarse.
 */
const LOTE = 1000;

async function traerReparticiones(): Promise<FilaReparticion[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("reparticiones")
    .select("id, code, nombre, tipo, parent_id, external_id, is_active")
    .order("code");

  if (error) {
    console.error("[padron] reparticiones:", error.message);
    throw new Error("No se pudo leer el organigrama.");
  }
  return (data ?? []) as FilaReparticion[];
}

/**
 * La secretaría de la que cuelga una unidad: se sube por `parent_id` hasta la
 * raíz. El tope de saltos es por las dudas —los ciclos los impide un trigger
 * (migración 0017)—, pero un bucle infinito dentro de un endpoint no se perdona.
 */
function raizDe(
  unidad: FilaReparticion,
  porId: Map<string, FilaReparticion>,
): FilaReparticion {
  let actual = unidad;
  for (let i = 0; i < 10 && actual.parent_id; i++) {
    const padre = porId.get(actual.parent_id);
    if (!padre) break;
    actual = padre;
  }
  return actual;
}

/** El organigrama entero, aplanado, con el código del padre en vez del uuid. */
export async function listarUnidadesDelPadron(): Promise<UnidadDelPadron[]> {
  if (!isAdminApiConfigured()) throw new Error("Supabase no está configurado.");

  const reparticiones = await traerReparticiones();
  const porId = new Map(reparticiones.map((r) => [r.id, r]));

  return reparticiones.map((r) => ({
    codigo: r.code,
    nombre: r.nombre,
    tipo: r.tipo,
    idGrh: r.external_id,
    dependeDe: r.parent_id ? (porId.get(r.parent_id)?.code ?? null) : null,
    activa: r.is_active,
  }));
}

/** Todos los agentes, ordenados por legajo, con su repartición resuelta. */
export async function listarAgentesDelPadron(): Promise<AgenteDelPadron[]> {
  if (!isAdminApiConfigured()) throw new Error("Supabase no está configurado.");

  const reparticiones = await traerReparticiones();
  const porId = new Map(reparticiones.map((r) => [r.id, r]));

  const supabase = createAdminClient();
  const agentes: AgenteDelPadron[] = [];

  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await supabase
      .from("personas")
      .select("legajo, full_name, email, is_active, reparticion_id")
      .order("legajo")
      .range(desde, desde + LOTE - 1);

    if (error) {
      console.error("[padron] personas:", error.message);
      throw new Error("No se pudo leer el padrón.");
    }

    type Fila = {
      legajo: string;
      full_name: string;
      email: string | null;
      is_active: boolean;
      reparticion_id: string | null;
    };

    const lote = (data ?? []) as Fila[];
    for (const p of lote) {
      const rep = p.reparticion_id ? porId.get(p.reparticion_id) : undefined;
      const sec = rep ? raizDe(rep, porId) : undefined;
      agentes.push({
        legajo: p.legajo,
        nombre: p.full_name,
        activo: p.is_active,
        email: p.email,
        reparticionCodigo: rep?.code ?? null,
        reparticion: rep?.nombre ?? null,
        reparticionTipo: rep?.tipo ?? null,
        reparticionIdGrh: rep?.external_id ?? null,
        secretaria: sec?.nombre ?? null,
      });
    }

    if (lote.length < LOTE) break;
  }

  return agentes;
}
