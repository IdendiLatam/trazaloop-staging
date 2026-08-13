-- ============================================================================
-- 0104_pcr02_internal_consumption_and_completeness.sql
-- Trazaloop · Sprint PCR-02 · La Orden / corrida de producción como eje.
--
-- ADITIVA sobre 0103 (aplicada en producción e INTOCABLE). No modifica
-- ninguna migración 0001–0103, no borra ni transforma datos, no toca RLS
-- existente, no crea planes ni estados nuevos. Compatible con v1.0.1 en
-- caliente (§24): la tabla nueva es invisible para la app anterior y la
-- vista reemplazada conserva EXACTAMENTE los mismos nombres y orden de
-- columnas.
--
-- ÍNDICE (revisada en PCR-02.1, PCR-02.2 y PCR-02.3 ANTES de su primer
-- despliegue — por eso las correcciones viven en este mismo archivo y NO
-- existe una 0105):
--   §1  output_batch_consumption — una Orden/corrida consume LOTES PRODUCIDOS
--       internos (Bloques D y E): el producto intermedio se reutiliza SIN
--       duplicar el lote y conservando su identidad.
--   §2  Trigger anti-autoconsumo — SECURITY INVOKER y acotado por
--       organization_id (hardening PCR-02.1, hallazgo 3), con un ÚNICO
--       mensaje para lote inexistente/ajeno (sin oráculo cross-tenant).
--   §2b Trigger de protección de reasignación (PCR-02.1, hallazgo 1.D):
--       un lote producido YA CONSUMIDO por otra orden no puede cambiar de
--       orden productora (reescribiría la genealogía y podría crear un
--       autoconsumo silencioso saltándose §2).
--   §2c Candado histórico persistente (PCR-02.3, bypass de reapertura):
--       columna production_orders.history_locked_at + backfill con
--       evidencia inequívoca (estado actual y audit_log) + trigger que lo
--       activa al entrar en closed/cancelled y lo vuelve inmutable ante
--       cualquier UPDATE (columna gestionada por el sistema).
--   §2e Structural guard de órdenes cerradas (PCR-02.4): mientras una
--       orden esté closed/cancelled, su ESTRUCTURA de trazabilidad queda
--       congelada — consumos externos e internos, lotes producidos
--       (campos estructurales) y composición no admiten INSERT/UPDATE/
--       DELETE, ni siquiera por API directa; y la propia orden solo admite
--       la transición PURA de reapertura. Reabrir restaura la mutabilidad;
--       el candado histórico (§2c) permanece.
--   §2d Trigger de protección del historial ante DELETE (PCR-02.2,
--       ampliado en PCR-02.3): una orden cerrada o cancelada — o que ALGUNA
--       VEZ lo haya sido (candado activo) — NO puede eliminarse, ni desde
--       la app ni por acceso directo a la API. Sin él, el ON DELETE CASCADE
--       de los consumos (0025 §batch_consumption y §1 de esta migración)
--       borraría silenciosamente historia de trazabilidad. Reabrir permite
--       corregir; nunca permite borrar la historia.
--   §3  RLS de la tabla nueva (idéntica a batch_consumption).
--   §4  v_output_batch_completeness — consumo de AMBOS orígenes y, para las
--       cadenas internas, la información de proveedor/material se HEREDA del
--       cierre aguas arriba (recursivo acotado, a prueba de ciclos) —
--       PCR-02.1, hallazgo 5: sin falsos negativos NI falsos positivos.
--       PCR-02.2 (hallazgo B): semántica FAIL-CLOSED — una rama cíclica o un
--       recorrido truncado por profundidad NO demuestran procedencia y el
--       lote no puede clasificarse completo.
--   §4b v_implementation_next_actions — «Registrar consumo» reconoce ambos
--       orígenes de consumo (PCR-02.1, hallazgo 2).
--   §5  Verificaciones posteriores (documentación).
--
-- CARDINALIDAD (Bloque C): output_batches.production_order_id NO tiene
-- unique → 1 orden → N lotes producidos YA está soportado desde 0025; esta
-- migración NO añade restricciones sobre ello.
--
-- DATOS HISTÓRICOS (Bloque §18): la relación orden↔salida ya existía
-- (production_order_id NOT NULL); el consumo interno nace vacío. NO se hace
-- backfill: no existe ningún dato del que inferir consumos internos pasados
-- y está prohibido inventar asociaciones.
--
-- ROLLBACK (ver PCR-02-ROLLBACK.md; regla anti-drift de PCR-01.1: tras ser
-- aplicada y registrada, una reversión permanente se hace con MIGRACIÓN
-- COMPENSATORIA 0105+, nunca SQL manual sin reconciliar):
--   · drop trigger t_output_batch_consumption_no_self on output_batch_consumption;
--     drop function output_batch_consumption_no_self();
--   · drop table output_batch_consumption;  -- ⚠ pierde consumos internos ya
--     registrados: decisión expresa, jamás automática
--   · restaurar v_output_batch_completeness con la definición de 0026
--     (create or replace; el archivo 0026 del repo es la fuente).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 · output_batch_consumption — consumo de lotes producidos internos
-- ----------------------------------------------------------------------------
-- Espejo estructural de batch_consumption (0025) cambiando el origen:
-- production_order_id = orden que CONSUME; output_batch_id = lote producido
-- (por OTRA orden) que se consume. Cumple la regla 0024 completa.
create table public.output_batch_consumption (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete restrict,
  production_order_id uuid not null,
  output_batch_id     uuid not null,
  mass_kg             numeric(14,4) not null,
  notes               text,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint output_batch_consumption_order_batch_uniq
    unique (production_order_id, output_batch_id),
  constraint output_batch_consumption_org_id_uniq unique (organization_id, id),
  constraint output_batch_consumption_mass_positive check (mass_kg > 0),
  constraint output_batch_consumption_order_fk
    foreign key (organization_id, production_order_id)
    references public.production_orders (organization_id, id)
    on delete cascade,
  constraint output_batch_consumption_output_fk
    foreign key (organization_id, output_batch_id)
    references public.output_batches (organization_id, id)
    on delete restrict
);
-- Las FK COMPUESTAS (organization_id, id) hacen estructuralmente imposible
-- que una empresa consuma un lote de otra (Bloque §16), además de la RLS.
-- NOTA: igual que en batch_consumption (0025), consumir más de lo producido
-- NO se bloquea en BD; se muestra como advertencia en UI.

create index output_batch_consumption_order_idx
  on public.output_batch_consumption (production_order_id);
