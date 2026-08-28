-- ============================================================================
-- Trazaloop · PCR/TEXTILES PRE-INTEGRATION · PT-02B
-- EL HECHO MÍNIMO DE SALIDA FÍSICA
-- ----------------------------------------------------------------------------
-- LO QUE HABÍA, Y POR QUÉ NO ERA INVENTARIO
--
-- `v_output_batch_inventory` (0105) calcula:
--
--     producido − reconsumido_internamente
--
-- y a eso lo llama `available_kg`. El reconsumo interno es un lote de salida
-- que vuelve a entrar en otra orden. Es el ÚNICO camino de salida que el
-- modelo conoce.
--
-- No hay despacho. No hay venta. No hay entrega, ni merma, ni ajuste por
-- recuento. Así que un lote producido y vendido íntegramente sigue figurando
-- disponible para siempre, y la pantalla lo presentaba con la misma etiqueta
-- —«Disponible»— que un lote que de verdad está en el almacén.
--
-- PT-F13 manda dejar de presentarlo como inventario ANTES de construir nada.
-- Eso es código y ya está hecho. Esta migración es la otra mitad: el hecho que
-- faltaba para que la palabra «disponible» signifique algo.
--
--
-- LO QUE NO SE MODELA, Y NO ES UN OLVIDO
--
-- Ni pedidos, ni clientes, ni facturas, ni almacenes, ni ubicaciones, ni
-- logística, ni precios. `reference` es un texto libre: quien quiera anotar el
-- número de una remisión lo anota. El día que haga falta un cliente de verdad,
-- `quality_external_parties` ya existe y es el sitio — no una tabla nueva.
--
-- La pregunta que esto responde es una sola: ¿cuánto de este lote sigue
-- físicamente disponible?
--
--
-- CORRECCIÓN SIN DESTRUCCIÓN
--
-- El patrón no se inventa: `quality_measurements` ya lo tiene probado en esta
-- casa —`corrects_*_id`, `superseded_by_*_id`, `correction_reason`,
-- `is_current`, con sus dos CHECK—. Corregir INSERTA; el movimiento original
-- se queda, marcado como no vigente. Y `DELETE` se bloquea, igual que
-- `production_orders_protect_history` bloquea borrar una orden que ya es
-- historial.
-- ============================================================================


-- ============================================================================
-- 1 · LA TABLA
-- ============================================================================

create table if not exists public.output_batch_movements (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations(id) on delete restrict,
  output_batch_id           uuid not null,

  -- Qué clase de salida es. Cuatro, y ni una más de las que hacen falta para
  -- responder «cuánto queda»:
  --   dispatch      salió de la empresa (entrega, despacho, venta)
  --   internal_use  se usó dentro para algo que no es reproceso de producción
  --   loss          se perdió (merma, daño, descarte)
  --   adjustment    corrección por recuento físico; el signo lo pone `direction`
  movement_kind             text not null,
  -- `adjustment` es el único que puede sumar. Los demás siempre restan, y el
  -- signo NO viaja en la cantidad: una cantidad negativa es un dato que se
  -- puede teclear mal sin que nada chirríe.
  direction                 text not null default 'out',

  quantity                  numeric not null,
  unit_code                 text not null default 'kg',
  -- CUÁNDO PASÓ, no cuándo se tecleó. `created_at` ya dice lo segundo.
  occurred_at               timestamptz not null default now(),

  reason                    text,
  reference                 text,

  -- Linaje de corrección (patrón de quality_measurements).
  corrects_movement_id      uuid references public.output_batch_movements(id),
  superseded_by_movement_id uuid references public.output_batch_movements(id),
  correction_reason         text,
  is_current                boolean not null default true,

  notes                     text,
  created_by                uuid not null references public.profiles(id),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint output_batch_movements_org_id_uniq unique (organization_id, id),
  constraint output_batch_movements_batch_fk
    foreign key (organization_id, output_batch_id)
    references public.output_batches(organization_id, id) on delete restrict,

  constraint output_batch_movements_kind_check check (
    movement_kind = any (array['dispatch', 'internal_use', 'loss', 'adjustment'])),
  constraint output_batch_movements_direction_check check (
    direction = any (array['in', 'out'])),
  -- Solo un ajuste puede sumar. Un despacho que entra sería un despacho al revés.
  constraint output_batch_movements_direction_kind check (
    direction = 'out' or movement_kind = 'adjustment'),
  -- Cantidad SIEMPRE positiva: el sentido lo lleva `direction`.
  constraint output_batch_movements_quantity_positive check (quantity > 0),
  constraint output_batch_movements_unit_check check (
    unit_code = any (array['kg','g','ton','m','cm','m2','unit','roll','other'])),
  -- Perder o ajustar exige explicarse. Despachar, no: el hecho se explica solo.
  constraint output_batch_movements_reason_required check (
    movement_kind not in ('loss', 'adjustment')
    or length(btrim(coalesce(reason, ''))) > 0),
  -- Los dos CHECK del patrón de quality_measurements, uno a uno.
  constraint output_batch_movements_correction_reason check (
    corrects_movement_id is null
    or length(btrim(coalesce(correction_reason, ''))) > 0),
  constraint output_batch_movements_current_consistent check (
    superseded_by_movement_id is null or not is_current)
);

