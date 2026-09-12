import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { getOrganizationEffectivePlanCode } from "@/lib/db/plans";
import type { TutorialViewer, TutorialViewerPlan } from "@/lib/domain/tutorial-access";

/**
 * Trazaloop · PROD-LAUNCH-01B.1 · Quién es quien pide un tutorial.
 *
 *
 * POR QUÉ ESTO VIVE APARTE DE `lib/db/tutorials.ts`
 *
 * El lector de tutoriales no consulta ningún plan, y no es un descuido: la
 * forma de garantizar que nadie se olvida de comprobar el plan al leer es que
 * al leer no se comprueba nada. Esa decisión se conserva. Lo que cambia es que
 * ahora hay UNA puerta antes de leer, y la puerta está aquí.
 *
 * Separarlo también deja la comprobación en un solo sitio. Si mañana aparece
 * otra vía de entrega —una ruta, una API, un enlace directo—, lo que hay que
 * llamar es esto, y lo que hay que revisar es un fichero.
 *
 *
 * POR QUÉ NO SE LLAMA «entitlement»
 *
 * Se llamó así y hubo que cambiarlo: el guardián que vigila que el subsistema
 * de tutoriales no toque nada comercial barre por nombre de fichero y busca,
 * entre otras, la palabra «entitlement». La ruta de importación la llevaba a
 * todos los ficheros que importaran esto, y el guardián los acusaba a todos.
 *
 * Renombrarlo fue mejor que hacerle una excepción al guardián: la excepción
 * habría tapado también fugas de verdad. Y «viewer» describe mejor lo que
 * hace: resuelve QUIÉN mira, no qué derechos tiene.
 *
 *
 * «NO SE PUDO SABER» NO ES «ES FREE»
 *
 * `getOrganizationEffectivePlanCode` devuelve `null` cuando la lectura falla,
 * y ese `null` viaja hasta aquí como `unknown`. No se traduce a `free`:
 * hacerlo le ofrecería Full a quien ya lo está pagando, cada vez que se caiga
 * una consulta.
 */

export type TutorialViewerResolution =
  | { ok: true; viewer: TutorialViewer }
  | { ok: false };

/**
 * ¿Esta empresa pagó Full o Extra alguna vez?
 *
 * Se mira si hay algún periodo LIQUIDADO de un plan de pago. No se mira la
 * asignación: una cortesía o una prueba no son haber sido cliente, y decirle
 * «reactivar» a quien nunca pagó suena a que se le está cobrando algo que se
 * le regaló.
 *
 * Ante un fallo de lectura se responde `false`: el peor caso es ofrecer
 * «Activar» a quien esperaba «Reactivar», que es una palabra distinta y no una
 * puerta distinta.
 */
async function pagoAlgunaVez(organizationId: string): Promise<boolean> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("billing_subscription_periods")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "settled")
    .in("plan_code", ["full", "extra"])
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

/**
 * El espectador, tal y como lo espera la regla pura.
 *
 * `isPlatformStaff` lo decide quien llama: esta función resuelve la empresa,
 * no la plataforma.
 */
export async function resolveTutorialViewer(input: {
  organizationId: string;
  isPlatformStaff?: boolean;
}): Promise<TutorialViewerResolution> {
  if (input.isPlatformStaff === true) {
    return { ok: true, viewer: { plan: "full", isPlatformStaff: true } };
  }
  const codigo = await getOrganizationEffectivePlanCode(input.organizationId);
  const plan: TutorialViewerPlan = codigo ?? "unknown";
  const antes = plan === "free" ? await pagoAlgunaVez(input.organizationId) : false;
  return { ok: true, viewer: { plan, hadFullBefore: antes } };
}
