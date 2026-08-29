// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import { MaterialInventorySection } from "@/components/domain/traceability/inventory-section";
import { ProductStockSection } from "@/components/domain/traceability/product-stock-section";

const BASE = "/traceability/inventory";

/**
 * PT-02B.1 · Inventario, con sus dos superficies.
 *
 * POR QUÉ UNA PANTALLA Y NO DOS
 *
 * Porque la pregunta de quien entra es una sola —«¿cuánto tengo?»— y la
 * respuesta tiene dos mitades que se miden distinto. Separarlas en dos rutas
 * obligaría a saber de antemano cuál se busca.
 *
 * Y POR QUÉ CADA MITAD DICE DE QUÉ ESTÁ HECHA
 *
 * El saldo de materias primas es recibido − consumido en producción: no
 * contempla mermas ni devoluciones porque esos hechos no existen como registro
 * para materias primas. El de producto terminado sí los tiene. Llamar
 * «inventario» a las dos cosas sin decir en qué se diferencian sería prometer
 * una precisión que solo una de ellas puede sostener.
 *
 * Ninguna de las dos rehace aritmética: la de materiales es la sección que ya
 * vivía dentro de los lotes de entrada, aquí montada con otra ruta base.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const org = await requireActiveOrg();
  const params = await searchParams;
  const vista = params.vista === "productos" ? "productos" : "materiales";

  const tab = (valor: "materiales" | "productos", etiqueta: string) => {
    const activo = vista === valor;
    return (
      <Link
        href={`${BASE}?vista=${valor}#${valor === "productos" ? "productos" : "inventario"}`}
        aria-current={activo ? "page" : undefined}
        className={`rounded-md border px-3 py-1.5 text-sm ${
          activo
            ? "border-loop bg-loop/5 font-semibold text-loop-deep"
            : "border-hairline text-ink-soft hover:bg-canvas"
        }`}
      >
        {etiqueta}
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link> · Inventario
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Cuánto hay en planta, derivado de los hechos registrados. No hay tabla
          de existencias que mantener al día: si un dato cambia, el saldo cambia
          con él.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {tab("materiales", "Materias primas")}
        {tab("productos", "Productos terminados")}
      </div>

      {vista === "materiales" ? (
        <MaterialInventorySection
          orgId={org.organizationId}
          params={{
            inventario: params.inventario,
            inv_q: params.inv_q,
            inv_page: params.inv_page,
            inv_lot_page: params.inv_lot_page,
          }}
          extraParams={{ vista: "materiales" }}
          basePath={BASE}
        />
      ) : (
        <ProductStockSection
          orgId={org.organizationId}
          params={{
            prod: params.prod,
            prod_q: params.prod_q,
            prod_page: params.prod_page,
            prod_lot_page: params.prod_lot_page,
          }}
          basePath={BASE}
          extraParams={{ vista: "productos" }}
        />
      )}
    </div>
  );
}
