import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import { readAllStrict, readPage, type Page } from "@/lib/db/paged-read";
import type {
  ExportDataset, ExportQuestion, ExportSubmission, ExportDimension,
  ExportRecommendation,
} from "@/lib/domain/public-diagnostic-export";
import {
  parsePublicSnapshot, snapshotRecommendations,
} from "@/lib/domain/public-diagnostic-report";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01H · Las participaciones, para administrar.
 *
 *
 * SIN CLIENTE DE SERVICIO, A PROPÓSITO
 *
 * Todo pasa por la RLS de 0196, que solo deja ver estas tablas a la
 * administración de plataforma. Usar el cliente administrativo habría sido más
 * corto y habría convertido cada error de autorización de la capa de arriba en
 * una fuga: aquí, si alguien llama a esto sin ser quien debe, no ve nada.
 *
 *
 * CONSULTAS ACOTADAS, NO UNA POR PARTICIPACIÓN
 *
 * Una exportación de mil empresas son cinco consultas, no mil: la campaña, sus
 * preguntas, sus secciones, sus participaciones y sus respuestas. Las dos
 * últimas se recorren por páginas —PostgREST corta en mil filas— y con
 * `readAllStrict`, que LANZA si no pudo confirmar que las leyó todas. Un
 * fichero corto que parece completo es peor que uno que no se genera.
 */

type Fila = Record<string, unknown>;

export type CampaignCounts = { started: number; completed: number; incomplete: number };

/**
 * Los conteos, agrupados en la base (0203).
 *
 * Antes se traían las filas y se contaban aquí. Con mil participaciones eso
 * devolvía mil, sin error, y la pantalla enseñaba un número menor que el real.
 */
export async function loadCampaignCounts(): Promise<Map<string, CampaignCounts>> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("public_diagnostic_campaign_counts");
  const mapa = new Map<string, CampaignCounts>();
  if (error || !Array.isArray(data)) return mapa;
  for (const f of data as Fila[]) {
    mapa.set(String(f.campaign_id), {
      started: Number(f.started ?? 0),
      completed: Number(f.completed ?? 0),
      incomplete: Number(f.incomplete ?? 0),
    });
  }
  return mapa;
}

export type SubmissionRow = {
  id: string;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  participantName: string;
  participantEmail: string;
  participantPhone: string | null;
  companyName: string;
  consentVersion: string | null;
  consentAt: string | null;
  marketingOptIn: boolean;
  marketingOptInAt: string | null;
  maturityPercent: number | null;
  readinessLevel: string | null;
  snapshotSchema: string | null;
  supersedesId: string | null;
  supersededById: string | null;
};

/**
 * Las columnas que se leen, una a una.
 *
 * NO están `resume_token_hash` ni `resume_token_prefix`: un testigo no se
 * enseña ni por su prefijo, y pedir `*` habría metido los dos sin que nadie lo
 * decidiera. Tampoco `consent_content_hash`, que no dice nada a quien
 * administra y sí es metadato de seguridad.
 */
const CAMPOS_PARTICIPACION =
  "id, started_at, completed_at, status, participant_name, participant_email,"
  + " participant_phone, company_name, consent_version, consent_at,"
  + " marketing_opt_in, marketing_opt_in_at, maturity_percent, readiness_level,"
  + " result_payload, supersedes_id, superseded_by_id";

function mapearParticipacion(r: Fila): SubmissionRow {
  const payload = r.result_payload as Fila | null;
  return {
    id: String(r.id),
    startedAt: (r.started_at as string) ?? null,
    completedAt: (r.completed_at as string) ?? null,
    status: String(r.status),
    participantName: String(r.participant_name ?? ""),
    participantEmail: String(r.participant_email ?? ""),
    participantPhone: (r.participant_phone as string) ?? null,
    companyName: String(r.company_name ?? ""),
    consentVersion: (r.consent_version as string) ?? null,
    consentAt: (r.consent_at as string) ?? null,
    marketingOptIn: r.marketing_opt_in === true,
    marketingOptInAt: (r.marketing_opt_in_at as string) ?? null,
    maturityPercent: r.maturity_percent === null || r.maturity_percent === undefined
      ? null : Number(r.maturity_percent),
    readinessLevel: (r.readiness_level as string) ?? null,
    snapshotSchema: payload ? String(payload.schema ?? "") || null : null,
    supersedesId: (r.supersedes_id as string) ?? null,
    supersededById: (r.superseded_by_id as string) ?? null,
  };
}

