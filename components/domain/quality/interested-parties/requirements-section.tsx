"use client";

import { useActionState, useRef, useState } from "react";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ENTRY_KINDS, ENTRY_KIND_LABEL, interestedPartiesHint, LINK_KINDS, LINK_KIND_LABEL,
  RELEVANCE_LABEL, RELEVANCE_STATES, REQUIREMENT_KINDS, REQUIREMENT_KIND_LABEL,
  type EntryKind, type LinkKind, type RelevanceState, type RequirementKind,
} from "@/lib/domain/quality-interested-parties";
import type { InterestedPartiesHelp } from "@/lib/domain/quality-interested-parties";
import type {
  RequirementProcessRow, RequirementRow,
} from "@/lib/db/quality-interested-parties";
import {
  attachRequirementProcessAction, convertToRequirementAction, createRequirementAction,
  detachRequirementProcessAction, retireRequirementAction, setRequirementRelevanceAction,
  type IpActionState,
} from "@/server/actions/quality-interested-parties";
import { SectionHint } from "@/components/ui/section-hint";
import { Badge, RelevanceBadge } from "./badges";

const inicial: IpActionState = { error: null };
const inputClass =
  "block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:border-loop";

/**
 * QUALITY-12.3B3A · Necesidades, expectativas y requisitos.
 *
 * LOS TRES SE LLAMAN POR SU NOMBRE, y no es cosmética.
 *
 *   Necesidad     lo que la parte requiere para su propio funcionamiento.
 *   Expectativa   lo que espera aunque nadie se lo haya prometido.
 *   Requisito     lo que OBLIGA: por ley, por contrato, por norma o porque la
 *                 empresa se comprometió.
 *
 * Meter los tres bajo un campo ambiguo —«requisitos de la parte»— haría
 * imposible responder la única pregunta que importa después: qué de todo esto
 * obliga. Por eso un requisito exige subtipo y una expectativa no lo admite.
 *
 * Y convertir NO reetiqueta: crea una fila nueva que apunta a la de origen.
 * Sin eso, dentro de un año nadie sabría si el SLA salió de una petición del
 * cliente o de una decisión propia.
 */
