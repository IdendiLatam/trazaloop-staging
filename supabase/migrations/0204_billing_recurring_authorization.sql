-- =============================================================================
-- Trazaloop · MP-REC-01 · La autorización de recurrencia, separada de la venta
-- =============================================================================
--
-- QUÉ SE ABRE AQUÍ
--
-- Un segundo carril de adquisición. Hasta hoy Trazaloop cobra una vez y renueva
-- a mano (`renewal_mode = 'manual'`); esto prepara el carril en el que la
-- pasarela cobra sola (`renewal_mode = 'provider'`, un valor que 0190 ya
-- admitía y que hasta ahora nadie escribía por el camino de producto).
--
-- Los dos carriles COMPARTEN el modelo financiero —presupuesto, precio,
-- periodos, pagos, liquidación y proyección de módulos— y NO comparten la
-- máquina de adquisición. Confundirlas es cómo se acaba renovando a mano una
-- suscripción que la pasarela ya va a cobrar, o al revés.
--
--
-- POR QUÉ UNA TABLA NUEVA Y NO UN PAR DE COLUMNAS
--
-- `billing_subscriptions.provider_subscription_id` ya existe y podría guardar
-- la preapproval. Sería suficiente para el caso feliz y falso para todo lo
-- demás:
--
--   · Una autorización tiene un ciclo propio —emitida, autorizada, cancelada—
--     que NO es el estado comercial de la suscripción. Una empresa con la
--     suscripción `active` y pagada hasta diciembre puede tener la autorización
--     `cancelled`: eso es exactamente «cancelé la renovación y conservo lo
--     pagado», y en una sola columna no se puede decir.
--
--   · Una suscripción puede REEMPLAZAR su autorización —el comprador abandonó
--     el enlace, o cambió de medio de pago— y el historial de lo anterior es
--     evidencia, no basura. Con una columna, reemplazar es sobrescribir.
--
--   · La unicidad que hace falta es «una sola autorización VIVA por suscripción
--     comercial», y eso es un índice parcial sobre filas, no un `not null`.
--
--
-- LO QUE ESTA TABLA NO HACE, Y ES LO MÁS IMPORTANTE
--
-- NO concede acceso. NO crea periodos. NO mueve dinero.
--
-- Estar autorizado no es haber pagado: Mercado Pago documenta que el primer
-- cargo real ocurre alrededor de una hora después de autorizar, y por eso
-- `mapping.ts` traduce su `authorized` a `pending` y no a `active`. El derecho
-- lo sigue concediendo un PAGO APROBADO, por el mismo camino canónico de
-- siempre:
--
--     pago aprobado del proveedor
--       → conciliación canónica
--       → billing_payments
--       → billing_subscription_periods
--       → disparador de 0194 → organization_modules
--
-- Esta tabla solo dice CON QUÉ INSTRUMENTO del proveedor está atada esa
-- suscripción, y en qué punto de su autorización está.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Preflight · esta migración presupone dos cosas de otras
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public'
                    and table_name = 'billing_subscriptions'
                    and column_name = 'renewal_mode') then
    raise exception '0204 presupone renewal_mode de 0190';
  end if;

  -- Sin el disparador de 0194 esta tabla abriría un carril que cobra y no
  -- entrega. Mejor negarse a promover que descubrirlo con dinero dentro.
  if not exists (select 1 from pg_trigger
                  where tgname = 't_project_module_access_on_period'
                    and not tgisinternal) then
    raise exception '0204 presupone la proyeccion de modulos de 0194';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 · La autorización
