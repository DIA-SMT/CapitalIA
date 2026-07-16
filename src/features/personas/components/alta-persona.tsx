"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import type { z } from "zod";

import { crearPersona, personaSchema } from "../actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Valores = z.input<typeof personaSchema>;

/** Alta de una persona. No la asigna a ningún puesto: eso se hace desde la ficha. */
export function AltaPersona() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Valores>({ resolver: zodResolver(personaSchema) });

  function onSubmit(values: Valores) {
    startTransition(async () => {
      const r = await crearPersona(values);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Persona cargada.");
      reset();
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <Button onClick={() => setAbierto(true)}>
        <UserPlus className="h-4 w-4" aria-hidden />
        Cargar persona
      </Button>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Cargar persona</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="legajo">Legajo *</Label>
              <Input id="legajo" {...register("legajo")} aria-invalid={!!errors.legajo} />
              {errors.legajo && (
                <p className="text-xs text-destructive">{errors.legajo.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Nombre y apellido *</Label>
              <Input
                id="full_name"
                {...register("full_name")}
                aria-invalid={!!errors.full_name}
              />
              {errors.full_name && (
                <p className="text-xs text-destructive">{errors.full_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="area">Área / repartición</Label>
              <Input id="area" {...register("area")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                setAbierto(false);
              }}
              disabled={pendiente}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
