"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  savePublicSectionAction, completePublicDiagnosticAction,
} from "@/server/actions/public-diagnostic-assessment";

/**
 * Trazaloop · PUBLIC-DIAGNOSTICS-01F · El diagnóstico, sección a sección.
 *
 *
 * POR QUÉ UNA SECCIÓN POR PANTALLA
 *
 * 52 preguntas en una sola página parecen infinitas: la barra de desplazamiento
 * ya dice, antes de empezar, que esto va a ser largo. Repartidas en seis pasos
 * con su nombre —«Trazabilidad e identificación de lotes»— cada pantalla es una
 * conversación corta sobre un tema, y el avance se ve.
 *
 * Es la misma forma que usa el diagnóstico autenticado. Aquí importa más,
 * porque quien responde no tiene cuenta ni nada que le retenga: si abandona,
 * abandona del todo.
 *
 *
 * LA OBSERVACIÓN NO SE VE HASTA QUE HACE FALTA
 *
 * Si cada pregunta enseñara su caja de texto, la pantalla serían 52 cajas
 * vacías pidiendo que las llenen. Va detrás de «Añadir observación», y solo
 * aparece abierta si ya tiene algo escrito.
 *
 *
 * ESTE COMPONENTE NO CALCULA NADA
 *
 * Lleva la cuenta de cuántas van respondidas, que es información de avance. El
 * resultado —porcentaje, nivel, brechas— no se toca aquí ni se envía: el botón
 * de cerrar llama a una acción SIN argumentos.
 */

type Pregunta = {
  id: string;
  code: string;
  text: string;
  help: string | null;
  refs: string[];
  answer: boolean | null;
  observations: string | null;
};

type Seccion = {
  code: string;
  title: string;
  description: string | null;
  questions: Pregunta[];
};

type Estado = { answer: boolean | null; observations: string; abierta: boolean };

const MAX_OBSERVACION = 1000;

