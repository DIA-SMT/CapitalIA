"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { KeyRound, UserPlus } from "lucide-react";

import { crearUsuario } from "../actions";
import {
  ROLES,
  ROL_ETIQUETA,
  usuarioSchema,
  type UsuarioFormValues,
} from "../schemas/usuario";
import {
  SelectorReparticiones,
  type OpcionReparticion,
} from "./selector-reparticiones";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Alta de un usuario del sistema.
 *
 * Al crearlo se genera una contraseña temporal que se muestra UNA vez: no hay
 * envío de mails, así que Capital Humano se la pasa a la persona por fuera. Si se
 * pierde, se resuelve creando otra desde Supabase; por eso el aviso es insistente.
 */
export function AltaUsuario({ reparticiones }: { reparticiones: OpcionReparticion[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [claveNueva, setClaveNueva] = useState<{ email: string; clave: string } | null>(
    null,
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<UsuarioFormValues>({
    resolver: zodResolver(usuarioSchema),
    defaultValues: { role: "director", reparticiones: [] },
  });

  const rol = watch("role");
  const elegidas = watch("reparticiones") ?? [];

  function onSubmit(values: UsuarioFormValues) {
    startTransition(async () => {
      const r = await crearUsuario(values);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Usuario creado.");
      if (r.clave) setClaveNueva({ email: values.email, clave: r.clave });
      reset({ role: "director", reparticiones: [] });
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {claveNueva && (
        <Alert>
          <KeyRound className="h-4 w-4" aria-hidden />
          <AlertTitle>Contraseña temporal de {claveNueva.email}</AlertTitle>
          <AlertDescription className="space-y-2">
            <code className="block rounded-md border border-border bg-card px-3 py-2 font-mono text-base tracking-wide text-foreground">
              {claveNueva.clave}
            </code>
            <p className="text-xs">
              Anotala y pasásela a la persona. <strong>No se vuelve a mostrar</strong>{" "}
              y el sistema no manda mails.
            </p>
            <Button size="sm" variant="outline" onClick={() => setClaveNueva(null)}>
              Ya la anoté
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {!abierto ? (
        <Button onClick={() => setAbierto(true)}>
          <UserPlus className="h-4 w-4" aria-hidden />
          Crear usuario
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crear usuario</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="nombre@smt.gob.ar"
                    {...register("email")}
                    aria-invalid={!!errors.email}
                  />
                  {errors.email && (
                    <p className="text-xs text-destructive">{errors.email.message}</p>
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
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="role">Rol *</Label>
                <select
                  id="role"
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
                      ? "Elegí la secretaría: el usuario va a ver también todas las direcciones que dependen de ella."
                      : "El usuario va a ver únicamente el personal de lo que elijas."}
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
                  variant="outline"
                  onClick={() => {
                    reset({ role: "director", reparticiones: [] });
                    setAbierto(false);
                  }}
                  disabled={pendiente}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={pendiente}>
                  {pendiente ? "Creando…" : "Crear usuario"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
