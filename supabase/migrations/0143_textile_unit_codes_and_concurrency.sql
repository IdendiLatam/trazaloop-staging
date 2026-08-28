-- ============================================================================
-- Trazaloop · PCR/TEXTILES PRE-INTEGRATION · PT-03B
-- LA UNIDAD DEJA DE SER UNA CADENA, Y LA GUARDA DEJA DE SER CONDICIONAL
-- ----------------------------------------------------------------------------
-- DOS PROBLEMAS QUE SON EL MISMO
--
-- En Textiles la unidad es `text` libre en cuatro tablas. El formulario lo
-- decía sin rodeos: «Sin conversión automática: mantén consistencia manual».
--
-- Y `guard_textile_lot_overconsumption` compara consumo contra recibido SOLO
-- si las dos cadenas coinciden:
--
--     if v_lot.quantity_received is not null
--        and v_lot.unit is not null
--        and lower(trim(new.unit)) = lower(trim(v_lot.unit)) then
--        ... comprobar ...
--     end if;
--     return new;        -- <- si no coinciden, PASA SIN COMPROBAR
--
-- Es decir: la desigualdad de unidades ABRE la puerta. Escribir «kilogramos»
-- donde el lote dice «kg» desactiva el control de sobreconsumo. No hace falta
-- mala fe: hacen falta dos personas y un teclado.
--
-- Y falta el candado. La gemela de PCR —`batch_consumption_total_balance_guard`,
-- migración 0105— bloquea la fila del lote con `for update` antes de sumar,
-- precisamente para que dos consumos simultáneos se serialicen. La textil lee
-- sin bloquear, así que dos transacciones pueden leer el mismo total previo y
-- pasar las dos.
--
--
-- QUÉ SE HACE, Y EN QUÉ ORDEN
--
-- 1 · `unit_code` NULLABLE junto a `unit`. El texto original SE CONSERVA: es
--     lo que la persona escribió y no es nuestro para borrarlo.
-- 2 · Backfill SOLO de los alias inequívocos. Lo dudoso se queda en NULL y se
--     ve como «sin normalizar», que es la verdad.
-- 3 · La guarda pasa a bloquear, a usar `unit_code` cuando existe, y a
--     RECHAZAR en vez de dejar pasar cuando no se puede comparar.
--
-- No hay fecha de corte, ni «legacy antes de X». La regla es estructural:
-- una fila con `unit_code` se comprueba; una sin él no puede comprometer
-- saldo. PT-H04.
-- ============================================================================


-- ============================================================================
-- 1 · EL CÓDIGO CANÓNICO, AL LADO DEL TEXTO ORIGINAL
-- ----------------------------------------------------------------------------
-- Nullable a propósito y sin `NOT NULL` en el horizonte: las filas anteriores
-- a esta migración que no se puedan normalizar se quedan sin código, y eso es
-- un hecho que hay que poder representar.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'textile_input_lots', 'textile_order_consumptions',
    'textile_output_lots', 'textile_production_orders'
  ] loop
    execute format('alter table public.%I add column if not exists unit_code text', t);
    execute format($f$
      alter table public.%I drop constraint if exists %I;
      alter table public.%I add constraint %I check (
        unit_code is null or unit_code = any (array[
          'kg','g','ton','m','cm','m2','unit','roll','other'
        ])
      )
    $f$, t, t || '_unit_code_check', t, t || '_unit_code_check');
  end loop;
end $$;

comment on column public.textile_input_lots.unit_code is
  'PT-03B · Unidad CANONICA. NULL = no se pudo normalizar sin adivinar; la columna `unit` conserva el texto original. Trazaloop no convierte unidades: dos codigos distintos son NO COMPARABLES.';
comment on column public.textile_order_consumptions.unit_code is
  'PT-03B · Unidad CANONICA del consumo. Si no coincide con la del lote, la guarda RECHAZA: antes la desigualdad abria la puerta.';


-- ============================================================================
-- 2 · BACKFILL DE LO INEQUÍVOCO, Y SOLO DE ESO
-- ----------------------------------------------------------------------------
-- Espejo exacto del mapa `ALIAS` de lib/domain/measurement-units.ts. Lo que no
-- esté aquí se queda en NULL: «pares» no entra porque un par podrían ser dos
-- unidades o una, y elegir sería inventarse el dato de otra persona.
--
-- Idempotente: solo toca filas con `unit_code` todavía nulo.
-- ============================================================================

