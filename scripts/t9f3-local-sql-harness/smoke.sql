-- Trazaloop · T9F.3 · SMOKE REAL sobre PG local (tras shims + 0101).
-- Ejecuta las superficies NUEVAS de 0101: triggers de límite (incluida la
-- atomicidad multi-fila), reservas begin/finalize, idempotencia, expiración,
-- tamaños desconocidos, ciclo pending_delete y funciones server-only.
-- Cada comprobación termina en OK/FAIL; el resumen final exige TODO EN VERDE.

\set ON_ERROR_STOP on
set search_path = public;

create temp table r (id text, ok boolean, note text);
grant select, insert on r to authenticated;

-- ── Semillas ────────────────────────────────────────────────────────────────
insert into modules (code, is_functional) values
  ('core', false), ('traceability_6632', true), ('textiles', true)
on conflict do nothing;
insert into plan_limits (plan_code, resource_code, limit_value, is_unlimited) values
  ('demo', 'suppliers', 1, false), ('demo', 'evidences', 1, false),
  ('demo', 'documents_trazadocs', 2, false),
  ('full', 'suppliers', null, true), ('full', 'evidences', null, true),
  ('extra', 'suppliers', null, true), ('extra', 'evidences', null, true)
on conflict do nothing;

insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2');

-- Org A: CPR demo vigente + Textiles demo vigente.
insert into organizations (id, name) values ('11111111-0000-4000-8000-000000000001', 'T9F3 A');
insert into organization_modules (organization_id, module_code, enabled, access_mode, access_expires_at) values
  ('11111111-0000-4000-8000-000000000001', 'traceability_6632', true, 'demo', now() + interval '2 days'),
  ('11111111-0000-4000-8000-000000000001', 'textiles', true, 'demo', now() + interval '2 days');
insert into memberships (organization_id, user_id, role_code, status) values
  ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'admin', 'active');

-- Org B: Textiles FULL (cuota 500 MB) para pruebas de bytes.
insert into organizations (id, name) values ('22222222-0000-4000-8000-000000000002', 'T9F3 B');
insert into organization_modules (organization_id, module_code, enabled, access_mode) values
  ('22222222-0000-4000-8000-000000000002', 'textiles', true, 'full'),
  ('22222222-0000-4000-8000-000000000002', 'traceability_6632', true, 'full');
insert into memberships (organization_id, user_id, role_code, status) values
  ('22222222-0000-4000-8000-000000000002', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'admin', 'active');

