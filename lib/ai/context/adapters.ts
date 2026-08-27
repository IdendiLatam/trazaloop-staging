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


// ===========================================================================
// QUALITY-12.1 · Los siete adaptadores que faltaban (§22, §23, §27)
// ---------------------------------------------------------------------------
// Mismas reglas que los doce anteriores: campos escritos a mano, lectura con la
// sesión de quien pregunta, recuentos calculados aquí y citas con enlace
// interno. Ninguno abre una consulta genérica y ninguno acepta nada del modelo.
// ===========================================================================

// ---------------------------------------------------------------------------
// Documentos y revisiones · §24, §25, §26 · el que más cuidado exige
// ---------------------------------------------------------------------------
// Tres cosas que este adaptador NO hace, y son la razón de que sea el más
// largo:
//
//   · NO manda el documento entero. Manda las secciones que caben, recortadas
//     (§25). Preguntar por una cláusula no puede costar doscientas páginas.
//   · NO usa la revisión de hoy para una pregunta de hace dos años (§24). Lee
//     la revisión que estaba VIGENTE en esa fecha y su contenido congelado.
//   · NO se fía del texto que lee (§26). El contenido de un documento es de la
//     empresa, y va al contexto como material marcado, igual que un comentario.
// ---------------------------------------------------------------------------
const SECCIONES_POR_DOCUMENTO = 6;
const CARACTERES_POR_SECCION = 600;

registerAdapter({
  code: "document_revision",
  useCases: ["*"],
  temporal: "as_of",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("trazadoc_documents")
      .select("id, code, title, status, category_code, current_revision_id, module_key")
      .eq("organization_id", req.organizationId)
      .neq("status", "obsolete")
      .limit(req.pinned?.type === "trazadoc_document" ? 1 : 6);
    if (req.pinned?.type === "trazadoc_document") q = q.eq("id", req.pinned.id);
    const { data } = await q;
    const documentos = filasDe(data);
    if (documentos.length === 0) return;

    for (const d of documentos) {
      // §24 · Qué revisión responde a ESTA pregunta.
      //   · pregunta de hoy      → la vigente hoy
      //   · pregunta de una fecha → la que estaba vigente ESE día
      const corte = req.temporal.mode === "as_of" && req.temporal.asOf
        ? req.temporal.asOf
        : new Date().toISOString().slice(0, 10);

      const r = db.from("trazadoc_document_revisions")
        .select("id, revision_number, revision_label, workflow_state, "
          + "effective_from, effective_to, content_snapshot, review_due_at")
        .eq("organization_id", req.organizationId)
        .eq("document_id", d.id)
        .in("workflow_state", ["approved", "superseded"])
        .not("effective_from", "is", null)
        .lte("effective_from", corte)
        .order("effective_from", { ascending: false })
        .limit(1);
      const { data: revs } = await r;
      const rev = filasDe(revs)[0];

      if (!rev) {
        const n = w.ref({
          sourceCode: "document_revision", entityType: "trazadoc_document",
          entityId: String(d.id),
          label: `Documento ${d.code}: ${d.title}`,
          deepLink: `/quality/documents/${d.id}`,
        });
        w.fact(
          `El documento «${d.title}» (${d.code}) está ${d.status} y no tenía `
          + `ninguna revisión vigente al ${corte}.`, [n]);
        continue;
      }

      // §24 · La revisión vigente en la fecha puede haber terminado su vigencia
      // antes de esa misma fecha: entonces ese día no había ninguna en vigor.
      const caducada = rev.effective_to !== null
        && String(rev.effective_to) < corte;

      const n = w.ref({
        sourceCode: "document_revision", entityType: "trazadoc_document_revision",
        entityId: String(rev.id),
        label: `Documento ${d.code}: ${d.title} · revisión `
          + `${rev.revision_label ?? rev.revision_number}`,
        deepLink: `/quality/documents/${d.id}`,
        asOf: corte,
        revisionLabel: String(rev.revision_label ?? rev.revision_number),
      });

      w.fact(
        `Al ${corte}, el documento «${d.title}» (${d.code}) iba por la revisión `
        + `${rev.revision_label ?? rev.revision_number}, vigente desde el `
        + `${rev.effective_from}`
        + (rev.effective_to ? ` hasta el ${rev.effective_to}` : "")
        + (caducada ? ", es decir: ese día NO había ninguna revisión en vigor" : "")
        + ".", [n]);

      if (rev.review_due_at) {
        w.fact(
          `Su revisión periódica vence el ${String(rev.review_due_at).slice(0, 10)}.`, [n]);
      }

      // §25 · El contenido, recortado. Del snapshot congelado de ESA revisión,
      // que es lo que hace que una pregunta histórica lea el texto de entonces
      // y no el de ahora.
      const snap = rev.content_snapshot as { sections?: unknown[] } | null;
      const secciones = Array.isArray(snap?.sections) ? snap!.sections! : [];
      for (const s of secciones.slice(0, SECCIONES_POR_DOCUMENTO)) {
        const sec = s as { title?: string; content?: string };
        const texto = typeof sec.content === "string" ? sec.content.trim() : "";
        if (texto.length === 0) continue;
        w.note(
          `${d.code} · ${sec.title ?? "sección"} `
          + `(revisión ${rev.revision_label ?? rev.revision_number})`,
          texto.length > CARACTERES_POR_SECCION
            ? `${texto.slice(0, CARACTERES_POR_SECCION)}…`
            : texto,
          [n]);
      }
      if (secciones.length > SECCIONES_POR_DOCUMENTO) {
        w.limitation(
          `Del documento ${d.code} se leyeron ${SECCIONES_POR_DOCUMENTO} de sus `
          + `${secciones.length} secciones: el resto no cabía en el contexto.`);
      }
    }
  },
});

