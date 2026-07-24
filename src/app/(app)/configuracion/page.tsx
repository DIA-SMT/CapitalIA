import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSessionRole, getSessionUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const user = await getSessionUser();
  const role = await getSessionRole();
  const configured = isSupabaseConfigured();

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Preferencias del sistema y estado de la sesión."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sesión actual</CardTitle>
            <CardDescription>Usuario autenticado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="truncate font-medium">{user?.email ?? "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Rol</span>
              <Badge variant="secondary">{role ?? "—"}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado del backend</CardTitle>
            <CardDescription>Conexión con Supabase.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            {configured ? (
              <span className="flex items-center gap-2 text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                Supabase configurado.
              </span>
            ) : (
              <span className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" aria-hidden />
                Falta configurar las variables de entorno de Supabase.
              </span>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
