"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  contextualReviewAction, type DocumentReviewState,
} from "@/server/actions/document-review";
import {
  REVIEW_FINDING_LABEL, REVIEW_SEVERITY_LABEL, RELATED_CONTEXT_LABEL,
  type ReviewSeverity,
} from "@/lib/domain/document-review";
import { INTELLIGENCE_ACTIONS } from "@/lib/domain/intelligence-identity";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: DocumentReviewState = { error: null };

/**
 * Trazaloop · QUALITY-12.2D · «Revisar con Intelligence», junto a la sección.
 *
 * POR QUÉ ES UN PANEL APARTE Y NO UNA OPCIÓN MÁS DEL DE 12.2C
 *
 * Porque son dos preguntas distintas y mezclarlas confundiría la respuesta:
 *
 *     MEJORAR REDACCIÓN      ¿se lee bien esto?
 *     REVISAR CONSISTENCIA   ¿coincide con lo que Trazaloop tiene registrado?
 *
 * La primera devuelve un texto para sustituir. La segunda devuelve una lista
 * de sitios donde mirar, y casi nunca hay nada que sustituir. Pintarlas en el
 * mismo sitio llevaría a leer un hallazgo como si fuera una propuesta de
 * redacción, que es justo el malentendido que hay que evitar: una discrepancia
 * no se «aplica», se decide.
 *
 * SIN `<form>`, Y ESTO NO ES UNA PREFERENCIA
 *
 * El panel vive DENTRO del formulario de guardado de la sección, y un `<form>`
 * dentro de otro es HTML inválido: el analizador del navegador descarta la
 * etiqueta interna. React no lo valida al renderizar, así que el árbol se ve
 * perfecto en el código y en el servidor, y en el navegador el botón no hace
 * absolutamente nada. Le pasó a 12.2C en los tres módulos y lo encontró una
 * persona pulsando, no las pruebas.
 *
 * Así que aquí: `FormData` a mano, despacho en una transición, `type="button"`
 * y estado de trabajo visible.
 *
 * LO QUE ESTE COMPONENTE NO HACE
 *
 * No guarda nada. No abre casos. No crea acciones. «Aplicar» —cuando un
 * hallazgo trae una redacción alternativa— cambia el `textarea` del borrador y
 * se acabó: después, la persona sigue teniendo que pulsar Guardar.
 */

const COLOR: Record<ReviewSeverity, string> = {
  info: "border-hairline bg-paper",
  attention: "border-amber/40 bg-amber/10",
  conflict: "border-red-500/40 bg-red-500/10",
};

