import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-02B4 · La capa de la ayuda contextual para la consola.
 *
 * Mismo patrón que `lib/db/faq-platform.ts`, y por las mismas razones: se lee y
 * se escribe con la sesión de quien administra —la base tiene que saber quién
 * publicó—, las revisiones solo nacen por su función, y una actualización que
 * la RLS no autoriza se detecta pidiendo de vuelta la fila.
 */

type Db = SupabaseClient;

async function db(client?: Db): Promise<Db> {
  return client ?? ((await createServerClient()) as unknown as Db);
}

export type HelpRead<T> = { status: "ok"; data: T } | { status: "unavailable" };
export type HelpWrite = { error: string | null; id?: string };

export type HelpItemSummary = {
  id: string;
  moduleKey: string;
  pageKey: string;
  targetKind: string;
  targetKey: string;
  status: "draft" | "published" | "unpublished";
  /** El título vigente, o el del borrador si nunca se publicó. */
  title: string;
  hasPendingDraft: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export type HelpDraft = {
  helpItemId: string;
  language: string;
  title: string;
  explanation: string;
  example: string | null;
  technicalReference: string | null;
  doNotInvent: string | null;
  normativeClass: string;
  changeNote: string | null;
  updatedAt: string;
};

export type HelpRevision = {
  id: string;
  revisionNumber: number;
  language: string;
  title: string;
  explanation: string;
  example: string | null;
  technicalReference: string | null;
  doNotInvent: string | null;
  normativeClass: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeNote: string | null;
  createdByName: string | null;
};

export type HelpItemDetail = {
  item: HelpItemSummary;
  draft: HelpDraft | null;
  current: HelpRevision | null;
  history: HelpRevision[];
};

export type HelpListFilters = {
  search?: string | null;
  moduleKey?: string | null;
  pageKey?: string | null;
  status?: string | null;
};

function mapRevision(r: Record<string, unknown>): HelpRevision {
  const autor = (r.autor ?? null) as { full_name: string | null } | null;
  return {
    id: String(r.id),
    revisionNumber: Number(r.revision_number),
    language: String(r.language),
    title: String(r.title),
    explanation: String(r.explanation),
    example: (r.example as string | null) ?? null,
    technicalReference: (r.technical_reference as string | null) ?? null,
    doNotInvent: (r.do_not_invent as string | null) ?? null,
    normativeClass: String(r.normative_class),
    effectiveFrom: String(r.effective_from),
    effectiveTo: (r.effective_to as string | null) ?? null,
    changeNote: (r.change_note as string | null) ?? null,
    createdByName: autor?.full_name ?? null,
  };
}

/**
 * La lista de la consola.
 *
 * El filtrado va en el servidor; la búsqueda mira la clave de pantalla, el
 * objetivo y el título vigente. Es el mismo criterio que la FAQ: traerlo todo al
 * navegador funciona con once ayudas y deja de funcionar con doscientas.
 */
export async function listHelpItems(
  filters: HelpListFilters = {}, client?: Db
): Promise<HelpRead<HelpItemSummary[]>> {
  const supabase = await db(client);
  let q = supabase.from("help_items")
    .select("id, module_key, page_key, target_kind, target_key, status, updated_at");

  if (filters.moduleKey) q = q.eq("module_key", filters.moduleKey);
  if (filters.pageKey) q = q.eq("page_key", filters.pageKey);
  if (filters.status) q = q.eq("status", filters.status);
  const texto = (filters.search ?? "").trim().toLowerCase();
  if (texto.length > 0) {
    q = q.or(`page_key.ilike.%${texto}%,target_key.ilike.%${texto}%`);
  }

  const { data, error } = await q.order("page_key").order("target_key");
  if (error) return { status: "unavailable" };

  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = filas.map((r) => String(r.id));
  if (ids.length === 0) return { status: "ok", data: [] };

  const [{ data: vigentes, error: eV }, { data: borradores, error: eB }] = await Promise.all([
    supabase.from("help_item_revisions")
      .select("help_item_id, title, effective_from, content_hash")
      .in("help_item_id", ids).is("effective_to", null),
    supabase.from("help_item_drafts")
      .select("help_item_id, title, explanation, example, technical_reference")
      .in("help_item_id", ids),
  ]);
  if (eV || eB) return { status: "unavailable" };

  const porVigente = new Map<string, Record<string, unknown>>();
  for (const r of (vigentes ?? []) as unknown as Record<string, unknown>[]) {
    porVigente.set(String(r.help_item_id), r);
  }
  const porBorrador = new Map<string, Record<string, unknown>>();
  for (const r of (borradores ?? []) as unknown as Record<string, unknown>[]) {
    porBorrador.set(String(r.help_item_id), r);
  }

  return {
    status: "ok",
    data: filas.map((r) => {
      const id = String(r.id);
      const vigente = porVigente.get(id);
      const borrador = porBorrador.get(id);
      return {
        id,
        moduleKey: String(r.module_key),
        pageKey: String(r.page_key),
        targetKind: String(r.target_kind),
        targetKey: String(r.target_key),
        status: r.status as "draft" | "published" | "unpublished",
        title: String(vigente?.title ?? borrador?.title ?? "(sin redactar)"),
        hasPendingDraft: Boolean(borrador)
          && (!vigente || huella(borrador!) !== String(vigente.content_hash)),
        publishedAt: (vigente?.effective_from as string | null) ?? null,
        updatedAt: String(r.updated_at),
      } satisfies HelpItemSummary;
    }),
  };
}

/** La misma huella que calcula `help_publish_item_internal`. */
function huella(b: Record<string, unknown>): string {
  const texto = `${String(b.title ?? "")}\n${String(b.explanation ?? "")}\n`
    + `${(b.example as string | null) ?? ""}\n`
    + `${(b.technical_reference as string | null) ?? ""}`;
  return sha256Hex(texto);
}

function sha256Hex(texto: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

export async function getHelpItemDetail(
  itemId: string, language = "es", client?: Db
): Promise<HelpRead<HelpItemDetail | null>> {
  const supabase = await db(client);
  const { data: item, error } = await supabase.from("help_items")
    .select("id, module_key, page_key, target_kind, target_key, status, updated_at")
    .eq("id", itemId).maybeSingle();
  if (error) return { status: "unavailable" };
  if (!item) return { status: "ok", data: null };

  const [{ data: borrador, error: eB }, { data: revisiones, error: eR }] = await Promise.all([
    supabase.from("help_item_drafts").select("*")
      .eq("help_item_id", itemId).eq("language", language).maybeSingle(),
    supabase.from("help_item_revisions")
      .select("*, autor:profiles!help_item_revisions_created_by_fkey(full_name)")
      .eq("help_item_id", itemId).eq("language", language)
      .order("revision_number", { ascending: false }),
  ]);
  if (eB || eR) return { status: "unavailable" };

  const todas = ((revisiones ?? []) as unknown as Record<string, unknown>[]).map(mapRevision);
  const vigente = todas.find((r) => r.effectiveTo === null) ?? null;
  const r = item as unknown as Record<string, unknown>;
  const b = borrador as unknown as Record<string, unknown> | null;

  return {
    status: "ok",
    data: {
      item: {
        id: String(r.id),
        moduleKey: String(r.module_key),
        pageKey: String(r.page_key),
        targetKind: String(r.target_kind),
        targetKey: String(r.target_key),
        status: r.status as "draft" | "published" | "unpublished",
        title: vigente?.title ?? String(b?.title ?? "(sin redactar)"),
        hasPendingDraft: Boolean(b) && (!vigente || huella(b!) !== sha256Hex(
          `${vigente.title}\n${vigente.explanation}\n${vigente.example ?? ""}\n`
          + `${vigente.technicalReference ?? ""}`)),
        publishedAt: vigente?.effectiveFrom ?? null,
        updatedAt: String(r.updated_at),
      },
      draft: b ? {
        helpItemId: String(b.help_item_id),
        language: String(b.language),
        title: String(b.title),
        explanation: String(b.explanation),
        example: (b.example as string | null) ?? null,
        technicalReference: (b.technical_reference as string | null) ?? null,
        doNotInvent: (b.do_not_invent as string | null) ?? null,
        normativeClass: String(b.normative_class),
        changeNote: (b.change_note as string | null) ?? null,
        updatedAt: String(b.updated_at),
      } : null,
      current: vigente,
      history: todas.filter((x) => x.effectiveTo !== null),
    },
  };
}

// ---------------------------------------------------------------------------
// Escrituras
// ---------------------------------------------------------------------------

export async function createHelpItem(input: {
  moduleKey: string; pageKey: string; targetKind: string; targetKey: string;
  title: string; explanation: string;
}, client?: Db): Promise<HelpWrite> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("help_items").insert({
    module_key: input.moduleKey, page_key: input.pageKey,
    target_kind: input.targetKind, target_key: input.targetKey,
  }).select("id").single();
  if (error || !data) return { error: mensaje(error?.message) };

  const id = String((data as { id: string }).id);
  const { error: eB } = await supabase.from("help_item_drafts").insert({
    help_item_id: id, language: "es",
    title: input.title, explanation: input.explanation,
  });
  if (eB) return { error: mensaje(eB.message), id };
  return { error: null, id };
}

export async function saveHelpDraft(input: {
  helpItemId: string; language?: string;
  title: string; explanation: string; example: string | null;
  technicalReference: string | null; doNotInvent: string | null;
  normativeClass: string; changeNote: string | null;
}, client?: Db): Promise<HelpWrite> {
  const supabase = await db(client);
  const { error } = await supabase.from("help_item_drafts").upsert({
    help_item_id: input.helpItemId, language: input.language ?? "es",
    title: input.title, explanation: input.explanation,
    example: input.example, technical_reference: input.technicalReference,
    do_not_invent: input.doNotInvent, normative_class: input.normativeClass,
    change_note: input.changeNote,
  }, { onConflict: "help_item_id,language" });
  return { error: error ? mensaje(error.message) : null };
}

export async function publishHelpItem(
  itemId: string, changeNote: string | null, language = "es", client?: Db
): Promise<HelpWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("help_publish_item", {
    p_item_id: itemId, p_language: language, p_change_note: changeNote,
  });
  return { error: error ? mensajeDePublicacion(error.message) : null };
}

