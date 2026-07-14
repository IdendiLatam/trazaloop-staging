"use client";

import { useMemo, useState } from "react";
import type { EvidenceMatrixRow } from "@/lib/db/audit-support";

const ROLE_LABEL: Record<string, string> = {
  output_batch_support: "Soporte del lote producido / lote final",
  production_order_support: "Soporte de la orden / corrida de producción",
  input_batch_support: "Soporte de lote de entrada",
  material_origin_support: "Soporte de origen del material",
  material_reclassification_support: "Soporte de reclasificación",
  product_support: "Soporte del producto",
  family_support: "Soporte de la familia",
  supplier_support: "Soporte del proveedor",
  other_linked_support: "Otro soporte asociado",
};

type Filter = "all" | "required" | "pending" | "valid" | "invalid";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "required", label: "Requeridas" },
  { key: "pending", label: "Pendientes" },
  { key: "valid", label: "Válidas" },
  { key: "invalid", label: "No válidas" },
];

export function EvidenceMatrixTable({ rows }: { rows: EvidenceMatrixRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    switch (filter) {
      case "required":
        return rows.filter((r) => r.is_required_for_defensibility);
      case "pending":
        return rows.filter((r) => r.evidence_status === "pending");
      case "valid":
        return rows.filter((r) => r.evidence_status === "valid");
      case "invalid":
        return rows.filter((r) => r.evidence_status !== "valid");
      default:
        return rows;
    }
  }, [rows, filter]);

  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f.key
                ? "border-loop bg-loop/5 text-loop-deep"
                : "border-hairline text-ink-soft hover:border-loop"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-ink-soft">Sin evidencias en este filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="py-2 pr-3 font-medium">Evidencia</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 pr-3 font-medium">Entidad soportada</th>
                <th className="py-2 pr-3 font-medium">Rol de soporte</th>
                <th className="py-2 pr-3 font-medium">Requerida</th>
                <th className="py-2 font-medium">Válida</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.evidence_id}-${r.support_role}-${r.linked_entity_id}-${i}`} className="border-b border-hairline last:border-0 align-top">
                  <td className="py-2 pr-3">{r.evidence_title}</td>
                  <td className="py-2 pr-3 text-xs text-ink-soft">{r.evidence_type ?? "—"}</td>
                  <td className="code py-2 pr-3 text-xs">{r.evidence_status}</td>
                  <td className="py-2 pr-3 text-xs">
                    {r.linked_entity_label ?? "—"}
                    <span className="block text-[10px] text-ink-soft">{r.linked_entity_type}</span>
                  </td>
                  <td className="py-2 pr-3 text-xs">{ROLE_LABEL[r.support_role] ?? r.support_role}</td>
                  <td className={`py-2 pr-3 text-xs font-semibold ${r.is_required_for_defensibility ? "text-loop-deep" : "text-ink-soft"}`}>
                    {r.is_required_for_defensibility ? "Sí" : "No"}
                  </td>
                  <td className={`py-2 text-xs font-semibold ${r.is_valid_for_defensibility ? "text-loop-deep" : "text-danger"}`}>
                    {r.is_valid_for_defensibility ? "Sí" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
