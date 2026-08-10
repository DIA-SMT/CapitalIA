import { z } from "zod";

import { ROLES } from "@/lib/roles";

/**
 * Esquemas de las solicitudes de acceso. Fuente de verdad única: los usan los
 * formularios (cliente) y las Server Actions (servidor), y se repiten dentro de
 * las funciones de Postgres de la 0020.
 *
 * Van en su propio archivo y NO en actions.ts: un archivo "use server" solo puede
 * exportar funciones async.
 */

/** Lo que carga la persona sin cuenta desde el login. */
export const solicitudAccesoSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, "Ingresá tu nombre")
    .max(120, "Máximo 120 caracteres"),
  apellido: z
    .string()
    .trim()
    .min(2, "Ingresá tu apellido")
    .max(120, "Máximo 120 caracteres"),
  email: z.email("Ingresá un email válido").max(200, "Máximo 200 caracteres"),
  legajo: z
    .string()
    .trim()
    .min(1, "Ingresá tu número de legajo")
    .max(40, "Máximo 40 caracteres"),
});

export type SolicitudAccesoValues = z.infer<typeof solicitudAccesoSchema>;

/**
 * Lo que completa el admin al aprobar: rol y reparticiones a cargo. El email y el
 * nombre salen de la solicitud, no se re-piden. Mismo criterio que el alta de
 * usuarios: un secretario/director sin repartición no vería nada.
 */
export const aprobarAccesoSchema = z
  .object({
    role: z.enum(ROLES, { message: "Elegí el rol" }),
    reparticiones: z.array(z.uuid()).max(60).default([]),
  })
  .refine((d) => d.role === "admin" || d.reparticiones.length > 0, {
    message: "Elegí al menos una repartición para este rol",
    path: ["reparticiones"],
  });

export type AprobarAccesoValues = z.input<typeof aprobarAccesoSchema>;

/** El motivo del rechazo, que queda registrado. */
export const rechazoAccesoSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(5, "Indicá el motivo (mínimo 5 caracteres)")
    .max(500, "Máximo 500 caracteres"),
});

export type RechazoAccesoValues = z.infer<typeof rechazoAccesoSchema>;
