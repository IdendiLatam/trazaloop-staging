-- ============================================================================
-- 0106_pcr031_evidence_governance.sql · Sprint PCR-03.1
-- ============================================================================
-- Gobernanza de evidencias: la evidencia deja de ser "archivo asociado" y
-- pasa a ser evidencia GOBERNADA, revisable y localizable, incluyendo
-- soportes digitales, físicos e híbridos, más un modelo mínimo de acuerdos/
-- requisitos de cliente. TODO es ADITIVO sobre la infraestructura existente
-- (0019 evidences + evidence_links): sin segunda infraestructura, sin tocar
-- registros previos, sin cambiar la metodología de cálculo PCR.
--
-- Estados: se PRESERVA el enum evidence_status existente
-- ('pending','valid','rejected','expired') — 'valid' es la "Aceptación
-- interna" y NO se renombra. "Archivada" se modela con archived_at
-- (ortogonal al estado de revisión, sin cirugía de enums en transacción).
--
-- Sin transaction control propio (regla PCR-02.5.2): la transacción la
-- administra el runner (Supabase CLI / psql --single-transaction). Sin
-- CREATE INDEX CONCURRENTLY, VACUUM, ALTER SYSTEM ni CREATE/DROP DATABASE.
-- El único ALTER TYPE ... ADD VALUE no se usa dentro de esta migración
-- (restricción de PostgreSQL para valores nuevos en la misma transacción).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 · Revisión interna de evidencias (5.1)
-- ----------------------------------------------------------------------------
alter table public.evidences
  add column if not exists reviewed_at    timestamptz,
  add column if not exists reviewed_by    uuid references public.profiles (id),
  add column if not exists review_comment text,
  add column if not exists archived_at    timestamptz,
  add column if not exists archived_by    uuid references public.profiles (id);

comment on column public.evidences.reviewed_at is
  'PCR-03.1 · Momento de la última revisión interna (aceptación/rechazo). Sello server-side del trigger de revisión.';
comment on column public.evidences.review_comment is
  'PCR-03.1 · Comentario de revisión: opcional al aceptar, OBLIGATORIO al rechazar.';
comment on column public.evidences.archived_at is
  'PCR-03.1 · Evidencia archivada: deja de contar como soporte VIGENTE por defecto sin perder el histórico. Ortogonal al estado de revisión.';

-- ----------------------------------------------------------------------------
-- §2 · Soporte digital / físico / híbrido (5.2)
-- ----------------------------------------------------------------------------
alter table public.evidences
  add column if not exists medium             text not null default 'digital',
  add column if not exists physical_reference text,
  add column if not exists physical_location  text,
  add column if not exists physical_custodian text,
  add column if not exists physical_notes     text;

alter table public.evidences
  drop constraint if exists evidences_medium_check;
alter table public.evidences
  add constraint evidences_medium_check
  check (medium in ('digital', 'physical', 'hybrid'));

-- Una evidencia FÍSICA jamás finge tener archivo: sin storage_path. Las
-- digitales/híbridas conservan las reglas actuales de subida (0087+): el
-- archivo llega por intents verificados, nunca por este esquema.
alter table public.evidences
  drop constraint if exists evidences_physical_without_file;
alter table public.evidences
  add constraint evidences_physical_without_file
  check (medium <> 'physical' or storage_path is null);

comment on column public.evidences.medium is
  'PCR-03.1 · Cómo conserva la empresa la evidencia: digital, physical o hybrid. physical exige storage_path NULL (no finge archivo).';
comment on column public.evidences.physical_reference is
  'PCR-03.1 · Referencia documental / código interno del soporte físico (carpeta, folio, archivador…).';

create index if not exists evidences_org_medium_idx
  on public.evidences (organization_id, medium);
create index if not exists evidences_org_archived_idx
  on public.evidences (organization_id, archived_at);

-- ----------------------------------------------------------------------------
-- §3 · Guarda de revisión (roles + sellos server-side + motivo de rechazo)
-- ----------------------------------------------------------------------------
-- Complementa (no sustituye) a guard_evidence_validation de 0019: aquel ya
-- exige admin/quality para status → 'valid'. Esta guarda añade, con el mismo
-- patrón SECURITY DEFINER + search_path fijo + revokes:
--   · status → 'rejected' también exige admin/quality (antes sin guarda BD)
--     y un MOTIVO no vacío;
--   · sellos server-side reviewed_at/reviewed_by en ambas transiciones
--     (auth.uid(): el cliente no puede falsificarlos);
--   · archivar/desarchivar (archived_at) exige admin/quality y sella
--     archived_by.
create or replace function public.guard_evidence_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewing boolean :=
    new.status is distinct from old.status and new.status in ('valid', 'rejected');
  v_archiving boolean :=
    (new.archived_at is null) is distinct from (old.archived_at is null);
begin
  -- Reapertura (03.1–03.3.1, hallazgo 3): salir de 'rejected' (p. ej.
  -- rejected → pending para re-revisar) es un acto de revisión: solo
  -- admin/quality, y queda en la auditoría de fila como cualquier UPDATE.
  -- (Salir de 'valid' ya lo guarda 0019: se preserva esa semántica.)
  if old.status = 'rejected' and new.status is distinct from old.status
     and not v_reviewing then
    if not public.has_org_role(new.organization_id, array['admin', 'quality']) then
      raise exception 'Solo administrador o calidad pueden reabrir una evidencia rechazada.'
        using errcode = '42501';
    end if;
    -- La reapertura limpia el veredicto anterior de forma explícita.
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.review_comment := null;
  elsif v_reviewing then
    if not public.has_org_role(new.organization_id, array['admin', 'quality']) then
      raise exception 'Solo administrador o calidad pueden revisar una evidencia (aceptarla internamente o rechazarla).'
        using errcode = '42501';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.review_comment), '') = '' then
      raise exception 'El motivo de rechazo es obligatorio.'
        using errcode = '23514';
    end if;
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  else
    -- SIN transición de revisión: los sellos son verdad-servidor y NADIE
    -- (ni admin) puede reescribirlos ni editar el motivo por UPDATE directo
    -- (03.1–03.3.1, hallazgo 3: defensa en profundidad, fail-closed).
    new.reviewed_at    := old.reviewed_at;
    new.reviewed_by    := old.reviewed_by;
    new.review_comment := old.review_comment;
  end if;

  if v_archiving then
    if not public.has_org_role(new.organization_id, array['admin', 'quality']) then
      raise exception 'Solo administrador o calidad pueden archivar o desarchivar una evidencia.'
        using errcode = '42501';
    end if;
    new.archived_at := case when new.archived_at is null then null else now() end;
    new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  else
    -- Sin (des)archivar: sellos de archivado intocables.
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;

