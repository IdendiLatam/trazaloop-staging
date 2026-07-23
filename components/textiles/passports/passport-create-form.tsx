"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTextilePassportDraftAction } from "@/server/actions/textiles-passport";

/**
 * Trazaloop · Sprint T9C (Textil) · Formulario de creación de pasaporte. Solo
 * captura los inputs seguros: referencia (obligatoria), lote producido/final
 * opcional (filtrado por la referencia elegida), evaluación de circularidad
 * opcional y notas. NUNCA envía snapshot/hash/estado: la generación la hace la
 * RPC controlada vía server action. "Crear y generar" delega la generación al
 * servidor tras crear el borrador.
 */
type RefOpt = { id: string; sku: string; name: string | null; productName: string | null };
type LotOpt = { id: string; code: string; referenceId: string };
type AssessmentOpt = { id: string; code: string; status: string; referenceId: string };

export function PassportCreateForm({
  references,
  lots,
  assessments,
}: {
  references: RefOpt[];
  lots: LotOpt[];
  assessments: AssessmentOpt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [referenceId, setReferenceId] = useState("");
  const [outputLotId, setOutputLotId] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [notes, setNotes] = useState("");

  const reference = references.find((r) => r.id === referenceId) ?? null;
  // Lotes compatibles con la referencia elegida.
  const compatibleLots = useMemo(
    () => (referenceId ? lots.filter((l) => l.referenceId === referenceId) : []),
    [lots, referenceId]
  );
  // Evaluaciones de circularidad compatibles con la referencia elegida (T9C.1):
  // una evaluación de otra referencia no debe poder seleccionarse.
  const compatibleAssessments = useMemo(
    () => (referenceId ? assessments.filter((a) => a.referenceId === referenceId) : []),
    [assessments, referenceId]
  );

  function submit(generateNow: boolean) {
    setError(null);
    if (!referenceId) {
      setError("Debe seleccionar una referencia/SKU.");
      return;
    }
    startTransition(async () => {
      const res = await createTextilePassportDraftAction({
        referenceId,
        outputLotId: outputLotId || null,
        circularityAssessmentId: assessmentId || null,
        notes: notes || null,
        generateNow,
      });
      // Sin id: la creación falló; se muestra el error en el formulario.
      if (!res.passportId) {
        setError(res.error ?? "No se pudo crear el pasaporte.");
        return;
      }
      // Con id: el borrador se creó. Si además la generación falló (caso "crear
      // y generar"), se avisa en el detalle —el pasaporte quedó en borrador y
      // puede generarse desde allí— en vez de perder el mensaje.
      if (res.error) {
        router.push(`/textiles/passports/${res.passportId}?notice=generation_failed`);
        return;
      }
      router.push(`/textiles/passports/${res.passportId}`);
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <label htmlFor="reference" className="text-sm font-medium">Referencia/SKU</label>
        <select
          id="reference"
          value={referenceId}
          onChange={(e) => {
            setReferenceId(e.target.value);
            setOutputLotId("");
            setAssessmentId("");
          }}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        >
          <option value="">Seleccione una referencia…</option>
          {references.map((r) => (
            <option key={r.id} value={r.id}>
              {r.sku}{r.name ? ` · ${r.name}` : ""}
            </option>
          ))}
        </select>
        {reference ? (
          <p className="text-xs text-ink-soft">
            Producto asociado: {reference.productName ?? "—"}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="lot" className="text-sm font-medium">
          Lote producido/final <span className="text-ink-soft">(opcional)</span>
        </label>
        <select
          id="lot"
          value={outputLotId}
          onChange={(e) => setOutputLotId(e.target.value)}
          disabled={!referenceId}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Sin lote (pasaporte por referencia)</option>
          {compatibleLots.map((l) => (
            <option key={l.id} value={l.id}>{l.code}</option>
          ))}
        </select>
        {referenceId && compatibleLots.length === 0 ? (
          <p className="text-xs text-ink-soft">No hay lotes producidos/finales para esta referencia.</p>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor="assessment" className="text-sm font-medium">
          Evaluación de circularidad <span className="text-ink-soft">(opcional)</span>
        </label>
        <select
          id="assessment"
          value={assessmentId}
          onChange={(e) => setAssessmentId(e.target.value)}
          disabled={!referenceId}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="">Tomar la evaluación completada más reciente (si existe)</option>
          {compatibleAssessments.map((a) => (
            <option key={a.id} value={a.id}>{a.code} · {a.status}</option>
          ))}
        </select>
        {referenceId && compatibleAssessments.length === 0 ? (
          <p className="text-xs text-ink-soft">No hay evaluaciones de circularidad para esta referencia.</p>
        ) : null}
        <p className="text-xs text-ink-soft">
          Si no selecciona ninguna, el pasaporte tomará automáticamente la evaluación completada más
          reciente disponible para la referencia.
        </p>
      </div>

      <div className="space-y-1">
        <label htmlFor="notes" className="text-sm font-medium">
          Notas <span className="text-ink-soft">(opcional)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-hairline bg-surface px-3 py-2 text-sm"
        />
      </div>

      {error ? <p className="text-xs text-danger">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(true)}
          className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep disabled:opacity-50"
        >
          Crear y generar snapshot
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit(false)}
          className="rounded-md border border-loop/40 bg-loop/5 px-4 py-2 text-sm font-medium text-loop-deep hover:border-loop disabled:opacity-50"
        >
          Crear borrador
        </button>
      </div>
    </div>
  );
}
