import { cn } from "@/lib/utils";

/**
 * Isotipo de Capital humanIA.
 *
 * Aproximación institucional construida con los tokens de marca
 * (`--brand-azul`, `--brand-celeste`, `--brand-amarillo`). Cuando esté
 * disponible el archivo oficial en `public/brand/`, puede reemplazarse por un
 * <Image> sin cambiar los consumidores del componente.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      role="img"
      aria-label="Capital humanIA"
      className={cn("h-8 w-8", className)}
    >
      <path
        d="M24 45C6 37 5 15 21 6c0 14 0 25 3 39Z"
        fill="var(--brand-azul)"
      />
      <path
        d="M24 45c18-8 19-29 4-38-2 13-3 24-4 38Z"
        fill="var(--brand-celeste)"
      />
      <circle cx="32" cy="8" r="5.5" fill="var(--brand-amarillo)" />
    </svg>
  );
}

/** Logo con marca denominativa, para header y login. */
export function Logo({
  className,
  showText = true,
}: {
  className?: string;
  showText?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className="h-8 w-8 shrink-0" />
      {showText && (
        <span className="text-base font-semibold tracking-tight text-foreground">
          Capital human
          <span className="text-primary">IA</span>
        </span>
      )}
    </span>
  );
}
