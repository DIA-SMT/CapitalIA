import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Nuevo puesto" };

export default function NuevoPuestoPage() {
  return (
    <>
      <PageHeader
        title="Nuevo puesto"
        description="Alta de un puesto en el nomenclador."
        action={
          <Button variant="outline" render={<Link href="/puestos" />}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Volver al nomenclador
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <Construction className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <CardTitle>Formulario en preparación</CardTitle>
              <CardDescription>
                Los campos de la ficha se definen a partir de los PDF del
                nomenclador.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            El formulario de alta (con validación mediante React Hook Form + Zod)
            se implementará una vez fijado el esquema definitivo de puestos. Esta
            pantalla ya forma parte de la navegación y del layout protegido.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
