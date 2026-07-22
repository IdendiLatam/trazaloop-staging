-- ============================================================================
-- Trazaloop · Sprint T9E (Textil) · Fibras personalizadas por organización
-- ============================================================================
--
-- CONTEXTO (defecto 4.4 del encargo T9E): textile_fiber_types nació en 0073
-- como catálogo GLOBAL de solo lectura (19 fibras sembradas, RLS select
-- using(true), sin políticas de escritura). Las organizaciones no tenían
-- ninguna vía para registrar una fibra ausente del catálogo base.
--
-- SOLUCIÓN (aditiva, sin tocar 0070–0092 ni las filas sembradas):
--   · organization_id NULL      → fibra del CATÁLOGO BASE de Trazaloop
--                                 (las 19 existentes quedan así: intactas).
--   · organization_id NOT NULL  → fibra PERSONALIZADA de esa organización.
--
-- REGLAS:
--   1. Lectura: fibras base para todo autenticado; personalizadas solo para
--      miembros de su organización (jamás visibles cross-tenant).
--   2. Escritura: solo fibras personalizadas, solo admin/quality de la
--      organización dueña. Las fibras base NUNCA se modifican ni eliminan
--      por clientes — política + trigger (defensa en profundidad, aplica
--      incluso a service_role, patrón 0077).
--   3. Unicidad: nombre único (case-insensitive) por organización entre sus
--      personalizadas; `code` conserva su UNIQUE global (la app genera
--      códigos con prefijo aleatorio para personalizadas).
--   4. Uso cross-tenant: un material o una fila de composición jamás puede
--      referenciar la fibra personalizada de OTRA organización (trigger
--      SECURITY DEFINER con search_path fijo; la RLS de lectura ya la
--      ocultaba, esto cierra la escritura directa por API).
--
-- ROLLBACK (documentado; ejecutar solo si se abandona la funcionalidad):
--   drop trigger trg_validate_textile_composition_fiber_org on public.textile_reference_fiber_composition;
--   drop trigger trg_validate_textile_material_fiber_org on public.textile_materials;
--   drop function public.validate_textile_fiber_org();
--   drop trigger trg_protect_global_textile_fiber_types on public.textile_fiber_types;
--   drop function public.protect_global_textile_fiber_types();
--   drop policy textile_fiber_types_delete_custom on public.textile_fiber_types;
--   drop policy textile_fiber_types_update_custom on public.textile_fiber_types;
--   drop policy textile_fiber_types_insert_custom on public.textile_fiber_types;
--   drop policy textile_fiber_types_select on public.textile_fiber_types;
--   create policy textile_fiber_types_select on public.textile_fiber_types
--     for select to authenticated using (true);
--   drop index public.textile_fiber_types_org_idx;
--   drop index public.textile_fiber_types_org_name_unique;
--   alter table public.textile_fiber_types
--     drop column updated_by, drop column created_by, drop column organization_id;
--   (Las fibras personalizadas creadas se pierden con el drop column: hacer
--    respaldo previo si existieran datos.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas nuevas (nullable: las 19 filas base quedan con NULL = global)
-- ----------------------------------------------------------------------------
alter table public.textile_fiber_types
  add column organization_id uuid references public.organizations(id) on delete restrict,
  add column created_by uuid references auth.users(id),
  add column updated_by uuid references auth.users(id);

comment on column public.textile_fiber_types.organization_id is
  'NULL = fibra del catálogo base de Trazaloop (global, solo lectura). NOT NULL = fibra personalizada de la organización.';

-- ----------------------------------------------------------------------------
-- 2. Unicidad e índices para fibras personalizadas
-- ----------------------------------------------------------------------------
create unique index textile_fiber_types_org_name_unique
  on public.textile_fiber_types (organization_id, lower(name))
  where organization_id is not null;

create index textile_fiber_types_org_idx
  on public.textile_fiber_types (organization_id)
  where organization_id is not null;

-- ----------------------------------------------------------------------------
-- 3. RLS: lectura base+propias; escritura solo personalizadas (admin/quality)
-- ----------------------------------------------------------------------------
drop policy textile_fiber_types_select on public.textile_fiber_types;

create policy textile_fiber_types_select on public.textile_fiber_types
  for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));

create policy textile_fiber_types_insert_custom on public.textile_fiber_types
  for insert to authenticated
  with check (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin', 'quality'])
  );

create policy textile_fiber_types_update_custom on public.textile_fiber_types
  for update to authenticated
  using (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin', 'quality'])
  )
  with check (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin', 'quality'])
  );

create policy textile_fiber_types_delete_custom on public.textile_fiber_types
  for delete to authenticated
  using (
    organization_id is not null
    and public.has_org_role(organization_id, array['admin', 'quality'])
  );

-- ----------------------------------------------------------------------------
-- 4. Protección ABSOLUTA de las fibras base (defensa en profundidad, patrón
--    0077: SIN security definer a propósito — aplica también a service_role).
--    Además, una fibra personalizada jamás cambia de organización ni se
--    "promueve" a global desde clientes.
-- ----------------------------------------------------------------------------
create or replace function public.protect_global_textile_fiber_types()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.organization_id is null then
      raise exception
        'Las fibras del catálogo base de Trazaloop no pueden eliminarse';
    end if;
    return old;
  end if;

  if old.organization_id is null then
    raise exception
      'Las fibras del catálogo base de Trazaloop no pueden modificarse por organizaciones';
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception
      'La organización de una fibra personalizada no puede cambiar';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_global_textile_fiber_types()
  from public, anon, authenticated;

create trigger trg_protect_global_textile_fiber_types
  before update or delete on public.textile_fiber_types
  for each row execute function public.protect_global_textile_fiber_types();

-- ----------------------------------------------------------------------------
-- 5. Aislamiento de USO: materiales y composición solo referencian fibras
--    base o de su MISMA organización (cierra la escritura directa por API;
--    la app y la RLS de lectura ya lo garantizaban por su lado).
-- ----------------------------------------------------------------------------
create or replace function public.validate_textile_fiber_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fiber_id  uuid;
  v_fiber_org uuid;
begin
  if tg_table_name = 'textile_materials' then
    v_fiber_id := new.primary_fiber_type_id;
  else
    v_fiber_id := new.fiber_type_id;
  end if;

  if v_fiber_id is null then
    return new;
  end if;

  select organization_id into v_fiber_org
  from public.textile_fiber_types
  where id = v_fiber_id;

  if not found then
    raise exception 'El tipo de fibra referenciado no existe';
  end if;

  if v_fiber_org is not null and v_fiber_org <> new.organization_id then
    raise exception
      'El tipo de fibra pertenece a otra organización y no puede usarse';
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_textile_fiber_org()
  from public, anon, authenticated;

create trigger trg_validate_textile_material_fiber_org
  before insert or update on public.textile_materials
  for each row execute function public.validate_textile_fiber_org();

create trigger trg_validate_textile_composition_fiber_org
  before insert or update on public.textile_reference_fiber_composition
  for each row execute function public.validate_textile_fiber_org();
