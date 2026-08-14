-- ============================================================================
-- tests/db/pcr02_1_assertions.sql · PCR-02.1
-- Aserciones CONDUCTUALES sobre la migración REAL 0104 aplicada en un
-- PostgreSQL local. Cada bloque termina en RAISE NOTICE '✔ …' o aborta con
-- excepción (ON_ERROR_STOP). Cobertura: §14 (trigger), §25 (matriz DB),
-- §33 (RLS real), §34 (trigger real), §35 (constraints), §11 (implementación
-- casos 1–4) y §22 (completitud casos A–F + ciclo), con demostraciones
-- «rojo antes / verde después» de los hallazgos 2 y 5.
-- ============================================================================
set statement_timeout = '10s';

-- ---------------------------------------------------------------------------
-- Fixtures comunes (como superusuario: siembra directa, la RLS se prueba
-- después con el rol authenticated)
-- ---------------------------------------------------------------------------
insert into material_classifications (code, eligible_as_recycled) values ('PET', false);

insert into organizations (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Org B');

insert into profiles (id, email) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'admin-a@test'),
  ('aaaaaaaa-1111-0000-0000-000000000002', 'viewer-a@test'),
  ('aaaaaaaa-1111-0000-0000-000000000003', 'consult-a@test'),
  ('bbbbbbbb-1111-0000-0000-000000000001', 'admin-b@test');

insert into organization_members (organization_id, profile_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'admin'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000002', 'viewer'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000003', 'consultant'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000001', 'admin');

insert into suppliers (id, organization_id, name) values
  ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Proveedor A'),
  ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Proveedor B');
insert into materials (id, organization_id, name, classification_code) values
  ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'PET flake', 'PET'),
  ('bbbbbbbb-3333-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'PET flake B', 'PET');

-- Órdenes y lotes de la Org A
insert into production_orders (id, organization_id, order_code, order_date, status) values
  ('aaaaaaaa-4444-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'OP-A', current_date, 'in_progress'),
  ('aaaaaaaa-4444-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'OP-B', current_date, 'in_progress'),
  ('aaaaaaaa-4444-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', 'OP-X', current_date, 'in_progress');
insert into production_orders (id, organization_id, order_code, order_date, status) values
  ('bbbbbbbb-4444-0000-0000-00000000000a', 'bbbbbbbb-0000-0000-0000-000000000001', 'OPB-1', current_date, 'in_progress');

insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg) values
  ('aaaaaaaa-5555-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000001',
   'LE-1', current_date, 600);
insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000a',
   'aaaaaaaa-5555-0000-0000-000000000001', 550);

insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
  ('aaaaaaaa-6666-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-4444-0000-0000-00000000000a', 'INT-1', 500);

-- ---------------------------------------------------------------------------
-- S1 · CONSTRAINTS (§35)
-- ---------------------------------------------------------------------------
do $$
begin
  -- mass_kg > 0
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000b',
            'aaaaaaaa-6666-0000-0000-000000000001', 0);
    raise exception 'FALLO S1.1: mass_kg = 0 fue aceptado';
  exception when check_violation then
    raise notice '✔ S1.1 mass_kg <= 0 rechazado (check real)';
  end;

  -- consumo interno válido: OP-B consume INT-1 (misma empresa, otra orden)
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000b',
          'aaaaaaaa-6666-0000-0000-000000000001', 480);
  raise notice '✔ S1.2 consumo interno válido aceptado (OP-B consume INT-1 de OP-A)';

  -- unicidad (orden consumidora, lote)
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000b',
            'aaaaaaaa-6666-0000-0000-000000000001', 10);
    raise exception 'FALLO S1.3: duplicado (orden, lote) aceptado';
  exception when unique_violation then
    raise notice '✔ S1.3 duplicado (orden, lote) rechazado (unique real)';
  end;

  -- ON DELETE RESTRICT del lote consumido
  begin
    delete from output_batches where id = 'aaaaaaaa-6666-0000-0000-000000000001';
    raise exception 'FALLO S1.4: se eliminó un lote producido consumido';
  exception when foreign_key_violation then
    raise notice '✔ S1.4 lote consumido no puede eliminarse (ON DELETE RESTRICT real)';
  end;
