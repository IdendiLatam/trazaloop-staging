-- ===========================================================================
-- Trazaloop · 0180 · Una campaña publicada no se reescribe
-- ===========================================================================
--
-- LO QUE SE COMPROBÓ ANTES DE ABRIR LA CONSOLA
--
-- 0179 dejó los estados —borrador, activa, retirada— pero no puso a nadie a
-- vigilarlos. Un ensayo contra la base lo enseñó en tres líneas:
--
--     campaña ACTIVA al 40 %
--     → se le cambia el porcentaje a 5 %          ... y pasa
--     → se le añade Extra a los planes elegibles  ... y pasa
--     → se la devuelve a «borrador»               ... y pasa
--
-- El segundo es el grave: es exactamente lo que PAY-49 existe para impedir —que
-- el cupón de aliados de Full acabe descontando Extra— y bastaba un `update`.
--
-- Los canjes guardan su instantánea, así que lo YA cobrado no se movía. Pero
-- una regla financiera viva que se puede reescribir sin dejar rastro es otra
-- cosa: mañana descuenta distinto que ayer y nada lo cuenta.
--
-- LA REGLA
--
-- En borrador se corrige lo que haga falta: todavía no ha cobrado a nadie.
-- Publicada, las condiciones financieras quedan quietas y solo se puede
-- CERRAR: retirarla, o adelantar su fin. Cambiar condiciones es publicar una
-- sucesora, igual que con las revisiones de plan de PE-04.
--
-- Y la vigencia solo se acorta, nunca se alarga: reabrir una campaña cerrada
-- cambiaría lo que estuvo disponible, que es la misma razón por la que un tipo
-- de cambio se cierra por validez y no se borra.
--
-- EL TECHO DEL PROGRAMA INSTITUCIONAL
--
-- El 40 % es el límite del programa de gremios sobre Full, no del sistema. Con
-- solo un `max_discount_basis_points` por campaña, nada impedía crear un
-- «institucional Full al 100 %» y llamarlo institucional. Ahora el programa se
-- declara, y declararlo institucional obliga a sus dos condiciones: Full, y
-- como mucho 4000 puntos básicos.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PREFLIGHT DE SEGURIDAD · heredado de SEC-01 (0165)
-- ---------------------------------------------------------------------------
do $$
declare v_expuestas text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by c.relname)
    into v_expuestas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_expuestas is not null then
    raise exception 'SEC01_RLS_PREFLIGHT: hay tablas de public sin RLS: %', v_expuestas
      using hint = 'Actívales RLS con una política explícita antes de promover.';
  end if;
end $$;

do $$
begin
  if to_regclass('public.billing_promotions') is null then
    raise exception '0180 presupone 0179';
  end if;
  raise notice '0180 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · QUÉ PROGRAMA ES · porque el techo depende de eso
-- ---------------------------------------------------------------------------
alter table public.billing_promotions
  add column if not exists program text not null default 'general';

alter table public.billing_promotions
  drop constraint if exists bp_program_check;
alter table public.billing_promotions
  add constraint bp_program_check check (program in ('general', 'institutional_full'));

-- El programa institucional tiene DOS condiciones, y las dos van en la base:
-- es de Full, y no pasa del 40 %. Con el techo suelto se podía crear un
-- «institucional» al 100 % y nadie lo habría discutido.
alter table public.billing_promotions
  drop constraint if exists bp_institutional_shape;
alter table public.billing_promotions
  add constraint bp_institutional_shape check (
    program <> 'institutional_full'
    or (discount_type = 'percentage'
        and eligible_plan_codes = array['full']
        and discount_value <= 4000
        and coalesce(max_discount_basis_points, 4000) <= 4000));

comment on column public.billing_promotions.program is
  'PE-05B6C · A que programa comercial pertenece. `institutional_full` es el de gremios y camaras: solo Full y como mucho 40 %, comprobado en la base. `general` es todo lo demas, con su propio techo. El 40 % NO es un maximo del sistema.';