export async function unpublishHelpItem(
  itemId: string, language = "es", client?: Db
): Promise<HelpWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("help_unpublish_item", {
    p_item_id: itemId, p_language: language,
  });
  return { error: error ? mensajeDePublicacion(error.message) : null };
}

export async function restoreHelpRevision(
  revisionId: string, client?: Db
): Promise<HelpWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("help_restore_revision_to_draft", {
    p_revision_id: revisionId,
  });
  return { error: error ? mensajeDePublicacion(error.message) : null };
}

function mensaje(motor?: string): string {
  const m = (motor ?? "").toLowerCase();
  if (m.includes("help_items_identity_uniq") || m.includes("duplicate key")) {
    return "Ya hay una ayuda para ese elemento de esa pantalla. Edítala en vez de crear otra.";
  }
  if (m.includes("page_key_check") || m.includes("page_module_check")) {
    return "La clave de pantalla no tiene la forma esperada, o no empieza por un módulo del catálogo.";
  }
  if (m.includes("target_kind_check")) {
    return "El tipo de elemento tiene que ser pantalla, sección, campo o concepto.";
  }
  if (m.includes("page_target_check")) {
    return "La ayuda de una pantalla entera se llama siempre «page».";
  }
  if (m.includes("explanation_check")) {
    return "La explicación necesita al menos diez caracteres.";
  }
  if (m.includes("row-level security") || m.includes("permission denied")) {
    return "Tu cuenta no puede administrar la ayuda del producto.";
  }
  return "No fue posible guardar. Vuelve a intentarlo en unos minutos.";
}

function mensajeDePublicacion(motor?: string): string {
  const m = motor ?? "";
  if (/no existe|borrador que publicar|no se modifica|ya estaba cerrada|administración de plataforma/i.test(m)) {
    const i = m.search(/[A-ZÁÉÍÓÚ¿]/);
    return (i > 0 ? m.slice(i) : m).trim();
  }
  if (/permission denied|row-level security/i.test(m)) {
    return "Tu cuenta no puede publicar la ayuda del producto.";
  }
  return "No fue posible completar la publicación. Vuelve a intentarlo en unos minutos.";
}