create index output_batch_consumption_output_idx
  on public.output_batch_consumption (output_batch_id);

comment on table public.output_batch_consumption is
  'PCR-02 · Consumos de lotes PRODUCIDOS internos por una Orden/corrida posterior. El lote intermedio conserva su identidad (no se duplica como input_batch). Junto con batch_consumption (lotes de entrada externos) forma los dos orígenes posibles de consumo de una orden.';

-- Triggers obligatorios de la regla 0024 (funciones existentes, sin duplicar).
create trigger t_output_batch_consumption_updated
  before update on public.output_batch_consumption
  for each row execute function public.set_updated_at();
create trigger t_output_batch_consumption_org_immutable
  before update on public.output_batch_consumption
  for each row execute function public.prevent_organization_id_change();
create trigger t_output_batch_consumption_force_created_by
  before insert on public.output_batch_consumption
  for each row execute function public.force_created_by();
create trigger t_audit_output_batch_consumption
  after insert or update or delete on public.output_batch_consumption
  for each row execute function public.audit_row_change();

-- ----------------------------------------------------------------------------
-- §2 · Anti-autoconsumo: una orden no consume un lote producido por ella misma
-- ----------------------------------------------------------------------------
-- El caso inequívocamente inválido se bloquea en BD. Los ciclos largos
-- (A→X→B→Y→A) no se bloquean aquí: el recorrido de genealogía de la
-- aplicación es a prueba de ciclos (visitados + tope de profundidad) y el
-- caso queda documentado como advertencia operativa, no como corrupción.
--
-- Hardening PCR-02.1 (hallazgo 3):
--   · SECURITY INVOKER (no definer): la RLS del que consulta aplica también
--     dentro del trigger — ningún acceso transversal elevado.
--   · La consulta queda acotada por organization_id = NEW.organization_id:
--     defensa en profundidad además de las FK compuestas.
--   · Lote inexistente y lote de OTRA empresa producen EXACTAMENTE el mismo
--     error: la función no sirve de oráculo cross-tenant.
create or replace function public.output_batch_consumption_no_self()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_producer uuid;
begin
  select production_order_id into v_producer
    from output_batches
   where id = new.output_batch_id
     and organization_id = new.organization_id;

  if v_producer is null then
    -- Mismo mensaje para inexistente y ajeno (sin filtración de existencia).
    raise exception 'El lote producido no existe o no pertenece a tu empresa.'
      using errcode = '23514';
  end if;

  if v_producer = new.production_order_id then
    raise exception 'Una orden no puede consumir un lote producido por ella misma.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.output_batch_consumption_no_self() is
  'PCR-02/PCR-02.1 · Bloquea el autoconsumo directo (orden que consume su propia salida). SECURITY INVOKER y acotado por organization_id; mensaje único para lote inexistente/ajeno. Aplica en INSERT y UPDATE de output_batch_consumption.';

revoke execute on function public.output_batch_consumption_no_self() from public, anon, authenticated;

create trigger t_output_batch_consumption_no_self
  before insert or update on public.output_batch_consumption
  for each row execute function public.output_batch_consumption_no_self();

-- ----------------------------------------------------------------------------
-- §2b · Protección de reasignación (PCR-02.1, hallazgo 1.D)
-- ----------------------------------------------------------------------------
-- Un lote producido que YA fue consumido por otra orden forma parte de la
-- historia productiva: cambiar su orden productora reescribiría la genealogía
-- retroactivamente y podría crear un autoconsumo silencioso (reasignar el
-- productor a una orden que lo consumió) sin pasar por el trigger §2. La
-- server action lo valida primero (mejor mensaje + estados de orden); este
-- trigger es la barrera final ante cualquier UPDATE directo por API.
create or replace function public.output_batches_protect_reassignment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.production_order_id is distinct from old.production_order_id then
    if exists (
      select 1
        from output_batch_consumption oc
       where oc.output_batch_id = new.id
         and oc.organization_id = new.organization_id
    ) then
      raise exception 'El lote producido ya fue consumido por otra orden: su orden productora no puede cambiarse.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.output_batches_protect_reassignment() is
  'PCR-02.1 · Impide cambiar production_order_id de un lote producido cuando ya existe consumo interno del lote: la genealogía registrada no se reescribe. SECURITY INVOKER, acotado por organization_id.';

revoke execute on function public.output_batches_protect_reassignment() from public, anon, authenticated;

drop trigger if exists t_output_batches_protect_reassignment on public.output_batches;
create trigger t_output_batches_protect_reassignment
  before update on public.output_batches
  for each row execute function public.output_batches_protect_reassignment();

-- ----------------------------------------------------------------------------
-- §2c · Candado histórico persistente (PCR-02.3, bypass de reapertura)
-- ----------------------------------------------------------------------------
-- Invariante: una Orden / corrida que ALGUNA VEZ haya entrado en
-- closed/cancelled forma parte permanente del historial de trazabilidad y
-- jamás vuelve a ser eliminable, aunque después se reabra para corrección.
--
-- Diseño elegido (opción B del análisis): marcador persistente en la propia
-- fila, en lugar de consultar audit_log desde el trigger de DELETE. Motivo:
-- el candado debe evaluarse en CADA delete con costo O(1), sin depender del
-- volumen ni de la retención del audit_log, sin privilegios de lectura
-- especiales (audit_log solo es visible para admin) y sin acoplar la
-- integridad a un formato jsonb. El audit_log SÍ se usa una única vez, en
-- el backfill de abajo, donde su evidencia es inequívoca.
--
-- Semántica de history_locked_at: PRIMERA entrada de la orden al historial
-- finalizado (no «último cierre»). Se asigna una sola vez; la reapertura y
-- los cierres posteriores no lo modifican. Estado operativo (status) y
-- condición histórica (candado) son conceptos separados:
-- status = in_progress + candado activo ⇒ «orden histórica reabierta para
-- corrección» — editable según permisos, jamás eliminable.
alter table public.production_orders
  add column if not exists history_locked_at timestamptz;

comment on column public.production_orders.history_locked_at is
  'PCR-02.3 · Momento de la PRIMERA entrada de la orden en closed/cancelled (candado histórico irreversible). Gestionada por el sistema: cualquier valor enviado por el cliente se ignora; una vez asignada no cambia. En filas ya finalizadas al aplicar la 0104 representa la activación técnica del candado durante la migración, NO la fecha real de cierre.';

