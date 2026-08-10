"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { solicitarAcceso } from "../actions";
import {
  solicitudAccesoSchema,
  type SolicitudAccesoValues,
} from "../schemas/solicitud-acceso";

/**
 * Pedido de cuenta desde el login, para gente sin acceso.
 *
 * No crea la cuenta: deja una solicitud pendiente que un admin aprueba o rechaza
 * (bandeja `/solicitudes-acceso`). El envío corre sin sesión, contra la función
 * pública `solicitar_acceso`. La respuesta es siempre la misma haya o no una
 * pendiente con ese email: no confirma ni desmiente que exista.
 */
export function SolicitarAcceso() {
  const [abierto, setAbierto] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SolicitudAccesoValues>({
    resolver: zodResolver(solicitudAccesoSchema),
    defaultValues: { nombre: "", apellido: "", email: "", legajo: "" },
  });

  function onSubmit(values: SolicitudAccesoValues) {
    setFormError(null);
    startTransition(async () => {
      const r = await solicitarAcceso(values);
      if ("error" in r) {
        setFormError(r.error);
        return;
      }
      reset();
      setAbierto(false);
      setEnviado(true);
    });
  }

  if (enviado) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        <AlertTitle>Solicitud enviada</AlertTitle>
        <AlertDescription>
          Un administrador la va a revisar. Cuando la aprueben, te van a pasar los
          datos de acceso.
        </AlertDescription>
      </Alert>
    );
  }

  if (!abierto) {
    return (
      <div className="text-center">
        <Button
          variant="link"
          className="text-sm"
          onClick={() => setAbierto(true)}
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          ¿No tenés cuenta? Solicitá acceso
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 text-left">
      <p className="mb-3 text-sm font-medium text-foreground">Solicitar acceso</p>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        {formError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" aria-hidden />
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sa-nombre">Nombre</Label>
            <Input
              id="sa-nombre"
              disabled={isPending}
              aria-invalid={Boolean(errors.nombre)}
              {...register("nombre")}
            />
            {errors.nombre && (
              <p className="text-xs text-destructive">{errors.nombre.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sa-apellido">Apellido</Label>
            <Input
              id="sa-apellido"
              disabled={isPending}
              aria-invalid={Boolean(errors.apellido)}
              {...register("apellido")}
            />
            {errors.apellido && (
              <p className="text-xs text-destructive">{errors.apellido.message}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sa-email">Email</Label>
          <Input
            id="sa-email"
            type="email"
            placeholder="nombre@smt.gob.ar"
            disabled={isPending}
            aria-invalid={Boolean(errors.email)}
            {...register("email")}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sa-legajo">Número de legajo</Label>
          <Input
            id="sa-legajo"
            disabled={isPending}
            aria-invalid={Boolean(errors.legajo)}
            {...register("legajo")}
          />
          {errors.legajo && (
            <p className="text-xs text-destructive">{errors.legajo.message}</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => {
              reset();
              setFormError(null);
              setAbierto(false);
            }}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Enviando…" : "Enviar solicitud"}
          </Button>
        </div>
      </form>
    </div>
  );
}
