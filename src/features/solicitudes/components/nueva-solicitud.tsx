"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { FilePlus2 } from "lucide-react";

import { crearSolicitud } from "../actions";
import { solicitudSchema, type SolicitudFormValues } from "../schemas/solicitud";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Pedido de un puesto que no está en el nomenclador.
 *
 * A propósito pide lo mínimo —nombre y qué tareas hace—: el resto de la ficha
 * (agrupamiento, nivel, competencias, riesgos) lo completa Capital Humano en el
 * análisis técnico. Pedirle todo eso al solicitante sería pedirle que haga el
 * trabajo del analista.
 */
export function NuevaSolicitud({
  reparticiones,
}: {
  reparticiones: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SolicitudFormValues>({
    resolver: zodResolver(solicitudSchema),
    defaultValues: {
      reparticion_id: reparticiones.length === 1 ? reparticiones[0].id : "",
    },
  });

  function onSubmit(values: SolicitudFormValues) {
    startTransition(async () => {
      const r = await crearSolicitud(values);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Solicitud enviada. Capital Humano la va a evaluar.");
      reset();
      setAbierto(false);
      router.refresh();
    });
  }

  if (reparticiones.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Para solicitar un puesto necesitás tener una repartición asignada. Pedíselo
        a Capital Humano.
      </p>
    );
  }

  if (!abierto) {
    return (
      <Button onClick={() => setAbierto(true)}>
        <FilePlus2 className="h-4 w-4" aria-hidden />
        Solicitar puesto nuevo
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Solicitar un puesto nuevo</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre del puesto *</Label>
            <Input
              id="nombre"
              placeholder="Ej.: Operador de Drones"
              {...register("nombre")}
              aria-invalid={!!errors.nombre}
            />
            {errors.nombre && (
              <p className="text-xs text-destructive">{errors.nombre.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción de las tareas *</Label>
            <Textarea
              id="descripcion"
              rows={5}
              placeholder="Contá qué hace la persona en ese puesto: tareas principales, de qué se ocupa, con qué trabaja."
              {...register("descripcion")}
              aria-invalid={!!errors.descripcion}
            />
            {errors.descripcion && (
              <p className="text-xs text-destructive">{errors.descripcion.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Con esto alcanza: Capital Humano completa el resto de la ficha
              (agrupamiento, nivel, competencias, riesgos) al evaluarla.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reparticion_id">Repartición *</Label>
            <select
              id="reparticion_id"
              className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("reparticion_id")}
            >
              <option value="">Elegí la repartición</option>
              {reparticiones.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
            {errors.reparticion_id && (
              <p className="text-xs text-destructive">{errors.reparticion_id.message}</p>
            )}
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
              {pendiente ? "Enviando…" : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
