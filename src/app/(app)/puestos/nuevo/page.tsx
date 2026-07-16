import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FormularioPuesto } from "@/features/puestos/components/formulario-puesto";
import { obtenerOpciones } from "@/features/puestos/data/opciones";

export const metadata: Metadata = { title: "Nuevo puesto" };

export default async function NuevoPuestoPage() {
  const opciones = await obtenerOpciones();

  return (
    <>
      <PageHeader
        title="Nuevo puesto"
        description="Alta de un puesto que no está en el nomenclador de 2016."
        action={
          <Button variant="outline" render={<Link href="/puestos" />}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver al nomenclador
          </Button>
        }
      />

      <FormularioPuesto
        opciones={opciones}
        valoresIniciales={{
          name: "",
          grouping_id: "",
          competencias: [],
          riesgos: [],
          responsabilidades: [],
          conocimientos: [],
          change_reason: "",
        }}
      />
    </>
  );
}
