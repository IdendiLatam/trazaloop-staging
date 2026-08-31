import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/lib/supabase/server";
import type { LegalDocumentType } from "@/lib/domain/legal";

/**
 * Trazaloop · PE-02B2 · La capa de datos de los documentos legales para la
 * consola.
 *
 * `lib/db/legal.ts` sigue siendo la capa del PRODUCTO: lo que lee el público y
 * lo que registra una aceptación. Esta es la de la ADMINISTRACIÓN: ve
 * borradores y versiones archivadas, y publica.
 *
 * Se separan por lo mismo que se separan en la base: lo que ve el público es
 * `status = 'active'` y nada más, y esa política no cambia. Meter las dos
 * lecturas en el mismo archivo invitaría, algún día, a que una consulta de
 * administración se colara en una página pública.
 *
 * Sin cliente administrativo. Publicar un documento legal tiene que quedar
 * registrado a nombre de una persona: `published_by` sale de `auth.uid()`.
 */

type Db = SupabaseClient;

async function db(client?: Db): Promise<Db> {
  return client ?? ((await createServerClient()) as unknown as Db);
}

export type LegalDocStatus = "draft" | "active" | "archived";

export type LegalDocRow = {
  id: string;
  documentType: LegalDocumentType;
  version: string;
  title: string;
  content: string;
  status: LegalDocStatus;
  publishedAt: string | null;
  retiredAt: string | null;
  changeNote: string | null;
  contentHash: string | null;
  supersedesId: string | null;
  supersededById: string | null;
  createdByName: string | null;
  publishedByName: string | null;
  createdAt: string;
  /** Cuántas personas aceptaron ESTA versión. */
  acceptances: number;
};

export type LegalRead<T> = { status: "ok"; data: T } | { status: "unavailable" };

function mapDoc(r: Record<string, unknown>, acceptances = 0): LegalDocRow {
  const creador = (r.creador ?? null) as { full_name: string | null } | null;
  const publicador = (r.publicador ?? null) as { full_name: string | null } | null;
  return {
    id: String(r.id),
    documentType: r.document_type as LegalDocumentType,
    version: String(r.version),
    title: String(r.title),
    content: String(r.content),
    status: r.status as LegalDocStatus,
    publishedAt: (r.published_at as string | null) ?? null,
    retiredAt: (r.retired_at as string | null) ?? null,
    changeNote: (r.change_note as string | null) ?? null,
    contentHash: (r.content_hash as string | null) ?? null,
    supersedesId: (r.supersedes_id as string | null) ?? null,
    supersededById: (r.superseded_by_id as string | null) ?? null,
    createdByName: creador?.full_name ?? null,
    publishedByName: publicador?.full_name ?? null,
    createdAt: String(r.created_at),
    acceptances,
  };
}

const CAMPOS =
  "id, document_type, version, title, content, status, published_at, retired_at,"
  + " change_note, content_hash, supersedes_id, superseded_by_id, created_at,"
  + " creador:profiles!legal_documents_created_by_fkey(full_name),"
  + " publicador:profiles!legal_documents_published_by_fkey(full_name)";

/**
 * Todas las versiones, de todos los tipos. La consola las agrupa por tipo; la
 * consulta no lo hace por ella, porque agrupar en SQL obligaría a una vista y
 * son ocho filas.
 */
export async function listLegalDocumentsForPlatform(
  client?: Db
): Promise<LegalRead<LegalDocRow[]>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("legal_documents").select(CAMPOS)
    .order("document_type").order("created_at", { ascending: false });
  if (error) return { status: "unavailable" };

  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = filas.map((r) => String(r.id));
  const cuenta = new Map<string, number>();
  if (ids.length > 0) {
    const { data: aceptaciones, error: eA } = await supabase
      .from("user_legal_acceptances").select("legal_document_id").in("legal_document_id", ids);
    // Una lectura fallida de aceptaciones NO puede convertirse en «cero
    // personas aceptaron»: eso es exactamente la clase de cero inventado que
    // este repositorio persigue. Si falla, se dice que no se pudo consultar.
    if (eA) return { status: "unavailable" };
    for (const a of (aceptaciones ?? []) as unknown as Record<string, unknown>[]) {
      const k = String(a.legal_document_id);
      cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
    }
  }

  return { status: "ok", data: filas.map((r) => mapDoc(r, cuenta.get(String(r.id)) ?? 0)) };
}

export async function getLegalDocumentForPlatform(
  id: string, client?: Db
): Promise<LegalRead<LegalDocRow | null>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("legal_documents").select(CAMPOS).eq("id", id).maybeSingle();
  if (error) return { status: "unavailable" };
  if (!data) return { status: "ok", data: null };

  const { count, error: eA } = await supabase
    .from("user_legal_acceptances")
    .select("id", { count: "exact", head: true }).eq("legal_document_id", id);
  if (eA) return { status: "unavailable" };

  return {
    status: "ok",
    data: mapDoc(data as unknown as Record<string, unknown>, count ?? 0),
  };
}

export type LegalWrite = { error: string | null; id?: string };

export async function createLegalDraft(input: {
  documentType: LegalDocumentType; version: string; title: string;
  content: string; changeNote: string | null;
}, client?: Db): Promise<LegalWrite> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("legal_create_draft", {
    p_document_type: input.documentType,
    p_version: input.version,
    p_title: input.title,
    p_content: input.content,
    p_change_note: input.changeNote,
  });
  if (error) return { error: mensajeLegal(error.message) };
  return { error: null, id: String(data) };
}

export async function updateLegalDraft(input: {
  id: string; title: string; content: string; changeNote: string | null;
}, client?: Db): Promise<LegalWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("legal_update_draft", {
    p_id: input.id, p_title: input.title,
    p_content: input.content, p_change_note: input.changeNote,
  });
  return { error: error ? mensajeLegal(error.message) : null };
}

export async function publishLegalDocument(
  id: string, client?: Db
): Promise<LegalWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("legal_publish_document", { p_id: id });
  return { error: error ? mensajeLegal(error.message) : null };
}

export async function discardLegalDraft(
  id: string, client?: Db
): Promise<LegalWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("legal_discard_draft", { p_id: id });
  return { error: error ? mensajeLegal(error.message) : null };
}

/**
 * Los mensajes de las funciones legales están escritos para una persona y
 * explican por qué no se puede hacer algo —«el contenido de una versión legal
 * publicada no se modifica»—. Se transmiten tal cual: resumirlos a «no fue
 * posible» perdería justo lo que hay que entender.
 */
function mensajeLegal(motor?: string): string {
  const m = motor ?? "";
  if (/no se modifica|no se borra|ya está vigente|ya existe una versión|archivada|sucesora|necesita|Solo/i.test(m)) {
    const i = m.search(/[A-ZÁÉÍÓÚ¿]/);
    return (i > 0 ? m.slice(i) : m).trim();
  }
  if (/permission denied|row-level security|administración de plataforma/i.test(m)) {
    return "Tu cuenta no puede administrar los documentos legales.";
  }
  return "No fue posible completar la operación. Vuelve a intentarlo en unos minutos.";
}
