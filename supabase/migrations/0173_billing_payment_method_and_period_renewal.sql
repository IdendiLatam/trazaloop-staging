-- ===========================================================================
-- Trazaloop · 0173 · El medio de pago no es una suscripción del proveedor
-- ===========================================================================
--
-- LO QUE SE VIO
--
-- La prueba real de renovación de W3.1 se paró antes de mover dinero:
--
--   duplicate key value violates unique constraint "bci_provider_subscription_uniq"
--   Key (provider, provider_subscription_id) = (wompi, 371065) already exists.
--
-- El índice de 0171 es CORRECTO para una pasarela que gestiona la recurrencia:
-- allí una suscripción del proveedor nace de una contratación y de una sola, y
-- dos intentos apuntando a la misma serían un error de verdad.
--
-- Pero con una pasarela donde la recurrencia la programa el comercio no hay
-- suscripción en la pasarela. Lo que se guarda es un MEDIO DE PAGO —una
-- tarjeta tokenizada al otro lado—, y ese medio de pago es, por definición, el
-- mismo para todos los cobros: la contratación, la renovación de octubre, la
-- de noviembre y el reintento de la que salió rechazada.
--
-- Las dos cosas compartían columna. Con esa unicidad, el SEGUNDO cobro contra
-- la misma tarjeta era imposible: la renovación estaba rota a partir del
-- segundo mes, y no solo en las pruebas.
--
-- LA SEPARACIÓN
--
--   suscripción del proveedor   la pasarela cobra sola          1 ↔ 1 con la
--                                                               contratación
--   medio de pago               el comercio cobra cuando toca   1 ↔ N con los
--                                                               intentos
--
-- Aquí nace lo segundo. Lo primero NO se toca: su unicidad sigue en pie, y
-- quien la necesita sigue teniéndola.
--
-- Y LA SEGUNDA VERDAD DEL CALENDARIO
--
-- `billing_record_renewal_payment` seguía corriendo el periodo con
-- `now() + intervalo`: es el defecto original de W3, intacto. 0172 construyó
-- el periodo como objeto, pero dejó vivo un segundo camino que calculaba
-- fechas a partir de la hora del cobro. Aquí deja de calcular: localiza la
-- obligación canónica y la salda por el mismo sitio que todo lo demás.
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No programa nada. No reescribe la historia de QA que guardó el medio de pago
-- en la columna equivocada —es la evidencia del modelo anterior—. No añade
-- ninguna columna con nombre de pasarela. Y no guarda ni un dígito de tarjeta.
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
  if to_regclass('public.billing_subscription_periods') is null
     or to_regprocedure('public.billing_settle_period_payment(uuid, text, text, text, bigint, text, boolean)') is null then
    raise exception '0173 presupone 0172';
  end if;
  raise notice '0173 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · EL MEDIO DE PAGO · reutilizable, de la empresa, y sin un solo dígito
-- ---------------------------------------------------------------------------
-- Qué es: una referencia DURADERA a un instrumento que vive en el proveedor y
-- que puede financiar cobros futuros.
--
-- Qué NO es: una suscripción del proveedor, una suscripción comercial, un
-- intento de cobro, ni —sobre todo— una tarjeta. Aquí no entra el número, ni
-- el código de seguridad, ni el testigo en bruto de la tokenización, ni nada
-- del contrato de aceptación. Solo el identificador que el proveedor emitió y
-- que es seguro guardar.
create table if not exists public.billing_payment_methods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  provider text not null,
  -- El identificador duradero del instrumento AL OTRO LADO. Es lo único que se
  -- guarda del medio de pago, y es seguro: no permite cobrar sin las
  -- credenciales privadas del comercio.
  provider_payment_method_id text not null,
  -- Con qué credenciales se creó. Un instrumento de pruebas no puede financiar
  -- un cobro real ni al revés: la misma regla que ya rige los intentos.
  environment text not null,
  status text not null default 'active',
  revoked_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bpm_environment_check check (environment in ('test', 'live')),
  constraint bpm_status_check check (status in ('active', 'revoked')),
  constraint bpm_revoked_shape check ((status = 'revoked') = (revoked_at is not null)),
  constraint bpm_reference_shape check (length(trim(provider_payment_method_id)) > 0)
);

