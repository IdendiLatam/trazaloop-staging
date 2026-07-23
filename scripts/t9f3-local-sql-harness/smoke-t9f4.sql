-- Trazaloop · T9F.4 · Smoke REAL contra 0101 aplicada al PG local del arnés.
-- Se ejecuta DESPUÉS del smoke T9F.3 (mismo estado): usa organizaciones
-- propias (C demo / D full) para no interferir. Baterías:
--   F · Límite documental COMBINADO (vivos + descargables, versiones exentas)
--   G · Campos físicos inmutables ante UPDATE directo (funcionales editables)
--   H · Reserva general CPR/TrazaDocs: begin/finalize/cancel/resolve, cuota
--       atómica, idempotencia vencida, gates comerciales de borrado
--   I · Intents Textiles failed / pending-vencidos que SIGUEN contando
--   J · Aislamiento de count_module_resource (auth.uid, jamás current_user)
--   K · combine_object_sizes (NULL = desconocido; contradicción marcada)
set search_path = public;
create temp table r4 (id text, ok boolean, note text);
grant all on r4 to public;

-- ── Fixtures: Org C (CPR demo, docs=2) · Org D (CPR+Textiles FULL) ─────────
insert into organizations (id, name) values ('33333333-0000-4000-8000-000000000003', 'T9F4 C');
insert into organization_modules (organization_id, module_code, enabled, access_mode, access_expires_at) values
  ('33333333-0000-4000-8000-000000000003', 'traceability_6632', true, 'demo', now() + interval '2 days');
