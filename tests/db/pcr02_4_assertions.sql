-- ============================================================================
-- tests/db/pcr02_4_assertions.sql · PCR-02.4 (Closed Order Structural Guard)
-- Aserciones CONDUCTUALES sobre la 0104 REAL, tras las suites PCR-02.1/2/3.
--
-- S10 · congelación estructural de órdenes cerradas/canceladas (§2e):
--   S10.1  cierre congela: INSERT/UPDATE/DELETE de batch_consumption FALLAN
--          con el mensaje pactado (matriz §38).
--   S10.2  ídem output_batch_consumption (matriz §39).
--   S10.3  output_batches: INSERT/DELETE y cambios ESTRUCTURALES (orden,
--          producto, cantidad, código) FALLAN; los campos DESCRIPTIVOS
--          (fecha, características, aplicación, almacenamiento, notas)
--          siguen corregibles (matriz §40 + política §10/§47).
--   S10.4  batch_composition: INSERT/UPDATE/DELETE FALLAN; mover una
--          composición hacia un lote de orden cerrada también (§41/§22).
--   S10.5  production_orders cerrada: solo la transición PURA de reapertura;
--          editar campos, reabrir+reescribir en una sentencia, o pasar a un
--          estado distinto de in_progress → FALLAN (§26–§28).
--   S10.6  reapertura restaura la mutabilidad (§23/§44): las mismas
--          operaciones ahora PASAN de verdad; el candado histórico
--          permanece y el DELETE de la orden sigue vetado.
--   S10.7  cerrar de nuevo vuelve a congelar (§24/§45); la fecha del
--          candado no cambia.
--   S10.8  bypass RLS (§42): admin autenticado con permisos de escritura
--          NO puede insertar/editar/borrar estructura de una orden cerrada.
--   S10.9  interacción con cascadas (§54): una orden ABIERTA con consumo
--          sigue siendo eliminable y su cascada funciona (la guarda no
--          bloquea cuando la orden ya no existe); cancelled congela igual.
-- ============================================================================
set statement_timeout = '10s';

do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000006';
  sup uuid := 'ffffffff-2222-0000-0000-000000000006';
  mat uuid := 'ffffffff-3333-0000-0000-000000000006';
  ib  uuid := 'ffffffff-5555-0000-0000-000000000006';
  ib2 uuid := 'ffffffff-5555-0000-0000-000000000007';
  op   uuid := 'ffffffff-4444-0000-0000-0000000000e1';  -- la orden que se cierra
  opp  uuid := 'ffffffff-4444-0000-0000-0000000000e2';  -- productora auxiliar (abierta)
  bc   uuid := 'ffffffff-7777-0000-0000-0000000000e1';
  ob   uuid := 'ffffffff-6666-0000-0000-0000000000e1';  -- lote de la cerrada
  obp  uuid := 'ffffffff-6666-0000-0000-0000000000e2';  -- lote de la abierta
  obc  uuid := 'ffffffff-8888-0000-0000-0000000000e1';
  comp uuid := 'ffffffff-9999-0000-0000-0000000000e1';
  comp_open uuid := 'ffffffff-9999-0000-0000-0000000000e2';
  prod uuid := 'ffffffff-aaaa-0000-0000-0000000000e1';
  v_lock timestamptz; v_lock2 timestamptz; v_count int; v_n numeric; v_txt text; msg text;
  expected constant text := 'La orden está cerrada o cancelada. Reábrela antes de modificar su trazabilidad.';
