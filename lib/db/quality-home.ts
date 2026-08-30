import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAttention, type AttentionSourceStatus } from "@/lib/db/quality-attention";
import { summarizeAttention, type AttentionSummary } from "@/lib/domain/quality-attention";
import type { AttentionItem } from "@/lib/domain/quality-integration";
import { getQualitySummary, type QualitySummary } from "@/lib/db/quality-processes";
import { getSummary as getInterestedPartiesSummary,
         type InterestedPartiesSummary } from "@/lib/db/quality-interested-parties";
import { listIndicators, listObjectives } from "@/lib/db/quality-indicators";
import { getRiskSummary } from "@/lib/db/risks";
import { getCaseSummary } from "@/lib/db/work-cases";
import { getManagementReviewHomeSignals } from "@/lib/db/quality-management-review";
import { getSupplierHomeSignals } from "@/lib/db/quality-suppliers";
import { getAutomationHomeSignals } from "@/lib/db/quality-automation";

/**
 * Trazaloop · QUALITY-13B4 · Todo lo que la portada de Quality necesita saber.
 *
 * LA REGLA QUE ORDENA ESTE ARCHIVO
 *
 * **La atención se pregunta UNA vez.** Sale entera de la consulta convergida de
 * B3, ya deduplicada, y ninguno de los cargadores de dominio vuelve a contarla.
 * Ese era el fallo de la portada vieja: doce llamadas, doce formas de contar, y
 * el mismo problema apareciendo dos veces sin que nadie lo supiera.
 *
 * Los cargadores que quedan sirven para otra cosa: el CONTEXTO ADMINISTRATIVO
 * —cuántos procesos hay, cuántos objetivos activos— que responde «¿dónde
 * entro?» y que no es una señal de nada.
 *
 * SIN DATO NO ES CERO, TAMBIÉN AQUÍ
 *
 * Cada cargador va envuelto. Uno que falla llega `unavailable` y uno denegado
 * `not_visible`; ninguno de los dos aporta un cero a nada, y la portada dice
 * que está incompleta. Con una fuente caída **no se puede decir «no hay
 * asuntos»**, y esa es la diferencia entre informar y tranquilizar.
 */

type Db = SupabaseClient;

export type HomeBlock<T> =
  | { status: "ok"; data: T }
  | { status: "unavailable" | "not_visible" };

async function bloque<T>(cargar: () => Promise<T>): Promise<HomeBlock<T>> {
  try {
    return { status: "ok", data: await cargar() };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const denegado = err.code === "42501" || err.code === "PGRST301"
      || /permission denied/i.test(err.message ?? "");
    return { status: denegado ? "not_visible" : "unavailable" };
  }
}

export type HomeQuery = {
  organizationId: string;
  domain?: string | null;
  processId?: string | null;
};

export type QualityHome = {
  /** La muestra que se pinta. El total va en `summary`. */
  items: AttentionItem[];
  summary: AttentionSummary;
  /** Estado de cada fuente de atención Y de cada bloque administrativo. Es lo
   *  que decide si se puede decir que no hay nada. */
  sources: AttentionSourceStatus[];
  /** El nombre del proceso, cuando se filtró por uno. */
  processName: string | null;
  structure: {
    quality: HomeBlock<QualitySummary>;
    context: HomeBlock<InterestedPartiesSummary>;
    performance: HomeBlock<{
      objectives: number; indicators: number; inAttentionZone: number }>;
    risks: HomeBlock<{ aboveAppetite: number; pendingApproval: number }>;
    cases: HomeBlock<{ openCases: number; openNonconformities: number }>;
    managementReview: HomeBlock<{ upcoming: number; inPreparation: number }>;
    suppliers: HomeBlock<{ openIncidents: number }>;
    /** La avería del motor NO es una condición de calidad: es que el observador
     *  no observó. Por eso viaja aparte y no suma a la atención. */
    engineFailing: HomeBlock<boolean>;
  };
};

const MUESTRA = 8;

/**
 * La portada, en dos oleadas.
 *
 * La primera es la de B3 —siete consultas— y la de los ocho bloques
 * administrativos, todos en paralelo. La segunda solo existe si se filtró por
 * proceso, y es una consulta para saber cómo se llama.
 *
 * El número de consultas está acotado por el número de DOMINIOS, no por el de
 * filas: cuarenta puntos de atención cuestan lo mismo que cuatro.
 */
