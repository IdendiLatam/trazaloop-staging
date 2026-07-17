-- 0054_backfill_existing_organization_subscriptions.sql
-- Trazaloop · Sprint 10A · Corrección (Bloqueante 4): toda organización
-- debe tener una fila REAL en organization_subscriptions.
--
-- v_organization_plan_usage (0052) usa coalesce(sub.plan_code, 'demo')
-- como respaldo de LECTURA — pero eso hacía que empresas creadas ANTES de
-- 0053 (cuando create_organization todavía no insertaba la suscripción)
-- parecieran "demo" sin tener ninguna fila real, y por lo tanto sin
-- historial de asignación. Esta migración es idempotente: si una empresa
-- YA tiene fila en organization_subscriptions (todas las creadas desde
-- 0053 en adelante), no se toca. No usa datos hardcodeados de ninguna
-- empresa real — solo el literal 'demo', igual que hace
-- create_organization por defecto.

insert into public.organization_subscriptions (organization_id, plan_code, status, assigned_by, notes)
select o.id, 'demo', 'active', null, 'Asignación inicial automática por Sprint 10A (empresa creada antes de que existiera esta tabla).'
from public.organizations o
where not exists (
  select 1 from public.organization_subscriptions s
  where s.organization_id = o.id
);

-- Historial correspondiente — solo para las empresas que de verdad no
-- tenían ninguna entrada de historial todavía (evita duplicar si esta
-- migración llegara a correr más de una vez, o si alguna empresa ya
-- tenía historial por otro motivo).
insert into public.subscription_plan_history (organization_id, from_plan_code, to_plan_code, changed_by, change_reason)
select o.id, null, 'demo', null, 'Asignación inicial automática por Sprint 10A (empresa creada antes de que existiera esta tabla).'
from public.organizations o
where not exists (
  select 1 from public.subscription_plan_history h
  where h.organization_id = o.id
);