-- LA INVARIANTE, y por qué es esa.
--
-- El identificador que emite el proveedor es único DENTRO de la cuenta de
-- comercio y DENTRO de su entorno: el número 371065 de pruebas y el 371065 de
-- producción son instrumentos distintos, de espacios distintos, y confundirlos
-- sería cobrarle a alguien con la tarjeta de otro. Por eso la unicidad lleva
-- el entorno dentro.
--
-- Lo que impide, que es lo que importa: que un mismo instrumento del proveedor
-- quede atado en silencio a DOS empresas.
create unique index if not exists bpm_provider_reference_uniq
  on public.billing_payment_methods (provider, environment, provider_payment_method_id);
create index if not exists bpm_org_idx
  on public.billing_payment_methods (organization_id, status);

alter table public.billing_payment_methods enable row level security;

-- El administrador de la empresa ve SUS medios de pago. Nadie escribe desde
-- fuera: las filas solo las mueven funciones `security definer`.
drop policy if exists billing_payment_methods_read on public.billing_payment_methods;
create policy billing_payment_methods_read on public.billing_payment_methods
  for select to authenticated
  using (public.is_org_admin(organization_id) or public.is_platform_staff());

revoke all on public.billing_payment_methods from anon;
revoke insert, update, delete, truncate on public.billing_payment_methods from authenticated, anon;
grant select on public.billing_payment_methods to authenticated;

comment on table public.billing_payment_methods is
  'PE-05B2W3.2 · Referencia DURADERA a un instrumento que vive en el proveedor y puede financiar cobros futuros. No es una suscripcion del proveedor, ni un intento, ni una tarjeta: aqui no entra ni un digito del numero, ni el codigo de seguridad, ni el testigo en bruto.';
comment on column public.billing_payment_methods.provider_payment_method_id is
  'PE-05B2W3.2 · El identificador que emitio el proveedor. Unico por (proveedor, entorno): el 371065 de pruebas y el de produccion son instrumentos distintos. Guardarlo es seguro; sin las credenciales privadas del comercio no cobra nada.';
comment on column public.billing_payment_methods.environment is
  'PE-05B2W3.2 · Un instrumento de pruebas no financia un cobro real ni al reves. Falla cerrado, igual que en los intentos.';

-- ---------------------------------------------------------------------------
-- 2 · EL INTENTO PUEDE APUNTAR A UN MEDIO DE PAGO REUTILIZABLE
-- ---------------------------------------------------------------------------
-- MUCHOS a UNO, a propósito: es justo lo que el índice viejo hacía imposible.
alter table public.billing_checkout_intents
  add column if not exists payment_method_id uuid references public.billing_payment_methods (id);
create index if not exists bci_payment_method_idx
  on public.billing_checkout_intents (payment_method_id) where payment_method_id is not null;

comment on column public.billing_checkout_intents.payment_method_id is
  'PE-05B2W3.2 · Con que instrumento reutilizable se pretende cobrar este intento. MUCHOS intentos comparten UNO: la contratacion, cada renovacion y cada reintento. `provider_subscription_id` sigue siendo otra cosa y conserva su unicidad.';

comment on column public.billing_checkout_intents.provider_subscription_id is
  'PE-05B2 · El objeto RECURRENTE que gestiona la pasarela, cuando la gestiona ella. Unico por (proveedor, id). NO es un medio de pago: para eso esta `payment_method_id`. Las filas anteriores a 0173 de la pasarela programada por el comercio guardaron aqui su medio de pago; se conservan como estan porque son la evidencia del modelo anterior.';

