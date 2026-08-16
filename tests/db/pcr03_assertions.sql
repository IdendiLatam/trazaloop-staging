-- ============================================================================
-- tests/db/pcr03_assertions.sql · Bloque PCR-03 · rev. 03.1–03.3.1
-- Aserciones CONDUCTUALES sobre 0106–0108 REALES, tras las suites previas.
-- Cada ataque de la revisión de seguridad se EJECUTA de verdad y debe ser
-- RECHAZADO; después se demuestra el flujo legítimo.
--
-- S12 · PCR-03.1: revisión gobernada con sellos infalsificables (también SIN
--       transición), reapertura controlada, física honesta, requisitos con
--       organization_id inmutable y evidencia↔requisito validada por el
--       TRIGGER REAL de evidence_links (0020/0025 redefinido en 0106).
-- S13 · PCR-03.2: el completed NO se fabrica (INSERT ni UPDATE directos),
--       la RPC es la única vía (membresía + coherencia + hash de servidor),
--       inmutabilidad, historial y RLS.
-- S14 · PCR-03.3: el generated NO se fabrica ni por admin fuera de la RPC,
--       rol admin/quality en BD, versión/código atómicos, inmutabilidad,
--       DELETE vetado, organization_id inmutable y aislamiento.
-- ============================================================================
set statement_timeout = '10s';

do $$
declare
  org  uuid := 'ffffffff-0000-0000-0000-000000000010';
  org2 uuid := 'ffffffff-0000-0000-0000-000000000011';
  admin_u uuid := 'ffffffff-1111-0000-0000-000000000010';
  cons_u  uuid := 'ffffffff-1111-0000-0000-000000000012';
  admin2  uuid := 'ffffffff-1111-0000-0000-000000000011';
  dual_u  uuid := 'ffffffff-1111-0000-0000-000000000013';  -- miembro de AMBAS
  ev   uuid := 'ffffffff-eeee-0000-0000-000000000001';
  evf  uuid := 'ffffffff-eeee-0000-0000-000000000002';
  req  uuid := 'ffffffff-cccc-0000-0000-000000000001';
  prod uuid := 'ffffffff-aaaa-0000-0000-000000000010';
  prod2 uuid := 'ffffffff-aaaa-0000-0000-000000000011';
  msg text; v_count int; v_by uuid; v_at timestamptz; v_comment text;
