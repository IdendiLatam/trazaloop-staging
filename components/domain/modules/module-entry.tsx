import Link from "next/link";
import type { DerivedModuleState } from "@/lib/modules/access";
import { formatRemainingTrial } from "@/lib/modules/access";
import {
  ACTIVATE_FULL_HREF, ACTIVATE_FULL_LABEL,
  DERIVED_STATE_HINT, DERIVED_STATE_LABEL,
} from "@/lib/modules/messages";
import { isNavigable, presentationFor } from "@/lib/modules/entry";

/**
 * Trazaloop · PE-01B · Las piezas de la puerta.
 *
 * DOS TARJETAS, UNA REGLA
 *
 * El protagonista y los especializados se pintan distinto —esa diferencia ES la
 * jerarquía— pero comunican el estado exactamente igual. Un módulo dice lo mismo
 * de sí mismo esté arriba o abajo.
 *
 * LO QUE NINGUNA DE LAS DOS HACE
 *
 *   · **No es un enlace si no lleva a ningún sitio.** Ni «Próximamente», ni un
 *     módulo no incluido, ni uno que no se pudo comprobar. Un enlace
 *     deshabilitado es una promesa rota con estilo.
 *   · **No dice «no lo tienes» cuando no lo sabe.** Ese es el defecto PE-D1, y
 *     la diferencia se ve aquí: `unavailable` tiene su propio texto y su propio
 *     tono.
 *   · **No enseña precio, almacenamiento ni cuota.** No ayudan a decidir a cuál
 *     entrar, que es la única pregunta de esta pantalla.
 */

function fecha(iso: string): string {
  try {
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric", month: "long", year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export type ModuleEntryModel = {
  key: string;
  name: string;
  copy: string;
  state: DerivedModuleState;
  expiresAt: string | null;
  href: string | null;
  enterLabel: string;
};

/** El distintivo de estado. Con TEXTO: nunca solo el color. */
function StateBadge({ state }: { state: DerivedModuleState }) {
  const p = presentationFor(state);
  const tono =
    p === "enterable" ? "border-loop/40 bg-loop/10 text-loop-deep"
    // PROD-LAUNCH-01C.4 · La consulta no es un error ni una urgencia: es un
    // estado normal del producto. Ni verde de «todo bien» ni ámbar de aviso.
    : p === "read_only" ? "border-ink-soft/30 bg-paper text-ink"
    : p === "unavailable" ? "border-amber/40 bg-amber/10 text-amber"
    : p === "future" ? "border-hairline bg-paper text-ink-soft"
    : "border-hairline bg-paper text-ink-soft";
  return (
    <span className={`inline-flex w-fit rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tono}`}>
      {DERIVED_STATE_LABEL[state]}
    </span>
  );
}

/** El detalle del estado: la fecha de una prueba, o la frase de su bloqueo. */
function StateDetail({ state, expiresAt }: {
  state: DerivedModuleState; expiresAt: string | null;
}) {
  if (state === "demo_active" && expiresAt) {
    const queda = formatRemainingTrial(expiresAt, new Date());
    return (
      <p className="text-xs text-ink-soft">
        Vence el {fecha(expiresAt)}{queda ? ` · queda ${queda}` : ""}.
      </p>
    );
  }
  if (presentationFor(state) === "enterable") return null;
  return <p className="text-xs text-ink-soft">{DERIVED_STATE_HINT[state]}</p>;
}

// ---------------------------------------------------------------------------
// El protagonista
// ---------------------------------------------------------------------------

export function HeroModuleCard({ model }: { model: ModuleEntryModel }) {
  const navegable = isNavigable(model.state, model.href);
  const soloConsulta = presentationFor(model.state) === "read_only";
  return (
    <section
      aria-labelledby="hero-module"
      className="rounded-xl border border-loop/30 bg-loop/5 p-6 sm:p-8"
    >
      <div className="flex flex-col gap-3">
        <StateBadge state={model.state} />
        <h2 id="hero-module" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {model.name}
        </h2>
        <p className="max-w-2xl text-sm text-ink-soft sm:text-base">{model.copy}</p>
        <StateDetail state={model.state} expiresAt={model.expiresAt} />
        {/* PROD-LAUNCH-01C.4 · En consulta se entra IGUAL, y al lado está la
            salida. Las dos cosas juntas: la tarjeta que solo ofrecía «Activar
            Full» dejaba la información dentro sin puerta. */}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {navegable ? (
            <Link
              href={model.href!}
              className="inline-flex w-fit items-center rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              {model.enterLabel} →
            </Link>
          ) : null}
          {soloConsulta ? (
            <Link
              href={ACTIVATE_FULL_HREF}
              className="inline-flex w-fit items-center rounded-md border border-loop/40 px-4 py-2 text-sm font-semibold text-loop-deep hover:bg-loop/10"
            >
              {ACTIVATE_FULL_LABEL}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Los especializados
// ---------------------------------------------------------------------------

export function SpecializedModuleCard({ model }: { model: ModuleEntryModel }) {
  const navegable = isNavigable(model.state, model.href);
  const soloConsulta = presentationFor(model.state) === "read_only";
  const cuerpo = (
    <>
      <StateBadge state={model.state} />
      <span className="text-base font-semibold">{model.name}</span>
      <span className="text-xs text-ink-soft">{model.copy}</span>
      <StateDetail state={model.state} expiresAt={model.expiresAt} />
      {navegable && !soloConsulta ? (
        <span className="mt-auto pt-1 text-sm font-medium text-loop">
          {model.enterLabel} →
        </span>
      ) : null}
    </>
  );

  // PROD-LAUNCH-01C.4 · En consulta la tarjeta lleva DOS destinos —el módulo y
  // el plan—, así que deja de poder ser un enlace envolvente: un enlace dentro
  // de otro enlace no es HTML válido y el lector de pantalla anuncia cualquier
  // cosa. Se pinta como artículo con sus dos enlaces dentro.
  if (soloConsulta) {
    return (
      <article
        aria-label={`${model.name} · ${DERIVED_STATE_LABEL[model.state]}`}
        className="flex flex-col gap-1.5 rounded-lg border border-hairline bg-surface p-4"
      >
        {cuerpo}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
          {model.href ? (
            <Link href={model.href} className="text-sm font-medium text-loop hover:underline">
              {model.enterLabel} →
            </Link>
          ) : null}
          <Link
            href={ACTIVATE_FULL_HREF}
            className="text-sm font-medium text-ink-soft hover:text-loop hover:underline"
          >
            {ACTIVATE_FULL_LABEL}
          </Link>
        </div>
      </article>
    );
  }

  // Enlace SOLO si de verdad lleva a algún sitio. Lo demás es un artículo: un
  // ancla deshabilitada se anuncia como enlace y no lo es.
  if (navegable) {
    return (
      <Link
        href={model.href!}
        className="flex flex-col gap-1.5 rounded-lg border border-hairline bg-surface p-4 transition-colors hover:border-loop"
      >
        {cuerpo}
      </Link>
    );
  }
  return (
    <article
      aria-label={`${model.name} · ${DERIVED_STATE_LABEL[model.state]}`}
      className="flex flex-col gap-1.5 rounded-lg border border-hairline bg-paper p-4"
    >
      {cuerpo}
    </article>
  );
}