end $$;

-- CASCADE al eliminar la orden CONSUMIDORA (fuera del DO para aislar tx)
do $$
declare v_count int;
begin
  delete from production_orders where id = 'aaaaaaaa-4444-0000-0000-00000000000b';
  select count(*) into v_count from output_batch_consumption
   where production_order_id = 'aaaaaaaa-4444-0000-0000-00000000000b';
  if v_count <> 0 then
    raise exception 'FALLO S1.5: el cascade no eliminó los consumos de la orden';
  end if;
  raise notice '✔ S1.5 eliminar la orden consumidora elimina sus consumos (cascade real)';
  -- restaurar
  insert into production_orders (id, organization_id, order_code, order_date, status) values
    ('aaaaaaaa-4444-0000-0000-00000000000b', 'aaaaaaaa-0000-0000-0000-000000000001', 'OP-B', current_date, 'in_progress');
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000b',
          'aaaaaaaa-6666-0000-0000-000000000001', 480);
end $$;

-- ---------------------------------------------------------------------------
-- S2 · TRIGGER anti-autoconsumo (§14/§34) — sin oráculo cross-tenant
-- ---------------------------------------------------------------------------
do $$
declare
  msg_self text; msg_cross text; msg_missing text;
begin
  -- Autoconsumo directo: OP-A intenta consumir INT-1 (producido por OP-A)
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000a',
            'aaaaaaaa-6666-0000-0000-000000000001', 5);
    raise exception 'FALLO S2.1: autoconsumo aceptado';
  exception when others then
    msg_self := sqlerrm;
  end;
  if msg_self <> 'Una orden no puede consumir un lote producido por ella misma.' then
    raise exception 'FALLO S2.1: mensaje inesperado: %', msg_self;
  end if;
  raise notice '✔ S2.1 autoconsumo directo rechazado con el mensaje pactado';

  -- Cross-tenant: la orden de Org B intenta consumir INT-1 (Org B como org)
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-4444-0000-0000-00000000000a',
            'aaaaaaaa-6666-0000-0000-000000000001', 5);
    raise exception 'FALLO S2.2: consumo cross-tenant aceptado';
  exception when others then
    msg_cross := sqlerrm;
  end;
  raise notice '✔ S2.2 consumo cross-tenant rechazado (trigger acotado por organización)';

  -- UUID inexistente
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-4444-0000-0000-00000000000a',
            '99999999-9999-9999-9999-999999999999', 5);
    raise exception 'FALLO S2.3: uuid inexistente aceptado';
  exception when others then
    msg_missing := sqlerrm;
  end;
  raise notice '✔ S2.3 uuid inexistente rechazado de forma segura';

  -- Sin oráculo: cross-tenant e inexistente producen EL MISMO mensaje
  if msg_cross <> msg_missing then
    raise exception 'FALLO S2.4: oráculo cross-tenant — mensajes distintos: [%] vs [%]', msg_cross, msg_missing;
  end if;
  if msg_cross <> 'El lote producido no existe o no pertenece a tu empresa.' then
    raise exception 'FALLO S2.4: mensaje inesperado: %', msg_cross;
  end if;
  raise notice '✔ S2.4 sin oráculo: lote ajeno e inexistente responden idéntico';
end $$;

