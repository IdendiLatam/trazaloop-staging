"use server";

import { requireActiveOrg } from "@/lib/auth/require-active-org";
import {
  getAiCreditStatus,
  getOrganizationTimeStatus,
  sendUsageHeartbeat,
  type AiCreditStatus,
  type OrganizationTimeStatus,
} from "@/lib/db/organization-usage";

/**
 * Trazaloop · PE-04B4 · El latido y el estado de uso.
 *
 * LO QUE EL NAVEGADOR NO PUEDE HACER
 *
 * No manda minutos. No manda duraciones. No manda «suma cinco». Manda «esta
 * pestaña sigue abierta con una pantalla funcional», y el servidor pone los
 * minutos con su propio reloj. Creerle la aritmética a quien la paga sería
 * regalarle el medidor.
 *
 * Y no manda actividad: no hay ratón, ni teclado, ni scroll, ni foco. Free
 * incluye TIEMPO DE USO, no «tiempo con el ratón moviéndose». Quien deja la
 * pantalla abierta mientras atiende una llamada está consumiendo su plan, y eso
 * es exactamente lo que el negocio quiso decir.
 */
export type UsageHeartbeatResult = {
  state: OrganizationTimeStatus["state"] | null;
  metered: boolean;
  dailyRemaining: number | null;
  monthlyRemaining: number | null;
};

export async function usageHeartbeatAction(
  sessionKey: string,
  surface: string
): Promise<UsageHeartbeatResult> {
  const org = await requireActiveOrg();
  const estado = await sendUsageHeartbeat(org.organizationId, sessionKey, surface);
  if (!estado) {
    // Un latido que falla NO inventa un estado: la pantalla se queda como está
    // y el servidor sigue siendo la autoridad cuando se intente escribir algo.
    return { state: null, metered: false, dailyRemaining: null, monthlyRemaining: null };
  }
  return {
    state: estado.state,
    metered: estado.metered,
    dailyRemaining: estado.dailyRemaining,
    monthlyRemaining: estado.monthlyRemaining,
  };
}

export type OrganizationUsageSummary = {
  time: OrganizationTimeStatus | null;
  ai: AiCreditStatus | null;
};

/** El resumen que ven tanto el cliente como la consola de plataforma. UNA sola
 *  fuente: si cada pantalla hiciera su propia aritmética, acabarían diciendo
 *  cosas distintas del mismo mes. */
export async function getOrganizationUsageSummaryAction(): Promise<OrganizationUsageSummary> {
  const org = await requireActiveOrg();
  const [time, ai] = await Promise.all([
    getOrganizationTimeStatus(org.organizationId),
    getAiCreditStatus(org.organizationId),
  ]);
  return { time, ai };
}
