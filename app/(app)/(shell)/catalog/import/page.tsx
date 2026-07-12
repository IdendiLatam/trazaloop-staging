// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { ImportWizard } from "@/components/domain/import/import-wizard";

export default async function ImportPage() {
  const org = await requireActiveOrg();
  const supabase = await createServerClient();

  const { data: jobs } = await supabase
    .from("import_jobs")
    .select("id, entity, filename, total_rows, inserted_rows, skipped_rows, status, created_at")
    .eq("organization_id", org.organizationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const STATUS_LABEL: Record<string, string> = {
    validated: "Validado",
    committed: "Importado",
    failed: "Fallido",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/catalog" className="hover:underline">Catálogos</Link> · Importación CSV
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Importar catálogos</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Solo CSV en este sprint. Descarga la plantilla, complétala y valida
          antes de importar.
        </p>
      </header>

      <ImportWizard />

      {(jobs ?? []).length > 0 ? (
        <section className="rounded-lg border border-hairline bg-surface p-5">
          <h2 className="eyebrow mb-3">Últimas importaciones</h2>
          <ul className="divide-y divide-hairline">
            {(jobs ?? []).map((j) => (
              <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {j.filename ?? j.entity}
                  <span className="ml-2 text-xs text-ink-soft">({j.entity})</span>
                </span>
                <span className="code text-xs text-ink-soft">
                  {j.total_rows} filas · {j.inserted_rows} insertadas ·{" "}
                  {STATUS_LABEL[j.status] ?? j.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
