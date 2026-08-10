import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CambioClaveForm } from "@/features/auth/cambio-clave-form";
import { debeCambiarClave, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Cambiar contraseña" };

// Vive FUERA del grupo (app) a propósito: su layout redirige acá cuando hay que
// cambiar la contraseña, y estar afuera corta el bucle. Igual exige sesión.
export const dynamic = "force-dynamic";

export default async function CambiarClavePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const obligatorio = await debeCambiarClave();

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LogoMark className="h-14 w-14" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Capital human<span className="text-primary">IA</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              {user.email}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Cambiar contraseña</CardTitle>
            <CardDescription>
              {obligatorio
                ? "Estás usando una contraseña temporal. Elegí una nueva para continuar."
                : "Elegí una nueva contraseña para tu cuenta."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {obligatorio && (
              <Alert>
                <ShieldAlert className="h-4 w-4" aria-hidden />
                <AlertDescription>
                  Es la contraseña que te pasó el administrador. Por seguridad, no
                  vas a poder usar el sistema hasta cambiarla.
                </AlertDescription>
              </Alert>
            )}
            <CambioClaveForm obligatorio={obligatorio} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
