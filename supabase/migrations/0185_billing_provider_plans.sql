-- ===========================================================================
-- Trazaloop · MP-PROD-ARCH-01 · Los planes que existen en el proveedor
-- ===========================================================================
--
-- QUÉ ES ESTO, Y QUÉ NO ES
--
-- Mercado Pago necesita que un plan recurrente exista DE SU LADO —un
-- `preapproval_plan`— para poder mandar a alguien a contratarlo. Esta tabla
-- registra esa proyección: «la revisión X de Full, mensual, en pruebas, se
-- llama así allí».
--
-- NO es fuente de verdad comercial. El precio, el impuesto, el tipo de cambio y
-- el derecho siguen viviendo donde ya vivían: en la revisión del plan, en el
-- presupuesto y en las asignaciones. Si esta tabla desapareciera, no se
-- perdería ni una condición comercial — solo la capacidad de abrir un checkout.
--
-- POR QUÉ NO GUARDA `fx_rate_id` NI `tax_rule_id`
--
-- Porque el presupuesto ya los congela, y repetirlos aquí crearía dos sitios
-- donde mirar y uno donde equivocarse. Dicho con precisión, y corrigiendo una
-- afirmación mía anterior: esto NO significa que el tipo de cambio con el que
-- nació una proyección se pueda reconstruir siempre a partir de `created_at`.
-- Se puede en el caso normal, pero no es una garantía del modelo. Lo que el
-- modelo sí garantiza es más importante y más estrecho: `charge_amount` deja
-- constancia de con qué importe se creó el objeto en el proveedor, y el
-- checkout compara contra él antes de mandar a nadie a pagar.
--
-- LA RELACIÓN CON 0184
--
-- 0184 estableció de quién es la recurrencia. Esto solo tiene sentido para los
-- proveedores cuya recurrencia es SUYA: Wompi no tiene planes que proyectar, y
-- el resolutor empieza por ahí en vez de adivinar por el nombre.
-- ===========================================================================

do $$
begin
  if to_regclass('public.billing_provider_capabilities') is null
     or to_regclass('public.billing_quotes') is null
     or to_regclass('public.plan_revisions') is null then
    raise exception '0185 presupone 0162, 0169 y 0184';
  end if;
  raise notice '0185 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · LA PROYECCIÓN
-- ---------------------------------------------------------------------------
create table if not exists public.billing_provider_plans (
  id                uuid primary key default gen_random_uuid(),
  provider          text not null,
  -- Los mismos dos valores que ya usa `billing_checkout_intents`: un objeto de
  -- pruebas y uno de producción no se parecen en nada y no deben cruzarse.
  environment       text not null
    constraint billing_provider_plans_environment_check
      check (environment in ('test', 'live')),
  plan_revision_id  uuid not null references public.plan_revisions (id),
  billing_interval  text not null
    constraint billing_provider_plans_interval_check
      check (billing_interval in ('monthly', 'annual')),
  -- El identificador DEL PROVEEDOR. Es el único dato de esta tabla que no
  -- nace en Trazaloop.
  provider_plan_id  text not null
    constraint billing_provider_plans_provider_plan_id_check
      check (length(btrim(provider_plan_id)) between 8 and 128),
  charge_currency   text not null
    constraint billing_provider_plans_currency_check
      check (charge_currency = upper(charge_currency) and length(charge_currency) = 3),
  -- Con qué importe se creó el objeto ALLÍ. No es el precio: es lo que el
  -- proveedor va a cobrar, y contra eso se compara el presupuesto.
  charge_amount     bigint not null
    constraint billing_provider_plans_amount_check check (charge_amount > 0),
  status            text not null default 'active'
    constraint billing_provider_plans_status_check
      check (status in ('active', 'retired')),
  effective_from    timestamptz not null default now(),
  effective_to      timestamptz,
  created_by        uuid references public.profiles (id),
  created_at        timestamptz not null default now(),
  constraint billing_provider_plans_period_check
    check (effective_to is null or effective_to >= effective_from)
);

comment on table public.billing_provider_plans is
  'Proyección operativa de un plan comercial de Trazaloop en un proveedor '
  'externo. NO es fuente de verdad comercial: solo dice cómo se llama allí.';

-- Un objeto del proveedor se registra UNA vez por proveedor y entorno. No se
-- asume que un identificador de sandbox no pueda repetirse en producción: son
-- espacios distintos y el proveedor no promete lo contrario.
create unique index if not exists billing_provider_plans_external_uniq
  on public.billing_provider_plans (provider, environment, provider_plan_id);

