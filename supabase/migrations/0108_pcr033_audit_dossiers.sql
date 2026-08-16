-- ============================================================================
-- 0108_pcr033_audit_dossiers.sql · Sprint PCR-03.3
-- ============================================================================
-- EXPEDIENTE INTERNO DE PREPARACIÓN PARA AUDITORÍA por lote producido/final:
-- consolida en un snapshot CONGELADO y VERSIONADO (schema
-- pcr_audit_dossier_v1) la identificación, genealogía, balances, cálculo
-- PCR, matriz de evidencias, cliente, calidad, ejercicio pre-auditoría y
-- brechas. NO es un certificado ni un informe de auditor externo: el
-- disclaimer viaja dentro del propio snapshot.
--
-- Versionamiento: cada generación crea una VERSIÓN nueva (org, lote,
-- versión) — jamás se sobrescribe la anterior. Código legible
-- EXP-PCR-AAAA-NNNN único por organización.
--
-- Sin transaction control propio (regla PCR-02.5.2); compatible con la
-- transacción del runner (Supabase CLI / psql --single-transaction). Sin
-- CREATE INDEX CONCURRENTLY, VACUUM, ALTER SYSTEM ni CREATE/DROP DATABASE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 · Tabla de expedientes (7.1/7.3/7.4)
-- ----------------------------------------------------------------------------
create table if not exists public.audit_dossiers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  output_batch_id uuid not null,
  exercise_id     uuid,
  dossier_code    text not null,
  version         integer not null default 1,
  status          text not null default 'generated',
  generated_at    timestamptz not null default now(),
  generated_by    uuid references public.profiles (id),
  snapshot        jsonb not null,
  schema_version  text not null default 'pcr_audit_dossier_v1',
  source_hash     text,
  gaps_count      integer not null default 0,
  warnings_count  integer not null default 0,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint audit_dossiers_org_id_uniq unique (organization_id, id),
  -- (rev. 03.1–03.3.2, hallazgo 5) Los conteos jamás son negativos.
  constraint audit_dossiers_counts_check
    check (gaps_count >= 0 and warnings_count >= 0),
  constraint audit_dossiers_org_code_uniq unique (organization_id, dossier_code),
  constraint audit_dossiers_org_batch_version_uniq unique (organization_id, output_batch_id, version),
  constraint audit_dossiers_status_check check (status in ('generated', 'archived')),
  constraint audit_dossiers_version_check check (version >= 1),
  -- FK compuestas: lote y ejercicio de la MISMA organización; RESTRICT: el
  -- histórico documental jamás desaparece en cascada.
  constraint audit_dossiers_output_batch_fk
    foreign key (organization_id, output_batch_id)
    references public.output_batches (organization_id, id)
    on delete restrict,
  constraint audit_dossiers_exercise_fk
    foreign key (organization_id, exercise_id)
    references public.traceability_exercises (organization_id, id)
    on delete restrict
);

comment on table public.audit_dossiers is
  'PCR-03.3 · Expediente interno de preparación para auditoría: snapshot versionado y congelado por lote producido/final (pcr_audit_dossier_v1). No constituye certificación, auditoría externa ni declaración de conformidad.';
comment on column public.audit_dossiers.dossier_code is
  'PCR-03.3 · Código legible EXP-PCR-AAAA-NNNN, único por organización.';
comment on column public.audit_dossiers.snapshot is
  'PCR-03.3 · Contenido A–K congelado (portada, resumen, genealogía, balances, cálculo, evidencias SIN signed URLs, cliente, calidad, ejercicio, brechas, disclaimer).';

create index if not exists audit_dossiers_org_batch_idx
  on public.audit_dossiers (organization_id, output_batch_id, version desc);
create index if not exists audit_dossiers_org_status_idx
  on public.audit_dossiers (organization_id, status, generated_at desc);
create index if not exists audit_dossiers_org_exercise_idx
  on public.audit_dossiers (organization_id, exercise_id);

create trigger t_audit_dossiers_updated
  before update on public.audit_dossiers
  for each row execute function public.set_updated_at();

create trigger t_audit_dossiers_force_created_by
  before insert on public.audit_dossiers
  for each row execute function public.force_created_by();

create trigger t_audit_dossiers_audit
  after insert or update or delete on public.audit_dossiers
  for each row execute function public.audit_row_change();

