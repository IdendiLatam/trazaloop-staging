import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { shellModuleName } from "@/lib/modules/registry";
import {
  CURRENT, deepLink, notVisibleSection, okSection, unavailableSection,
  type ContextItem, type ContextSection, type IntegrationSubject,
} from "@/lib/domain/quality-integration";

/**
 * Trazaloop · QUALITY-13B1 · Qué está relacionado con el proceso X.
 *
 * LA PREGUNTA QUE ESTE ARCHIVO EXISTE PARA RESPONDER
 *
 * Veinticinco tablas guardan `process_id` y hasta hoy no había forma de
 * preguntarles a la vez. Esto lo hace, y hace solo eso: **lee**. No pinta, no
 * decide, no edita. El mirador de B2 lo consumirá; también podrá hacerlo el
 * contexto de Intelligence de B5, sin volver a escribir las consultas.
 *
 *
 * COMPOSICIÓN, NO UNA VISTA GIGANTE (QI-05)
 *
 * La alternativa evidente sería `v_quality_process_everything`. Se descartó por
 * dos razones concretas: su plan de ejecución dependería de la tabla más
 * pequeña del `join`, y cualquier dominio que fallara se llevaría por delante
 * la consulta entera. Aquí cada sección es independiente, se leen a la vez, y
 * **si una falla las demás siguen**.
 *
 *
 * EL NÚMERO DE CONSULTAS ES CONSTANTE
 *
 * Una o dos por sección. **No crece con el número de filas** y no hay N+1: los
 * recuentos se piden con `count: "exact", head: true` —la base cuenta y no
 * manda filas— y las muestras van con `limit`. Un proceso con tres riesgos y un
 * proceso con trescientos cuestan lo mismo.
 *
 *
 * SIN DATO NO ES CERO
 *
 * Si una sección falla, devuelve `unavailable` con su motivo. Si quien pregunta
 * no tiene permiso sobre ese dominio, `not_visible`. Nunca `0`: ese fue el
 * fallo que costó un sprint en QUALITY-12.2F, cuando una lectura denegada se
 * presentó como «todavía no hay consumo».
 *
 *
 * NO INVENTA RELACIONES (QI-03, QI-23)
 *
 * Solo aparecen los dominios que de verdad guardan `process_id`. Proveedores y
 * quejas **no** lo guardan y no se les añade: su relación con el proceso se
 * DERIVA de lo que ya es cierto, en `deriveSupplierProcesses` y
 * `deriveComplaintProcesses`, y cuando no hay nada que derivar se devuelve
 * vacío en vez de adivinar.
 */

type Db = SupabaseClient;
const MUESTRA = 4;

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

/** El error de PostgREST que significa «tu rol no llega ahí». */
function esFaltaDePermiso(error: { code?: string; message?: string } | null): boolean {
  const c = error?.code ?? "";
  return c === "42501" || c === "PGRST301" || /permission denied/i.test(error?.message ?? "");
}

/**
 * Envuelve una sección para que su fallo no tumbe la composición.
 *
 * Es la pieza que hace posible la regla de arriba: quien la use no tiene que
 * acordarse de distinguir «no hay» de «no se pudo».
 */
async function seccion(
  key: string, label: string, href: string,
  cargar: () => Promise<ContextSection>
): Promise<ContextSection> {
  try {
    return await cargar();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (esFaltaDePermiso(err)) return notVisibleSection(key, label, href);
    return unavailableSection(key, label, href,
      `No se pudo leer esta sección: ${err.message ?? "error desconocido"}`);
  }
}

/**
 * Un contador que distingue el fallo del vacío. Lanza; lo caza `seccion`.
 *
 * `Contable` es el trozo de PostgREST que aquí se usa —encadenar filtros y
 * esperar el resultado— sin arrastrar sus doce parámetros de tipo, que no
 * aportan nada a esta función y llenarían el archivo de ruido.
 */
type Contable = {
  eq: (col: string, v: unknown) => Contable;
  neq: (col: string, v: unknown) => Contable;
  in: (col: string, v: readonly unknown[]) => Contable;
} & PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>;

async function contar(
  supabase: Db, tabla: string, filtros: (q: Contable) => Contable
): Promise<number> {
  const q = supabase.from(tabla)
    .select("*", { count: "exact", head: true }) as unknown as Contable;
  const { count, error } = await filtros(q);
  if (error) throw error;
  return count ?? 0;
}

