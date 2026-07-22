// Ruta protegida (guard del módulo en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T8 (Textil) · TrazaDocs Textil: estructuras base por
// categoría, documentos de la empresa y creación desde plantilla.

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import {
  listTextileTrazadocsTemplates,
  listTextileTrazadocsDocuments,
} from "@/lib/db/textiles-trazadocs";
import {
  TEXTILE_TRAZADOCS_DISCLAIMER,
  TEXTILE_TRAZADOCS_CATEGORIES,
  textileTrazadocCategoryFor,
} from "@/lib/domain/textiles-trazadocs";
import { DOCUMENT_STATUS_LABEL, canCreateDocument, type DocumentStatus } from "@/lib/domain/trazadocs";
import { CreateTextileTrazadocButton } from "@/components/domain/textiles/create-trazadoc-button";

export default async function TextileTrazadocsPage() {
  const org = await requireTextilesModule();
  const [templates, documents] = await Promise.all([
    listTextileTrazadocsTemplates(),
    listTextileTrazadocsDocuments(org.organizationId),
  ]);
  const canCreate = canCreateDocument(org.roleCode as never);
  const docByBlueprintName = new Map(documents.map((d) => [d.title.trim().toLowerCase(), d]));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles</p>
        <h1 className="text-2xl font-semibold tracking-tight">TrazaDocs Textil</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Construye y mantiene la documentación técnica para trazabilidad, evidencias,
          declaraciones ambientales y preparación circular textil.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_TRAZADOCS_DISCLAIMER}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/textiles" className="font-medium text-loop hover:underline">
            ← Módulo Textil
          </Link>
          {["/textiles/catalogs", "/textiles/products", "/textiles/evidences", "/textiles/traceability", "/textiles/circularity"].map((href) => (
            <Link key={href} href={href} className="text-loop hover:underline">
              {href.split("/")[2]}
            </Link>
          ))}
        </div>
      </header>

      {documents.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Documentos de la empresa ({documents.length})</h2>
          <ul className="space-y-2">
            {documents.map((d) => (
              <li key={d.documentId}>
                <Link
                  href={`/textiles/trazadocs/${d.documentId}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm transition-colors hover:border-loop"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{d.title}</span>
                    <span className="block text-xs text-ink-soft">
                      {[
                        `v${d.currentVersion}`,
                        d.ownerName ? `Responsable: ${d.ownerName}` : "",
                        d.updatedAt ? `Actualizado: ${d.updatedAt.slice(0, 10)}` : "",
                        `${d.filledSectionsCount}/${d.sectionsCount} secciones con contenido`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full border border-hairline bg-paper px-2 py-0.5 text-[10px] text-ink-soft">
                    {DOCUMENT_STATUS_LABEL[d.status as DocumentStatus] ?? d.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Estructuras base textiles ({templates.length})</h2>
        {TEXTILE_TRAZADOCS_CATEGORIES.map((category) => {
          const inCategory = templates.filter((t) => textileTrazadocCategoryFor(t.code) === category);
          if (inCategory.length === 0) return null;
          return (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{category}</h3>
              <ul className="space-y-2">
                {inCategory.map((t) => {
                  const existing = docByBlueprintName.get(t.name.trim().toLowerCase());
                  return (
                    <li
                      key={t.blueprintId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-surface p-3 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block font-medium">
                          <span className="code mr-2 text-xs text-ink-soft">{t.code}</span>
                          {t.name}
                        </span>
                        {t.description ? (
                          <span className="block max-w-xl text-xs text-ink-soft">{t.description}</span>
                        ) : null}
                        <span className="block text-[11px] text-ink-soft">
                          {t.sectionsCount} secciones ({t.requiredSectionsCount} requeridas)
                        </span>
                      </span>
                      <span className="shrink-0">
                        {existing ? (
                          <Link
                            href={`/textiles/trazadocs/${existing.documentId}`}
                            className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-xs font-medium text-loop hover:border-loop"
                          >
                            Abrir / continuar
                          </Link>
                        ) : canCreate ? (
                          <CreateTextileTrazadocButton blueprintId={t.blueprintId} />
                        ) : (
                          <span className="text-[11px] text-ink-soft">Crea administración, calidad o consultoría</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
