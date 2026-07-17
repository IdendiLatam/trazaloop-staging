-- 0064_support_ticket_timestamp_hardening.sql
-- Trazaloop · Sprint 10C · Corrección final: cierra 2 vías indirectas de
-- manipular fechas críticas mediante un INSERT directo con created_at
-- falsificado.
--
-- Bloqueante 1: normalize_support_ticket_insert() (0063) calculaba
-- first_response_target_at a partir de new.created_at, pero nunca forzaba
-- ese created_at — un INSERT directo con created_at='2099-01-01' habría
-- corrido el objetivo de primera respuesta a esa misma fecha lejana,
-- manipulando el SLA sin tocar first_response_target_at directamente.
--
-- Bloqueante 2: touch_support_ticket_on_message() (0063) usa
-- new.created_at para fijar last_message_at — un INSERT directo de
-- mensaje con created_at falsificado podía alterar la "última actividad"
-- visible sin que el trigger de status_history se enterara. Se agrega un
-- trigger BEFORE INSERT dedicado en support_ticket_messages, mismo
-- principio que normalize_support_ticket_insert.
--
-- 0064 corre después de 0061 (migración de feedback histórico) y después
-- de 0060 (que crea los mensajes iniciales de nada, no aplica) — ningún
-- INSERT de esas migraciones depende de un created_at específico, así
-- que forzar now() aquí no las afecta.

-- ---------------------------------------------------------------------------
-- 1. normalize_support_ticket_insert — ahora también fuerza created_at/
--    updated_at ANTES de calcular first_response_target_at.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_support_ticket_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target timestamptz;
  v_day    integer;
begin
  new.status := 'open';
  new.assigned_to := null;
  new.first_response_at := null;
  new.resolved_at := null;
  new.closed_at := null;
  new.source_type := null;
  new.source_id := null;

  -- Bloqueante 1: created_at/updated_at SIEMPRE del reloj del servidor —
  -- nunca del cliente. first_response_target_at se calcula después,
  -- sobre este mismo valor ya normalizado, para que no haya forma de
  -- correr el objetivo de primera respuesta manipulando la fecha de
  -- creación.
  new.created_at := now();
  new.updated_at := now();

  v_target := new.created_at + interval '1 day';
  v_day := extract(dow from v_target);
  if v_day = 6 then v_target := v_target + interval '2 days'; end if; -- sábado → lunes
  if v_day = 0 then v_target := v_target + interval '1 day'; end if;  -- domingo → lunes
  new.first_response_target_at := v_target;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. normalize_support_ticket_message_insert — nuevo trigger BEFORE
--    INSERT en support_ticket_messages (Bloqueante 2). No toca body/
--    author_id/organization_id/ticket_id — esos siguen validados por la
--    política de INSERT existente (0060). La constraint
--    support_ticket_messages_customer_never_internal_check (0060) queda
--    como SEGUNDA defensa detrás de este trigger, sin quitarla.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_support_ticket_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();
  new.updated_at := now();

  if new.author_type = 'customer' then
    new.is_internal_note := false;
  end if;

  return new;
end;
$$;

create trigger t_support_ticket_messages_normalize_insert
  before insert on public.support_ticket_messages
  for each row execute function public.normalize_support_ticket_message_insert();
