"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import type { PuestoListado } from "../data/puestos";
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

/** Quita tildes y mayúsculas para que buscar "mecanico" encuentre "MECÁNICO". */
function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const TONO_RIESGO: Record<string, string> = {
  Escaso: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Bajo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Bajo a Moderado": "bg-amber-50 text-amber-700 border-amber-200",
  Medio: "bg-amber-50 text-amber-700 border-amber-200",
  Moderado: "bg-amber-50 text-amber-700 border-amber-200",
  "Moderado a Alto": "bg-orange-50 text-orange-700 border-orange-200",
  Alto: "bg-red-50 text-red-700 border-red-200",
  Severo: "bg-red-50 text-red-700 border-red-200",
};

/** Vigentes por defecto: el listado histórico son los 210 no archivados. */
type EstadoFiltro = "vigentes" | "archivados" | "todos";

type Filtros = {
  agrupamiento: string | null;
  riesgo: string | null;
  nivelArea: string | null;
  verificacion: string | null;
  estado: EstadoFiltro;
};

const SIN_FILTROS: Filtros = {
  agrupamiento: null,
  riesgo: null,
  nivelArea: null,
  verificacion: null,
  estado: "vigentes",
};

function Selector({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: string | null;
  opciones: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {etiqueta}
      <select
        value={valor ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TablaPuestos({ puestos }: { puestos: PuestoListado[] }) {
  const [orden, setOrden] = useState<SortingState>([]);
  const [busqueda, setBusqueda] = useState("");
  const [f, setF] = useState<Filtros>(SIN_FILTROS);

  const listas = useMemo(
    () => ({
      agrupamientos: [...new Set(puestos.map((p) => p.agrupamiento))].sort(),
      riesgos: [...new Set(puestos.map((p) => p.riesgo).filter(Boolean))].sort() as string[],
      nivelesAreas: [
        ...new Set(puestos.map((p) => p.area ?? (p.nivel ? `Nivel ${p.nivel}` : null)).filter(Boolean)),
      ].sort() as string[],
    }),
    [puestos],
  );

  // Filtro propio en vez del de TanStack: hay que cruzar la búsqueda de texto
  // libre (sobre el índice que arma el servidor) con cuatro filtros exactos.
  const filtrados = useMemo(() => {
    const terminos = normalizar(busqueda.trim()).split(/\s+/).filter(Boolean);
    return puestos.filter((p) => {
      const archivado = p.estado === "archived";
      if (f.estado === "vigentes" && archivado) return false;
      if (f.estado === "archivados" && !archivado) return false;
      if (f.agrupamiento && p.agrupamiento !== f.agrupamiento) return false;
      if (f.riesgo && p.riesgo !== f.riesgo) return false;
      if (f.verificacion && p.verificacion !== f.verificacion) return false;
      if (f.nivelArea) {
        const na = p.area ?? (p.nivel ? `Nivel ${p.nivel}` : null);
        if (na !== f.nivelArea) return false;
      }
      // Todos los términos tienen que aparecer: "chofer pesados" es más preciso
      // que buscar la frase entera.
      return terminos.every((t) => p.buscable.includes(t));
    });
  }, [puestos, busqueda, f]);

  const columnas = useMemo<ColumnDef<PuestoListado>[]>(
    () => [
      {
        accessorKey: "internalCode",
        header: "Código",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {row.original.internalCode}
          </span>
        ),
      },
      {
        accessorKey: "nombre",
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Puesto
            <ArrowUpDown className="h-3 w-3" aria-hidden />
          </button>
        ),
        cell: ({ row }) => (
          // El enlace va en la celda y no en la fila: una fila clickeable no es
          // navegable por teclado ni se puede abrir en otra pestaña.
          <div className="flex items-center gap-2">
            <Link
              href={`/puestos/${row.original.id}`}
              className="font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
            >
              {row.original.nombre}
            </Link>
            {row.original.variante && (
              <Badge variant="outline" className="text-[10px]">
                {row.original.variante}
              </Badge>
            )}
            {row.original.estado === "archived" && (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] text-amber-700"
              >
                Archivado
              </Badge>
            )}
          </div>
        ),
      },
      { accessorKey: "agrupamiento", header: "Agrupamiento" },
      {
        id: "nivelArea",
        header: "Nivel / Área",
        accessorFn: (p) => p.area ?? p.nivel ?? "",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.area ?? row.original.nivel ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "riesgo",
        header: "Riesgo",
        cell: ({ row }) => {
          const r = row.original.riesgo;
          if (!r) return <span className="text-muted-foreground">—</span>;
          return (
            // title = literal impreso en la ficha; la celda muestra el canónico
            <span
              title={row.original.riesgoImpreso ?? undefined}
              className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${
                TONO_RIESGO[r] ?? "bg-secondary text-secondary-foreground border-border"
              }`}
            >
              {r}
            </span>
          );
        },
      },
      {
        accessorKey: "paginaImpresa",
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Pág.
            <ArrowUpDown className="h-3 w-3" aria-hidden />
          </button>
        ),
        cell: ({ row }) => (
          <span
            className="text-xs text-muted-foreground"
            title="Página impresa del nomenclador 2016"
          >
            {row.original.paginaImpresa ?? "—"}
          </span>
        ),
      },
    ],
    [],
  );

  const tabla = useReactTable({
    data: filtrados,
    columns: columnas,
    state: { sorting: orden },
    onSortingChange: setOrden,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  // `estado` siempre tiene valor, así que no entra en el `.some(Boolean)`: cuenta
  // como filtro activo solo cuando se aparta del default "vigentes".
  const hayFiltro =
    busqueda !== "" ||
    f.agrupamiento !== null ||
    f.riesgo !== null ||
    f.nivelArea !== null ||
    f.verificacion !== null ||
    f.estado !== "vigentes";

  // Total del estado elegido (sin los demás filtros), para que el contador no
  // diga "210 de 211" en la vista por defecto solo porque existe un archivado.
  const totalEstado = useMemo(() => {
    if (f.estado === "todos") return puestos.length;
    const buscoArchivado = f.estado === "archivados";
    return puestos.filter((p) => (p.estado === "archived") === buscoArchivado)
      .length;
  }, [puestos, f.estado]);

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
          placeholder="Buscar en toda la ficha: nombre, tareas, requisitos, competencias, riesgos…"
          className="pl-9"
          aria-label="Buscar puestos"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Selector
          etiqueta="Agrupamiento"
          valor={f.agrupamiento}
          opciones={listas.agrupamientos}
          onChange={(v) => setF({ ...f, agrupamiento: v })}
        />
        <Selector
          etiqueta="Nivel / Área"
          valor={f.nivelArea}
          opciones={listas.nivelesAreas}
          onChange={(v) => setF({ ...f, nivelArea: v })}
        />
        <Selector
          etiqueta="Riesgo"
          valor={f.riesgo}
          opciones={listas.riesgos}
          onChange={(v) => setF({ ...f, riesgo: v })}
        />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Ficha
          <select
            value={f.verificacion ?? ""}
            onChange={(e) => setF({ ...f, verificacion: e.target.value || null })}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">Todas</option>
            <option value="pending">Pendiente de verificar</option>
            <option value="verified">Verificada</option>
            <option value="needs_review">Necesita revisión</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Estado
          <select
            value={f.estado}
            onChange={(e) =>
              setF({ ...f, estado: e.target.value as EstadoFiltro })
            }
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="vigentes">Vigentes</option>
            <option value="archivados">Archivados</option>
            <option value="todos">Todos</option>
          </select>
        </label>

        {hayFiltro && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setBusqueda("");
              setF(SIN_FILTROS);
            }}
          >
            <X className="h-4 w-4" aria-hidden />
            Limpiar
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtrados.length === totalEstado
          ? `${totalEstado} puestos`
          : `${filtrados.length} de ${totalEstado} puestos`}
      </p>

      {filtrados.length === 0 ? (
        <NoResultsState
          title="Sin coincidencias"
          description="Probá con otro término o quitá los filtros."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                {tabla.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id}>
                    {hg.headers.map((h) => (
                      <TableHead key={h.id}>
                        {h.isPlaceholder
                          ? null
                          : flexRender(h.column.columnDef.header, h.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {tabla.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {tabla.getPageCount() > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Página {tabla.getState().pagination.pageIndex + 1} de{" "}
                {tabla.getPageCount()}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => tabla.previousPage()}
                  disabled={!tabla.getCanPreviousPage()}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => tabla.nextPage()}
                  disabled={!tabla.getCanNextPage()}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
