-- ===========================================================================
-- 0169 · PE-05B1 · CIMIENTOS DE FACTURACIÓN
-- ---------------------------------------------------------------------------
-- Presupuestos inmutables, suscripciones de empresa, pagos, tipo de cambio
-- comercial y —lo que decide la forma de todo lo demás— TRATAMIENTO FISCAL CON
-- VIGENCIA.
--
-- LA DECISIÓN QUE MANDA
--
-- El precio de un plan y el impuesto que se le aplica son cosas distintas. Full
-- vale USD 40 al mes; que el cliente pague eso más 19 % de IVA, o eso más 0 %,
-- lo decide una REGLA FISCAL con su propia vigencia y su propia aprobación.
--
-- No existen `full_con_iva` ni `full_sin_iva`. Existe Full, y existen reglas
-- fiscales que cambian con el tiempo sin tocar el catálogo, sin reescribir un
-- solo cobro pasado y sin obligar a nadie a cancelar y volver a contratar.
--
-- POR QUÉ IMPORTA AHORA
--
-- El SaaS autogestionable de Trazaloop podría llegar a estar exento de IVA,
-- pero HOY NO LO ESTÁ: falta el autodiagnóstico, el visto bueno contable y la
-- aprobación de MinTIC. Así que se lanza al 19 %, y la arquitectura deja
-- preparada la transición prospectiva para el día que la aprobación exista.
--
-- Y una distinción que no se puede perder: el Acompañamiento es un SERVICIO
-- PROFESIONAL, no SaaS autogestionable. Una futura exención del segundo no
-- puede quitarle el IVA al primero por arrastre. Por eso el impuesto se resuelve
-- por CLASIFICACIÓN DE SERVICIO, no por plan ni por empresa.
--
-- Este tramo NO integra ninguna pasarela: hay un contrato de proveedor y un
-- doble determinista. Mercado Pago es B2.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0 · PREFLIGHT DE SEGURIDAD · heredado de SEC-01 (0165)
-- ---------------------------------------------------------------------------
do $$
declare
  v_expuestas text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by c.relname)
    into v_expuestas
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_expuestas is not null then
    raise exception 'SEC01_RLS_PREFLIGHT: hay tablas de public sin RLS: %', v_expuestas
      using hint = 'Actívales RLS con una política explícita antes de promover.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1 · CLASIFICACIÓN DE SERVICIO
-- ---------------------------------------------------------------------------
-- El impuesto NO se decide por plan ni por empresa: se decide por QUÉ CLASE DE
-- SERVICIO se está vendiendo. Es lo que permite que el SaaS autogestionable
-- llegue a estar exento algún día sin que el Acompañamiento —trabajo de una
-- persona— se quede sin IVA por arrastre.
--
-- Es una tabla y no un `check` de texto a propósito: comparar cadenas sueltas
-- por el código es exactamente cómo un día alguien escribe «self_service» en un
-- sitio y «selfservice» en otro, y el impuesto se resuelve mal.
create table if not exists public.billing_service_classes (
  code       text primary key,
  label      text not null,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.billing_service_classes enable row level security;
create policy billing_service_classes_read on public.billing_service_classes
  for select to authenticated using (true);
revoke insert, update, delete, truncate on public.billing_service_classes from authenticated, anon;
revoke all on public.billing_service_classes from anon;
grant select on public.billing_service_classes to authenticated;

insert into public.billing_service_classes (code, label, note) values
  ('self_service_saas', 'SaaS autogestionable',
   'Free, Full y Extra. El cliente se sirve solo: no hay horas de nadie dentro del precio.'),
  ('professional_advisory', 'Servicio profesional',
   'Acompañamiento y asesoría. Hay horas de un especialista dentro del precio, y eso lo hace otra cosa a efectos fiscales.')
on conflict (code) do nothing;

comment on table public.billing_service_classes is
  'PE-05B1 · Qué clase de servicio se vende. El impuesto se resuelve por AQUÍ, no por plan ni por empresa: es lo que permite que el SaaS autogestionable llegue a estar exento sin que el Acompañamiento pierda su IVA por arrastre.';

-- Los planes declaran su clase. Free también, aunque nunca genere un cobro.
alter table public.plans
  add column if not exists service_class text
    references public.billing_service_classes (code);

update public.plans set service_class = 'self_service_saas' where service_class is null;

alter table public.plans
  alter column service_class set not null,
  alter column service_class set default 'self_service_saas';

comment on column public.plans.service_class is
  'PE-05B1 · Clase de servicio del plan, para resolver su tratamiento fiscal. Free, Full y Extra son SaaS autogestionable. El Acompañamiento no es un plan y no vive aquí.';

-- ---------------------------------------------------------------------------
-- 2 · REGLAS FISCALES CON VIGENCIA
-- ---------------------------------------------------------------------------
-- El tipo se guarda en PUNTOS BÁSICOS enteros (1900 = 19,00 %). Nada de dinero
-- ni de impuestos en coma flotante: 0,19 no existe exactamente en binario, y un
-- céntimo que baila es un cliente que escribe.
create table if not exists public.billing_tax_rules (
  id              uuid primary key default gen_random_uuid(),
  service_class   text not null references public.billing_service_classes (code),
  jurisdiction    text not null default 'CO',
  tax_code        text not null,
  tax_name        text not null,
  rate_basis_points integer not null,

  effective_from  timestamptz not null,
  effective_to    timestamptz,
  status          text not null default 'draft',

  -- Metadatos de aprobación. NO son un flujo burocrático: son lo mínimo para
  -- poder responder «¿quién autorizó cobrar 0 % desde octubre, y con qué
  -- respaldo?» sin guardar aquí ningún documento.
  approval_reference text,
  approval_note      text,
  approved_by        uuid references public.profiles (id),
  approved_at        timestamptz,

  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint billing_tax_rules_status_check check (status in ('draft', 'active', 'retired')),
  constraint billing_tax_rules_rate_check
    check (rate_basis_points >= 0 and rate_basis_points <= 10000),
  constraint billing_tax_rules_period_check
    check (effective_to is null or effective_to > effective_from),
  -- Una regla ACTIVA tiene que decir quién la aprobó y cuándo. Cobrar —o dejar
  -- de cobrar— un impuesto sin constancia de aprobación es lo que después nadie
  -- sabe explicar.
  constraint billing_tax_rules_approval_check
    check (status <> 'active' or (approved_at is not null and approval_reference is not null))
);

create index if not exists billing_tax_rules_lookup_idx
  on public.billing_tax_rules (service_class, jurisdiction, effective_from desc)
  where status = 'active';

alter table public.billing_tax_rules enable row level security;

-- La empresa puede LEER qué regla se le aplica: es su factura.
create policy billing_tax_rules_read on public.billing_tax_rules
  for select to authenticated using (true);
create policy billing_tax_rules_write on public.billing_tax_rules
  for all to authenticated
  using (public.is_platform_superadmin()) with check (public.is_platform_superadmin());

revoke all on public.billing_tax_rules from anon;
grant select on public.billing_tax_rules to authenticated;

create trigger t_billing_tax_rules_updated
  before update on public.billing_tax_rules
  for each row execute function public.set_updated_at();

comment on table public.billing_tax_rules is
  'PE-05B1 · Tratamiento fiscal CON VIGENCIA, por clase de servicio. Cambiar el impuesto no cambia el precio del plan ni reescribe un solo cobro pasado: se publica una regla sucesora con su fecha efectiva y su aprobación.';

-- Una regla que ya se aplicó a un cobro NO cambia de significado económico.
-- Se corrige publicando una sucesora, igual que las revisiones de plan de 0162.
create or replace function public.billing_tax_rule_is_immutable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from public.billing_quotes q where q.tax_rule_id = old.id)
     or exists (select 1 from public.billing_payments p where p.tax_rule_id = old.id) then
    if new.rate_basis_points is distinct from old.rate_basis_points
       or new.service_class is distinct from old.service_class
       or new.effective_from is distinct from old.effective_from
       or new.tax_code is distinct from old.tax_code then
      raise exception 'TAX_RULE_ALREADY_APPLIED'
        using hint = 'Esta regla ya se aplicó a un cobro. Publica una sucesora con su fecha efectiva; lo cobrado no se reescribe.';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3 · TIPO DE CAMBIO COMERCIAL, CON VIGENCIA
