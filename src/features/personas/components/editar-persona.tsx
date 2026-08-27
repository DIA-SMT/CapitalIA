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
 * Corregir una persona: email, repartición y alta/baja. Solo admin.
 *
 * Es la pantalla que hace utilizable la importación. Las 4.706 personas entraron
 * con la repartición de la liquidación, que dice dónde se le paga a alguien y no
 * siempre dónde trabaja. Sin esto, CapitalIA sería una foto de sueldos que nadie
 * puede acomodar.
 *
 * LEGAJO Y NOMBRE SE MUESTRAN Y NO SE EDITAN, por dos motivos distintos:
 *
 * - El legajo es la clave con la que la sincronización mensual reconoce a la
 *   persona. Cambiarlo la convertiría en otra y la duplicaría en la corrida
 *   siguiente.
 * - El nombre lo reescribe esa sincronización en cada corrida
 *   (`scripts/importacion/importar.mjs` refresca `full_name` de toda persona ya
 *   cargada). Mientras el campo estuvo editable, corregir un nombre acá se
 *   perdía en silencio al mes siguiente: el campo prometía algo que el sistema
 *   no cumplía.
 *
 * La repartición es el caso inverso y conviene no confundirlos: es dato propio de
 * CapitalIA —dónde presta servicios, que la liquidación no sabe— y la
 * sincronización nunca la reescribe. Por eso se edita acá y solo acá.
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

  const [email, setEmail] = useState(persona.email ?? "");
  const [reparticionId, setReparticionId] = useState(persona.reparticionId ?? "");
  const [activa, setActiva] = useState(persona.activa);

  function guardar() {
    startTransition(async () => {
      const r = await editarPersona(persona.id, {
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
      {/* Lo que viene de la liquidación, en texto y no en campos: que se lea, que
          no se prometa editarlo. */}
      <div className="rounded-md border border-border bg-background/60 px-3 py-2">
        <p className="text-sm font-medium">{persona.nombre}</p>
        <p className="text-xs text-muted-foreground">
          Legajo <span className="font-mono">{persona.legajo}</span>
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Nombre y legajo vienen de la liquidación y se refrescan con la
          sincronización mensual: un cambio hecho acá se perdería. Se corrigen en el
          sistema de origen.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`rep-${persona.id}`}>Repartición donde presta servicios</Label>
        <select
          id={`rep-${persona.id}`}
          value={reparticionId}
          onChange={(e) => setReparticionId(e.target.value)}
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
        >
          <option value="">Elegí una repartición…</option>
          {reparticiones.map((r) => (
            <option key={r.id} value={r.id}>
              {" ".repeat(r.nivel * 4)}
              {r.nombre}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Dato propio de CapitalIA: la liquidación informa dónde se le{" "}
          <em>paga</em>, que no siempre es dónde trabaja. Lo que se corrija acá no
          lo sobrescribe la sincronización.
        </p>
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
