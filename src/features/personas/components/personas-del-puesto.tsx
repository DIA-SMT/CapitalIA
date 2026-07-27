"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserMinus, UserPlus, Users } from "lucide-react";

import type { PersonaEnPuesto } from "../data/personas";
import { asignarPersona, desasignarPersona } from "../actions";
import { formatearFecha } from "@/lib/fechas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  positionId: string;
  personas: PersonaEnPuesto[];
  /** Personas activas sin puesto asignado. Ya viene acotado por RLS. */
  disponibles: { id: string; nombre: string; legajo: string }[];
  /**
   * Si es false (sin rol), se ocultan las acciones de asignar/quitar. Desde la
   * 0018 el director y el secretario también asignan: no hace falta filtrar acá
   * quién es de su repartición, porque `disponibles` y `personas` ya llegan
   * acotados por RLS y `asignar_persona` rechaza lo que no sea de su alcance.
   */
  puedeEditar: boolean;
};

/**
 * Quién ocupa este puesto. Muestra las asignaciones vigentes y las que
 * terminaron: la dotación histórica también es parte del nomenclador.
 */
export function PersonasDelPuesto({
  positionId,
  personas,
  disponibles,
  puedeEditar,
}: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abriendo, setAbriendo] = useState(false);
  const [elegida, setElegida] = useState("");

  const vigentes = personas.filter((p) => !p.hasta);
  const pasadas = personas.filter((p) => p.hasta);

  function asignar() {
    if (!elegida) return;
    startTransition(async () => {
      const r = await asignarPersona(positionId, { persona_id: elegida });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Persona asignada al puesto.");
      setElegida("");
      setAbriendo(false);
      router.refresh();
    });
  }

  function quitar(personaId: string, nombre: string) {
    if (!confirm(`¿Quitar a ${nombre} de este puesto? La asignación queda en el historial.`)) {
      return;
    }
    startTransition(async () => {
      const r = await desasignarPersona(personaId, positionId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Se cerró la asignación.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" aria-hidden />
              Personas en este puesto
            </CardTitle>
            <CardDescription className="mt-1">
              {vigentes.length === 0
                ? "Nadie asignado actualmente."
                : `${vigentes.length} persona${vigentes.length === 1 ? "" : "s"} ocupando el puesto.`}
            </CardDescription>
          </div>
          {puedeEditar && !abriendo && (
            <Button size="sm" variant="outline" onClick={() => setAbriendo(true)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Asignar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {abriendo && (
          <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
            {disponibles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay personas activas sin puesto asignado. Cargá una desde{" "}
                <strong>Personas</strong>, o quitá a alguien de su puesto actual.
              </p>
            ) : (
              <>
                <label htmlFor="persona" className="text-sm font-medium">
                  Elegí la persona
                </label>
                <select
                  id="persona"
                  value={elegida}
                  onChange={(e) => setElegida(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
                >
                  <option value="">Elegir…</option>
                  {disponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — legajo {p.legajo}
                    </option>
                  ))}
                </select>
              </>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAbriendo(false);
                  setElegida("");
                }}
                disabled={pendiente}
              >
                Cancelar
              </Button>
              <Button size="sm" onClick={asignar} disabled={!elegida || pendiente}>
                {pendiente ? "Asignando…" : "Asignar"}
              </Button>
            </div>
          </div>
        )}

        {vigentes.length > 0 && (
          <ul className="space-y-2">
            {vigentes.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    Legajo {p.legajo}
                    {p.reparticion && ` · ${p.reparticion}`} · desde {formatearFecha(p.desde)}
                  </p>
                </div>
                {puedeEditar && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => quitar(p.personaId, p.nombre)}
                    disabled={pendiente}
                    aria-label={`Quitar a ${p.nombre} del puesto`}
                  >
                    <UserMinus className="h-4 w-4" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {pasadas.length > 0 && (
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Ocuparon este puesto antes
            </h3>
            <ul className="mt-2 space-y-1">
              {pasadas.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{p.nombre}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {formatearFecha(p.desde)} – {formatearFecha(p.hasta!)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
