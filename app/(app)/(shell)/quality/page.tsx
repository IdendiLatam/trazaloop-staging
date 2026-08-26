// Ruta protegida (el guard corre en el layout del namespace /quality).
export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-01 · Inicio del módulo.
//
// Presenta el recorrido real del sprint en el orden en que se hace: primero
// los cargos (sin ellos un proceso no tiene propietario), luego los procesos,
// luego el mapa. Los contadores son datos reales de la empresa activa; nada
// aquí es un número de ejemplo.

import Link from "next/link";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import { requireSession } from "@/lib/auth/require-session";
import { getQualitySummary } from "@/lib/db/quality-processes";
import { listMyTasks } from "@/lib/db/document-control";
import { listObjectives, listIndicators } from "@/lib/db/quality-indicators";
import { getCaseSummary } from "@/lib/db/work-cases";
import { getRiskSummary } from "@/lib/db/risks";
import { getPeopleSignals } from "@/lib/db/quality-people";
import { getSupplierHomeSignals } from "@/lib/db/quality-suppliers";
import { summarizeInbox, summaryLines } from "@/lib/domain/work-inbox";

function Card({
  href,
  step,
  title,
  description,
  meta,
  cta,
}: {
  href: string;
  step: string;
  title: string;
  description: string;
  meta: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
    >
      <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
        {step}
      </span>
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-ink-soft">{description}</span>
      <span className="text-xs font-medium text-ink">{meta}</span>
      <span className="text-sm font-medium text-loop">{cta} →</span>
    </Link>
  );
}

