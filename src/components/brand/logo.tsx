import Image from "next/image";

import { cn } from "@/lib/utils";
import isotipo from "../../../public/logoMuni-sm.png";

/**
 * Isotipo oficial de la Municipalidad de San Miguel de Tucumán
 * (`public/logoMuni-sm.png`). Reemplaza el placeholder SVG que aproximaba la
 * marca con los tokens de color. Todos los consumidores (sidebar, header móvil,
 * login) lo usan a través de este componente.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={isotipo}
      alt="Municipalidad de San Miguel de Tucumán"
      priority
      className={cn("h-8 w-8 object-contain", className)}
    />
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
