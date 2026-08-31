import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-02B2 · La capa de datos de la FAQ para la consola.
 *
 * TODO lo que hay aquí se lee y se escribe con la SESIÓN de quien administra.
 * No hay cliente administrativo en este archivo y no puede haberlo: quien
 * escribe la FAQ es un superadministrador identificado, y la base tiene que
 * saber quién fue —`created_by` de cada revisión sale de `auth.uid()`—.
 *
 * Las revisiones NO se escriben desde aquí. Nacen por `faq_publish_entry`, que
 * las numera, cierra la anterior y rechaza lo que no se puede afirmar. Esta
 * capa llama a esa función; no la sustituye.
 *
 * `client` es inyectable por la misma razón que en el resto del repositorio:
 * para poder comprobar esto contra una base real sin montar un servidor. En
 * producción no se pasa nunca.
 */

type Db = SupabaseClient;

async function db(client?: Db): Promise<Db> {
  return client ?? ((await createServerClient()) as unknown as Db);
}

// ---------------------------------------------------------------------------
// Formas
// ---------------------------------------------------------------------------

export type FaqCategoryRow = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  sortOrder: number;
  status: "active" | "inactive";
  entries: number;
};

export type FaqEntryVisibility = "public" | "authenticated";
export type FaqEntryStatus = "draft" | "published" | "unpublished";

export type FaqEntrySummary = {
  id: string;
  slug: string;
  categoryCode: string;
  categoryLabel: string;
  visibility: FaqEntryVisibility;
  status: FaqEntryStatus;
  scope: "global" | "modules";
  moduleKeys: string[];
  isFeatured: boolean;
  sortOrder: number;
  /** La pregunta que se ve hoy, o la del borrador si nunca se publicó. */
  question: string;
  /** ¿Hay borrador con cambios respecto de lo publicado? */
  hasPendingDraft: boolean;
  publishedAt: string | null;
  updatedAt: string;
};

export type FaqVerificationStatus =
  | "verified"
  | "verified_with_qualifier"
  | "external_policy_verification_required"
  | "not_verified"
  | "must_not_claim";

export type FaqDraft = {
  entryId: string;
  language: string;
  question: string;
  answerShort: string;
  answerLong: string | null;
  normativeClass: string;
  verificationStatus: FaqVerificationStatus;
  sourceBasis: string | null;
  verificationNote: string | null;
  externalSourceUrl: string | null;
  externalSourceCheckedOn: string | null;
  changeNote: string | null;
  updatedAt: string;
};

export type FaqRevision = {
  id: string;
  revisionNumber: number;
  language: string;
  question: string;
  answerShort: string;
  answerLong: string | null;
  normativeClass: string;
  verificationStatus: FaqVerificationStatus;
  sourceBasis: string | null;
  verificationNote: string | null;
  externalSourceUrl: string | null;
  externalSourceCheckedOn: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeNote: string | null;
  createdByName: string | null;
  createdAt: string;
};

export type FaqEntryDetail = {
  entry: FaqEntrySummary;
  draft: FaqDraft | null;
  current: FaqRevision | null;
  history: FaqRevision[];
};

/**
 * El resultado de una lectura, que son TRES cosas y no dos.
 *
 * Es la lección de PE-01B, y vale igual aquí: si un fallo de lectura vuelve
 * como lista vacía, la consola dice «no hay preguntas» cuando lo cierto es «no
 * se pudo consultar». Un editor que lee eso cree que perdió su trabajo.
 */
export type FaqRead<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" };

// ---------------------------------------------------------------------------
// Lecturas
// ---------------------------------------------------------------------------

export type FaqListFilters = {
  search?: string | null;
  categoryCode?: string | null;
  visibility?: FaqEntryVisibility | null;
  status?: FaqEntryStatus | null;
  moduleKey?: string | null;
  featuredOnly?: boolean;
  page?: number;
  pageSize?: number;
};

export const FAQ_PAGE_SIZE = 25;

function mapCategory(r: Record<string, unknown>, entries = 0): FaqCategoryRow {
  return {
    id: String(r.id),
    code: String(r.code),
    label: String(r.label),
    description: (r.description as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 0),
    status: (r.status as "active" | "inactive") ?? "active",
    entries,
  };
}