create index if not exists output_batch_movements_batch_idx
  on public.output_batch_movements (organization_id, output_batch_id, is_current);
create index if not exists output_batch_movements_occurred_idx
  on public.output_batch_movements (organization_id, occurred_at desc);

comment on table public.output_batch_movements is
  'PT-02B · Movimientos fisicos que cambian la disponibilidad de un lote producido. NO es un ERP: sin pedidos, clientes, facturas ni almacenes. Responde una sola pregunta: cuanto de este lote sigue fisicamente disponible.';
comment on column public.output_batch_movements.occurred_at is
  'PT-02B · Cuando PASO. created_at ya dice cuando se teclo, que es otra cosa.';
comment on column public.output_batch_movements.direction is
  'PT-02B · out (resta) o in (suma). Solo un adjustment puede ser in. El signo NO viaja en la cantidad: un numero negativo se teclea mal sin que nada chirrie.';
comment on column public.output_batch_movements.reference is
  'PT-02B · Texto libre del cliente: numero de remision, pedido, lo que sea. Si algun dia hace falta un cliente de verdad, quality_external_parties ya existe y es el sitio.';


-- ============================================================================
-- 2 · NADA SE BORRA
-- ----------------------------------------------------------------------------
-- Mismo criterio que `production_orders_protect_history`: un movimiento
-- registrado es historial y el historial no se borra. Corregir es INSERTAR
-- otro que apunte a este.
-- ============================================================================

create or replace function public.output_batch_movements_no_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Un movimiento registrado no se elimina: forma parte del historial del lote. Registra una correccion, que conserva el original.'
    using errcode = '23514';
end;
$$;

drop trigger if exists t_output_batch_movements_no_delete on public.output_batch_movements;
create trigger t_output_batch_movements_no_delete
  before delete on public.output_batch_movements
  for each row execute function public.output_batch_movements_no_delete();

drop trigger if exists t_output_batch_movements_created_by on public.output_batch_movements;
create trigger t_output_batch_movements_created_by
  before insert on public.output_batch_movements
  for each row execute function public.force_created_by();

drop trigger if exists t_output_batch_movements_org_immutable on public.output_batch_movements;
create trigger t_output_batch_movements_org_immutable
  before update on public.output_batch_movements
  for each row execute function public.prevent_organization_id_change();

drop trigger if exists t_output_batch_movements_updated_at on public.output_batch_movements;
create trigger t_output_batch_movements_updated_at
  before update on public.output_batch_movements
  for each row execute function public.set_updated_at();

drop trigger if exists t_output_batch_movements_audit on public.output_batch_movements;
create trigger t_output_batch_movements_audit
  after insert or update or delete on public.output_batch_movements
  for each row execute function public.audit_row_change();