-- ---------------------------------------------------------------------------
-- 3 · UN SOLO COBRO EN VUELO POR OBLIGACIÓN
-- ---------------------------------------------------------------------------
-- Dos trabajadores despertando a la vez no pueden mandar dos cobros por el
-- mismo mes. Y cuando la red se queda a medias —el proveedor no contestó— lo
-- que toca es RECONCILIAR ese intento, no abrir otro: el dinero puede haberse
-- movido ya.
--
-- Un reintento legítimo sigue siendo posible, y esa es la otra mitad: en
-- cuanto el intento anterior llega a un estado terminal —rechazado, fallido,
-- caducado, cancelado— deja de ocupar el sitio.
--
-- Antes de poner la regla, se reconcilia lo que ya hubiera: si un periodo
-- arrastra varios intentos en vuelo, se conserva el más antiguo y los demás
-- se marcan caducados. No se borra ninguno.
do $$
declare v_caducados integer;
begin
  with duplicados as (
    select id, row_number() over (partition by period_id order by created_at, id) as n
      from public.billing_checkout_intents
     where period_id is not null
       and status in ('created', 'provider_created', 'authorized')
  )
  update public.billing_checkout_intents i
     set status = 'expired', updated_at = now(),
         failure_reason = coalesce(i.failure_reason,
           '0173 · intento en vuelo duplicado para la misma obligación; se conservó el más antiguo.')
    from duplicados d
   where d.id = i.id and d.n > 1;
  get diagnostics v_caducados = row_count;
  raise notice '0173 · intentos en vuelo duplicados reconciliados: %', v_caducados;
end $$;

create unique index if not exists bci_period_inflight_uniq
  on public.billing_checkout_intents (period_id)
  where period_id is not null
    and status in ('created', 'provider_created', 'authorized');

comment on index public.bci_period_inflight_uniq is
  'PE-05B2W3.2 · Como mucho UN cobro en vuelo por obligacion. Dos trabajadores a la vez no mandan dos cargos por el mismo mes, y una respuesta que no llego se reconcilia antes de volver a intentarlo. El reintento legitimo sigue cabiendo: un intento terminal deja de ocupar el sitio.';