-- Y una sola proyección VIGENTE por combinación. Históricas, las que hagan
-- falta: son las que sostienen a las suscripciones que nacieron con ellas.
create unique index if not exists billing_provider_plans_vigente_uniq
  on public.billing_provider_plans (provider, environment, plan_revision_id, billing_interval)
  where status = 'active' and effective_to is null;

create index if not exists billing_provider_plans_resolucion_idx
  on public.billing_provider_plans (provider, environment, plan_revision_id, billing_interval)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 2 · EL VÍNCULO HISTÓRICO DE LA SUSCRIPCIÓN
-- ---------------------------------------------------------------------------
--
-- Nullable y sin valor por omisión: Wompi no tiene proyección, y ninguna fila
-- existente se reescribe. Producción tiene inquilinos reales desde el 7 de
-- septiembre, así que una columna que tocara filas existentes no es aceptable.
--
-- Se guarda la CLAVE INTERNA, no el identificador del proveedor: así el vínculo
-- sobrevive a que la proyección se retire para nuevas ventas, y no hay que
-- volver a buscarla por un texto que puede repetirse entre entornos.
alter table public.billing_subscriptions
  add column if not exists billing_provider_plan_id uuid
    references public.billing_provider_plans (id);

comment on column public.billing_subscriptions.billing_provider_plan_id is
  'Con qué proyección nació esta suscripción. Se congela: retirar el plan para '
  'nuevas ventas no cambia el de quien ya lo contrató.';

-- ---------------------------------------------------------------------------
-- 3 · LA IDENTIDAD ECONÓMICA ES INMUTABLE DESDE QUE LA FILA EXISTE
-- ---------------------------------------------------------------------------
--
-- La primera versión de esta regla ataba la inmutabilidad a que hubiera una
-- suscripción vinculada. Era insuficiente, y la ventana lo explica:
--
--   presupuesto → se resuelve la proyección → se entrega el init_point
--   → la persona autoriza en el proveedor → aparece la suscripción
--
-- Entre el tercer paso y el quinto pueden pasar minutos u horas, y durante todo
-- ese rato la proyección YA ESTÁ EN USO —hay alguien mirando una pantalla de
-- pago que salió de ella— sin que exista todavía ninguna fila en
-- `billing_subscriptions`. Cambiarle el importe en esa ventana significaría que
-- quien autorice acaba pagando algo distinto de lo que se le enseñó.
--
-- Así que la regla es más simple y más dura: desde que la fila existe, lo único
-- que puede cambiar es su CICLO DE VIDA. Ni el importe, ni la moneda, ni el
-- intervalo, ni a qué revisión pertenece, ni el identificador del proveedor, ni
-- el entorno, ni cuándo empezó a regir. Corregir un error se hace retirando y
-- registrando otra: dos filas, y la historia legible.
--
-- Se comprueba por diferencia y no enumerando lo prohibido: así, si mañana
-- alguien añade una columna, nace protegida en vez de nacer olvidada.
create or replace function public.billing_provider_plan_is_append_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'BILLING_PROVIDER_PLAN_IS_NOT_DELETABLE'
      using hint = 'Una proyección se retira cerrando su vigencia; borrarla '
                || 'dejaría huérfana a la suscripción que nació con ella.';
  end if;

  -- Lo ÚNICO que puede moverse. La lista no se amplía por comodidad.
  if to_jsonb(new) - 'status' - 'effective_to'
     is distinct from
     to_jsonb(old) - 'status' - 'effective_to' then
    raise exception 'BILLING_PROVIDER_PLAN_ECONOMIC_IDENTITY_IS_FROZEN'
      using detail = old.id::text,
            hint = 'Desde que existe, una proyección solo cambia de estado o '
                || 'de vigencia. Para corregir condiciones se retira esta y se '
                || 'registra otra.';
  end if;

  -- Y una vigencia cerrada no se reabre: la historia se añade, no se corrige.
  if old.effective_to is not null and new.effective_to is null then
    raise exception 'BILLING_PROVIDER_PLAN_PERIOD_IS_CLOSED' using detail = old.id::text;
  end if;

  return new;
end $$;

drop trigger if exists billing_provider_plan_is_append_only_trg
  on public.billing_provider_plans;
create trigger billing_provider_plan_is_append_only_trg
  before update or delete on public.billing_provider_plans
  for each row execute function public.billing_provider_plan_is_append_only();

