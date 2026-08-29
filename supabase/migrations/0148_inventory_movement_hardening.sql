-- ============================================================================
-- Trazaloop · PT-02B.1 · QUE EL SALDO NO PUEDA MENTIR
-- ----------------------------------------------------------------------------
-- El discovery de movimientos e inventario encontró tres agujeros. Los tres
-- están comprobados con sondas contra la base, no deducidos:
--
--   1 · DOBLE SALIDA. El reproceso interno se validaba contra
--       `v_output_batch_inventory` (0105), que ignora los movimientos.
--       Despachar 100 de 100 y después reprocesar 100 se ACEPTABA, y el saldo
--       quedaba en −100 kg. Dos caminos de salida, cada uno mirando su propio
--       saldo.
--
--   2 · AJUSTE SIN TECHO. El guardián retornaba antes de comprobar nada
--       cuando la dirección sumaba. Un ajuste de 10 000 kg sobre un lote de
--       100 se aceptaba, y el inventario decía 10 045 kg.
--
--   3 · NO SE PODÍA ANULAR. `quantity > 0` impedía llevar a cero un
--       movimiento que nunca ocurrió. Lo máximo era corregirlo a 0,0001 kg,
--       que es una mentira pequeña en lugar de una corrección.
--
-- Y un cambio de semántica que no es un agujero pero sí un error de diseño:
-- el ajuste por recuento pedía la DIFERENCIA. El usuario tenía que restar de
-- cabeza el saldo teórico —con decimales— y el conteo real, que es el hecho
-- medido, no se guardaba en ninguna parte. Ahora se pide lo que se contó y la
-- diferencia se deriva.
--
--
-- POR QUÉ AHORA Y NO DESPUÉS
--
-- `output_batch_movements` nació vacía en 0146 y sigue vacía en Local y en
-- Staging. Production está en 0111 y nunca la recibió. No hay una sola fila
-- de nadie que preservar, así que congelar la semántica correcta cuesta cero.
-- Después del primer uso real, cada una de estas tres cosas sería una
-- migración de datos.
-- ============================================================================


-- ============================================================================
-- 1 · EL SALDO CONSOLIDADO, EN UN SOLO SITIO
-- ----------------------------------------------------------------------------
-- La raíz del primer agujero no era una guarda mal escrita: eran DOS fórmulas
-- de disponibilidad. `v_output_batch_stock` contaba los movimientos y el
-- disparador del reproceso no.
--
-- Esta función es ahora la única. La usan el guardián de movimientos, el
-- guardián de reproceso y —a través de la vista— la pantalla. Una sola verdad,
-- y si algún día cambia, cambia en un sitio.
--
-- NO toma el candado: lo toma quien la llama, sobre la fila del lote, ANTES de
-- preguntar. Meterlo aquí escondería la parte que hay que ver.
-- ============================================================================

create or replace function public.output_batch_available_kg(
  p_organization_id uuid,
  p_output_batch_id uuid,
  -- Para que un UPDATE no se cuente a sí mismo al recalcular su propio hueco.
  p_exclude_movement_id uuid default null,
  p_exclude_consumption_id uuid default null
) returns numeric
language sql
stable
security invoker
set search_path to 'public'
as $$
  select coalesce(ob.produced_quantity_kg, 0)
       - coalesce((
           select sum(obc.mass_kg) from public.output_batch_consumption obc
            where obc.organization_id = p_organization_id
              and obc.output_batch_id = p_output_batch_id
              and (p_exclude_consumption_id is null or obc.id <> p_exclude_consumption_id)
         ), 0)
       - coalesce((
           select sum(case when m.direction = 'out' then m.quantity else -m.quantity end)
             from public.output_batch_movements m
            where m.organization_id = p_organization_id
              and m.output_batch_id = p_output_batch_id
              and m.is_current
              and (p_exclude_movement_id is null or m.id <> p_exclude_movement_id)
         ), 0)
    from public.output_batches ob
   where ob.organization_id = p_organization_id
     and ob.id = p_output_batch_id;
$$;

comment on function public.output_batch_available_kg(uuid, uuid, uuid, uuid) is
  'PT-02B.1 · El saldo consolidado de un lote producido: producido - reproceso interno - salidas vigentes + ajustes vigentes. UNICA fuente. La usan el guardian de movimientos, el de reproceso y v_output_batch_stock. No toma el candado: lo toma quien llama.';