comment on function public.guard_evidence_review() is
  'PCR-03.1 (rev. 03.1–03.3.1) · Revisión interna gobernada: aceptar/rechazar solo admin/quality con motivo obligatorio al rechazar; reabrir un rechazo solo admin/quality (limpia el veredicto); TODOS los sellos (reviewed_at/by, review_comment, archived_at/by) son verdad-servidor: sin transición se preservan del OLD, con transición los fija now()/auth.uid(). SECURITY DEFINER con search_path fijo.';

revoke execute on function public.guard_evidence_review() from public, anon, authenticated;

drop trigger if exists t_evidences_review_guard on public.evidences;
create trigger t_evidences_review_guard
  before update on public.evidences
  for each row execute function public.guard_evidence_review();

-- ----------------------------------------------------------------------------
-- §4 · Acuerdos / requisitos de cliente (5.4) — modelo mínimo, sin CRM
-- ----------------------------------------------------------------------------
create table if not exists public.customer_requirements (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  customer_name   text not null,
  code            text not null,
  title           text not null,
  description     text,
  starts_on       date,
  ends_on         date,
  active          boolean not null default true,
  notes           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint customer_requirements_org_id_uniq unique (organization_id, id),
  constraint customer_requirements_org_code_uniq unique (organization_id, code)
);

comment on table public.customer_requirements is
  'PCR-03.1 · Acuerdos/requisitos de cliente (modelo mínimo): qué exige/acordó el cliente, vigencia y estado. Se vincula a producto, lote producido/final, orden/corrida y evidencias.';

create index if not exists customer_requirements_org_active_idx
  on public.customer_requirements (organization_id, active);

create trigger t_customer_requirements_updated
  before update on public.customer_requirements
  for each row execute function public.set_updated_at();

create trigger t_customer_requirements_force_created_by
  before insert on public.customer_requirements
  for each row execute function public.force_created_by();

create trigger t_audit_customer_requirements
  after insert or update or delete on public.customer_requirements
  for each row execute function public.audit_row_change();

alter table public.customer_requirements enable row level security;

create policy customer_requirements_select on public.customer_requirements
  for select to authenticated using (public.is_org_member(organization_id));
create policy customer_requirements_insert on public.customer_requirements
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy customer_requirements_update on public.customer_requirements
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy customer_requirements_delete on public.customer_requirements
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin', 'quality']));

-- Vínculos del requisito con las entidades PCR (producto / lote producido /
-- orden). Mismo patrón que evidence_links: org-scoped, FK compuesta al
-- requisito, unicidad y validación del destino EN LA MISMA organización.
create table if not exists public.customer_requirement_links (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  requirement_id  uuid not null,
  target_type     text not null,
  target_id       uuid not null,
  created_at      timestamptz not null default now(),
  constraint customer_requirement_links_target_check
    check (target_type in ('product', 'output_batch', 'production_order')),
  constraint customer_requirement_links_uniq
    unique (requirement_id, target_type, target_id),
  constraint customer_requirement_links_org_id_uniq unique (organization_id, id),
  constraint customer_requirement_links_requirement_fk
    foreign key (organization_id, requirement_id)
    references public.customer_requirements (organization_id, id)
    on delete cascade
);

create index if not exists customer_requirement_links_target_idx
  on public.customer_requirement_links (organization_id, target_type, target_id);

create or replace function public.validate_customer_requirement_link_target()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_found boolean;
begin
  if new.target_type = 'product' then
    select exists (select 1 from public.products p
                    where p.organization_id = new.organization_id and p.id = new.target_id)
      into v_found;
  elsif new.target_type = 'output_batch' then
    select exists (select 1 from public.output_batches ob
                    where ob.organization_id = new.organization_id and ob.id = new.target_id)
      into v_found;
  else
    select exists (select 1 from public.production_orders po
                    where po.organization_id = new.organization_id and po.id = new.target_id)
      into v_found;
  end if;
  if not v_found then
    raise exception 'El destino del vínculo no existe o no pertenece a tu empresa.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.validate_customer_requirement_link_target() is
  'PCR-03.1 · El vínculo de un requisito de cliente solo puede apuntar a producto/lote producido/orden de SU organización (anti cross-tenant también en BD). SECURITY INVOKER.';

revoke execute on function public.validate_customer_requirement_link_target() from public, anon, authenticated;

drop trigger if exists t_customer_requirement_links_target on public.customer_requirement_links;
create trigger t_customer_requirement_links_target
  before insert or update on public.customer_requirement_links
  for each row execute function public.validate_customer_requirement_link_target();

alter table public.customer_requirement_links enable row level security;

create policy customer_requirement_links_select on public.customer_requirement_links
  for select to authenticated using (public.is_org_member(organization_id));
create policy customer_requirement_links_insert on public.customer_requirement_links
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy customer_requirement_links_delete on public.customer_requirement_links
  for delete to authenticated using (public.is_org_member(organization_id));

-- ----------------------------------------------------------------------------
-- §5 · Evidencia ↔ requisito de cliente (5.5, bidireccional con evidence_links)
-- ----------------------------------------------------------------------------
-- Se AMPLÍA el enum de destinos existente (aditivo; el valor nuevo no se usa
-- dentro de esta transacción). Con esto evidence_links resuelve también el
-- soporte documental de acuerdos/requisitos, sin tablas paralelas.
alter type evidence_target_type add value if not exists 'customer_requirement';

-- (03.1–03.3.1, hallazgo 1) El enum por sí solo NO basta: el trigger
-- vigente validate_evidence_link_org (0025) rechaza cualquier target_type
-- fuera de su CASE. Se REDEFINE ADITIVAMENTE: todos los destinos históricos
-- se preservan tal cual y se añade customer_requirement con la misma
-- semántica (destino existente y de la MISMA organización). Mismo patrón:
-- SECURITY DEFINER + search_path fijo + EXECUTE revocado; el trigger
-- existente t_evidence_links_org (0025) sigue apuntando a esta función.
-- Nota de transacción: el CASE compara new.target_type::text, de modo que
-- esta redefinición no "usa" el valor nuevo del enum dentro de la propia
-- transacción (restricción de PostgreSQL respetada).
create or replace function public.validate_evidence_link_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_org uuid;
begin
  case new.target_type::text
    when 'site'             then select organization_id into v_target_org from sites             where id = new.target_id;
    when 'supplier'         then select organization_id into v_target_org from suppliers         where id = new.target_id;
    when 'material'         then select organization_id into v_target_org from materials         where id = new.target_id;
    when 'product'          then select organization_id into v_target_org from products          where id = new.target_id;
    when 'product_family'   then select organization_id into v_target_org from product_families  where id = new.target_id;
    when 'input_batch'      then select organization_id into v_target_org from input_batches     where id = new.target_id;
    when 'production_order' then select organization_id into v_target_org from production_orders where id = new.target_id;
    when 'output_batch'     then select organization_id into v_target_org from output_batches    where id = new.target_id;
    when 'customer_requirement'
                            then select organization_id into v_target_org from customer_requirements where id = new.target_id;
    else
      raise exception 'El tipo de destino % aún no está disponible para enlaces de evidencia', new.target_type;
  end case;

  if v_target_org is null then
    raise exception 'El destino % del enlace de evidencia no existe', new.target_id;
  end if;

  if v_target_org <> new.organization_id then
    raise exception 'Enlace de evidencia entre empresas bloqueado (evidencia % vs destino %)',
      new.organization_id, v_target_org;
  end if;

  return new;