-- ---------------------------------------------------------------------------
-- Lo fija la administración de plataforma. No hay consulta a ninguna API de
-- divisas en el momento de cobrar: una pasarela de tipos caída no puede impedir
-- vender, y un cliente tiene derecho a ver el importe exacto antes de pagar.
create table if not exists public.commercial_fx_rates (
  id             uuid primary key default gen_random_uuid(),
  base_currency  text not null,
  quote_currency text not null,
  -- Micros: 1 USD = rate_micros / 1e6 unidades de la moneda de cobro.
  rate_micros    bigint not null,
  effective_from timestamptz not null,
  effective_to   timestamptz,
  status         text not null default 'active',
  note           text,
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),

  constraint commercial_fx_rates_status_check check (status in ('active', 'retired')),
  constraint commercial_fx_rates_rate_check check (rate_micros > 0),
  constraint commercial_fx_rates_period_check
    check (effective_to is null or effective_to > effective_from),
  constraint commercial_fx_rates_pair_check check (base_currency <> quote_currency)
);

create index if not exists commercial_fx_rates_lookup_idx
  on public.commercial_fx_rates (base_currency, quote_currency, effective_from desc)
  where status = 'active';

alter table public.commercial_fx_rates enable row level security;
create policy commercial_fx_rates_read on public.commercial_fx_rates
  for select to authenticated using (true);
create policy commercial_fx_rates_write on public.commercial_fx_rates
  for all to authenticated
  using (public.is_platform_superadmin()) with check (public.is_platform_superadmin());
revoke all on public.commercial_fx_rates from anon;
grant select on public.commercial_fx_rates to authenticated;

comment on table public.commercial_fx_rates is
  'PE-05B1 · Tipo de cambio COMERCIAL con vigencia, fijado por la administración de plataforma. No hay consulta a una API de divisas al cobrar: el cliente tiene que ver el importe exacto antes de pagar, y una API caída no puede impedir vender.';

-- ---------------------------------------------------------------------------
-- 4 · SUSCRIPCIONES, PRESUPUESTOS Y PAGOS
-- ---------------------------------------------------------------------------
-- UNA suscripción de pago por empresa. No por módulo: los cuatro recursos que
-- definen el plan —almacenamiento, Intelligence, tiempo y soporte— ya son de
-- empresa desde PE-04, así que vender por módulo desbloquearía capacidad en
-- todos comprando el más barato.
create table if not exists public.billing_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  provider          text not null,
  provider_customer_id     text,
  provider_subscription_id text,

  plan_code         text not null references public.plans (code),
  plan_revision_id  uuid not null references public.plan_revisions (id),
  billing_interval  text not null,

  -- Precio de CATÁLOGO, tal como estaba al contratar.
  catalog_amount_minor bigint not null,
  catalog_currency     text not null,

  -- Lo que se cobra de verdad, y con qué cambio se calculó. El IMPUESTO NO
  -- ESTÁ AQUÍ, y es deliberado: si se congelara el total con IVA dentro, una
  -- futura exención obligaría a cancelar y recontratar para quitarlo.
  base_charge_amount   bigint not null,
  charge_currency      text not null,
  fx_rate_id           uuid references public.commercial_fx_rates (id),
  fx_rate_micros       bigint,

  status            text not null default 'pending',

  current_period_start timestamptz,
  current_period_end   timestamptz,
  renews_at            timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at         timestamptz,
  ended_at             timestamptz,

  -- Cambio comercial programado (bajar de plan al final del periodo). B5 lo usa.
  scheduled_plan_revision_id uuid references public.plan_revisions (id),
  scheduled_effective_at     timestamptz,

  grace_until       timestamptz,

  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint billing_subscriptions_interval_check check (billing_interval in ('monthly', 'annual')),
  constraint billing_subscriptions_status_check
    check (status in ('pending', 'active', 'past_due', 'cancel_at_period_end',
                      'ended', 'manual_review')),
  -- Solo se venden Full y Extra. Free es el suelo y la prueba no se compra.
  constraint billing_subscriptions_plan_check check (plan_code in ('full', 'extra')),
  constraint billing_subscriptions_amount_check
    check (catalog_amount_minor > 0 and base_charge_amount > 0)
);

