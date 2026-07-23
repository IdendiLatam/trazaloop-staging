-- Trazaloop · T9F.2 · Pruebas de humo LOCALES sobre 0101 (tras shims.sql +
-- resolve-from-0100.sql + 0101). psql -v ON_ERROR_STOP=1. Cada bloque valida
-- una expectativa CONCRETA con raise exception en caso de fallo.

\set ON_ERROR_STOP on

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into modules (code, is_functional) values
  ('traceability_6632', true), ('textiles', true), ('quality', false);

insert into plan_limits (plan_code, resource_code, limit_value, is_unlimited) values
  ('demo', 'suppliers', 1, false),
  ('demo', 'materials', 5, false),
  ('demo', 'evidences', 1, false),
  ('full', 'suppliers', null, true),
  ('extra', 'suppliers', null, true);

-- Usuarios simulados
select set_config('app.super', gen_random_uuid()::text, false);
select set_config('app.member', gen_random_uuid()::text, false);

insert into platform_staff (user_id, role_code, status)
  values (current_setting('app.super')::uuid, 'superadmin', 'active');

insert into organizations (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'QA Local A'),
  ('22222222-2222-2222-2222-222222222222', 'QA Local B');

insert into memberships (organization_id, user_id) values
  ('11111111-1111-1111-1111-111111111111', current_setting('app.member')::uuid);

-- ── 1. RPC: transición real + idempotencia (sin UPDATE, sin auditoría) ─────
select set_config('app.uid', current_setting('app.super'), false);

do $$
declare r1 jsonb; r2 jsonb; n int; t1 timestamptz; t2 timestamptz;
begin
  r1 := set_organization_module_access('11111111-1111-1111-1111-111111111111', 'textiles', 'full');
  if (r1->>'changed')::boolean is distinct from true then
    raise exception 'transición real debía devolver changed=true: %', r1;
  end if;
  select updated_at into t1 from organization_modules
   where organization_id = '11111111-1111-1111-1111-111111111111' and module_code = 'textiles';

  r2 := set_organization_module_access('11111111-1111-1111-1111-111111111111', 'textiles', 'full');
  if (r2->>'changed')::boolean is distinct from false then
    raise exception 'no-op debía devolver changed=false: %', r2;
  end if;
  select updated_at into t2 from organization_modules
   where organization_id = '11111111-1111-1111-1111-111111111111' and module_code = 'textiles';
  if t1 is distinct from t2 then
    raise exception 'el no-op modificó updated_at (% -> %)', t1, t2;
  end if;

  select count(*) into n from audit_log
   where organization_id = '11111111-1111-1111-1111-111111111111'
     and event_type = 'organization_module_access_changed';
  if n <> 1 then
    raise exception 'debía existir exactamente 1 evento de auditoría, hay %', n;
  end if;
end $$;

-- Módulo no funcional y estado arbitrario: rechazados
do $$
begin
  begin
    perform set_organization_module_access('11111111-1111-1111-1111-111111111111', 'quality', 'full');
    raise exception 'quality debía ser rechazado';
  exception when others then
    if sqlerrm not like '%no está disponible%' then raise; end if;
  end;
  begin
    perform set_organization_module_access('11111111-1111-1111-1111-111111111111', 'textiles', 'premium');
    raise exception 'premium debía ser rechazado';
  exception when others then
    if sqlerrm not like '%no válido%' then raise; end if;
  end;
end $$;

-- No superadmin: rechazado
select set_config('app.uid', current_setting('app.member'), false);
do $$
begin
  begin
    perform set_organization_module_access('11111111-1111-1111-1111-111111111111', 'textiles', 'extra');
    raise exception 'un miembro no superadmin debía ser rechazado';
  exception when others then
    if sqlerrm not like '%superadministrador%' then raise; end if;
  end;
end $$;