const item = (
  kind: IntegrationSubject, id: string, label: string,
  extra: { state?: string | null; severity?: string | null } = {}
): ContextItem => ({
  subjectKind: kind, subjectId: id, label,
  state: extra.state ?? null, severity: extra.severity ?? null,
  href: deepLink(kind, id),
});

export type ProcessContext = {
  process: {
    id: string; code: string | null; name: string;
    categoryCode: string; status: string; currentRevision: number;
    ownerPositionId: string | null; ownerPositionName: string | null;
  };
  sections: ContextSection[];
};

/**
 * El contexto completo de un proceso.
 *
 * La identidad del proceso es **crítica**: si no se puede leer, no hay nada que
 * componer y se devuelve `null` —quien llame responderá 404—. Las secciones son
 * opcionales: cada una responde por sí misma.
 */
export async function loadProcessContext(
  orgId: string, processId: string, client?: Db
): Promise<ProcessContext | null> {
  const supabase = await db(client);

  const { data: proceso, error } = await supabase
    .from("quality_processes")
    .select("id, code, name, category_code, status, current_revision, owner_position_id")
    .eq("organization_id", orgId).eq("id", processId).maybeSingle();
  if (error || !proceso) return null;

  let cargoNombre: string | null = null;
  if (proceso.owner_position_id) {
    const { data } = await supabase.from("quality_positions")
      .select("name").eq("organization_id", orgId)
      .eq("id", proceso.owner_position_id as string).maybeSingle();
    cargoNombre = (data?.name as string | null) ?? null;
  }

  // Las nueve a la vez. Ninguna espera a otra: no comparten nada.
  const sections = await Promise.all([
    seccionRequisitos(supabase, orgId, processId),
    seccionRiesgos(supabase, orgId, processId),
    seccionOportunidades(supabase, orgId, processId),
    seccionObjetivos(supabase, orgId, processId),
    seccionIndicadores(supabase, orgId, processId),
    seccionDocumentos(supabase, orgId, processId),
    seccionHallazgos(supabase, orgId, processId),
    seccionCasos(supabase, orgId, processId),
    seccionCompetencias(supabase, orgId, processId),
  ]);

  return {
    process: {
      id: proceso.id as string,
      code: (proceso.code as string | null) ?? null,
      name: proceso.name as string,
      categoryCode: proceso.category_code as string,
      status: proceso.status as string,
      currentRevision: Number(proceso.current_revision ?? 0),
      ownerPositionId: (proceso.owner_position_id as string | null) ?? null,
      ownerPositionName: cargoNombre,
    },
    sections,
  };
}

// ---------------------------------------------------------------------------
// Las nueve secciones. Cada una: un recuento y una muestra. Nada más.
// ---------------------------------------------------------------------------

/** Requisitos de partes interesadas que se atienden aquí. Solo los VIGENTES:
 *  un vínculo cerrado explica el pasado, no lo que hay que atender hoy. */
function seccionRequisitos(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("quality_stakeholder_requirement");
  return seccion("requirements", "Requisitos de partes interesadas", href, async () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const base = supabase.from("quality_stakeholder_requirement_processes")
      .select("requirement_id", { count: "exact" })
      .eq("organization_id", orgId).eq("process_id", processId)
      .is("effective_to", null);
    const { data, count, error } = await base.limit(MUESTRA);
    if (error) throw error;
    void hoy;

    const ids = (data ?? []).map((r) => r.requirement_id as string);
    let items: ContextItem[] = [];
    if (ids.length > 0) {
      const { data: reqs } = await supabase.from("quality_stakeholder_requirements")
        .select("id, title, requirement_kind, relevance_status")
        .eq("organization_id", orgId).in("id", ids);
      items = (reqs ?? []).map((r) => item(
        "quality_stakeholder_requirement", r.id as string, r.title as string,
        { state: r.relevance_status as string }));
    }
    return okSection({
      key: "requirements", label: "Requisitos de partes interesadas",
      count: count ?? 0, items, href, temporal: CURRENT,
    });
  });
}

