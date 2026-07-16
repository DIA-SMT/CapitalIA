import { redirect } from "next/navigation";

export default function RootPage() {
  // La raíz redirige al panel; el middleware y el layout privado resuelven la
  // sesión (usuarios sin sesión terminan en /login).
  redirect("/dashboard");
}
