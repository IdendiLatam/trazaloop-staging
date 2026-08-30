import "server-only";

import { registerAdapter, type ContextRequest, type ContextWriter } from "./builder";
import { loadAttention } from "@/lib/db/quality-attention";
import { summarizeAttention } from "@/lib/domain/quality-attention";
import { loadProcessContext } from "@/lib/db/quality-process-context";
import {
  deriveProcessComplaints, deriveProcessSuppliers,
} from "@/lib/db/quality-process-cockpit";
import { domainLabel } from "@/lib/domain/quality-home";
import { sectionCount } from "@/lib/domain/quality-integration";
import type { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · QUALITY-13B5 · Las dos fuentes integradas.
 *
 * POR QUÉ SON DOS Y NO VEINTE
 *
 * Todo lo demás ya existía. Lo que faltaba era que Intelligence pudiera mirar el
 * sistema **por donde está unido** en vez de dominio a dominio:
 *
 *   · `attention` · la respuesta convergida de B3. Un problema visto por el
 *     estado del dominio, por un barrido heredado y por una regla es **un**
 *     hecho, no tres. Sin esta fuente, cada pregunta integrada volvería a
 *     contar señales, avisos y pendientes por separado, que es exactamente la
 *     duplicación que B3 quitó.
 *
 *   · `process_context` · el contexto de proceso de B1, compuesto una sola vez.
 *     Sin él, preguntar por un proceso significaría volver a unir las
 *     veinticinco tablas que guardan `process_id`, cada una a su manera.
 *
 * LO QUE ESTAS DOS FUENTES NO HACEN
 *
 *   · No consultan `quality_signals`, ni los barridos, ni las tablas de señal
 *     de dominio. Preguntan a B3, que ya sabe.
 *   · No cuentan nada que no venga contado. Los números salen de
 *     `summarizeAttention` y de los recuentos de B1 (§19).
 *   · No inventan relaciones. Proveedor y queja llegan por la derivación de
 *     QI-23, y cada fila dice por qué camino llegó (§21).
 *   · No convierten un fallo en un cero: si una fuente de atención no se pudo
 *     leer, se declara la limitación (§15).
 */

type Db = Awaited<ReturnType<typeof createServerClient>>;

/** El tope de filas que se vuelcan por sección. Un contexto no es un listado. */
const MUESTRA = 8;

// ---------------------------------------------------------------------------
// 1 · LA ATENCIÓN CONVERGIDA · B3
// ---------------------------------------------------------------------------
registerAdapter({
  code: "attention",
  // Solo cuando alguien la pide por su plan de contexto: es la fuente
  // integrada, no una más del montón.
  useCases: ["ask", "copilot.ask", "audit_prep", "review_summary", "risk_candidates"],
  temporal: "current",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    // Acotada al proceso cuando se pregunta desde uno: preguntar por un proceso
    // y recibir la atención de la empresa entera sería contexto que estorba.
    const proceso = req.pinned?.type === "quality_process" ? req.pinned.id : null;
    const r = await loadAttention(
      { organizationId: req.organizationId, processId: proceso }, db);
    const resumen = summarizeAttention(r.items);

    // §15 · Una fuente que no se pudo leer NO se convierte en «no hay nada».
    for (const s of r.sources) {
      if (s.status === "unavailable") {
        w.limitation(
          `No se pudo leer «${s.label}» al reunir lo que requiere atención: el recuento `
          + "que sigue es un mínimo, no un total.");
      }
      if (s.status === "not_visible") {
        w.limitation(
          `Tu rol no da acceso a «${s.label}», así que esa parte no entra en esta respuesta.`);
      }
    }

    if (resumen.total === 0) {
      // Y el vacío se dice de forma distinta según se sepa o no que está completo.
      w.fact(
        r.complete
          ? "No hay asuntos que requieran atención según lo observado ahora mismo."
          : "No se ven asuntos que requieran atención, pero falta información por leer: "
            + "no se puede afirmar que no haya ninguno.",
        []);
      return;
    }

    const nums: number[] = [];
    for (const it of r.items.slice(0, MUESTRA)) {
      const n = w.ref({
        sourceCode: "attention",
        entityType: it.subjectKind,
        entityId: it.subjectId,
        label: `${domainLabel(it.domain)}: ${it.label}`,
        // §31 · El enlace sale del contrato de B1, no se escribe a mano.
        deepLink: it.href,
      });
      nums.push(n);
      w.fact(
        `${domainLabel(it.domain)} · «${it.label}»: ${it.reason}`
        + (it.severity ? ` (gravedad del dominio: ${it.severity})` : "")
        + ". Este asunto se cuenta UNA vez aunque lo detecten varios mecanismos.",
        [n]);
    }

    // §19 · Los números vienen contados. El modelo los explica, no los produce.
    w.fact(
      `Hay ${resumen.total} asunto(s) que requieren atención, ya deduplicados: `
      + `${resumen.overdue} vencido(s), ${resumen.dueSoon} próximo(s) y `
      + `${resumen.timingUnknown} sin fecha clara.`,
      nums);
    const porDominio = Object.entries(resumen.byDomain)
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => `${domainLabel(d)}: ${n}`)
      .join(" · ");
    if (porDominio) {
      w.fact(`Reparto por dominio (sin contar dos veces el mismo asunto): ${porDominio}.`, nums);
    }
    if (proceso) {
      w.fact("Estos asuntos son SOLO los relacionados con el proceso por el que se pregunta.", nums);
    }
  },
});

