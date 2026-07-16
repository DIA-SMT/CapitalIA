import type { ReactNode } from "react";
import {
  AlertCircle,
  Inbox,
  Loader2,
  Lock,
  SearchX,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

type StatePanelProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "neutral" | "danger";
  className?: string;
};

/** Contenedor base para estados vacío / error / sin resultados / no autorizado. */
export function StatePanel({
  icon: Icon,
  title,
  description,
  action,
  tone = "neutral",
  className,
}: StatePanelProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          tone === "danger"
            ? "bg-destructive/10 text-destructive"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title = "Sin datos todavía",
  description = "Cuando se cargue información, aparecerá aquí.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StatePanel
      icon={Inbox}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

export function NoResultsState({
  title = "Sin resultados",
  description = "No se encontraron coincidencias para los filtros aplicados.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StatePanel
      icon={SearchX}
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

export function ErrorState({
  title = "Ocurrió un error",
  description = "No pudimos completar la operación. Intentá nuevamente.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StatePanel
      icon={AlertCircle}
      title={title}
      description={description}
      action={action}
      tone="danger"
      className={className}
    />
  );
}

export function UnauthorizedState({
  title = "Acceso no autorizado",
  description = "No tenés permisos para ver esta sección.",
  action,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StatePanel
      icon={Lock}
      title={title}
      description={description}
      action={action}
      tone="danger"
      className={className}
    />
  );
}

/** Indicador de carga accesible (respeta prefers-reduced-motion vía globals.css). */
export function LoadingState({
  label = "Cargando…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}
