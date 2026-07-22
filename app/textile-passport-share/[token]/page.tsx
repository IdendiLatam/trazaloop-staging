// Página PÚBLICA tokenizada (sin login): vista compartida privada y reducida de
// un pasaporte técnico textil. Resuelve el token SOLO vía la RPC controlada
// resolve_textile_passport_share (anon no lee la tabla). No indexable. Sprint
// T9D (Textil). No es un pasaporte oficial ni una certificación.
export const dynamic = "force-dynamic";

import { resolveSharedPassport } from "@/lib/db/textiles-passport-share";
import { TEXTILE_SHARE_VIEW_LABEL } from "@/lib/domain/textiles-passport";
import { PassportSections, PassportFindings } from "@/components/textiles/passports/passport-sections";
import { Wordmark } from "@/components/layout/logo";

// No indexar la vista compartida.
export const metadata = {
  title: "Pasaporte técnico textil — vista compartida",
  robots: { index: false, follow: false },
};

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" ? (v as J) : {});
const arr = (v: unknown): J[] => (Array.isArray(v) ? (v as J[]) : []);
const str = (v: unknown): string | null => (typeof v === "string" ? v : v == null ? null : String(v));

export default async function SharedPassportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await resolveSharedPassport(token);

  // Mensaje genérico: no revela si el token existió ni a qué organización.
  if (!result || result.ok !== true) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mb-6 flex justify-center"><Wordmark /></div>
        <h1 className="text-lg font-semibold">Enlace no disponible</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Este enlace no está disponible. Puede haber expirado, haber sido revocado o no ser válido.
          Solicite un enlace nuevo a quien se lo compartió.
        </p>
      </main>
    );
  }

  const passport = obj(result.passport);
  const snapshot = obj(passport.snapshot);
  const sections = obj(snapshot.sections);
  const share = obj(result.share);
  const hasSnapshot = Object.keys(sections).length > 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6 space-y-3 border-b border-hairline pb-4">
        <div className="flex items-center justify-between gap-3">
          <Wordmark />
          <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] text-ink-soft">
            {TEXTILE_SHARE_VIEW_LABEL}
          </span>
        </div>
        <div className="space-y-1">
          <p className="eyebrow">Pasaporte técnico textil</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {str(passport.passport_code) ?? "Pasaporte"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <span>v{str(passport.passport_version)}</span>
            {str(passport.organization_name) ? <span>· {str(passport.organization_name)}</span> : null}
            {str(passport.generated_at) ? <span>· Generado {str(passport.generated_at)?.slice(0, 10)}</span> : null}
          </div>
          {str(share.label) ? <p className="text-xs text-ink-soft">Etiqueta: {str(share.label)}</p> : null}
        </div>
      </header>

      {/* Disclaimer general (obligatorio, visible) */}
      <p className="mb-6 rounded-md border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-ink">
        {str(snapshot.disclaimer) ??
          "Este pasaporte técnico textil es una herramienta interna de preparación documental y trazabilidad. No equivale a certificación, sello, declaración regulatoria oficial ni pasaporte digital de producto oficial."}
      </p>

      {!hasSnapshot ? (
        <p className="text-sm text-ink-soft">Este pasaporte no tiene un snapshot técnico disponible.</p>
      ) : (
        <div className="space-y-4">
          <PassportFindings
            gaps={arr(passport.gaps)}
            warnings={arr(passport.warnings)}
            recommendations={arr(passport.recommendations)}
          />
          <PassportSections sections={sections} />
        </div>
      )}

      <footer className="mt-8 border-t border-hairline pt-4 text-center text-[11px] text-ink-soft">
        Vista compartida de solo lectura generada con Trazaloop. No constituye certificación ni
        pasaporte digital de producto oficial.
      </footer>
    </main>
  );
}