// ---------------------------------------------------------------------------
// 2 · EL CONTEXTO DE PROCESO · B1 y B2
// ---------------------------------------------------------------------------
registerAdapter({
  code: "process_context",
  useCases: ["ask", "copilot.ask", "audit_prep", "risk_candidates"],
  temporal: "current",
  async load(db: Db, req: ContextRequest, w: ContextWriter) {
    if (req.pinned?.type !== "quality_process") return;
    const ctx = await loadProcessContext(req.organizationId, req.pinned.id, db);
    if (!ctx) return;

    const nProc = w.ref({
      sourceCode: "process_context",
      entityType: "quality_process",
      entityId: ctx.process.id,
      label: `Proceso: ${ctx.process.name}`,
      deepLink: `/quality/processes/${ctx.process.id}`,
    });
    w.fact(
      `El proceso «${ctx.process.name}»${ctx.process.code ? ` (${ctx.process.code})` : ""} `
      + `está ${ctx.process.status}, va por la revisión ${ctx.process.currentRevision} y su `
      + `cargo propietario es ${ctx.process.ownerPositionName ?? "—"}.`,
      [nProc]);

    for (const s of ctx.sections) {
      // §15 · Sin dato NO es cero, tampoco aquí.
      if (s.status === "not_visible") {
        w.limitation(
          `Tu rol no da acceso a «${s.label}» de este proceso: esa parte no entra.`);
        continue;
      }
      if (s.status === "unavailable") {
        w.limitation(`No se pudo leer «${s.label}» de este proceso.`);
        continue;
      }
      const total = sectionCount(s);
      const refs = [nProc];
      for (const it of s.items.slice(0, 4)) {
        refs.push(w.ref({
          sourceCode: "process_context",
          entityType: it.subjectKind,
          entityId: it.subjectId,
          label: `${s.label}: ${it.label}`,
          deepLink: it.href,
        }));
      }
      w.fact(
        `${s.label} de este proceso: ${total}`
        + (s.attentionCount !== null && s.attentionCount > 0
          ? `, de los cuales ${s.attentionCount} requieren atención`
          : "")
        + ".",
        refs);
    }

    // QI-23 · Lo derivado, y diciendo por qué camino llegó.
    const [proveedores, quejas] = await Promise.all([
      deriveProcessSuppliers(req.organizationId, ctx.process.id, db).catch(() => []),
      deriveProcessComplaints(req.organizationId, ctx.process.id, db).catch(() => []),
    ]);
    for (const [filas, que] of [[proveedores, "Proveedor"], [quejas, "Retroalimentación"]] as const) {
      for (const d of filas.slice(0, 4)) {
        const n = w.ref({
          sourceCode: "process_context",
          entityType: d.subjectKind,
          entityId: d.id,
          label: `${que} relacionada: ${d.label}`,
          deepLink: d.href,
        });
        w.fact(
          `${que} «${d.label}» está relacionada con este proceso de forma DERIVADA: `
          + `${d.via}. No es una relación que alguien mantenga a mano.`,
          [n, nProc]);
      }
    }
  },
});
