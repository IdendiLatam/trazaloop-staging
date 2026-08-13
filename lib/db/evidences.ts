import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import {
  normalizePageQuery,
  pageRange,
  sanitizeSearchTerm,
  type PageResult,
} from "@/lib/domain/pagination";

/**
 * Trazaloop · Sprint PCR-01 (puntos 1 y 11) · Capa de datos de evidencias PCR.
 *
 * Nada aquí usa service_role: todo corre con la sesión real, sujeta a las RLS
 * de 0019 (evidences/evidence_links por miembro de la organización) y a la
 * política de Storage `evidences_select` (0101 §12). Las URLs firmadas se
 * generan BAJO DEMANDA con TTL corto — mismo patrón que lib/db/settings.ts
 * (logo) y lib/db/trazadocs-master.ts — y jamás se persisten en HTML: una
 * empresa no puede firmar objetos de otra porque la firma se emite con su
 * propia sesión.
 */

export const EVIDENCE_SIGNED_URL_TTL_SECONDS = 60 * 10;

// ---------------------------------------------------------------------------
// Listado con búsqueda + paginación (punto 9)
// ---------------------------------------------------------------------------
export type EvidenceListItem = {
  id: string;
  name: string;
  evidence_type: string | null;
  status: string;
  evidence_date: string | null;
  valid_until: string | null;
  has_file: boolean;
};

