-- ============================================================================
-- tests/db/pcr02_5_assertions.sql · PCR-02.5 (inventario + guardas de saldo)
-- Aserciones CONDUCTUALES sobre 0104 + 0105 REALES, tras las suites previas.
--
-- S11 · Bloque A (cantidad producida obligatoria en BD):
--   S11.A1 INSERT sin cantidad → rechazado (NOT NULL); con 0 y con negativo
--          → rechazado (CHECK de 0025); UPDATE a NULL → rechazado.
-- S11 · Bloque C (inventario externo, matriz §25 E1–E5):
--   S11.E1 lote 100: 60 + 40 → permitido (saldo exacto 0).
--   S11.E2 saldo 0 + 1 kg → rechazado con mensaje y saldo formateado.
--   S11.E3 update del propio consumo 60 → 100 (otros 40 eliminados antes)
--          → permitido: la propia fila se reutiliza (§12).
--   S11.E4 update 60 → 101 → rechazado (tope = recibido − otros).
--   S11.E5 delete consumo → el saldo vuelve (verificado en la VISTA).
-- S11 · Bloque D (inventario interno, matriz §25 I1–I4):
--   S11.I1 producido 50: 30 + 20 → permitido.  S11.I2 +1 → rechazado con el
--          mensaje del lote producido.  S11.I3 update propio recalculado.
--   S11.I4 delete devuelve saldo (vista v_output_batch_inventory).
-- S11 · Pisos (revisión adversarial):
--   S11.P1 reducir quantity_kg del lote por debajo del consumo → rechazado.
--   S11.P2 reducir produced_quantity_kg por debajo del consumo interno
--          (orden ABIERTA) → rechazado.
-- S11 · Integración:
--   S11.G1 sobre orden CERRADA manda el mensaje PCR-02.4 (structural guard
--          dispara antes que la guarda de saldo, orden alfabético BEFORE).
--   S11.G2 vistas multiempresa bajo authenticated: cada organización ve
--          SOLO su inventario (security_invoker + RLS).
--   S11.G3 el agregado por material (v_material_inventory) cuadra:
--          recibido/consumido/disponible/lotes con saldo; el lote agotado
--          sigue visible con estado derivable.
-- ============================================================================
set statement_timeout = '10s';

do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000007';
  sup uuid := 'ffffffff-2222-0000-0000-000000000007';
  mat uuid := 'ffffffff-3333-0000-0000-000000000007';
  ib  uuid := 'ffffffff-5555-0000-0000-000000000011';  -- lote 100 kg (E1–E5)
  op  uuid := 'ffffffff-4444-0000-0000-0000000000f1';
  op2 uuid := 'ffffffff-4444-0000-0000-0000000000f2';
  op3 uuid := 'ffffffff-4444-0000-0000-0000000000f4';  -- consumidor interno adicional (uniq orden+lote)
  bc60 uuid := 'ffffffff-7777-0000-0000-0000000000f1';
  bc40 uuid := 'ffffffff-7777-0000-0000-0000000000f2';
  obp uuid := 'ffffffff-6666-0000-0000-0000000000f1';  -- lote producido 50 kg (I1–I4)
  oc30 uuid := 'ffffffff-8888-0000-0000-0000000000f1';
  oc20 uuid := 'ffffffff-8888-0000-0000-0000000000f2';
  v_n numeric; v_count int; msg text;
