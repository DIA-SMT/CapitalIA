"use client";

import { useState, type ReactNode } from "react";

import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import type { SessionUser } from "./user-menu";

/**
 * Estructura del layout privado: sidebar colapsable + header + contenido.
 * El estado de colapso (escritorio) y de apertura del menú móvil vive aquí y se
 * comparte con el header. El contenido (`children`) proviene de Server Components.
 */
export function AppShell({
  user,
  esAdmin,
  children,
}: {
  user: SessionUser;
  esAdmin: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-svh bg-background">
      <AppSidebar collapsed={collapsed} esAdmin={esAdmin} />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          user={user}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
          esAdmin={esAdmin}
        />

        <main
          id="contenido"
          className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
