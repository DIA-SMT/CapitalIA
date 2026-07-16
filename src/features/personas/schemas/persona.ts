import { z } from "zod";

/**
 * Esquemas de personas y asignaciones. Fuente de verdad única: los usa el
 * formulario en el cliente (via zodResolver) y las Server Actions en el servidor.
 *
 * Van en su propio archivo y NO en actions.ts: un archivo con "use server" solo
 * puede exportar funciones async. Cualquier otra cosa se convierte en una
 * referencia al servidor, y el esquema le llega roto al cliente
 * ("Invalid input: not a Zod schema").
 */

export const personaSchema = z.object({
  legajo: z.string().trim().min(1, "El legajo es obligatorio").max(30),
  full_name: z.string().trim().min(3, "El nombre es obligatorio").max(200),
  email: z
    .union([z.email("Email inválido"), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  area: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export const asignacionSchema = z.object({
  persona_id: z.uuid("Elegí una persona"),
  desde: z.iso.date().optional(),
  notas: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type PersonaFormValues = z.input<typeof personaSchema>;