-- UNA sola suscripción viva por empresa. Igual que la invariante de 0168 para
-- las asignaciones: si hubiera dos, «qué paga esta empresa» dejaría de tener
-- respuesta.
create unique index if not exists billing_subscriptions_one_live
  on public.billing_subscriptions (organization_id)
  where status in ('pending', 'active', 'past_due', 'cancel_at_period_end');

create index if not exists billing_subscriptions_org_idx
  on public.billing_subscriptions (organization_id, created_at desc);

alter table public.billing_subscriptions enable row level security;

-- La empresa ve SU suscripción; escribirla es cosa de las funciones de dominio.
create policy billing_subscriptions_read on public.billing_subscriptions
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());
revoke insert, update, delete, truncate on public.billing_subscriptions from authenticated, anon;
revoke all on public.billing_subscriptions from anon;
grant select on public.billing_subscriptions to authenticated;

create trigger t_billing_subscriptions_updated
  before update on public.billing_subscriptions
  for each row execute function public.set_updated_at();

comment on table public.billing_subscriptions is
  'PE-05B1 · La suscripción de pago de la empresa. UNA por empresa, nunca por módulo. Congela el precio BASE en la moneda de cobro y el cambio con que se calculó; el IMPUESTO no se congela aquí, se resuelve en cada cobro, que es lo que permite una futura exención sin recontratar.';

-- --- Presupuestos -----------------------------------------------------------
-- Inmutable: lo que se ofreció, se ofreció. Cambiar de idea emite otro.
create table if not exists public.billing_quotes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete restrict,

  plan_code         text not null references public.plans (code),
  plan_revision_id  uuid not null references public.plan_revisions (id),
  billing_interval  text not null,

  catalog_amount_minor bigint not null,
  catalog_currency     text not null,

  fx_rate_id     uuid references public.commercial_fx_rates (id),
  fx_rate_micros bigint,
  charge_currency text not null,

  discount_amount bigint not null default 0,
  base_amount     bigint not null,

  -- La foto fiscal de ESTE presupuesto. Con la regla, no solo con el número:
  -- un porcentaje suelto no explica por qué a una empresa se le aplicó.
  service_class   text not null references public.billing_service_classes (code),
  tax_rule_id     uuid not null references public.billing_tax_rules (id),
  tax_rate_basis_points integer not null,
  tax_amount      bigint not null,

  total_amount    bigint not null,

  status          text not null default 'open',
  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  subscription_id uuid references public.billing_subscriptions (id),

  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint billing_quotes_interval_check check (billing_interval in ('monthly', 'annual')),
  constraint billing_quotes_status_check check (status in ('open', 'consumed', 'expired', 'void')),
  constraint billing_quotes_plan_check check (plan_code in ('full', 'extra')),
  constraint billing_quotes_amounts_check
    check (discount_amount >= 0 and base_amount >= 0 and tax_amount >= 0
           and total_amount = base_amount + tax_amount),
  constraint billing_quotes_consumed_check
    check ((status = 'consumed') = (consumed_at is not null))
);

create index if not exists billing_quotes_org_idx
  on public.billing_quotes (organization_id, created_at desc);

alter table public.billing_quotes enable row level security;
create policy billing_quotes_read on public.billing_quotes
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());
revoke insert, update, delete, truncate on public.billing_quotes from authenticated, anon;
revoke all on public.billing_quotes from anon;
grant select on public.billing_quotes to authenticated;

comment on table public.billing_quotes is
  'PE-05B1 · Presupuesto inmutable. Congela plan, REVISIÓN, intervalo, precio, cambio, clase de servicio, regla fiscal, impuesto y total, con caducidad. El pago referencia un presupuesto: el importe nunca se reconstruye de lo que mande el navegador.';

-- --- Pagos ------------------------------------------------------------------
create table if not exists public.billing_payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  subscription_id  uuid references public.billing_subscriptions (id),
  quote_id         uuid references public.billing_quotes (id),

  provider             text not null,
  provider_payment_id  text,

  base_amount     bigint not null,
  discount_amount bigint not null default 0,

  service_class   text not null references public.billing_service_classes (code),
  tax_rule_id     uuid not null references public.billing_tax_rules (id),
  tax_rate_basis_points integer not null,
  tax_amount      bigint not null,

  total_amount    bigint not null,
  currency        text not null,

  fx_rate_micros  bigint,

  status          text not null default 'pending',
  paid_at         timestamptz,
  failed_at       timestamptz,
  failure_reason  text,

  refunded_amount bigint not null default 0,
  refunded_at     timestamptz,

  -- Comisión del proveedor, cuando la informe. Sirve para analizar
  -- rentabilidad y JAMÁS altera lo que el cliente tiene.
  provider_fee_amount bigint,

  idempotency_key text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint billing_payments_status_check
    check (status in ('pending', 'approved', 'declined', 'failed',
                      'refunded', 'partially_refunded', 'manual_review')),
  constraint billing_payments_amounts_check
    check (base_amount >= 0 and tax_amount >= 0 and discount_amount >= 0
           and refunded_amount >= 0 and total_amount = base_amount + tax_amount)
);

create unique index if not exists billing_payments_idempotency_uniq
  on public.billing_payments (organization_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists billing_payments_provider_uniq
  on public.billing_payments (provider, provider_payment_id)
  where provider_payment_id is not null;
create index if not exists billing_payments_org_idx
  on public.billing_payments (organization_id, created_at desc);

alter table public.billing_payments enable row level security;
create policy billing_payments_read on public.billing_payments
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_staff());
revoke insert, update, delete, truncate on public.billing_payments from authenticated, anon;
revoke all on public.billing_payments from anon;
grant select on public.billing_payments to authenticated;

create trigger t_billing_payments_updated
  before update on public.billing_payments
  for each row execute function public.set_updated_at();

comment on table public.billing_payments is
  'PE-05B1 · Hecho financiero, separado de la suscripción —que es una relación—. Guarda su PROPIA foto fiscal: la regla y el tipo que se aplicaron entonces. Cambiar el impuesto mañana no reescribe este cobro.';

-- Ahora que existen las tablas, el disparador de inmutabilidad de las reglas
-- puede instalarse: necesita consultarlas.
drop trigger if exists t_billing_tax_rules_immutable on public.billing_tax_rules;
create trigger t_billing_tax_rules_immutable
  before update on public.billing_tax_rules
  for each row execute function public.billing_tax_rule_is_immutable();