-- ---------------------------------------------------------------------------
-- 4 · REGISTRAR UN MEDIO DE PAGO · idempotente y de un solo dueño
-- ---------------------------------------------------------------------------
create or replace function public.billing_register_payment_method(
  p_organization_id uuid,
  p_provider text,
  p_provider_payment_method_id text,
  p_environment text,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_ya public.billing_payment_methods%rowtype;
  v_id uuid;
begin
  if p_environment not in ('test', 'live') then
    raise exception 'PAYMENT_METHOD_ENVIRONMENT_INVALID' using detail = coalesce(p_environment, 'null');
  end if;
  if p_provider_payment_method_id is null or length(trim(p_provider_payment_method_id)) = 0 then
    raise exception 'PAYMENT_METHOD_REFERENCE_REQUIRED';
  end if;

  -- Se mira por el identificador del proveedor, no por la empresa: es
  -- justamente el caso peligroso —que alguien conozca un identificador ajeno—
  -- el que hay que cerrar.
  select * into v_ya from public.billing_payment_methods
   where provider = p_provider and environment = p_environment
     and provider_payment_method_id = trim(p_provider_payment_method_id);

  if found then
    if v_ya.organization_id <> p_organization_id then
      -- FALLA CERRADO. Conocer el número no da derecho a cobrar con él.
      return jsonb_build_object('status', 'owned_by_another_organization',
        'payment_method_id', null);
    end if;
    return jsonb_build_object('status', 'already_registered',
      'payment_method_id', v_ya.id, 'method_status', v_ya.status);
  end if;

  insert into public.billing_payment_methods (
    organization_id, provider, provider_payment_method_id, environment, created_by)
  values (p_organization_id, p_provider, trim(p_provider_payment_method_id),
          p_environment, p_created_by)
  returning id into v_id;

  return jsonb_build_object('status', 'registered', 'payment_method_id', v_id,
    'method_status', 'active');
end;
$$;

revoke all on function public.billing_register_payment_method(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.billing_register_payment_method(uuid, text, text, text, uuid)
  to service_role;

comment on function public.billing_register_payment_method(uuid, text, text, text, uuid) is
  'PE-05B2W3.2 · Registra un instrumento reutilizable del proveedor, o devuelve el que ya habia. Si ese identificador pertenece a OTRA empresa falla cerrado: conocer el numero no da derecho a cobrar con el.';

-- ---------------------------------------------------------------------------
-- 5 · ATAR EL MEDIO DE PAGO AL INTENTO · con las identidades cuadradas
-- ---------------------------------------------------------------------------
create or replace function public.billing_attach_intent_payment_method(
  p_intent_id uuid,
  p_payment_method_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_int public.billing_checkout_intents%rowtype;
  v_pm  public.billing_payment_methods%rowtype;
begin
  select * into v_int from public.billing_checkout_intents where id = p_intent_id for update;
  if not found then
    return jsonb_build_object('status', 'intent_not_found');
  end if;

  select * into v_pm from public.billing_payment_methods where id = p_payment_method_id;
  if not found then
    return jsonb_build_object('status', 'payment_method_not_found');
  end if;

  -- LAS TRES IDENTIDADES TIENEN QUE CUADRAR. Empresa, proveedor y entorno.
  -- Cualquiera que no cuadre es un cobro que no debe salir.
  if v_pm.organization_id <> v_int.organization_id then
    return jsonb_build_object('status', 'organization_mismatch');
  end if;
  if v_pm.provider <> v_int.provider then
    return jsonb_build_object('status', 'provider_mismatch');
  end if;
  if v_pm.environment <> v_int.environment then
    return jsonb_build_object('status', 'environment_mismatch');
  end if;
  if v_pm.status <> 'active' then
    return jsonb_build_object('status', 'payment_method_not_active',
      'method_status', v_pm.status);
  end if;

  update public.billing_checkout_intents
     set payment_method_id = v_pm.id, updated_at = now()
   where id = v_int.id;

  return jsonb_build_object('status', 'attached', 'intent_id', v_int.id,
    'payment_method_id', v_pm.id,
    'provider_payment_method_id', v_pm.provider_payment_method_id);
end;
$$;

revoke all on function public.billing_attach_intent_payment_method(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.billing_attach_intent_payment_method(uuid, uuid)
  to service_role;

comment on function public.billing_attach_intent_payment_method(uuid, uuid) is
  'PE-05B2W3.2 · Ata un intento a un instrumento reutilizable. Empresa, proveedor y entorno tienen que cuadrar los tres; si no, no se ata y no sale ningun cobro.';

-- ---------------------------------------------------------------------------
-- 6 · LA RENOVACIÓN VIEJA DEJA DE CALCULAR FECHAS
-- ---------------------------------------------------------------------------
-- Era el defecto original de W3, vivo todavía: corría el periodo con
-- `now() + intervalo`, así que el derecho avanzaba desde la hora del cobro y
-- no desde el contrato.
--
-- Ahora no calcula nada. Localiza la obligación canónica —la abierta si la
-- hay, o la siguiente por el mismo primitivo que usa todo el mundo— y la salda
-- por `billing_settle_period_payment`. UNA sola verdad de calendario.
--
-- Se conserva la firma y la forma de la respuesta porque quien la llama es el
-- webhook de la pasarela que gestiona su propia recurrencia, y ese camino no
-- tiene por qué enterarse de la reforma.
create or replace function public.billing_record_renewal_payment(
  p_provider text,
  p_provider_subscription_id text,
  p_provider_payment_id text,
  p_outcome text,
  p_amount bigint,
  p_currency text,
  p_live_mode boolean default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_intent public.billing_checkout_intents%rowtype;
  v_sub    public.billing_subscriptions%rowtype;
  v_ya     public.billing_payments%rowtype;
  v_ultimo public.billing_subscription_periods%rowtype;
  v_abre   jsonb;
  v_per    uuid;
  v_nueva  boolean := false;
  v_res    jsonb;
begin
  if p_outcome not in ('approved', 'declined', 'failed') then
    raise exception 'PAYMENT_OUTCOME_INVALID' using detail = coalesce(p_outcome, 'null');
  end if;

  -- PRIMERO la repetición, y antes de tocar ningún periodo: un aviso que llega
  -- dos veces no puede abrir una obligación de más.
  if p_provider_payment_id is not null then
    select * into v_ya from public.billing_payments
     where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if found then
      return jsonb_build_object('outcome', 'already_settled', 'payment_id', v_ya.id,
        'subscription_id', v_ya.subscription_id, 'period_id', v_ya.period_id);
    end if;
  end if;

  select * into v_intent from public.billing_checkout_intents
   where provider = p_provider and provider_subscription_id = p_provider_subscription_id;
  if not found then
    return jsonb_build_object('outcome', 'reference_unknown');
  end if;
  if p_live_mode is null
     or (p_live_mode and v_intent.environment <> 'live')
     or (not p_live_mode and v_intent.environment <> 'test') then
    return jsonb_build_object('outcome', 'environment_mismatch', 'intent_id', v_intent.id);
  end if;

  select * into v_sub from public.billing_subscriptions
   where id = v_intent.billing_subscription_id for update;
  if not found then
    -- Llega una renovación de algo que aquí nunca llegó a activarse. No se
    -- inventa una suscripción: se manda a revisión.
    return jsonb_build_object('outcome', 'subscription_absent', 'intent_id', v_intent.id,
      'organization_id', v_intent.organization_id);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('billing:' || v_sub.organization_id::text, 0));

  -- LA OBLIGACIÓN. Si hay una abierta es esa; si no, la siguiente, por el
  -- mismo primitivo que usa la otra pasarela. Aquí ya no se suman meses.
  select * into v_ultimo from public.billing_subscription_periods
   where subscription_id = v_sub.id
   order by period_sequence desc limit 1;

  if found and v_ultimo.status = 'open' then
    v_per := v_ultimo.id;
  else
    v_abre := public.billing_open_next_period(v_sub.id);
    if v_abre->>'status' <> 'open' then
      return jsonb_build_object('outcome', 'period_unavailable',
        'reason', coalesce(v_abre->>'reason', v_abre->>'status'),
        'subscription_id', v_sub.id, 'organization_id', v_sub.organization_id);
    end if;
    v_per := (v_abre->>'period_id')::uuid;
    v_nueva := not coalesce((v_abre->>'reused')::boolean, false);
  end if;

  v_res := public.billing_settle_period_payment(
    v_per, p_provider, p_provider_payment_id, p_outcome,
    p_amount, p_currency, p_live_mode);

  -- UN AVISO QUE NO CUADRA NO CREA UN MES. Si la obligación se abrió aquí
  -- mismo solo para cobrarla y el cobro no valía —importe que no cuadra, regla
  -- fiscal sin resolver—, no queda nada anotado contra ella y no debe
  -- sobrevivir: quién debe qué lo decide el calendario, no un mensaje que
  -- llega de fuera. Un rechazo del banco sí la deja en pie, porque ahí el
  -- cobro era legítimo y el mes se sigue debiendo.
  if v_nueva and v_res->>'outcome' in ('reconciliation_mismatch', 'tax_unresolved',
                                       'environment_mismatch') then
    delete from public.billing_subscription_periods where id = v_per;
  end if;

  -- La respuesta conserva la forma que ya esperaba quien llama, y añade la
  -- obligación que se saldó.
  return v_res
    || jsonb_build_object('subscription_id', v_sub.id,
                          'organization_id', v_sub.organization_id);
end;
$$;

revoke all on function public.billing_record_renewal_payment(
  text, text, text, text, bigint, text, boolean) from public, anon, authenticated;
grant execute on function public.billing_record_renewal_payment(
  text, text, text, text, bigint, text, boolean) to service_role;

comment on function public.billing_record_renewal_payment(text, text, text, text, bigint, text, boolean) is
  'PE-05B2W3.2 · Un cobro recurrente de la pasarela que gestiona su propia recurrencia. YA NO CALCULA FECHAS: localiza la obligacion canonica —la abierta, o la siguiente por `billing_open_next_period`— y la salda por `billing_settle_period_payment`. Una sola verdad de calendario para las dos pasarelas.';
