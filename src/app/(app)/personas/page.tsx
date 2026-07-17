import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AltaPersona } from "@/features/personas/components/alta-persona";
import { listarPersonas } from "@/features/personas/data/personas";
import { listarPuestosParaSelector } from "@/features/puestos/data/puestos";

export const metadata: Metadata = { title: "Personas" };

export default async function PersonasPage() {
  const [personas, puestos] = await Promise.all([
    listarPersonas(),
    listarPuestosParaSelector(),
  ]);
  const sinPuesto = personas.filter((p) => !p.puesto && p.activa).length;

  return (
    <>
      <PageHeader
        title="Personas"
        description="Empleados municipales y el puesto que ocupan."
      />

      {/* Fuera del `action` del PageHeader a propósito: ahí vive en un `shrink-0`
          que no deja achicar el panel, y el desplegable de 210 puestos lo estiraba
          hasta sacarle scroll horizontal a la página entera. */}
      <div className="mb-6">
        <AltaPersona puestos={puestos} />
      </div>

      {personas.length === 0 ? (
        <EmptyState
          title="Sin personas cargadas"
          description="Cargá la primera persona con el botón de arriba. Podés indicar su puesto en el mismo paso."
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground" aria-live="polite">
            {personas.length} persona{personas.length === 1 ? "" : "s"}
            {sinPuesto > 0 && ` · ${sinPuesto} sin puesto asignado`}
          </p>

          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Legajo</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Puesto que ocupa</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personas.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {p.legajo}
                    </TableCell>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.area ?? "—"}
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

          <p className="mt-4 text-sm text-muted-foreground">
            Para cambiar de puesto a alguien que ya está cargado, entrá a la ficha del
            puesto nuevo y asignala ahí: la asignación anterior se cierra sola y queda
            en el historial.
          </p>
        </>
      )}
    </>
  );
}