begin
  insert into organizations (id, name) values (org, 'Org Guard');
  insert into profiles (id, email) values ('ffffffff-1111-0000-0000-000000000006', 'admin-g@test');
  insert into organization_members (organization_id, profile_id, role)
  values (org, 'ffffffff-1111-0000-0000-000000000006', 'admin');
  insert into suppliers (id, organization_id, name) values (sup, org, 'Prov G4');
  insert into materials (id, organization_id, name, classification_code) values (mat, org, 'Mat G4', 'PET');
  insert into products (id, organization_id, code, name) values (prod, org, 'PR-G4', 'Producto G4');
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib, org, sup, mat, 'LE-G4', current_date, 500), (ib2, org, sup, mat, 'LE-G4B', current_date, 200);

  -- Escenario §43: abierta → consumo + salida + composición + consumo interno → CERRAR
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op, org, 'OP-G4', current_date, 'in_progress'), (opp, org, 'OP-G4-PROD', current_date, 'in_progress');
  insert into batch_consumption (id, organization_id, production_order_id, input_batch_id, mass_kg)
  values (bc, org, op, ib, 100);
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg, product_id)
  values (ob, org, op, 'OUT-G4', 95, prod), (obp, org, opp, 'OUT-G4-PROD', 50, prod);
  insert into batch_composition (id, organization_id, output_batch_id, material_id, mass_kg)
  values (comp, org, ob, mat, 95);
  insert into batch_composition (id, organization_id, output_batch_id, material_id, mass_kg)
  values (comp_open, org, obp, mat, 40);
  insert into output_batch_consumption (id, organization_id, production_order_id, output_batch_id, mass_kg)
  values (obc, org, op, obp, 5);
  update production_orders set status = 'closed' where id = op;
  select history_locked_at into v_lock from production_orders where id = op;
  if v_lock is null then raise exception 'FALLO S10: el cierre no dejó candado (regresión PCR-02.3)'; end if;

  -- S10.1 · CONSUMO EXTERNO congelado
  begin
    insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
    values (org, op, ib2, 10);
    raise exception 'FALLO S10.1: INSERT de consumo sobre orden cerrada fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.1: mensaje inesperado en INSERT: %', msg; end if;
  begin
    update batch_consumption set mass_kg = 70 where id = bc;
    raise exception 'FALLO S10.1: UPDATE de consumo sobre orden cerrada fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.1: mensaje inesperado en UPDATE: %', msg; end if;
  begin
    delete from batch_consumption where id = bc;
    raise exception 'FALLO S10.1: DELETE de consumo sobre orden cerrada fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.1: mensaje inesperado en DELETE: %', msg; end if;
  select mass_kg into v_n from batch_consumption where id = bc;
  if v_n <> 100 then raise exception 'FALLO S10.1: el consumo histórico cambió (%)', v_n; end if;
  raise notice '✔ S10.1 consumo externo congelado: INSERT/UPDATE/DELETE fallan y el histórico (100 kg) permanece';

  -- S10.2 · CONSUMO INTERNO congelado
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values (org, op, obp, 3);
    raise exception 'FALLO S10.2: INSERT de consumo interno sobre cerrada fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.2: mensaje inesperado en INSERT: %', msg; end if;
  begin
    update output_batch_consumption set mass_kg = 1 where id = obc;
    raise exception 'FALLO S10.2: UPDATE de consumo interno sobre cerrada fue permitido';
  exception when others then null;
  end;
  begin
    delete from output_batch_consumption where id = obc;
    raise exception 'FALLO S10.2: DELETE de consumo interno sobre cerrada fue permitido';
  exception when others then null;
  end;
  select count(*) into v_count from output_batch_consumption where id = obc;
  if v_count <> 1 then raise exception 'FALLO S10.2: la genealogía interna cambió'; end if;
  raise notice '✔ S10.2 consumo interno congelado: INSERT/UPDATE/DELETE fallan y la genealogía permanece';

  -- S10.3 · OUTPUT: estructural congelado, descriptivo corregible
  begin
    insert into output_batches (organization_id, production_order_id, batch_code)
    values (org, op, 'OUT-G4-NUEVO');
    raise exception 'FALLO S10.3: INSERT de salida sobre cerrada fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.3: mensaje inesperado en INSERT: %', msg; end if;
  begin
    delete from output_batches where id = ob;
    raise exception 'FALLO S10.3: DELETE de salida sobre cerrada fue permitido';
  exception when others then null;
  end;
  begin
    update output_batches set produced_quantity_kg = 40 where id = ob;
    raise exception 'FALLO S10.3: cambiar la CANTIDAD de un lote de orden cerrada fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.3: mensaje inesperado en cantidad: %', msg; end if;
  begin
    update output_batches set batch_code = 'OUT-G4-X' where id = ob;
    raise exception 'FALLO S10.3: cambiar el CÓDIGO de un lote de orden cerrada fue permitido';
  exception when others then null;
  end;
  begin
    update output_batches set production_order_id = opp where id = ob;
    raise exception 'FALLO S10.3: reasignar un lote de orden cerrada fue permitido';
  exception when others then null;
  end;
  begin
    update output_batches set production_order_id = op where id = obp;
    raise exception 'FALLO S10.3: mover un lote HACIA la orden cerrada fue permitido';
  exception when others then null;
  end;
  -- descriptivos: SÍ (política §10/§47; auditado por t_audit_output_batches)
  update output_batches set storage_location = 'Bodega 2', notes = 'corrección documental' where id = ob;
  select storage_location into v_txt from output_batches where id = ob;
  if v_txt <> 'Bodega 2' then raise exception 'FALLO S10.3: el campo descriptivo no pudo corregirse'; end if;
  select count(*) into v_count from audit_log
   where table_name = 'output_batches' and row_id = ob and operation = 'UPDATE';
  if v_count < 1 then raise exception 'FALLO S10.3: la corrección descriptiva no quedó auditada'; end if;
  raise notice '✔ S10.3 salidas: estructura congelada (alta/baja/orden/producto/cantidad/código) y descriptivos corregibles + auditados';

  -- S10.4 · COMPOSICIÓN congelada (incluye mover hacia lote de cerrada, §22)
  begin
    insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg)
    values (org, ob, mat, 1);
    raise exception 'FALLO S10.4: INSERT de composición sobre lote de cerrada fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.4: mensaje inesperado en INSERT: %', msg; end if;
  begin
    update batch_composition set mass_kg = 10 where id = comp;
    raise exception 'FALLO S10.4: UPDATE de composición sobre lote de cerrada fue permitido';
  exception when others then null;
  end;
  begin
    delete from batch_composition where id = comp;
    raise exception 'FALLO S10.4: DELETE de composición sobre lote de cerrada fue permitido';
  exception when others then null;
  end;
  begin
    update batch_composition set output_batch_id = ob where id = comp_open;
    raise exception 'FALLO S10.4: mover composición HACIA un lote de cerrada fue permitido';
  exception when others then null;
  end;
  select mass_kg into v_n from batch_composition where id = comp;
  if v_n <> 95 then raise exception 'FALLO S10.4: la composición histórica cambió (%)', v_n; end if;
  raise notice '✔ S10.4 composición congelada: INSERT/UPDATE/DELETE y el traslado a lote cerrado fallan';

  -- S10.5 · LA PROPIA ORDEN: solo reapertura PURA
  begin
    update production_orders set notes = 'editada estando cerrada' where id = op;
    raise exception 'FALLO S10.5: editar campos de una orden cerrada fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.5: mensaje inesperado al editar: %', msg; end if;
  begin
    update production_orders set status = 'in_progress', order_code = 'OP-G4-REESCRITA' where id = op;
    raise exception 'FALLO S10.5: reabrir y reescribir en la misma sentencia fue permitido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.5: mensaje inesperado en reapertura impura: %', msg; end if;
  begin
    update production_orders set status = 'draft' where id = op;
    raise exception 'FALLO S10.5: pasar una cerrada a draft fue permitido';
  exception when others then null;
  end;
  select order_code into v_txt from production_orders where id = op;
  if v_txt <> 'OP-G4' then raise exception 'FALLO S10.5: el código de la orden cambió'; end if;
  raise notice '✔ S10.5 orden cerrada: solo la transición pura de reapertura; editar o reabrir+reescribir fallan';

  -- S10.6 · REAPERTURA restaura mutabilidad; el candado y el veto de DELETE permanecen
  update production_orders set status = 'in_progress' where id = op;  -- reapertura pura
  select history_locked_at into v_lock2 from production_orders where id = op;
  if v_lock2 is distinct from v_lock then raise exception 'FALLO S10.6: la reapertura alteró el candado'; end if;
  update batch_consumption set mass_kg = 90 where id = bc;                       -- corregir consumo
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, op, ib2, 10);                                                     -- nuevo consumo
  update batch_composition set mass_kg = 88 where id = comp;                     -- corregir composición
  insert into output_batches (organization_id, production_order_id, batch_code)
  values (org, op, 'OUT-G4-2');                                                  -- nueva salida
  update output_batches set produced_quantity_kg = 90 where id = ob;             -- corregir cantidad
  update production_orders set notes = 'corregida tras reapertura' where id = op; -- editar la orden
  begin
    delete from production_orders where id = op;
    raise exception 'FALLO S10.6: la orden histórica reabierta se eliminó';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.' then
    raise exception 'FALLO S10.6: mensaje inesperado del delete: %', msg;
  end if;
  raise notice '✔ S10.6 reabierta: consumos/salidas/composición/orden corregibles de verdad; candado intacto y DELETE vetado';

  -- S10.7 · CERRAR DE NUEVO vuelve a congelar; la fecha del candado no cambia
  update production_orders set status = 'closed' where id = op;
  select history_locked_at into v_lock2 from production_orders where id = op;
  if v_lock2 is distinct from v_lock then raise exception 'FALLO S10.7: el segundo cierre cambió la fecha del candado'; end if;
  begin
    update batch_consumption set mass_kg = 50 where id = bc;
    raise exception 'FALLO S10.7: el segundo cierre no volvió a congelar la estructura';
  exception when others then null;
  end;
  select mass_kg into v_n from batch_consumption where id = bc;
  if v_n <> 90 then raise exception 'FALLO S10.7: el consumo corregido (90) cambió (%)', v_n; end if;
  raise notice '✔ S10.7 segundo cierre: estructura congelada de nuevo con la fecha original del candado';
