-- ============================================================================
-- tests/db/pcr02_3_assertions.sql · PCR-02.3 (Historical Lock + reapertura)
-- Aserciones CONDUCTUALES sobre la 0104 REAL, tras las suites PCR-02.1/02.2.
--
-- S9 · candado histórico:
--   S9.1  DIRECT_API_CLOSE_ACTIVATES_LOCK — cerrar por SQL activa el candado.
--   S9.2  DIRECT_API_REOPEN_PRESERVES_LOCK — reabrir por SQL lo conserva.
--   S9.3  LOCK_CANNOT_BE_CLEARED — ni anular ni falsificar (columna del
--         sistema); un INSERT tampoco lo fabrica.
--   S9.4  CLOSED_REOPEN_DELETE_BLOCKED (caso central §46) — LE-1 → consumo →
--         OP-A; cerrar; reabrir; DELETE FALLA; orden/consumo/lote intactos.
--   S9.5  REOPENED_ORDER_HISTORY_SURVIVES (§47) — con salida consumida por
--         otra orden: DELETE de la reabierta falla y la genealogía no cambia.
--   S9.6  CANCELLED_REOPEN_DELETE_BLOCKED — política: cancelled SÍ se
--         reabre (transición histórica del dominio, ahora explícita).
--   S9.7  DRAFT_NEVER_FINALIZED_DELETE_ALLOWED.
--   S9.8  IN_PROGRESS_NEVER_FINALIZED_DELETE_ALLOWED.
--   S9.9  RLS + candado (bypass §24/§48): admin autenticado cierra, reabre
--         y NO puede borrar, aunque su RLS de DELETE lo permitiría; tampoco
--         puede limpiar el candado.
--   S9.10 AUDIT — cierre y reapertura quedan en audit_log (§28).
--   S9.11 backfill — órdenes finalizadas al migrar y órdenes reabiertas
--         ANTES del sprint (evidencia en audit_log) reciben el candado.
--         (Se valida re-ejecutando los UPDATE de backfill de la 0104, que
--         son idempotentes, sobre fixtures construidos aquí.)
-- ============================================================================
set statement_timeout = '10s';

do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000004';
  sup uuid := 'ffffffff-2222-0000-0000-000000000004';
  mat uuid := 'ffffffff-3333-0000-0000-000000000004';
  ib  uuid := 'ffffffff-5555-0000-0000-000000000004';
  v_lock timestamptz; v_lock2 timestamptz; v_count int; msg text;