insert into memberships (organization_id, user_id, role_code, status) values
  ('33333333-0000-4000-8000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'admin', 'active');
insert into organizations (id, name) values ('44444444-0000-4000-8000-000000000004', 'T9F4 D');
insert into organization_modules (organization_id, module_code, enabled, access_mode) values
  ('44444444-0000-4000-8000-000000000004', 'traceability_6632', true, 'full'),
  ('44444444-0000-4000-8000-000000000004', 'textiles', true, 'full');
insert into memberships (organization_id, user_id, role_code, status) values
  ('44444444-0000-4000-8000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'admin', 'active');

-- ── F · Límite documental combinado (Org C: demo, documents_trazadocs = 2) ──
do $$
declare v text; n bigint;
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  insert into trazadoc_documents (organization_id, module_key)
    values ('33333333-0000-4000-8000-000000000003', 'cpr');
  insert into r4 values ('F1 primer documento VIVO entra', true, null);
  insert into trazadoc_file_documents (organization_id, created_by, title)
    values ('33333333-0000-4000-8000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Descargable 1');
  insert into r4 values ('F2 primer DESCARGABLE consume la segunda unidad', true, null);
  begin
    insert into trazadoc_documents (organization_id, module_key)
      values ('33333333-0000-4000-8000-000000000003', 'cpr');
    insert into r4 values ('F3 tercer documento (vivo) bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('F3 tercer documento (vivo) bloqueado', v = 'RESOURCE_LIMIT_EXCEEDED', v);
  end;
  begin
    insert into trazadoc_file_documents (organization_id, created_by, title)
      values ('33333333-0000-4000-8000-000000000003', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Descargable 2');
    insert into r4 values ('F4 tercer documento (descargable) bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('F4 tercer documento (descargable) bloqueado', v = 'RESOURCE_LIMIT_EXCEEDED', v);
  end;
  execute 'reset role';
  perform set_config('app.uid', '', true);
  -- Versiones históricas NO consumen unidades documentales.
  insert into trazadoc_file_document_versions (organization_id, file_document_id, version_number, storage_path, size_bytes)
    select organization_id, id, 7, organization_id::text || '/document_files/' || id::text || '/v7/h.pdf', 1024
      from trazadoc_file_documents where organization_id = '33333333-0000-4000-8000-000000000003' limit 1;
  n := count_module_resource('33333333-0000-4000-8000-000000000003', 'traceability_6632', 'documents_trazadocs');
  insert into r4 values ('F5 versión histórica NO suma unidades (conteo=2)', n = 2, 'conteo=' || n);
end $$;

-- ── G · Campos físicos inmutables · funcionales editables (Org D) ──────────
insert into evidences (organization_id, name, storage_path, size_bytes)
  values ('44444444-0000-4000-8000-000000000004', 'Ev seed', '44444444-0000-4000-8000-000000000004/seed/seed.pdf', 490 * 1024 * 1024);
insert into textile_evidences (organization_id, file_path, file_size_bytes, file_name, file_mime_type, title, created_by)
  values ('44444444-0000-4000-8000-000000000004', '44444444-0000-4000-8000-000000000004/textiles/g/tex.png', 4096, 'tex.png', 'image/png', 'Tex G', 'aaaaaaaa-0000-0000-0000-0000000000a1');
do $$
declare v text;
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  begin
    update evidences set storage_path = 'x/x.pdf'
     where organization_id = '44444444-0000-4000-8000-000000000004';
    insert into r4 values ('G1 UPDATE directo de storage_path bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('G1 UPDATE directo de storage_path bloqueado', v = 'PHYSICAL_FIELD_IMMUTABLE', v);
  end;
  begin
    update evidences set size_bytes = 1
     where organization_id = '44444444-0000-4000-8000-000000000004';
    insert into r4 values ('G2 UPDATE directo de size_bytes bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('G2 UPDATE directo de size_bytes bloqueado', v = 'PHYSICAL_FIELD_IMMUTABLE', v);
  end;
  update evidences set name = 'Ev seed (renombrada)'
   where organization_id = '44444444-0000-4000-8000-000000000004';
  insert into r4 values ('G3 UPDATE funcional (name) sigue permitido', true, null);
  begin
    update textile_evidences set file_path = 'x'
     where organization_id = '44444444-0000-4000-8000-000000000004';
    insert into r4 values ('G4 textil: file_path inmutable', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('G4 textil: file_path inmutable', v = 'PHYSICAL_FIELD_IMMUTABLE', v);
  end;
  update textile_evidences set title = 'Tex G (editada)'
   where organization_id = '44444444-0000-4000-8000-000000000004';
  insert into r4 values ('G5 textil: título editable', true, null);
  execute 'reset role';
  perform set_config('app.uid', '', true);
end $$;

-- Maestro: físicos bloqueados, título editable (fila creada en F, Org C).
do $$
declare v text;
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  begin
    update trazadoc_file_documents set file_name = 'h.pdf'
     where organization_id = '33333333-0000-4000-8000-000000000003';
    insert into r4 values ('G6 maestro: file_name inmutable', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('G6 maestro: file_name inmutable', v = 'PHYSICAL_FIELD_IMMUTABLE', v);
  end;
  update trazadoc_file_documents set title = 'Descargable 1 (editado)'
   where organization_id = '33333333-0000-4000-8000-000000000003';
  insert into r4 values ('G7 maestro: título editable', true, null);
  execute 'reset role';
  perform set_config('app.uid', '', true);
end $$;

-- ── H · Reserva general CPR/TrazaDocs (Org D FULL: 500 MB; seed = 490 MB) ──
do $$
declare
  v text; j jsonb; j2 jsonb; n bigint;
  v_ev1 uuid; v_ev2 uuid; v_ev3 uuid; v_doc uuid;
  v_intent uuid; v_intent2 uuid; v_intent3 uuid; v_path text;
  v_snap record;
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  insert into evidences (organization_id, name) values ('44444444-0000-4000-8000-000000000004', 'Ev H1') returning id into v_ev1;
  insert into evidences (organization_id, name) values ('44444444-0000-4000-8000-000000000004', 'Ev H2') returning id into v_ev2;

  -- H1 · La cuota bloquea ANTES del upload (490 + 15 > 500).
  begin
    j := begin_cpr_storage_upload('evidence', v_ev1, 'grande.pdf', 15 * 1024 * 1024, 'application/pdf');
    insert into r4 values ('H1 begin sobre cuota bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('H1 begin sobre cuota bloqueado', v = 'STORAGE_QUOTA_EXCEEDED', v);
  end;

  -- H2 · begin válido crea REFERENCIA DURABLE con ruta de servidor.
  j := begin_cpr_storage_upload('evidence', v_ev1, 'informe fase 1.pdf', 4 * 1024 * 1024, 'application/pdf');
  v_intent := (j->>'intent_id')::uuid;
  v_path := j->>'object_path';
  execute 'reset role';
  insert into r4
    select 'H2 begin crea intent durable con ruta derivada', 
           exists (select 1 from storage_upload_intents i where i.id = v_intent
                    and i.status = 'pending' and i.object_path = v_path
                    and i.object_path = '44444444-0000-4000-8000-000000000004/' || v_ev1::text || '/informe_fase_1.pdf'),
           v_path;
  execute 'set local role authenticated';

  -- H3 · Las reservas CUENTAN: 490 + 4 (reserva) + 7 > 500.
  begin
    j2 := begin_cpr_storage_upload('evidence', v_ev2, 'otro.pdf', 7 * 1024 * 1024, 'application/pdf');
    insert into r4 values ('H3 segunda reserva sobre cuota bloqueada', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('H3 segunda reserva sobre cuota bloqueada', v = 'STORAGE_QUOTA_EXCEEDED', v);
  end;

  -- H4 · Finalize verifica el tamaño REAL contra la reserva.
  begin
    j2 := finalize_evidence_attachment(v_intent, 5 * 1024 * 1024);
    insert into r4 values ('H4 finalize con tamaño distinto bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('H4 finalize con tamaño distinto bloqueado', v = 'OBJECT_SIZE_MISMATCH', v);
  end;

  -- H5 · Finalize correcto fija campos físicos (vía DEFINER) y consume.
  j2 := finalize_evidence_attachment(v_intent, 4 * 1024 * 1024);
  execute 'reset role';
  select * into v_snap from module_storage_snapshot('44444444-0000-4000-8000-000000000004', 'traceability_6632');
  insert into r4
    select 'H5 finalize fija ruta/tamaño y compromete (494 MB, reserva 0)',
           (select storage_path from evidences where id = v_ev1) = v_path
           and (select size_bytes from evidences where id = v_ev1) = 4 * 1024 * 1024
           and v_snap.committed_bytes = 494 * 1024 * 1024
           and v_snap.reserved_bytes = 0
           and (j2->>'already_finalized')::boolean = false,
           'committed=' || v_snap.committed_bytes || ' reserved=' || v_snap.reserved_bytes;
  execute 'set local role authenticated';

  -- H6 · Doble finalize: idempotente, sin duplicar.
  j2 := finalize_evidence_attachment(v_intent, 4 * 1024 * 1024);
  insert into r4
    select 'H6 doble finalize idempotente', (j2->>'already_finalized')::boolean = true, j2::text;

  -- H7 · Maestro: begin inicial + finalize v2 (valores DEL intent) + idem.
  insert into trazadoc_file_documents (organization_id, created_by, title)
    values ('44444444-0000-4000-8000-000000000004', 'aaaaaaaa-0000-0000-0000-0000000000a1', 'Doc H') returning id into v_doc;
  j := begin_cpr_storage_upload('trazadoc_initial', v_doc, 'manual v1.pdf', 1 * 1024 * 1024, 'application/pdf');
  n := finalize_trazadoc_file_document_initial_version_v2((j->>'intent_id')::uuid, 1 * 1024 * 1024, 'Alta');
  insert into r4
    select 'H7 inicial v2: versión 1 con ruta del intent',
           n = 1 and (select storage_path from trazadoc_file_documents where id = v_doc) = (j->>'object_path')
           and (select count(*) from trazadoc_file_document_versions where file_document_id = v_doc and version_number = 1) = 1,
           j->>'object_path';
  n := finalize_trazadoc_file_document_initial_version_v2((j->>'intent_id')::uuid, 1 * 1024 * 1024, 'Alta');
  insert into r4 select 'H8 doble finalize inicial idempotente', n = 1, 'v=' || n;

  -- H9 · Reemplazo: reserva el NUEVO sin liberar el anterior.
  j2 := begin_cpr_storage_upload('trazadoc_replace', v_doc, 'manual v2.pdf', 2 * 1024 * 1024, 'application/pdf');
  n := replace_trazadoc_file_document_v2((j2->>'intent_id')::uuid, 2 * 1024 * 1024, 'Reemplazo');
  execute 'reset role';
  select * into v_snap from module_storage_snapshot('44444444-0000-4000-8000-000000000004', 'traceability_6632');
  insert into r4
    select 'H9 reemplazo: v2 vigente y la v1 SIGUE contando (497 MB)',
           n = 2 and (select current_version from trazadoc_file_documents where id = v_doc) = 2
           and v_snap.committed_bytes = 497 * 1024 * 1024,
           'committed=' || v_snap.committed_bytes;
  execute 'set local role authenticated';

  -- H10 · Cancel: el candidato sigue contabilizado hasta resolución REAL.
  insert into evidences (organization_id, name) values ('44444444-0000-4000-8000-000000000004', 'Ev H3') returning id into v_ev3;
  j := begin_cpr_storage_upload('evidence', v_ev3, 'cancelada.pdf', 3 * 1024 * 1024, 'application/pdf');
  v_intent2 := (j->>'intent_id')::uuid;
  j2 := cancel_cpr_storage_upload(v_intent2);
  execute 'reset role';
  select * into v_snap from module_storage_snapshot('44444444-0000-4000-8000-000000000004', 'traceability_6632');
  insert into r4
    select 'H10 cancel: failed y sus bytes SIGUEN contando (500 MB)',
           (select status from storage_upload_intents where id = v_intent2) = 'failed'
           and v_snap.committed_bytes = 500 * 1024 * 1024 and v_snap.reserved_bytes = 0,
           'committed=' || v_snap.committed_bytes;

  -- H11 · Resolución server-only confirmada libera; authenticated no puede.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  begin
    perform resolve_cpr_upload_intent_object(v_intent2, true);
    insert into r4 values ('H11 resolve como authenticated bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('H11 resolve como authenticated bloqueado',
                           v = 'SERVER_ONLY' or v like '%permission denied%', v);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform resolve_cpr_upload_intent_object(v_intent2, true);
  select * into v_snap from module_storage_snapshot('44444444-0000-4000-8000-000000000004', 'traceability_6632');
  insert into r4
    select 'H12 retiro confirmado libera (497 MB)',
           (select storage_resolved_at is not null from storage_upload_intents where id = v_intent2)
           and v_snap.committed_bytes = 497 * 1024 * 1024,
           'committed=' || v_snap.committed_bytes;

  -- H13 · Idempotency key VENCIDA: se expira atómicamente y se revive la
  --       ruta — jamás unique_violation ni bloqueo permanente.
  execute 'set local role authenticated';
  j := begin_cpr_storage_upload('evidence', v_ev3, 'cancelada.pdf', 2 * 1024 * 1024, 'application/pdf', 30, 'K1');
  v_intent3 := (j->>'intent_id')::uuid;
  execute 'reset role';
  update storage_upload_intents
     set created_at = now() - interval '3 hours', expires_at = now() - interval '2 hours'
   where id = v_intent3;
  execute 'set local role authenticated';
  j2 := begin_cpr_storage_upload('evidence', v_ev3, 'cancelada.pdf', 2 * 1024 * 1024, 'application/pdf', 30, 'K1');
  execute 'reset role';
  insert into r4
    select 'H13 clave vencida no bloquea (intent revivido pending)',
           (j2->>'intent_id')::uuid = v_intent3
           and (select status from storage_upload_intents where id = v_intent3) = 'pending'
           and (select expires_at > now() from storage_upload_intents where id = v_intent3),
           j2::text;

  -- H14 · Miembro de otra organización: begin rechazado.
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a2', true);
  begin
    j := begin_cpr_storage_upload('evidence', v_ev1, 'x.pdf', 1024, 'application/pdf');
    insert into r4 values ('H14 begin sin membresía bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('H14 begin sin membresía bloqueado',
                           v in ('ROLE_NOT_ALLOWED', 'ALREADY_HAS_FILE'), v);
  end;
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);

  -- H15 · discard: SOLO borradores vacíos y sin versiones.
  begin
    perform discard_empty_trazadoc_file_document(v_doc);
    insert into r4 values ('H15 discard con objeto bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('H15 discard con objeto bloqueado', v = 'DISCARD_NOT_ALLOWED', v);
  end;
  execute 'reset role';
  perform set_config('app.uid', '', true);
end $$;

-- H16-H18 · Gates comerciales de borrado + RPC textil de borrado seguro.
do $$
declare v text; v_ev uuid; v_tex uuid; j jsonb;
begin
  -- Evidencia en Org C ANTES del vencimiento (demo: evidences = 1).
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  insert into evidences (organization_id, name) values ('33333333-0000-4000-8000-000000000003', 'Ev C') returning id into v_ev;
  execute 'reset role';
  update organization_modules set access_expires_at = now() - interval '1 day'
   where organization_id = '33333333-0000-4000-8000-000000000003' and module_code = 'traceability_6632';
  execute 'set local role authenticated';
  begin
    perform queue_and_delete_evidence(v_ev);
    insert into r4 values ('H16 borrado con Demo VENCIDO bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('H16 borrado con Demo VENCIDO bloqueado', v = 'MODULE_ACCESS_BLOCKED', v);
  end;

  -- Textil (Org D, vigente): borrado seguro encola y elimina en una tx.
  select id into v_tex from textile_evidences
   where organization_id = '44444444-0000-4000-8000-000000000004' limit 1;
  j := queue_and_delete_textile_evidence(v_tex);
  execute 'reset role';
  insert into r4
    select 'H17 borrado textil seguro: pending_delete + fila fuera',
           (j->>'deleted')::boolean
           and not exists (select 1 from textile_evidences where id = v_tex)
           and exists (select 1 from storage_orphan_candidates c
                        where c.organization_id = '44444444-0000-4000-8000-000000000004'
                          and c.module_code = 'textiles' and c.status = 'pending_delete'
                          and c.object_path like '%/textiles/g/tex.png'),
           j::text;
  -- Sin membresía: rechazo sin filtrar existencia.
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a2', true);
  begin
    perform queue_and_delete_evidence((select id from evidences where organization_id = '44444444-0000-4000-8000-000000000004' limit 1));
    insert into r4 values ('H18 borrado sin membresía bloqueado', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('H18 borrado sin membresía bloqueado', v = 'DELETE_NOT_ALLOWED', v);
  end;
  execute 'reset role';
  perform set_config('app.uid', '', true);
end $$;

-- ── I · Intents Textiles failed / pending-vencidos SIGUEN contando ─────────
do $$
declare v text; j jsonb; v_i1 uuid; v_i2 uuid; v_snap record; v_before bigint;
begin
  select committed_bytes into v_before
    from module_storage_snapshot('44444444-0000-4000-8000-000000000004', 'textiles');
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  j := begin_textile_evidence_upload_v2('44444444-0000-4000-8000-000000000004', 'fallida.png', 8192, 'image/png', jsonb_build_object('title', 'Fallida', 'evidence_type', 'other'));
  v_i1 := (j->>'intent_id')::uuid;
  execute 'reset role';
  perform set_config('app.uid', '', true);
  update textile_evidence_upload_intents set status = 'failed' where id = v_i1;
  select * into v_snap from module_storage_snapshot('44444444-0000-4000-8000-000000000004', 'textiles');
  insert into r4
    select 'I1 intent FAILED sin resolver sigue contando',
           v_snap.committed_bytes = v_before + 8192 and v_snap.reserved_bytes = 0,
           'antes=' || v_before || ' ahora=' || v_snap.committed_bytes;

  -- La RPC histórica de limpieza YA no es invocable por authenticated.
  execute 'set local role authenticated';
  begin
    perform record_textile_upload_intent_cleanup(v_i1, true);
    insert into r4 values ('I2 cliente NO confirma retiros (revocada)', false, 'no lanzó');
  exception when others then v := sqlerrm;
    insert into r4 values ('I2 cliente NO confirma retiros (revocada)', v like '%permission denied%', v);
  end;
  execute 'reset role';
  -- Server-only: 'expired' SOLO tras retiro confirmado → libera.
  perform record_textile_upload_intent_cleanup(v_i1, true);
  select * into v_snap from module_storage_snapshot('44444444-0000-4000-8000-000000000004', 'textiles');
  insert into r4
    select 'I3 retiro confirmado (expired) libera',
           (select status from textile_evidence_upload_intents where id = v_i1) = 'expired'
           and v_snap.committed_bytes = v_before,
           'ahora=' || v_snap.committed_bytes;

  -- Pending VENCIDO: deja de reservar la unidad pero sus bytes cuentan.
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  j := begin_textile_evidence_upload_v2('44444444-0000-4000-8000-000000000004', 'tardia.png', 4096, 'image/png', jsonb_build_object('title', 'Tardia', 'evidence_type', 'other'));
  v_i2 := (j->>'intent_id')::uuid;
  execute 'reset role';
  perform set_config('app.uid', '', true);
  update textile_evidence_upload_intents
     set created_at = now() - interval '3 hours', expires_at = now() - interval '2 hours'
   where id = v_i2;
  select * into v_snap from module_storage_snapshot('44444444-0000-4000-8000-000000000004', 'textiles');
  insert into r4
    select 'I4 pending VENCIDO: bytes contados, reserva 0',
           v_snap.committed_bytes = v_before + 4096 and v_snap.reserved_bytes = 0,
           'ahora=' || v_snap.committed_bytes || ' reserva=' || v_snap.reserved_bytes;
  perform record_textile_upload_intent_cleanup(v_i2, true);
end $$;

-- ── J · Aislamiento de count_module_resource (auth.uid, no current_user) ───
do $$
declare n bigint;
begin
  execute 'set local role authenticated';
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a2', true);
  n := count_module_resource('44444444-0000-4000-8000-000000000004', 'traceability_6632', 'evidences');
  insert into r4 values ('J1 NO miembro: conteo ajeno = NULL', n is null, coalesce(n::text, 'null'));
  perform set_config('app.uid', 'aaaaaaaa-0000-0000-0000-0000000000a1', true);
  n := count_module_resource('44444444-0000-4000-8000-000000000004', 'traceability_6632', 'evidences');
  insert into r4 values ('J2 miembro: conteo propio visible', n is not null and n >= 3, coalesce(n::text, 'null'));
  execute 'reset role';
  perform set_config('app.uid', '', true);
  n := count_module_resource('44444444-0000-4000-8000-000000000004', 'traceability_6632', 'evidences');
  insert into r4 values ('J3 contexto de servidor (sin uid) permitido', n is not null, coalesce(n::text, 'null'));
end $$;

-- ── K · combine_object_sizes: NULL = desconocido ───────────────────────────
do $$
begin
  insert into r4 values ('K1 NULL+NULL permanece NULL', combine_object_sizes(null, null) is null, null);
  insert into r4 values ('K2 NULL+conocido conserva el conocido', combine_object_sizes(null, 7) = 7 and combine_object_sizes(7, null) = 7, null);
  insert into r4 values ('K3 iguales → ese valor; contradictorios → máximo conservador',
                         combine_object_sizes(5, 5) = 5 and combine_object_sizes(5, 9) = 9, null);
end $$;

-- ── Resumen ─────────────────────────────────────────────────────────────────
select coalesce((id || ' → ' || case when ok then 'OK' else 'FAIL (' || coalesce(note, '') || ')' end), '?') as detalle
  from r4 order by id;
select case when bool_and(ok) then 'SMOKE T9F.4 · TODO EN VERDE (' || count(*) || ' comprobaciones)'
            else 'SMOKE T9F.4 · HAY FALLOS' end as resultado
  from r4;
do $$ begin
  if exists (select 1 from r4 where not ok) then
    raise exception 'SMOKE T9F.4 FALLIDO';
  end if;
end $$;
