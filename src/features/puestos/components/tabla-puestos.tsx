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

export function TablaPuestos({ puestos }: { puestos: PuestoListado[] }) {
  const [orden, setOrden] = useState<SortingState>([]);
  const [busqueda, setBusqueda] = useState("");
  const [agrupamiento, setAgrupamiento] = useState<string | null>(null);

  const agrupamientos = useMemo(
    () => [...new Set(puestos.map((p) => p.agrupamiento))].sort(),
    [puestos],
  );

  // Filtro propio en vez del de TanStack: hay que buscar sin tildes sobre varias
  // columnas a la vez, y cruzarlo con el filtro de agrupamiento.
  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return puestos.filter((p) => {
      if (agrupamiento && p.agrupamiento !== agrupamiento) return false;
      if (!q) return true;
      return normalizar(
        `${p.nombre} ${p.internalCode} ${p.agrupamiento} ${p.area ?? ""} ${p.variante ?? ""}`,
      ).includes(q);
    });
  }, [puestos, busqueda, agrupamiento]);

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

  const hayFiltro = busqueda !== "" || agrupamiento !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código o área…"
            className="pl-9"
            aria-label="Buscar puestos"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {agrupamientos.map((a) => (
            <Button
              key={a}
              size="sm"
              variant={agrupamiento === a ? "default" : "outline"}
              onClick={() => setAgrupamiento(agrupamiento === a ? null : a)}
            >
              {a}
            </Button>
          ))}
          {hayFiltro && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setBusqueda("");
                setAgrupamiento(null);
              }}
            >
              <X className="h-4 w-4" aria-hidden />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {filtrados.length === puestos.length
          ? `${puestos.length} puestos`
          : `${filtrados.length} de ${puestos.length} puestos`}
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
