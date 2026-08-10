"use client";

import { LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { signOut } from "@/features/auth/actions";

/**
 * Cerrar sesión como acción visible de la navegación.
 *
 * El menú del avatar ya lo ofrece, pero quedaba escondido y los usuarios no lo
 * encontraban. Este botón lo pone al pie del sidebar y del menú móvil, con el
 * mismo estilo que un ítem de navegación. En modo colapsado muestra solo el ícono
 * con tooltip, igual que los enlaces.
 */
export function SignOutButton({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const boton = (
    <button
      type="submit"
      onClick={onNavigate}
      aria-label={collapsed ? "Cerrar sesión" : undefined}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        collapsed && "justify-center px-2",
      )}
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed && <span className="truncate">Cerrar sesión</span>}
    </button>
  );

  return (
    <form action={signOut} className="w-full">
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={boton} />
          <TooltipContent side="right">Cerrar sesión</TooltipContent>
        </Tooltip>
      ) : (
        boton
      )}
    </form>
  );
}
