import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FormularioReparticion } from "@/features/reparticiones/components/formulario-reparticion";
import { listarPosiblesPadres } from "@/features/reparticiones/data/reparticiones";
import { getSessionRole } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nueva repartición" };

export default async function NuevaReparticionPage() {
  if ((await getSessionRole()) !== "admin") redirect("/reparticiones");

  const posiblesPadres = await listarPosiblesPadres();

  return (
    <>
      <PageHeader
        title="Nueva repartición"
        description="Agregar una secretaría, subsecretaría o dirección al organigrama."
        action={
          <Button variant="outline" render={<Link href="/reparticiones" />}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver
          </Button>
        }
      />

      <FormularioReparticion
        posiblesPadres={posiblesPadres}
        valoresIniciales={{ code: "", nombre: "", parent_id: "", is_active: true }}
      />
    </>
  );
}