// ---------------------------------------------------------------------------
// Objetivos
// ---------------------------------------------------------------------------
registerAdapter({
  code: "objective",
  useCases: ["*"],
  temporal: "period",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("v_quality_objective_performance")
      .select("objective_id, code, name, period_start, period_end, admin_state, "
        + "indicator_count, indicators_not_met, indicators_without_data, "
        + "performance, performance_explanation")
      .eq("organization_id", req.organizationId)
      .limit(LIMITE);
    if (req.pinned?.type === "quality_objective") q = q.eq("objective_id", req.pinned.id);
    if (req.temporal.periodStart) q = q.gte("period_end", req.temporal.periodStart);
    if (req.temporal.periodEnd) q = q.lte("period_start", req.temporal.periodEnd);
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const o of filas) {
      const n = w.ref({
        sourceCode: "objective", entityType: "quality_objective",
        entityId: String(o.objective_id),
        label: `Objetivo ${o.code}: ${o.name}`,
        deepLink: `/quality/objectives/${o.objective_id}`,
      });
      nums.push(n);

      // Un objetivo SIN indicadores no es un objetivo que va bien: es un
      // objetivo que no se está midiendo. Decir «0 no cumplen la meta» era
      // técnicamente cierto y se leía como lo contrario de lo que pasa —y
      // chocaba de frente con el indicador que sí está fuera de meta y que
      // otra fuente trae en el mismo paquete—. La vista ya calcula el
      // veredicto y su explicación: se usan esos, no los contadores en crudo.
      const sinIndicadores = Number(o.indicator_count ?? 0) === 0;
      w.fact(
        `El objetivo «${o.name}» (${o.code}) del periodo ${o.period_start} — `
        + `${o.period_end} está ${o.admin_state}. `
        + (sinIndicadores
          ? "No tiene ningún indicador asociado, así que su cumplimiento NO se "
            + "puede medir con datos: que no haya indicadores fuera de meta no "
            + "significa que el objetivo se esté cumpliendo."
          : `Se mide con ${o.indicator_count} indicador(es): `
            + `${o.indicators_not_met ?? 0} no cumple(n) la meta y `
            + `${o.indicators_without_data ?? 0} no tiene(n) dato.`),
        [n]);

      if (typeof o.performance_explanation === "string"
        && o.performance_explanation.length > 0) {
        w.fact(`Trazaloop resume su desempeño así: ${o.performance_explanation}`, [n]);
      }

      // §68 · Si el objetivo no se mide y en la empresa hay indicadores fuera
      // de meta, las dos cosas juntas se leen mal. No se elige entre ellas: se
      // dice que conviven.
      if (sinIndicadores) {
        w.conflict(
          `El objetivo «${o.code}» no tiene indicadores asociados, de modo que `
          + `sus recuentos de cumplimiento son cero por falta de medición, no `
          + `por buen desempeño. No los compares con los indicadores sueltos `
          + `que aparezcan en esta misma respuesta.`);
      }
    }
    w.fact(`Hay ${filas.length} objetivo(s) en el alcance consultado.`, nums);
  },
});

