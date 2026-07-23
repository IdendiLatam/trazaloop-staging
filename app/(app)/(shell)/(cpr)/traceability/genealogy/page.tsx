// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  listOutputBatches,
  listInputBatches,
  getBackward,
  getForward,
} from "@/lib/db/traceability";

function ChainCard({
  eyebrow,
  title,
  lines,
}: {
  eyebrow: string;
  title: string;
  lines: string[];
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4">
      <p className="eyebrow mb-1">{eyebrow}</p>
      <p className="text-sm font-semibold">{title}</p>
      {lines.map((l, i) => (
        <p key={i} className="text-xs text-ink-soft">{l}</p>
      ))}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex justify-center text-loop" aria-hidden="true">
      ↓
    </div>
  );
}

export default async function GenealogyPage({
  searchParams,
}: {
  searchParams: Promise<{ output?: string; input?: string }>;
}) {
  const org = await requireActiveOrg();
  const params = await searchParams;

  const [outputBatches, inputBatches] = await Promise.all([
    listOutputBatches(org.organizationId),
    listInputBatches(org.organizationId),
  ]);

  const backward = params.output ? await getBackward(org.organizationId, params.output) : [];
  const forward = params.input ? await getForward(org.organizationId, params.input) : [];

  const selectedOutput = outputBatches.find((b) => b.id === params.output);
  const selectedInput = inputBatches.find((b) => b.id === params.input);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link> · Genealogía
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Genealogía de lotes</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Reconstruye la cadena hacia atrás (desde un lote producido / lote final) o hacia
          adelante (desde un lote de entrada).
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <form method="get" className="rounded-lg border border-hairline bg-surface p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Hacia atrás: lote producido / lote final</span>
            <select name="output" defaultValue={params.output ?? ""} className="mb-3 block w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm">
              <option value="">— Selecciona —</option>
              {outputBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_code} {b.product_label ? `· ${b.product_label}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep">
            Reconstruir hacia atrás
          </button>
        </form>

        <form method="get" className="rounded-lg border border-hairline bg-surface p-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Hacia adelante: lote de entrada</span>
            <select name="input" defaultValue={params.input ?? ""} className="mb-3 block w-full rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm">
              <option value="">— Selecciona —</option>
              {inputBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_code} · {b.material_name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-loop px-3 py-1.5 text-sm font-semibold text-white hover:bg-loop-deep">
            Reconstruir hacia adelante
          </button>
        </form>
      </div>

      {/* Hacia atrás */}
      {selectedOutput ? (
        <section className="space-y-2">
          <h2 className="eyebrow">Cadena hacia atrás</h2>
          <ChainCard
            eyebrow="Producto terminado / lote producido / lote final"
            title={selectedOutput.batch_code}
            lines={[
              selectedOutput.product_label ?? "Sin producto asociado",
              selectedOutput.produced_quantity_kg !== null
                ? `${selectedOutput.produced_quantity_kg} kg producidos`
                : "",
            ].filter(Boolean)}
          />
          <Arrow />
          <ChainCard
            eyebrow="Orden / corrida de producción"
            title={backward[0]?.production_order_code ?? "Sin orden"}
            lines={[]}
          />
          <Arrow />
          {backward.filter((r) => r.input_batch_id).length === 0 ? (
            <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              La orden no tiene consumos registrados: la trazabilidad hacia atrás está incompleta.
            </p>
          ) : (
            <div className="space-y-2">
              {backward
                .filter((r) => r.input_batch_id)
                .map((r) => (
                  <ChainCard
                    key={r.input_batch_id!}
                    eyebrow="Lote de entrada consumido"
                    title={`${r.input_batch_code} · ${r.consumed_mass_kg ?? "—"} kg`}
                    lines={[
                      `Proveedor: ${r.supplier_name ?? "—"}`,
                      `Material: ${r.material_name ?? "—"} (${r.classification_code ?? "—"})`,
                    ]}
                  />
                ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Hacia adelante */}
      {selectedInput ? (
        <section className="space-y-2">
          <h2 className="eyebrow">Cadena hacia adelante</h2>
          <ChainCard
            eyebrow="Lote de entrada"
            title={selectedInput.batch_code}
            lines={[
              `Proveedor: ${selectedInput.supplier_name}`,
              `Material: ${selectedInput.material_name}`,
            ]}
          />
          <Arrow />
          {forward.filter((r) => r.production_order_id).length === 0 ? (
            <p className="rounded-lg border border-hairline bg-surface p-3 text-sm text-ink-soft">
              Este lote aún no ha sido consumido en ninguna orden.
            </p>
          ) : (
            <div className="space-y-2">
              {forward
                .filter((r) => r.production_order_id)
                .map((r, i) => (
                  <div key={i} className="space-y-2">
                    <ChainCard
                      eyebrow="Consumido en la orden"
                      title={`${r.production_order_code ?? "—"} · ${r.consumed_mass_kg ?? "—"} kg`}
                      lines={[]}
                    />
                    {r.output_batch_id ? (
                      <>
                        <Arrow />
                        <ChainCard
                          eyebrow="Lote producido / lote final generado"
                          title={r.output_batch_code ?? "—"}
                          lines={[
                            r.product_code
                              ? `Producto: ${r.product_code} · ${r.product_name}`
                              : "Sin producto asociado todavía",
                          ]}
                        />
                      </>
                    ) : null}
                  </div>
                ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
