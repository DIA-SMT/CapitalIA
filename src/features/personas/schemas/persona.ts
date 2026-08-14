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

/**
 * Edición de una persona ya cargada. Solo admin (decisión #10 del plan: el
 * director carga y asigna; corregir o dar de baja es de Capital Humano).
 *
 * El legajo NO se puede editar: es la identidad estable de la persona y la clave
 * con la que la sincronización mensual la reconoce. Cambiarlo la convertiría en
 * otra persona y la próxima corrida la cargaría de nuevo, duplicada.
 */
export const edicionPersonaSchema = z.object({
  full_name: z.string().trim().min(3, "El nombre es obligatorio").max(200),
  email: z
    .union([z.email("Email inválido"), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  reparticion_id: z.uuid("Elegí la repartición"),
  is_active: z.boolean(),
});

export type EdicionPersonaFormValues = z.input<typeof edicionPersonaSchema>;

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
