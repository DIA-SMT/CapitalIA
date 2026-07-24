"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import type { PersonaListado } from "../data/personas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NoResultsState } from "@/components/states";

/** Quita tildes y mayúsculas para que buscar "gomez" encuentre "Gómez". */
function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Listado de personas con búsqueda de texto libre (nombre, legajo, repartición o
 * puesto) y filtros por repartición y estado. Cliente: el filtrado es sobre la
 * lista que ya trajo el servidor (aplicando RLS).
 */
export function TablaPersonas({ personas }: { personas: PersonaListado[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [reparticion, setReparticion] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);

  const reparticiones = useMemo(
    () =>
      [...new Set(personas.map((p) => p.reparticion).filter(Boolean))].sort() as string[],
    [personas],
  );

  const filtrados = useMemo(() => {
    const terminos = normalizar(busqueda.trim()).split(/\s+/).filter(Boolean);
    return personas.filter((p) => {
      if (reparticion && p.reparticion !== reparticion) return false;
      if (estado === "activa" && !p.activa) return false;
      if (estado === "baja" && p.activa) return false;
      if (terminos.length === 0) return true;
      const buscable = normalizar(
        [
          p.nombre,
          p.legajo,
          p.reparticion ?? "",
          p.puesto?.nombre ?? "",
          p.email ?? "",
        ].join(" "),
      );
      return terminos.every((t) => buscable.includes(t));
    });
  }, [personas, busqueda, reparticion, estado]);

  const sinPuesto = useMemo(
    () => personas.filter((p) => !p.puesto && p.activa).length,
    [personas],
  );

  const hayFiltro = busqueda !== "" || reparticion !== null || estado !== null;

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, legajo, repartición o puesto…"
          className="pl-9"
          aria-label="Buscar personas"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Repartición
          <select
            value={reparticion ?? ""}
            onChange={(e) => setReparticion(e.target.value || null)}
            className="h-8 max-w-[16rem] rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">Todas</option>
            {reparticiones.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Estado
          <select
            value={estado ?? ""}
            onChange={(e) => setEstado(e.target.value || null)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">Todos</option>
            <option value="activa">Activa</option>
            <option value="baja">Baja</option>
          </select>
        </label>

        {hayFiltro && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBusqueda("");
              setReparticion(null);
              setEstado(null);
            }}
          >
            <X className="h-4 w-4" aria-hidden />
            Limpiar
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtrados.length === personas.length
          ? `${personas.length} persona${personas.length === 1 ? "" : "s"}`
          : `${filtrados.length} de ${personas.length} personas`}
        {sinPuesto > 0 && ` · ${sinPuesto} sin puesto asignado`}
      </p>

      {filtrados.length === 0 ? (
        <NoResultsState
          title="Sin coincidencias"
          description="Probá con otro término o quitá los filtros."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Legajo</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Repartición</TableHead>
                <TableHead>Puesto que ocupa</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.legajo}
                  </TableCell>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.reparticion ?? "—"}
                  </TableCell>
                  <TableCell>
                    {p.puesto ? (
                      <Link
                        href={`/puestos/${p.puesto.id}`}
                        className="text-sm underline-offset-4 hover:underline"
                      >
                        {p.puesto.nombre}
                      </Link>
                    ) : (
                      <span className="text-sm italic text-muted-foreground">
                        Sin asignar
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.activa ? "secondary" : "outline"}>
                      {p.activa ? "Activa" : "Baja"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
