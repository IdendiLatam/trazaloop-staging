import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  normalizePageQuery, pageRange, sanitizeSearchTerm, type PageResult,
} from "@/lib/domain/pagination";
import { readAllStrict } from "@/lib/db/paged-read";
import {
  done, fail, mapDbError, reviewState, today,
  PERIPHERAL_REF_KINDS,
  type DomainResult, type EntryKind, type LinkKind, type PeripheralRefKind,
  type RelevanceState, type ReviewState, type SubjectKind,
} from "@/lib/domain/quality-interested-parties";

/**
 * Trazaloop · QUALITY-12.3B2 · Lectura y escritura de partes interesadas.
 *
 * CUATRO DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO ESTE ARCHIVO
 *
 * 1 · Lo que crea HISTORIA pasa por una RPC de 0150: suceder un análisis y
 *     registrar una revisión. Las dos cierran una vigencia, abren otra y
 *     emiten su evento EN EL MISMO ACTO, con `dedupe_key`, así que un doble
 *     clic o un reintento de red no duplican nada. Lo demás es escritura
 *     normal bajo RLS.
 *
 * 2 · Las relaciones se resuelven con consultas separadas y se cruzan en
 *     memoria. Las FK de este esquema son COMPUESTAS `(organization_id, id)`,
 *     y un `tabla:columna_id(...)` de PostgREST no las resuelve: devuelve el
 *     error dentro de `error`, no de `data`, y un `(data ?? [])` lo convierte
 *     en una lista vacía silenciosa. Ya pasó en QUALITY-04.
 *
 * 3 · Nunca `service_role`. Se opera con la sesión y decide la RLS. El cliente
 *     inyectable de las firmas es para que la suite contra base real ejercite
 *     ESTE código y no una copia.
 *
 * 4 · Ninguna consulta trae «todo». Las listas paginan en servidor con el
 *     orden inquilino → filtros → búsqueda → conteo → orden → rango; los
 *     recorridos completos —solo para constructores internos— usan
 *     `readAllStrict`, que falla si la travesía queda incompleta en vez de
 *     devolver media verdad.
 */

type Db = SupabaseClient;

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

// ===========================================================================
// TIPOS DE TRANSPORTE
// ===========================================================================

export type CategoryRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type GroupRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type AssessmentRow = {
  id: string;
  categoryId: string;
  categoryName: string | null;
  subjectKind: SubjectKind;
  subjectId: string;
  subjectLabel: string;
  assessedOn: string;
  ownerPositionId: string | null;
  relevanceStatus: RelevanceState;
  relevanceRationale: string | null;
  priorityLabel: string | null;
  priorityScore: number | null;
  priorityMethodNote: string | null;
  summary: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedesId: string | null;
  status: string;
};

export type RequirementRow = {
  id: string;
  assessmentId: string;
  entryKind: EntryKind;
  requirementKind: string | null;
  code: string | null;
  title: string;
  description: string | null;
  sourceNote: string | null;
  derivedFromId: string | null;
  conversionRationale: string | null;
  relevanceStatus: RelevanceState;
  relevanceRationale: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type RequirementProcessRow = {
  id: string;
  requirementId: string;
  processId: string;
  processName: string | null;
  processRevisionId: string | null;
  linkKind: LinkKind;
  note: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type StrategyRow = {
  id: string;
  assessmentId: string;
  title: string;
  purpose: string | null;
  approach: string | null;
  ownerPositionId: string | null;
  ownerPositionName: string | null;
  monitoringMethod: string | null;
  monitoringNote: string | null;
  reviewCadenceMonths: number | null;
  nextReviewOn: string | null;
  lastReviewedOn: string | null;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  requirementIds: string[];
  /** El vínculo, no solo el requisito: para terminarlo hace falta SU
   *  identificador. Cerrar por `requirement_id` cerraría todos los que
   *  hubiera, y una estrategia puede haber atendido el mismo requisito en dos
   *  periodos distintos. */
  requirementLinks: { linkId: string; requirementId: string }[];
  reviewState: ReviewState;
};

export type ReviewRow = {
  id: string;
  assessmentId: string | null;
  strategyId: string | null;
  reviewedOn: string;
  verdict: string;
  note: string | null;
  nextReviewOn: string | null;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ===========================================================================
// CATÁLOGOS
// ===========================================================================

export async function listCategories(
  orgId: string, opts: { includeInactive?: boolean } = {}, client?: Db
): Promise<CategoryRow[]> {
  const supabase = await db(client);
  // Hoy son quince y mañana pueden ser doscientas. `readAllStrict` en vez de
  // una consulta suelta porque un desplegable al que le faltan opciones no se
  // distingue de uno completo: quien elige no ve lo que falta.
  const data = await readAllStrict<Record<string, unknown>>(() => {
    let q = supabase
      .from("quality_stakeholder_categories")
      .select("id, code, name, description, sort_order, is_active")
      .eq("organization_id", orgId);
    if (!opts.includeInactive) q = q.eq("is_active", true);
    return q.order("sort_order").order("id") as never;
  }, "categorias de partes interesadas");
  return data.map((r) => ({
    id: r.id as string,
    code: (r.code as string | null) ?? null,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    sortOrder: Number(r.sort_order ?? 100),
    isActive: Boolean(r.is_active),
  }));
}

/** Siembra las 15 iniciales. Idempotente: la segunda llamada devuelve 0. */
export async function seedCategories(orgId: string, client?: Db): Promise<DomainResult<number>> {
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_seed_stakeholder_categories", {
    p_organization_id: orgId,
  });
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  return done(Number(data ?? 0));
}

export async function createCategory(
  orgId: string, input: { code?: string | null; name: string; description?: string | null; sortOrder?: number },
  client?: Db
): Promise<DomainResult<string>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_categories")
    .insert({
      organization_id: orgId,
      code: input.code ?? null,
      name: input.name,
      description: input.description ?? null,
      ...(input.sortOrder === undefined ? {} : { sort_order: input.sortOrder }),
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "permission_denied");
  return done(data.id as string);
}

/**
 * Activar o desactivar. NO hay borrado: una categoría con historia
 * desaparecería de análisis que la usaron, y esos análisis son la respuesta a
 * «cómo clasificábamos entonces».
 */
export async function setCategoryActive(
  orgId: string, categoryId: string, isActive: boolean, client?: Db
): Promise<DomainResult<true>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_categories")
    .update({ is_active: isActive })
    .eq("organization_id", orgId).eq("id", categoryId)
    .select("id");
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  if ((data ?? []).length === 0) return fail("permission_denied");
  return done(true);
}

export async function listGroups(
  orgId: string, opts: { includeInactive?: boolean } = {}, client?: Db
): Promise<GroupRow[]> {
  const supabase = await db(client);
  const data = await readAllStrict<Record<string, unknown>>(() => {
    let q = supabase
      .from("quality_stakeholder_groups")
      .select("id, code, name, description, is_active")
      .eq("organization_id", orgId);
    if (!opts.includeInactive) q = q.eq("is_active", true);
    return q.order("name").order("id") as never;
  }, "colectivos de partes interesadas");
  return data.map((r) => ({
    id: r.id as string,
    code: (r.code as string | null) ?? null,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    isActive: Boolean(r.is_active),
  }));
}

export async function createGroup(
  orgId: string, input: { code?: string | null; name: string; description?: string | null },
  client?: Db
): Promise<DomainResult<string>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_groups")
    .insert({
      organization_id: orgId, code: input.code ?? null,
      name: input.name, description: input.description ?? null,
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "permission_denied");
  return done(data.id as string);
}

export async function setGroupActive(
  orgId: string, groupId: string, isActive: boolean, client?: Db
): Promise<DomainResult<true>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_groups")
    .update({ is_active: isActive })
    .eq("organization_id", orgId).eq("id", groupId)
    .select("id");
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  if ((data ?? []).length === 0) return fail("permission_denied");
  return done(true);
}

// ===========================================================================
// LOS SUJETOS Y SUS ETIQUETAS
// ---------------------------------------------------------------------------
// Una parte interesada se llama de dos maneras según de dónde venga, y la
// etiqueta se resuelve en un solo sitio. Se leen `trade_name` y `legal_name` y
// NADA más: los contactos de la entidad externa no entran aquí ni en el
// contexto de Intelligence.
// ===========================================================================

async function subjectLabels(
  orgId: string, partyIds: string[], groupIds: string[], client?: Db
): Promise<Map<string, string>> {
  const supabase = await db(client);
  const mapa = new Map<string, string>();
  if (partyIds.length > 0) {
    const { data } = await supabase
      .from("quality_external_parties")
      .select("id, legal_name, trade_name")
      .eq("organization_id", orgId).in("id", [...new Set(partyIds)]);
    for (const r of data ?? []) {
      const t = (r.trade_name as string | null)?.trim();
      mapa.set(r.id as string, t && t.length > 0 ? t : (r.legal_name as string));
    }
  }
  if (groupIds.length > 0) {
    const { data } = await supabase
      .from("quality_stakeholder_groups")
      .select("id, name")
      .eq("organization_id", orgId).in("id", [...new Set(groupIds)]);
    for (const r of data ?? []) mapa.set(r.id as string, r.name as string);
  }
  return mapa;
}

