-- ============================================================================
-- 0105_pcr025_inventory_and_quantity_guards.sql · Sprint PCR-02.5
-- ============================================================================
-- La 0104 YA ESTÁ APLICADA en Production y es INMUTABLE: todo cambio nuevo
-- de base vive aquí. Cuatro responsabilidades, todas aditivas y reversibles:
--
--   §0 Candados de tabla + atomicidad DELEGADA (PCR-02.5.2): el preflight
--      y la instalación de triggers son un TODO atómico SIN transaction
--      control embebido — la transacción la administra SIEMPRE el runner
--      (Supabase CLI en despliegues; psql --single-transaction en el arnés
--      local). El LOCK cierra la ventana entre verificación y guarda.
--   §1 Cantidad producida OBLIGATORIA (Bloque A): preflight que FALLA de
--      forma explícita si existieran datos históricos inválidos (jamás se
--      inventa una cantidad) + NOT NULL sobre output_batches.
--      El CHECK (> 0) ya existe desde 0025 y con NOT NULL queda pleno.
--   §1b Preflight del SOBRECONSUMO HISTÓRICO (PCR-02.5.1): los triggers
--      impiden sobreconsumos FUTUROS; si el pasado ya viola el invariante
--      (consumido > recibido, o consumo interno > producido), el sistema de
--      inventario NO puede activarse mostrando saldos negativos desde el
--      minuto uno. La migración se detiene listando lotes afectados; jamás
--      corrige cantidades, borra consumos ni inventa stock.
--   §2 Inventario OPERATIVO derivado (Bloques B y D): tres vistas
--      security_invoker — saldo por lote de entrada, saldo por lote
--      producido y agregado por material. Sin tabla de stock mutable: el
--      saldo se deriva SIEMPRE de los movimientos reales.
--   §3 Control de saldos anti-sobreconsumo (Bloques C y D): triggers
--      BEFORE INSERT/UPDATE sobre ambas tablas de consumo con
--      SELECT … FOR UPDATE del lote padre (serialización real frente a
--      concurrencia) + guardas de «piso» que impiden reducir la cantidad
--      de un lote por debajo de lo ya consumido.
--   §4 Verificaciones manuales.
--
-- Seguridad: SECURITY INVOKER en todo; search_path fijo; consultas SIEMPRE
-- acotadas por organization_id (sin oracle cross-tenant); las vistas heredan
-- la RLS de las tablas base vía security_invoker (mismo patrón que las
-- vistas §4/§4b de la 0104). Nada aquí modifica la lógica de planes
-- Demo/Full/Extra ni las reglas PCR-02.4 (que disparan ANTES por orden
-- alfabético de triggers, conservando sus mensajes).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §0 · Atomicidad y ventana de concurrencia (PCR-02.5.1 → PCR-02.5.2)
-- ----------------------------------------------------------------------------
-- Esta migración NO contiene control transaccional propio (sin BEGIN/COMMIT
-- top-level): el runner de migraciones de Supabase CLI administra por sí
-- mismo transacciones/batches e historial, y un COMMIT manual embebido
-- interactúa mal con él. La atomicidad la garantiza SIEMPRE el ejecutor:
--   · Supabase CLI (`db push`): ejecuta la migración dentro de su propia
--     gestión transaccional — un fallo de preflight no deja nada a medias.
--   · Arnés local (tests/db/run-local-pg.sh): aplica ESTE archivo con
--     `psql --single-transaction` (BEGIN/COMMIT del CLIENTE, no del
--     archivo); demostrado en los pasos LEGACY: tras un abort no existen
--     ni vistas ni triggers y el dato legacy queda intacto.
-- Compatibilidad transaccional verificada: ninguna sentencia exige salir
-- de una transacción — sin CREATE INDEX CONCURRENTLY, sin VACUUM, sin
-- ALTER SYSTEM, sin CREATE/DROP DATABASE.
--
-- Candado: SHARE ROW EXCLUSIVE sobre las cuatro tablas del invariante,
-- PRIMERA operación de protección (antes de cualquier preflight) y dentro
-- de la transacción administrada por el runner — bloquea INSERT/UPDATE/
-- DELETE concurrentes durante el tramo protegido; se toman las cuatro en
-- una única sentencia (un solo punto de adquisición → sin interbloqueos
-- introducidos por la propia migración; los escritores solo esperan).
-- Nota prudente sobre lecturas: el SHARE ROW EXCLUSIVE no bloquea el
-- ACCESS SHARE de un SELECT, pero el DDL posterior (p. ej. el SET NOT
-- NULL de §1) puede exigir brevemente candados más fuertes: la migración
-- debe ser corta y aplicarse en ventana de baja actividad, sin prometer
-- cero bloqueo de lecturas.