-- Backfill 1/2 · Órdenes actualmente finalizadas: inferencia inequívoca
-- (si HOY están en closed/cancelled, forman parte del histórico). Se usa
-- now() y se documenta como activación técnica del candado en la migración:
-- updated_at es «última modificación», no «fecha de cierre», y usarlo
-- falsificaría historia.
update public.production_orders
   set history_locked_at = now()
 where history_locked_at is null
   and status in ('closed', 'cancelled');

-- Backfill 2/2 · Órdenes reabiertas ANTES de este sprint (hoy en
-- draft/in_progress pero que pasaron por closed/cancelled). Evidencia
-- inequívoca: t_audit_production_orders existe desde la CREACIÓN de la
-- tabla (la propia 0025 lo instala), así que todo paso por esos estados
-- dejó una fila en audit_log con el diff old/new completo. Limitación
-- documentada: si una operación de retención llegara a depurar audit_log
-- antes de aplicar la 0104, los pasos depurados no serían detectables — no
-- se inventa nada en ese caso (el candado simplemente no se activa sin
-- evidencia). En el repositorio no existe ninguna migración que depure
-- audit_log.
update public.production_orders po
   set history_locked_at = now()
 where po.history_locked_at is null
   and exists (
     select 1
       from public.audit_log al
      where al.table_name = 'production_orders'
        and al.row_id = po.id
        and (al.diff -> 'new' ->> 'status' in ('closed', 'cancelled')
          or al.diff -> 'old' ->> 'status' in ('closed', 'cancelled'))
   );

-- Activación y protección del candado. BEFORE INSERT OR UPDATE: la columna
-- es 100 % gestionada por el sistema — se parte SIEMPRE del valor previo
-- (con lo que un UPDATE no puede borrarla ni reemplazarla, y un INSERT no
-- puede fabricarla) y solo el propio trigger la asigna al entrar en
-- closed/cancelled. Fail-closed sin excepciones ruidosas: el valor ilegal
-- simplemente no ocurre. IMPORTANTE: este trigger se crea DESPUÉS del
-- backfill para que los UPDATE de arriba puedan escribir el candado.
create or replace function public.production_orders_history_lock()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.history_locked_at := null;          -- el cliente jamás lo fabrica
  else
    new.history_locked_at := old.history_locked_at;  -- inmutable una vez puesto
  end if;
  if new.history_locked_at is null
     and new.status in ('closed', 'cancelled') then
    new.history_locked_at := now();         -- primera entrada al historial
  end if;
  return new;
end;
$$;

comment on function public.production_orders_history_lock() is
  'PCR-02.3 · Gestiona history_locked_at: lo activa al entrar en closed/cancelled (también por SQL/API directa) y lo hace inmutable — ignora cualquier valor enviado por el cliente. SECURITY INVOKER; solo usa OLD/NEW.';

revoke execute on function public.production_orders_history_lock() from public, anon, authenticated;

drop trigger if exists t_production_orders_history_lock on public.production_orders;
create trigger t_production_orders_history_lock
  before insert or update on public.production_orders
  for each row execute function public.production_orders_history_lock();

-- ----------------------------------------------------------------------------
-- §2d · Protección del historial ante DELETE (PCR-02.2, ampliado PCR-02.3)
-- ----------------------------------------------------------------------------
-- Invariante: una Orden / corrida cerrada o cancelada forma parte permanente
-- del historial de trazabilidad y NO puede eliminarse.
--
-- Motivo estructural: batch_consumption (0025) y output_batch_consumption
-- (§1) referencian la orden con ON DELETE CASCADE — correcto para órdenes de
-- trabajo abiertas/borrador (limpiar una orden errónea limpia sus consumos),
-- pero letal para historia cerrada: sin esta barrera, un DELETE directo por
-- la API de Supabase borraría silenciosamente los consumos históricos.
--
-- Diseño: BEFORE DELETE por fila sobre la PROPIA orden. El trigger dispara
-- ANTES de que el borrado (y por tanto cualquier cascada de FK) comience:
-- si aborta, ninguna fila hija llega a tocarse. Solo lee OLD (sin consultas
-- a otras tablas ni a otras organizaciones), SECURITY INVOKER, search_path
-- fijado. Los estados draft/in_progress conservan el comportamiento
-- histórico (eliminables según RLS y RESTRICT de salidas): este trigger no
-- amplía ni recorta esos permisos.
create or replace function public.production_orders_protect_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- PCR-02.3: el bloqueo ya no depende solo del estado PRESENTE. Una orden
  -- reabierta (status in_progress + candado activo) sigue siendo historial:
  -- reabrir permite corregir; nunca permite borrar la historia. El mensaje
  -- es semántico y vale para closed, cancelled y reabiertas.
  if old.status in ('closed', 'cancelled')
     or old.history_locked_at is not null then
    raise exception 'Esta orden ya forma parte del historial de trazabilidad y no puede eliminarse.'
      using errcode = '23514';
  end if;
  return old;
end;
$$;

comment on function public.production_orders_protect_history() is
  'PCR-02.2/PCR-02.3 · Impide eliminar órdenes cerradas/canceladas o con candado histórico activo (reabiertas incluidas) incluso por acceso directo a la API. BEFORE DELETE: aborta antes de que arranque cualquier cascada. SECURITY INVOKER; solo lee OLD.';

revoke execute on function public.production_orders_protect_history() from public, anon, authenticated;

drop trigger if exists t_production_orders_protect_history on public.production_orders;
create trigger t_production_orders_protect_history
  before delete on public.production_orders
  for each row execute function public.production_orders_protect_history();

-- ----------------------------------------------------------------------------
-- §2e · Structural guard de órdenes cerradas (PCR-02.4)
-- ----------------------------------------------------------------------------
-- Invariante: MIENTRAS una orden esté en closed/cancelled, su estructura de
-- trazabilidad no puede modificarse; para corregirla hay que reabrirla
-- explícitamente (el candado §2c permanece). Tres reglas independientes
-- conviven: (1) historial jamás eliminable (§2c/§2d); (2) estructura
-- congelada mientras esté cerrada (este §2e); (3) reapertura explícita.
--
-- Diseño: UNA función de dominio reutilizable + un trigger fino por tabla
-- (sin duplicar la lógica de estados). SECURITY INVOKER siempre; acotado
-- por organization_id (sin oracle cross-tenant: si la orden no pertenece a
-- la organización de la fila, simplemente no se encuentra — la existencia
-- y el tenant los garantizan las FK compuestas y la RLS, no esta guarda).
-- Si la orden NO existe (p. ej. cascada legítima del DELETE de una orden
-- ABIERTA, donde la fila padre ya desapareció) la guarda NO bloquea: su
-- única responsabilidad es el estado presente.
create or replace function public.assert_production_order_is_mutable(
  p_order_id uuid,
  p_organization_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
      from public.production_orders po
     where po.id = p_order_id
       and po.organization_id = p_organization_id
       and po.status in ('closed', 'cancelled')
  ) then
    raise exception 'La orden está cerrada o cancelada. Reábrela antes de modificar su trazabilidad.'
      using errcode = '23514';
  end if;
