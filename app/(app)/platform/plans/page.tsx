export const dynamic = "force-dynamic";

import Link from "next/link";
import { getPlanCatalogAction } from "@/server/actions/commercial-console";
import { PlanCatalogConsole } from "@/components/domain/platform/plan-catalog-console";
import { PRICE_TAX_NOTE } from "@/lib/domain/commercial-catalog";

/**
 * Trazaloop · PE-04B5 · Planes y uso.
 *
 * La administración comercial del producto, en un sitio y con nombres que se
 * entienden sin abrir el esquema. Soporte lee; solo la administración de
 * plataforma cambia condiciones, y la base lo vuelve a comprobar.
 */
export default async function PlatformPlansPage() {
  const catalogo = await getPlanCatalogAction();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/platform" className="hover:underline">
            Plataforma
          </Link>{" "}
          · Planes y uso
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Planes y uso</h1>
        <p className="max-w-3xl text-sm text-ink-soft">
          Las condiciones comerciales vigentes de Free, Full y Extra, y su historia. Una revisión
          publicada <strong>no se edita</strong>: para cambiar condiciones se crea una sucesora en
          borrador y se publica. {PRICE_TAX_NOTE}
        </p>
        {!catalogo.canManage ? (
          <p className="max-w-3xl rounded-md border border-hairline bg-surface p-3 text-sm text-ink-soft">
            Estás viendo esta pantalla en <strong>solo lectura</strong>: cambiar condiciones
            comerciales corresponde a la administración de plataforma.
          </p>
        ) : null}
      </header>

      <PlanCatalogConsole
        revisions={catalogo.revisions}
        limitsByRevision={catalogo.limitsByRevision}
        canManage={catalogo.canManage}
      />

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="eyebrow">Lo que NO se administra aquí</h2>
        <p className="text-sm text-ink-soft">
          El <strong>Acompañamiento especializado</strong> no es un plan: es un servicio aparte, con
          su propia contratación, y no aparece en este catálogo. El cobro, los cupones y los
          impuestos tampoco se gestionan aquí.
        </p>
      </section>
    </div>
  );
}
