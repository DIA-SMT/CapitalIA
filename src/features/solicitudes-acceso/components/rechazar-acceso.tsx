"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";

import { rechazarSolicitudAcceso } from "../actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Rechazo de una solicitud de acceso. El motivo queda registrado (no se le manda
 * al solicitante: no hay envío de mails), pero sirve de rastro de por qué se negó.
 */
export function RechazarAcceso({ solicitudId }: { solicitudId: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, startTransition] = useTransition();

  function rechazar() {
    startTransition(async () => {
      const r = await rechazarSolicitudAcceso(solicitudId, { motivo });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Solicitud rechazada.");
      setMotivo("");
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <X className="h-4 w-4" aria-hidden />
        Rechazar
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
      <Label htmlFor={`motivo-acceso-${solicitudId}`}>Motivo del rechazo *</Label>
      <Textarea
        id={`motivo-acceso-${solicitudId}`}
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Por qué no se aprueba el acceso. Queda registrado."
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setAbierto(false);
            setMotivo("");
          }}
          disabled={pendiente}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={rechazar}
          disabled={pendiente || motivo.trim().length < 5}
        >
          {pendiente ? "Rechazando…" : "Confirmar rechazo"}
        </Button>
      </div>
    </div>
  );
}
