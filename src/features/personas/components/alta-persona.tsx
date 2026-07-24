"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

import { crearPersona } from "../actions";
import { personaSchema, type PersonaFormValues } from "../schemas/persona";
import type { PuestoOpcion } from "@/features/puestos/data/puestos";
import type { Secretaria } from "@/features/reparticiones/data/reparticiones";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Valores = PersonaFormValues;

/**
 * Alta de una persona, con su puesto en el mismo paso.
 *
 * El puesto es opcional: se puede cargar a alguien sin asignar y hacerlo después
 * desde la ficha del puesto. Pero el caso normal es saber a qué puesto va, y
 * obligar a ir a otra pantalla para eso no tenía sentido.
 */
export function AltaPersona({
  puestos,
  reparticiones,
}: {
  puestos: PuestoOpcion[];
  reparticiones: Secretaria[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  // Agrupados para que el desplegable de 210 opciones sea navegable.
  const porAgrupamiento = puestos.reduce<Record<string, PuestoOpcion[]>>((acc, p) => {
    (acc[p.agrupamiento] ??= []).push(p);
    return acc;
  }, {});

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
              <Label htmlFor="reparticion_id">Repartición</Label>
              <select
                id="reparticion_id"
                className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register("reparticion_id")}
              >
                <option value="">Sin repartición</option>
                {reparticiones.map((s) => (
                  <optgroup key={s.id} label={s.nombre}>
                    <option value={s.id}>{s.nombre} (secretaría)</option>
                    {s.direcciones.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nombre}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="position_id">Puesto que ocupa</Label>
              <select
                id="position_id"
                className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register("position_id")}
              >
                <option value="">Sin asignar por ahora</option>
                {Object.entries(porAgrupamiento).map(([agr, lista]) => (
                  <optgroup key={agr} label={agr}>
                    {lista.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({p.internalCode})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Se puede dejar sin asignar y hacerlo después desde la ficha del puesto.
              </p>
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
