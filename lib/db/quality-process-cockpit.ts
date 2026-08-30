import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  CURRENT, deepLink,
  type ContextSection, type IntegrationSubject, type SectionStatus, type TemporalScope,
} from "@/lib/domain/quality-integration";
import { loadProcessContext, type ProcessContext } from "@/lib/db/quality-process-context";

/**
 * Trazaloop · QUALITY-13B2 · Todo lo que el mirador de proceso necesita saber.
 *
 * QUÉ AÑADE SOBRE B1, Y POR QUÉ NO ESTABA YA
 *
 * B1 respondió «qué está relacionado con este proceso» con nueve recuentos y
 * nueve muestras. Para enseñarlo hacen falta dos cosas más, y las dos son de
 * pantalla, no de contrato:
 *
 *   1 · **De quién viene cada requisito.** La sección de B1 trae el requisito;
 *       la parte interesada está un salto más allá, a través de su análisis.
 *       Y esa es la única forma de enseñarla: la relación parte→proceso NO se
 *       guarda —0149 lo dice en su propio comentario— y guardarla serían dos
 *       verdades. Se deriva del requisito, que es de donde viene.
 *
 *   2 · **La dirección inversa de lo derivado.** B1 sabe ir de un proveedor a
 *       sus procesos; el mirador necesita ir del proceso a sus proveedores. Es
 *       la misma verdad recorrida al revés, por los mismos dos caminos, y sigue
 *       sin persistir nada (QI-23).
 *
 * TODO SE LEE. Este archivo no escribe una sola fila, y el mirador tampoco.
 *
 * EL COSTE SIGUE SIN CRECER CON LOS DATOS. Las consultas que se añaden están
 * acotadas por el tamaño de la MUESTRA —cuatro— o por el conjunto de
 * identificadores de UN proceso. Un proceso con cuarenta riesgos y uno con uno
 * cuestan lo mismo, y la suite lo comprueba contando consultas.
 */

type Db = SupabaseClient;
const MUESTRA = 4;

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

// ===========================================================================
// 1 · DE QUIÉN VIENE CADA REQUISITO (§8)
// ===========================================================================

export type RequirementDetail = {
  requirementId: string;
  /** La parte o el grupo del que sale el requisito. `null` si la RLS no lo
   *  devuelve: sin nombre no se enseña nada, no se inventa un marcador. */
  partyLabel: string | null;
  /** Cómo se relaciona con el proceso: lo gestiona, le afecta, lo vigila. */
  linkKind: string;
  entryKind: string | null;
  requirementKind: string | null;
  /** Desde cuándo rige el vínculo. Solo se piden los VIGENTES. */
  since: string | null;
};

/**
 * Enriquece SOLO los requisitos de la muestra.
 *
 * Cuatro filas, cinco consultas acotadas. Pedir esto para los doscientos
 * requisitos de una empresa para enseñar cuatro sería exactamente el N+1 que
 * B1 se cuidó de no tener.
 */
async function requirementDetails(
  supabase: Db, orgId: string, processId: string, requirementIds: string[]
): Promise<RequirementDetail[]> {
  if (requirementIds.length === 0) return [];

  const { data: vinculos } = await supabase
    .from("quality_stakeholder_requirement_processes")
    .select("requirement_id, link_kind, effective_from")
    .eq("organization_id", orgId).eq("process_id", processId)
    .in("requirement_id", requirementIds).is("effective_to", null);

  const { data: requisitos } = await supabase
    .from("quality_stakeholder_requirements")
    .select("id, assessment_id, entry_kind, requirement_kind")
    .eq("organization_id", orgId).in("id", requirementIds);

  const analisisIds = [...new Set((requisitos ?? [])
    .map((r) => r.assessment_id as string).filter(Boolean))];

  let sujetoPorAnalisis = new Map<string, string>();
  if (analisisIds.length > 0) {
    const { data: analisis } = await supabase
      .from("quality_stakeholder_assessments")
      .select("id, subject_kind, external_party_id, stakeholder_group_id")
      .eq("organization_id", orgId).in("id", analisisIds);
    sujetoPorAnalisis = await etiquetasDeSujeto(supabase, orgId, analisis ?? []);
  }

  const porRequisito = new Map((requisitos ?? []).map((r) => [r.id as string, r]));
  return (vinculos ?? []).map((v) => {
    const req = porRequisito.get(v.requirement_id as string);
    const analisisId = (req?.assessment_id as string | undefined) ?? "";
    return {
      requirementId: v.requirement_id as string,
      partyLabel: sujetoPorAnalisis.get(analisisId) ?? null,
      linkKind: (v.link_kind as string) ?? "addressed_by",
      entryKind: (req?.entry_kind as string | null) ?? null,
      requirementKind: (req?.requirement_kind as string | null) ?? null,
      since: (v.effective_from as string | null) ?? null,
    };
  });
}