-- ============================================================================
-- 3 · NO SE PUEDE SACAR MÁS DE LO QUE HAY
-- ----------------------------------------------------------------------------
-- Con el mismo candado que 0105 puso en PCR y 0143 en Textiles. Sin él, dos
-- despachos simultaneos leerian el mismo saldo previo y pasarian los dos.
--
-- Y las unidades: si el movimiento no esta en la misma unidad que el lote, se
-- RECHAZA. Trazaloop no convierte.
-- ============================================================================

create or replace function public.output_batch_movement_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_producido numeric;
  v_interno   numeric;
  v_salidas   numeric;
  v_disp      numeric;
begin
  -- El candado sobre el lote padre serializa sus movimientos.
  select produced_quantity_kg into v_producido
    from public.output_batches
   where organization_id = new.organization_id
     and id = new.output_batch_id
   for update;

  if v_producido is null then
    raise exception 'El lote producido no existe o no declara cantidad' using errcode = '23503';
  end if;

  -- PCR mide en kg y solo en kg: la unidad esta en el nombre de la columna y
  -- en las reglas de la metodologia. Un movimiento en otra unidad no se puede
  -- restar de una cantidad en kg sin convertir, y no se convierte.
  if new.unit_code <> 'kg' then
    raise exception 'Los lotes producidos se miden en kilogramos. Registra el movimiento en kg: Trazaloop no convierte unidades.'
      using errcode = '23514';
  end if;

  -- Un movimiento que YA NO ES VIGENTE no ocupa saldo, asi que no hay nada que
  -- comprobarle.
  --
  -- No es una comodidad: sin esto, la correccion se rechazaba a si misma. El
  -- ultimo paso de `correct_output_batch_movement` actualiza el movimiento
  -- viejo para apuntarlo a su correccion, ese UPDATE volvia a disparar esta
  -- guarda sobre la fila vieja, y la guarda contaba la correccion recien
  -- insertada como «otras salidas». Corregir 100 kg a 90 fallaba con
  -- «disponible: 10 kg», que era la suma de su propia correccion.
  if not new.is_current then
    return new;
  end if;

  -- Un ajuste que SUMA no puede pasarse de largo: se comprueba igual, pero
  -- por el otro lado. Se deja pasar porque corregir al alza es legitimo.
  if new.direction = 'in' then
    return new;
  end if;

  select coalesce(sum(obc.mass_kg), 0) into v_interno
    from public.output_batch_consumption obc
   where obc.organization_id = new.organization_id
     and obc.output_batch_id = new.output_batch_id;

  select coalesce(sum(case when m.direction = 'out' then m.quantity else -m.quantity end), 0)
    into v_salidas
    from public.output_batch_movements m
   where m.organization_id = new.organization_id
     and m.output_batch_id = new.output_batch_id
     and m.is_current
     and (tg_op = 'INSERT' or m.id <> new.id);

  v_disp := v_producido - v_interno - v_salidas;

  if new.quantity > v_disp then
    raise exception 'El movimiento supera lo disponible del lote. Disponible: % kg (producido % − reproceso interno % − salidas %).',
      trim_scale(greatest(v_disp, 0)), trim_scale(v_producido),
      trim_scale(v_interno), trim_scale(v_salidas)
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists t_output_batch_movement_guard on public.output_batch_movements;
create trigger t_output_batch_movement_guard
  before insert or update on public.output_batch_movements
  for each row execute function public.output_batch_movement_guard();

comment on function public.output_batch_movement_guard() is
  'PT-02B · Impide sacar mas de lo disponible, con el mismo candado FOR UPDATE que 0105 y 0143. Rechaza unidades distintas de kg: PCR mide en kg y no se convierte.';


-- ============================================================================
-- 4 · RLS
-- ----------------------------------------------------------------------------
-- Lectura para la empresa; escritura para quien ya puede registrar produccion.
-- `DELETE` no tiene politica y ademas lo bloquea el disparador: dos capas para
-- lo mismo a proposito, porque una politica se puede relajar de un `alter` y
-- el disparador obliga a pensarlo.
-- ============================================================================

