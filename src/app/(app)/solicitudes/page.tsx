import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, FileCheck2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NuevaSolicitud } from "@/features/solicitudes/components/nueva-solicitud";
import { RechazarSolicitud } from "@/features/solicitudes/components/rechazar-solicitud";
import {
  listarReparticionesParaSolicitar,
  listarSolicitudes,
  type Solicitud,
} from "@/features/solicitudes/data/solicitudes";
import { formatearInstante } from "@/lib/fechas";
import { getSessionRole } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Solicitudes" };

const ESTADO: Record<Solicitud["estado"], { texto: string; clase: string }> = {
  pendiente: {
    texto: "Pendiente",
    clase: "bg-amber-50 text-amber-700 border-amber-200",
  },
  aprobada: {
    texto: "Aprobada",
    clase: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  rechazada: {
    texto: "Rechazada",
    clase: "bg-red-50 text-red-700 border-red-200",
  },
};

function TarjetaSolicitud({
  s,
  esAdmin,
}: {
  s: Solicitud;
  esAdmin: boolean;
}) {
  const estado = ESTADO[s.estado];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{s.nombre}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {s.reparticion ?? "—"}
              {s.solicitante && ` · ${s.solicitante}`} ·{" "}
              {formatearInstante(s.creada)}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${estado.clase}`}
          >
            {estado.texto}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="whitespace-pre-wrap text-sm text-foreground">
          {s.descripcion}
        </p>

        {s.estado === "rechazada" && s.motivoRechazo && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Motivo del rechazo
            </p>
            <p className="mt-1 text-sm">{s.motivoRechazo}</p>
          </div>
        )}

        {s.estado === "aprobada" && s.puesto && (
          <p className="text-sm">
            Se incorporó al nomenclador como{" "}
            <Link
              href={`/puestos/${s.puesto.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {s.nombre}
            </Link>{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {s.puesto.internalCode}
            </span>
          </p>
        )}

        {esAdmin && s.estado === "pendiente" && (
          <div className="flex flex-wrap items-start gap-2">
            <Button size="sm" render={<Link href={`/puestos/nuevo?solicitud=${s.id}`} />}>
              <FileCheck2 className="h-4 w-4" aria-hidden />
              Evaluar y aprobar
            </Button>
            <RechazarSolicitud solicitudId={s.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function SolicitudesPage() {
  const esAdmin = (await getSessionRole()) === "admin";
  const [solicitudes, reparticiones] = await Promise.all([
    listarSolicitudes(),
    listarReparticionesParaSolicitar(esAdmin),
  ]);

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const resueltas = solicitudes.filter((s) => s.estado !== "pendiente");

  return (
    <>
      <PageHeader
        title="Solicitudes"
        description={
          esAdmin
            ? "Pedidos de puestos nuevos de las reparticiones, para evaluar."
            : "Pedidos de puestos que no están en el nomenclador."
        }
      />

      <div className="mb-6">
        <NuevaSolicitud reparticiones={reparticiones} />
      </div>

      {solicitudes.length === 0 ? (
        <EmptyState
          title="Sin solicitudes"
          description={
            esAdmin
              ? "Cuando una repartición pida un puesto nuevo, aparece acá para evaluar."
              : "Si una función que cumple tu personal no está en el nomenclador, pedila con el botón de arriba."
          }
        />
      ) : (
        <div className="space-y-6">
          {pendientes.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <ClipboardCheck className="h-4 w-4 text-amber-600" aria-hidden />
                Pendientes de evaluación ({pendientes.length})
              </h2>
              <div className="space-y-3">
                {pendientes.map((s) => (
                  <TarjetaSolicitud key={s.id} s={s} esAdmin={esAdmin} />
                ))}
              </div>
            </section>
          )}

          {resueltas.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Resueltas ({resueltas.length})
              </h2>
              <div className="space-y-3">
                {resueltas.map((s) => (
                  <TarjetaSolicitud key={s.id} s={s} esAdmin={esAdmin} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
