import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";

export const metadata: Metadata = { title: "Documentos" };

export default function DocumentosPage() {
  return (
    <>
      <PageHeader
        title="Documentos"
        description="Fuentes documentales del nomenclador (PDF escaneados de las fichas históricas)."
      />
      <EmptyState
        title="Sin documentos cargados"
        description="Aquí se gestionarán los PDF fuente y su vínculo con cada ficha, preservando la trazabilidad de origen."
      />
    </>
  );
}