-- ---------------------------------------------------------------------------
-- 2 · PUBLICADA NO SE REESCRIBE
-- ---------------------------------------------------------------------------
create or replace function public.billing_promotion_is_append_only()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- En borrador se corrige lo que haga falta: no ha cobrado a nadie.
  if old.status = 'draft' then
    if new.status not in ('draft', 'active', 'retired') then
      raise exception 'PROMOTION_STATUS_INVALID' using detail = new.status;
    end if;
    return new;
  end if;

  -- Publicada o retirada: las condiciones financieras quedan quietas.
  if new.discount_type is distinct from old.discount_type
     or new.discount_value is distinct from old.discount_value
     or new.max_discount_basis_points is distinct from old.max_discount_basis_points
     or new.eligible_plan_codes is distinct from old.eligible_plan_codes
     or new.eligible_intervals is distinct from old.eligible_intervals
     or new.program is distinct from old.program
     or new.starts_at is distinct from old.starts_at
     or new.max_redemptions is distinct from old.max_redemptions
     or new.max_per_organization is distinct from old.max_per_organization then
    raise exception 'PROMOTION_PUBLISHED_IS_IMMUTABLE'
      using hint = 'Una campaña publicada no se edita: se retira y se publica una sucesora.';
  end if;

  -- La vigencia solo se ACORTA. Alargarla cambiaría lo que estuvo disponible.
  if new.ends_at is distinct from old.ends_at
     and (old.ends_at is not null and (new.ends_at is null or new.ends_at > old.ends_at)) then
    raise exception 'PROMOTION_WINDOW_ONLY_SHRINKS'
      using hint = 'Una campaña cerrada no se reabre: se publica otra.';
  end if;

  -- Y no se vuelve atrás: ni a borrador, ni de retirada a activa.
  if old.status = 'active' and new.status not in ('active', 'retired') then
    raise exception 'PROMOTION_STATUS_FORWARD_ONLY' using detail = new.status;
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'PROMOTION_STATUS_FORWARD_ONLY' using detail = new.status;
  end if;

  return new;
end;
$$;

drop trigger if exists t_billing_promotion_append_only on public.billing_promotions;
create trigger t_billing_promotion_append_only
  before update on public.billing_promotions
  for each row execute function public.billing_promotion_is_append_only();

comment on function public.billing_promotion_is_append_only() is
  'PE-05B6C · En borrador se corrige; publicada, las condiciones financieras quedan quietas y solo se puede CERRAR. Sin esto bastaba un update para que el cupon de Full descontara Extra, que es justo lo que PAY-49 existe para impedir.';

-- ---------------------------------------------------------------------------
-- 3 · UN CÓDIGO YA CANJEADO TAMPOCO CAMBIA DE NOMBRE
-- ---------------------------------------------------------------------------
create or replace function public.billing_promotion_code_is_append_only()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.promotion_id is distinct from old.promotion_id then
    raise exception 'PROMOTION_CODE_CANNOT_MOVE_CAMPAIGN';
  end if;
  if new.code is distinct from old.code
     and exists (select 1 from public.billing_promotion_redemptions
                  where code_id = old.id) then
    raise exception 'PROMOTION_CODE_ALREADY_REDEEMED'
      using hint = 'Ese código ya se canjeó: renombrarlo dejaría la historia contando otra cosa.';
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'PROMOTION_CODE_STATUS_FORWARD_ONLY';
  end if;
  return new;
end;
$$;

drop trigger if exists t_billing_promotion_code_append_only on public.billing_promotion_codes;
create trigger t_billing_promotion_code_append_only
  before update on public.billing_promotion_codes
  for each row execute function public.billing_promotion_code_is_append_only();