// ---------------------------------------------------------------------------
// Acciones · el estado completo, no solo las vencidas
// ---------------------------------------------------------------------------
// El adaptador `task` ya traía las vencidas, que es lo que importa para «qué
// requiere atención». Este trae el panorama: qué hay abierto, de qué tipo y
// cuánto queda por verificar.
registerAdapter({
  code: "action",
  useCases: ["*"],
  temporal: "period",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("work_actions")
      .select("id, code, title, action_kind, status, due_on, completed_on, "
        + "requires_effectiveness, effectiveness_result, expected_result")
      .eq("organization_id", req.organizationId)
      .order("due_on", { ascending: true, nullsFirst: false })
      .limit(LIMITE);
    if (req.pinned?.type === "work_action") q = q.eq("id", req.pinned.id);
    if (req.temporal.periodStart) q = q.gte("due_on", req.temporal.periodStart);
    if (req.temporal.periodEnd) q = q.lte("due_on", req.temporal.periodEnd);
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const a of filas) {
      const n = w.ref({
        sourceCode: "action", entityType: "work_action", entityId: String(a.id),
        label: `Acción ${a.code}: ${a.title}`,
        deepLink: `/quality/cases`,
      });
      nums.push(n);
      w.fact(
        `La acción «${a.title}» (${a.code}, ${a.action_kind}) está ${a.status}`
        + (a.due_on ? `, con compromiso para el ${a.due_on}` : "")
        + (a.requires_effectiveness
          ? `, y su eficacia está ${a.effectiveness_result}`
          : ", y no exige verificar eficacia")
        + ".", [n]);
    }
    // §32 · Los recuentos, en el servidor.
    const abiertas = filas.filter(
      (a) => a.status === "planned" || a.status === "in_progress").length;
    const porVerificar = filas.filter(
      (a) => a.requires_effectiveness === true && a.effectiveness_result === "pending").length;
    w.fact(
      `De las acciones consultadas, ${abiertas} sigue(n) abierta(s) y `
      + `${porVerificar} espera(n) verificación de eficacia.`, nums);
  },
});

// ---------------------------------------------------------------------------
// Controles
// ---------------------------------------------------------------------------
registerAdapter({
  code: "control",
  useCases: ["*"],
  temporal: "current",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("quality_controls")
      .select("id, code, title, control_nature, operation_mode, frequency, status")
      .eq("organization_id", req.organizationId)
      .neq("status", "retired")
      .limit(LIMITE);
    if (req.pinned?.type === "quality_control") q = q.eq("id", req.pinned.id);
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const c of filas) {
      const n = w.ref({
        sourceCode: "control", entityType: "quality_control", entityId: String(c.id),
        label: `Control ${c.code}: ${c.title}`,
        deepLink: `/quality/risks`,
      });
      nums.push(n);
      w.fact(
        `El control «${c.title}» (${c.code}) es ${c.control_nature}, opera de forma `
        + `${c.operation_mode} con frecuencia ${c.frequency}, y está ${c.status}.`, [n]);
    }
    w.fact(`Hay ${filas.length} control(es) vigente(s).`, nums);
  },
});

// ---------------------------------------------------------------------------
// Conocimiento crítico
// ---------------------------------------------------------------------------
registerAdapter({
  code: "knowledge_item",
  useCases: ["*"],
  temporal: "current",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    // §35 · Se lee la vista de continuidad, que ya trae el número de titulares
    // CALCULADO y sin nombres. Un conocimiento con un solo titular es un dato
    // del sistema de gestión; quién es esa persona no hace falta para decirlo.
    let q = db.from("v_quality_knowledge_continuity")
      .select("knowledge_item_id, title, criticality, holder_count, "
        + "continuity_attention, documentation_status")
      .eq("organization_id", req.organizationId)
      .limit(LIMITE);
    if (req.pinned?.type === "quality_knowledge_item") {
      q = q.eq("knowledge_item_id", req.pinned.id);
    }
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const k of filas) {
      const n = w.ref({
        sourceCode: "knowledge_item", entityType: "quality_knowledge_item",
        entityId: String(k.knowledge_item_id),
        label: `Conocimiento: ${k.title}`,
        deepLink: `/quality/people/knowledge`,
      });
      nums.push(n);

      // Cero titulares NO es una versión suave de «uno»: es peor. Un
      // conocimiento crítico que no domina nadie ya se perdió, y decirlo con
      // la misma frase que «lo domina una sola persona» borra la diferencia
      // justo en la pregunta donde importa.
      const titulares = Number(k.holder_count ?? 0);
      const quienes = titulares === 0
        ? "no consta que lo domine NADIE en plantilla, que es una situación "
          + "peor que depender de una sola persona"
        : titulares === 1
          ? "lo domina UNA SOLA persona, de modo que depende enteramente de ella"
          : `lo dominan ${titulares} personas`;
      w.fact(
        `El conocimiento «${k.title}» es de criticidad ${k.criticality} y `
        + `${quienes}`
        + (k.continuity_attention ? "; su continuidad requiere atención" : "")
        + `; su documentación está ${k.documentation_status}.`, [n]);
    }
    const enRiesgo = filas.filter((k) => k.continuity_attention === true).length;
    const sinNadie = filas.filter((k) => Number(k.holder_count ?? 0) === 0).length;
    const unoSolo = filas.filter((k) => Number(k.holder_count ?? 0) === 1).length;
    w.fact(
      `De los ${filas.length} conocimiento(s) consultado(s), ${enRiesgo} `
      + `requiere(n) atención por continuidad: ${unoSolo} depende(n) de una sola `
      + `persona y ${sinNadie} no tiene(n) ningún titular registrado.`,
      nums);
  },
});

