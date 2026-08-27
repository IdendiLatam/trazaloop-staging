import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { demoHint, type ResolvedHint } from "@/lib/domain/hint-access";
import { hasHintContent } from "@/lib/domain/hint-links";

/**
 * Trazaloop · QUALITY-12.2A · La ÚNICA puerta de lectura de la guía de autoría.
 *
 * POR QUÉ EXISTE
 *
 * Hasta ahora cada módulo leía `trazadoc_blueprint_sections.hint` por su
 * cuenta y la regla comercial se aplicaba después, al construir la página. Eso
 * dejaba un hueco real: la tabla era legible con la sesión de cualquier
 * miembro, así que alguien en Demo podía pedir la fila por identificador desde
 * el navegador y obtener el texto que la pantalla le negaba.
 *
 * Ahora la regla vive DENTRO de la base (`trazadoc_guidance_as_of`), las
 * tablas de guía no son legibles para los miembros, y este módulo es el único
 * sitio del código que las consulta. Si mañana hace falta la guía en otro
 * módulo —o en Trazaloop Intelligence— pasa por aquí.
 *
 * QUÉ NO ES
 *
 * La guía NO es evidencia. Dice QUÉ debería contener una sección, nunca qué
 * contiene la de esta empresa. Quien la consuma tiene que mantener esa
 * distinción; por eso el tipo lleva `doNotInvent` al lado del texto y no en
 * una constante lejana.
 */

/** Una guía ya resuelta y autorizada para quien la pidió. */
export type AuthoringGuidance = {
  guidanceId: string;
  blueprintSectionId: string | null;
  sectionKey: string;
  /** Hay guía escrita para esta sección. Es cierto también en Demo. */
  hasGuidance: boolean;
  /** El contenido no se entrega: el plan del módulo no lo permite. */
  restricted: boolean;
  revisionNumber: number | null;
  guidance: string | null;
  purpose: string | null;
  example: string | null;
  /** Lo que no se puede afirmar sin un registro que lo respalde. */
  doNotInvent: string | null;
  relatedContextTypes: string[];
  normativeClass: string | null;
};

function fila(r: Record<string, unknown>): AuthoringGuidance {
  return {
    guidanceId: String(r.guidance_id),
    blueprintSectionId: (r.blueprint_section_id as string | null) ?? null,
    sectionKey: String(r.section_key),
    hasGuidance: r.has_guidance !== false,
    restricted: r.restricted === true,
    revisionNumber: r.revision_number === null || r.revision_number === undefined
      ? null : Number(r.revision_number),
    guidance: (r.guidance as string | null) ?? null,
    purpose: (r.purpose as string | null) ?? null,
    example: (r.example as string | null) ?? null,
    doNotInvent: (r.do_not_invent as string | null) ?? null,
    relatedContextTypes: (r.related_context_types as string[] | null) ?? [],
    normativeClass: (r.normative_class as string | null) ?? null,
  };
}

/**
 * La guía VIGENTE de las secciones de una estructura.
 *
 * `moduleCode` es el código COMERCIAL del módulo —`traceability_6632`,
 * `textiles`, `quality`— y sirve para una sola cosa: comprobar el plan. No es
 * lo mismo que el `module_key` de la estructura, que para CPR vale `cpr`. Los
 * dos vocabularios conviven en el repositorio desde hace tiempo y confundirlos
 * devuelve cero guías, que se lee como «esta sección no tiene guía».
 *
 * Lo que acota qué guías se devuelven es la ESTRUCTURA, no el módulo.
 */
export async function getCurrentAuthoringGuidance(params: {
  organizationId: string;
  moduleCode: string;
  blueprintId: string;
}): Promise<AuthoringGuidance[]> {
  return guidanceAsOf({ ...params, asOf: null });
}

/**
 * La guía que estaba VIGENTE en una fecha.
 *
 * Es lo que permite explicar, dentro de dos años, con qué instrucción se
 * redactó una sección: la guía cambia publicando revisiones, y las anteriores
 * siguen ahí con su periodo de vigencia.
 */
export async function getAuthoringGuidanceAsOf(params: {
  organizationId: string;
  moduleCode: string;
  blueprintId: string;
  asOf: Date | string;
}): Promise<AuthoringGuidance[]> {
  const asOf = typeof params.asOf === "string" ? params.asOf : params.asOf.toISOString();
  return guidanceAsOf({ ...params, asOf });
}

