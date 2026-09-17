import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";
import { readCommercialCatalog } from "@/lib/db/commercial-catalog";
import { resolveVisitorState } from "@/lib/db/pricing-visitor";
import { resolveUpgradeAvailability } from "@/lib/billing/upgrade-availability";
import { isPublicRegistrationEnabled } from "@/lib/auth/public-registration";
import { trialTagline } from "@/lib/plans/commercial-catalog";
import { resolvePlanCta, resolvePrimaryCta } from "@/lib/plans/pricing-cta";
import { COMMERCIAL_FAQ, TAX_NOTICE } from "@/lib/plans/commercial-copy";
import { PricingPlans } from "@/components/domain/commercial/pricing-plans";
import { PlanComparison } from "@/components/domain/commercial/plan-comparison";

/**
 * Trazaloop · COMMERCIAL-UX-01D · Planes y precios.
 *
 *
 * QUÉ ES ESTA PÁGINA Y QUÉ NO ES
 *
 * Es PRESENTACIÓN. Enseña lo que la autoridad comercial dice y lleva a los
 * flujos que ya existen. No calcula un precio, no calcula un impuesto, no
 * aplica un descuento, no convierte una moneda y no concede nada.
 *
 * El importe que alguien acaba pagando lo produce `billing_create_quote` al
 * contratar, con su regla fiscal, su promoción y su tipo de cambio del día. Lo
 * de aquí y lo de allí pueden coincidir porque leen la misma autoridad debajo,
 * pero solo uno de los dos es el total: el otro es información.
 *
 *
 * NI UNA CIFRA ESCRITA AQUÍ
 *
 * Ni un precio, ni un tamaño, ni un número de créditos, ni un minuto. Todo sale
 * de `readCommercialCatalog()`, que lee las vistas públicas. Si mañana Full
 * pasa a costar otra cosa, esta página lo dice sin que nadie toque React — y
 * hay una prueba que se pone roja si aparece un número de negocio en este
 * fichero.
 *
 *
 * SIN SESIÓN, Y SIN DEPENDER DE ELLA
 *
 * El catálogo se lee como `anon` gracias a 0213. La sesión se mira solo para
 * afinar el botón, y si falla se responde «anónimo» y la página se pinta
 * entera. Una página de precios que se cae porque no pudo leer un estado
 * opcional pierde exactamente a quien venía a comprar.
 */
export const dynamic = "force-dynamic";

/**
 * La metadata también sale del catálogo.
 *
 * La primera versión escribía «48 horas» a mano aquí, y una prueba la cazó. Es
 * el mismo defecto que en cualquier otro sitio de la página, solo que peor: lo
 * que queda en un buscador se corrige tarde y mal, y quien llega desde ahí ya
 * leyó la promesa vieja.
 *
 * Si el catálogo no se puede leer, la descripción se queda sin la mención a la
 * prueba en vez de arriesgar una duración inventada.
 */
export async function generateMetadata() {
  const catalogo = await readCommercialCatalog();
  const prueba = catalogo === null
    ? null : trialTagline(catalogo.trial, catalogo.saasPlans);
  const descripcion =
    "Trazabilidad, documentación técnica y evidencias con una plataforma que "
    + "tu equipo gestiona."
    + (prueba === null ? "" : ` ${prueba}.`);
  return {
    title: "Planes y precios · Trazaloop",
    description: descripcion,
    alternates: { canonical: "/planes" },
    openGraph: {
      title: "Planes y precios · Trazaloop",
      description: `Compara los planes de Trazaloop. ${descripcion}`,
      type: "website" as const,
    },
  };
}

