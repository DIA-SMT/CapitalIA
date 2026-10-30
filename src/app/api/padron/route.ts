import { createHash, timingSafeEqual } from "node:crypto";

import {
  listarAgentesDelPadron,
  listarUnidadesDelPadron,
} from "@/features/personas/data/padron";
import { armarCsv, type Valor } from "@/lib/csv";
import { hoy } from "@/lib/fechas";

/**
 * El padrón, para otro sistema municipal.
 *
 * GET /api/padron                        -> agentes, JSON
 * GET /api/padron?recurso=reparticiones  -> organigrama, JSON
 * GET /api/padron?formato=csv            -> lo mismo, en CSV
 *
 * Autenticación: `Authorization: Bearer <PADRON_API_TOKEN>`.
 *
 * POR QUÉ UN ENDPOINT Y NO UNA CONEXIÓN A LA BASE. El otro sistema vive en otro
 * proyecto de Supabase. Darle acceso directo obliga a repartir credenciales de
 * base —y la única que ve el padrón entero es la service role key, que además
 * escribe y saltea toda la RLS—. Acá no sale ninguna credencial: sale una lista
 * de lectura, con las columnas que elegimos, y se corta rotando una variable de
 * entorno.
 *
 * Es de SOLO LECTURA por construcción: no hay POST, PUT ni DELETE, así que
 * cualquier otro método recibe el 405 que arma Next solo.
 *
 * Esta ruta es la única que el `proxy` deja pasar sin sesión de navegador (ver
 * PUBLIC_ROUTES y RUTAS_CON_TOKEN en lib/supabase/middleware.ts). Si el token no
 * está configurado, el endpoint no existe: contesta 404.
 */

const TOKEN = process.env.PADRON_API_TOKEN ?? "";

/** Un token corto no protege nada; mejor que el endpoint no exista. */
const LARGO_MINIMO = 24;

/**
 * Compara en tiempo constante, sobre el hash y no sobre el texto: así los dos
 * lados miden siempre 32 bytes y la comparación no filtra ni el largo del token.
 */
function tokenValido(recibido: string): boolean {
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(TOKEN).digest();
  return timingSafeEqual(a, b);
}

function autorizado(request: Request): boolean {
  const cabecera = request.headers.get("authorization") ?? "";
  if (!cabecera.startsWith("Bearer ")) return false;
  return tokenValido(cabecera.slice(7).trim());
}

/**
 * Datos personales de 4.706 empleados municipales: no los cachea nadie, ni el CDN
 * de Vercel ni un proxy en el medio. Una respuesta autenticada guardada en un
 * borde es una filtración esperando a que alguien pida la URL sin token.
 */
const SIN_CACHE = { "Cache-Control": "no-store" } as const;

const COLUMNAS_AGENTES = [
  "legajo",
  "nombre",
  "activo",
  "email",
  "reparticion_codigo",
  "reparticion",
  "reparticion_tipo",
  "reparticion_id_grh",
  "secretaria",
] as const;

const COLUMNAS_UNIDADES = [
  "codigo",
  "nombre",
  "tipo",
  "id_grh",
  "depende_de",
  "activa",
] as const;

export async function GET(request: Request) {
  if (TOKEN.length < LARGO_MINIMO) {
    // En los logs de Vercel, no en la respuesta: quien pega acá no tiene por qué
    // enterarse de por qué no está.
    console.warn(
      "[padron] PADRON_API_TOKEN sin configurar (o de menos de 24 caracteres): el endpoint está apagado.",
    );
    return new Response("No encontrado", { status: 404, headers: SIN_CACHE });
  }

  if (!autorizado(request)) {
    return new Response("No autorizado", {
      status: 401,
      headers: { ...SIN_CACHE, "WWW-Authenticate": "Bearer" },
    });
  }

  const { searchParams } = new URL(request.url);
  const recurso = searchParams.get("recurso") ?? "agentes";
  const csv = searchParams.get("formato") === "csv";

  if (recurso !== "agentes" && recurso !== "reparticiones") {
    return new Response(
      "Recurso desconocido. Usá 'agentes' o 'reparticiones'.",
      { status: 400, headers: SIN_CACHE },
    );
  }

  try {
    const datos =
      recurso === "agentes"
        ? await listarAgentesDelPadron()
        : await listarUnidadesDelPadron();

    if (csv) {
      const [columnas, filas] =
        recurso === "agentes"
          ? [
              COLUMNAS_AGENTES,
              (datos as Awaited<ReturnType<typeof listarAgentesDelPadron>>).map(
                (a): Valor[] => [
                  a.legajo,
                  a.nombre,
                  a.activo ? "SI" : "NO",
                  a.email,
                  a.reparticionCodigo,
                  a.reparticion,
                  a.reparticionTipo,
                  a.reparticionIdGrh,
                  a.secretaria,
                ],
              ),
            ]
          : [
              COLUMNAS_UNIDADES,
              (datos as Awaited<ReturnType<typeof listarUnidadesDelPadron>>).map(
                (u): Valor[] => [
                  u.codigo,
                  u.nombre,
                  u.tipo,
                  u.idGrh,
                  u.dependeDe,
                  u.activa ? "SI" : "NO",
                ],
              ),
            ];

      return new Response(armarCsv(columnas, filas), {
        headers: {
          ...SIN_CACHE,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="padron-${recurso}-${hoy()}.csv"`,
        },
      });
    }

    // `generado` y `total` van en la respuesta a propósito: el que sincroniza
    // necesita saber de cuándo es la foto, y un total explícito delata un recorte
    // que de otro modo se leería como "esa gente no está".
    return Response.json(
      { generado: new Date().toISOString(), recurso, total: datos.length, datos },
      { headers: SIN_CACHE },
    );
  } catch (e) {
    console.error("[padron]", e instanceof Error ? e.message : e);
    return new Response("No se pudo leer el padrón.", {
      status: 500,
      headers: SIN_CACHE,
    });
  }
}
