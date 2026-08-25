import { exportarAuditoria } from "@/features/auditoria/data/auditoria";
import { armarCsv } from "@/lib/csv";
import { hoy } from "@/lib/fechas";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * Descarga de la bitácora en CSV, con los mismos filtros que la pantalla.
 *
 * Lo que hace que abra bien en Excel en español —separador `;`, BOM y escape de
 * fórmulas— está en `@/lib/csv`, compartido con la descarga del nomenclador.
 */

const COLUMNAS = [
  "Fecha",
  "Hora",
  "Qué se hizo",
  "Sobre qué",
  "Motivo",
  "Quién",
  "Origen",
  "Tipo",
  "Acción",
] as const;

const FMT_FECHA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Tucuman",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
// 24 horas a propósito: "08:58 a. m." en una celda de planilla no ordena ni filtra.
const FMT_HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Tucuman",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export async function GET(request: Request) {
  // Misma puerta que el resto de la app.
  const user = await getSessionUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const params = new URL(request.url).searchParams;
  const { eventos, total, completa } = await exportarAuditoria({
    tabla: params.get("tabla") ?? undefined,
    accion: params.get("accion") ?? undefined,
    incluirSinSesion: params.get("inicial") === "1",
  });

  const filas = eventos.map((e) => {
    // `created_at` es timestamptz: acá `Date` sí corresponde (es un instante), y
    // se fuerza la zona de la municipalidad para no depender del server (UTC).
    const cuando = new Date(e.fecha);
    return [
      FMT_FECHA.format(cuando),
      FMT_HORA.format(cuando),
      e.descripcion,
      e.objeto,
      e.motivo,
      e.autor,
      e.sinSesion ? "Script o SQL directo" : "App",
      e.tabla,
      e.accion,
    ];
  });

  const cuerpo = armarCsv(COLUMNAS, filas);

  const nombre = `bitacora-nomenclador-${hoy()}.csv`;

  return new Response(cuerpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      // Si la exportación tocó el tope, que quede dicho en algún lado.
      ...(completa ? {} : { "X-Exportacion-Truncada": `${eventos.length}/${total}` }),
    },
  });
}