-- ---------------------------------------------------------------------------
-- 4 · LA CONSOLA · sin SQL a mano para el ciclo normal
-- ---------------------------------------------------------------------------
-- Todo por primitivas, y todas de superadministración: crear campañas toca el
-- precio de lo que se vende, y eso no es una lectura.
create or replace function public.billing_create_promotion(
  p_name text,
  p_description text,
  p_program text,
  p_discount_basis_points integer,
  p_eligible_plan_codes text[],
  p_eligible_intervals text[],
  p_max_discount_basis_points integer default null,
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null,
  p_max_redemptions integer default null,
  p_max_per_organization integer default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Crear campañas comerciales es de la administración de plataforma.';
  end if;

  insert into public.billing_promotions (
    name, description, program, discount_type, discount_value,
    max_discount_basis_points, eligible_plan_codes, eligible_intervals,
    starts_at, ends_at, max_redemptions, max_per_organization,
    status, created_by)
  values (
    trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
    p_program, 'percentage', p_discount_basis_points,
    -- El institucional trae su techo puesto aunque nadie lo escriba.
    coalesce(p_max_discount_basis_points,
             case when p_program = 'institutional_full' then 4000 end),
    p_eligible_plan_codes, p_eligible_intervals,
    p_starts_at, p_ends_at, p_max_redemptions, coalesce(p_max_per_organization, 1),
    'draft', auth.uid())
  returning id into v_id;

  return jsonb_build_object('status', 'created', 'promotion_id', v_id);
end;
$$;

revoke all on function public.billing_create_promotion(
  text, text, text, integer, text[], text[], integer, timestamptz, timestamptz, integer, integer)
  from public, anon;
grant execute on function public.billing_create_promotion(
  text, text, text, integer, text[], text[], integer, timestamptz, timestamptz, integer, integer)
  to authenticated;

comment on function public.billing_create_promotion(
  text, text, text, integer, text[], text[], integer, timestamptz, timestamptz, integer, integer) is
  'PE-05B6C · Crea una campaña en BORRADOR. Solo superadministracion. El programa institucional trae su techo del 40 % puesto aunque nadie lo escriba.';

create or replace function public.billing_publish_promotion(p_promotion_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_pro public.billing_promotions%rowtype;
begin
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select * into v_pro from public.billing_promotions where id = p_promotion_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_pro.status <> 'draft' then
    return jsonb_build_object('status', 'not_draft', 'reason', v_pro.status);
  end if;
  -- No se publica una campaña que nadie puede canjear.
  if not exists (select 1 from public.billing_promotion_codes
                  where promotion_id = v_pro.id and status = 'active') then
    return jsonb_build_object('status', 'no_active_code');
  end if;

  update public.billing_promotions
     set status = 'active', updated_at = now() where id = v_pro.id;
  return jsonb_build_object('status', 'published', 'promotion_id', v_pro.id);
end;
$$;

revoke all on function public.billing_publish_promotion(uuid) from public, anon;
grant execute on function public.billing_publish_promotion(uuid) to authenticated;

comment on function public.billing_publish_promotion(uuid) is
  'PE-05B6C · Publica una campaña. Desde aqui sus condiciones financieras quedan quietas: cambiarlas es retirarla y publicar una sucesora. No se publica una sin codigo activo, porque nadie podria canjearla.';

create or replace function public.billing_retire_promotion(p_promotion_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_pro public.billing_promotions%rowtype;
begin
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select * into v_pro from public.billing_promotions where id = p_promotion_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_pro.status = 'retired' then
    return jsonb_build_object('status', 'already_retired');
  end if;

  -- Retirar cierra la puerta a canjes NUEVOS. Lo ya canjeado no se toca: ni el
  -- presupuesto, ni el descuento aplicado, ni el importe que ya renueva.
  update public.billing_promotions
     set status = 'retired', updated_at = now() where id = v_pro.id;
  update public.billing_promotion_codes
     set status = 'retired' where promotion_id = v_pro.id and status = 'active';

  return jsonb_build_object('status', 'retired', 'promotion_id', v_pro.id);
end;
$$;

revoke all on function public.billing_retire_promotion(uuid) from public, anon;
grant execute on function public.billing_retire_promotion(uuid) to authenticated;

comment on function public.billing_retire_promotion(uuid) is
  'PE-05B6C · Cierra la puerta a canjes NUEVOS. Lo ya canjeado no se toca: ni el presupuesto, ni el descuento aplicado, ni el importe congelado que sigue renovando.';

create or replace function public.billing_create_promotion_code(
  p_promotion_id uuid,
  p_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_pro public.billing_promotions%rowtype;
  v_id  uuid;
  v_cod text := upper(trim(coalesce(p_code, '')));
begin
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  select * into v_pro from public.billing_promotions where id = p_promotion_id;
  if not found then
    return jsonb_build_object('status', 'promotion_not_found');
  end if;
  if v_pro.status = 'retired' then
    return jsonb_build_object('status', 'promotion_retired');
  end if;
  if length(v_cod) < 3 or length(v_cod) > 40 then
    return jsonb_build_object('status', 'code_shape_invalid');
  end if;
  if exists (select 1 from public.billing_promotion_codes where code = v_cod) then
    return jsonb_build_object('status', 'code_taken');
  end if;

  insert into public.billing_promotion_codes (promotion_id, code)
  values (p_promotion_id, v_cod)
  returning id into v_id;
  return jsonb_build_object('status', 'created', 'code_id', v_id, 'code', v_cod);
end;
$$;

revoke all on function public.billing_create_promotion_code(uuid, text) from public, anon;
grant execute on function public.billing_create_promotion_code(uuid, text) to authenticated;

create or replace function public.billing_retire_promotion_code(p_code_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
begin
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED';
  end if;
  update public.billing_promotion_codes
     set status = 'retired' where id = p_code_id and status = 'active';
  if not found then
    return jsonb_build_object('status', 'not_active');
  end if;
  return jsonb_build_object('status', 'retired', 'code_id', p_code_id);
end;
$$;

revoke all on function public.billing_retire_promotion_code(uuid) from public, anon;
grant execute on function public.billing_retire_promotion_code(uuid) to authenticated;

comment on function public.billing_retire_promotion_code(uuid) is
  'PE-05B6C · Retira un codigo. Bloquea canjes nuevos; los que hubo siguen intactos.';
