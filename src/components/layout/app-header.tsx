"use client";

import Link from "next/link";
import { FilePlus2, PanelLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "./breadcrumbs";
import { MobileNav } from "./mobile-nav";
import { UserMenu, type SessionUser } from "./user-menu";

export function AppHeader({
  user,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileOpenChange,
}: {
  user: SessionUser;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-4">
      <MobileNav open={mobileOpen} onOpenChange={onMobileOpenChange} />

      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
        aria-pressed={collapsed}
        className="hidden md:inline-flex"
      >
        <PanelLeft className="h-5 w-5" aria-hidden />
      </Button>

      <Separator orientation="vertical" className="hidden h-6 md:block" />

      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="hidden sm:inline-flex"
        render={<Link href="/puestos/nuevo" />}
      >
        <FilePlus2 className="h-4 w-4" aria-hidden />
        Nuevo puesto
      </Button>

      <UserMenu user={user} />
    </header>
  );
}
