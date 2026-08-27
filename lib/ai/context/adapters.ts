import "server-only";

import { registerAdapter, type ContextRequest, type ContextWriter } from "./builder";
import { createServerClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createServerClient>>;

/** PostgREST no sabe inferir el tipo de un `select` largo, y forzarlo fila a
 *  fila llenaría este archivo de ruido. Se declara una vez lo que son: filas
 *  con columnas que este módulo lee por nombre y trata como desconocidas. */
type Fila = Record<string, unknown>;
const filasDe = (d: unknown): Fila[] => (Array.isArray(d) ? d as Fila[] : []);

/**
 * Trazaloop · QUALITY-12 · §11 · Los adaptadores tipados.
 *
 * CADA UNO DECLARA LO MISMO
 *
 *   · qué entidad lee;
 *   · qué campos —los que están escritos aquí, y ninguno más—;
 *   · su clase de privacidad, heredada del catálogo de la base;
 *   · qué sabe hacer con el tiempo;
 *   · cómo se cita lo que devuelve.
 *
 * Y TODOS COMPARTEN DOS COSAS
 *
 * La primera: leen con la SESIÓN de quien pregunta. No hay un cliente
 * administrativo en este archivo, y no puede haberlo: la IA no eleva permisos.
 *
 * La segunda: los NÚMEROS los calculan ellos, no el modelo (§58). «Tres
 * periodos seguidos fuera de meta» es una cuenta hecha en SQL o en TypeScript;
 * el modelo la lee, la explica y la cita, pero no la produce.
 */

const LIMITE = 12;

// ---------------------------------------------------------------------------
// Señales de la automatización · §50, §51, §106
// ---------------------------------------------------------------------------
registerAdapter({
  code: "signal",
  useCases: ["*"],
  temporal: "current",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("v_quality_signal_overview")
      .select("signal_id, title, severity, status, subject_label, domain, "
        + "rule_name, rule_version_number, explanation, first_detected_at, "
        + "detection_count, deep_link, source_event_label, from_event")
      .eq("organization_id", req.organizationId)
      .is("resolved_at", null)
      .order("severity", { ascending: false })
      .limit(LIMITE);
    if (req.pinned?.type === "quality_signal") q = q.eq("signal_id", req.pinned.id);
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const s of filas) {
      const n = w.ref({
        sourceCode: "signal",
        entityType: "quality_signal",
        entityId: String(s.signal_id),
        label: `Señal: ${s.title}${s.subject_label ? ` · ${s.subject_label}` : ""}`,
        deepLink: `/quality/automation/signals/${s.signal_id}`,
      });
      nums.push(n);
      w.fact(
        `Señal abierta «${s.title}» sobre ${s.subject_label ?? "—"} `
        + `(gravedad ${s.severity}), detectada por primera vez el `
        + `${String(s.first_detected_at).slice(0, 10)} y vista ${s.detection_count} vez/veces.`,
        [n]);
      if (typeof s.explanation === "string") {
        w.note(`Explicación de la señal «${s.title}»`, s.explanation, [n]);
      }
    }
    // §58 · El recuento lo hace el código.
    w.fact(`Hay ${filas.length} señal(es) abierta(s) en total.`, nums);
  },
});

// ---------------------------------------------------------------------------
// Tareas y acciones vencidas · §50
// ---------------------------------------------------------------------------
registerAdapter({
  code: "task",
  useCases: ["ask", "audit_prep"],
  temporal: "current",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    const hoy = new Date().toISOString().slice(0, 10);
    const { data: acciones } = await db.from("work_actions")
      .select("id, code, title, status, due_on, action_kind")
      .eq("organization_id", req.organizationId)
      .in("status", ["planned", "in_progress"])
      .lt("due_on", hoy)
      .order("due_on")
      .limit(LIMITE);
    const filas = filasDe(acciones);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const a of filas) {
      const n = w.ref({
        sourceCode: "action", entityType: "work_action", entityId: String(a.id),
        label: `Acción vencida: ${a.code} · ${a.title}`,
        deepLink: `/quality/cases`,
      });
      nums.push(n);
      w.fact(`La acción «${a.title}» venció el ${a.due_on} y sigue en estado ${a.status}.`, [n]);
    }
    w.fact(`Hay ${filas.length} acción(es) vencida(s).`, nums);
  },
});

