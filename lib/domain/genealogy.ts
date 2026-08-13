/**
 * Trazaloop · Sprint PCR-02 (Bloque F) · Genealogía multi-salto.
 *
 * Lógica PURA de ensamblado: recibe un SUBGRAFO ya recolectado por la capa
 * de datos (lib/db/genealogy.ts recolecta con consultas focalizadas por
 * nivel, jamás el universo completo) y reconstruye la cadena
 *
 *   Proveedor → Lote de entrada → Orden A → Lote intermedio → Orden B → Lote final
 *
 * en ambas direcciones, A PRUEBA DE CICLOS (conjunto de visitados + tope de
 * profundidad). Testeable sin BD en tests/unit/pcr02-genealogy.test.ts.
 */

export type GenealogyOrder = {
  id: string;
  order_code: string;
  status: string;
  order_date: string | null;
};

export type GenealogyOutput = {
  id: string;
  batch_code: string;
  production_order_id: string;
  product_label: string | null;
  produced_quantity_kg: number | null;
  produced_date: string | null;
};

export type GenealogyInput = {
  id: string;
  batch_code: string;
  supplier_name: string | null;
  material_name: string | null;
  quantity_kg: number | null;
};

/** Consumo externo: orden ← lote de entrada. */
export type ExternalConsumptionEdge = {
  production_order_id: string;
  input_batch_id: string;
  mass_kg: number;
};

/** Consumo interno: orden ← lote producido (por otra orden). */
export type InternalConsumptionEdge = {
  production_order_id: string;
  output_batch_id: string;
  mass_kg: number;
};

export type GenealogyGraph = {
  orders: Map<string, GenealogyOrder>;
  outputs: Map<string, GenealogyOutput>;
  inputs: Map<string, GenealogyInput>;
  externalConsumption: ExternalConsumptionEdge[];
  internalConsumption: InternalConsumptionEdge[];
};

export const GENEALOGY_MAX_DEPTH = 10;

/** Una etapa hacia atrás: la orden que produjo un lote, con sus dos tipos de
 *  entradas; las entradas internas apuntan al lote producido anterior. */
export type BackwardStage = {
  output: GenealogyOutput;
  order: GenealogyOrder | null;
  externalInputs: Array<{ input: GenealogyInput; mass_kg: number }>;
  internalInputs: Array<{ output: GenealogyOutput; mass_kg: number }>;
  /** Profundidad 0 = el lote consultado. */
  depth: number;
  truncated: boolean;
};

/**
 * Cadena hacia ATRÁS desde un lote producido: orden que lo produjo →
 * entradas externas + entradas internas → (recursivo sobre los lotes
 * internos). BFS con visitados: un ciclo se corta y se marca `truncated`.
 */
export function traceBackward(
  graph: GenealogyGraph,
  startOutputId: string,
  maxDepth: number = GENEALOGY_MAX_DEPTH
): BackwardStage[] {
  const stages: BackwardStage[] = [];
  const visitedOutputs = new Set<string>();
  let frontier: Array<{ outputId: string; depth: number }> = [
    { outputId: startOutputId, depth: 0 },
  ];

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const { outputId, depth } of frontier) {
      if (visitedOutputs.has(outputId)) continue; // ciclo o rombo: no repetir
      visitedOutputs.add(outputId);

      const output = graph.outputs.get(outputId);
      if (!output) continue;
      const order = graph.orders.get(output.production_order_id) ?? null;

      const externalInputs = order
        ? graph.externalConsumption
            .filter((e) => e.production_order_id === order.id)
            .map((e) => ({ input: graph.inputs.get(e.input_batch_id), mass_kg: e.mass_kg }))
            .filter((x): x is { input: GenealogyInput; mass_kg: number } => Boolean(x.input))
        : [];
      const internalEdges = order
        ? graph.internalConsumption.filter((e) => e.production_order_id === order.id)
        : [];
      const internalInputs = internalEdges
        .map((e) => ({ output: graph.outputs.get(e.output_batch_id), mass_kg: e.mass_kg }))
        .filter((x): x is { output: GenealogyOutput; mass_kg: number } => Boolean(x.output));

      const atLimit = depth >= maxDepth;
      stages.push({
        output,
        order,
        externalInputs,
        internalInputs,
        depth,
        truncated: atLimit && internalInputs.length > 0,
      });

      if (!atLimit) {
        for (const e of internalEdges) {
          if (!visitedOutputs.has(e.output_batch_id)) {
            next.push({ outputId: e.output_batch_id, depth: depth + 1 });
          }
        }
      }
    }
    frontier = next;
  }
  return stages;
}