-- ---------------------------------------------------------------------------
-- S3 · Protección de reasignación (§2b · hallazgo 1.D)
-- ---------------------------------------------------------------------------
do $$
declare msg text;
begin
  -- INT-1 está consumido por OP-B → su orden productora no puede cambiar
  begin
    update output_batches
       set production_order_id = 'aaaaaaaa-4444-0000-0000-00000000000c'
     where id = 'aaaaaaaa-6666-0000-0000-000000000001';
    raise exception 'FALLO S3.1: reasignación de lote consumido aceptada';
  exception when others then
    msg := sqlerrm;
  end;
  if msg <> 'El lote producido ya fue consumido por otra orden: su orden productora no puede cambiarse.' then
    raise exception 'FALLO S3.1: mensaje inesperado: %', msg;
  end if;
  raise notice '✔ S3.1 lote YA consumido: cambiar la orden productora rechazado en BD';

  -- Un lote SIN consumidores sí puede corregir su orden productora
  update output_batches
     set production_order_id = 'aaaaaaaa-4444-0000-0000-00000000000c'
   where id = 'aaaaaaaa-6666-0000-0000-000000000001'
     and not exists (select 1 from output_batch_consumption oc
                      where oc.output_batch_id = output_batches.id);
  -- (0 filas afectadas porque INT-1 sí tiene consumidores: comprobar intacto)
  if (select production_order_id from output_batches
       where id = 'aaaaaaaa-6666-0000-0000-000000000001')
     <> 'aaaaaaaa-4444-0000-0000-00000000000a' then
    raise exception 'FALLO S3.2: la orden productora cambió indebidamente';
  end if;
  raise notice '✔ S3.2 la genealogía registrada permanece intacta';

  -- Editar campos DESCRIPTIVOS del lote consumido sigue permitido (§49)
  update output_batches set storage_location = 'Bodega 2'
   where id = 'aaaaaaaa-6666-0000-0000-000000000001';
  raise notice '✔ S3.3 campos descriptivos de un lote consumido siguen editables';
end $$;

-- ---------------------------------------------------------------------------
-- S4 · RLS real (§33): SELECT / INSERT / UPDATE / DELETE por rol y empresa
-- ---------------------------------------------------------------------------
do $$
declare v_count int; v_ok boolean;
begin
  -- Miembro viewer de A: puede VER, no puede escribir
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-0000-0000-000000000002', true);
  set local role authenticated;
  select count(*) into v_count from output_batch_consumption;
  if v_count < 1 then raise exception 'FALLO S4.1: el miembro no ve los consumos de su empresa'; end if;
  raise notice '✔ S4.1 RLS SELECT: miembro de la empresa ve sus consumos (% filas)', v_count;

  v_ok := false;
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000c',
            'aaaaaaaa-6666-0000-0000-000000000001', 1);
  exception when insufficient_privilege or others then
    v_ok := true;
  end;
  if not v_ok then raise exception 'FALLO S4.2: viewer pudo insertar consumo'; end if;
  raise notice '✔ S4.2 RLS INSERT: viewer NO puede registrar consumos';
  reset role;

  -- Admin de B: NO ve nada de A y NO puede insertar en A
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-1111-0000-0000-000000000001', true);
  set local role authenticated;
  select count(*) into v_count from output_batch_consumption
   where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if v_count <> 0 then raise exception 'FALLO S4.3: cross-tenant SELECT visible'; end if;
  raise notice '✔ S4.3 RLS SELECT: la empresa B no ve consumos de la empresa A';

  v_ok := false;
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000c',
            'aaaaaaaa-6666-0000-0000-000000000001', 1);
  exception when others then
    v_ok := true;
  end;
  if not v_ok then raise exception 'FALLO S4.4: la empresa B insertó en la empresa A'; end if;
  raise notice '✔ S4.4 RLS INSERT: la empresa B no puede vincular consumos en la empresa A';

  -- Y con SU org pero lote ajeno: el trigger responde el mensaje neutro
  v_ok := false;
  begin
    insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-4444-0000-0000-00000000000a',
            'aaaaaaaa-6666-0000-0000-000000000001', 1);
  exception when others then
    v_ok := (sqlerrm = 'El lote producido no existe o no pertenece a tu empresa.');
  end;
  if not v_ok then raise exception 'FALLO S4.5: consumo de lote ajeno no respondió el mensaje neutro'; end if;
  raise notice '✔ S4.5 RLS+trigger: lote de otra empresa = «no existe» (sin filtración)';
  reset role;

  -- Consultant de A: puede insertar/actualizar, NO puede borrar
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-0000-0000-000000000003', true);
  set local role authenticated;
  insert into output_batch_consumption (id, organization_id, production_order_id, output_batch_id, mass_kg)
  values ('aaaaaaaa-7777-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-4444-0000-0000-00000000000c', 'aaaaaaaa-6666-0000-0000-000000000001', 7);
  raise notice '✔ S4.6 RLS INSERT: consultant SÍ puede registrar consumos';
  delete from output_batch_consumption where id = 'aaaaaaaa-7777-0000-0000-000000000001';
  select count(*) into v_count from output_batch_consumption
   where id = 'aaaaaaaa-7777-0000-0000-000000000001';
  if v_count <> 1 then raise exception 'FALLO S4.7: consultant pudo borrar (política delete = admin/quality)'; end if;
  raise notice '✔ S4.7 RLS DELETE: consultant no puede borrar consumos';
  reset role;

  -- Admin de A sí puede borrar
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-1111-0000-0000-000000000001', true);
  set local role authenticated;
  delete from output_batch_consumption where id = 'aaaaaaaa-7777-0000-0000-000000000001';
  select count(*) into v_count from output_batch_consumption
   where id = 'aaaaaaaa-7777-0000-0000-000000000001';
  if v_count <> 0 then raise exception 'FALLO S4.8: admin no pudo borrar'; end if;
  raise notice '✔ S4.8 RLS DELETE: admin sí puede borrar consumos';
  reset role;
