// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  searchOutputBatches,
  searchInputBatches,
  getOutputBatch,
  getInputBatch,
} from "@/lib/db/traceability";
import { collectGraphForOutput, collectGraphForInput } from "@/lib/db/genealogy";
import {
  traceBackward,
  traceForwardFromInput,
  traceForwardFromOutput,
  GENEALOGY_MAX_DEPTH,
  type BackwardStage,
  type ForwardStage,
} from "@/lib/domain/genealogy";

/**
 * PCR-02 (Bloque F) · Genealogía multi-salto:
 * Proveedor → Lote de entrada → Orden A → Lote intermedio → Orden B → Lote final,
 * hacia atrás desde un lote producido y hacia adelante desde un lote de
 * entrada o desde un lote producido reutilizado. Recorrido acotado y a
 * prueba de ciclos (lib/domain/genealogy.ts).
 */

function StageCard({
  eyebrow,
  title,
  lines,
  tone = "default",
}: {
  eyebrow: string;
  title: string;
  lines: (string | { text: string; href: string })[];
  tone?: "default" | "internal";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "internal" ? "border-loop/40 bg-loop/5" : "border-hairline bg-surface"
      }`}
    >
      <p className="eyebrow mb-1">{eyebrow}</p>
      <p className="text-sm font-semibold">{title}</p>
      {lines.map((l, i) =>
        typeof l === "string" ? (
          <p key={i} className="text-xs text-ink-soft">{l}</p>
        ) : (
          <p key={i} className="text-xs">
            <Link href={l.href} className="text-loop hover:underline">{l.text}</Link>
          </p>
        )
      )}
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-loop" aria-hidden="true">
      ↓{label ? <span className="text-ink-soft">{label}</span> : null}
    </div>
  );
}

function BackwardChain({ stages }: { stages: BackwardStage[] }) {
  return (
    <div className="space-y-3">
      {stages.map((stage, idx) => (
        <div key={`${stage.output.id}-${idx}`} className="space-y-3">
          {idx > 0 ? <Arrow label="fue producido por" /> : null}
          <StageCard
            eyebrow={stage.depth === 0 ? "Lote producido consultado" : "Lote producido intermedio"}
            title={`${stage.output.batch_code} · ${stage.output.product_label ?? "sin producto"}`}
            tone={stage.depth === 0 ? "default" : "internal"}
            lines={[
              stage.output.produced_quantity_kg !== null
                ? `${stage.output.produced_quantity_kg} kg producidos${stage.output.produced_date ? ` · ${stage.output.produced_date}` : ""}`
                : stage.output.produced_date ?? "",
              stage.order
                ? {
                    text: `Orden productora: ${stage.order.order_code}`,
                    href: `/traceability/production-orders/${stage.order.id}`,
                  }
                : "Orden productora no disponible",
            ].filter(Boolean) as (string | { text: string; href: string })[]}
          />
          {(stage.externalInputs.length > 0 || stage.internalInputs.length > 0) ? (
            <>
              <Arrow label="consumió" />
              <div className="grid gap-2 sm:grid-cols-2">
                {stage.externalInputs.map((e) => (
                  <StageCard
                    key={`e-${stage.output.id}-${e.input.id}`}
                    eyebrow="Lote de entrada (externo)"
                    title={e.input.batch_code}
                    lines={[
                      [e.input.material_name, e.input.supplier_name && `proveedor ${e.input.supplier_name}`]
                        .filter(Boolean)
                        .join(" · "),
                      `${e.mass_kg} kg consumidos`,
                    ].filter(Boolean)}
                  />
                ))}
                {stage.internalInputs.map((i) => (
                  <StageCard
                    key={`i-${stage.output.id}-${i.output.id}`}
                    eyebrow="Lote producido interno (continúa abajo)"
                    title={i.output.batch_code}
                    tone="internal"
                    lines={[`${i.mass_kg} kg consumidos como producto intermedio`]}
                  />
                ))}
              </div>
            </>
          ) : stage.order ? (
            <p className="text-center text-xs text-ink-soft">
              La orden {stage.order.order_code} no registra consumos.
            </p>
          ) : null}
          {stage.truncated ? (
            <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
              Cadena truncada en {GENEALOGY_MAX_DEPTH} niveles: hay más
              antecedentes internos que no se muestran.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ForwardChain({ stages }: { stages: ForwardStage[] }) {
  return (
    <div className="space-y-3">
      {stages.map((stage, idx) => (
        <div key={`${stage.order.id}-${idx}`} className="space-y-3">
          <Arrow label={`${stage.fromLabel} → consumido (${stage.mass_kg} kg) en`} />
          <StageCard
            eyebrow={stage.depth === 0 ? "Orden / corrida" : "Orden / corrida posterior"}
            title={stage.order.order_code}
            lines={[
              stage.order.order_date ?? "",
              { text: "Abrir orden", href: `/traceability/production-orders/${stage.order.id}` },
            ].filter(Boolean) as (string | { text: string; href: string })[]}
          />
          {stage.producedOutputs.length > 0 ? (
            <>
              <Arrow label="produjo" />
              <div className="grid gap-2 sm:grid-cols-2">
                {stage.producedOutputs.map((o) => (
                  <StageCard
                    key={`${stage.order.id}-${o.id}`}
                    eyebrow="Lote producido"
                    title={`${o.batch_code} · ${o.product_label ?? "sin producto"}`}
                    tone="internal"
                    lines={[
                      o.produced_quantity_kg !== null ? `${o.produced_quantity_kg} kg` : "",
                      { text: "Ver genealogía de este lote", href: `/traceability/genealogy?output=${o.id}` },
                    ].filter(Boolean) as (string | { text: string; href: string })[]}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-xs text-ink-soft">
              La orden {stage.order.order_code} aún no registra lotes producidos.
            </p>
          )}
          {stage.truncated ? (
            <p className="rounded-md border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
              Cadena truncada en {GENEALOGY_MAX_DEPTH} niveles: el lote se
              siguió reutilizando más adelante.
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default async function GenealogyPage({
  searchParams,
}: {
  searchParams: Promise<{ output?: string; input?: string; bq?: string; iq?: string }>;
}) {
  const org = await requireActiveOrg();
  const params = await searchParams;

  // PCR-02.1 (hallazgo 4): la genealogía ya no carga TODOS los lotes de la
  // empresa para llenar selects. Se reutiliza la búsqueda server-side
  // paginada de PCR-01.1 (20 resultados por página) y el lote consultado se
  // resuelve por id con su getter (siempre acotado por organización).
  const bq = (params.bq ?? "").trim();
  const iq = (params.iq ?? "").trim();
  const [outputSearch, inputSearch, selectedOutput, selectedInput] = await Promise.all([
    searchOutputBatches(org.organizationId, { q: bq || null, page: 1 }),
    searchInputBatches(org.organizationId, { q: iq || null, page: 1 }),
    params.output ? getOutputBatch(org.organizationId, params.output) : Promise.resolve(null),
    params.input ? getInputBatch(org.organizationId, params.input) : Promise.resolve(null),
  ]);
  const outputBatches = outputSearch.rows;
  const inputBatches = inputSearch.rows;

  let backwardStages: BackwardStage[] = [];
  let outputForwardStages: ForwardStage[] = [];
  if (selectedOutput) {
    const graph = await collectGraphForOutput(org.organizationId, selectedOutput.id);
    backwardStages = traceBackward(graph, selectedOutput.id);
    outputForwardStages = traceForwardFromOutput(graph, selectedOutput.id);
  }

  let inputForwardStages: ForwardStage[] = [];
  if (selectedInput) {
    const graph = await collectGraphForInput(org.organizationId, selectedInput.id);
    inputForwardStages = traceForwardFromInput(graph, selectedInput.id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">
          <Link href="/traceability" className="hover:underline">Trazabilidad</Link> · Genealogía de lotes
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Genealogía de lotes</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-soft">
          Reconstruye la cadena completa — proveedor → lote de entrada → orden →
          lote producido intermedio → orden posterior → lote final — hacia atrás
          desde un lote producido, o hacia adelante desde un lote de entrada.
        </p>
      </header>

      {/* Selección hacia atrás */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">Hacia atrás: ¿de dónde viene un lote producido?</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          {selectedInput ? <input type="hidden" name="input" value={selectedInput.id} /> : null}
          {iq ? <input type="hidden" name="iq" value={iq} /> : null}
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-soft">Buscar lote producido por código</span>
            <input
              type="search"
              name="bq"
              defaultValue={bq}
              placeholder="p. ej. LOTE-2026-"
              className="min-w-64 rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-loop px-3 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Buscar
          </button>
        </form>
        {outputBatches.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            {bq ? (
              <>Sin resultados para «{bq}». Ajusta la búsqueda.</>
            ) : (
              <>
                Aún no hay lotes producidos. Créalos desde su{" "}
                <Link href="/traceability/production-orders" className="text-loop underline">
                  orden / corrida
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="mt-3 space-y-1">
            <ul className="divide-y divide-hairline rounded-md border border-hairline">
              {outputBatches.map((b) => (
                <li key={b.id}>
                  <Link
                    href={{ pathname: "/traceability/genealogy", query: { ...(bq ? { bq } : {}), ...(iq ? { iq } : {}), ...(selectedInput ? { input: selectedInput.id } : {}), output: b.id } }}
                    className={`block px-3 py-1.5 text-sm hover:bg-loop/5 ${selectedOutput?.id === b.id ? "bg-loop/10 font-semibold" : ""}`}
                  >
                    <span className="code mr-2 text-xs text-loop-deep">{b.batch_code}</span>
                    {b.product_label ?? "sin producto"} ({b.production_order_code ?? "sin orden"})
                  </Link>
                </li>
              ))}
            </ul>
            {outputSearch.total > outputBatches.length ? (
              <p className="text-xs text-ink-soft">
                Mostrando {outputBatches.length} de {outputSearch.total} lotes: afina la búsqueda por código.
              </p>
            ) : null}
          </div>
        )}

        {selectedOutput ? (
          <div className="mt-5 space-y-5">
            <BackwardChain stages={backwardStages} />
            {outputForwardStages.length > 0 ? (
              <div className="border-t border-hairline pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Y después: este lote se reutilizó como producto intermedio
                </h3>
                <ForwardChain stages={outputForwardStages} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Selección hacia adelante */}
      <section className="rounded-lg border border-hairline bg-surface p-5">
        <h2 className="mb-2 text-sm font-semibold">Hacia adelante: ¿en qué terminó un lote de entrada?</h2>
        <form method="get" className="flex flex-wrap items-end gap-3">
          {selectedOutput ? <input type="hidden" name="output" value={selectedOutput.id} /> : null}
          {bq ? <input type="hidden" name="bq" value={bq} /> : null}
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-ink-soft">Buscar lote de entrada por código</span>
            <input
              type="search"
              name="iq"
              defaultValue={iq}
              placeholder="p. ej. LE-2026-"
              className="min-w-64 rounded-md border border-hairline bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-loop px-3 py-2 text-sm font-semibold text-white hover:bg-loop-deep"
          >
            Buscar
          </button>
        </form>
        {inputBatches.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">
            {iq ? <>Sin resultados para «{iq}». Ajusta la búsqueda.</> : <>Aún no hay lotes de entrada.</>}
          </p>
        ) : (
          <div className="mt-3 space-y-1">
            <ul className="divide-y divide-hairline rounded-md border border-hairline">
              {inputBatches.map((b) => (
                <li key={b.id}>
                  <Link
                    href={{ pathname: "/traceability/genealogy", query: { ...(bq ? { bq } : {}), ...(iq ? { iq } : {}), ...(selectedOutput ? { output: selectedOutput.id } : {}), input: b.id } }}
                    className={`block px-3 py-1.5 text-sm hover:bg-loop/5 ${selectedInput?.id === b.id ? "bg-loop/10 font-semibold" : ""}`}
                  >
                    <span className="code mr-2 text-xs text-loop-deep">{b.batch_code}</span>
                    {b.material_name} ({b.supplier_name})
                  </Link>
                </li>
              ))}
            </ul>
            {inputSearch.total > inputBatches.length ? (
              <p className="text-xs text-ink-soft">
                Mostrando {inputBatches.length} de {inputSearch.total} lotes: afina la búsqueda por código.
              </p>
            ) : null}
          </div>
        )}

        {selectedInput ? (
          <div className="mt-5">
            {inputForwardStages.length === 0 ? (
              <p className="text-sm text-ink-soft">
                El lote {selectedInput.batch_code} aún no ha sido consumido en
                ninguna orden.
              </p>
            ) : (
              <ForwardChain stages={inputForwardStages} />
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