export async function listFaqCategories(client?: Db): Promise<FaqRead<FaqCategoryRow[]>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("faq_categories")
    .select("id, code, label, description, sort_order, status")
    .order("sort_order")
    .order("code");
  if (error) return { status: "unavailable" };

  const { data: usos, error: eUsos } = await supabase
    .from("faq_entries").select("category_id");
  if (eUsos) return { status: "unavailable" };
  const cuenta = new Map<string, number>();
  for (const u of (usos ?? []) as unknown as Record<string, unknown>[]) {
    const k = String(u.category_id);
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }

  return {
    status: "ok",
    data: ((data ?? []) as unknown as Record<string, unknown>[])
      .map((r) => mapCategory(r, cuenta.get(String(r.id)) ?? 0)),
  };
}

/**
 * La lista de la consola. El filtrado y la paginación se hacen en el SERVIDOR:
 * traer todas las preguntas al navegador para filtrarlas allí funcionaría con
 * treinta y dejaría de funcionar con trescientas, y para entonces nadie
 * recordaría por qué.
 */
export async function listFaqEntries(
  filters: FaqListFilters = {}, client?: Db
): Promise<FaqRead<{ rows: FaqEntrySummary[]; total: number }>> {
  const supabase = await db(client);
  const pageSize = filters.pageSize ?? FAQ_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);

  let q = supabase
    .from("faq_entries")
    .select("id, slug, visibility, status, scope, module_keys, is_featured, sort_order,"
      + " updated_at, category:faq_categories!inner(code, label, sort_order)",
      { count: "exact" });

  if (filters.categoryCode) q = q.eq("faq_categories.code", filters.categoryCode);
  if (filters.visibility) q = q.eq("visibility", filters.visibility);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.featuredOnly) q = q.eq("is_featured", true);
  if (filters.moduleKey) q = q.contains("module_keys", [filters.moduleKey]);
  if (filters.search && filters.search.trim().length > 0) {
    q = q.ilike("slug", `%${filters.search.trim().toLowerCase()}%`);
  }

  const { data, error, count } = await q
    .order("sort_order").order("slug")
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return { status: "unavailable" };

  const ids = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => String(r.id));
  if (ids.length === 0) return { status: "ok", data: { rows: [], total: count ?? 0 } };

  // La pregunta visible y el estado del borrador vienen de dos consultas
  // acotadas a esta página. Un `join` de revisiones traería toda la historia.
  const [{ data: vigentes, error: eV }, { data: borradores, error: eB }] = await Promise.all([
    supabase.from("faq_entry_revisions")
      .select("entry_id, question, effective_from, content_hash")
      .in("entry_id", ids).is("effective_to", null),
    supabase.from("faq_entry_drafts")
      .select("entry_id, question, answer_short, answer_long, updated_at").in("entry_id", ids),
  ]);
  if (eV || eB) return { status: "unavailable" };

  const porVigente = new Map<string, Record<string, unknown>>();
  for (const r of (vigentes ?? []) as unknown as Record<string, unknown>[]) {
    porVigente.set(String(r.entry_id), r);
  }
  const porBorrador = new Map<string, Record<string, unknown>>();
  for (const r of (borradores ?? []) as unknown as Record<string, unknown>[]) {
    porBorrador.set(String(r.entry_id), r);
  }

  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
    const id = String(r.id);
    const cat = (r.category ?? {}) as Record<string, unknown>;
    const vigente = porVigente.get(id);
    const borrador = porBorrador.get(id);
    return {
      id,
      slug: String(r.slug),
      categoryCode: String(cat.code ?? ""),
      categoryLabel: String(cat.label ?? ""),
      visibility: r.visibility as FaqEntryVisibility,
      status: r.status as FaqEntryStatus,
      scope: r.scope as "global" | "modules",
      moduleKeys: (r.module_keys as string[] | null) ?? [],
      isFeatured: Boolean(r.is_featured),
      sortOrder: Number(r.sort_order ?? 0),
      question: String(vigente?.question ?? borrador?.question ?? "(sin redactar)"),
      // Se compara con la huella de lo publicado: si el editor abrió el
      // borrador y no cambió nada, no hay por qué anunciar cambios.
      hasPendingDraft: Boolean(borrador) && (!vigente || huella(borrador!) !== String(vigente.content_hash)),
      publishedAt: (vigente?.effective_from as string | null) ?? null,
      updatedAt: String(r.updated_at),
    } satisfies FaqEntrySummary;
  });

  return { status: "ok", data: { rows, total: count ?? rows.length } };
}

