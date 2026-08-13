import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  GENEALOGY_MAX_DEPTH,
  type GenealogyGraph,
  type GenealogyInput,
  type GenealogyOrder,
  type GenealogyOutput,
} from "@/lib/domain/genealogy";

/**
 * Trazaloop · Sprint PCR-02 (Bloque F) · Recolección del SUBGRAFO de
 * genealogía relevante para un lote, mediante BFS por niveles con consultas
 * `.in()` acotadas a la empresa activa (RLS + organization_id) y tope de
 * profundidad — JAMÁS se carga el universo de datos. El ensamblado de la
 * cadena es lógica pura en lib/domain/genealogy.ts.
 */

type MutableGraph = {
  orders: Map<string, GenealogyOrder>;
  outputs: Map<string, GenealogyOutput>;
  inputs: Map<string, GenealogyInput>;
  externalConsumption: GenealogyGraph["externalConsumption"];
  internalConsumption: GenealogyGraph["internalConsumption"];
};

function emptyGraph(): MutableGraph {
  return {
    orders: new Map(),
    outputs: new Map(),
    inputs: new Map(),
    externalConsumption: [],
    internalConsumption: [],
  };
}

async function loadOutputs(orgId: string, ids: string[], graph: MutableGraph) {
  const missing = ids.filter((id) => !graph.outputs.has(id));
  if (missing.length === 0) return;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batches")
    .select("id, batch_code, production_order_id, produced_quantity_kg, produced_date, products(code, name)")
    .eq("organization_id", orgId)
    .in("id", missing);
  for (const b of data ?? []) {
    const p = b.products as unknown as { code: string; name: string } | null;
    graph.outputs.set(b.id as string, {
      id: b.id as string,
      batch_code: b.batch_code as string,
      production_order_id: b.production_order_id as string,
      product_label: p ? `${p.code} · ${p.name}` : null,
      produced_quantity_kg:
        b.produced_quantity_kg === null ? null : Number(b.produced_quantity_kg),
      produced_date: (b.produced_date as string | null) ?? null,
    });
  }
}

async function loadOrders(orgId: string, ids: string[], graph: MutableGraph) {
  const missing = ids.filter((id) => !graph.orders.has(id));
  if (missing.length === 0) return;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("production_orders")
    .select("id, order_code, status, order_date")
    .eq("organization_id", orgId)
    .in("id", missing);
  for (const o of data ?? []) {
    graph.orders.set(o.id as string, {
      id: o.id as string,
      order_code: o.order_code as string,
      status: o.status as string,
      order_date: (o.order_date as string | null) ?? null,
    });
  }
}

async function loadInputs(orgId: string, ids: string[], graph: MutableGraph) {
  const missing = ids.filter((id) => !graph.inputs.has(id));
  if (missing.length === 0) return;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("input_batches")
    .select("id, batch_code, quantity_kg, suppliers(name), materials(name)")
    .eq("organization_id", orgId)
    .in("id", missing);
  for (const b of data ?? []) {
    const s = b.suppliers as unknown as { name: string } | null;
    const m = b.materials as unknown as { name: string } | null;
    graph.inputs.set(b.id as string, {
      id: b.id as string,
      batch_code: b.batch_code as string,
      supplier_name: s?.name ?? null,
      material_name: m?.name ?? null,
      quantity_kg: b.quantity_kg === null ? null : Number(b.quantity_kg),
    });
  }
}

/** Consumos (externos + internos) de un conjunto de órdenes. Devuelve los
 *  ids de lotes producidos consumidos (siguiente nivel hacia atrás). */
async function loadConsumptionForOrders(
  orgId: string,
  orderIds: string[],
  graph: MutableGraph
): Promise<string[]> {
  if (orderIds.length === 0) return [];
  const supabase = await createServerClient();
  const [{ data: external }, { data: internal }] = await Promise.all([
    supabase
      .from("batch_consumption")
      .select("production_order_id, input_batch_id, mass_kg")
      .eq("organization_id", orgId)
      .in("production_order_id", orderIds),
    supabase
      .from("output_batch_consumption")
      .select("production_order_id, output_batch_id, mass_kg")
      .eq("organization_id", orgId)
      .in("production_order_id", orderIds),
  ]);

  const inputIds: string[] = [];
  for (const e of external ?? []) {
    graph.externalConsumption.push({
      production_order_id: e.production_order_id as string,
      input_batch_id: e.input_batch_id as string,
      mass_kg: Number(e.mass_kg),
    });
    inputIds.push(e.input_batch_id as string);
  }
  await loadInputs(orgId, inputIds, graph);

  const nextOutputIds: string[] = [];
  for (const i of internal ?? []) {
    graph.internalConsumption.push({
      production_order_id: i.production_order_id as string,
      output_batch_id: i.output_batch_id as string,
      mass_kg: Number(i.mass_kg),
    });
    nextOutputIds.push(i.output_batch_id as string);
  }
  return nextOutputIds;
}

