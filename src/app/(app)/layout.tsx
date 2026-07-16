import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { Asistente } from "@/features/asistente/components/asistente";
import { getSessionUser } from "@/lib/supabase/server";

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

  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : (user.email?.split("@")[0] ?? "Usuario");

  return (
    <AppShell user={{ name: fullName, email: user.email ?? "" }}>
      {children}
      {/* Flotante sobre todas las pantallas privadas: la gracia es poder
          preguntarle mientras se está mirando otra cosa. */}
      <Asistente />
    </AppShell>
  );
}
