import "server-only";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type DocumentoFuente = {
  id: string;
  code: string;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  totalPaginas: number | null;
  /** Fichas transcritas desde este documento. */
  fichas: number;
  paginaDesde: number | null;
  paginaHasta: number | null;
  pendientes: number;
};

/**
 * Documentos fuente del nomenclador con cuántas fichas salieron de cada uno.
 *
 * Los PDF no están en Storage: pesan 287 MB y 149 MB. Lo que se preserva es la
 * referencia (documento + página impresa + página del PDF) por ficha, que es lo
 * que permite volver al original a verificar.
 */
export async function listarDocumentos(): Promise<DocumentoFuente[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();

  const [docs, refs] = await Promise.all([
    supabase
      .from("source_documents")
      .select("id, code, title, description, kind, total_pages")
      .order("code"),
    supabase
      .from("source_references")
      .select("source_document_id, printed_page_number, verification_status"),
  ]);

  if (docs.error) {
    console.error("[documentos] listarDocumentos:", docs.error.message);
    throw new Error(docs.error.message);
  }

  const porDoc = new Map<
    string,
    { paginas: number[]; total: number; pendientes: number }
  >();
  for (const r of (refs.data ?? []) as {
    source_document_id: string;
    printed_page_number: number | null;
    verification_status: string;
  }[]) {
    const acc = porDoc.get(r.source_document_id) ?? {
      paginas: [],
      total: 0,
      pendientes: 0,
    };
    acc.total += 1;
    if (r.printed_page_number != null) acc.paginas.push(r.printed_page_number);
    if (r.verification_status === "pending") acc.pendientes += 1;
    porDoc.set(r.source_document_id, acc);
  }

  return (
    (docs.data ?? []) as {
      id: string;
      code: string;
      title: string;
      description: string | null;
      kind: string;
      total_pages: number | null;
    }[]
  ).map((d) => {
    const acc = porDoc.get(d.id);
    return {
      id: d.id,
      code: d.code,
      titulo: d.title,
      descripcion: d.description,
      tipo: d.kind,
      totalPaginas: d.total_pages,
      fichas: acc?.total ?? 0,
      paginaDesde: acc?.paginas.length ? Math.min(...acc.paginas) : null,
      paginaHasta: acc?.paginas.length ? Math.max(...acc.paginas) : null,
      pendientes: acc?.pendientes ?? 0,
    };
  });
}