revoke all on function public.output_batch_available_kg(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.output_batch_available_kg(uuid, uuid, uuid, uuid) to authenticated;


-- ============================================================================
-- 2 · EL MÁXIMO FÍSICAMENTE POSIBLE
-- ----------------------------------------------------------------------------
-- Cuánto puede haber, COMO MUCHO, en la estantería de este lote.
--
--     producido − reproceso interno − despachos − mermas − uso interno
--
-- Es decir: el saldo SIN contar los ajustes. La diferencia con el saldo
-- teórico es exactamente la suma de los ajustes anteriores, y esa es la
-- pieza del razonamiento:
--
--   · Sin ajustes previos, techo = teórico, y un conteo mayor es imposible.
--     Si alguien cuenta 62 donde la teoría dice 60, no han aparecido 2 kg:
--     está mal declarada la producción o está mal registrado un despacho. Un
--     ajuste no arregla eso, lo tapa.
--
--   · Con un ajuste negativo previo, techo > teórico, y un conteo mayor SÍ es
--     legítimo: es el recuento que deshace el anterior. Ese es el único caso
--     en que un ajuste puede sumar, y es el correcto.
--
-- La formulación del encargo —producido − reproceso— es el techo del lote
-- recién salido de la orden. Esta es la misma idea llevada al día de hoy: lo
-- despachado ya no está en la estantería y no se puede contar.
-- ============================================================================

create or replace function public.output_batch_physical_max_kg(
  p_organization_id uuid,
  p_output_batch_id uuid
) returns numeric
language sql
stable
security invoker
set search_path to 'public'
as $$
  select coalesce(ob.produced_quantity_kg, 0)
       - coalesce((
           select sum(obc.mass_kg) from public.output_batch_consumption obc
            where obc.organization_id = p_organization_id
              and obc.output_batch_id = p_output_batch_id
         ), 0)
       - coalesce((
           select sum(m.quantity) from public.output_batch_movements m
            where m.organization_id = p_organization_id
              and m.output_batch_id = p_output_batch_id
              and m.is_current
              and m.direction = 'out'
              and m.movement_kind <> 'adjustment'
         ), 0)
    from public.output_batches ob
   where ob.organization_id = p_organization_id
     and ob.id = p_output_batch_id;
$$;

comment on function public.output_batch_physical_max_kg(uuid, uuid) is
  'PT-02B.1 · Cuanto puede haber COMO MUCHO en la estanteria de este lote: producido - reproceso - despachos - mermas - uso interno. Es el saldo SIN los ajustes. Un conteo por encima de esto no es material que aparece: es una fuente de verdad mal registrada.';

revoke all on function public.output_batch_physical_max_kg(uuid, uuid) from public, anon;
grant execute on function public.output_batch_physical_max_kg(uuid, uuid) to authenticated;


-- ============================================================================
-- 3 · EL RECUENTO SE GUARDA, NO SOLO SU DIFERENCIA
-- ----------------------------------------------------------------------------
-- Dos columnas, y las dos son hechos:
--
--     counted_quantity                cuánto se contó
--     theoretical_quantity_at_count   cuánto decía el sistema en ese momento
--
-- `quantity` y `direction` siguen existiendo y siguen siendo lo que mueve el
-- saldo: se DERIVAN de la resta. Guardar solo la derivada y tirar el hecho es
-- el error que esta casa ya corrigió dos veces —`data_state`/`value` en las
-- mediciones, y la fracción reciclada frente a la etiqueta binaria—.
--
-- El teórico se congela: si mañana se corrige un despacho anterior, el saldo
-- de hoy cambia, pero lo que el sistema decía cuando alguien fue a contar no
-- cambia. Es la misma instantánea que 0142 congeló para la aplicabilidad de
-- la evidencia.
--
-- Nulables porque solo un `adjustment` las lleva, y porque las filas que ya
-- existan —ninguna hoy— no se pueden inventar.
-- ============================================================================

alter table public.output_batch_movements
  add column if not exists counted_quantity numeric,
  add column if not exists theoretical_quantity_at_count numeric;

comment on column public.output_batch_movements.counted_quantity is
  'PT-02B.1 · Lo que se conto fisicamente. El HECHO medido. Solo en ajustes por recuento.';
comment on column public.output_batch_movements.theoretical_quantity_at_count is
  'PT-02B.1 · Lo que el sistema decia en el momento del recuento. Congelado: si despues se corrige un movimiento anterior, esto NO cambia.';

do $$
begin
  -- Las dos van juntas o no va ninguna: un conteo sin su teórico no explica de
  -- dónde salió la diferencia, y un teórico sin conteo no es nada.
  if not exists (select 1 from pg_constraint
                  where conname = 'output_batch_movements_count_pair'
                    and conrelid = 'public.output_batch_movements'::regclass) then
    alter table public.output_batch_movements
      add constraint output_batch_movements_count_pair check (
        (counted_quantity is null) = (theoretical_quantity_at_count is null));
  end if;

  -- Contar es cosa de los ajustes. Un despacho con `counted_quantity` sería
  -- un dato sin significado esperando a que alguien lo interprete mal.
  if not exists (select 1 from pg_constraint
                  where conname = 'output_batch_movements_count_only_adjustment'
                    and conrelid = 'public.output_batch_movements'::regclass) then
    alter table public.output_batch_movements
      add constraint output_batch_movements_count_only_adjustment check (
        counted_quantity is null or movement_kind = 'adjustment');
  end if;

  -- No se cuenta una cantidad negativa.
  if not exists (select 1 from pg_constraint
                  where conname = 'output_batch_movements_counted_non_negative'
                    and conrelid = 'public.output_batch_movements'::regclass) then
    alter table public.output_batch_movements
      add constraint output_batch_movements_counted_non_negative check (
        counted_quantity is null or counted_quantity >= 0);
  end if;

  -- LA COHERENCIA QUE HACE FIABLE EL PAR. La cantidad y el sentido tienen que
  -- ser EXACTAMENTE la resta. Sin esto, alguien podría guardar «conté 42
  -- donde había 45» y mover el saldo 10 kg, y las tres columnas se
  -- contradirían sin que nada lo notara.
  if not exists (select 1 from pg_constraint
                  where conname = 'output_batch_movements_count_matches_delta'
                    and conrelid = 'public.output_batch_movements'::regclass) then
    alter table public.output_batch_movements
      add constraint output_batch_movements_count_matches_delta check (
        counted_quantity is null
        or (case when direction = 'in' then quantity else -quantity end)
           = counted_quantity - theoretical_quantity_at_count);
  end if;
end $$;


-- ============================================================================
-- 4 · ANULAR ES CORREGIR A CERO
-- ----------------------------------------------------------------------------
-- Un movimiento que nunca ocurrió no se borra —el historial no se borra— pero
-- tampoco se puede dejar «casi» anulado. Se relaja `quantity > 0` en el único
-- caso en que un cero significa algo: una fila CORRECTIVA, que por el CHECK de
-- 0146 ya está obligada a llevar motivo.
--
-- Sin sistema paralelo de anulaciones: el linaje que ya existe hace el
-- trabajo. La fila original queda `is_current = false` y apuntando a su
-- corrección; la corrección queda vigente con cantidad cero, que es
-- exactamente «esto no ocurrió, y aquí está la constancia de que se dijo».
-- ============================================================================

alter table public.output_batch_movements
  drop constraint if exists output_batch_movements_quantity_positive;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'output_batch_movements_quantity_valid'
                    and conrelid = 'public.output_batch_movements'::regclass) then
    alter table public.output_batch_movements
      add constraint output_batch_movements_quantity_valid check (
        quantity > 0 or (quantity = 0 and corrects_movement_id is not null));
  end if;
