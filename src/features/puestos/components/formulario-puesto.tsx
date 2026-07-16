"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertCircle, Save } from "lucide-react";

import type { OpcionesFormulario } from "../data/opciones";
import { puestoSchema, type PuestoFormValues } from "../schemas/puesto";
import { crearPuesto, crearVersion } from "../actions";
import { SelectorCatalogo } from "./selector-catalogo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  opciones: OpcionesFormulario;
  /** Si viene, se edita ese puesto creando una versión nueva. Si no, es un alta. */
  positionId?: string;
  valoresIniciales: PuestoFormValues;
  /** Código interno, solo informativo al editar (no se puede cambiar). */
  internalCode?: string;
};

function Seccion({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
        {descripcion && <CardDescription>{descripcion}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Error({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

export function FormularioPuesto({
  opciones,
  positionId,
  valoresIniciales,
  internalCode,
}: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const esEdicion = Boolean(positionId);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<PuestoFormValues>({
    resolver: zodResolver(puestoSchema),
    defaultValues: valoresIniciales,
  });

  const grouping = watch("grouping_id");
  // El agrupamiento Técnico usa Área; el resto, Nivel. Se decide por los datos:
  // si el agrupamiento elegido no tiene niveles cargados, va por área.
  const nivelesDelGrupo = opciones.niveles.filter((n) => n.groupingId === grouping);
  const usaArea = Boolean(grouping) && nivelesDelGrupo.length === 0;

  function onSubmit(values: PuestoFormValues) {
    setErrorGeneral(null);
    startTransition(async () => {
      const r = esEdicion
        ? await crearVersion(positionId!, values)
        : await crearPuesto(values);

      if ("error" in r) {
        setErrorGeneral(r.error);
        return;
      }
      toast.success(
        esEdicion ? "Se creó una versión nueva del puesto." : "Puesto creado.",
      );
      if (esEdicion) router.push(`/puestos/${positionId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 pb-24">
      {esEdicion && (
        <Alert>
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertDescription>
            Al guardar se crea una <strong>versión nueva</strong>. La actual pasa a
            histórica y se conserva: nada se pierde.
          </AlertDescription>
        </Alert>
      )}

      <Seccion
        titulo="Identificación"
        descripcion={
          internalCode
            ? `Código interno ${internalCode} — no cambia aunque cambie el nombre.`
            : "El código interno lo genera el sistema al guardar."
        }
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nombre del puesto *</Label>
            <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
            <Error msg={errors.name?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="variant">Variante</Label>
            <Input
              id="variant"
              placeholder="A, B, C…"
              className="sm:w-24"
              {...register("variant")}
            />
            <Error msg={errors.variant?.message} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Clasificación">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="grouping_id">Agrupamiento *</Label>
            <select
              id="grouping_id"
              className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              {...register("grouping_id", {
                onChange: () => {
                  // Al cambiar de agrupamiento, nivel y área dejan de ser válidos.
                  setValue("level_id", undefined);
                  setValue("technical_area_id", undefined);
                },
              })}
            >
              <option value="">Elegir…</option>
              {opciones.agrupamientos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
            <Error msg={errors.grouping_id?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nivel_area">{usaArea ? "Área técnica *" : "Nivel *"}</Label>
            {usaArea ? (
              <select
                id="nivel_area"
                className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                {...register("technical_area_id")}
              >
                <option value="">Elegir…</option>
                {opciones.areas.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nombre}
                  </option>
                ))}
              </select>
            ) : (
              <select
                id="nivel_area"
                className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={!grouping}
                {...register("level_id")}
              >
                <option value="">{grouping ? "Elegir…" : "Elegí el agrupamiento primero"}</option>
                {nivelesDelGrupo.map((o) => (
                  <option key={o.id} value={o.id}>
                    Nivel {o.nombre}
                  </option>
                ))}
              </select>
            )}
            <Error msg={errors.level_id?.message ?? errors.technical_area_id?.message} />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="Análisis del puesto">
        <div className="space-y-1.5">
          <Label htmlFor="general_description">Descripción general</Label>
          <Textarea id="general_description" rows={4} {...register("general_description")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="specific_description">Descripción específica</Label>
          <Textarea id="specific_description" rows={6} {...register("specific_description")} />
        </div>
      </Seccion>

      <Seccion titulo="Requisitos intelectuales">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="minimum_education">Instrucción</Label>
            <Input id="minimum_education" {...register("minimum_education")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="required_title">Título</Label>
            <Input id="required_title" {...register("required_title")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="minimum_experience">Antigüedad y experiencia</Label>
            <Input id="minimum_experience" {...register("minimum_experience")} />
          </div>
        </div>
        <Controller
          control={control}
          name="conocimientos"
          render={({ field }) => (
            <SelectorCatalogo
              etiqueta="Otros conocimientos"
              opciones={opciones.conocimientos}
              valor={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
      </Seccion>

      <Seccion titulo="Competencias requeridas">
        <Controller
          control={control}
          name="competencias"
          render={({ field }) => (
            <SelectorCatalogo
              etiqueta="Competencias"
              opciones={opciones.competencias}
              valor={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
      </Seccion>

      <Seccion titulo="Condiciones y riesgos">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="physical_requirement">Requisito físico</Label>
            <Textarea id="physical_requirement" rows={3} {...register("physical_requirement")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="working_conditions">Condiciones de trabajo</Label>
            <Textarea id="working_conditions" rows={3} {...register("working_conditions")} />
          </div>
        </div>

        <Controller
          control={control}
          name="riesgos"
          render={({ field }) => (
            <SelectorCatalogo
              etiqueta="Riesgos de trabajo"
              opciones={opciones.riesgos}
              valor={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />

        <div className="space-y-1.5">
          <Label htmlFor="risk_level_id">Nivel de riesgo</Label>
          <select
            id="risk_level_id"
            className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-xs"
            {...register("risk_level_id")}
          >
            <option value="">Sin especificar</option>
            {opciones.nivelesRiesgo.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </div>
      </Seccion>

      <Seccion titulo="Responsabilidad sobre">
        <Controller
          control={control}
          name="responsabilidades"
          render={({ field }) => (
            <SelectorCatalogo
              etiqueta="Responsabilidades"
              opciones={opciones.responsabilidades}
              valor={field.value ?? []}
              onChange={field.onChange}
            />
          )}
        />
      </Seccion>

      <Seccion
        titulo="Motivo del cambio"
        descripcion="Queda asentado en el historial junto con quién y cuándo. Es obligatorio."
      >
        <div className="space-y-1.5">
          <Label htmlFor="change_reason">
            {esEdicion ? "Por qué se modifica este puesto *" : "Por qué se crea este puesto *"}
          </Label>
          <Textarea
            id="change_reason"
            rows={3}
            placeholder="Ej: se actualizan las competencias por Resolución 123/26."
            aria-invalid={!!errors.change_reason}
            {...register("change_reason")}
          />
          <Error msg={errors.change_reason?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="change_document_reference">Decreto / resolución que lo respalda</Label>
          <Input
            id="change_document_reference"
            placeholder="Opcional"
            {...register("change_document_reference")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="additional_notes">Observaciones</Label>
          <Textarea id="additional_notes" rows={2} {...register("additional_notes")} />
        </div>
      </Seccion>

      {errorGeneral && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <AlertDescription>{errorGeneral}</AlertDescription>
        </Alert>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 p-4 backdrop-blur md:pl-64">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (isDirty && !confirm("Hay cambios sin guardar. ¿Salir igual?")) return;
              router.back();
            }}
            disabled={pendiente}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pendiente}>
            <Save className="h-4 w-4" aria-hidden />
            {pendiente
              ? "Guardando…"
              : esEdicion
                ? "Guardar como versión nueva"
                : "Crear puesto"}
          </Button>
        </div>
      </div>
    </form>
  );
}
