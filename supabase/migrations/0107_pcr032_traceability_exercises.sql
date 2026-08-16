-- ============================================================================
-- 0107_pcr032_traceability_exercises.sql · Sprint PCR-03.2
-- ============================================================================
-- Ejercicio de trazabilidad PRE-AUDITORÍA: la empresa selecciona un lote
-- producido / lote final y el sistema reconstruye su trazabilidad hacia
-- atrás con los DATOS REALES ya registrados (genealogía PCR-02, inventario
-- PCR-02.5, evidencias gobernadas PCR-03.1, requisitos de cliente, cálculo
-- PCR), clasifica observaciones (información / advertencia / brecha) y
-- congela el resultado en un SNAPSHOT histórico e inmutable.
--
-- Lenguaje prudente: el resultado interno es complete /
-- complete_with_warnings / incomplete — jamás "cumple/no cumple". El
-- ejercicio NO es una auditoría ni una certificación (disclaimer en UI y
-- snapshot).
--
-- Sin transaction control propio (regla PCR-02.5.2); compatible con la
-- transacción del runner (Supabase CLI / psql --single-transaction). Sin
-- CREATE INDEX CONCURRENTLY, VACUUM, ALTER SYSTEM ni CREATE/DROP DATABASE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 · Tabla de ejercicios (6.1/6.5/6.6): snapshot JSON con schema_version
-- ----------------------------------------------------------------------------
create table if not exists public.traceability_exercises (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  output_batch_id uuid not null,
  started_by      uuid references public.profiles (id),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  status          text not null default 'draft',
  result          text,
  snapshot        jsonb,
  schema_version  text not null default 'pcr_traceability_exercise_v1',
  source_hash     text,
  gaps_count      integer not null default 0,
  warnings_count  integer not null default 0,
  notes           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint traceability_exercises_org_id_uniq unique (organization_id, id),
  -- (rev. 03.1–03.3.2, hallazgo 5) Los conteos jamás son negativos.
  constraint traceability_exercises_counts_check
    check (gaps_count >= 0 and warnings_count >= 0),
  constraint traceability_exercises_status_check
    check (status in ('draft', 'completed', 'archived')),
  constraint traceability_exercises_result_check
    check (result is null or result in ('complete', 'complete_with_warnings', 'incomplete')),
  -- FK compuesta: el lote objetivo pertenece a la MISMA organización.
  -- ON DELETE RESTRICT: un lote con ejercicios históricos no desaparece.
  constraint traceability_exercises_output_batch_fk
    foreign key (organization_id, output_batch_id)
    references public.output_batches (organization_id, id)
    on delete restrict
);

comment on table public.traceability_exercises is
  'PCR-03.2 · Ejercicio interno de trazabilidad pre-auditoría por lote producido/final: snapshot congelado (schema pcr_traceability_exercise_v1) con genealogía, balances, evidencias, requisitos y cálculo; resultado interno prudente (complete / complete_with_warnings / incomplete). No constituye auditoría ni certificación.';
comment on column public.traceability_exercises.snapshot is
  'PCR-03.2 · Fotografía histórica del ejercicio; congelada al completar (guarda de inmutabilidad). Jamás contiene signed URLs.';
comment on column public.traceability_exercises.source_hash is
  'PCR-03.2 · SHA-256 del snapshot canónico: permite detectar que los datos cambiaron después.';

create index if not exists traceability_exercises_org_batch_idx
  on public.traceability_exercises (organization_id, output_batch_id, started_at desc);
create index if not exists traceability_exercises_org_status_idx
  on public.traceability_exercises (organization_id, status);

create trigger t_traceability_exercises_updated
  before update on public.traceability_exercises
  for each row execute function public.set_updated_at();

create trigger t_traceability_exercises_force_created_by
  before insert on public.traceability_exercises
  for each row execute function public.force_created_by();

create trigger t_audit_traceability_exercises
  after insert or update or delete on public.traceability_exercises
  for each row execute function public.audit_row_change();

