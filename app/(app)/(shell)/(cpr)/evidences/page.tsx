// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import { createServerClient } from "@/lib/supabase/server";
import {
  listSuppliers,
  listFamilies,
  listProducts,
  listMaterials,
} from "@/lib/db/catalog";
import {
  searchEvidences,
  countEvidenceUsage,
  listEvidenceUsage,
} from "@/lib/db/evidences";
import {
  EvidenceForm,
  EvidenceLinkForm,
} from "@/components/domain/evidences/forms";
import { EvidenceRowActions } from "@/components/domain/evidences/row-actions";
import { ViewEvidenceButton } from "@/components/domain/evidences/view-link";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
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

export default async function EvidencesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; detail?: string }>;
}) {
  const org = await requireCprModule();
  const supabase = await createServerClient();
  const canApprove = org.roleCode === "admin" || org.roleCode === "quality";
  const params = await searchParams;

  // PCR-01 (punto 9): paginación real + búsqueda por nombre/tipo.
  const [
    result,
    suppliers,
    families,
    products,
    materials,
    { data: sites },
    { data: evidenceOptionRows },
    inputBatches,
    productionOrders,
    outputBatches,
  ] = await Promise.all([
    searchEvidences(org.organizationId, { q: params.q, page: params.page }),
    listSuppliers(org.organizationId),
    listFamilies(org.organizationId),
    listProducts(org.organizationId),
    listMaterials(org.organizationId),
    supabase.from("sites").select("id, name").eq("organization_id", org.organizationId),
    // Opciones completas del selector de asociación (solo id+nombre): el
    // formulario "Asociar evidencia" no depende de la página actual.
    supabase
      .from("evidences")
      .select("id, name")
      .eq("organization_id", org.organizationId)
      .order("name"),
    listInputBatches(org.organizationId),
    listProductionOrders(org.organizationId),
    listOutputBatches(org.organizationId),
  ]);
  const evidences = result.rows;
  const pageIds = evidences.map((e) => e.id);

  // PCR-01 (punto 11): conteo de usos de la página + detalle bajo demanda.
  const [usageCount, { data: pageLinks }] = await Promise.all([
    countEvidenceUsage(org.organizationId, pageIds),
    pageIds.length > 0
      ? supabase
          .from("evidence_links")
          .select("evidence_id, target_type, target_id")
          .eq("organization_id", org.organizationId)
          .in("evidence_id", pageIds)
      : Promise.resolve({ data: [] as { evidence_id: string; target_type: string; target_id: string }[] }),
  ]);

  const detailId = params.detail && pageIds.includes(params.detail) ? params.detail : null;
  const detailUsage = detailId
    ? await listEvidenceUsage(org.organizationId, detailId)
    : [];

  // Flujo guiado (Sprint 5B, conservado): si la evidencia está vinculada a un
  // lote producido, se enlaza el recorrido guiado de ese lote.
  const guidedBatchByEvidence = new Map<string, string>();
  for (const l of pageLinks ?? []) {
    if (l.target_type === "output_batch" && !guidedBatchByEvidence.has(l.evidence_id)) {
      guidedBatchByEvidence.set(l.evidence_id, l.target_id);
    }
  }

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

  const listParams = { q: params.q };

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

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/evidences"
          q={params.q ?? ""}
          placeholder="Buscar por nombre o tipo de evidencia…"
        />
      </div>

      {evidences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface px-6 py-8 text-center">
          {params.q ? (
            <>
              <p className="text-sm font-medium">Sin resultados para esta búsqueda.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Ajusta el término o{" "}
                <Link href="/evidences" className="text-loop underline">limpia la búsqueda</Link>.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Aún no tienes evidencias registradas.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Carga los soportes de origen y demás documentos, valídalos
                (admin o calidad) y asócialos: sin evidencia de origen validada,
                los materiales reciclados no cuentan en el cálculo. El formulario
                está arriba en esta misma página.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {evidences.map((e) => {
            const status = STATUS_LABEL[e.status] ?? STATUS_LABEL.pending;
            const count = usageCount[e.id] ?? 0;
            const isOpen = detailId === e.id;
            return (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{e.name}</p>
                    <p className="text-xs text-ink-soft">
                      {[
                        e.evidence_type,
                        e.evidence_date ? `fecha ${e.evidence_date}` : null,
                        e.valid_until ? `vigente hasta ${e.valid_until}` : null,
                        e.has_file ? "con archivo" : "sin archivo",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-3 text-xs">
                      {/* PCR-01 (punto 1): abrir el archivo con URL firmada. */}
                      {e.has_file ? <ViewEvidenceButton evidenceId={e.id} compact /> : null}
                      {/* PCR-01 (punto 11): Evidencia → Registro. */}
                      <Link
                        href={
                          isOpen
                            ? `/evidences?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(params.page ? { page: params.page } : {}) }).toString()}`
                            : `/evidences?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(params.page ? { page: params.page } : {}), detail: e.id }).toString()}`
                        }
                        className="text-loop hover:underline"
                      >
                        {isOpen ? `Utilizada en (${count}) ▾` : `Utilizada en (${count})`}
                      </Link>
                      {guidedBatchByEvidence.has(e.id) ? (
                        <Link
                          href={`/guided-flow/output-batches/${guidedBatchByEvidence.get(e.id)}`}
                          className="text-loop hover:underline"
                        >
                          Ver flujo del lote relacionado
                        </Link>
                      ) : null}
                    </p>
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
                </div>

                {isOpen ? (
                  <div className="mt-3 rounded-md border border-hairline bg-paper p-3">
                    <p className="mb-2 text-xs font-semibold text-ink">
                      Utilizada en {detailUsage.length === 1 ? "1 registro" : `${detailUsage.length} registros`}
                    </p>
                    {detailUsage.length === 0 ? (
                      <p className="text-xs text-ink-soft">
                        Esta evidencia aún no está asociada a ningún registro.
                        Asóciala desde la sección de abajo o desde el registro
                        correspondiente.
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {detailUsage.map((u) => (
                          <li
                            key={`${u.target_type}-${u.target_id}-${u.link_role ?? ""}`}
                            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs"
                          >
                            <span>
                              <span className="text-ink-soft">{u.target_type_label}:</span>{" "}
                              <span className="font-medium text-ink">{u.label}</span>
                              {u.link_role ? (
                                <span className="text-ink-soft"> · {u.link_role}</span>
                              ) : null}
                            </span>
                            {u.href ? (
                              <Link href={u.href} className="text-loop hover:underline">
                                Ir al registro
                              </Link>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ListPagination
        basePath="/evidences"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={listParams}
      />

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Asociar evidencia</h2>
        <p className="mb-4 text-xs text-ink-soft">
          Asocia evidencias a proveedores, materiales, productos, lotes y
          órdenes. Para que un material reciclado cuente en el cálculo, marca
          la evidencia como soporte de origen del material y valídala.
        </p>
        <EvidenceLinkForm
          evidences={(evidenceOptionRows ?? []).map((e) => ({ value: e.id, label: e.name }))}
          targets={targets}
        />
      </section>
    </div>
  );
}
