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
  /**
   * Obligatoria para TODOS, incluido el admin.
   *
   * `personas_select_director` (0012) filtra con
   * `reparticion_id in (select mis_reparticiones())`, y en SQL `null in (…)` da
   * NULL, no true: una persona sin repartición es invisible para todo director y
   * secretario, para siempre, y solo la ve el admin. Sin error y sin señal.
   *
   * Mientras fueron dos altas a mano no se notaba. Al mapear 4.771 personas
   * contra el organigrama, cada una que no enganche cae en ese pozo.
   */
  reparticion_id: z.uuid("Elegí la repartición"),
  /**
   * Puesto que ocupa, opcional. Se puede cargar una persona sin puesto y
   * asignarla después desde la ficha del puesto.
   */
  position_id: z
    .union([z.uuid(), z.literal("")])
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