export function RequirementsSection({
  assessmentId, requirements, processLinks, processes, canMutate,
  help,
}: {
  /** A QUÉ análisis pertenece lo que se registre aquí.
   *
   *  Se pasa explícitamente y viaja en un campo oculto. La primera versión no
   *  lo llevaba: el formulario se pintaba entero, se enviaba, y la acción
   *  respondía «falta el análisis al que pertenece». Ninguna prueba estática
   *  lo vio —el campo no existía, así que no había nada que comprobar— y la de
   *  DOM tampoco, porque comprobaba que el envío ocurría y no QUÉ llevaba. */
  assessmentId: string;
  requirements: RequirementRow[];
  processLinks: RequirementProcessRow[];
  processes: { id: string; name: string }[];
  canMutate: boolean;
  /** PE-02B4 · La ayuda administrada de la pantalla, ya cargada. */
  help?: InterestedPartiesHelp;
}) {
  const [alta, altaAction] = useActionState(createRequirementAction, inicial);
  const [entryKind, setEntryKind] = useState<EntryKind>("need");

  const porTipo = (k: EntryKind) => requirements.filter((r) => r.entryKind === k);

  return (
    <section id="requisitos" className="space-y-4 scroll-mt-20">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Necesidades, expectativas y requisitos</h2>
        <SectionHint hint={interestedPartiesHint("requirement", help)} />
      </div>
      <p className="text-sm text-ink-soft">
        Lo que esta parte necesita, lo que espera y lo que obliga. Son tres cosas distintas y
        se registran distinto: solo la tercera se puede incumplir.
      </p>

      {requirements.length === 0 ? (
        <EmptyState
          title="No se han registrado necesidades, expectativas o requisitos."
          description={
            canMutate
              ? "Empieza por lo que ya sabes que esta parte pide. Convertirlo en requisito puede "
                + "esperar: primero se escucha, después se decide qué obliga."
              : "Cuando se registren, aparecerán aquí."
          }
        />
      ) : (
        <div className="space-y-5">
          {ENTRY_KINDS.map((k) => {
            const filas = porTipo(k);
            if (filas.length === 0) return null;
            return (
              <div key={k} className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {ENTRY_KIND_LABEL[k]}
                  <span className="ml-1 font-normal text-ink-soft">({filas.length})</span>
                </h3>
                <ul className="space-y-2">
                  {filas.map((r) => (
                    <RequirementCard
                      key={r.id}
                      requirement={r}
                      links={processLinks.filter((l) => l.requirementId === r.id)}
                      processes={processes}
                      canMutate={canMutate}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {canMutate ? (
        <details className="rounded-lg border border-hairline bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium text-loop">
            Registrar necesidad, expectativa o requisito
          </summary>
          <form action={altaAction} className="mt-3 space-y-3">
            <input type="hidden" name="assessment_id" value={assessmentId} />
            <ErrorAlert message={alta.error} />
            <SuccessAlert message={alta.success ? alta.message ?? null : null} />

            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-ink">¿Qué estás registrando?</legend>
              <div className="space-y-1">
                {ENTRY_KINDS.map((k) => (
                  <label key={k} className="flex items-start gap-2 text-sm">
                    <input
                      type="radio" name="entry_kind" value={k}
                      checked={entryKind === k}
                      onChange={() => setEntryKind(k)}
                      className="mt-1"
                    />
                    <span>
                      <span className="inline-flex items-center gap-1 font-medium">
                        {ENTRY_KIND_LABEL[k]}
                        <SectionHint hint={interestedPartiesHint(k, help)} />
                      </span>
                      <span className="block text-xs text-ink-soft">{AYUDA_TIPO[k]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {entryKind === "requirement" ? (
              <label className="block space-y-1">
                <span className="block text-xs font-medium text-ink">
                  Tipo de requisito (obligatorio)
                </span>
                <select name="requirement_kind" required className={inputClass} defaultValue="">
                  <option value="" disabled>Elige de dónde viene la obligación</option>
                  {REQUIREMENT_KINDS.map((k) => (
                    <option key={k} value={k}>{REQUIREMENT_KIND_LABEL[k as RequirementKind]}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Enunciado</span>
              <input type="text" name="title" required minLength={3} className={inputClass}
                placeholder="Entrega en menos de 48 horas" />
            </label>

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">Detalle (opcional)</span>
              <textarea name="description" rows={2} className={inputClass} />
            </label>

            <label className="block space-y-1">
              <span className="block text-xs font-medium text-ink">
                De dónde sale (opcional)
              </span>
              <input type="text" name="source_note" className={inputClass}
                placeholder="Contrato marco de agosto, cláusula 4" />
            </label>

            <button
              type="submit"
              className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
            >
              Registrar
            </button>
          </form>
        </details>
      ) : null}
    </section>
  );
}

const AYUDA_TIPO: Record<EntryKind, string> = {
  need: "Lo que la parte necesita para funcionar. Todavía no obliga a nada.",
  expectation: "Lo que espera, aunque nadie se lo haya prometido. Tampoco obliga.",
  requirement: "Lo que obliga: por ley, por contrato, por norma o porque nos comprometimos.",
};

function RequirementCard({
  requirement, links, processes, canMutate,
}: {
  requirement: RequirementRow;
  links: RequirementProcessRow[];
  processes: { id: string; name: string }[];
  canMutate: boolean;
}) {
  const [conversion, conversionAction] = useActionState(convertToRequirementAction, inicial);
  const [pertinencia, pertinenciaAction] = useActionState(setRequirementRelevanceAction, inicial);
  const [retiro, retiroAction] = useActionState(retireRequirementAction, inicial);
  const [proceso, procesoAction] = useActionState(attachRequirementProcessAction, inicial);
  const [desvinculo, desvinculoAction] = useActionState(detachRequirementProcessAction, inicial);

  const [confirmandoConversion, setConfirmandoConversion] = useState(false);
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false);
  const conversionRef = useRef<HTMLFormElement>(null);
  const retiroRef = useRef<HTMLFormElement>(null);

  const esRequisito = requirement.entryKind === "requirement";

  return (
    <li className="space-y-3 rounded-lg border border-hairline bg-surface p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{requirement.title}</p>
          {requirement.description ? (
            <p className="mt-0.5 text-xs text-ink-soft">{requirement.description}</p>
          ) : null}
          {requirement.sourceNote ? (
            <p className="mt-0.5 text-xs text-ink-soft">Origen: {requirement.sourceNote}</p>
          ) : null}
          {requirement.derivedFromId ? (
            <p className="mt-0.5 text-xs text-ink-soft">
              Convertido desde una {ENTRY_KIND_LABEL.need.toLowerCase()} o expectativa previa
              {requirement.conversionRationale ? `: ${requirement.conversionRationale}` : "."}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1">
          {esRequisito && requirement.requirementKind ? (
            <Badge tone="info">
              {REQUIREMENT_KIND_LABEL[requirement.requirementKind as RequirementKind]
                ?? requirement.requirementKind}
            </Badge>
          ) : null}
          <RelevanceBadge status={requirement.relevanceStatus} />
          {requirement.effectiveTo ? <Badge tone="neutral">Retirado</Badge> : null}
        </div>
      </div>

      <ErrorAlert message={conversion.error ?? pertinencia.error ?? retiro.error
        ?? proceso.error ?? desvinculo.error} />

      {esRequisito ? (
        <div className="space-y-2 rounded-md border border-hairline/70 bg-paper p-2">
          <p className="text-xs font-medium text-ink">Procesos relacionados</p>
          {links.length === 0 ? (
            <p className="text-xs text-ink-soft">
              Ninguno todavía. Relacionar un proceso es decir dónde se atiende este requisito.
            </p>
          ) : (
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>
                    <span className="font-medium">{l.processName ?? "Proceso"}</span>
                    <span className="text-ink-soft"> · {LINK_KIND_LABEL[l.linkKind]}</span>
                    <span className="text-ink-soft"> · desde {l.effectiveFrom}</span>
                    {l.processRevisionId ? (
                      <span className="text-ink-soft"> · contra una revisión concreta</span>
                    ) : null}
                  </span>
                  {canMutate && !l.effectiveTo ? (
                    <form action={desvinculoAction}>
                      <input type="hidden" name="link_id" value={l.id} />
                      <button
                        type="submit"
                        className="rounded border border-hairline px-2 py-0.5 font-medium hover:border-loop"
                      >
                        Terminar vínculo
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {canMutate && !requirement.effectiveTo ? (
            <form action={procesoAction} className="flex flex-wrap items-end gap-2 pt-1">
              <input type="hidden" name="requirement_id" value={requirement.id} />
              <label className="space-y-1">
                <span className="block text-xs font-medium text-ink">Proceso</span>
                <select name="process_id" required className={inputClass} defaultValue="">
                  <option value="" disabled>Elige un proceso</option>
                  {processes.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-xs font-medium text-ink">Relación</span>
                <select name="link_kind" className={inputClass} defaultValue="addressed_by">
                  {LINK_KINDS.map((k) => (
                    <option key={k} value={k}>{LINK_KIND_LABEL[k as LinkKind]}</option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-medium hover:border-loop"
              >
                Relacionar proceso
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {canMutate && !requirement.effectiveTo ? (
        <div className="flex flex-wrap gap-2 border-t border-hairline pt-2">
          {!esRequisito ? (
            <details className="w-full">
              <summary className="cursor-pointer text-xs font-medium text-loop">
                Convertir en requisito
              </summary>
              <form ref={conversionRef} action={conversionAction} className="mt-2 space-y-2">
                <input type="hidden" name="origin_id" value={requirement.id} />
                <p className="text-xs text-ink-soft">
                  Se creará un requisito nuevo apuntando a esta entrada. La entrada original
                  NO desaparece: sigue siendo lo que la parte pidió.
                </p>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">Tipo de requisito</span>
                  <select name="requirement_kind" required className={inputClass} defaultValue="">
                    <option value="" disabled>Elige de dónde viene la obligación</option>
                    {REQUIREMENT_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {REQUIREMENT_KIND_LABEL[k as RequirementKind]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="block text-xs font-medium text-ink">
                    Por qué pasa a obligar (obligatorio)
                  </span>
                  <textarea name="rationale" rows={2} required className={inputClass}
                    placeholder="Quedó firmado en el contrato marco de agosto." />
                </label>
                <button
                  type="button"
                  onClick={() => setConfirmandoConversion(true)}
                  className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-xs font-medium hover:border-loop"
                >
                  Convertir
                </button>
                <ConfirmDialog
                  open={confirmandoConversion}
                  title="Convertir en requisito"
                  description={
                    "Se creará un requisito nuevo que apunta a esta entrada y registra por qué "
                    + "pasó a obligar. La entrada original se conserva tal cual: no se "
                    + "reetiqueta ni se borra."
                  }
                  confirmLabel="Convertir"
                  onCancel={() => setConfirmandoConversion(false)}
                  onConfirm={() => {
                    conversionRef.current?.requestSubmit();
                    setConfirmandoConversion(false);
                  }}
                />
              </form>
            </details>
          ) : null}

          <form action={pertinenciaAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="requirement_id" value={requirement.id} />
            <label className="space-y-1">
              <span className="block text-xs font-medium text-ink">Pertinencia</span>
              <select name="relevance_status" className={inputClass}
                defaultValue={requirement.relevanceStatus}>
                {RELEVANCE_STATES.map((r) => (
                  <option key={r} value={r}>{RELEVANCE_LABEL[r as RelevanceState]}</option>
                ))}
              </select>
            </label>
            <label className="flex-1 space-y-1">
              <span className="block text-xs font-medium text-ink">
                Justificación (obligatoria si deja de ser pertinente)
              </span>
              <input type="text" name="relevance_rationale" className={inputClass}
                defaultValue={requirement.relevanceRationale ?? ""} />
            </label>
            <button
              type="submit"
              className="rounded-md border border-hairline bg-surface px-3 py-2 text-xs font-medium hover:border-loop"
            >
              Guardar pertinencia
            </button>
          </form>

          <form ref={retiroRef} action={retiroAction}>
            <input type="hidden" name="requirement_id" value={requirement.id} />
            <button
              type="button"
              onClick={() => setConfirmandoRetiro(true)}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs font-medium hover:border-loop"
            >
              Retirar
            </button>
            <ConfirmDialog
              open={confirmandoRetiro}
              title="Retirar esta entrada"
              description={
                "Deja de estar vigente desde hoy y no se borra: sigue en el histórico, con su "
                + "periodo de vigencia, para poder explicar qué regía antes."
              }
              confirmLabel="Retirar"
              onCancel={() => setConfirmandoRetiro(false)}
              onConfirm={() => {
                retiroRef.current?.requestSubmit();
                setConfirmandoRetiro(false);
              }}
            />
          </form>
        </div>
      ) : null}
    </li>
  );
}
