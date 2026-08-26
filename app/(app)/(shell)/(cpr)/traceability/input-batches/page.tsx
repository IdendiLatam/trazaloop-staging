// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { searchInputBatches, getInputBatch } from "@/lib/db/traceability";
import { listSuppliers, listMaterials } from "@/lib/db/catalog";
import { listEvidencesForTargets } from "@/lib/db/evidences";
import { deleteInputBatchAction } from "@/server/actions/traceability";
import { InputBatchForm } from "@/components/domain/traceability/forms";
import {
  ActionButton,
  LinkEvidenceInline,
} from "@/components/domain/traceability/action-button";
import { LinkedEvidenceList } from "@/components/domain/evidences/view-link";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { MaterialInventorySection } from "@/components/domain/traceability/inventory-section";
import { SuccessAlert } from "@/components/ui/alert";
import { ImportWizard } from "@/components/domain/import/import-wizard";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

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
  searchParams: Promise<{
    edit?: string;
    supplier?: string;
    material?: string;
    import?: string;
    q?: string;
    page?: string;
    created?: string;
    updated?: string;
    focus?: string;
    inventario?: string;  // PCR-02.5: material seleccionado en el inventario
    inv_q?: string;       // PCR-02.5.1: búsqueda del inventario (server-side)
    inv_page?: string;    // PCR-02.5.1: página de la tabla agregada
    inv_lot_page?: string; // PCR-02.5.1: página del saldo por lote
  }>;
}) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const params = await searchParams;

  // PCR-01 (punto 9): paginación real en servidor + búsqueda por código.
  const [result, suppliers, materials, { data: sites }, { data: evidenceRows }] =
    await Promise.all([
      searchInputBatches(org.organizationId, {
        q: params.q,
        page: params.page,
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
  const batches = result.rows;

  // Con paginación, el registro en edición puede no estar en la página actual.
  const editing =
    batches.find((b) => b.id === params.edit) ??
    (params.edit ? await getInputBatch(org.organizationId, params.edit) : undefined) ??
    undefined;

  // PCR-01.1 (blockers 3/4): el lote creado/actualizado/enfocado se muestra
  // aunque quede fuera de la página actual — resuelto por id y fijado al
  // inicio sin duplicarlo ni cargar el listado completo.
  const focusId = params.created ?? params.updated ?? params.focus ?? null;
  const focusedBatch = focusId
    ? batches.find((b) => b.id === focusId) ??
      (await getInputBatch(org.organizationId, focusId)) ??
      null
    : null;
  const visibleBatches =
    focusedBatch && !batches.some((b) => b.id === focusedBatch.id)
      ? [focusedBatch, ...batches]
      : batches;

  // PCR-01 (punto 11): evidencias vinculadas de la página actual, en lote.
  const evidencesByBatch = await listEvidencesForTargets(
    org.organizationId,
    "input_batch",
    visibleBatches.map((b) => b.id)
  );

  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const materialOptions = materials.map((m) => ({ value: m.id, label: m.name }));
  const siteOptions = (sites ?? []).map((s) => ({ value: s.id, label: s.name }));
  const evidenceOptions = (evidenceRows ?? []).map((e) => ({ value: e.id, label: e.name }));

  // PCR-01 (puntos 2 y 7): confirmación + resaltado del registro afectado.
  const highlightId = focusId;
  const highlightChip = params.created
    ? "Creado correctamente"
    : params.updated
      ? "Guardado correctamente"
      : null;
  const confirmation = params.created
    ? "Lote de entrada creado correctamente."
    : params.updated
      ? "Cambios guardados correctamente."
      : null;

  const listExtraParams = {
    q: params.q,
    supplier: params.supplier,
    material: params.material,
  };

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

      {/* Búsqueda + filtros (PCR-01, punto 9) */}
      <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/traceability/input-batches"
          q={params.q ?? ""}
          placeholder="Buscar por código de lote, procedencia o ubicación…"
          hiddenParams={{ supplier: params.supplier, material: params.material }}
        />
        <form method="get" className="flex flex-wrap items-end gap-3">
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
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
      </div>

      <SuccessAlert message={confirmation} />

      {visibleBatches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface px-6 py-8 text-center">
          {params.q || params.supplier || params.material ? (
            <>
              <p className="text-sm font-medium">Sin resultados para esta búsqueda.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Ajusta el término o{" "}
                <Link href="/traceability/input-batches" className="text-loop underline">
                  limpia la búsqueda
                </Link>{" "}
                para ver todos los lotes.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">Aún no tienes lotes de entrada.</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
                Registra los lotes recibidos para poder conectarlos con órdenes de
                producción; el formulario está arriba en esta misma página.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {visibleBatches.map((b) => {
            const overConsumed =
              b.quantity_kg !== null && b.consumed_kg > b.quantity_kg;
            const isHighlighted = highlightId === b.id;
            const linkedEvidences = evidencesByBatch[b.id] ?? [];
            return (
              <li
                key={b.id}
                id={`lote-${b.id}`}
                className={`rounded-lg border bg-surface p-4 ${
                  isHighlighted ? "border-loop ring-2 ring-loop/30" : "border-hairline"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      <span className="code mr-2 text-xs text-loop-deep">{b.batch_code}</span>
                      {b.material_name}
                      {isHighlighted && highlightChip ? (
                        <span className="ml-2 rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-xs font-medium text-loop-deep">
                          {highlightChip}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {[
                        b.supplier_name,
                        b.residue_type ? RESIDUE_LABEL[b.residue_type] : null,
                        `recibido ${b.received_date}`,
                        b.quantity_kg !== null ? `${b.quantity_kg} kg` : "sin cantidad registrada",
                        b.consumed_kg > 0 ? `consumido ${b.consumed_kg} kg` : null,
                        b.site_name,
                        b.storage_location,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {b.quantity_kg === null ? (
                      <p className="mt-1 inline-block rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 text-xs text-amber">
                        Lote histórico sin cantidad: edítalo y registra los kg reales recibidos.
                      </p>
                    ) : null}
                    {overConsumed ? (
                      <p className="mt-1 inline-block rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 text-xs text-amber">
                        Advertencia: consumido ({b.consumed_kg} kg) supera lo recibido ({b.quantity_kg} kg)
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <ExportPdfButton exportKey="cpr.input-batch.detail" id={b.id} />
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
                <div className="mt-3 space-y-3 border-t border-hairline pt-3">
                  <LinkedEvidenceList evidences={linkedEvidences} />
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

      <ListPagination
        basePath="/traceability/input-batches"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={listExtraParams}
      />

      {/* PCR-02.5 (Bloque B, §6): INVENTARIO DE MATERIALES — después de la
          lista de lotes y antes de la importación. Derivado en la base
          (vistas 0105); sin módulo de navegación nuevo. */}
      <MaterialInventorySection
        orgId={org.organizationId}
        params={{
          inventario: params.inventario,
          inv_q: params.inv_q,
          inv_page: params.inv_page,
          inv_lot_page: params.inv_lot_page,
        }}
        extraParams={{ ...listExtraParams, page: params.page }}
      />

      <section id="importar" className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold">Importar lotes de entrada por CSV</h2>
        <p className="mb-4 text-xs text-ink-soft">
          Solo se importa si el archivo no tiene errores. Los proveedores y
          materiales del archivo deben existir en tus catálogos, y cada fila
          debe traer su cantidad en kg mayor que 0.
        </p>
        <ImportWizard entities={["input_batches"]} />
      </section>
    </div>
  );
}