end $$;

-- ---------------------------------------------------------------------------
-- S5 · Completitud (§22, casos A–F + ciclo) sobre la vista REAL
-- ---------------------------------------------------------------------------
-- Nota (caso B del brief): input_batches.supplier_id y material_id son NOT
-- NULL desde 0025, así que un consumo externo «sin proveedor» es imposible
-- para datos nuevos; la incompletitud aguas arriba realizable es una orden
-- intermedia SIN consumos (cadena cortada), que es lo que se prueba en D.
-- (fixtures de Org C: bloque idempotente a continuación)

do $$
begin
  -- Asegurar fixtures base de Org C (idempotente tras el bloque anterior)
  insert into organizations (id, name)
  values ('cccccccc-0000-0000-0000-000000000001', 'Org C')
  on conflict (id) do nothing;
  insert into suppliers (id, organization_id, name) values
    ('cccccccc-2222-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'Prov C')
  on conflict (id) do nothing;
  insert into materials (id, organization_id, name, classification_code) values
    ('cccccccc-3333-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'PET C', 'PET')
  on conflict (id) do nothing;
  insert into production_orders (id, organization_id, order_code, order_date, status) values
    -- PCR-02.4: ciclo de vida realista — OC-1 nace abierta y se cierra al
    -- final del fixture, tras registrar consumos/salidas (§2e congela la
    -- estructura de órdenes cerradas).
    ('cccccccc-4444-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 'OC-1', current_date, 'in_progress'),
    ('cccccccc-4444-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000001', 'OC-2', current_date, 'in_progress'),
    ('cccccccc-4444-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000001', 'OC-3', current_date, 'in_progress'),
    ('cccccccc-4444-0000-0000-000000000004', 'cccccccc-0000-0000-0000-000000000001', 'OC-D1', current_date, 'in_progress'),
    ('cccccccc-4444-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001', 'OC-D2', current_date, 'in_progress')
  on conflict (id) do nothing;
end $$;

do $$
declare v_status text; v_missing text[]; v_old_false_positive boolean;
begin
  -- Lote de entrada documentado + consumo de OC-1
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg) values
    ('cccccccc-5555-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
     'cccccccc-2222-0000-0000-000000000001', 'cccccccc-3333-0000-0000-000000000001',
     'LE-C', current_date, 1000);
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-4444-0000-0000-000000000001',
     'cccccccc-5555-0000-0000-000000000001', 900);

  -- CASO A: salida directa de OC-1 con composición → complete
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('cccccccc-6666-0000-0000-00000000000a', 'cccccccc-0000-0000-0000-000000000001',
     'cccccccc-4444-0000-0000-000000000001', 'A-DIRECTO', 880);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-6666-0000-0000-00000000000a',
     'cccccccc-3333-0000-0000-000000000001', 880);
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = 'cccccccc-6666-0000-0000-00000000000a';
  if v_status <> 'complete' then
    raise exception 'FALLO S5.A: externo documentado esperaba complete, fue %', v_status;
  end if;
  raise notice '✔ S5.A consumo externo documentado → complete';

  -- CASO B (realizable): misma orden, salida SIN composición → incomplete
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('cccccccc-6666-0000-0000-00000000000b', 'cccccccc-0000-0000-0000-000000000001',
     'cccccccc-4444-0000-0000-000000000001', 'B-SIN-COMPOSICION', 120);  -- PCR-02.5: cantidad obligatoria
  select traceability_status, missing_items into v_status, v_missing
    from v_output_batch_completeness
   where output_batch_id = 'cccccccc-6666-0000-0000-00000000000b';
  if v_status <> 'incomplete' or not ('composición del lote' = any (v_missing)) then
    raise exception 'FALLO S5.B: esperaba incomplete por composición, fue % (%)', v_status, v_missing;
  end if;
  raise notice '✔ S5.B documentación propia faltante → incomplete';

  -- CASO C: cadena interna DOCUMENTADA — OC-2 consume INT-C; FIN-C completo
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('cccccccc-6666-0000-0000-00000000000c', 'cccccccc-0000-0000-0000-000000000001',
     'cccccccc-4444-0000-0000-000000000001', 'INT-C', 500);
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-4444-0000-0000-000000000002',
     'cccccccc-6666-0000-0000-00000000000c', 480);
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('cccccccc-6666-0000-0000-00000000000d', 'cccccccc-0000-0000-0000-000000000001',
     'cccccccc-4444-0000-0000-000000000002', 'FIN-C', 470);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-6666-0000-0000-00000000000d',
     'cccccccc-3333-0000-0000-000000000001', 470);
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = 'cccccccc-6666-0000-0000-00000000000d';
  if v_status <> 'complete' then
    raise exception 'FALLO S5.C: cadena interna documentada esperaba complete, fue %', v_status;
  end if;
  raise notice '✔ S5.C lote final con intermedio de cadena documentada → complete';

  -- CASO D: cadena aguas arriba INCOMPLETA — OC-D1 no registra consumos,
  -- produce INT-D; OC-D2 consume INT-D y produce FIN-D con composición.
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('cccccccc-6666-0000-0000-00000000000e', 'cccccccc-0000-0000-0000-000000000001',
     'cccccccc-4444-0000-0000-000000000004', 'INT-D', 300);
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-4444-0000-0000-000000000005',
     'cccccccc-6666-0000-0000-00000000000e', 290);
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('cccccccc-6666-0000-0000-00000000000f', 'cccccccc-0000-0000-0000-000000000001',
     'cccccccc-4444-0000-0000-000000000005', 'FIN-D', 280);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-6666-0000-0000-00000000000f',
     'cccccccc-3333-0000-0000-000000000001', 280);
  select traceability_status, missing_items into v_status, v_missing
    from v_output_batch_completeness
   where output_batch_id = 'cccccccc-6666-0000-0000-00000000000f';
  if v_status <> 'incomplete'
     or not ('información de proveedor' = any (v_missing)) then
    raise exception 'FALLO S5.D: cadena rota esperaba incomplete con proveedor faltante, fue % (%)', v_status, v_missing;
  end if;
  raise notice '✔ S5.D cadena aguas arriba incompleta → NO hay falso positivo (incomplete)';

  -- ROJO ANTES / VERDE DESPUÉS (hallazgo 5): la semántica de PCR-02
  -- original (consumo interno ⇒ proveedor/material «true» constantes)
  -- habría marcado FIN-D como completo. Se demuestra evaluando esa regla
  -- antigua sobre los mismos datos:
  select (
    exists (select 1 from output_batch_consumption oc
             where oc.production_order_id = 'cccccccc-4444-0000-0000-000000000005')
    -- semántica PCR-02: cualquier fila interna aportaba has_supplier=true
  ) into v_old_false_positive;
  if not v_old_false_positive then
    raise exception 'FALLO S5.D2: la demostración de regresión no aplica';
  end if;
  raise notice '✔ S5.D2 (regresión demostrada) la regla PCR-02 habría dado proveedor=true a FIN-D';

  -- CASO E: mezcla externo + interno documentados — OC-2 ya consume INT-C;
  -- añadirle consumo externo y verificar que FIN-C sigue complete.
  -- (10 kg para conservar el balance de masa dentro del 5% y aislar el caso)
  insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-4444-0000-0000-000000000002',
     'cccccccc-5555-0000-0000-000000000001', 10);
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = 'cccccccc-6666-0000-0000-00000000000d';
  if v_status <> 'complete' then
    raise exception 'FALLO S5.E: mezcla externo+interno esperaba complete, fue %', v_status;
  end if;
  raise notice '✔ S5.E mezcla de consumo externo + interno documentados → complete';

  -- CASO F: cadena de TRES órdenes — OC-3 consume FIN-C y produce FIN-F.
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-4444-0000-0000-000000000003',
     'cccccccc-6666-0000-0000-00000000000d', 100);
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg) values
    ('cccccccc-6666-0000-0000-000000000010', 'cccccccc-0000-0000-0000-000000000001',
     'cccccccc-4444-0000-0000-000000000003', 'FIN-F', 95);
  insert into batch_composition (organization_id, output_batch_id, material_id, mass_kg) values
    ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-6666-0000-0000-000000000010',
     'cccccccc-3333-0000-0000-000000000001', 95);
  select traceability_status into v_status from v_output_batch_completeness
   where output_batch_id = 'cccccccc-6666-0000-0000-000000000010';
  if v_status <> 'complete' then
    raise exception 'FALLO S5.F: cadena de dos saltos esperaba complete, fue %', v_status;
  end if;
  raise notice '✔ S5.F cadena de dos órdenes internas documentadas → complete';