/** Una página de participaciones, con el total real al lado. */
export async function listSubmissionsPage(
  campaignId: string, query: { q?: string | null; page?: string | null }
): Promise<Page<SubmissionRow>> {
  const supabase = await createServerClient();
  const término = (query.q ?? "").trim().replace(/[,()]/g, " ");
  const pagina = await readPage<Fila>(async ({ from, to }) => {
    let c = supabase
      .from("public_diagnostic_submissions")
      .select(CAMPOS_PARTICIPACION, { count: "exact" })
      .eq("campaign_id", campaignId);
    if (término) {
      c = c.or(`company_name.ilike.%${término}%,participant_email.ilike.%${término}%`);
    }
    const { data, count } = await c.order("started_at", { ascending: false }).range(from, to);
    return { data: (data ?? []) as unknown as Fila[], count };
  }, { q: query.q ?? null, page: query.page ?? null });
  return { ...pagina, rows: pagina.rows.map(mapearParticipacion) };
}

/**
 * Todo lo que hace falta para exportar una campaña, con un número ACOTADO de
 * consultas: la campaña, sus secciones, sus preguntas, sus participaciones y
 * las respuestas por tandas de cincuenta participaciones. Para mil empresas
 * son unas veinticinco consultas, no mil.
 *
 * Lanza si alguna lectura queda corta. Ver la nota de cabecera: para un
 * fichero que se entrega a una cámara, no generarlo es mejor que generarlo
 * incompleto.
 */
export async function loadExportDataset(
  campaignId: string,
  /**
   * El cliente, inyectable SOLO para poder probar esto contra una base real.
   *
   * Por omisión es el de la sesión, que pasa por la RLS. La prueba de escala
   * inyecta uno porque `createServerClient` necesita una petición de Next para
   * leer las cookies y no la hay fuera del servidor; la autorización se
   * comprueba aparte, a nivel de rol, en la misma batería.
   */
  cliente?: SupabaseClient
): Promise<ExportDataset | null> {
  const supabase = cliente ?? await createServerClient();

  const { data: campana } = await supabase
    .from("public_diagnostic_campaigns")
    .select("id, name, slug, diagnostic_type, diagnostic_version_id, status, opens_at,"
      + " closes_at, diagnostic_versions(version_number)")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campana) return null;
  const c = campana as unknown as Fila;
  const versionId = String(c.diagnostic_version_id);
  const version = c.diagnostic_versions as { version_number: number } | null;

  // Las secciones y las preguntas de la versión CONGELADA. No «las de hoy».
  const secciones = await readAllStrict<Fila>(
    () => supabase
      .from("diagnostic_sections")
      .select("code, title, order_index")
      .eq("version_id", versionId)
      .order("order_index") as never,
    "secciones del instrumento");

  const preguntas = await readAllStrict<Fila>(
    () => supabase
      .from("diagnostic_questions")
      .select("code, question_text, order_index, diagnostic_sections(code, title)")
      .eq("version_id", versionId)
      .eq("is_active", true)
      .order("order_index") as never,
    "preguntas del instrumento");

  const participaciones = await readAllStrict<Fila>(
    () => supabase
      .from("public_diagnostic_submissions")
      .select(CAMPOS_PARTICIPACION)
      .eq("campaign_id", campaignId)
      .order("id") as never,
    "participaciones");

  /*
    Las respuestas, POR LOTES DE PARTICIPACIONES.

    El primer diseño pedía todas las de la campaña con un filtro sobre la
    participación embebida y las recorría por páginas. Funcionó dos veces y a
    la tercera se cortó en 18 000 de 52 000: paginar por DESPLAZAMIENTO sobre
    una consulta con dos uniones se vuelve más lenta cuanto más avanza, y al
    llegar a cierto punto el servidor corta. `readAllStrict` hizo lo que debía
    —negarse a entregar un conjunto parcial— pero un exportador que a veces no
    exporta no sirve.

    Ahora se piden por tandas de identificadores: cada consulta usa el índice
    por participación, no depende de cuántas van leídas y la dirección no crece
    —cincuenta uuid caben de sobra—. Para mil participaciones son veinte
    consultas en vez de ciento cuatro, y ninguna se degrada.
  */
  const LOTE = 50;
  const respuestas: Fila[] = [];
  const idsParticipacion = participaciones.map((p) => String(p.id));
  for (let i = 0; i < idsParticipacion.length; i += LOTE) {
    const tanda = idsParticipacion.slice(i, i + LOTE);
    const filas = await readAllStrict<Fila>(
      () => supabase
        .from("public_diagnostic_answers")
        .select("submission_id, answer, diagnostic_questions!inner(code)")
        .in("submission_id", tanda)
        .order("submission_id")
        .order("question_id") as never,
      `respuestas de ${tanda.length} participaciones`);
    respuestas.push(...filas);
  }

  const porParticipacion = new Map<string, Record<string, boolean>>();
  for (const r of respuestas) {
    const id = String(r.submission_id);
    const q = r.diagnostic_questions as { code: string } | null;
    if (!q) continue;
    const bolsa = porParticipacion.get(id) ?? {};
    bolsa[q.code] = r.answer === true;
    porParticipacion.set(id, bolsa);
  }

  const questions: ExportQuestion[] = preguntas.map((q) => {
    const s = q.diagnostic_sections as { code: string; title: string } | null;
    return {
      code: String(q.code),
      text: String(q.question_text),
      sectionCode: s?.code ?? "",
      sectionTitle: s?.title ?? "",
    };
  });

  const submissions: ExportSubmission[] = participaciones.map((p) => {
    const m = mapearParticipacion(p);
    const payload = p.result_payload as Fila | null;
    const dims = (payload?.sections as Fila[] | undefined) ?? [];
    const dimensions: ExportDimension[] = dims.map((d) => ({
      code: String(d.code ?? ""),
      title: String(d.title ?? ""),
      percent: Number(d.percent ?? 0),
    }));
    /*
      PUBLIC-DIAGNOSTICS-01J · Las recomendaciones salen de la INSTANTÁNEA.

      Ni una consulta a `diagnostic_questions` para esto: si se leyera el
      catálogo de hoy, una acción retirada desaparecería de un archivo
      histórico y una nueva aparecería en diagnósticos que nunca la
      recibieron. Lo que se exporta es lo que se le entregó a esa empresa.
    */
    const instantanea = parsePublicSnapshot(payload);
    const recommendations: ExportRecommendation[] = instantanea
      ? snapshotRecommendations(instantanea)
      : [];
    return {
      submissionId: m.id,
      startedAt: m.startedAt,
      completedAt: m.completedAt,
      status: m.status,
      participantName: m.participantName,
      participantEmail: m.participantEmail,
      participantPhone: m.participantPhone,
      companyName: m.companyName,
      requiredConsentVersion: m.consentVersion,
      requiredConsentAt: m.consentAt,
      marketingConsent: m.marketingOptIn,
      marketingConsentAt: m.marketingOptInAt,
      maturityPercent: m.maturityPercent,
      readinessLevel: m.readinessLevel,
      snapshotSchema: m.snapshotSchema,
      supersedesId: m.supersedesId,
      supersededById: m.supersededById,
      dimensions,
      recommendations,
      answers: porParticipacion.get(m.id) ?? {},
    };
  });

  return {
    campaign: {
      name: String(c.name),
      slug: String(c.slug),
      diagnosticType: String(c.diagnostic_type),
      versionNumber: version?.version_number ?? null,
      status: String(c.status),
      opensAt: (c.opens_at as string) ?? null,
      closesAt: (c.closes_at as string) ?? null,
    },
    questions,
    sections: secciones.map((s) => ({ code: String(s.code), title: String(s.title) })),
    submissions,
  };
}

