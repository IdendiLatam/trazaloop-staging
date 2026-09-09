-- ===========================================================================
-- Trazaloop · MP-PROD-ARCH-01 · De quién es la recurrencia
-- ===========================================================================
--
-- EL HUECO, Y POR QUÉ NO ES EL QUE PARECÍA
--
-- `billing_due_renewals` selecciona por estado y por plan, y NO mira quién es el
-- proveedor. Nació así con razón: cuando se escribió solo existía Wompi, que no
-- tiene suscripciones propias — Trazaloop lleva el calendario, abre el periodo y
-- ordena cada cobro.
--
-- Mercado Pago es lo contrario: la suscripción vive en el proveedor y él la
-- cobra por su cuenta. El adaptador ya lo declara desde PE-05B1
-- (`recurrenceOwner: "provider"`), pero esa verdad vive en TypeScript y la
-- selección de vencimientos ocurre en SQL, donde nadie la puede consultar.
--
-- La primera lectura fue que el motor intentaría cobrar dos veces. Leyendo la
-- función entera, el daño real es otro y es peor de explicar: Mercado Pago
-- declara que NO guarda medio de pago, así que nunca habrá fila en
-- `billing_payment_methods`; el motor clasificaría `payment_method_unavailable`
-- y, al pasar la gracia con el periodo abierto, `lapse_due`. Es decir,
-- **Trazaloop retiraría el derecho a un cliente que está pagando puntualmente**,
-- porque busca una tarjeta que ese proveedor jamás guarda.
--
-- (El cobro doble solo sería posible si alguien insertara a mano un medio de
-- pago para `mercadopago`. Menos probable, y también evitado por esto mismo.)
--
-- UNA SOLA AUTORIDAD
--
-- La tentación era copiar `recurrenceOwner` a una columna de cada suscripción.
-- Eso crearía una segunda verdad que envejece: el día que un adaptador cambie,
-- las filas viejas seguirían diciendo lo de antes. Aquí la autoridad es UN
-- catálogo por proveedor, y el código de la aplicación no la duplica: una prueba
-- de paridad falla si el catálogo y los adaptadores se contradicen.
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No crea planes del proveedor, ni checkout, ni webhooks, ni conciliación, ni un
-- ciclo de periodos nuevo, ni resuelve el segundo cobro. Solo decide QUIÉN entra
-- en el motor de renovación, que es lo único que hoy puede hacer daño.
-- ===========================================================================

do $$
begin
  if to_regprocedure('public.billing_due_renewals(timestamptz, integer)') is null
     or to_regclass('public.billing_subscriptions') is null then
    raise exception '0184 presupone 0174 y 0177';
  end if;
  raise notice '0184 · comprobación previa correcta';
end $$;

