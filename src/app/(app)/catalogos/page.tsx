import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states";

export const metadata: Metadata = { title: "Catálogos" };

export default function CatalogosPage() {
  return (
    <>
      <PageHeader
        title="Catálogos"
        description="Listas de referencia del nomenclador (dependencias, niveles, agrupamientos)."
      />
      <EmptyState
        title="Sin catálogos definidos"
        description="Los catálogos de referencia se configurarán junto con el esquema del nomenclador."
      />
    </>
  );
}