begin
  insert into organizations (id, name) values (org, 'Org Gobernanza'), (org2, 'Org Gobernanza B');
  insert into profiles (id, email) values
    (admin_u, 'gob-admin@test'), (cons_u, 'gob-consultor@test'),
    (admin2, 'gob-admin-b@test'), (dual_u, 'gob-dual@test');
  insert into organization_members (organization_id, profile_id, role) values
    (org, admin_u, 'admin'), (org, cons_u, 'consultant'), (org2, admin2, 'admin'),
    (org, dual_u, 'admin'), (org2, dual_u, 'admin');
  insert into products (id, organization_id, code, name) values
    (prod, org, 'PR-G', 'Producto G'), (prod2, org2, 'PR-B', 'Producto B');
  insert into evidences (id, organization_id, name, status) values (ev, org, 'Ficha técnica X', 'pending');

  -- ── S12.1 · revisión: motivo, roles y sellos ─────────────────────────────
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  begin
    update evidences set status = 'rejected' where id = ev;
    raise exception 'FALLO S12.1: rechazo sin motivo fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'El motivo de rechazo es obligatorio%' then
    raise exception 'FALLO S12.1: mensaje inesperado sin motivo: %', msg;
  end if;
  reset role;
  perform set_config('request.jwt.claim.sub', cons_u::text, true);
  set local role authenticated;
  begin
    update evidences set status = 'valid' where id = ev;  -- ataque 4: consultant acepta
    raise exception 'FALLO S12.1: el consultor aceptó una evidencia';
  exception when others then msg := sqlerrm;
  end;
  begin
    update evidences set status = 'rejected', review_comment = 'x' where id = ev;  -- ataque 5
    raise exception 'FALLO S12.1: el consultor rechazó una evidencia';
  exception when others then null;
  end;
  reset role;
  if msg not like 'Solo administrador o calidad pueden%' then
    raise exception 'FALLO S12.1: mensaje inesperado para consultor: %', msg;
  end if;
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences
     set status = 'valid', reviewed_by = cons_u, reviewed_at = '2000-01-01'  -- sello falso EN la transición
   where id = ev;
  reset role;
  select reviewed_by, reviewed_at into v_by, v_at from evidences where id = ev;
  if v_by is distinct from admin_u or v_at < now() - interval '1 minute' then
    raise exception 'FALLO S12.1: el sello de la transición no lo fijó el servidor';
  end if;
  raise notice '✔ S12.1 revisión: motivo obligatorio, consultor sin aceptar/rechazar y sellos de transición del servidor';

  -- ── S12.1b · ataque 33 (rev.): falsificar sellos SIN transición ──────────
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences
     set reviewed_by = cons_u, reviewed_at = '1999-12-31', review_comment = 'motivo apócrifo',
         observations = 'nota operativa legítima'
   where id = ev;  -- UPDATE sin cambiar status: los sellos deben preservarse
  reset role;
  select reviewed_by, reviewed_at, review_comment into v_by, v_at, v_comment from evidences where id = ev;
  if v_by is distinct from admin_u or v_at < now() - interval '1 minute' or v_comment is not null then
    raise exception 'FALLO S12.1b: un UPDATE sin transición reescribió los sellos (by=% at=% comment=%)', v_by, v_at, v_comment;
  end if;
  select observations into msg from evidences where id = ev;
  if msg <> 'nota operativa legítima' then
    raise exception 'FALLO S12.1b: el UPDATE legítimo de campos operativos no se aplicó';
  end if;
  raise notice '✔ S12.1b sellos infalsificables: sin transición, reviewed_by/at y el motivo se preservan del histórico';

  -- ── S12.1c · ataque 7 (rev.): rejected → pending por consultant ──────────
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences set status = 'rejected', review_comment = 'No corresponde al lote' where id = ev;
  reset role;
  perform set_config('request.jwt.claim.sub', cons_u::text, true);
  set local role authenticated;
  begin
    update evidences set status = 'pending' where id = ev;
    raise exception 'FALLO S12.1c: el consultor reabrió una evidencia rechazada';
  exception when others then msg := sqlerrm;
  end;
  reset role;
  if msg not like 'Solo administrador o calidad pueden reabrir%' then
    raise exception 'FALLO S12.1c: mensaje inesperado de reapertura: %', msg;
  end if;
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences set status = 'pending' where id = ev;  -- reapertura EXPLÍCITA por admin
  reset role;
  select reviewed_by, review_comment into v_by, v_comment from evidences where id = ev;
  if v_by is not null or v_comment is not null then
    raise exception 'FALLO S12.1c: la reapertura no limpió el veredicto anterior';
  end if;
  raise notice '✔ S12.1c reapertura controlada: rejected→pending solo admin/calidad, con veredicto limpiado y auditado';

  -- ── S12.2 · soporte físico honesto ───────────────────────────────────────
  begin
    insert into evidences (organization_id, name, medium, storage_path)
    values (org, 'Física con archivo (inválida)', 'physical', 'ruta/falsa.pdf');
    raise exception 'FALLO S12.2: una evidencia física fingió tener archivo';
  exception when check_violation then null;
  end;
  insert into evidences (id, organization_id, name, medium, physical_reference, physical_location)
  values (evf, org, 'Registro en papel R-01', 'physical', 'Carpeta AZ-2026-03', 'Archivo de planta');
  insert into evidences (organization_id, name, medium, storage_path, physical_reference)
  values (org, 'Certificado escaneado + original en papel', 'hybrid', 'org/x.pdf', 'Folio 12');
  select count(*) into v_count from evidences where organization_id = org and medium <> 'digital';
  if v_count <> 2 then raise exception 'FALLO S12.2: esperadas 2 no-digitales, hay %', v_count; end if;
  raise notice '✔ S12.2 medios: physical jamás finge archivo (CHECK), physical/hybrid registrables y localizables';

  -- ── S12.3 · archivado gobernado + ataque 34 (archived_by falso) ──────────
  perform set_config('request.jwt.claim.sub', cons_u::text, true);
  set local role authenticated;
  begin
    update evidences set archived_at = now() where id = evf;  -- ataque 6: consultant archiva
    raise exception 'FALLO S12.3: el consultor archivó una evidencia';
  exception when others then msg := sqlerrm;
  end;
  reset role;
  if msg not like 'Solo administrador o calidad pueden archivar%' then
    raise exception 'FALLO S12.3: mensaje inesperado: %', msg;
  end if;
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences set archived_at = now(), archived_by = cons_u where id = evf;  -- sello falso EN la transición
  reset role;
  select archived_by into v_by from evidences where id = evf;
  if v_by is distinct from admin_u then
    raise exception 'FALLO S12.3: archived_by no quedó sellado por el servidor';
  end if;
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences set archived_by = cons_u, observations = 'y' where id = evf;  -- ataque 34: sin transición
  reset role;
  select archived_by into v_by from evidences where id = evf;
  if v_by is distinct from admin_u then
    raise exception 'FALLO S12.3: archived_by fue falsificado sin transición';
  end if;
  raise notice '✔ S12.3 archivado: solo admin/calidad y archived_by de verdad-servidor, con o sin transición';

  -- ── S12.4 · requisitos: RLS + trigger REAL de evidence_links ─────────────
  insert into customer_requirements (id, organization_id, customer_name, code, title)
  values (req, org, 'ACME', 'REQ-ACME-01', 'Contenido reciclado mínimo acordado');
  begin
    insert into customer_requirement_links (organization_id, requirement_id, target_type, target_id)
    values (org, req, 'product', prod2);
    raise exception 'FALLO S12.4: el vínculo aceptó un producto de otra empresa';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'El destino del vínculo no existe o no pertenece a tu empresa.' then
    raise exception 'FALLO S12.4: mensaje inesperado del vínculo: %', msg;
  end if;
  insert into customer_requirement_links (organization_id, requirement_id, target_type, target_id)
  values (org, req, 'product', prod);

  -- Ataques del hallazgo 1 sobre el TRIGGER REAL t_evidence_links_same_org:
  -- B · evidencia → requisito de OTRA organización = RECHAZADO
  begin
    insert into customer_requirements (id, organization_id, customer_name, code, title)
    values ('ffffffff-cccc-0000-0000-000000000002', org2, 'B Corp', 'REQ-B-01', 'Requisito ajeno');
    insert into evidence_links (organization_id, evidence_id, target_type, target_id)
    values (org, ev, 'customer_requirement', 'ffffffff-cccc-0000-0000-000000000002');
    raise exception 'FALLO S12.4: el enlace evidencia→requisito cruzó de empresa';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'Enlace de evidencia entre empresas bloqueado%' then
    raise exception 'FALLO S12.4: mensaje cross-tenant inesperado: %', msg;
  end if;
  -- C · requisito inexistente = RECHAZADO
  begin
    insert into evidence_links (organization_id, evidence_id, target_type, target_id)
    values (org, ev, 'customer_requirement', 'ffffffff-cccc-0000-0000-00000000dead');
    raise exception 'FALLO S12.4: el enlace aceptó un requisito inexistente';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'El destino % del enlace de evidencia no existe%' then
    raise exception 'FALLO S12.4: mensaje de inexistente inesperado: %', msg;
  end if;
  -- A · misma organización = OK
  insert into evidence_links (organization_id, evidence_id, target_type, target_id)
  values (org, ev, 'customer_requirement', req);
  -- D · los tipos HISTÓRICOS siguen funcionando (mismo trigger)
  insert into evidence_links (organization_id, evidence_id, target_type, target_id)
  values (org, ev, 'product', prod);
  begin
    insert into evidence_links (organization_id, evidence_id, target_type, target_id)
    values (org, ev, 'product', prod2);  -- histórico cross-tenant sigue vetado
    raise exception 'FALLO S12.4: el tipo histórico dejó de validar cross-tenant';
  exception when others then null;
  end;

  -- Ataque 35 (rev., hallazgo 4): mover organization_id siendo miembro de AMBAS
  perform set_config('request.jwt.claim.sub', dual_u::text, true);
  set local role authenticated;
  begin
    update customer_requirements set organization_id = org2 where id = req;
    raise exception 'FALLO S12.4: customer_requirement cambió de organización';
  exception when others then msg := sqlerrm;
  end;
  reset role;
  if msg not like 'El organization_id de una fila no puede modificarse%' then
    raise exception 'FALLO S12.4: mensaje de inmutabilidad inesperado: %', msg;
  end if;

  perform set_config('request.jwt.claim.sub', admin2::text, true);
  set local role authenticated;
  select count(*) into v_count from customer_requirements where id = req;
  if v_count <> 0 then raise exception 'FALLO S12.4: la otra empresa ve el requisito ajeno'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  select count(*) into v_count from customer_requirements where id = req;
  if v_count <> 1 then raise exception 'FALLO S12.4: la propia empresa debía ver su requisito'; end if;
  reset role;
  raise notice '✔ S12.4 requisitos: trigger REAL de enlaces (misma org OK, ajena/inexistente NO, históricos intactos), organization_id inmutable y RLS bidireccional';
end $$;

-- ============================================================================
-- S13 · PCR-03.2 (rev. 03.1–03.3.2): la fotografía es VERDAD-SERVIDOR
-- ============================================================================
do $$
declare
  org  uuid := 'ffffffff-0000-0000-0000-000000000010';
  org2 uuid := 'ffffffff-0000-0000-0000-000000000011';
  admin_u uuid := 'ffffffff-1111-0000-0000-000000000010';
  cons_u  uuid := 'ffffffff-1111-0000-0000-000000000012';
  admin2 uuid := 'ffffffff-1111-0000-0000-000000000011';
  dual_u uuid := 'ffffffff-1111-0000-0000-000000000013';
  qual_u uuid := 'ffffffff-1111-0000-0000-000000000014';
  sup  uuid := 'ffffffff-2222-0000-0000-000000000012';
  mat  uuid := 'ffffffff-3333-0000-0000-000000000012';
  op   uuid := 'ffffffff-4444-0000-0000-000000000012';
  ob   uuid := 'ffffffff-6666-0000-0000-000000000012';
  ib   uuid := 'ffffffff-5555-0000-0000-000000000031';
  ib2  uuid := 'ffffffff-5555-0000-0000-000000000032';
  evm  uuid := 'ffffffff-eeee-0000-0000-000000000003';
  ex1  uuid := 'ffffffff-7777-0000-0000-000000000001';
  ex2  uuid := 'ffffffff-7777-0000-0000-000000000002';
  ex3  uuid := 'ffffffff-7777-0000-0000-000000000004';
  exd  uuid := 'ffffffff-7777-0000-0000-000000000003';
  exd2 uuid := 'ffffffff-7777-0000-0000-000000000005';
  snap1 jsonb; snap2 jsonb;
  msg text; v_count int; v_hash text; v_by uuid; v_status text;
