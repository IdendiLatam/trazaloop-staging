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
import { EvidenceGovernanceActions } from "@/components/domain/evidences/governance-actions";
import { PhysicalEvidenceForm, DeclarePhysicalForm } from "@/components/domain/evidences/physical-forms";
import {
  EVIDENCE_CATEGORIES,
  EVIDENCE_CATEGORY_LABEL,
  UNCATALOGUED_EVIDENCE_TYPE_LABEL,
  evidenceTypeDisplay,
  evidenceValidityLabel,
  EVIDENCE_MEDIUM_LABEL,
  EVIDENCE_REVIEW_LABEL,
  evidenceCategoryLabel,
  evidenceEffectiveLabel,
} from "@/lib/domain/evidence-governance";
import { ViewEvidenceButton } from "@/components/domain/evidences/view-link";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import {
  listInputBatches,
  listProductionOrders,
  listOutputBatches,
} from "@/lib/db/traceability";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending: { label: "Pendiente", tone: "border-amber/40 bg-amber/10 text-amber" },
  valid: { label: "Válida", tone: "border-loop/30 bg-loop/5 text-loop-deep" },
  rejected: { label: "Rechazada", tone: "border-danger/30 bg-danger/5 text-danger" },
  expired: { label: "Vencida", tone: "border-hairline bg-paper text-ink-soft" },
};