-- ----------------------------------------------------------------------------
-- §2 · Inmutabilidad del historial (6.5): patrón jsonb-minus de 0104 §2e
-- ----------------------------------------------------------------------------
-- Un ejercicio COMPLETADO es una fotografía histórica: solo admite la
-- transición PURA completed → archived (y notas NO: nada cambia). Los
-- cambios posteriores en órdenes/lotes/consumos/evidencias generan un
-- ejercicio NUEVO, jamás reescriben el anterior.
create or replace function public.traceability_exercises_immutability_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('completed', 'archived') then
    if (to_jsonb(new) - 'status' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'El ejercicio finalizado es una fotografía histórica: no puede modificarse. Ejecuta un ejercicio nuevo para reflejar los cambios.'
        using errcode = '23514';
    end if;
    if new.status is distinct from old.status and new.status <> 'archived' then
      raise exception 'Un ejercicio finalizado solo puede archivarse.'
        using errcode = '23514';
    end if;
    -- (rev. 03.1–03.3.2, hallazgo 4) Archivar es acción reservada TAMBIÉN en
    -- BD: ocultar el botón y comprobar el rol en la Server Action no basta
    -- frente a un UPDATE directo vía REST.
    if new.status = 'archived' and old.status = 'completed'
       and not public.has_org_role(new.organization_id, array['admin', 'quality']) then
      raise exception 'Solo administrador o calidad pueden archivar ejercicios.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.traceability_exercises_immutability_guard() is
  'PCR-03.2 · El snapshot completado queda CONGELADO: solo la transición pura completed→archived. SECURITY INVOKER (RLS ya limitó el alcance).';

revoke execute on function public.traceability_exercises_immutability_guard() from public, anon, authenticated;

drop trigger if exists t_traceability_exercises_immutability on public.traceability_exercises;
create trigger t_traceability_exercises_immutability
  before update on public.traceability_exercises
  for each row execute function public.traceability_exercises_immutability_guard();

create or replace function public.traceability_exercises_protect_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('completed', 'archived') then
    raise exception 'El ejercicio finalizado forma parte del historial de preparación y no puede eliminarse.'
      using errcode = '23514';
  end if;
  return old;
end;
$$;

comment on function public.traceability_exercises_protect_delete() is
  'PCR-03.2 · Sin DELETE destructivo del historial: solo los borradores pueden eliminarse.';

revoke execute on function public.traceability_exercises_protect_delete() from public, anon, authenticated;

drop trigger if exists t_traceability_exercises_protect_delete on public.traceability_exercises;
create trigger t_traceability_exercises_protect_delete
  before delete on public.traceability_exercises
  for each row execute function public.traceability_exercises_protect_delete();

-- ----------------------------------------------------------------------------
-- §2b · El ejercicio NO puede fabricarse (03.1–03.3.1, hallazgo 5)
-- ----------------------------------------------------------------------------
-- La RLS por membresía permitiría a un cliente REST insertar directamente
-- un 'completed' con snapshot/hash/resultado arbitrarios, invalidando el
-- concepto de fotografía histórica. Defensa en BD con el patrón de FLAG
-- TRANSACCIONAL ya existente en la casa (0084, pasaportes): los campos
-- calculados/históricos solo cambian dentro de la RPC controlada, que
-- enciende el flag en su transacción; cualquier otra vía queda vetada.
--
--   INSERT: nace SIEMPRE como draft "vacío" (sin snapshot/resultado/sellos)
--           y con started_at/started_by de verdad-servidor.
--   UPDATE: los campos protegidos exigen el flag (solo la RPC lo enciende).
create or replace function public.traceability_exercises_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'draft'
     or new.snapshot is not null
     or new.result is not null
     or new.completed_at is not null
     or new.source_hash is not null
     or coalesce(new.gaps_count, 0) <> 0
     or coalesce(new.warnings_count, 0) <> 0 then
    raise exception 'Un ejercicio solo puede iniciarse como borrador: el resultado y la fotografía los produce el servidor al completarlo.'
      using errcode = '23514';
  end if;
  new.schema_version := 'pcr_traceability_exercise_v1';
  new.started_at := now();
  if auth.uid() is not null then
    new.started_by := auth.uid();
  end if;
  return new;
end;
$$;

comment on function public.traceability_exercises_insert_guard() is
  'PCR-03.2 (rev. 03.1–03.3.1) · El ejercicio nace SOLO como draft vacío con started_at/started_by de verdad-servidor; imposible fabricar un completed vía REST.';

revoke execute on function public.traceability_exercises_insert_guard() from public, anon, authenticated;

drop trigger if exists t_traceability_exercises_insert_guard on public.traceability_exercises;
create trigger t_traceability_exercises_insert_guard
  before insert on public.traceability_exercises
  for each row execute function public.traceability_exercises_insert_guard();

create or replace function public.traceability_exercises_protected_fields_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (to_jsonb(new) - 'notes' - 'updated_at')
     is distinct from
     (to_jsonb(old) - 'notes' - 'updated_at')
     and coalesce(current_setting('trazaloop.exercise_complete', true), 'off') <> 'on' then
    -- Única excepción sin flag: archivar un finalizado (transición PURA,
    -- que además vigila la guarda de inmutabilidad de §2).
    if not (old.status in ('completed') and new.status = 'archived'
            and (to_jsonb(new) - 'status' - 'updated_at')
                is not distinct from
                (to_jsonb(old) - 'status' - 'updated_at')) then
      raise exception 'Los campos del ejercicio (estado, fotografía, resultado, huella y sellos) los administra el servidor: usa «Iniciar ejercicio» o archívalo.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.traceability_exercises_protected_fields_guard() is
  'PCR-03.2 (rev. 03.1–03.3.1) · status/snapshot/result/source_hash/completed_at/conteos/started_* SOLO cambian bajo el flag transaccional de la RPC (patrón 0084); sin flag únicamente notes del borrador y la transición pura completed→archived.';

revoke execute on function public.traceability_exercises_protected_fields_guard() from public, anon, authenticated;

drop trigger if exists t_traceability_exercises_protected_fields on public.traceability_exercises;
create trigger t_traceability_exercises_protected_fields
  before update on public.traceability_exercises
  for each row execute function public.traceability_exercises_protected_fields_guard();

-- ----------------------------------------------------------------------------
-- §2c · FOTOGRAFÍA AUTORITATIVA (rev. 03.1–03.3.2, hallazgo 1)
-- ----------------------------------------------------------------------------
-- La rev. 03.1–03.3.1 vetó INSERT/UPDATE directos, pero la RPC aún aceptaba
-- la fotografía del llamador como parámetro: cualquier miembro podía declarar el CONTENIDO
-- histórico por REST (y un hash de servidor solo certificaría contenido
-- posiblemente falso). AHORA la fotografía se CONSTRUYE EN LA BASE DE DATOS
-- desde las fuentes autoritativas de Trazaloop, replicando el contrato
-- pcr_traceability_exercise_v1 que consume la UI:
--   · lote objetivo + producto (output_batches/products);
--   · genealogía multinivel hacia atrás (batch_consumption /
--     output_batch_consumption, ciclos por camino y profundidad máxima 10,
--     deduplicada al nivel mínimo — equivalente BFS de PCR-02);
--   · saldos REALES de las vistas 0105;
--   · evidencias gobernadas 03.1 (evidence_links + evidences) de lotes,
--     órdenes, entradas, materiales y proveedores de la cadena;
--   · acuerdos/requisitos de cliente (customer_requirement_links);
--   · cálculo PCR (recycled_content_calculations, solo lectura);
--   · observaciones clasificadas info/advertencia/brecha con recomendación
--     (mismas reglas prudentes del dominio 03.2: la ausencia de un dato
--     OPCIONAL jamás es brecha).
-- El builder es un helper interno: EXECUTE revocado a los clientes; solo la
-- RPC (SECURITY DEFINER) lo invoca.
create or replace function public.pcr_build_exercise_snapshot(
  p_org             uuid,
  p_output_batch_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_name text;
  v_batch_code text;
  v_product_label text;
  v_produced numeric;
  v_chain jsonb;
  v_order_ids uuid[];
  v_ob_ids uuid[];
  v_input_ids uuid[];
  v_material_ids uuid[];
  v_balances jsonb;
  v_evidences jsonb;
  v_requirements jsonb;
  v_calc jsonb;
  v_findings jsonb := '[]'::jsonb;
  v_total_external int;
  v_total_internal int;
  v_mat_names int;
  v_sup_names int;
  v_counts_orders int;
  v_counts_external int;
  v_counts_internal int;
  v_evid_total int; v_evid_current int; v_evid_pending int; v_evid_rejected int; v_evid_physical int;
  v_req_total int;
  v_quality int;
  v_gaps int; v_warnings int;
  v_result text;
  v_root_order text;
  r record;
begin
  select o.name into v_org_name from organizations o where o.id = p_org;
  select ob.batch_code,
         case when p.code is not null then p.code || ' · ' || p.name end,
         ob.produced_quantity_kg
    into v_batch_code, v_product_label, v_produced
    from output_batches ob
    left join products p on p.id = ob.product_id and p.organization_id = p_org
   where ob.id = p_output_batch_id and ob.organization_id = p_org;
  if v_batch_code is null then
    raise exception 'El lote no existe o no pertenece a tu empresa.' using errcode = '23514';
  end if;

  -- Genealogía multinivel: recorrido hacia atrás con protección de ciclos
  -- por camino y profundidad máxima 10; cada lote queda en su nivel MÍNIMO.
  with recursive walk as (
    select p_output_batch_id as ob_id, 0 as depth, array[p_output_batch_id] as path
    union all
    select oc.output_batch_id, w.depth + 1, w.path || oc.output_batch_id
      from walk w
      join output_batches cur on cur.id = w.ob_id
      join output_batch_consumption oc
        on oc.organization_id = p_org
       and oc.production_order_id = cur.production_order_id
     where w.depth < 10
       and not oc.output_batch_id = any(w.path)
  ),
  nodes as (select ob_id, min(depth) as depth from walk group by ob_id)
  select
    coalesce(jsonb_agg(stage order by depth, batch_code), '[]'::jsonb),
    coalesce(array_agg(distinct order_id) filter (where order_id is not null), '{}'),
    coalesce(array_agg(ob_id), '{}')
    into v_chain, v_order_ids, v_ob_ids
  from (
    select n.depth, n.ob_id, ob.batch_code, po.id as order_id,
      jsonb_build_object(
        'depth', n.depth,
        'output_batch', ob.batch_code,
        'order', po.order_code,
        'order_status', po.status,
        'external_inputs', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'batch_code', ib.batch_code,
                   'material', m.name,
                   'supplier', su.name,
                   'mass_kg', trim_scale(bc.mass_kg)) order by ib.batch_code)
            from batch_consumption bc
            join input_batches ib on ib.id = bc.input_batch_id
            left join materials m on m.id = ib.material_id
            left join suppliers su on su.id = ib.supplier_id
           where bc.organization_id = p_org and bc.production_order_id = po.id), '[]'::jsonb),
        'internal_inputs', coalesce((
          select jsonb_agg(jsonb_build_object(
                   'batch_code', so.batch_code,
                   'mass_kg', trim_scale(oc.mass_kg)) order by so.batch_code)
            from output_batch_consumption oc
            join output_batches so on so.id = oc.output_batch_id
           where oc.organization_id = p_org and oc.production_order_id = po.id), '[]'::jsonb),
        'truncated', (n.depth = 10 and exists (
          select 1 from output_batch_consumption oc
           where oc.organization_id = p_org and oc.production_order_id = po.id))
      ) as stage
    from nodes n
    join output_batches ob on ob.id = n.ob_id
    left join production_orders po on po.id = ob.production_order_id
  ) t;

  select coalesce(array_agg(distinct bc.input_batch_id), '{}')
    into v_input_ids
    from batch_consumption bc
   where bc.organization_id = p_org and bc.production_order_id = any(v_order_ids);

  -- (rev. 03.1–03.3.4, hallazgo 9) Conjunto CANÓNICO de materiales de la
  -- cadena: los de los lotes de entrada de la genealogía UNION los de la
  -- COMPOSICIÓN de todos sus lotes producidos — los mismos que evalúa el
  -- motor calculate_recycled_content. Un material solo-composición (aún sin
  -- consumo/lote de entrada) queda VISIBLE con su soporte; la brecha de
  -- trazabilidad se señala aparte, sin ocultar la evidencia.
  select coalesce(array_agg(distinct mid), '{}') into v_material_ids
    from (
      select ib.material_id as mid
        from input_batches ib
       where ib.id = any(v_input_ids) and ib.material_id is not null
      union
      select bcmp.material_id
        from batch_composition bcmp
       where bcmp.organization_id = p_org
         and bcmp.output_batch_id = any(v_ob_ids)
         and bcmp.material_id is not null
    ) mats;

  -- Saldos REALES desde las vistas 0105 (derivados, jamás recalculados).
  select jsonb_build_object(
    'input_batches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.input_batch_id, 'batch_code', v.batch_code,
               'received_kg', trim_scale(v.received_kg),
               'consumed_kg', trim_scale(v.consumed_kg),
               'available_kg', trim_scale(v.available_kg)) order by v.batch_code)
        from v_input_batch_inventory v
       where v.organization_id = p_org and v.input_batch_id = any(v_input_ids)), '[]'::jsonb),
    'output_batches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.output_batch_id, 'batch_code', v.batch_code,
               'produced_kg', trim_scale(v.produced_kg),
               'consumed_internally_kg', trim_scale(v.consumed_internally_kg),
               'available_kg', trim_scale(v.available_kg)) order by v.batch_code)
        from v_output_batch_inventory v
       where v.organization_id = p_org and v.output_batch_id = any(v_ob_ids)), '[]'::jsonb))
    into v_balances;

  -- Evidencias gobernadas de TODA la cadena, con etiqueta humana, estado de
  -- revisión, vigencia (valid + no archivada) y METADATA COMPLETA para la
  -- matriz del expediente (rev. 03.1–03.3.3, hallazgos 3, 4 y 5):
  --   · destinos: lotes producidos, órdenes, lotes de entrada, materiales,
  --     proveedores, PRODUCTOS de los lotes de la cadena y REQUISITOS de
  --     cliente aplicables;
  --   · soportes DIRECTOS del material (materials.origin_support_evidence_id
  --     y reclassification_evidence_id) incluidos aunque no exista fila en
  --     evidence_links — son los MISMOS soportes que usa el motor PCR 0028 —
  --     sin duplicar cuando la relación explícita también existe;
  --   · jamás signed URLs: solo has_digital_file como indicador.
  with targets as (
    select 'output_batch'::text as t, ob.id, 'Lote producido ' || ob.batch_code as label, 1 as ord
      from output_batches ob where ob.id = any(v_ob_ids)
    union all
    select 'production_order', po.id, 'Orden ' || po.order_code, 2
      from production_orders po where po.id = any(v_order_ids)
    union all
    select 'input_batch', ib.id, 'Lote de entrada ' || ib.batch_code, 3
      from input_batches ib where ib.id = any(v_input_ids)
    union all
    select distinct 'material', m.id, 'Material ' || m.name, 4
      from materials m
     where m.id = any(v_material_ids)
    union all
    select distinct 'supplier', su.id, 'Proveedor ' || su.name, 5
      from input_batches ib join suppliers su on su.id = ib.supplier_id
     where ib.id = any(v_input_ids)
    union all
    select distinct 'product', p.id, 'Producto ' || p.code || ' · ' || p.name, 6
      from output_batches ob join products p on p.id = ob.product_id
     where ob.id = any(v_ob_ids) and p.organization_id = p_org
    union all
    select distinct 'customer_requirement', cr.id,
           'Requisito ' || cr.code || ' (' || cr.customer_name || ')', 7
      from customer_requirement_links crl
      join customer_requirements cr on cr.id = crl.requirement_id
     where crl.organization_id = p_org
       and ((crl.target_type = 'output_batch' and crl.target_id = any(v_ob_ids))
         or (crl.target_type = 'production_order' and crl.target_id = any(v_order_ids))
         or (crl.target_type = 'product' and crl.target_id in (
               select ob2.product_id from output_batches ob2
                where ob2.id = any(v_ob_ids) and ob2.product_id is not null)))
  ),
  links as (
    select el.evidence_id, el.target_type::text as t, el.target_id, el.link_role
      from evidence_links el
     where el.organization_id = p_org
    union all
    -- Soportes implícitos del material (mismos campos que lee el motor PCR).
    select m.origin_support_evidence_id, 'material', m.id,
           'Soporte de origen del material'
      from materials m
     where m.organization_id = p_org
       and m.origin_support_evidence_id is not null
       and m.id = any(v_material_ids)
       and not exists (select 1 from evidence_links el2
                        where el2.organization_id = p_org
                          and el2.evidence_id = m.origin_support_evidence_id
                          and el2.target_type::text = 'material'
                          and el2.target_id = m.id)
    union all
    select m.reclassification_evidence_id, 'material', m.id,
           'Soporte de reclasificación del material'
      from materials m
     where m.organization_id = p_org
       and m.reclassification_evidence_id is not null
       and m.id = any(v_material_ids)
       and not exists (select 1 from evidence_links el2
                        where el2.organization_id = p_org
                          and el2.evidence_id = m.reclassification_evidence_id
                          and el2.target_type::text = 'material'
                          and el2.target_id = m.id)
  )
  select coalesce(jsonb_agg(entry order by ord, label, name), '[]'::jsonb)
    into v_evidences
  from (
    select tg.ord, tg.label, e.name,
      jsonb_build_object(
        'evidence_id', e.id,
        'target_type', tg.t,
        'target_id', l.target_id,
        'target_label', tg.label,
        'name', e.name,
        'evidence_type', e.evidence_type,
        'evidence_date', e.evidence_date,
        'status', e.status,
        'medium', e.medium,
        'archived_at', e.archived_at,
        'reviewed_at', e.reviewed_at,
        'reviewed_by', e.reviewed_by,
        'reviewed_by_email', rp.email,
        'review_comment', e.review_comment,
        'responsible', e.responsible,
        'physical_reference', e.physical_reference,
        'physical_location', e.physical_location,
        'physical_custodian', e.physical_custodian,
        'has_digital_file', (e.storage_path is not null),
        'link_role', l.link_role,
        'review_label',
          (case e.status
             when 'pending' then 'Pendiente de revisión'
             when 'valid' then 'Aceptada internamente'
             when 'rejected' then 'Rechazada'
             when 'expired' then 'Vencida'
             else e.status end)
          || case when e.archived_at is not null then ' · Archivada' else '' end,
        'current', (e.status = 'valid' and e.archived_at is null)
      ) as entry
    from links l
    join targets tg on tg.t = l.t and tg.id = l.target_id
    join evidences e on e.id = l.evidence_id and e.organization_id = p_org
    left join profiles rp on rp.id = e.reviewed_by
  ) ev;

  -- Acuerdos/requisitos de cliente aplicables a la cadena.
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', cr.code, 'customer_name', cr.customer_name, 'title', cr.title,
           'active', cr.active,
           'target_label', case crl.target_type
             when 'output_batch' then 'Lote de la cadena'
             when 'product' then 'Producto del lote'
             else 'Orden de la cadena' end) order by cr.code), '[]'::jsonb)
    into v_requirements
    from customer_requirement_links crl
    join customer_requirements cr on cr.id = crl.requirement_id
   where crl.organization_id = p_org
     and ((crl.target_type = 'output_batch' and crl.target_id = any(v_ob_ids))
       or (crl.target_type = 'production_order' and crl.target_id = any(v_order_ids))
       -- (rev. 03.1–03.3.4, hallazgo 11) Misma lógica que las evidencias:
       -- productos de TODOS los lotes de la cadena, no solo del objetivo.
       or (crl.target_type = 'product' and crl.target_id in (
             select ob.product_id from output_batches ob
              where ob.id = any(v_ob_ids) and ob.product_id is not null)));

  -- Cálculo PCR: solo VISIBILIDAD del último cálculo registrado (0028); la
  -- metodología no se toca. Advertencias con las etiquetas humanas vigentes.
  select case when c.id is null then null else jsonb_build_object(
           'recycled_percent', trim_scale(c.recycled_percent),
           'calculated_at', c.calculated_at,
           'level', c.defensibility_level,
           'components', coalesce(c.components, '[]'::jsonb),
           'warnings', coalesce((
             select jsonb_agg(case w.code
               when 'mass_balance_out_of_tolerance' then 'Balance de masa fuera de tolerancia (consumo vs composición)'
               when 'produced_vs_composition_out_of_tolerance' then 'Cantidad producida difiere de la composición más del 5%'
               when 'declared_above_calculated' then 'El porcentaje declarado supera al calculado'
               when 'components_excluded_for_missing_support' then 'Hay masa elegible excluida por falta de soporte'
               when 'postindustrial_not_reclassified_present' then 'Hay material postindustrial sin reclasificar'
               when 'related_evidence_not_valid' then 'Hay evidencia pendiente o rechazada asociada a materiales reciclados'
               else w.code end)
             from jsonb_array_elements_text(c.warnings) as w(code)), '[]'::jsonb)) end
    into v_calc
    from (select rc.* from recycled_content_calculations rc
           where rc.organization_id = p_org and rc.output_batch_id = p_output_batch_id
           order by rc.calculated_at desc limit 1) c
    right join (select 1) one on true;

  -- ── Observaciones clasificadas (mismas reglas prudentes del dominio) ──
  v_total_external := (select count(*)::int from jsonb_array_elements(v_chain) st,
                        jsonb_array_elements(st->'external_inputs'));
  v_total_internal := (select count(*)::int from jsonb_array_elements(v_chain) st,
                        jsonb_array_elements(st->'internal_inputs'));
  v_root_order := v_chain->0->>'order';

  v_findings := v_findings || jsonb_build_array(jsonb_build_object(
    'level', 'info', 'area', 'identidad',
    'message', 'Lote objetivo ' || v_batch_code || ' identificado en Trazaloop.'));
  if v_product_label is not null then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'identidad', 'message', 'Producto asociado: ' || v_product_label || '.'));
  else
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'warning', 'area', 'identidad',
      'message', 'El lote no tiene producto asociado (dato opcional).',
      'recommendation', 'Asocia el producto comercial en Trazabilidad → Lotes producidos para un expediente más completo.'));
  end if;
  if v_root_order is not null then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'identidad', 'message', 'Orden / corrida productora: ' || v_root_order || '.'));
  end if;

  if v_produced is not null and v_produced > 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'cantidades',
      'message', 'Cantidad producida registrada: ' || trim_scale(v_produced)::text || ' kg.'));
  else
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'gap', 'area', 'cantidades',
      'message', 'El lote no tiene cantidad producida válida.',
      'recommendation', 'Registra la cantidad real con la empresa (obligatoria desde PCR-02.5).'));
  end if;

  if v_total_external + v_total_internal = 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'gap', 'area', 'cantidades',
      'message', 'La orden productora no tiene consumos registrados: la trazabilidad hacia atrás no puede demostrarse.',
      'recommendation', 'Registra los consumos de lotes de entrada (o internos) de la orden / corrida.'));
  else
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'cantidades',
      'message', 'Consumos registrados: ' || v_total_external || ' externo(s) y ' || v_total_internal || ' interno(s) en la cadena.'));
  end if;
  for r in select b->>'batch_code' as code, (b->>'available_kg')::numeric as avail
             from jsonb_array_elements(v_balances->'input_batches') b loop
    if r.avail < 0 then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'level', 'gap', 'area', 'cantidades',
        'message', 'El lote de entrada ' || r.code || ' presenta consumo por encima de lo recibido (saldo ' || trim_scale(r.avail)::text || ' kg).',
        'recommendation', 'Corrige las cantidades reales con la empresa; las guardas PCR-02.5 impiden nuevos sobreconsumos.'));
    end if;
  end loop;
  for r in select b->>'batch_code' as code, (b->>'available_kg')::numeric as avail
             from jsonb_array_elements(v_balances->'output_batches') b loop
    if r.avail < 0 then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'level', 'gap', 'area', 'cantidades',
        'message', 'El lote producido ' || r.code || ' presenta consumo interno por encima de lo producido.',
        'recommendation', 'Corrige las cantidades reales con la empresa.'));
    end if;
  end loop;

  select count(distinct ext->>'material') filter (where ext->>'material' is not null),
         count(distinct ext->>'supplier') filter (where ext->>'supplier' is not null)
    into v_mat_names, v_sup_names
    from jsonb_array_elements(v_chain) st, jsonb_array_elements(st->'external_inputs') ext;
  for r in select ext->>'batch_code' as code, ext->>'material' as mat, ext->>'supplier' as sup
             from jsonb_array_elements(v_chain) st, jsonb_array_elements(st->'external_inputs') ext loop
    if r.mat is null then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'level', 'warning', 'area', 'trazabilidad_externa',
        'message', 'El lote de entrada ' || r.code || ' no tiene material identificado.',
        'recommendation', 'Asigna el material en Catálogos para poder defender el origen.'));
    end if;
    if r.sup is null then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'level', 'warning', 'area', 'trazabilidad_externa',
        'message', 'El lote de entrada ' || r.code || ' no tiene proveedor identificado.'));
    end if;
  end loop;
  if v_total_external > 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'trazabilidad_externa',
      'message', v_total_external || ' lote(s) de entrada, ' || v_mat_names || ' material(es) y ' || v_sup_names || ' proveedor(es) identificados en la cadena.'));
  end if;

  if v_total_internal > 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'trazabilidad_interna',
      'message', 'La cadena incluye ' || v_total_internal || ' consumo(s) de lotes producidos por órdenes anteriores (genealogía multinivel, profundidad máxima 10).'));
  end if;
  if exists (select 1 from jsonb_array_elements(v_chain) st where (st->>'truncated')::boolean) then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'warning', 'area', 'trazabilidad_interna',
      'message', 'La reconstrucción alcanzó la profundidad máxima (10 niveles): pueden existir eslabones anteriores no mostrados.',
      'recommendation', 'Ejecuta un ejercicio sobre el lote intermedio más profundo para continuar la cadena.'));
  end if;

  select count(*),
         count(*) filter (where (e->>'current')::boolean),
         count(*) filter (where e->>'status' = 'pending' and e->>'archived_at' is null),
         count(*) filter (where e->>'status' = 'rejected'),
         count(*) filter (where e->>'medium' <> 'digital')
    into v_evid_total, v_evid_current, v_evid_pending, v_evid_rejected, v_evid_physical
    from jsonb_array_elements(v_evidences) e;
  v_findings := v_findings || jsonb_build_array(jsonb_build_object(
    'level', 'info', 'area', 'evidencias',
    'message', v_evid_total || ' evidencia(s) vinculada(s) a la cadena: ' || v_evid_current || ' aceptada(s) internamente y vigente(s), ' || v_evid_pending || ' pendiente(s), ' || v_evid_rejected || ' rechazada(s), ' || v_evid_physical || ' con soporte físico declarado.'));
  if v_evid_pending > 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'warning', 'area', 'evidencias',
      'message', v_evid_pending || ' evidencia(s) siguen pendientes de revisión interna.',
      'recommendation', 'Revisa y acepta internamente (o rechaza con motivo) antes de la auditoría.'));
  end if;
  if v_evid_rejected > 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'warning', 'area', 'evidencias',
      'message', v_evid_rejected || ' evidencia(s) rechazada(s): no cuentan como soporte vigente.',
      'recommendation', 'Sustituye el soporte rechazado por evidencia aceptable.'));
  end if;
  -- Brecha documental: un MATERIAL de la cadena sin evidencia vigente que lo
  -- soporte (directa sobre el material, o vía alguno de sus lotes de entrada).
  for r in select distinct m.name as mat_name
             from materials m
            where m.id = any(v_material_ids) loop
    if not exists (
         select 1 from jsonb_array_elements(v_evidences) e
          where (e->>'current')::boolean
            and ((e->>'target_type' = 'material' and position(r.mat_name in e->>'target_label') > 0)
              or (e->>'target_type' = 'input_batch' and (e->>'target_id')::uuid in (
                    select ib2.id from input_batches ib2
                      join materials m2 on m2.id = ib2.material_id
                     where ib2.id = any(v_input_ids) and m2.name = r.mat_name)))) then
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'level', 'gap', 'area', 'evidencias',
        'message', 'El material ' || r.mat_name || ' no tiene evidencia vigente de soporte vinculada.',
        'recommendation', 'Vincula y acepta internamente la evidencia de origen del material (Evidencias → Asociar).'));
    end if;
  end loop;

  v_req_total := (select count(*)::int from jsonb_array_elements(v_requirements));
  if v_req_total > 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'cliente',
      'message', v_req_total || ' acuerdo(s)/requisito(s) de cliente aplicables a la cadena.'));
    for r in select q->>'code' as code, q->>'customer_name' as cust
               from jsonb_array_elements(v_requirements) q where not (q->>'active')::boolean loop
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'level', 'info', 'area', 'cliente',
        'message', 'El requisito ' || r.code || ' (' || r.cust || ') está inactivo.'));
    end loop;
  else
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'cliente',
      'message', 'Sin acuerdos/requisitos de cliente registrados para esta cadena (dato opcional).'));
  end if;

  v_quality := (select count(*)::int from jsonb_array_elements(v_evidences) e
                 where e->>'evidence_type' in ('quality_control', 'non_conformity', 'customer_claim'));
  if v_quality > 0 then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'calidad',
      'message', v_quality || ' evidencia(s) de calidad / no conformidad / reclamación vinculadas.'));
  else
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'calidad',
      'message', 'Sin registros de calidad, NC o reclamaciones vinculados (dato opcional).'));
  end if;

  if v_calc is not null then
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'info', 'area', 'pcr',
      'message', 'Cálculo PCR disponible: ' || (v_calc->>'recycled_percent') || '% (según la metodología vigente).'));
    for r in select w.msg from jsonb_array_elements_text(v_calc->'warnings') as w(msg) loop
      v_findings := v_findings || jsonb_build_array(jsonb_build_object(
        'level', 'warning', 'area', 'pcr', 'message', 'Advertencia del cálculo: ' || r.msg));
    end loop;
  else
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'level', 'warning', 'area', 'pcr',
      'message', 'El lote no tiene cálculo de contenido reciclado disponible.',
      'recommendation', 'Ejecuta el cálculo en Contenido reciclado si el lote lo requiere.'));
  end if;

  v_gaps := (select count(*)::int from jsonb_array_elements(v_findings) f where f->>'level' = 'gap');
  v_warnings := (select count(*)::int from jsonb_array_elements(v_findings) f where f->>'level' = 'warning');
  v_result := case when v_gaps > 0 then 'incomplete'
                   when v_warnings > 0 then 'complete_with_warnings'
                   else 'complete' end;
  select count(distinct st->>'order') filter (where st->>'order' is not null),
         count(distinct ext->>'batch_code')
    into v_counts_orders, v_counts_external
    from jsonb_array_elements(v_chain) st
    left join lateral jsonb_array_elements(st->'external_inputs') ext on true;
  v_counts_internal := (select count(distinct ii->>'batch_code')::int
    from jsonb_array_elements(v_chain) st, jsonb_array_elements(st->'internal_inputs') ii);

  return jsonb_build_object(
    'schema_version', 'pcr_traceability_exercise_v1',
    'disclaimer', 'Este resultado corresponde a un ejercicio interno de preparación y no constituye una auditoría, certificación ni dictamen de conformidad.',
    'target', jsonb_build_object(
      'output_batch_id', p_output_batch_id,
      'batch_code', v_batch_code,
      'product_label', v_product_label,
      'produced_quantity_kg', trim_scale(v_produced),
      'organization_name', v_org_name),
    'chain', v_chain,
    'balances', v_balances,
    'evidences', v_evidences,
    'requirements', v_requirements,
    'calculation', v_calc,
    'findings', v_findings,
    'counts', jsonb_build_object(
      'orders', v_counts_orders,
      'external_batches', v_counts_external,
      'internal_batches', v_counts_internal,
      'suppliers', v_sup_names,
      'evidences', v_evid_total,
      'gaps', v_gaps,
      'warnings', v_warnings),
    'result', v_result);