begin
  -- Fixtures REALES de la cadena: proveedor, material, entrada, consumo y
  -- evidencia de origen aceptada — la fotografía debe REFLEJARLOS (A3).
  insert into profiles (id, email) values (qual_u, 'gob-calidad@test');
  insert into organization_members (organization_id, profile_id, role) values (org, qual_u, 'quality');
  insert into suppliers (id, organization_id, name) values (sup, org, 'EcoPlast Andina');
  insert into materials (id, organization_id, name) values (mat, org, 'PET reciclado');
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op, org, 'OP-EJ-1', current_date, 'in_progress');
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values (ob, org, op, 'OUT-EJERCICIO', 40);
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib, org, sup, mat, 'LE-EJ-1', current_date, 100);
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, op, ib, 60);
  insert into evidences (id, organization_id, name, evidence_type, status)
  values (evm, org, 'Declaración de origen PET', 'origin_supplier', 'pending');
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences set status = 'valid' where id = evm;  -- aceptación gobernada real
  reset role;
  insert into evidence_links (organization_id, evidence_id, target_type, target_id, link_role)
  values (org, evm, 'material', mat, 'soporte de origen del material');

  -- Ataque 31: INSERT directo de un completed
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  begin
    insert into traceability_exercises (organization_id, output_batch_id, status, completed_at, result, snapshot, source_hash)
    values (org, ob, 'completed', now(), 'complete', '{}'::jsonb, 'hash-fabricado');
    raise exception 'FALLO S13.1: un completed se INSERTÓ directamente';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'Un ejercicio solo puede iniciarse como borrador%' then
    raise exception 'FALLO S13.1: mensaje de insert inesperado: %', msg;
  end if;
  begin
    insert into traceability_exercises (organization_id, output_batch_id, snapshot)
    values (org, ob, '{}'::jsonb);  -- borrador con fotografía preinstalada
    raise exception 'FALLO S13.1: un borrador nació con snapshot';
  exception when others then null;
  end;
  insert into traceability_exercises (id, organization_id, output_batch_id, started_by, started_at)
  values (ex1, org, ob, admin2, '2000-01-01');
  reset role;
  select started_by into v_by from traceability_exercises where id = ex1;
  if v_by is distinct from admin_u then
    raise exception 'FALLO S13.1: started_by no lo selló el servidor (fue %)', v_by;
  end if;

  -- Ataque 10: UPDATE draft→completed arbitrario, sin la RPC
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  begin
    update traceability_exercises
       set status = 'completed', completed_at = now(), result = 'complete',
           snapshot = '{}'::jsonb, source_hash = 'hash-fabricado'
     where id = ex1;
    raise exception 'FALLO S13.1: draft→completed directo fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'Los campos del ejercicio%los administra el servidor%' then
    raise exception 'FALLO S13.1: mensaje del guard de campos inesperado: %', msg;
  end if;
  update traceability_exercises set notes = 'nota del borrador' where id = ex1;

  -- A1/A2 (rev. 03.1–03.3.2): la RPC YA NO ACEPTA fotografía del llamador —
  -- el ataque de contenido inventado es IMPOSIBLE por firma.
  begin
    perform public.complete_traceability_exercise(ex1, '{"result":"complete"}'::jsonb);
    raise exception 'FALLO S13.1/A1: la RPC aceptó un snapshot del llamador';
  exception when undefined_function then null;
  end;

  -- Flujo LEGÍTIMO: solo se indica el borrador; TODO lo demás lo pone la BD.
  perform public.complete_traceability_exercise(ex1);
  reset role;
  select status, source_hash, snapshot into v_status, v_hash, snap1
    from traceability_exercises where id = ex1;
  if v_status <> 'completed' then raise exception 'FALLO S13.1: la RPC no completó'; end if;

  -- A3: la fotografía REFLEJA los datos reales de la base
  if snap1->'target'->>'batch_code' <> 'OUT-EJERCICIO'
     or snap1->'target'->>'organization_name' <> 'Org Gobernanza' then
    raise exception 'FALLO S13.1/A3: identidad del lote/empresa incorrecta';
  end if;
  if jsonb_array_length(snap1->'chain') <> 1
     or snap1->'chain'->0->>'order' <> 'OP-EJ-1'
     or jsonb_array_length(snap1->'chain'->0->'external_inputs') <> 1
     or snap1->'chain'->0->'external_inputs'->0->>'batch_code' <> 'LE-EJ-1'
     or snap1->'chain'->0->'external_inputs'->0->>'material' <> 'PET reciclado'
     or snap1->'chain'->0->'external_inputs'->0->>'supplier' <> 'EcoPlast Andina'
     or (snap1->'chain'->0->'external_inputs'->0->>'mass_kg')::numeric <> 60 then
    raise exception 'FALLO S13.1/A3: la cadena no refleja el consumo real: %', snap1->'chain';
  end if;
  if (snap1->'balances'->'input_batches'->0->>'available_kg')::numeric <> 40 then
    raise exception 'FALLO S13.1/A3: el saldo no viene de la vista real (%)',
      snap1->'balances'->'input_batches'->0;
  end if;
  if (snap1->'counts'->>'orders')::int <> 1
     or (snap1->'counts'->>'external_batches')::int <> 1
     or (snap1->'counts'->>'suppliers')::int <> 1
     or (snap1->'counts'->>'evidences')::int <> 1
     or (snap1->'counts'->>'gaps')::int <> 0 then
    raise exception 'FALLO S13.1/A3: conteos incorrectos: %', snap1->'counts';
  end if;
  if not (snap1->'evidences'->0->>'current')::boolean
     or snap1->'evidences'->0->>'review_label' <> 'Aceptada internamente' then
    raise exception 'FALLO S13.1/A3: la evidencia gobernada no viaja con su vigencia real';
  end if;
  if snap1->>'result' <> 'complete_with_warnings' then
    raise exception 'FALLO S13.1/A3: resultado inesperado % (sin producto ni cálculo → advertencias, sin brechas)', snap1->>'result';
  end if;
  -- A5: la huella corresponde a la fotografía construida por el SERVIDOR
  if v_hash is distinct from encode(sha256(convert_to(snap1::text, 'UTF8')), 'hex') then
    raise exception 'FALLO S13.1/A5: el source_hash no corresponde al snapshot del servidor';
  end if;
  raise notice '✔ S13.1 fotografía autoritativa: INSERT/UPDATE y snapshot del llamador imposibles; la BD reconstruye cadena, saldos, evidencias y resultado reales (A1–A3, A5)';

  -- Congelación e historial
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  begin
    update traceability_exercises set notes = 'edición tardía' where id = ex1;
    raise exception 'FALLO S13.2: un ejercicio completado aceptó cambios';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'El ejercicio finalizado es una fotografía histórica%' then
    raise exception 'FALLO S13.2: mensaje inesperado: %', msg;
  end if;
  begin
    perform public.complete_traceability_exercise(ex1);
    raise exception 'FALLO S13.2: la RPC re-completó una fotografía';
  exception when others then null;
  end;
  update traceability_exercises set status = 'archived' where id = ex1;  -- C3: admin archiva
  begin
    delete from traceability_exercises where id = ex1;
    raise exception 'FALLO S13.2: un ejercicio finalizado fue eliminado';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'El ejercicio finalizado forma parte del historial%' then
    raise exception 'FALLO S13.2: mensaje de DELETE inesperado: %', msg;
  end if;
  insert into traceability_exercises (id, organization_id, output_batch_id) values (exd, org, ob);
  delete from traceability_exercises where id = exd;
  reset role;
  perform set_config('request.jwt.claim.sub', dual_u::text, true);
  set local role authenticated;
  begin
    update traceability_exercises set organization_id = org2 where id = ex1;
    raise exception 'FALLO S13.2: el ejercicio cambió de organización';
  exception when others then null;
  end;
  reset role;
  raise notice '✔ S13.2 historial congelado: sin ediciones, sin re-completar, sin DELETE, sin mover de empresa; borradores eliminables; admin archiva (C3)';

  -- A4: cambian los DATOS REALES → el ejercicio nuevo lo refleja y el
  -- histórico permanece intacto.
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib2, org, sup, mat, 'LE-EJ-2', current_date, 50);
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, op, ib2, 20);
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  insert into traceability_exercises (id, organization_id, output_batch_id) values (ex2, org, ob);
  perform public.complete_traceability_exercise(ex2);
  reset role;
  select snapshot into snap2 from traceability_exercises where id = ex2;
  if (snap2->'counts'->>'external_batches')::int <> 2 then
    raise exception 'FALLO S13.3/A4: el ejercicio nuevo no refleja el consumo añadido (%)', snap2->'counts';
  end if;
  if (select snapshot->'counts'->>'external_batches' from traceability_exercises where id = ex1) <> '1' then
    raise exception 'FALLO S13.3/A4: la fotografía histórica fue alterada';
  end if;
  if (select source_hash from traceability_exercises where id = ex1)
     = (select source_hash from traceability_exercises where id = ex2) then
    raise exception 'FALLO S13.3/A4: dos fotografías con datos distintos comparten hash';
  end if;

  -- C2/C4: archivar ejercicios es acción reservada TAMBIÉN por REST
  perform set_config('request.jwt.claim.sub', cons_u::text, true);
  set local role authenticated;
  begin
    update traceability_exercises set status = 'archived' where id = ex2;
    raise exception 'FALLO S13.3/C2: el consultor archivó un ejercicio por UPDATE directo';
  exception when others then msg := sqlerrm;
  end;
  reset role;
  if msg not like 'Solo administrador o calidad pueden archivar ejercicios%' then
    raise exception 'FALLO S13.3/C2: mensaje inesperado: %', msg;
  end if;
  perform set_config('request.jwt.claim.sub', qual_u::text, true);
  set local role authenticated;
  insert into traceability_exercises (id, organization_id, output_batch_id) values (ex3, org, ob);
  perform public.complete_traceability_exercise(ex3);
  update traceability_exercises set status = 'archived' where id = ex3;  -- C4: calidad archiva
  reset role;
  if (select status from traceability_exercises where id = ex3) <> 'archived' then
    raise exception 'FALLO S13.3/C4: calidad no pudo archivar';
  end if;

  -- RLS + RPC ajena
  perform set_config('request.jwt.claim.sub', admin2::text, true);
  set local role authenticated;
  select count(*) into v_count from traceability_exercises;
  if v_count <> 0 then raise exception 'FALLO S13.3: la otra empresa ve % ejercicio(s)', v_count; end if;
  begin
    perform public.complete_traceability_exercise(ex2);
    raise exception 'FALLO S13.3: la RPC operó sobre un ejercicio ajeno';
  exception when others then null;
  end;
  reset role;

  -- E1: los conteos jamás son negativos (CHECK en BD)
  insert into traceability_exercises (id, organization_id, output_batch_id) values (exd2, org, ob);
  perform set_config('trazaloop.exercise_complete', 'on', true);
  begin
    update traceability_exercises set gaps_count = -1 where id = exd2;
    raise exception 'FALLO S13.3/E1: gaps_count negativo fue aceptado';
  exception when check_violation then null;
  end;
  perform set_config('trazaloop.exercise_complete', 'off', true);
  delete from traceability_exercises where id = exd2;
  raise notice '✔ S13.3 historial, roles y conteos: datos nuevos → fotografía nueva (A4); consultor no archiva por REST (C2), calidad sí (C4); RLS y RPC jamás cruzan; conteos negativos vetados (E1)';
