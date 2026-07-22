// Trazaloop · Sprint T9C (Textil) · Renderizador de las secciones del snapshot
// del pasaporte técnico textil. Lee EXCLUSIVAMENTE snapshot_json.sections.* (la
// ruta real) — nunca snapshot_json.evidences.items. Server component puro,
// reutilizado por el detalle y la vista de impresión. No expone signed URLs.

import {
  TEXTILE_PASSPORT_EVIDENCES_DISCLAIMER,
  TEXTILE_PASSPORT_CIRCULARITY_DISCLAIMER,
  TEXTILE_PASSPORT_SCOPE_LABEL,
  TEXTILE_PASSPORT_SUPPORT_STRENGTH_LABEL,
  TEXTILE_PASSPORT_SEVERITY_LABEL,
  TEXTILE_PASSPORT_SEVERITY_TONE,
  TEXTILE_PASSPORT_PRIORITY_LABEL,
  TEXTILE_PASSPORT_PRIORITY_TONE,
} from "@/lib/domain/textiles-passport";
import { Badge, PassportSection, Field, EmptyNote, DisclaimerNote } from "./passport-ui";

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : v == null ? null : String(v));
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

function completeness(section: J): string {
  return str(section.completeness_status) ?? "pending";
}

/** Tabla simple y legible. */
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-hairline text-left text-ink-soft">
            {head.map((h) => (
              <th key={h} className="py-1.5 pr-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-hairline/60 align-top">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-3">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PassportSections({ sections }: { sections: J }) {
  const product = obj(sections.product_identification);
  const composition = obj(sections.fiber_composition);
  const materials = obj(sections.materials);
  const components = obj(sections.components);
  const suppliers = obj(sections.suppliers_processes);
  const evidences = obj(sections.evidences);
  const traceability = obj(sections.traceability);
  const circularity = obj(sections.circularity);
  const care = obj(sections.care_repair_eol);
  const claims = obj(sections.claims);
  const trazadocs = obj(sections.trazadocs);

  const prod = obj(product.product);
  const ref = obj(product.reference);

  return (
    <div className="space-y-4">
      {/* 2 · Producto y referencia */}
      <PassportSection id="producto" title="Producto y referencia" status={completeness(product)}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="SKU" value={str(ref.sku)} />
          <Field label="Referencia" value={str(ref.name)} />
          <Field label="Color" value={str(ref.color)} />
          <Field label="Talla" value={str(ref.size_range)} />
          <Field label="Producto" value={str(prod.name)} />
          <Field label="Categoría" value={str(prod.category)} />
          <Field label="Uso previsto" value={str(prod.intended_use)} />
          <Field label="Mercado" value={str(prod.target_market)} />
        </div>
      </PassportSection>

      {/* 3 · Composición */}
      <PassportSection id="composicion" title="Composición de fibras" status={completeness(composition)}>
        {arr(composition.scope_totals).length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {arr(composition.scope_totals).map((s, i) => {
              const scope = str(s.component_scope) ?? "other";
              return (
                <Badge key={i} tone="border-hairline bg-paper text-ink-soft">
                  {TEXTILE_PASSPORT_SCOPE_LABEL[scope] ?? scope}: {num(s.total) ?? 0}%
                </Badge>
              );
            })}
          </div>
        ) : null}
        <Table
          head={["Fibra", "Alcance", "%", "Reciclada", "Orgánica"]}
          rows={arr(composition.fibers).map((f) => [
            str(f.fiber_type) ?? "—",
            TEXTILE_PASSPORT_SCOPE_LABEL[str(f.component_scope) ?? ""] ?? str(f.component_scope) ?? "—",
            `${num(f.percentage) ?? 0}%`,
            f.is_recycled_declared ? "Sí" : "—",
            f.is_organic_declared ? "Sí" : "—",
          ])}
        />
        {arr(composition.fibers).length === 0 ? <EmptyNote>Sin composición documentada en el snapshot.</EmptyNote> : null}
      </PassportSection>

      {/* 4 · Materiales */}
      <PassportSection id="materiales" title="Materiales" status={completeness(materials)}>
        <Table
          head={["Material", "Rol", "%", "Origen", "Ficha", "Soporte comp."]}
          rows={arr(materials.items).map((m) => [
            str(m.material) ?? "—",
            str(m.role) ?? "—",
            m.estimated_percentage == null ? "—" : `${num(m.estimated_percentage) ?? 0}%`,
            str(m.country_of_origin) ?? "—",
            m.has_supplier_datasheet ? "Sí" : "—",
            m.has_composition_support ? "Sí" : "—",
          ])}
        />
        {arr(materials.items).length === 0 ? <EmptyNote>Sin materiales documentados en el snapshot.</EmptyNote> : null}
      </PassportSection>

      {/* 5 · Componentes */}
      <PassportSection id="componentes" title="Componentes y avíos" status={completeness(components)}>
        <Table
          head={["Componente", "Rol", "Separabilidad", "Reemplazable"]}
          rows={arr(components.items).map((c) => [
            str(c.component) ?? "—",
            str(c.role) ?? "—",
            str(c.separability) ?? "—",
            c.replacement_possible ? "Sí" : "—",
          ])}
        />
        {arr(components.items).length === 0 ? <EmptyNote>Sin componentes documentados en el snapshot.</EmptyNote> : null}
      </PassportSection>

      {/* 6 · Proveedores */}
      <PassportSection id="proveedores" title="Proveedores" status={completeness(suppliers)}>
        <Table
          head={["Proveedor", "Tipo", "País"]}
          rows={arr(suppliers.suppliers).map((s) => [
            str(s.name) ?? "—",
            str(s.supplier_type) ?? "—",
            str(s.country) ?? "—",
          ])}
        />
        {arr(suppliers.suppliers).length === 0 ? <EmptyNote>Sin proveedores asociados en el snapshot.</EmptyNote> : null}
      </PassportSection>

      {/* 7 · Evidencias — ruta real snapshot_json.sections.evidences.items */}
      <PassportSection id="evidencias" title="Evidencias" status={completeness(evidences)}>
        {(() => {
          const byStatus = obj(evidences.by_status);
          const counts: [string, string][] = [
            ["Aceptadas", str(byStatus.accepted) ?? "0"],
            ["En revisión", str(byStatus.pending_review) ?? "0"],
            ["Rechazadas", str(byStatus.rejected) ?? "0"],
            ["Vencidas", str(byStatus.expired) ?? "0"],
            ["Archivadas", str(byStatus.archived) ?? "0"],
          ];
          return (
            <div className="flex flex-wrap gap-2">
              {counts.map(([label, n]) => (
                <Badge key={label} tone="border-hairline bg-paper text-ink-soft">{label}: {n}</Badge>
              ))}
            </div>
          );
        })()}
        <Table
          head={["Evidencia", "Tipo", "Estado", "Entidad", "Vínculo", "Emisión", "Vence", "Archivo", "Actualizada"]}
          rows={arr(evidences.items).map((e) => [
            str(e.title) ?? "—",
            str(e.evidence_type) ?? "—",
            <span key="s">
              {str(e.status) ?? "—"}
              {str(e.support_strength) ? (
                <span className="block text-[10px] text-ink-soft">
                  {TEXTILE_PASSPORT_SUPPORT_STRENGTH_LABEL[str(e.support_strength) ?? ""] ?? ""}
                </span>
              ) : null}
            </span>,
            str(e.entity_type) ?? "—",
            str(e.link_type) ?? "—",
            str(e.document_date) ?? "—",
            str(e.valid_until) ?? "—",
            str(e.file_name) ?? "—",
            str(e.updated_at)?.slice(0, 10) ?? "—",
          ])}
        />
        {arr(evidences.items).length === 0 ? <EmptyNote>Sin evidencias vinculadas en el snapshot.</EmptyNote> : null}
        <DisclaimerNote>{TEXTILE_PASSPORT_EVIDENCES_DISCLAIMER}</DisclaimerNote>
      </PassportSection>

      {/* 8 · Trazabilidad */}
      <PassportSection id="trazabilidad" title="Trazabilidad" status={completeness(traceability)}>
        {completeness(traceability) === "not_applicable" ? (
          <EmptyNote>
            {str(traceability.note) ??
              "Este pasaporte está basado en referencia/SKU y no incluye trazabilidad de lote producido/final."}
          </EmptyNote>
        ) : (
          <>
            {(() => {
              const lot = obj(traceability.output_lot);
              const order = obj(traceability.order);
              return (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Field label="Lote" value={str(lot.code)} />
                  <Field label="Cantidad" value={lot.quantity_produced == null ? null : `${num(lot.quantity_produced) ?? 0} ${str(lot.unit) ?? ""}`} />
                  <Field label="Fecha" value={str(lot.produced_date)} />
                  <Field label="Orden/corrida" value={str(order.code)} />
                  <Field label="Estado trazabilidad" value={str(lot.traceability_status)} />
                </div>
              );
            })()}
            <Table
              head={["Lote de entrada", "Tipo", "Consumo", "Unidad"]}
              rows={arr(traceability.input_lots).map((l) => [
                str(l.lot_code) ?? "—",
                str(l.lot_type) ?? "—",
                str(l.quantity_consumed) ?? "—",
                str(l.unit) ?? "—",
              ])}
            />
            <Table
              head={["Paso", "Tipo", "Proceso", "Tercerizado", "Estado"]}
              rows={arr(traceability.process_steps).map((p) => [
                str(p.step_order) ?? "—",
                str(p.step_type) ?? "—",
                str(p.process) ?? str(p.outsourced_process) ?? str(p.name) ?? "—",
                p.is_outsourced ? "Sí" : "—",
                str(p.status) ?? "—",
              ])}
            />
            {arr(traceability.process_steps).length === 0 ? (
              <EmptyNote>Sin pasos de proceso documentados para la orden del lote.</EmptyNote>
            ) : null}
            {arr(traceability.warnings).length > 0 ? (
              <ul className="space-y-1">
                {arr(traceability.warnings).map((w, i) => (
                  <li key={i} className="text-xs text-amber">• {str(w.message)}</li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </PassportSection>

      {/* 9 · Circularidad */}
      <PassportSection id="circularidad" title="Circularidad" status={completeness(circularity)}>
        {str(circularity.assessment_code) ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Evaluación" value={str(circularity.assessment_code)} />
            <Field label="Estado" value={str(circularity.status)} />
            <Field label="Metodología" value={str(circularity.methodology)} />
            <Field label="Versión" value={str(circularity.methodology_version)} />
            <Field label="Puntaje" value={num(circularity.score) == null ? null : String(num(circularity.score))} />
            <Field label="Nivel" value={str(circularity.readiness_level)} />
            <Field label="Completada" value={str(circularity.completed_at)?.slice(0, 10)} />
          </div>
        ) : (
          <EmptyNote>
            {str(circularity.note) ?? "No hay una evaluación de circularidad completada para esta referencia."}
          </EmptyNote>
        )}
        <DisclaimerNote>{TEXTILE_PASSPORT_CIRCULARITY_DISCLAIMER}</DisclaimerNote>
      </PassportSection>

      {/* 10 · TrazaDocs */}
      <PassportSection id="trazadocs" title="TrazaDocs Textil" status={completeness(trazadocs)}>
        <Table
          head={["Código", "Documento", "Estado", "Versión"]}
          rows={arr(trazadocs.documents).map((d) => [
            str(d.code) ?? "—",
            str(d.title) ?? "—",
            str(d.status) ?? "—",
            str(d.version) ?? "—",
          ])}
        />
        {arr(trazadocs.documents).length === 0 ? <EmptyNote>Sin documentos TrazaDocs Textil relacionados.</EmptyNote> : null}
        {str(trazadocs.note) ? <EmptyNote>{str(trazadocs.note)}</EmptyNote> : null}
      </PassportSection>

      {/* 11 · Claims */}
      <PassportSection id="claims" title="Declaraciones ambientales" status={completeness(claims)}>
        {completeness(claims) === "not_applicable" ? (
          <EmptyNote>Sin declaraciones ambientales registradas en la composición.</EmptyNote>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Badge tone="border-hairline bg-paper text-ink-soft">Reciclado declarado: {str(claims.recycled_declared) ?? "0"}</Badge>
            <Badge tone="border-hairline bg-paper text-ink-soft">Orgánico declarado: {str(claims.organic_declared) ?? "0"}</Badge>
          </div>
        )}
        {str(claims.note) ? <EmptyNote>{str(claims.note)}</EmptyNote> : null}
      </PassportSection>

      {/* 12 · Cuidado, reparación, separabilidad y fin de vida */}
      <PassportSection id="cuidado" title="Cuidado, reparación y fin de vida" status={completeness(care)}>
        {arr(care.separable_components).length > 0 ? (
          <Field label="Componentes separables" value={arr(care.separable_components).map((c) => String(c)).join(", ")} />
        ) : null}
        {arr(care.replaceable_components).length > 0 ? (
          <Field label="Componentes reemplazables" value={arr(care.replaceable_components).map((c) => String(c)).join(", ")} />
        ) : null}
        {arr(care.separable_components).length === 0 && arr(care.replaceable_components).length === 0 ? (
          <EmptyNote>{str(care.note) ?? "Información de cuidado y fin de vida pendiente."}</EmptyNote>
        ) : null}
      </PassportSection>
    </div>
  );
}

/** Panel de brechas, advertencias y recomendaciones (desde los arrays raíz). */
export function PassportFindings({
  gaps,
  warnings,
  recommendations,
}: {
  gaps: J[];
  warnings: J[];
  recommendations: J[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div id="brechas" className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Brechas</h2>
        {gaps.length === 0 ? (
          <EmptyNote>Sin brechas registradas.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {gaps.map((g, i) => {
              const sev = (str(g.severity) ?? "info") as keyof typeof TEXTILE_PASSPORT_SEVERITY_TONE;
              return (
                <li key={i} className="space-y-1">
                  <Badge tone={TEXTILE_PASSPORT_SEVERITY_TONE[sev] ?? TEXTILE_PASSPORT_SEVERITY_TONE.info}>
                    {TEXTILE_PASSPORT_SEVERITY_LABEL[sev] ?? "Informativa"} · {str(g.gap_code)}
                  </Badge>
                  <p className="text-xs text-ink-soft">{str(g.message)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div id="advertencias" className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Advertencias</h2>
        {warnings.length === 0 ? (
          <EmptyNote>Sin advertencias registradas.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {warnings.map((w, i) => {
              const sev = (str(w.severity) ?? "warning") as keyof typeof TEXTILE_PASSPORT_SEVERITY_TONE;
              return (
                <li key={i} className="space-y-1">
                  <Badge tone={TEXTILE_PASSPORT_SEVERITY_TONE[sev] ?? TEXTILE_PASSPORT_SEVERITY_TONE.warning}>
                    {TEXTILE_PASSPORT_SEVERITY_LABEL[sev] ?? "Advertencia"} · {str(w.gap_code)}
                  </Badge>
                  <p className="text-xs text-ink-soft">{str(w.message)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div id="recomendaciones" className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="text-sm font-semibold">Recomendaciones internas</h2>
        {recommendations.length === 0 ? (
          <EmptyNote>Sin recomendaciones registradas.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {recommendations.map((r, i) => {
              const prio = (str(r.priority) ?? "low") as keyof typeof TEXTILE_PASSPORT_PRIORITY_TONE;
              return (
                <li key={i} className="space-y-1">
                  <Badge tone={TEXTILE_PASSPORT_PRIORITY_TONE[prio] ?? TEXTILE_PASSPORT_PRIORITY_TONE.low}>
                    Prioridad {TEXTILE_PASSPORT_PRIORITY_LABEL[prio] ?? "Baja"} · {str(r.recommendation_code)}
                  </Badge>
                  <p className="text-xs text-ink-soft">{str(r.message)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