export default async function QualityHomePage() {
  const org = await requireQualityModule();
  const { user } = await requireSession();
  const [summary, tasks, objectives, indicators, cases, risks, people, suppliers] =
    await Promise.all([
    getQualitySummary(org.organizationId),
    listMyTasks(org.organizationId, user.id),
    listObjectives(org.organizationId),
    listIndicators(org.organizationId),
    getCaseSummary(org.organizationId),
    getRiskSummary(org.organizationId),
    getPeopleSignals(org.organizationId),
    getSupplierHomeSignals(org.organizationId),
  ]);

  // Parte 24 del encargo: un resumen MÍNIMO de lo pendiente, no un tablero.
  // Solo aparece si de verdad hay algo esperando por esta persona; una tarjeta
  // que siempre dice «0 pendientes» solo enseña a ignorarla.
  const inbox = summarizeInbox(tasks.map((t) => ({ taskType: t.taskType, status: t.status })));
  const pending = summaryLines(inbox);

  // QUALITY-03 · Estado del desempeño, con datos reales y sin convertir la
  // portada en un tablero. Solo se muestra lo que pide una acción.
  const activeObjectives = objectives.filter((o) => o.adminState === "active");
  const activeIndicators = indicators.filter((i) => i.adminState === "active");
  const offTarget = activeIndicators.filter((i) => i.lastEvaluation === "not_met");
  const needingAttention = activeIndicators.filter((i) => i.lastEvaluation === "attention");
  const pendingMeasurement = activeIndicators.filter((i) => i.measurementPending);

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  // QUALITY-04 · Solo se dice lo que pide una acción. Una portada llena de
  // ceros decorativos enseña a no mirarla.
  const caseLines: string[] = [];
  if (cases.openCases > 0) {
    caseLines.push(plural(cases.openCases, "caso abierto", "casos abiertos"));
  }
  if (cases.openNonconformities > 0) {
    caseLines.push(plural(cases.openNonconformities, "no conformidad abierta", "no conformidades abiertas"));
  }
  if (cases.overdueActions > 0) {
    caseLines.push(plural(cases.overdueActions, "acción vencida", "acciones vencidas"));
  }
  if (cases.pendingEffectiveness > 0) {
    caseLines.push(plural(cases.pendingEffectiveness, "eficacia por verificar", "eficacias por verificar"));
  }

  // QUALITY-05 · Igual criterio: solo se dice lo que pide una acción. Un
  // riesgo activo y dentro del criterio no necesita aparecer en la portada.
  const riskLines: string[] = [];
  if (risks.aboveAppetite > 0) {
    riskLines.push(
      `${plural(risks.aboveAppetite, "riesgo por encima del criterio aceptable", "riesgos por encima del criterio aceptable")}`
    );
  }
  if (risks.pendingApproval > 0) {
    riskLines.push(plural(risks.pendingApproval, "aceptación por aprobar", "aceptaciones por aprobar"));
  }
  if (risks.reviewsOverdue > 0) {
    riskLines.push(plural(risks.reviewsOverdue, "revisión de riesgo vencida", "revisiones de riesgo vencidas"));
  }
  if (risks.overdueActions > 0) {
    riskLines.push(
      plural(risks.overdueActions, "acción de tratamiento vencida", "acciones de tratamiento vencidas")
    );
  }

  // QUALITY-06 · Señales de Personas. Cinco números como mucho, y ninguno es
  // un dato personal: «2 evaluaciones pendientes» sirve en una portada,
  // «Ana no ha sido evaluada» no —quien pueda saberlo entra a la pantalla.
  const peopleLines: string[] = [];
  if (people.pendingEvaluations > 0) {
    peopleLines.push(
      plural(people.pendingEvaluations, "evaluación de desempeño pendiente", "evaluaciones de desempeño pendientes")
    );
  }
  if (people.expiringEvidence > 0) {
    peopleLines.push(
      plural(people.expiringEvidence, "evidencia de competencia por vencer", "evidencias de competencia por vencer")
    );
  }
  if (people.concentratedKnowledge > 0) {
    peopleLines.push(
      plural(people.concentratedKnowledge, "conocimiento crítico concentrado", "conocimientos críticos concentrados")
    );
  }
  if (people.criticalPositionsVacant > 0) {
    peopleLines.push(
      plural(people.criticalPositionsVacant, "cargo crítico sin titular", "cargos críticos sin titular")
    );
  }
  if (people.openTransfers > 0) {
    peopleLines.push(
      plural(people.openTransfers, "transferencia de conocimiento en curso", "transferencias de conocimiento en curso")
    );
  }

  const performanceLines: string[] = [];
  if (offTarget.length > 0) {
    performanceLines.push(plural(offTarget.length, "indicador fuera de meta", "indicadores fuera de meta"));
  }
  if (needingAttention.length > 0) {
    performanceLines.push(plural(needingAttention.length, "indicador en atención", "indicadores en atención"));
  }
  if (pendingMeasurement.length > 0) {
    performanceLines.push(plural(pendingMeasurement.length, "medición pendiente", "mediciones pendientes"));
  }

  // QUALITY-07 · Lo que pide una decisión humana sobre un proveedor. Ninguna de
  // estas líneas cambia nada por su cuenta: una revisión vencida no suspende, y
  // un certificado por caducar no retira ninguna aprobación.
  const supplierLines: string[] = [];
  if (suppliers.reevaluationOverdue > 0) {
    supplierLines.push(
      plural(suppliers.reevaluationOverdue, "proveedor con reevaluación vencida", "proveedores con reevaluación vencida")
    );
  }
  if (suppliers.approvalsExpired > 0) {
    supplierLines.push(
      plural(suppliers.approvalsExpired, "aprobación caducada", "aprobaciones caducadas")
    );
  }
  if (suppliers.criticalWithoutApproval > 0) {
    supplierLines.push(
      plural(suppliers.criticalWithoutApproval, "alcance crítico sin decisión de aprobación", "alcances críticos sin decisión de aprobación")
    );
  }
  if (suppliers.documentsExpiring > 0) {
    supplierLines.push(
      plural(suppliers.documentsExpiring, "documento de proveedor por vencer", "documentos de proveedor por vencer")
    );
  }
  if (suppliers.openIncidents > 0) {
    supplierLines.push(
      plural(suppliers.openIncidents, "incidente de proveedor abierto", "incidentes de proveedor abiertos")
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Módulos · Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Trazaloop Quality</h1>
        <p className="text-sm text-ink-soft">
          Gestión de procesos del sistema de calidad: cargos responsables, procesos con
          revisiones vigentes, entradas y salidas, relaciones entre procesos y un mapa
          publicable. Cada versión publicada queda fija y consultable.
        </p>
      </header>

      {pending.length > 0 ? (
        <section className="rounded-lg border border-amber/40 bg-amber/5 p-4">
          <h2 className="text-sm font-semibold">Pendientes para ti</h2>
          <ul className="mt-1 space-y-0.5">
            {pending.map((line) => (
              <li key={line} className="text-sm text-ink">{line}</li>
            ))}
          </ul>
          <Link href="/quality/tasks" className="mt-2 inline-block text-sm font-medium text-loop hover:underline">
            Ir a Mis tareas →
          </Link>
        </section>
      ) : null}

      {performanceLines.length > 0 ? (
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Desempeño</h2>
          <ul className="mt-1 space-y-0.5">
            {performanceLines.map((line) => (
              <li key={line} className="text-sm text-ink">{line}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-soft">
            Un indicador fuera de meta pide análisis, no es una no conformidad.
          </p>
          <Link href="/quality/indicators" className="mt-2 inline-block text-sm font-medium text-loop hover:underline">
            Ver indicadores →
          </Link>
        </section>
      ) : null}

      {riskLines.length > 0 ? (
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Riesgos</h2>
          <ul className="mt-1 space-y-0.5">
            {riskLines.map((line) => (
              <li key={line} className="text-sm text-ink">{line}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-soft">
            Que un riesgo esté por encima del criterio no es una no conformidad: pide decidir qué
            se hace con él.
          </p>
          <Link href="/quality/risks" className="mt-2 inline-block text-sm font-medium text-loop hover:underline">
            Ver riesgos →
          </Link>
        </section>
      ) : null}

      {peopleLines.length > 0 ? (
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Personas</h2>
          <ul className="mt-1 space-y-0.5">
            {peopleLines.map((line) => (
              <li key={line} className="text-sm text-ink">{line}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-soft">
            Una evidencia vencida pide revisarla, no declara incompetente a nadie. Y un
            conocimiento concentrado es un problema de la organización, no de la persona
            que lo sostiene.
          </p>
          <Link href="/quality/people" className="mt-2 inline-block text-sm font-medium text-loop hover:underline">
            Ver personas →
          </Link>
        </section>
      ) : null}

      {supplierLines.length > 0 ? (
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Proveedores</h2>
          <ul className="mt-1 space-y-0.5">
            {supplierLines.map((line) => (
              <li key={line} className="text-sm text-ink">{line}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-soft">
            Todo esto son avisos. Una reevaluación vencida no suspende a nadie y un
            certificado caducado no retira ninguna aprobación: quien decide sigue siendo
            una persona, y para un alcance concreto.
          </p>
          <Link href="/quality/suppliers" className="mt-2 inline-block text-sm font-medium text-loop hover:underline">
            Ver proveedores →
          </Link>
        </section>
      ) : null}

      {caseLines.length > 0 ? (
        <section className="rounded-lg border border-hairline bg-surface p-4">
          <h2 className="text-sm font-semibold">Casos y acciones</h2>
          <ul className="mt-1 space-y-0.5">
            {caseLines.map((line) => (
              <li key={line} className="text-sm text-ink">{line}</li>
            ))}
          </ul>
          <Link href="/quality/cases" className="mt-2 inline-block text-sm font-medium text-loop hover:underline">
            Ver casos →
          </Link>
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Cómo se construye</h2>

        <Card
          href="/quality/positions"
          step="Paso 1"
          title="Cargos"
          description="El responsable de un proceso es un cargo, no una persona. Cuando alguien cambia de puesto, el proceso conserva su propietario y la historia queda registrada."
          meta={
            summary.positions === 0
              ? "Aún no hay cargos definidos."
              : `${summary.positions} ${summary.positions === 1 ? "cargo definido" : "cargos definidos"}.`
          }
          cta="Gestionar cargos"
        />

        <Card
          href="/quality/processes"
          step="Paso 2"
          title="Procesos"
          description="Propósito, alcance, entradas, salidas y relaciones con otros procesos. Se trabaja sobre un borrador y se publica cuando está listo."
          meta={
            summary.processes === 0
              ? "Aún no hay procesos."
              : `${summary.processes} ${summary.processes === 1 ? "proceso" : "procesos"} · ${summary.publishedProcesses} con versión publicada.`
          }
          cta="Gestionar procesos"
        />

        <Card
          href="/quality/map"
          step="Paso 3"
          title="Mapa de procesos"
          description="Los procesos organizados por categoría. Al publicarlo se convierte en la versión oficial: deja de ser editable y queda consultable tal cual."
          meta={
            summary.hasPublishedMap
              ? "Hay un mapa publicado vigente."
              : summary.maps === 0
                ? "Aún no hay mapa."
                : "Mapa en preparación, todavía sin publicar."
          }
          cta="Ver el mapa"
        />

        <Card
          href="/quality/objectives"
          step="Desempeño"
          title="Objetivos e indicadores"
          description="Qué quiere lograr la empresa, con qué indicadores se comprueba y cómo va. Los indicadores automáticos se alimentan de lo que Trazaloop ya tiene registrado: nadie teclea el resultado."
          meta={
            activeObjectives.length === 0
              ? "Aún no hay objetivos activos."
              : `${activeObjectives.length} ${activeObjectives.length === 1 ? "objetivo activo" : "objetivos activos"} · ${activeIndicators.length} ${activeIndicators.length === 1 ? "indicador" : "indicadores"}.`
          }
          cta="Ir a Objetivos"
        />

        <Card
          href="/quality/risks"
          step="Prevención"
          title="Riesgos y oportunidades"
          description="Qué puede salir mal y qué podría salir mejor. Se valora con la metodología que define la empresa, se decide qué hacer, y lo que se decidió queda registrado con su fecha y su fundamento."
          meta={
            risks.aboveAppetite === 0
              ? "Ningún riesgo por encima del criterio aceptable."
              : `${plural(risks.aboveAppetite, "riesgo", "riesgos")} por encima del criterio aceptable.`
          }
          cta="Ir a Riesgos"
        />

        <Card
          href="/quality/cases"
          step="Atención"
          title="Casos y acciones"
          description="Lo que hay que atender: qué pasó, si incumple algo, qué se hizo y qué se hará para que no se repita. Un indicador fuera de meta o un documento vencido son señales; alguien decide si abren un caso."
          meta={
            cases.openCases === 0
              ? "No hay casos abiertos."
              : `${plural(cases.openCases, "caso abierto", "casos abiertos")}${cases.openNonconformities > 0 ? ` · ${plural(cases.openNonconformities, "es no conformidad", "son no conformidades")}` : ""}.`
          }
          cta="Ir a Casos"
        />

        <Card
          href="/quality/documents"
          step="Documentación"
          title="Documentos"
          description="El espacio documental de Quality: procedimientos, políticas e instructivos, con control documental completo —revisiones, revisores, aprobadores, vigencia y Lista Maestra—. No necesita ningún otro módulo."
          meta={
            summary.documents === 0
              ? "Aún no hay documentos de Quality."
              : `${summary.documents} ${summary.documents === 1 ? "documento" : "documentos"} de Quality.`
          }
          cta="Ir a Documentos"
        />
      </section>

      <section className="rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Sobre las versiones publicadas</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Publicar cierra la versión: su contenido, sus entradas y sus salidas quedan tal
          como estaban ese día y no se pueden modificar. Para cambiar algo se abre una
          revisión nueva, que parte de una copia de la vigente. Las versiones anteriores no
          se borran, de modo que siempre se puede responder qué regía en una fecha dada.
        </p>
      </section>
    </div>
  );
}