/**
 * El nombre del sujeto de cada análisis, en dos consultas para todos.
 *
 * Se leen `trade_name` y `legal_name` y nada más, igual que hace 12.3: para
 * decir de quién viene un requisito no hacen falta sus contactos.
 */
async function etiquetasDeSujeto(
  supabase: Db, orgId: string,
  analisis: { id: unknown; subject_kind: unknown; external_party_id: unknown; stakeholder_group_id: unknown }[]
): Promise<Map<string, string>> {
  const partes = [...new Set(analisis
    .map((a) => a.external_party_id as string | null).filter(Boolean) as string[])];
  const grupos = [...new Set(analisis
    .map((a) => a.stakeholder_group_id as string | null).filter(Boolean) as string[])];

  const nombres = new Map<string, string>();
  if (partes.length > 0) {
    const { data } = await supabase.from("quality_external_parties")
      .select("id, legal_name, trade_name").eq("organization_id", orgId).in("id", partes);
    for (const p of data ?? []) {
      const comercial = (p.trade_name as string | null)?.trim();
      nombres.set(p.id as string,
        comercial && comercial.length > 0 ? comercial : (p.legal_name as string));
    }
  }
  if (grupos.length > 0) {
    const { data } = await supabase.from("quality_stakeholder_groups")
      .select("id, name").eq("organization_id", orgId).in("id", grupos);
    for (const g of data ?? []) nombres.set(g.id as string, g.name as string);
  }

  const salida = new Map<string, string>();
  for (const a of analisis) {
    const sujetoId = (a.subject_kind === "external_party"
      ? a.external_party_id : a.stakeholder_group_id) as string | null;
    const etiqueta = sujetoId ? nombres.get(sujetoId) : undefined;
    if (etiqueta) salida.set(a.id as string, etiqueta);
  }
  return salida;
}

// ===========================================================================
// 2 · LO DERIVADO, EN LA DIRECCIÓN DEL PROCESO (§9, §10 · QI-23)
// ===========================================================================

export type DerivedItem = {
  subjectKind: IntegrationSubject;
  id: string;
  label: string;
  /** Por qué camino llegó. Se enseña SIEMPRE: una relación derivada que no
   *  explica su origen es indistinguible de una inventada. */
  via: string;
  href: string;
  detail?: string | null;
};

export type DerivedSection = {
  key: string;
  label: string;
  status: SectionStatus;
  count: number | null;
  items: DerivedItem[];
  href: string;
  temporal: TemporalScope;
  /** La advertencia que impide leerlo como una relación mantenida a mano. */
  note: string;
};

const VIA_CASO_PROVEEDOR = "Relacionado por un caso abierto desde un incidente de este proveedor";
const VIA_REF_PROVEEDOR = "Relacionado mediante una referencia declarada desde el proveedor";
const VIA_CASO_QUEJA = "Relacionada por el caso abierto desde esta retroalimentación";
const VIA_REF_QUEJA = "Relacionada mediante una referencia declarada";

/** Los casos de este proceso. Los dos caminos derivados parten de aquí, así que
 *  se leen UNA vez y se comparten. */
async function casosDelProceso(
  supabase: Db, orgId: string, processId: string
): Promise<string[]> {
  const { data, error } = await supabase.from("work_case_processes")
    .select("case_id").eq("organization_id", orgId).eq("process_id", processId);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.case_id as string))];
}

/**
 * Qué proveedores tienen algo que ver con este proceso.
 *
 * **No hay `supplier_processes` y no se va a crear** (QI-23). Se deriva por los
 * dos mismos caminos que B1 recorre al revés:
 *
 *   1 · el incidente del proveedor que se convirtió en caso, y ese caso declara
 *       sus procesos;
 *   2 · la referencia periférica que alguien declaró a mano desde el perfil o
 *       desde un alcance concreto.
 *
 * Un alcance no es un perfil: cuando la referencia cuelga del alcance hay que
 * subir hasta su proveedor. Tratarlos igual —que es lo que haría un `in` sobre
 * las dos clases sin distinguir— enseñaría alcances como si fueran proveedores.
 *
 * Sin ninguno de los dos caminos: **vacío**. No se adivina.
 */