export default async function EvidencesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    detail?: string;
    /** PCR-03.1 (5.6): filtros de gobernanza */
    estado?: string;
    tipo?: string;
    medio?: string;
    archivadas?: string;
  }>;
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
    { data: requirementOptionRows },
  ] = await Promise.all([
    searchEvidences(org.organizationId, {
      q: params.q,
      page: params.page,
      status: params.estado,
      type: params.tipo,
      medium: params.medio,
      includeArchived: params.archivadas === "1",
    }),
    listSuppliers(org.organizationId),
    listFamilies(org.organizationId),
    listProducts(org.organizationId),
    listMaterials(org.organizationId),
    supabase.from("sites").select("id, name").eq("organization_id", org.organizationId),
    // PT-01 · Opciones del selector de asociación. Ya NO son «todas»: el
    // selector ofrecía pendientes, rechazadas, archivadas y vencidas, y el
    // motor las descartaba después en otra pantalla y en silencio. Dos de las
    // cuatro condiciones de PT-F05 —aceptación interna y no archivada— se
    // resuelven aquí, en SQL; la tercera (vigencia en la fecha del destino)
    // necesita saber qué destino se eligió y vive en el formulario. Las tres
    // se vuelven a comprobar en `evidence_link_confirm`, que es la barrera.
    supabase
      .from("evidences")
      .select("id, name, valid_until")
      .eq("organization_id", org.organizationId)
      .eq("status", "valid")
      .is("archived_at", null)
      .order("name"),
    listInputBatches(org.organizationId),
    listProductionOrders(org.organizationId),
    listOutputBatches(org.organizationId),
    // PCR-03.1: opciones de acuerdos/requisitos para el selector de vínculos
    supabase
      .from("customer_requirements")
      .select("id, customer_name, code, title")
      .eq("organization_id", org.organizationId)
      .order("customer_name"),
  ]);
  const evidences = result.rows;
  // El día de hoy se calcula UNA vez por render: si se calculara por fila, dos
  // filas de la misma lista podrían caer a distinto lado de la medianoche.
  const hoy = new Date().toISOString().slice(0, 10);
  const tipoDe = (v: string | null) => evidenceTypeDisplay(v);
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
    // PT-F02 · Los destinos que OCURREN un día concreto viajan con su fecha
    // empresarial. Es contra ella —y no contra hoy— como se juzga si una
    // evidencia amparaba la operación. Los destinos de catálogo (proveedor,
    // material, producto…) no la traen: no ocurren un día concreto.
    input_batch: inputBatches.map((b) => ({
      value: b.id, label: b.batch_code, referenceDate: b.received_date,
    })),
    production_order: productionOrders.map((o) => ({
      value: o.id, label: o.order_code, referenceDate: o.order_date,
    })),
    output_batch: outputBatches.map((b) => ({
      value: b.id, label: b.batch_code, referenceDate: b.produced_date,
    })),
    customer_requirement: (requirementOptionRows ?? []).map((r) => ({
      value: r.id as string,
      label: `${r.customer_name} · ${r.code} — ${r.title}`,
    })),
  };

  const listParams = { q: params.q };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Evidencias</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Evidencias de {org.organizationName}
        </h1>
        <div className="pt-1">
          <ExportPdfButton exportKey="cpr.evidence.list" filters={{ q: params.q }} />
        </div>
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

      {/* PCR-03.1 (5.2): evidencia con soporte EXCLUSIVAMENTE físico */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Registrar evidencia física (sin archivo)</h2>
        <PhysicalEvidenceForm />
      </section>

      <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/evidences"
          q={params.q ?? ""}
          placeholder="Buscar por nombre o tipo de evidencia…"
        />
        {/* PCR-03.1 (5.6): filtros combinables de gobernanza (GET) */}
        <form method="get" action="/evidences" className="flex flex-wrap items-end gap-3 text-sm">
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Estado</span>
            <select name="estado" defaultValue={params.estado ?? ""} className="rounded-md border border-hairline bg-canvas px-2 py-1.5">
              <option value="">Todos</option>
              {Object.entries(EVIDENCE_REVIEW_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Tipo</span>
            <select name="tipo" defaultValue={params.tipo ?? ""} className="rounded-md border border-hairline bg-canvas px-2 py-1.5">
              <option value="">Todos</option>
              {EVIDENCE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{EVIDENCE_CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-soft">Medio</span>
            <select name="medio" defaultValue={params.medio ?? ""} className="rounded-md border border-hairline bg-canvas px-2 py-1.5">
              <option value="">Todos</option>
              {Object.entries(EVIDENCE_MEDIUM_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 pb-1.5 text-xs text-ink-soft">
            <input type="checkbox" name="archivadas" value="1" defaultChecked={params.archivadas === "1"} />
            Incluir archivadas
          </label>
          <button type="submit" className="rounded-md border border-hairline px-3 py-1.5 hover:bg-canvas">
            Filtrar
          </button>
          {params.estado || params.tipo || params.medio || params.archivadas ? (
            <Link href="/evidences" className="pb-1.5 text-xs text-ink-soft underline-offset-2 hover:underline">
              Limpiar filtros
            </Link>
          ) : null}
        </form>
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
                    {/* PCR-03.1: gobernanza visible — medio, tipología,
                        localización física y revisión (quién/cuándo/motivo) */}
                    <p className="text-xs text-ink-soft">
                      {EVIDENCE_MEDIUM_LABEL[e.medium as keyof typeof EVIDENCE_MEDIUM_LABEL] ?? e.medium}
                      {" · "}
                      {tipoDe(e.evidence_type).label}
                      {tipoDe(e.evidence_type).uncatalogued ? (
                        <span
                          title="Este valor se escribió antes del catálogo de tipos. Se muestra tal cual: no se ha reescrito nada."
                          className="ml-1 rounded border border-hairline px-1 text-[10px] text-ink-soft"
                        >
                          {UNCATALOGUED_EVIDENCE_TYPE_LABEL}
                        </span>
                      ) : null}
                      {e.medium !== "digital" && e.physical_reference
                        ? ` · Ref. física: ${e.physical_reference}${e.physical_location ? ` (${e.physical_location})` : ""}${e.physical_custodian ? ` · custodia: ${e.physical_custodian}` : ""}`
                        : null}
                    </p>
                    {e.reviewed_at ? (
                      <p className="text-xs text-ink-soft">
                        Revisada el {new Date(e.reviewed_at).toLocaleDateString("es")}{" "}
                        {e.reviewed_by_email ? ` por ${e.reviewed_by_email}` : ""}
                        {e.review_comment ? ` — «${e.review_comment}»` : ""}
                      </p>
                    ) : null}
                    <p className="text-xs text-ink-soft">
                      {/* PT-F01 · La vigencia del CATÁLOGO es el estado de HOY.
                          Que aquí ponga «Obsoleta desde…» no significa que la
                          evidencia deje de amparar las operaciones que ya
                          amparaba: eso se juzga contra la fecha del lote, no
                          contra el calendario (PT-F02/F03). */}
                      {[
                        e.evidence_date ? `fecha ${e.evidence_date}` : null,
                        evidenceValidityLabel(e.valid_until, hoy),
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
                      {evidenceEffectiveLabel(e.status, e.archived_at)}
                    </span>
                    <EvidenceGovernanceActions
                      evidenceId={e.id}
                      status={e.status}
                      archived={Boolean(e.archived_at)}
                      canReview={canApprove}
                    />
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-3 space-y-3 rounded-md border border-hairline bg-paper p-3">
                    {e.medium === "digital" ? (
                      <details className="rounded-md border border-hairline bg-canvas p-3">
                        <summary className="cursor-pointer text-xs font-semibold text-ink">
                          Declarar soporte físico (pasará a «Digital + físico»)
                        </summary>
                        <div className="mt-3">
                          <DeclarePhysicalForm evidenceId={e.id} />
                        </div>
                      </details>
                    ) : null}
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
          evidences={(evidenceOptionRows ?? []).map((e) => ({
            value: e.id,
            label: e.name,
            validUntil: (e.valid_until as string | null) ?? null,
          }))}
          targets={targets}
        />
      </section>
    </div>
  );
}
