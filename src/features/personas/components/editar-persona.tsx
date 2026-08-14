"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { PersonaListado } from "../data/personas";
import type { ReparticionPlana } from "@/features/reparticiones/data/reparticiones";
import { editarPersona } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Corregir una persona: nombre, email, repartición y alta/baja. Solo admin.
 *
 * Es la pantalla que hace utilizable la importación. Las 4.706 personas entraron
 * con la repartición de la liquidación, que dice dónde se le paga a alguien y no
 * siempre dónde trabaja. Sin esto, CapitalIA sería una foto de sueldos que nadie
 * puede acomodar.
 *
 * El legajo se muestra pero no se edita: es la clave con la que la sincronización
 * mensual reconoce a la persona.
 */
export function EditarPersona({
  persona,
  reparticiones,
  onCerrar,
}: {
  persona: PersonaListado;
  reparticiones: ReparticionPlana[];
  /** La tabla es la que abre y cierra: el formulario ocupa una fila entera. */
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  const [nombre, setNombre] = useState(persona.nombre);
  const [email, setEmail] = useState(persona.email ?? "");
  const [reparticionId, setReparticionId] = useState(persona.reparticionId ?? "");
  const [activa, setActiva] = useState(persona.activa);

  function guardar() {
    startTransition(async () => {
      const r = await editarPersona(persona.id, {
        full_name: nombre,
        email,
        reparticion_id: reparticionId,
        is_active: activa,
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      // Avisar si se le cerró la asignación, que es un efecto que no se pidió
      // explícitamente y cambia la ocupación de un puesto.
      toast.success(
        !activa && persona.puesto
          ? `${persona.nombre} pasó a baja y se cerró su asignación a ${persona.puesto.nombre}.`
          : "Persona actualizada.",
      );
      onCerrar();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3 text-left">
      <p className="text-xs text-muted-foreground">
        Legajo <span className="font-mono">{persona.legajo}</span> · no se puede
        cambiar
      </p>

      <div className="space-y-1.5">
        <Label htmlFor={`nombre-${persona.id}`}>Nombre</Label>
        <Input
          id={`nombre-${persona.id}`}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`rep-${persona.id}`}>Repartición</Label>
        <select
          id={`rep-${persona.id}`}
          value={reparticionId}
          onChange={(e) => setReparticionId(e.target.value)}
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
        >
          <option value="">Elegí una repartición…</option>
          {reparticiones.map((r) => (
            <option key={r.id} value={r.id}>
              {" ".repeat(r.nivel * 4)}
              {r.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`email-${persona.id}`}>Email</Label>
        <Input
          id={`email-${persona.id}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={activa}
          onChange={(e) => setActiva(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        Presta servicios
      </label>
      {!activa && (
        <p className="text-xs text-muted-foreground">
          No se borra: la dotación histórica se conserva.
          {persona.puesto && " Se va a cerrar su asignación al puesto."}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={pendiente}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={pendiente || !reparticionId}>
          {pendiente ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
