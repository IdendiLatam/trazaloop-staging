"use client";

// Trazaloop Quality · QUALITY-12.1 · Los temas de clientes que el Copilot
// propuso y que quedaron guardados. GAP-03 de QUALITY-12.
//
// LO QUE ESTA PANTALLA TIENE QUE DEJAR CLARO
//
//   · que un tema es una LECTURA de un modelo, no un dato medido
//   · con qué modelo y qué instrucciones se produjo, y cuándo
//   · en cuántos comentarios se apoya —contados por Trazaloop, no por el modelo—
//   · si va a mejor o a peor respecto del periodo anterior del mismo tema
//
// Y lo que no puede enseñar: quién escribió cada comentario. No lo enseña
// porque no lo tiene: la evidencia son comentarios anónimos citados por su
// número dentro de la consulta.

import { useActionState } from "react";
import { resolveCustomerThemeAction } from "@/server/actions/quality-ai";
import type { AiThemeRow } from "@/lib/db/quality-ai";

const TONO: Record<string, string> = {
  negative: "Negativo",
  mixed: "Mixto",
  neutral: "Neutro",
  positive: "Positivo",
  unknown: "Sin determinar",
};

const ESTADO: Record<string, string> = {
  proposed: "Propuesto",
  confirmed: "Confirmado",
  discarded: "Descartado",
};

export function CustomerThemes({
  themes, canManage,
}: { themes: AiThemeRow[]; canManage: boolean }) {
  if (themes.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-ink">Temas recurrentes</h2>
        <p className="text-xs text-ink-soft">
          Agrupaciones que el Copilot propuso a partir de comentarios anónimos.
          Son una lectura, no una medición: el recuento sale de los comentarios
          citados y el tono lo interpretó un modelo. Confírmalos para poder
          seguirlos periodo a periodo.
        </p>
      </header>

      <ul className="space-y-3">
        {themes.map((t) => (
          <li key={t.id} className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-ink">{t.label}</span>
              <span className="text-xs text-ink-soft">
                {t.periodStart} — {t.periodEnd} · {ESTADO[t.status] ?? t.status}
              </span>
            </div>

            {t.summary ? <p className="text-xs text-ink-soft">{t.summary}</p> : null}

            <p className="text-xs text-ink-soft">
              Tono {TONO[t.sentiment] ?? t.sentiment} · se apoya en{" "}
              {t.evidenceCount} comentario(s) citado(s)
              {t.previousPeriodEnd
                ? ` · en el periodo anterior (hasta ${t.previousPeriodEnd}) el tono era `
                  + `${(TONO[t.previousSentiment ?? "unknown"] ?? "sin determinar").toLowerCase()} `
                  + `con ${t.previousEvidenceCount ?? 0} comentario(s)`
                : " · es la primera lectura de este tema"}
            </p>

            <p className="text-xs text-ink-soft">
              Producido por {t.provider} · {t.model} con {t.promptTemplate} v{t.promptVersion}.
            </p>

            {canManage && t.status === "proposed" ? <Resolver themeId={t.id} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Resolver({ themeId }: { themeId: string }) {
  const [state, action, pending] = useActionState(resolveCustomerThemeAction, {
    error: null as string | null,
  });
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="theme_id" value={themeId} />
      <button
        type="submit" name="status" value="confirmed" disabled={pending}
        className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop">
        Confirmar
      </button>
      <button
        type="submit" name="status" value="discarded" disabled={pending}
        className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop">
        Descartar
      </button>
      {state.error ? <span className="text-xs text-danger">{state.error}</span> : null}
      {state.success ? <span className="text-xs text-ink-soft">{state.message}</span> : null}
    </form>
  );
}
