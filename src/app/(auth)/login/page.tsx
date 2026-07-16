import { Suspense } from "react";
import type { Metadata } from "next";
import { Info } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo showText={false} className="[&>svg]:h-12 [&>svg]:w-12" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Capital human<span className="text-primary">IA</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Nomenclador de Puestos · Municipalidad de S. M. de Tucumán
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>
              Ingresá con las credenciales provistas por el administrador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!configured && (
              <Alert>
                <Info className="h-4 w-4" aria-hidden />
                <AlertTitle>Configuración pendiente</AlertTitle>
                <AlertDescription>
                  Falta conectar Supabase. Completá <code>.env.local</code> a
                  partir de <code>.env.example</code> para habilitar el acceso.
                </AlertDescription>
              </Alert>
            )}
            <Suspense fallback={null}>
              <LoginForm disabled={!configured} />
            </Suspense>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          El acceso es exclusivo para usuarios habilitados. No hay registro
          público.
        </p>
      </div>
    </main>
  );
}
