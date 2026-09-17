import Link from "next/link";
import { PublicShell } from "@/components/layout/public-shell";

/**
 * Trazaloop · COMMERCIAL-UX-01C · Marcador de posición de «Planes y precios».
 *
 *
 * ESTO ES TEMPORAL Y ESTÁ AQUÍ A PROPÓSITO
 *
 * La página comercial se construye en el tramo siguiente. Lo único que esta
 * ruta resuelve hoy es que la navegación pública tenga a dónde ir: un enlace
 * «Planes y precios» que lleva a un 404 es peor que no tener el enlace.
 *
 *
 * LO QUE DELIBERADAMENTE NO HACE
 *
 * No lee el catálogo. No pinta ni un precio. No duplica ni una cifra.
 *
 * Es la tentación evidente —«ya que estoy, dejo los tres planes puestos»— y es
 * exactamente lo que crearía el problema que este tramo entero vino a evitar:
 * números escritos a mano en una página de marketing que dejan de coincidir con
 * la autoridad sin que nadie se entere.
 *
 * Cuando esta página muestre precios, saldrán de `readCommercialCatalog()`.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Planes y precios · Trazaloop",
  description: "Los planes de Trazaloop y qué incluye cada uno.",
};

export default function PlanesPage() {
  return (
    <PublicShell currentPath="/planes">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="text-3xl font-semibold text-ink">Planes y precios</h1>
        <p className="mt-4 max-w-2xl text-ink-soft">
          Estamos terminando esta página. Mientras tanto, escríbenos y te
          contamos qué plan encaja con lo que necesitas.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="mailto:contacto@idendi.org"
            className="rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white
                       hover:bg-loop-deep focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-loop"
          >
            Escribirnos
          </a>
          <Link
            href="/faq"
            className="rounded-md border border-hairline px-4 py-2 text-sm text-ink-soft
                       hover:text-loop focus-visible:outline focus-visible:outline-2
                       focus-visible:outline-offset-2 focus-visible:outline-loop"
          >
            Preguntas frecuentes
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