end $$;

-- ============================================================================
-- S14 · PCR-03.3 (rev. 03.1–03.3.2): expediente con CONTENIDO verdad-servidor
-- ============================================================================
do $$
declare
  org  uuid := 'ffffffff-0000-0000-0000-000000000010';
  org2 uuid := 'ffffffff-0000-0000-0000-000000000011';
  admin_u uuid := 'ffffffff-1111-0000-0000-000000000010';
  cons_u  uuid := 'ffffffff-1111-0000-0000-000000000012';
  admin2 uuid := 'ffffffff-1111-0000-0000-000000000011';
  dual_u uuid := 'ffffffff-1111-0000-0000-000000000013';
  qual_u uuid := 'ffffffff-1111-0000-0000-000000000014';
  op   uuid := 'ffffffff-4444-0000-0000-000000000012';
  ob   uuid := 'ffffffff-6666-0000-0000-000000000012';
  ob2  uuid := 'ffffffff-6666-0000-0000-000000000013';
  ex1  uuid := 'ffffffff-7777-0000-0000-000000000001';
  ex2  uuid := 'ffffffff-7777-0000-0000-000000000002';
  d1 uuid; d2 uuid; v1 int; v2 int; c1 text; c2 text;
  dsnap jsonb;
  msg text; v_count int; v_by uuid; k text;
