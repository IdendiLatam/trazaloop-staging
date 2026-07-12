-- 0028_recycled_content.sql
-- Trazaloop · Sprint 4 · Motor de cálculo de contenido reciclado
-- (NTC 6632:2022 / UNE-EN 15343:2008).
--
-- Piezas: metodología global versionada + snapshot INMUTABLE por cálculo +
-- RPC segura que aplica las reglas, evalúa defendibilidad y audita.
-- Recalcular SIEMPRE crea una fila nueva; nada se sobrescribe.

-- ---------------------------------------------------------------------------
-- 3.1 calculation_methodologies — catálogo GLOBAL versionado (sin org)
-- ---------------------------------------------------------------------------
create table public.calculation_methodologies (
  id             uuid primary key default gen_random_uuid(),
  code           text not null,
  version        integer not null,
  name           text not null,
  description    text not null,
  rules          jsonb not null,
  is_active      boolean not null default false,
  effective_from date,
  created_at     timestamptz not null default now(),
  constraint calculation_methodologies_code_version_uniq unique (code, version)
);

-- Solo UNA versión activa por código.
create unique index calculation_methodologies_active_code_uniq
  on public.calculation_methodologies (code)
  where is_active;

alter table public.calculation_methodologies enable row level security;

-- select para autenticados; SIN políticas de escritura: los clientes no
-- pueden insertar/actualizar/borrar metodologías en este sprint.
create policy calculation_methodologies_select on public.calculation_methodologies
  for select to authenticated using (true);

revoke insert, update, delete on public.calculation_methodologies from anon, authenticated;

insert into public.calculation_methodologies
  (code, version, name, description, rules, is_active, effective_from)
values (
  'RC-6632-15343',
  1,
  'Metodología de cálculo de contenido reciclado NTC 6632 / UNE-EN 15343',
  'Reglas de cálculo del porcentaje de contenido reciclado por lote de salida '
  'conforme a NTC 6632:2022 y UNE-EN 15343:2008: fórmula masa reciclada válida '
  'sobre masa total, exclusión del material recuperado en el mismo proceso, '
  'postindustrial solo mediante reclasificación soportada, y exigencia de '
  'soporte de origen validado para contar masa como reciclada.',
  '{
    "formula": "recycled_mass / total_mass * 100",
    "same_process_counts": false,
    "postindustrial_counts_by_default": false,
    "postindustrial_requires_reclassification": true,
    "recycled_requires_origin_support": true,
    "additives_pigments_fillers_count": false,
    "mass_unit": "kg",
    "eligible_classifications": ["preconsumer_valid", "postconsumer_valid"],
    "mass_balance_tolerance_percent": 5
  }'::jsonb,
  true,
  current_date
);

-- ---------------------------------------------------------------------------
-- 3.2 recycled_content_calculations — snapshot inmutable por lote de salida
-- ---------------------------------------------------------------------------
create table public.recycled_content_calculations (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations (id) on delete restrict,
  output_batch_id             uuid not null,
  methodology_id              uuid not null references public.calculation_methodologies (id),
  methodology_rules_snapshot  jsonb not null,
  total_mass_kg               numeric(14,4) not null,
  recycled_mass_kg            numeric(14,4) not null,
  recycled_percent            numeric(7,4) not null,
  declared_percent            numeric(7,4),
  risk_flag                   boolean not null default false,
  defensibility_level         text not null,
  warnings                    jsonb not null default '[]',
  components                  jsonb not null,
  calculated_by               uuid not null references public.profiles (id),
  calculated_at               timestamptz not null default now(),
  created_at                  timestamptz not null default now(),
  constraint recycled_calc_org_id_uniq unique (organization_id, id),
  constraint recycled_calc_total_positive check (total_mass_kg > 0),
  constraint recycled_calc_recycled_nonnegative check (recycled_mass_kg >= 0),
  constraint recycled_calc_percent_range
    check (recycled_percent >= 0 and recycled_percent <= 100),
  constraint recycled_calc_level_check
    check (defensibility_level in ('preliminary', 'with_warnings', 'defensible')),
  constraint recycled_calc_output_fk
    foreign key (organization_id, output_batch_id)
    references public.output_batches (organization_id, id)
    on delete restrict
);
-- Sin updated_at a propósito: un snapshot jamás se actualiza.

create index recycled_calc_batch_idx
  on public.recycled_content_calculations (output_batch_id, calculated_at desc);
create index recycled_calc_org_idx
  on public.recycled_content_calculations (organization_id, calculated_at desc);

-- INMUTABILIDAD TOTAL: ni UPDATE ni DELETE, ni siquiera vía definer
-- (mismo mecanismo que audit_log). Por eso se OMITE deliberadamente
-- prevent_organization_id_change: todo update ya lanza excepción, así que el
-- organization_id es inmutable por definición. Recalcular = fila nueva.
create trigger t_recycled_calc_immutable
  before update or delete on public.recycled_content_calculations
  for each row execute function public.forbid_mutation();

alter table public.recycled_content_calculations enable row level security;

-- select: miembros de la empresa. INSERT: SOLO mediante la RPC segura de
-- abajo (definer); sin política de insert los clientes no insertan directo.
create policy recycled_calc_select on public.recycled_content_calculations
  for select to authenticated using (public.is_org_member(organization_id));

revoke insert, update, delete on public.recycled_content_calculations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC calculate_recycled_content — cálculo, snapshot y auditoría
--
-- SECURITY DEFINER con validación estricta: sesión, existencia del lote,
-- membresía activa y rol admin/quality/consultant. Jamás recibe
-- organization_id del cliente: lo toma del lote. No usa service_role.
-- ---------------------------------------------------------------------------
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
           ev_r.status::text as reclass_status
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
           and comp.reclassified_by is not null then
          v_counted := true;
        else
          v_reason := 'invalid_reclassification_support';
          v_has_missing_support := true;
          if comp.reclass_status is not null and comp.reclass_status <> 'valid' then
            v_has_not_valid_evidence := true;
            v_comp_warnings := array_append(v_comp_warnings, 'reclassification_support_not_valid');
          end if;
        end if;
      elsif v_requires_origin then
        -- Regla 4: soporte de origen obligatorio y validado (criterio estricto).
        if comp.origin_support_evidence_id is null then
          v_reason := 'missing_origin_support';
          v_has_missing_support := true;
        elsif comp.origin_status <> 'valid' then
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