-- ---------------------------------------------------------------------------
-- 1 · EL CATÁLOGO DE CAPACIDADES
-- ---------------------------------------------------------------------------
--
-- Un proveedor, una fila. `renewal_owner` tiene dominio cerrado y son exactamente
-- los dos valores que el contrato de proveedor ya distingue: no se inventan
-- categorías que el código no necesite.
--
--   merchant  el calendario es de Trazaloop: nosotros cobramos      (Wompi)
--   provider  el calendario es del proveedor: él cobra              (Mercado Pago)
--
create table if not exists public.billing_provider_capabilities (
  provider       text primary key,
  renewal_owner  text not null
    constraint billing_provider_capabilities_owner_check
      check (renewal_owner in ('merchant', 'provider')),
  -- Por qué esa clasificación, para que dentro de un año se entienda sin
  -- reconstruir la conversación.
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.billing_provider_capabilities is
  'De quién es la recurrencia de cada proveedor. AUTORIDAD del motor de '
  'renovación: si un proveedor no está aquí, sus suscripciones no se cobran.';

-- Una capacidad no se BORRA.
--
-- Con el DML ya revocado a los roles de ejecución, este trigger NO existe para
-- protegerse de un runtime: existe para protegerse de una migración futura. El
-- dueño sí puede borrar, y un `delete` descuidado dentro de una migración
-- dejaría a ese proveedor en `unknown` sin que nadie lo notara — sus
-- suscripciones saldrían del motor en silencio y su historia dejaría de ser
-- legible. Un `update` deliberado sí se permite: reclasificar un proveedor puede
-- ser legítimo, y una migración es el sitio donde eso se revisa. Lo que no puede
-- pasar es que la fila desaparezca.
create or replace function public.billing_provider_capability_no_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  raise exception 'BILLING_PROVIDER_CAPABILITY_IS_NOT_DELETABLE'
    using detail = old.provider,
          hint = 'Un proveedor deja de ofrecerse; su capacidad se conserva '
              || 'para que la historia siga siendo legible.';
end $$;

drop trigger if exists billing_provider_capability_no_delete_trg
  on public.billing_provider_capabilities;
create trigger billing_provider_capability_no_delete_trg
  before delete on public.billing_provider_capabilities
  for each row execute function public.billing_provider_capability_no_delete();

alter table public.billing_provider_capabilities enable row level security;

-- Leerlo es de la administración de plataforma. Ningún inquilino lo necesita:
-- de esta tabla no depende nada que él vea.
drop policy if exists billing_provider_capabilities_read
  on public.billing_provider_capabilities;
create policy billing_provider_capabilities_read
  on public.billing_provider_capabilities
  for select to authenticated
  using (public.is_platform_staff());

-- LOS PRIVILEGIOS SON LA PUERTA, NO LA POLÍTICA.
--
-- La RLS no protege este catálogo de `service_role`: a ese rol no se le aplica.
-- Y `service_role` recibe por omisión todos los privilegios sobre las tablas
-- nuevas, así que cualquier código de servidor con la llave secreta podía hacer
--
--   update billing_provider_capabilities set renewal_owner='merchant'
--    where provider='mercadopago';
--
-- y meter de golpe a Mercado Pago en el motor de cobro. Lo comprobé ejecutándolo:
-- funcionaba. No es hipotético.
--
-- Ningún runtime necesita ESCRIBIR aquí: la clasificación de un proveedor se
-- decide cuando se integra, y eso es un cambio gobernado por migración. Así que
-- se revoca el DML a los tres roles de ejecución y solo queda el dueño.
revoke all on public.billing_provider_capabilities from anon;
revoke insert, update, delete, truncate on public.billing_provider_capabilities
  from authenticated, service_role;
grant select on public.billing_provider_capabilities to authenticated, service_role;

-- Los dos proveedores que existen hoy en el código. La clasificación no se
-- adivina: sale de lo que cada adaptador declara en sus capacidades.
insert into public.billing_provider_capabilities (provider, renewal_owner, note)
values
  ('wompi', 'merchant',
   'Wompi no tiene suscripciones propias: Trazaloop abre el periodo y ordena '
   || 'cada cobro sobre un medio de pago guardado.'),
  ('mercadopago', 'provider',
   'La suscripción vive en Mercado Pago y él la cobra por su calendario. '
   || 'No guarda medio de pago para nosotros, así que el motor merchant no '
   || 'tiene con qué cobrar ni debe intentarlo.')
on conflict (provider) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · LA PREGUNTA, EN UNA FUNCIÓN
-- ---------------------------------------------------------------------------
--
-- Devuelve `unknown` para lo que no está declarado, y quien decide trata
-- `unknown` como «no es nuestro»: un proveedor que nadie clasificó no puede
-- entrar en el motor por omisión. Fallar cerrado aquí cuesta un aviso; fallar
-- abierto cuesta el dinero de alguien.
create or replace function public.billing_renewal_owner(p_provider text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select c.renewal_owner from public.billing_provider_capabilities c
      where c.provider = p_provider),
    'unknown');
$$;