create or replace function public.textile_canonical_unit(p_raw text)
returns text
language sql
immutable
as $$
  select case lower(regexp_replace(btrim(coalesce(p_raw, '')), '\s+', ' ', 'g'))
    when 'kg' then 'kg' when 'kgs' then 'kg' when 'kilo' then 'kg' when 'kilos' then 'kg'
    when 'kilogramo' then 'kg' when 'kilogramos' then 'kg'
    when 'kilogram' then 'kg' when 'kilograms' then 'kg'
    when 'g' then 'g' when 'gr' then 'g' when 'gramo' then 'g' when 'gramos' then 'g'
    when 'gram' then 'g' when 'grams' then 'g'
    when 't' then 'ton' when 'ton' then 'ton' when 'tons' then 'ton'
    when 'tonelada' then 'ton' when 'toneladas' then 'ton'
    when 'm' then 'm' when 'mt' then 'm' when 'mts' then 'm'
    when 'metro' then 'm' when 'metros' then 'm' when 'meter' then 'm' when 'meters' then 'm'
    when 'cm' then 'cm' when 'centimetro' then 'cm' when 'centimetros' then 'cm'
    when 'centímetro' then 'cm' when 'centímetros' then 'cm'
    when 'm2' then 'm2' when 'm²' then 'm2'
    when 'metro cuadrado' then 'm2' when 'metros cuadrados' then 'm2'
    when 'u' then 'unit' when 'un' then 'unit' when 'und' then 'unit' when 'uds' then 'unit'
    when 'unit' then 'unit' when 'units' then 'unit'
    when 'unidad' then 'unit' when 'unidades' then 'unit'
    when 'pieza' then 'unit' when 'piezas' then 'unit' when 'pcs' then 'unit'
    when 'rollo' then 'roll' when 'rollos' then 'roll'
    when 'roll' then 'roll' when 'rolls' then 'roll'
    else null
  end;
$$;