begin
  insert into organizations (id, name) values (org, 'Org Saldos');
  insert into profiles (id, email) values ('ffffffff-1111-0000-0000-000000000007', 'admin-s@test');
  insert into organization_members (organization_id, profile_id, role)
  values (org, 'ffffffff-1111-0000-0000-000000000007', 'admin');
  insert into suppliers (id, organization_id, name) values (sup, org, 'Prov S');
  insert into materials (id, organization_id, name, classification_code) values (mat, org, 'PET postconsumo', 'PET');
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op, org, 'OP-S1', current_date, 'in_progress'),
         (op2, org, 'OP-S2', current_date, 'in_progress'),
         (op3, org, 'OP-S3', current_date, 'in_progress');

  -- ── S11.A1 · Cantidad producida obligatoria en BD ─────────────────────────
  begin
    insert into output_batches (organization_id, production_order_id, batch_code)
    values (org, op, 'OUT-SIN-CANTIDAD');
    raise exception 'FALLO S11.A1: se creó un lote producido SIN cantidad';
  exception when not_null_violation then null;
  end;
  begin
    insert into output_batches (organization_id, production_order_id, batch_code, produced_quantity_kg)
    values (org, op, 'OUT-CERO', 0);
    raise exception 'FALLO S11.A1: se creó un lote producido con cantidad 0';
  exception when check_violation then null;
  end;
  begin
    insert into output_batches (organization_id, production_order_id, batch_code, produced_quantity_kg)
    values (org, op, 'OUT-NEG', -10);
    raise exception 'FALLO S11.A1: se creó un lote producido con cantidad negativa';
  exception when check_violation then null;
  end;
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values (obp, org, op, 'OUT-S-50', 50);
  begin
    update output_batches set produced_quantity_kg = null where id = obp;
    raise exception 'FALLO S11.A1: la cantidad producida pudo anularse';
  exception when not_null_violation then null;
  end;
  raise notice '✔ S11.A1 cantidad producida obligatoria: NULL, 0 y negativos rechazados por la BD (NOT NULL 0105 + CHECK 0025)';

  -- ── S11.E1 · lote 100: consumir 60 + 40 (saldo exacto) ───────────────────
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib, org, sup, mat, 'LE-S-100', current_date, 100);
  insert into batch_consumption (id, organization_id, production_order_id, input_batch_id, mass_kg)
  values (bc60, org, op, ib, 60);
  insert into batch_consumption (id, organization_id, production_order_id, input_batch_id, mass_kg)
  values (bc40, org, op2, ib, 40);
  select available_kg into v_n from v_input_batch_inventory where input_batch_id = ib;
  if v_n <> 0 then raise exception 'FALLO S11.E1: el saldo debía ser 0 y es %', v_n; end if;
  raise notice '✔ S11.E1 consumir 60 + 40 de un lote de 100 → permitido (saldo exacto 0 en la vista)';

  -- ── S11.E2 · saldo 0 + 1 kg → rechazado ──────────────────────────────────
  begin
    insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
    values (org, op, ib, 1);
    raise exception 'FALLO S11.E2: se consumió con saldo 0';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'La cantidad a consumir supera el saldo disponible del lote. Disponible: 0 kg.' then
    raise exception 'FALLO S11.E2: mensaje inesperado: %', msg;
  end if;
  raise notice '✔ S11.E2 saldo 0 + 1 kg → rechazado con el mensaje y el saldo formateado';

  -- ── S11.E3/E4 · UPDATE del propio consumo (§12) ──────────────────────────
  delete from batch_consumption where id = bc40;  -- quedan 60 propios, otros 0
  update batch_consumption set mass_kg = 100 where id = bc60;  -- tope = 100 − 0
  select mass_kg into v_n from batch_consumption where id = bc60;
  if v_n <> 100 then raise exception 'FALLO S11.E3: el update legítimo no quedó aplicado'; end if;
  raise notice '✔ S11.E3 update del propio consumo 60 → 100 → permitido (la propia fila se reutiliza)';
  begin
    update batch_consumption set mass_kg = 101 where id = bc60;
    raise exception 'FALLO S11.E4: se superó el tope al editar';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'La cantidad a consumir supera el saldo disponible del lote. Disponible: 100 kg.' then
    raise exception 'FALLO S11.E4: mensaje inesperado: %', msg;
  end if;
  select mass_kg into v_n from batch_consumption where id = bc60;
  if v_n <> 100 then raise exception 'FALLO S11.E4: la masa cambió pese al rechazo'; end if;
  raise notice '✔ S11.E4 update 100 → 101 → rechazado (tope = recibido − otros consumos)';

  -- ── S11.E5 · DELETE devuelve saldo (derivado, sin movimiento manual) ─────
  delete from batch_consumption where id = bc60;
  select available_kg, consumed_kg into v_n, v_count from v_input_batch_inventory where input_batch_id = ib;
  if v_n <> 100 then raise exception 'FALLO S11.E5: el saldo no volvió (disponible %)', v_n; end if;
  raise notice '✔ S11.E5 delete del consumo → el saldo vuelve solo (disponible 100 en la vista)';

  -- ── S11.I1–I4 · inventario interno del lote producido (50 kg) ────────────
  insert into output_batch_consumption (id, organization_id, production_order_id, output_batch_id, mass_kg)
  values (oc30, org, op2, obp, 30);
  insert into output_batch_consumption (id, organization_id, production_order_id, output_batch_id, mass_kg)
  values (oc20, org, op3, obp, 20);
  select available_kg into v_n from v_output_batch_inventory where output_batch_id = obp;
  if v_n <> 0 then raise exception 'FALLO S11.I1: disponible interno debía ser 0 y es %', v_n; end if;
  raise notice '✔ S11.I1 consumir 30 + 20 de un lote producido de 50 → permitido';
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values (org, op2, obp, 1);
    raise exception 'FALLO S11.I2: se sobreconsumió el lote producido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'La cantidad a consumir supera el saldo disponible del lote producido. Disponible: 0 kg.' then
    raise exception 'FALLO S11.I2: mensaje inesperado: %', msg;
  end if;
  raise notice '✔ S11.I2 +1 kg sobre saldo interno 0 → rechazado con el mensaje del lote producido';
  begin
    update output_batch_consumption set mass_kg = 21 where id = oc20;  -- tope = 50 − 30 (oc30) = 20
    raise exception 'FALLO S11.I3: se superó el tope al editar el consumo interno';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'La cantidad a consumir supera el saldo disponible del lote producido. Disponible: 20 kg.' then
    raise exception 'FALLO S11.I3: mensaje inesperado: %', msg;
  end if;
  update output_batch_consumption set mass_kg = 15 where id = oc20;  -- dentro del tope: permitido
  select available_kg into v_n from v_output_batch_inventory where output_batch_id = obp;
  if v_n <> 5 then raise exception 'FALLO S11.I3: la vista no recalculó (disponible %)', v_n; end if;
  raise notice '✔ S11.I3 update del propio consumo interno: tope = producido − otros (21 rechazado, 15 permitido)';

  -- ── S11.I4 · DELETE devuelve el saldo interno ────────────────────────────
  delete from output_batch_consumption where id = oc20;
  select available_kg into v_n from v_output_batch_inventory where output_batch_id = obp;
  if v_n <> 20 then raise exception 'FALLO S11.I4: el saldo interno no volvió (disponible %)', v_n; end if;
  raise notice '✔ S11.I4 delete del consumo interno devuelve el saldo (disponible 20 en la vista)';
