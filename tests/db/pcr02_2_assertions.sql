-- ============================================================================
-- tests/db/pcr02_2_assertions.sql · PCR-02.2
-- Aserciones CONDUCTUALES del micro-sprint de hardening, sobre la 0104 REAL
-- ya aplicada por el runner (tras las 33 aserciones de PCR-02.1).
--
-- S7 · Hallazgo A — inmutabilidad de órdenes cerradas/canceladas (§13/§14):
--      A1 draft eliminable · A2 in_progress eliminable (comportamiento
--      histórico) · A3 closed FAIL · A4 cancelled FAIL · A5 closed con
--      consumo externo FAIL sin cascada · A6 closed con consumo interno
--      FAIL con genealogía intacta · A7 bypass con rol authenticated FAIL.
--      (A8, la server action, se candadea en tests/unit/pcr02-2: no es SQL.)
-- S8 · Hallazgo B — completitud fail-closed (§27): B1 raíz válida · B2
--      cadena interna válida · B3 dead end · B4 ciclo interno puro · B5 la
--      composición no rescata al ciclo · B6 ciclo mixto (rama externa
--      válida + rama cíclica → incomplete, decisión §25) · B7 profundidad
--      dentro del límite · B8 raíz fuera del límite · B9 varias ramas
--      completas · B10 una rama incompleta.
-- R  · Regresiones demostradas (§52): R1 la fórmula PCR-02.1 habría dado
--      proveedor=true al ciclo puro; R2 ídem al recorrido truncado.
-- NOTA PCR-02.3: el mensaje del trigger de DELETE se unificó al semántico
-- «Esta orden ya forma parte del historial…» (vale también para reabiertas);
-- estas aserciones comparan por igualdad contra el mensaje vigente.
-- ============================================================================
set statement_timeout = '10s';

-- ---------------------------------------------------------------------------
-- S7 · PROTECCIÓN DE BORRADO DEL HISTORIAL (hallazgo A)
-- ---------------------------------------------------------------------------
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000001';
  sup uuid := 'ffffffff-2222-0000-0000-000000000001';
  mat uuid := 'ffffffff-3333-0000-0000-000000000001';
  ib  uuid := 'ffffffff-5555-0000-0000-000000000001';
  v_count int; msg text; msg2 text;
