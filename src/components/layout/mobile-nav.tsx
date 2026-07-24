"use client";

import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavLinks } from "./nav-links";

export function MobileNav({
  open,
  onOpenChange,
  esAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  esAdmin: boolean;
}) {
  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Abrir navegación"
          />
        }
      >
        <Menu className="h-5 w-5" aria-hidden />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="h-16 justify-center border-b border-border px-4">
          <SheetTitle>
            <Logo />
          </SheetTitle>
        </SheetHeader>
        <NavLinks onNavigate={close} esAdmin={esAdmin} />
      </SheetContent>
    </Sheet>
  );
}
