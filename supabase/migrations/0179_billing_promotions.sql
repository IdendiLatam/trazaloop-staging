-- ===========================================================================
-- Trazaloop · 0179 · Cupones: el precio cambia, el producto no
-- ===========================================================================
--
-- POR QUÉ ESTO CABE SIN TOCAR NADA
--
-- 0169 dejó `discount_amount` en presupuestos y cobros, y la restricción
-- `total = base + impuesto`. Eso ya decía que la base es POSTERIOR al
-- descuento: el orden aritmético estaba escrito en un `check` desde el
-- principio. Aquí solo se rellena lo que estaba reservado.
--
-- Y LA DURACIÓN SALE SOLA
--
-- La decisión congelada es que el descuento dura lo que dure la suscripción.
-- No hace falta contar periodos ni revalidar campañas cada mes: la suscripción
-- congela su base en pesos AL CONTRATAR, y si esa base ya venía descontada,
-- todas las renovaciones cobran el importe con descuento sin preguntarle nada a
-- nadie. Que la campaña caduque mañana no cambia lo que paga quien ya contrató,
-- porque la renovación no mira la campaña: mira el importe congelado.
--
-- CUATRO PIEZAS QUE NO SE CONFUNDEN
--
--     campaña   por qué existe el descuento y hasta cuándo
--     código    la cadena que alguien teclea
--     canje     quién lo usó, en qué presupuesto y en qué pago
--     y la instantánea del descuento, que vive en el presupuesto
--
-- La cadena NO es autoridad financiera. Un presupuesto de ayer se reconstruye
-- aunque hoy el código esté retirado, la campaña caducada y el porcentaje
-- cambiado. Es la misma idea que las revisiones inmutables de PE-04: el
-- catálogo cambia; lo cobrado, no.
--
-- EL 40 % NO ES UN TECHO DEL SISTEMA
--
-- Es el techo del programa institucional de Full. Extra tiene su propia
-- política. Clavar un 40 % global confundiría el límite de un tipo de cupón con
-- el de todos, así que el techo vive POR CAMPAÑA: se fija al crearla y ninguna
-- edición posterior puede superarlo.
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
  if to_regprocedure('public.billing_schedule_plan_change(uuid, text)') is null then
    raise exception '0179 presupone 0178';
  end if;
  raise notice '0179 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · LA CAMPAÑA · por qué existe el descuento, y hasta dónde llega
-- ---------------------------------------------------------------------------
create table if not exists public.billing_promotions (
  id uuid primary key default gen_random_uuid(),
  -- Para quién es y por qué. No es decoración: es lo que permite entender
  -- dentro de un año por qué a una empresa se le cobró menos.
  name text not null,
  description text,

  discount_type text not null,
  -- Porcentaje en puntos básicos (4000 = 40 %), o importe fijo en unidades
  -- menores de la MONEDA DE CATÁLOGO. El descuento actúa sobre el catálogo, en
  -- su moneda: así «el 40 % de USD 40» sigue siendo lo que se negoció.
  discount_value bigint not null,
  -- EL TECHO DE ESTA CAMPAÑA. Se fija al crearla y no se puede superar
  -- editando. El programa institucional de Full nace con 4000 y no pasa de ahí
  -- ni por error; una promoción de Extra tiene el suyo, sin heredar una regla
  -- que no era suya.
  max_discount_basis_points integer,

  -- EXPLÍCITOS, nunca «todos». Sin esto, el cupón de aliados de Full
  -- descontaría también Extra el día que alguien lo probara ahí, y nadie se
  -- enteraría hasta ver la facturación.
  eligible_plan_codes text[] not null,
  eligible_intervals text[] not null,

  starts_at timestamptz not null,
  ends_at timestamptz,

  max_redemptions integer,
  max_per_organization integer not null default 1,

  status text not null default 'draft',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bp_type_check check (discount_type in ('percentage', 'fixed_amount')),
  constraint bp_status_check check (status in ('draft', 'active', 'retired')),
  constraint bp_value_check check (discount_value > 0),
  -- Un porcentaje va en puntos básicos y no puede regalar más del 100 %.
  constraint bp_percentage_range check (
    discount_type <> 'percentage' or (discount_value between 1 and 10000)),
  -- Y nunca por encima del techo de su propia campaña.
  constraint bp_ceiling_check check (
    max_discount_basis_points is null
    or discount_type <> 'percentage'
    or discount_value <= max_discount_basis_points),
  constraint bp_window_check check (ends_at is null or ends_at > starts_at),
  -- `cardinality` y no `array_length`: la segunda devuelve NULL para un arreglo
  -- vacío, y un `check` que da NULL PASA. Una campaña sin planes elegibles
  -- habría entrado por esa puerta, que es justo lo que PAY-49 evita.
  constraint bp_plans_check check (
    cardinality(eligible_plan_codes) >= 1
    and eligible_plan_codes <@ array['full', 'extra']),
  constraint bp_intervals_check check (
    cardinality(eligible_intervals) >= 1
    and eligible_intervals <@ array['monthly', 'annual']),
  constraint bp_redemptions_check check (
    (max_redemptions is null or max_redemptions > 0) and max_per_organization > 0),
  constraint bp_name_check check (length(trim(name)) >= 3)
);