begin
  insert into organizations (id, name) values (org, 'Org Historial');
  insert into profiles (id, email) values ('ffffffff-1111-0000-0000-000000000001', 'admin-f@test');
  insert into organization_members (organization_id, profile_id, role)
  values (org, 'ffffffff-1111-0000-0000-000000000001', 'admin');
  insert into suppliers (id, organization_id, name) values (sup, org, 'Prov F');
  insert into materials (id, organization_id, name, classification_code) values (mat, org, 'Mat F', 'PET');
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib, org, sup, mat, 'LE-F', current_date, 500);

  -- A1 · draft sin dependencias: eliminable (comportamiento histórico)
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a1', org, 'OP-DRAFT', current_date, 'draft');
  delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a1';
  if exists (select 1 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a1') then
    raise exception 'FALLO S7.A1: la orden draft no pudo eliminarse';
  end if;
  raise notice '✔ S7.A1 draft sin dependencias sigue siendo eliminable';

  -- A2 · in_progress sin dependencias: eliminable (comportamiento histórico
  --      conservado; la protección de historia es SOLO closed/cancelled)
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a2', org, 'OP-INPROG', current_date, 'in_progress');
  delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a2';
  if exists (select 1 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a2') then
    raise exception 'FALLO S7.A2: la orden in_progress no pudo eliminarse';
  end if;
  raise notice '✔ S7.A2 in_progress sin dependencias conserva su comportamiento';

  -- A3 · closed: DELETE directo debe fallar con el mensaje pactado
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a3', org, 'OP-CLOSED', current_date, 'closed');
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a3';
    raise exception 'FALLO S7.A3: la orden cerrada se eliminó';
  exception when others then
    msg := sqlerrm;
  end;
  if msg <> 'Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.' then
    raise exception 'FALLO S7.A3: mensaje inesperado: %', msg;
  end if;
  raise notice '✔ S7.A3 orden cerrada: DELETE directo rechazado con el mensaje pactado';

  -- A4 · cancelled: mismo comportamiento
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a4', org, 'OP-CANC', current_date, 'cancelled');
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a4';
    raise exception 'FALLO S7.A4: la orden cancelada se eliminó';
  exception when others then
    msg2 := sqlerrm;
  end;
  if msg2 <> msg then
    raise exception 'FALLO S7.A4: cancelada respondió distinto que cerrada: %', msg2;
  end if;
  raise notice '✔ S7.A4 orden cancelada: DELETE directo rechazado (mismo mensaje)';

  -- A5 + §14 · NO-CASCADA HISTÓRICA: input batch → consumo → orden CLOSED
  -- (PCR-02.4: ciclo realista — el consumo se registra con la orden abierta
  --  y DESPUÉS se cierra, porque §2e congela la estructura de cerradas)
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a5', org, 'OP-CLOSED-C', current_date, 'in_progress');
  insert into batch_consumption (id, organization_id, production_order_id, input_batch_id, mass_kg)
  values ('ffffffff-7777-0000-0000-0000000000a5', org, 'ffffffff-4444-0000-0000-0000000000a5', ib, 40);
  update production_orders set status = 'closed' where id = 'ffffffff-4444-0000-0000-0000000000a5';
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a5';
    raise exception 'FALLO S7.A5: la orden cerrada con consumo se eliminó';
  exception when others then null;
  end;
  select count(*) into v_count from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a5';
  if v_count <> 1 then raise exception 'FALLO S7.A5: la orden desapareció'; end if;
  select count(*) into v_count from batch_consumption where id = 'ffffffff-7777-0000-0000-0000000000a5';
  if v_count <> 1 then raise exception 'FALLO S7.A5: el consumo histórico se perdió (cascada)'; end if;
  select count(*) into v_count from input_batches where id = ib;
  if v_count <> 1 then raise exception 'FALLO S7.A5: el lote de entrada se perdió'; end if;
  raise notice '✔ S7.A5 (+§14) orden cerrada con consumo externo: nada se elimina, la cascada jamás arranca';

  -- A6 · closed como CONSUMIDORA de un lote interno: genealogía intacta
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a6', org, 'OP-PROD-F', current_date, 'in_progress');
  insert into output_batches (id, organization_id, production_order_id, batch_code)
  values ('ffffffff-6666-0000-0000-0000000000a6', org, 'ffffffff-4444-0000-0000-0000000000a6', 'INT-F');
  -- (PCR-02.4: ciclo realista — consume abierta y luego se cierra)
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a7', org, 'OP-CLOSED-2', current_date, 'in_progress');
  insert into output_batch_consumption (id, organization_id, production_order_id, output_batch_id, mass_kg)
  values ('ffffffff-8888-0000-0000-0000000000a6', org, 'ffffffff-4444-0000-0000-0000000000a7',
          'ffffffff-6666-0000-0000-0000000000a6', 7);
  update production_orders set status = 'closed' where id = 'ffffffff-4444-0000-0000-0000000000a7';
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a7';
    raise exception 'FALLO S7.A6: la orden cerrada con consumo interno se eliminó';
  exception when others then null;
  end;
  select count(*) into v_count from output_batch_consumption where id = 'ffffffff-8888-0000-0000-0000000000a6';
  if v_count <> 1 then raise exception 'FALLO S7.A6: la genealogía perdió el consumo interno'; end if;
  raise notice '✔ S7.A6 orden cerrada con consumo interno: la genealogía no cambia';
end $$;

-- A7 · Bypass con el rol autenticado real (RLS DELETE = admin/quality):
--      una orden elegible SÍ se borra; una cerrada sigue fallando.
do $$
declare v_count int; msg text;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-1111-0000-0000-000000000001', true);
  set local role authenticated;
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000a8', 'ffffffff-0000-0000-0000-000000000001',
          'OP-DRAFT-2', current_date, 'draft');
  delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a8';
  select count(*) into v_count from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a8';
  if v_count <> 0 then raise exception 'FALLO S7.A7: el admin no pudo borrar una orden elegible'; end if;
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000a3';
    raise exception 'FALLO S7.A7: el admin autenticado eliminó una orden cerrada';
  exception when others then
    msg := sqlerrm;
  end;
  if msg <> 'Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.' then
    raise exception 'FALLO S7.A7: mensaje inesperado bajo authenticated: %', msg;
  end if;
  reset role;
  raise notice '✔ S7.A7 bypass de la app (rol authenticated + RLS): elegible sí, cerrada NO — trigger y RLS conviven';
end $$;

-- ---------------------------------------------------------------------------
-- S8 · COMPLETITUD FAIL-CLOSED (hallazgo B)
-- ---------------------------------------------------------------------------
-- Org G: raíz válida, cadena válida, ciclo puro, ciclo mixto, ramas.
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000002';
  sup uuid := gen_random_uuid(); mat uuid := gen_random_uuid();
  ib  uuid := gen_random_uuid();
  v_status text; v_missing text[]; v_old boolean;
begin
  insert into organizations (id, name) values (org, 'Org FailClosed');
  insert into suppliers (id, organization_id, name) values (sup, org, 'Prov G');
  insert into materials (id, organization_id, name, classification_code) values (mat, org, 'Mat G', 'PET');
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib, org, sup, mat, 'EXT-G', current_date, 1000);

  -- B1 · Raíz externa válida directa: EXT → OP-R → OUT-R (con composición)
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000b1', org, 'OP-R', current_date, 'in_progress');
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, 'ffffffff-4444-0000-0000-0000000000b1', ib, 100);
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values ('ffffffff-6666-0000-0000-0000000000b1', org, 'ffffffff-4444-0000-0000-0000000000b1', 'OUT-R', 98);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
  values (org, 'ffffffff-6666-0000-0000-0000000000b1', mat, 98);
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = 'ffffffff-6666-0000-0000-0000000000b1';
  if v_status <> 'complete' then
    raise exception 'FALLO S8.B1: raíz externa válida esperaba complete, fue %', v_status;
  end if;
  raise notice '✔ S8.B1 raíz externa válida → complete';

  -- B2 + B9 · Cadena interna válida con DOS ramas completas:
  -- OP-F consume OUT-R (interna documentada) + EXT-G (externa) → FIN-G
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000b2', org, 'OP-F', current_date, 'in_progress');
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
  values (org, 'ffffffff-4444-0000-0000-0000000000b2', 'ffffffff-6666-0000-0000-0000000000b1', 90);
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, 'ffffffff-4444-0000-0000-0000000000b2', ib, 10);
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values ('ffffffff-6666-0000-0000-0000000000b2', org, 'ffffffff-4444-0000-0000-0000000000b2', 'FIN-G', 97);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
  values (org, 'ffffffff-6666-0000-0000-0000000000b2', mat, 97);
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = 'ffffffff-6666-0000-0000-0000000000b2';
  if v_status <> 'complete' then
    raise exception 'FALLO S8.B2/B9: cadena válida multi-rama esperaba complete, fue %', v_status;
  end if;
  raise notice '✔ S8.B2+B9 cadena interna válida y varias ramas completas → complete';

  -- B3 + B10 · Dead end en UNA rama: OP-M consume EXT-G (válida) + INT-DE
  -- producido por OP-DE que NO registra consumos → incomplete
  insert into production_orders (id, organization_id, order_code, order_date, status) values
    ('ffffffff-4444-0000-0000-0000000000b3', org, 'OP-DE', current_date, 'in_progress'),
    ('ffffffff-4444-0000-0000-0000000000b4', org, 'OP-M', current_date, 'in_progress');
  insert into output_batches (id, organization_id, production_order_id, batch_code)
  values ('ffffffff-6666-0000-0000-0000000000b3', org, 'ffffffff-4444-0000-0000-0000000000b3', 'INT-DE');
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, 'ffffffff-4444-0000-0000-0000000000b4', ib, 5);
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
  values (org, 'ffffffff-4444-0000-0000-0000000000b4', 'ffffffff-6666-0000-0000-0000000000b3', 5);
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values ('ffffffff-6666-0000-0000-0000000000b4', org, 'ffffffff-4444-0000-0000-0000000000b4', 'FIN-DE', 9);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
  values (org, 'ffffffff-6666-0000-0000-0000000000b4', mat, 9);
  select traceability_status, missing_items into v_status, v_missing
    from v_output_batch_completeness
   where output_batch_id = 'ffffffff-6666-0000-0000-0000000000b4';
  if v_status <> 'incomplete' or not ('información de proveedor' = any (v_missing)) then
    raise exception 'FALLO S8.B3/B10: dead end en una rama esperaba incomplete, fue % (%)', v_status, v_missing;
  end if;
  raise notice '✔ S8.B3+B10 dead end en una rama (las demás válidas) → incomplete (AND fail-closed)';

  -- B4 + B5 · Ciclo interno PURO con composición suficiente en ambos lotes
  insert into production_orders (id, organization_id, order_code, order_date, status) values
    ('ffffffff-4444-0000-0000-0000000000b5', org, 'OP-CY1', current_date, 'in_progress'),
    ('ffffffff-4444-0000-0000-0000000000b6', org, 'OP-CY2', current_date, 'in_progress');
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('ffffffff-6666-0000-0000-0000000000b5', org, 'ffffffff-4444-0000-0000-0000000000b5', 'OUT-CY1', 50),
    ('ffffffff-6666-0000-0000-0000000000b6', org, 'ffffffff-4444-0000-0000-0000000000b6', 'OUT-CY2', 50);
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg) values
    (org, 'ffffffff-4444-0000-0000-0000000000b6', 'ffffffff-6666-0000-0000-0000000000b5', 48),
    (org, 'ffffffff-4444-0000-0000-0000000000b5', 'ffffffff-6666-0000-0000-0000000000b6', 48);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg) values
    (org, 'ffffffff-6666-0000-0000-0000000000b5', mat, 48),
    (org, 'ffffffff-6666-0000-0000-0000000000b6', mat, 48);
  select traceability_status, missing_items into v_status, v_missing
    from v_output_batch_completeness
   where output_batch_id = 'ffffffff-6666-0000-0000-0000000000b5';
  if v_status <> 'incomplete' or not ('información de proveedor' = any (v_missing)) then
    raise exception 'FALLO S8.B4: ciclo interno puro esperaba incomplete, fue % (%)', v_status, v_missing;
  end if;
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = 'ffffffff-6666-0000-0000-0000000000b6';
  if v_status <> 'incomplete' then
    raise exception 'FALLO S8.B4: el otro lote del ciclo también debía ser incomplete, fue %', v_status;
  end if;
  raise notice '✔ S8.B4+B5 ciclo interno puro (aun con composición) → incomplete: la composición no sustituye procedencia';

  -- R1 · Regresión demostrada (§52): la fórmula PCR-02.1
  -- bool_and(coalesce(all_have_supplier, true)) sobre el cierre del ciclo
  -- {OP-CY1, OP-CY2} da TRUE (ningún consumo externo → NULL → true):
  select bool_and(coalesce(ex.all_have_supplier, true)) into v_old
  from (values ('ffffffff-4444-0000-0000-0000000000b5'::uuid),
               ('ffffffff-4444-0000-0000-0000000000b6'::uuid)) closure(ord)
  left join (
    select bc.production_order_id, bool_and(ib2.supplier_id is not null) as all_have_supplier
    from batch_consumption bc join input_batches ib2 on ib2.id = bc.input_batch_id
    group by bc.production_order_id
  ) ex on ex.production_order_id = closure.ord;
  if v_old is distinct from true then
    raise exception 'FALLO S8.R1: la demostración de regresión no aplica';
  end if;
  raise notice '✔ S8.R1 (regresión demostrada) la fórmula PCR-02.1 habría dado proveedor=true al ciclo puro';

  -- B6 · Ciclo MIXTO: OP-MX1 consume EXT-G (rama válida) + OUT-MX2; OP-MX2
  -- consume OUT-MX1 → el ciclo invalida aunque exista raíz externa (§25)
  insert into production_orders (id, organization_id, order_code, order_date, status) values
    ('ffffffff-4444-0000-0000-0000000000b7', org, 'OP-MX1', current_date, 'in_progress'),
    ('ffffffff-4444-0000-0000-0000000000b8', org, 'OP-MX2', current_date, 'in_progress');
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('ffffffff-6666-0000-0000-0000000000b7', org, 'ffffffff-4444-0000-0000-0000000000b7', 'OUT-MX1', 30),
    ('ffffffff-6666-0000-0000-0000000000b8', org, 'ffffffff-4444-0000-0000-0000000000b8', 'OUT-MX2', 30);
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, 'ffffffff-4444-0000-0000-0000000000b7', ib, 15);
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg) values
    (org, 'ffffffff-4444-0000-0000-0000000000b7', 'ffffffff-6666-0000-0000-0000000000b8', 14),
    (org, 'ffffffff-4444-0000-0000-0000000000b8', 'ffffffff-6666-0000-0000-0000000000b7', 14);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
  values (org, 'ffffffff-6666-0000-0000-0000000000b7', mat, 29);
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = 'ffffffff-6666-0000-0000-0000000000b7';
  if v_status <> 'incomplete' then
    raise exception 'FALLO S8.B6: ciclo mixto esperaba incomplete, fue %', v_status;
  end if;
  raise notice '✔ S8.B6 ciclo mixto (rama externa válida + rama cíclica) → incomplete (decisión §25 documentada)';