-- -----------------------------------------------------------------------------
create table if not exists public.billing_recurring_authorizations (
  id uuid primary key default gen_random_uuid(),

  subscription_id uuid not null
    references public.billing_subscriptions (id) on delete restrict,

  -- Se repite la empresa por la misma razón que en `billing_subscription_periods`:
  -- permite aislar por inquilino sin una junta en cada política, y no puede
  -- desviarse porque la suscripción no cambia de dueño.
  organization_id uuid not null
    references public.organizations (id) on delete restrict,

  provider text not null,
  -- El identificador del instrumento en la pasarela. En Mercado Pago es el
  -- `preapproval_id`. No es un secreto: es un identificador de recurso, del
  -- mismo orden que el `provider_payment_id` que ya se guarda en los pagos.
  provider_subscription_id text not null,
  -- La palabra CRUDA del proveedor, tal cual llegó. Se guarda además del
  -- estado canónico porque cuando la traducción falla —un estado nuevo que
  -- nadie había visto— lo único que permite averiguar qué pasó es el original.
  provider_status text,

  -- El entorno DECLARADO de la credencial con la que se creó. Que esté aquí y
  -- no se deduzca al leer es lo que permite rechazar una conciliación cruzada
  -- sin preguntarle a nadie.
  environment text not null,

  -- El cobrador OBSERVADO en el proveedor cuando se pudo observar. Es un
  -- identificador de cuenta, no una credencial. Vale para lo mismo que en el
  -- pago único: comprobar que el dinero de esta suscripción cae donde debe.
  observed_collector_id text,

  -- El enlace de autorización y cuándo se emitió. El enlace NO es una
  -- credencial: es la dirección pública del checkout de esa preapproval, y
  -- quien la tiene no puede hacer nada que no pudiera hacer con el
  -- `provider_subscription_id` que está en la columna de al lado. Se guarda
  -- para poder RETOMAR una autorización abandonada sin crear otra preapproval.
  init_point_url text,
  init_point_issued_at timestamptz,

  -- El ciclo de la AUTORIZACIÓN. No es el estado comercial de la suscripción,
  -- que vive en `billing_subscriptions.status` y se sigue rigiendo por los
  -- pagos. Aquí solo se dice si este instrumento del proveedor puede producir
  -- cobros futuros.
  status text not null default 'awaiting_authorization',

  authorized_at timestamptz,
  cancelled_at timestamptz,
  -- Cuándo se le preguntó por última vez al proveedor. Es lo que permite que
  -- el barrido de cobros futuros no relea lo que acaba de leer.
  last_reconciled_at timestamptz,

  -- El reemplazo, explícito. Una autorización abandonada no se borra ni se
  -- sobrescribe: se cierra y se apunta a la que la sucede.
  superseded_by_id uuid references public.billing_recurring_authorizations (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bra_environment_check check (environment in ('test', 'live')),
  constraint bra_status_check check (status in
    ('awaiting_authorization', 'authorized', 'cancelled', 'ended')),
  -- Las fechas no pueden contradecir al estado. `authorized_at` puede existir
  -- en una cancelada —se autorizó y luego se canceló, que es el caso normal—,
  -- pero una cancelada sin fecha de cancelación es una fila que miente.
  constraint bra_cancelled_shape check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint bra_authorized_shape check (status <> 'authorized' or authorized_at is not null)
);

-- LAS DOS INVARIANTES, en la base y no en la aplicación.
--
-- La primera: un instrumento del proveedor pertenece a UNA suscripción. Sin
-- ella, dos conciliaciones podrían atribuir el mismo cobro a dos sitios.
create unique index if not exists bra_provider_uniq
  on public.billing_recurring_authorizations (provider, provider_subscription_id);

-- La segunda: UNA sola autorización viva por suscripción comercial. Es la
-- defensa contra el doble cobro —dos preapprovals activas sobre el mismo
-- derecho comercial cobrarían dos veces— y es un índice PARCIAL porque el
-- historial de las muertas tiene que poder acumularse al lado.
create unique index if not exists bra_one_live_per_subscription
  on public.billing_recurring_authorizations (subscription_id)
  where status in ('awaiting_authorization', 'authorized');

create index if not exists bra_org_idx
  on public.billing_recurring_authorizations (organization_id, created_at desc);
-- El barrido de cobros futuros busca por aquí: vivas, por antigüedad de la
-- última lectura. Sin este índice, el trabajo programado hace un recorrido
-- completo cada vez que despierta.
create index if not exists bra_sweep_idx
  on public.billing_recurring_authorizations (status, last_reconciled_at nulls first)
  where status in ('awaiting_authorization', 'authorized');

drop trigger if exists t_bra_updated_at on public.billing_recurring_authorizations;
create trigger t_bra_updated_at
  before update on public.billing_recurring_authorizations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2 · Quién la ve, y quién no la escribe
-- -----------------------------------------------------------------------------
-- Misma puerta que los periodos de 0172: la administración de la empresa y el
-- personal de plataforma LEEN. Nadie escribe desde el cliente. Las escrituras
-- son del servidor, por el camino canónico, y por eso no hay política de
-- escritura que conceder ni revocar más adelante.
alter table public.billing_recurring_authorizations enable row level security;

drop policy if exists billing_recurring_authorizations_read
  on public.billing_recurring_authorizations;
create policy billing_recurring_authorizations_read on public.billing_recurring_authorizations
  for select to authenticated
  using (public.is_org_admin(organization_id) or public.is_platform_staff());

revoke all on public.billing_recurring_authorizations from anon;
revoke insert, update, delete, truncate
  on public.billing_recurring_authorizations from authenticated, anon;
grant select on public.billing_recurring_authorizations to authenticated;

comment on table public.billing_recurring_authorizations is
  'MP-REC-01 · EL INSTRUMENTO DE RECURRENCIA del proveedor atado a una suscripcion comercial. NO concede acceso, NO crea periodos y NO mueve dinero: el derecho lo sigue dando un pago aprobado por la via canonica. Una sola autorizacion viva por suscripcion.';
comment on column public.billing_recurring_authorizations.status is
  'MP-REC-01 · El ciclo de la AUTORIZACION, no el estado comercial. Autorizado no es pagado: el primer cargo real llega despues.';
comment on column public.billing_recurring_authorizations.init_point_url is
  'MP-REC-01 · La direccion publica del checkout de esa preapproval. No es una credencial. Se guarda para retomar una autorizacion abandonada sin crear otra preapproval.';
comment on column public.billing_recurring_authorizations.superseded_by_id is
  'MP-REC-01 · El reemplazo explicito. Una autorizacion abandonada se cierra y apunta a su sucesora; no se borra ni se sobrescribe.';

-- -----------------------------------------------------------------------------
-- 3 · Y la puerta de 0202 sigue donde estaba
-- -----------------------------------------------------------------------------
-- Esta migración no crea ninguna función, así que la superficie pública no
-- debería haberse movido ni un milímetro. Se comprueba en vez de confiar: es
-- exactamente la comprobación que 0203 dejó escrita, y una tabla financiera
-- nueva es el peor momento para dejar de hacerla.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_n <> 9 then
    raise exception '0204_SUPERFICIE_PUBLICA_CAMBIO: % funciones', v_n;
  end if;

  if has_table_privilege('anon', 'public.billing_recurring_authorizations', 'SELECT') then
    raise exception '0204_AUTORIZACION_LEGIBLE_POR_ANON';
  end if;

  raise notice '0204 · el instrumento de recurrencia existe, y no concede nada por si mismo';
end $$;