export async function searchEvidences(
  orgId: string,
  query: { q?: string | null; page?: string | number | null }
): Promise<PageResult<EvidenceListItem>> {
  const { q, page, pageSize } = normalizePageQuery(query);
  const supabase = await createServerClient();

  let request = supabase
    .from("evidences")
    .select("id, name, evidence_type, status, evidence_date, valid_until, storage_path", {
      count: "exact",
    })
    .eq("organization_id", orgId);

  const term = sanitizeSearchTerm(q);
  if (term) {
    request = request.or(`name.ilike.%${term}%,evidence_type.ilike.%${term}%`);
  }

  const { from, to } = pageRange(page, pageSize);
  const { data, count } = await request
    .order("created_at", { ascending: false })
    .range(from, to);

  return {
    rows: (data ?? []).map((e) => ({
      id: e.id as string,
      name: e.name as string,
      evidence_type: (e.evidence_type as string | null) ?? null,
      status: e.status as string,
      evidence_date: (e.evidence_date as string | null) ?? null,
      valid_until: (e.valid_until as string | null) ?? null,
      has_file: Boolean(e.storage_path),
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

// ---------------------------------------------------------------------------
// URL firmada para VER una evidencia (punto 1)
// ---------------------------------------------------------------------------
export async function createEvidenceSignedUrl(
  orgId: string,
  evidenceId: string
): Promise<{ url: string | null; error: string | null }> {
  const supabase = await createServerClient();

  // Multiempresa EXPLÍCITO además de RLS: la evidencia debe ser de la
  // empresa ACTIVA del usuario, jamás un id manipulado de otra empresa.
  const { data: evidence } = await supabase
    .from("evidences")
    .select("id, storage_path")
    .eq("id", evidenceId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!evidence) {
    return { url: null, error: "La evidencia no existe o no pertenece a tu empresa." };
  }
  if (!evidence.storage_path) {
    return { url: null, error: "Esta evidencia no tiene archivo adjunto." };
  }

  const { data, error } = await supabase.storage
    .from("evidences")
    .createSignedUrl(evidence.storage_path as string, EVIDENCE_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return { url: null, error: "No fue posible abrir la evidencia. Intenta de nuevo." };
  }
  return { url: data.signedUrl, error: null };
}

// ---------------------------------------------------------------------------
// Registro → Evidencia (punto 11): evidencias vinculadas a un lote de destinos
// ---------------------------------------------------------------------------
export type LinkedEvidence = {
  evidence_id: string;
  name: string;
  evidence_type: string | null;
  evidence_date: string | null;
  status: string;
  has_file: boolean;
  link_role: string | null;
};

export type EvidenceTargetType =
  | "supplier"
  | "material"
  | "product"
  | "product_family"
  | "site"
  | "input_batch"
  | "production_order"
  | "output_batch";

/** Evidencias vinculadas a cada destino de UNA página de registros (una sola
 *  consulta por página, nunca por fila). Devuelve targetId → evidencias. */
export async function listEvidencesForTargets(
  orgId: string,
  targetType: EvidenceTargetType,
  targetIds: string[]
): Promise<Record<string, LinkedEvidence[]>> {
  const byTarget: Record<string, LinkedEvidence[]> = {};
  if (targetIds.length === 0) return byTarget;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("evidence_links")
    .select(
      "target_id, link_role, evidence_id, evidences(name, evidence_type, evidence_date, status, storage_path)"
    )
    .eq("organization_id", orgId)
    .eq("target_type", targetType)
    .in("target_id", targetIds);

  for (const row of data ?? []) {
    const ev = row.evidences as unknown as {
      name: string;
      evidence_type: string | null;
      evidence_date: string | null;
      status: string;
      storage_path: string | null;
    } | null;
    if (!ev) continue;
    const list = (byTarget[row.target_id as string] ??= []);
    list.push({
      evidence_id: row.evidence_id as string,
      name: ev.name,
      evidence_type: ev.evidence_type ?? null,
      evidence_date: ev.evidence_date ?? null,
      status: ev.status,
      has_file: Boolean(ev.storage_path),
      link_role: (row.link_role as string | null) ?? null,
    });
  }
  return byTarget;
}

// ---------------------------------------------------------------------------
// Evidencia → Registro (punto 11): "Utilizada en"
// ---------------------------------------------------------------------------
export type EvidenceUsageRow = {
  target_type: string;
  target_type_label: string;
  target_id: string;
  label: string;
  href: string | null;
  link_role: string | null;
};

const TARGET_TYPE_LABEL: Record<string, string> = {
  supplier: "Proveedor",
  material: "Material",
  product: "Producto",
  product_family: "Familia de producto",
  site: "Sede",
  input_batch: "Lote de entrada",
  production_order: "Orden / corrida de producción",
  output_batch: "Lote producido / lote final",
  document: "Documento",
  requirement: "Requisito",
};

function targetHref(targetType: string, targetId: string): string | null {
  // PCR-01.1 (blocker 4): «Ir al registro» navega SIEMPRE al registro
  // concreto, no al listado genérico. Los listados con paginación aceptan
  // ?focus=<id> (el registro se resuelve por id y se fija aunque quede fuera
  // de la página actual) + ancla; órdenes y lotes producidos usan sus
  // mecanismos específicos ?order= / ?batch= que abren el registro expandido.
  switch (targetType) {
    case "supplier":
      return `/catalog/suppliers?focus=${targetId}#registro-${targetId}`;
    case "material":
      return `/catalog/materials?focus=${targetId}#registro-${targetId}`;
    case "product":
      return `/catalog/products?focus=${targetId}#registro-${targetId}`;
    case "product_family":
      return `/catalog/families?focus=${targetId}#registro-${targetId}`;
    case "input_batch":
      return `/traceability/input-batches?focus=${targetId}#lote-${targetId}`;
    case "production_order":
      // PCR-02: el detalle de la orden muestra SIEMPRE el registro completo.
      return `/traceability/production-orders/${targetId}#registro-${targetId}`;
    case "output_batch":
      return `/traceability/output-batches?batch=${targetId}#lote-${targetId}`;
    default:
      return null;
  }
}

/**
 * Dónde se utiliza una evidencia: vínculos de evidence_links (con la etiqueta
 * humana del registro destino, resuelta por tipo en lotes) + los usos por FK
 * directa de materiales (soporte de origen / reclasificación). Una evidencia
 * puede usarse en 0, 1 o muchos registros. Todo acotado a la empresa activa.
 */
export async function listEvidenceUsage(
  orgId: string,
  evidenceId: string
): Promise<EvidenceUsageRow[]> {
  const supabase = await createServerClient();

  const [{ data: links }, { data: originMaterials }, { data: reclassMaterials }] =
    await Promise.all([
      supabase
        .from("evidence_links")
        .select("target_type, target_id, link_role")
        .eq("organization_id", orgId)
        .eq("evidence_id", evidenceId),
      supabase
        .from("materials")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("origin_support_evidence_id", evidenceId),
      supabase
        .from("materials")
        .select("id, name")
        .eq("organization_id", orgId)
        .eq("reclassification_evidence_id", evidenceId),
    ]);

  // Resolución de etiquetas por tipo, en lote (una consulta por tipo usado).
  const idsByType = new Map<string, string[]>();
  for (const l of links ?? []) {
    const list = idsByType.get(l.target_type as string) ?? [];
    list.push(l.target_id as string);
    idsByType.set(l.target_type as string, list);
  }

  const labelByKey = new Map<string, string>();
  const put = (type: string, id: string, label: string) =>
    labelByKey.set(`${type}:${id}`, label);

  const resolvers: Array<PromiseLike<void>> = [];
  const resolve = (
    type: string,
    table: string,
    columns: string,
    toLabel: (row: Record<string, unknown>) => string
  ) => {
    const ids = idsByType.get(type);
    if (!ids || ids.length === 0) return;
    resolvers.push(
      supabase
        .from(table)
        .select(columns)
        .eq("organization_id", orgId)
        .in("id", ids)
        .then(({ data }) => {
          for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
            put(type, row.id as string, toLabel(row));
          }
        })
    );
  };

  resolve("supplier", "suppliers", "id, name", (r) => String(r.name));
  resolve("material", "materials", "id, name", (r) => String(r.name));
  resolve("product", "products", "id, code, name", (r) => `${r.code} · ${r.name}`);
  resolve("product_family", "product_families", "id, name", (r) => String(r.name));
  resolve("site", "sites", "id, name", (r) => String(r.name));
  resolve("input_batch", "input_batches", "id, batch_code", (r) => String(r.batch_code));
  resolve("production_order", "production_orders", "id, order_code", (r) => String(r.order_code));
  resolve("output_batch", "output_batches", "id, batch_code", (r) => String(r.batch_code));
  await Promise.all(resolvers);

  const rows: EvidenceUsageRow[] = (links ?? []).map((l) => {
    const type = l.target_type as string;
    const id = l.target_id as string;
    return {
      target_type: type,
      target_type_label: TARGET_TYPE_LABEL[type] ?? type,
      target_id: id,
      label: labelByKey.get(`${type}:${id}`) ?? "Registro no disponible",
      href: targetHref(type, id),
      link_role: (l.link_role as string | null) ?? null,
    };
  });

  for (const m of originMaterials ?? []) {
    rows.push({
      target_type: "material",
      target_type_label: "Material",
      target_id: m.id as string,
      label: String(m.name),
      href: "/catalog/materials",
      link_role: "Soporte de origen del material",
    });
  }
  for (const m of reclassMaterials ?? []) {
    rows.push({
      target_type: "material",
      target_type_label: "Material",
      target_id: m.id as string,
      label: String(m.name),
      href: "/catalog/materials",
      link_role: "Soporte de reclasificación del material",
    });
  }

  // Orden estable por tipo y etiqueta, deduplicando (tipo, id, rol) repetidos.
  const seen = new Set<string>();
  return rows
    .filter((r) => {
      const key = `${r.target_type}:${r.target_id}:${r.link_role ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) =>
      a.target_type_label === b.target_type_label
        ? a.label.localeCompare(b.label, "es")
        : a.target_type_label.localeCompare(b.target_type_label, "es")
    );
}

/** Conteo de usos ("Utilizada en") para una página de evidencias, en lote. */
export async function countEvidenceUsage(
  orgId: string,
  evidenceIds: string[]
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (evidenceIds.length === 0) return counts;
  const supabase = await createServerClient();

  const [{ data: links }, { data: mats }] = await Promise.all([
    supabase
      .from("evidence_links")
      .select("evidence_id")
      .eq("organization_id", orgId)
      .in("evidence_id", evidenceIds),
    supabase
      .from("materials")
      .select("origin_support_evidence_id, reclassification_evidence_id")
      .eq("organization_id", orgId)
      .or(
        `origin_support_evidence_id.in.(${evidenceIds.join(",")}),reclassification_evidence_id.in.(${evidenceIds.join(",")})`
      ),
  ]);

  for (const l of links ?? []) {
    const id = l.evidence_id as string;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  for (const m of mats ?? []) {
    for (const id of [m.origin_support_evidence_id, m.reclassification_evidence_id]) {
      if (id && evidenceIds.includes(id as string)) {
        counts[id as string] = (counts[id as string] ?? 0) + 1;
      }
    }
  }
  return counts;
}