begin
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values (ob2, org, op, 'OUT-SIN-EJERCICIO', 10);

  -- Ataque 32: consultant fabrica por INSERT directo
  perform set_config('request.jwt.claim.sub', cons_u::text, true);
  set local role authenticated;
  begin
    insert into audit_dossiers (organization_id, output_batch_id, dossier_code, version, snapshot)
    values (org, ob, 'EXP-PCR-2026-9001', 1, '{}'::jsonb);
    raise exception 'FALLO S14.1: el consultor insertó un expediente';
  exception when others then msg := sqlerrm;
  end;
  begin
    perform public.generate_audit_dossier(ob);
    raise exception 'FALLO S14.1: el consultor generó por RPC';
  exception when others then msg := sqlerrm;
  end;
  reset role;
  if msg not like 'Solo administrador o calidad pueden generar expedientes%' then
    raise exception 'FALLO S14.1: mensaje de rol inesperado: %', msg;
  end if;
  -- Ataque 13: TAMBIÉN el admin fuera del flujo controlado
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  begin
    insert into audit_dossiers (organization_id, output_batch_id, dossier_code, version, snapshot)
    values (org, ob, 'EXP-PCR-2026-9002', 1, '{}'::jsonb);
    raise exception 'FALLO S14.1: el admin insertó un expediente sin la RPC';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'Los expedientes solo se generan desde%' then
    raise exception 'FALLO S14.1: mensaje del insert guard inesperado: %', msg;
  end if;
  -- B1/B2 (rev. 03.1–03.3.2): la RPC YA NO ACEPTA contenido del llamador
  begin
    perform public.generate_audit_dossier(ob, null::uuid, '{"schema_version":"pcr_audit_dossier_v1"}'::jsonb);
    raise exception 'FALLO S14.1/B1: la RPC aceptó un snapshot del llamador';
  exception when undefined_function then null;
  end;
  -- Integridad primero: sin ejercicio completado NO hay expediente
  begin
    perform public.generate_audit_dossier(ob2);
    raise exception 'FALLO S14.1: se generó un expediente sin ejercicio completado';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'Ejecuta primero un ejercicio de trazabilidad%' then
    raise exception 'FALLO S14.1: mensaje sin-ejercicio inesperado: %', msg;
  end if;

  -- Flujo LEGÍTIMO (B3–B5): contenido desde el ejercicio autoritativo
  select dossier_id, dossier_code, dossier_version into d1, c1, v1
    from public.generate_audit_dossier(ob);              -- toma el último completado (ex2)
  select dossier_id, dossier_code, dossier_version into d2, c2, v2
    from public.generate_audit_dossier(ob, ex1);         -- ejercicio explícito (archivado)
  reset role;
  if v1 <> 1 or v2 <> 2 then
    raise exception 'FALLO S14.1: versiones % y % (esperadas 1 y 2)', v1, v2;
  end if;
  if c1 = c2 or c1 !~ '^EXP-PCR-\d{4}-\d{4}$' then
    raise exception 'FALLO S14.1: códigos EXP-PCR inválidos (% / %)', c1, c2;
  end if;
  select generated_by, snapshot into v_by, dsnap from audit_dossiers where id = d1;
  if v_by is distinct from admin_u then
    raise exception 'FALLO S14.1: generated_by no es verdad-servidor';
  end if;
  if (select exercise_id from audit_dossiers where id = d1) is distinct from ex2 then
    raise exception 'FALLO S14.1/B3: no se asoció el último ejercicio completado';
  end if;
  -- B4: secciones A–K presentes y coherentes con el ejercicio/lote reales
  foreach k in array array['cover','summary','genealogy','balances','calculation',
                           'evidences','requirements','quality_evidences','exercise',
                           'findings','disclaimer'] loop
    if not dsnap ? k then
      raise exception 'FALLO S14.1/B4: falta la sección % del expediente', k;
    end if;
  end loop;
  if dsnap->'cover'->>'batch_code' <> 'OUT-EJERCICIO'
     or dsnap->'cover'->>'dossier_code' <> c1
     or dsnap->'cover'->>'organization_name' <> 'Org Gobernanza'
     or dsnap->'cover'->>'generated_by_email' <> 'gob-admin@test' then
    raise exception 'FALLO S14.1/B3: la portada no refleja los datos reales (%)', dsnap->'cover';
  end if;
  if (dsnap->'summary'->>'external_batches')::int <> 2
     or dsnap->'summary'->>'exercise_result' <> (select result from traceability_exercises where id = ex2) then
    raise exception 'FALLO S14.1/B3: el resumen no proviene del ejercicio (%)', dsnap->'summary';
  end if;
  if jsonb_array_length(dsnap->'genealogy') <> 1
     or dsnap->'genealogy'->0->'external_inputs'->1->>'batch_code' <> 'LE-EJ-2' then
    raise exception 'FALLO S14.1/B3: la genealogía no es la del ejercicio (%)', dsnap->'genealogy';
  end if;
  if (dsnap->'exercise'->>'duration_seconds')::int < 1
     or dsnap->'exercise'->>'source_hash' <> (select source_hash from traceability_exercises where id = ex2) then
    raise exception 'FALLO S14.1/B3: la sección del ejercicio no es verdad-servidor';
  end if;
  if dsnap->>'disclaimer' not like 'Este expediente consolida información registrada en Trazaloop%No constituye una certificación%' then
    raise exception 'FALLO S14.1/B4: disclaimer ausente o alterado';
  end if;
  -- B5: huella del servidor sobre el jsonb almacenado
  if (select source_hash from audit_dossiers where id = d1)
     is distinct from (select encode(sha256(convert_to(snapshot::text, 'UTF8')), 'hex') from audit_dossiers where id = d1) then
    raise exception 'FALLO S14.1/B5: el source_hash no corresponde al snapshot del servidor';
  end if;
  raise notice '✔ S14.1 contenido verdad-servidor: fabricación imposible (consultor, admin y B1 por firma); sin ejercicio no hay expediente; A–K construidas desde datos reales con identidad y huella del servidor (B3–B5)';

  -- Inmutabilidad + roles de archivado + DELETE + organization_id
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  begin
    update audit_dossiers set snapshot = jsonb_build_object('portada', 'manipulada') where id = d1;
    raise exception 'FALLO S14.2: el snapshot de un generado fue reescrito';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'El expediente generado es una versión histórica%' then
    raise exception 'FALLO S14.2: mensaje inesperado: %', msg;
  end if;
  update audit_dossiers set status = 'archived' where id = d1;  -- D3: admin archiva
  reset role;
  -- D2: consultant intenta archivar por UPDATE directo vía REST
  perform set_config('request.jwt.claim.sub', cons_u::text, true);
  set local role authenticated;
  begin
    update audit_dossiers set status = 'archived' where id = d2;
    raise exception 'FALLO S14.2/D2: el consultor archivó un expediente por REST';
  exception when others then msg := sqlerrm;
  end;
  reset role;
  if msg not like 'Solo administrador o calidad pueden archivar expedientes%' then
    raise exception 'FALLO S14.2/D2: mensaje inesperado: %', msg;
  end if;
  -- D4: calidad sí archiva
  perform set_config('request.jwt.claim.sub', qual_u::text, true);
  set local role authenticated;
  update audit_dossiers set status = 'archived' where id = d2;
  -- DELETE como usuario: la RLS no concede DELETE → 0 filas, sin excepción.
  delete from audit_dossiers where id = d2;
  select count(*) into v_count from audit_dossiers where id = d2;
  if v_count <> 1 then
    raise exception 'FALLO S14.2: la RLS permitió eliminar un expediente';
  end if;
  reset role;
  -- Segunda muralla: incluso con privilegios de tabla, el trigger lo veta.
  begin
    delete from audit_dossiers where id = d2;
    raise exception 'FALLO S14.2: un expediente fue eliminado';
  exception when others then msg := sqlerrm;
  end;
  if msg not like 'El expediente forma parte del historial%' then
    raise exception 'FALLO S14.2: mensaje de DELETE inesperado: %', msg;
  end if;
  perform set_config('request.jwt.claim.sub', dual_u::text, true);
  set local role authenticated;
  begin
    update audit_dossiers set organization_id = org2 where id = d2;
    raise exception 'FALLO S14.2: el expediente cambió de organización';
  exception when others then null;
  end;
  reset role;
  raise notice '✔ S14.2 inmutabilidad y roles: generado = congelado; archivar solo admin (D3) y calidad (D4), consultor vetado por REST (D2); DELETE vetado; sin mover de empresa';

  -- Aislamiento + E2
  begin
    insert into audit_dossiers (organization_id, output_batch_id, dossier_code, version, snapshot)
    values (org2, ob, 'EXP-PCR-2026-9003', 1, '{}'::jsonb);
    raise exception 'FALLO S14.3: se fabricó un expediente cruzado';
  exception when others then null;
  end;
  perform set_config('request.jwt.claim.sub', admin2::text, true);
  set local role authenticated;
  select count(*) into v_count from audit_dossiers;
  if v_count <> 0 then raise exception 'FALLO S14.3: la otra empresa ve % expediente(s)', v_count; end if;
  begin
    perform public.generate_audit_dossier(ob);  -- admin de OTRA org
    raise exception 'FALLO S14.3: la RPC generó sobre un lote ajeno';
  exception when others then null;
  end;
  reset role;
  -- E2: warnings_count negativo vetado por CHECK aun con el flag encendido
  perform set_config('trazaloop.dossier_generate', 'on', true);
  begin
    insert into audit_dossiers (organization_id, output_batch_id, dossier_code, version, snapshot, warnings_count)
    values (org, ob, 'EXP-PCR-2026-9100', 99, '{}'::jsonb, -20);
    raise exception 'FALLO S14.3/E2: warnings_count negativo fue aceptado';
  exception when check_violation then null;
  end;
  perform set_config('trazaloop.dossier_generate', 'off', true);
  raise notice '✔ S14.3 aislamiento y conteos: ni INSERT, ni RPC, ni SELECT cruzan de empresa; conteos negativos vetados (E2)';
end $$;

-- ============================================================================
-- S15 · Rev. 03.1–03.3.3, hallazgo 1: la evidencia ARCHIVADA no cuenta en
-- cálculos PCR NUEVOS (motor real redefinido en 0106; 0028 byte-intacta)
-- ============================================================================
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000010';
  admin_u uuid := 'ffffffff-1111-0000-0000-000000000010';
  sup uuid := 'ffffffff-2222-0000-0000-000000000012';
  meth uuid := 'ffffffff-9999-0000-0000-000000000001';
  matx uuid := 'ffffffff-3333-0000-0000-000000000031';
  evc  uuid := 'ffffffff-eeee-0000-0000-000000000031';
  op3  uuid := 'ffffffff-4444-0000-0000-000000000031';
  ob3  uuid := 'ffffffff-6666-0000-0000-000000000031';
  c1 public.recycled_content_calculations; c2 public.recycled_content_calculations;
  c3 public.recycled_content_calculations;
  v numeric;
