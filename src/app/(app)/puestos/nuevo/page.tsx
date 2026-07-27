import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Info } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormularioPuesto } from "@/features/puestos/components/formulario-puesto";
import { obtenerOpciones } from "@/features/puestos/data/opciones";
import { obtenerSolicitud } from "@/features/solicitudes/data/solicitudes";
import { getSessionRole } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nuevo puesto" };

// Next.js 16: `searchParams` es una Promesa y hay que await-earla.
type Props = { searchParams: Promise<{ solicitud?: string }> };

export default async function NuevoPuestoPage({ searchParams }: Props) {
  if ((await getSessionRole()) !== "admin") redirect("/puestos");

  const { solicitud: solicitudId } = await searchParams;
  const [opciones, solicitud] = await Promise.all([
    obtenerOpciones(),
    solicitudId ? obtenerSolicitud(solicitudId) : Promise.resolve(null),
  ]);

  // Evaluar una solicitud ya resuelta no tiene sentido: se vuelve a la bandeja.
  if (solicitudId && (!solicitud || solicitud.estado !== "pendiente")) {
    redirect("/solicitudes");
  }

  return (
    <>
      <PageHeader
        title={solicitud ? "Evaluar solicitud" : "Nuevo puesto"}
        description={
          solicitud
            ? "Completá la ficha técnica. Al guardar, el puesto se incorpora al nomenclador y la solicitud queda aprobada."
            : "Alta de un puesto que no está en el nomenclador de 2016."
        }
        action={
          <Button
            variant="outline"
            render={<Link href={solicitud ? "/solicitudes" : "/puestos"} />}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {solicitud ? "Volver a solicitudes" : "Volver al nomenclador"}
          </Button>
        }
      />

      {solicitud && (
        <Alert className="mb-6">
          <Info className="h-4 w-4" aria-hidden />
          <AlertTitle>
            Solicitud de {solicitud.reparticion ?? "—"}
            {solicitud.solicitante && ` · ${solicitud.solicitante}`}
          </AlertTitle>
          <AlertDescription>
            <span className="whitespace-pre-wrap">{solicitud.descripcion}</span>
          </AlertDescription>
        </Alert>
      )}

      <FormularioPuesto
        opciones={opciones}
        solicitudId={solicitud?.id}
        valoresIniciales={{
          // Lo que aportó el solicitante viene precargado; el admin lo puede
          // corregir para unificar redacción y terminología.
          name: solicitud?.nombre ?? "",
          general_description: solicitud?.descripcion ?? undefined,
          grouping_id: "",
          competencias: [],
          riesgos: [],
          responsabilidades: [],
          conocimientos: [],
          change_reason: solicitud
            ? "Alta por aprobación de solicitud de la repartición."
            : "",
        }}
      />
    </>
  );
}
