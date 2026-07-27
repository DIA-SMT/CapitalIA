"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { crearReparticion, actualizarReparticion } from "../actions";
import {
  reparticionSchema,
  type ReparticionFormValues,
} from "../schemas/reparticion";
import type { ReparticionPlana } from "../data/reparticiones";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Alta y edición de una unidad del organigrama.
 *
 * El selector de "depende de" ya viene sin la propia unidad ni sus dependientes:
 * elegirlas armaría un ciclo. La base igual lo rechaza (migración 0017).
 */
export function FormularioReparticion({
  posiblesPadres,
  valoresIniciales,
  reparticionId,
}: {
  posiblesPadres: ReparticionPlana[];
  valoresIniciales: ReparticionFormValues;
  /** Si viene, se edita esa repartición; si no, es un alta. */
  reparticionId?: string;
}) {
  const [pendiente, startTransition] = useTransition();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const esEdicion = Boolean(reparticionId);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReparticionFormValues>({
    resolver: zodResolver(reparticionSchema),
    defaultValues: valoresIniciales,
  });

  function onSubmit(values: ReparticionFormValues) {
    setErrorGeneral(null);
    startTransition(async () => {
      const r = esEdicion
        ? await actualizarReparticion(reparticionId!, values)
        : await crearReparticion(values);
      // Si sale bien, la acción redirige y esto no llega a ejecutarse.
      if (r && "error" in r) {
        setErrorGeneral(r.error);
        return;
      }
      toast.success(esEdicion ? "Repartición actualizada." : "Repartición creada.");
    });
  }

  return (
    <Card>
      <CardContent className="py-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {errorGeneral && (
            <Alert>
              <AlertDescription className="text-destructive">
                {errorGeneral}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                placeholder="DIR55"
                {...register("code")}
                aria-invalid={!!errors.code}
              />
              {errors.code && (
                <p className="text-xs text-destructive">{errors.code.message}</p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                placeholder="Dirección de …"
                {...register("nombre")}
                aria-invalid={!!errors.nombre}
              />
              {errors.nombre && (
                <p className="text-xs text-destructive">{errors.nombre.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="parent_id">Depende de</Label>
            <select
              id="parent_id"
              className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("parent_id")}
            >
              <option value="">No depende de nadie (es una secretaría)</option>
              {posiblesPadres.map((p) => (
                <option key={p.id} value={p.id}>
                  {" ".repeat(p.nivel * 4)}
                  {p.nombre}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Dejalo vacío solo si es una secretaría. Una dirección depende de su
              subsecretaría, o de su secretaría si no tiene.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-[var(--primary)]"
              {...register("is_active")}
            />
            Activa
          </label>
          <p className="-mt-2 text-xs text-muted-foreground">
            Las reparticiones no se borran: si ya no existe, destildá esto. Se sigue
            viendo tachada y no aparece en los selectores, pero el personal y las
            solicitudes que la mencionan se conservan.
          </p>

          <div className="flex justify-end">
            <Button type="submit" disabled={pendiente}>
              {pendiente ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
