// Ruta protegida (guard del módulo Textil). Nunca se prerenderiza.
// Sprint T9C (Textil) · Detalle del pasaporte técnico textil. Lee el snapshot
// histórico ya generado (snapshot_json.sections.*) y lo presenta; no recalcula.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { getTechnicalPassport } from "@/lib/db/textiles-passport";
import { listPassportShareLinks } from "@/lib/db/textiles-passport-share";
import {
  TEXTILE_PASSPORT_STATUS_LABEL,
  TEXTILE_PASSPORT_STATUS_TONE,
  TEXTILE_PASSPORT_DISCLAIMER,
  TEXTILE_PASSPORT_INTERNAL_APPROVAL_NOTE,
  type TextilePassportStatus,
} from "@/lib/domain/textiles-passport";
import { Badge, Field } from "@/components/textiles/passports/passport-ui";
import { PassportSections, PassportFindings } from "@/components/textiles/passports/passport-sections";
import { PassportActions } from "@/components/textiles/passports/passport-actions";
import { ShareLinkManager } from "@/components/textiles/passports/share-link-manager";

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : v == null ? null : String(v));

export default async function TextilePassportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const org = await requireTextilesModule();
  const { id } = await params;
  const { notice } = await searchParams;
  const passport = await getTechnicalPassport(org.organizationId, id);
  if (!passport) notFound();

  const shareLinks = await listPassportShareLinks(org.organizationId, id);
  const shareBaseUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/textile-passport-share`;
  const canManageShare = org.roleCode === "admin" || org.roleCode === "quality";

  const status = passport.status as TextilePassportStatus;
  const snapshot = obj(passport.snapshot_json);
  const sections = obj(snapshot.sections);
  const hasSnapshot = Object.keys(sections).length > 0;
  const gaps = arr(passport.gaps_json);
  const warnings = arr(passport.warnings_json);
  const recommendations = arr(passport.recommendations_json);

  const product = obj(sections.product_identification);
  const ref = obj(product.reference);
  const prod = obj(product.product);
  const exec = obj(obj(sections.executive_summary));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Encabezado */}
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/textiles/passports" className="text-loop hover:underline">← Pasaportes</Link>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="eyebrow">Trazaloop Textiles · Pasaporte técnico</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {str(ref.sku) ?? str(passport.passport_code) ?? "Pasaporte"}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              <span className="code text-xs">{str(passport.passport_code)}</span>
              <span>· v{str(passport.passport_version)}</span>
              <Badge tone={TEXTILE_PASSPORT_STATUS_TONE[status]}>{TEXTILE_PASSPORT_STATUS_LABEL[status]}</Badge>
            </div>
          </div>
          <Link
            href={`/textiles/passports/${id}/print`}
            className="rounded-md border border-loop/40 bg-loop/5 px-3 py-1.5 text-sm font-medium text-loop-deep hover:border-loop"
          >
            Imprimir
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-lg border border-hairline bg-surface p-4 sm:grid-cols-4">
          <Field label="Producto" value={str(prod.name)} />
          <Field label="Referencia" value={str(ref.name)} />
          <Field label="Generación" value={str(passport.generated_at)?.slice(0, 10)} />
          <Field
            label="Hash de fuentes"
            value={str(passport.source_hash) ? <span className="code text-xs">{str(passport.source_hash)?.slice(0, 12)}…</span> : null}
          />
        </div>

        <PassportActions passportId={id} status={status} roleCode={org.roleCode} />
      </header>

      {/* Aviso: el borrador se creó pero la generación automática falló. */}
      {notice === "generation_failed" && !hasSnapshot ? (
        <p className="rounded-md border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-ink">
          El pasaporte se creó como borrador, pero la generación automática del snapshot no se
          completó. Revise los datos de la referencia y genere el snapshot desde aquí.
        </p>
      ) : null}

      {/* Alerta de alcance (disclaimer general) */}
      <p className="rounded-md border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-ink">
        {TEXTILE_PASSPORT_DISCLAIMER}
      </p>
      {status === "approved_internal" ? (
        <p className="rounded-md border border-hairline bg-paper px-4 py-2 text-xs text-ink-soft">
          {TEXTILE_PASSPORT_INTERNAL_APPROVAL_NOTE}
        </p>
      ) : null}

      {!hasSnapshot ? (
        /* Borrador sin snapshot generado */
        <div className="rounded-lg border border-dashed border-hairline bg-surface p-8 text-center">
          <p className="text-sm font-medium">Este pasaporte todavía no tiene un snapshot técnico.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Genere el snapshot para consolidar la composición, evidencias, trazabilidad y demás
            secciones desde los datos existentes.
          </p>
        </div>
      ) : (
        <>
          {/* Resumen ejecutivo */}
          <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
            <h2 className="text-sm font-semibold">Resumen ejecutivo</h2>
            <div className="flex flex-wrap gap-2 text-xs text-ink-soft">
              <Badge tone="border-hairline bg-paper text-ink-soft">
                Preparación: {str(exec.preparation_level) ?? "—"}
              </Badge>
              <Badge tone="border-hairline bg-paper text-ink-soft">Brechas: {gaps.length}</Badge>
              <Badge tone="border-hairline bg-paper text-ink-soft">Advertencias: {warnings.length}</Badge>
              <Badge tone="border-hairline bg-paper text-ink-soft">Recomendaciones: {recommendations.length}</Badge>
            </div>
          </section>

          {/* Brechas, advertencias, recomendaciones */}
          <PassportFindings gaps={gaps} warnings={warnings} recommendations={recommendations} />

          {/* Secciones del snapshot */}
          <PassportSections sections={sections} />

          {/* Compartir / QR — enlaces privados revocables */}
          <ShareLinkManager
            passportId={id}
            links={shareLinks}
            shareBaseUrl={shareBaseUrl}
            canManage={canManageShare}
          />
        </>
      )}
    </div>
  );
}