end;
$$;

comment on function public.assert_production_order_is_mutable(uuid, uuid) is
  'PCR-02.4 · Guarda de dominio: falla (23514) si la orden indicada de la MISMA organización está closed/cancelled. Mensaje uniforme para consumo externo/interno, salidas y composición. SECURITY INVOKER.';

revoke execute on function public.assert_production_order_is_mutable(uuid, uuid) from public, anon;
-- Los triggers §2e son SECURITY INVOKER y ejecutan esta guarda COMO el rol
-- que dispara la operación: authenticated necesita EXECUTE (la función no
-- revela nada que la RLS de production_orders no muestre ya — solo el
-- estado de órdenes de la PROPIA organización; para otra organización la
-- fila no se encuentra y no bloquea).
grant execute on function public.assert_production_order_is_mutable(uuid, uuid) to authenticated;

-- Guarda compartida de los CONSUMOS (ambas tablas tienen production_order_id
-- + organization_id): INSERT valida la orden nueva; UPDATE valida la orden
-- del OLD y la del NEW (cubre mover el consumo de orden); DELETE valida la
-- orden del OLD. Corre BEFORE: un intento ilegal aborta antes de FK,
-- cascadas o auditoría.
create or replace function public.consumption_structural_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.assert_production_order_is_mutable(old.production_order_id, old.organization_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.assert_production_order_is_mutable(new.production_order_id, new.organization_id);
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.consumption_structural_guard() is
  'PCR-02.4 · Congela batch_consumption y output_batch_consumption mientras su orden esté closed/cancelled (INSERT/UPDATE/DELETE, incl. mover el consumo de orden). SECURITY INVOKER.';

revoke execute on function public.consumption_structural_guard() from public, anon, authenticated;

drop trigger if exists t_batch_consumption_structural_guard on public.batch_consumption;
create trigger t_batch_consumption_structural_guard
  before insert or update or delete on public.batch_consumption
  for each row execute function public.consumption_structural_guard();

drop trigger if exists t_output_batch_consumption_structural_guard on public.output_batch_consumption;
create trigger t_output_batch_consumption_structural_guard
  before insert or update or delete on public.output_batch_consumption
  for each row execute function public.consumption_structural_guard();

-- Lotes producidos: política estructural/descriptiva (PCR-02.4, §10/§47).
--   ESTRUCTURALES (congelados mientras la orden productora esté cerrada):
--     production_order_id (genealogía), product_id (producto),
--     produced_quantity_kg (masa/balance), batch_code (identidad con la que
--     el lote aparece en genealogía y dossier).
--   DESCRIPTIVOS (corregibles siempre, auditados por t_audit_output_batches
--     desde 0025): produced_date, characteristics, intended_application,
--     storage_location, notes.
-- INSERT/DELETE exigen orden productora abierta. Un UPDATE que toque campos
-- estructurales exige orden actual abierta (y, si cambia la orden, también
-- la de destino — además de la protección §2b de reasignación, que sigue
-- vigente y dispara antes por orden alfabético de triggers BEFORE).
create or replace function public.output_batches_structural_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.assert_production_order_is_mutable(new.production_order_id, new.organization_id);
  elsif tg_op = 'DELETE' then
    perform public.assert_production_order_is_mutable(old.production_order_id, old.organization_id);
  elsif new.production_order_id is distinct from old.production_order_id
     or new.product_id is distinct from old.product_id
     or new.produced_quantity_kg is distinct from old.produced_quantity_kg
     or new.batch_code is distinct from old.batch_code then
    perform public.assert_production_order_is_mutable(old.production_order_id, old.organization_id);
    perform public.assert_production_order_is_mutable(new.production_order_id, new.organization_id);
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.output_batches_structural_guard() is
  'PCR-02.4 · Congela los campos ESTRUCTURALES del lote producido (orden, producto, cantidad, código) mientras su orden esté closed/cancelled; los descriptivos siguen corregibles y auditados. SECURITY INVOKER.';

revoke execute on function public.output_batches_structural_guard() from public, anon, authenticated;

drop trigger if exists t_output_batches_structural_guard on public.output_batches;
create trigger t_output_batches_structural_guard
  before insert or update or delete on public.output_batches
  for each row execute function public.output_batches_structural_guard();

-- Composición: se resuelve la orden productora vía el lote (acotado por la
-- organización de la fila). UPDATE valida el lote del OLD y el del NEW
-- (cubre mover una composición entre lotes, §22). Si el lote ya no existe
-- (cascada legítima de una orden abierta) la guarda no bloquea.
create or replace function public.batch_composition_structural_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select ob.production_order_id into v_order
      from public.output_batches ob
     where ob.id = old.output_batch_id
       and ob.organization_id = old.organization_id;
    if v_order is not null then
      perform public.assert_production_order_is_mutable(v_order, old.organization_id);
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select ob.production_order_id into v_order
      from public.output_batches ob
     where ob.id = new.output_batch_id
       and ob.organization_id = new.organization_id;
    if v_order is not null then
      perform public.assert_production_order_is_mutable(v_order, new.organization_id);
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.batch_composition_structural_guard() is
  'PCR-02.4 · Congela la composición de lotes producidos por órdenes closed/cancelled (INSERT/UPDATE/DELETE, incl. mover la composición de lote). SECURITY INVOKER.';

revoke execute on function public.batch_composition_structural_guard() from public, anon, authenticated;

drop trigger if exists t_batch_composition_structural_guard on public.batch_composition;
create trigger t_batch_composition_structural_guard
  before insert or update or delete on public.batch_composition
  for each row execute function public.batch_composition_structural_guard();

-- La propia orden (PCR-02.4, §26–§28): mientras esté closed/cancelled, el
-- ÚNICO UPDATE admitido es la transición PURA de reapertura (status →
-- in_progress) — o un update sin cambios productivos. Reabrir y reescribir
-- datos en la misma sentencia sería un bypass de la reapertura explícita.
-- Se excluyen de la comparación los campos del sistema: status (la propia
-- transición), updated_at (set_updated_at) e history_locked_at (gestionado
-- por §2c — así el backfill de esta migración y el candado siguen
-- funcionando sobre filas cerradas).
create or replace function public.production_orders_reopen_only_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status in ('closed', 'cancelled') then
    if (to_jsonb(new) - 'status' - 'updated_at' - 'history_locked_at')
       is distinct from
       (to_jsonb(old) - 'status' - 'updated_at' - 'history_locked_at') then
      raise exception 'La orden está cerrada o cancelada. Reábrela antes de modificar su trazabilidad.'
        using errcode = '23514';
    end if;
    if new.status is distinct from old.status and new.status <> 'in_progress' then
      raise exception 'La orden está cerrada o cancelada. Reábrela antes de modificar su trazabilidad.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.production_orders_reopen_only_guard() is
  'PCR-02.4 · Sobre una orden closed/cancelled solo se admite la transición PURA de reapertura (status → in_progress); cualquier cambio productivo simultáneo se rechaza. SECURITY INVOKER.';

revoke execute on function public.production_orders_reopen_only_guard() from public, anon, authenticated;

drop trigger if exists t_production_orders_reopen_only_guard on public.production_orders;
create trigger t_production_orders_reopen_only_guard
  before update on public.production_orders
  for each row execute function public.production_orders_reopen_only_guard();

-- ----------------------------------------------------------------------------
-- §3 · RLS — idéntica a batch_consumption (0025)
-- ----------------------------------------------------------------------------
alter table public.output_batch_consumption enable row level security;

create policy output_batch_consumption_select on public.output_batch_consumption
  for select to authenticated using (public.is_org_member(organization_id));
create policy output_batch_consumption_insert on public.output_batch_consumption
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and public.has_org_role(organization_id, array['admin','quality','consultant'])
  );
