"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cambiarClave } from "./actions";
import { cambioClaveSchema, type CambioClaveValues } from "./schema";

/**
 * Formulario de cambio de contraseña. Se usa tanto en el flujo obligatorio (primer
 * ingreso con contraseña temporal) como en el voluntario desde Configuración; la
 * diferencia es solo el copy y si se ofrece un "Cancelar".
 */
export function CambioClaveForm({ obligatorio }: { obligatorio: boolean }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CambioClaveValues>({
    resolver: zodResolver(cambioClaveSchema),
    defaultValues: { password: "", confirm: "" },
  });

  function onSubmit(values: CambioClaveValues) {
    setFormError(null);
    startTransition(async () => {
      // En éxito, la Server Action redirige a /dashboard; en error, devuelve texto.
      const result = await cambiarClave(values);
      if (result?.error) setFormError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {formError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          disabled={isPending}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p id="password-error" role="alert" className="text-sm text-destructive">
            {errors.password.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Repetir la nueva contraseña</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          disabled={isPending}
          aria-invalid={Boolean(errors.confirm)}
          aria-describedby={errors.confirm ? "confirm-error" : undefined}
          {...register("confirm")}
        />
        {errors.confirm && (
          <p id="confirm-error" role="alert" className="text-sm text-destructive">
            {errors.confirm.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        <KeyRound className="h-4 w-4" aria-hidden />
        {isPending ? "Guardando…" : "Guardar contraseña"}
      </Button>

      {!obligatorio && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          disabled={isPending}
          render={<Link href="/configuracion" />}
        >
          Cancelar
        </Button>
      )}
    </form>
  );
}