end $$;



-- ── S11.P1/P2 · pisos de los lotes ────────────────────────────────────────
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000007';
  ib uuid := 'ffffffff-5555-0000-0000-000000000012';
  op uuid := 'ffffffff-4444-0000-0000-0000000000f1';
  obp uuid := 'ffffffff-6666-0000-0000-0000000000f1';
  msg text;
begin
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib, org, 'ffffffff-2222-0000-0000-000000000007', 'ffffffff-3333-0000-0000-000000000007',
          'LE-S-PISO', current_date, 100);
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, op, ib, 80);
  begin
    update input_batches set quantity_kg = 50 where id = ib;
    raise exception 'FALLO S11.P1: el lote quedó por debajo de lo consumido';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'La cantidad recibida no puede quedar por debajo de lo ya consumido del lote. Consumido: 80 kg.' then
    raise exception 'FALLO S11.P1: mensaje inesperado: %', msg;
  end if;
  update input_batches set quantity_kg = 90 where id = ib;  -- ≥ consumido: permitido
  raise notice '✔ S11.P1 piso del lote de entrada: no puede quedar por debajo de lo consumido (80 kg)';
  -- obp tiene 30 kg consumidos internamente (oc30) y produce 50
  begin
    update output_batches set produced_quantity_kg = 29 where id = obp;
    raise exception 'FALLO S11.P2: el lote producido quedó por debajo del consumo interno';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'La cantidad producida no puede quedar por debajo de lo ya consumido internamente del lote. Consumido: 30 kg.' then
    raise exception 'FALLO S11.P2: mensaje inesperado: %', msg;
  end if;
  update output_batches set produced_quantity_kg = 30 where id = obp;  -- piso exacto: permitido
  raise notice '✔ S11.P2 piso del lote producido: no puede caer por debajo del consumo interno (30 kg)';
end $$;

-- ── S11.G1 · Con la orden CERRADA sigue mandando PCR-02.4 ────────────────
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000007';
  opc uuid := 'ffffffff-4444-0000-0000-0000000000f3';
  ib uuid := 'ffffffff-5555-0000-0000-000000000012';
  msg text;
begin
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (opc, org, 'OP-S-CERRADA', current_date, 'in_progress');
  update production_orders set status = 'closed' where id = opc;
  begin
    insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
    values (org, opc, ib, 1);
    raise exception 'FALLO S11.G1: la orden cerrada aceptó consumo';
  exception when others then msg := sqlerrm;
  end;
  if msg <> 'La orden está cerrada o cancelada. Reábrela antes de modificar su trazabilidad.' then
    raise exception 'FALLO S11.G1: el mensaje debía ser el del structural guard PCR-02.4, fue: %', msg;
  end if;
  raise notice '✔ S11.G1 orden cerrada: el structural guard PCR-02.4 dispara ANTES que la guarda de saldo (mensaje intacto)';