export type AdminSubmissionResult = {
  campaignName: string;
  campaignSlug: string;
  partnerName: string | null;
  submission: SubmissionRow;
  /** La instantánea tal cual, sin tocar. La valida `parsePublicSnapshot`. */
  snapshot: unknown;
};

/**
 * PUBLIC-DIAGNOSTICS-01J · El resultado de UNA participación, para administrar.
 *
 *
 * NO PASA POR EL TESTIGO DEL PARTICIPANTE
 *
 * Habría sido corto reutilizar `public_diagnostic_get_result`, y habría
 * obligado a que la administración conociera —o manejara— el testigo de acceso
 * de una empresa. Un testigo es de quien respondió; que exista una pantalla
 * interna donde aparezca es la forma de que acabe copiado en un correo.
 *
 * Así que se lee por identificador, con la RLS de 0196 como puerta: solo la
 * superadministración de plataforma ve estas filas. Si esta consulta se llamara
 * desde otro sitio, devolvería nada.
 *
 *
 * Y NO RECALCULA
 *
 * Devuelve `result_payload` tal como quedó. No lee preguntas, ni versiones, ni
 * perfiles de puntuación: el resultado que vio la empresa y el que ve la
 * administración son literalmente el mismo dato.
 */
export async function loadSubmissionResult(
  campaignId: string, submissionId: string
): Promise<AdminSubmissionResult | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("public_diagnostic_submissions")
    .select(`${CAMPOS_PARTICIPACION}, campaign_id,`
      + " public_diagnostic_campaigns(name, slug, partner_name)")
    .eq("id", submissionId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (!data) return null;
  const fila = data as unknown as Fila;
  const c = fila.public_diagnostic_campaigns as Fila | null;
  return {
    campaignName: String(c?.name ?? ""),
    campaignSlug: String(c?.slug ?? ""),
    partnerName: (c?.partner_name as string) ?? null,
    submission: mapearParticipacion(fila),
    snapshot: fila.result_payload ?? null,
  };
}
