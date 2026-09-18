// Ruta protegida: depende de cookies/sesión/Supabase → nunca se prerenderiza.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { verifyOneTimeCheckout } from "@/lib/db/one-time-checkout";
import { VerifyPaymentButton } from "@/components/domain/billing/verify-payment-button";
import { ErrorAlert } from "@/components/ui/alert";
import {
  activeShellModuleFrom, moduleAwareHref,
} from "@/lib/modules/registry";

/**
 * Trazaloop · PROD-LAUNCH-01B · La vuelta de la pasarela.
 *
 *
 * ESTA PANTALLA NO CREE NADA DE LO QUE LE LLEGA
 *
 * Mercado Pago devuelve al navegador con parámetros en la URL: `status`,
 * `payment_id`, `collection_status`. Ninguno se lee. Ni uno.
 *
 * Se lee UN dato de la URL —`c`, el identificador del cobro— y se usa
 * solamente para saber POR CUÁL preguntar. La respuesta la da el proveedor,
 * consultado desde el servidor, y la comprueba `decideOneTimeSettlement`.
 *
 * La diferencia importa porque la URL la escribe cualquiera. Si esta pantalla
 * activara con `?status=approved`, el plan Full costaría escribir esa cadena.
 *
 *
 * Y NO DEPENDE DEL AVISO DEL PROVEEDOR
 *
 * El webhook llega antes y ahorra este paso, pero no es requisito: aquí se
 * pregunta igual. La vez que un aviso no llegó —y pasó, con un cobro real de
 * 190 400 pesos— el cliente se habría quedado pagando sin plan.
 *
 *
 * Y EL ENLACE DE VUELTA CONSERVA EL MÓDULO
 *
 * Esta pantalla es transversal: se llega a ella desde cualquier módulo. Un
 * `href` escrito a mano devolvería el shell a PCR siempre, así que quien vino
 * desde Quality acabaría en otro sitio después de pagar. El módulo activo se
 * resuelve y el enlace se decora, como en la pantalla de pago.
 *
 *
 * SI TODAVÍA NO CONSTA
 *
 * No se dice «error». Un pago que el banco aún no ha confirmado no es un
 * fallo de nadie: se explica y se deja el botón para volver a comprobar,
 * porque quien acaba de pagar necesita una acción, no un diagnóstico.
 */
/**
 * La vuelta de una subida de plan.
 *
 * No enseña ni el importe ni el identificador del cobro: quien acaba de pagar
 * necesita saber si su plan está activo, no el vocabulario de la pasarela.
 */
async function VueltaDeSubida({ changeId, orgId, volver }: {
  changeId: string; orgId: string; volver: string;
}) {
  if (!/^[0-9a-f-]{36}$/i.test(changeId)) {
    return (
      <Marco>
        <ErrorAlert message="No encontramos este cambio de plan." />
        <Volver href={volver} />
      </Marco>
    );
  }
  // Y TIENE QUE SER DE ESTA EMPRESA. Sin esto, conocer un identificador ajeno
  // dispararía la conciliación de otra.
  const supabase = await createServerClient();
  const { data: mio } = await supabase.from("billing_subscription_changes")
    .select("id").eq("id", changeId).eq("organization_id", orgId).maybeSingle();
  if (!mio) {
    return (
      <Marco>
        <ErrorAlert message="No encontramos este cambio de plan." />
        <Volver href={volver} />
      </Marco>
    );
  }

  // La pantalla NO sabe por qué pasarela se pagó: lo sabe el intento, y el
  // despachador lo lee. Nombrar aquí una pasarela cruzaría la frontera que
  // separa el modelo comercial del cobro.
  const { reconcileUpgrade } = await import("@/lib/db/upgrade-reconcile");
  const r = await reconcileUpgrade(changeId);

  if (r.outcome === "upgraded") {
    return (
      <Marco>
        <h1 className="text-xl font-semibold">Ya tienes Extra</h1>
        <p className="text-sm text-muted-foreground">
          Recibimos el pago de la diferencia y tu plan cambió ahora mismo. La
          fecha de renovación no se mueve.
        </p>
        <Volver href={volver} etiqueta="Ir a mi plan" />
      </Marco>
    );
  }
  if (r.outcome === "refunded") {
    return (
      <Marco>
        <h1 className="text-xl font-semibold">No pudimos completar el cambio</h1>
        <p className="text-sm text-muted-foreground">
          Te devolvimos el cobro de la diferencia y tu plan actual sigue
          funcionando igual. Puedes volver a intentarlo cuando quieras.
        </p>
        <Volver href={volver} />
      </Marco>
    );
  }
  if (r.outcome === "compensation_required") {
    return (
      <Marco>
        <h1 className="text-xl font-semibold">Estamos resolviendo tu cambio</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos completar el paso a Extra. Tu plan actual sigue activo y no
          te vamos a cobrar nada más; si el cobro de la diferencia llegó a
          hacerse, te lo devolvemos. Lo estamos mirando.
        </p>
        <Volver href={volver} />
      </Marco>
    );
  }
  if (r.outcome === "abandoned") {
    return (
      <Marco>
        <h1 className="text-xl font-semibold">El cambio no se completó</h1>
        <p className="text-sm text-muted-foreground">
          No se cobró nada y tu plan actual sigue igual.
        </p>
        <Volver href={volver} />
      </Marco>
    );
  }
  return (
    <Marco>
      <h1 className="text-xl font-semibold">Todavía no nos consta</h1>
      <p className="text-sm text-muted-foreground">
        Si acabas de pagar, puede tardar un momento en confirmarse. Tu plan
        actual sigue funcionando mientras tanto.
      </p>
      <Volver href={volver} />
    </Marco>
  );
}

