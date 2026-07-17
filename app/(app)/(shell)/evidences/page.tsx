// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import {
  listSuppliers,
  listFamilies,
  listProducts,
  listMaterials,
} from "@/lib/db/catalog";
import {
  EvidenceForm,
  EvidenceLinkForm,
} from "@/components/domain/evidences/forms";
import { EvidenceRowActions } from "@/components/domain/evidences/row-actions";
import {
  listInputBatches,
  listProductionOrders,
  listOutputBatches,
} from "@/lib/db/traceability";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "border-amber/40 bg-amber/10 text-amber" },
  valid: { label: "Válida", tone: "border-loop/30 bg-loop/5 text-loop-deep" },
  rejected: { label: "Rechazada", tone: "border-danger/30 bg-danger/5 text-danger" },
  expired: { label: "Vencida", tone: "border-hairline bg-paper text-ink-soft" },
};

export default async function EvidencesPage() {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const canApprove = org.roleCode === "admin" || org.roleCode === "quality";

  const [
    { data: evidences },
    { data: links },
    suppliers,
    families,
    products,
    materials,
    { data: sites },
    inputBatches,
    productionOrders,
    outputBatches,
  ] =
    await Promise.all([
      supabase
        .from("evidences")
        .select("id, name, evidence_type, status, evidence_date, valid_until, storage_path")
        .eq("organization_id", org.organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("evidence_links")
        .select("evidence_id, target_type, target_id")
        .eq("organization_id", org.organizationId),
      listSuppliers(org.organizationId),
      listFamilies(org.organizationId),
      listProducts(org.organizationId),
      listMaterials(org.organizationId),
      supabase.from("sites").select("id, name").eq("organization_id", org.organizationId),
      listInputBatches(org.organizationId),
      listProductionOrders(org.organizationId),
      listOutputBatches(org.organizationId),
    ]);

  const linkCount = new Map<string, number>();
  // Flujo guiado (Sprint 5B): si la evidencia está vinculada a un lote de
  // salida (o a un material, cuyo flujo pasa por sus lotes), enlazamos al
  // recorrido guiado del primer lote relacionado.
  const guidedBatchByEvidence = new Map<string, string>();
  const batchIdsByMaterial = new Map<string, string>();
  for (const l of links ?? []) {
    linkCount.set(l.evidence_id, (linkCount.get(l.evidence_id) ?? 0) + 1);
    if (l.target_type === "output_batch" && !guidedBatchByEvidence.has(l.evidence_id)) {
      guidedBatchByEvidence.set(l.evidence_id, l.target_id);
    }
  }
  void batchIdsByMaterial;

  const targets = {
    supplier: suppliers.map((s) => ({ value: s.id, label: s.name })),
    material: materials.map((m) => ({ value: m.id, label: m.name })),
    product: products.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
    product_family: families.map((f) => ({ value: f.id, label: f.name })),
    site: (sites ?? []).map((s) => ({ value: s.id, label: s.name })),
    input_batch: inputBatches.map((b) => ({ value: b.id, label: b.batch_code })),
    production_order: productionOrders.map((o) => ({ value: o.id, label: o.order_code })),
    output_batch: outputBatches.map((b) => ({ value: b.id, label: b.batch_code })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Evidencias</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Evidencias de {org.organizationName}
        </h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Aquí vive el soporte documental: declaraciones de proveedor, registros
          y fichas. Una evidencia solo la valida administrador o calidad.
        </p>
        <Link
          href="/support/new?module=evidences"
          className="inline-block pt-1 text-sm text-loop hover:underline"
        >
          Crear ticket de soporte sobre evidencias
        </Link>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Nueva evidencia</h2>
        <EvidenceForm />
      </section>

      {(evidences ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface px-6 py-8 text-center">
          <p className="text-sm font-medium">Aún no tienes evidencias registradas.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
            Carga los soportes de origen y demás documentos, valídalos
            (admin o calidad) y asócialos: sin evidencia de origen validada,
            los materiales reciclados no cuentan en el cálculo. El formulario
            está arriba en esta misma página.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {(evidences ?? []).map((e) => {
            const status = STATUS_LABEL[e.status] ?? STATUS_LABEL.pending;
            const count = linkCount.get(e.id) ?? 0;
            return (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{e.name}</p>
                  <p className="text-xs text-ink-soft">
                    {[
                      e.evidence_type,
                      e.evidence_date ? `fecha ${e.evidence_date}` : null,
                      e.valid_until ? `vigente hasta ${e.valid_until}` : null,
                      e.storage_path ? "con archivo" : "sin archivo",
                      `${count} enlace(s)`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {guidedBatchByEvidence.has(e.id) ? (
                    <Link
                      href={`/guided-flow/output-batches/${guidedBatchByEvidence.get(e.id)}`}
                      className="text-xs text-loop hover:underline"
                    >
                      Ver flujo del lote relacionado
                    </Link>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.tone}`}
                  >
                    {status.label}
                  </span>
                  <EvidenceRowActions
                    evidenceId={e.id}
                    status={e.status}
                    canApprove={canApprove}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Asociar evidencia</h2>
        <p className="mb-4 text-xs text-ink-soft">
          Asocia evidencias a proveedores, materiales, productos, lotes y
          órdenes. Para que un material reciclado cuente en el cálculo, marca
          la evidencia como soporte de origen del material y valídala.
        </p>
        <EvidenceLinkForm
          evidences={(evidences ?? []).map((e) => ({ value: e.id, label: e.name }))}
          targets={targets}
        />
      </section>
    </div>
  );
}
