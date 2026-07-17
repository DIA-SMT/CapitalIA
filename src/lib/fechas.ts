/**
 * Fechas sin hora (las columnas `date` de Postgres: `valid_from`, `valid_until`).
 *
 * Un `date` es un día del calendario, no un instante. Pasarlo por `Date` lo
 * convierte en un instante —medianoche UTC— y ahí empieza el problema: en
 * Argentina (UTC-3) esa medianoche cae el día anterior.
 *
 *   new Date("2026-07-17")  ->  2026-07-17T00:00:00Z
 *   ...en America/Buenos_Aires  ->  16/07/2026 21:00
 *   Intl lo formatea como        ->  16/07/2026   ← un día menos
 *
 * Pasaba de las dos puntas: al mostrar las asignaciones se veía un día antes, y
 * al guardarlas `new Date().toISOString()` tomaba la fecha UTC, así que toda
 * asignación cargada después de las 21:00 hora argentina quedaba con la fecha del
 * día siguiente (en producción el servidor corre en UTC).
 *
 * La regla: un `date` se trata como texto `YYYY-MM-DD` y nunca pasa por `Date`.
 * Para `timestamptz` (`created_at`) no aplica: esos sí son instantes y `Date` los
 * maneja bien.
 */

/** Zona de la municipalidad. El servidor corre en UTC; los usuarios, acá. */
const ZONA = "America/Argentina/Tucuman";

/** Hoy en Tucumán, como `YYYY-MM-DD`. Es lo que espera una columna `date`. */
export function hoy(): string {
  // "en-CA" formatea como YYYY-MM-DD, que es justo el formato de la columna.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Formatea un `date` (`YYYY-MM-DD`) como `DD/MM/AAAA`, sin pasar por `Date`.
 * Si no parece un `date`, devuelve el valor tal cual antes que mentir.
 */
export function formatearFecha(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return fecha;
  const [, y, mes, d] = m;
  return `${d}/${mes}/${y}`;
}