end $$;

-- ── S11.G2 · RLS de las vistas en AMBOS sentidos (authenticated) ─────────
-- PCR-02.5.1: caso POSITIVO (el miembro de la empresa A ve SU inventario)
-- y NEGATIVO (la empresa B ve 0 filas de A) demostrados simultáneamente.
do $$
declare
  org_b uuid := 'ffffffff-0000-0000-0000-000000000008';
  v_count int;
begin
  insert into organizations (id, name) values (org_b, 'Org Ajena');
  insert into profiles (id, email) values ('ffffffff-1111-0000-0000-000000000008', 'admin-b@test');
  insert into organization_members (organization_id, profile_id, role)
  values (org_b, 'ffffffff-1111-0000-0000-000000000008', 'admin');

  -- POSITIVO: admin de la empresa A (dueña de los fixtures S11)
  perform set_config('request.jwt.claim.sub', 'ffffffff-1111-0000-0000-000000000007', true);
  set local role authenticated;
  select count(*) into v_count from v_input_batch_inventory;
  -- en este punto la empresa A tiene 2 lotes (LE-S-100 y LE-S-PISO;
  -- LE-S-AGOTADO se crea después, en G3)
  if v_count < 2 then
    raise exception 'FALLO S11.G2: la propia empresa debía ver sus lotes de entrada (ve %)', v_count;
  end if;
  select count(*) into v_count from v_output_batch_inventory;
  if v_count < 1 then
    raise exception 'FALLO S11.G2: la propia empresa debía ver sus lotes producidos (ve %)', v_count;
  end if;
  select count(*) into v_count from v_material_inventory;
  if v_count < 1 then
    raise exception 'FALLO S11.G2: la propia empresa debía ver su agregado por material (ve %)', v_count;
  end if;
  reset role;

  -- NEGATIVO: admin de la empresa B no ve NADA de A
  perform set_config('request.jwt.claim.sub', 'ffffffff-1111-0000-0000-000000000008', true);
  set local role authenticated;
  select count(*) into v_count from v_material_inventory;
  if v_count <> 0 then
    raise exception 'FALLO S11.G2: la organización ajena ve % fila(s) de inventario de otra empresa', v_count;
  end if;
  select count(*) into v_count from v_input_batch_inventory;
  if v_count <> 0 then raise exception 'FALLO S11.G2: v_input_batch_inventory filtró filas ajenas'; end if;
  select count(*) into v_count from v_output_batch_inventory;
  if v_count <> 0 then raise exception 'FALLO S11.G2: v_output_batch_inventory filtró filas ajenas'; end if;
  reset role;
  raise notice '✔ S11.G2 RLS en ambos sentidos: la empresa A ve su inventario y la empresa B ve 0 filas de A';
end $$;

-- ── S11.G3 · Agregado por material + lote agotado visible ────────────────
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000007';
  mat uuid := 'ffffffff-3333-0000-0000-000000000007';
  op uuid := 'ffffffff-4444-0000-0000-0000000000f1';
  ib3 uuid := 'ffffffff-5555-0000-0000-000000000013';
  r record; v_n numeric;
begin
  -- Tercer lote del mismo material: 40 kg, agotado por completo.
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib3, org, 'ffffffff-2222-0000-0000-000000000007', mat, 'LE-S-AGOTADO', current_date, 40);
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
  values (org, op, ib3, 40);
  -- Estado del material: LE-S-100 (100/0), LE-S-PISO (90/80), LE-S-AGOTADO (40/40)
  select * into r from v_material_inventory
   where organization_id = org and material_id = mat;
  if r.received_kg <> 230 or r.consumed_kg <> 120 or r.available_kg <> 110 then
    raise exception 'FALLO S11.G3: agregado por material incorrecto (recibido %, consumido %, disponible %)',
      r.received_kg, r.consumed_kg, r.available_kg;
  end if;
  if r.batches_with_balance <> 2 or r.batches_total <> 3 then
    raise exception 'FALLO S11.G3: lotes con saldo % de % (esperado 2 de 3)', r.batches_with_balance, r.batches_total;
  end if;
  select available_kg into v_n from v_input_batch_inventory where input_batch_id = ib3;
  if v_n <> 0 then raise exception 'FALLO S11.G3: el lote agotado debía tener saldo 0'; end if;
  raise notice '✔ S11.G3 agregado por material cuadra (230/120/110, 2 de 3 lotes con saldo) y el lote agotado sigue visible';
