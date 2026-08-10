import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Ingresá tu email")
    .email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export type LoginValues = z.infer<typeof loginSchema>;

/**
 * Cambio de contraseña propio (el usuario ya tiene sesión). No pide la contraseña
 * actual: la sesión ya es prueba de identidad, y la temporal no la conocemos del
 * lado del servidor. Mínimo 8 para no quedar por debajo de la temporal generada.
 */
export const cambioClaveSchema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string().min(1, "Repetí la contraseña"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export type CambioClaveValues = z.infer<typeof cambioClaveSchema>;
