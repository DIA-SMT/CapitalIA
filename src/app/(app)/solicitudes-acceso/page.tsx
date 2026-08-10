import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AprobarAcceso } from "@/features/solicitudes-acceso/components/aprobar-acceso";
import { RechazarAcceso } from "@/features/solicitudes-acceso/components/rechazar-acceso";
import {
  listarSolicitudesAcceso,
  type SolicitudAcceso,
} from "@/features/solicitudes-acceso/data/solicitudes-acceso";
import { listarReparticionesPlanas } from "@/features/reparticiones/data/reparticiones";
import { formatearInstante } from "@/lib/fechas";
import { getSessionRole } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Solicitudes de acceso" };

const ESTADO: Record<SolicitudAcceso["estado"], { texto: string; clase: string }> = {
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

function TarjetaAcceso({
  s,
  reparticiones,
}: {
  s: SolicitudAcceso;
  reparticiones: Awaited<ReturnType<typeof listarReparticionesPlanas>>;
}) {
  const estado = ESTADO[s.estado];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">
              {s.nombre} {s.apellido}
            </CardTitle>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{s.email}</span>
              <span>Legajo {s.legajo}</span>
              <span>{formatearInstante(s.creada)}</span>
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
        {s.estado === "rechazada" && s.motivoRechazo && (
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Motivo del rechazo
            </p>
            <p className="mt-1 text-sm">{s.motivoRechazo}</p>
          </div>
        )}

        {s.estado === "aprobada" && (
          <p className="text-sm text-muted-foreground">
            Se creó la cuenta{s.resuelta ? ` · ${formatearInstante(s.resuelta)}` : ""}.
          </p>
        )}

        {s.estado === "pendiente" && (
          <div className="flex flex-wrap items-start gap-2">
            <AprobarAcceso solicitudId={s.id} reparticiones={reparticiones} />
            <RechazarAcceso solicitudId={s.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function SolicitudesAccesoPage() {
  if ((await getSessionRole()) !== "admin") redirect("/dashboard");

  const [solicitudes, reparticiones] = await Promise.all([
    listarSolicitudesAcceso(),
    listarReparticionesPlanas(),
  ]);

  const pendientes = solicitudes.filter((s) => s.estado === "pendiente");
  const resueltas = solicitudes.filter((s) => s.estado !== "pendiente");

  return (
    <>
      <PageHeader
        title="Solicitudes de acceso"
        description="Pedidos de cuenta hechos desde el login. Aprobalos para crear el usuario o rechazalos."
      />

      {solicitudes.length === 0 ? (
        <EmptyState
          title="Sin solicitudes"
          description="Cuando alguien pida acceso desde el login, aparece acá para aprobar o rechazar."
        />
      ) : (
        <div className="space-y-6">
          {pendientes.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <ClipboardCheck className="h-4 w-4 text-amber-600" aria-hidden />
                Pendientes ({pendientes.length})
              </h2>
              <div className="space-y-3">
                {pendientes.map((s) => (
                  <TarjetaAcceso key={s.id} s={s} reparticiones={reparticiones} />
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
                  <TarjetaAcceso key={s.id} s={s} reparticiones={reparticiones} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
