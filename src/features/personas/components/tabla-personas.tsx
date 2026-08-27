"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Briefcase, Pencil, Search, X } from "lucide-react";

import type { FiltrosPersonas, ListadoPersonas } from "../data/personas";
import type { ReparticionPlana } from "@/features/reparticiones/data/reparticiones";
import type { PuestoOpcion } from "@/features/puestos/data/puestos";
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
import { AsignarPuesto } from "./asignar-puesto";
import { EditarPersona } from "./editar-persona";

/** Espera antes de ir al servidor, para no consultar en cada tecla. */
const ESPERA_TIPEO = 300;

/**
 * Listado de personas con búsqueda y filtros **resueltos en la base**.
 *
 * Antes filtraba en el navegador sobre la lista completa. Con 4.771 personas eso
 * no funciona: PostgREST corta en 1.000 filas sin avisar, así que buscar a
 * alguien del final del abecedario contestaba "Sin coincidencias" aunque
 * estuviera cargado. Ahora el filtro viaja en la URL, la base responde y el total
 * sale de un `count`, no de las filas que llegaron.
 *
 * Que los filtros vivan en la URL también los hace compartibles y les permite
 * sobrevivir a un refresh.
 */
export function TablaPersonas({
  listado,
  reparticiones,
  puestos,
  filtros,
  sinPuesto,
  esAdmin = false,
  puedeAsignar = false,
}: {
  listado: ListadoPersonas;
  reparticiones: ReparticionPlana[];
  /** Los puestos vigentes, para asignar sin salir del listado. */
  puestos: PuestoOpcion[];
  filtros: FiltrosPersonas;
  sinPuesto: number;
  /**
   * Corregir o dar de baja es de Capital Humano (decisión #10 del plan), así que
   * el lápiz solo aparece para admin. La RLS lo exige igual.
   */
  esAdmin?: boolean;
  /**
   * Asignar alcanza a más gente que corregir: desde la 0018 también asignan el
   * director y el secretario, cada uno sobre su personal. Quién puede sobre quién
   * lo corta la base (asignar_persona); acá solo se oculta el botón para el
   * usuario sin rol.
   */
  puedeAsignar?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  // El input se maneja solo mientras se tipea; la URL se actualiza después.
  const [texto, setTexto] = useState(filtros.q ?? "");

  /**
   * Qué fila tiene panel abierto y cuál de los dos. Ocupan una fila entera, así
   * que la apertura la maneja la tabla y no cada botón; y con un solo estado para
   * los dos, abrir uno cierra el otro y nunca quedan dos paneles desplegados bajo
   * la misma persona.
   */
  const [panel, setPanel] = useState<{
    id: string;
    modo: "corregir" | "asignar";
  } | null>(null);

  /** Abre el panel pedido, o lo cierra si ese mismo ya estaba abierto. */
  function alternar(id: string, modo: "corregir" | "asignar") {
    setPanel((p) => (p?.id === id && p.modo === modo ? null : { id, modo }));
  }

  /**
   * La query que pedimos por última vez. `useSearchParams()` no sirve de base:
   * mientras la navegación está en vuelo sigue devolviendo la anterior, así que
   * dos cambios seguidos —Limpiar y el eco de la espera de tipeo— se armarían
   * sobre filtros que el usuario ya sacó, y los reviven.
   */
  const pedido = useRef(params.toString());

  const urlActual = params.toString();

  /**
   * Si la URL cambió por afuera del input —Atrás/Adelante, "Personas" en el menú,
   * un link pegado— manda la URL. Sin esto el input sigue mostrando el término
   * viejo y la espera de tipeo lo vuelve a empujar 300 ms después: el Atrás se
   * deshace solo y encima agrega otra entrada al historial.
   *
   * Va en un efecto y no durante el render porque tocar un ref mientras se
   * renderiza no está permitido. Declarado ANTES que la espera de tipeo para que
   * corra primero y esa no llegue a navegar con el término viejo.
   */
  useEffect(() => {
    if (urlActual === pedido.current) return;
    pedido.current = urlActual;
    setTexto(filtros.q ?? "");
  }, [urlActual, filtros.q]);

  /** Arma la URL cambiando solo lo que se pide y volviendo a la página 1. */
  function navegar(cambios: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(pedido.current);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) siguiente.set(clave, valor);
      else siguiente.delete(clave);
    }
    // Cambiar un filtro y quedarse en la página 7 muestra una lista vacía que
    // parece "no hay nada" en vez de "estás en una página que ya no existe".
    if (!("pagina" in cambios)) siguiente.delete("pagina");
    const qs = siguiente.toString();
    // Antes de navegar, no después: el cambio que venga tiene que componer sobre
    // esto y no sobre la URL que todavía devuelve useSearchParams().
    pedido.current = qs;
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  // Búsqueda con espera: sin esto habría una consulta por tecla. Se compara
  // contra lo pedido, no contra `filtros.q`, que llega un render tarde.
  useEffect(() => {
    const id = setTimeout(() => {
      const enUrl = new URLSearchParams(pedido.current).get("q") ?? "";
      if (texto.trim() !== enUrl) navegar({ q: texto.trim() || undefined });
    }, ESPERA_TIPEO);
    return () => clearTimeout(id);
    // `navegar` solo lee refs y valores estables; incluirlo reiniciaría la espera
    // en cada render y la búsqueda no saldría nunca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const hayFiltro = Boolean(filtros.q || filtros.rep || filtros.estado);

  /**
   * Cinco columnas de datos más la de acciones, si hay alguna. Se calcula porque
   * es el colSpan de la fila del panel: con el 6 fijo que había, la fila se pasaba
   * de largo en cuanto la tabla no tenía las seis columnas.
   */
  const hayAcciones = esAdmin || puedeAsignar;
  const columnas = 5 + (hayAcciones ? 1 : 0);

  function limpiar() {
    setTexto("");
    navegar({ q: undefined, rep: undefined, estado: undefined });
  }

  /** URL de otra página conservando los filtros puestos. */
  function hrefPagina(n: number) {
    const siguiente = new URLSearchParams(params.toString());
    if (n <= 1) siguiente.delete("pagina");
    else siguiente.set("pagina", String(n));
    const qs = siguiente.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          // Ya no busca por repartición ni por puesto: esos viven en otras tablas
          // y no entran en la columna de búsqueda. La repartición es un filtro
          // aparte, que además es exacto.
          placeholder="Buscar por nombre, legajo o email…"
          className="pl-9"
          aria-label="Buscar personas"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Repartición
          <select
            value={filtros.rep ?? ""}
            onChange={(e) => navegar({ rep: e.target.value || undefined })}
            className="h-8 max-w-[16rem] rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">Todas</option>
            {reparticiones.map((r) => (
              <option key={r.id} value={r.id}>
                {`${"— ".repeat(r.nivel)}${r.nombre}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Estado
          <select
            value={filtros.estado ?? ""}
            onChange={(e) => navegar({ estado: e.target.value || undefined })}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            <option value="">Todos</option>
            <option value="activa">Activa</option>
            <option value="baja">Baja</option>
          </select>
        </label>

        {hayFiltro && (
          <Button size="sm" variant="ghost" onClick={limpiar}>
            <X className="h-4 w-4" aria-hidden />
            Limpiar
          </Button>
        )}
      </div>

      <p
        className={`text-sm text-muted-foreground ${pendiente ? "opacity-50" : ""}`}
        aria-live="polite"
        aria-busy={pendiente}
      >
        {listado.total.toLocaleString("es-AR")}{" "}
        {listado.total === 1 ? "persona" : "personas"}
        {hayFiltro && (listado.total === 1 ? " que coincide" : " que coinciden")}
        {listado.paginas > 1 && ` · página ${listado.pagina} de ${listado.paginas}`}
        {sinPuesto > 0 && ` · ${sinPuesto.toLocaleString("es-AR")} sin puesto asignado`}
      </p>

      {listado.personas.length === 0 ? (
        <NoResultsState
          title="Sin coincidencias"
          description="Probá con otro término o quitá los filtros."
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Legajo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Repartición</TableHead>
                  <TableHead>Puesto que ocupa</TableHead>
                  <TableHead>Estado</TableHead>
                  {hayAcciones && (
                    <TableHead className="w-10 sr-only">Acciones</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {listado.personas.flatMap((p) => [
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
                      ) : puedeAsignar && p.activa ? (
                        /* El botón va en esta celda y no entre las acciones a
                           propósito: es la celda que dice que falta el puesto, y es
                           donde se lo busca. Mientras la única vía fue la ficha del
                           puesto, el testeo con usuarios leyó la ausencia como
                           funcionalidad no hecha. */
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => alternar(p.id, "asignar")}
                          aria-expanded={panel?.id === p.id && panel.modo === "asignar"}
                        >
                          <Briefcase className="h-3.5 w-3.5" aria-hidden />
                          Asignar puesto
                        </Button>
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
                    {hayAcciones && (
                      <TableCell className="whitespace-nowrap text-right">
                        {/* Cambiar de puesto: para quien ya tiene uno, el botón de
                            la otra celda no aparece. */}
                        {puedeAsignar && p.activa && p.puesto && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => alternar(p.id, "asignar")}
                            aria-label={`Cambiar el puesto de ${p.nombre}`}
                            aria-expanded={
                              panel?.id === p.id && panel.modo === "asignar"
                            }
                          >
                            <Briefcase className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                        {esAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => alternar(p.id, "corregir")}
                            aria-label={`Corregir ${p.nombre}`}
                            aria-expanded={
                              panel?.id === p.id && panel.modo === "corregir"
                            }
                          >
                            <Pencil className="h-4 w-4" aria-hidden />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>,
                  // El panel va en su propia fila: no entra en una celda.
                  panel?.id === p.id ? (
                    <TableRow key={`${p.id}-panel`}>
                      <TableCell colSpan={columnas} className="bg-secondary/20">
                        {panel.modo === "corregir" ? (
                          <EditarPersona
                            persona={p}
                            reparticiones={reparticiones}
                            onCerrar={() => setPanel(null)}
                          />
                        ) : (
                          <AsignarPuesto
                            persona={p}
                            puestos={puestos}
                            onCerrar={() => setPanel(null)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ) : null,
                ])}
              </TableBody>
            </Table>
          </div>

          {listado.paginas > 1 && (
            <nav
              className="flex items-center justify-between border-t border-border pt-4"
              aria-label="Paginación"
            >
              {listado.pagina > 1 ? (
                <Link
                  href={hrefPagina(listado.pagina - 1)}
                  className="text-sm underline-offset-4 hover:underline"
                >
                  ← Anteriores
                </Link>
              ) : (
                <span />
              )}
              {listado.pagina < listado.paginas ? (
                <Link
                  href={hrefPagina(listado.pagina + 1)}
                  className="text-sm underline-offset-4 hover:underline"
                >
                  Siguientes →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
