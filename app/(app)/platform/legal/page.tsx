export const dynamic = "force-dynamic";

import Link from "next/link";
import { listLegalDocumentsAction } from "@/server/actions/legal-admin";
import { LEGAL_UNAVAILABLE_MESSAGE } from "@/lib/domain/legal";
import { CreateLegalVersionForm } from "@/components/domain/legal-admin/legal-admin-forms";
import { LEGAL_DOCUMENT_TYPES, LEGAL_DOCUMENT_TYPE_LABEL } from "@/lib/domain/legal";

export const metadata = { title: "Documentos legales · Plataforma" };

const fecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const ESTADO = {
  draft: "Borrador",
  active: "Vigente",
  archived: "Archivada",
} as const;

export default async function PlatformLegalPage() {
  const { documents, canManage, unavailable } = await listLegalDocumentsAction();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Plataforma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos legales</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Términos, privacidad y tratamiento de datos. Una versión vigente{" "}
          <strong className="font-medium text-ink">no se corrige</strong>: para
          cambiar lo que dice se publica una versión nueva, y quien la había
          aceptado vuelve a aceptarla.
        </p>
      </header>

      {unavailable ? (
        <div role="status" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <p className="text-sm font-medium text-ink">No se pudieron consultar los documentos</p>
          <p className="mt-1 text-sm text-ink-soft">{LEGAL_UNAVAILABLE_MESSAGE}</p>
        </div>
      ) : null}

      {LEGAL_DOCUMENT_TYPES.map((tipo) => {
        const versiones = documents.filter((d) => d.documentType === tipo);
        const vigente = versiones.find((d) => d.status === "active") ?? null;
        if (versiones.length === 0 && unavailable) return null;

        return (
          <section key={tipo} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-ink">
                {LEGAL_DOCUMENT_TYPE_LABEL[tipo]}
              </h2>
              <p className="text-xs text-ink-soft">
                {vigente
                  ? `Vigente: versión ${vigente.version}, desde el ${fecha(vigente.publishedAt)}`
                  : "Sin versión vigente"}
              </p>
            </div>

            {versiones.length === 0 ? (
              <p className="rounded-lg border border-dashed border-hairline bg-paper p-4 text-sm text-ink-soft">
                Todavía no hay ninguna versión de este documento.
              </p>
            ) : (
              <ul className="space-y-2">
                {versiones.map((d) => (
                  <li key={d.id} className="rounded-lg border border-hairline bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/platform/legal/${d.id}`}
                          className="text-sm font-semibold text-ink hover:text-loop hover:underline">
                          Versión {d.version} · {d.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {d.status === "active"
                            ? `Vigente desde el ${fecha(d.publishedAt)}`
                            : d.status === "archived"
                              ? `Vigente del ${fecha(d.publishedAt)} al ${fecha(d.retiredAt)}`
                              : "Nunca se publicó"}
                          {" · "}{d.acceptances} aceptación(es)
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          d.status === "active"
                            ? "border-loop/30 bg-loop/5 text-loop-deep"
                            : "border-hairline bg-paper text-ink-soft"
                        }`}
                      >
                        {ESTADO[d.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {canManage ? (
        <section className="space-y-3">
          <h2 className="eyebrow">Nueva versión</h2>
          <div className="rounded-lg border border-hairline bg-surface p-5">
            <CreateLegalVersionForm />
          </div>
          <p className="text-xs text-ink-soft">
            Crear no publica. Se crea como borrador, se revisa, y se publica
            cuando esté lista.
          </p>
        </section>
      ) : (
        <p className="text-sm text-ink-soft">
          Tu cuenta puede consultar los documentos legales y su historia, no
          modificarlos.
        </p>
      )}
    </div>
  );
}