-- ----------------------------------------------------------------------------
-- §2 · Inmutabilidad (7.3): generado = congelado; solo generated → archived
-- ----------------------------------------------------------------------------
create or replace function public.audit_dossiers_immutability_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('generated', 'archived') then
    if (to_jsonb(new) - 'status' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'updated_at') then
      raise exception 'El expediente generado es una versión histórica: no puede modificarse. Genera una versión nueva para reflejar los cambios.'
        using errcode = '23514';
    end if;
    if new.status is distinct from old.status and new.status <> 'archived' then
      raise exception 'Un expediente generado solo puede archivarse.'
        using errcode = '23514';
    end if;
    -- (rev. 03.1–03.3.2, hallazgo 3) Archivar es acción reservada TAMBIÉN en
    -- BD: la policy de UPDATE alcanza a cualquier miembro, así que el trigger
    -- exige el rol frente a un UPDATE directo vía REST.
    if new.status = 'archived' and old.status = 'generated'
       and not public.has_org_role(new.organization_id, array['admin', 'quality']) then
      raise exception 'Solo administrador o calidad pueden archivar expedientes.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.audit_dossiers_immutability_guard() is
  'PCR-03.3 · Cada versión del expediente queda CONGELADA: solo la transición pura generated→archived. SECURITY INVOKER.';

revoke execute on function public.audit_dossiers_immutability_guard() from public, anon, authenticated;

drop trigger if exists t_audit_dossiers_immutability on public.audit_dossiers;
create trigger t_audit_dossiers_immutability
  before update on public.audit_dossiers
  for each row execute function public.audit_dossiers_immutability_guard();

create or replace function public.audit_dossiers_protect_delete()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'El expediente forma parte del historial de preparación y no puede eliminarse. Archívalo si ya no aplica.'
    using errcode = '23514';
end;
$$;

comment on function public.audit_dossiers_protect_delete() is
  'PCR-03.3 · Sin DELETE destructivo: los expedientes se archivan, jamás se eliminan.';

revoke execute on function public.audit_dossiers_protect_delete() from public, anon, authenticated;

drop trigger if exists t_audit_dossiers_protect_delete on public.audit_dossiers;
create trigger t_audit_dossiers_protect_delete
  before delete on public.audit_dossiers
  for each row execute function public.audit_dossiers_protect_delete();

-- ----------------------------------------------------------------------------
-- §2b · El expediente NO puede fabricarse (03.1–03.3.1, hallazgos 6 y 9)
-- ----------------------------------------------------------------------------
-- Sin la RPC, cualquier miembro insertaría vía REST un 'generated' con
-- snapshot/hash/código/versión arbitrarios. Defensa en BD (patrón de flag
-- transaccional 0084): TODO insert exige el flag que solo enciende la RPC
-- generate_audit_dossier — incluso un admin fuera del flujo queda vetado.
-- La RPC además: (a) reserva la generación a admin/quality (roles 7.7);
-- (b) asigna versión y código EXP-PCR-AAAA-NNNN de forma ATÓMICA bajo
-- candados advisory por (org, lote) y (org, año) — dos generaciones
-- simultáneas obtienen versiones consecutivas sin chocar (hallazgo 9);
-- (c) sella generated_by=auth.uid(), generated_at=now() y calcula el
-- source_hash EN SERVIDOR sobre el jsonb almacenado; (d) inyecta el
-- código/versión/sellos de verdad-servidor dentro de la portada del
-- snapshot (rev. 03.1–03.3.2+: el CONTENIDO también es verdad-servidor —
-- se construye desde el ejercicio completado — y el servidor la IDENTIDAD).
create or replace function public.audit_dossiers_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('trazaloop.dossier_generate', true), 'off') <> 'on' then
    raise exception 'Los expedientes solo se generan desde «Generar expediente» (administrador o calidad).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.audit_dossiers_insert_guard() is
  'PCR-03.3 (rev. 03.1–03.3.1) · Ningún INSERT directo: los expedientes nacen únicamente dentro de la RPC generate_audit_dossier (flag transaccional, patrón 0084).';

revoke execute on function public.audit_dossiers_insert_guard() from public, anon, authenticated;

drop trigger if exists t_audit_dossiers_insert_guard on public.audit_dossiers;
create trigger t_audit_dossiers_insert_guard
  before insert on public.audit_dossiers
  for each row execute function public.audit_dossiers_insert_guard();