/** Una etapa hacia ADELANTE: dónde se consumió un lote y qué produjo esa
 *  orden posterior. */
export type ForwardStage = {
  /** Lote (de entrada o producido) cuyo destino se sigue. */
  fromLabel: string;
  order: GenealogyOrder;
  mass_kg: number;
  producedOutputs: GenealogyOutput[];
  depth: number;
  truncated: boolean;
};

/**
 * Cadena hacia ADELANTE desde un lote de ENTRADA externo: órdenes que lo
 * consumieron → lotes que produjeron → órdenes posteriores que consumieron
 * esos lotes → … A prueba de ciclos por conjunto de órdenes visitadas.
 */
export function traceForwardFromInput(
  graph: GenealogyGraph,
  inputBatchId: string,
  maxDepth: number = GENEALOGY_MAX_DEPTH
): ForwardStage[] {
  const input = graph.inputs.get(inputBatchId);
  const firstOrders = graph.externalConsumption
    .filter((e) => e.input_batch_id === inputBatchId)
    .map((e) => ({ orderId: e.production_order_id, mass: e.mass_kg }));
  return forwardWalk(
    graph,
    firstOrders.map((f) => ({
      orderId: f.orderId,
      mass: f.mass,
      fromLabel: input ? `Lote de entrada ${input.batch_code}` : "Lote de entrada",
      depth: 0,
    })),
    maxDepth
  );
}

/** Cadena hacia ADELANTE desde un lote PRODUCIDO (¿dónde se reutilizó?). */
export function traceForwardFromOutput(
  graph: GenealogyGraph,
  outputBatchId: string,
  maxDepth: number = GENEALOGY_MAX_DEPTH
): ForwardStage[] {
  const output = graph.outputs.get(outputBatchId);
  const firstOrders = graph.internalConsumption
    .filter((e) => e.output_batch_id === outputBatchId)
    .map((e) => ({ orderId: e.production_order_id, mass: e.mass_kg }));
  return forwardWalk(
    graph,
    firstOrders.map((f) => ({
      orderId: f.orderId,
      mass: f.mass,
      fromLabel: output ? `Lote producido ${output.batch_code}` : "Lote producido",
      depth: 0,
    })),
    maxDepth
  );
}

function forwardWalk(
  graph: GenealogyGraph,
  seeds: Array<{ orderId: string; mass: number; fromLabel: string; depth: number }>,
  maxDepth: number
): ForwardStage[] {
  const stages: ForwardStage[] = [];
  const visitedOrders = new Set<string>();
  let frontier = seeds;

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const seed of frontier) {
      if (visitedOrders.has(seed.orderId)) continue;
      visitedOrders.add(seed.orderId);
      const order = graph.orders.get(seed.orderId);
      if (!order) continue;

      const producedOutputs = Array.from(graph.outputs.values()).filter(
        (o) => o.production_order_id === order.id
      );
      const atLimit = seed.depth >= maxDepth;
      let hasFurther = false;

      if (!atLimit) {
        for (const out of producedOutputs) {
          const consumers = graph.internalConsumption.filter(
            (e) => e.output_batch_id === out.id
          );
          for (const c of consumers) {
            hasFurther = true;
            if (!visitedOrders.has(c.production_order_id)) {
              next.push({
                orderId: c.production_order_id,
                mass: c.mass_kg,
                fromLabel: `Lote producido ${out.batch_code}`,
                depth: seed.depth + 1,
              });
            }
          }
        }
      } else {
        hasFurther = producedOutputs.some((out) =>
          graph.internalConsumption.some((e) => e.output_batch_id === out.id)
        );
      }

      stages.push({
        fromLabel: seed.fromLabel,
        order,
        mass_kg: seed.mass,
        producedOutputs,
        depth: seed.depth,
        truncated: atLimit && hasFurther,
      });
    }
    frontier = next;
  }
  return stages;
}