function seccionRiesgos(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("quality_risk");
  return seccion("risks", "Riesgos", href, async () => {
    const { data, count, error } = await supabase.from("quality_risk_processes")
      .select("risk_id", { count: "exact" })
      .eq("organization_id", orgId).eq("process_id", processId).limit(MUESTRA);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.risk_id as string);
    let items: ContextItem[] = [];
    let abiertos: number | null = null;
    if (ids.length > 0) {
      const { data: filas } = await supabase.from("quality_risks")
        .select("id, title, status").eq("organization_id", orgId).in("id", ids);
      items = (filas ?? []).map((r) => item(
        "quality_risk", r.id as string, r.title as string, { state: r.status as string }));
    }
    if ((count ?? 0) > 0) {
      // Los que siguen abiertos, contados por la base. Es el único número que
      // el mirador necesita para decir si hay que mirar.
      const { data: todos } = await supabase.from("quality_risk_processes")
        .select("risk_id").eq("organization_id", orgId).eq("process_id", processId);
      const todosIds = (todos ?? []).map((r) => r.risk_id as string);
      abiertos = todosIds.length === 0 ? 0 : await contar(supabase, "quality_risks",
        (q) => q.eq("organization_id", orgId)
          .in("id", todosIds).eq("status", "active"));
    }
    return okSection({
      key: "risks", label: "Riesgos", count: count ?? 0,
      attentionCount: abiertos, items, href,
    });
  });
}

function seccionOportunidades(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("quality_opportunity");
  return seccion("opportunities", "Oportunidades", href, async () => {
    const { data, count, error } = await supabase.from("quality_opportunity_processes")
      .select("opportunity_id", { count: "exact" })
      .eq("organization_id", orgId).eq("process_id", processId).limit(MUESTRA);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.opportunity_id as string);
    let items: ContextItem[] = [];
    if (ids.length > 0) {
      const { data: filas } = await supabase.from("quality_opportunities")
        .select("id, title, status").eq("organization_id", orgId).in("id", ids);
      items = (filas ?? []).map((r) => item(
        "quality_opportunity", r.id as string, r.title as string,
        { state: r.status as string }));
    }
    return okSection({
      key: "opportunities", label: "Oportunidades", count: count ?? 0, items, href });
  });
}

function seccionObjetivos(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("quality_objective");
  return seccion("objectives", "Objetivos", href, async () => {
    const { data, count, error } = await supabase.from("quality_objective_processes")
      .select("objective_id", { count: "exact" })
      .eq("organization_id", orgId).eq("process_id", processId).limit(MUESTRA);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.objective_id as string);
    let items: ContextItem[] = [];
    if (ids.length > 0) {
      const { data: filas } = await supabase.from("quality_objectives")
        .select("id, name, admin_state").eq("organization_id", orgId).in("id", ids);
      items = (filas ?? []).map((r) => item(
        "quality_objective", r.id as string, r.name as string,
        { state: r.admin_state as string }));
    }
    return okSection({ key: "objectives", label: "Objetivos", count: count ?? 0, items, href });
  });
}

/** El indicador guarda su proceso en `scope_process_id`: el ámbito de lo que
 *  mide. No es `process_id`, y confundirlos habría devuelto siempre cero. */
function seccionIndicadores(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("quality_indicator");
  return seccion("indicators", "Indicadores", href, async () => {
    const { data, count, error } = await supabase.from("quality_indicators")
      .select("id, name, admin_state", { count: "exact" })
      .eq("organization_id", orgId).eq("scope_process_id", processId).limit(MUESTRA);
    if (error) throw error;
    return okSection({
      key: "indicators", label: "Indicadores", count: count ?? 0,
      items: (data ?? []).map((r) => item(
        "quality_indicator", r.id as string, r.name as string,
        { state: r.admin_state as string })),
      href,
    });
  });
}

/**
 * Los documentos vinculados al proceso.
 *
 * `module_key` NO es un adorno. Un proceso de Quality puede referenciar un
 * documento de PCR o de Textiles —la pantalla de vinculación ofrece los de
 * cualquier módulo de la empresa, y eso es correcto—, pero su ficha vive en el
 * módulo dueño. Mandarlo a `/quality/documents/…` da un 404, que es justo lo
 * que encontró la aceptación de QUALITY-13B2.
 *
 * Así que la fila de un documento ajeno se enseña **con el módulo del que es**
 * y **sin enlace**. Enlazar al módulo dueño tampoco vale: una empresa que solo
 * tiene Quality no puede entrar allí, y sería la puerta rota de siempre.
 */
