import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FormularioReparticion } from "@/features/reparticiones/components/formulario-reparticion";
import {
  listarPosiblesPadres,
  obtenerReparticion,
} from "@/features/reparticiones/data/reparticiones";
import { getSessionRole } from "@/lib/supabase/server";

// Next.js 16: `params` es una Promesa y hay que await-earla.
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await obtenerReparticion(id);
  return { title: r ? `Editar ${r.nombre}` : "Editar repartición" };
}

export default async function EditarReparticionPage({ params }: Props) {
  const { id } = await params;
  if ((await getSessionRole()) !== "admin") redirect("/reparticiones");

  const [reparticion, posiblesPadres] = await Promise.all([
    obtenerReparticion(id),
    listarPosiblesPadres(id),
  ]);
  if (!reparticion) notFound();

  return (
    <>
      <PageHeader
        title={`Editar ${reparticion.nombre}`}
        description={`Código ${reparticion.code}`}
        action={
          <Button variant="outline" render={<Link href="/reparticiones" />}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver
          </Button>
        }
      />

      <FormularioReparticion
        reparticionId={reparticion.id}
        posiblesPadres={posiblesPadres}
        valoresIniciales={{
          code: reparticion.code,
          nombre: reparticion.nombre,
          parent_id: reparticion.parentId ?? "",
          is_active: reparticion.activa,
        }}
      />
    </>
  );
}
