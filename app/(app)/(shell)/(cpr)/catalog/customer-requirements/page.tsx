// Ruta protegida CPR (layout (cpr) aplica requireCprModule).
export const dynamic = "force-dynamic";

/**
 * PCR-03.1 (5.4/5.5) · Acuerdos / requisitos de cliente — modelo MÍNIMO.
 * Qué exige o acordó el cliente, su vigencia, su estado y sus vínculos con
 * producto / lote producido / orden y con las evidencias que lo soportan.
 * Sin CRM, sin flujos comerciales: solo lo necesario para responder en
 * auditoría "¿qué te pidió el cliente y con qué lo soportas?".
 */
import Link from "next/link";
import { requireCprModule } from "@/lib/auth/require-cpr-module";
import {
  listCustomerRequirements,
  getCustomerRequirement,
  listRequirementLinksFor,
} from "@/lib/db/customer-requirements";
import { listEvidencesForTargets } from "@/lib/db/evidences";
import { RequirementForm, RequirementRowControls, RequirementLinkForm } from
  "@/components/domain/customer-requirements/forms";
import { ListSearchForm, ListPagination } from "@/components/ui/list-controls";
import { LinkedEvidenceList } from "@/components/domain/evidences/view-link";
import { ExportPdfButton } from "@/components/ui/export-pdf-button";

export default async function CustomerRequirementsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; focus?: string }>;
}) {
  const org = await requireCprModule();
  const params = await searchParams;
  const result = await listCustomerRequirements(org.organizationId, {
    q: params.q,
    page: params.page,
  });
  // (rev. 03.1–03.3.1, hallazgo 7) «Ir al registro» desde una evidencia
  // llega con ?focus=<id>: el requisito se resuelve por id y se FIJA arriba
  // aunque quede fuera de la página actual (patrón PCR-01.1).
  let rows = result.rows;
  if (params.focus && !rows.some((r) => r.id === params.focus)) {
    const focused = await getCustomerRequirement(org.organizationId, params.focus);
    if (focused) rows = [focused, ...rows];
  } else if (params.focus) {
    rows = [...rows].sort((a, b) => (a.id === params.focus ? -1 : b.id === params.focus ? 1 : 0));
  }
  const ids = rows.map((r) => r.id);
  const [linksByReq, evidencesByReq] = await Promise.all([
    listRequirementLinksFor(org.organizationId, ids),
    listEvidencesForTargets(org.organizationId, "customer_requirement", ids),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-xl font-semibold">Acuerdos y requisitos de cliente</h1>
        <div className="pt-1">
          <ExportPdfButton exportKey="cpr.customer-requirement.list" />
        </div>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Registra qué exige o acordó cada cliente, en qué periodo, y vincúlalo
          con tus productos, lotes producidos / lotes finales, órdenes o
          corridas y con las evidencias que lo soportan. Estos vínculos
          aparecerán en el ejercicio de trazabilidad y en el expediente por
          lote.
        </p>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Nuevo acuerdo / requisito</h2>
        <RequirementForm />
      </section>

      <div className="rounded-lg border border-hairline bg-surface p-4">
        <ListSearchForm
          basePath="/catalog/customer-requirements"
          q={params.q ?? ""}
          placeholder="Buscar por cliente, código o título…"
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface px-6 py-8 text-center">
          <p className="text-sm font-medium">
            {params.q ? "Sin resultados para esta búsqueda." : "Aún no hay acuerdos o requisitos registrados."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline bg-surface">
          {rows.map((r) => {
            const links = linksByReq.get(r.id) ?? [];
            const evidences = evidencesByReq[r.id] ?? [];
            return (
              <li
                key={r.id}
                id={`registro-${r.id}`}
                className={`px-4 py-4 ${params.focus === r.id ? "bg-canvas" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {r.customer_name} · <span className="code">{r.code}</span> — {r.title}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {[
                        r.active ? "Vigente" : "Inactivo",
                        r.starts_on ? `desde ${r.starts_on}` : null,
                        r.ends_on ? `hasta ${r.ends_on}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.description ? (
                      <p className="mt-1 max-w-xl text-xs text-ink-soft">{r.description}</p>
                    ) : null}
                  </div>
                  <RequirementRowControls requirementId={r.id} active={r.active} />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-hairline bg-paper p-3">
                    <p className="text-xs font-semibold text-ink">Vinculado con</p>
                    {links.length === 0 ? (
                      <p className="mt-1 text-xs text-ink-soft">Sin vínculos todavía.</p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-xs text-ink-soft">
                        {links.map((l) => (
                          <li key={l.id} className="flex items-center justify-between gap-2">
                            <span>{l.target_label}</span>
                            <RequirementRowControls
                              requirementId={r.id}
                              active={r.active}
                              unlinkId={l.id}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2">
                      <RequirementLinkForm requirementId={r.id} />
                    </div>
                  </div>
                  <div className="rounded-md border border-hairline bg-paper p-3">
                    <p className="text-xs font-semibold text-ink">Evidencias que lo soportan</p>
                    {evidences.length === 0 ? (
                      <p className="mt-1 text-xs text-ink-soft">
                        Sin evidencias asociadas. Asócialas desde{" "}
                        <Link href="/evidences" className="text-loop underline">Evidencias</Link>{" "}
                        (destino «Acuerdo / requisito de cliente»).
                      </p>
                    ) : (
                      <LinkedEvidenceList evidences={evidences} />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ListPagination
        basePath="/catalog/customer-requirements"
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        extraParams={{ q: params.q }}
      />
    </div>
  );
}
