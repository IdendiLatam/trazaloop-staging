import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import {
  deepLink, notVisibleSection, okSection, unavailableSection,
  type ContextItem, type ContextSection,
} from "@/lib/domain/quality-integration";

/**
 * Trazaloop · QUALITY-13B1 · De qué responde un cargo.
 *
 * El eje secundario de integración (QI-02). Treinta y tres tablas apuntan a
 * `quality_positions` y hasta hoy no había forma de preguntarles a la vez: la
 * responsabilidad estaba repartida y no se podía leer junta.
 *
 * Es deliberadamente **más pequeño** que el contexto de proceso: B2 todavía no
 * lo consume, y construir de más antes de tener quien lo use es la forma más
 * cara de equivocarse. Lo que importa aquí es que el contrato quede establecido
 * —las mismas secciones, los mismos estados, el mismo «sin dato no es cero»—
 * para que ampliarlo sea añadir una función, no rehacer el archivo.
 *
 * NO CREA NINGÚN CAMPO DE PROPIEDAD. Lee los que ya existen, que en este
 * repositorio son siempre de CARGO y nunca de persona (T-02, MDR-33).
 */

type Db = SupabaseClient;
const MUESTRA = 4;

async function db(client?: Db): Promise<Db> {
  return client ?? (await createServerClient());
}

function esFaltaDePermiso(error: { code?: string; message?: string } | null): boolean {
  const c = error?.code ?? "";
  return c === "42501" || c === "PGRST301" || /permission denied/i.test(error?.message ?? "");
}

async function seccion(
  key: string, label: string, href: string, cargar: () => Promise<ContextSection>
): Promise<ContextSection> {
  try {
    return await cargar();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (esFaltaDePermiso(err)) return notVisibleSection(key, label, href);
    return unavailableSection(key, label, href,
      `No se pudo leer esta sección: ${err.message ?? "error desconocido"}`);
  }
}

export type PositionContext = {
  position: { id: string; code: string | null; name: string; isActive: boolean };
  sections: ContextSection[];
};

/**
 * Lo que un cargo tiene encima.
 *
 * Cuatro secciones en B1 —procesos, riesgos, objetivos y estrategias de
 * relacionamiento—, que son las cuatro donde la propiedad por cargo está
 * modelada de forma directa y sin ambigüedad. Competencias, auditorías y
 * acciones se añadirán cuando B2 o B4 las necesiten: el contrato ya las admite.
 */
export async function loadPositionContext(
  orgId: string, positionId: string, client?: Db
): Promise<PositionContext | null> {
  const supabase = await db(client);

  const { data: cargo, error } = await supabase
    .from("quality_positions")
    .select("id, code, name, is_active")
    .eq("organization_id", orgId).eq("id", positionId).maybeSingle();
  if (error || !cargo) return null;

  const sections = await Promise.all([
    seccionProcesos(supabase, orgId, positionId),
    seccionRiesgos(supabase, orgId, positionId),
    seccionObjetivos(supabase, orgId, positionId),
    seccionEstrategias(supabase, orgId, positionId),
  ]);

  return {
    position: {
      id: cargo.id as string,
      code: (cargo.code as string | null) ?? null,
      name: cargo.name as string,
      isActive: Boolean(cargo.is_active),
    },
    sections,
  };
}

function seccionProcesos(supabase: Db, orgId: string, positionId: string) {
  const href = deepLink("quality_process");
  return seccion("processes", "Procesos que dirige", href, async () => {
    const { data, count, error } = await supabase.from("quality_processes")
      .select("id, name, status", { count: "exact" })
      .eq("organization_id", orgId).eq("owner_position_id", positionId).limit(MUESTRA);
    if (error) throw error;
    return okSection({
      key: "processes", label: "Procesos que dirige", count: count ?? 0,
      items: (data ?? []).map((p): ContextItem => ({
        subjectKind: "quality_process", subjectId: p.id as string,
        label: p.name as string, state: p.status as string, severity: null,
        href: deepLink("quality_process", p.id as string),
      })),
      href,
    });
  });
}

function seccionRiesgos(supabase: Db, orgId: string, positionId: string) {
  const href = deepLink("quality_risk");
  return seccion("risks", "Riesgos a su cargo", href, async () => {
    const { data, count, error } = await supabase.from("quality_risks")
      .select("id, title, status", { count: "exact" })
      .eq("organization_id", orgId).eq("owner_position_id", positionId).limit(MUESTRA);
    if (error) throw error;
    return okSection({
      key: "risks", label: "Riesgos a su cargo", count: count ?? 0,
      items: (data ?? []).map((r): ContextItem => ({
        subjectKind: "quality_risk", subjectId: r.id as string,
        label: r.title as string, state: r.status as string, severity: null,
        href: deepLink("quality_risk", r.id as string),
      })),
      href,
    });
  });
}

function seccionObjetivos(supabase: Db, orgId: string, positionId: string) {
  const href = deepLink("quality_objective");
  return seccion("objectives", "Objetivos a su cargo", href, async () => {
    const { data, count, error } = await supabase.from("quality_objectives")
      .select("id, name, admin_state", { count: "exact" })
      .eq("organization_id", orgId).eq("owner_position_id", positionId).limit(MUESTRA);
    if (error) throw error;
    return okSection({
      key: "objectives", label: "Objetivos a su cargo", count: count ?? 0,
      items: (data ?? []).map((o): ContextItem => ({
        subjectKind: "quality_objective", subjectId: o.id as string,
        label: o.name as string, state: o.admin_state as string, severity: null,
        href: deepLink("quality_objective", o.id as string),
      })),
      href,
    });
  });
}

/** Estrategias de relacionamiento vigentes con partes interesadas. Es el
 *  dominio más reciente y ya nace con la propiedad por cargo. */
function seccionEstrategias(supabase: Db, orgId: string, positionId: string) {
  const href = deepLink("quality_stakeholder_strategy");
  return seccion("stakeholder_strategies", "Estrategias de relacionamiento", href, async () => {
    const { data, count, error } = await supabase.from("quality_stakeholder_strategies")
      .select("id, title, status", { count: "exact" })
      .eq("organization_id", orgId).eq("owner_position_id", positionId)
      .is("effective_to", null).limit(MUESTRA);
    if (error) throw error;
    return okSection({
      key: "stakeholder_strategies", label: "Estrategias de relacionamiento",
      count: count ?? 0,
      items: (data ?? []).map((s): ContextItem => ({
        subjectKind: "quality_stakeholder_strategy", subjectId: s.id as string,
        label: s.title as string, state: s.status as string, severity: null,
        href: deepLink("quality_stakeholder_strategy", s.id as string),
      })),
      href,
    });
  });
}