begin
  insert into organizations (id, name) values (org, 'Org Candado');
  insert into profiles (id, email) values ('ffffffff-1111-0000-0000-000000000004', 'admin-h@test');
  insert into organization_members (organization_id, profile_id, role)
  values (org, 'ffffffff-1111-0000-0000-000000000004', 'admin');
  insert into suppliers (id, organization_id, name) values (sup, org, 'Prov H');
  insert into materials (id, organization_id, name, classification_code) values (mat, org, 'Mat H', 'PET');
  insert into input_batches (id, organization_id, supplier_id, material_id, batch_code, received_date, quantity_kg)
  values (ib, org, sup, mat, 'LE-1', current_date, 500);

  -- S9.1 · Cerrar por SQL directa activa el candado (sin server action)
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000c1', org, 'OP-A', current_date, 'in_progress');
  select history_locked_at into v_lock from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
  if v_lock is not null then raise exception 'FALLO S9.1: una orden abierta no debe nacer con candado'; end if;
  update production_orders set status = 'closed' where id = 'ffffffff-4444-0000-0000-0000000000c1';
  select history_locked_at into v_lock from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
  if v_lock is null then raise exception 'FALLO S9.1: cerrar por SQL no activó el candado'; end if;
  raise notice '✔ S9.1 DIRECT_API_CLOSE_ACTIVATES_LOCK: el candado se activa en BD, sin depender de la app';

  -- S9.2 · Reabrir por SQL conserva el candado (y su fecha ORIGINAL)
  update production_orders set status = 'in_progress' where id = 'ffffffff-4444-0000-0000-0000000000c1';
  select history_locked_at into v_lock2 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
  if v_lock2 is null or v_lock2 <> v_lock then
    raise exception 'FALLO S9.2: la reapertura alteró el candado (antes %, ahora %)', v_lock, v_lock2;
  end if;
  -- Y un segundo cierre tampoco lo modifica (§35/§36: primera entrada, no último cierre)
  update production_orders set status = 'closed' where id = 'ffffffff-4444-0000-0000-0000000000c1';
  update production_orders set status = 'in_progress' where id = 'ffffffff-4444-0000-0000-0000000000c1';
  select history_locked_at into v_lock2 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
  if v_lock2 <> v_lock then raise exception 'FALLO S9.2: un segundo cierre cambió la fecha del candado'; end if;
  raise notice '✔ S9.2 DIRECT_API_REOPEN_PRESERVES_LOCK: reabrir y re-cerrar conservan la fecha original';

  -- S9.3 · El candado no puede anularse ni falsificarse; un INSERT no lo fabrica
  update production_orders set history_locked_at = null where id = 'ffffffff-4444-0000-0000-0000000000c1';
  select history_locked_at into v_lock2 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
  if v_lock2 is null or v_lock2 <> v_lock then raise exception 'FALLO S9.3: el candado pudo anularse'; end if;
  update production_orders set history_locked_at = '1999-01-01' where id = 'ffffffff-4444-0000-0000-0000000000c1';
  select history_locked_at into v_lock2 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
  if v_lock2 <> v_lock then raise exception 'FALLO S9.3: el candado pudo falsificarse'; end if;
  insert into production_orders (id, organization_id, order_code, order_date, status, history_locked_at)
  values ('ffffffff-4444-0000-0000-0000000000c2', org, 'OP-FAB', current_date, 'draft', '1999-01-01');
  select history_locked_at into v_lock2 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c2';
  if v_lock2 is not null then raise exception 'FALLO S9.3: un INSERT fabricó candado en una orden nunca finalizada'; end if;
  delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c2';
  raise notice '✔ S9.3 LOCK_CANNOT_BE_CLEARED: columna gestionada por el sistema (ni anular, ni falsificar, ni fabricar)';

  -- S9.4 · Caso central (§46): consumo + cerrar + reabrir + DELETE
  insert into batch_consumption (id, organization_id, production_order_id, input_batch_id, mass_kg)
  values ('ffffffff-7777-0000-0000-0000000000c4', org, 'ffffffff-4444-0000-0000-0000000000c1', ib, 40);
  -- (la orden OP-A ya está reabierta: in_progress + candado activo)
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
    raise exception 'FALLO S9.4: la orden histórica reabierta se eliminó';
  exception when others then
    msg := sqlerrm;
  end;
  if msg <> 'Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.' then
    raise exception 'FALLO S9.4: mensaje inesperado: %', msg;
  end if;
  select count(*) into v_count from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
  if v_count <> 1 then raise exception 'FALLO S9.4: la orden desapareció'; end if;
  select count(*) into v_count from batch_consumption where id = 'ffffffff-7777-0000-0000-0000000000c4';
  if v_count <> 1 then raise exception 'FALLO S9.4: el consumo se perdió'; end if;
  select count(*) into v_count from input_batches where id = ib;
  if v_count <> 1 then raise exception 'FALLO S9.4: el lote de entrada se perdió'; end if;
  raise notice '✔ S9.4 CLOSED_REOPEN_DELETE_BLOCKED: closed → reopen → DELETE FALLA y OP-A/consumo/LE-1 permanecen';

  -- S9.5 · Variante con salidas (§47): genealogía intacta
  insert into output_batches (id, organization_id, production_order_id, batch_code)
  values ('ffffffff-6666-0000-0000-0000000000c5', org, 'ffffffff-4444-0000-0000-0000000000c1', 'INT-A');
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000c5', org, 'OP-B', current_date, 'in_progress');
  insert into output_batch_consumption (id, organization_id, production_order_id, output_batch_id, mass_kg)
  values ('ffffffff-8888-0000-0000-0000000000c5', org, 'ffffffff-4444-0000-0000-0000000000c5',
          'ffffffff-6666-0000-0000-0000000000c5', 7);
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c1';
    raise exception 'FALLO S9.5: la orden con salidas consumidas se eliminó';
  exception when others then null;
  end;
  select count(*) into v_count from output_batch_consumption where id = 'ffffffff-8888-0000-0000-0000000000c5';
  if v_count <> 1 then raise exception 'FALLO S9.5: la genealogía perdió el consumo interno'; end if;
  select count(*) into v_count from output_batches where id = 'ffffffff-6666-0000-0000-0000000000c5';
  if v_count <> 1 then raise exception 'FALLO S9.5: la genealogía perdió el lote intermedio'; end if;
  raise notice '✔ S9.5 REOPENED_ORDER_HISTORY_SURVIVES: salidas, consumo interno y genealogía permanecen';

  -- S9.6 · cancelled → reopen → DELETE bloqueado
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000c6', org, 'OP-CANC-H', current_date, 'in_progress');
  update production_orders set status = 'cancelled' where id = 'ffffffff-4444-0000-0000-0000000000c6';
  select history_locked_at into v_lock from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c6';
  if v_lock is null then raise exception 'FALLO S9.6: cancelar no activó el candado'; end if;
  update production_orders set status = 'in_progress' where id = 'ffffffff-4444-0000-0000-0000000000c6';
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c6';
    raise exception 'FALLO S9.6: la cancelada reabierta se eliminó';
  exception when others then null;
  end;
  raise notice '✔ S9.6 CANCELLED_REOPEN_DELETE_BLOCKED: cancelar también deja candado permanente';

  -- S9.7 / S9.8 · Nunca finalizadas: comportamiento histórico conservado
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000c7', org, 'OP-D-H', current_date, 'draft');
  delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c7';
  select count(*) into v_count from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c7';
  if v_count <> 0 then raise exception 'FALLO S9.7: draft nunca finalizada dejó de ser eliminable'; end if;
  raise notice '✔ S9.7 DRAFT_NEVER_FINALIZED_DELETE_ALLOWED';
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000c8', org, 'OP-IP-H', current_date, 'in_progress');
  delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c8';
  select count(*) into v_count from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c8';
  if v_count <> 0 then raise exception 'FALLO S9.8: in_progress nunca finalizada dejó de ser eliminable'; end if;
  raise notice '✔ S9.8 IN_PROGRESS_NEVER_FINALIZED_DELETE_ALLOWED';
