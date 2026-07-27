import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Info } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AltaUsuario } from "@/features/usuarios/components/alta-usuario";
import { EditarUsuario } from "@/features/usuarios/components/editar-usuario";
import { listarReparticionesPlanas } from "@/features/reparticiones/data/reparticiones";
import { listarUsuarios } from "@/features/usuarios/data/usuarios";
import { ROL_ETIQUETA, esRol } from "@/lib/roles";
import { getSessionRole } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsuariosPage() {
  if ((await getSessionRole()) !== "admin") redirect("/dashboard");

  const [usuarios, reparticiones] = await Promise.all([
    listarUsuarios(),
    listarReparticionesPlanas(),
  ]);

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Quién tiene acceso al sistema y hasta dónde llega."
      />

      <div className="mb-6">
        <AltaUsuario reparticiones={reparticiones} />
      </div>

      <Alert className="mb-6">
        <Info className="h-4 w-4" aria-hidden />
        <AlertDescription>
          El acceso no es automático: cada usuario lo crea Capital Humano acá. Al
          crearlo se genera una contraseña temporal que hay que pasarle a la persona
          (el sistema no manda mails).
        </AlertDescription>
      </Alert>

      {usuarios.length === 0 ? (
        <EmptyState
          title="Sin usuarios"
          description="Creá el primer usuario con el botón de arriba."
        />
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => (
            <Card key={u.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.nombre ?? u.email}</span>
                    <Badge variant="secondary">
                      {esRol(u.rol) ? ROL_ETIQUETA[u.rol] : u.rol}
                    </Badge>
                    {!u.activo && <Badge variant="outline">Sin acceso</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{u.email}</p>
                  {u.rol !== "admin" && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {u.reparticiones.length === 0 ? (
                        <span className="italic">
                          Sin repartición asignada — no ve ningún personal.
                        </span>
                      ) : (
                        u.reparticiones.map((r) => r.nombre).join(" · ")
                      )}
                    </p>
                  )}
                </div>
                <EditarUsuario usuario={u} reparticiones={reparticiones} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
