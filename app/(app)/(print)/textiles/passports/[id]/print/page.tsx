// Ruta protegida: sesión + guarda del módulo Textil → nunca se prerenderiza.
// Vista optimizada para impresión del navegador (@media print), MISMO patrón
// que TrazaDocs: NO genera PDF en servidor. Sprint T9C (Textil).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { getTechnicalPassport } from "@/lib/db/textiles-passport";
import { getCompanySettingsAction } from "@/server/actions/settings";
import {
  TEXTILE_PASSPORT_STATUS_LABEL,
  TEXTILE_PASSPORT_DISCLAIMER,
  type TextilePassportStatus,
} from "@/lib/domain/textiles-passport";
import { PassportSections, PassportFindings } from "@/components/textiles/passports/passport-sections";
import { PrintButton } from "@/components/domain/audit-support/print-button";

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : v == null ? null : String(v));

export default async function TextilePassportPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const org = await requireTextilesModule();
  const { id } = await params;
  const [passport, { data: company }] = await Promise.all([
    getTechnicalPassport(org.organizationId, id),
    getCompanySettingsAction(),
  ]);
  if (!passport) notFound();

  const status = passport.status as TextilePassportStatus;
  const snapshot = obj(passport.snapshot_json);
  const sections = obj(snapshot.sections);
  const hasSnapshot = Object.keys(sections).length > 0;
  const product = obj(sections.product_identification);
  const ref = obj(product.reference);
  const prod = obj(product.product);

  return (
    <div className="print-page space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link href={`/textiles/passports/${id}`} className="text-sm text-loop hover:underline">
          ← Volver al pasaporte
        </Link>
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-4 border-b border-hairline pb-4">
        <div className="space-y-1">
          <p className="text-xs text-ink-soft">{org.organizationName} · Trazaloop Textiles</p>
          {company?.legalName ? <p className="text-xs text-ink-soft">{company.legalName}</p> : null}
          {company?.taxId ? <p className="code text-xs text-ink-soft">NIT {company.taxId}</p> : null}
          <h1 className="text-xl font-semibold">Pasaporte técnico textil</h1>
          <p className="code text-xs text-ink-soft">
            {str(passport.passport_code)} · v{str(passport.passport_version)} ·{" "}
            {TEXTILE_PASSPORT_STATUS_LABEL[status]}
          </p>
        </div>
        <div className="text-right text-xs text-ink-soft">
          {str(ref.sku) ? <p className="font-medium text-ink">{str(ref.sku)}</p> : null}
          {str(prod.name) ? <p>{str(prod.name)}</p> : null}
          {str(passport.generated_at) ? <p>Generado: {str(passport.generated_at)?.slice(0, 10)}</p> : null}
        </div>
      </header>

      {/* Disclaimer general (visible en impresión) */}
      <p className="rounded-md border border-hairline bg-paper px-4 py-3 text-xs text-ink-soft">
        {TEXTILE_PASSPORT_DISCLAIMER}
      </p>

      {!hasSnapshot ? (
        <p className="text-sm text-ink-soft">Este pasaporte todavía no tiene un snapshot técnico generado.</p>
      ) : (
        <>
          <PassportFindings
            gaps={arr(passport.gaps_json)}
            warnings={arr(passport.warnings_json)}
            recommendations={arr(passport.recommendations_json)}
          />
          <PassportSections sections={sections} />
        </>
      )}
    </div>
  );
}