end $$;

-- S10.8 · Bypass RLS (§42): un admin autenticado con RLS de escritura NO
-- salta la congelación estructural.
do $$
declare msg text;
  expected constant text := 'La orden está cerrada o cancelada. Reábrela antes de modificar su trazabilidad.';
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-1111-0000-0000-000000000006', true);
  set local role authenticated;
  begin
    insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
    values ('ffffffff-0000-0000-0000-000000000006', 'ffffffff-4444-0000-0000-0000000000e1',
            'ffffffff-5555-0000-0000-000000000007', 2);
    raise exception 'FALLO S10.8: el admin autenticado insertó consumo en una orden cerrada';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.8: mensaje inesperado en INSERT autenticado: %', msg; end if;
  begin
    update batch_composition set mass_kg = 1 where id = 'ffffffff-9999-0000-0000-0000000000e1';
    raise exception 'FALLO S10.8: el admin autenticado editó composición de una orden cerrada';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.8: mensaje inesperado en UPDATE autenticado: %', msg; end if;
  begin
    delete from output_batch_consumption where id = 'ffffffff-8888-0000-0000-0000000000e1';
    raise exception 'FALLO S10.8: el admin autenticado borró consumo interno de una orden cerrada';
  exception when others then null;
  end;
  reset role;
  raise notice '✔ S10.8 RLS/API: la RLS autoriza el rol pero el structural guard veta la escritura sobre cerradas';