end $$;

comment on constraint output_batch_movements_quantity_valid on public.output_batch_movements is
  'PT-02B.1 · Cantidad positiva, salvo una fila CORRECTIVA que anula: cero solo con corrects_movement_id, y ese ya exige correction_reason.';


-- ============================================================================
-- 5 · EL GUARDIÁN DE MOVIMIENTOS, CON TECHO EN LOS DOS SENTIDOS
-- ----------------------------------------------------------------------------
-- Lo que cambia respecto de 0146:
--
--   · el saldo se pide a la función única en vez de recalcularse aquí;
--   · un ajuste que SUMA deja de pasar sin comprobación: se compara el
--     resultado contra el máximo físico;
--   · si el ajuste trae recuento, se comprueba el recuento en sí, que es
--     donde está el dato que la persona tecleó y donde debe caer el mensaje.
--
-- Lo que NO cambia: el candado `for update` sobre el lote, el rechazo de
-- unidades distintas de kg, y la salida temprana para movimientos no
-- vigentes —sin ella la corrección se rechazaba a sí misma—.
-- ============================================================================

create or replace function public.output_batch_movement_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_producido numeric;
  v_disp      numeric;
  v_max       numeric;
begin
  -- El candado sobre el lote padre serializa TODO lo que le pasa al lote:
  -- movimientos y reproceso interno toman el mismo, así que una salida y un
  -- reproceso simultáneos no pueden comprometer el mismo saldo.
  select produced_quantity_kg into v_producido
    from public.output_batches
   where organization_id = new.organization_id
     and id = new.output_batch_id
   for update;

  if v_producido is null then
    raise exception 'El lote producido no existe o no declara cantidad' using errcode = '23503';
  end if;

  if new.unit_code <> 'kg' then
    raise exception 'Los lotes producidos se miden en kilogramos. Registra el movimiento en kg: Trazaloop no convierte unidades.'
      using errcode = '23514';
  end if;

  if not new.is_current then
    return new;
  end if;

  v_disp := public.output_batch_available_kg(
    new.organization_id, new.output_batch_id, new.id, null);

  if new.direction = 'in' then
    -- El CHECK `output_batch_movements_direction_kind` ya lo prohíbe, pero un
    -- disparador BEFORE se ejecuta ANTES que los CHECK, así que sin esta
    -- comprobación un despacho «que entra» moría con el mensaje del techo
    -- físico, que habla de otra cosa. El CHECK sigue detrás como última línea.
    if new.movement_kind <> 'adjustment' then
      raise exception 'Solo un ajuste por recuento puede sumar al saldo: un %s que entra sería ese movimiento al revés.',
        new.movement_kind using errcode = '23514';
    end if;

    -- PT-02B.1 · Aquí se retornaba sin comprobar nada, y por ese hueco cabían
    -- 10 000 kg en un lote de 100. Un recuento no fabrica producto: como
    -- mucho deshace un ajuste anterior.
    v_max := public.output_batch_physical_max_kg(new.organization_id, new.output_batch_id);
    if v_disp + new.quantity > v_max then
      if new.counted_quantity is not null then
        raise exception 'El conteo supera la cantidad físicamente posible para este lote: % kg. Corrige primero la cantidad producida o el movimiento que corresponda.',
          trim_scale(greatest(v_max, 0)) using errcode = '23514';
      end if;
      raise exception 'El ajuste dejaría el saldo por encima de lo físicamente posible para este lote: % kg. Corrige primero la cantidad producida o el movimiento que corresponda.',
        trim_scale(greatest(v_max, 0)) using errcode = '23514';
    end if;
    return new;
  end if;

  if new.quantity > v_disp then
    raise exception 'El movimiento supera lo disponible del lote. Disponible: % kg.',
      trim_scale(greatest(v_disp, 0)) using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.output_batch_movement_guard() is
  'PT-02B.1 · Techo por los DOS lados: una salida no puede pasarse del saldo y un ajuste que suma no puede pasarse del maximo fisico. Mismo candado FOR UPDATE que toma el guardian de reproceso: una sola cola por lote.';