export async function loadQualityHome(
  query: HomeQuery, client?: Db
): Promise<QualityHome> {
  const orgId = query.organizationId;

  const [atencion, quality, context, indicators, objectives, risks, cases,
         managementReview, suppliers, automation] = await Promise.all([
    loadAttention(
      { organizationId: orgId, domain: query.domain ?? null,
        processId: query.processId ?? null },
      client),
    bloque(() => getQualitySummary(orgId, client)),
    bloque(() => getInterestedPartiesSummary(orgId, undefined, client)),
    bloque(() => listIndicators(orgId, client)),
    bloque(() => listObjectives(orgId, client)),
    bloque(() => getRiskSummary(orgId, client)),
    bloque(() => getCaseSummary(orgId, client)),
    bloque(() => getManagementReviewHomeSignals(orgId, client)),
    bloque(() => getSupplierHomeSignals(orgId, client)),
    bloque(() => getAutomationHomeSignals(orgId, client)),
  ]);

  let processName: string | null = null;
  if (query.processId && client) {
    const { data } = await client.from("quality_processes")
      .select("name").eq("organization_id", orgId).eq("id", query.processId).maybeSingle();
    processName = (data?.name as string | null) ?? null;
  } else if (query.processId) {
    const { createServerClient } = await import("@/lib/supabase/server");
    const supabase = await createServerClient();
    const { data } = await supabase.from("quality_processes")
      .select("name").eq("organization_id", orgId).eq("id", query.processId).maybeSingle();
    processName = (data?.name as string | null) ?? null;
  }

  // El resumen se calcula sobre lo YA convergido. Contar aquí por dominio
  // sumando cargadores sería reintroducir la duplicación que B3 quitó.
  const summary = summarizeAttention(atencion.items);

  // Los bloques administrativos también cuentan para saber si la información
  // está completa: una portada que no pudo leer los procesos tampoco puede
  // afirmar que no hay nada.
  const bloquesEstructura: AttentionSourceStatus[] = [
    ["quality_processes", "Procesos y documentos", quality],
    ["interested_parties", "Contexto", context],
    ["indicators", "Indicadores", indicators],
    ["objectives", "Objetivos", objectives],
    ["risks", "Riesgos", risks],
    ["cases", "Casos", cases],
    ["management_review", "Revisión por la dirección", managementReview],
    ["suppliers", "Proveedores", suppliers],
    ["automation_health", "Estado del motor", automation],
  ].map(([source, label, b]) => ({
    source: source as string, label: label as string,
    status: (b as HomeBlock<unknown>).status,
    count: null,
  }));

  return {
    items: atencion.items.slice(0, MUESTRA),
    summary,
    sources: [...atencion.sources, ...bloquesEstructura],
    processName,
    structure: {
      quality,
      context,
      performance: indicators.status === "ok" && objectives.status === "ok"
        ? {
            status: "ok",
            data: {
              objectives: objectives.data.filter((o) => o.adminState === "active").length,
              indicators: indicators.data.filter((i) => i.adminState === "active").length,
              // Estado del DOMINIO, no de un observador: ninguna regla ni
              // barrido observa la zona de atención, y por eso no está en la
              // atención convergida. Enseñarlo aquí conserva algo que la
              // portada vieja daba y que se habría perdido en silencio.
              inAttentionZone: indicators.data.filter(
                (i) => i.adminState === "active" && i.lastEvaluation === "attention").length,
            },
          }
        // Si alguno de los dos no se pudo leer, la baldosa entera lo dice: la
        // mitad de un dato no es un dato.
        : { status: (indicators.status === "ok"
              ? objectives.status : indicators.status) as "unavailable" | "not_visible" },
      risks: risks.status === "ok"
        ? { status: "ok", data: {
            aboveAppetite: risks.data.aboveAppetite,
            pendingApproval: risks.data.pendingApproval } }
        : { status: risks.status },
      cases: cases.status === "ok"
        ? { status: "ok", data: {
            openCases: cases.data.openCases,
            openNonconformities: cases.data.openNonconformities } }
        : { status: cases.status },
      managementReview: managementReview.status === "ok"
        ? { status: "ok", data: {
            upcoming: managementReview.data.upcoming,
            inPreparation: managementReview.data.inPreparation } }
        : { status: managementReview.status },
      suppliers: suppliers.status === "ok"
        ? { status: "ok", data: { openIncidents: suppliers.data.openIncidents } }
        : { status: suppliers.status },
      engineFailing: automation.status === "ok"
        ? { status: "ok", data: automation.data.engineFailing }
        : { status: automation.status },
    },
  };
}
