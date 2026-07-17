import { exportarAuditoria } from "@/features/auditoria/data/auditoria";
import { hoy } from "@/lib/fechas";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * Descarga de la bitácora en CSV, con los mismos filtros que la pantalla.
 *
 * Dos decisiones para que abra bien en Excel en español, que es donde va a
 * terminar esto:
 *
 * - **Separador `;`**. Excel usa el separador de lista del sistema, que en la
 *   configuración regional de Argentina es `;`. Con `,` mete todo en una columna.
 * - **BOM UTF-8**. Sin él, Excel asume la codificación local y los acentos salen
 *   rotos ("Archivó" → "ArchivÃ³").
 */

const SEPARADOR = ";";
// Por código y no como carácter literal: el BOM es invisible, así que escrito en el
// fuente se pierde en cualquier edición y nadie se entera hasta ver los acentos
// rotos en Excel. Ya pasó una vez.
const BOM = String.fromCharCode(0xfeff);

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

/**
 * Escapa un valor para CSV.
 *
 * El `'` delante de los valores que arrancan con `= + - @` es a propósito: Excel
 * interpreta esas celdas como fórmulas, y un motivo de cambio que empiece con "="
 * se ejecutaría al abrir el archivo. Es la inyección de fórmulas en CSV, y acá el
 * texto lo escribe un usuario.
 */
function celda(valor: string | null): string {
  const v = (valor ?? "").replace(/\r?\n/g, " ").trim();
  const seguro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${seguro.replace(/"/g, '""')}"`;
}

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
      celda(FMT_FECHA.format(cuando)),
      celda(FMT_HORA.format(cuando)),
      celda(e.descripcion),
      celda(e.objeto),
      celda(e.motivo),
      celda(e.autor),
      celda(e.sinSesion ? "Script o SQL directo" : "App"),
      celda(e.tabla),
      celda(e.accion),
    ].join(SEPARADOR);
  });

  const cuerpo =
    BOM +
    [COLUMNAS.map(celda).join(SEPARADOR), ...filas].join("\r\n") +
    "\r\n";

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