-- ---------------------------------------------------------------------------
-- 5 · LA POLÍTICA FISCAL DE LANZAMIENTO
-- ---------------------------------------------------------------------------
-- 19 % en las dos clases. El SaaS autogestionable PODRÍA llegar a estar exento,
-- pero hoy falta el autodiagnóstico, el visto bueno contable y la aprobación de
-- MinTIC. Lanzar exento sin eso sería dejar de cobrar un impuesto que hay que
-- cobrar.
--
-- NO se siembra ninguna regla al 0 %, ni siquiera en borrador: la arquitectura
-- la admite, el lanzamiento no la tiene.
insert into public.billing_tax_rules
  (service_class, jurisdiction, tax_code, tax_name, rate_basis_points,
   effective_from, status, approval_reference, approval_note, approved_at)
select 'self_service_saas', 'CO', 'IVA', 'IVA general', 1900,
       '2020-01-01T00:00:00Z', 'active',
       'PE-05B1 · política fiscal de lanzamiento',
       'Fijada por la propiedad del producto. La exención del SaaS autogestionable exige autodiagnóstico, visto bueno contable y aprobación de MinTIC, y NO está disponible: se lanza al 19 %.',
       now()
where not exists (
  select 1 from public.billing_tax_rules
   where service_class = 'self_service_saas' and jurisdiction = 'CO' and status = 'active');

insert into public.billing_tax_rules
  (service_class, jurisdiction, tax_code, tax_name, rate_basis_points,
   effective_from, status, approval_reference, approval_note, approved_at)
select 'professional_advisory', 'CO', 'IVA', 'IVA general', 1900,
       '2020-01-01T00:00:00Z', 'active',
       'PE-05B1 · política fiscal de lanzamiento',
       'El Acompañamiento es servicio profesional. Una futura exención del SaaS autogestionable NO le quita el IVA: son clases distintas y por eso el impuesto se resuelve por clase.',
       now()
where not exists (
  select 1 from public.billing_tax_rules
   where service_class = 'professional_advisory' and jurisdiction = 'CO' and status = 'active');

-- Ningún tipo de cambio se siembra: inventarlo sería inventar un precio. Sin
-- tipo vigente, el presupuesto falla cerrado y lo dice. La administración de
-- plataforma tiene que fijarlo antes de vender.