export function PublicAssessment({
  slug, sections, startSectionCode, writable, lockedMessage,
}: {
  slug: string;
  sections: Seccion[];
  /** Primera sección incompleta: determinista, no «por dónde iba el navegador». */
  startSectionCode: string | null;
  writable: boolean;
  lockedMessage: string | null;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inicio = Math.max(
    0, sections.findIndex((s) => s.code === startSectionCode));
  const [indice, setIndice] = useState(inicio);

  const [respuestas, setRespuestas] = useState<Record<string, Estado>>(() => {
    const r: Record<string, Estado> = {};
    for (const s of sections) {
      for (const q of s.questions) {
        r[q.id] = {
          answer: q.answer,
          observations: q.observations ?? "",
          abierta: (q.observations ?? "").length > 0,
        };
      }
    }
    return r;
  });

  const total = useMemo(
    () => sections.reduce((n, s) => n + s.questions.length, 0), [sections]);
  const respondidas = useMemo(
    () => Object.values(respuestas).filter((r) => r.answer !== null).length,
    [respuestas]);
  const porcentaje = total > 0 ? Math.round((respondidas / total) * 100) : 0;
  const completo = respondidas === total && total > 0;

  const seccion = sections[indice];
  const faltanAqui = seccion.questions.filter(
    (q) => respuestas[q.id]?.answer === null).length;

  function marcar(id: string, answer: boolean) {
    setRespuestas((p) => ({ ...p, [id]: { ...p[id], answer } }));
  }
  function anotar(id: string, observations: string) {
    setRespuestas((p) => ({ ...p, [id]: { ...p[id], observations } }));
  }
  function abrir(id: string) {
    setRespuestas((p) => ({ ...p, [id]: { ...p[id], abierta: true } }));
  }

  /** Solo lo RESPONDIDO. Lo que nadie tocó no viaja: sin respuesta no es «No». */
  function loContestado(s: Seccion) {
    return s.questions
      .filter((q) => respuestas[q.id]?.answer !== null)
      .map((q) => ({
        questionId: q.id,
        answer: respuestas[q.id].answer as boolean,
        observations: respuestas[q.id].observations.trim() || null,
      }));
  }

  function guardar(despues?: () => void) {
    setError(null);
    const lote = loContestado(seccion);
    if (lote.length === 0) { despues?.(); return; }
    iniciar(async () => {
      const r = await savePublicSectionAction(seccion.code, lote);
      if (r.error) { setError(r.error); return; }
      despues?.();
    });
  }

  function cerrar() {
    setError(null);
    iniciar(async () => {
      const lote = loContestado(seccion);
      if (lote.length > 0) {
        const guardado = await savePublicSectionAction(seccion.code, lote);
        if (guardado.error) { setError(guardado.error); return; }
      }
      const r = await completePublicDiagnosticAction();
      if (r.error) { setError(r.error); return; }
      router.push(`/diagnostic/${slug}/result`);
    });
  }

  const boton = "rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-60";
  const principal = `${boton} border-loop bg-loop text-white hover:opacity-90`;
  const suave = `${boton} border-hairline bg-surface text-ink hover:border-loop`;

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
          <span>Sección {indice + 1} de {sections.length} · {seccion.title}</span>
          <span className="code">{respondidas}/{total} respondidas</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
          <div className="h-full rounded-full bg-loop transition-all"
               style={{ width: `${porcentaje}%` }}
               role="progressbar" aria-valuenow={porcentaje}
               aria-valuemin={0} aria-valuemax={100} />
        </div>
      </div>

      {lockedMessage ? (
        <p role="status" className="rounded-md border border-amber/40 bg-amber/10 p-3 text-sm">
          {lockedMessage}
        </p>
      ) : null}

      {seccion.description ? (
        <p className="text-sm text-ink-soft">{seccion.description}</p>
      ) : null}

      <ol className="space-y-4">
        {seccion.questions.map((q) => {
          const estado = respuestas[q.id];
          return (
            <li key={q.id} className="rounded-lg border border-hairline bg-surface p-4">
              <p className="text-sm font-medium">
                <span className="code mr-2 text-xs text-ink-soft">{q.code}</span>
                {q.text}
              </p>
              {q.help ? <p className="mt-1 text-xs text-ink-soft">{q.help}</p> : null}
              {q.refs.length > 0 ? (
                <p className="code mt-1 text-[11px] text-ink-soft/70">{q.refs.join(" · ")}</p>
              ) : null}

              <div className="mt-3 flex gap-2" role="radiogroup" aria-label={q.text}>
                <button type="button" role="radio" disabled={!writable || pendiente}
                        aria-checked={estado.answer === true}
                        onClick={() => marcar(q.id, true)}
                        className={`rounded-md border px-4 py-1.5 text-sm font-semibold ${
                          estado.answer === true
                            ? "border-loop bg-loop text-white"
                            : "border-hairline bg-surface text-ink hover:border-loop"}`}>
                  Sí
                </button>
                <button type="button" role="radio" disabled={!writable || pendiente}
                        aria-checked={estado.answer === false}
                        onClick={() => marcar(q.id, false)}
                        className={`rounded-md border px-4 py-1.5 text-sm font-semibold ${
                          estado.answer === false
                            ? "border-ink bg-ink text-white"
                            : "border-hairline bg-surface text-ink hover:border-ink"}`}>
                  No
                </button>
              </div>

              {estado.abierta ? (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs text-ink-soft">
                    Observación (opcional)
                  </span>
                  <textarea value={estado.observations} rows={2}
                            maxLength={MAX_OBSERVACION} disabled={!writable}
                            onChange={(e) => anotar(q.id, e.target.value)}
                            className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm" />
                </label>
              ) : (
                <button type="button" onClick={() => abrir(q.id)} disabled={!writable}
                        className="mt-2 text-xs text-ink-soft underline underline-offset-4">
                  Añadir observación
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {faltanAqui > 0 ? (
        <p className="text-xs text-ink-soft">
          Faltan {faltanAqui} pregunta(s) por responder en esta sección.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/5 p-3 text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={suave}
                disabled={pendiente || indice === 0}
                onClick={() => guardar(() => setIndice((i) => i - 1))}>
          Anterior
        </button>
        {indice < sections.length - 1 ? (
          <button type="button" className={principal} disabled={pendiente || !writable}
                  onClick={() => guardar(() => setIndice((i) => i + 1))}>
            {pendiente ? "Guardando…" : "Guardar y continuar"}
          </button>
        ) : (
          <button type="button" className={principal}
                  disabled={pendiente || !writable || !completo}
                  title={completo ? undefined
                    : `Responde las ${total} preguntas para ver tu resultado`}
                  onClick={cerrar}>
            {pendiente ? "Calculando…" : "Finalizar diagnóstico"}
          </button>
        )}
      </div>

      {!completo && indice === sections.length - 1 ? (
        <p className="text-xs text-ink-soft">
          Te faltan {total - respondidas} pregunta(s) en otras secciones. Usa
          «Anterior» para volver a ellas.
        </p>
      ) : null}
    </div>
  );
}