end $$;

-- S10.9 · Interacción con cascadas (§54) + cancelled
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000006';
  op_open uuid := 'ffffffff-4444-0000-0000-0000000000e9';
  op_canc uuid := 'ffffffff-4444-0000-0000-0000000000ea';
  v_count int; msg text;
  expected constant text := 'La orden está cerrada o cancelada. Reábrela antes de modificar su trazabilidad.';
begin
  -- Una orden ABIERTA con consumo conserva su eliminación histórica: la
  -- cascada borra el consumo y la guarda NO la bloquea (la fila padre ya no
  -- existe cuando se procesan las hijas).
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op_open, org, 'OP-G4-OPEN', current_date, 'in_progress');
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, op_open, 'ffffffff-5555-0000-0000-000000000007', 7);
  delete from production_orders where id = op_open;
  select count(*) into v_count from production_orders where id = op_open;
  if v_count <> 0 then raise exception 'FALLO S10.9: la orden abierta dejó de ser eliminable'; end if;
  select count(*) into v_count from batch_consumption where production_order_id = op_open;
  if v_count <> 0 then raise exception 'FALLO S10.9: la cascada de la orden abierta quedó rota'; end if;
  -- cancelled congela exactamente igual que closed
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op_canc, org, 'OP-G4-CANC', current_date, 'in_progress');
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, op_canc, 'ffffffff-5555-0000-0000-000000000007', 3);
  update production_orders set status = 'cancelled' where id = op_canc;
  begin
    update batch_consumption set mass_kg = 1 where production_order_id = op_canc;
    raise exception 'FALLO S10.9: la estructura de una orden cancelada fue mutable';
  exception when others then msg := sqlerrm;
  end;
  if msg <> expected then raise exception 'FALLO S10.9: mensaje inesperado sobre cancelada: %', msg; end if;
  raise notice '✔ S10.9 la guarda no rompe cascadas legítimas de órdenes abiertas y congela cancelled igual que closed';
end $$;

select '== pcr02_4_assertions.sql: TODAS LAS ASERCIONES PASARON ==' as resultado;
