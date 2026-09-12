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
export default async function CheckoutReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const crudo = params.c;
  const cobroId = typeof crudo === "string" ? crudo : "";
  const org = await requireActiveOrg();
  const moduloActivo = activeShellModuleFrom(
    "/settings/billing/checkout/return", params);
  const volver = moduleAwareHref("/settings/billing", moduloActivo.key);

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