end;
$$;

comment on function public.pcr_build_exercise_snapshot(uuid, uuid) is
  'PCR-03.2 (rev. 03.1–03.3.2) · Builder AUTORITATIVO de la fotografía pcr_traceability_exercise_v1: reconstruye cadena, saldos, evidencias, cliente, calidad, cálculo y observaciones DESDE la base de datos. Helper interno de la RPC: sin EXECUTE para clientes.';

revoke execute on function public.pcr_build_exercise_snapshot(uuid, uuid) from public, anon, authenticated;

-- Vía ÚNICA y CONTROLADA de completado (rev. 03.1–03.3.2): el llamador ya NO
-- aporta snapshot, resultado, conteos, hash ni fecha — solo dice QUÉ borrador
-- completar. La fotografía la construye la BD desde datos autoritativos; el
-- resultado y los conteos se derivan de ella; completed_at = now() y el
-- source_hash se calcula EN SERVIDOR sobre el jsonb almacenado (clave-ordenado
-- determinista). Membresía verificada con auth.uid(); patrón de flag 0084;
-- sin service_role.
create or replace function public.complete_traceability_exercise(
  p_exercise_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exercise public.traceability_exercises%rowtype;
  v_snapshot jsonb;
begin
  select * into v_exercise
    from public.traceability_exercises
   where id = p_exercise_id
   for update;
  if not found then
    raise exception 'El ejercicio no existe.' using errcode = '23514';
  end if;
  if not public.is_org_member(v_exercise.organization_id) then
    raise exception 'El ejercicio no pertenece a tu empresa.' using errcode = '42501';
  end if;
  if v_exercise.status <> 'draft' then
    raise exception 'El ejercicio finalizado es una fotografía histórica: no puede modificarse. Ejecuta un ejercicio nuevo para reflejar los cambios.'
      using errcode = '23514';
  end if;

  v_snapshot := public.pcr_build_exercise_snapshot(v_exercise.organization_id, v_exercise.output_batch_id);

  perform set_config('trazaloop.exercise_complete', 'on', true);
  update public.traceability_exercises
     set status         = 'completed',
         completed_at   = now(),
         result         = v_snapshot->>'result',
         snapshot       = v_snapshot,
         source_hash    = encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex'),
         gaps_count     = coalesce((v_snapshot->'counts'->>'gaps')::int, 0),
         warnings_count = coalesce((v_snapshot->'counts'->>'warnings')::int, 0)
   where id = p_exercise_id;
  perform set_config('trazaloop.exercise_complete', 'off', true);
  return p_exercise_id;
end;
$$;

comment on function public.complete_traceability_exercise(uuid) is
  'PCR-03.2 (rev. 03.1–03.3.2) · ÚNICA vía para completar un ejercicio: el cliente solo indica el borrador; la fotografía, el resultado, los conteos, completed_at y el source_hash son VERDAD-SERVIDOR (builder autoritativo pcr_build_exercise_snapshot). Flag transaccional interno (patrón 0084); sin service_role.';

revoke execute on function public.complete_traceability_exercise(uuid) from public, anon;
grant execute on function public.complete_traceability_exercise(uuid) to authenticated;

-- organization_id INMUTABLE (03.1–03.3.1, hallazgo 4; patrón 0024).
drop trigger if exists t_traceability_exercises_org_immutable on public.traceability_exercises;
create trigger t_traceability_exercises_org_immutable
  before update on public.traceability_exercises
  for each row execute function public.prevent_organization_id_change();

-- ----------------------------------------------------------------------------
-- §3 · RLS multiempresa (patrón existente)
-- ----------------------------------------------------------------------------
alter table public.traceability_exercises enable row level security;

create policy traceability_exercises_select on public.traceability_exercises
  for select to authenticated using (public.is_org_member(organization_id));
create policy traceability_exercises_insert on public.traceability_exercises
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy traceability_exercises_update on public.traceability_exercises
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
create policy traceability_exercises_delete on public.traceability_exercises
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin', 'quality']));

-- ----------------------------------------------------------------------------
-- §4 · Verificaciones manuales (resumen)
-- ----------------------------------------------------------------------------
--   insert directo con status='completed' o con snapshot → rechazado.
--   select complete_traceability_exercise('<draft>') → la BD construye la fotografía → ok.
--   update de un completed (p. ej. snapshot o notes) → 'El ejercicio
--   finalizado es una fotografía histórica…'.
--   update completed → archived (solo status) → ok.
--   delete de un completed → 'El ejercicio finalizado forma parte del
--   historial…'.
--   select bajo authenticated de otra empresa → 0 filas (RLS).