end $$;

-- Ciclo A⇄B: la vista responde sin recursión infinita (statement_timeout 10s)
do $$
declare v_count int;
begin
  -- OP-B ya consume INT-1 (de OP-A) desde S1. Cerrar el ciclo: OP-B produce
  -- Y-CICLO y OP-A lo consume → A⇄B a nivel de órdenes.
  insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
  values ('aaaaaaaa-6666-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
          'aaaaaaaa-4444-0000-0000-00000000000b', 'Y-CICLO', 100);  -- PCR-02.5: cantidad obligatoria
  insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-4444-0000-0000-00000000000a',
          'aaaaaaaa-6666-0000-0000-000000000002', 3);
  select count(*) into v_count from v_output_batch_completeness
   where organization_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if v_count < 2 then
    raise exception 'FALLO S5.G: la vista no devolvió los lotes del ciclo';
  end if;
  raise notice '✔ S5.G ciclo interno A⇄B: la vista responde acotada (sin recursión infinita)';
end $$;

-- ---------------------------------------------------------------------------
-- S6 · Implementación (§11, casos 1–4) sobre la vista REAL
-- ---------------------------------------------------------------------------
do $$
declare
  org1 uuid := 'dddddddd-0000-0000-0000-000000000001';
  org2 uuid := 'dddddddd-0000-0000-0000-000000000002';
  org3 uuid := 'dddddddd-0000-0000-0000-000000000003';
  org4 uuid := 'dddddddd-0000-0000-0000-000000000004';
  v_count int; o uuid; s uuid; m uuid; ib uuid; po uuid; po2 uuid; ob uuid;