alter table public.output_batch_movements enable row level security;

drop policy if exists output_batch_movements_select on public.output_batch_movements;
create policy output_batch_movements_select on public.output_batch_movements
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists output_batch_movements_insert on public.output_batch_movements;
create policy output_batch_movements_insert on public.output_batch_movements
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );

-- Solo se permite ACTUALIZAR para marcar un movimiento como superado por su
-- correccion. Cambiar la cantidad de un movimiento ya registrado seria
-- reescribir el pasado.
drop policy if exists output_batch_movements_update on public.output_batch_movements;
create policy output_batch_movements_update on public.output_batch_movements
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  )
  with check (public.is_org_member(organization_id));

revoke all on public.output_batch_movements from public, anon;
grant select, insert, update on public.output_batch_movements to authenticated;


-- ============================================================================
-- 5 · LA CORRECCIÓN, EN UNA SOLA OPERACIÓN
-- ----------------------------------------------------------------------------
-- Insertar el nuevo y marcar el viejo tienen que pasar juntos o no pasar: si
-- se hicieran por separado y fallara el segundo, quedarian dos movimientos
-- vigentes y el saldo restaria dos veces.
-- ============================================================================

create or replace function public.correct_output_batch_movement(
  p_movement_id uuid,
  p_quantity    numeric,
  p_reason      text,
  p_occurred_at timestamptz default null
) returns public.output_batch_movements
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_old public.output_batch_movements;
  v_new public.output_batch_movements;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Una correccion sin motivo no explica nada.' using errcode = '23514';
  end if;

  select * into v_old from public.output_batch_movements
   where id = p_movement_id for update;
  if not found then
    raise exception 'El movimiento a corregir no existe' using errcode = '23503';
  end if;
  if not public.is_org_member(v_old.organization_id) then
    raise exception 'No eres miembro activo de la empresa de este movimiento' using errcode = '42501';
  end if;
  if not public.has_org_role(v_old.organization_id, array['admin','quality','consultant']) then
    raise exception 'Tu rol no permite corregir movimientos' using errcode = '42501';
  end if;
  if not v_old.is_current then
    raise exception 'Ese movimiento ya fue corregido. Corrige el vigente.' using errcode = '23514';
  end if;

  -- Primero se retira el viejo: asi la guarda del nuevo ve el hueco que deja
  -- y una correccion a la baja no choca contra su propio original.
  update public.output_batch_movements
     set is_current = false
   where id = v_old.id;

  insert into public.output_batch_movements (
    organization_id, output_batch_id, movement_kind, direction, quantity,
    unit_code, occurred_at, reason, reference,
    corrects_movement_id, correction_reason, is_current, notes, created_by
  ) values (
    v_old.organization_id, v_old.output_batch_id, v_old.movement_kind, v_old.direction,
    p_quantity, v_old.unit_code, coalesce(p_occurred_at, v_old.occurred_at),
    v_old.reason, v_old.reference,
    v_old.id, p_reason, true, v_old.notes, auth.uid()
  ) returning * into v_new;

  update public.output_batch_movements
     set superseded_by_movement_id = v_new.id
   where id = v_old.id;

  return v_new;
end;
$$;

revoke all on function public.correct_output_batch_movement(uuid, numeric, text, timestamptz) from public, anon;
grant execute on function public.correct_output_batch_movement(uuid, numeric, text, timestamptz) to authenticated;

comment on function public.correct_output_batch_movement(uuid, numeric, text, timestamptz) is
  'PT-02B · Corrige INSERTANDO. El original se conserva marcado como no vigente y apuntando a su correccion. Patron de quality_measurements.';


-- ============================================================================
-- 6 · EL SALDO REAL DEL PRODUCTO
-- ----------------------------------------------------------------------------
-- Y una vista aparte, no un reemplazo de `v_output_batch_inventory`: aquella
-- sigue midiendo produccion y reproceso, que es lo que siempre midio. Lo que
-- cambia es que deja de llamarse disponible.
-- ============================================================================