-- ---------------------------------------------------------------------------
-- 4 · PRIVILEGIOS · LA LECCIÓN DE 0184
-- ---------------------------------------------------------------------------
--
-- La RLS no protege de `service_role`, y Postgres le concede por omisión todo
-- sobre las tablas nuevas. En 0184 comprobé ejecutándolo que eso permitía
-- deshacer la protección desde cualquier código de servidor. Aquí se revoca el
-- DML —y también el SELECT directo— a los tres roles de ejecución: se entra por
-- las primitivas gobernadas, que validan antes de escribir.
alter table public.billing_provider_plans enable row level security;

revoke all on public.billing_provider_plans from anon, authenticated, service_role;

-- Sin política de lectura: ni un inquilino ni la plataforma leen la tabla
-- directamente. La observación va por la vista de más abajo.

-- ---------------------------------------------------------------------------
-- 5 · EL CAMINO DE ESCRITURA, GOBERNADO
-- ---------------------------------------------------------------------------
--
-- Ni DML libre para el runtime, ni una migración por cada plan que se cree. Dos
-- primitivas estrechas que validan lo que una migración no podría validar sola:
-- que el proveedor exista, que su recurrencia sea SUYA, y que la revisión del
-- plan esté publicada.
create or replace function public.billing_register_provider_plan(
  p_provider          text,
  p_environment       text,
  p_plan_revision_id  uuid,
  p_billing_interval  text,
  p_provider_plan_id  text,
  p_charge_currency   text,
  p_charge_amount     bigint,
  p_created_by        uuid default null
)
returns uuid
language plpgsql
-- `security definer` es NECESARIO: los roles de ejecución no tienen DML sobre
-- la tabla, y ese es justamente el punto.
security definer
set search_path to 'public'
as $$
declare v_id uuid;
begin
  if public.billing_renewal_owner(p_provider) <> 'provider' then
    raise exception 'PROVIDER_DOES_NOT_OWN_RECURRENCE'
      using detail = p_provider,
            hint = 'Solo los proveedores que llevan su propia recurrencia '
                || 'tienen planes que proyectar. Wompi no.';
  end if;
  if p_environment not in ('test', 'live') then
    raise exception 'ENVIRONMENT_INVALID' using detail = p_environment;
  end if;
  if p_billing_interval not in ('monthly', 'annual') then
    raise exception 'BILLING_INTERVAL_INVALID' using detail = p_billing_interval;
  end if;
  if not exists (select 1 from public.plan_revisions r
                  where r.id = p_plan_revision_id and r.status = 'published') then
    raise exception 'PLAN_REVISION_NOT_PUBLISHED' using detail = p_plan_revision_id::text;
  end if;
  if p_charge_amount is null or p_charge_amount <= 0 then
    raise exception 'CHARGE_AMOUNT_INVALID';
  end if;

  -- Abrir una proyección CIERRA la anterior. Dos vigentes a la vez dejarían
  -- «cuál rige hoy» en manos de un orden de lectura.
  update public.billing_provider_plans
     set status = 'retired', effective_to = now()
   where provider = p_provider and environment = p_environment
     and plan_revision_id = p_plan_revision_id
     and billing_interval = p_billing_interval
     and status = 'active' and effective_to is null;

  insert into public.billing_provider_plans (
    provider, environment, plan_revision_id, billing_interval,
    provider_plan_id, charge_currency, charge_amount, created_by)
  values (p_provider, p_environment, p_plan_revision_id, p_billing_interval,
          btrim(p_provider_plan_id), upper(p_charge_currency), p_charge_amount,
          p_created_by)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.billing_register_provider_plan(
  text, text, uuid, text, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.billing_register_provider_plan(
  text, text, uuid, text, text, text, bigint, uuid) to service_role;

create or replace function public.billing_retire_provider_plan(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_filas integer;
begin
  update public.billing_provider_plans
     set status = 'retired', effective_to = coalesce(effective_to, now())
   where id = p_id and status = 'active';
  get diagnostics v_filas = row_count;
  return v_filas > 0;
end $$;

revoke all on function public.billing_retire_provider_plan(uuid)
  from public, anon, authenticated;
grant execute on function public.billing_retire_provider_plan(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6 · LA RESOLUCIÓN
-- ---------------------------------------------------------------------------
--
-- Entra un PRESUPUESTO, no un plan. Esa es toda la frontera: el navegador manda
-- una intención —qué plan y cada cuánto—, el servidor presupuesta, y la
-- resolución sale de ese presupuesto. Ni el importe, ni la moneda, ni el
-- intervalo, ni el identificador del proveedor pueden llegar de fuera.
--
-- Y vive en SQL, no en TypeScript, por una razón concreta: la comprobación de
-- que el importe del presupuesto coincide con el del objeto creado en el
-- proveedor tiene que ocurrir donde vive el presupuesto, en una sola lectura
-- coherente. Hacerlo fuera sería leer dos cosas y compararlas sin transacción.
--
-- `p_environment` lo pone el SERVIDOR desde la configuración del despliegue,
-- nunca el cuerpo de la petición. Aquí solo se valida su forma.
create or replace function public.billing_resolve_provider_plan(
  p_quote_id     uuid,
  p_environment  text
)
returns table (
  provider_plan_row_id uuid,
  provider             text,
  provider_plan_id     text,
  charge_currency      text,
  charge_amount        bigint,
  billing_interval     text,
  plan_revision_id     uuid
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  q record;
  p record;
  v_provider text;
begin
  if p_environment not in ('test', 'live') then
    raise exception 'ENVIRONMENT_INVALID' using detail = coalesce(p_environment, '(nulo)');
  end if;

  select r.plan_revision_id, r.billing_interval, r.charge_currency, r.total_amount,
         r.organization_id, r.status, r.expires_at
    into q
    from public.billing_quotes r
   where r.id = p_quote_id;
  if q is null then raise exception 'QUOTE_NOT_FOUND'; end if;

  -- Mercado Pago es hoy el único proveedor cuya recurrencia es suya. Se pregunta
  -- al catálogo de 0184 en vez de escribir el nombre aquí: si mañana hay otro,
  -- esta función no cambia.
  select c.provider into v_provider
    from public.billing_provider_capabilities c
   where c.renewal_owner = 'provider'
   limit 1;
  if v_provider is null then
    raise exception 'NO_PROVIDER_OWNS_RECURRENCE';
  end if;

  select * into p
    from public.billing_provider_plans pp
   where pp.provider = v_provider
     and pp.environment = p_environment
     and pp.plan_revision_id = q.plan_revision_id
     and pp.billing_interval = q.billing_interval
     and pp.status = 'active' and pp.effective_to is null;

  if p is null then
    raise exception 'PROVIDER_PLAN_NOT_AVAILABLE'
      using detail = format('%s · %s · %s', v_provider, q.billing_interval, p_environment),
            hint = 'No hay proyección vigente para esta oferta en este entorno. '
                || 'Contratar falla cerrado en vez de mandar a nadie a una '
                || 'pasarela con condiciones que no son las suyas.';
  end if;

  if p.charge_currency is distinct from q.charge_currency then
    raise exception 'PROVIDER_PLAN_CURRENCY_MISMATCH'
      using detail = format('presupuesto %s · proyección %s', q.charge_currency, p.charge_currency);
  end if;

  -- La comprobación que justifica guardar `charge_amount`: si el presupuesto de
  -- hoy no vale lo mismo que el objeto creado en el proveedor, alguien cambió
  -- una condición sin registrar una proyección nueva. Parar aquí es barato.
  if p.charge_amount is distinct from q.total_amount then
    raise exception 'PROVIDER_PLAN_AMOUNT_MISMATCH'
      using detail = format('presupuesto %s · proyección %s', q.total_amount, p.charge_amount);
  end if;

  return query select p.id, p.provider, p.provider_plan_id, p.charge_currency,
                      p.charge_amount, p.billing_interval, p.plan_revision_id;
end $$;

revoke all on function public.billing_resolve_provider_plan(uuid, text)
  from public, anon, authenticated;
grant execute on function public.billing_resolve_provider_plan(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7 · LA OBSERVACIÓN
-- ---------------------------------------------------------------------------
--
-- La tabla no se lee directamente desde ningún rol de ejecución. Para que la
-- administración de plataforma pueda ver qué hay proyectado, una vista que
-- filtra por dentro — y con los privilegios revocados a mano, porque una vista
-- simple sobre una tabla es auto-actualizable y hereda insert/update/delete.
create or replace view public.v_billing_provider_plans as
  select pp.id, pp.provider, pp.environment, pp.plan_revision_id,
         r.plan_code, r.revision_number,
         pp.billing_interval, pp.provider_plan_id,
         pp.charge_currency, pp.charge_amount,
         pp.status, pp.effective_from, pp.effective_to, pp.created_at,
         (select count(*) from public.billing_subscriptions s
           where s.billing_provider_plan_id = pp.id) as suscripciones_vinculadas
    from public.billing_provider_plans pp
    join public.plan_revisions r on r.id = pp.plan_revision_id
   where public.is_platform_staff();

comment on view public.v_billing_provider_plans is
  'Lo proyectado en cada proveedor, para la administración de plataforma.';

revoke all on public.v_billing_provider_plans from anon, authenticated, service_role;
grant select on public.v_billing_provider_plans to authenticated, service_role;