const ASSESSMENT_COLUMNS =
  "id, category_id, subject_kind, external_party_id, stakeholder_group_id, assessed_on, " +
  "owner_position_id, relevance_status, relevance_rationale, priority_label, priority_score, " +
  "priority_method_note, summary, effective_from, effective_to, supersedes_id, status";

async function mapAssessments(
  orgId: string, rows: Record<string, unknown>[], client?: Db
): Promise<AssessmentRow[]> {
  const partyIds = rows.map((r) => r.external_party_id as string | null).filter(Boolean) as string[];
  const groupIds = rows.map((r) => r.stakeholder_group_id as string | null).filter(Boolean) as string[];
  const [labels, cats] = await Promise.all([
    subjectLabels(orgId, partyIds, groupIds, client),
    listCategories(orgId, { includeInactive: true }, client),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  return rows.map((r) => {
    const kind = r.subject_kind as SubjectKind;
    const subjectId = (kind === "external_party"
      ? (r.external_party_id as string)
      : (r.stakeholder_group_id as string));
    return {
      id: r.id as string,
      categoryId: r.category_id as string,
      categoryName: catName.get(r.category_id as string) ?? null,
      subjectKind: kind,
      subjectId,
      subjectLabel: labels.get(subjectId) ?? "Parte interesada",
      assessedOn: r.assessed_on as string,
      ownerPositionId: (r.owner_position_id as string | null) ?? null,
      relevanceStatus: r.relevance_status as RelevanceState,
      relevanceRationale: (r.relevance_rationale as string | null) ?? null,
      priorityLabel: (r.priority_label as string | null) ?? null,
      priorityScore: num(r.priority_score),
      priorityMethodNote: (r.priority_method_note as string | null) ?? null,
      summary: (r.summary as string | null) ?? null,
      effectiveFrom: r.effective_from as string,
      effectiveTo: (r.effective_to as string | null) ?? null,
      supersedesId: (r.supersedes_id as string | null) ?? null,
      status: r.status as string,
    };
  });
}

// ===========================================================================
// LISTADO · inquilino → filtros → búsqueda → conteo → orden → rango
// ---------------------------------------------------------------------------
// La búsqueda es por ETIQUETA del sujeto, y la etiqueta vive en otras dos
// tablas. Así que se resuelve en dos pasos: primero los identificadores que
// casan con el término —acotados— y luego la página de análisis. Filtrar la
// página ya cargada daría resultados distintos según en qué página estuviera
// la persona, que es el error que PCR-01 vino a corregir.
// ===========================================================================

export async function searchAssessments(
  orgId: string,
  params: {
    q?: string; page?: string; pageSize?: number;
    categoryId?: string; relevance?: RelevanceState; subjectKind?: SubjectKind;
    priority?: string; onlyCurrent?: boolean; asOf?: string;
    /** Estado de revisión de la parte, o «sin estrategia», que NO es un estado
     *  de revisión sino su ausencia. Se resuelve contra las estrategias antes
     *  de pedir la página: filtrar la página ya cargada daría resultados
     *  distintos según en cuál estuvieras. */
    reviewState?: ReviewState | "no_strategy";
  } = {},
  client?: Db
): Promise<PageResult<AssessmentRow>> {
  const supabase = await db(client);
  const { page, pageSize } = normalizePageQuery({ page: params.page, pageSize: params.pageSize });
  const { from, to } = pageRange(page, pageSize);

  let request = supabase
    .from("quality_stakeholder_assessments")
    .select(ASSESSMENT_COLUMNS, { count: "exact" })
    .eq("organization_id", orgId);

  if (params.categoryId) request = request.eq("category_id", params.categoryId);
  if (params.relevance) request = request.eq("relevance_status", params.relevance);
  if (params.subjectKind) request = request.eq("subject_kind", params.subjectKind);
  if (params.priority) request = request.eq("priority_label", params.priority);

  // Vigencia: hoy por defecto, o la fecha pedida. `effective_to` es EXCLUSIVO.
  if (params.asOf) {
    request = request.lte("effective_from", params.asOf)
      .or(`effective_to.is.null,effective_to.gt.${params.asOf}`);
  } else if (params.onlyCurrent !== false) {
    request = request.is("effective_to", null);
  }

  const term = sanitizeSearchTerm(params.q ?? "");
  if (term) {
    const [partes, grupos] = await Promise.all([
      supabase.from("quality_external_parties").select("id")
        .eq("organization_id", orgId)
        .or(`legal_name.ilike.%${term}%,trade_name.ilike.%${term}%`)
        .limit(200),
      supabase.from("quality_stakeholder_groups").select("id")
        .eq("organization_id", orgId).ilike("name", `%${term}%`).limit(200),
    ]);
    const ids = [
      ...(partes.data ?? []).map((r) => r.id as string),
      ...(grupos.data ?? []).map((r) => r.id as string),
    ];
    if (ids.length === 0) return { rows: [], total: 0, page, pageSize };
    const lista = ids.map((i) => `"${i}"`).join(",");
    request = request.or(`external_party_id.in.(${lista}),stakeholder_group_id.in.(${lista})`);
  }

  if (params.reviewState) {
    const ids = await assessmentIdsByReviewState(
      orgId, params.reviewState, params.asOf ?? today(), supabase);
    if (ids.length === 0) return { rows: [], total: 0, page, pageSize };
    request = request.in("id", ids);
  }

  const { data, count } = await request
    .order("assessed_on", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  return {
    rows: await mapAssessments(orgId, (data ?? []) as unknown as Record<string, unknown>[], client),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/**
 * Los análisis cuyo estado de revisión es el pedido.
 *
 * El estado de una PARTE es el peor de sus estrategias vigentes: si una está
 * vencida, la parte está vencida, aunque las otras dos estén al día. Y una
 * parte sin ninguna estrategia no tiene estado de revisión —no hay nada que
 * revisar todavía—, que es distinto de tenerla sin revisar.
 *
 * Se resuelve leyendo solo tres columnas de las estrategias vigentes y
 * aplicando `reviewState` del dominio, que es el mismo que pinta la insignia.
 * Reimplementar el umbral aquí en SQL habría creado una segunda verdad que se
 * separaría de la primera en cuanto alguien tocara los 30 días.
 */
async function assessmentIdsByReviewState(
  orgId: string, wanted: ReviewState | "no_strategy", onDate: string, supabase: Db
): Promise<string[]> {
  const vigentes = await readAllStrict<Record<string, unknown>>(() =>
    supabase.from("quality_stakeholder_strategies")
      .select("assessment_id, last_reviewed_on, next_review_on, review_cadence_months")
      .eq("organization_id", orgId).eq("status", "active")
      .lte("effective_from", onDate).or(`effective_to.is.null,effective_to.gt.${onDate}`)
      .order("assessment_id").order("id") as never,
    "estrategias vigentes");

  const ORDEN: Record<ReviewState, number> = {
    overdue: 3, due_soon: 2, never_reviewed: 1, up_to_date: 0,
  };
  const peor = new Map<string, ReviewState>();
  for (const e of vigentes) {
    const estado = reviewState({
      lastReviewedOn: (e.last_reviewed_on as string | null) ?? null,
      nextReviewOn: (e.next_review_on as string | null) ?? null,
      cadenceMonths: num(e.review_cadence_months),
      onDate,
    });
    const id = e.assessment_id as string;
    const previo = peor.get(id);
    if (previo === undefined || ORDEN[estado] > ORDEN[previo]) peor.set(id, estado);
  }

  if (wanted === "no_strategy") {
    const todos = await readAllStrict<{ id: string }>(() =>
      supabase.from("quality_stakeholder_assessments").select("id")
        .eq("organization_id", orgId)
        .lte("effective_from", onDate).or(`effective_to.is.null,effective_to.gt.${onDate}`)
        .order("id") as never,
      "analisis vigentes");
    return todos.map((a) => a.id).filter((id) => !peor.has(id));
  }
  return [...peor.entries()].filter(([, e]) => e === wanted).map(([id]) => id);
}

/**
 * El resumen de seguimiento de cada fila de la lista.
 *
 * Una consulta más, acotada a los identificadores de LA PÁGINA. No se pide por
 * fila —serían veinte viajes— ni se trae la tabla entera para filtrarla luego.
 */
export type ListRowMonitoring = {
  activeStrategies: number;
  reviewState: ReviewState | null;
  monitoringMethods: string[];
};

export async function monitoringForAssessments(
  orgId: string, assessmentIds: string[], onDate?: string, client?: Db
): Promise<Map<string, ListRowMonitoring>> {
  const mapa = new Map<string, ListRowMonitoring>();
  if (assessmentIds.length === 0) return mapa;
  const supabase = await db(client);
  const hoy = onDate ?? today();

  const { data } = await supabase
    .from("quality_stakeholder_strategies")
    .select("assessment_id, last_reviewed_on, next_review_on, review_cadence_months, monitoring_method")
    .eq("organization_id", orgId).in("assessment_id", assessmentIds)
    .eq("status", "active")
    .lte("effective_from", hoy).or(`effective_to.is.null,effective_to.gt.${hoy}`);

  const ORDEN: Record<ReviewState, number> = {
    overdue: 3, due_soon: 2, never_reviewed: 1, up_to_date: 0,
  };
  for (const e of (data ?? []) as unknown as Record<string, unknown>[]) {
    const id = e.assessment_id as string;
    const previo = mapa.get(id) ?? { activeStrategies: 0, reviewState: null, monitoringMethods: [] };
    const estado = reviewState({
      lastReviewedOn: (e.last_reviewed_on as string | null) ?? null,
      nextReviewOn: (e.next_review_on as string | null) ?? null,
      cadenceMonths: num(e.review_cadence_months),
      onDate: hoy,
    });
    const metodo = (e.monitoring_method as string | null) ?? null;
    mapa.set(id, {
      activeStrategies: previo.activeStrategies + 1,
      reviewState: previo.reviewState === null || ORDEN[estado] > ORDEN[previo.reviewState]
        ? estado : previo.reviewState,
      monitoringMethods: metodo && !previo.monitoringMethods.includes(metodo)
        ? [...previo.monitoringMethods, metodo] : previo.monitoringMethods,
    });
  }
  return mapa;
}

// ===========================================================================
// DETALLE · cargadores en paralelo, no una consulta gigante
// ---------------------------------------------------------------------------
// Seis lecturas independientes que se lanzan a la vez y se cruzan en memoria.
// Una sola consulta con seis `join` sería más corta de escribir y peor de
// todo lo demás: no la podría reutilizar la vista de requisitos, no admitiría
// `as_of` por partes, y su plan de ejecución dependería de la tabla con menos
// filas.
// ===========================================================================

export type StakeholderDetail = {
  assessment: AssessmentRow | null;
  history: AssessmentRow[];
  requirements: RequirementRow[];
  processLinks: RequirementProcessRow[];
  strategies: StrategyRow[];
  reviews: ReviewRow[];
};

export async function getAssessment(
  orgId: string, assessmentId: string, client?: Db
): Promise<AssessmentRow | null> {
  const supabase = await db(client);
  const { data } = await supabase
    .from("quality_stakeholder_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("organization_id", orgId).eq("id", assessmentId).maybeSingle();
  if (!data) return null;
  const [row] = await mapAssessments(orgId, [data as unknown as Record<string, unknown>], client);
  return row ?? null;
}

/**
 * El detalle de una parte, en una fecha.
 *
 * `asOf` recorre TODAS las capas: análisis, requisitos, vínculos con procesos
 * y estrategias. Aplicarlo solo al análisis daría la foto de entonces con los
 * requisitos de hoy, que es la clase de respuesta que parece correcta y no lo
 * es.
 */
export async function getStakeholderDetail(
  orgId: string,
  subject: { kind: SubjectKind; id: string; categoryId?: string },
  opts: { asOf?: string } = {},
  client?: Db
): Promise<StakeholderDetail> {
  const supabase = await db(client);
  const onDate = opts.asOf ?? null;
  const col = subject.kind === "external_party" ? "external_party_id" : "stakeholder_group_id";

  let q = supabase
    .from("quality_stakeholder_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("organization_id", orgId).eq(col, subject.id);
  if (subject.categoryId) q = q.eq("category_id", subject.categoryId);
  const { data: todos } = await q.order("effective_from", { ascending: false });

  const history = await mapAssessments(
    orgId, (todos ?? []) as unknown as Record<string, unknown>[], client);

  const vigente = onDate
    ? history.find((a) => a.effectiveFrom <= onDate && (a.effectiveTo === null || a.effectiveTo > onDate))
    : history.find((a) => a.effectiveTo === null);

  if (!vigente) {
    return { assessment: null, history, requirements: [], processLinks: [], strategies: [], reviews: [] };
  }

  const [reqs, strategies, reviews] = await Promise.all([
    listRequirements(orgId, vigente.id, { asOf: onDate ?? undefined }, client),
    listStrategies(orgId, vigente.id, { asOf: onDate ?? undefined }, client),
    listReviews(orgId, { assessmentId: vigente.id }, client),
  ]);
  const processLinks = reqs.length === 0
    ? []
    : await listRequirementProcesses(orgId, reqs.map((r: RequirementRow) => r.id), { asOf: onDate ?? undefined }, client);

  return { assessment: vigente, history, requirements: reqs, processLinks, strategies, reviews };
}

// ===========================================================================
// REQUISITOS
// ===========================================================================

const REQUIREMENT_COLUMNS =
  "id, assessment_id, entry_kind, requirement_kind, code, title, description, source_note, " +
  "derived_from_id, conversion_rationale, relevance_status, relevance_rationale, " +
  "effective_from, effective_to";

const mapRequirement = (r: Record<string, unknown>): RequirementRow => ({
  id: r.id as string,
  assessmentId: r.assessment_id as string,
  entryKind: r.entry_kind as EntryKind,
  requirementKind: (r.requirement_kind as string | null) ?? null,
  code: (r.code as string | null) ?? null,
  title: r.title as string,
  description: (r.description as string | null) ?? null,
  sourceNote: (r.source_note as string | null) ?? null,
  derivedFromId: (r.derived_from_id as string | null) ?? null,
  conversionRationale: (r.conversion_rationale as string | null) ?? null,
  relevanceStatus: r.relevance_status as RelevanceState,
  relevanceRationale: (r.relevance_rationale as string | null) ?? null,
  effectiveFrom: r.effective_from as string,
  effectiveTo: (r.effective_to as string | null) ?? null,
});

export async function listRequirements(
  orgId: string, assessmentId: string,
  opts: { asOf?: string; entryKind?: EntryKind } = {}, client?: Db
): Promise<RequirementRow[]> {
  const supabase = await db(client);
  // `readAllStrict` y no una consulta suelta: sin `.range()`, PostgREST corta
  // en 1 000 filas SIN error, y una lista de requisitos a la que le faltan
  // tres no se distingue de una completa. Aquí eso sería una parte interesada
  // con requisitos invisibles.
  const rows = await readAllStrict<Record<string, unknown>>(() => {
    let q = supabase
      .from("quality_stakeholder_requirements")
      .select(REQUIREMENT_COLUMNS)
      .eq("organization_id", orgId).eq("assessment_id", assessmentId);
    if (opts.entryKind) q = q.eq("entry_kind", opts.entryKind);
    if (opts.asOf) {
      q = q.lte("effective_from", opts.asOf).or(`effective_to.is.null,effective_to.gt.${opts.asOf}`);
    }
    return q.order("entry_kind").order("id") as never;
  }, "requisitos de la parte interesada");
  return rows.map(mapRequirement);
}

export async function createRequirement(
  orgId: string,
  input: {
    assessmentId: string; entryKind: EntryKind; requirementKind?: string | null;
    title: string; description?: string | null; code?: string | null;
    sourceNote?: string | null; relevanceStatus?: RelevanceState; relevanceRationale?: string | null;
  },
  client?: Db
): Promise<DomainResult<string>> {
  if (input.entryKind === "requirement" && !input.requirementKind) {
    return fail("requirement_subtype_required");
  }
  if (input.entryKind !== "requirement" && input.requirementKind) {
    return fail("requirement_subtype_not_allowed");
  }
  if (input.relevanceStatus === "not_relevant"
      && !(input.relevanceRationale ?? "").trim()) {
    return fail("relevance_reason_required");
  }
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_requirements")
    .insert({
      organization_id: orgId,
      assessment_id: input.assessmentId,
      entry_kind: input.entryKind,
      requirement_kind: input.requirementKind ?? null,
      code: input.code ?? null,
      title: input.title,
      description: input.description ?? null,
      source_note: input.sourceNote ?? null,
      ...(input.relevanceStatus ? { relevance_status: input.relevanceStatus } : {}),
      relevance_rationale: input.relevanceRationale ?? null,
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "cross_tenant_reference");
  return done(data.id as string);
}

/**
 * Convertir una necesidad o expectativa en requisito.
 *
 * NO reetiqueta la fila de origen: crea una nueva que apunta a ella. Sin eso,
 * dentro de un año nadie sabría si el SLA salió de una petición del cliente o
 * de una decisión propia. La de origen NO se borra ni se cierra: sigue siendo
 * lo que la parte pidió.
 */
export async function convertToRequirement(
  orgId: string,
  input: {
    originId: string; requirementKind: string; title?: string;
    rationale: string; sourceNote?: string | null;
  },
  client?: Db
): Promise<DomainResult<string>> {
  if (!input.rationale.trim()) return fail("conversion_reason_required");
  const supabase = await db(client);
  const { data: origen } = await supabase
    .from("quality_stakeholder_requirements")
    .select("id, assessment_id, entry_kind, title, description")
    .eq("organization_id", orgId).eq("id", input.originId).maybeSingle();
  if (!origen) return fail("stakeholder_not_found");
  if (origen.entry_kind === "requirement") return fail("conversion_origin_invalid");

  const { data, error } = await supabase
    .from("quality_stakeholder_requirements")
    .insert({
      organization_id: orgId,
      assessment_id: origen.assessment_id,
      entry_kind: "requirement",
      requirement_kind: input.requirementKind,
      title: input.title ?? (origen.title as string),
      description: origen.description ?? null,
      source_note: input.sourceNote ?? null,
      derived_from_id: origen.id,
      converted_at: new Date().toISOString(),
      conversion_rationale: input.rationale,
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "conversion_origin_invalid");
  await emitRequirementChanged(orgId, data.id as string, "converted", client);
  return done(data.id as string);
}

/** Cambiar la pertinencia de un requisito. Descartar exige decir por qué. */
export async function setRequirementRelevance(
  orgId: string, requirementId: string,
  status: RelevanceState, rationale: string | null, client?: Db
): Promise<DomainResult<true>> {
  if (status === "not_relevant" && !(rationale ?? "").trim()) {
    return fail("relevance_reason_required");
  }
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_requirements")
    .update({ relevance_status: status, relevance_rationale: rationale })
    .eq("organization_id", orgId).eq("id", requirementId)
    .select("id");
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  if ((data ?? []).length === 0) return fail("permission_denied");
  await emitRequirementChanged(orgId, requirementId, `relevance:${status}`, client);
  return done(true);
}

/** Retirar un requisito: cierra su vigencia. NUNCA lo borra. */
export async function retireRequirement(
  orgId: string, requirementId: string, onDate: string | null, client?: Db
): Promise<DomainResult<true>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_requirements")
    .update({ effective_to: onDate ?? today() })
    .eq("organization_id", orgId).eq("id", requirementId).is("effective_to", null)
    .select("id");
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  if ((data ?? []).length === 0) return fail("historical_record_immutable");
  await emitRequirementChanged(orgId, requirementId, "retired", client);
  return done(true);
}

// ===========================================================================
// LOS DOS HECHOS QUE SE EMITEN DESDE AQUÍ
// ---------------------------------------------------------------------------
// `work_events` no tiene política de escritura —desde 0117, y está bien que no
// la tenga—, así que esto no inserta: pide a la base que emita. Y si la
// emisión falla, la escritura que ya ocurrió NO se deshace: un aviso perdido
// es un aviso perdido; un requisito que desaparece porque su aviso falló es un
// dato perdido.
// ===========================================================================

async function emitChange(
  kind: "requirement" | "strategy", id: string, change: string, client?: Db
): Promise<void> {
  try {
    const supabase = await db(client);
    await supabase.rpc("quality_emit_stakeholder_change_event", {
      p_owner_kind: kind, p_owner_id: id, p_change: change,
    });
  } catch {
    // Silencio deliberado. Ver arriba.
  }
}

const emitRequirementChanged = (
  _orgId: string, id: string, change: string, client?: Db
) => emitChange("requirement", id, change, client);

const emitStrategyChanged = (
  _orgId: string, id: string, change: string, client?: Db
) => emitChange("strategy", id, change, client);

// ===========================================================================
// ANÁLISIS · alta y sucesión
// ---------------------------------------------------------------------------
// El alta es una escritura normal. La sucesión NO: cierra una vigencia y abre
// otra, y las dos cosas tienen que pasar juntas o ninguna. Eso lo resuelve
// `quality_supersede_stakeholder_assessment`, que además emite el hecho dentro
// de la misma transacción. Hacerlo aquí en tres pasos dejaría, ante un fallo
// de red entre el segundo y el tercero, una parte interesada sin análisis
// vigente: ni el viejo ni el nuevo.
// ===========================================================================

export async function createAssessment(
  orgId: string,
  input: {
    categoryId: string; subjectKind: SubjectKind; subjectId: string;
    assessedOn?: string; ownerPositionId?: string | null;
    relevanceStatus: RelevanceState; relevanceRationale?: string | null;
    priorityLabel?: string | null; priorityScore?: number | null;
    priorityMethodNote?: string | null; summary?: string | null;
    effectiveFrom?: string;
  },
  client?: Db
): Promise<DomainResult<string>> {
  if (input.relevanceStatus === "not_relevant" && !(input.relevanceRationale ?? "").trim()) {
    return fail("relevance_reason_required");
  }
  if (input.priorityScore !== null && input.priorityScore !== undefined
      && !(input.priorityMethodNote ?? "").trim()) {
    return fail("score_needs_method");
  }
  const supabase = await db(client);
  const desde = input.effectiveFrom ?? input.assessedOn ?? today();
  const { data, error } = await supabase
    .from("quality_stakeholder_assessments")
    .insert({
      organization_id: orgId,
      category_id: input.categoryId,
      subject_kind: input.subjectKind,
      external_party_id: input.subjectKind === "external_party" ? input.subjectId : null,
      stakeholder_group_id: input.subjectKind === "group" ? input.subjectId : null,
      assessed_on: input.assessedOn ?? desde,
      owner_position_id: input.ownerPositionId ?? null,
      relevance_status: input.relevanceStatus,
      relevance_rationale: input.relevanceRationale ?? null,
      priority_label: input.priorityLabel ?? null,
      priority_score: input.priorityScore ?? null,
      priority_method_note: input.priorityMethodNote ?? null,
      summary: input.summary ?? null,
      effective_from: desde,
      status: "current",
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "duplicate_current");
  return done(data.id as string);
}

export async function supersedeAssessment(
  orgId: string,
  input: {
    assessmentId: string; relevanceStatus: RelevanceState;
    relevanceRationale?: string | null; summary?: string | null;
    priorityLabel?: string | null; priorityScore?: number | null;
    priorityMethodNote?: string | null; ownerPositionId?: string | null;
    effectiveFrom?: string | null;
  },
  client?: Db
): Promise<DomainResult<string>> {
  if (input.relevanceStatus === "not_relevant" && !(input.relevanceRationale ?? "").trim()) {
    return fail("relevance_reason_required");
  }
  if (input.priorityScore !== null && input.priorityScore !== undefined
      && !(input.priorityMethodNote ?? "").trim()) {
    return fail("score_needs_method");
  }
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_supersede_stakeholder_assessment", {
    p_assessment_id: input.assessmentId,
    p_relevance_status: input.relevanceStatus,
    p_relevance_rationale: input.relevanceRationale ?? null,
    p_summary: input.summary ?? null,
    p_priority_label: input.priorityLabel ?? null,
    p_priority_score: input.priorityScore ?? null,
    p_priority_method_note: input.priorityMethodNote ?? null,
    p_owner_position_id: input.ownerPositionId ?? null,
    p_effective_from: input.effectiveFrom ?? null,
  });
  if (error || !data) return fail(mapDbError(error) ?? "assessment_superseded");
  void orgId;
  return done(data as string);
}

// ===========================================================================
// REQUISITO → PROCESO · la primera relación central
// ---------------------------------------------------------------------------
// Tiene tabla propia, no `work_references`, porque tiene periodo de validez y
// forma de vínculo. Desvincular CIERRA la vigencia: la pregunta de auditoría
// no es «qué procesos atienden esto», es «qué procesos lo atendían en marzo».
// ===========================================================================

export async function listRequirementProcesses(
  orgId: string, requirementIds: string[],
  opts: { asOf?: string; includeEnded?: boolean } = {}, client?: Db
): Promise<RequirementProcessRow[]> {
  if (requirementIds.length === 0) return [];
  const supabase = await db(client);
  const rows = await readAllStrict<Record<string, unknown>>(() => {
    let q = supabase
      .from("quality_stakeholder_requirement_processes")
      .select("id, requirement_id, process_id, process_revision_id, link_kind, note, effective_from, effective_to")
      .eq("organization_id", orgId).in("requirement_id", requirementIds);
    if (opts.asOf) {
      q = q.lte("effective_from", opts.asOf).or(`effective_to.is.null,effective_to.gt.${opts.asOf}`);
    } else if (!opts.includeEnded) {
      q = q.is("effective_to", null);
    }
    return q.order("effective_from", { ascending: false }).order("id") as never;
  }, "vinculos de requisito con procesos");

  const procIds = [...new Set(rows.map((r) => r.process_id as string))];
  const nombres = new Map<string, string>();
  if (procIds.length > 0) {
    const { data: procs } = await supabase
      .from("quality_processes").select("id, name")
      .eq("organization_id", orgId).in("id", procIds);
    for (const p of procs ?? []) nombres.set(p.id as string, p.name as string);
  }
  return rows.map((r) => ({
    id: r.id as string,
    requirementId: r.requirement_id as string,
    processId: r.process_id as string,
    processName: nombres.get(r.process_id as string) ?? null,
    processRevisionId: (r.process_revision_id as string | null) ?? null,
    linkKind: r.link_kind as LinkKind,
    note: (r.note as string | null) ?? null,
    effectiveFrom: r.effective_from as string,
    effectiveTo: (r.effective_to as string | null) ?? null,
  }));
}

export async function attachRequirementToProcess(
  orgId: string,
  input: {
    requirementId: string; processId: string; linkKind?: LinkKind;
    processRevisionId?: string | null; note?: string | null; effectiveFrom?: string;
  },
  client?: Db
): Promise<DomainResult<string>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_requirement_processes")
    .insert({
      organization_id: orgId,
      requirement_id: input.requirementId,
      process_id: input.processId,
      process_revision_id: input.processRevisionId ?? null,
      link_kind: input.linkKind ?? "addressed_by",
      note: input.note ?? null,
      ...(input.effectiveFrom ? { effective_from: input.effectiveFrom } : {}),
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "requirement_process_mismatch");
  await emitRequirementChanged(orgId, input.requirementId, "process_attached", client);
  return done(data.id as string);
}

/** Desvincular no borra: cierra. La fila sigue contando lo que hubo. */
export async function detachRequirementFromProcess(
  orgId: string, linkId: string, onDate: string | null, client?: Db
): Promise<DomainResult<true>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_requirement_processes")
    .update({ effective_to: onDate ?? today() })
    .eq("organization_id", orgId).eq("id", linkId).is("effective_to", null)
    .select("id, requirement_id");
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  const fila = (data ?? [])[0];
  if (!fila) return fail("historical_record_immutable");
  await emitRequirementChanged(orgId, fila.requirement_id as string, "process_detached", client);
  return done(true);
}

// ===========================================================================
// ESTRATEGIA → REQUISITO · la segunda relación central
// ---------------------------------------------------------------------------
// También tabla propia, y por la misma razón: una estrategia atiende 0..N
// requisitos, la cobertura puede ser parcial —de ahí `coverage_note`— y el
// vínculo empieza y acaba en fechas. `work_references` no tiene periodo de
// validez; meterlo ahí habría ahorrado una tabla a cambio de perder el «desde
// cuándo», que es justo lo que se pregunta en la revisión.
// ===========================================================================

const STRATEGY_COLUMNS =
  "id, assessment_id, title, purpose, approach, owner_position_id, monitoring_method, " +
  "monitoring_note, review_cadence_months, next_review_on, last_reviewed_on, status, " +
  "effective_from, effective_to";

export async function listStrategies(
  orgId: string, assessmentId: string,
  opts: { asOf?: string; includeEnded?: boolean } = {}, client?: Db
): Promise<StrategyRow[]> {
  const supabase = await db(client);
  const rows = await readAllStrict<Record<string, unknown>>(() => {
    let q = supabase
      .from("quality_stakeholder_strategies")
      .select(STRATEGY_COLUMNS)
      .eq("organization_id", orgId).eq("assessment_id", assessmentId);
    if (opts.asOf) {
      q = q.lte("effective_from", opts.asOf).or(`effective_to.is.null,effective_to.gt.${opts.asOf}`);
    } else if (!opts.includeEnded) {
      q = q.is("effective_to", null);
    }
    return q.order("effective_from", { ascending: false }).order("id") as never;
  }, "estrategias de relacionamiento");
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const posIds = [...new Set(rows.map((r) => r.owner_position_id as string | null).filter(Boolean))] as string[];

  const [vinculos, puestos] = await Promise.all([
    supabase.from("quality_stakeholder_strategy_requirements")
      .select("id, strategy_id, requirement_id, effective_to")
      .eq("organization_id", orgId).in("strategy_id", ids),
    posIds.length === 0
      ? Promise.resolve({ data: [] as { id: string; name: string }[] })
      : supabase.from("quality_positions").select("id, name")
          .eq("organization_id", orgId).in("id", posIds),
  ]);

  const porEstrategia = new Map<string, { linkId: string; requirementId: string }[]>();
  for (const v of vinculos.data ?? []) {
    const vigente = opts.asOf
      ? (v.effective_to === null || (v.effective_to as string) > opts.asOf)
      : v.effective_to === null;
    if (!vigente && !opts.includeEnded) continue;
    const lista = porEstrategia.get(v.strategy_id as string) ?? [];
    lista.push({ linkId: v.id as string, requirementId: v.requirement_id as string });
    porEstrategia.set(v.strategy_id as string, lista);
  }
  const nombrePuesto = new Map((puestos.data ?? []).map((p) => [p.id as string, p.name as string]));

  return rows.map((r) => ({
    id: r.id as string,
    assessmentId: r.assessment_id as string,
    title: r.title as string,
    purpose: (r.purpose as string | null) ?? null,
    approach: (r.approach as string | null) ?? null,
    ownerPositionId: (r.owner_position_id as string | null) ?? null,
    ownerPositionName: nombrePuesto.get(r.owner_position_id as string) ?? null,
    monitoringMethod: (r.monitoring_method as string | null) ?? null,
    monitoringNote: (r.monitoring_note as string | null) ?? null,
    reviewCadenceMonths: num(r.review_cadence_months),
    nextReviewOn: (r.next_review_on as string | null) ?? null,
    lastReviewedOn: (r.last_reviewed_on as string | null) ?? null,
    status: r.status as string,
    effectiveFrom: r.effective_from as string,
    effectiveTo: (r.effective_to as string | null) ?? null,
    requirementIds: (porEstrategia.get(r.id as string) ?? []).map((v) => v.requirementId),
    requirementLinks: porEstrategia.get(r.id as string) ?? [],
    reviewState: reviewState({
      lastReviewedOn: (r.last_reviewed_on as string | null) ?? null,
      nextReviewOn: (r.next_review_on as string | null) ?? null,
      cadenceMonths: num(r.review_cadence_months),
      onDate: opts.asOf,
    }),
  }));
}

export async function createStrategy(
  orgId: string,
  input: {
    assessmentId: string; title: string; purpose?: string | null; approach?: string | null;
    ownerPositionId?: string | null; monitoringMethod?: string | null;
    monitoringNote?: string | null; reviewCadenceMonths?: number | null;
    nextReviewOn?: string | null; status?: string; requirementIds?: string[];
  },
  client?: Db
): Promise<DomainResult<string>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_strategies")
    .insert({
      organization_id: orgId,
      assessment_id: input.assessmentId,
      title: input.title,
      purpose: input.purpose ?? null,
      approach: input.approach ?? null,
      owner_position_id: input.ownerPositionId ?? null,
      monitoring_method: input.monitoringMethod ?? null,
      monitoring_note: input.monitoringNote ?? null,
      review_cadence_months: input.reviewCadenceMonths ?? null,
      next_review_on: input.nextReviewOn ?? null,
      status: input.status ?? "draft",
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "strategy_owner_invalid");
  const id = data.id as string;

  for (const requirementId of input.requirementIds ?? []) {
    const res = await attachStrategyRequirement(orgId, { strategyId: id, requirementId }, client);
    // Un requisito de otro análisis lo rechaza el guardián de 0149. La
    // estrategia ya existe y se conserva: se informa del vínculo que no entró
    // en vez de deshacer lo que sí es válido.
    if (!res.ok) return res as DomainResult<string>;
  }
  await emitStrategyChanged(orgId, id, "created", client);
  return done(id);
}

export async function updateStrategy(
  orgId: string, strategyId: string,
  patch: {
    title?: string; purpose?: string | null; approach?: string | null;
    ownerPositionId?: string | null; monitoringMethod?: string | null;
    monitoringNote?: string | null; reviewCadenceMonths?: number | null;
    nextReviewOn?: string | null;
  },
  client?: Db
): Promise<DomainResult<true>> {
  const supabase = await db(client);
  const campos: Record<string, unknown> = {};
  if (patch.title !== undefined) campos.title = patch.title;
  if (patch.purpose !== undefined) campos.purpose = patch.purpose;
  if (patch.approach !== undefined) campos.approach = patch.approach;
  if (patch.ownerPositionId !== undefined) campos.owner_position_id = patch.ownerPositionId;
  if (patch.monitoringMethod !== undefined) campos.monitoring_method = patch.monitoringMethod;
  if (patch.monitoringNote !== undefined) campos.monitoring_note = patch.monitoringNote;
  if (patch.reviewCadenceMonths !== undefined) campos.review_cadence_months = patch.reviewCadenceMonths;
  if (patch.nextReviewOn !== undefined) campos.next_review_on = patch.nextReviewOn;
  if (Object.keys(campos).length === 0) return done(true);

  // `is("effective_to", null)`: una estrategia ya cerrada no se reescribe. El
  // guardián de historia de 0149 lo impide igualmente; esto lo dice antes y
  // con un mensaje que se entiende.
  const { data, error } = await supabase
    .from("quality_stakeholder_strategies")
    .update(campos)
    .eq("organization_id", orgId).eq("id", strategyId).is("effective_to", null)
    .select("id");
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  if ((data ?? []).length === 0) return fail("historical_record_immutable");
  await emitStrategyChanged(orgId, strategyId, "updated", client);
  return done(true);
}

export async function setStrategyStatus(
  orgId: string, strategyId: string, status: "draft" | "active" | "cancelled",
  client?: Db
): Promise<DomainResult<true>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_strategies")
    .update({
      status,
      // Cancelar cierra la vigencia el mismo día: una estrategia cancelada que
      // siguiera «vigente» aparecería en la revisión como pendiente de seguir.
      ...(status === "cancelled" ? { effective_to: today() } : {}),
    })
    .eq("organization_id", orgId).eq("id", strategyId).is("effective_to", null)
    .select("id");
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  if ((data ?? []).length === 0) return fail("historical_record_immutable");
  await emitStrategyChanged(orgId, strategyId, `status:${status}`, client);
  return done(true);
}

export async function attachStrategyRequirement(
  orgId: string,
  input: { strategyId: string; requirementId: string; coverageNote?: string | null; effectiveFrom?: string },
  client?: Db
): Promise<DomainResult<string>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_strategy_requirements")
    .insert({
      organization_id: orgId,
      strategy_id: input.strategyId,
      requirement_id: input.requirementId,
      coverage_note: input.coverageNote ?? null,
      ...(input.effectiveFrom ? { effective_from: input.effectiveFrom } : {}),
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "strategy_requirement_mismatch");
  return done(data.id as string);
}

export async function detachStrategyRequirement(
  orgId: string, linkId: string, onDate: string | null, client?: Db
): Promise<DomainResult<true>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_stakeholder_strategy_requirements")
    .update({ effective_to: onDate ?? today() })
    .eq("organization_id", orgId).eq("id", linkId).is("effective_to", null)
    .select("id, strategy_id");
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  const fila = (data ?? [])[0];
  if (!fila) return fail("historical_record_immutable");
  await emitStrategyChanged(orgId, fila.strategy_id as string, "requirement_detached", client);
  return done(true);
}

// ===========================================================================
// REVISIONES
// ---------------------------------------------------------------------------
// Solo se añaden. No hay editar ni borrar: una revisión es un acta, y un acta
// que se puede reescribir no sirve para lo único que sirve un acta.
//
// PI-29: la revisión que concluye «no hay cambios» TAMBIÉN se registra. Sin
// ella, un análisis de hace dos años y uno revisado el mes pasado sin cambios
// se ven idénticos, y son cosas muy distintas.
// ===========================================================================

export async function listReviews(
  orgId: string,
  filtro: { assessmentId?: string; strategyId?: string; from?: string; to?: string } = {},
  client?: Db
): Promise<ReviewRow[]> {
  const supabase = await db(client);
  let q = supabase
    .from("quality_stakeholder_reviews")
    .select("id, assessment_id, strategy_id, reviewed_on, verdict, note, next_review_on")
    .eq("organization_id", orgId);
  if (filtro.assessmentId) q = q.eq("assessment_id", filtro.assessmentId);
  if (filtro.strategyId) q = q.eq("strategy_id", filtro.strategyId);
  if (filtro.from) q = q.gte("reviewed_on", filtro.from);
  if (filtro.to) q = q.lte("reviewed_on", filtro.to);
  const { data } = await q.order("reviewed_on", { ascending: false }).limit(200);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    assessmentId: (r.assessment_id as string | null) ?? null,
    strategyId: (r.strategy_id as string | null) ?? null,
    reviewedOn: r.reviewed_on as string,
    verdict: r.verdict as string,
    note: (r.note as string | null) ?? null,
    nextReviewOn: (r.next_review_on as string | null) ?? null,
  }));
}

export async function recordReview(
  orgId: string,
  input: {
    assessmentId?: string | null; strategyId?: string | null;
    verdict: string; note?: string | null; nextReviewOn?: string | null;
    ownerPositionId?: string | null; reviewedOn?: string | null;
  },
  client?: Db
): Promise<DomainResult<string>> {
  if (!input.assessmentId && !input.strategyId) return fail("review_target_required");
  const supabase = await db(client);
  const { data, error } = await supabase.rpc("quality_record_stakeholder_review", {
    p_assessment_id: input.assessmentId ?? null,
    p_strategy_id: input.strategyId ?? null,
    p_verdict: input.verdict,
    p_note: input.note ?? null,
    p_next_review_on: input.nextReviewOn ?? null,
    p_owner_position_id: input.ownerPositionId ?? null,
    p_reviewed_on: input.reviewedOn ?? null,
  });
  if (error || !data) return fail(mapDbError(error) ?? "review_target_required");
  void orgId;
  return done(data as string);
}

// ===========================================================================
// LO PERIFÉRICO · work_references
// ---------------------------------------------------------------------------
// Aquí va todo lo demás: el objetivo que responde a un requisito, el riesgo
// que nace de una parte interesada, la campaña que la escuchó, la evaluación
// de proveedor que respalda el cumplimiento, el documento que lo prueba.
//
// LA REGLA QUE SEPARA LAS DOS TABLAS DE ARRIBA DE ESTA
//
//   Si la relación tiene VIGENCIA PROPIA y forma parte de lo que se audita
//   —«qué procesos atendían esto en marzo»— tiene tabla propia.
//   Si es un enlace de contexto —«esto también viene al caso»— va aquí.
//
// `work_references` no tiene periodo de validez, y esa ausencia es su diseño,
// no una carencia: meter ahí requisito→proceso habría ahorrado una tabla a
// cambio de no poder responder la pregunta de la auditoría.
// ===========================================================================

export type StakeholderOwnerKind =
  | "stakeholder_assessment" | "stakeholder_requirement"
  | "stakeholder_strategy" | "stakeholder_review";

export type PeripheralRef = {
  id: string;
  refKind: string;
  refId: string;
  relation: "origin" | "evidence" | "related";
  note: string | null;
  snapshot: Record<string, unknown> | null;
};

export async function listPeripheralRefs(
  orgId: string, ownerKind: StakeholderOwnerKind, ownerId: string, client?: Db
): Promise<PeripheralRef[]> {
  const supabase = await db(client);
  const data = await readAllStrict<Record<string, unknown>>(() =>
    supabase
      .from("work_references").select("id, ref_kind, ref_id, relation, note, snapshot")
      .eq("organization_id", orgId).eq("owner_kind", ownerKind).eq("owner_id", ownerId)
      .order("created_at", { ascending: true }).order("id") as never,
    "enlaces de la parte interesada");
  return data.map((r) => ({
    id: r.id as string,
    refKind: r.ref_kind as string,
    refId: r.ref_id as string,
    relation: r.relation as "origin" | "evidence" | "related",
    note: (r.note as string | null) ?? null,
    snapshot: (r.snapshot as Record<string, unknown> | null) ?? null,
  }));
}

/**
 * Enlazar algo periférico.
 *
 * La existencia y la empresa del destino las comprueba el disparador
 * `work_reference_must_be_valid` de la base, ampliado en 0150. No se replica
 * aquí: dos validaciones de lo mismo divergen, y la que manda es la que no se
 * puede saltar.
 */
export async function linkPeripheral(
  orgId: string,
  input: {
    ownerKind: StakeholderOwnerKind; ownerId: string;
    refKind: string; refId: string;
    relation?: "origin" | "evidence" | "related";
    note?: string | null; snapshot?: Record<string, unknown> | null;
  },
  client?: Db
): Promise<DomainResult<string>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("work_references")
    .insert({
      organization_id: orgId,
      owner_kind: input.ownerKind, owner_id: input.ownerId,
      ref_kind: input.refKind, ref_id: input.refId,
      relation: input.relation ?? "related",
      note: input.note ?? null,
      snapshot: input.snapshot ?? null,
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "cross_tenant_reference");
  return done(data.id as string);
}

export async function unlinkPeripheral(
  orgId: string, referenceId: string, client?: Db
): Promise<DomainResult<true>> {
  const supabase = await db(client);
  const { error } = await supabase
    .from("work_references").delete()
    .eq("organization_id", orgId).eq("id", referenceId);
  if (error) return fail(mapDbError(error) ?? "permission_denied");
  return done(true);
}

// ===========================================================================
// REUTILIZAR IDENTIDADES · leer, nunca copiar
// ---------------------------------------------------------------------------
// Un cliente que además es parte interesada NO se duplica. La ficha de partes
// interesadas apunta a `quality_external_parties`, y estas dos funciones
// traen, SOLO PARA MOSTRAR, lo que los otros módulos ya saben de esa misma
// identidad.
//
// Devuelven identificadores y hechos, no textos ni contactos: la ficha enlaza
// a Voz del cliente o a Proveedores, no reimplementa ninguna de las dos.
// ===========================================================================

export type CustomerReuse = {
  customerProfileId: string;
  relationshipStatus: string;
  segment: string | null;
  openFeedback: number;
  lastFeedbackOn: string | null;
};

export async function customerViewOf(
  orgId: string, externalPartyId: string, client?: Db
): Promise<CustomerReuse | null> {
  const supabase = await db(client);
  const { data: perfil } = await supabase
    .from("quality_customer_profiles")
    .select("id, relationship_status, segment")
    .eq("organization_id", orgId).eq("party_id", externalPartyId).maybeSingle();
  if (!perfil) return null;

  const [abiertos, ultimo] = await Promise.all([
    supabase.from("quality_customer_feedback")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId).eq("customer_id", perfil.id)
      .in("status", ["open", "under_review"]),
    supabase.from("quality_customer_feedback")
      .select("received_on")
      .eq("organization_id", orgId).eq("customer_id", perfil.id)
      .order("received_on", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    customerProfileId: perfil.id as string,
    relationshipStatus: perfil.relationship_status as string,
    segment: (perfil.segment as string | null) ?? null,
    openFeedback: abiertos.count ?? 0,
    lastFeedbackOn: (ultimo.data?.received_on as string | null) ?? null,
  };
}

export type SupplierReuse = {
  supplierProfileId: string;
  relationshipStatus: string;
  lastEvaluatedOn: string | null;
  nextReviewOn: string | null;
  lastResultBand: string | null;
};

export async function supplierViewOf(
  orgId: string, externalPartyId: string, client?: Db
): Promise<SupplierReuse | null> {
  const supabase = await db(client);
  const { data: perfil } = await supabase
    .from("quality_supplier_profiles")
    .select("id, relationship_status, last_evaluated_on, next_review_on")
    .eq("organization_id", orgId).eq("party_id", externalPartyId).maybeSingle();
  if (!perfil) return null;

  // El alcance es el que cuelga del perfil; la evaluación cuelga del alcance.
  // Dos saltos, porque un proveedor puede estar evaluado para una cosa y no
  // para otra, y decir «evaluado» a secas sería falso.
  const { data: alcances } = await supabase
    .from("quality_supplier_scopes").select("id")
    .eq("organization_id", orgId).eq("profile_id", perfil.id);
  const scopeIds = (alcances ?? []).map((s) => s.id as string);

  let band: string | null = null;
  if (scopeIds.length > 0) {
    const { data: ev } = await supabase
      .from("quality_supplier_evaluations").select("result_band, evaluated_on")
      .eq("organization_id", orgId).in("scope_id", scopeIds)
      .eq("status", "closed")
      .order("evaluated_on", { ascending: false }).limit(1).maybeSingle();
    band = (ev?.result_band as string | null) ?? null;
  }

  return {
    supplierProfileId: perfil.id as string,
    relationshipStatus: perfil.relationship_status as string,
    lastEvaluatedOn: (perfil.last_evaluated_on as string | null) ?? null,
    nextReviewOn: (perfil.next_review_on as string | null) ?? null,
    lastResultBand: band,
  };
}

// ===========================================================================
// EL RESUMEN
// ---------------------------------------------------------------------------
// Cuenta con `head: true` y `count: 'exact'`: la base cuenta y no manda las
// filas. Traerlas para hacer `.length` es lo que convierte un contador en una
// descarga de la tabla entera el día que la tabla crece.
// ===========================================================================

export type InterestedPartiesSummary = {
  current: number;
  relevant: number;
  notRelevant: number;
  underReview: number;
  requirements: number;
  strategiesActive: number;
  strategiesOverdue: number;
  neverReviewed: number;
  /** Pertinentes sin ninguna estrategia vigente. El hueco real del 4.2: la
   *  parte importa y nadie ha decidido qué se hace con ella. */
  relevantWithoutStrategy: number;
};

export async function getSummary(
  orgId: string, onDate?: string, client?: Db
): Promise<InterestedPartiesSummary> {
  const supabase = await db(client);
  const hoy = onDate ?? today();
  const vigente = <T extends { lte: (c: string, v: string) => T; or: (f: string) => T }>(q: T) =>
    q.lte("effective_from", hoy).or(`effective_to.is.null,effective_to.gt.${hoy}`);

  const cuenta = (tabla: string) =>
    supabase.from(tabla).select("id", { count: "exact", head: true }).eq("organization_id", orgId);

  const [total, pertinentes, noPertinentes, enEvaluacion,
         requisitos, estrategias, vencidas, sinRevisar] =
    await Promise.all([
      vigente(cuenta("quality_stakeholder_assessments")),
      vigente(cuenta("quality_stakeholder_assessments").eq("relevance_status", "relevant")),
      vigente(cuenta("quality_stakeholder_assessments").eq("relevance_status", "not_relevant")),
      vigente(cuenta("quality_stakeholder_assessments").eq("relevance_status", "under_review")),
      vigente(cuenta("quality_stakeholder_requirements").eq("entry_kind", "requirement")),
      vigente(cuenta("quality_stakeholder_strategies").eq("status", "active")),
      vigente(cuenta("quality_stakeholder_strategies").eq("status", "active"))
        .lt("next_review_on", hoy),
      vigente(cuenta("quality_stakeholder_strategies").eq("status", "active"))
        .is("last_reviewed_on", null),
    ]);

  return {
    current: total.count ?? 0,
    relevant: pertinentes.count ?? 0,
    notRelevant: noPertinentes.count ?? 0,
    underReview: enEvaluacion.count ?? 0,
    requirements: requisitos.count ?? 0,
    strategiesActive: estrategias.count ?? 0,
    strategiesOverdue: vencidas.count ?? 0,
    neverReviewed: sinRevisar.count ?? 0,
    relevantWithoutStrategy: await relevantWithoutStrategy(orgId, hoy, supabase),
  };
}

/**
 * Pertinentes sin estrategia vigente.
 *
 * No hay forma de contar esto con un `count` de PostgREST: es una diferencia
 * de conjuntos entre dos tablas, y PostgREST no hace `not exists`. Se
 * resuelve leyendo SOLO los identificadores —dos columnas, sin datos— y
 * restando en memoria.
 *
 * La alternativa era una vista, y una vista es una migración. Añadir esquema
 * para una tarjeta del resumen sería mover la base por comodidad de una
 * pantalla; si el día de mañana esta cifra pesa, esa es la conversación que
 * habrá que tener, con medidas delante.
 *
 * `readAllStrict` y no una consulta suelta: contar mil de mil doscientas y
 * enseñarlo como el total sería peor que no enseñar la tarjeta.
 */
async function relevantWithoutStrategy(
  orgId: string, hoy: string, supabase: Db
): Promise<number> {
  const pertinentes = await readAllStrict<{ id: string }>(() =>
    supabase.from("quality_stakeholder_assessments").select("id")
      .eq("organization_id", orgId).eq("relevance_status", "relevant")
      .lte("effective_from", hoy).or(`effective_to.is.null,effective_to.gt.${hoy}`)
      .order("id") as never,
    "analisis pertinentes vigentes");
  if (pertinentes.length === 0) return 0;

  const conEstrategia = await readAllStrict<{ assessment_id: string }>(() =>
    supabase.from("quality_stakeholder_strategies").select("assessment_id")
      .eq("organization_id", orgId).eq("status", "active")
      .lte("effective_from", hoy).or(`effective_to.is.null,effective_to.gt.${hoy}`)
      .order("assessment_id").order("id") as never,
    "estrategias vigentes");
  const cubiertos = new Set(conEstrategia.map((r) => r.assessment_id));
  return pertinentes.filter((a) => !cubiertos.has(a.id)).length;
}

// ===========================================================================
// REVISIÓN POR LA DIRECCIÓN
// ---------------------------------------------------------------------------
// La entrada la construye `quality_mr_src_interested_parties` en la base, y se
// pide por el despachador de 0128 igual que las catorce anteriores. Esta
// función NO recalcula nada: pregunta.
//
// Sin informe paralelo. Si el retrato se armara aquí, una revisión preparada
// hace seis meses y reabierta hoy enseñaría números de hoy, y eso es
// falsificar un acta.
// ===========================================================================

export async function buildManagementReviewInput(
  orgId: string, from: string, to: string, client?: Db
): Promise<Record<string, unknown> | null> {
  const supabase = await db(client);
  // `p_code`, no `p_source_domain`: el despachador de 0128 conmuta por el
  // CÓDIGO de la entrada del catálogo. El dominio existe para saber a qué
  // familia pertenece, no para elegir el constructor.
  const { data, error } = await supabase.rpc("quality_mr_source_payload", {
    p_organization_id: orgId,
    p_code: "interested_parties",
    p_from: from,
    p_to: to,
  });
  if (error) return null;
  return (data as Record<string, unknown> | null) ?? null;
}

// ===========================================================================
// INTELLIGENCE · lo que se le puede contar y lo que no
// ---------------------------------------------------------------------------
// Estos cargadores NO llaman a ningún proveedor. Preparan datos estructurados
// con su procedencia, y quien decida usarlos pasará por la puerta de 12.2 con
// sus límites y su registro.
//
// LA REGLA DE PRIVACIDAD, QUE ESTÁ ESCRITA EN EL CATÁLOGO Y SE CUMPLE AQUÍ
//
// Las dos fuentes de 0150 son `privacy_class = 'open'`, y lo son PORQUE lo que
// devuelven no lleva personas: la parte interesada se cita por su nombre
// comercial, el responsable por su CARGO. Ni correos, ni teléfonos, ni
// contactos, ni quién firmó. Una fuente «abierta» que colara un contacto
// dejaría de serlo sin que el catálogo se enterara.
//
// Y cada elemento lleva su identificador. Una respuesta que afirma sin poder
// señalar la fila de la que salió no se puede comprobar, y una afirmación que
// no se puede comprobar no vale para una auditoría.
// ===========================================================================

export type IntelligenceItem = {
  id: string;
  kind: "assessment" | "strategy";
  label: string;
  facts: Record<string, unknown>;
};

/**
 * Contexto de partes interesadas para Intelligence.
 *
 * `asOf` no es decorativo: las dos fuentes se registraron con
 * `historical_mode = 'as_of'`, así que preguntar por marzo tiene que devolver
 * lo vigente en marzo. Devolver lo de hoy con fecha de marzo sería la peor
 * respuesta posible: convincente y falsa.
 *
 * Corre bajo la sesión de quien pregunta. Si su rol no alcanza, la RLS
 * devuelve menos filas y el contexto sale más corto — que es lo correcto: el
 * contexto no puede enseñar más de lo que esa persona vería en pantalla.
 */
export async function loadIntelligenceContext(
  orgId: string, opts: { asOf?: string; limit?: number } = {}, client?: Db
): Promise<IntelligenceItem[]> {
  const supabase = await db(client);
  const hoy = opts.asOf ?? today();
  const tope = Math.min(opts.limit ?? 60, 200);

  const { data: analisis } = await supabase
    .from("quality_stakeholder_assessments")
    .select(ASSESSMENT_COLUMNS)
    .eq("organization_id", orgId)
    .eq("relevance_status", "relevant")
    .lte("effective_from", hoy).or(`effective_to.is.null,effective_to.gt.${hoy}`)
    .order("assessed_on", { ascending: false })
    .limit(tope);

  const filas = await mapAssessments(
    orgId, (analisis ?? []) as unknown as Record<string, unknown>[], client);
  if (filas.length === 0) return [];

  const ids = filas.map((a) => a.id);
  const [requisitos, estrategias] = await Promise.all([
    supabase.from("quality_stakeholder_requirements")
      .select("id, assessment_id, entry_kind, requirement_kind, title")
      .eq("organization_id", orgId).in("assessment_id", ids)
      .lte("effective_from", hoy).or(`effective_to.is.null,effective_to.gt.${hoy}`),
    supabase.from("quality_stakeholder_strategies")
      .select("id, assessment_id, title, monitoring_method, status, last_reviewed_on, next_review_on")
      .eq("organization_id", orgId).in("assessment_id", ids)
      .lte("effective_from", hoy).or(`effective_to.is.null,effective_to.gt.${hoy}`),
  ]);

  const porAnalisis = new Map<string, Record<string, unknown>[]>();
  for (const r of requisitos.data ?? []) {
    const lista = porAnalisis.get(r.assessment_id as string) ?? [];
    lista.push({ id: r.id, kind: r.entry_kind, subtype: r.requirement_kind, title: r.title });
    porAnalisis.set(r.assessment_id as string, lista);
  }

  const items: IntelligenceItem[] = filas.map((a) => ({
    id: a.id,
    kind: "assessment",
    label: a.subjectLabel,
    facts: {
      // Nombre comercial y categoría. Nada de contactos: ver la nota de arriba.
      category: a.categoryName,
      assessed_on: a.assessedOn,
      relevance: a.relevanceStatus,
      priority: a.priorityLabel,
      summary: a.summary,
      entries: porAnalisis.get(a.id) ?? [],
    },
  }));

  const etiqueta = new Map(filas.map((a) => [a.id, a.subjectLabel]));
  for (const e of estrategias.data ?? []) {
    items.push({
      id: e.id as string,
      kind: "strategy",
      label: e.title as string,
      facts: {
        stakeholder: etiqueta.get(e.assessment_id as string) ?? null,
        // El CARGO responsable no se incluye por id de persona porque no lo
        // hay: la tabla guarda el puesto, no a quien lo ocupa.
        monitoring: e.monitoring_method,
        status: e.status,
        last_reviewed_on: e.last_reviewed_on,
        next_review_on: e.next_review_on,
        review_state: reviewState({
          lastReviewedOn: (e.last_reviewed_on as string | null) ?? null,
          nextReviewOn: (e.next_review_on as string | null) ?? null,
          cadenceMonths: null,
          onDate: opts.asOf,
        }),
      },
    });
  }
  return items;
}

// ===========================================================================
// QUALITY-12.3B3A · LO QUE NECESITAN LOS SELECTORES DE LA PANTALLA
// ---------------------------------------------------------------------------
// Tres lecturas más, todas acotadas. Están aquí y no en un componente porque
// un `select` que consulta la base desde React sería exactamente la segunda
// arquitectura que este sprint no quiere.
// ===========================================================================

export type ExternalPartyOption = {
  id: string;
  label: string;
  legalName: string;
  isSupplier: boolean;
  isCustomer: boolean;
  hasAssessment: boolean;
};

/**
 * Buscar una entidad externa YA EXISTENTE.
 *
 * La identidad no se duplica: se elige. Y se devuelve si ya es proveedor o
 * cliente para que la pantalla lo diga —«esta empresa ya está en
 * Proveedores»— en vez de dejar que alguien la registre dos veces creyendo que
 * no estaba.
 *
 * `hasAssessment` marca las que ya tienen análisis vigente: el índice único de
 * 0149 rechazaría el segundo, y es mejor avisar antes que fallar después.
 */
export async function searchExternalParties(
  orgId: string, q: string, limit = 20, client?: Db
): Promise<ExternalPartyOption[]> {
  const supabase = await db(client);
  const term = sanitizeSearchTerm(q);
  let query = supabase
    .from("quality_external_parties")
    .select("id, legal_name, trade_name")
    .eq("organization_id", orgId);
  if (term) query = query.or(`legal_name.ilike.%${term}%,trade_name.ilike.%${term}%`);
  const { data } = await query.order("legal_name").limit(Math.min(limit, 50));
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const [prov, cli, vigentes] = await Promise.all([
    supabase.from("quality_supplier_profiles").select("party_id")
      .eq("organization_id", orgId).in("party_id", ids),
    supabase.from("quality_customer_profiles").select("party_id")
      .eq("organization_id", orgId).in("party_id", ids),
    supabase.from("quality_stakeholder_assessments").select("external_party_id")
      .eq("organization_id", orgId).in("external_party_id", ids).is("effective_to", null),
  ]);
  const esProv = new Set((prov.data ?? []).map((r) => r.party_id as string));
  const esCli = new Set((cli.data ?? []).map((r) => r.party_id as string));
  const conAnalisis = new Set((vigentes.data ?? []).map((r) => r.external_party_id as string));

  return rows.map((r) => {
    const comercial = (r.trade_name as string | null)?.trim();
    return {
      id: r.id as string,
      label: comercial && comercial.length > 0 ? comercial : (r.legal_name as string),
      legalName: r.legal_name as string,
      isSupplier: esProv.has(r.id as string),
      isCustomer: esCli.has(r.id as string),
      hasAssessment: conAnalisis.has(r.id as string),
    };
  });
}

/**
 * Registrar una identidad externa que todavía no existe en ningún módulo.
 *
 * Escribe en `quality_external_parties`, que es LA tabla de identidad desde
 * GP-02: no se crea una tabla paralela ni una ficha local. Lo que no hace es
 * darle un papel comercial —ni proveedor ni cliente—, porque un ente regulador
 * o una comunidad vecina no son ninguna de las dos cosas, y forzarlas por el
 * alta de Proveedores les colgaría una ficha que nadie va a evaluar.
 *
 * Cuando SÍ es un cliente o un proveedor, la pantalla dice que se dé de alta
 * en su módulo, para que nazca con la ficha que allí le corresponde.
 */
export async function createExternalParty(
  orgId: string,
  input: { legalName: string; tradeName?: string | null; taxId?: string | null;
           country?: string | null; city?: string | null },
  client?: Db
): Promise<DomainResult<string>> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("quality_external_parties")
    .insert({
      organization_id: orgId,
      legal_name: input.legalName,
      trade_name: input.tradeName ?? null,
      tax_id: input.taxId ?? null,
      country: input.country ?? null,
      city: input.city ?? null,
    })
    .select("id").single();
  if (error || !data) return fail(mapDbError(error) ?? "permission_denied");
  return done(data.id as string);
}

/**
 * El nombre de lo que se referenció.
 *
 * `work_references` guarda un tipo y un identificador, y enseñar un UUID en
 * pantalla es no enseñar nada. Esto resuelve el nombre por tipo, en una
 * consulta por tipo presente —no una por fila—, y lo que no sepa resolver lo
 * deja sin nombre en vez de inventarlo.
 */
const PERIPHERAL_SOURCE: Record<PeripheralRefKind, { table: string; column: string }> = {
  quality_indicator: { table: "quality_indicators", column: "name" },
  quality_objective: { table: "quality_objectives", column: "name" },
  quality_risk: { table: "quality_risks", column: "title" },
  quality_opportunity: { table: "quality_opportunities", column: "title" },
  work_case: { table: "work_cases", column: "title" },
  work_action: { table: "work_actions", column: "title" },
  trazadoc_document: { table: "trazadoc_documents", column: "title" },
  quality_survey_campaign: { table: "quality_survey_campaigns", column: "name" },
  quality_supplier_evaluation: { table: "quality_supplier_evaluations", column: "period_label" },
  quality_customer_feedback: { table: "quality_customer_feedback", column: "title" },
};

export async function resolvePeripheralLabels(
  orgId: string, refs: { refKind: string; refId: string }[], client?: Db
): Promise<Map<string, string>> {
  const supabase = await db(client);
  const mapa = new Map<string, string>();
  const porTipo = new Map<string, string[]>();
  for (const r of refs) {
    if (!(PERIPHERAL_REF_KINDS as readonly string[]).includes(r.refKind)) continue;
    const lista = porTipo.get(r.refKind) ?? [];
    lista.push(r.refId);
    porTipo.set(r.refKind, lista);
  }
  await Promise.all([...porTipo.entries()].map(async ([kind, ids]) => {
    const fuente = PERIPHERAL_SOURCE[kind as PeripheralRefKind];
    const { data } = await supabase
      .from(fuente.table).select(`id, ${fuente.column}`)
      .eq("organization_id", orgId).in("id", [...new Set(ids)]);
    for (const fila of (data ?? []) as unknown as Record<string, unknown>[]) {
      const nombre = fila[fuente.column];
      if (typeof nombre === "string") mapa.set(`${kind}:${fila.id as string}`, nombre);
    }
  }));
  return mapa;
}

/** Las opciones de un tipo periférico, acotadas, para el selector de
 *  «Relacionar». Sin recorrer la tabla entera: veinte y a buscar. */
export async function searchPeripheralOptions(
  orgId: string, refKind: PeripheralRefKind, q: string, limit = 20, client?: Db
): Promise<{ id: string; label: string }[]> {
  const supabase = await db(client);
  const fuente = PERIPHERAL_SOURCE[refKind];
  const term = sanitizeSearchTerm(q);
  let query = supabase
    .from(fuente.table).select(`id, ${fuente.column}`)
    .eq("organization_id", orgId);
  if (term) query = query.ilike(fuente.column, `%${term}%`);
  const { data } = await query.order(fuente.column).limit(Math.min(limit, 50));
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((r) => ({ id: r.id as string, label: String(r[fuente.column] ?? "Sin nombre") }));
}
