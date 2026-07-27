/**
 * Roles de la aplicación. Espejo del enum `user_role` de la base (migraciones
 * `0001`, `0009` y `0014`).
 *
 * Vive en `lib/` y no en `features/usuarios/` a propósito: `getSessionRole()`
 * también necesita la lista, y mientras estuvo duplicada en los dos lados se
 * desincronizó. `secretario` se agregó al panel de usuarios y el helper de sesión
 * no se enteró: devolvía `null` para ese rol, así que un secretario veía "—" como
 * rol en `/configuracion` y la app no lo podía distinguir de un director. Una
 * sola lista, un solo lugar.
 *
 * Al agregar un rol nuevo hay que tocar acá **y** el enum de la base, en su
 * propia migración (Postgres no deja usar un valor de enum en la misma
 * transacción en la que se agrega; ver la cabecera de la `0014`).
 */

export const ROLES = ["admin", "secretario", "director"] as const;

export type Rol = (typeof ROLES)[number];

export const ROL_ETIQUETA: Record<Rol, string> = {
  admin: "Administrador (Capital Humano)",
  secretario: "Secretario (toda su secretaría)",
  director: "Director (su repartición)",
};

/**
 * Type guard para lo que devuelve la base, que sin `database.types.ts` llega
 * como `string`. Un rol desconocido se trata como sin rol: falla cerrado.
 */
export function esRol(valor: unknown): valor is Rol {
  return (
    typeof valor === "string" && (ROLES as readonly string[]).includes(valor)
  );
}
