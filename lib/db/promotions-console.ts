import "server-only";
import { createServerClient } from "@/lib/supabase/server";

/**
 * Trazaloop · PE-05B6C · Las campañas, para quien las administra.
 *
 * Se lee y se escribe CON LA SESIÓN de quien opera: las políticas dejan mirar a
 * la plataforma, y las primitivas exigen superadministración para cambiar nada.
 * Que esta capa se olvidara de comprobarlo no abriría ninguna puerta.
 */

export type PromotionRow = {
  id: string;
  name: string;
  description: string | null;
  program: "general" | "institutional_full";
  discountBasisPoints: number;
  maxDiscountBasisPoints: number | null;
  eligiblePlanCodes: string[];
  eligibleIntervals: string[];
  startsAt: string;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerOrganization: number;
  status: "draft" | "active" | "retired";
  codes: PromotionCodeRow[];
  redemptions: number;
};

export type PromotionCodeRow = {
  id: string;
  code: string;
  status: "active" | "retired";
  redemptions: number;
};

export type RedemptionRow = {
  id: string;
  organizationId: string;
  organizationName: string | null;
  promotionName: string;
  code: string;
  planCode: string;
  billingInterval: string;
  discountBasisPoints: number | null;
  discountCatalogMinor: number;
  catalogCurrency: string;
  redeemedAt: string;
};

/** `null` = no se pudo leer. Distinto de «no hay campañas». */
export async function listPromotions(): Promise<PromotionRow[] | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("billing_promotions")
    .select("id, name, description, program, discount_value,"
      + " max_discount_basis_points, eligible_plan_codes, eligible_intervals,"
      + " starts_at, ends_at, max_redemptions, max_per_organization, status")
    .order("created_at", { ascending: false });
  if (error) return null;

  const { data: codigos } = await supabase.from("billing_promotion_codes")
    .select("id, promotion_id, code, status");
  const { data: canjes } = await supabase.from("billing_promotion_redemptions")
    .select("id, promotion_id, code_id");

  const porCampana = new Map<string, PromotionCodeRow[]>();
  const usosPorCodigo = new Map<string, number>();
  const usosPorCampana = new Map<string, number>();
  for (const c of ((canjes ?? []) as { promotion_id: string; code_id: string }[])) {
    usosPorCodigo.set(c.code_id, (usosPorCodigo.get(c.code_id) ?? 0) + 1);
    usosPorCampana.set(c.promotion_id, (usosPorCampana.get(c.promotion_id) ?? 0) + 1);
  }
  for (const c of ((codigos ?? []) as
      { id: string; promotion_id: string; code: string; status: string }[])) {
    const lista = porCampana.get(c.promotion_id) ?? [];
    lista.push({ id: c.id, code: c.code, status: c.status as "active" | "retired",
                 redemptions: usosPorCodigo.get(c.id) ?? 0 });
    porCampana.set(c.promotion_id, lista);
  }

  type Fila = {
    id: string; name: string; description: string | null; program: string;
    discount_value: number; max_discount_basis_points: number | null;
    eligible_plan_codes: string[]; eligible_intervals: string[];
    starts_at: string; ends_at: string | null; max_redemptions: number | null;
    max_per_organization: number; status: string;
  };
  return ((data ?? []) as unknown as Fila[]).map((r) => ({
    id: r.id, name: r.name, description: r.description,
    program: r.program as PromotionRow["program"],
    discountBasisPoints: Number(r.discount_value),
    maxDiscountBasisPoints: r.max_discount_basis_points === null
      ? null : Number(r.max_discount_basis_points),
    eligiblePlanCodes: r.eligible_plan_codes,
    eligibleIntervals: r.eligible_intervals,
    startsAt: r.starts_at, endsAt: r.ends_at,
    maxRedemptions: r.max_redemptions === null ? null : Number(r.max_redemptions),
    maxPerOrganization: Number(r.max_per_organization),
    status: r.status as PromotionRow["status"],
    codes: porCampana.get(r.id) ?? [],
    redemptions: usosPorCampana.get(r.id) ?? 0,
  }));
}

export async function listRedemptions(limit = 100): Promise<RedemptionRow[] | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("billing_promotion_redemptions")
    .select("id, organization_id, promotion_id, code_id, plan_code, billing_interval,"
      + " discount_basis_points, discount_catalog_minor, catalog_currency, redeemed_at")
    .order("redeemed_at", { ascending: false }).limit(limit);
  if (error) return null;

  const { data: promos } = await supabase.from("billing_promotions").select("id, name");
  const { data: codigos } = await supabase.from("billing_promotion_codes").select("id, code");
  const { data: empresas } = await supabase.from("v_platform_organizations")
    .select("organization_id, organization_name");

  const nombre = new Map(((promos ?? []) as { id: string; name: string }[])
    .map((p) => [p.id, p.name]));
  const codigo = new Map(((codigos ?? []) as { id: string; code: string }[])
    .map((c) => [c.id, c.code]));
  const empresa = new Map(((empresas ?? []) as
    { organization_id: string; organization_name: string }[])
    .map((o) => [o.organization_id, o.organization_name]));

  type Fila = {
    id: string; organization_id: string; promotion_id: string; code_id: string;
    plan_code: string; billing_interval: string; discount_basis_points: number | null;
    discount_catalog_minor: number; catalog_currency: string; redeemed_at: string;
  };
  return ((data ?? []) as unknown as Fila[]).map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    organizationName: empresa.get(r.organization_id) ?? null,
    promotionName: nombre.get(r.promotion_id) ?? "—",
    code: codigo.get(r.code_id) ?? "—",
    planCode: r.plan_code,
    billingInterval: r.billing_interval,
    discountBasisPoints: r.discount_basis_points === null
      ? null : Number(r.discount_basis_points),
    discountCatalogMinor: Number(r.discount_catalog_minor),
    catalogCurrency: r.catalog_currency,
    redeemedAt: r.redeemed_at,
  }));
}
