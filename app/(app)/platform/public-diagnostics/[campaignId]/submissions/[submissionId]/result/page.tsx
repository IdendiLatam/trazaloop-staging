export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmissionResultAction } from "@/server/actions/public-diagnostics-admin";
import {
  parsePublicSnapshot, snapshotRecommendations, seleccionarDestacadas,
  READINESS_EXPLANATION,
} from "@/lib/domain/public-diagnostic-report";
import { formatLegalVersion } from "@/lib/domain/public-diagnostics";
import type { ReadinessLevel } from "@/lib/diagnostic/scoring";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01J · El resultado de una empresa, desde dentro.
 *
 *
 * ES EL MISMO DATO QUE VIO LA EMPRESA
 *
 * Esta pantalla no recalcula nada. Lee la instantánea que se congeló al cerrar
 * y la pinta. No consulta preguntas, ni versiones, ni perfiles de puntuación:
 * si lo hiciera, el día que se publique una PCR v2 la administración vería un
 * resultado distinto del que se le entregó a la empresa, y ninguno de los dos
 * sería falso — que es la peor manera de tener razón.
 *
 *
 * Y NO PASA POR EL TESTIGO DEL PARTICIPANTE
 *
 * Se llega por identificador de campaña y participación, con la RLS de 0196
 * como puerta. El testigo de acceso es de quien respondió: una pantalla interna
 * donde apareciera sería la forma de que acabara copiado en un correo.
 *
 *
 * SOLO LECTURA
 *
 * No hay un solo control que escriba. La instantánea es historia: si un
 * resultado estuviera mal, se repite el diagnóstico —que crea uno nuevo y
 * conserva el anterior—, no se corrige el viejo.
 */
export const metadata = { title: "Resultado · Diagnósticos públicos" };

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es", { dateStyle: "long", timeStyle: "short" }) : "—";

function Dato({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{etiqueta}</dt>
      <dd className="pt-0.5 text-sm">{valor}</dd>
    </div>
  );
}