-- ── A · Trigger de límites (autoridad ante INSERT directo) ──────────────────
do $$
declare v text;
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  insert into suppliers (organization_id, name) values ('11111111-0000-4000-8000-000000000001', 'S1');
  insert into r values ('A1 primer proveedor demo entra', true, null);
  begin
    insert into suppliers (organization_id, name) values ('11111111-0000-4000-8000-000000000001', 'S2');
    insert into r values ('A2 segundo proveedor bloqueado', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('A2 segundo proveedor bloqueado', v = 'RESOURCE_LIMIT_EXCEEDED', v);
  end;
end $$;

-- A3 · Multi-fila = una transacción: el exceso revierte TODO (importación).
do $$
declare v text; n int;
begin
  delete from suppliers where organization_id = '11111111-0000-4000-8000-000000000001';
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  begin
    insert into suppliers (organization_id, name) values
      ('11111111-0000-4000-8000-000000000001', 'M1'),
      ('11111111-0000-4000-8000-000000000001', 'M2');
    insert into r values ('A3 importación atómica', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    execute 'reset role';
    select count(*) into n from suppliers where organization_id = '11111111-0000-4000-8000-000000000001';
    insert into r values ('A3 importación atómica (rollback total)', v = 'RESOURCE_LIMIT_EXCEEDED' and n = 0,
                          v || ' · filas=' || n);
  end;
end $$;

-- A4/A5 · Demo vencido y módulo deshabilitado: barrera en BD.
do $$
declare v text;
begin
  update organization_modules set access_expires_at = now() - interval '1 hour'
   where organization_id = '11111111-0000-4000-8000-000000000001' and module_code = 'traceability_6632';
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  begin
    insert into suppliers (organization_id, name) values ('11111111-0000-4000-8000-000000000001', 'SX');
    insert into r values ('A4 demo vencido bloquea', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('A4 demo vencido bloquea', v = 'MODULE_ACCESS_BLOCKED', v);
  end;
end $$;
do $$
declare v text;
begin
  update organization_modules set access_expires_at = null, enabled = false
   where organization_id = '11111111-0000-4000-8000-000000000001' and module_code = 'traceability_6632';
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  begin
    insert into suppliers (organization_id, name) values ('11111111-0000-4000-8000-000000000001', 'SY');
    insert into r values ('A5 deshabilitado bloquea', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('A5 deshabilitado bloquea', v = 'MODULE_ACCESS_BLOCKED', v);
  end;
  update organization_modules set enabled = true, access_mode = 'demo', access_expires_at = now() + interval '2 days'
   where organization_id = '11111111-0000-4000-8000-000000000001' and module_code = 'traceability_6632';
end $$;

-- A6 · Full = ilimitado (misma funcionalidad; solo difiere la cuota).
do $$
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  insert into suppliers (organization_id, name) values
    ('22222222-0000-4000-8000-000000000002', 'F1'),
    ('22222222-0000-4000-8000-000000000002', 'F2'),
    ('22222222-0000-4000-8000-000000000002', 'F3');
  insert into r select 'A6 full sin límite de unidades', count(*) = 3, count(*)::text
    from suppliers where organization_id = '22222222-0000-4000-8000-000000000002';
end $$;

-- A7 · trazadoc_documents por module_key (demo: 2 documentos CPR).
do $$
declare v text; n int;
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  insert into trazadoc_documents (organization_id, module_key) values
    ('11111111-0000-4000-8000-000000000001', 'cpr'),
    ('11111111-0000-4000-8000-000000000001', 'cpr');
  begin
    insert into trazadoc_documents (organization_id, module_key) values
      ('11111111-0000-4000-8000-000000000001', 'cpr');
    insert into r values ('A7 tercer documento CPR bloqueado', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('A7 tercer documento CPR bloqueado', v = 'RESOURCE_LIMIT_EXCEEDED', v);
  end;
end $$;

-- A8 · No-miembro: el trigger NO decide aislamiento (eso es RLS).
do $$
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a2', true);
  insert into suppliers (organization_id, name) values ('22222222-0000-4000-8000-000000000002', 'NM');
  insert into r values ('A8 no-miembro pasa el trigger (RLS lo negaría)', true, null);
exception when others then
  insert into r values ('A8 no-miembro pasa el trigger (RLS lo negaría)', false, sqlerrm);
end $$;

-- ── B · Reservas de begin ───────────────────────────────────────────────────
do $$
declare v text; j jsonb;
begin
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  j := begin_textile_evidence_upload_v2('11111111-0000-4000-8000-000000000001', 'a.pdf',
        4 * 1024 * 1024, 'application/pdf', jsonb_build_object('title', 'T', 'evidence_type', 'other'));
  insert into r values ('B1 begin reserva unidad y bytes', (j->>'reused') = 'false', j::text);
  begin
    perform begin_textile_evidence_upload_v2('11111111-0000-4000-8000-000000000001', 'b.pdf',
        4 * 1024 * 1024, 'application/pdf', jsonb_build_object('title', 'T', 'evidence_type', 'other'));
    insert into r values ('B2 segundo begin excede unidad', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('B2 segundo begin excede unidad', v = 'EVIDENCE_LIMIT_EXCEEDED', v);
  end;
end $$;

-- B3 · Idempotencia: misma clave ⇒ mismo intent, una sola reserva.
do $$
declare j1 jsonb; j2 jsonb; n int;
begin
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  j1 := begin_textile_evidence_upload_v2('22222222-0000-4000-8000-000000000002', 'k.pdf',
        1024 * 1024, 'application/pdf', jsonb_build_object('title', 'K', 'evidence_type', 'other'),
        30, 'clave-idem-1');
  j2 := begin_textile_evidence_upload_v2('22222222-0000-4000-8000-000000000002', 'k.pdf',
        1024 * 1024, 'application/pdf', jsonb_build_object('title', 'K', 'evidence_type', 'other'),
        30, 'clave-idem-1');
  select count(*) into n from textile_evidence_upload_intents
   where organization_id = '22222222-0000-4000-8000-000000000002' and status = 'pending';
  insert into r values ('B3 idempotencia de begin',
    (j1->>'intent_id') = (j2->>'intent_id') and (j2->>'reused') = 'true' and n = 1,
    'n=' || n);
end $$;

-- B4/B5 · Cuota: confirmado + RESERVADO + entrante <= cuota (Full 500 MB).
do $$
declare v text;
begin
  insert into textile_evidences (organization_id, file_path, file_size_bytes)
  values ('22222222-0000-4000-8000-000000000002',
          '22222222-0000-4000-8000-000000000002/textiles/seed/big.bin', 494 * 1024 * 1024);
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  begin
    perform begin_textile_evidence_upload_v2('22222222-0000-4000-8000-000000000002', 'c.pdf',
        10 * 1024 * 1024, 'application/pdf', jsonb_build_object('title', 'C', 'evidence_type', 'other'));
    insert into r values ('B4 begin sobre cuota rechazado', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('B4 begin sobre cuota rechazado', v = 'STORAGE_QUOTA_EXCEEDED', v);
  end;
  -- 494 comprometidos + 1 reservado (B3) + 4 entrantes <= 500 → cabe.
  perform begin_textile_evidence_upload_v2('22222222-0000-4000-8000-000000000002', 'd.pdf',
      4 * 1024 * 1024, 'application/pdf', jsonb_build_object('title', 'D', 'evidence_type', 'other'));
  insert into r values ('B5a begin dentro de cuota con reservas', true, null);
  begin
    -- 494 + 5 reservados + 2 > 500 → las RESERVAS cuentan.
    perform begin_textile_evidence_upload_v2('22222222-0000-4000-8000-000000000002', 'e.pdf',
        2 * 1024 * 1024, 'application/pdf', jsonb_build_object('title', 'E', 'evidence_type', 'other'));
    insert into r values ('B5b reservas activas comprometen cuota', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('B5b reservas activas comprometen cuota', v = 'STORAGE_QUOTA_EXCEEDED', v);
  end;
end $$;

-- B6 · Vencimiento libera SIN cron; B7 · cancelación libera.
do $$
declare j jsonb;
begin
  update textile_evidence_upload_intents
     set expires_at = now() - interval '1 minute', created_at = now() - interval '10 minutes'
   where organization_id = '22222222-0000-4000-8000-000000000002'
     and original_filename = 'd.pdf' and status = 'pending';
  -- T9F.4: el vencido deja de reservar la UNIDAD pero sus bytes SIGUEN
  -- contando hasta resolución confirmada — aquí el barrido server-only
  -- confirma el retiro (record → 'expired') antes de la nueva reserva.
  perform record_textile_upload_intent_cleanup(i.id, true)
     from (select id from textile_evidence_upload_intents
            where organization_id = '22222222-0000-4000-8000-000000000002'
              and original_filename = 'd.pdf' and status = 'pending') i;
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  j := begin_textile_evidence_upload_v2('22222222-0000-4000-8000-000000000002', 'f.pdf',
      4 * 1024 * 1024, 'application/pdf', jsonb_build_object('title', 'F', 'evidence_type', 'other'));
  insert into r values ('B6 intent vencido deja de reservar', (j->>'reused') = 'false', null);
  perform set_config('app.uid', '', true);
  update textile_evidence_upload_intents set status = 'failed'
   where organization_id = '22222222-0000-4000-8000-000000000002'
     and original_filename in ('f.pdf', 'k.pdf') and status = 'pending';
  -- T9F.4: un failed sin resolver sigue contando (Bloqueador 5); el barrido
  -- server-only confirma el retiro antes de reservar de nuevo.
  perform record_textile_upload_intent_cleanup(i.id, true)
     from (select id from textile_evidence_upload_intents
            where organization_id = '22222222-0000-4000-8000-000000000002'
              and original_filename in ('f.pdf', 'k.pdf') and status = 'failed') i;
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  perform begin_textile_evidence_upload_v2('22222222-0000-4000-8000-000000000002', 'g.pdf',
      5 * 1024 * 1024, 'application/pdf', jsonb_build_object('title', 'G', 'evidence_type', 'other'));
  insert into r values ('B7 cancelación libera reserva', true, null);
end $$;

-- B8 · Tamaño DESCONOCIDO bloquea nuevas cargas (jamás cuenta cero).
do $$
declare v text;
begin
  insert into textile_evidences (organization_id, file_path, file_size_bytes)
  values ('22222222-0000-4000-8000-000000000002',
          '22222222-0000-4000-8000-000000000002/textiles/seed/unk.bin', null);
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  begin
    perform begin_textile_evidence_upload_v2('22222222-0000-4000-8000-000000000002', 'h.pdf',
        1024 * 1024, 'application/pdf', jsonb_build_object('title', 'H', 'evidence_type', 'other'));
    insert into r values ('B8 tamaño desconocido bloquea begin', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('B8 tamaño desconocido bloquea begin', v = 'STORAGE_UNVERIFIABLE', v);
  end;
end $$;

-- B9 · La vista expone reservado y desconocidos; usado NO suma desconocidos.
do $$
declare u record;
begin
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  execute 'set local role authenticated';
  select * into u from v_organization_module_usage
   where organization_id = '22222222-0000-4000-8000-000000000002' and module_code = 'textiles';
  insert into r values ('B9 vista: usado/reservado/desconocidos',
    u.storage_used_bytes = 494 * 1024 * 1024
    and u.storage_reserved_bytes = 5 * 1024 * 1024
    and u.storage_unknown_size_count = 1,
    u.storage_used_bytes::text || '/' || u.storage_reserved_bytes::text || '/' || u.storage_unknown_size_count::text);
end $$;

-- ── C · Finalize revalida TODO ──────────────────────────────────────────────
do $$
declare j jsonb; j2 jsonb; vid uuid; n int;
begin
  -- C1: ciclo completo en Org A (demo, límite 1): begin → finalize → idempotente.
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  select id into vid from textile_evidence_upload_intents
   where organization_id = '11111111-0000-4000-8000-000000000001' and status = 'pending' limit 1;
  perform set_config('app.uid', '', true);
  j := finalize_textile_evidence_upload_server('aaaaaaaa-0000-0000-0000-0000000000a1', vid,
        4 * 1024 * 1024, 'application/pdf');
  j2 := finalize_textile_evidence_upload_server('aaaaaaaa-0000-0000-0000-0000000000a1', vid,
        4 * 1024 * 1024, 'application/pdf');
  select count(*) into n from textile_evidences where organization_id = '11111111-0000-4000-8000-000000000001';
  insert into r values ('C1 finalize crea UNA evidencia; doble finalize idempotente',
    (j->>'already_finalized') = 'false' and (j2->>'already_finalized') = 'true'
    and (j->>'evidence_id') = (j2->>'evidence_id') and n = 1, 'n=' || n);
end $$;

do $$
declare j jsonb; vid uuid; v text;
begin
  -- C2: la reserva NO se confía: si otro consumo llenó el límite, finalize rechaza.
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  delete from textile_evidences where organization_id = '11111111-0000-4000-8000-000000000001';
  j := begin_textile_evidence_upload_v2('11111111-0000-4000-8000-000000000001', 'z.pdf',
        1024 * 1024, 'application/pdf', jsonb_build_object('title', 'Z', 'evidence_type', 'other'));
  vid := (j->>'intent_id')::uuid;
  insert into textile_evidences (organization_id, file_path, file_size_bytes)
  values ('11111111-0000-4000-8000-000000000001',
          '11111111-0000-4000-8000-000000000001/textiles/seed/full.bin', 1024);
  perform set_config('app.uid', '', true);
  begin
    perform finalize_textile_evidence_upload_server('aaaaaaaa-0000-0000-0000-0000000000a1', vid,
        1024 * 1024, 'application/pdf');
    insert into r values ('C2 finalize revalida límite', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('C2 finalize revalida límite', v = 'EVIDENCE_LIMIT_EXCEEDED', v);
  end;
  -- C4: tamaño real distinto del declarado → contrato estricto.
  begin
    perform finalize_textile_evidence_upload_server('aaaaaaaa-0000-0000-0000-0000000000a1', vid,
        2 * 1024 * 1024, 'application/pdf');
    insert into r values ('C4 tamaño real ≠ declarado rechazado', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('C4 tamaño real ≠ declarado rechazado', v in ('OBJECT_SIZE_MISMATCH', 'EVIDENCE_LIMIT_EXCEEDED'), v);
  end;
end $$;

do $$
declare j jsonb; vid uuid; v text;
begin
  -- C5: demo vence ENTRE begin y finalize → finalize bloquea.
  delete from textile_evidences where organization_id = '11111111-0000-4000-8000-000000000001';
  update textile_evidence_upload_intents set status = 'failed'
   where organization_id = '11111111-0000-4000-8000-000000000001' and status = 'pending';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  j := begin_textile_evidence_upload_v2('11111111-0000-4000-8000-000000000001', 'w.pdf',
        1024 * 1024, 'application/pdf', jsonb_build_object('title', 'W', 'evidence_type', 'other'),
        30, 'clave-w');
  vid := (j->>'intent_id')::uuid;
  update organization_modules set access_expires_at = now() - interval '1 minute'
   where organization_id = '11111111-0000-4000-8000-000000000001' and module_code = 'textiles';
  perform set_config('app.uid', '', true);
  begin
    perform finalize_textile_evidence_upload_server('aaaaaaaa-0000-0000-0000-0000000000a1', vid,
        1024 * 1024, 'application/pdf');
    insert into r values ('C5 finalize revalida acceso del módulo', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('C5 finalize revalida acceso del módulo', v = 'MODULE_ACCESS_BLOCKED', v);
  end;
  update organization_modules set access_expires_at = now() + interval '2 days'
   where organization_id = '11111111-0000-4000-8000-000000000001' and module_code = 'textiles';
end $$;

-- ── D · Ciclo pending_delete y funciones server-only ────────────────────────
do $$
declare doc uuid; j jsonb; u record;
begin
  -- D1: borrador con actual (5 MB) + dos versiones (25/20 MB): cada objeto
  -- conserva SU tamaño; el borrado encola TODO y elimina las filas.
  insert into trazadoc_file_documents (organization_id, storage_path, size_bytes, status, created_by)
  values ('22222222-0000-4000-8000-000000000002',
          '22222222-0000-4000-8000-000000000002/doc1/current.pdf', 5 * 1024 * 1024, 'draft',
          'aaaaaaaa-0000-0000-0000-0000000000a1')
  returning id into doc;
  insert into trazadoc_file_document_versions (organization_id, file_document_id, version_number, storage_path, size_bytes) values
    ('22222222-0000-4000-8000-000000000002', doc, 1, '22222222-0000-4000-8000-000000000002/doc1/v1.pdf', 25 * 1024 * 1024),
    ('22222222-0000-4000-8000-000000000002', doc, 2, '22222222-0000-4000-8000-000000000002/doc1/v2.pdf', 20 * 1024 * 1024);
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  j := queue_and_delete_trazadoc_draft(doc);
  execute 'set local role authenticated';
  select * into u from v_organization_module_usage
   where organization_id = '22222222-0000-4000-8000-000000000002' and module_code = 'traceability_6632';
  execute 'reset role';
  insert into r values ('D1 borrado encola 3 objetos con SUS tamaños y siguen contando',
    jsonb_array_length(j->'objects') = 3
    and not exists (select 1 from trazadoc_file_documents where id = doc)
    and (select count(*) from storage_orphan_candidates where source_id is not null or source_type like 'trazadoc%') = 3
    and u.storage_used_bytes = 50 * 1024 * 1024,
    (j->'objects')::text || ' · usado=' || u.storage_used_bytes);
end $$;

do $$
declare ok1 boolean; ok2 boolean; u record;
begin
  -- D2: resolución server-only — deleted libera, delete_failed sigue contando.
  ok1 := resolve_storage_deletion('trazadocs-documents',
          '22222222-0000-4000-8000-000000000002/doc1/v1.pdf', 'deleted');
  ok2 := resolve_storage_deletion('trazadocs-documents',
          '22222222-0000-4000-8000-000000000002/doc1/v2.pdf', 'delete_failed', 'storage_error');
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  execute 'set local role authenticated';
  select * into u from v_organization_module_usage
   where organization_id = '22222222-0000-4000-8000-000000000002' and module_code = 'traceability_6632';
  execute 'reset role';
  insert into r values ('D2 deleted libera y delete_failed sigue contando',
    ok1 and ok2 and u.storage_used_bytes = 25 * 1024 * 1024
    and (select status from storage_orphan_candidates where object_path like '%/v2.pdf') = 'delete_failed',
    'usado=' || u.storage_used_bytes);
end $$;

do $$
declare v text;
begin
  -- D3: autorización espejo de la política RLS (no borrador → rechazo).
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  insert into trazadoc_file_documents (organization_id, storage_path, size_bytes, status, created_by)
  values ('22222222-0000-4000-8000-000000000002',
          '22222222-0000-4000-8000-000000000002/doc2/c.pdf', 1024, 'registered',
          'aaaaaaaa-0000-0000-0000-0000000000a1');
  begin
    perform queue_and_delete_trazadoc_draft(
      (select id from trazadoc_file_documents where storage_path like '%/doc2/c.pdf'));
    insert into r values ('D3 no-borrador no se borra', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('D3 no-borrador no se borra', v = 'DELETE_NOT_ALLOWED', v);
  end;
end $$;

do $$
declare ev uuid; j jsonb; u record;
begin
  -- D4: evidencia CPR con tamaño DESCONOCIDO: se encola con NULL y la vista
  -- lo reporta como desconocido (jamás cero).
  insert into evidences (organization_id, storage_path, size_bytes, status)
  values ('22222222-0000-4000-8000-000000000002',
          '22222222-0000-4000-8000-000000000002/ev1.pdf', null, 'pending')
  returning id into ev;
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  j := queue_and_delete_evidence(ev);
  execute 'set local role authenticated';
  select * into u from v_organization_module_usage
   where organization_id = '22222222-0000-4000-8000-000000000002' and module_code = 'traceability_6632';
  execute 'reset role';
  insert into r values ('D4 evidencia sin tamaño queda encolada como DESCONOCIDA',
    (j->'object'->>'size_bytes') is null
    and u.storage_unknown_size_count = 1
    and not exists (select 1 from evidences where id = ev),
    'unknown=' || u.storage_unknown_size_count);
end $$;

do $$
declare v text;
begin
  -- D5: register_storage_orphan es SERVER-ONLY (authenticated: rechazado).
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform register_storage_orphan('22222222-0000-4000-8000-000000000002', 'textiles',
      'evidences', '22222222-0000-4000-8000-000000000002/textiles/x.bin', 10);
    insert into r values ('D5 registro físico vetado a authenticated', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('D5 registro físico vetado a authenticated', v = 'SERVER_ONLY', v);
  end;
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- D6: incluso el servidor NO puede registrar bucket/prefijo/módulo inválidos.
  begin
    perform register_storage_orphan('22222222-0000-4000-8000-000000000002', 'textiles',
      'trazadocs-documents', '22222222-0000-4000-8000-000000000002/textiles/x.bin', 10);
    insert into r values ('D6 combinación módulo-bucket inválida rechazada', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('D6 combinación módulo-bucket inválida rechazada', v like '%module_bucket%' or v = 'BUCKET_INVALID', v);
  end;
  begin
    perform register_storage_orphan('22222222-0000-4000-8000-000000000002', 'traceability_6632',
      'evidences', '99999999-0000-4000-8000-000000000009/ajena.pdf', 10);
    insert into r values ('D7 ruta de otra organización rechazada', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('D7 ruta de otra organización rechazada', v = 'OBJECT_PATH_INVALID', v);
  end;
  perform register_storage_orphan('22222222-0000-4000-8000-000000000002', 'traceability_6632',
    'evidences', '22222222-0000-4000-8000-000000000002/perdido.pdf', 2048);
  insert into r values ('D8 registro server-only válido queda pending_delete',
    exists (select 1 from storage_orphan_candidates
             where object_path = '22222222-0000-4000-8000-000000000002/perdido.pdf'
               and status = 'pending_delete' and source_type = 'unreferenced'), null);
  perform set_config('request.jwt.claims', '', true);
end $$;

do $$
declare v text;
begin
  -- D9: la resolución también es server-only.
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform resolve_storage_deletion('evidences', '22222222-0000-4000-8000-000000000002/perdido.pdf', 'deleted');
    insert into r values ('D9 resolución vetada a authenticated', false, 'no lanzó');
  exception when others then
    v := sqlerrm;
    insert into r values ('D9 resolución vetada a authenticated', v = 'SERVER_ONLY', v);
  end;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ── E · allowance con reservas ──────────────────────────────────────────────
do $$
declare j jsonb;
begin
  -- Org A: 0 confirmadas, 1 reserva activa (intent 'w.pdf'), límite demo 1.
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  execute 'set local role authenticated';
  j := check_module_resource_allowance('11111111-0000-4000-8000-000000000001', 'textiles', 'evidences', 1);
  execute 'reset role';
  insert into r values ('E1 allowance cuenta reservas activas',
    (j->>'verified') = 'true' and (j->>'allowed') = 'false'
    and (j->>'current_count') = '1' and (j->>'reason') = 'limit_exceeded',
    j::text);
end $$;

-- ── Resumen ─────────────────────────────────────────────────────────────────
select coalesce((id || ' → ' || case when ok then 'OK' else 'FAIL (' || coalesce(note, '') || ')' end), '?') as detalle
  from r order by id;
select case when bool_and(ok) then 'SMOKE T9F.3 · TODO EN VERDE (' || count(*) || ' comprobaciones)'
            else 'SMOKE T9F.3 · HAY FALLOS' end as resultado
  from r;
do $$ begin
  if exists (select 1 from r where not ok) then
    raise exception 'SMOKE T9F.3 FALLIDO';
  end if;
end $$;