export default async function PlanesPage() {
  // Las tres lecturas son independientes: el catálogo no necesita saber quién
  // mira, y quien mira no cambia el catálogo.
  const [catalogo, visitante] = await Promise.all([
    readCommercialCatalog(),
    resolveVisitorState(),
  ]);

  const capacidades = {
    registrationOpen: isPublicRegistrationEnabled(),
    // La MISMA función que gobierna el panel de mejora en la ficha de
    // facturación. Si el carril que cobra Extra no puede cobrar, no se promete
    // desde aquí tampoco: sería el mismo defecto con más público.
    upgradeTransactional: resolveUpgradeAvailability().transactional,
  };
  const principal = resolvePrimaryCta(visitante, capacidades);
  const prueba = catalogo?.trial ?? null;
  const titularPrueba = catalogo === null
    ? null : trialTagline(prueba, catalogo.saasPlans);

  return (
    <PublicShell currentPath="/planes">
      {/* 1 · HERO ------------------------------------------------------- */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-ink
                         sm:text-5xl">
            Tu sistema de gestión, gestionado por tu equipo
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-ink-soft">
            Trazaloop es la plataforma donde implementas y sostienes la
            trazabilidad, la documentación técnica y las evidencias de tu
            operación. Sin depender de que alguien de fuera venga a mantenerlo.
          </p>

          {titularPrueba !== null ? (
            <p className="mt-6 inline-flex items-center rounded-full border
                          border-loop/30 bg-loop/5 px-4 py-2 text-sm font-medium
                          text-loop">
              {titularPrueba}
            </p>
          ) : null}

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {principal.href !== null && principal.label !== null ? (
              <Enlace href={principal.href} tono="primary">{principal.label}</Enlace>
            ) : null}
            <Enlace href="#planes" tono="quiet">Ver los planes</Enlace>
          </div>
        </div>
      </section>

      {/* 2 · LA PRUEBA -------------------------------------------------- */}
      {prueba !== null ? (
        <section aria-labelledby="prueba" className="border-b border-hairline bg-canvas">
          <div className="mx-auto max-w-5xl px-6 py-12">
            <h2 id="prueba" className="text-2xl font-semibold text-ink">
              {prueba.headline} durante {prueba.durationLabel}
            </h2>
            <p className="mt-3 max-w-2xl text-ink-soft">
              {prueba.shortDescription} No pedimos tarjeta y no se cobra nada al
              terminar: la prueba caduca sola y tu empresa se queda en Free, con
              todo lo que hayas cargado.
            </p>
            {/* La prueba NO es un cuarto plan y esta frase es la que lo
                sostiene: se dice de qué plan es y qué pasa después. */}
            <p className="mt-3 text-sm text-ink-soft">
              Es una concesión temporal del plan{" "}
              {catalogo?.saasPlans.find((p) => p.code === prueba.effectivePlanCode)
                ?.headline ?? prueba.effectivePlanCode}
              , no un plan aparte. Los créditos de Intelligence de la prueba son
              los suyos y no se suman a los del plan contratado.
            </p>
          </div>
        </section>
      ) : null}

      {/* 3 · LOS PLANES ------------------------------------------------- */}
      <section id="planes" aria-labelledby="planes-titulo"
               className="border-b border-hairline">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 id="planes-titulo" className="text-2xl font-semibold text-ink">
            Los planes
          </h2>

          {catalogo === null ? (
            // Sin dato NO es «no hay planes». Decirlo es más honesto que pintar
            // una parrilla vacía, que le diría a quien la mire que no vendemos
            // nada.
            <p className="mt-4 max-w-2xl text-ink-soft">
              Ahora mismo no podemos mostrar los planes. Vuelve en un momento o{" "}
              <a href="mailto:contacto@idendi.org" className="text-loop underline">
                escríbenos
              </a>{" "}
              y te los contamos.
            </p>
          ) : (
            <>
              <PricingPlans
                planes={catalogo.saasPlans.map((p) => ({
                  plan: p,
                  cta: resolvePlanCta(p.code, visitante, capacidades),
                }))}
              />
              <p className="mt-6 max-w-2xl text-sm text-ink-soft">{TAX_NOTICE}</p>
            </>
          )}
        </div>
      </section>

      {/* 4 · LA COMPARACIÓN --------------------------------------------- */}
      {catalogo !== null ? (
        <section aria-labelledby="comparacion" className="border-b border-hairline">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 id="comparacion" className="text-2xl font-semibold text-ink">
              Qué incluye cada uno
            </h2>
            <p className="mt-3 max-w-2xl text-ink-soft">
              Todas las cifras salen del catálogo vigente. Lo que no aparece es
              porque no hay una diferencia que contar.
            </p>
            <PlanComparison planes={catalogo.saasPlans} />
          </div>
        </section>
      ) : null}

      {/* 5 · EL ACOMPAÑAMIENTO ------------------------------------------ */}
      {catalogo !== null && catalogo.services.length > 0 ? (
        <section aria-labelledby="acompanamiento"
                 className="border-b border-hairline bg-canvas">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 id="acompanamiento" className="text-2xl font-semibold text-ink">
              Acompañamiento
            </h2>
            {/* La frase que impide el malentendido entero. Va la primera y sin
                adornos: quien lea por encima tiene que llevarse esto. */}
            <p className="mt-3 max-w-2xl font-medium text-ink">
              Es un complemento opcional, no un plan.
            </p>
            {catalogo.services.map((s) => (
              <div key={s.code}
                   className="mt-6 max-w-3xl rounded-lg border border-hairline
                              bg-paper p-6">
                <p className="text-ink-soft">{s.shortDescription}</p>
                <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-2 text-sm">
                  <div>
                    <dt className="text-ink-soft">Alcance de referencia</dt>
                    <dd className="font-medium text-ink">{s.referenceScope}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-soft">Referencia</dt>
                    <dd className="font-medium text-ink">{s.referencePrice}</dd>
                  </div>
                </dl>
                <ul className="mt-4 space-y-1 text-sm text-ink-soft">
                  {s.bullets.map((b) => <li key={b}>· {b}</li>)}
                </ul>
                <p className="mt-4 text-sm text-ink-soft">{s.disclaimer}</p>
                <div className="mt-5">
                  <Enlace href="mailto:contacto@idendi.org" tono="quiet">
                    Hablar de Acompañamiento
                  </Enlace>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* 6 · FAQ COMERCIAL ---------------------------------------------- */}
      <section aria-labelledby="faq" className="border-b border-hairline">
        <div className="mx-auto max-w-5xl px-6 py-14">
          <h2 id="faq" className="text-2xl font-semibold text-ink">
            Lo que suelen preguntarnos
          </h2>
          <dl className="mt-6 max-w-3xl space-y-6">
            {COMMERCIAL_FAQ.map((q) => (
              <div key={q.question}>
                <dt className="font-medium text-ink">{q.question}</dt>
                <dd className="mt-1 text-ink-soft">{q.answer}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-8 text-sm text-ink-soft">
            ¿Otra duda?{" "}
            <Link href="/faq" className="text-loop underline">
              Preguntas frecuentes
            </Link>
          </p>
        </div>
      </section>

      {/* 7 · CIERRE ------------------------------------------------------ */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold text-ink">
          {titularPrueba ?? "Empieza cuando quieras"}
        </h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Lo que cargues durante la prueba se queda contigo, contrates o no.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {principal.href !== null && principal.label !== null ? (
            <Enlace href={principal.href} tono="primary">{principal.label}</Enlace>
          ) : null}
          <Enlace href="mailto:contacto@idendi.org" tono="quiet">Escríbenos</Enlace>
        </div>
      </section>
    </PublicShell>
  );
}

/**
 * Un enlace con aspecto de botón.
 *
 * `mailto:` y las anclas no pasan por el enrutador; el resto sí. Distinguirlo
 * aquí evita repetir la condición en cada llamada.
 */
function Enlace({ href, tono, children }: {
  href: string; tono: "primary" | "quiet"; children: React.ReactNode;
}) {
  const clase = tono === "primary"
    ? "rounded-md bg-loop px-5 py-2.5 text-sm font-semibold text-white "
      + "hover:bg-loop-deep"
    : "rounded-md border border-hairline px-5 py-2.5 text-sm font-medium "
      + "text-ink-soft hover:text-loop";
  const foco = " focus-visible:outline focus-visible:outline-2 "
    + "focus-visible:outline-offset-2 focus-visible:outline-loop";
  const externo = href.startsWith("mailto:") || href.startsWith("#");
  return externo
    ? <a href={href} className={clase + foco}>{children}</a>
    : <Link href={href} className={clase + foco}>{children}</Link>;
}