-- ---------------------------------------------------------------------------
-- 6 · RESOLUTORES · fallan cerrado
-- ---------------------------------------------------------------------------
create or replace function public.billing_resolve_tax_rule(
  p_service_class text,
  p_at timestamptz default now(),
  p_jurisdiction text default 'CO'
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_r record;
begin
  -- Solo reglas ACTIVAS y vigentes en ese instante. Un borrador no cobra ni deja
  -- de cobrar nada, y una regla futura no actúa antes de su fecha.
  select id, rate_basis_points, tax_code, tax_name, effective_from
    into v_r
    from public.billing_tax_rules
   where service_class = p_service_class
     and jurisdiction = p_jurisdiction
     and status = 'active'
     and effective_from <= p_at
     and (effective_to is null or effective_to > p_at)
   order by effective_from desc
   limit 1;

  if v_r.id is null then
    -- FALLA CERRADO, y este es el punto entero del diseño: sin regla no se
    -- asume 0 % —dejaríamos de cobrar un impuesto— ni 19 % —cobraríamos uno que
    -- quizá no toca—. No se puede cobrar.
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_active_rule');
  end if;

  return jsonb_build_object(
    'status', 'found',
    'tax_rule_id', v_r.id,
    'rate_basis_points', v_r.rate_basis_points,
    'tax_code', v_r.tax_code,
    'tax_name', v_r.tax_name,
    'effective_from', v_r.effective_from);
end;
$$;

create or replace function public.billing_resolve_fx(
  p_base text,
  p_quote text,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_r record;
begin
  -- Misma moneda: no hay conversión y no hace falta tipo.
  if p_base = p_quote then
    return jsonb_build_object('status', 'found', 'fx_rate_id', null, 'rate_micros', 1000000);
  end if;

  select id, rate_micros into v_r
    from public.commercial_fx_rates
   where base_currency = p_base and quote_currency = p_quote
     and status = 'active'
     and effective_from <= p_at
     and (effective_to is null or effective_to > p_at)
   order by effective_from desc
   limit 1;

  if v_r.id is null then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_active_rate');
  end if;
  return jsonb_build_object('status', 'found', 'fx_rate_id', v_r.id, 'rate_micros', v_r.rate_micros);
end;
$$;

revoke all on function public.billing_resolve_tax_rule(text, timestamptz, text) from public, anon;
revoke all on function public.billing_resolve_fx(text, text, timestamptz) from public, anon;
grant execute on function public.billing_resolve_tax_rule(text, timestamptz, text) to authenticated;
grant execute on function public.billing_resolve_fx(text, text, timestamptz) to authenticated;

comment on function public.billing_resolve_tax_rule(text, timestamptz, text) is
  'PE-05B1 · Regla fiscal vigente para una clase de servicio en un instante. Sin regla activa devuelve `unavailable` y el cobro NO puede seguir: asumir 0 % dejaría de cobrar un impuesto y asumir 19 % cobraría uno que quizá no toca.';

-- ---------------------------------------------------------------------------
-- 7 · LA ARITMÉTICA DEL DINERO · entera, y con una regla de redondeo escrita
-- ---------------------------------------------------------------------------
-- El peso colombiano no tiene subunidad en uso: la unidad menor es el peso. El
-- dólar tiene céntimos. Convertir es, por tanto:
--
--   pesos = céntimos_usd × micros / 1e8
--
-- Redondeo: al PESO entero, media hacia arriba. Se aplica a la base y otra vez
-- al impuesto, y las dos veces igual. Escrito aquí para que ninguna prueba lo
-- adivine y ninguna pantalla lo calcule distinto.
create or replace function public.billing_usd_minor_to_cop(
  p_usd_minor bigint,
  p_rate_micros bigint
)
returns bigint
language sql
immutable
as $$
  select round((p_usd_minor::numeric * p_rate_micros::numeric) / 100000000::numeric)::bigint;
$$;

create or replace function public.billing_tax_amount(
  p_base bigint,
  p_rate_basis_points integer
)
returns bigint
language sql
immutable
as $$
  select round((p_base::numeric * p_rate_basis_points::numeric) / 10000::numeric)::bigint;
$$;

grant execute on function public.billing_usd_minor_to_cop(bigint, bigint) to authenticated;
grant execute on function public.billing_tax_amount(bigint, integer) to authenticated;

comment on function public.billing_usd_minor_to_cop(bigint, bigint) is
  'PE-05B1 · Céntimos de dólar → pesos enteros, con `numeric` y redondeo a media hacia arriba. Ni una operación de dinero en coma flotante: 0,19 no existe exactamente en binario, y un céntimo que baila es un cliente que escribe.';

-- ---------------------------------------------------------------------------
-- 8 · EL NÚCLEO DE LA TRANSICIÓN, EXTRAÍDO
-- ---------------------------------------------------------------------------
-- 0168 arregló que una bajada de plan bajara de verdad: cerrar las concesiones
-- permanentes activas del mismo alcance antes de insertar. Ahora la facturación
-- necesita hacer exactamente lo mismo desde otro sitio.
--
-- Copiarlo sería repetir el error que 0168 vino a arreglar, así que se EXTRAE.
-- `commercial_assign_plan` pasa a delegar en este núcleo, y la facturación
-- también. Una sola implementación de «cómo se sustituye una concesión».
--
-- No se concede a nadie: solo lo llaman otras funciones `security definer`.
create or replace function public.commercial_apply_assignment(
  p_organization_id uuid,
  p_plan_revision_id uuid,
  p_scope text,
  p_module_code text,
  p_grant_kind text,
  p_source text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text,
  p_actor uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_desde timestamptz := coalesce(p_starts_at, now());
  v_mod   text := case when p_scope = 'module' then p_module_code end;
  v_ya    record;
  v_id    uuid;
  v_cerradas int := 0;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('commercial_assignment:' || p_organization_id::text, 0));

  -- Idempotencia: la MISMA concesión, en el mismo instante, no abre otro periodo.
  select a.id into v_ya
    from public.organization_plan_assignments a
   where a.organization_id = p_organization_id
     and a.scope = p_scope
     and coalesce(a.module_code, '') = coalesce(v_mod, '')
     and a.grant_kind in ('sold', 'courtesy')
     and a.ends_at is null
     and a.plan_revision_id = p_plan_revision_id
     and a.starts_at = v_desde
   limit 1;
  if v_ya.id is not null then
    return jsonb_build_object('assignment_id', v_ya.id, 'closed_assignments', 0,
                              'already_applied', true);
  end if;

  -- Una permanente que empieza en o después del instante nuevo es una
  -- transición ya programada: resolverla a ciegas sería decidir por quien la
  -- programó.
  if exists (
    select 1 from public.organization_plan_assignments a
     where a.organization_id = p_organization_id
       and a.scope = p_scope
       and coalesce(a.module_code, '') = coalesce(v_mod, '')
       and a.grant_kind in ('sold', 'courtesy')
       and (a.ends_at is null or a.ends_at > v_desde)
       and a.starts_at >= v_desde
  ) then
    raise exception 'ASSIGNMENT_CONFLICTS_WITH_FUTURE'
      using hint = 'Ya hay una transición comercial programada en ese alcance. Ciérrala antes.';
  end if;

  -- Se cierra lo que se sustituye, en el instante efectivo: sin solape y sin
  -- hueco. El suelo `base` y las pruebas no se tocan.
  update public.organization_plan_assignments a
     set ends_at = v_desde
   where a.organization_id = p_organization_id
     and a.scope = p_scope
     and coalesce(a.module_code, '') = coalesce(v_mod, '')
     and a.grant_kind in ('sold', 'courtesy')
     and (a.ends_at is null or a.ends_at > v_desde)
     and a.starts_at < v_desde;
  get diagnostics v_cerradas = row_count;

  insert into public.organization_plan_assignments
    (organization_id, plan_revision_id, scope, module_code, grant_kind, source,
     starts_at, ends_at, assigned_by, reason)
  values (p_organization_id, p_plan_revision_id, p_scope, v_mod,
          p_grant_kind, p_source, v_desde, p_ends_at, p_actor, trim(p_reason))
  returning id into v_id;

  return jsonb_build_object('assignment_id', v_id, 'closed_assignments', v_cerradas,
                            'already_applied', false);
end;
$$;

revoke all on function public.commercial_apply_assignment(uuid, uuid, text, text, text, text, timestamptz, timestamptz, text, uuid)
  from public, anon, authenticated;

comment on function public.commercial_apply_assignment(uuid, uuid, text, text, text, text, timestamptz, timestamptz, text, uuid) is
  'PE-05B1 · El núcleo de la transición comercial de 0168, extraído para que la facturación no lo copie. Cierra las permanentes activas del mismo alcance y abre la nueva, bajo candado por empresa. No se concede a nadie: solo lo llaman otras funciones `security definer`.';

-- `commercial_assign_plan` conserva su contrato y su autorización; lo que
-- cambia es que deja de tener su propia copia de la lógica.
create or replace function public.commercial_assign_plan(
  p_organization_id uuid,
  p_plan_revision_id uuid,
  p_scope text,
  p_module_code text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rev    record;
  v_mod    record;
  v_prev   jsonb;
  v_desde  timestamptz := coalesce(p_starts_at, now());
  v_res    jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_platform_superadmin() then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo la administración de plataforma cambia asignaciones comerciales.';
  end if;
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'ASSIGNMENT_REASON_REQUIRED'
      using hint = 'Una transición comercial hay que poder explicarla después.';
  end if;
  if p_scope not in ('organization', 'module') then
    raise exception 'ASSIGNMENT_SCOPE_INVALID';
  end if;
  if p_ends_at is not null and p_ends_at <= v_desde then
    raise exception 'ASSIGNMENT_PERIOD_INVALID'
      using hint = 'El fin de la asignación tiene que ser posterior a su inicio.';
  end if;

  select r.id, r.plan_code, r.status, r.effective_to into v_rev
    from public.plan_revisions r where r.id = p_plan_revision_id;
  if v_rev.id is null then
    raise exception 'PLAN_REVISION_NOT_FOUND';
  end if;
  if v_rev.status <> 'published' or v_rev.effective_to is not null then
    raise exception 'PLAN_REVISION_NOT_PUBLISHED' using detail = v_rev.status;
  end if;

  if p_scope = 'module' then
    if p_module_code is null then
      raise exception 'ASSIGNMENT_MODULE_REQUIRED';
    end if;
    select m.code, m.is_functional into v_mod from public.modules m where m.code = p_module_code;
    if v_mod.code is null then
      raise exception 'MODULE_NOT_FOUND';
    end if;
    if not coalesce(v_mod.is_functional, false) then
      raise exception 'MODULE_NOT_COMMERCIAL'
        using detail = p_module_code,
              hint = 'Solo los módulos funcionales reciben plan comercial.';
    end if;
  end if;

  v_prev := public.plan_effective_for_organization(p_organization_id, now());

  v_res := public.commercial_apply_assignment(
    p_organization_id, p_plan_revision_id, p_scope, p_module_code,
    'sold', 'manual', v_desde, p_ends_at, p_reason, auth.uid());

  if coalesce((v_res->>'already_applied')::boolean, false) then
    return jsonb_build_object(
      'assignment_id', v_res->>'assignment_id',
      'new_plan_code', v_rev.plan_code,
      'closed_assignments', 0,
      'already_applied', true);
  end if;

  insert into public.commercial_assignment_events
    (organization_id, assignment_id, scope, module_code, previous_plan_code,
     new_plan_code, plan_revision_id, effective_from, effective_to, reason, actor)
  values (p_organization_id, (v_res->>'assignment_id')::uuid, p_scope,
          case when p_scope = 'module' then p_module_code end,
          case when v_prev->>'status' = 'found' then v_prev->>'plan_code' end,
          v_rev.plan_code, p_plan_revision_id,
          v_desde, p_ends_at, trim(p_reason), auth.uid());

  return jsonb_build_object(
    'assignment_id', v_res->>'assignment_id',
    'previous_plan_code', case when v_prev->>'status' = 'found' then v_prev->>'plan_code' end,
    'new_plan_code', v_rev.plan_code,
    'closed_assignments', (v_res->>'closed_assignments')::int,
    'already_applied', false);
end;
$$;

revoke all on function public.commercial_assign_plan(uuid, uuid, text, text, timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.commercial_assign_plan(uuid, uuid, text, text, timestamptz, timestamptz, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 9 · EL PRESUPUESTO · la única autoridad del importe
-- ---------------------------------------------------------------------------
-- Moneda de cobro del lanzamiento. Vive en una función y no en veinte sitios;
-- B3 la hará configurable si hace falta vender en otra.
create or replace function public.billing_charge_currency()
returns text language sql immutable as $$ select 'COP'::text $$;
grant execute on function public.billing_charge_currency() to authenticated;

create or replace function public.billing_create_quote(
  p_organization_id uuid,
  p_plan_code text,
  p_billing_interval text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_rev     record;
  v_clase   text;
  v_catalogo bigint;
  v_moneda  text := public.billing_charge_currency();
  v_fx      jsonb;
  v_imp     jsonb;
  v_base    bigint;
  v_iva     bigint;
  v_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  -- Comprar compromete a la empresa. Lo hace quien la administra, no quien
  -- trabaja en ella y desde luego no un consultor externo.
  if not public.has_org_role(p_organization_id, array['admin']) then
    raise exception 'NOT_AUTHORIZED'
      using hint = 'Solo quien administra la empresa puede contratar un plan.';
  end if;
  if p_billing_interval not in ('monthly', 'annual') then
    raise exception 'BILLING_INTERVAL_INVALID';
  end if;
  -- Free es el suelo, no un plan de pago con precio cero; la prueba no se
  -- compra. Ninguno de los dos pasa por caja.
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

  v_fx := public.billing_resolve_fx(v_rev.currency, v_moneda, now());
  if v_fx->>'status' <> 'found' then
    -- Sin tipo de cambio vigente NO se inventa uno. Se dice que no se puede
    -- cobrar todavía y la administración lo fija.
    raise exception 'FX_RATE_UNAVAILABLE'
      using detail = v_rev.currency || '→' || v_moneda,
            hint = 'No hay tipo de cambio comercial vigente. La administración de plataforma tiene que fijarlo antes de vender.';
  end if;

  v_imp := public.billing_resolve_tax_rule(v_clase, now());
  if v_imp->>'status' <> 'found' then
    raise exception 'TAX_RULE_UNAVAILABLE'
      using detail = v_clase,
            hint = 'Sin regla fiscal vigente no se puede cobrar: asumir 0 % dejaría de cobrar un impuesto y asumir 19 % cobraría uno que quizá no toca.';
  end if;

  v_base := public.billing_usd_minor_to_cop(v_catalogo, (v_fx->>'rate_micros')::bigint);
  v_iva  := public.billing_tax_amount(v_base, (v_imp->>'rate_basis_points')::integer);

  insert into public.billing_quotes (
    organization_id, plan_code, plan_revision_id, billing_interval,
    catalog_amount_minor, catalog_currency,
    fx_rate_id, fx_rate_micros, charge_currency,
    discount_amount, base_amount,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount, total_amount,
    expires_at, created_by)
  values (
    p_organization_id, p_plan_code, v_rev.id, p_billing_interval,
    v_catalogo, v_rev.currency,
    nullif(v_fx->>'fx_rate_id', '')::uuid, (v_fx->>'rate_micros')::bigint, v_moneda,
    0, v_base,
    v_clase, (v_imp->>'tax_rule_id')::uuid, (v_imp->>'rate_basis_points')::integer,
    v_iva, v_base + v_iva,
    now() + interval '30 minutes', auth.uid())
  returning id into v_id;

  return jsonb_build_object(
    'quote_id', v_id,
    'plan_code', p_plan_code, 'billing_interval', p_billing_interval,
    'catalog_amount_minor', v_catalogo, 'catalog_currency', v_rev.currency,
    'charge_currency', v_moneda, 'fx_rate_micros', (v_fx->>'rate_micros')::bigint,
    'base_amount', v_base,
    'service_class', v_clase,
    'tax_rate_basis_points', (v_imp->>'rate_basis_points')::integer,
    'tax_amount', v_iva,
    'total_amount', v_base + v_iva,
    'expires_at', now() + interval '30 minutes');
end;
$$;

revoke all on function public.billing_create_quote(uuid, text, text) from public, anon;
grant execute on function public.billing_create_quote(uuid, text, text) to authenticated;

comment on function public.billing_create_quote(uuid, text, text) is
  'PE-05B1 · La ÚNICA autoridad del importe. El navegador manda intenciones —plan e intervalo—; aquí se resuelven revisión, precio, tipo de cambio, clase de servicio, regla fiscal, impuesto y total, y se congelan. Sin tipo de cambio o sin regla fiscal vigentes, NO se cobra.';

-- ---------------------------------------------------------------------------
-- 10 · DEL PAGO AL DERECHO
-- ---------------------------------------------------------------------------
-- Aplica el nivel pagado de la empresa a UN módulo. Se usa al activar —para
-- cada módulo habilitado— y cuando un módulo se habilita más tarde.
create or replace function public.billing_apply_tier_to_module(
  p_organization_id uuid,
  p_module_code text
)
returns boolean
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_sub record;
  v_mod record;
begin
  select m.code, m.is_functional, m.code is not null as existe into v_mod
    from public.modules m where m.code = p_module_code;
  -- Pagar NO concede acceso a un módulo: son ejes distintos. Y `core` jamás
  -- recibe plan comercial.
  if v_mod.code is null or not coalesce(v_mod.is_functional, false) then
    return false;
  end if;
  if not exists (
    select 1 from public.organization_modules om
     where om.organization_id = p_organization_id
       and om.module_code = p_module_code and om.enabled
  ) then
    return false;
  end if;

  select plan_revision_id into v_sub
    from public.billing_subscriptions
   where organization_id = p_organization_id
     and status in ('active', 'past_due', 'cancel_at_period_end')
   order by created_at desc limit 1;
  if v_sub.plan_revision_id is null then
    return false;
  end if;

  perform public.commercial_apply_assignment(
    p_organization_id, v_sub.plan_revision_id, 'module', p_module_code,
    'sold', 'checkout', now(), null,
    'Nivel contratado por la empresa aplicado a este módulo.', null);
  return true;
end;
$$;

revoke all on function public.billing_apply_tier_to_module(uuid, text) from public, anon;
grant execute on function public.billing_apply_tier_to_module(uuid, text) to authenticated;

-- Un módulo que se habilita DESPUÉS hereda el nivel pagado, sin comprar otra
-- vez y sin una segunda suscripción.
--
-- El cuerpo original de `commercial_provision_new_module` (0163) se traslada
-- LITERAL a `commercial_provision_module_base` —copiado de su definición
-- vigente, no reescrito de memoria: parafrasear una función ajena es cómo se
-- rompió la creación de empresas en 0163— y la de arriba pasa a llamarla y a
-- añadir la herencia.

create or replace function public.commercial_provision_module_base(p_organization_id uuid, p_module_code text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pol      record;
  v_rev_free uuid;
  v_rev_pru  uuid;
  v_ya       boolean;
  v_prueba   boolean := false;
begin
  select coalesce(bool_or(m.is_functional), false) into v_ya
    from modules m where m.code = p_module_code;
  if not v_ya then
    return jsonb_build_object('skipped', 'not_functional');
  end if;

  select id into v_rev_free from plan_revisions
   where plan_code = 'free' and status = 'published' and effective_to is null;
  if v_rev_free is null then
    raise exception 'No hay revisión vigente de Free.';
  end if;

  -- La base Free, permanente.
  insert into organization_plan_assignments (
    organization_id, plan_revision_id, scope, module_code,
    grant_kind, source, assigned_by, reason)
  select p_organization_id, v_rev_free, 'module', p_module_code,
         'base', 'seed', p_actor, 'Base Free permanente.'
   where not exists (
     select 1 from organization_plan_assignments a
      where a.organization_id = p_organization_id and a.scope = 'module'
        and a.module_code = p_module_code and a.grant_kind = 'base');

  -- La prueba, si la política la ofrece y este módulo no la ha consumido ya.
  select * into v_pol from commercial_trial_policy where id;
  if v_pol.enabled then
    select exists (
      select 1 from organization_plan_assignments a
       where a.organization_id = p_organization_id and a.scope = 'module'
         and a.module_code = p_module_code and a.grant_kind = 'trial'
    ) into v_ya;

    if not v_ya then
      select id into v_rev_pru from plan_revisions
       where plan_code = v_pol.trial_plan_code and status = 'published'
         and effective_to is null;
      if v_rev_pru is not null then
        insert into organization_plan_assignments (
          organization_id, plan_revision_id, scope, module_code,
          grant_kind, source, assigned_by, ends_at, reason)
        values (p_organization_id, v_rev_pru, 'module', p_module_code,
                'trial', 'trial', p_actor,
                now() + make_interval(hours => v_pol.trial_duration_hours),
                'Prueba introductoria de ' || v_pol.trial_duration_hours || ' horas.');
        v_prueba := true;
      end if;
    end if;
  end if;

  return jsonb_build_object('base', true, 'trial', v_prueba);
end;
$function$

;

revoke all on function public.commercial_provision_module_base(uuid, text, uuid) from public, anon;


create or replace function public.commercial_provision_new_module(
  p_organization_id uuid,
  p_module_code text,
  p_actor uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_res jsonb;
  v_heredado boolean;
begin
  v_res := public.commercial_provision_module_base(p_organization_id, p_module_code, p_actor);
  -- PE-05B1 · Si la empresa ya paga, el módulo nuevo hereda su nivel.
  v_heredado := public.billing_apply_tier_to_module(p_organization_id, p_module_code);
  return v_res || jsonb_build_object('inherited_paid_tier', v_heredado);
end;
$$;

-- ---------------------------------------------------------------------------
-- 11 · LIQUIDAR UN PAGO
-- ---------------------------------------------------------------------------
-- Aquí el dinero se convierte en derecho, y por eso NO se concede a
-- `authenticated`: la llama el servidor cuando el proveedor ha confirmado.
-- Volver del checkout con `?success=true` no llega hasta aquí, y ese es el
-- punto: activar por el parámetro de una URL sería regalar el producto a quien
-- sepa escribir esa URL.
--
-- En B2 la llamará el manejador de webhooks, después de verificar la firma.
create or replace function public.billing_settle_payment(
  p_quote_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_outcome text,
  p_idempotency_key text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
volatile
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
begin
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, 'null');
  end if;

  select * into v_q from public.billing_quotes where id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_q.organization_id::text, 0));

  -- IDEMPOTENCIA. Un proveedor reintenta por diseño: el mismo pago no puede
  -- crear dos cobros ni conceder el plan dos veces.
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
  -- Un presupuesto caducado no se cobra: su precio y su tipo de cambio son de
  -- otro momento.
  if v_q.expires_at <= now() then
    update public.billing_quotes set status = 'expired' where id = v_q.id;
    raise exception 'QUOTE_EXPIRED';
  end if;

  -- El pago se registra SIEMPRE, salga como salga: un intento fallido también
  -- es historia financiera, y es lo que explica un reclamo.
  insert into public.billing_payments (
    organization_id, quote_id, provider, provider_payment_id,
    base_amount, discount_amount,
    service_class, tax_rule_id, tax_rate_basis_points, tax_amount,
    total_amount, currency, fx_rate_micros,
    status, paid_at, failed_at, failure_reason, idempotency_key)
  values (
    v_q.organization_id, v_q.id, p_provider, p_provider_payment_id,
    v_q.base_amount, v_q.discount_amount,
    v_q.service_class, v_q.tax_rule_id, v_q.tax_rate_basis_points, v_q.tax_amount,
    v_q.total_amount, v_q.charge_currency, v_q.fx_rate_micros,
    case p_outcome when 'approved' then 'approved' when 'declined' then 'declined' else 'failed' end,
    case when p_outcome = 'approved' then now() end,
    case when p_outcome <> 'approved' then now() end,
    p_failure_reason, p_idempotency_key)
  returning id into v_pago;

  if p_outcome <> 'approved' then
    -- El presupuesto sigue abierto hasta caducar: el cliente puede reintentar
    -- con otra tarjeta sin volver a empezar.
    return jsonb_build_object('payment_id', v_pago, 'status', p_outcome,
                              'subscription_id', null, 'already_settled', false);
  end if;

  insert into public.billing_subscriptions (
    organization_id, provider, plan_code, plan_revision_id, billing_interval,
    catalog_amount_minor, catalog_currency,
    base_charge_amount, charge_currency, fx_rate_id, fx_rate_micros,
    status, current_period_start, current_period_end, renews_at, created_by)
  values (
    v_q.organization_id, p_provider, v_q.plan_code, v_q.plan_revision_id, v_q.billing_interval,
    v_q.catalog_amount_minor, v_q.catalog_currency,
    -- Se congela la BASE, no el total con IVA dentro: si se congelara el total,
    -- una futura exención obligaría a cancelar y recontratar para quitarlo.
    v_q.base_amount, v_q.charge_currency, v_q.fx_rate_id, v_q.fx_rate_micros,
    'active', now(),
    now() + case v_q.billing_interval when 'monthly' then interval '1 month'
                                      else interval '1 year' end,
    now() + case v_q.billing_interval when 'monthly' then interval '1 month'
                                      else interval '1 year' end,
    v_q.created_by)
  returning id into v_sub;

  update public.billing_payments set subscription_id = v_sub where id = v_pago;
  update public.billing_quotes
     set status = 'consumed', consumed_at = now(), subscription_id = v_sub
   where id = v_q.id;

  -- EL DERECHO. Se aplica a cada módulo funcional HABILITADO: pagar no concede
  -- acceso a módulos que la empresa no tiene, y el nivel es de empresa.
  for v_mod in
    select om.module_code
      from public.organization_modules om
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

  return jsonb_build_object(
    'payment_id', v_pago, 'status', 'approved', 'subscription_id', v_sub,
    'modules_granted', v_aplicados, 'already_settled', false);
end;
$$;

-- NO se concede a `authenticated`: esto lo llama el servidor tras verificar con
-- el proveedor, nunca el navegador.
revoke all on function public.billing_settle_payment(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_settle_payment(uuid, text, text, text, text, text)
  to service_role;

comment on function public.billing_settle_payment(uuid, text, text, text, text, text) is
  'PE-05B1 · Donde el dinero se convierte en derecho. Registra el pago —salga como salga—, y solo si fue aprobado crea la suscripción y aplica el nivel a cada módulo funcional habilitado. Idempotente por identificador del proveedor. NO se concede a `authenticated`: volver del checkout no llega hasta aquí.';

-- ---------------------------------------------------------------------------
-- 12 · LO QUE LA EMPRESA VE DE SU FACTURACIÓN
-- ---------------------------------------------------------------------------
create or replace function public.organization_billing_state(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_s public.billing_subscriptions%rowtype;
  v_p public.billing_payments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not (public.is_org_member(p_organization_id) or public.is_platform_staff()) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into v_s from public.billing_subscriptions
   where organization_id = p_organization_id
     and status in ('pending', 'active', 'past_due', 'cancel_at_period_end')
   order by created_at desc limit 1;

  select * into v_p from public.billing_payments
   where organization_id = p_organization_id
   order by created_at desc limit 1;

  if v_s.id is null then
    -- Sin suscripción NO se dice «pago fallido» ni «plan cancelado»: es que no
    -- hay ninguna, que es el estado normal de una empresa en Free.
    return jsonb_build_object('has_subscription', false,
                              'last_payment_status', v_p.status);
  end if;

  return jsonb_build_object(
    'has_subscription', true,
    'subscription_id', v_s.id,
    'plan_code', v_s.plan_code,
    'billing_interval', v_s.billing_interval,
    'status', v_s.status,
    'base_charge_amount', v_s.base_charge_amount,
    'charge_currency', v_s.charge_currency,
    'current_period_end', v_s.current_period_end,
    'renews_at', v_s.renews_at,
    'cancel_at_period_end', v_s.cancel_at_period_end,
    'grace_until', v_s.grace_until,
    'last_payment_status', v_p.status,
    'last_payment_at', v_p.paid_at);
end;
$$;

revoke all on function public.organization_billing_state(uuid) from public, anon;
grant execute on function public.organization_billing_state(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 13 · LO HEREDADO SIGUE SIN MANDAR
-- ---------------------------------------------------------------------------
comment on table public.organization_subscriptions is
  'LEGACY · Sin autoridad desde PE-04B2 y tampoco desde PE-05. La suscripción de pago vive en `billing_subscriptions`, y el derecho comercial en `organization_plan_assignments`. Esta tabla se conserva por historia; ningún camino de facturación la lee ni la escribe.';
