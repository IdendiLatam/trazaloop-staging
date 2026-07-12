// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { listMaterials, listClassifications } from "@/lib/db/catalog";
import { createServerClient } from "@/lib/supabase/server";
import { deleteMaterialAction } from "@/server/actions/catalog";
import { MaterialForm, ReclassifyForm } from "@/components/domain/catalog/forms";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();
  const [materials, classifications, { data: evidenceRows }] = await Promise.all([
    listMaterials(org.organizationId),
    listClassifications(),
    supabase
      .from("evidences")
      .select("id, name")
      .eq("organization_id", org.organizationId)
      .order("name"),
  ]);
  const { edit } = await searchParams;
  const editing = materials.find((m) => m.id === edit);

  const canApprove = org.roleCode === "admin" || org.roleCode === "quality";
  const classByCode = new Map(classifications.map((c) => [c.code, c]));
  const evidenceOptions = (evidenceRows ?? []).map((e) => ({
    value: e.id,
    label: e.name,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/catalog" className="hover:underline">Catálogos</Link> · Materiales
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Materiales</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          La clasificación de origen define qué podrá contarse como reciclado en
          el cálculo (Sprint 4). El material recuperado en el mismo proceso nunca
          cuenta; el postindustrial no cuenta por defecto y solo puede
          reclasificarse con justificación y evidencia.
        </p>
      </header>

      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold">
          {editing ? `Editar: ${editing.name}` : "Nuevo material"}
        </h2>
        <MaterialForm
          classifications={classifications.map((c) => ({
            value: c.code,
            label: c.label,
          }))}
          editing={editing}
        />
        {editing ? (
          <Link href="/catalog/materials" className="mt-3 inline-block text-xs text-ink-soft hover:underline">
            Cancelar edición
          </Link>
        ) : null}
      </section>

      {materials.length === 0 ? (
        <p className="text-sm text-ink-soft">Aún no hay materiales registrados.</p>
      ) : (
        <ul className="space-y-3">
          {materials.map((m) => {
            const cls = classByCode.get(m.classification_code);
            const reclassTarget =
              cls?.can_reclassify_to != null
                ? classByCode.get(cls.can_reclassify_to)
                : null;
            const alreadyReclassified = m.reclassified_to_code !== null;

            return (
              <li key={m.id} className="rounded-lg border border-hairline bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{m.name}</p>
                    <p className="text-xs text-ink-soft">
                      {m.classification_label}
                      {cls?.never_counts ? " · nunca cuenta como reciclado" : ""}
                      {cls?.eligible_as_recycled ? " · elegible como reciclado" : ""}
                    </p>
                    {alreadyReclassified ? (
                      <p className="mt-1 rounded-md border border-loop/30 bg-loop/5 px-2 py-1 text-xs text-loop-deep">
                        Reclasificado a{" "}
                        {classByCode.get(m.reclassified_to_code!)?.label ??
                          m.reclassified_to_code}{" "}
                        con soporte. Justificación: {m.reclassification_justification}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link href={`/catalog/materials?edit=${m.id}`} className="text-sm text-loop hover:underline">
                      Editar
                    </Link>
                    <form action={deleteMaterialAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="text-sm text-danger hover:underline">
                        Eliminar
                      </button>
                    </form>
                  </div>
                </div>

                {reclassTarget && !alreadyReclassified ? (
                  canApprove ? (
                    <ReclassifyForm
                      materialId={m.id}
                      toCode={reclassTarget.code}
                      toLabel={reclassTarget.label}
                      evidences={evidenceOptions}
                    />
                  ) : (
                    <p className="mt-3 rounded-md border border-hairline bg-paper px-3 py-2 text-xs text-ink-soft">
                      Este material podría reclasificarse a {reclassTarget.label},
                      pero solo administrador o calidad pueden aprobarlo.
                    </p>
                  )
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