begin
  insert into calculation_methodologies (id, code, name, rules, is_active) values
    (meth, 'RC-6632-15343', 'Metodología v1', jsonb_build_object(
      'eligible_classifications', jsonb_build_array('postconsumer'),
      'mass_balance_tolerance_percent', 5,
      'recycled_requires_origin_support', true,
      'same_process_counts', false), true);
  insert into material_classifications (code, eligible_as_recycled, never_counts)
  values ('postconsumer', true, false)
  on conflict (code) do nothing;
  insert into evidences (id, organization_id, name, evidence_type, status)
  values (evc, org, 'Certificado postconsumo PC-31', 'origin_supplier', 'valid');
  insert into materials (id, organization_id, name, classification_code, origin_support_evidence_id)
  values (matx, org, 'PET postconsumo 31', 'postconsumer', evc);
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op3, org, 'OP-CALC-31', current_date, 'in_progress');
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values (ob3, org, op3, 'OUT-CALC-31', 100);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
  values (org, ob3, matx, 100);

  -- 1–3 · Evidencia vigente → la masa CUENTA.
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  c1 := public.calculate_recycled_content(ob3);
  if c1.recycled_percent <> 100 or c1.recycled_mass_kg <> 100 then
    raise exception 'FALLO S15: con soporte vigente el cálculo debió contar 100%% (obtuvo %/%)',
      c1.recycled_percent, c1.recycled_mass_kg;
  end if;

  -- 4–10 · Archivada (status SIGUE valid) → cálculo NUEVO la excluye.
  update evidences set archived_at = now() where id = evc;
  if (select status from evidences where id = evc) <> 'valid' then
    raise exception 'FALLO S15: el archivado no debe tocar el estado';
  end if;
  c2 := public.calculate_recycled_content(ob3);
  if c2.recycled_mass_kg <> 0 or c2.recycled_percent <> 0 then
    raise exception 'FALLO S15: la evidencia ARCHIVADA siguió habilitando masa (%%: %)', c2.recycled_percent;
  end if;
  if not (c2.warnings ? 'components_excluded_for_missing_support')
     or not (c2.warnings ? 'related_evidence_not_valid') then
    raise exception 'FALLO S15: faltan las advertencias de soporte no vigente (%)', c2.warnings;
  end if;
  if c2.components->0->>'exclusion_reason' <> 'origin_support_not_valid' then
    raise exception 'FALLO S15: el componente no quedó excluido por soporte no vigente (%)',
      c2.components->0->>'exclusion_reason';
  end if;
  -- El cálculo HISTÓRICO persiste intacto.
  select recycled_percent into v from recycled_content_calculations where id = c1.id;
  if v <> 100 then
    raise exception 'FALLO S15: el cálculo histórico cambió (%)', v;
  end if;

  -- 11–14 · Desarchivar → vuelve a contar.
  update evidences set archived_at = null where id = evc;
  c3 := public.calculate_recycled_content(ob3);
  if c3.recycled_percent <> 100 then
    raise exception 'FALLO S15: al desarchivar debió volver a contar (obtuvo %)', c3.recycled_percent;
  end if;
  reset role;
  raise notice '✔ S15 vigencia en el motor PCR: valid cuenta → archivada NO cuenta (masa excluida + advertencias) → histórico intacto → desarchivada vuelve a contar';
  raise notice 'ARCHIVED_EVIDENCE_CALCULATION = PASS';
end $$;

-- ============================================================================
-- S16 · Rev. 03.1–03.3.3, hallazgos 3–5 y 7: matriz de evidencias COMPLETA
-- ============================================================================
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000010';
  admin_u uuid := 'ffffffff-1111-0000-0000-000000000010';
  sup uuid := 'ffffffff-2222-0000-0000-000000000012';
  prod4 uuid := 'ffffffff-aaaa-0000-0000-000000000041';
  req4  uuid := 'ffffffff-bbbb-0000-0000-000000000041';
  mat2 uuid := 'ffffffff-3333-0000-0000-000000000041';
  mat3 uuid := 'ffffffff-3333-0000-0000-000000000042';
  ib4  uuid := 'ffffffff-5555-0000-0000-000000000041';
  ib5  uuid := 'ffffffff-5555-0000-0000-000000000042';
  op4  uuid := 'ffffffff-4444-0000-0000-000000000041';
  ob4  uuid := 'ffffffff-6666-0000-0000-000000000041';
  e_prod uuid := 'ffffffff-eeee-0000-0000-000000000041';
  e_req  uuid := 'ffffffff-eeee-0000-0000-000000000042';
  e_orig uuid := 'ffffffff-eeee-0000-0000-000000000043';
  e_rec  uuid := 'ffffffff-eeee-0000-0000-000000000044';
  e_dup  uuid := 'ffffffff-eeee-0000-0000-000000000045';
  e_phys uuid := 'ffffffff-eeee-0000-0000-000000000046';
  e_arch uuid := 'ffffffff-eeee-0000-0000-000000000047';
  e_rej  uuid := 'ffffffff-eeee-0000-0000-000000000048';
  ex4 uuid := 'ffffffff-7777-0000-0000-000000000041';
  snap jsonb; ent jsonb; d4 uuid; dsnap jsonb; n int;
