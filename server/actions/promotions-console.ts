"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformStaff } from "@/lib/auth/require-platform-staff";
import { createServerClient } from "@/lib/supabase/server";
import {
  listPromotions, listRedemptions,
  type PromotionRow, type RedemptionRow,
} from "@/lib/db/promotions-console";
import { INSTITUTIONAL_FULL_MAX_BPS } from "@/lib/domain/commercial-catalog";

/**
 * Trazaloop · PE-05B6C · La consola de campañas.
 *
 * Todo pasa por las primitivas de 0180, que exigen superadministración EN SQL.
 * Esta capa comprueba también, pero no es donde vive la seguridad: si alguien
 * llamara a la acción sin ser quien dice, la base seguiría diciendo que no.
 */
export type PromotionsView = {
  promotions: PromotionRow[] | null;
  redemptions: RedemptionRow[] | null;
  canManage: boolean;
};

export async function getPromotionsAction(): Promise<PromotionsView> {
  const { isSuperadmin } = await requirePlatformStaff();
  const [promotions, redemptions] = await Promise.all([
    listPromotions(), listRedemptions(),
  ]);
  return { promotions, redemptions, canManage: isSuperadmin };
}

export type PromotionActionState = { error: string | null; ok?: boolean };

const MENSAJE: Record<string, string> = {
  not_found: "Esa campaña ya no existe.",
  not_draft: "Solo se publica una campaña en borrador.",
  no_active_code: "Publica la campaña cuando tenga al menos un código activo: "
                + "sin código nadie puede canjearla.",
  already_retired: "Esa campaña ya estaba retirada.",
  promotion_not_found: "Esa campaña ya no existe.",
  promotion_retired: "No se añaden códigos a una campaña retirada.",
  code_taken: "Ese código ya existe. Elige otro.",
  code_shape_invalid: "El código debe tener entre 3 y 40 caracteres.",
  not_active: "Ese código ya estaba retirado.",
};

function traducir(estado: string, exito: string): PromotionActionState {
  if (estado === exito) return { error: null, ok: true };
  return { error: MENSAJE[estado] ?? "No fue posible completar la operación." };
}

export async function createPromotionAction(input: {
  name: string; description: string | null; program: string;
  discountBasisPoints: number; eligiblePlanCodes: string[];
  eligibleIntervals: string[]; maxDiscountBasisPoints: number | null;
  startsAt: string; endsAt: string | null;
  maxRedemptions: number | null; maxPerOrganization: number;
}): Promise<PromotionActionState> {
  const { isSuperadmin } = await requirePlatformStaff();
  if (!isSuperadmin) {
    return { error: "Crear campañas es de la administración de plataforma." };
  }
  // EL TECHO Y EL PLAN SON POLÍTICA, NO UN DATO DEL FORMULARIO.
  //
  // Antes había que escribir dos porcentajes —el descuento y su techo— y marcar
  // a mano que el institucional es solo para Full. Eso obliga a quien administra
  // a conocer una regla interna para no romperla. Ahora la pone el servidor, y
  // la base sigue siendo la autoridad: si esto se equivocara, 0180 lo rechaza.
  const institucional = input.program === "institutional_full";
  const techo = institucional ? INSTITUTIONAL_FULL_MAX_BPS : null;
  const planes = institucional ? ["full"] : input.eligiblePlanCodes;

  if (institucional && input.discountBasisPoints > INSTITUTIONAL_FULL_MAX_BPS) {
    return { error: "El programa Institucional Full permite un descuento máximo "
                  + "del 40 %." };
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_create_promotion", {
    p_name: input.name, p_description: input.description, p_program: input.program,
    p_discount_basis_points: input.discountBasisPoints,
    p_eligible_plan_codes: planes,
    p_eligible_intervals: input.eligibleIntervals,
    p_max_discount_basis_points: techo,
    p_starts_at: input.startsAt, p_ends_at: input.endsAt,
    p_max_redemptions: input.maxRedemptions,
    p_max_per_organization: input.maxPerOrganization,
  });
  if (error) {
    // La base rechaza lo que no cuadra —un institucional por encima del 40 %,
    // por ejemplo—. Se dice qué pasó sin copiar el error de Postgres.
    if ((error.message ?? "").includes("bp_institutional_shape")) {
      return { error: "El programa Institucional Full permite un descuento máximo "
                    + "del 40 %, y solo para Full." };
    }
    if ((error.message ?? "").includes("bp_ceiling_check")) {
      return { error: "El descuento no puede superar el techo de la campaña." };
    }
    if ((error.message ?? "").includes("bp_percentage_range")) {
      return { error: "El descuento tiene que estar entre el 0,01 % y el 100 %." };
    }
    return { error: "No fue posible crear la campaña." };
  }
  revalidatePath("/platform/plans");
  return traducir(String((data as Record<string, unknown>).status), "created");
}

export async function publishPromotionAction(id: string): Promise<PromotionActionState> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_publish_promotion",
    { p_promotion_id: id });
  if (error) return { error: "No fue posible publicar la campaña." };
  revalidatePath("/platform/plans");
  return traducir(String((data as Record<string, unknown>).status), "published");
}

export async function retirePromotionAction(id: string): Promise<PromotionActionState> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_retire_promotion",
    { p_promotion_id: id });
  if (error) return { error: "No fue posible retirar la campaña." };
  revalidatePath("/platform/plans");
  return traducir(String((data as Record<string, unknown>).status), "retired");
}

export async function createPromotionCodeAction(
  promotionId: string, code: string
): Promise<PromotionActionState> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_create_promotion_code",
    { p_promotion_id: promotionId, p_code: code });
  if (error) return { error: "No fue posible crear el código." };
  revalidatePath("/platform/plans");
  return traducir(String((data as Record<string, unknown>).status), "created");
}

export async function retirePromotionCodeAction(id: string): Promise<PromotionActionState> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("billing_retire_promotion_code",
    { p_code_id: id });
  if (error) return { error: "No fue posible retirar el código." };
  revalidatePath("/platform/plans");
  return traducir(String((data as Record<string, unknown>).status), "retired");
}
