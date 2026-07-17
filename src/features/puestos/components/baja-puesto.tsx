"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, RotateCcw } from "lucide-react";

import { archivarPuesto, restaurarPuesto } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Dar de baja un puesto, o restaurarlo.
 *
 * Las Server Actions y las funciones de Postgres existían desde la Etapa 5, pero
 * ningún componente las llamaba: no había forma de archivar un puesto desde la
 * app. Esto es esa interfaz.
 *
 * Archivar no borra —el trigger `prevent_delete` impide el borrado físico a
 * propósito—: el puesto sigue consultable y se puede restaurar. Por eso el botón
 * dice "Archivar" y no "Eliminar", y el aviso explica qué pasa de verdad.
 */
export function BajaPuesto({
  positionId,
  estado,
}: {
  positionId: string;
  estado: string;
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const archivado = estado === "archived";

  function archivar() {
    startTransition(async () => {
      const r = await archivarPuesto(positionId, { motivo });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("El puesto se archivó. Sigue en el nomenclador como histórico.");
      setConfirmando(false);
      setMotivo("");
      router.refresh();
    });
  }

  function restaurar() {
    startTransition(async () => {
      const r = await restaurarPuesto(positionId);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("El puesto volvió a estar vigente.");
      router.refresh();
    });
  }

  if (archivado) {
    return (
      <Button variant="outline" onClick={restaurar} disabled={pendiente}>
        <RotateCcw className="h-4 w-4" aria-hidden />
        {pendiente ? "Restaurando…" : "Restaurar"}
      </Button>
    );
  }

  // El panel va en un `absolute` sobre un contenedor `relative`: dentro del
  // encabezado, en el flujo normal, empujaba el título y lo partía en varias
  // líneas.
  return (
    <div className="relative">
      <Button variant="outline" onClick={() => setConfirmando(!confirmando)}>
        <Archive className="h-4 w-4" aria-hidden />
        Archivar
      </Button>

      {confirmando && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-2rem))] space-y-3 rounded-xl border border-border bg-card p-4 text-left shadow-lg">
          <div>
            <p className="text-sm font-medium">Archivar este puesto</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No se borra: queda como histórico, se puede consultar y restaurar. El
              motivo queda asentado en la bitácora.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="motivo-baja">Por qué se da de baja *</Label>
            <Textarea
              id="motivo-baja"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: el puesto se suprime por Decreto 456/26."
            />
            {/* El mínimo lo valida `archivarSchema` en el servidor; se adelanta acá
                para no mandar una acción que ya se sabe que va a fallar. */}
            {motivo.trim().length > 0 && motivo.trim().length < 10 && (
              <p className="text-xs text-destructive">
                Explicá el motivo (mínimo 10 caracteres).
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmando(false);
                setMotivo("");
              }}
              disabled={pendiente}
            >
              Cancelar
            </Button>
            <Button
              onClick={archivar}
              disabled={pendiente || motivo.trim().length < 10}
            >
              <Archive className="h-4 w-4" aria-hidden />
              {pendiente ? "Archivando…" : "Archivar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
