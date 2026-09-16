// Ruta protegida: depende de cookies/sesión/Supabase → nunca se prerenderiza.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { createServerClient } from "@/lib/supabase/server";
import { readRecurringReturn } from "@/lib/db/recurring-checkout";
import { ErrorAlert } from "@/components/ui/alert";
import {
  activeShellModuleFrom, moduleAwareHref,
} from "@/lib/modules/registry";

/**
 * Trazaloop · MP-REC-01B · La vuelta de una autorización recurrente.
 *
 *
 * DE LA URL SOLO SE LEE UN PUNTERO
 *
 * La pasarela devuelve al navegador con parámetros suyos —`status`,
 * `preapproval_id`, `collection_status`—. No se lee ninguno. Se lee `a`, el
 * identificador de NUESTRA autorización, y sirve para una sola cosa: saber por
 * cuál preguntar.
 *
 * El importe, la moneda, el estado, el cobrador y el derecho salen de releer al
 * proveedor desde el servidor. La URL la escribe cualquiera; si esta pantalla
 * activara con `?status=authorized`, el plan Full costaría teclear esa cadena.
 *
 *
 * Y AUTORIZADO NO ES PAGADO · ES LA DISTINCIÓN QUE JUSTIFICA LA PANTALLA
 *
 * En un pago único, volver de la pasarela con el cobro aprobado es el final. En
 * una recurrencia no: el comprador autoriza, y el proveedor cobra por su cuenta
 * alrededor de una hora después. Entre esas dos cosas hay un rato en el que la
 * verdad es «recibimos tu autorización» y la mentira sería «ya tienes Full».
 *
 * Decir la mentira tiene consecuencias reales: alguien se va a trabajar creyendo
 * que tiene el plan, se encuentra la puerta cerrada, y escribe a soporte. Por
 * eso hay un estado propio para ese rato, y no se le llama error.
 *
 *
 * CUATRO ESTADOS, Y NINGUNO ACTIVA POR SÍ MISMO
 *
 *   A · autorización recibida, sin cobro todavía
 *   B · cobro aprobado y conciliado → el plan ya está
 *   C · el proveedor aún no dice nada → pantalla tranquila, no un fallo
 *   D · algo no cuadra → se niega la activación, sin detalles que no ayudan
 */
export default async function RecurringReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const crudo = params.a;
  const autorizacionId = typeof crudo === "string" ? crudo : "";
  const org = await requireActiveOrg();
  const moduloActivo = activeShellModuleFrom(
    "/settings/billing/recurring/return", params);
  const volver = moduleAwareHref("/settings/billing", moduloActivo.key);

  if (!/^[0-9a-f-]{36}$/i.test(autorizacionId)) {
    return (
      <Marco>
        <ErrorAlert message="No encontramos esta contratación." />
        <Volver href={volver} />
      </Marco>
    );
  }

  // LA AUTORIZACIÓN TIENE QUE SER DE ESTA EMPRESA. Sin esto, conocer un
  // identificador ajeno permitiría disparar la conciliación de otra. La RLS de
  // 0204 ya lo impediría; se comprueba además aquí porque una pantalla que se
  // apoya en una sola defensa envejece mal.
  const supabase = await createServerClient();
  const { data: mia } = await supabase
    .from("billing_recurring_authorizations")
    .select("id")
    .eq("id", autorizacionId)
    .eq("organization_id", org.organizationId)
    .maybeSingle();
  if (!mia) {
    return (
      <Marco>
        <ErrorAlert message="No encontramos esta contratación." />
        <Volver href={volver} />
      </Marco>
    );
  }

  const r = await readRecurringReturn({ authorizationId: autorizacionId, supabase });

  // --- D · algo no cuadra ---------------------------------------------------
  if (!r.ok) {
    if (r.code === "PROVIDER_UNAVAILABLE") {
      return (
        <Marco>
          <h1 className="text-xl font-semibold">Todavía no podemos confirmarlo</h1>
          <p className="text-sm text-muted-foreground">
            No pudimos contactar con la pasarela para comprobar tu contratación.
            No se cobró nada de más. Vuelve a esta pantalla en unos minutos.
          </p>
          <Volver href={volver} />
        </Marco>
      );
    }
    return (
      <Marco>
        <ErrorAlert message="No pudimos confirmar esta contratación. No se activó ningún plan." />
        <Volver href={volver} />
      </Marco>
    );
  }

  // --- B · cobro aprobado y conciliado --------------------------------------
  if (r.state === "active") {
    return (
      <Marco>
        <h1 className="text-xl font-semibold">Tu plan está activo</h1>
        <p className="text-sm text-muted-foreground">
          Se confirmó el primer cobro y ya puedes usar todo lo que incluye tu plan.
        </p>
        <Volver href={volver} etiqueta="Ir a mi plan" />
      </Marco>
    );
  }

  // --- A · autorización recibida, sin cobro todavía -------------------------
  if (r.state === "authorization_received") {
    return (
      <Marco>
        <h1 className="text-xl font-semibold">Autorización recibida</h1>
        <p className="text-sm text-muted-foreground">
          La pasarela registró tu autorización. Tu plan se activará cuando se
          confirme el primer cobro, y te lo mostraremos aquí mismo.
        </p>
        <p className="text-sm text-muted-foreground">
          Todavía no se ha cobrado nada.
        </p>
        <Volver href={volver} />
      </Marco>
    );
  }

  // --- C · el proveedor aún no dice nada ------------------------------------
  return (
    <Marco>
      <h1 className="text-xl font-semibold">Estamos esperando la confirmación</h1>
      <p className="text-sm text-muted-foreground">
        Todavía no consta tu autorización. Si acabas de completarla, puede tardar
        un momento en registrarse. No se cobró nada.
      </p>
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