create policy output_batch_consumption_update on public.output_batch_consumption
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality','consultant']))
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy output_batch_consumption_delete on public.output_batch_consumption
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

-- ----------------------------------------------------------------------------
-- §4 · v_output_batch_completeness — ambos orígenes + herencia aguas arriba
--      (semántica revisada en PCR-02.1, hallazgo 5)
-- ----------------------------------------------------------------------------
-- SEMÁNTICA DOCUMENTADA (§21 del brief PCR-02.1):
--   1. «Completo» = el lote tiene orden, la orden tiene consumos, el lote
--      tiene composición, y la PROCEDENCIA de lo consumido está documentada.
--   2. Un consumo EXTERNO aporta procedencia si su lote de entrada tiene
--      proveedor y material (igual que 0026).
--   3. Un consumo INTERNO aporta procedencia solo si su CADENA aguas arriba
--      está documentada: la orden productora del lote consumido (y las
--      anteriores, recursivamente) registra consumos, y TODOS los consumos
--      externos de ese cierre traen proveedor y material.
--   4. La herencia se calcula con un cierre recursivo ACOTADO (profundidad
--      10) y A PRUEBA DE CICLOS (camino acumulado): sin recursión infinita.
--   5. Si la trazabilidad previa está incompleta (falta proveedor/material
--      aguas arriba, o una orden intermedia no registra consumos), el lote
--      final NO aparece completo: se evita el falso positivo del caso
--      «input externo incompleto → … → FIN-1 “completo”» sin reintroducir
--      el falso negativo que PCR-02 corrigió (una orden que consume SOLO
--      intermedios documentados cuenta como completa).
--   6. FAIL-CLOSED (PCR-02.2, hallazgo B): «no encontré problema» JAMÁS
--      equivale a «demostré procedencia». Cada rama del recorrido termina
--      en exactamente uno de estos desenlaces, y solo el primero demuestra
--      procedencia:
--        · RAÍZ VÁLIDA — llegó a consumo externo documentado (proveedor y
--          material): la rama demuestra procedencia.
--        · DEAD END — una orden alcanzada no registra consumos: rama sin
--          origen (chain_has_consumption = false).
--        · CICLO — el salto volvería a una orden ya visitada del camino: la
--          recursión lo OMITE (protección operacional) pero aquí se
--          REGISTRA (evidencia semántica) y la rama NO demuestra
--          procedencia. Decisión (brief §25): un ciclo invalida la
--          completitud AUNQUE exista en paralelo una rama externa válida —
--          la historia cíclica no puede cerrarse documentalmente.
--        · LÍMITE DE PROFUNDIDAD — quedó consumo interno por seguir al
--          alcanzar la profundidad 10: la raíz NO llegó a demostrarse y la
--          rama NO cuenta como válida.
--      Varias ramas se combinan con AND (bool_and): todas las necesarias
--      deben terminar en raíz válida. La composición o la masa nunca
--      sustituyen a la procedencia.
-- Los NOMBRES y el ORDEN de columnas se conservan EXACTAMENTE (compat §24
-- con la app v1.0.1 en caliente). has_supplier_info / has_material_info
-- significan ahora «documentado EN LA CADENA» (etiquetas de missing_items
-- sin cambios). consumed_mass_kg y el balance siguen siendo de la PROPIA
-- orden (el balance de masa es por orden, no por cadena).
create or replace view public.v_output_batch_completeness
with (security_invoker = true) as
with recursive order_upstream as (
  -- Cierre aguas arriba de cada orden a través del consumo interno.
  -- depth 0 = la propia orden; el camino acumulado corta los ciclos.
  select
    po.id            as root_order_id,
    po.id            as upstream_order_id,
    0                as depth,
    array[po.id]     as path
  from public.production_orders po
  union all
  select
    ou.root_order_id,
    ob.production_order_id,
    ou.depth + 1,
    ou.path || ob.production_order_id
  from order_upstream ou
  join public.output_batch_consumption oc
    on oc.production_order_id = ou.upstream_order_id
  join public.output_batches ob
    on ob.id = oc.output_batch_id
  where ou.depth < 10
    and not (ob.production_order_id = any (ou.path))
),
cycle_edges as (
  -- PCR-02.2 · Saltos que VOLVERÍAN a una orden ya visitada del camino: la
  -- recursión de order_upstream los omite para no ciclar; aquí se registran
  -- como evidencia de rama cíclica (procedencia NO demostrable).
  select distinct ou.root_order_id
  from order_upstream ou
  join public.output_batch_consumption oc
    on oc.production_order_id = ou.upstream_order_id
  join public.output_batches ob
    on ob.id = oc.output_batch_id
  where ob.production_order_id = any (ou.path)
),
truncated_branches as (
  -- PCR-02.2 · Órdenes alcanzadas EN el límite de profundidad que aún tienen
  -- consumo interno por seguir: el recorrido se frenó por seguridad, no
  -- porque llegara a una raíz — la procedencia queda sin demostrar.
  select distinct ou.root_order_id
  from order_upstream ou
  where ou.depth = 10
    and exists (
      select 1 from public.output_batch_consumption oc
       where oc.production_order_id = ou.upstream_order_id
    )
),
external_by_order as (
  select
    bc.production_order_id,
    bool_and(ib.supplier_id is not null) as all_have_supplier,
    bool_and(ib.material_id is not null) as all_have_material
  from public.batch_consumption bc
  join public.input_batches ib on ib.id = bc.input_batch_id
  group by bc.production_order_id
),
closure_flags as (
  select
    ou.root_order_id as production_order_id,
    -- Toda orden ALCANZADA por la cadena (depth >= 1) debe registrar al
    -- menos un consumo: si una orden intermedia no consume nada, la
    -- procedencia se corta sin documentar.
    bool_and(
      ou.depth = 0
      or exists (select 1 from public.batch_consumption bx
                  where bx.production_order_id = ou.upstream_order_id)
      or exists (select 1 from public.output_batch_consumption ox
                  where ox.production_order_id = ou.upstream_order_id)
    ) as chain_has_consumption,
    -- FAIL-CLOSED (PCR-02.2): la documentación externa del cierre solo
    -- demuestra procedencia si NINGUNA rama terminó en ciclo ni quedó
    -- truncada por profundidad. (coalesce(…, true) sobre órdenes sin
    -- consumo externo es correcto SOLO bajo esa condición: los extremos de
    -- un cierre acíclico y completo son necesariamente externos.)
    (bool_and(coalesce(ex.all_have_supplier, true))
       and not exists (select 1 from cycle_edges ce
                        where ce.root_order_id = ou.root_order_id)
       and not exists (select 1 from truncated_branches tb
                        where tb.root_order_id = ou.root_order_id)
    ) as chain_supplier_ok,
    (bool_and(coalesce(ex.all_have_material, true))
       and not exists (select 1 from cycle_edges ce
                        where ce.root_order_id = ou.root_order_id)
       and not exists (select 1 from truncated_branches tb
                        where tb.root_order_id = ou.root_order_id)
    ) as chain_material_ok
  from order_upstream ou
  left join external_by_order ex
    on ex.production_order_id = ou.upstream_order_id
  group by ou.root_order_id
),
consumption_union as (
  select bc.production_order_id, bc.mass_kg
  from public.batch_consumption bc
  union all
  select oc.production_order_id, oc.mass_kg
  from public.output_batch_consumption oc
),
consumption_agg as (
  select
    cu.production_order_id,
    sum(cu.mass_kg) as consumed_mass_kg,
    count(*)        as consumption_rows
  from consumption_union cu
  group by cu.production_order_id
),
composition_agg as (
  select
    cp.output_batch_id,
    sum(cp.mass_kg) as composition_mass_kg,
    count(*)        as composition_rows
  from public.batch_composition cp
  group by cp.output_batch_id
)
select
  ob.organization_id,
  ob.id                                   as output_batch_id,
  ob.batch_code                           as output_batch_code,
  ob.production_order_id,
  po.order_code                           as production_order_code,
  ob.product_id,
  p.code                                  as product_code,
  p.name                                  as product_name,
  (po.id is not null)                     as has_order,
  coalesce(ca.consumption_rows, 0) > 0    as has_consumption,
  coalesce(cg.composition_rows, 0) > 0    as has_composition,
  (coalesce(ca.consumption_rows, 0) > 0
   and coalesce(cf.chain_has_consumption, false)
   and coalesce(cf.chain_supplier_ok, false))   as has_supplier_info,
  (coalesce(ca.consumption_rows, 0) > 0
   and coalesce(cf.chain_has_consumption, false)
   and coalesce(cf.chain_material_ok, false))   as has_material_info,
  ca.consumed_mass_kg,
  cg.composition_mass_kg,
  ob.produced_quantity_kg,
  (
    (ca.consumed_mass_kg is not null and cg.composition_mass_kg is not null
     and abs(ca.consumed_mass_kg - cg.composition_mass_kg) > 0.05 * ca.consumed_mass_kg)
    or
    (ob.produced_quantity_kg is not null and cg.composition_mass_kg is not null
     and abs(ob.produced_quantity_kg - cg.composition_mass_kg) > 0.05 * ob.produced_quantity_kg)
  )                                       as mass_balance_warning,
  array_remove(array[
    case when po.id is null                          then 'orden de producción' end,
    case when coalesce(ca.consumption_rows, 0) = 0   then 'consumos de la orden' end,
    case when coalesce(cg.composition_rows, 0) = 0   then 'composición del lote' end,
    case when not (coalesce(ca.consumption_rows, 0) > 0
                   and coalesce(cf.chain_has_consumption, false)
                   and coalesce(cf.chain_supplier_ok, false))
         then 'información de proveedor' end,
    case when not (coalesce(ca.consumption_rows, 0) > 0
                   and coalesce(cf.chain_has_consumption, false)
                   and coalesce(cf.chain_material_ok, false))
         then 'información de material' end
  ], null)                                as missing_items,
  case
    when po.id is null
      or coalesce(ca.consumption_rows, 0) = 0
      or coalesce(cg.composition_rows, 0) = 0
      or not (coalesce(ca.consumption_rows, 0) > 0
              and coalesce(cf.chain_has_consumption, false)
              and coalesce(cf.chain_supplier_ok, false))
      or not (coalesce(ca.consumption_rows, 0) > 0
              and coalesce(cf.chain_has_consumption, false)
              and coalesce(cf.chain_material_ok, false))
    then 'incomplete'
    when (
      (ca.consumed_mass_kg is not null and cg.composition_mass_kg is not null
       and abs(ca.consumed_mass_kg - cg.composition_mass_kg) > 0.05 * ca.consumed_mass_kg)
      or
      (ob.produced_quantity_kg is not null and cg.composition_mass_kg is not null
       and abs(ob.produced_quantity_kg - cg.composition_mass_kg) > 0.05 * ob.produced_quantity_kg)
    )
    then 'complete_with_warnings'
    else 'complete'
  end                                     as traceability_status
