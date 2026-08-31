import {
  FAQ_VISIBILITY_LABEL, FAQ_VERIFICATION_LABEL, type FaqVerification,
} from "@/lib/domain/faq-admin";

/**
 * Trazaloop · PE-02B2 · §8 · La vista previa, y sus DOS caras.
 *
 * Enseña el BORRADOR tal como se leería, sin publicarlo y sin hacerlo legible
 * para nadie más: esto se pinta en el servidor de la consola, con el contenido
 * que ya viajó autorizado a un superadministrador. No existe ninguna URL que
 * sirva esto a un visitante.
 *
 * Las dos caras son distintas de verdad, no un adorno: una respuesta marcada
 * «con sesión» NO aparece en la cara pública, y verlo antes de publicar evita
 * el error de creer que se publicó algo que nadie de fuera va a encontrar.
 */

type Vista = {
  question: string;
  answerShort: string;
  answerLong: string | null;
  categoryLabel: string;
  visibility: "public" | "authenticated";
  isFeatured: boolean;
  moduleNames: string[];
};

function Respuesta({ v }: { v: Vista }) {
  return (
    <article className="rounded-lg border border-hairline bg-paper p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft">
          {v.categoryLabel}
        </span>
        {v.isFeatured ? (
          <span className="inline-flex rounded-full border border-loop/30 bg-loop/5 px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Destacada
          </span>
        ) : null}
        {v.moduleNames.map((n) => (
          <span key={n} className="inline-flex rounded-full border border-hairline bg-surface px-2 py-0.5 text-[11px] text-ink-soft">
            {n}
          </span>
        ))}
      </div>
      <h4 className="mt-2 text-base font-semibold text-ink">{v.question}</h4>
      <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink">{v.answerShort}</p>
      {v.answerLong ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{v.answerLong}</p>
      ) : null}
    </article>
  );
}

export function FaqPreview({ view }: { view: Vista }) {
  const saleEnPublica = view.visibility === "public";

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Cara pública</h3>
          <span className="text-xs text-ink-soft">Quien entra sin haber iniciado sesión</span>
        </div>
        {saleEnPublica ? (
          <Respuesta v={view} />
        ) : (
          <p className="rounded-lg border border-dashed border-hairline bg-paper p-4 text-sm text-ink-soft">
            Esta respuesta está marcada como «{FAQ_VISIBILITY_LABEL.authenticated}»,
            así que <strong className="font-medium text-ink">no aparece</strong> para
            quien no ha iniciado sesión. Si querías que se leyera desde fuera,
            cambia su visibilidad.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Cara con sesión</h3>
          <span className="text-xs text-ink-soft">Quien ya entró a Trazaloop</span>
        </div>
        <Respuesta v={view} />
      </section>

      <p className="text-xs text-ink-soft">
        Esto es el borrador. Todavía no lo ve nadie fuera de esta consola.
      </p>
    </div>
  );
}

/**
 * El bloque de gobierno editorial. Va SEPARADO de la vista previa a propósito
 * (§6): lo que se ve aquí no se publica nunca, y mezclarlo con el texto haría
 * fácil confundir una nota interna con parte de la respuesta.
 */
export function FaqGovernancePanel({
  verificationStatus, sourceBasis, verificationNote,
  externalSourceUrl, externalSourceCheckedOn, blockReason,
}: {
  verificationStatus: FaqVerification;
  sourceBasis: string | null;
  verificationNote: string | null;
  externalSourceUrl: string | null;
  externalSourceCheckedOn: string | null;
  blockReason: string | null;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">Procedencia · solo para la plataforma</h3>
        <span
          className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
            blockReason
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
              : "border-loop/30 bg-loop/5 text-loop-deep"
          }`}
        >
          {FAQ_VERIFICATION_LABEL[verificationStatus]}
        </span>
      </div>

      {blockReason ? (
        <div role="status" className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-ink">Todavía no se puede publicar</p>
          <p className="mt-1 text-sm text-ink-soft">{blockReason}</p>
        </div>
      ) : null}

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-ink-soft">En qué se apoya</dt>
          <dd className="text-ink">{sourceBasis ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Salvedad</dt>
          <dd className="text-ink">{verificationNote ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Política externa</dt>
          <dd className="break-words text-ink">{externalSourceUrl ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">Comprobada el</dt>
          <dd className="text-ink">{externalSourceCheckedOn ?? "—"}</dd>
        </div>
      </dl>

      <p className="text-xs text-ink-soft">
        Nada de este bloque sale por la FAQ pública ni por la de quien tiene sesión.
      </p>
    </div>
  );
}