export async function deriveProcessSuppliers(
  orgId: string, processId: string, client?: Db, casos?: string[]
): Promise<DerivedItem[]> {
  const supabase = await db(client);
  const caseIds = casos ?? await casosDelProceso(supabase, orgId, processId);
  const via = new Map<string, string>();

  if (caseIds.length > 0) {
    const { data } = await supabase.from("quality_supplier_incidents")
      .select("profile_id").eq("organization_id", orgId).in("case_id", caseIds);
    for (const i of data ?? []) via.set(i.profile_id as string, VIA_CASO_PROVEEDOR);
  }

  const { data: refs } = await supabase.from("work_references")
    .select("owner_kind, owner_id").eq("organization_id", orgId)
    .eq("ref_kind", "quality_process").eq("ref_id", processId)
    .in("owner_kind", ["supplier_profile", "supplier_scope"]);
  const alcances: string[] = [];
  for (const r of refs ?? []) {
    if (r.owner_kind === "supplier_profile") {
      if (!via.has(r.owner_id as string)) via.set(r.owner_id as string, VIA_REF_PROVEEDOR);
    } else {
      alcances.push(r.owner_id as string);
    }
  }
  if (alcances.length > 0) {
    const { data } = await supabase.from("quality_supplier_scopes")
      .select("profile_id").eq("organization_id", orgId).in("id", alcances);
    for (const s of data ?? []) {
      if (!via.has(s.profile_id as string)) via.set(s.profile_id as string, VIA_REF_PROVEEDOR);
    }
  }

  return nombrarProveedores(supabase, orgId, via);
}

/**
 * Del perfil al nombre, pasando por la entidad externa. Dos consultas para
 * todos, y quien no tenga nombre legible **no se enseña ni se cuenta**.
 *
 * Lo segundo importa tanto como lo primero: contar filas que la RLS no deja
 * leer diría «tres proveedores relacionados» a quien no puede ver ninguno, que
 * es filtrar existencia por la puerta de atrás. Se recorta a la muestra
 * DESPUÉS, en la composición, para que el recuento sea el de verdad.
 */
async function nombrarProveedores(
  supabase: Db, orgId: string, via: Map<string, string>
): Promise<DerivedItem[]> {
  if (via.size === 0) return [];
  const { data: filas } = await supabase.from("quality_supplier_profiles")
    .select("id, party_id").eq("organization_id", orgId).in("id", [...via.keys()]);
  const partes = [...new Set((filas ?? []).map((p) => p.party_id as string))];
  const nombres = new Map<string, string>();
  if (partes.length > 0) {
    const { data } = await supabase.from("quality_external_parties")
      .select("id, legal_name, trade_name").eq("organization_id", orgId).in("id", partes);
    for (const p of data ?? []) {
      const comercial = (p.trade_name as string | null)?.trim();
      nombres.set(p.id as string,
        comercial && comercial.length > 0 ? comercial : (p.legal_name as string));
    }
  }
  return (filas ?? []).flatMap((p) => {
    const nombre = nombres.get(p.party_id as string);
    if (!nombre) return [];
    return [{
      subjectKind: "quality_supplier_profile" as IntegrationSubject,
      id: p.id as string, label: nombre,
      via: via.get(p.id as string) ?? VIA_REF_PROVEEDOR,
      href: deepLink("quality_supplier_profile", p.id as string),
    }];
  });
}

/**
 * Qué retroalimentación de cliente tiene que ver con este proceso.
 *
 * Mismo principio y misma prohibición: la queja no guarda proceso y no se le
 * añade. Llega por el caso que generó, o por una referencia declarada.
 *
 * SE ENSEÑA EL ASUNTO, NUNCA QUIÉN. Ni el cliente, ni el nombre de quien
 * reportó, ni la respuesta de encuesta de la que salió: una campaña anónima
 * deja de serlo en cuanto una pantalla junta la queja con su cliente.
 */