from public.output_batches ob
left join public.production_orders po on po.id = ob.production_order_id
left join public.products p           on p.id = ob.product_id
left join consumption_agg ca          on ca.production_order_id = ob.production_order_id
left join closure_flags cf            on cf.production_order_id = ob.production_order_id
left join composition_agg cg          on cg.output_batch_id = ob.id;
-- Nota de rendimiento: el cierre recursivo está acotado (profundidad 10,
-- camino anti-ciclos) y las cadenas internas reales son cortas; la vista se
-- consulta filtrada por organización vía RLS de las tablas base.

-- ----------------------------------------------------------------------------
-- §4b · v_implementation_next_actions — el consumo interno también cuenta
--       (PCR-02.1, hallazgo 2)
-- ----------------------------------------------------------------------------
-- Definición VIGENTE tomada de 0065 (la última que la redefine) reproducida
-- ÍNTEGRA: columnas, prioridades, textos, href y contrato idénticos. El
-- ÚNICO cambio es la CTE sample_order_without_consumption (marcada abajo).
-- Las demás vistas de implementación no requieren cambios: el dashboard
-- (0034) no cuenta consumos; readiness (0032) hereda la corrección vía
-- v_output_batch_completeness; los gaps (0031) usan batch_consumption solo
-- para enlazar evidencias de lotes de entrada/proveedores EXTERNOS (inner
-- join: una orden solo-interna no genera brechas falsas).
create or replace view public.v_implementation_next_actions
with (security_invoker = true) as
with d as (
  select * from public.v_implementation_dashboard
),
sample_material_without_origin as (
  select distinct on (m.organization_id)
    m.organization_id, m.id, m.name
  from public.materials m
  join public.material_classifications mc
    on mc.code = coalesce(m.reclassified_to_code, m.classification_code)
  left join public.evidences ev on ev.id = m.origin_support_evidence_id
  where mc.eligible_as_recycled
    and (
      m.origin_support_evidence_id is null
      or coalesce(ev.status, 'pending') <> 'valid'
    )
  order by m.organization_id, m.created_at
),
sample_pending_evidence as (
  select distinct on (organization_id)
    organization_id, id, name
  from public.evidences
  where status = 'pending'
  order by organization_id, created_at
),
-- >>> PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE
-- (No eliminar los marcadores: la suite de PostgreSQL local extrae y ejecuta
--  este bloque tal cual se envía.) PCR-02.1 (hallazgo 2): una orden cuenta
-- con consumo si registra AL MENOS UNO de los dos orígenes — externo
-- (batch_consumption) o interno (output_batch_consumption). Antes solo se
-- miraba el externo y una orden trazada únicamente con producto intermedio
-- recibía la recomendación «Registrar consumo».
sample_order_without_consumption as (
  select distinct on (po.organization_id)
    po.organization_id, po.id, po.order_code
  from public.production_orders po
  where not exists (
      select 1 from public.batch_consumption bc
       where bc.production_order_id = po.id)
    and not exists (
      select 1 from public.output_batch_consumption oc
       where oc.production_order_id = po.id)
  order by po.organization_id, po.created_at
),
-- <<< PCR02_1_ORDER_WITHOUT_CONSUMPTION_CTE
sample_batch_without_composition as (
  select distinct on (ob.organization_id)
    ob.organization_id, ob.id, ob.batch_code
  from public.output_batches ob
  left join public.batch_composition bcp on bcp.output_batch_id = ob.id
  where bcp.id is null
  order by ob.organization_id, ob.created_at
),
sample_ready_to_calculate as (
  select distinct on (organization_id)
    organization_id, output_batch_id, output_batch_code
  from public.v_output_batch_readiness
  where readiness_level = 'ready_to_calculate'
  order by organization_id, output_batch_code
),
sample_gap as (
  select distinct on (organization_id)
    organization_id, output_batch_id, output_batch_code
  from public.v_output_batch_support_gaps
  where gap_severity = 'critical'
  order by organization_id, output_batch_code
),
sample_defensible as (
  select distinct on (organization_id)
    organization_id, calculation_id, output_batch_code
  from public.v_latest_batch_recycled
  where defensibility_level = 'defensible'
  order by organization_id, calculated_at desc
),
-- Un booleano por regla (1-11); la regla 12 solo aplica cuando ninguna de
-- las anteriores lo hace ("si todo está avanzado").
flags as (
  select
    d.organization_id,
    (d.suppliers_count = 0)                                     as f1_no_suppliers,
    (d.suppliers_count > 0 and d.materials_count = 0)            as f2_no_materials,
    (smo.id is not null)                                         as f3_missing_origin,
    (spe.id is not null)                                         as f4_pending_evidence,
    (d.input_batches_count = 0)                                  as f5_no_input_batches,
    (d.production_orders_count = 0)                              as f6_no_orders,
    (sow.id is not null)                                         as f7_order_without_consumption,
    (sbw.id is not null)                                         as f8_batch_without_composition,
    (srtc.output_batch_id is not null)                           as f9_ready_to_calculate,
    (sg.output_batch_id is not null)                             as f10_critical_gap,
    (sdef.calculation_id is not null)                            as f11_defensible
  from d
  left join sample_material_without_origin smo on smo.organization_id = d.organization_id
  left join sample_pending_evidence spe         on spe.organization_id = d.organization_id
  left join sample_order_without_consumption sow on sow.organization_id = d.organization_id
  left join sample_batch_without_composition sbw on sbw.organization_id = d.organization_id
  left join sample_ready_to_calculate srtc      on srtc.organization_id = d.organization_id
  left join sample_gap sg                       on sg.organization_id = d.organization_id
  left join sample_defensible sdef              on sdef.organization_id = d.organization_id
)
select organization_id, priority, action_code, action_label, action_description,
       href, related_entity_type, related_entity_id
