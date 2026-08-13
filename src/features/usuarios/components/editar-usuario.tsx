"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

import { ROLES, ROL_ETIQUETA } from "@/lib/roles";
import { actualizarUsuario } from "../actions";
import type { UsuarioListado } from "../data/usuarios";
import {
  SelectorReparticiones,
  type OpcionReparticion,
} from "./selector-reparticiones";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Edición del alcance de un usuario: rol, reparticiones y si sigue activo.
 *
 * Existe para que corregir una asignación equivocada no obligue a entrar a
 * Supabase a tocar SQL, que era justamente el problema que este panel resuelve.
 */
export function EditarUsuario({
  usuario,
  reparticiones,
}: {
  usuario: UsuarioListado;
  reparticiones: OpcionReparticion[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [rol, setRol] = useState(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);
  const [elegidas, setElegidas] = useState(usuario.reparticiones.map((r) => r.id));

  function guardar() {
    startTransition(async () => {
      const r = await actualizarUsuario(usuario.id, {
        role: rol,
        reparticiones: elegidas,
        is_active: activo,
      });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      // Se guardó, pero puede que no se le haya podido cerrar la sesión abierta.
      if (r.aviso) toast.warning(r.aviso);
      else toast.success("Usuario actualizado.");
      setAbierto(false);
      router.refresh();
    });
  }

  function cancelar() {
    setRol(usuario.rol);
    setActivo(usuario.activo);
    setElegidas(usuario.reparticiones.map((r) => r.id));
    setAbierto(false);
  }

  if (!abierto) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setAbierto(true)}
        aria-label={`Editar ${usuario.email}`}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        Editar
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div className="space-y-1.5">
        <Label htmlFor={`rol-${usuario.id}`}>Rol</Label>
        <select
          id={`rol-${usuario.id}`}
          value={rol}
          onChange={(e) => setRol(e.target.value)}
          className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROL_ETIQUETA[r]}
            </option>
          ))}
        </select>
      </div>

      {rol !== "admin" && (
        <div className="space-y-1.5">
          <Label>Reparticiones a cargo</Label>
          <SelectorReparticiones
            opciones={reparticiones}
            seleccionadas={elegidas}
            onChange={setElegidas}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--primary)]"
        />
        Usuario activo (si se desactiva, deja de tener acceso)
      </label>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={cancelar} disabled={pendiente}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