/** La misma huella que calcula `faq_publish_entry`: título + corta + larga. */
function huella(borrador: Record<string, unknown>): string {
  const texto = `${String(borrador.question ?? "")}\n${String(borrador.answer_short ?? "")}\n`
    + `${(borrador.answer_long as string | null) ?? ""}`;
  return sha256Hex(texto);
}

function sha256Hex(texto: string): string {
  // Node en el servidor; nunca se ejecuta en el navegador (este archivo es
  // server-only).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(texto, "utf8").digest("hex");
}

function mapRevision(r: Record<string, unknown>): FaqRevision {
  const autor = (r.autor ?? null) as { full_name: string | null } | null;
  return {
    id: String(r.id),
    revisionNumber: Number(r.revision_number),
    language: String(r.language),
    question: String(r.question),
    answerShort: String(r.answer_short),
    answerLong: (r.answer_long as string | null) ?? null,
    normativeClass: String(r.normative_class),
    verificationStatus: r.verification_status as FaqVerificationStatus,
    sourceBasis: (r.source_basis as string | null) ?? null,
    verificationNote: (r.verification_note as string | null) ?? null,
    externalSourceUrl: (r.external_source_url as string | null) ?? null,
    externalSourceCheckedOn: (r.external_source_checked_on as string | null) ?? null,
    effectiveFrom: String(r.effective_from),
    effectiveTo: (r.effective_to as string | null) ?? null,
    changeNote: (r.change_note as string | null) ?? null,
    createdByName: autor?.full_name ?? null,
    createdAt: String(r.created_at),
  };
}

export async function getFaqEntryDetail(
  entryId: string, language = "es", client?: Db
): Promise<FaqRead<FaqEntryDetail | null>> {
  const supabase = await db(client);

  const { data: entrada, error } = await supabase
    .from("faq_entries")
    .select("id, slug, visibility, status, scope, module_keys, is_featured, sort_order,"
      + " updated_at, category:faq_categories!inner(code, label)")
    .eq("id", entryId).maybeSingle();
  if (error) return { status: "unavailable" };
  if (!entrada) return { status: "ok", data: null };

  const [{ data: borrador, error: eB }, { data: revisiones, error: eR }] = await Promise.all([
    supabase.from("faq_entry_drafts").select("*")
      .eq("entry_id", entryId).eq("language", language).maybeSingle(),
    supabase.from("faq_entry_revisions")
      .select("*, autor:profiles!faq_entry_revisions_created_by_fkey(full_name)")
      .eq("entry_id", entryId).eq("language", language)
      .order("revision_number", { ascending: false }),
  ]);
  if (eB || eR) return { status: "unavailable" };

  const todas = ((revisiones ?? []) as unknown as Record<string, unknown>[]).map(mapRevision);
  const vigente = todas.find((r) => r.effectiveTo === null) ?? null;
  const r = entrada as unknown as Record<string, unknown>;
  const cat = (r.category ?? {}) as Record<string, unknown>;
  const b = borrador as unknown as Record<string, unknown> | null;

  return {
    status: "ok",
    data: {
      entry: {
        id: String(r.id),
        slug: String(r.slug),
        categoryCode: String(cat.code ?? ""),
        categoryLabel: String(cat.label ?? ""),
        visibility: r.visibility as FaqEntryVisibility,
        status: r.status as FaqEntryStatus,
        scope: r.scope as "global" | "modules",
        moduleKeys: (r.module_keys as string[] | null) ?? [],
        isFeatured: Boolean(r.is_featured),
        sortOrder: Number(r.sort_order ?? 0),
        question: vigente?.question ?? String(b?.question ?? "(sin redactar)"),
        hasPendingDraft: Boolean(b) && (!vigente || huella(b!) !== sha256Hex(
          `${vigente.question}\n${vigente.answerShort}\n${vigente.answerLong ?? ""}`)),
        publishedAt: vigente?.effectiveFrom ?? null,
        updatedAt: String(r.updated_at),
      },
      draft: b ? {
        entryId: String(b.entry_id),
        language: String(b.language),
        question: String(b.question),
        answerShort: String(b.answer_short),
        answerLong: (b.answer_long as string | null) ?? null,
        normativeClass: String(b.normative_class),
        verificationStatus: b.verification_status as FaqVerificationStatus,
        sourceBasis: (b.source_basis as string | null) ?? null,
        verificationNote: (b.verification_note as string | null) ?? null,
        externalSourceUrl: (b.external_source_url as string | null) ?? null,
        externalSourceCheckedOn: (b.external_source_checked_on as string | null) ?? null,
        changeNote: (b.change_note as string | null) ?? null,
        updatedAt: String(b.updated_at),
      } : null,
      current: vigente,
      history: todas.filter((x) => x.effectiveTo !== null),
    },
  };
}