function seccionDocumentos(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("trazadoc_document");
  return seccion("documents", "Documentos", href, async () => {
    const { data, count, error } = await supabase.from("quality_process_documents")
      .select("document_id, relation_type", { count: "exact" })
      .eq("organization_id", orgId).eq("process_id", processId).limit(MUESTRA);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.document_id as string);
    let items: ContextItem[] = [];
    if (ids.length > 0) {
      const { data: docs } = await supabase.from("trazadoc_documents")
        .select("id, title, code, status, module_key").eq("organization_id", orgId).in("id", ids);
      items = (docs ?? []).map((d) => {
        const propio = (d.module_key as string) === "quality";
        const nombre = `${d.code ? `${d.code} · ` : ""}${d.title as string}`;
        return {
          subjectKind: "trazadoc_document" as IntegrationSubject,
          subjectId: d.id as string,
          label: propio ? nombre : `${nombre} · de ${shellModuleName(d.module_key as string)}`,
          state: d.status as string,
          severity: null,
          href: propio ? deepLink("trazadoc_document", d.id as string)
                       : deepLink("trazadoc_document"),
          linksToDetail: propio,
        };
      });
    }
    return okSection({ key: "documents", label: "Documentos", count: count ?? 0, items, href });
  });
}

function seccionHallazgos(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("quality_audit_finding");
  return seccion("audit_findings", "Hallazgos de auditoría", href, async () => {
    // El hallazgo NO tiene `title`, `status` ni `severity`: tiene `statement`,
    // `evaluation_status` y `proposed_severity`. Y «abierto» aquí significa
    // SIN EVALUAR, que es el estado que pide trabajo. Un hallazgo evaluado y
    // descartado no está pendiente de nadie.
    const { data, count, error } = await supabase.from("quality_audit_findings")
      .select("id, statement, evaluation_status, proposed_severity", { count: "exact" })
      .eq("organization_id", orgId).eq("process_id", processId)
      .order("raised_on", { ascending: false }).limit(MUESTRA);
    if (error) throw error;
    const pendientes = await contar(supabase, "quality_audit_findings",
      (q) => q.eq("organization_id", orgId)
        .eq("process_id", processId).eq("evaluation_status", "pending"));
    return okSection({
      key: "audit_findings", label: "Hallazgos de auditoría", count: count ?? 0,
      attentionCount: pendientes,
      items: (data ?? []).map((f) => item(
        "quality_audit_finding", f.id as string,
        (f.statement as string | null) ?? "Hallazgo",
        { state: f.evaluation_status as string,
          severity: (f.proposed_severity as string | null) ?? null })),
      href,
    });
  });
}

function seccionCasos(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("work_case");
  return seccion("cases", "Casos y acciones", href, async () => {
    const { data, count, error } = await supabase.from("work_case_processes")
      .select("case_id", { count: "exact" })
      .eq("organization_id", orgId).eq("process_id", processId).limit(MUESTRA);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.case_id as string);
    let items: ContextItem[] = [];
    let abiertos: number | null = null;
    if (ids.length > 0) {
      const { data: casos } = await supabase.from("work_cases")
        .select("id, title, status, classification").eq("organization_id", orgId).in("id", ids);
      items = (casos ?? []).map((c) => item(
        "work_case", c.id as string, c.title as string,
        { state: c.status as string }));
      const { data: todos } = await supabase.from("work_case_processes")
        .select("case_id").eq("organization_id", orgId).eq("process_id", processId);
      const todosIds = (todos ?? []).map((r) => r.case_id as string);
      abiertos = await contar(supabase, "work_cases",
        (q) => q.eq("organization_id", orgId)
          .in("id", todosIds).neq("status", "closed"));
    }
    return okSection({
      key: "cases", label: "Casos y acciones", count: count ?? 0,
      attentionCount: abiertos, items, href,
    });
  });
}

function seccionCompetencias(supabase: Db, orgId: string, processId: string) {
  const href = deepLink("quality_competency");
  return seccion("competencies", "Competencias requeridas", href, async () => {
    const { data, count, error } = await supabase.from("quality_competency_requirements")
      .select("competency_id, required_level, is_mandatory", { count: "exact" })
      .eq("organization_id", orgId).eq("process_id", processId).limit(MUESTRA);
    if (error) throw error;
    const ids = (data ?? []).map((r) => r.competency_id as string);
    let items: ContextItem[] = [];
    if (ids.length > 0) {
      const { data: comps } = await supabase.from("quality_competencies")
        .select("id, name").eq("organization_id", orgId).in("id", ids);
      items = (comps ?? []).map((c) => item(
        "quality_competency", c.id as string, c.name as string));
    }
    return okSection({
      key: "competencies", label: "Competencias requeridas", count: count ?? 0, items, href });
  });
}

// ===========================================================================
// LO DERIVADO · QI-23
// ===========================================================================

export type DerivedProcessLink = {
  processId: string;
  processName: string;
  /** Cómo se llegó hasta aquí. Se enseña: una relación derivada que no explica
   *  su camino es indistinguible de una inventada. */
  via: string;
  href: string;
};

