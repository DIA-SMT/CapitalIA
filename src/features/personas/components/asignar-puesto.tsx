"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import type { PersonaListado } from "../data/personas";
import type { PuestoOpcion } from "@/features/puestos/data/puestos";
import { asignarPersona } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Asignar —o cambiar— el puesto de una persona, desde su fila del listado.
 *
 * POR QUÉ EXISTE. Asignar ya se podía, pero solo desde la ficha del puesto: había
 * que saber a qué puesto ir, abrirlo y buscar ahí a la persona. Con 4.706 personas
 * cargadas y ninguna asignada, el recorrido natural es el inverso —está el agente
 * adelante y se sabe qué hace—, y en el testeo con usuarios la falta de este botón
 * se leyó como "la funcionalidad no está hecha".
 *
 * Reusa `asignarPersona` tal cual, la misma acción que la ficha del puesto: el
 * alcance lo sigue cortando la base (`asignar_persona` exige admin o que la
 * persona sea de una repartición propia), no esta pantalla.
 */
export function AsignarPuesto({
  persona,
  puestos,
  onCerrar,
}: {
  persona: PersonaListado;
  puestos: PuestoOpcion[];
  /** La tabla es la que abre y cierra: el panel ocupa una fila entera. */
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [elegido, setElegido] = useState(persona.puesto?.id ?? "");

  // Agrupados para que el desplegable de 210 opciones sea navegable, igual que en
  // el alta.
  const porAgrupamiento = puestos.reduce<Record<string, PuestoOpcion[]>>((acc, p) => {
    (acc[p.agrupamiento] ??= []).push(p);
    return acc;
  }, {});

  const cambio = Boolean(persona.puesto);

  function asignar() {
    if (!elegido || elegido === persona.puesto?.id) return;
    startTransition(async () => {
      const r = await asignarPersona(elegido, { persona_id: persona.id });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      const nombre = puestos.find((p) => p.id === elegido)?.nombre ?? "el puesto";
      // Decir que se cerró la anterior: es un efecto que nadie pidió explícitamente
      // y cambia la ocupación de otro puesto.
      toast.success(
        cambio
          ? `${persona.nombre} pasó a ${nombre}. Su asignación anterior quedó en el historial.`
          : `${persona.nombre} quedó asignada a ${nombre}.`,
      );
      onCerrar();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/30 p-3 text-left">
      <div className="space-y-1.5">
        <Label htmlFor={`puesto-${persona.id}`}>
          {cambio ? "Nuevo puesto" : "Puesto que va a ocupar"}
        </Label>
        <select
          id={`puesto-${persona.id}`}
          value={elegido}
          onChange={(e) => setElegido(e.target.value)}
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
        >
          <option value="">Elegí un puesto…</option>
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
        {cambio && (
          <p className="text-xs text-muted-foreground">
            Hoy ocupa <strong>{persona.puesto!.nombre}</strong>. Al asignar otro, esa
            asignación se cierra con la fecha de hoy y queda en el historial del
            puesto: no se borra.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={pendiente}>
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={asignar}
          disabled={pendiente || !elegido || elegido === persona.puesto?.id}
        >
          {pendiente ? "Asignando…" : cambio ? "Cambiar de puesto" : "Asignar"}
        </Button>
      </div>
    </div>
  );
}