end $$;

-- ── S11.G4 · Paginación y búsqueda server-side (PCR-02.5.1, hallazgo 2) ──
-- Mismo patrón exacto de consulta que lib/db/inventory.ts (order + range +
-- count exact + ilike saneado), demostrado con MÁS filas que el pageSize.
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-00000000000b';
  sup uuid := 'ffffffff-2222-0000-0000-00000000000b';
  op  uuid := 'ffffffff-4444-0000-0000-0000000000fb';
  v_total int; v_page1 int; v_page2 int; v_first text; v_last text; v_n numeric;
begin
  insert into organizations (id, name) values (org, 'Org Paginada');
  insert into suppliers (id, organization_id, name) values (sup, org, 'Prov P25');
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values (op, org, 'OP-P25', current_date, 'in_progress');
  -- 25 materiales (> pageSize 20), cada uno con un lote de 10 kg
  insert into materials (id, organization_id, name, classification_code)
  select gen_random_uuid(), org, format('Material %s', to_char(i, 'FM00')), 'PET'
    from generate_series(1, 25) i;
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  select gen_random_uuid(), org, sup, m.id, 'LE-' || m.name, current_date, 10
    from materials m where m.organization_id = org;
  -- 23 lotes (> pageSize 20) adicionales del Material 01
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  select gen_random_uuid(), org, sup, m.id, format('LE-M01-%s', to_char(i, 'FM00')),
         current_date - i, 5
    from generate_series(1, 23) i
    join materials m on m.organization_id = org and m.name = 'Material 01';

  -- total exacto y páginas de la tabla agregada (order by material_name)
  select count(*) into v_total from v_material_inventory where organization_id = org;
  if v_total <> 25 then raise exception 'FALLO S11.G4: total esperado 25, es %', v_total; end if;
  select count(*) into v_page1 from (
    select material_name from v_material_inventory where organization_id = org
     order by material_name limit 20 offset 0) p;
  select count(*) into v_page2 from (
    select material_name from v_material_inventory where organization_id = org
     order by material_name limit 20 offset 20) p;
  if v_page1 <> 20 or v_page2 <> 5 then
    raise exception 'FALLO S11.G4: páginas esperadas 20+5, son %+%', v_page1, v_page2;
  end if;
  select material_name into v_first from v_material_inventory where organization_id = org
   order by material_name limit 1 offset 20;
  if v_first <> 'Material 21' then
    raise exception 'FALLO S11.G4: la página 2 debía empezar en Material 21, empieza en %', v_first;
  end if;
  -- búsqueda ilike por nombre
  select count(*) into v_total from v_material_inventory
   where organization_id = org and material_name ilike '%Material 2%';
  if v_total <> 6 then
    raise exception 'FALLO S11.G4: la búsqueda «Material 2» debía dar 6 (20–25), da %', v_total;
  end if;
  -- detalle por lote del Material 01: 24 lotes en total (1 base + 23)
  select count(*) into v_total from v_input_batch_inventory
   where organization_id = org and material_name = 'Material 01';
  if v_total <> 24 then raise exception 'FALLO S11.G4: lotes esperados 24, son %', v_total; end if;
  select count(*) into v_page2 from (
    select batch_code from v_input_batch_inventory
     where organization_id = org and material_name = 'Material 01'
     order by received_date desc, batch_code asc limit 20 offset 20) p;
  if v_page2 <> 4 then
    raise exception 'FALLO S11.G4: la página 2 del detalle debía tener 4 lotes, tiene %', v_page2;
  end if;
  -- resolución puntual por id (selección fuera de la página 1: Material 25)
  select mi.available_kg into v_n
    from v_material_inventory mi
    join materials m on m.id = mi.material_id
   where mi.organization_id = org and m.name = 'Material 25';
  if v_n <> 10 then
    raise exception 'FALLO S11.G4: la resolución puntual del Material 25 falló (disponible %)', v_n;
  end if;
  raise notice '✔ S11.G4 paginación server-side: 25 materiales → 20+5 con total exacto; búsqueda ilike; 24 lotes → 20+4; resolución puntual fuera de página';
end $$;

select '== pcr02_5_assertions.sql: TODAS LAS ASERCIONES PASARON ==' as resultado;
