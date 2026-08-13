/**
 * Trazaloop · Sprint PCR-02 · Bloque F — genealogía multi-salto. Ejecuta la
 * lógica PURA de recorrido (lib/domain/genealogy.ts) sobre grafos sintéticos
 * que replican el modelo real:
 *
 *   Proveedor → Lote entrada LE-1 → Orden A → Lote intermedio INT-1
 *     → Orden B → Lote final FIN-1
 *
 * incluyendo ciclos artificiales (A→X→B→Y→A) y tope de profundidad. El
 * recolector con BD (lib/db/genealogy.ts) queda BLOCKED en la matriz.
 *
 * Correr: npm run test:pcr02-genealogy
 */
import fs from "node:fs";
import path from "node:path";
import {
  traceBackward,
  traceForwardFromInput,
  traceForwardFromOutput,
  GENEALOGY_MAX_DEPTH,
  type GenealogyGraph,
} from "../../lib/domain/genealogy";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✘ ${name}: ${(err as Error).message}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function readSource(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

function makeGraph(): GenealogyGraph {
  return {
    orders: new Map([
      ["A", { id: "A", order_code: "OP-A", status: "closed", order_date: "2026-08-01" }],
      ["B", { id: "B", order_code: "OP-B", status: "in_progress", order_date: "2026-08-05" }],
    ]),
    outputs: new Map([
      ["INT-1", { id: "INT-1", batch_code: "INT-1", production_order_id: "A", product_label: "P1 · Pellet", produced_quantity_kg: 500, produced_date: "2026-08-02" }],
      ["FIN-1", { id: "FIN-1", batch_code: "FIN-1", production_order_id: "B", product_label: "P2 · Lámina", produced_quantity_kg: 450, produced_date: "2026-08-06" }],
    ]),
    inputs: new Map([
      ["LE-1", { id: "LE-1", batch_code: "LE-1", supplier_name: "Proveedor Uno", material_name: "PET posconsumo", quantity_kg: 600 }],
    ]),
    externalConsumption: [{ production_order_id: "A", input_batch_id: "LE-1", mass_kg: 550 }],
    internalConsumption: [{ production_order_id: "B", output_batch_id: "INT-1", mass_kg: 480 }],
  };
}

console.log("PCR-02 · Genealogía multi-salto (Bloque F)");

check("1. Hacia atrás desde el lote FINAL se reconstruye la cadena completa", () => {
  const stages = traceBackward(makeGraph(), "FIN-1");
  assert(stages.length === 2, `debían salir 2 etapas (FIN-1 y INT-1), salieron ${stages.length}`);

  const [final, intermediate] = stages;
  assert(final.output.id === "FIN-1" && final.depth === 0, "la etapa 0 es el lote consultado");
  assert(final.order?.order_code === "OP-B", "FIN-1 fue producido por OP-B");
  assert(final.externalInputs.length === 0, "OP-B no consumió lotes de entrada");
  assert(
    final.internalInputs.length === 1 &&
      final.internalInputs[0].output.id === "INT-1" &&
      final.internalInputs[0].mass_kg === 480,
    "OP-B consumió el intermedio INT-1 (480 kg)"
  );

  assert(intermediate.output.id === "INT-1" && intermediate.depth === 1, "la etapa 1 es INT-1");
  assert(intermediate.order?.order_code === "OP-A", "INT-1 fue producido por OP-A");
  assert(
    intermediate.externalInputs.length === 1 &&
      intermediate.externalInputs[0].input.batch_code === "LE-1" &&
      intermediate.externalInputs[0].input.supplier_name === "Proveedor Uno" &&
      intermediate.externalInputs[0].mass_kg === 550,
    "OP-A consumió el lote de entrada LE-1 con su proveedor (550 kg)"
  );
  assert(intermediate.internalInputs.length === 0, "OP-A no consumió intermedios");
});

check("2. Hacia adelante desde el lote de ENTRADA se llega al lote final", () => {
  const stages = traceForwardFromInput(makeGraph(), "LE-1");
  assert(stages.length === 2, `debían salir 2 etapas (OP-A y OP-B), salieron ${stages.length}`);
  const [a, b] = stages;
  assert(a.order.order_code === "OP-A" && a.mass_kg === 550, "LE-1 → OP-A (550 kg)");
  assert(a.fromLabel.includes("LE-1"), "la etapa dice de qué lote viene");
  assert(
    a.producedOutputs.length === 1 && a.producedOutputs[0].id === "INT-1",
    "OP-A produjo INT-1"
  );
  assert(b.order.order_code === "OP-B" && b.depth === 1, "INT-1 → OP-B en el siguiente salto");
  assert(b.fromLabel.includes("INT-1"), "el salto declara el lote intermedio");
  assert(
    b.producedOutputs.length === 1 && b.producedOutputs[0].id === "FIN-1",
    "OP-B produjo el lote final FIN-1"
  );
});

check("3. Hacia adelante desde un lote PRODUCIDO (¿dónde se reutilizó?)", () => {
  const stages = traceForwardFromOutput(makeGraph(), "INT-1");
  assert(stages.length === 1, "INT-1 solo fue consumido por OP-B");
  assert(stages[0].order.order_code === "OP-B" && stages[0].mass_kg === 480, "consumo correcto");
  assert(stages[0].producedOutputs[0]?.id === "FIN-1", "y OP-B produjo FIN-1");
  assert(
    traceForwardFromOutput(makeGraph(), "FIN-1").length === 0,
    "FIN-1 no ha sido reutilizado → sin etapas"
  );
});

check("4. Un CICLO (A→X→B→Y→A) no cuelga el recorrido y no repite etapas", () => {
  const graph: GenealogyGraph = {
    orders: new Map([
      ["A", { id: "A", order_code: "OP-A", status: "in_progress", order_date: null }],
      ["B", { id: "B", order_code: "OP-B", status: "in_progress", order_date: null }],
    ]),
    outputs: new Map([
      ["X", { id: "X", batch_code: "X", production_order_id: "A", product_label: null, produced_quantity_kg: null, produced_date: null }],
      ["Y", { id: "Y", batch_code: "Y", production_order_id: "B", product_label: null, produced_quantity_kg: null, produced_date: null }],
    ]),
    inputs: new Map(),
    externalConsumption: [],
    internalConsumption: [
      { production_order_id: "B", output_batch_id: "X", mass_kg: 10 }, // B consume X (de A)
      { production_order_id: "A", output_batch_id: "Y", mass_kg: 5 }, // A consume Y (de B) → ciclo
    ],
  };
  const backward = traceBackward(graph, "Y");
  assert(backward.length === 2, `el ciclo debía visitar cada lote UNA vez (${backward.length})`);
  const visited = backward.map((s) => s.output.id).sort().join(",");
  assert(visited === "X,Y", `debía visitar X e Y exactamente: ${visited}`);

  const forward = traceForwardFromOutput(graph, "X");
  assert(forward.length === 2, "hacia adelante también corta el ciclo por órdenes visitadas");
});

check("5. Tope de profundidad: cadenas larguísimas se truncan y se marca", () => {
  // Cadena lineal de 15 órdenes encadenadas por intermedios.
  const graph: GenealogyGraph = {
    orders: new Map(),
    outputs: new Map(),
    inputs: new Map(),
    externalConsumption: [],
    internalConsumption: [],
  };
  const N = GENEALOGY_MAX_DEPTH + 5;
  for (let i = 0; i < N; i++) {
    graph.orders.set(`O${i}`, { id: `O${i}`, order_code: `OP-${i}`, status: "closed", order_date: null });
    graph.outputs.set(`L${i}`, { id: `L${i}`, batch_code: `L${i}`, production_order_id: `O${i}`, product_label: null, produced_quantity_kg: null, produced_date: null });
    if (i > 0) {
      // La orden O(i) consume el lote L(i-1).
      graph.internalConsumption.push({ production_order_id: `O${i}`, output_batch_id: `L${i - 1}`, mass_kg: 1 });
    }
  }
  const stages = traceBackward(graph, `L${N - 1}`);
  assert(
    stages.length === GENEALOGY_MAX_DEPTH + 1,
    `debía cortar en ${GENEALOGY_MAX_DEPTH + 1} etapas (0..${GENEALOGY_MAX_DEPTH}), fueron ${stages.length}`
  );
  assert(stages[stages.length - 1].truncated, "la última etapa debía marcarse truncada");
});

check("6. El recolector de BD es acotado: BFS con .in() y sin universo", () => {
  const collector = readSource("../../lib/db/genealogy.ts");
  assert(collector.includes('import "server-only"'), "server-only");
  assert(collector.includes("GENEALOGY_MAX_DEPTH"), "usa el tope de profundidad");
  assert(collector.split(".in(").length - 1 >= 5, "consultas por nivel con .in() acotado");
  assert(
    (collector.match(/\.eq\("organization_id", orgId\)/g) ?? []).length >= 6,
    "cada consulta acotada a la empresa activa"
  );
  assert(
    !collector.includes('.select("*")'),
    "sin select * (solo columnas necesarias)"
  );
  const page = readSource("../../app/(app)/(shell)/(cpr)/traceability/genealogy/page.tsx");
  assert(
    page.includes("collectGraphForOutput") && page.includes("traceBackward"),
    "la página usa el recorrido nuevo hacia atrás"
  );
  assert(
    page.includes("collectGraphForInput") && page.includes("traceForwardFromInput"),
    "la página usa el recorrido nuevo hacia adelante"
  );
  assert(
    page.includes("Lote producido interno") || page.includes("producto intermedio"),
    "la página distingue el eslabón interno"
  );
});

if (failures > 0) {
  console.error(`\n${failures} verificación(es) fallaron.`);
  process.exit(1);
}
console.log("\nTodas las verificaciones de genealogía pasaron.");