comment on function public.textile_canonical_unit(text) is
  'PT-03B · Espejo SQL del mapa de alias de lib/domain/measurement-units.ts. Devuelve NULL cuando no se puede normalizar sin adivinar, que es una respuesta y no un fallo.';

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'textile_input_lots', 'textile_order_consumptions',
    'textile_output_lots', 'textile_production_orders'
  ] loop
    execute format(
      'update public.%I set unit_code = public.textile_canonical_unit(unit)
        where unit_code is null and public.textile_canonical_unit(unit) is not null', t);
    get diagnostics n = row_count;
    raise notice 'PT-03B · %: % fila(s) normalizada(s)', t, n;
  end loop;
end $$;


-- ============================================================================
-- 3 · LA GUARDA DEJA DE SER CONDICIONAL
-- ----------------------------------------------------------------------------
-- Tres cambios, y el tercero es el que cambia el comportamiento visible:
--
--   a · `for update` sobre el lote. Es la línea que faltaba y la que crea la
--       paridad con PCR: serializa los consumos del mismo lote.
--
--   b · `errcode = '23514'`, para que la acción de servidor distinga esta
--       negativa de un fallo genérico, igual que ya hace en PCR.
--
--   c · La unidad se compara por CÓDIGO, y si no se puede comparar se
--       RECHAZA. Antes la desigualdad hacía saltar la comprobación entera.
--
-- El punto (c) bloquea consumos que hoy se aceptan. Es correcto —un consumo
-- que nadie puede comparar no debería comprometer un saldo— y no es
-- transparente: el mensaje dice exactamente qué hay que arreglar.
--
-- Compatibilidad: mientras las dos filas sigan sin `unit_code` pero con el
-- MISMO texto, se comparan por texto igual que antes. Solo se rechaza cuando
-- de verdad no hay forma de comparar.
-- ============================================================================

create or replace function public.guard_textile_lot_overconsumption()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lot      record;
  v_consumed numeric;
  v_lot_u    text;
  v_new_u    text;
begin
  -- (a) El candado. Serializa todos los consumos de este lote: dos
  -- transacciones simultáneas dejan de poder leer el mismo total previo.
  select quantity_received, unit, unit_code, organization_id
    into v_lot
    from public.textile_input_lots
   where id = new.input_lot_id
   for update;

  if v_lot is null then
    raise exception 'El lote de entrada del consumo no existe'
      using errcode = '23503';
  end if;
  if v_lot.organization_id <> new.organization_id then
    raise exception 'Consumo de lote entre empresas bloqueado'
      using errcode = '42501';
  end if;

  -- Un lote que no declaró cantidad no tiene saldo que proteger. Es el único
  -- caso en que la guarda sigue sin aplicar, y no es una laguna: es que no
  -- hay nada contra lo que comparar.
  if v_lot.quantity_received is null then
    return new;
  end if;

  -- (c) La unidad. Primero por codigo canonico; si alguna de las dos no lo
  -- tiene, se acepta la igualdad de TEXTO como equivalencia —es exactamente
  -- lo que hacia antes— y si tampoco coinciden, se RECHAZA.
  v_lot_u := coalesce(v_lot.unit_code, lower(btrim(coalesce(v_lot.unit, ''))));
  v_new_u := coalesce(new.unit_code, lower(btrim(coalesce(new.unit, ''))));

  if v_lot_u = '' or v_new_u = '' then
    raise exception 'El consumo no declara unidad comparable con la del lote. Normaliza la unidad del lote y la del consumo antes de registrar el consumo.'
      using errcode = '23514';
  end if;

  if v_lot_u <> v_new_u then
    raise exception 'No se pueden combinar cantidades en «%» y «%»: Trazaloop no convierte unidades. Registra el consumo en la unidad del lote.',
      coalesce(v_lot.unit_code, v_lot.unit), coalesce(new.unit_code, new.unit)
      using errcode = '23514';
  end if;

  -- `other` es un codigo canonico que significa «ninguno de estos»: dos
  -- cantidades en `other` pueden ser rollos y docenas. Compararlas por
  -- compartir la etiqueta de lo desconocido seria el mismo fallo con otra cara.
  if v_lot_u = 'other' then
    raise exception 'La unidad «Otra» no participa en saldos. Elige una unidad concreta en el lote y en el consumo.'
      using errcode = '23514';
  end if;

  select coalesce(sum(quantity_consumed), 0)
    into v_consumed
    from public.textile_order_consumptions c
   where c.input_lot_id = new.input_lot_id
     and coalesce(c.unit_code, lower(btrim(coalesce(c.unit, '')))) = v_lot_u
     and (tg_op = 'INSERT' or c.id <> new.id);

  if v_consumed + new.quantity_consumed > v_lot.quantity_received then
    raise exception 'Sobreconsumo bloqueado: el lote no tiene saldo suficiente (recibido %, ya consumido %).',
      v_lot.quantity_received, v_consumed
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.guard_textile_lot_overconsumption() is
  'PT-03B · Paridad transaccional con batch_consumption_total_balance_guard (0105): bloquea la fila del lote con FOR UPDATE, usa errcode 23514 y RECHAZA cuando las unidades no son comparables. Antes la desigualdad de unidades saltaba la comprobacion entera.';


-- ============================================================================
-- 4 · EL SALDO CUENTA POR CÓDIGO, Y DICE QUÉ DEJA FUERA
-- ----------------------------------------------------------------------------
-- La vista comparaba por texto. Con el codigo canonico agrupa bien, y sigue
-- exponiendo cuantos consumos quedan fuera por no ser comparables: un saldo
-- que se calla lo que no pudo restar es un saldo que miente.
-- ============================================================================

-- `drop` y `create` en vez de `create or replace`: la vista gana una columna
-- (`unit_code`) en medio, y `replace` no permite cambiar la forma. Nada más
-- depende de ella —comprobado en pg_depend—, así que no arrastra a nadie.
drop view if exists public.v_textile_input_lot_balance;

create view public.v_textile_input_lot_balance as
with u as (
  select il.*,
         coalesce(il.unit_code, lower(btrim(coalesce(il.unit, '')))) as ukey
    from public.textile_input_lots il
)
select
  u.organization_id,
  u.id            as input_lot_id,
  u.lot_code,
  u.lot_type,
  u.quantity_received,
  coalesce(mismo.qty, 0::numeric) as quantity_consumed,
  case when u.quantity_received is null then null::numeric
       else u.quantity_received - coalesce(mismo.qty, 0::numeric) end as quantity_remaining,
  u.unit,
  u.unit_code,
  u.status,
  coalesce(otro.rows, 0::bigint) as other_unit_consumptions_count
from u
left join lateral (
  select sum(c.quantity_consumed) as qty
    from public.textile_order_consumptions c
   where c.input_lot_id = u.id
     and u.ukey <> ''
     and coalesce(c.unit_code, lower(btrim(coalesce(c.unit, '')))) = u.ukey
) mismo on true
left join lateral (
  select count(*) as rows
    from public.textile_order_consumptions c
   where c.input_lot_id = u.id
     and (u.ukey = '' or coalesce(c.unit_code, lower(btrim(coalesce(c.unit, '')))) <> u.ukey)
) otro on true;

revoke all on public.v_textile_input_lot_balance from public, anon;
grant select on public.v_textile_input_lot_balance to authenticated;

comment on view public.v_textile_input_lot_balance is
  'PT-03B · Saldo por lote comparando por unidad CANONICA cuando existe y por texto cuando no. other_unit_consumptions_count expone lo que NO se pudo restar: un saldo que se calla lo que dejo fuera es un saldo que miente.';


-- ============================================================================
-- 5 · REVERSIÓN
-- ----------------------------------------------------------------------------
--   · Restaurar `guard_textile_lot_overconsumption` de 0072 (sin candado,
--     con la comparación condicional por texto).
--   · Restaurar `v_textile_input_lot_balance` de su versión anterior.
--   · alter table … drop column if exists unit_code   (en las cuatro tablas)
--   · drop function if exists public.textile_canonical_unit(text);
--
-- El backfill NO se revierte porque no destruye nada: `unit` conserva el texto
-- original en todas las filas, y `unit_code` solo se añadió donde el alias era
-- inequívoco. Quitar la columna devuelve el estado exacto anterior.
-- ============================================================================