export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const crudo = params.c;
  const cobroId = typeof crudo === "string" ? crudo : "";
  const subidaId = typeof params.u === "string" ? params.u : "";
  const org = await requireActiveOrg();
  const moduloActivo = activeShellModuleFrom(
    "/settings/billing/checkout/return", params);
  const volver = moduleAwareHref("/settings/billing", moduloActivo.key);

  // BILLING-EXTRA-01B · La vuelta de una SUBIDA de plan.
  //
  // Mismo principio que abajo y por la misma razón: de la URL sólo se lee QUÉ
  // mirar, nunca qué pasó. Quien concilia es el servidor preguntando al
  // proveedor, y esta pantalla no es requisito de nada — si nadie vuelve, el
  // barrido llega igual.
  if (subidaId !== "") {
    return await VueltaDeSubida({ changeId: subidaId, orgId: org.organizationId,
                                  volver });
  }

  if (!/^[0-9a-f-]{36}$/i.test(cobroId)) {
    return (
      <Marco>
        <ErrorAlert message="No encontramos esta contratación." />
        <Volver href={volver} />
      </Marco>
    );
  }

  // EL COBRO TIENE QUE SER DE ESTA EMPRESA. Sin esta comprobación, conocer un
  // identificador ajeno permitiría disparar la activación del plan de otra.
  const supabase = await createServerClient();
  const { data: mio } = await supabase
    .from("billing_one_time_checkouts")
    .select("id")
    .eq("id", cobroId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!mio) {
    return (
      <Marco>
        <ErrorAlert message="No encontramos esta contratación." />
        <Volver href={volver} />
      </Marco>
    );
  }

  const r = await verifyOneTimeCheckout(cobroId);

  if (r.ok && r.settled) {
    return (
      <Marco>
        <h1 className="text-xl font-semibold">Tu plan está activo</h1>
        <p className="text-sm text-muted-foreground">
          Recibimos tu pago y ya puedes usar todo lo que incluye tu plan.
          {r.alreadySettled ? " Esta contratación ya estaba activada." : ""}
        </p>
        <Volver href={volver} etiqueta="Ir a mi plan" />
      </Marco>
    );
  }

  // Aquí r ya no puede ser «activado»: esa rama devolvió arriba. Quedan las
  // dos que llevan mensaje, así que se lee directo.
  const puedeReintentar = r.ok || r.code === "PROVIDER_UNAVAILABLE";

  return (
    <Marco>
      <h1 className="text-xl font-semibold">Todavía no consta tu pago</h1>
      <p className="text-sm text-muted-foreground">{r.message}</p>
      {puedeReintentar ? <VerifyPaymentButton checkoutId={cobroId} /> : null}
      <Volver href={volver} />
    </Marco>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">{children}</main>
  );
}

function Volver(
  { href, etiqueta = "Volver a mi plan" }: { href: string; etiqueta?: string }
) {
  return (
    <Link href={href} className="text-sm underline underline-offset-4">
      {etiqueta}
    </Link>
  );
}