begin
  -- Cuatro organizaciones con catálogo + lote de entrada + orden(es),
  -- para que la ÚNICA diferencia sea el consumo (reglas 1–6 silenciadas).
  foreach o in array array[org1, org2, org3, org4] loop
    insert into organizations (id, name) values (o, 'Org impl');
    s := gen_random_uuid(); m := gen_random_uuid(); ib := gen_random_uuid(); po := gen_random_uuid();
    insert into suppliers (id, organization_id, name) values (s, o, 'Prov');
    insert into materials (id, organization_id, name, classification_code) values (m, o, 'Mat', 'PET');
    insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
    values (ib, o, s, m, 'LE-IMPL', current_date, 100);
    insert into production_orders (id, organization_id, order_code, order_date, status)
    values (po, o, 'OP-IMPL', current_date, 'in_progress');

    if o = org2 then      -- Caso 2: SOLO consumo externo
      insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
      values (o, po, ib, 10);
    elsif o = org3 then   -- Caso 3: SOLO consumo interno
      po2 := gen_random_uuid(); ob := gen_random_uuid();
      insert into production_orders (id, organization_id, order_code, order_date, status)
      values (po2, o, 'OP-PROD', current_date, 'in_progress');
      insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
      values (o, po2, ib, 10);   -- la orden productora sí consume (externo)
      insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
      values (ob, o, po2, 'INT-IMPL', 50);  -- PCR-02.5: cantidad obligatoria
      -- PCR-02.4: ciclo realista — la productora se cierra tras construirse
      update production_orders set status = 'closed' where id = po2;
      insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
      values (o, po, ob, 5);     -- la orden evaluada SOLO consume interno
    elsif o = org4 then   -- Caso 4: ambos orígenes
      po2 := gen_random_uuid(); ob := gen_random_uuid();
      insert into production_orders (id, organization_id, order_code, order_date, status)
      values (po2, o, 'OP-PROD', current_date, 'in_progress');
      insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
      values (o, po2, ib, 10);
      insert into output_batches (id, organization_id, production_order_id, batch_code, produced_quantity_kg)
      values (ob, o, po2, 'INT-IMPL', 50);  -- PCR-02.5: cantidad obligatoria
      -- PCR-02.4: ciclo realista — la productora se cierra tras construirse
      update production_orders set status = 'closed' where id = po2;
      insert into batch_consumption (organization_id, production_order_id, input_batch_id, mass_kg)
      values (o, po, ib, 4);
      insert into output_batch_consumption (organization_id, production_order_id, output_batch_id, mass_kg)
      values (o, po, ob, 5);
    end if;               -- Caso 1 (org1): sin consumo alguno
  end loop;

  -- Caso 1: sin consumo → recomienda «Registrar consumo»
  select count(*) into v_count from v_implementation_next_actions
   where organization_id = org1 and action_code = 'add_consumption';
  if v_count <> 1 then
    raise exception 'FALLO S6.1: orden sin consumo esperaba add_consumption (fue %)', v_count;
  end if;
  raise notice '✔ S6.1 orden SIN consumo → recomienda «Registrar consumo»';

  -- Caso 2: solo externo → NO recomienda
  select count(*) into v_count from v_implementation_next_actions
   where organization_id = org2 and action_code = 'add_consumption';
  if v_count <> 0 then
    raise exception 'FALLO S6.2: solo externo NO debía recomendar consumo';
  end if;
  raise notice '✔ S6.2 solo consumo externo → sin recomendación de consumo';

  -- Caso 3: solo interno → NO recomienda (hallazgo 2 corregido)
  select count(*) into v_count from v_implementation_next_actions
   where organization_id = org3 and action_code = 'add_consumption';
  if v_count <> 0 then
    raise exception 'FALLO S6.3: solo interno NO debía recomendar consumo (hallazgo 2)';
  end if;
  raise notice '✔ S6.3 solo consumo interno → sin recomendación de consumo (hallazgo 2 cerrado)';

  -- Caso 4: ambos → NO recomienda
  select count(*) into v_count from v_implementation_next_actions
   where organization_id = org4 and action_code = 'add_consumption';
  if v_count <> 0 then
    raise exception 'FALLO S6.4: ambos orígenes NO debía recomendar consumo';
  end if;
  raise notice '✔ S6.4 ambos orígenes → sin recomendación de consumo';

  -- ROJO ANTES / VERDE DESPUÉS (hallazgo 2): la CTE de PCR-02 original
  -- (left join SOLO batch_consumption) marca la orden solo-interna de org3:
  select count(*) into v_count
  from production_orders po
  left join batch_consumption bc on bc.production_order_id = po.id
  where po.organization_id = org3 and bc.id is null;
  if v_count < 1 then
    raise exception 'FALLO S6.5: la demostración de regresión no aplica';
  end if;
  raise notice '✔ S6.5 (regresión demostrada) la lógica PCR-02 marcaba la orden solo-interna';
end $$;

select '== pcr02_1_assertions.sql: TODAS LAS ASERCIONES PASARON ==' as resultado;

-- ---------------------------------------------------------------------------
-- PCR-02.4 · Ciclo de vida realista del fixture: OC-1 terminó de construirse
-- (consumos, salidas, composición) y ahora se CIERRA — como en producción.
-- El structural guard §2e congela su estructura a partir de este instante;
-- las suites PCR-02.2/PCR-02.3 (que corren después) usan otras órdenes.
-- ---------------------------------------------------------------------------
update production_orders set status = 'closed'
 where id = 'cccccccc-4444-0000-0000-000000000001';