create or replace function public.generate_audit_dossier(
  p_output_batch_id uuid,
  p_exercise_id     uuid default null
)
returns table (dossier_id uuid, dossier_code text, dossier_version integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_batch_code text;
  v_product_label text;
  v_produced numeric;
  v_org_name text;
  v_exercise public.traceability_exercises%rowtype;
  v_ex_snap jsonb;
  v_year int := extract(year from now())::int;
  v_seq int;
  v_version int;
  v_code text;
  v_actor uuid := auth.uid();
  v_actor_email text;
  v_snapshot jsonb;
  v_id uuid;
  v_gaps int;
  v_warnings int;
  v_duration int;
begin
  select ob.organization_id, ob.batch_code, ob.produced_quantity_kg,
         case when p.code is not null then p.code || ' · ' || p.name end
    into v_org, v_batch_code, v_produced, v_product_label
    from public.output_batches ob
    left join public.products p on p.id = ob.product_id
   where ob.id = p_output_batch_id;
  if v_org is null then
    raise exception 'El lote no existe.' using errcode = '23514';
  end if;
  -- Generación RESERVADA (7.7): administrador o calidad de ESA empresa.
  if not public.has_org_role(v_org, array['admin', 'quality']) then
    raise exception 'Solo administrador o calidad pueden generar expedientes.'
      using errcode = '42501';
  end if;

  -- (rev. 03.1–03.3.2, hallazgo 2) El CONTENIDO del expediente ya no lo
  -- declara el llamador: se construye AQUÍ desde el ejercicio COMPLETADO e
  -- INMUTABLE (que tras el hallazgo 1 es a su vez autoritativo) más los
  -- datos reales del lote/empresa. Sin ejercicio completado no hay
  -- expediente: preferimos integridad a conveniencia.
  if p_exercise_id is not null then
    select * into v_exercise
      from public.traceability_exercises te
     where te.id = p_exercise_id;
    if not found
       or v_exercise.organization_id <> v_org
       or v_exercise.output_batch_id <> p_output_batch_id
       or v_exercise.status not in ('completed', 'archived')
       or v_exercise.snapshot is null then
      raise exception 'El ejercicio asociado no es un ejercicio completado de este lote.'
        using errcode = '23514';
    end if;
  else
    select * into v_exercise
      from public.traceability_exercises te
     where te.organization_id = v_org
       and te.output_batch_id = p_output_batch_id
       and te.status = 'completed'
       and te.snapshot is not null
     order by te.completed_at desc
     limit 1;
    if not found then
      raise exception 'Ejecuta primero un ejercicio de trazabilidad para generar el expediente.'
        using errcode = '23514';
    end if;
  end if;
  v_ex_snap := v_exercise.snapshot;

  select o.name into v_org_name from public.organizations o where o.id = v_org;
  select pr.email into v_actor_email from public.profiles pr where pr.id = v_actor;

  -- Asignación ATÓMICA de versión y secuencia (candados por transacción).
  perform pg_advisory_xact_lock(hashtextextended('trazaloop.dossier.version.' || v_org::text || '.' || p_output_batch_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('trazaloop.dossier.code.' || v_org::text || '.' || v_year::text, 0));
  select coalesce(max(ad.version), 0) + 1 into v_version
    from public.audit_dossiers ad
   where ad.organization_id = v_org and ad.output_batch_id = p_output_batch_id;
  select coalesce(max(nullif(substring(ad.dossier_code from '^EXP-PCR-\d{4}-(\d{4})$'), '')::int), 0) + 1
    into v_seq
    from public.audit_dossiers ad
   where ad.organization_id = v_org
     and ad.dossier_code like 'EXP-PCR-' || v_year || '-%';
  v_code := 'EXP-PCR-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  v_gaps     := coalesce((v_ex_snap->'counts'->>'gaps')::int, 0);
  v_warnings := coalesce((v_ex_snap->'counts'->>'warnings')::int, 0);
  v_duration := case
    when v_exercise.started_at is not null and v_exercise.completed_at is not null
    then greatest(1, round(extract(epoch from (v_exercise.completed_at - v_exercise.started_at)))::int)
    end;

  -- Secciones A–K (contrato pcr_audit_dossier_v1 que consume la UI), TODAS
  -- de fuentes autoritativas: identidad y sellos del servidor, contenido del
  -- ejercicio congelado, disclaimer literal.
  v_snapshot := jsonb_build_object(
    'schema_version', 'pcr_audit_dossier_v1',
    'cover', jsonb_build_object(
      'organization_name', v_org_name,
      'batch_code', v_batch_code,
      'product_label', v_product_label,
      'dossier_code', v_code,
      'version', v_version,
      'generated_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'generated_by_email', v_actor_email),
    'summary', jsonb_build_object(
      'exercise_result', v_ex_snap->'result',
      'produced_quantity_kg', trim_scale(v_produced),
      'orders', coalesce((v_ex_snap->'counts'->>'orders')::int, 0),
      'external_batches', coalesce((v_ex_snap->'counts'->>'external_batches')::int, 0),
      'internal_batches', coalesce((v_ex_snap->'counts'->>'internal_batches')::int, 0),
      'suppliers', coalesce((v_ex_snap->'counts'->>'suppliers')::int, 0),
      'evidences', coalesce((v_ex_snap->'counts'->>'evidences')::int, 0),
      'gaps', v_gaps,
      'warnings', v_warnings),
    'genealogy', coalesce(v_ex_snap->'chain', '[]'::jsonb),
    'balances', coalesce(v_ex_snap->'balances',
      jsonb_build_object('input_batches', '[]'::jsonb, 'output_batches', '[]'::jsonb)),
    'calculation', v_ex_snap->'calculation',
    'evidences', coalesce(v_ex_snap->'evidences', '[]'::jsonb),
    'requirements', coalesce(v_ex_snap->'requirements', '[]'::jsonb),
    'quality_evidences', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(v_ex_snap->'evidences') e
       where e->>'evidence_type' in ('quality_control', 'non_conformity', 'customer_claim')), '[]'::jsonb),
    'exercise', jsonb_build_object(
      'exercise_id', v_exercise.id,
      'started_at', v_exercise.started_at,
      'completed_at', v_exercise.completed_at,
      'duration_seconds', v_duration,
      'result', v_exercise.result,
      'source_hash', v_exercise.source_hash),
    'findings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'severity', f->>'level',
               'source', f->>'area',
               'message', f->>'message',
               'recommendation', f->'recommendation'))
        from jsonb_array_elements(v_ex_snap->'findings') f), '[]'::jsonb),
    'disclaimer', 'Este expediente consolida información registrada en Trazaloop para apoyar la preparación interna de la empresa. No constituye una certificación, auditoría externa, declaración de conformidad ni aprobación de un organismo evaluador.');

  perform set_config('trazaloop.dossier_generate', 'on', true);
  insert into public.audit_dossiers (
    organization_id, output_batch_id, exercise_id, dossier_code, version,
    status, generated_at, generated_by, snapshot, source_hash,
    gaps_count, warnings_count
  ) values (
    v_org, p_output_batch_id, v_exercise.id, v_code, v_version,
    'generated', now(), v_actor, v_snapshot,
    encode(sha256(convert_to(v_snapshot::text, 'UTF8')), 'hex'),
    v_gaps, v_warnings
  ) returning id into v_id;
  perform set_config('trazaloop.dossier_generate', 'off', true);

  return query select v_id, v_code, v_version;