export async function deriveProcessComplaints(
  orgId: string, processId: string, client?: Db, casos?: string[]
): Promise<DerivedItem[]> {
  const supabase = await db(client);
  const caseIds = casos ?? await casosDelProceso(supabase, orgId, processId);
  const via = new Map<string, string>();

  if (caseIds.length > 0) {
    const { data } = await supabase.from("quality_customer_feedback")
      .select("id").eq("organization_id", orgId).in("case_id", caseIds);
    for (const f of data ?? []) via.set(f.id as string, VIA_CASO_QUEJA);
  }

  const { data: refs } = await supabase.from("work_references")
    .select("owner_id").eq("organization_id", orgId)
    .eq("ref_kind", "quality_process").eq("ref_id", processId)
    .eq("owner_kind", "customer_feedback");
  for (const r of refs ?? []) {
    if (!via.has(r.owner_id as string)) via.set(r.owner_id as string, VIA_REF_QUEJA);
  }

  if (via.size === 0) return [];
  const { data: filas } = await supabase.from("quality_customer_feedback")
    .select("id, title, feedback_kind, received_on")
    .eq("organization_id", orgId).in("id", [...via.keys()]);
  return (filas ?? []).map((f) => ({
    subjectKind: "quality_customer_feedback" as IntegrationSubject,
    id: f.id as string,
    label: f.title as string,
    via: via.get(f.id as string) ?? VIA_REF_QUEJA,
    href: deepLink("quality_customer_feedback", f.id as string),
    detail: (f.received_on as string | null) ?? null,
  }));
}

/** El recuento verdadero de lo derivado: el conjunto entero, no la muestra. */
async function contarDerivado(
  cargar: () => Promise<{ total: number; items: DerivedItem[] }>,
  key: string, label: string, href: string, note: string
): Promise<DerivedSection> {
  try {
    const { total, items } = await cargar();
    return {
      key, label, status: "ok", count: total, items, href, temporal: CURRENT, note,
    };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const denegado = err.code === "42501" || err.code === "PGRST301"
      || /permission denied/i.test(err.message ?? "");
    return {
      key, label, status: denegado ? "not_visible" : "unavailable",
      count: null, items: [], href, temporal: CURRENT, note,
    };
  }
}

// ===========================================================================
// 3 · LA COMPOSICIÓN
// ===========================================================================

export type ProcessCockpit = {
  process: ProcessContext["process"];
  sections: ContextSection[];
  /** Solo los de la muestra de la sección de requisitos. */
  requirements: RequirementDetail[];
  /** Solo las derivaciones que tienen algo que decir. Una derivación vacía NO
   *  se enseña: §9 es explícito —si no hay derivación válida, no se enseña
   *  ninguna— y una sección vacía de algo que no está modelado invitaría a
   *  buscar un botón para rellenarla. */
  derived: DerivedSection[];
};

/**
 * Todo el mirador, en dos oleadas.
 *
 * La primera es la de B1: nueve secciones en paralelo. La segunda depende de
 * ella —los requisitos de la muestra— y va también en paralelo consigo misma.
 * Dos viajes, no diez.
 */
export async function loadProcessCockpit(
  orgId: string, processId: string, client?: Db
): Promise<ProcessCockpit | null> {
  const supabase = await db(client);

  const base = await loadProcessContext(orgId, processId, supabase);
  if (!base) return null;

  const seccionRequisitos = base.sections.find((s) => s.key === "requirements");
  const idsRequisitos = seccionRequisitos?.status === "ok"
    ? seccionRequisitos.items.map((i) => i.subjectId) : [];

  // Los casos se leen una vez para las dos derivaciones.
  let casos: string[] = [];
  let casosFallo = false;
  try { casos = await casosDelProceso(supabase, orgId, processId); }
  catch { casosFallo = true; }

  const [requirements, proveedores, quejas] = await Promise.all([
    requirementDetails(supabase, orgId, processId, idsRequisitos).catch(() => []),
    contarDerivado(async () => {
      if (casosFallo) throw new Error("no se pudieron leer los casos del proceso");
      const items = await deriveProcessSuppliers(orgId, processId, supabase, casos);
      // El recuento es el conjunto entero; la muestra son cuatro filas.
      return { total: items.length, items: items.slice(0, MUESTRA) };
    }, "derived_suppliers", "Proveedores relacionados",
       deepLink("quality_supplier_profile"),
       "Relación DERIVADA de lo que ya es cierto. No es una lista que alguien mantenga a mano."),
    contarDerivado(async () => {
      if (casosFallo) throw new Error("no se pudieron leer los casos del proceso");
      const items = await deriveProcessComplaints(orgId, processId, supabase, casos);
      return { total: items.length, items: items.slice(0, MUESTRA) };
    }, "derived_complaints", "Retroalimentación de clientes relacionada",
       deepLink("quality_customer_feedback"),
       "Relación DERIVADA del caso que la retroalimentación generó. Se muestra el asunto, nunca quién lo reportó."),
  ]);

  const derived = [proveedores, quejas].filter(
    (d) => d.status !== "ok" || (d.count ?? 0) > 0
  );

  return { process: base.process, sections: base.sections, requirements, derived };
}
