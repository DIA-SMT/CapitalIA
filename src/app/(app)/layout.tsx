import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { Asistente } from "@/features/asistente/components/asistente";
import {
  debeCambiarClave,
  getSessionRole,
  getSessionUser,
} from "@/lib/supabase/server";

// La sesión se valida en cada request: nunca se sirve contenido privado
// prerenderizado sin comprobar la autenticación.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Validación de sesión en el servidor: si no hay usuario, no se renderiza
  // ningún contenido privado.
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  // Contraseña temporal sin cambiar: no se entra a la app hasta elegir una nueva.
  // La página vive fuera de este grupo, así que no entra en bucle con el redirect.
  if (await debeCambiarClave()) {
    redirect("/cambiar-clave");
  }

  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : (user.email?.split("@")[0] ?? "Usuario");

  const esAdmin = (await getSessionRole()) === "admin";

  return (
    <AppShell user={{ name: fullName, email: user.email ?? "" }} esAdmin={esAdmin}>
      {children}
      {/* Flotante sobre todas las pantallas privadas: la gracia es poder
          preguntarle mientras se está mirando otra cosa. */}
      <Asistente />
    </AppShell>
  );
}