create index if not exists bp_status_idx on public.billing_promotions (status, starts_at);

alter table public.billing_promotions enable row level security;

-- Las campañas son de la PLATAFORMA. Una empresa no administra promociones
-- globales, y tampoco necesita leer las que no ha canjeado.
drop policy if exists billing_promotions_read on public.billing_promotions;
create policy billing_promotions_read on public.billing_promotions
  for select to authenticated using (public.is_platform_staff());

revoke all on public.billing_promotions from anon;
revoke insert, update, delete, truncate on public.billing_promotions from authenticated, anon;
grant select on public.billing_promotions to authenticated;

comment on table public.billing_promotions is
  'PE-05B6B · La campana: por que existe un descuento, para que planes e intervalos, hasta cuando y con que techo. El techo vive AQUI y no en el sistema: el 40 % es el limite del programa institucional de Full, no un maximo global.';
comment on column public.billing_promotions.discount_value is
  'PE-05B6B · Puntos basicos si es porcentaje (4000 = 40 %), o unidades menores de la MONEDA DE CATALOGO si es importe fijo. El descuento actua sobre el catalogo, en su moneda.';
comment on column public.billing_promotions.eligible_plan_codes is
  'PE-05B6B · EXPLICITO, nunca «todos». Extra NO hereda los cupones de Full: sin esta lista, el cupon de aliados descontaria Extra el dia que alguien lo probara ahi.';

-- ---------------------------------------------------------------------------
-- 2 · EL CÓDIGO · la cadena que alguien teclea
-- ---------------------------------------------------------------------------
-- Separado de la campaña a propósito: una campaña puede repartir varios
-- códigos —uno por gremio, uno por evento— sin duplicar sus reglas.
create table if not exists public.billing_promotion_codes (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.billing_promotions (id) on delete restrict,
  code text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint bpc_status_check check (status in ('active', 'retired')),
  constraint bpc_code_shape check (code = upper(trim(code)) and length(code) between 3 and 40)
);

-- Mayúsculas y sin espacios, para que «andi40» y «ANDI40 » sean el mismo.
create unique index if not exists bpc_code_uniq on public.billing_promotion_codes (code);
create index if not exists bpc_promotion_idx on public.billing_promotion_codes (promotion_id);

alter table public.billing_promotion_codes enable row level security;

drop policy if exists billing_promotion_codes_read on public.billing_promotion_codes;
create policy billing_promotion_codes_read on public.billing_promotion_codes
  for select to authenticated using (public.is_platform_staff());

revoke all on public.billing_promotion_codes from anon;
revoke insert, update, delete, truncate on public.billing_promotion_codes from authenticated, anon;
grant select on public.billing_promotion_codes to authenticated;

comment on table public.billing_promotion_codes is
  'PE-05B6B · El codigo, normalizado en mayusculas. Separado de la campana para que una campana pueda repartir varios sin duplicar sus reglas. NO es autoridad financiera: lo cobrado se reconstruye aunque el codigo se retire.';