// ---------------------------------------------------------------------------
// Escrituras · todas bajo la sesión, todas comprobadas por la base
// ---------------------------------------------------------------------------

export type FaqWrite = { error: string | null; id?: string };

export async function createFaqEntry(input: {
  slug: string; categoryId: string; visibility: FaqEntryVisibility;
  scope: "global" | "modules"; moduleKeys: string[];
  question: string; answerShort: string;
}, client?: Db): Promise<FaqWrite> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("faq_entries").insert({
    slug: input.slug, category_id: input.categoryId, visibility: input.visibility,
    scope: input.scope, module_keys: input.moduleKeys,
  }).select("id").single();
  if (error || !data) return { error: mensajeDeEscritura(error?.message) };

  const id = String((data as { id: string }).id);
  const { error: eB } = await supabase.from("faq_entry_drafts").insert({
    entry_id: id, language: "es",
    question: input.question, answer_short: input.answerShort,
  });
  if (eB) return { error: mensajeDeEscritura(eB.message), id };
  return { error: null, id };
}

export async function saveFaqDraft(input: {
  entryId: string; language?: string;
  question: string; answerShort: string; answerLong: string | null;
  normativeClass: string; verificationStatus: FaqVerificationStatus;
  sourceBasis: string | null; verificationNote: string | null;
  externalSourceUrl: string | null; externalSourceCheckedOn: string | null;
  changeNote: string | null;
}, client?: Db): Promise<FaqWrite> {
  const supabase = await db(client);
  const { error } = await supabase.from("faq_entry_drafts").upsert({
    entry_id: input.entryId, language: input.language ?? "es",
    question: input.question, answer_short: input.answerShort,
    answer_long: input.answerLong,
    normative_class: input.normativeClass,
    verification_status: input.verificationStatus,
    source_basis: input.sourceBasis,
    verification_note: input.verificationNote,
    external_source_url: input.externalSourceUrl,
    external_source_checked_on: input.externalSourceCheckedOn,
    change_note: input.changeNote,
  }, { onConflict: "entry_id,language" });
  return { error: error ? mensajeDeEscritura(error.message) : null };
}

export async function updateFaqEntryMeta(input: {
  entryId: string; categoryId: string; visibility: FaqEntryVisibility;
  scope: "global" | "modules"; moduleKeys: string[];
  sortOrder: number; isFeatured: boolean;
}, client?: Db): Promise<FaqWrite> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("faq_entries").update({
    category_id: input.categoryId, visibility: input.visibility,
    scope: input.scope, module_keys: input.moduleKeys,
    sort_order: input.sortOrder, is_featured: input.isFeatured,
  }).eq("id", input.entryId).select("id");
  if (error) return { error: mensajeDeEscritura(error.message) };
  return { error: filaAfectada(data) };
}

export async function publishFaqEntry(
  entryId: string, changeNote: string | null, language = "es", client?: Db
): Promise<FaqWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("faq_publish_entry", {
    p_entry_id: entryId, p_language: language, p_change_note: changeNote,
  });
  return { error: error ? mensajeDePublicacion(error.message) : null };
}

export async function unpublishFaqEntry(
  entryId: string, language = "es", client?: Db
): Promise<FaqWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("faq_unpublish_entry", {
    p_entry_id: entryId, p_language: language, p_change_note: null,
  });
  return { error: error ? mensajeDePublicacion(error.message) : null };
}

export async function restoreFaqRevision(
  revisionId: string, client?: Db
): Promise<FaqWrite> {
  const supabase = await db(client);
  const { error } = await supabase.rpc("faq_restore_revision_to_draft", {
    p_revision_id: revisionId,
  });
  return { error: error ? mensajeDePublicacion(error.message) : null };
}

