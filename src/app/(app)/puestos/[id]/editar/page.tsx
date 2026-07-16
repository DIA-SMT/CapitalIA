import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FormularioPuesto } from "@/features/puestos/components/formulario-puesto";
import { obtenerOpciones } from "@/features/puestos/data/opciones";
import { obtenerPuestoParaEditar } from "@/features/puestos/data/puestos";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await obtenerPuestoParaEditar(id);
  return { title: p ? `Editar ${p.nombre}` : "Editar puesto" };
}

export default async function EditarPuestoPage({ params }: Props) {
  const { id } = await params;
  const [puesto, opciones] = await Promise.all([
    obtenerPuestoParaEditar(id),
    obtenerOpciones(),
  ]);
  if (!puesto) notFound();

  return (
    <>
      <PageHeader
        title={`Editar ${puesto.nombre}`}
        description={`${puesto.internalCode} · versión vigente ${puesto.versionNumero}`}
        action={
          <Button variant="outline" render={<Link href={`/puestos/${id}`} />}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver a la ficha
          </Button>
        }
      />

      <FormularioPuesto
        positionId={id}
        internalCode={puesto.internalCode}
        opciones={opciones}
        valoresIniciales={puesto.valores}
      />
    </>
  );
}