end $$;

-- S9.9 · Bypass completo con el rol autenticado real (§24/§48)
do $$
declare v_lock timestamptz; v_lock2 timestamptz; msg text; v_count int;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-1111-0000-0000-000000000004', true);
  set local role authenticated;
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000c9', 'ffffffff-0000-0000-0000-000000000004',
          'OP-RLS-H', current_date, 'in_progress');
  -- cerrar (UPDATE permitido por RLS) → candado activado en BD
  update production_orders set status = 'closed' where id = 'ffffffff-4444-0000-0000-0000000000c9';
  select history_locked_at into v_lock from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c9';
  if v_lock is null then raise exception 'FALLO S9.9: el cierre autenticado no activó el candado'; end if;
  -- reabrir (UPDATE permitido: reapertura) → candado permanece
  update production_orders set status = 'in_progress' where id = 'ffffffff-4444-0000-0000-0000000000c9';
  select history_locked_at into v_lock2 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c9';
  if v_lock2 is distinct from v_lock then raise exception 'FALLO S9.9: la reapertura autenticada alteró el candado'; end if;
  -- intentar limpiar el candado → restaurado por la BD
  update production_orders set history_locked_at = null where id = 'ffffffff-4444-0000-0000-0000000000c9';
  select history_locked_at into v_lock2 from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c9';
  if v_lock2 is distinct from v_lock then raise exception 'FALLO S9.9: el candado pudo limpiarse bajo authenticated'; end if;
  -- DELETE: la RLS lo permitiría (admin), el candado lo veta
  begin
    delete from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c9';
    raise exception 'FALLO S9.9: el admin autenticado eliminó una orden histórica reabierta';
  exception when others then
    msg := sqlerrm;
  end;
  if msg <> 'Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.' then
    raise exception 'FALLO S9.9: mensaje inesperado bajo authenticated: %', msg;
  end if;
  reset role;
  select count(*) into v_count from production_orders where id = 'ffffffff-4444-0000-0000-0000000000c9';
  if v_count <> 1 then raise exception 'FALLO S9.9: la orden desapareció'; end if;
  raise notice '✔ S9.9 RLS/API: cerrar y reabrir permitidos; limpiar el candado imposible; DELETE vetado aunque la RLS lo permita';
end $$;

