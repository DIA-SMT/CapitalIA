"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserMinus, UserPlus, Users } from "lucide-react";

import type { CandidatosSinPuesto, PersonaEnPuesto } from "../data/personas";
import { asignarPersona, buscarSinPuesto, desasignarPersona } from "../actions";
import { Input } from "@/components/ui/input";
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
  /**
   * Candidatos sin puesto y **cuántos hay en total**. Ya viene acotado por RLS.
   * El total importa: el selector muestra los primeros y sin ese número un
   * recorte se leería como la lista completa.
   */
  disponibles: CandidatosSinPuesto;
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

  const [busqueda, setBusqueda] = useState("");
  /** Resultado de la última búsqueda, junto al término que lo produjo. */
  const [resultados, setResultados] = useState<
    { termino: string; datos: CandidatosSinPuesto } | null
  >(null);

  const termino = busqueda.trim();
  /**
   * Sin término manda lo que trajo el servidor —que se renueva solo con cada
   * `router.refresh()` de asignar o quitar—; con término, la última búsqueda.
   * Derivado y no copiado a estado: copiarlo obligaba a resincronizarlo desde un
   * efecto, que es la cascada de renders que React desaconseja.
   */
  const candidatos = termino === "" ? disponibles : (resultados?.datos ?? null);
  const buscando = termino !== "" && resultados?.termino !== termino;

  // Búsqueda con espera, para no consultar en cada tecla. `cancelado` evita que
  // una respuesta lenta pise a una más nueva.
  useEffect(() => {
    if (!abriendo || termino === "") return;
    let cancelado = false;
    const id = setTimeout(async () => {
      const datos = await buscarSinPuesto(termino);
      if (!cancelado) setResultados({ termino, datos });
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(id);
    };
  }, [termino, abriendo]);

  const vigentes = personas.filter((p) => !p.hasta);
  const pasadas = personas.filter((p) => p.hasta);
  const hayMas = !!candidatos && candidatos.total > candidatos.personas.length;

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
            {/* El buscador aparece en cuanto hay alguien: es la única vía de
                llegar a quien no entró en el primer tramo. */}
            {(disponibles.total > 0 || termino !== "") && (
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o legajo…"
                aria-label="Buscar entre las personas sin puesto"
                className="h-9"
              />
            )}

            {!candidatos ? (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Buscando…
              </p>
            ) : candidatos.personas.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {termino !== "" ? (
                  <>Ninguna persona sin puesto coincide con “{termino}”.</>
                ) : (
                  <>
                    No hay personas activas sin puesto asignado. Cargá una desde{" "}
                    <strong>Personas</strong>, o quitá a alguien de su puesto actual.
                  </>
                )}
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
                  {candidatos.personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — legajo {p.legajo}
                    </option>
                  ))}
                </select>
                {/* Decir que es un recorte, y cuánto falta. Un recorte anunciado
                    se sortea buscando; uno callado es una mentira. */}
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {buscando
                    ? "Buscando…"
                    : hayMas
                      ? `Mostrando ${candidatos.personas.length} de ${candidatos.total.toLocaleString("es-AR")} sin puesto. Buscá para encontrar al resto.`
                      : `${candidatos.total.toLocaleString("es-AR")} sin puesto asignado.`}
                </p>
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
