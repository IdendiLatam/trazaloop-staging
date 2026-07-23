"use server";

import { requireTextilesForAction } from "@/lib/auth/require-textiles-module";
import { checkTextilesCanMutate } from "@/server/actions/module-plans";
import { revalidatePath } from "next/cache";
import {
  getTechnicalPassport,
  generateTechnicalPassportFullSnapshot,
  changeTechnicalPassportStatus,
  createTechnicalPassportDraft,
  countTechnicalPassportsForReference,
  getReferenceForOutputLot,
  getReferenceForAssessment,
} from "@/lib/db/textiles-passport";
import { listTextileReferences } from "@/lib/db/textiles-products";
import { cleanText } from "@/lib/domain/textiles-catalogs";
import { isTextilePassportStatus, type TextilePassportStatus } from "@/lib/domain/textiles-passport";

/**
 * Trazaloop · Sprint T9B (Textil) · Server actions mínimas del pasaporte
 * técnico textil. SIN UI ni rutas (eso es T9C): solo el punto de entrada de
 * servidor que T9C consumirá. La generación del snapshot ocurre en la RPC
 * controlada (0088); aquí solo se valida acceso al módulo, organización y
 * pertenencia del pasaporte, y se delega. El cliente nunca envía
 * snapshot/gaps/hash.
 */

export type PassportActionState = { error: string | null; success?: boolean; sourceHash?: string };

async function gate(): Promise<{ organizationId: string; roleCode: string; error: string | null }> {
  const access = await requireTextilesForAction();
  if (access.org === null) return { organizationId: "", roleCode: "", error: access.error };
  return { organizationId: access.org.organizationId, roleCode: access.org.roleCode, error: null };
}

/** Genera (o regenera) el snapshot completo de un pasaporte de la organización. */
export async function generateTextilePassportSnapshotAction(
  passportId: string
): Promise<PassportActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const mutate = await checkTextilesCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  // El pasaporte debe existir y ser de la organización activa (la RPC lo
  // reverifica; esto da un mensaje claro antes de delegar).
  const passport = await getTechnicalPassport(g.organizationId, passportId);
  if (!passport) return { error: "El pasaporte no existe o no pertenece a tu organización." };

  const { sourceHash, error } = await generateTechnicalPassportFullSnapshot(passportId);
  if (error) return { error };
  revalidatePath(`/textiles/passports/${passportId}`);
  revalidatePath("/textiles/passports");
  return { error: null, success: true, sourceHash: sourceHash ?? undefined };
}

/** Transición de estado (enviar a revisión / aprobar internamente / obsoleto). */
export async function changeTextilePassportStatusAction(
  passportId: string,
  toStatus: string
): Promise<PassportActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  if (!isTextilePassportStatus(toStatus)) return { error: "Estado no válido." };
  const mutate = await checkTextilesCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const passport = await getTechnicalPassport(g.organizationId, passportId);
  if (!passport) return { error: "El pasaporte no existe o no pertenece a tu organización." };

  const { error } = await changeTechnicalPassportStatus(passportId, toStatus as TextilePassportStatus);
  if (error) return { error };
  revalidatePath(`/textiles/passports/${passportId}`);
  revalidatePath("/textiles/passports");
  return { error: null, success: true };
}

const PASSPORTS_PATH = "/textiles/passports";

/**
 * Crea un pasaporte 'draft' desde la UI (T9C). Solo acepta los inputs seguros
 * (referencia, lote opcional, evaluación opcional, notas); el snapshot y los
 * sellos los produce la RPC de generación, nunca el cliente. Genera un
 * passport_code legible a partir del SKU. Valida que el lote elegido, si lo
 * hay, corresponda a la referencia. Opcionalmente genera el snapshot en el
 * mismo paso ("crear y generar").
 */
export async function createTextilePassportDraftAction(input: {
  referenceId: string;
  outputLotId?: string | null;
  circularityAssessmentId?: string | null;
  notes?: string | null;
  generateNow?: boolean;
}): Promise<PassportActionState & { passportId?: string }> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const mutate = await checkTextilesCanMutate();
  if (!mutate.allowed) return { error: mutate.error };

  const referenceId = cleanText(input.referenceId);
  if (!referenceId) return { error: "Debe seleccionar una referencia/SKU." };

  // La referencia debe existir y ser de la organización activa.
  const references = await listTextileReferences(g.organizationId);
  const reference = references.find((r) => r.id === referenceId);
  if (!reference) return { error: "La referencia no existe o no pertenece a tu organización." };

  const outputLotId = cleanText(input.outputLotId ?? null);
  if (outputLotId) {
    // El lote debe existir y corresponder a la MISMA referencia.
    const lotRef = await getReferenceForOutputLot(g.organizationId, outputLotId);
    if (!lotRef) return { error: "El lote producido/final no existe o no pertenece a tu organización." };
    if (lotRef.referenceId !== referenceId) {
      return { error: "El lote producido/final seleccionado no corresponde a la referencia elegida." };
    }
  }

  const circularityAssessmentId = cleanText(input.circularityAssessmentId ?? null);
  if (circularityAssessmentId) {
    // La evaluación debe existir y corresponder a la MISMA referencia (T9C.1).
    const assessmentRef = await getReferenceForAssessment(g.organizationId, circularityAssessmentId);
    if (!assessmentRef) {
      return { error: "La evaluación de circularidad no existe o no pertenece a tu organización." };
    }
    if (assessmentRef.referenceId !== referenceId) {
      return { error: "La evaluación de circularidad seleccionada no corresponde a la referencia elegida." };
    }
  }

  // passport_code legible: PAS-<SKU>-<n+1>. El SKU ya es único por organización.
  const existing = await countTechnicalPassportsForReference(g.organizationId, referenceId);
  const skuPart = (reference.sku || "REF").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const passportCode = `PAS-${skuPart}-${existing + 1}`;

  const { id, error } = await createTechnicalPassportDraft({
    organizationId: g.organizationId,
    referenceId,
    outputLotId,
    circularityAssessmentId,
    notes: cleanText(input.notes ?? null),
    passportCode,
  });
  if (error || !id) return { error: error ?? "No se pudo crear el pasaporte." };

  if (input.generateNow) {
    const gen = await generateTechnicalPassportFullSnapshot(id);
    if (gen.error) {
      // El draft quedó creado; se informa para que el usuario genere luego.
      revalidatePath(PASSPORTS_PATH);
      return { error: `El pasaporte se creó, pero la generación falló: ${gen.error}`, passportId: id };
    }
  }

  revalidatePath(PASSPORTS_PATH);
  return { error: null, success: true, passportId: id };
}
