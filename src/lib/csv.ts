/**
 * Armado de CSV que abra bien en Excel en español.
 *
 * Tres decisiones, las tres aprendidas a los golpes con la descarga de la
 * bitácora. Viven acá y no en cada ruta para que la próxima exportación no las
 * tenga que redescubrir:
 *
 * - **Separador `;`**. Excel usa el separador de lista del sistema, que en la
 *   configuración regional de Argentina es `;`. Con `,` mete todo en una columna.
 * - **BOM UTF-8**. Sin él, Excel asume la codificación local y los acentos salen
 *   rotos ("Archivó" → "ArchivÃ³").
 * - **Escape de fórmulas**. Una celda que arranca con `= + - @` la interpreta
 *   Excel como fórmula y la ejecuta al abrir el archivo. Acá el texto lo escriben
 *   usuarios, así que va con `'` adelante.
 */

export const SEPARADOR = ";";

// Por código y no como carácter literal: el BOM es invisible, así que escrito en el
// fuente se pierde en cualquier edición y nadie se entera hasta ver los acentos
// rotos en Excel. Ya pasó una vez.
const BOM = String.fromCharCode(0xfeff);

/** Un valor tal como sale de la base, antes de convertirse en celda. */
export type Valor = string | number | null | undefined;

/**
 * Escapa un valor para CSV.
 *
 * El `'` delante de los valores que arrancan con `= + - @` es a propósito: es la
 * inyección de fórmulas en CSV. Los saltos de línea se aplanan a espacios porque
 * una ficha del nomenclador trae descripciones de varios párrafos y una celda
 * multilínea no se ve sin activar el ajuste de texto.
 */
export function celda(valor: Valor): string {
  const v = String(valor ?? "").replace(/\r?\n/g, " ").trim();
  const seguro = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${seguro.replace(/"/g, '""')}"`;
}

/**
 * Encabezado + filas, con BOM y fin de línea CRLF (el que espera Excel).
 * Las filas llegan con los valores crudos: el escape lo hace esta función.
 */
export function armarCsv(columnas: readonly string[], filas: readonly Valor[][]): string {
  const lineas = [
    columnas.map(celda).join(SEPARADOR),
    ...filas.map((fila) => fila.map(celda).join(SEPARADOR)),
  ];
  return BOM + lineas.join("\r\n") + "\r\n";
}
