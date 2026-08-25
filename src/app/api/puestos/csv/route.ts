import { exportarPuestos, type PuestoExportable } from "@/features/puestos/data/puestos";
import { armarCsv } from "@/lib/csv";
import { hoy } from "@/lib/fechas";
import { getSessionUser } from "@/lib/supabase/server";

/**
 * Descarga del nomenclador entero en CSV, una fila por ficha.
 *
 * Abre en Excel con doble clic: el separador, el BOM y el escape de fórmulas los
 * resuelve `@/lib/csv`. Acá solo se decide qué columnas van y cómo se lee cada
 * valor en castellano.
 *
 * No toma parámetros a propósito: los filtros de la tabla de puestos son estado
 * del cliente y no viven en la URL, así que no habría con qué espejarlos. Baja el
 * nomenclador completo —incluidas las fichas archivadas, con su columna "Estado"—
 * y el recorte se hace en la planilla.
 */

/** Las cuatro listas de la ficha entran en una celda, en su orden impreso. */
const SEPARADOR_LISTA = " / ";

const ESTADO: Record<string, string> = {
  draft: "Borrador",
  current: "Vigente",
  historical: "Histórica",
  archived: "Archivada",
};

// Los mismos rótulos que el filtro de la tabla: la planilla y la pantalla tienen
// que llamar a las cosas igual.
const VERIFICACION: Record<string, string> = {
  pending: "Pendiente de verificar",
  verified: "Verificada",
  needs_review: "Necesita revisión",
};

/**
 * En el orden de la hoja impresa de 2016 (identificación, descripciones,
 * requisitos, riesgo), y al final la procedencia. Así la planilla se lee de
 * izquierda a derecha como se lee la ficha.
 */
const COLUMNAS = [
  "Código",
  "Puesto",
  "Variante",
  "Agrupamiento",
  "Nivel",
  "Área",
  "Descripción general",
  "Descripción específica",
  "Instrucción",
  "Título",
  "Experiencia",
  "Otros conocimientos",
  "Competencias",
  "Requisito físico",
  "Condiciones de trabajo",
  "Riesgos de trabajo",
  "Nivel de riesgo",
  "Nivel de riesgo (impreso)",
  "Responsabilidad sobre",
  "Notas",
  "Estado",
  "Versión",
  "Documento",
  "Página impresa",
  "Página PDF",
  "Verificación",
] as const;

function fila(p: PuestoExportable) {
  return [
    p.internalCode,
    p.nombre,
    p.variante,
    p.agrupamiento,
    p.nivel,
    p.area,
    p.descripcionGeneral,
    p.descripcionEspecifica,
    p.instruccion,
    p.titulo,
    p.experiencia,
    p.conocimientos.join(SEPARADOR_LISTA),
    p.competencias.join(SEPARADOR_LISTA),
    p.requisitoFisico,
    p.condicionesTrabajo,
    p.riesgos.join(SEPARADOR_LISTA),
    p.riesgo,
    p.riesgoImpreso,
    p.responsabilidades.join(SEPARADOR_LISTA),
    p.notasAdicionales,
    ESTADO[p.estado] ?? p.estado,
    p.versionNumero,
    p.documento,
    p.paginaImpresa,
    p.paginaPdf,
    p.verificacion ? VERIFICACION[p.verificacion] ?? p.verificacion : null,
  ];
}

export async function GET() {
  // Misma puerta que el resto de la app. La consulta corre con la sesión del
  // usuario, así que RLS decide qué fichas entran en el archivo.
  const user = await getSessionUser();
  if (!user) return new Response("No autorizado", { status: 401 });

  const puestos = await exportarPuestos();
  const cuerpo = armarCsv(COLUMNAS, puestos.map(fila));
  const nombre = `nomenclador-${hoy()}.csv`;

  return new Response(cuerpo, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