export default async function AdminSubmissionResultPage({
  params,
}: { params: Promise<{ campaignId: string; submissionId: string }> }) {
  const { campaignId, submissionId } = await params;
  const { result, canRead } = await getSubmissionResultAction(campaignId, submissionId);

  if (!canRead) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="text-sm text-ink-soft">
          Ver el resultado de una participación es de la superadministración de
          plataforma.
        </p>
      </div>
    );
  }
  if (!result) notFound();

  const s = result.submission;
  const volver = `/platform/public-diagnostics/${campaignId}`;

  // A medias no hay resultado que enseñar, y decirlo es más útil que un vacío.
  if (s.status !== "completed" || s.maturityPercent === null) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={volver} className="text-sm underline underline-offset-4">
          ← Volver a participaciones
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{s.companyName}</h1>
        <p role="status" className="rounded-lg border border-hairline bg-surface p-4 text-sm">
          Esta participación todavía no está cerrada, así que no tiene resultado.
          El resultado se congela al completar el diagnóstico.
        </p>
      </div>
    );
  }

  const snapshot = parsePublicSnapshot(result.snapshot);
  const destacadas = snapshot ? seleccionarDestacadas(snapshot.sections) : null;
  const recomendaciones = snapshot ? snapshotRecommendations(snapshot) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <Link href={volver} className="text-sm underline underline-offset-4">
          ← Volver a participaciones
        </Link>
        <p className="eyebrow">
          {result.partnerName ? `${result.partnerName} · ` : ""}{result.campaignName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{s.companyName}</h1>
        <p className="text-sm text-ink-soft">
          Resultado congelado al completar. Esta pantalla no recalcula nada y no
          permite modificarlo.
        </p>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="text-sm font-semibold">Participante</h2>
        <dl className="grid gap-4 pt-3 sm:grid-cols-3">
          <Dato etiqueta="Nombre" valor={s.participantName} />
          <Dato etiqueta="Correo" valor={s.participantEmail} />
          <Dato etiqueta="Teléfono" valor={s.participantPhone ?? "—"} />
          <Dato etiqueta="Empresa" valor={s.companyName} />
          <Dato etiqueta="Inicio" valor={fecha(s.startedAt)} />
          <Dato etiqueta="Finalización" valor={fecha(s.completedAt)} />
          <Dato
            etiqueta="Autorización del diagnóstico"
            valor={s.consentVersion
              ? `${formatLegalVersion(s.consentVersion)} · ${fecha(s.consentAt)}`
              : "—"}
          />
          {/*
            Los dos consentimientos, separados y a la vista. Quien dijo que no a
            las comunicaciones comerciales sigue teniendo su resultado y sigue
            en el programa: lo uno no gobierna lo otro, y aquí tiene que verse.
          */}
          <Dato
            etiqueta="Comunicaciones comerciales"
            valor={s.marketingOptIn
              ? `Autorizadas · ${fecha(s.marketingOptInAt)}`
              : "No autorizadas"}
          />
          <Dato
            etiqueta="Repetición"
            valor={s.supersedesId
              ? "Repite una participación anterior"
              : s.supersededById
                ? "Existe una repetición posterior"
                : "—"}
          />
        </dl>
      </section>

      {!snapshot ? (
        <p role="status" className="rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm">
          La instantánea de esta participación no se puede leer, así que no se
          compone un informe a medias. Los valores consultables siguen siendo:
          {" "}{s.maturityPercent}% · {s.readinessLevel}.
        </p>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-hairline bg-surface p-5">
              <p className="eyebrow mb-2">Preparación total</p>
              <p className="code text-3xl font-semibold tabular-nums">
                {snapshot.maturity_percent.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-surface p-5 sm:col-span-2">
              <p className="eyebrow mb-2">Nivel</p>
              <p className="text-sm font-semibold">{snapshot.readiness_label}</p>
              <p className="pt-1 text-sm text-ink-soft">
                {READINESS_EXPLANATION[snapshot.readiness_level as ReadinessLevel]}
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="text-sm font-semibold">Dimensiones</h2>
            <ul className="space-y-3 pt-3">
              {snapshot.sections.map((d) => (
                <li key={d.code}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                    <span>{d.title}</span>
                    <span className="code shrink-0 tabular-nums text-ink-soft">
                      {d.percent.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-hairline"
                       role="img"
                       aria-label={`${d.title}: ${d.percent.toFixed(0)} por ciento`}>
                    <div className="h-full rounded-full bg-loop"
                         style={{ width: `${Math.max(0, Math.min(100, d.percent))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {destacadas && destacadas.kind !== "none" ? (
            <section className="rounded-lg border border-loop/30 bg-loop/5 p-5">
              <h2 className="text-sm font-semibold">
                {destacadas.kind === "strengths"
                  ? "Fortalezas" : "Áreas con mejor desempeño relativo"}
              </h2>
              <ul className="list-disc space-y-1 pl-5 pt-2 text-sm">
                {destacadas.items.map((d) => (
                  <li key={d.code}>
                    {d.title} — <span className="code tabular-nums">{d.percent.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="text-sm font-semibold">
              Brechas <span className="text-ink-soft">({snapshot.gaps.length})</span>
            </h2>
            <p className="pt-1 text-xs text-ink-soft">
              En el orden en que quedaron congeladas, que es el del instrumento.
            </p>
            <ul className="space-y-2 pt-3">
              {snapshot.gaps.map((g, i) => (
                <li key={`${g.code}-${i}`} className="rounded-md border border-hairline p-3">
                  <p className="text-sm">
                    <span className="code mr-2 text-xs text-ink-soft">{g.code}</span>
                    {g.question}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-lg border border-hairline bg-surface p-5">
            <h2 className="text-sm font-semibold">
              Recomendaciones <span className="text-ink-soft">({recomendaciones.length})</span>
            </h2>
            <p className="pt-1 text-xs text-ink-soft">
              Texto y orden tal como se congelaron. Son las mismas que recibió la
              empresa.
            </p>
            <ol className="space-y-2 pt-3">
              {recomendaciones.map((r) => (
                <li key={`${r.dimension ?? ""}-${r.order}`}
                    className="rounded-md border border-hairline p-3">
                  {r.dimensionTitle ? <p className="eyebrow mb-1">{r.dimensionTitle}</p> : null}
                  <p className="text-sm">
                    <span className="code mr-2 text-xs text-ink-soft">{r.order}</span>
                    {r.text}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          <p className="text-xs text-ink-soft">
            Instrumento {snapshot.instrument.type.toUpperCase()} v
            {snapshot.instrument.version} · formato {snapshot.schema} ·{" "}
            {snapshot.answered} de {snapshot.questions} preguntas respondidas.
          </p>
        </>
      )}
    </div>
  );
}