-- ---------------------------------------------------------------------------
-- 3 · EL CANJE · qué descontó de verdad, y a quién
-- ---------------------------------------------------------------------------
create table if not exists public.billing_promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.billing_promotions (id) on delete restrict,
  code_id uuid not null references public.billing_promotion_codes (id) on delete restrict,
  organization_id uuid not null references public.organizations (id) on delete restrict,

  -- La instantánea. Cambiar mañana el porcentaje de la campaña NO reescribe
  -- esto: es lo que se descontó, no lo que se descontaría hoy.
  plan_code text not null,
  billing_interval text not null,
  catalog_amount_minor bigint not null,
  catalog_currency text not null,
  discount_type text not null,
  discount_basis_points integer,
  discount_catalog_minor bigint not null,
  discounted_catalog_minor bigint not null,

  quote_id uuid references public.billing_quotes (id),
  subscription_id uuid references public.billing_subscriptions (id),
  redeemed_at timestamptz not null default now(),

  constraint bpr_amounts_check check (
    catalog_amount_minor > 0 and discount_catalog_minor >= 0
    and discounted_catalog_minor >= 0
    and discounted_catalog_minor = catalog_amount_minor - discount_catalog_minor)
);

create index if not exists bpr_org_idx
  on public.billing_promotion_redemptions (organization_id, redeemed_at desc);
create index if not exists bpr_promotion_idx
  on public.billing_promotion_redemptions (promotion_id);
create index if not exists bpr_subscription_idx
  on public.billing_promotion_redemptions (subscription_id) where subscription_id is not null;

alter table public.billing_promotion_redemptions enable row level security;

-- La empresa ve SUS canjes: es su descuento y su dinero.
drop policy if exists billing_promotion_redemptions_read on public.billing_promotion_redemptions;
create policy billing_promotion_redemptions_read on public.billing_promotion_redemptions
  for select to authenticated
  using (public.is_org_admin(organization_id) or public.is_platform_staff());

revoke all on public.billing_promotion_redemptions from anon;
revoke insert, update, delete, truncate on public.billing_promotion_redemptions
  from authenticated, anon;
grant select on public.billing_promotion_redemptions to authenticated;

comment on table public.billing_promotion_redemptions is
  'PE-05B6B · Que cupon uso quien, en que presupuesto y con que resultado. Guarda CUANTO descontó de verdad: cambiar manana el porcentaje de la campana no reescribe lo que se cobro ayer.';

alter table public.billing_quotes
  add column if not exists redemption_id uuid
    references public.billing_promotion_redemptions (id);
create index if not exists billing_quotes_redemption_idx
  on public.billing_quotes (redemption_id) where redemption_id is not null;

comment on column public.billing_quotes.redemption_id is
  'PE-05B6B · UN canje por presupuesto, nunca una lista: apilar dos descuentos exigiria decidir un orden, y ese orden es una politica comercial que nadie ha escrito.';