export async function createFaqCategory(input: {
  code: string; label: string; description: string | null; sortOrder: number;
}, client?: Db): Promise<FaqWrite> {
  const supabase = await db(client);
  const { error } = await supabase.from("faq_categories").insert({
    code: input.code, label: input.label,
    description: input.description, sort_order: input.sortOrder,
  });
  return { error: error ? mensajeDeEscritura(error.message) : null };
}

export async function updateFaqCategory(input: {
  id: string; label: string; description: string | null;
  sortOrder: number; status: "active" | "inactive";
}, client?: Db): Promise<FaqWrite> {
  const supabase = await db(client);
  const { data, error } = await supabase.from("faq_categories").update({
    label: input.label, description: input.description,
    sort_order: input.sortOrder, status: input.status,
  }).eq("id", input.id).select("id");
  if (error) return { error: mensajeDeEscritura(error.message) };
  return { error: filaAfectada(data) };
}

/**
 * Una actualización que la RLS no autoriza **no devuelve error**: devuelve cero
 * filas afectadas, con éxito. Es la trampa concreta contra la que avisa §17 del
 * encargo —«probar los permisos de verdad, no solo los botones escondidos»—: sin
 * esto, la consola le dice «guardado» a quien no ha guardado nada.
 *
 * Por eso cada actualización pide de vuelta la fila que tocó. Si no vuelve
 * ninguna, o no había fila o no había permiso; y como la consola solo llega aquí
 * con una fila que acaba de leer, lo segundo es lo que hay que contar.
 */
function filaAfectada(data: unknown): string | null {
  const filas = (data ?? []) as unknown[];
  if (filas.length > 0) return null;
  return "Tu cuenta no puede modificar el contenido de la plataforma.";
}

// ---------------------------------------------------------------------------
// Los mensajes · §29
// ---------------------------------------------------------------------------

/**
 * Un error de escritura se cuenta por lo que significa, no por lo que dijo el
 * motor. Y NUNCA se convierte en «no existe» ni en «no tienes contenido»: esas
 * dos frases describen la ausencia de algo, y una avería no es una ausencia.
 */
function mensajeDeEscritura(motor?: string): string {
  const m = (motor ?? "").toLowerCase();
  if (m.includes("faq_entries_slug_uniq") || m.includes("duplicate key")) {
    return "Ya existe una pregunta con ese identificador. Elige otro.";
  }
  if (m.includes("faq_entries_slug_check")) {
    return "El identificador solo admite minúsculas, números y guiones bajos, y empieza por una letra.";
  }
  if (m.includes("module_keys_check")) {
    return "Alguno de los módulos indicados no está en el catálogo de Trazaloop.";
  }
  if (m.includes("scope_shape_check")) {
    return "Una pregunta general no lleva módulos, y una de módulos tiene que decir de cuáles.";
  }
  if (m.includes("row-level security") || m.includes("permission denied")) {
    return "Tu cuenta no puede administrar el contenido de la plataforma.";
  }
  if (m.includes("check constraint") || m.includes("violates")) {
    return "Falta algún dato o alguno no tiene el formato esperado. Revisa el formulario.";
  }
  return "No fue posible guardar. Vuelve a intentarlo en unos minutos.";
}

/**
 * Los rechazos de publicación SÍ se cuentan con sus palabras: los mensajes de
 * `faq_publish_entry` están escritos para una persona y explican por qué no se
 * puede publicar. Traducirlos a «no fue posible» perdería justo lo que hace
 * falta saber.
 */
function mensajeDePublicacion(motor?: string): string {
  const m = motor ?? "";
  if (/no se puede publicar|salvedad|comprobación|verificación|borrador que publicar|no existe/i.test(m)) {
    // PostgREST antepone su propio prefijo en algunos casos; se recorta hasta
    // la primera mayúscula o signo de apertura, que es donde empieza la frase
    // que escribió la función de la base para que la lea una persona.
    const i = m.search(/[A-ZÁÉÍÓÚ¿]/);
    return (i > 0 ? m.slice(i) : m).trim();
  }
  if (/permission denied|row-level security|administración de plataforma/i.test(m)) {
    return "Tu cuenta no puede publicar contenido de la plataforma.";
  }
  return "No fue posible completar la publicación. Vuelve a intentarlo en unos minutos.";
}