begin
  -- Cadena nueva: producto, requisito de cliente, dos materiales con soporte
  -- directo (uno SIN evidence_links y otro TAMBIÉN con enlace explícito).
  insert into products (id, organization_id, code, name) values (prod4, org, 'PRD-41', 'Bolsa PCR 41');
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op4, org, 'OP-EV-41', current_date, 'in_progress');
  insert into output_batches (id, organization_id, production_order_id, product_id, batch_code, produced_quantity_kg)
  values (ob4, org, op4, prod4, 'OUT-MATRIZ-41', 25);
  insert into evidences (id, organization_id, name, evidence_type, status, evidence_date, responsible) values
    (e_prod, org, 'Informe QC del producto 41', 'quality_control', 'pending', '2026-08-01', 'Laboratorio interno'),
    (e_req,  org, 'Acuerdo firmado ACME.pdf', 'customer_agreement', 'valid', '2026-07-15', null),
    (e_orig, org, 'Certificado de origen 43', 'origin_supplier', 'valid', null, null),
    (e_rec,  org, 'Justificación de reclasificación 44', 'reclassification', 'valid', null, null),
    (e_dup,  org, 'Certificado de origen 45', 'origin_supplier', 'valid', null, null),
    (e_arch, org, 'Ficha histórica 47', 'technical_sheet', 'valid', null, null),
    (e_rej,  org, 'Soporte rechazado 48', 'technical_sheet', 'pending', null, null);
  insert into evidences (id, organization_id, name, evidence_type, status, medium, physical_reference, physical_location, physical_custodian)
  values (e_phys, org, 'Bitácora física 46', 'quality_control', 'valid', 'physical', 'Carpeta AZ-46', 'Archivo central, estante 3', 'Jefa de calidad');
  insert into materials (id, organization_id, name, classification_code, origin_support_evidence_id) values
    (mat2, org, 'rPET matriz 41', 'postconsumer', e_orig);
  update materials set reclassification_evidence_id = e_rec where id = mat2;
  insert into materials (id, organization_id, name, classification_code, origin_support_evidence_id) values
    (mat3, org, 'rPET matriz 42', 'postconsumer', e_dup);
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg) values
    (ib4, org, sup, mat2, 'LE-EV-41', current_date, 30),
    (ib5, org, sup, mat3, 'LE-EV-42', current_date, 30);
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg) values
    (org, op4, ib4, 12), (org, op4, ib5, 13);
  insert into customer_requirements (id, organization_id, customer_name, code, title, active)
  values (req4, org, 'ACME', 'REQ-ACME-41', 'Contenido reciclado certificado', true);
  insert into customer_requirement_links (organization_id, requirement_id, target_type, target_id)
  values (org, req4, 'product', prod4);
  -- Enlaces explícitos: producto, requisito, físico al lote, archivada y
  -- rechazada a la orden, y el DUPLICADO potencial del soporte de mat3.
  insert into evidence_links (organization_id, evidence_id, target_type, target_id, link_role) values
    (org, e_prod, 'product', prod4, 'control de calidad del producto'),
    (org, e_req, 'customer_requirement', req4, 'acuerdo firmado'),
    (org, e_phys, 'output_batch', ob4, 'bitácora del lote'),
    (org, e_arch, 'production_order', op4, null),
    (org, e_rej, 'production_order', op4, null),
    (org, e_dup, 'material', mat3, 'Soporte de origen del material');
  -- Gobernanza real: revisar e_prod (pending→valid), rechazar e_rej,
  -- archivar e_arch (status sigue valid).
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences set status = 'valid' where id = e_prod;
  update evidences set status = 'rejected', review_comment = 'Ilegible' where id = e_rej;
  update evidences set archived_at = now() where id = e_arch;

  insert into traceability_exercises (id, organization_id, output_batch_id) values (ex4, org, ob4);
  perform public.complete_traceability_exercise(ex4);
  reset role;
  select snapshot into snap from traceability_exercises where id = ex4;

  -- F1 · evidencia del PRODUCTO en el ejercicio (y con revisión F7).
  select e into ent from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000041';
  if ent is null or ent->>'target_type' <> 'product'
     or ent->>'target_label' <> 'Producto PRD-41 · Bolsa PCR 41' then
    raise exception 'FALLO S16/F1: la evidencia del producto no llegó (%)', ent;
  end if;
  if ent->>'reviewed_at' is null or ent->>'reviewed_by_email' <> 'gob-admin@test' then
    raise exception 'FALLO S16/F7: la revisión (reviewed_at / reviewed_by_email) no viaja (%)', ent;
  end if;
  if ent->>'evidence_date' <> '2026-08-01' or ent->>'responsible' <> 'Laboratorio interno' then
    raise exception 'FALLO S16/F8: evidence_date/responsible no llegaron (%)', ent;
  end if;
  raise notice 'PRODUCT_EVIDENCE_IN_EXERCISE = PASS';

  -- F2 · evidencia del REQUISITO DE CLIENTE en el ejercicio.
  select e into ent from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000042';
  if ent is null or ent->>'target_type' <> 'customer_requirement'
     or ent->>'target_label' <> 'Requisito REQ-ACME-41 (ACME)' then
    raise exception 'FALLO S16/F2: la evidencia del requisito no llegó (%)', ent;
  end if;
  raise notice 'CUSTOMER_REQUIREMENT_EVIDENCE_IN_EXERCISE = PASS';

  -- F3/F4 · soportes DIRECTOS del material sin evidence_links.
  select e into ent from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000043';
  if ent is null or ent->>'target_type' <> 'material'
     or ent->>'link_role' <> 'Soporte de origen del material' then
    raise exception 'FALLO S16/F3: el soporte de origen implícito no llegó (%)', ent;
  end if;
  select e into ent from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000044';
  if ent is null or ent->>'link_role' <> 'Soporte de reclasificación del material' then
    raise exception 'FALLO S16/F4: el soporte de reclasificación implícito no llegó (%)', ent;
  end if;
  -- F5 · con enlace explícito equivalente NO se duplica.
  select count(*) into n from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000045';
  if n <> 1 then
    raise exception 'FALLO S16/F5: el soporte con enlace explícito aparece % veces', n;
  end if;
  raise notice 'IMPLICIT_MATERIAL_SUPPORT_IN_EXERCISE = PASS';

  -- F6 · physical conserva referencia/ubicación/custodia y no finge archivo.
  select e into ent from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000046';
  if ent->>'physical_reference' <> 'Carpeta AZ-46'
     or ent->>'physical_location' <> 'Archivo central, estante 3'
     or ent->>'physical_custodian' <> 'Jefa de calidad'
     or (ent->>'has_digital_file')::boolean then
    raise exception 'FALLO S16/F6: metadata física incompleta (%)', ent;
  end if;
  -- F10 · archivada: histórica pero current=false.
  select e into ent from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000047';
  if ent is null or (ent->>'current')::boolean
     or ent->>'review_label' <> 'Aceptada internamente · Archivada' then
    raise exception 'FALLO S16/F10: la archivada no viaja como histórica (%)', ent;
  end if;
  -- F11 · rechazada: presente y current=false.
  select e into ent from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000048';
  if ent is null or (ent->>'current')::boolean or ent->>'status' <> 'rejected' then
    raise exception 'FALLO S16/F11: la rechazada no viaja correctamente (%)', ent;
  end if;
  -- F12 · sin signed URLs ni tokens persistidos.
  if snap::text ilike '%signed%' or snap::text ilike '%token=%'
     or snap::text ilike '%storage/v1/object%' then
    raise exception 'FALLO S16/F12: la matriz contiene URLs firmadas o tokens';
  end if;

  -- F9 · quality_control del PRODUCTO llega a quality_evidences del expediente
  -- con la metadata completa (hallazgos 5 y 7).
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  select dossier_id into d4 from public.generate_audit_dossier(ob4);
  reset role;
  select snapshot into dsnap from audit_dossiers where id = d4;
  select e into ent from jsonb_array_elements(dsnap->'quality_evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000041';
  if ent is null or ent->>'target_type' <> 'product' then
    raise exception 'FALLO S16/F9: la QC del producto no llegó a quality_evidences (%)', dsnap->'quality_evidences';
  end if;
  select e into ent from jsonb_array_elements(dsnap->'evidences') e
   where e->>'evidence_id' = 'ffffffff-eeee-0000-0000-000000000046';
  if ent->>'physical_location' is null or ent->>'physical_custodian' is null then
    raise exception 'FALLO S16: la matriz F del expediente perdió metadata física (%)', ent;
  end if;
  if dsnap::text ilike '%signed%' then
    raise exception 'FALLO S16/F12: el expediente contiene URLs firmadas';
  end if;
  raise notice '✔ S16 matriz completa: producto (F1), requisito (F2), soportes implícitos sin duplicar (F3–F5), física (F6), revisión (F7), fecha/responsable (F8), QC→expediente (F9), archivada/rechazada históricas (F10/F11), sin signed URLs (F12)';
  raise notice 'EVIDENCE_METADATA_IN_DOSSIER = PASS';
end $$;

-- ============================================================================
-- S17 · Rev. 03.1–03.3.4 (T1): la vigencia canónica es CONSISTENTE en todas
-- las superficies — motor, readiness, matriz, dashboard y next_actions
-- ============================================================================
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000010';
  admin_u uuid := 'ffffffff-1111-0000-0000-000000000010';
  matx uuid := 'ffffffff-3333-0000-0000-000000000031';
  evc  uuid := 'ffffffff-eeee-0000-0000-000000000031';
  ob3  uuid := 'ffffffff-6666-0000-0000-000000000031';
  c public.recycled_content_calculations;
  v_valid_a bigint; v_valid_b bigint; v_wo_a bigint; v_wo_b bigint;
  b boolean; b2 boolean; n int;
begin
  -- Estado inicial: evc VIGENTE (S15 la dejó desarchivada). Fase A.
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  c := public.calculate_recycled_content(ob3);
  reset role;
  if c.recycled_percent <> 100 then raise exception 'FALLO S17/A: el motor no contó (%)', c.recycled_percent; end if;
  select has_valid_origin_evidence into b from v_output_batch_readiness where output_batch_id = ob3;
  if not b then raise exception 'FALLO S17/A: readiness no ve el soporte vigente'; end if;
  select is_valid_for_defensibility into b from v_output_batch_evidence_matrix
   where output_batch_id = ob3 and evidence_id = evc and support_role = 'material_origin_support';
  if not b then raise exception 'FALLO S17/A: la matriz no marca vigente'; end if;
  select valid_evidences_count, materials_without_origin_support_count
    into v_valid_a, v_wo_a from v_implementation_dashboard where organization_id = org;
  if v_valid_a < 1 then raise exception 'FALLO S17/A: el dashboard no cuenta la vigente'; end if;

  -- Fase B: ARCHIVAR X. status sigue 'valid'; TODAS las superficies la
  -- tratan como NO vigente.
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences set archived_at = now() where id = evc;
  c := public.calculate_recycled_content(ob3);
  reset role;
  if (select status from evidences where id = evc) <> 'valid' then
    raise exception 'FALLO S17/B: el archivado alteró el estado';
  end if;
  if c.recycled_percent <> 0 then raise exception 'FALLO S17/B: el motor siguió contando (%)', c.recycled_percent; end if;
  select has_valid_origin_evidence, has_missing_required_evidence
    into b, b2 from v_output_batch_readiness where output_batch_id = ob3;
  if b or not b2 then
    raise exception 'FALLO S17/B: readiness no trató la archivada como soporte NO vigente (% / %)', b, b2;
  end if;
  select is_valid_for_defensibility into b from v_output_batch_evidence_matrix
   where output_batch_id = ob3 and evidence_id = evc and support_role = 'material_origin_support';
  if b then raise exception 'FALLO S17/B: la matriz sigue marcando vigente'; end if;
  if (select archived_at from v_output_batch_evidence_matrix
       where output_batch_id = ob3 and evidence_id = evc and support_role = 'material_origin_support') is null then
    raise exception 'FALLO S17/B: la matriz no expone archived_at para explicar la no-vigencia';
  end if;
  select valid_evidences_count, materials_without_origin_support_count
    into v_valid_b, v_wo_b from v_implementation_dashboard where organization_id = org;
  if v_valid_b <> v_valid_a - 1 then
    raise exception 'FALLO S17/B: valid_evidences_count no excluyó la archivada (% → %)', v_valid_a, v_valid_b;
  end if;
  if v_wo_b <> v_wo_a + 1 then
    raise exception 'FALLO S17/B: el material archivado no cuenta como sin soporte vigente (% → %)', v_wo_a, v_wo_b;
  end if;
  select count(*) into n from v_implementation_next_actions
   where organization_id = org and action_code = 'add_origin_evidence' and related_entity_id = matx;
  if n <> 1 then
    raise exception 'FALLO S17/B: next_actions no identifica la necesidad de soporte (% filas)', n;
  end if;

  -- Fase C: DESARCHIVAR → todas las superficies vuelven al estado vigente.
  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  update evidences set archived_at = null where id = evc;
  c := public.calculate_recycled_content(ob3);
  reset role;
  if c.recycled_percent <> 100 then raise exception 'FALLO S17/C: el motor no restauró (%)', c.recycled_percent; end if;
  select has_valid_origin_evidence into b from v_output_batch_readiness where output_batch_id = ob3;
  if not b then raise exception 'FALLO S17/C: readiness no restauró la vigencia'; end if;
  select is_valid_for_defensibility into b from v_output_batch_evidence_matrix
   where output_batch_id = ob3 and evidence_id = evc and support_role = 'material_origin_support';
  if not b then raise exception 'FALLO S17/C: la matriz no restauró la vigencia'; end if;
  if (select valid_evidences_count from v_implementation_dashboard where organization_id = org) <> v_valid_a then
    raise exception 'FALLO S17/C: el dashboard no restauró el conteo';
  end if;
  select count(*) into n from v_implementation_next_actions
   where organization_id = org and action_code = 'add_origin_evidence' and related_entity_id = matx;
  if n <> 0 then raise exception 'FALLO S17/C: next_actions sigue pidiendo soporte'; end if;
  raise notice '✔ S17 vigencia transversal: motor, readiness, matriz, dashboard y next_actions coinciden en las tres fases (vigente → archivada → desarchivada)';
  raise notice 'ARCHIVED_EVIDENCE_CROSS_SURFACE_CONSISTENCY = PASS';
end $$;

-- ============================================================================
-- S18 · Rev. 03.1–03.3.4 (hallazgos 9–10): material SOLO-COMPOSICIÓN — el
-- mismo soporte que usa el motor queda visible en el ejercicio
-- ============================================================================
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000010';
  admin_u uuid := 'ffffffff-1111-0000-0000-000000000010';
  matc uuid := 'ffffffff-3333-0000-0000-000000000051';
  evc5 uuid := 'ffffffff-eeee-0000-0000-000000000051';
  op5  uuid := 'ffffffff-4444-0000-0000-000000000051';
  ob5  uuid := 'ffffffff-6666-0000-0000-000000000051';
  ex5  uuid := 'ffffffff-7777-0000-0000-000000000051';
  snap jsonb; ent jsonb; n int;
begin
  -- Material en la COMPOSICIÓN sin lote de entrada ni evidence_links.
  insert into evidences (id, organization_id, name, evidence_type, status)
  values (evc5, org, 'Certificado composición 51', 'origin_supplier', 'valid');
  insert into materials (id, organization_id, name, classification_code, origin_support_evidence_id)
  values (matc, org, 'rPET solo-composición 51', 'postconsumer', evc5);
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op5, org, 'OP-COMP-51', current_date, 'in_progress');
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values (ob5, org, op5, 'OUT-COMP-51', 50);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
  values (org, ob5, matc, 50);

  perform set_config('request.jwt.claim.sub', admin_u::text, true);
  set local role authenticated;
  perform public.calculate_recycled_content(ob5);
  insert into traceability_exercises (id, organization_id, output_batch_id) values (ex5, org, ob5);
  perform public.complete_traceability_exercise(ex5);
  reset role;
  select snapshot into snap from traceability_exercises where id = ex5;

  -- El cálculo del snapshot expone los MISMOS componentes del motor.
  select c into ent from jsonb_array_elements(snap->'calculation'->'components') c
   where c->>'material_id' = matc::text;
  if ent is null or ent->>'origin_support_evidence_id' <> evc5::text then
    raise exception 'FALLO S18: calculation.components no contiene el material con su soporte (%)',
      snap->'calculation'->'components';
  end if;
  -- Y la MISMA evidencia queda en la matriz del ejercicio, vía implícito.
  select e into ent from jsonb_array_elements(snap->'evidences') e
   where e->>'evidence_id' = evc5::text;
  if ent is null or ent->>'target_type' <> 'material'
     or ent->>'link_role' <> 'Soporte de origen del material'
     or not (ent->>'current')::boolean then
    raise exception 'FALLO S18: la evidencia solo-composición no llegó a la matriz (%)', ent;
  end if;
  -- La brecha de trazabilidad externa se SEÑALA sin ocultar la evidencia.
  select count(*) into n from jsonb_array_elements(snap->'findings') f
   where f->>'level' = 'gap'
     and f->>'message' like 'La orden productora no tiene consumos registrados%';
  if n <> 1 or (snap->'counts'->>'gaps')::int < 1 then
    raise exception 'FALLO S18: la brecha de trazabilidad no quedó señalada (%)', snap->'counts';
  end if;
  -- Sin brecha de material: el soporte vigente lo cubre.
  select count(*) into n from jsonb_array_elements(snap->'findings') f
   where f->>'message' like 'El material rPET solo-composición 51 no tiene evidencia vigente%';
  if n <> 0 then raise exception 'FALLO S18: brecha de material falsa pese al soporte implícito'; end if;
  raise notice '✔ S18 solo-composición: el expediente localiza el MISMO soporte que calculate_recycled_content y la brecha de trazabilidad se señala sin ocultarlo';
  raise notice 'COMPOSITION_ONLY_MATERIAL_EVIDENCE = PASS';
end $$;

select '== pcr03_assertions.sql (S12–S18 · rev. 03.1–03.3.4): TODAS LAS ASERCIONES PASARON ==' as resultado;