end;
$$;

comment on function public.generate_audit_dossier(uuid, uuid) is
  'PCR-03.3 (rev. 03.1–03.3.2) · ÚNICA vía para generar expedientes y con CONTENIDO verdad-servidor: exige un ejercicio de trazabilidad COMPLETADO (autoritativo tras la rev.) y construye las secciones A–K desde él y desde los datos reales del lote/empresa. Rol admin/quality verificado en BD; versión y código EXP-PCR atómicos (advisory locks); sellos generated_by/at y source_hash de servidor. Flag transaccional (patrón 0084); sin service_role.';

revoke execute on function public.generate_audit_dossier(uuid, uuid) from public, anon;
grant execute on function public.generate_audit_dossier(uuid, uuid) to authenticated;

-- organization_id INMUTABLE (03.1–03.3.1, hallazgo 4; patrón 0024).
drop trigger if exists t_audit_dossiers_org_immutable on public.audit_dossiers;
create trigger t_audit_dossiers_org_immutable
  before update on public.audit_dossiers
  for each row execute function public.prevent_organization_id_change();

-- ----------------------------------------------------------------------------
-- §3 · RLS multiempresa (patrón existente)
-- ----------------------------------------------------------------------------
alter table public.audit_dossiers enable row level security;

create policy audit_dossiers_select on public.audit_dossiers
  for select to authenticated using (public.is_org_member(organization_id));
create policy audit_dossiers_insert on public.audit_dossiers
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy audit_dossiers_update on public.audit_dossiers
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
-- Sin política de DELETE: nadie elimina expedientes (el trigger además lo
-- veta para el propietario de la tabla).

-- ----------------------------------------------------------------------------
-- §4 · Verificaciones manuales (resumen)
-- ----------------------------------------------------------------------------
--   insert directo (aun como admin) → 'Los expedientes solo se generan…'.
--   select * from generate_audit_dossier('<lote>')  -- contenido desde el ejercicio completado
--     con admin → v1; segunda llamada → v2; con consultant → 42501.
--   update de snapshot de un generated → 'El expediente generado es una
--   versión histórica…'; generated → archived (solo status) → ok.
--   delete → 'El expediente forma parte del historial…'.
--   select bajo authenticated de otra empresa → 0 filas (RLS).