lock table public.input_batches,
           public.output_batches,
           public.batch_consumption,
           public.output_batch_consumption
  in share row exclusive mode;

-- ----------------------------------------------------------------------------
-- §1 · Cantidad producida obligatoria (Bloque A)
-- ----------------------------------------------------------------------------
-- Preflight fail-closed sobre datos existentes (§4.3 del brief): si hubiera
-- filas históricas con cantidad NULL o <= 0, la migración FALLA con un
-- listado accionable. NO se rellena automáticamente ninguna cantidad: la
-- masa producida es un dato de trazabilidad y solo puede aportarlo la
-- empresa. (El CHECK de 0025 ya impide <= 0 en filas nuevas; el preflight
-- lo re-verifica por si un entorno lo hubiera relajado manualmente.)
do $$
declare
  v_bad int;
  v_examples text;
begin
  select count(*),
         string_agg(batch_code, ', ' order by batch_code) filter (where rn <= 5)
    into v_bad, v_examples
    from (
      select batch_code,
             row_number() over (order by batch_code) as rn
        from public.output_batches
       where produced_quantity_kg is null
          or produced_quantity_kg <= 0
    ) t;
  if v_bad > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'PCR-02.5 · La migración 0105 se detiene: %s lote(s) producido(s) sin cantidad válida (p. ej.: %s). Registra la cantidad real en kg de cada uno y vuelve a aplicar la migración. No se inventan cantidades.',
        v_bad, coalesce(v_examples, '—')
      );
  end if;
end $$;

alter table public.output_batches
  alter column produced_quantity_kg set not null;

comment on column public.output_batches.produced_quantity_kg is
  'PCR-02.5 · OBLIGATORIA (> 0, CHECK de 0025 + NOT NULL de 0105): sin cantidad producida no hay balance de masas, inventario interno ni contenido reciclado defendible.';

-- ----------------------------------------------------------------------------
-- §1b · Preflight fail-closed del sobreconsumo HISTÓRICO (PCR-02.5.1)
-- ----------------------------------------------------------------------------
-- EXTERNO: ningún lote de entrada puede tener consumo acumulado por encima
-- de su cantidad recibida ANTES de activar el inventario.
do $$
declare
  v_bad int;
  v_examples text;
begin
  select count(*),
         string_agg(batch_code, ', ' order by batch_code) filter (where rn <= 5)
    into v_bad, v_examples
    from (
      select ib.batch_code,
             row_number() over (order by ib.batch_code) as rn
        from public.input_batches ib
        join lateral (
          select coalesce(sum(bc.mass_kg), 0) as consumed
            from public.batch_consumption bc
           where bc.organization_id = ib.organization_id
             and bc.input_batch_id = ib.id
        ) c on true
       where c.consumed > ib.quantity_kg
    ) t;
  if v_bad > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'PCR-02.5 · La migración 0105 se detiene: %s lote(s) de entrada con consumo acumulado superior a la cantidad recibida (p. ej.: %s). Corrige los datos reales (cantidad recibida o consumos) con la empresa antes de volver a aplicar la migración. No se corrigen cantidades automáticamente, no se borran consumos y no se inventa stock.',
        v_bad, coalesce(v_examples, '—')
      );
  end if;
end $$;

-- INTERNO: mismo invariante para los lotes producidos reutilizables.
do $$
declare
  v_bad int;
  v_examples text;
