import Link from "next/link";

import { ACCIONES, TABLAS_AUDITADAS } from "../data/auditoria";
import { cn } from "@/lib/utils";

/**
 * Filtros de la bitácora.
 *
 * Son links, no selects: el estado vive en la URL, así que la vista se puede
 * compartir y volver atrás funciona. Además andan sin JavaScript y no obligan a
 * marcar todo el árbol como client.
 */

export type ParamsAuditoria = {
  tabla?: string;
  accion?: string;
  inicial?: string;
  pagina?: string;
};

/** Arma un href conservando el resto de los filtros y volviendo a la página 1. */
export function href(actual: ParamsAuditoria, cambio: Partial<ParamsAuditoria>): string {
  const params = new URLSearchParams();
  const final = { ...actual, ...cambio, pagina: cambio.pagina ?? undefined };

  if (final.tabla) params.set("tabla", final.tabla);
  if (final.accion) params.set("accion", final.accion);
  if (final.inicial) params.set("inicial", final.inicial);
  if (final.pagina && final.pagina !== "1") params.set("pagina", final.pagina);

  const qs = params.toString();
  return qs ? `/auditoria?${qs}` : "/auditoria";
}

/**
 * Link de descarga con los filtros puestos: se baja lo que se está viendo, no
 * siempre todo. Sin `pagina`: el CSV no se pagina.
 */
export function csvHref(actual: ParamsAuditoria): string {
  const params = new URLSearchParams();
  if (actual.tabla) params.set("tabla", actual.tabla);
  if (actual.accion) params.set("accion", actual.accion);
  if (actual.inicial) params.set("inicial", actual.inicial);

  const qs = params.toString();
  return qs ? `/api/auditoria/csv?${qs}` : "/api/auditoria/csv";
}

function Chip({
  activo,
  href: destino,
  children,
}: {
  activo: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={destino}
      aria-current={activo ? "true" : undefined}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        activo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-secondary",
      )}
    >
      {children}
    </Link>
  );
}

export function FiltrosAuditoria({ params }: { params: ParamsAuditoria }) {
  const verInicial = params.inicial === "1";

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Tipo</span>
        <Chip activo={!params.tabla} href={href(params, { tabla: undefined })}>
          Todo
        </Chip>
        {Object.entries(TABLAS_AUDITADAS).map(([clave, etiqueta]) => (
          <Chip
            key={clave}
            activo={params.tabla === clave}
            href={href(params, { tabla: clave })}
          >
            {etiqueta}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Acción</span>
        <Chip activo={!params.accion} href={href(params, { accion: undefined })}>
          Todas
        </Chip>
        {Object.entries(ACCIONES).map(([clave, etiqueta]) => (
          <Chip
            key={clave}
            activo={params.accion === clave}
            href={href(params, { accion: clave })}
          >
            {etiqueta}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-muted-foreground">Origen</span>
        <Chip activo={!verInicial} href={href(params, { inicial: undefined })}>
          Solo cambios desde la app
        </Chip>
        <Chip activo={verInicial} href={href(params, { inicial: "1" })}>
          Incluir la ingesta y los scripts
        </Chip>
      </div>
    </div>
  );
}