/** Órdenes que consumieron un conjunto de lotes producidos (hacia adelante). */
async function loadConsumersOfOutputs(
  orgId: string,
  outputIds: string[],
  graph: MutableGraph
): Promise<string[]> {
  if (outputIds.length === 0) return [];
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batch_consumption")
    .select("production_order_id, output_batch_id, mass_kg")
    .eq("organization_id", orgId)
    .in("output_batch_id", outputIds);
  const orderIds: string[] = [];
  for (const i of data ?? []) {
    const exists = graph.internalConsumption.some(
      (e) =>
        e.production_order_id === i.production_order_id &&
        e.output_batch_id === i.output_batch_id
    );
    if (!exists) {
      graph.internalConsumption.push({
        production_order_id: i.production_order_id as string,
        output_batch_id: i.output_batch_id as string,
        mass_kg: Number(i.mass_kg),
      });
    }
    orderIds.push(i.production_order_id as string);
  }
  return orderIds;
}

/** Salidas producidas por un conjunto de órdenes (hacia adelante). */
async function loadOutputsOfOrders(
  orgId: string,
  orderIds: string[],
  graph: MutableGraph
): Promise<string[]> {
  if (orderIds.length === 0) return [];
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("output_batches")
    .select("id, batch_code, production_order_id, produced_quantity_kg, produced_date, products(code, name)")
    .eq("organization_id", orgId)
    .in("production_order_id", orderIds);
  const ids: string[] = [];
  for (const b of data ?? []) {
    const p = b.products as unknown as { code: string; name: string } | null;
    graph.outputs.set(b.id as string, {
      id: b.id as string,
      batch_code: b.batch_code as string,
      production_order_id: b.production_order_id as string,
      product_label: p ? `${p.code} · ${p.name}` : null,
      produced_quantity_kg:
        b.produced_quantity_kg === null ? null : Number(b.produced_quantity_kg),
      produced_date: (b.produced_date as string | null) ?? null,
    });
    ids.push(b.id as string);
  }
  return ids;
}

/**
 * Subgrafo para la genealogía de un LOTE PRODUCIDO: hacia atrás (órdenes y
 * consumos encadenados) y hacia adelante (órdenes posteriores que lo
 * consumieron y lo que produjeron). BFS acotado por GENEALOGY_MAX_DEPTH y
 * conjuntos de visitados.
 */
export async function collectGraphForOutput(
  orgId: string,
  outputBatchId: string
): Promise<GenealogyGraph> {
  const graph = emptyGraph();

  // --- Hacia atrás ---
  let backOutputs = [outputBatchId];
  const visitedBackOutputs = new Set<string>();
  for (let depth = 0; depth <= GENEALOGY_MAX_DEPTH && backOutputs.length > 0; depth++) {
    const fresh = backOutputs.filter((id) => !visitedBackOutputs.has(id));
    fresh.forEach((id) => visitedBackOutputs.add(id));
    if (fresh.length === 0) break;
    await loadOutputs(orgId, fresh, graph);
    const orderIds = Array.from(
      new Set(
        fresh
          .map((id) => graph.outputs.get(id)?.production_order_id)
          .filter((v): v is string => Boolean(v))
      )
    );
    await loadOrders(orgId, orderIds, graph);
    backOutputs = await loadConsumptionForOrders(orgId, orderIds, graph);
  }

  // --- Hacia adelante ---
  let forwardOutputs = [outputBatchId];
  const visitedForwardOrders = new Set<string>();
  for (let depth = 0; depth <= GENEALOGY_MAX_DEPTH && forwardOutputs.length > 0; depth++) {
    const consumerOrderIds = (
      await loadConsumersOfOutputs(orgId, forwardOutputs, graph)
    ).filter((id) => !visitedForwardOrders.has(id));
    consumerOrderIds.forEach((id) => visitedForwardOrders.add(id));
    if (consumerOrderIds.length === 0) break;
    await loadOrders(orgId, consumerOrderIds, graph);
    forwardOutputs = await loadOutputsOfOrders(orgId, consumerOrderIds, graph);
  }

  return graph;
}

/** Subgrafo para la genealogía de un LOTE DE ENTRADA externo hacia adelante:
 *  órdenes que lo consumieron → salidas → órdenes posteriores → … */
export async function collectGraphForInput(
  orgId: string,
  inputBatchId: string
): Promise<GenealogyGraph> {
  const graph = emptyGraph();
  await loadInputs(orgId, [inputBatchId], graph);

  const supabase = await createServerClient();
  const { data: firstConsumption } = await supabase
    .from("batch_consumption")
    .select("production_order_id, input_batch_id, mass_kg")
    .eq("organization_id", orgId)
    .eq("input_batch_id", inputBatchId);
  const seedOrderIds: string[] = [];
  for (const e of firstConsumption ?? []) {
    graph.externalConsumption.push({
      production_order_id: e.production_order_id as string,
      input_batch_id: e.input_batch_id as string,
      mass_kg: Number(e.mass_kg),
    });
    seedOrderIds.push(e.production_order_id as string);
  }

  const visitedOrders = new Set<string>();
  let orderIds = seedOrderIds;
  for (let depth = 0; depth <= GENEALOGY_MAX_DEPTH && orderIds.length > 0; depth++) {
    const fresh = orderIds.filter((id) => !visitedOrders.has(id));
    fresh.forEach((id) => visitedOrders.add(id));
    if (fresh.length === 0) break;
    await loadOrders(orgId, fresh, graph);
    const outputIds = await loadOutputsOfOrders(orgId, fresh, graph);
    orderIds = await loadConsumersOfOutputs(orgId, outputIds, graph);
  }
  return graph;
}
