"use client";

import { useActionState, useState, useTransition } from "react";
import { quickEditAction, type QuickEditState } from "@/server/actions/document-authoring";
import {
  QUICK_EDIT_ACTIONS, QUICK_EDIT_LABEL, type QuickEditAction,
} from "@/lib/domain/document-authoring";
import { INTELLIGENCE_ACTIONS } from "@/lib/domain/intelligence-identity";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/alert";

const initial: QuickEditState = { error: null };

/**
 * Trazaloop · QUALITY-12.2C · «Mejorar con Intelligence», junto a la sección.
 *
 * POR QUÉ ESTE PANEL NO TIENE FORMULARIO PROPIO
 *
 * Porque vive DENTRO del formulario de guardado de la sección, y un `<form>`
 * dentro de otro `<form>` es HTML inválido: el analizador del navegador
 * descarta la etiqueta interna y sus hijos pasan al formulario de fuera. React
 * no lo valida al renderizar, así que el árbol se ve perfecto en el código y en
 * el servidor, y en el navegador el botón simplemente no hace nada.
 *
 * La primera versión de QUALITY-12.2C tenía ese error en los tres módulos. Lo
 * encontró una persona pulsando un botón, no las pruebas: todas llamaban a la
 * acción de servidor por su nombre, y esa parte funcionaba.
 *
 * Ahora la acción se despacha desde un manejador, con el `FormData` construido
 * a mano, y el botón es `type="button"`: no puede enviar el formulario de
 * guardado ni por accidente.
 *
 * LO QUE ESTE COMPONENTE NO HACE, Y ES LO MÁS IMPORTANTE
 *
 * No guarda. «Reemplazar» cambia el valor del `textarea` del borrador y nada
 * más: ni llama a la acción de guardado, ni crea una revisión, ni aprueba, ni
 * toca la revisión vigente. Después, la persona sigue teniendo que pulsar
 * Guardar como siempre.
 *
 * Esa separación es incómoda a propósito. Un botón que mejora y guarda a la vez
 * convierte una propuesta en un hecho sin que nadie lo haya mirado.
 *
 * Y no aparece si no hay texto: la ayuda mejora lo escrito, no redacta la
 * sección por nadie.
 */
export function QuickEditPanel({
  documentId, sectionId, currentText, onReplace, disabled,
  action = quickEditAction,
}: {
  documentId: string;
  sectionId: string;
  /** El texto vivo del editor. Cada intento parte de AQUÍ, no de la propuesta
   *  anterior: encadenar salidas desvía el significado poco a poco. */
  currentText: string;
  onReplace: (text: string) => void;
  disabled: boolean;
  /**
   * La acción, inyectable. Existe por lo que enseñó el fallo de este panel: si
   * la única forma de probarlo es llamando a la acción de servidor por su
   * nombre, el cableado del componente no se prueba nunca. Con esto, una
   * prueba puede pulsar el botón de verdad.
   */
  action?: (prev: QuickEditState, form: FormData) => Promise<QuickEditState>;
}) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [enviando, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [accion, setAccion] = useState<QuickEditAction>("improve_writing");

  const hayTexto = currentText.trim().length >= 20;
  const trabajando = pending || enviando;
  if (disabled) return null;

  function proponer() {
    if (!hayTexto || trabajando) return;
    const form = new FormData();
    form.set("document_id", documentId);
    form.set("section_id", sectionId);
    // El texto vivo del editor, no el de la propuesta anterior.
    form.set("user_text", currentText);
    form.set("action", accion);
    startTransition(() => dispatch(form));
  }

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAbierto(true)}
          disabled={!hayTexto}
          className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop disabled:cursor-not-allowed disabled:opacity-50"
        >
          {INTELLIGENCE_ACTIONS.improve}
        </button>
        {!hayTexto ? (
          <span className="text-[11px] text-ink-soft">
            Escribe primero el contenido: esta ayuda mejora lo que ya está escrito.
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-loop/25 bg-loop/5 p-3">
      <ErrorAlert message={state.error} />

      {/* Sin `<form>`: ver arriba. Los campos se construyen en el manejador. */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1">
          <span className="block text-[11px] font-medium text-ink">Qué quieres</span>
          <select
            value={accion}
            onChange={(e) => setAccion(e.target.value as QuickEditAction)}
            className="rounded-md border border-hairline bg-surface px-2 py-1 text-xs text-ink"
          >
            {QUICK_EDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>{QUICK_EDIT_LABEL[a]}</option>
            ))}
          </select>
        </label>

        <Button
          type="button"
          onClick={proponer}
          disabled={trabajando || !hayTexto}
          className="!w-auto px-3 py-1.5 text-xs"
        >
          {trabajando ? "Preparando…" : state.suggestion ? "Intentar otra redacción" : "Proponer"}
        </Button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-ink-soft hover:underline"
        >
          Cerrar
        </button>
      </div>

      {/* El estado de trabajo se ve. Un botón que no responde es peor que uno
          que falla: con el primero nadie sabe si pulsó. */}
      {trabajando ? (
        <p role="status" className="text-xs text-ink-soft" data-testid="quick-edit-pending">
          Preparando una propuesta… tu texto no se toca hasta que decidas.
        </p>
      ) : null}

      {state.suggestion && !trabajando ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                Texto actual
              </span>
              <p className="whitespace-pre-wrap rounded-md border border-hairline bg-canvas p-2 text-xs text-ink-soft">
                {currentText}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink">
                Propuesta
              </span>
              <p className="whitespace-pre-wrap rounded-md border border-loop/30 bg-surface p-2 text-xs text-ink">
                {state.suggestion.suggestedText}
              </p>
            </div>
          </div>

          {state.suggestion.changeSummary.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-ink-soft">
              {state.suggestion.changeSummary.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          ) : null}

          {state.suggestion.missingInformation.length > 0 ? (
            <div className="rounded-md border border-amber/40 bg-amber/10 p-2">
              <p className="text-[11px] font-medium text-amber">
                Esta sección pide datos que tu texto no tiene. No se han inventado:
              </p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[11px] text-amber/90">
                {state.suggestion.missingInformation.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          ) : null}

          {state.suggestion.warnings.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-ink-soft">
              {state.suggestion.warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onReplace(state.suggestion!.suggestedText)}
              className="rounded-full border border-loop bg-loop/10 px-3 py-1 text-xs font-medium text-loop-deep hover:bg-loop/20"
            >
              Reemplazar
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(state.suggestion!.suggestedText)}
              className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop"
            >
              Copiar
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-full border border-hairline px-3 py-1 text-xs text-ink hover:border-loop"
            >
              Descartar
            </button>
            <span className="text-[11px] text-ink-soft">
              Reemplazar solo cambia el editor. Sigues teniendo que guardar.
            </span>
          </div>

          {/* §29 · Nada de una lista de diecisiete fuentes: aquí se usaron tres
              cosas como mucho, y decirlo en una línea es más útil que una
              interfaz de citas. La procedencia completa queda en el servidor. */}
          {state.used ? (
            <p className="text-[11px] text-ink-soft">
              Contexto utilizado: tu texto
              {state.used.guidance ? ", la guía de esta sección" : ""}
              {state.used.organizationProfile ? ", el perfil de la empresa" : ""}
              {" y los datos del documento."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
