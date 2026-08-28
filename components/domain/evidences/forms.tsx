"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  beginEvidenceUploadAction,
  finalizeEvidenceUploadAction,
  cancelEvidenceUploadAction,
  linkEvidenceAction,
  type EvidenceActionState,
} from "@/server/actions/evidences";
import { uploadFileToIntentPath } from "@/lib/storage/direct-upload";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  EVIDENCE_TYPE_OPTIONS,
  isEvidenceApplicableAt,
} from "@/lib/domain/evidence-governance";

const initial: EvidenceActionState = { error: null };

/**
 * T9F.5B.1 · CARGA DIRECTA: el archivo NO viaja en FormData hacia la Server
 * Action. Flujo: begin (solo metadata) → PUT directo del navegador a la ruta
 * EXACTA del intent → finalize (solo intentId; el servidor verifica el objeto
 * físico y su firma binaria antes de registrar nada).
 */
export function EvidenceForm() {
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading" | "finalizing">("idle");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const pending = phase !== "idle";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    const realFile = file instanceof File && file.size > 0 ? file : null;

    setPhase("saving");
    const begin = await beginEvidenceUploadAction({
      name: String(data.get("name") ?? "").trim(),
      evidenceType: String(data.get("evidence_type") ?? "").trim() || null,
      evidenceDate: String(data.get("evidence_date") ?? "") || null,
      responsible: String(data.get("responsible") ?? "").trim() || null,
      observations: String(data.get("observations") ?? "").trim() || null,
      validUntil: String(data.get("valid_until") ?? "") || null,
      file: realFile
        ? {
            name: realFile.name,
            sizeBytes: realFile.size,
            mimeType: realFile.type || "application/octet-stream",
          }
        : null,
    });
    if (begin.error !== null) {
      setPhase("idle");
      setError(begin.error);
      return;
    }
    if (!begin.upload || !realFile) {
      setPhase("idle");
      form.reset();
      router.refresh();
      return;
    }

    setPhase("uploading");
    const uploaded = await uploadFileToIntentPath({
      bucketId: begin.upload.bucketId,
      objectPath: begin.upload.objectPath,
      file: realFile,
    });
    if (!uploaded.ok) {
      // Compensación: se cancela la reserva y se intenta el retiro CONFIRMADO.
      await cancelEvidenceUploadAction(begin.upload.intentId);
      setPhase("idle");
      setError(`La evidencia se creó, pero ${uploaded.message.toLowerCase()}`);
      router.refresh();
      return;
    }

    setPhase("finalizing");
    const finalized = await finalizeEvidenceUploadAction(begin.upload.intentId);
    setPhase("idle");
    if (finalized.error) {
      setError(finalized.error);
      router.refresh();
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <ErrorAlert message={error} />
      <Field label="Nombre" name="name" required />
      {/* PT-01 · Este campo era de TEXTO LIBRE mientras el de evidencia física
          y el filtro de la lista usaban una lista cerrada. Toda evidencia
          creada por aquí quedaba invisible al filtro salvo que alguien
          escribiera a mano exactamente `origin_supplier`. Misma fuente ahora
          para los tres sitios: EVIDENCE_TYPE_OPTIONS. */}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Tipo (opcional)</span>
        <select
          name="evidence_type"
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">Sin tipo</option>
          {EVIDENCE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fecha de la evidencia (opcional)" name="evidence_date" type="date" />
        <Field label="Vigente hasta (opcional)" name="valid_until" type="date" />
      </div>
      <Field label="Responsable (opcional)" name="responsible" />
      <Field label="Observaciones (opcional)" name="observations" />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Archivo (opcional)</span>
        <input
          type="file"
          name="file"
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-md file:border file:border-hairline file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <span className="mt-1 block text-xs text-ink-soft">
          Se guarda en el repositorio privado de tu empresa.
        </span>
      </label>
      <Button type="submit" disabled={pending} className="!w-auto">
        {phase === "saving"
          ? "Guardando…"
          : phase === "uploading"
            ? "Subiendo archivo…"
            : phase === "finalizing"
              ? "Verificando archivo…"
              : "Crear evidencia"}
      </Button>
    </form>
  );
}

/** `referenceDate` solo la traen los destinos que ocurren un día concreto
 *  (lotes y órdenes). Un proveedor no tiene fecha: se juzga contra hoy. */
export type LinkTargetOption = { value: string; label: string; referenceDate?: string | null };

/** Lo que el selector necesita saber de una evidencia para decidir si puede
 *  ofrecerla. Nada más: ni el archivo, ni el tipo, ni quién la subió. */
export type LinkableEvidence = { value: string; label: string; validUntil: string | null };

/**
 * PT-01 · Asociar una evidencia a un destino.
 *
 * TRES COSAS CAMBIARON AQUÍ, Y LAS TRES POR EL MISMO MOTIVO
 *
 * El selector ofrecía TODAS las evidencias de la empresa: pendientes,
 * rechazadas, archivadas y vencidas incluidas. La persona elegía una, pulsaba
 * «Asociar», y el vínculo se creaba igual — el motor de cálculo la
 * descartaría después, en silencio y en otra pantalla.
 *
 *   1 · La página ya solo trae las aceptadas y sin archivar (eso es SQL).
 *   2 · Aquí se descartan las que no estaban vigentes EN LA FECHA DEL
 *       DESTINO — no en la de hoy. Una evidencia vencida el año pasado sigue
 *       amparando un lote recibido cuando estaba vigente, y ofrecerla es
 *       correcto (PT-F02/F03).
 *   3 · Confirmar es un paso aparte. Sin él la base rechaza: `p_confirmed`
 *       viaja como campo del formulario y cancelar no escribe nada.
 *
 * El filtro de aquí NO es la barrera. La barrera es `evidence_link_confirm`,
 * que vuelve a comprobarlo todo en la base. Esto es cortesía: que no se pueda
 * elegir algo que va a ser rechazado.
 */
export function EvidenceLinkForm({
  evidences,
  targets,
}: {
  evidences: LinkableEvidence[];
  targets: Record<string, LinkTargetOption[]>;
}) {
  const [state, formAction, pending] = useActionState(linkEvidenceAction, initial);
  const [targetType, setTargetType] = useState<string>("supplier");
  const [linkKind, setLinkKind] = useState<string>("general");
  const [targetId, setTargetId] = useState<string>("");
  const [evidenceId, setEvidenceId] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const linkFormRef = useRef<HTMLFormElement>(null);

  const TYPE_LABEL: Record<string, string> = {
    supplier: "Proveedor",
    material: "Material",
    product: "Producto",
    product_family: "Familia de producto",
    site: "Sede",
    input_batch: "Lote de entrada",
    production_order: "Orden / corrida de producción",
    output_batch: "Lote producido / lote final",
    // PCR-03.1 (5.5): la evidencia también soporta acuerdos/requisitos.
    customer_requirement: "Acuerdo / requisito de cliente",
  };

  const options = targets[targetType] ?? [];
  const selectedTarget = options.find((t) => t.value === targetId) ?? null;

  // La fecha contra la que se juzga. `undefined`/`null` en el destino
  // significa «de catálogo»: no ocurre un día concreto, así que se mira hoy.
  // Es la misma regla que aplica `evidence_target_reference_date` en la base.
  const hoy = new Date().toISOString().slice(0, 10);
  const referenceDate = selectedTarget?.referenceDate ?? hoy;
  const esFechaDeOperacion = Boolean(selectedTarget?.referenceDate);

  const elegibles = evidences.filter((e) =>
    isEvidenceApplicableAt({ validUntil: e.validUntil }, referenceDate)
  );
  const descartadas = evidences.length - elegibles.length;
  const evidenciaElegida = elegibles.find((e) => e.value === evidenceId) ?? null;

  return (
    <form ref={linkFormRef} action={formAction} className="space-y-4">
      <ErrorAlert message={state.error} />
      <SuccessAlert message={state.warning ? null : state.success ?? null} />
      {state.warning ? (
        <p
          role="status"
          className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber"
        >
          {state.warning}
        </p>
      ) : null}
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Evidencia</span>
        <select
          name="evidence_id"
          required
          value={evidenceId}
          onChange={(e) => setEvidenceId(e.target.value)}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">— Selecciona —</option>
          {elegibles.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-soft">
          Solo se ofrecen evidencias aceptadas internamente, sin archivar y
          vigentes {esFechaDeOperacion
            ? `en la fecha del destino (${referenceDate})`
            : "a día de hoy"}.
          {descartadas > 0
            ? ` ${descartadas} evidencia${descartadas === 1 ? "" : "s"} no estaba${descartadas === 1 ? "" : "n"} vigente${descartadas === 1 ? "" : "s"} en esa fecha.`
            : ""}
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Tipo de destino</span>
        <select
          name="target_type"
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value);
            setTargetId("");   // el destino anterior es de otro tipo
          }}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Tipo de vínculo</span>
        <select
          name="link_kind"
          value={targetType === "material" ? linkKind : "general"}
          onChange={(e) => setLinkKind(e.target.value)}
          disabled={targetType !== "material"}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm disabled:opacity-60"
        >
          <option value="general">Soporte general</option>
          <option value="material_origin">Soporte de origen del material</option>
          <option value="material_reclassification">
            Soporte de reclasificación del material
          </option>
        </select>
        <span className="mt-1 block text-xs text-ink-soft">
          {targetType === "material"
            ? "Para que un material reciclado cuente en el cálculo, márcala como soporte de origen y valídala."
            : "El soporte de origen o reclasificación solo aplica a materiales."}
        </span>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">Destino</span>
        <select
          name="target_id"
          required
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="block w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">— Selecciona —</option>
          {options.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {options.length === 0 ? (
          <span className="mt-1 block text-xs text-ink-soft">
            No hay registros de este tipo todavía. Créalos en catálogos.
          </span>
        ) : null}
      </label>

      <Field
        label="Rol del enlace (opcional)"
        name="link_role"
        hint="Por ejemplo: soporte de origen, ficha técnica."
      />

      {/* PT-F05 · La confirmación es un campo del formulario, no un valor por
          defecto del servidor: sin él la base rechaza. Solo se pone al
          confirmar, así que cancelar no puede escribir nada. */}
      <input type="hidden" name="confirmed" value={confirming ? "1" : ""} />

      <Button
        type="button"
        disabled={pending || !evidenceId || !targetId}
        onClick={() => setConfirming(true)}
        className="!w-auto"
      >
        {pending ? "Asociando…" : "Asociar evidencia"}
      </Button>

      <ConfirmDialog
        open={confirming}
        title="Confirmar la asociación"
        description={
          `Vas a asociar «${evidenciaElegida?.label ?? ""}» a «${selectedTarget?.label ?? ""}».` +
          ` Se registrará que estaba aceptada internamente y vigente ${
            esFechaDeOperacion
              ? `en la fecha de la operación (${referenceDate})`
              : `a día de hoy (${referenceDate})`
          }, y ese registro no cambiará después aunque la evidencia sí lo haga.`
        }
        confirmLabel="Confirmar asociación"
        cancelLabel="Cancelar"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          // El campo oculto ya vale "1" en este render; se envía el formulario
          // de verdad. Cancelar sale por la otra rama sin tocar nada.
          linkFormRef.current?.requestSubmit();
          setConfirming(false);
        }}
      />
    </form>
  );
}