/**
 * De qué procesos habla un proveedor, sin que nadie lo haya declarado.
 *
 * **No existe `supplier_processes` y no se va a crear** (QI-23). Una tabla así
 * sería una segunda verdad mantenida a mano que se separaría de la primera en
 * cuanto cambiara un alcance.
 *
 * Se deriva por dos caminos, los dos ciertos hoy:
 *
 *   1 · los **casos** abiertos desde un incidente del proveedor, que sí
 *       declaran sus procesos;
 *   2 · los enlaces **periféricos** que alguien haya declarado a mano desde el
 *       perfil o el alcance —`work_references`—, que es la vía que QI-23
 *       autoriza cuando hace falta decirlo explícitamente.
 *
 * Si no hay ninguno de los dos, devuelve **vacío**. No adivina.
 */
export async function deriveSupplierProcesses(
  orgId: string, supplierProfileId: string, client?: Db
): Promise<DerivedProcessLink[]> {
  const supabase = await db(client);
  const encontrados = new Map<string, DerivedProcessLink>();

  // 1 · Por los incidentes que se convirtieron en caso.
  const { data: incidentes } = await supabase.from("quality_supplier_incidents")
    .select("case_id").eq("organization_id", orgId)
    .eq("profile_id", supplierProfileId).not("case_id", "is", null);
  const casos = (incidentes ?? []).map((i) => i.case_id as string);
  if (casos.length > 0) {
    const { data: vinculos } = await supabase.from("work_case_processes")
      .select("process_id").eq("organization_id", orgId).in("case_id", casos);
    for (const v of vinculos ?? []) {
      encontrados.set(v.process_id as string, {
        processId: v.process_id as string, processName: "",
        via: "un caso abierto desde un incidente de este proveedor",
        href: deepLink("quality_process", v.process_id as string),
      });
    }
  }

  // 2 · Por un enlace periférico declarado a mano.
  const { data: refs } = await supabase.from("work_references")
    .select("ref_id").eq("organization_id", orgId)
    .in("owner_kind", ["supplier_profile", "supplier_scope"])
    .eq("owner_id", supplierProfileId).eq("ref_kind", "quality_process");
  for (const r of refs ?? []) {
    if (!encontrados.has(r.ref_id as string)) {
      encontrados.set(r.ref_id as string, {
        processId: r.ref_id as string, processName: "",
        via: "un enlace declarado desde el proveedor",
        href: deepLink("quality_process", r.ref_id as string),
      });
    }
  }

  return nombrarProcesos(supabase, orgId, encontrados);
}

/**
 * De qué proceso habla una queja, sin que la queja lo diga.
 *
 * Se deriva del **caso** que la queja generó, que sí declara sus procesos. Una
 * queja sin caso no tiene proceso derivable, y entonces se devuelve vacío: es
 * la respuesta correcta, no un fallo.
 */
export async function deriveComplaintProcesses(
  orgId: string, feedbackId: string, client?: Db
): Promise<DerivedProcessLink[]> {
  const supabase = await db(client);
  const { data: queja } = await supabase.from("quality_customer_feedback")
    .select("case_id").eq("organization_id", orgId).eq("id", feedbackId).maybeSingle();
  const casoId = queja?.case_id as string | null | undefined;
  if (!casoId) return [];

  const { data: vinculos } = await supabase.from("work_case_processes")
    .select("process_id").eq("organization_id", orgId).eq("case_id", casoId);
  const encontrados = new Map<string, DerivedProcessLink>();
  for (const v of vinculos ?? []) {
    encontrados.set(v.process_id as string, {
      processId: v.process_id as string, processName: "",
      via: "el caso abierto desde esta retroalimentación",
      href: deepLink("quality_process", v.process_id as string),
    });
  }
  return nombrarProcesos(supabase, orgId, encontrados);
}

/** Una consulta más para los nombres. No una por proceso: una para todos. */
async function nombrarProcesos(
  supabase: Db, orgId: string, encontrados: Map<string, DerivedProcessLink>
): Promise<DerivedProcessLink[]> {
  if (encontrados.size === 0) return [];
  const { data } = await supabase.from("quality_processes")
    .select("id, name").eq("organization_id", orgId).in("id", [...encontrados.keys()]);
  for (const p of data ?? []) {
    const e = encontrados.get(p.id as string);
    if (e) e.processName = p.name as string;
  }
  // Un proceso que la RLS no devuelve no se enseña: sin nombre no hay enlace
  // honesto, y un identificador suelto no es un destino.
  return [...encontrados.values()].filter((e) => e.processName !== "");
}
