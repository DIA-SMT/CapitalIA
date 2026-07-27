import { z } from "zod";

/**
 * Esquemas de solicitudes de puestos nuevos. Fuente de verdad única: los usa el
 * formulario en el cliente (via zodResolver) y las Server Actions en el servidor.
 *
 * Van en su propio archivo y NO en actions.ts: un archivo con "use server" solo
 * puede exportar funciones async.
 */

/** Lo único que aporta el solicitante: nombre del puesto y qué tareas hace. */
export const solicitudSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, "El nombre del puesto debe tener al menos 3 caracteres")
    .max(200, "Máximo 200 caracteres"),
  descripcion: z
    .string()
    .trim()
    .min(10, "Describí las tareas del puesto (mínimo 10 caracteres)")
    .max(4000, "Máximo 4000 caracteres"),
  reparticion_id: z.uuid("Elegí la repartición"),
});

export const rechazoSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(10, "Explicá el motivo del rechazo (mínimo 10 caracteres)")
    .max(1000, "Máximo 1000 caracteres"),
});

export type SolicitudFormValues = z.input<typeof solicitudSchema>;
