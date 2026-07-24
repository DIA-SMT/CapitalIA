import { Suspense } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { Info } from "lucide-react";

import { LogoMark } from "@/components/brand/logo";
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
import logoBlanco from "../../../../public/Logo_SMT_blanco.png";

export const metadata: Metadata = {
  title: "Ingresar",
};

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      {/* Panel institucional — solo escritorio. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-azul to-brand-celeste p-10 text-white lg:flex">
        <Image
          src={logoBlanco}
          alt="Municipalidad de San Miguel de Tucumán"
          priority
          className="h-auto w-60"
        />
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Nomenclador de Puestos
          </h2>
          <p className="mt-3 text-base text-white/85">
            Sistema de gestión y actualización del nomenclador de puestos de la
            Municipalidad de San Miguel de Tucumán.
          </p>
        </div>
        <p className="text-sm text-white/70">Capital humanIA · Uso interno</p>
      </aside>

      {/* Panel de acceso. */}
      <div className="flex flex-col items-center justify-center bg-background px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Marca compacta: visible en móvil, donde el panel institucional no está. */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <LogoMark className="h-14 w-14" />
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
      </div>
    </main>
  );
}