-- ============================================================================
-- 6 · EL REPROCESO INTERNO MIRA EL MISMO SALDO
-- ----------------------------------------------------------------------------
-- ESTE ERA EL AGUJERO GRANDE.
--
-- El guardián de 0105 comparaba contra `producido − otros consumos internos`.
-- No sabía de despachos, ni de mermas, ni de uso interno, ni de ajustes. Con
-- 100 kg producidos se podía despachar 100 y reprocesar otros 100: dos
-- salidas de lo mismo, saldo −100 kg, y ni un error.
--
-- Ahora pregunta a la misma función que todo lo demás. Y toma el candado sobre
-- la fila del lote ANTES de preguntar, igual que el de movimientos: es lo que
-- hace que dos transacciones cruzadas —un despacho y un reproceso— no puedan
-- comprometer el mismo saldo.
--
-- `security invoker` se conserva, como en 0105: la guarda se ejecuta con los
-- permisos de quien escribe y la RLS sigue aplicando.
-- ============================================================================

create or replace function public.output_batch_consumption_total_balance_guard()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_quantity numeric;
  v_disp     numeric;
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

  v_disp := public.output_batch_available_kg(
    new.organization_id, new.output_batch_id, null, new.id);

  if new.mass_kg > v_disp then
    raise exception 'La cantidad a consumir supera el saldo disponible del lote producido. Disponible: % kg.',
      trim_scale(greatest(v_disp, 0))
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.output_batch_consumption_total_balance_guard() is
  'PT-02B.1 · Anti-sobreconsumo interno contra el saldo CONSOLIDADO: despachos, mermas, uso interno y ajustes incluidos. Antes solo miraba producido - otros consumos internos, y por ahi se podia despachar un lote entero y reprocesarlo otra vez. Candado FOR UPDATE, SECURITY INVOKER.';


