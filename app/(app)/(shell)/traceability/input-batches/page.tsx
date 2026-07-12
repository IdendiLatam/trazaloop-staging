// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { listInputBatches } from "@/lib/db/traceability";
import { listSuppliers, listMaterials } from "@/lib/db/catalog";
import { deleteInputBatchAction } from "@/server/actions/traceability";
import { InputBatchForm } from "@/components/domain/traceability/forms";
import {
  ActionButton,
  LinkEvidenceInline,
} from "@/components/domain/traceability/action-button";
import { ImportWizard } from "@/components/domain/import/import-wizard";

const RESIDUE_LABEL: Record<string, string> = {
  preconsumer: "Preconsumo",
  postconsumer: "Posconsumo",
  postindustrial: "Postindustrial",
  virgin: "Virgen",
  other: "Otro",
};

export default async function InputBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; supplier?: string; material?: string; import?: string }>;
}) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const params = await searchParams;

  const [batches, suppliers, materials, { data: sites }, { data: evidenceRows }] =
    await Promise.all([
      listInputBatches(org.organizationId, {
        supplierId: params.supplier || undefined,
        materialId: params.material || undefined,
      }),
      listSuppliers(org.organizationId),
      listMaterials(org.organizationId),
      supabase.from("sites").select("id, name").eq("organization_id", org.organizationId),
      supabase
        .from("evidences")
        .select("id, name")
        .eq("organization_id", org.organizationId)
        .order("name"),
    ]);

  const editing = batches.find((b) => b.id === params.edit);
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const materialOptions = materials.map((m) => ({ value: m.id, label: m.name }));
  const siteOptions = (sites ?? []).map((s) => ({ value: s.id, label: s.name }));
  const evidenceOptions = (evidenceRows ?? []).map((e) => ({ value: e.id, label: e.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link> · Lotes de entrada
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Lotes de entrada</h1>
      </header>

      {suppliers.length === 0 || materials.length === 0 ? (
        <p className="rounded-md border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          Necesitas al menos un proveedor y un material en{" "}
          <Link href="/catalog" className="font-semibold underline">Catálogos</Link>{" "}
          antes de registrar lotes de entrada.
        </p>
      ) : (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold">
            {editing ? `Editar: ${editing.batch_code}` : "Nuevo lote de entrada"}
          </h2>
          <InputBatchForm
            suppliers={supplierOptions}
            materials={materialOptions}
            sites={siteOptions}
            editing={editing}
          />
          {editing ? (
            <Link href="/traceability/input-batches" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
              Cancelar edición
            </Link>
          ) : null}
        </section>
      )}

      {/* Filtros */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-hairline bg-surface p-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ink-soft">Proveedor</span>
          <select name="supplier" defaultValue={params.supplier ?? ""} className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {supplierOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-ink-soft">Material</span>
          <select name="material" defaultValue={params.material ?? ""} className="rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {materialOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="rounded-md border border-hairline bg-surface px-3 py-1.5 text-sm font-medium hover:border-loop">
          Filtrar
        </button>
        {params.supplier || params.material ? (
          <Link href="/traceability/input-batches" className="text-sm text-ink-soft hover:underline">
            Limpiar
          </Link>
        ) : null}
      </form>

      {batches.length === 0 ? (
        <p className="text-sm text-ink-soft">No hay lotes de entrada con esos criterios.</p>
      ) : (
        <ul className="space-y-3">
          {batches.map((b) => {
            const overConsumed =
              b.quantity_kg !== null && b.consumed_kg > b.quantity_kg;
            return (
              <li key={b.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      <span className="code mr-2 text-xs text-loop-deep">{b.batch_code}</span>
                      {b.material_name}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {[
                        b.supplier_name,
                        b.residue_type ? RESIDUE_LABEL[b.residue_type] : null,
                        `recibido ${b.received_date}`,
                        b.quantity_kg !== null ? `${b.quantity_kg} kg` : null,
                        b.consumed_kg > 0 ? `consumido ${b.consumed_kg} kg` : null,
                        b.site_name,
                        b.storage_location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {overConsumed ? (
                      <p className="mt-1 inline-block rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 text-xs text-amber">
                        Advertencia: consumido ({b.consumed_kg} kg) supera lo recibido ({b.quantity_kg} kg)
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link href={`/traceability/input-batches?edit=${b.id}`} className="text-sm text-loop hover:underline">
                      Editar
                    </Link>
                    <ActionButton
                      action={deleteInputBatchAction}
                      fields={{ id: b.id }}
                      label="Eliminar"
                      pendingLabel="Eliminando…"
                    />
                  </div>
                </div>
                <div className="mt-3 border-t border-hairline pt-3">
                  <LinkEvidenceInline
                    targetType="input_batch"
                    targetId={b.id}
                    evidences={evidenceOptions}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section id="importar" className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Importar lotes de entrada por CSV</h2>
        <p className="mb-4 text-xs text-ink-soft">
          Solo se importa si el archivo no tiene errores. Los proveedores y
          materiales del archivo deben existir en tus catálogos.
        </p>
        <ImportWizard entities={["input_batches"]} />
      </section>
    </div>
  );
}
