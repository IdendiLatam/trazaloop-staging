export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  getPlanCatalogAction, getRenewalOperationsAction,
} from "@/server/actions/commercial-console";
import { PlanCatalogConsole } from "@/components/domain/platform/plan-catalog-console";
import { RenewalOperations } from "@/components/domain/platform/renewal-operations";
import { PromotionsConsole } from "@/components/domain/platform/promotions-console";
import { getPromotionsAction } from "@/server/actions/promotions-console";
import { getFxRatesAction } from "@/server/actions/commercial-fx";
import { FxConsole } from "@/components/domain/platform/fx-console";
import { PRICE_TAX_NOTE } from "@/lib/domain/commercial-catalog";

/**
 * Trazaloop · PE-04B5 · Planes y uso.
 *
 * La administración comercial del producto, en un sitio y con nombres que se
 * entienden sin abrir el esquema. Soporte lee; solo la administración de
 * plataforma cambia condiciones, y la base lo vuelve a comprobar.
 */
export default async function PlatformPlansPage() {
  const [catalogo, renovaciones, promociones, cambio] = await Promise.all([
    getPlanCatalogAction(),
    getRenewalOperationsAction(),
    getPromotionsAction(),
    getFxRatesAction(),
  ]);

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

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Tipo de cambio</h2>
          <p className="max-w-3xl text-sm text-ink-soft">
            El catálogo está en dólares y el cobro se hace en pesos. La tasa que
            los une es <strong>comercial</strong>: la decide la plataforma y tiene
            fecha de entrada. No es la del mercado y no se consulta a ninguna API
            al cobrar, porque el cliente tiene que ver el importe exacto antes de
            pagar.
          </p>
        </div>
        <FxConsole rates={cambio.rates} canManage={cambio.canManage} />
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Promociones y cupones</h2>
          <p className="max-w-3xl text-sm text-ink-soft">
            Un cupón cambia <strong>lo que se paga</strong>, nunca lo que el plan
            incluye. Una campaña se crea en borrador, se le da un código y se
            publica; desde ahí sus condiciones quedan fijas y para cambiarlas se
            retira y se publica una sucesora.
          </p>
        </div>
        <PromotionsConsole
          promotions={promociones.promotions}
          redemptions={promociones.redemptions}
          canManage={promociones.canManage}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-hairline bg-surface p-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Renovaciones</h2>
          <p className="max-w-3xl text-sm text-ink-soft">
            Qué está por cobrarse, qué se está reintentando y qué necesita que lo
            mire una persona. Esta pantalla <strong>solo mira</strong>: reintentar
            un cobro a mano es una operación financiera aparte, con su propia
            autoridad, y no se hace desde aquí.
          </p>
        </div>
        <RenewalOperations rows={renovaciones.rows} />
      </section>

      <section className="space-y-2 rounded-lg border border-hairline bg-surface p-4">
        <h2 className="eyebrow">Lo que NO se administra aquí</h2>
        <p className="text-sm text-ink-soft">
          El <strong>Acompañamiento especializado</strong> no es un plan: es un servicio aparte, con
          su propia contratación, y no aparece en este catálogo. El cobro y los impuestos
          tampoco se gestionan aquí.
        </p>
      </section>
    </div>
  );
}