-- ── 2. Vista: deduplicación física, versiones, huérfanos y conflictos ───────
-- CPR de Org A: evidencia 10 MB + documento 10 MB cuya ruta actual TAMBIÉN es
-- la versión v3 (mismo objeto: cuenta una vez) + versiones v1/v2 con rutas
-- históricas distintas (cuentan) + huérfano registrado.
insert into evidences (organization_id, storage_path, size_bytes) values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/ev1/a.pdf', 10485760);
insert into trazadoc_file_documents (id, organization_id, storage_path, size_bytes) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/doc/v3.pdf', 10485760);
insert into trazadoc_file_document_versions (organization_id, file_document_id, version_number, storage_path, size_bytes) values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 1, '11111111-1111-1111-1111-111111111111/doc/v1.pdf', 10485760),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 2, '11111111-1111-1111-1111-111111111111/doc/v2.pdf', 10485760),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 3, '11111111-1111-1111-1111-111111111111/doc/v3.pdf', 10485760);
-- Huérfano CPR (retiro físico pendiente): sigue contando (1 MB)
select set_config('app.uid', current_setting('app.member'), false);
select register_storage_orphan('11111111-1111-1111-1111-111111111111', 'traceability_6632',
                               'trazadocs-documents', '11111111-1111-1111-1111-111111111111/doc/old-orphan.pdf', 1048576);
-- Textil de Org A: 2 MB (no debe cruzar a CPR)
insert into textile_evidences (organization_id, file_path, file_size_bytes) values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111/textiles/x/e.pdf', 2097152);

do $$
declare cpr record; tex record;
begin
  select storage_used_bytes, storage_object_conflicts, evidences_count into cpr
    from v_organization_module_usage
   where organization_id = '11111111-1111-1111-1111-111111111111' and module_code = 'traceability_6632';
  -- Esperado CPR: ev(10) + doc v3(10, deduplicado con la versión 3) +
  -- v1(10) + v2(10) + huérfano(1) = 41 MB exactos; 0 conflictos.
  if cpr.storage_used_bytes <> 42991616 then
    raise exception 'CPR debía sumar 41 MB (42991616), sumó %', cpr.storage_used_bytes;
  end if;
  if cpr.storage_object_conflicts <> 0 then
    raise exception 'CPR no debía tener conflictos, tiene %', cpr.storage_object_conflicts;
  end if;
  if cpr.evidences_count <> 1 then
    raise exception 'CPR debía contar 1 evidencia, contó %', cpr.evidences_count;
  end if;

  select storage_used_bytes into tex
    from v_organization_module_usage
   where organization_id = '11111111-1111-1111-1111-111111111111' and module_code = 'textiles';
  if tex.storage_used_bytes <> 2097152 then
    raise exception 'Textiles debía sumar 2 MB, sumó %', tex.storage_used_bytes;
  end if;
end $$;

-- Conflicto de tamaños: la MISMA ruta con size distinto → máximo + conflicto=1
update trazadoc_file_documents set size_bytes = 5242880
 where id = '33333333-3333-3333-3333-333333333333'; -- actual dice 5 MB, la versión v3 dice 10 MB
do $$
declare cpr record;
begin
  select storage_used_bytes, storage_object_conflicts into cpr
    from v_organization_module_usage
   where organization_id = '11111111-1111-1111-1111-111111111111' and module_code = 'traceability_6632';
  if cpr.storage_object_conflicts <> 1 then
    raise exception 'debía detectarse exactamente 1 conflicto, hay %', cpr.storage_object_conflicts;
  end if;
  -- El uso toma el MÁXIMO (10 MB) para ese objeto: total sigue en 41 MB.
  if cpr.storage_used_bytes <> 42991616 then
    raise exception 'con conflicto el uso debía tomar el máximo (41 MB), sumó %', cpr.storage_used_bytes;
  end if;
end $$;
update trazadoc_file_documents set size_bytes = 10485760
 where id = '33333333-3333-3333-3333-333333333333';

-- Aislamiento: un miembro de A no ve filas de B ni B las de A (guarda embebida)
do $$
declare n int;
begin
  select count(*) into n from v_organization_module_usage
   where organization_id = '22222222-2222-2222-2222-222222222222';
  if n <> 0 then raise exception 'el miembro de A no debía ver uso de B (vio % filas)', n; end if;