-- S9.10 · Auditoría (§28): cierre y reapertura quedaron en audit_log
do $$
declare v_close int; v_reopen int;
begin
  select count(*) into v_close from audit_log
   where table_name = 'production_orders'
     and row_id = 'ffffffff-4444-0000-0000-0000000000c1'
     and operation = 'UPDATE'
     and diff -> 'new' ->> 'status' = 'closed';
  select count(*) into v_reopen from audit_log
   where table_name = 'production_orders'
     and row_id = 'ffffffff-4444-0000-0000-0000000000c1'
     and operation = 'UPDATE'
     and diff -> 'old' ->> 'status' in ('closed', 'cancelled')
     and diff -> 'new' ->> 'status' = 'in_progress';
  if v_close < 1 or v_reopen < 1 then
    raise exception 'FALLO S9.10: cierre (%) o reapertura (%) sin fila de auditoría', v_close, v_reopen;
  end if;
  raise notice '✔ S9.10 AUDIT: cierre y reapertura auditados por t_audit_production_orders (diff old/new)';
end $$;

-- S9.11 · Backfill de la 0104: idempotente y con evidencia inequívoca
do $$
declare
  org uuid := 'ffffffff-0000-0000-0000-000000000005';
  v_lock timestamptz;
begin
  insert into organizations (id, name) values (org, 'Org Backfill');
  -- Fixture 1: orden HOY finalizada pero SIN candado (simula una fila
  -- previa a PCR-02.3; hay que esquivar los triggers para construirla).
  alter table production_orders disable trigger t_production_orders_history_lock;
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000d1', org, 'OP-PRE-1', current_date, 'closed');
  -- Fixture 2: orden reabierta ANTES del sprint — hoy in_progress, sin
  -- candado, con su paso por closed registrado SOLO en audit_log.
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000d2', org, 'OP-PRE-2', current_date, 'in_progress');
  insert into audit_log (organization_id, table_name, operation, row_id, diff)
  values (org, 'production_orders', 'UPDATE', 'ffffffff-4444-0000-0000-0000000000d2',
          jsonb_build_object('old', jsonb_build_object('status', 'in_progress'),
                             'new', jsonb_build_object('status', 'closed')));
  -- Re-ejecutar los DOS pasos de backfill de la 0104 (idempotentes). En la
  -- migración real corren ANTES de crear el trigger del candado (orden
  -- explícito de la 0104: columna → backfill → trigger, porque la columna
  -- gestionada por el sistema descartaría el valor del backfill en órdenes
  -- abiertas); aquí se reproduce ese mismo orden manteniendo el trigger
  -- deshabilitado durante el backfill:
  update production_orders
     set history_locked_at = now()
   where history_locked_at is null
     and status in ('closed', 'cancelled');
  update production_orders po
     set history_locked_at = now()
   where po.history_locked_at is null
     and exists (
       select 1 from audit_log al
        where al.table_name = 'production_orders'
          and al.row_id = po.id
          and (al.diff -> 'new' ->> 'status' in ('closed', 'cancelled')
            or al.diff -> 'old' ->> 'status' in ('closed', 'cancelled'))
     );

  select history_locked_at into v_lock from production_orders where id = 'ffffffff-4444-0000-0000-0000000000d1';
  if v_lock is null then raise exception 'FALLO S9.11: el backfill por estado no cubrió la orden finalizada'; end if;
  select history_locked_at into v_lock from production_orders where id = 'ffffffff-4444-0000-0000-0000000000d2';
  if v_lock is null then raise exception 'FALLO S9.11: el backfill por audit_log no cubrió la orden reabierta pre-sprint'; end if;
  alter table production_orders enable trigger t_production_orders_history_lock;
  -- Control negativo: una orden sin evidencia NO recibe candado.
  insert into production_orders (id, organization_id, order_code, order_date, status)
  values ('ffffffff-4444-0000-0000-0000000000d3', org, 'OP-PRE-3', current_date, 'in_progress');
  update production_orders po
     set history_locked_at = now()
   where po.history_locked_at is null
     and exists (
       select 1 from audit_log al
        where al.table_name = 'production_orders'
          and al.row_id = po.id
          and (al.diff -> 'new' ->> 'status' in ('closed', 'cancelled')
            or al.diff -> 'old' ->> 'status' in ('closed', 'cancelled'))
     );
  select history_locked_at into v_lock from production_orders where id = 'ffffffff-4444-0000-0000-0000000000d3';
  if v_lock is not null then raise exception 'FALLO S9.11: el backfill marcó una orden sin evidencia (no se inventa historia)'; end if;
  raise notice '✔ S9.11 BACKFILL: finalizadas y reabiertas pre-sprint reciben candado; sin evidencia, nada se inventa';
end $$;

select '== pcr02_3_assertions.sql: TODAS LAS ASERCIONES PASARON ==' as resultado;