export function ContextualReviewPanel({
  documentId, sectionId, currentText, onApply, disabled,
  action = contextualReviewAction,
}: {
  documentId: string;
  sectionId: string;
  /** El texto vivo del editor. Cada revisión parte de AQUÍ. */
  currentText: string;
  /** Aplicar una redacción alternativa. Cambia el editor y NADA más. */
  onApply: (text: string) => void;
  disabled: boolean;
  /**
   * La acción, inyectable. Existe por lo que enseñó el fallo de 12.2C: si la
   * única forma de probar el panel es llamando a la acción de servidor por su
   * nombre, el cableado del componente no se prueba nunca, y «el botón no hace
   * nada» sobrevive a cincuenta y dos comprobaciones en verde.
   */
  action?: (prev: DocumentReviewState, form: FormData) => Promise<DocumentReviewState>;
}) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [enviando, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [ignorados, setIgnorados] = useState<Set<number>>(new Set());

  const hayTexto = currentText.trim().length >= 20;
  const trabajando = pending || enviando;
  if (disabled) return null;

  function revisar() {
    if (!hayTexto || trabajando) return;
    const form = new FormData();
    form.set("document_id", documentId);
    form.set("section_id", sectionId);
    form.set("user_text", currentText);
    setIgnorados(new Set());
    startTransition(() => dispatch(form));
  }

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          disabled={!hayTexto}
          data-testid="review-open"
          className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop disabled:cursor-not-allowed disabled:opacity-50"
        >
          {INTELLIGENCE_ACTIONS.review}
        </button>
        {!hayTexto ? (
          <span className="text-[11px] text-ink-soft">
            Escribe primero: esta revisión compara lo escrito con lo registrado.
          </span>
        ) : null}
      </div>
    );
  }

  const review = state.review;
  const visibles = (review?.findings ?? []).filter((_, i) => !ignorados.has(i));

  return (
    <div className="space-y-3 rounded-md border border-loop/25 bg-loop/5 p-3">
      <ErrorAlert message={state.error} />

      {/* Sin `<form>`: ver arriba. Los campos se construyen en el manejador. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={revisar}
          disabled={trabajando || !hayTexto}
          className="!w-auto px-3 py-1.5 text-xs"
        >
          {trabajando ? "Revisando…" : review ? "Revisar otra vez" : "Revisar contra Trazaloop"}
        </Button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-ink-soft hover:underline"
        >
          Cerrar
        </button>
        <span className="text-[11px] text-ink-soft">
          Compara tu texto con lo registrado. No cambia el documento.
        </span>
      </div>

      {trabajando ? (
        <p role="status" className="text-xs text-ink-soft" data-testid="review-pending">
          Buscando lo que Trazaloop tiene registrado sobre esta sección…
        </p>
      ) : null}

      {review && !trabajando ? (
        <div className="space-y-3" data-testid="review-result">
          <p className="text-xs text-ink">{review.summary}</p>

          {visibles.length === 0 ? (
            <p className="text-[11px] text-ink-soft">
              {review.findings.length === 0
                ? "No hay nada que señalar."
                : "Has descartado todos los puntos de esta revisión."}
            </p>
          ) : null}

          {review.findings.map((f, i) => ignorados.has(i) ? null : (
            <div
              key={i}
              data-testid="review-finding"
              className={`space-y-2 rounded-md border p-2 ${COLOR[f.severity]}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-ink">
                  {REVIEW_FINDING_LABEL[f.type]}
                </span>
                <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-soft">
                  {REVIEW_SEVERITY_LABEL[f.severity]}
                </span>
              </div>

              {/* Los dos lados, uno al lado del otro. Es toda la idea de la
                  pantalla: quien lee decide en dos segundos y sin creerle
                  nada a nadie. */}
              {f.userTextExcerpt || f.systemFact ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                      Tu texto dice
                    </span>
                    <p className="rounded-md border border-hairline bg-canvas p-1.5 text-[11px] text-ink-soft">
                      {f.userTextExcerpt || "—"}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink">
                      Trazaloop tiene registrado
                    </span>
                    <p className="rounded-md border border-hairline bg-surface p-1.5 text-[11px] text-ink">
                      {f.systemFact || "—"}
                    </p>
                  </div>
                </div>
              ) : null}

              <p className="text-[11px] text-ink-soft">{f.explanation}</p>
              {f.suggestedNextStep ? (
                <p className="text-[11px] text-ink">
                  <span className="font-medium">Puedes: </span>{f.suggestedNextStep}
                </p>
              ) : null}

              {/* §11 · Solo las fuentes que ESTE hallazgo usó. Nada de una
                  lista de diecisiete de las que dieciséis no vienen a cuento. */}
              <div className="flex flex-wrap items-center gap-2">
                {(state.findingSources?.[i] ?? [])
                  .filter((s) => s.deepLink)
                  .slice(0, 3)
                  .map((s) => (
                    <Link
                      key={s.ordinal}
                      href={s.deepLink!}
                      className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink hover:border-loop"
                    >
                      Ir a {s.label}
                    </Link>
                  ))}
                {f.suggestedWording ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onApply(f.suggestedWording)}
                      className="rounded-full border border-loop bg-loop/10 px-2 py-0.5 text-[10px] font-medium text-loop-deep hover:bg-loop/20"
                    >
                      Aplicar redacción
                    </button>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(f.suggestedWording)}
                      className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink hover:border-loop"
                    >
                      Copiar sugerencia
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  data-testid="review-ignore"
                  onClick={() => setIgnorados((s) => new Set(s).add(i))}
                  className="rounded-full border border-hairline px-2 py-0.5 text-[10px] text-ink-soft hover:border-loop"
                >
                  Ignorar
                </button>
              </div>
            </div>
          ))}

          {/* Lo que NO se miró, dicho en voz alta. Un contexto recortado en
              silencio se lee igual que uno completo. */}
          {(state.used?.limits ?? []).length > 0 ? (
            <div className="rounded-md border border-hairline bg-paper p-2">
              <p className="text-[10px] font-medium text-ink-soft">
                Esta revisión no ha podido mirar todo:
              </p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[10px] text-ink-soft">
                {(state.used?.limits ?? []).map((l, k) => (
                  <li key={k}>
                    {RELATED_CONTEXT_LABEL[l.type]}
                    {l.kind === "unscoped_type"
                      ? " · no hay una relación que ate ese tipo de registro a un documento"
                      : l.kind === "no_historical"
                        ? " · no guarda el estado de aquella fecha"
                        : " · había más registros de los que caben"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[10px] text-ink-soft">
            Esto no es una auditoría ni una no conformidad: son puntos para que los
            mires. Nada de lo que ves aquí ha cambiado el documento.
            {state.used ? ` · ${state.used.factCount} hecho(s) · `
              + `${state.used.queries} consulta(s)` : ""}
            {state.providerCalled === false ? " · sin llamada al modelo" : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
