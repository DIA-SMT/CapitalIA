import { z } from "zod";

/**
 * Esquema del alta/edición de una repartición. Fuente de verdad única: lo usa el
 * formulario en el cliente y la Server Action en el servidor.
 */

export const reparticionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "El código es obligatorio")
    .max(20, "Máximo 20 caracteres")
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Solo letras, números, punto, guion y guion bajo (sin espacios)",
    )
    .transform((v) => v.toUpperCase()),
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre es obligatorio")
    .max(200, "Máximo 200 caracteres"),
  /** De quién depende. Vacío = es una secretaría (va en la raíz del organigrama). */
  parent_id: z
    .union([z.uuid(), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  is_active: z.boolean().default(true),
});

export type ReparticionFormValues = z.input<typeof reparticionSchema>;
