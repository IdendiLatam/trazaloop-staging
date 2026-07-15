import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import type { BlueprintStatus, DocumentType } from "@/lib/domain/trazadocs";

/**
 * Trazaloop · Sprint 9 · Capa de datos de TrazaDocs (lado plataforma):
 * administración de blueprints y sus secciones/hints desde
 * /platform/trazadocs. Nada aquí usa service_role: corre con la sesión
 * real del superadmin, sujeta a las RLS de 0043
 * (trazadoc_blueprints_insert/update exigen is_platform_superadmin()).
 */

export type PlatformBlueprintRow = {
  blueprintId: string;
  code: string;
  name: string;
  description: string | null;
  documentType: DocumentType;
  status: BlueprintStatus;
  sectionsCount: number;
  requiredSectionsCount: number;
  updatedAt: string;
};

/** platform_staff (cualquiera, incluido support) ve TODAS — activas e
 *  inactivas — vía v_trazadoc_blueprint_summary (0045), que hereda la RLS
 *  real de trazadoc_blueprints. */
export async function listAllBlueprintsForPlatform(): Promise<PlatformBlueprintRow[]> {
  const supabase = await createServerClient();
  const { data } = await supabase
    .from("v_trazadoc_blueprint_summary")
    .select("*")
    .order("name", { ascending: true });
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    blueprintId: r.blueprint_id as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    documentType: r.document_type as DocumentType,
    status: r.status as BlueprintStatus,
    sectionsCount: Number(r.sections_count ?? 0),
    requiredSectionsCount: Number(r.required_sections_count ?? 0),
    updatedAt: r.updated_at as string,
  }));
}

export type PlatformBlueprintSectionRow = {
  id: string;
  sectionKey: string;
  title: string;
  description: string | null;
  hint: string | null;
  sortOrder: number;
  isRequired: boolean;
  status: "active" | "inactive";
};

export type PlatformBlueprintDetail = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  documentType: DocumentType;
  status: BlueprintStatus;
  sections: PlatformBlueprintSectionRow[];
};

export async function getPlatformBlueprintDetail(blueprintId: string): Promise<PlatformBlueprintDetail | null> {
  const supabase = await createServerClient();
  const [{ data: bp }, { data: sections }] = await Promise.all([
    supabase.from("trazadoc_blueprints").select("*").eq("id", blueprintId).maybeSingle(),
    supabase
      .from("trazadoc_blueprint_sections")
      .select("id, section_key, title, description, hint, sort_order, is_required, status")
      .eq("blueprint_id", blueprintId)
      .order("sort_order", { ascending: true }),
  ]);
  if (!bp) return null;
  return {
    id: bp.id as string,
    code: bp.code as string,
    name: bp.name as string,
    description: (bp.description as string | null) ?? null,
    documentType: bp.document_type as DocumentType,
    status: bp.status as BlueprintStatus,
    sections: ((sections ?? []) as unknown as Record<string, unknown>[]).map((s) => ({
      id: s.id as string,
      sectionKey: s.section_key as string,
      title: s.title as string,
      description: (s.description as string | null) ?? null,
      hint: (s.hint as string | null) ?? null,
      sortOrder: Number(s.sort_order ?? 0),
      isRequired: Boolean(s.is_required),
      status: s.status as "active" | "inactive",
    })),
  };
}

export async function insertBlueprint(input: {
  code: string;
  name: string;
  description: string | null;
  documentType: DocumentType;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_blueprints")
    .insert({
      code: input.code,
      name: input.name,
      description: input.description,
      document_type: input.documentType,
    })
    .select("id")
    .single();
  if (error || !data) {
    const duplicate = (error as { code?: string } | null)?.code === "23505";
    return { id: null, error: duplicate ? "Ya existe una estructura con ese código." : "No fue posible crear la estructura." };
  }
  return { id: data.id as string, error: null };
}

export async function updateBlueprint(
  id: string,
  input: { name: string; description: string | null; documentType: DocumentType }
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_blueprints")
    .update({ name: input.name, description: input.description, document_type: input.documentType })
    .eq("id", id)
    .select("id");
  if (error) return { error: "No fue posible guardar la estructura." };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar estructuras de TrazaDocs." };
  return { error: null };
}

export async function updateBlueprintStatus(id: string, status: BlueprintStatus): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("trazadoc_blueprints").update({ status }).eq("id", id).select("id");
  if (error) return { error: "No fue posible actualizar el estado de la estructura." };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar estructuras de TrazaDocs." };
  return { error: null };
}

export async function insertBlueprintSection(
  blueprintId: string,
  input: { sectionKey: string; title: string; description: string | null; hint: string | null; sortOrder: number; isRequired: boolean }
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { error } = await supabase.from("trazadoc_blueprint_sections").insert({
    blueprint_id: blueprintId,
    section_key: input.sectionKey,
    title: input.title,
    description: input.description,
    hint: input.hint,
    sort_order: input.sortOrder,
    is_required: input.isRequired,
  });
  if (error) {
    const duplicate = (error as { code?: string }).code === "23505";
    return { error: duplicate ? "Ya existe una sección con esa clave en esta estructura." : "No fue posible crear la sección." };
  }
  return { error: null };
}

export async function updateBlueprintSection(
  id: string,
  input: { title: string; description: string | null; hint: string | null; isRequired: boolean }
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_blueprint_sections")
    .update({ title: input.title, description: input.description, hint: input.hint, is_required: input.isRequired })
    .eq("id", id)
    .select("id");
  if (error) return { error: "No fue posible guardar la sección." };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar secciones de TrazaDocs." };
  return { error: null };
}

export async function updateBlueprintSectionStatus(
  id: string,
  status: "active" | "inactive"
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("trazadoc_blueprint_sections")
    .update({ status })
    .eq("id", id)
    .select("id");
  if (error) return { error: "No fue posible actualizar el estado de la sección." };
  if ((data ?? []).length === 0) return { error: "Tu rol no permite editar secciones de TrazaDocs." };
  return { error: null };
}

export async function reorderBlueprintSections(
  sections: { id: string; sortOrder: number }[]
): Promise<{ error: string | null }> {
  const supabase = await createServerClient();
  for (const s of sections) {
    const { error } = await supabase
      .from("trazadoc_blueprint_sections")
      .update({ sort_order: s.sortOrder })
      .eq("id", s.id);
    if (error) return { error: "No fue posible reordenar las secciones." };
  }
  return { error: null };
}