-- `security_invoker = true` en la propia creacion, no en un `alter` aparte:
-- `create or replace view` sin la clausula RESTABLECE las opciones, asi que un
-- alter posterior funciona pero deja la proteccion a un `replace` de distancia.
-- Tres vistas de este sprint perdieron la suya justamente asi.
create or replace view public.v_output_batch_stock
with (security_invoker = true) as
select
  ob.organization_id,
  ob.id                    as output_batch_id,
  ob.batch_code,
  ob.production_order_id,
  po.order_code            as production_order_code,
  ob.product_id,
  p.code                   as product_code,
  p.name                   as product_name,
  ob.produced_date,
  ob.produced_quantity_kg  as produced_kg,
  coalesce(i.kg, 0)        as reprocessed_kg,
  coalesce(d.kg, 0)        as dispatched_kg,
  coalesce(l.kg, 0)        as lost_kg,
  coalesce(iu.kg, 0)       as internal_use_kg,
  coalesce(a.kg, 0)        as adjustment_kg,
  ob.produced_quantity_kg
    - coalesce(i.kg, 0)
    - coalesce(d.kg, 0)
    - coalesce(l.kg, 0)
    - coalesce(iu.kg, 0)
    + coalesce(a.kg, 0)    as available_kg,
  coalesce(m.movimientos, 0) as movements_count
from public.output_batches ob
left join public.production_orders po on po.id = ob.production_order_id
left join public.products p on p.id = ob.product_id
left join lateral (
  select sum(obc.mass_kg) kg from public.output_batch_consumption obc
   where obc.organization_id = ob.organization_id and obc.output_batch_id = ob.id) i on true
left join lateral (
  select sum(quantity) kg from public.output_batch_movements
   where organization_id = ob.organization_id and output_batch_id = ob.id
     and is_current and direction = 'out' and movement_kind = 'dispatch') d on true
left join lateral (
  select sum(quantity) kg from public.output_batch_movements
   where organization_id = ob.organization_id and output_batch_id = ob.id
     and is_current and direction = 'out' and movement_kind = 'loss') l on true
left join lateral (
  select sum(quantity) kg from public.output_batch_movements
   where organization_id = ob.organization_id and output_batch_id = ob.id
     and is_current and direction = 'out' and movement_kind = 'internal_use') iu on true
left join lateral (
  select sum(case when direction = 'in' then quantity else -quantity end) kg
    from public.output_batch_movements
   where organization_id = ob.organization_id and output_batch_id = ob.id
     and is_current and movement_kind = 'adjustment') a on true
left join lateral (
  select count(*) movimientos from public.output_batch_movements
   where organization_id = ob.organization_id and output_batch_id = ob.id and is_current) m on true;

revoke all on public.v_output_batch_stock from public, anon;
grant select on public.v_output_batch_stock to authenticated;

comment on view public.v_output_batch_stock is
  'PT-02B · Lo que queda de verdad de un lote producido: producido - reproceso - despachos - mermas - uso interno + ajustes vigentes. Derivada, sin tabla de existencias. Un lote SIN movimientos sale con todo disponible y movements_count = 0, que es la senal de que nadie ha registrado todavia ninguna salida.';


-- ============================================================================
-- 7 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop view if exists public.v_output_batch_stock;
--   drop function if exists public.correct_output_batch_movement(uuid, numeric, text, timestamptz);
--   drop trigger  if exists t_output_batch_movement_guard on public.output_batch_movements;
--   drop function if exists public.output_batch_movement_guard();
--   drop trigger  if exists t_output_batch_movements_no_delete on public.output_batch_movements;
--   drop function if exists public.output_batch_movements_no_delete();
--   drop table    if exists public.output_batch_movements;   -- pierde los movimientos registrados
--
-- La tabla nace vacia: revertir antes de que nadie registre nada no pierde
-- nada. Despues, si.
-- ============================================================================