end;
$$;

revoke execute on function public.validate_evidence_link_org() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- §5b · organization_id INMUTABLE (03.1–03.3.1, hallazgo 4; patrón 0024)
-- ----------------------------------------------------------------------------
-- Ninguna fila cambia de empresa, ni siquiera si el usuario pertenece a
-- ambas: se reutiliza prevent_organization_id_change() tal como hacen todas
-- las tablas org-scoped desde 0024.
drop trigger if exists t_customer_requirements_org_immutable on public.customer_requirements;
create trigger t_customer_requirements_org_immutable
  before update on public.customer_requirements
  for each row execute function public.prevent_organization_id_change();

drop trigger if exists t_customer_requirement_links_org_immutable on public.customer_requirement_links;
create trigger t_customer_requirement_links_org_immutable
  before update on public.customer_requirement_links
  for each row execute function public.prevent_organization_id_change();

-- ----------------------------------------------------------------------------
-- §6 · Verificaciones manuales (resumen)
-- ----------------------------------------------------------------------------
--   update evidences set status='rejected' sin comentario → 'El motivo de
--   rechazo es obligatorio.'; con rol consultant → 'Solo administrador o
--   calidad…'; con admin y motivo → reviewed_at/reviewed_by sellados por el
--   servidor (auth.uid()).
--   insert evidences (medium='physical', storage_path='x') → check
--   evidences_physical_without_file.
--   insert customer_requirement_links apuntando a un producto de OTRA
--   organización → 'El destino del vínculo no existe o no pertenece a tu
--   empresa.'
--   select de customer_requirements bajo authenticated de otra empresa → 0
--   filas (RLS).

-- ----------------------------------------------------------------------------
-- §8 · VIGENCIA 03.1 EN EL MOTOR PCR (rev. 03.1–03.3.3, hallazgo 1)
-- ----------------------------------------------------------------------------
-- PCR-03.1 define: evidencia VIGENTE = aceptada internamente ('valid') y NO
-- archivada (archived_at is null). El motor 0028 solo miraba el estado, así
-- que una evidencia archivada seguía habilitando masa reciclada en cálculos
-- NUEVOS. Como PCR-03 aún no está integrado, la función se REDEFINE aquí
-- (0028 permanece BYTE-INTACTA) copiando la versión vigente y aplicando
-- ÚNICAMENTE la adaptación de vigencia:
--   · el SELECT transporta ev_o.archived_at / ev_r.archived_at;
--   · soporte de origen vigente  = status 'valid' AND archived_at IS NULL;
--   · soporte de reclasificación vigente = ídem.
-- NADA MÁS cambia: denominador, numerador, balance de masa, elegibilidad,
-- clasificaciones, reclasificación, tolerancias, warnings, metodología
-- activa, snapshot, permisos, firma, search_path y grants/revokes quedan
-- EXACTOS a 0028. La exclusión por soporte archivado produce las mismas
-- advertencias que un soporte no válido (components_excluded_for_missing_
-- support / related_evidence_not_valid / *_support_not_valid). Los cálculos
-- HISTÓRICOS ya persistidos no cambian: solo afecta ejecuciones nuevas.
create or replace function public.calculate_recycled_content(
  p_output_batch_id uuid,
  p_methodology_id uuid default null
)
returns public.recycled_content_calculations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_batch record;
  v_meth public.calculation_methodologies%rowtype;
  v_rules jsonb;
  v_eligible text[];
  v_tolerance numeric;
  v_requires_origin boolean;
  v_same_process_counts boolean;
  v_declared numeric;
  v_total numeric := 0;
  v_recycled numeric := 0;
  v_percent numeric;
  v_components jsonb := '[]'::jsonb;
  v_warn_codes text[] := '{}';
  comp record;
  v_effective text;
  v_never boolean;
  v_counted boolean;
  v_reason text;
  v_comp_warnings text[];
  v_consumed numeric;
  v_consumption_rows integer;
  v_missing_supplier boolean;
  v_has_missing_support boolean := false;
  v_has_postind_unreclass boolean := false;
  v_has_not_valid_evidence boolean := false;
  v_eligible_mass numeric := 0;
  v_eligible_excluded_mass numeric := 0;
  v_risk boolean := false;
  v_level text;
  v_row public.recycled_content_calculations;
