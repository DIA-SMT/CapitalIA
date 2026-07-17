import { z } from "zod";

/**
 * Esquema de la ficha de un puesto. Fuente de verdad única: lo usa el formulario
 * en el cliente (via zodResolver) y la Server Action en el servidor.
 */

const textoOpcional = z
  .string()
  .trim()
  .max(4000, "Máximo 4000 caracteres")
  .optional()
  .transform((v) => (v === "" ? undefined : v));

/**
 * UUID de un `<select>` opcional.
 *
 * Un select sin elegir devuelve `""`, no `undefined`, y `z.uuid().optional()`
 * rechaza el string vacío con "Invalid UUID" —en inglés y sin sentido para quien
 * solo dejó el campo en blanco—. Peor: en los campos sin cartel de error visible,
 * el formulario no se enviaba y no se mostraba nada.
 */
const uuidOpcional = (mensaje: string) =>
  z
    .union([z.literal(""), z.uuid(mensaje)])
    .optional()
    .transform((v) => (v === "" ? undefined : v));

/** Un ítem de catálogo elegido en el formulario. */
export const itemSchema = z.object({
  id: z.uuid("Ítem de catálogo inválido"),
  /**
   * Literal como se escribe en la ficha. En las 210 históricas guarda lo impreso
   * en el PDF de 2016; al editar, si no se toca, se conserva.
   */
  raw_text: z.string().trim().max(500).optional(),
});

export const puestoSchema = z
  .object({
    // --- Identificación
    name: z
      .string()
      .trim()
      .min(3, "El nombre debe tener al menos 3 caracteres")
      .max(200, "Máximo 200 caracteres"),
    variant: z
      .string()
      .trim()
      .max(10, "La variante es una letra o sigla corta")
      .optional()
      .transform((v) => (v === "" ? undefined : v)),

    // --- Clasificación
    grouping_id: z.uuid("Elegí un agrupamiento"),
    level_id: uuidOpcional("Nivel inválido"),
    technical_area_id: uuidOpcional("Área técnica inválida"),

    // --- Descripción
    general_description: textoOpcional,
    specific_description: textoOpcional,

    // --- Requisitos intelectuales
    minimum_education: textoOpcional,
    required_title: textoOpcional,
    minimum_experience: textoOpcional,

    // --- Físico y condiciones
    physical_requirement: textoOpcional,
    working_conditions: textoOpcional,

    // --- Riesgo
    risk_level_id: uuidOpcional("Nivel de riesgo inválido"),
    risk_level_raw: z.string().trim().max(200).optional(),

    // --- Catálogos
    competencias: z.array(itemSchema).max(50).default([]),
    riesgos: z.array(itemSchema).max(50).default([]),
    responsabilidades: z.array(itemSchema).max(50).default([]),
    conocimientos: z.array(itemSchema).max(50).default([]),

    // --- Trazabilidad del cambio
    additional_notes: textoOpcional,
    change_reason: z
      .string()
      .trim()
      .min(10, "Explicá el motivo del cambio (mínimo 10 caracteres)")
      .max(1000, "Máximo 1000 caracteres"),
    change_document_reference: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v === "" ? undefined : v)),
  })
  // La ficha usa Nivel o Área según el agrupamiento, nunca las dos. El esquema lo
  // permite (ambas columnas son nullable), así que la regla se valida acá.
  //
  // El mensaje no aclara "pero no las dos" porque el formulario muestra un campo o
  // el otro según el agrupamiento: quien lo lea dejó el campo vacío, no eligió dos.
  .refine((d) => Boolean(d.level_id) !== Boolean(d.technical_area_id), {
    message: "Elegí el nivel o el área técnica del puesto",
    path: ["level_id"],
  });

export type PuestoFormValues = z.input<typeof puestoSchema>;
export type PuestoFormParsed = z.output<typeof puestoSchema>;

/** Motivo del archivado. Se pide siempre: un puesto no se da de baja "porque sí". */
export const archivarSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(10, "Explicá por qué se archiva este puesto (mínimo 10 caracteres)")
    .max(1000),
});
