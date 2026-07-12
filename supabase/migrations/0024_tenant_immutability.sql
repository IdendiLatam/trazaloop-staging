-- 0024_tenant_immutability.sql
-- Trazaloop · Sprint 2.2 · Inmutabilidad transversal del organization_id.
--
-- Principio: una fila operativa NACE en una empresa y NUNCA se mueve a otra.
-- RLS y las FK compuestas ya aíslan, pero un usuario miembro de DOS empresas
-- pasaría el USING (empresa origen) y el WITH CHECK (empresa destino) de las
-- políticas generales de update. Este trigger cierra esa vía por completo.

create or replace function public.prevent_organization_id_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'El organization_id de una fila no puede modificarse';
  end if;
  return new;
end;
$$;

revoke execute on function public.prevent_organization_id_change() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Adjuntar a TODAS las tablas org-scoped mutables existentes.
--
-- DECISIÓN DOCUMENTADA · audit_log SE OMITE: su trigger t_audit_log_immutable
-- (0005) ya lanza excepción ante CUALQUIER update o delete, incluso vía
-- definer, por lo que su organization_id es inmutable por definición.
--
-- NO se adjunta a: organizations (raíz, no tiene organization_id), profiles
-- (no es org-scoped) ni catálogos globales (roles, modules, frameworks,
-- requirements, diagnostic_sections, diagnostic_questions,
-- material_classifications).
-- ---------------------------------------------------------------------------
create trigger t_memberships_org_immutable
  before update on public.memberships
  for each row execute function public.prevent_organization_id_change();

create trigger t_organization_modules_org_immutable
  before update on public.organization_modules
  for each row execute function public.prevent_organization_id_change();

create trigger t_sites_org_immutable
  before update on public.sites
  for each row execute function public.prevent_organization_id_change();

create trigger t_diagnostics_org_immutable
  before update on public.diagnostics
  for each row execute function public.prevent_organization_id_change();

create trigger t_diagnostic_answers_org_immutable
  before update on public.diagnostic_answers
  for each row execute function public.prevent_organization_id_change();

create trigger t_evidences_org_immutable
  before update on public.evidences
  for each row execute function public.prevent_organization_id_change();

create trigger t_evidence_links_org_immutable
  before update on public.evidence_links
  for each row execute function public.prevent_organization_id_change();

create trigger t_product_families_org_immutable
  before update on public.product_families
  for each row execute function public.prevent_organization_id_change();

create trigger t_products_org_immutable
  before update on public.products
  for each row execute function public.prevent_organization_id_change();

create trigger t_suppliers_org_immutable
  before update on public.suppliers
  for each row execute function public.prevent_organization_id_change();

create trigger t_materials_org_immutable
  before update on public.materials
  for each row execute function public.prevent_organization_id_change();

-- import_jobs no tiene política de update (histórico), pero el trigger se
-- adjunta como defensa en profundidad frente a rutas definer futuras.
create trigger t_import_jobs_org_immutable
  before update on public.import_jobs
  for each row execute function public.prevent_organization_id_change();

-- ---------------------------------------------------------------------------
-- REGLA OBLIGATORIA PARA SPRINT 3 EN ADELANTE:
-- toda tabla nueva con organization_id debe nacer con:
--   1. RLS activo (deny-by-default);
--   2. unique(organization_id, id);
--   3. FK COMPUESTAS (organization_id, <fk_id>) hacia toda tabla org-scoped
--      que referencie;
--   4. trigger before update → prevent_organization_id_change();
--   5. trigger before insert → force_created_by() si tiene created_by;
--   6. trigger de auditoría audit_row_change() si es tabla de negocio.
-- ---------------------------------------------------------------------------