end $$;

-- ── 3. Allowance: límites Demo con incremento, verificado y fail-closed ─────
select set_config('app.uid', current_setting('app.super'), false);
select set_organization_module_access('11111111-1111-1111-1111-111111111111', 'textiles', 'demo_permanent')
  \gset ignored_
select set_config('app.uid', current_setting('app.member'), false);

do $$
declare r jsonb;
begin
  -- Demo textiles, 0 proveedores: crear 1 permitido; crear 2 excede (límite 1)
  r := check_module_resource_allowance('11111111-1111-1111-1111-111111111111', 'textiles', 'suppliers', 1);
  if (r->>'verified')::boolean is not true or (r->>'allowed')::boolean is not true then
    raise exception 'con 0/1 debía permitir 1: %', r;
  end if;
  r := check_module_resource_allowance('11111111-1111-1111-1111-111111111111', 'textiles', 'suppliers', 2);
  if (r->>'allowed')::boolean is not false or (r->>'reason') <> 'limit_exceeded' then
    raise exception 'incremento 2 sobre límite 1 debía exceder: %', r;
  end if;

  insert into textile_suppliers (organization_id, name)
    values ('11111111-1111-1111-1111-111111111111', 'p1');
  r := check_module_resource_allowance('11111111-1111-1111-1111-111111111111', 'textiles', 'suppliers', 1);
  if (r->>'allowed')::boolean is not false then
    raise exception 'con 1/1 no debía permitir otro: %', r;
  end if;
  if (r->>'current_count')::int <> 1 or (r->>'limit_value')::int <> 1 then
    raise exception 'conteo/límite inesperados: %', r;
  end if;

  -- Recurso sin límite en catálogo → permitido (no_limit); incremento inválido → no verificado
  r := check_module_resource_allowance('11111111-1111-1111-1111-111111111111', 'textiles', 'products', 1);
  if (r->>'reason') <> 'no_limit' then raise exception 'products sin límite debía ser no_limit: %', r; end if;
  r := check_module_resource_allowance('11111111-1111-1111-1111-111111111111', 'textiles', 'suppliers', 0);
  if (r->>'verified')::boolean is not false then raise exception 'incremento 0 debía ser no verificado: %', r; end if;

  -- Módulo deshabilitado → verificado y NO permitido
end $$;

select set_config('app.uid', current_setting('app.super'), false);
select set_organization_module_access('11111111-1111-1111-1111-111111111111', 'textiles', 'disabled') \gset ignored2_
select set_config('app.uid', current_setting('app.member'), false);
do $$
declare r jsonb;
begin
  r := check_module_resource_allowance('11111111-1111-1111-1111-111111111111', 'textiles', 'suppliers', 1);
  if (r->>'verified')::boolean is not true or (r->>'allowed')::boolean is not false or (r->>'reason') <> 'disabled' then
    raise exception 'módulo deshabilitado debía bloquear verificado: %', r;
  end if;
  -- Full: ilimitado
end $$;
select set_config('app.uid', current_setting('app.super'), false);
select set_organization_module_access('11111111-1111-1111-1111-111111111111', 'textiles', 'full') \gset ignored3_
select set_config('app.uid', current_setting('app.member'), false);
do $$
declare r jsonb;
begin
  r := check_module_resource_allowance('11111111-1111-1111-1111-111111111111', 'textiles', 'suppliers', 1000);
  if (r->>'reason') <> 'unlimited' then raise exception 'Full debía ser ilimitado: %', r; end if;
  -- No miembro de la organización B: decisión negativa verificada (not_member)
  r := check_module_resource_allowance('22222222-2222-2222-2222-222222222222', 'textiles', 'suppliers', 1);
  if (r->>'allowed')::boolean is not false then raise exception 'no-miembro debía ser bloqueado: %', r; end if;
end $$;

select 'SMOKE T9F.2 · TODO EN VERDE' as resultado;