-- `authenticated` la necesita porque la vista de arriba la evalúa con los
-- privilegios de quien consulta, y quien consulta es personal de plataforma
-- —que también es `authenticated`—. No devuelve nada sensible: traduce un
-- nombre de proveedor a quién lo cobra.
revoke all on function public.billing_renewal_owner(text) from public, anon;
grant execute on function public.billing_renewal_owner(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3 · EL MOTOR SOLO MIRA LO QUE ES SUYO
-- ---------------------------------------------------------------------------
--
-- Reconstruida desde su definición vigente de 0177, con UNA condición añadida y
-- nada quitado. El diff contra la predecesora son seis líneas: cinco de
-- explicación y el predicado.
create or replace function public.billing_due_renewals(
  p_now timestamptz default now(),
  p_limit integer default 100
)
returns table (
  action            text,
  subscription_id   uuid,
  organization_id   uuid,
  period_id         uuid,
  period_sequence   integer,
  due_at            timestamptz,
  grace_end         timestamptz,
  attempt_number    integer,
  slot              integer,
  payment_method_id uuid
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with ultimo as (
    select distinct on (p.subscription_id)
           p.subscription_id, p.id as period_id, p.period_sequence,
           p.period_start, p.period_end, p.status
      from public.billing_subscription_periods p
     order by p.subscription_id, p.period_sequence desc
  ),
  viva as (
    select s.id, s.organization_id, s.status, s.provider, s.cancel_at_period_end,
           s.scheduled_plan_revision_id, s.scheduled_effective_at,
           u.period_id, u.period_sequence, u.period_start, u.period_end,
           u.status as period_status,
           -- AQUÍ ESTABA EL DEFECTO. Un mes impagado vence cuando EMPIEZA.
           case when u.status = 'open' then u.period_start else u.period_end end as due_at,
           public.billing_has_unresolved_charge(s.id) as en_duda
      from public.billing_subscriptions s
      join ultimo u on u.subscription_id = s.id
     where s.status in ('active', 'past_due')
       and s.plan_code in ('full', 'extra')
       -- 0184 · Solo entran las suscripciones cuya recurrencia es NUESTRA.
       -- Una de Mercado Pago la cobra el proveedor por su calendario; si
       -- entrara aquí, el motor no encontraria medio de pago —ese proveedor no
       -- guarda ninguno— y acabaria caducando a alguien que esta pagando.
       -- Un proveedor sin capacidad declarada tampoco entra: falla cerrado.
       and public.billing_renewal_owner(s.provider) = 'merchant'
  ),
  medio as (
    select distinct on (m.organization_id, m.provider)
           m.organization_id, m.provider, m.id as payment_method_id
      from public.billing_payment_methods m
     where m.status = 'active'
     order by m.organization_id, m.provider, m.created_at desc
  ),
  -- EN VUELO es lo que YA SALIÓ y sigue sin desenlace. Un intento creado que
  -- nunca se envió no bloquea: se retoma.
  en_vuelo as (
    select i.period_id from public.billing_checkout_intents i
     where i.period_id is not null
       and i.status in ('created', 'provider_created', 'authorized')
       and i.provider_submitted_at is not null
  ),
  -- Los huecos gastados son ENVÍOS, no filas. Y el hueco se mide por cuándo se
  -- envió, que es cuando el cliente recibió el intento de cobro.
  gastados as (
    select i.period_id,
           count(*)::int as enviados,
           max(public.billing_renewal_slot_at(
             case when u.status = 'open' then u.period_start else u.period_end end,
             i.provider_submitted_at)) as ultimo_hueco,
           bool_or(i.failure_class = 'hard_decline') as rechazo_duro
      from public.billing_checkout_intents i
      join public.billing_subscription_periods p on p.id = i.period_id
      join ultimo u on u.period_id = p.id
     where i.period_id is not null
       and i.provider_submitted_at is not null
     group by i.period_id
  ),
  decidido as (
    select v.*, md.payment_method_id, g.enviados, g.ultimo_hueco,
           coalesce(g.rechazo_duro, false) as rechazo_duro,
           case
             when v.period_status = 'settled' and p_now >= v.period_end
                  and v.cancel_at_period_end then 'cancel_due'
             when v.period_status = 'settled' and p_now >= v.period_end
                  and v.scheduled_plan_revision_id is not null
                  and p_now >= v.scheduled_effective_at then 'downgrade_due'
             when v.en_duda then 'manual_review_required'
             when v.period_status = 'open'
                  and p_now > public.billing_renewal_grace_end(v.period_start)
               then 'lapse_due'
             when md.payment_method_id is null then 'payment_method_unavailable'
             when f.period_id is not null then 'in_flight'
             -- Un rechazo DURO no se reintenta aunque queden huecos: el emisor
             -- ya dijo que no y lo va a seguir diciendo. La gracia sí corre.
             when coalesce(g.rechazo_duro, false) then 'hard_declined'
             when public.billing_renewal_slot_at(v.due_at, p_now) >= 0
                  and public.billing_renewal_slot_at(v.due_at, p_now)
                      > coalesce(g.ultimo_hueco, -1)
                  and coalesce(g.enviados, 0) < 4
               then case when v.period_status = 'open' then 'retry' else 'renew' end
             else 'nothing'
           end as accion
      from viva v
      left join gastados g on g.period_id = v.period_id
      left join en_vuelo f on f.period_id = v.period_id
      left join medio md on md.organization_id = v.organization_id
                        and md.provider = v.provider
     where p_now >= v.due_at
  )
  select d.accion,
         d.id, d.organization_id,
         case when d.period_status = 'open' then d.period_id end,
         d.period_sequence, d.due_at,
         public.billing_renewal_grace_end(d.due_at),
         coalesce(d.enviados, 0) + 1,
         public.billing_renewal_slot_at(d.due_at, p_now),
         d.payment_method_id
    from decidido d
   where d.accion not in ('in_flight', 'hard_declined', 'nothing')
   order by d.due_at
   limit greatest(p_limit, 0);
$$;
-- Los MISMOS privilegios que traía de 0177, ni uno más. Al reconstruir la
-- función se pierden sus grants, y aquí estuve a punto de ampliarlos por
-- inercia: solo el corredor de plataforma puede preguntar qué vence. Lo cazó la
-- prueba de B5B que comprueba que un cliente no puede llamarla.
revoke all on function public.billing_due_renewals(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.billing_due_renewals(timestamptz, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 4 · Y QUE SE VEA A QUIÉN SE DEJA FUERA
-- ---------------------------------------------------------------------------
--
-- Excluir en silencio es la mitad del trabajo. Si una suscripción viva no entra
-- en el motor, alguien tiene que poder verlo y saber por qué — sobre todo en el
-- caso `unknown`, que significa que se integró un proveedor y nadie declaró
-- quién lo cobra.
-- `security_invoker` para que la RLS de `billing_subscriptions` siga aplicando
-- —una vista no puede ser un atajo para ver lo de otra empresa— y ADEMÁS un
-- filtro de plataforma: esto es una herramienta de operación, y un cliente no
-- tiene nada que hacer aquí ni siquiera con lo suyo.
create or replace view public.v_billing_renewal_excluded
with (security_invoker = true) as
  select s.id            as subscription_id,
         s.organization_id,
         s.provider,
         public.billing_renewal_owner(s.provider) as renewal_owner,
         s.status,
         s.current_period_end,
         case public.billing_renewal_owner(s.provider)
           when 'provider' then 'la recurrencia es del proveedor'
           when 'unknown'  then 'PROVEEDOR SIN CAPACIDAD DECLARADA'
         end             as motivo
    from public.billing_subscriptions s
   where public.is_platform_staff()
     and s.status in ('active', 'past_due')
     and s.plan_code in ('full', 'extra')
     and public.billing_renewal_owner(s.provider) <> 'merchant';

comment on view public.v_billing_renewal_excluded is
  'Suscripciones vivas que el motor de renovación NO toca, y por qué.';

-- Una vista simple sobre una sola tabla es AUTO-ACTUALIZABLE en Postgres, y los
-- privilegios por omisión le dan insert/update/delete a los roles de ejecución.
-- Sin revocarlos, esta vista sería una vía de ESCRITURA a
-- `billing_subscriptions` — con la RLS aplicándose, sí, pero una vía al fin y al
-- cabo, y no es para lo que existe. Solo se lee.
revoke all on public.v_billing_renewal_excluded from anon, authenticated, service_role;
grant select on public.v_billing_renewal_excluded to authenticated, service_role;