// ---------------------------------------------------------------------------
// Indicadores · §61, §108 · la serie viene calculada, no estimada
// ---------------------------------------------------------------------------
registerAdapter({
  code: "indicator",
  useCases: ["*"],
  temporal: "as_of",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("v_quality_indicator_status")
      .select("indicator_id, code, name, last_evaluation, last_value, target_value, "
        + "unit_code, measurement_pending, last_period_label, admin_state")
      .eq("organization_id", req.organizationId)
      .eq("admin_state", "active")
      .limit(LIMITE);
    if (req.pinned?.type === "quality_indicator") q = q.eq("indicator_id", req.pinned.id);
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    for (const i of filas) {
      const n = w.ref({
        sourceCode: "indicator", entityType: "quality_indicator",
        entityId: String(i.indicator_id),
        label: `Indicador: ${i.name}`,
        deepLink: `/quality/indicators/${i.indicator_id}`,
      });
      if (i.last_value !== null) {
        w.fact(
          `El indicador «${i.name}» marcó ${i.last_value} frente a una meta de `
          + `${i.target_value ?? "—"} en ${i.last_period_label ?? "su último periodo"} `
          + `(evaluación: ${i.last_evaluation ?? "sin evaluar"}).`, [n]);
      } else {
        w.fact(`El indicador «${i.name}» todavía no tiene ninguna medición registrada.`, [n]);
      }
      if (i.measurement_pending) {
        w.fact(`El indicador «${i.name}» tiene la medición del periodo cerrado pendiente.`, [n]);
      }

      // §21/§139 · La historia, cuando la pregunta es histórica o el indicador
      // está fijado: las mediciones REALES de cada periodo, no una media.
      if (req.pinned?.type === "quality_indicator" || req.temporal.mode !== "current") {
        let m = db.from("quality_measurements")
          .select("id, period_label, period_start, period_end, value, evaluation")
          .eq("organization_id", req.organizationId)
          .eq("indicator_id", i.indicator_id)
          .eq("is_current", true)
          .order("period_start", { ascending: false })
          .limit(8);
        if (req.temporal.periodStart) m = m.gte("period_start", req.temporal.periodStart);
        if (req.temporal.periodEnd) m = m.lte("period_end", req.temporal.periodEnd);
        if (req.temporal.mode === "as_of" && req.temporal.asOf) {
          m = m.lte("period_end", req.temporal.asOf);
        }
        const { data: med } = await m;
        for (const x of filasDe(med)) {
          const mn = w.ref({
            sourceCode: "indicator", entityType: "quality_measurement",
            entityId: String(x.id),
            label: `Medición: ${i.name} · ${x.period_label}`,
            deepLink: `/quality/indicators/${i.indicator_id}`,
            asOf: String(x.period_end),
          });
          w.fact(
            `En ${x.period_label}, «${i.name}» fue ${x.value ?? "sin dato"} `
            + `(evaluación: ${x.evaluation ?? "sin evaluar"}).`, [mn, n]);
        }
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Procesos · §107
// ---------------------------------------------------------------------------
registerAdapter({
  code: "process",
  useCases: ["*"],
  temporal: "as_of",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("quality_processes")
      .select("id, name, category_code, status, purpose")
      .eq("organization_id", req.organizationId)
      .limit(LIMITE);
    if (req.pinned?.type === "quality_process") q = q.eq("id", req.pinned.id);
    const { data } = await q;
    for (const p of filasDe(data)) {
      const n = w.ref({
        sourceCode: "process", entityType: "quality_process", entityId: String(p.id),
        label: `Proceso: ${p.name}`, deepLink: `/quality/processes/${p.id}`,
      });
      w.fact(`El proceso «${p.name}» está en estado ${p.status}.`, [n]);
      if (typeof p.purpose === "string" && p.purpose.length > 0) {
        w.note(`Propósito del proceso «${p.name}»`, p.purpose, [n]);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Casos y no conformidades · §54, §137
// ---------------------------------------------------------------------------
registerAdapter({
  code: "case",
  useCases: ["*"],
  temporal: "period",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("work_cases")
      .select("id, code, title, status, classification, detected_on, "
        + "requirement_text, nonconformity_text")
      .eq("organization_id", req.organizationId)
      .order("detected_on", { ascending: false })
      .limit(LIMITE);
    if (req.pinned?.type === "work_case") q = q.eq("id", req.pinned.id);
    if (req.temporal.periodStart) q = q.gte("detected_on", req.temporal.periodStart);
    if (req.temporal.periodEnd) q = q.lte("detected_on", req.temporal.periodEnd);
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const c of filas) {
      const n = w.ref({
        sourceCode: "case", entityType: "work_case", entityId: String(c.id),
        label: `Caso ${c.code}: ${c.title}`, deepLink: `/quality/cases/${c.id}`,
      });
      nums.push(n);
      w.fact(
        `El caso «${c.title}» (${c.code}) está ${c.status} y se clasificó como `
        + `${c.classification ?? "sin clasificar"}; se detectó el ${c.detected_on}.`, [n]);
      if (typeof c.nonconformity_text === "string" && c.nonconformity_text.length > 0) {
        w.note(`Descripción del caso ${c.code}`, c.nonconformity_text, [n]);
      }
    }
    // §58/§137 · Los recuentos: los cuenta el código.
    const abiertos = filas.filter((c) => c.status === "open").length;
    const nc = filas.filter((c) => c.classification === "nonconformity").length;
    w.fact(`De los casos consultados, ${abiertos} está(n) abierto(s) y `
      + `${nc} está(n) clasificado(s) como no conformidad.`, nums);
  },
});

// ---------------------------------------------------------------------------
// Riesgos · §55
// ---------------------------------------------------------------------------
registerAdapter({
  code: "risk",
  useCases: ["*"],
  temporal: "as_of",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("v_quality_risk_overview")
      .select("id, code, title, status, current_level, current_is_acceptable, "
        + "next_review_on, overdue_action_count, review_overdue")
      .eq("organization_id", req.organizationId)
      .limit(LIMITE);
    if (req.pinned?.type === "quality_risk") q = q.eq("id", req.pinned.id);
    const { data } = await q;
    for (const r of filasDe(data)) {
      const n = w.ref({
        sourceCode: "risk", entityType: "quality_risk", entityId: String(r.id),
        label: `Riesgo ${r.code}: ${r.title}`, deepLink: `/quality/risks/${r.id}`,
      });
      w.fact(
        `El riesgo «${r.title}» (${r.code}) está ${r.status}, con nivel actual `
        + `${r.current_level ?? "sin valorar"}`
        + `${r.review_overdue ? " y su revisión está vencida" : ""}.`, [n]);
      if (Number(r.overdue_action_count ?? 0) > 0) {
        w.fact(`Ese riesgo tiene ${r.overdue_action_count} acción(es) de tratamiento vencida(s).`, [n]);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Proveedores · §109
// ---------------------------------------------------------------------------
registerAdapter({
  code: "supplier",
  useCases: ["*"],
  temporal: "period",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("v_quality_supplier_scope_status")
      .select("scope_id, category_name, site_name, decision, is_approved_now, "
        + "approval_expired, criticality_label, last_evaluated_on, last_score, "
        + "last_result_band")
      .eq("organization_id", req.organizationId)
      .limit(LIMITE);
    if (req.pinned?.type === "quality_supplier_scope") q = q.eq("scope_id", req.pinned.id);
    const { data } = await q;
    for (const s of filasDe(data)) {
      const n = w.ref({
        sourceCode: "supplier", entityType: "quality_supplier_scope",
        entityId: String(s.scope_id),
        label: `Proveedor · alcance: ${s.category_name ?? s.site_name ?? "general"}`,
        deepLink: `/quality/suppliers`,
      });
      w.fact(
        `El alcance de proveedor «${s.category_name ?? s.site_name ?? "general"}» tiene `
        + `criticidad ${s.criticality_label ?? "sin clasificar"}, decisión `
        + `${s.decision ?? "sin decisión"} y su última evaluación fue el `
        + `${s.last_evaluated_on ?? "—"}${s.last_score !== null ? ` con ${s.last_score} puntos` : ""}.`,
        [n]);
      if (s.approval_expired) {
        w.fact(`Ese alcance tiene la aprobación caducada.`, [n]);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Voz del cliente · §32, §33, §57, §110 · AGREGADOS y comentarios SIN identidad
// ---------------------------------------------------------------------------
registerAdapter({
  code: "customer_metric",
  feature: "customer",
  useCases: ["*"],
  temporal: "period",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    const { data } = await db.from("v_quality_metric_series")
      .select("campaign_id, campaign_name, definition_name, period_label, value, "
        + "sample_size, method, breaks_comparability")
      .eq("organization_id", req.organizationId)
      .order("period_start", { ascending: false })
      .limit(LIMITE);
    for (const m of filasDe(data)) {
      const n = w.ref({
        sourceCode: "customer_metric", entityType: "quality_survey_campaign",
        entityId: String(m.campaign_id),
        label: `Métrica: ${m.definition_name} · ${m.campaign_name}`,
        deepLink: `/quality/customer-voice/campaigns/${m.campaign_id}`,
      });
      w.fact(
        `La métrica «${m.definition_name}» de la campaña «${m.campaign_name}» dio `
        + `${m.value ?? "sin dato"} sobre ${m.sample_size ?? 0} respuesta(s)`
        + `${m.breaks_comparability ? ", y esa serie rompe comparabilidad con la anterior" : ""}.`,
        [n]);
    }
  },
});

registerAdapter({
  code: "customer_comment",
  feature: "customer",
  useCases: ["customer_themes", "ask"],
  temporal: "period",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    // §32 · Lo que se lee es el TEXTO y la campaña. Ni el identificador de la
    // respuesta, ni la invitación, ni el contacto, ni la fecha exacta: nada que
    // permita volver desde el comentario a la persona.
    const { data } = await db.from("v_quality_campaign_comments")
      .select("campaign_id, campaign_name, comment_text, question_label")
      .eq("organization_id", req.organizationId)
      .limit(40);
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    let i = 0;
    for (const c of filas) {
      i += 1;
      const n = w.ref({
        sourceCode: "customer_comment", entityType: "quality_survey_campaign",
        entityId: String(c.campaign_id),
        label: `Comentario anónimo #${i} · campaña ${c.campaign_name}`,
        deepLink: `/quality/customer-voice/campaigns/${c.campaign_id}`,
      });
      nums.push(n);
      w.note(`Comentario anónimo #${i}`, String(c.comment_text ?? ""), [n]);
    }
    w.fact(`Se leyeron ${filas.length} comentario(s) anónimo(s) de clientes. `
      + `Ninguno viene con identidad: Trazaloop no la guarda para las campañas anónimas.`,
      nums);
  },
});

// ---------------------------------------------------------------------------
// Auditorías · §53, §111
// ---------------------------------------------------------------------------
registerAdapter({
  code: "audit",
  useCases: ["*"],
  temporal: "period",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("v_quality_audit_overview")
      .select("audit_id, code, title, status, scheduled_from, scheduled_to, "
        + "finding_count, report_issued_at")
      .eq("organization_id", req.organizationId)
      .order("scheduled_from", { ascending: false })
      .limit(6);
    if (req.pinned?.type === "quality_audit") q = q.eq("audit_id", req.pinned.id);
    const { data } = await q;
    const auditorias = filasDe(data);
    for (const a of auditorias) {
      const n = w.ref({
        sourceCode: "audit", entityType: "quality_audit", entityId: String(a.audit_id),
        label: `Auditoría ${a.code}: ${a.title}`,
        deepLink: `/quality/audits/${a.audit_id}`,
      });
      w.fact(
        `La auditoría «${a.title}» (${a.code}) está ${a.status}, programada entre `
        + `${a.scheduled_from ?? "—"} y ${a.scheduled_to ?? "—"}, con `
        + `${a.finding_count ?? 0} hallazgo(s).`, [n]);

      const { data: hallazgos } = await db.from("quality_audit_findings")
        .select("id, code, statement, proposed_classification, evaluation_status")
        .eq("organization_id", req.organizationId)
        .eq("audit_id", a.audit_id)
        .limit(8);
      for (const h of filasDe(hallazgos)) {
        const hn = w.ref({
          sourceCode: "audit", entityType: "quality_audit_finding", entityId: String(h.id),
          label: `Hallazgo ${h.code}`, deepLink: `/quality/audits/${a.audit_id}`,
        });
        w.fact(
          `El hallazgo ${h.code} está ${h.evaluation_status} y se propuso como `
          + `${h.proposed_classification}.`, [hn, n]);
        w.note(`Hallazgo ${h.code}`, String(h.statement ?? ""), [hn]);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Revisión por la dirección · §52, §112, §62
// ---------------------------------------------------------------------------
registerAdapter({
  code: "management_review",
  useCases: ["*"],
  temporal: "as_of",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("v_quality_management_review_overview")
      .select("review_id, code, title, period_label, period_start, period_end, "
        + "status, input_count, inputs_prepared, inputs_missing, decision_count, "
        + "closed_at")
      .eq("organization_id", req.organizationId)
      .order("period_end", { ascending: false })
      .limit(4);
    if (req.pinned?.type === "quality_management_review") q = q.eq("review_id", req.pinned.id);
    const { data } = await q;
    const revisiones = filasDe(data);
    for (const r of revisiones) {
      const n = w.ref({
        sourceCode: "management_review", entityType: "quality_management_review",
        entityId: String(r.review_id),
        label: `Revisión por la dirección ${r.code} · ${r.period_label}`,
        deepLink: `/quality/management-review/${r.review_id}`,
        asOf: r.closed_at ? String(r.closed_at).slice(0, 10) : null,
      });
      w.fact(
        `La revisión «${r.title}» del periodo ${r.period_label} está ${r.status}, con `
        + `${r.inputs_prepared ?? 0} de ${r.input_count ?? 0} entrada(s) preparada(s), `
        + `${r.inputs_missing ?? 0} sin datos y ${r.decision_count ?? 0} decisión(es) registrada(s).`,
        [n]);
    }

    // §62 · La comparación entre periodos la hace el CÓDIGO: dos revisiones
    // consecutivas, sus cifras y la diferencia YA restada. Dejarle la
    // aritmética al modelo sería pedirle justo lo que peor hace.
    if (revisiones.length >= 2) {
      const [a, b] = revisiones;
      const refA = w.ref({
        sourceCode: "management_review", entityType: "quality_management_review",
        entityId: String(a.review_id), label: `Revisión ${a.period_label}`,
        deepLink: `/quality/management-review/${a.review_id}`,
      });
      const refB = w.ref({
        sourceCode: "management_review", entityType: "quality_management_review",
        entityId: String(b.review_id), label: `Revisión ${b.period_label}`,
        deepLink: `/quality/management-review/${b.review_id}`,
      });
      const dA = Number(a.decision_count ?? 0);
      const dB = Number(b.decision_count ?? 0);
      const pA = Number(a.inputs_prepared ?? 0);
      const pB = Number(b.inputs_prepared ?? 0);
      w.fact(
        `Entre ${b.period_label} y ${a.period_label}, las decisiones registradas pasaron `
        + `de ${dB} a ${dA} (variación: ${dA - dB >= 0 ? "+" : ""}${dA - dB}), y las `
        + `entradas preparadas de ${pB} a ${pA} `
        + `(variación: ${pA - pB >= 0 ? "+" : ""}${pA - pB}).`,
        [refA, refB]);
    }
  },
});

// ---------------------------------------------------------------------------
// Personas · §34 · SOLO con el interruptor encendido, y solo lo ya calculado
// ---------------------------------------------------------------------------
registerAdapter({
  code: "person_competence",
  feature: "people",
  useCases: ["ask"],
  temporal: "current",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    // Lo que entra es la BRECHA YA CALCULADA por QUALITY-06, que es un dato del
    // sistema de gestión. No entran evaluaciones de desempeño, ni notas, ni
    // nada que sirva para clasificar a una persona.
    const { data } = await db.from("v_quality_competence_matrix")
      .select("position_name, competency_name, required_level, gap")
      .eq("organization_id", req.organizationId)
      .gt("gap", 0)
      .limit(LIMITE);
    const filas = filasDe(data);
    if (filas.length === 0) return;
    const n = w.ref({
      sourceCode: "person_competence", entityType: "quality_person", entityId: null,
      label: "Matriz de competencias · brechas registradas",
      deepLink: "/quality/people",
    });
    w.fact(`Hay ${filas.length} brecha(s) de competencia registrada(s) frente a los `
      + `perfiles de cargo.`, [n]);
    for (const f of filas.slice(0, 6)) {
      w.fact(
        `En el cargo «${f.position_name}» falta nivel en «${f.competency_name}» `
        + `(nivel requerido: ${f.required_level}).`, [n]);
    }
  },
});
