"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, KeyRound } from "lucide-react";

import { ROLES, ROL_ETIQUETA } from "@/lib/roles";
import { aprobarSolicitudAcceso } from "../actions";
import {
  aprobarAccesoSchema,
  type AprobarAccesoValues,
} from "../schemas/solicitud-acceso";
import {
  SelectorReparticiones,
  type OpcionReparticion,
} from "@/features/usuarios/components/selector-reparticiones";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Aprobar una solicitud de acceso: el admin elige rol y reparticiones, y se crea
 * la cuenta con una contraseña temporal que se muestra UNA vez (igual que el alta
 * de usuarios). Recién al "Ya la anoté" se refresca la lista, para no perder la
 * contraseña al mover la tarjeta a "Resueltas".
 */
export function AprobarAcceso({
  solicitudId,
  reparticiones,
}: {
  solicitudId: string;
  reparticiones: OpcionReparticion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [claveNueva, setClaveNueva] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AprobarAccesoValues>({
    resolver: zodResolver(aprobarAccesoSchema),
    defaultValues: { role: "director", reparticiones: [] },
  });

  const rol = watch("role");
  const elegidas = watch("reparticiones") ?? [];

  function onSubmit(values: AprobarAccesoValues) {
    startTransition(async () => {
      const r = await aprobarSolicitudAcceso(solicitudId, values);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      if (r.aviso) toast.warning(r.aviso);
      else toast.success("Cuenta creada.");

      if (r.clave) {
        setClaveNueva(r.clave);
        setAbierto(false);
      } else {
        router.refresh();
      }
    });
  }

  if (claveNueva) {
    return (
      <Alert className="w-full">
        <KeyRound className="h-4 w-4" aria-hidden />
        <AlertTitle>Contraseña temporal</AlertTitle>
        <AlertDescription className="space-y-2">
          <code className="block rounded-md border border-border bg-card px-3 py-2 font-mono text-base tracking-wide text-foreground">
            {claveNueva}
          </code>
          <p className="text-xs">
            Anotala y pasásela a la persona. <strong>No se vuelve a mostrar</strong>{" "}
            y el sistema no manda mails. En su primer ingreso va a tener que
            cambiarla.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setClaveNueva(null);
              router.refresh();
            }}
          >
            Ya la anoté
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!abierto) {
    return (
      <Button size="sm" onClick={() => setAbierto(true)}>
        <Check className="h-4 w-4" aria-hidden />
        Aprobar
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`rol-${solicitudId}`}>Rol *</Label>
          <select
            id={`rol-${solicitudId}`}
            className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            {...register("role")}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_ETIQUETA[r]}
              </option>
            ))}
          </select>
        </div>

        {rol !== "admin" && (
          <div className="space-y-1.5">
            <Label>Reparticiones a cargo *</Label>
            <SelectorReparticiones
              opciones={reparticiones}
              seleccionadas={elegidas}
              onChange={(ids) =>
                setValue("reparticiones", ids, { shouldValidate: true })
              }
            />
            <p className="text-xs text-muted-foreground">
              {rol === "secretario"
                ? "Elegí la secretaría: va a ver también todas las direcciones que dependen de ella."
                : "Va a ver únicamente el personal de lo que elijas."}
            </p>
            {errors.reparticiones && (
              <p className="text-xs text-destructive">
                {errors.reparticiones.message}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pendiente}
            onClick={() => setAbierto(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={pendiente}>
            {pendiente ? "Creando…" : "Crear cuenta"}
          </Button>
        </div>
      </form>
    </div>
  );
}