-- ---------------------------------------------------------------------------
-- 4 · VALIDAR UN CÓDIGO · todo en el servidor, sin excepción
-- ---------------------------------------------------------------------------
-- El navegador manda UN CÓDIGO. Nunca un porcentaje y nunca un importe. Aquí se
-- comprueba lo que hay que comprobar y se DEVUELVE el descuento calculado; si
-- algo no cuadra, se devuelve por qué en vocabulario interno —quien llama
-- decide qué contarle a quien teclea, que no es lo mismo—.
create or replace function public.billing_validate_promotion_code(
  p_organization_id uuid,
  p_code text,
  p_plan_code text,
  p_billing_interval text,
  p_catalog_amount_minor bigint,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_code public.billing_promotion_codes%rowtype;
  v_pro  public.billing_promotions%rowtype;
  v_desc bigint;
  v_usos integer;
  v_mios integer;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    return jsonb_build_object('status', 'no_code');
  end if;

  select * into v_code from public.billing_promotion_codes
   where code = upper(trim(p_code));
  if not found then
    return jsonb_build_object('status', 'unknown_code');
  end if;
  if v_code.status <> 'active' then
    return jsonb_build_object('status', 'code_retired');
  end if;

  select * into v_pro from public.billing_promotions where id = v_code.promotion_id;
  if v_pro.status <> 'active' then
    return jsonb_build_object('status', 'campaign_not_active', 'reason', v_pro.status);
  end if;
  if p_at < v_pro.starts_at then
    return jsonb_build_object('status', 'not_yet_valid', 'starts_at', v_pro.starts_at);
  end if;
  if v_pro.ends_at is not null and p_at >= v_pro.ends_at then
    return jsonb_build_object('status', 'expired', 'ends_at', v_pro.ends_at);
  end if;

  -- ELEGIBILIDAD EXPLÍCITA. Que un cupón sea de Full no lo hace de Extra.
  if not (p_plan_code = any (v_pro.eligible_plan_codes)) then
    return jsonb_build_object('status', 'plan_not_eligible', 'plan_code', p_plan_code);
  end if;
  if not (p_billing_interval = any (v_pro.eligible_intervals)) then
    return jsonb_build_object('status', 'interval_not_eligible',
      'billing_interval', p_billing_interval);
  end if;

  if v_pro.max_redemptions is not null then
    select count(*) into v_usos from public.billing_promotion_redemptions
     where promotion_id = v_pro.id;
    if v_usos >= v_pro.max_redemptions then
      return jsonb_build_object('status', 'exhausted');
    end if;
  end if;

  select count(*) into v_mios from public.billing_promotion_redemptions
   where promotion_id = v_pro.id and organization_id = p_organization_id;
  if v_mios >= v_pro.max_per_organization then
    return jsonb_build_object('status', 'already_used');
  end if;

  -- EL DESCUENTO, SOBRE EL CATÁLOGO Y EN SU MONEDA. Convertir primero y
  -- descontar después daría el mismo número casi siempre, y uno distinto a
  -- veces por el redondeo; y dejaría de poder decirse «el 40 % de USD 40».
  if v_pro.discount_type = 'percentage' then
    v_desc := round((p_catalog_amount_minor::numeric * v_pro.discount_value::numeric)
                    / 10000::numeric)::bigint;
  else
    v_desc := least(v_pro.discount_value, p_catalog_amount_minor);
  end if;
  -- Un descuento nunca deja el precio por debajo de cero.
  v_desc := least(v_desc, p_catalog_amount_minor);

  return jsonb_build_object(
    'status', 'valid',
    'promotion_id', v_pro.id,
    'code_id', v_code.id,
    'code', v_code.code,
    'promotion_name', v_pro.name,
    'discount_type', v_pro.discount_type,
    'discount_basis_points',
      case when v_pro.discount_type = 'percentage' then v_pro.discount_value end,
    'discount_catalog_minor', v_desc,
    'discounted_catalog_minor', p_catalog_amount_minor - v_desc);
end;
$$;

revoke all on function public.billing_validate_promotion_code(uuid, text, text, text, bigint, timestamptz)
  from public, anon;
grant execute on function public.billing_validate_promotion_code(uuid, text, text, text, bigint, timestamptz)
  to authenticated, service_role;

comment on function public.billing_validate_promotion_code(uuid, text, text, text, bigint, timestamptz) is
  'PE-05B6B · Comprueba un codigo ENTERO en el servidor y devuelve el descuento calculado sobre el catalogo, en su moneda. El navegador manda un codigo; nunca un porcentaje ni un importe.';

-- ---------------------------------------------------------------------------
-- 5 · EL PRESUPUESTO, AHORA CON CUPÓN
-- ---------------------------------------------------------------------------
-- El orden no cambia respecto a lo que 0169 ya fijaba en su `check`: el
-- descuento actúa sobre el catálogo, se convierte UNA vez, y el impuesto cae
-- sobre la base ya descontada. Nunca se descuenta el impuesto por separado: no
-- es una promoción, es un tributo sobre lo que efectivamente se cobra.
--
-- Y en el anual, el cupón cae sobre el precio anual CANÓNICO —USD 400—, no
-- sobre doce mensualidades: un 40 % de 12 × 40 serían 288 y no 240, o sea el
-- descuento anual regalado dos veces.
drop function if exists public.billing_create_quote(uuid, text, text);

create or replace function public.billing_create_quote(
  p_organization_id uuid,
  p_plan_code text,
  p_billing_interval text,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rev      record;
  v_moneda   text := public.billing_charge_currency();
  v_clase    text;
  v_catalogo bigint;
  v_cupon    jsonb;
  v_canje    uuid;
  v_desc_cat bigint := 0;
  v_neto     bigint;
  v_fx       jsonb;
  v_base     bigint;
  v_bruto    bigint;
  v_desc_cop bigint := 0;
  v_imp      jsonb;
  v_iva      bigint;
  v_id       uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.has_org_role(p_organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo quien administra la empresa puede contratar un plan.';
  end if;
  if p_billing_interval not in ('monthly', 'annual') then
    raise exception 'BILLING_INTERVAL_INVALID';
  end if;
  if p_plan_code not in ('full', 'extra') then
    raise exception 'PLAN_NOT_PURCHASABLE' using detail = coalesce(p_plan_code, 'null');
  end if;

  select r.id, r.plan_code, r.currency, r.price_state,
         r.monthly_price_minor, r.annual_price_minor, p.service_class
    into v_rev
    from public.plan_revisions r
    join public.plans p on p.code = r.plan_code
   where r.plan_code = p_plan_code and r.status = 'published' and r.effective_to is null;
  if v_rev.id is null then
    raise exception 'PLAN_REVISION_NOT_PUBLISHED';
  end if;
  if v_rev.price_state <> 'configured' then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = p_plan_code;
  end if;

  v_clase := v_rev.service_class;
  v_catalogo := case when p_billing_interval = 'monthly'
                     then v_rev.monthly_price_minor else v_rev.annual_price_minor end;
  if v_catalogo is null or v_catalogo <= 0 then
    raise exception 'PLAN_PRICE_NOT_CONFIGURED' using detail = p_billing_interval;
  end if;

  -- EL CUPÓN. Si viene y no vale, se dice: contratar con un descuento que la
  -- persona creía tener y no tiene sería peor que negarse.
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    v_cupon := public.billing_validate_promotion_code(
      p_organization_id, p_coupon_code, p_plan_code, p_billing_interval, v_catalogo, now());
    if v_cupon->>'status' <> 'valid' then
      raise exception 'COUPON_NOT_APPLICABLE' using detail = v_cupon->>'status';
    end if;
    v_desc_cat := (v_cupon->>'discount_catalog_minor')::bigint;
  end if;
  v_neto := v_catalogo - v_desc_cat;

  v_fx := public.billing_resolve_fx(v_rev.currency, v_moneda, now());
  if v_fx->>'status' <> 'found' then
    raise exception 'FX_RATE_UNAVAILABLE'
      using detail = v_rev.currency || '→' || v_moneda,
            hint = 'No hay tipo de cambio comercial vigente. La administración de plataforma tiene que fijarlo antes de vender.';
  end if;

  -- Una sola conversión, sobre el precio YA descontado. El importe descontado
  -- en pesos se guarda como diferencia con el bruto, que es lo que significa.
  v_base  := public.billing_usd_minor_to_cop(v_neto, (v_fx->>'rate_micros')::bigint);
  v_bruto := public.billing_usd_minor_to_cop(v_catalogo, (v_fx->>'rate_micros')::bigint);
  v_desc_cop := v_bruto - v_base;

  v_imp := public.billing_resolve_tax_rule(v_clase, now());
  if v_imp->>'status' <> 'found' then
    raise exception 'TAX_RULE_UNAVAILABLE'
      using detail = v_clase,
            hint = 'Sin regla fiscal vigente no se puede cobrar: asumir 0 % dejaría de cobrar un impuesto y asumir 19 % cobraría uno que quizá no toca.';
  end if;
  -- El impuesto, sobre la base YA descontada.
  v_iva := public.billing_tax_amount(v_base, (v_imp->>'rate_basis_points')::integer);

  if v_cupon is not null then
    insert into public.billing_promotion_redemptions (
      promotion_id, code_id, organization_id, plan_code, billing_interval,
      catalog_amount_minor, catalog_currency, discount_type,
      discount_basis_points, discount_catalog_minor, discounted_catalog_minor)
    values (
      (v_cupon->>'promotion_id')::uuid, (v_cupon->>'code_id')::uuid, p_organization_id,
      p_plan_code, p_billing_interval, v_catalogo, v_rev.currency,
      v_cupon->>'discount_type',
      nullif(v_cupon->>'discount_basis_points', '')::integer,
      v_desc_cat, v_neto)
    returning id into v_canje;
  end if;

  insert into public.billing_quotes (
    organization_id, plan_code, plan_revision_id, billing_interval,
    catalog_amount_minor, catalog_currency,
    fx_rate_id, fx_rate_micros, charge_currency,
    discount_amount, base_amount,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount, total_amount,
    expires_at, created_by, redemption_id)
  values (
    p_organization_id, p_plan_code, v_rev.id, p_billing_interval,
    v_catalogo, v_rev.currency,
    nullif(v_fx->>'fx_rate_id', '')::uuid, (v_fx->>'rate_micros')::bigint, v_moneda,
    v_desc_cop, v_base,
    v_clase, (v_imp->>'tax_rule_id')::uuid, (v_imp->>'rate_basis_points')::integer,
    v_iva, v_base + v_iva,
    now() + interval '30 minutes', auth.uid(), v_canje)
  returning id into v_id;

  if v_canje is not null then
    update public.billing_promotion_redemptions set quote_id = v_id where id = v_canje;
  end if;

  return jsonb_build_object(
    'quote_id', v_id, 'plan_code', p_plan_code, 'billing_interval', p_billing_interval,
    'catalog_amount_minor', v_catalogo, 'catalog_currency', v_rev.currency,
    'charge_currency', v_moneda, 'fx_rate_micros', (v_fx->>'rate_micros')::bigint,
    'discount_amount', v_desc_cop, 'base_amount', v_base,
    'coupon_code', v_cupon->>'code', 'promotion_name', v_cupon->>'promotion_name',
    'discount_basis_points', nullif(v_cupon->>'discount_basis_points', '')::integer,
    'service_class', v_clase,
    'tax_rate_basis_points', (v_imp->>'rate_basis_points')::integer,
    'tax_amount', v_iva, 'total_amount', v_base + v_iva,
    'expires_at', now() + interval '30 minutes');
end;
$$;

revoke all on function public.billing_create_quote(uuid, text, text, text) from public, anon;
grant execute on function public.billing_create_quote(uuid, text, text, text) to authenticated;

comment on function public.billing_create_quote(uuid, text, text, text) is
  'PE-05B6B · El presupuesto, con cupon opcional. Orden fijo: catalogo menos descuento, UNA conversion, e impuesto sobre la base ya descontada. En el anual el cupon cae sobre el precio anual canonico, no sobre doce mensualidades.';

-- ---------------------------------------------------------------------------
-- 6 · Y EL CANJE QUEDA ATADO A SU SUSCRIPCIÓN
-- ---------------------------------------------------------------------------
-- El beneficio dura lo que dure ESA suscripción, y por eso el canje apunta a
-- ella. No se ata a la empresa: quien vuelva a contratar mañana necesita un
-- cupón válido entonces, no el de la vez anterior.
--
-- La duración no hace falta programarla: la suscripción congela su base en
-- pesos AL CONTRATAR, y esa base ya viene descontada. Todas las renovaciones
-- cobran el importe con descuento sin preguntarle nada a la campaña.
create or replace function public.billing_settle_payment(
  p_quote_id uuid, p_provider text, p_provider_payment_id text, p_outcome text,
  p_idempotency_key text default null, p_failure_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_q     public.billing_quotes%rowtype;
  v_ya    public.billing_payments%rowtype;
  v_pago  uuid;
  v_sub   uuid;
  v_mod   record;
  v_aplicados int := 0;
  v_ini   timestamptz;
  v_fin   timestamptz;
  v_per   uuid;
begin
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, 'null');
  end if;

  select * into v_q from public.billing_quotes where id = p_quote_id for update;
  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_q.organization_id::text, 0));

  if p_provider_payment_id is not null then
    select * into v_ya from public.billing_payments
     where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('payment_id', v_ya.id, 'status', v_ya.status,
                                'subscription_id', v_ya.subscription_id, 'already_settled', true);
    end if;
  end if;

  if v_q.status = 'consumed' then
    return jsonb_build_object('status', 'already_consumed', 'quote_id', v_q.id,
                              'subscription_id', v_q.subscription_id, 'already_settled', true);
  end if;
  if v_q.status <> 'open' then
    raise exception 'QUOTE_NOT_OPEN' using detail = v_q.status;
  end if;
  if v_q.expires_at <= now() then
    update public.billing_quotes set status = 'expired' where id = v_q.id;
    raise exception 'QUOTE_EXPIRED';
  end if;

  insert into public.billing_payments (
    organization_id, quote_id, provider, provider_payment_id,
    base_amount, discount_amount, service_class, tax_rule_id,
    tax_rate_basis_points, tax_amount, total_amount, currency, fx_rate_micros,
    status, paid_at, failed_at, failure_reason, idempotency_key)
  values (
    v_q.organization_id, v_q.id, p_provider, p_provider_payment_id,
    v_q.base_amount, v_q.discount_amount, v_q.service_class, v_q.tax_rule_id,
    v_q.tax_rate_basis_points, v_q.tax_amount, v_q.total_amount,
    v_q.charge_currency, v_q.fx_rate_micros,
    case p_outcome when 'approved' then 'approved' when 'declined' then 'declined' else 'failed' end,
    case when p_outcome = 'approved' then now() end,
    case when p_outcome <> 'approved' then now() end,
    p_failure_reason, p_idempotency_key)
  returning id into v_pago;

  if p_outcome <> 'approved' then
    return jsonb_build_object('payment_id', v_pago, 'status', p_outcome,
                              'subscription_id', null, 'already_settled', false);
  end if;

  v_ini := now();
  v_fin := (public.billing_period_bounds(v_ini, v_q.billing_interval, 1)->>'period_end')::timestamptz;

  insert into public.billing_subscriptions (
    organization_id, provider, plan_code, plan_revision_id, billing_interval,
    catalog_amount_minor, catalog_currency, base_charge_amount, charge_currency,
    fx_rate_id, fx_rate_micros, status,
    current_period_start, current_period_end, renews_at, created_by)
  values (
    v_q.organization_id, p_provider, v_q.plan_code, v_q.plan_revision_id, v_q.billing_interval,
    v_q.catalog_amount_minor, v_q.catalog_currency,
    -- La base YA viene descontada. Ahí es donde vive la duración del cupón.
    v_q.base_amount, v_q.charge_currency, v_q.fx_rate_id, v_q.fx_rate_micros,
    'active', v_ini, v_fin, v_fin, v_q.created_by)
  returning id into v_sub;

  insert into public.billing_subscription_periods (
    subscription_id, organization_id, period_sequence, period_start, period_end,
    base_amount, charge_currency, status, settled_payment_id, settled_at)
  values (v_sub, v_q.organization_id, 1, v_ini, v_fin,
          v_q.base_amount, v_q.charge_currency, 'settled', v_pago, now())
  returning id into v_per;

  update public.billing_payments
     set subscription_id = v_sub, period_id = v_per where id = v_pago;
  update public.billing_quotes
     set status = 'consumed', consumed_at = now(), subscription_id = v_sub
   where id = v_q.id;
  -- El canje queda atado a ESTA suscripción, que es lo que dura.
  if v_q.redemption_id is not null then
    update public.billing_promotion_redemptions
       set subscription_id = v_sub where id = v_q.redemption_id;
  end if;

  for v_mod in
    select om.module_code from public.organization_modules om
      join public.modules m on m.code = om.module_code
     where om.organization_id = v_q.organization_id
       and om.enabled and coalesce(m.is_functional, false)
  loop
    perform public.commercial_apply_assignment(
      v_q.organization_id, v_q.plan_revision_id, 'module', v_mod.module_code,
      'sold', 'checkout', now(), null,
      'Plan ' || v_q.plan_code || ' contratado por la empresa.', v_q.created_by);
    v_aplicados := v_aplicados + 1;
  end loop;

  return jsonb_build_object('payment_id', v_pago, 'status', 'approved',
    'subscription_id', v_sub, 'period_id', v_per,
    'modules_granted', v_aplicados, 'already_settled', false);
end;
$$;

revoke all on function public.billing_settle_payment(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_settle_payment(uuid, text, text, text, text, text)
  to service_role;

comment on function public.billing_settle_payment(uuid, text, text, text, text, text) is
  'PE-05B6B · La contratacion. La base congelada de la suscripcion viene YA DESCONTADA del presupuesto: ahi vive la duracion del cupon, sin contadores ni revalidaciones. El canje queda atado a esa suscripcion, no a la empresa.';