async function guidanceAsOf(params: {
  organizationId: string;
  moduleCode: string;
  blueprintId: string;
  asOf: string | null;
}): Promise<AuthoringGuidance[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("trazadoc_guidance_as_of", {
    p_organization_id: params.organizationId,
    p_module_code: params.moduleCode,
    p_blueprint_id: params.blueprintId,
    p_as_of: params.asOf,
  });
  // Fail-closed: si la guía no se puede resolver, no hay guía. Nunca se cae
  // hacia atrás sobre la columna congelada.
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map(fila);
}

/**
 * La guía por PAPEL de sección —«objetivo», «alcance», «responsables»— para
 * los documentos que no nacen de una estructura.
 *
 * Hoy no hay ninguna escrita, y devuelve una lista vacía. Existe para que
 * Quality —cuyos documentos son a medida— pueda recibir guía el día que se
 * escriba, sin duplicar el motor ni convertir sus documentos en estructuras.
 */
/**
 * Lo que pinta el botón «i» en un documento SIN estructura —los de Quality—.
 *
 * Se resuelve por el PAPEL de cada sección, y devuelve el mapa indexado por el
 * identificador de la sección del documento, que es lo que el editor conoce.
 * Las secciones que la empresa añadió a mano no tienen papel conocido y no
 * aparecen en el mapa: no hay guía genérica que pueda ayudar a redactar una
 * sección cuyo tema solo conoce quien la creó, y no tenerla es la respuesta
 * correcta —no un hueco—.
 */
export async function resolveSectionRoleHintMap(params: {
  organizationId: string;
  moduleCode: string;
  guidanceModule: string;
  sections: readonly { id: string; sectionKey: string }[];
}): Promise<Record<string, ResolvedHint>> {
  const claves = [...new Set(params.sections.map((s) => s.sectionKey))];
  const guias = await getSectionRoleGuidance({
    organizationId: params.organizationId,
    moduleCode: params.moduleCode,
    guidanceModule: params.guidanceModule,
    sectionKeys: claves,
  });
  const porClave = new Map(guias.map((g) => [g.sectionKey, g]));

  const mapa: Record<string, ResolvedHint> = {};
  for (const s of params.sections) {
    const g = porClave.get(s.sectionKey);
    if (!g || !g.hasGuidance) continue;
    if (g.restricted) { mapa[s.id] = demoHint(); continue; }
    if (!hasHintContent(g.guidance)) continue;
    mapa[s.id] = { restricted: false, title: null, text: g.guidance! };
  }
  return mapa;
}

export async function getSectionRoleGuidance(params: {
  organizationId: string;
  /** El código COMERCIAL, para comprobar el plan. */
  moduleCode: string;
  /** El `module_key` de la guía, que es otro vocabulario. Ver arriba. */
  guidanceModule: string;
  sectionKeys: string[];
  asOf?: Date | string | null;
}): Promise<AuthoringGuidance[]> {
  if (params.sectionKeys.length === 0) return [];
  const supabase = await createServerClient();
  const asOf = params.asOf
    ? (typeof params.asOf === "string" ? params.asOf : params.asOf.toISOString())
    : null;
  const { data, error } = await supabase.rpc("trazadoc_guidance_for_section_role", {
    p_organization_id: params.organizationId,
    p_module_code: params.moduleCode,
    p_guidance_module: params.guidanceModule,
    p_section_keys: params.sectionKeys,
    p_as_of: asOf,
  });
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...fila(r), blueprintSectionId: null,
  }));
}

/**
 * Lo que la pantalla necesita: `blueprint_section_id → hint autorizado`.
 *
 * Mantiene EXACTAMENTE el comportamiento de antes:
 *   · sin guía escrita        → la sección no aparece en el mapa y no hay botón
 *   · con guía y plan Full/Extra → el texto administrado
 *   · con guía y plan Demo    → el aviso fijo, sin una palabra del texto real
 *
 * La diferencia es de dónde sale la decisión: antes la tomaba la aplicación
 * sobre un texto que ya tenía en la mano; ahora la toma la base y el texto ni
 * siquiera sale de ella.
 */
export async function resolveGuidanceHintMap(params: {
  organizationId: string;
  moduleCode: string;
  blueprintId: string;
}): Promise<Record<string, ResolvedHint>> {
  const guias = await getCurrentAuthoringGuidance(params);
  const mapa: Record<string, ResolvedHint> = {};
  for (const g of guias) {
    if (!g.hasGuidance || g.blueprintSectionId === null) continue;
    if (g.restricted) {
      mapa[g.blueprintSectionId] = demoHint();
      continue;
    }
    if (!hasHintContent(g.guidance)) continue;
    mapa[g.blueprintSectionId] = { restricted: false, title: null, text: g.guidance! };
  }
  return mapa;
}
