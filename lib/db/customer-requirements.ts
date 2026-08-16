/**
 * PCR-03.1 · Lectura de acuerdos/requisitos de cliente. Consultas SIEMPRE
 * acotadas por organización y paginadas (patrón PCR-01.1). Los vínculos y
 * las evidencias de una página se resuelven con una consulta por página,
 * nunca por fila.
 */
import { createServerClient } from "@/lib/supabase/server";

export type CustomerRequirementRow = {
  id: string;
  customer_name: string;
  code: string;
  title: string;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  active: boolean;
  notes: string | null;
};

export type RequirementLinkRow = {
  id: string;
  requirement_id: string;
  target_type: "product" | "output_batch" | "production_order";
  target_id: string;
  target_label: string;
};

const PAGE_SIZE = 20;

export async function listCustomerRequirements(
  orgId: string,
  opts: { q?: string; page?: string } = {}
): Promise<{ rows: CustomerRequirementRow[]; total: number; page: number; pageSize: number }> {
  const pageN = Math.max(1, Math.floor(Number(opts.page ?? "1")) || 1);
  const supabase = await createServerClient();
  let request = supabase
    .from("customer_requirements")
    .select("id, customer_name, code, title, description, starts_on, ends_on, active, notes", {
      count: "exact",
    })
    .eq("organization_id", orgId);
  const term = (opts.q ?? "").trim().replace(/[%_]/g, "");
  if (term) {
    request = request.or(`customer_name.ilike.%${term}%,code.ilike.%${term}%,title.ilike.%${term}%`);
  }
  const from = (pageN - 1) * PAGE_SIZE;
  const { data, count } = await request
    .order("active", { ascending: false })
    .order("customer_name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  return {
    rows: (data ?? []).map((r) => ({
      id: r.id as string,
      customer_name: r.customer_name as string,
      code: r.code as string,
      title: r.title as string,
      description: (r.description as string | null) ?? null,
      starts_on: (r.starts_on as string | null) ?? null,
      ends_on: (r.ends_on as string | null) ?? null,
      active: Boolean(r.active),
      notes: (r.notes as string | null) ?? null,
    })),
    total: count ?? 0,
    page: pageN,
    pageSize: PAGE_SIZE,
  };
}

/** Resolución puntual por id (patrón ?focus= de PCR-01.1). */
export async function getCustomerRequirement(
  orgId: string,
  id: string
): Promise<CustomerRequirementRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("customer_requirements")
    .select("id, customer_name, code, title, description, starts_on, ends_on, active, notes")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    customer_name: data.customer_name as string,
    code: data.code as string,
    title: data.title as string,
    description: (data.description as string | null) ?? null,
    starts_on: (data.starts_on as string | null) ?? null,
    ends_on: (data.ends_on as string | null) ?? null,
    active: Boolean(data.active),
    notes: (data.notes as string | null) ?? null,
  };
}

/** Vínculos de los requisitos de UNA página, con etiqueta legible del
 *  destino resuelta en tres consultas `in (…)` acotadas (no por fila). */
export async function listRequirementLinksFor(
  orgId: string,
  requirementIds: string[]
): Promise<Map<string, RequirementLinkRow[]>> {
  const map = new Map<string, RequirementLinkRow[]>();
  if (requirementIds.length === 0) return map;
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("customer_requirement_links")
    .select("id, requirement_id, target_type, target_id")
    .eq("organization_id", orgId)
    .in("requirement_id", requirementIds);
  const links = data ?? [];
  const byType: Record<string, string[]> = { product: [], output_batch: [], production_order: [] };
  for (const l of links) byType[l.target_type as string]?.push(l.target_id as string);
  const labels = new Map<string, string>();
  if (byType.product.length) {
    const { data: rows } = await supabase
      .from("products")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .in("id", byType.product);
    for (const r of rows ?? []) labels.set(`product:${r.id}`, `Producto ${r.code} · ${r.name}`);
  }
  if (byType.output_batch.length) {
    const { data: rows } = await supabase
      .from("output_batches")
      .select("id, batch_code")
      .eq("organization_id", orgId)
      .in("id", byType.output_batch);
    for (const r of rows ?? []) labels.set(`output_batch:${r.id}`, `Lote producido ${r.batch_code}`);
  }
  if (byType.production_order.length) {
    const { data: rows } = await supabase
      .from("production_orders")
      .select("id, order_code")
      .eq("organization_id", orgId)
      .in("id", byType.production_order);
    for (const r of rows ?? []) labels.set(`production_order:${r.id}`, `Orden / corrida ${r.order_code}`);
  }
  for (const l of links) {
    const row: RequirementLinkRow = {
      id: l.id as string,
      requirement_id: l.requirement_id as string,
      target_type: l.target_type as RequirementLinkRow["target_type"],
      target_id: l.target_id as string,
      target_label: labels.get(`${l.target_type}:${l.target_id}`) ?? "Registro no disponible",
    };
    const list = map.get(row.requirement_id) ?? [];
    list.push(row);
    map.set(row.requirement_id, list);
  }
  return map;
}

/** Requisitos vinculados a un conjunto de destinos (para el ejercicio y el
 *  expediente PCR-03.2/03.3): una consulta acotada por página de destinos. */
export async function listRequirementsForTargets(
  orgId: string,
  targets: Array<{ target_type: RequirementLinkRow["target_type"]; target_id: string }>
): Promise<Array<CustomerRequirementRow & { target_type: string; target_id: string }>> {
  if (targets.length === 0) return [];
  const supabase = await createServerClient();
  const ids = [...new Set(targets.map((t) => t.target_id))];
  const { data } = await supabase
    .from("customer_requirement_links")
    .select(
      "target_type, target_id, customer_requirements(id, customer_name, code, title, description, starts_on, ends_on, active, notes)"
    )
    .eq("organization_id", orgId)
    .in("target_id", ids);
  const wanted = new Set(targets.map((t) => `${t.target_type}:${t.target_id}`));
  const out: Array<CustomerRequirementRow & { target_type: string; target_id: string }> = [];
  for (const l of data ?? []) {
    if (!wanted.has(`${l.target_type}:${l.target_id}`)) continue;
    const r = l.customer_requirements as unknown as CustomerRequirementRow | null;
    if (!r) continue;
    out.push({ ...r, active: Boolean(r.active), target_type: l.target_type as string, target_id: l.target_id as string });
  }
  return out;
}