from (
  select d.organization_id, 1 as priority, 'create_supplier' as action_code,
    'Crear proveedor real' as action_label,
    'Aún no hay proveedores registrados. Registra el primer proveedor real de la empresa.' as action_description,
    '/catalog/suppliers' as href,
    null::text as related_entity_type, null::uuid as related_entity_id
  from flags f join d on d.organization_id = f.organization_id
  where f.f1_no_suppliers

  union all
  select d.organization_id, 2, 'create_material',
    'Crear material real',
    'Hay proveedores registrados pero aún no hay materiales con su clasificación.',
    '/catalog/materials', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f2_no_materials

  union all
  select d.organization_id, 3, 'add_origin_evidence',
    'Cargar evidencia de origen',
    'El material "' || coalesce(s.name, '') ||
      '" es elegible como reciclado pero no tiene evidencia de origen válida.',
    '/evidences', 'material', s.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_material_without_origin s on s.organization_id = f.organization_id
  where f.f3_missing_origin

  union all
  select d.organization_id, 4, 'validate_evidence',
    'Validar evidencia pendiente',
    'La evidencia "' || coalesce(e.name, '') || '" está pendiente de validación.',
    '/evidences', 'evidence', e.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_pending_evidence e on e.organization_id = f.organization_id
  where f.f4_pending_evidence

  union all
  select d.organization_id, 5, 'create_input_batch',
    'Registrar lote de entrada',
    'Aún no hay lotes de entrada registrados para esta empresa.',
    '/traceability/input-batches', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f5_no_input_batches

  union all
  select d.organization_id, 6, 'create_production_order',
    'Crear orden / corrida de producción',
    'Aún no hay órdenes / corridas de producción registradas.',
    '/traceability/production-orders', null, null
  from flags f join d on d.organization_id = f.organization_id
  where f.f6_no_orders

  union all
  select d.organization_id, 7, 'add_consumption',
    'Registrar consumo',
    'La orden / corrida "' || coalesce(o2.order_code, '') || '" aún no tiene consumos registrados.',
    '/traceability/production-orders', 'production_order', o2.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_order_without_consumption o2 on o2.organization_id = f.organization_id
  where f.f7_order_without_consumption

  union all
  select d.organization_id, 8, 'add_composition',
    'Registrar composición',
    'El lote producido / lote final "' || coalesce(b2.batch_code, '') || '" aún no tiene composición.',
    '/traceability/output-batches', 'output_batch', b2.id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_batch_without_composition b2 on b2.organization_id = f.organization_id
  where f.f8_batch_without_composition

  union all
  select d.organization_id, 9, 'calculate_recycled_content',
    'Calcular contenido reciclado',
    'El lote producido / lote final "' || coalesce(r.output_batch_code, '') ||
      '" tiene composición registrada y está listo para calcular.',
    '/recycled-content/output-batches', 'output_batch', r.output_batch_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_ready_to_calculate r on r.organization_id = f.organization_id
  where f.f9_ready_to_calculate

  union all
  select d.organization_id, 10, 'review_gaps',
    'Revisar brechas',
    'Hay brechas críticas abiertas en el lote "' || coalesce(g.output_batch_code, '') || '".',
    '/audit-support', 'output_batch', g.output_batch_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_gap g on g.organization_id = f.organization_id
  where f.f10_critical_gap

  union all
  select d.organization_id, 11, 'open_dossier',
    'Ver dossier técnico',
    'Hay cálculos defendibles disponibles. Revisa el dossier del lote "' ||
      coalesce(def.output_batch_code, '') || '".',
    '/audit-support', 'calculation', def.calculation_id
  from flags f
  join d on d.organization_id = f.organization_id
  join sample_defensible def on def.organization_id = f.organization_id
  where f.f11_defensible

  -- Sprint 10C (Bloqueante 3): única fila que cambia respecto a 0034 —
  -- ahora invita a crear un ticket de soporte y enlaza a /support/new,
  -- en vez del antiguo flujo de feedback y su ruta ya reemplazada.
  union all
  select f.organization_id, 12, 'record_feedback',
    'Crear ticket de soporte',
    'Los datos, la trazabilidad y el cálculo de la empresa están avanzados. Crea un ticket de soporte con hallazgos, dudas o mejoras encontradas durante la prueba real.',
    '/support/new', null, null
  from flags f
  where not (
    f.f1_no_suppliers or f.f2_no_materials or f.f3_missing_origin
    or f.f4_pending_evidence or f.f5_no_input_batches or f.f6_no_orders
    or f.f7_order_without_consumption or f.f8_batch_without_composition
    or f.f9_ready_to_calculate or f.f10_critical_gap or f.f11_defensible
  )
) actions;