begin
  -- 1. Sesión obligatoria.
  if v_uid is null then
    raise exception 'Se requiere una sesión activa para calcular contenido reciclado';
  end if;

  -- 2. El lote de salida debe existir (org sale del lote, nunca del cliente).
  select ob.id, ob.organization_id, ob.production_order_id, ob.product_id,
         ob.produced_quantity_kg, p.declared_recycled_percent
    into v_batch
  from public.output_batches ob
  left join public.products p on p.id = ob.product_id
  where ob.id = p_output_batch_id;

  if not found then
    raise exception 'El lote de salida no existe';
  end if;

  -- 3 y 4. Membresía activa y rol autorizado.
  if not public.is_org_member(v_batch.organization_id) then
    raise exception 'No eres miembro activo de la empresa de este lote';
  end if;
  if not public.has_org_role(v_batch.organization_id, array['admin','quality','consultant']) then
    raise exception 'Tu rol no permite calcular contenido reciclado';
  end if;

  -- 5 y 6. Metodología: la indicada (activa) o la activa RC-6632-15343.
  if p_methodology_id is not null then
    select * into v_meth from public.calculation_methodologies
    where id = p_methodology_id and is_active;
    if not found then
      raise exception 'La metodología indicada no existe o no está activa';
    end if;
  else
    select * into v_meth from public.calculation_methodologies
    where code = 'RC-6632-15343' and is_active;
    if not found then
      raise exception 'No hay una metodología activa RC-6632-15343';
    end if;
  end if;

  v_rules := v_meth.rules;
  select coalesce(array_agg(x), '{}') into v_eligible
    from jsonb_array_elements_text(v_rules->'eligible_classifications') x;
  v_tolerance := coalesce((v_rules->>'mass_balance_tolerance_percent')::numeric, 5);
  v_requires_origin := coalesce((v_rules->>'recycled_requires_origin_support')::boolean, true);
  v_same_process_counts := coalesce((v_rules->>'same_process_counts')::boolean, false);
  v_declared := v_batch.declared_recycled_percent;

  -- Componentes: composición + material + clasificación + evidencias.
  for comp in
    select bc.material_id, bc.mass_kg, bc.is_same_process, bc.counts_override,
           m.name as material_name,
           m.classification_code, m.reclassified_to_code,
           m.reclassification_justification, m.reclassification_evidence_id,
           m.origin_support_evidence_id, m.reclassified_by,
           mc.never_counts,
           ev_o.status::text as origin_status,
           ev_r.status::text as reclass_status,
           -- (rev. 03.1–03.3.3, hallazgo 1) Vigencia 03.1: el archivado es
           -- una dimensión ortogonal al estado; se transporta para decidir.
           ev_o.archived_at as origin_archived_at,
           ev_r.archived_at as reclass_archived_at
    from public.batch_composition bc
    join public.materials m on m.id = bc.material_id
    join public.material_classifications mc
      on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
    left join public.evidences ev_o on ev_o.id = m.origin_support_evidence_id
    left join public.evidences ev_r on ev_r.id = m.reclassification_evidence_id
    where bc.output_batch_id = p_output_batch_id
    order by m.name
  loop
    v_total := v_total + comp.mass_kg;
    v_effective := coalesce(comp.reclassified_to_code, comp.classification_code);
    v_never := coalesce(comp.never_counts, false);
    v_counted := false;
    v_reason := null;
    v_comp_warnings := '{}';

    -- Regla 1: mismo proceso / never_counts.
    if (comp.is_same_process or v_never) and not v_same_process_counts then
      v_reason := 'same_process_or_never_counts';

    -- Regla 2: postindustrial sin reclasificación.
    elsif comp.classification_code = 'postindustrial'
          and comp.reclassified_to_code is null then
      v_reason := 'postindustrial_not_reclassified';
      v_has_postind_unreclass := true;

    -- Regla 7: other no soportado en la metodología v1 (counts_override
    -- queda GUARDADO en el snapshot pero NO incluye masa todavía).
    elsif v_effective = 'other' then
      v_reason := 'other_not_supported_in_methodology_v1';

    -- Regla 6: virgen, aditivos, pigmentos, cargas, masterbatch.
    elsif v_effective in ('virgin','additive','pigment','mineral_filler','masterbatch') then
      v_reason := 'non_recycled_material';

    -- Regla 3: elegibilidad según metodología.
    elsif not (v_effective = any(v_eligible)) then
      v_reason := 'not_eligible_classification';

    else
      -- Clasificación efectiva elegible.
      v_eligible_mass := v_eligible_mass + comp.mass_kg;

      if comp.reclassified_to_code is not null then
        -- Regla 5: reclasificación con soporte completo y validado.
        if comp.reclassified_to_code = 'preconsumer_valid'
           and comp.reclassification_justification is not null
           and comp.reclassification_evidence_id is not null
           and comp.reclass_status = 'valid'
           and comp.reclass_archived_at is null
           and comp.reclassified_by is not null then
          v_counted := true;
        else
          v_reason := 'invalid_reclassification_support';
          v_has_missing_support := true;
          if comp.reclass_status is not null
             and (comp.reclass_status <> 'valid' or comp.reclass_archived_at is not null) then
            v_has_not_valid_evidence := true;
            v_comp_warnings := array_append(v_comp_warnings, 'reclassification_support_not_valid');
          end if;
        end if;
      elsif v_requires_origin then
        -- Regla 4: soporte de origen obligatorio y validado (criterio estricto).
        if comp.origin_support_evidence_id is null then
          v_reason := 'missing_origin_support';
          v_has_missing_support := true;
        elsif comp.origin_status <> 'valid' or comp.origin_archived_at is not null then
          v_reason := 'origin_support_not_valid';
          v_has_missing_support := true;
          v_has_not_valid_evidence := true;
          v_comp_warnings := array_append(v_comp_warnings, 'origin_support_not_valid');
        else
          v_counted := true;
        end if;
      else
        v_counted := true;
      end if;

      if not v_counted then
        v_eligible_excluded_mass := v_eligible_excluded_mass + comp.mass_kg;
      end if;
    end if;

    if v_counted then
      v_recycled := v_recycled + comp.mass_kg;
    end if;

    v_components := v_components || jsonb_build_object(
      'material_id', comp.material_id,
      'material_name', comp.material_name,
      'mass_kg', comp.mass_kg,
      'classification_code', comp.classification_code,
      'effective_classification', v_effective,
      'is_same_process', comp.is_same_process,
      'counts_override', comp.counts_override,
      'origin_support_evidence_id', comp.origin_support_evidence_id,
      'origin_support_status', comp.origin_status,
      'reclassification_evidence_id', comp.reclassification_evidence_id,
      'reclassification_support_status', comp.reclass_status,
      'counted', v_counted,
      'exclusion_reason', v_reason,
      'warning_codes', to_jsonb(v_comp_warnings)
    );
  end loop;

  -- Sin composición no hay cálculo (denominador vacío).
  if v_total <= 0 then
    raise exception 'El lote no tiene composición registrada. Registra la composición antes de calcular';
  end if;

  -- Fórmula: masa reciclada válida / masa TOTAL de composición * 100.
  -- produced_quantity_kg NO es denominador; solo alimenta la advertencia.
  v_percent := round(v_recycled / v_total * 100, 4);

  -- Trazabilidad hacia atrás: consumos de la orden y proveedores.
  select coalesce(sum(bc.mass_kg), 0), count(*),
         coalesce(bool_or(ib.supplier_id is null), false)
    into v_consumed, v_consumption_rows, v_missing_supplier
  from public.batch_consumption bc
  join public.input_batches ib on ib.id = bc.input_batch_id
  where bc.production_order_id = v_batch.production_order_id;

  -- Advertencias.
  if v_consumption_rows > 0
     and abs(v_consumed - v_total) > (v_tolerance / 100) * v_consumed then
    v_warn_codes := array_append(v_warn_codes, 'mass_balance_out_of_tolerance');
  end if;
  if v_batch.produced_quantity_kg is not null
     and abs(v_batch.produced_quantity_kg - v_total)
         > (v_tolerance / 100) * v_batch.produced_quantity_kg then
    v_warn_codes := array_append(v_warn_codes, 'produced_vs_composition_out_of_tolerance');
  end if;
  if v_declared is not null and v_percent < v_declared then
    v_warn_codes := array_append(v_warn_codes, 'declared_above_calculated');
    v_risk := true;
  end if;
  if v_has_missing_support then
    v_warn_codes := array_append(v_warn_codes, 'components_excluded_for_missing_support');
  end if;
  if v_has_postind_unreclass then
    v_warn_codes := array_append(v_warn_codes, 'postindustrial_not_reclassified_present');
  end if;
  if v_has_not_valid_evidence then
    v_warn_codes := array_append(v_warn_codes, 'related_evidence_not_valid');
  end if;

  -- Defendibilidad.
  if v_consumption_rows = 0
     or v_missing_supplier
     or v_recycled = 0
     or (v_eligible_mass > 0 and v_eligible_excluded_mass >= v_eligible_mass) then
    v_level := 'preliminary';
  elsif array_length(v_warn_codes, 1) is not null then
    v_level := 'with_warnings';
  else
    v_level := 'defensible';
  end if;

  -- Snapshot inmutable: reglas CONGELADAS, componentes explicados, actor real.
  insert into public.recycled_content_calculations (
    organization_id, output_batch_id, methodology_id, methodology_rules_snapshot,
    total_mass_kg, recycled_mass_kg, recycled_percent, declared_percent,
    risk_flag, defensibility_level, warnings, components, calculated_by
  ) values (
    v_batch.organization_id, p_output_batch_id, v_meth.id, v_rules,
    v_total, v_recycled, v_percent, v_declared,
    v_risk, v_level, to_jsonb(v_warn_codes), v_components, v_uid
  )
  returning * into v_row;

  -- Evento semántico interno (log_event nunca se expone al cliente).
  perform public.log_event(
    v_batch.organization_id,
    'recycled_content_calculated',
    jsonb_build_object(
      'output_batch_id', p_output_batch_id,
      'calculation_id', v_row.id,
      'recycled_percent', v_percent,
      'defensibility_level', v_level,
      'methodology_id', v_meth.id
    ),
    v_uid
  );

  return v_row;
