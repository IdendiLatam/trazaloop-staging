// Ruta protegida (guard del módulo Textil en el layout del namespace). Nunca
// se prerenderiza. Sprint T9C (Textil) · Listado de pasaportes técnicos.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireTextilesModule } from "@/lib/auth/require-textiles-module";
import { listTechnicalPassports } from "@/lib/db/textiles-passport";
import {
  TEXTILE_PASSPORT_STATUS_LABEL,
  TEXTILE_PASSPORT_STATUS_TONE,
  TEXTILE_PASSPORT_DISCLAIMER,
} from "@/lib/domain/textiles-passport";
import { Badge } from "@/components/textiles/passports/passport-ui";

export default async function TextilePassportsPage() {
  const org = await requireTextilesModule();
  const passports = await listTechnicalPassports(org.organizationId);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-1">
        <p className="eyebrow">Trazaloop Textiles · Pasaportes</p>
        <h1 className="text-2xl font-semibold tracking-tight">Pasaportes técnicos textiles</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Consolida el estado técnico de una referencia/SKU (y lote opcional) en un pasaporte:
          composición, materiales, proveedores, evidencias, trazabilidad, circularidad y
          TrazaDocs, con brechas y advertencias para preparación documental interna.
        </p>
        <p className="max-w-2xl text-xs text-ink-soft">{TEXTILE_PASSPORT_DISCLAIMER}</p>
        <div className="flex flex-wrap gap-4 pt-1 text-sm font-medium">
          <Link
            href="/textiles/passports/new"
            className="rounded-md border border-loop/40 bg-loop/5 px-3 py-1 text-loop-deep hover:border-loop"
          >
            + Crear pasaporte técnico
          </Link>
          <Link href="/textiles" className="text-loop hover:underline">
            ← Volver a Textil
          </Link>
        </div>
      </header>

      {passports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline bg-surface p-8 text-center">
          <p className="text-sm text-ink-soft">No hay pasaportes técnicos textiles creados todavía.</p>
          <Link
            href="/textiles/passports/new"
            className="mt-3 inline-block rounded-md bg-loop px-4 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Crear pasaporte técnico
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-ink-soft">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Versión</th>
                <th className="px-3 py-2 font-medium">Referencia/SKU</th>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Brechas</th>
                <th className="px-3 py-2 font-medium">Advertencias</th>
                <th className="px-3 py-2 font-medium">Generación</th>
                <th className="px-3 py-2 font-medium">Actualizado</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {passports.map((p) => (
                <tr key={p.id} className="border-b border-hairline/60 align-middle">
                  <td className="px-3 py-2 font-medium">
                    <span className="code text-xs">{p.passportCode}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">v{p.passportVersion}</td>
                  <td className="px-3 py-2">{p.sku ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-soft">{p.productName ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={TEXTILE_PASSPORT_STATUS_TONE[p.status]}>
                      {TEXTILE_PASSPORT_STATUS_LABEL[p.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-ink-soft">{p.gapCount}</td>
                  <td className="px-3 py-2 text-ink-soft">{p.warningCount}</td>
                  <td className="px-3 py-2 text-ink-soft">{p.generatedAt?.slice(0, 10) ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-soft">{p.updatedAt.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <Link href={`/textiles/passports/${p.id}`} className="text-loop hover:underline">
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
