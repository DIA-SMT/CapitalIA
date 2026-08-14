import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  ClipboardList,
  FileStack,
  FileText,
  GitBranch,
  Landmark,
  Network,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resumenDotacion } from "@/features/personas/data/personas";
import { obtenerResumen } from "@/features/puestos/data/resumen";
import { resumenOrganigrama } from "@/features/reparticiones/data/reparticiones";
import { contarSolicitudesPendientes } from "@/features/solicitudes/data/solicitudes";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Un indicador. La tarjeta entera es clickeable —el link se estira con
 * `after:inset-0`— pero el nombre accesible es la etiqueta y no el número, que
 * suelto no dice nada.
 */
function Indicador({
  etiqueta,
  valor,
  detalle,
  icono: Icono,
  href,
  acento = "text-brand-celeste",
}: {
  etiqueta: string;
  valor: number;
  detalle: string;
  icono: LucideIcon;
  href: string;
  acento?: string;
}) {
  return (
    <Card className="relative transition-colors hover:bg-secondary/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardDescription>
            <Link
              href={href}
              className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {etiqueta}
            </Link>
          </CardDescription>
          <Icono className={`h-4 w-4 ${acento}`} aria-hidden />
        </div>
        <CardTitle className="text-3xl tabular-nums">{valor}</CardTitle>
        <CardDescription className="text-xs">{detalle}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** Una fila del gráfico de barras: nombre, barra proporcional y total. */
function Barra({
  nombre,
  cantidad,
  maximo,
}: {
  nombre: string;
  cantidad: number;
  maximo: number;
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-52 shrink-0 truncate text-sm" title={nombre}>
        {nombre}
      </span>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(cantidad / maximo) * 100}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
        {cantidad}
      </span>
    </li>
  );
}

export default async function DashboardPage() {
  const [r, org, dotacion, solicitudes] = await Promise.all([
    obtenerResumen(),
    resumenOrganigrama(),
    resumenDotacion(),
    contarSolicitudesPendientes(),
  ]);

  if (!r) {
    return (
      <>
        <PageHeader
          title="Dashboard"
          description="Resumen general del Nomenclador de Puestos."
        />
        <EmptyState
          title="Todavía no hay datos"
          description="Los indicadores se completan al cargar las fichas del nomenclador."
        />
      </>
    );
  }

  // Las barras se miden contra la más larga, no contra el total: con nueve
  // secretarías, la proporción sobre el total dejaría todas las barras cortitas.
  const maxSecretaria = Math.max(1, ...org.porSecretaria.map((s) => s.unidades));
  const maxAgrupamiento = Math.max(1, ...r.porAgrupamiento.map((a) => a.cantidad));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen general del Nomenclador de Puestos y de la estructura municipal."
        action={
          <Button variant="outline" render={<Link href="/puestos" />}>
            <FileStack className="h-4 w-4" aria-hidden />
            Ver el nomenclador
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Indicador
          etiqueta="Puestos"
          valor={r.puestos}
          detalle="Vigentes en el nomenclador"
          icono={FileStack}
          href="/puestos"
        />
        <Indicador
          etiqueta="Fichas históricas"
          valor={r.fichas}
          detalle="Transcritas del nomenclador 2016"
          icono={FileText}
          href="/puestos"
        />
        <Indicador
          etiqueta="Secretarías"
          valor={org.secretarias}
          detalle="En la raíz del organigrama"
          icono={Landmark}
          href="/reparticiones"
        />
        <Indicador
          etiqueta="Subsecretarías"
          valor={org.subsecretarias}
          detalle="Con direcciones a cargo"
          icono={Network}
          href="/reparticiones"
        />
        <Indicador
          etiqueta="Direcciones"
          valor={org.direcciones}
          detalle="Unidades de línea"
          icono={Building2}
          href="/reparticiones"
        />
        {/* El cuarto escalón no existe en el organigrama del POA, así que la
            tarjeta aparece recién cuando se importe el de sueldos. Mostrar un
            cero permanente sería ruido. */}
        {org.subdirecciones > 0 && (
          <Indicador
            etiqueta="Subdirecciones"
            valor={org.subdirecciones}
            detalle="Unidades de última línea"
            icono={GitBranch}
            href="/reparticiones"
          />
        )}
        <Indicador
          etiqueta="Personas"
          valor={dotacion.personas}
          detalle={
            dotacion.personas === 0
              ? "Todavía no se cargó dotación"
              : `${dotacion.conPuesto} con puesto asignado`
          }
          icono={Users}
          href="/personas"
        />
      </div>

      {solicitudes > 0 && (
        <Card className="mt-4 relative transition-colors hover:bg-secondary/30">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <ClipboardList
                  className="h-5 w-5 shrink-0 text-amber-600"
                  aria-hidden
                />
                <div>
                  <CardTitle className="text-base">
                    <Link
                      href="/solicitudes"
                      className="rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {solicitudes === 1
                        ? "1 solicitud esperando respuesta"
                        : `${solicitudes} solicitudes esperando respuesta`}
                    </Link>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Pedidos de puestos que no están en el nomenclador.
                  </CardDescription>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">Ver solicitudes →</span>
            </div>
          </CardHeader>
        </Card>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {org.secretarias > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estructura organizativa</CardTitle>
              <CardDescription>
                Unidades que dependen de cada una de las {org.secretarias}{" "}
                secretarías.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {org.porSecretaria.map(({ id, nombre, unidades }) => (
                  <Barra
                    key={id}
                    nombre={nombre}
                    cantidad={unidades}
                    maximo={maxSecretaria}
                  />
                ))}
              </ul>
              <Link
                href="/reparticiones"
                className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Ver el organigrama completo →
              </Link>
            </CardContent>
          </Card>
        )}

        {r.puestos > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Puestos por agrupamiento
              </CardTitle>
              <CardDescription>
                Distribución de los {r.puestos} puestos vigentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-3">
                {r.porAgrupamiento.map(({ nombre, cantidad }) => (
                  <Barra
                    key={nombre}
                    nombre={nombre}
                    cantidad={cantidad}
                    maximo={maxAgrupamiento}
                  />
                ))}
              </ul>
              <Link
                href="/puestos"
                className="inline-block text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Ver el nomenclador →
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