end $$;

-- B7/B8 · Profundidad: cadena de 13 órdenes (raíz externa en la nº 13).
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000003';
  sup uuid := gen_random_uuid(); mat uuid := gen_random_uuid(); ib uuid := gen_random_uuid();
  ords uuid[] := '{}'; outs uuid[] := '{}'; i int;
  v_status text; v_old boolean;
begin
  insert into organizations (id, name) values (org, 'Org Profundidad');
  insert into suppliers (id, organization_id, name) values (sup, org, 'Prov P');
  insert into materials (id, organization_id, name, classification_code) values (mat, org, 'Mat P', 'PET');
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib, org, sup, mat, 'LE-RAIZ', current_date, 1000);
  for i in 1..13 loop
    ords := ords || gen_random_uuid(); outs := outs || gen_random_uuid();
    insert into production_orders (id, organization_id, order_code, order_date, status)
    values (ords[i], org, 'OP-' || i, current_date, 'in_progress');
    insert into output_batches (id, organization_id, production_order_id, batch_code)
    values (outs[i], org, ords[i], 'OUT-' || i);
  end loop;
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, ords[13], ib, 10);
  for i in 1..12 loop
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values (org, ords[i], outs[i+1], 5);
  end loop;
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
  values (org, outs[1], mat, 5);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
  values (org, outs[5], mat, 5);

  -- B7 · OUT-5: raíz a 8 saltos (dentro del límite 10) → complete
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = outs[5];
  if v_status <> 'complete' then
    raise exception 'FALLO S8.B7: raíz dentro del límite esperaba complete, fue %', v_status;
  end if;
  raise notice '✔ S8.B7 raíz alcanzada dentro del límite de profundidad → complete';

  -- B8 · OUT-1: la raíz EXISTE pero queda a 12 saltos (fuera del límite) →
  -- fail-closed: incomplete
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = outs[1];
  if v_status <> 'incomplete' then
    raise exception 'FALLO S8.B8: raíz fuera del límite esperaba incomplete (fail-closed), fue %', v_status;
  end if;
  raise notice '✔ S8.B8 recorrido truncado por profundidad → incomplete (fail-closed)';

  -- R2 · Regresión demostrada (§52): la fórmula PCR-02.1 sobre el cierre
  -- alcanzable de OUT-1 (órdenes 1..11: solo la 13 tiene consumo externo,
  -- fuera del cierre) da TRUE → habría clasificado complete.
  select bool_and(coalesce(ex.all_have_supplier, true)) into v_old
  from unnest(ords[1:11]) closure(ord)
  left join (
    select bc.production_order_id, bool_and(ib2.supplier_id is not null) as all_have_supplier
    from batch_consumption bc join input_batches ib2 on ib2.id = bc.input_batch_id
    group by bc.production_order_id
  ) ex on ex.production_order_id = closure.ord;
  if v_old is distinct from true then
    raise exception 'FALLO S8.R2: la demostración de regresión no aplica';
  end if;
  raise notice '✔ S8.R2 (regresión demostrada) la fórmula PCR-02.1 habría dado proveedor=true al recorrido truncado';
end $$;

select '== pcr02_2_assertions.sql: TODAS LAS ASERCIONES PASARON ==' as resultado;
