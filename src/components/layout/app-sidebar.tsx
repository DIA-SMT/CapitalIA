"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { Logo, LogoMark } from "@/components/brand/logo";
import { NavLinks } from "./nav-links";

/** Sidebar de escritorio, colapsable. Oculto en móvil (usa el Sheet del header). */
export function AppSidebar({
  collapsed,
  esAdmin,
}: {
  collapsed: boolean;
  esAdmin: boolean;
}) {
  return (
    <aside
      className={cn(
        // `sticky` + `self-start` + alto exacto de viewport: sin `self-start` el
        // flex lo estira hasta el alto del contenido y sticky no tiene margen
        // donde pegarse, así que la barra se iría scrolleando con la página.
        "hidden shrink-0 border-r border-border bg-card transition-[width] duration-200 md:flex md:flex-col motion-reduce:transition-none",
        "sticky top-0 h-svh self-start",
        collapsed ? "md:w-16" : "md:w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-border px-4",
          collapsed && "justify-center px-2",
        )}
      >
        <Link
          href="/dashboard"
          aria-label="Capital humanIA · Inicio"
          className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          {collapsed ? <LogoMark className="h-8 w-8" /> : <Logo />}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        <NavLinks collapsed={collapsed} esAdmin={esAdmin} />
      </div>
    </aside>
  );
}