end;
$$;

revoke execute on function public.calculate_recycled_content(uuid, uuid) from public, anon;
grant execute on function public.calculate_recycled_content(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- §9 · VIGENCIA CANÓNICA EN LAS SUPERFICIES HISTÓRICAS (rev. 03.1–03.3.4)
-- ----------------------------------------------------------------------------
-- La regla PCR-03.1 — evidencia VIGENTE = status 'valid' AND archived_at IS
-- NULL — se vuelve CANÓNICA en todo Trazaloop PCR. La semántica de status no
-- cambia (una archivada sigue 'valid'), pero deja de comportarse como
-- soporte vigente. 0031/0032/0034/0104 permanecen intactas: como PCR-03 aún
-- no está integrado, las vistas se redefinen AQUÍ copiando su versión
-- vigente y cambiando ÚNICAMENTE la vigencia documental:
--   · v_output_batch_readiness (0032): all_required_support_valid,
--     any_support_missing, origin_all_valid, reclass_all_valid y
--     any_support_pending tratan la archivada como NO vigente; columnas,
--     orden, tipos, reglas y niveles de readiness idénticos.
--     v_guided_flow_dashboard sigue operando sobre esta readiness.
--   · v_output_batch_evidence_matrix (0031): is_valid_for_defensibility =
--     'valid' AND no archivada; archived_at / reviewed_at / reviewed_by se
--     AÑADEN AL FINAL (rutas y support_role intactos).
--   · v_implementation_dashboard (0034): soporte de origen vigente,
--     valid_evidences_count y pending_evidences_count excluyen archivadas.
--   · v_implementation_next_actions (versión VIGENTE de 0104, que preserva
--     el lenguaje de 0065 y la CTE de consumo interno):
--     sample_material_without_origin trata la archivada como soporte no
--     vigente y sample_pending_evidence no selecciona archivadas.
-- Nada más cambia: prioridades, enlaces, textos e históricos intactos.
create or replace view public.v_output_batch_readiness
with (security_invoker = true) as
with evidence_flags as (
  -- Materiales "relevantes": componentes NO de mismo proceso cuya
  -- clasificación efectiva es elegible como reciclado. Para ellos el motor
  -- exige soporte: reclasificados → evidencia de reclasificación válida +
  -- justificación; no reclasificados → evidencia de origen válida.
  select
    bc.output_batch_id,
    coalesce(bool_and(
      case
        when m.reclassified_to_code is not null then
          m.reclassification_evidence_id is not null
          and m.reclassification_justification is not null
          and evr.status = 'valid'
          and evr.archived_at is null
        else
          m.origin_support_evidence_id is not null and evo.status = 'valid'
          and evo.archived_at is null
      end
    ) filter (where mc.eligible_as_recycled and not mc.never_counts
                and not bc.is_same_process), true) as all_required_support_valid,
    coalesce(bool_or(
      case
        when m.reclassified_to_code is not null then
          m.reclassification_evidence_id is null
          or m.reclassification_justification is null
          or evr.status in ('rejected', 'expired')
          or evr.archived_at is not null
        else
          m.origin_support_evidence_id is null
          or evo.status in ('rejected', 'expired')
          or evo.archived_at is not null
      end
    ) filter (where mc.eligible_as_recycled and not mc.never_counts
                and not bc.is_same_process), false) as any_support_missing,
    coalesce(bool_or(
      case
        when m.reclassified_to_code is not null then evr.status = 'pending' and evr.archived_at is null
        else evo.status = 'pending' and evo.archived_at is null
      end
    ) filter (where mc.eligible_as_recycled and not mc.never_counts
                and not bc.is_same_process), false) as any_support_pending,
    coalesce(bool_and(
      m.origin_support_evidence_id is not null and evo.status = 'valid'
      and evo.archived_at is null
    ) filter (where mc.eligible_as_recycled and not mc.never_counts
                and not bc.is_same_process
                and m.reclassified_to_code is null), true) as origin_all_valid,
    coalesce(bool_and(
      m.reclassification_evidence_id is not null
      and m.reclassification_justification is not null
      and evr.status = 'valid'
      and evr.archived_at is null
    ) filter (where m.reclassified_to_code is not null), true) as reclass_all_valid
  from public.batch_composition bc
  join public.materials m on m.id = bc.material_id
  join public.material_classifications mc
    on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
  left join public.evidences evo on evo.id = m.origin_support_evidence_id
  left join public.evidences evr on evr.id = m.reclassification_evidence_id
  group by bc.output_batch_id
)
select
  ob.organization_id,
  ob.id                       as output_batch_id,
  ob.batch_code               as output_batch_code,
  ob.produced_date,
  ob.product_id,
  p.code                      as product_code,
  p.name                      as product_name,
  p.family_id,
  pf.name                     as family_name,
  ob.production_order_id,
  po.order_code               as production_order_code,
  comp.traceability_status,
  (ob.product_id is not null)          as has_product,
  (ob.production_order_id is not null) as has_production_order,
  coalesce(comp.has_consumption, false) as has_consumption,
  coalesce(comp.has_composition, false) as has_composition,
  coalesce(ef.origin_all_valid, true)   as has_valid_origin_evidence,
  coalesce(ef.reclass_all_valid, true)  as has_required_reclassification_evidence,
  coalesce(ef.any_support_pending, false) as has_pending_required_evidence,
  coalesce(ef.any_support_missing, false) as has_missing_required_evidence,
  -- Gaps de soporte derivados del último snapshot: nivel débil o riesgo.
  (l.calculation_id is not null
   and (l.defensibility_level <> 'defensible' or l.risk_flag)) as has_support_gaps,
  (l.calculation_id is not null)        as has_calculation,
  l.calculation_id                      as latest_calculation_id,
  l.recycled_percent                    as latest_recycled_percent,
  l.defensibility_level                 as latest_defensibility_level,
  l.risk_flag                           as latest_risk_flag,
  l.calculated_at                       as latest_calculated_at,
  (l.calculation_id is not null)        as has_dossier,
  -- Siguiente paso (misma cadena que lib/domain/guided-flow.ts):
  -- orden → consumo → composición → soporte faltante → soporte pendiente →
  -- calcular → (con cálculo) brechas o dossier.
  case
    when ob.production_order_id is null then 'complete_order'
    when not coalesce(comp.has_consumption, false) then 'add_consumption'
    when not coalesce(comp.has_composition, false) then 'add_composition'
    when l.calculation_id is null and coalesce(ef.any_support_missing, false) then 'add_evidence'
    when l.calculation_id is null and coalesce(ef.any_support_pending, false) then 'validate_evidence'
    when l.calculation_id is null then 'calculate'
    when l.defensibility_level <> 'defensible' or l.risk_flag then 'review_gaps'
    else 'open_dossier'
  end as next_step_code,
  case
    when ob.production_order_id is null then 'Completar orden de producción'
    when not coalesce(comp.has_consumption, false) then 'Agregar consumo'
    when not coalesce(comp.has_composition, false) then 'Registrar composición'
    when l.calculation_id is null and coalesce(ef.any_support_missing, false) then 'Cargar evidencia'
    when l.calculation_id is null and coalesce(ef.any_support_pending, false) then 'Validar evidencia'
    when l.calculation_id is null then 'Calcular contenido reciclado'
    when l.defensibility_level <> 'defensible' or l.risk_flag then 'Revisar brechas'
    else 'Ver dossier técnico'
  end as next_step_label,
  case
    when ob.production_order_id is null then '/traceability/production-orders'
    when not coalesce(comp.has_consumption, false) then '/traceability/production-orders'
    when not coalesce(comp.has_composition, false) then '/traceability/output-batches'
    when l.calculation_id is null and coalesce(ef.any_support_missing, false) then '/evidences'
    when l.calculation_id is null and coalesce(ef.any_support_pending, false) then '/evidences'
    when l.calculation_id is null then '/recycled-content/output-batches'
    when l.defensibility_level <> 'defensible' or l.risk_flag
      then '/audit-support/output-batches/' || ob.id || '/evidence-matrix'
    else '/audit-support/calculations/' || l.calculation_id
  end as next_step_href,
  case
    when ob.production_order_id is null then 'not_ready'
    when not coalesce(comp.has_consumption, false)
      or not coalesce(comp.has_composition, false) then 'needs_data'
    when l.calculation_id is null
      and (coalesce(ef.any_support_missing, false)
           or coalesce(ef.any_support_pending, false)) then 'needs_evidence'
    when l.calculation_id is null then 'ready_to_calculate'
    when l.defensibility_level <> 'defensible' or l.risk_flag then 'calculated_with_gaps'
    else 'calculated_ready'
  end as readiness_level
from public.output_batches ob
left join public.products p          on p.id = ob.product_id
left join public.product_families pf on pf.id = p.family_id
left join public.production_orders po on po.id = ob.production_order_id
left join public.v_output_batch_completeness comp on comp.output_batch_id = ob.id
left join public.v_latest_batch_recycled l        on l.output_batch_id = ob.id
left join evidence_flags ef          on ef.output_batch_id = ob.id;

create or replace view public.v_output_batch_evidence_matrix
with (security_invoker = true) as
with base as (
  select
    ob.organization_id,
    ob.id                 as output_batch_id,
    ob.batch_code         as output_batch_code,
    ob.production_order_id,
    po.order_code,
    ob.product_id,
    p.code                as product_code,
    p.name                as product_name,
    p.family_id,
    pf.name               as family_name,
    l.calculation_id
  from public.output_batches ob
  left join public.production_orders po on po.id = ob.production_order_id
  left join public.products p           on p.id = ob.product_id
  left join public.product_families pf  on pf.id = p.family_id
  left join public.v_latest_batch_recycled l on l.output_batch_id = ob.id
),
routes as (
  -- Enlace directo al lote de salida.
  select b.*, el.evidence_id,
         'output_batch_support'::text as support_role,
         'output_batch'::text as linked_entity_type,
         b.output_batch_id as linked_entity_id,
         b.output_batch_code as linked_entity_label,
         false as is_required
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'output_batch' and el.target_id = b.output_batch_id

  union all
  -- Enlace a la orden de producción.
  select b.*, el.evidence_id, 'production_order_support', 'production_order',
         b.production_order_id, b.order_code, false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'production_order' and el.target_id = b.production_order_id

  union all
  -- Enlaces a lotes de entrada consumidos por la orden.
  select b.*, el.evidence_id, 'input_batch_support', 'input_batch',
         ib.id, ib.batch_code, false
  from base b
  join public.batch_consumption bc on bc.production_order_id = b.production_order_id
  join public.input_batches ib     on ib.id = bc.input_batch_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'input_batch' and el.target_id = ib.id

  union all
  -- Enlaces a proveedores de los lotes de entrada consumidos.
  select b.*, el.evidence_id, 'supplier_support', 'supplier',
         s.id, s.name, false
  from base b
  join public.batch_consumption bc on bc.production_order_id = b.production_order_id
  join public.input_batches ib     on ib.id = bc.input_batch_id
  join public.suppliers s          on s.id = ib.supplier_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'supplier' and el.target_id = s.id

  union all
  -- Enlaces directos a materiales de la composición.
  select b.*, el.evidence_id, 'other_linked_support', 'material',
         mt.id, mt.name, false
  from base b
  join public.batch_composition bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'material' and el.target_id = mt.id

  union all
  -- Enlace al producto.
  select b.*, el.evidence_id, 'product_support', 'product',
         b.product_id, coalesce(b.product_code || ' · ', '') || coalesce(b.product_name, ''), false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'product' and el.target_id = b.product_id

  union all
  -- Enlace a la familia del producto.
  select b.*, el.evidence_id, 'family_support', 'product_family',
         b.family_id, b.family_name, false
  from base b
  join public.evidence_links el
    on el.organization_id = b.organization_id
   and el.target_type = 'product_family' and el.target_id = b.family_id

  union all
  -- Evidencia de ORIGEN de materiales de la composición (sin necesidad de
  -- evidence_link): requerida para defendibilidad.
  select b.*, mt.origin_support_evidence_id, 'material_origin_support', 'material',
         mt.id, mt.name, true
  from base b
  join public.batch_composition bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  where mt.origin_support_evidence_id is not null

  union all
  -- Evidencia de RECLASIFICACIÓN de materiales de la composición: requerida.
  select b.*, mt.reclassification_evidence_id, 'material_reclassification_support', 'material',
         mt.id, mt.name, true
  from base b
  join public.batch_composition bcmp on bcmp.output_batch_id = b.output_batch_id
  join public.materials mt           on mt.id = bcmp.material_id
  where mt.reclassification_evidence_id is not null
)
select distinct
  r.organization_id,
  r.output_batch_id,
  r.output_batch_code,
  r.calculation_id,
  e.id                 as evidence_id,
  null::text           as evidence_code,      -- no existe en el esquema actual
  e.name               as evidence_title,
  e.evidence_type,
  e.status::text       as evidence_status,
  r.linked_entity_type,
  r.linked_entity_id,
  r.linked_entity_label,
  r.support_role,
  r.is_required        as is_required_for_defensibility,
  (e.status = 'valid' and e.archived_at is null) as is_valid_for_defensibility,
  e.created_at,
  null::timestamptz    as validated_at,       -- no existe en el esquema actual
  -- (rev. 03.1–03.3.4) Columnas AL FINAL, sin romper callers: permiten a la
  -- UI explicar por qué una evidencia aceptada internamente no está vigente.
  e.archived_at,
  e.reviewed_at,
  e.reviewed_by
from routes r
join public.evidences e on e.id = r.evidence_id;

create or replace view public.v_implementation_dashboard
with (security_invoker = true) as
with suppliers_agg as (
  select organization_id, count(*) as suppliers_count
  from public.suppliers
  group by organization_id
),
materials_agg as (
  select
    m.organization_id,
    count(*) as materials_count,
    count(*) filter (where mc.eligible_as_recycled) as recycled_materials_count,
    count(*) filter (
      where mc.eligible_as_recycled
        and (
          m.origin_support_evidence_id is null
          or coalesce(ev.status, 'pending') <> 'valid'
          or ev.archived_at is not null
        )
    ) as materials_without_origin_support_count
  from public.materials m
  join public.material_classifications mc
    on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
  left join public.evidences ev on ev.id = m.origin_support_evidence_id
  group by m.organization_id
),
evidences_agg as (
  select
    organization_id,
    count(*) as evidences_count,
    count(*) filter (where status = 'valid' and archived_at is null)   as valid_evidences_count,
    count(*) filter (where status = 'pending' and archived_at is null) as pending_evidences_count
  from public.evidences
  group by organization_id
),
input_batches_agg as (
  select organization_id, count(*) as input_batches_count
  from public.input_batches
  group by organization_id
),
production_orders_agg as (
  select organization_id, count(*) as production_orders_count
  from public.production_orders
  group by organization_id
),
output_batches_agg as (
  select organization_id, count(*) as output_batches_count
  from public.output_batches
  group by organization_id
),
composition_agg as (
  select organization_id, count(distinct output_batch_id) as output_batches_with_composition_count
  from public.batch_composition
  group by organization_id
),
feedback_agg as (
  select
    organization_id,
    count(*) filter (where status in ('open', 'in_review')) as open_feedback_count,
    count(*) filter (
      where severity = 'critical' and status in ('open', 'in_review')
    ) as critical_feedback_count
  from public.implementation_feedback
  group by organization_id
)
select
  o.id as organization_id,
  coalesce(sup.suppliers_count, 0)                                    as suppliers_count,
  coalesce(mat.materials_count, 0)                                    as materials_count,
  coalesce(mat.recycled_materials_count, 0)                           as recycled_materials_count,
  coalesce(mat.materials_without_origin_support_count, 0)             as materials_without_origin_support_count,
  coalesce(evd.evidences_count, 0)                                    as evidences_count,
  coalesce(evd.valid_evidences_count, 0)                              as valid_evidences_count,
  coalesce(evd.pending_evidences_count, 0)                            as pending_evidences_count,
  coalesce(ib.input_batches_count, 0)                                 as input_batches_count,
  coalesce(po.production_orders_count, 0)                             as production_orders_count,
  coalesce(ob.output_batches_count, 0)                                as output_batches_count,
  coalesce(cmp.output_batches_with_composition_count, 0)              as output_batches_with_composition_count,
  coalesce(gf.calculated_batches_count, 0)                            as calculated_output_batches_count,
  coalesce(gf.defensible_calculations_count, 0)                       as defensible_calculations_count,
  coalesce(gf.warning_calculations_count, 0)                          as warning_calculations_count,
  coalesce(gf.preliminary_calculations_count, 0)                      as preliminary_calculations_count,
  coalesce(gf.critical_gaps_count, 0)                                 as critical_gaps_count,
  coalesce(fb.open_feedback_count, 0)                                 as open_feedback_count,
  coalesce(fb.critical_feedback_count, 0)                             as critical_feedback_count
from public.organizations o
left join suppliers_agg sup         on sup.organization_id = o.id
left join materials_agg mat         on mat.organization_id = o.id
left join evidences_agg evd         on evd.organization_id = o.id
left join input_batches_agg ib      on ib.organization_id = o.id
left join production_orders_agg po  on po.organization_id = o.id
left join output_batches_agg ob     on ob.organization_id = o.id
left join composition_agg cmp       on cmp.organization_id = o.id
left join public.v_guided_flow_dashboard gf on gf.organization_id = o.id
left join feedback_agg fb           on fb.organization_id = o.id;

create or replace view public.v_implementation_next_actions
with (security_invoker = true) as
with d as (
  select * from public.v_implementation_dashboard
),
sample_material_without_origin as (
  select distinct on (m.organization_id)
    m.organization_id, m.id, m.name
  from public.materials m
  join public.material_classifications mc
    on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
  left join public.evidences ev on ev.id = m.origin_support_evidence_id
  where mc.eligible_as_recycled
    and (
      m.origin_support_evidence_id is null
      or coalesce(ev.status, 'pending') <> 'valid'
      or ev.archived_at is not null
    )
  order by m.organization_id, m.created_at
),
sample_pending_evidence as (
  select distinct on (organization_id)
    organization_id, id, name
  from public.evidences
  where status = 'pending' and archived_at is null
  order by organization_id, created_at
),
-- >>> PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE
-- (No eliminar los marcadores: la suite de PostgreSQL local extrae y ejecuta
--  este bloque tal cual se envía.) PCR-02.1 (hallazgo 2): una orden cuenta
-- con consumo si registra AL MENOS UNO de los dos orígenes — externo
-- (batch_consumption) o interno (output_batch_consumption). Antes solo se
-- miraba el externo y una orden trazada únicamente con producto intermedio
-- recibía la recomendación «Registrar consumo».
sample_order_without_consumption as (
  select distinct on (po.organization_id)
    po.organization_id, po.id, po.order_code
  from public.production_orders po
  where not exists (
      select 1 from public.batch_consumption bc
       where bc.production_order_id = po.id)
    and not exists (
      select 1 from public.output_batch_consumption oc
       where oc.production_order_id = po.id)
  order by po.organization_id, po.created_at
),
-- <<< PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE
sample_batch_without_composition as (
  select distinct on (ob.organization_id)
    ob.organization_id, ob.id, ob.batch_code
  from public.output_batches ob
  left join public.batch_composition bcp on bcp.output_batch_id = ob.id
  where bcp.id is null
  order by ob.organization_id, ob.created_at
),
sample_ready_to_calculate as (
  select distinct on (organization_id)
    organization_id, output_batch_id, output_batch_code
  from public.v_output_batch_readiness
  where readiness_level = 'ready_to_calculate'
  order by organization_id, output_batch_code
),
sample_gap as (
  select distinct on (organization_id)
    organization_id, output_batch_id, output_batch_code
  from public.v_output_batch_support_gaps
  where gap_severity = 'critical'
  order by organization_id, output_batch_code
),
sample_defensible as (
  select distinct on (organization_id)
    organization_id, calculation_id, output_batch_code
  from public.v_latest_batch_recycled
  where defensibility_level = 'defensible'
  order by organization_id, calculated_at desc
),
-- Un booleano por regla (1-11); la regla 12 solo aplica cuando ninguna de
-- las anteriores lo hace ("si todo está avanzado").
flags as (
  select
    d.organization_id,
    (d.suppliers_count = 0)                                     as f1_no_suppliers,
    (d.suppliers_count > 0 and d.materials_count = 0)            as f2_no_materials,
    (smo.id is not null)                                         as f3_missing_origin,
    (spe.id is not null)                                         as f4_pending_evidence,
    (d.input_batches_count = 0)                                  as f5_no_input_batches,
    (d.production_orders_count = 0)                              as f6_no_orders,
    (sow.id is not null)                                         as f7_order_without_consumption,
    (sbw.id is not null)                                         as f8_batch_without_composition,
    (srtc.output_batch_id is not null)                           as f9_ready_to_calculate,
    (sg.output_batch_id is not null)                             as f10_critical_gap,
    (sdef.calculation_id is not null)                            as f11_defensible
  from d
  left join sample_material_without_origin smo on smo.organization_id = d.organization_id
  left join sample_pending_evidence spe         on spe.organization_id = d.organization_id
  left join sample_order_without_consumption sow on sow.organization_id = d.organization_id
  left join sample_batch_without_composition sbw on sbw.organization_id = d.organization_id
  left join sample_ready_to_calculate srtc      on srtc.organization_id = d.organization_id
  left join sample_gap sg                       on sg.organization_id = d.organization_id
  left join sample_defensible sdef              on sdef.organization_id = d.organization_id
)
select organization_id, priority, action_code, action_label, action_description,
       href, related_entity_type, related_entity_id
from (
  select d.organization_id, 1 as priority, 'create_supplier' as action_code,
    'Crear proveedor real' as action_label,
    'Aún no hay proveedores registrados. Registra el primer proveedor real de la empresa.' as action_description,
    '/catalog/suppliers' as href,
    null::text as related_entity_type, null::uuid as related_entity_id
  from flags f join d on d.organization_id = f.organization_id
  where f.f1_no_suppliers

  union all
  select d.organization_id, 2, 'create_material',
    'Crear material real',
    'Hay proveedores registrados pero aún no hay materiales con su clasificación.',
    '/catalog/materials', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f2_no_materials

  union all
  select d.organization_id, 3, 'add_origin_evidence',
    'Cargar evidencia de origen',
    'El material "' || coalesce(s.name, '') ||
      '" es elegible como reciclado pero no tiene evidencia de origen válida.',
    '/evidences', 'material', s.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_material_without_origin s on s.organization_id = f.organization_id
  where f.f3_missing_origin

  union all
  select d.organization_id, 4, 'validate_evidence',
    'Validar evidencia pendiente',
    'La evidencia "' || coalesce(e.name, '') || '" está pendiente de validación.',
    '/evidences', 'evidence', e.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_pending_evidence e on e.organization_id = f.organization_id
  where f.f4_pending_evidence

  union all
  select d.organization_id, 5, 'create_input_batch',
    'Registrar lote de entrada',
    'Aún no hay lotes de entrada registrados para esta empresa.',
    '/traceability/input-batches', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f5_no_input_batches

  union all
  select d.organization_id, 6, 'create_production_order',
    'Crear orden / corrida de producción',
    'Aún no hay órdenes / corridas de producción registradas.',
    '/traceability/production-orders', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f6_no_orders

  union all
  select d.organization_id, 7, 'add_consumption',
    'Registrar consumo',
    'La orden / corrida "' || coalesce(o2.order_code, '') || '" aún no tiene consumos registrados.',
    '/traceability/production-orders', 'production_order', o2.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_order_without_consumption o2 on o2.organization_id = f.organization_id
  where f.f7_order_without_consumption

  union all
  select d.organization_id, 8, 'add_composition',
    'Registrar composición',
    'El lote producido / lote final "' || coalesce(b2.batch_code, '') || '" aún no tiene composición.',
    '/traceability/output-batches', 'output_batch', b2.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_batch_without_composition b2 on b2.organization_id = f.organization_id
  where f.f8_batch_without_composition

  union all
  select d.organization_id, 9, 'calculate_recycled_content',
    'Calcular contenido reciclado',
    'El lote producido / lote final "' || coalesce(r.output_batch_code, '') ||
      '" tiene composición registrada y está listo para calcular.',
    '/recycled-content/output-batches', 'output_batch', r.output_batch_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_ready_to_calculate r on r.organization_id = f.organization_id
  where f.f9_ready_to_calculate

  union all
  select d.organization_id, 10, 'review_gaps',
    'Revisar brechas',
    'Hay brechas críticas abiertas en el lote "' || coalesce(g.output_batch_code, '') || '".',
    '/audit-support', 'output_batch', g.output_batch_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_gap g on g.organization_id = f.organization_id
  where f.f10_critical_gap

  union all
  select d.organization_id, 11, 'open_dossier',
    'Ver dossier técnico',
    'Hay cálculos defendibles disponibles. Revisa el dossier del lote "' ||
      coalesce(def.output_batch_code, '') || '".',
    '/audit-support', 'calculation', def.calculation_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_defensible def on def.organization_id = f.organization_id
  where f.f11_defensible

  -- Sprint 10C (Bloqueante 3): única fila que cambia respecto a 0034 —
  -- ahora invita a crear un ticket de soporte y enlaza a /support/new,
  -- en vez del antiguo flujo de feedback y su ruta ya reemplazada.
  union all
  select f.organization_id, 12, 'record_feedback',
    'Crear ticket de soporte',
    'Los datos, la trazabilidad y el cálculo de la empresa están avanzados. Crea un ticket de soporte con hallazgos, dudas o mejoras encontradas durante la prueba real.',
    '/support/new', null, null
  from flags f
  where not (
    f.f1_no_suppliers or f.f2_no_materials or f.f3_missing_origin
    or f.f4_pending_evidence or f.f5_no_input_batches or f.f6_no_orders
    or f.f7_order_without_consumption or f.f8_batch_without_composition
    or f.f9_ready_to_calculate or f.f10_critical_gap or f.f11_defensible
  )
) actions;