-- ----------------------------------------------------------------------------
-- §5 · Verificaciones posteriores (documentación; ver PCR-02-PRODUCTION-DEPLOY)
-- ----------------------------------------------------------------------------
--   select relrowsecurity from pg_class
--    where oid = 'public.output_batch_consumption'::regclass;        -- true
--   select count(*) from pg_policies
--    where tablename = 'output_batch_consumption';                   -- 4
--   select tgname from pg_trigger
--    where tgrelid = 'public.output_batch_consumption'::regclass
--      and not tgisinternal;                                         -- 5 filas
--   insert de consumo con output_batch de la MISMA orden → debe fallar con
--   'Una orden no puede consumir un lote producido por ella misma.'
--   insert cross-tenant (org A consumiendo lote de org B) → el trigger §2
--   responde 'El lote producido no existe o no pertenece a tu empresa.'
--   (mismo mensaje que un uuid inexistente: sin oráculo) y la FK compuesta
--   output_batch_consumption_output_fk es la barrera estructural final.
--   update output_batches set production_order_id = <otra> where id = <lote
--   ya consumido> → 'El lote producido ya fue consumido por otra orden: su
--   orden productora no puede cambiarse.' (§2b)
--   select * from v_output_batch_completeness limit 1;  -- mismas columnas
--   select action_code from v_implementation_next_actions where
--   organization_id = <org con orden solo-interna>; → SIN 'add_consumption'
--   delete from production_orders where id = <orden cerrada, cancelada o
--   con history_locked_at activo (reabierta)> → 'Esta orden ya forma parte
--   del historial de trazabilidad y no puede eliminarse.' (§2d) y los
--   consumos históricos siguen existiendo (la cascada jamás arranca).
--   update production_orders set status = 'closed' where id = <abierta> →
--   history_locked_at queda asignado automáticamente (§2c), y un update
--   posterior a in_progress (reapertura) NO lo borra; tampoco lo borra
--   set history_locked_at = null (columna gestionada por el sistema).
--   con la orden CERRADA (§2e): insert/update/delete de batch_consumption,
--   output_batch_consumption y batch_composition → 'La orden está cerrada o
--   cancelada. Reábrela antes de modificar su trazabilidad.'; insert/delete
--   de output_batches y cambios de orden/producto/cantidad/código → mismo
--   error; update de campos descriptivos del lote → permitido y auditado;
--   update de la orden cerrada que no sea la reapertura pura → mismo error;
--   tras reabrir, todas las mutaciones vuelven según RLS/rol y el DELETE de
--   la orden sigue vetado (§2c/§2d).
--   ciclo interno puro (OP-A ⇄ OP-B sin lote externo) → sus lotes son
--   'incomplete'; cadena con raíz externa más allá de la profundidad 10 →
--   'incomplete' (§4, fail-closed).
--   NOTA: la suite tests/db (PostgreSQL local) ejecuta estos escenarios de
--   forma real; ver PCR-02.1-TEST-MATRIX.md.