-- ============================================================================
-- 7 · LA CORRECCIÓN ACEPTA EL CERO
-- ----------------------------------------------------------------------------
-- Se reescribe entera porque `create or replace function` no admite parches.
-- Cambia UNA cosa: rechaza cantidades negativas explícitamente, para que el
-- cero pase y el −5 siga sin pasar. Y arrastra el recuento cuando lo haya:
-- corregir un ajuste por recuento sin llevarse su conteo dejaría un par
-- descoordinado que el CHECK de §3 rechazaría, y con razón.
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
  v_counted numeric;
  v_teorico numeric;
begin
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Una correccion sin motivo no explica nada.' using errcode = '23514';
  end if;
  if p_quantity is null or p_quantity < 0 then
    raise exception 'La cantidad corregida no puede ser negativa. Para anular el movimiento, corrige a cero.'
      using errcode = '23514';
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

  -- El recuento viaja con la corrección para que el trío (conteo, teórico,
  -- diferencia) siga cuadrando. El teórico NO se recalcula: es lo que el
  -- sistema decía cuando alguien fue a contar, y eso ya pasó.
  v_counted := null;
  v_teorico := null;
  if v_old.counted_quantity is not null then
    v_teorico := v_old.theoretical_quantity_at_count;
    v_counted := case when v_old.direction = 'in' then v_teorico + p_quantity
                      else v_teorico - p_quantity end;
  end if;

  update public.output_batch_movements
     set is_current = false
   where id = v_old.id;

  insert into public.output_batch_movements (
    organization_id, output_batch_id, movement_kind, direction, quantity,
    unit_code, occurred_at, reason, reference,
    corrects_movement_id, correction_reason, is_current, notes, created_by,
    counted_quantity, theoretical_quantity_at_count
  ) values (
    v_old.organization_id, v_old.output_batch_id, v_old.movement_kind, v_old.direction,
    p_quantity, v_old.unit_code, coalesce(p_occurred_at, v_old.occurred_at),
    v_old.reason, v_old.reference,
    v_old.id, p_reason, true, v_old.notes, auth.uid(),
    v_counted, v_teorico
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
  'PT-02B.1 · Corrige INSERTANDO, y acepta cero: anular es corregir a cero, no borrar. Arrastra el par conteo/teorico cuando el movimiento corregido era un recuento.';


-- ============================================================================
-- 8 · LA VISTA DEL LOTE, CON SU ANOMALÍA VISIBLE
-- ----------------------------------------------------------------------------
-- Mismas columnas de 0146 —`replace` solo admite añadir al final— más dos que
-- la pantalla necesitaba y calculaba por su cuenta:
--
--   physical_max_kg   el techo, para poder decir cuánto se puede contar
--   is_inconsistent   el saldo salió negativo
--
-- Un saldo negativo ya no debería poder nacer de una operación válida después
-- de §5 y §6. Si aparece, es una anomalía y hay que verla: NO se recorta a
-- cero. Un `greatest(…, 0)` aquí convertiría un problema en un dato bonito.
--
-- La cláusula `with` se REPITE aunque 0146 ya la pusiera: `create or replace
-- view` sin ella no conserva las opciones, las restablece.
-- ============================================================================

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
  coalesce(m.movimientos, 0) as movements_count,
  -- Lo nuevo, al final.
  ob.produced_quantity_kg
    - coalesce(i.kg, 0)
    - coalesce(d.kg, 0)
    - coalesce(l.kg, 0)
    - coalesce(iu.kg, 0)   as physical_max_kg,
  (ob.produced_quantity_kg
    - coalesce(i.kg, 0)
    - coalesce(d.kg, 0)
    - coalesce(l.kg, 0)
    - coalesce(iu.kg, 0)
    + coalesce(a.kg, 0)) < 0 as is_inconsistent
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
  'PT-02B.1 · Lo que queda de verdad de un lote producido, con su techo fisico y su marca de anomalia. Un saldo negativo NO se recorta: si aparece hay que verlo.';


-- ============================================================================
-- 9 · CUÁNTO PRODUCTO TERMINADO HAY EN PLANTA
-- ----------------------------------------------------------------------------
-- Era el requisito original que seguía sin cubrirse: se sabía por lote, no por
-- producto. Es una agregación de la vista de arriba, así que va aquí y no en
-- una migración aparte — pertenece al mismo cambio acotado.
--
-- SE AGRUPA POR UNIDAD aunque hoy solo haya una. PCR mide los lotes producidos
-- en kilogramos y el guardián rechaza cualquier otra, así que `unit_code` es
-- constante; ponerlo igualmente cuesta una columna y evita que el día que
-- entre otra unidad alguien sume 300 kg con 40 m y obtenga 340 de nada. Es la
-- misma decisión que 0145 tomó para el saldo textil.
--
-- Los lotes SIN producto asociado se agregan con `product_id` nulo en vez de
-- descartarse: si se cayeran, la suma de los agregados dejaría de coincidir
-- con la suma de los lotes y el total de la planta mentiría por defecto.
-- ============================================================================

create or replace view public.v_product_stock
with (security_invoker = true) as
select
  s.organization_id,
  s.product_id,
  s.product_code,
  s.product_name,
  'kg'::text                                        as unit_code,
  count(*)                                          as batches_total,
  count(*) filter (where s.available_kg > 0)        as batches_with_balance,
  count(*) filter (where s.is_inconsistent)         as batches_inconsistent,
  sum(s.produced_kg)                                as produced_kg,
  sum(s.reprocessed_kg)                             as reprocessed_kg,
  sum(s.dispatched_kg)                              as dispatched_kg,
  sum(s.lost_kg)                                    as lost_kg,
  sum(s.internal_use_kg)                            as internal_use_kg,
  sum(s.adjustment_kg)                              as adjustment_kg,
  sum(s.dispatched_kg + s.lost_kg + s.internal_use_kg) as exits_kg,
  sum(s.available_kg)                               as available_kg
from public.v_output_batch_stock s
group by s.organization_id, s.product_id, s.product_code, s.product_name;

revoke all on public.v_product_stock from public, anon;
grant select on public.v_product_stock to authenticated;

comment on view public.v_product_stock is
  'PT-02B.1 · Cuanto producto terminado hay en planta, por producto y unidad. Derivada de v_output_batch_stock: sin tabla de existencias que mantener al dia. Los lotes sin producto se agregan con product_id nulo para que la suma cuadre con la de los lotes.';


-- ============================================================================
-- 10 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   drop view if exists public.v_product_stock;
--   -- y restaurar v_output_batch_stock, output_batch_movement_guard,
--   -- output_batch_consumption_total_balance_guard y
--   -- correct_output_batch_movement desde 0146 y 0105 respectivamente.
--   alter table public.output_batch_movements
--     drop constraint if exists output_batch_movements_quantity_valid,
--     drop constraint if exists output_batch_movements_count_matches_delta,
--     drop constraint if exists output_batch_movements_counted_non_negative,
--     drop constraint if exists output_batch_movements_count_only_adjustment,
--     drop constraint if exists output_batch_movements_count_pair,
--     drop column if exists theoretical_quantity_at_count,
--     drop column if exists counted_quantity;
--   alter table public.output_batch_movements
--     add constraint output_batch_movements_quantity_positive check (quantity > 0);
--   drop function if exists public.output_batch_physical_max_kg(uuid, uuid);
--   drop function if exists public.output_batch_available_kg(uuid, uuid, uuid, uuid);
--
-- Reponer `quantity > 0` solo es posible si no se ha anulado ningun
-- movimiento. Despues, esa parte es irreversible sin decidir que hacer con las
-- filas a cero.
-- ============================================================================