// ---------------------------------------------------------------------------
// Quejas y retroalimentación · clase RESTRINGIDA
// ---------------------------------------------------------------------------
// La fuente es `restricted` en el catálogo: la RLS de QUALITY-08 decide quién
// puede leerla, y aquí se lee con la sesión de quien pregunta. Si su rol no
// alcanza, no vienen filas y no hay nada que contar.
registerAdapter({
  code: "customer_feedback",
  feature: "customer",
  useCases: ["*"],
  temporal: "period",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("quality_customer_feedback")
      .select("id, title, feedback_kind, status, severity, received_on")
      .eq("organization_id", req.organizationId)
      .order("received_on", { ascending: false })
      .limit(LIMITE);
    if (req.pinned?.type === "quality_customer_feedback") q = q.eq("id", req.pinned.id);
    if (req.temporal.periodStart) q = q.gte("received_on", req.temporal.periodStart);
    if (req.temporal.periodEnd) q = q.lte("received_on", req.temporal.periodEnd);
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const f of filas) {
      const n = w.ref({
        sourceCode: "customer_feedback", entityType: "quality_customer_feedback",
        entityId: String(f.id),
        label: `${f.feedback_kind === "complaint" ? "Queja" : "Retroalimentación"}: ${f.title}`,
        deepLink: `/quality/customer-voice/feedback`,
      });
      nums.push(n);
      w.fact(
        `«${f.title}» es ${f.feedback_kind}, se recibió el ${f.received_on} y está `
        + `${f.status}` + (f.severity ? ` (severidad ${f.severity})` : "") + ".", [n]);
    }
    const quejas = filas.filter(
      (f) => f.feedback_kind === "complaint" || f.feedback_kind === "claim").length;
    const abiertas = filas.filter(
      (f) => f.status === "open" || f.status === "under_review").length;
    w.fact(
      `De lo consultado, ${quejas} es/son queja o reclamación, y ${abiertas} sigue(n) `
      + `sin cerrar.`, nums);
  },
});

// ---------------------------------------------------------------------------
// Reglas de automatización · para poder explicar QUÉ vigila la plataforma
// ---------------------------------------------------------------------------
registerAdapter({
  code: "automation_rule",
  useCases: ["*"],
  temporal: "current",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    let q = db.from("v_quality_automation_rule_overview")
      .select("rule_id, code, name, category, status, current_version_number, "
        + "open_signal_count, last_evaluated_at, trigger_kind, is_suppressed")
      .eq("organization_id", req.organizationId)
      .eq("status", "active")
      .limit(LIMITE);
    if (req.pinned?.type === "quality_automation_rule") q = q.eq("rule_id", req.pinned.id);
    const { data } = await q;
    const filas = filasDe(data);
    if (filas.length === 0) return;

    const nums: number[] = [];
    for (const r of filas) {
      const n = w.ref({
        sourceCode: "automation_rule", entityType: "quality_automation_rule",
        entityId: String(r.rule_id),
        label: `Regla ${r.code}: ${r.name}`,
        deepLink: `/quality/automation/rules/${r.rule_id}`,
      });
      nums.push(n);
      w.fact(
        `La regla «${r.name}» (${r.code}) está activa en su versión `
        + `v${r.current_version_number ?? "—"}, `
        + (r.trigger_kind === "event" ? "reacciona a un hecho" : "se revisa cada día")
        + `, y tiene ${r.open_signal_count ?? 0} señal(es) abierta(s)`
        + (r.is_suppressed ? ", aunque ahora está silenciada" : "") + ".", [n]);
    }
    w.fact(`La plataforma vigila ${filas.length} condición(es) con reglas activas.`, nums);
  },
});