begin
  select count(*),
         string_agg(batch_code, ', ' order by batch_code) filter (where rn <= 5)
    into v_bad, v_examples
    from (
      select ob.batch_code,
             row_number() over (order by ob.batch_code) as rn
        from public.output_batches ob
        join lateral (
          select coalesce(sum(obc.mass_kg), 0) as consumed
            from public.output_batch_consumption obc
           where obc.organization_id = ob.organization_id
             and obc.output_batch_id = ob.id
        ) c on true
       where c.consumed > ob.produced_quantity_kg
    ) t;
  if v_bad > 0 then
    raise exception using
      errcode = '23514',
      message = format(
        'PCR-02.5 · La migración 0105 se detiene: %s lote(s) producido(s) con consumo interno acumulado superior a la cantidad producida (p. ej.: %s). Corrige los datos reales con la empresa antes de volver a aplicar la migración. No se corrigen cantidades automáticamente, no se borran consumos y no se inventa stock.',
        v_bad, coalesce(v_examples, '—')
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- §2 · Inventario operativo derivado (Bloques B y D)
-- ----------------------------------------------------------------------------
-- Sin tabla de stock: saldo = movimientos reales, calculado en la base (no
-- «miles de filas al cliente para sumar en JavaScript»). security_invoker:
-- cada consulta corre con la RLS del usuario — una empresa jamás ve el
-- inventario de otra.

-- Saldo por LOTE DE ENTRADA (inventario externo):
--   available_kg = input_batches.quantity_kg − Σ batch_consumption.mass_kg
create or replace view public.v_input_batch_inventory
with (security_invoker = true) as
select
  ib.organization_id,
  ib.id                as input_batch_id,
  ib.batch_code,
  ib.material_id,
  m.name               as material_name,
  ib.supplier_id,
  s.name               as supplier_name,
  ib.received_date,
  ib.quantity_kg       as received_kg,
  coalesce(c.consumed_kg, 0)                    as consumed_kg,
  ib.quantity_kg - coalesce(c.consumed_kg, 0)   as available_kg
from public.input_batches ib
join public.materials m
  on m.organization_id = ib.organization_id and m.id = ib.material_id
left join public.suppliers s
  on s.organization_id = ib.organization_id and s.id = ib.supplier_id
left join lateral (
  select sum(bc.mass_kg) as consumed_kg
    from public.batch_consumption bc
   where bc.organization_id = ib.organization_id
     and bc.input_batch_id = ib.id
) c on true;

comment on view public.v_input_batch_inventory is
  'PCR-02.5 · Inventario externo derivado por lote de entrada (recibido/consumido/disponible). security_invoker: hereda la RLS de las tablas base.';

-- Saldo por LOTE PRODUCIDO (inventario interno, modelo PCR-02):
--   available_kg = output_batches.produced_quantity_kg − Σ output_batch_consumption.mass_kg
create or replace view public.v_output_batch_inventory
with (security_invoker = true) as
select
  ob.organization_id,
  ob.id                    as output_batch_id,
  ob.batch_code,
  ob.production_order_id,
  po.order_code            as production_order_code,
  po.status                as production_order_status,
  ob.produced_quantity_kg  as produced_kg,
  coalesce(c.consumed_kg, 0)                          as consumed_internally_kg,
  ob.produced_quantity_kg - coalesce(c.consumed_kg, 0) as available_kg
from public.output_batches ob
join public.production_orders po
  on po.organization_id = ob.organization_id and po.id = ob.production_order_id
left join lateral (
  select sum(obc.mass_kg) as consumed_kg
    from public.output_batch_consumption obc
   where obc.organization_id = ob.organization_id
     and obc.output_batch_id = ob.id
) c on true;

comment on view public.v_output_batch_inventory is
  'PCR-02.5 · Inventario interno derivado por lote producido (producido/consumido internamente/disponible). security_invoker: hereda la RLS de las tablas base.';

-- Agregado por MATERIAL (Bloque B, §7): recibido/consumido/disponible y
-- número de lotes con saldo, calculado en la base sobre la vista por lote.
create or replace view public.v_material_inventory
with (security_invoker = true) as
select
  organization_id,
  material_id,
  material_name,
  sum(received_kg)   as received_kg,
  sum(consumed_kg)   as consumed_kg,
  sum(available_kg)  as available_kg,
  count(*) filter (where available_kg > 0) as batches_with_balance,
  count(*)           as batches_total
from public.v_input_batch_inventory
group by organization_id, material_id, material_name;

comment on view public.v_material_inventory is
  'PCR-02.5 · Inventario agregado por material (Bloque B). Derivado de v_input_batch_inventory; security_invoker en cadena.';

revoke all on public.v_input_batch_inventory,
              public.v_output_batch_inventory,
              public.v_material_inventory
  from public, anon;
grant select on public.v_input_batch_inventory,
                public.v_output_batch_inventory,
                public.v_material_inventory
  to authenticated;

-- ----------------------------------------------------------------------------
-- §3 · Control de saldos anti-sobreconsumo (Bloques C y D)
-- ----------------------------------------------------------------------------
-- Diseño de concurrencia (§11/§25): la validación «SELECT saldo; INSERT»
-- sin serializar sufre race conditions (dos sesiones leen 100 disponibles y
-- ambas insertan 60). Aquí el trigger BEFORE toma un candado de fila sobre
-- el LOTE PADRE con SELECT … FOR UPDATE: toda escritura de consumo sobre un
-- mismo lote queda serializada; la segunda sesión espera el commit de la
-- primera y su SUM (nueva instantánea por sentencia en READ COMMITTED) ya
-- ve el consumo confirmado → rechaza. Se eligió row-lock del padre frente a
-- advisory locks (frágiles: exigen disciplina de clave y no ligan el
-- candado al dato) y frente a SERIALIZABLE global (coste y reintentos en
-- toda la app). El DELETE no necesita guarda: devolver saldo nunca lo hace
-- negativo (§13) y el saldo es derivado — no existe «movimiento manual».
--
-- UPDATE (§12): el tope efectivo excluye la PROPIA fila (sum … and id <>
-- new.id): editar un consumo de 20 con otros 70 sobre un lote de 100
-- permite hasta 30, no 10. Cubre también mover el consumo de lote (valida
-- el lote del NEW; el saldo del lote anterior se libera solo).
--
-- Interacción con PCR-02.4 (§16): los triggers structural_guard de la 0104
-- disparan ANTES por orden alfabético BEFORE ('structural' < 'total'):
-- sobre una orden cerrada el mensaje sigue siendo el de reapertura; estas
-- guardas de saldo actúan sobre órdenes abiertas/reabiertas. Anti-
-- autoconsumo, tenant y genealogía intactos.

create or replace function public.batch_consumption_total_balance_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quantity numeric;
  v_others numeric;
begin
  -- Candado del lote padre: serializa todos los consumos de ese lote.
  select ib.quantity_kg
    into v_quantity
    from public.input_batches ib
   where ib.organization_id = new.organization_id
     and ib.id = new.input_batch_id
     for update;
  if v_quantity is null then
    return new;  -- existencia/tenant: responsabilidad de FK compuestas + RLS
  end if;
  select coalesce(sum(bc.mass_kg), 0)
    into v_others
    from public.batch_consumption bc
   where bc.organization_id = new.organization_id
     and bc.input_batch_id = new.input_batch_id
     and bc.id <> new.id;  -- §12: la propia fila se reutiliza al editar
  if v_others + new.mass_kg > v_quantity then
    raise exception 'La cantidad a consumir supera el saldo disponible del lote. Disponible: % kg.',
      trim_scale(greatest(v_quantity - v_others, 0))
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.batch_consumption_total_balance_guard() is
  'PCR-02.5 · Anti-sobreconsumo EXTERNO con serialización por candado de fila del lote (FOR UPDATE). INSERT/UPDATE; excluye la propia fila al editar. SECURITY INVOKER.';

revoke execute on function public.batch_consumption_total_balance_guard() from public, anon, authenticated;

drop trigger if exists t_batch_consumption_total_balance_guard on public.batch_consumption;
create trigger t_batch_consumption_total_balance_guard
  before insert or update on public.batch_consumption
  for each row execute function public.batch_consumption_total_balance_guard();

create or replace function public.output_batch_consumption_total_balance_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quantity numeric;
  v_others numeric;
begin
  select ob.produced_quantity_kg
    into v_quantity
    from public.output_batches ob
   where ob.organization_id = new.organization_id
     and ob.id = new.output_batch_id
     for update;
  if v_quantity is null then
    return new;
  end if;
  select coalesce(sum(obc.mass_kg), 0)
    into v_others
    from public.output_batch_consumption obc
   where obc.organization_id = new.organization_id
     and obc.output_batch_id = new.output_batch_id
     and obc.id <> new.id;
  if v_others + new.mass_kg > v_quantity then
    raise exception 'La cantidad a consumir supera el saldo disponible del lote producido. Disponible: % kg.',
      trim_scale(greatest(v_quantity - v_others, 0))
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.output_batch_consumption_total_balance_guard() is
  'PCR-02.5 · Anti-sobreconsumo INTERNO (lotes producidos reutilizables, modelo PCR-02) con candado de fila del lote (FOR UPDATE). SECURITY INVOKER.';

revoke execute on function public.output_batch_consumption_total_balance_guard() from public, anon, authenticated;

drop trigger if exists t_output_batch_consumption_total_balance_guard on public.output_batch_consumption;
create trigger t_output_batch_consumption_total_balance_guard
  before insert or update on public.output_batch_consumption
  for each row execute function public.output_batch_consumption_total_balance_guard();

-- Guardas de «piso» (revisión adversarial): reducir la cantidad del lote
-- por debajo de lo ya consumido crearía inventario negativo por la puerta
-- de atrás. La fila del propio lote ya está bloqueada por el UPDATE, y los
-- triggers de consumo esperan ese candado (FOR UPDATE) → sin carreras.
create or replace function public.input_batches_total_balance_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_consumed numeric;
begin
  if new.quantity_kg is distinct from old.quantity_kg then
    select coalesce(sum(bc.mass_kg), 0)
      into v_consumed
      from public.batch_consumption bc
     where bc.organization_id = old.organization_id
       and bc.input_batch_id = old.id;
    if new.quantity_kg < v_consumed then
      raise exception 'La cantidad recibida no puede quedar por debajo de lo ya consumido del lote. Consumido: % kg.',
        trim_scale(v_consumed)
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.input_batches_total_balance_guard() is
  'PCR-02.5 · Piso del lote de entrada: su cantidad recibida no puede caer por debajo del consumo ya registrado. SECURITY INVOKER.';

revoke execute on function public.input_batches_total_balance_guard() from public, anon, authenticated;

drop trigger if exists t_input_batches_total_balance_guard on public.input_batches;
create trigger t_input_batches_total_balance_guard
  before update on public.input_batches
  for each row execute function public.input_batches_total_balance_guard();

create or replace function public.output_batches_total_balance_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_consumed numeric;
begin
  if new.produced_quantity_kg is distinct from old.produced_quantity_kg then
    select coalesce(sum(obc.mass_kg), 0)
      into v_consumed
      from public.output_batch_consumption obc
     where obc.organization_id = old.organization_id
       and obc.output_batch_id = old.id;
    if new.produced_quantity_kg < v_consumed then
      raise exception 'La cantidad producida no puede quedar por debajo de lo ya consumido internamente del lote. Consumido: % kg.',
        trim_scale(v_consumed)
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.output_batches_total_balance_guard() is
  'PCR-02.5 · Piso del lote producido: su cantidad no puede caer por debajo del consumo interno ya registrado. Dispara DESPUÉS del structural guard 0104 (orden alfabético BEFORE), que sigue mandando sobre órdenes cerradas. SECURITY INVOKER.';

revoke execute on function public.output_batches_total_balance_guard() from public, anon, authenticated;

drop trigger if exists t_output_batches_total_balance_guard on public.output_batches;
create trigger t_output_batches_total_balance_guard
  before update on public.output_batches
  for each row execute function public.output_batches_total_balance_guard();

-- ----------------------------------------------------------------------------
-- §4 · Verificaciones manuales (resumen)
-- ----------------------------------------------------------------------------
--   insert into output_batches (…sin produced_quantity_kg…) → not-null.
--   lote 100 kg: insert 60 + insert 40 → ok; insert 1 más → 'La cantidad a
--   consumir supera el saldo disponible del lote. Disponible: 0 kg.'
--   update del consumo 60 → 100 con otros 0 → ok; 60 → 101 → rechazado.
--   delete consumo → v_input_batch_inventory.available_kg vuelve a subir.
--   lote producido 50: consumos internos 30 + 20 → ok; 1 más → 'Disponible:
--   0 kg.' (mensaje del lote producido).
--   update input_batches.quantity_kg por debajo del consumo → 'Consumido: …'
--   select * from v_material_inventory → solo la organización propia
--   (security_invoker + RLS).
--   Dos sesiones concurrentes insertando 60+60 sobre 100 → la segunda
--   espera el candado y es rechazada (tests/db/pcr02_5_concurrency.sh).
--   Con datos legacy inválidos ANTES de aplicar (consumido 101 sobre lote
--   de 100, o consumo interno 51 sobre producido 50) la migración FALLA
--   listando los batch_code y NO deja nada a medias (transacción del
--   runner: --single-transaction en el arnés, la del CLI en despliegue); con
--   saldo exacto (100/100, 50/50) aplica limpia — demostrado en el runner
--   (pasos 4a/4b/4c).
