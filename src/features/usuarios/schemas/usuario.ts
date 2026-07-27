import { z } from "zod";

/**
 * Esquemas de la gestión de usuarios. Fuente de verdad única: los usa el
 * formulario en el cliente y las Server Actions en el servidor.
 *
 * Van en su propio archivo y NO en actions.ts: un archivo con "use server" solo
 * puede exportar funciones async.
 */

/** Roles que un admin puede asignar desde el panel. */
export const ROLES = ["admin", "secretario", "director"] as const;

export const ROL_ETIQUETA: Record<(typeof ROLES)[number], string> = {
  admin: "Administrador (Capital Humano)",
  secretario: "Secretario (toda su secretaría)",
  director: "Director (su repartición)",
};

export const usuarioSchema = z
  .object({
    email: z.email("Email inválido"),
    full_name: z
      .string()
      .trim()
      .min(3, "El nombre es obligatorio")
      .max(200, "Máximo 200 caracteres"),
    role: z.enum(ROLES, { message: "Elegí el rol" }),
    /** Reparticiones a cargo. Vacío solo tiene sentido para un admin. */
    reparticiones: z.array(z.uuid()).max(60).default([]),
  })
  // Un secretario o director sin repartición no vería nada: no tiene sentido
  // crearlo así, y es un error fácil de cometer.
  .refine((d) => d.role === "admin" || d.reparticiones.length > 0, {
    message: "Elegí al menos una repartición para este rol",
    path: ["reparticiones"],
  });

export const cambioUsuarioSchema = z
  .object({
    role: z.enum(ROLES),
    reparticiones: z.array(z.uuid()).max(60).default([]),
    is_active: z.boolean(),
  })
  .refine((d) => d.role === "admin" || d.reparticiones.length > 0, {
    message: "Elegí al menos una repartición para este rol",
    path: ["reparticiones"],
  });

export type UsuarioFormValues = z.input<typeof usuarioSchema>;
