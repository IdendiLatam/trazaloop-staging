-- ---------------------------------------------------------------------------
-- Trazaloop Quality · QUALITY-01.1 · Correcciones de aceptación
--
-- Append-only tras 0112. NO modifica ninguna migración anterior.
--
-- Dos cambios, ambos derivados de la prueba humana:
--
--   1. TrazaDocs admite documentos de Quality (module_key = 'quality').
--      El motor documental ya era transversal desde 0082: filtra, aísla y
--      versiona por module_key. Lo único que faltaba era que su restricción
--      CHECK admitiera el tercer módulo. NO se crea un segundo motor
--      documental ni una tabla quality_documents: eso duplicaría
--      trazadoc_documents sin ninguna necesidad.
--
--   2. Un cargo NUEVO y sin usar puede eliminarse; uno que ya se usa, no.
--      0112 no declaró politica de DELETE sobre quality_positions con el
--      criterio de que un cargo se desactiva. Sigue siendo cierto para un
--      cargo EN USO —su borrado destruiria el historico de propiedad de los
--      procesos, que es justo lo que T-02 protege— pero deja sin salida a
--      quien se equivoca al teclear un cargo recien creado. La solucion no
--      es relajar la regla: es apoyarse en las claves foraneas ON DELETE
--      RESTRICT que ya existen, que dejan borrar exactamente aquello que no
--      ha dejado rastro.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- §1 · TrazaDocs: tercer modulo
-- ---------------------------------------------------------------------------
-- Se sustituye la restriccion enumerada de 0082 por una que incluye Quality.
-- Sustituir una CHECK no es modificar la migracion historica: 0082 sigue
-- intacta y esta migracion declara el estado nuevo de forma explicita.

alter table public.trazadoc_blueprints
  drop constraint if exists trazadoc_blueprints_module_key_check;
alter table public.trazadoc_blueprints
  add constraint trazadoc_blueprints_module_key_check
  check (module_key in ('cpr', 'textiles', 'quality'));

alter table public.trazadoc_documents
  drop constraint if exists trazadoc_documents_module_key_check;
alter table public.trazadoc_documents
  add constraint trazadoc_documents_module_key_check
  check (module_key in ('cpr', 'textiles', 'quality'));

-- El indice (organization_id, module_key) de 0082 ya sirve a Quality: no hace
-- falta ninguno nuevo. El trigger set_trazadoc_document_module_key() tampoco
-- cambia — un documento libre conserva el module_key que fija la server
-- action, y en UPDATE el modulo sigue siendo INMUTABLE para los tres.

comment on constraint trazadoc_documents_module_key_check on public.trazadoc_documents is
  'QUALITY-01.1 · Los documentos de TrazaDocs pertenecen a un unico modulo: cpr, textiles o quality. El motor es transversal; el aislamiento entre modulos lo da esta columna, fijada SIEMPRE en servidor.';


-- ---------------------------------------------------------------------------
-- §2 · Ciclo de vida del Cargo: eliminar lo que no dejo rastro
-- ---------------------------------------------------------------------------
-- Las FK que apuntan a quality_positions se declararon en 0112 con
-- ON DELETE RESTRICT:
--
--   quality_position_assignments_position_fk  → restrict
--   quality_processes_owner_position_fk       → restrict
--
-- Es decir: la BASE ya impide borrar un cargo con asignaciones o con procesos
-- a su nombre. Anadir la politica no debilita nada — solo permite que la
-- operacion LLEGUE a la base, donde la restriccion decide. Un cargo con
-- historico produce 23503 (foreign_key_violation) y la aplicacion lo traduce
-- a "tiene informacion asociada; se desactiva en su lugar".
--
-- Se limita a admin/quality: la misma autoridad que crea y edita cargos.

create policy quality_positions_delete on public.quality_positions
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

comment on table public.quality_positions is
  'Cargo: sujeto ESTABLE de la responsabilidad del SGC (T-02). Un cargo EN USO no se borra —lo impiden las FK ON DELETE RESTRICT de 0112— sino que se desactiva, para no destruir el historico de propiedad de los procesos. Un cargo recien creado y sin referencias si puede eliminarse (QUALITY-01.1).';


-- ---------------------------------------------------------------------------
-- §3 · Aceptar una invitacion mira el plan VIGENTE, no la copia heredada
--
-- Defecto encontrado al probar el flujo de invitaciones de extremo a extremo.
--
-- PCR-01 estableció que el plan que decide qué puede hacer una empresa es el
-- EFECTIVO por módulos (organization_effective_plan_code, 0103), y no la copia
-- obsoleta de organization_subscriptions.plan_code. La corrección se aplicó a
-- la CREACIÓN de invitaciones (checkFeatureEnabled, en servidor), pero la
-- ACEPTACIÓN quedó en 0056 leyendo la columna heredada.
--
-- El resultado era un flujo partido por la mitad: una empresa con módulos en
-- Full podía crear la invitación y enviar el enlace, y la persona invitada
-- recibía «Las invitaciones y roles están disponibles en los planes Full y
-- Extra» al intentar aceptarla — porque su fila de organization_subscriptions
-- seguía diciendo 'demo'.
--
-- Se sustituye la función por la misma lógica, cambiando UNA cosa: de dónde
-- sale el plan. Los límites, los mensajes y el resto del comportamiento son
-- idénticos.
--
-- Además desaparece el `update ... set status = 'expired'` que precedía al
-- `raise exception`: la excepción deshace la transacción, así que ese cambio
-- nunca llegaba a guardarse. Escribir algo que se sabe que se va a revertir
-- solo sirve para confundir a quien lea el código después. La caducidad se
-- deriva de expires_at, que es el dato real.
-- ---------------------------------------------------------------------------

create or replace function public.accept_team_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user         uuid;
  v_user_email   text;
  v_inv          record;
  v_plan_code    text;
  v_plan_status  text;
  v_roles_limit  record;
  v_members_limit record;
  v_members_count integer;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'No autenticado';
  end if;

  select email into v_user_email from profiles where id = v_user;
  if v_user_email is null then
    raise exception 'El usuario no tiene perfil asociado';
  end if;

  select * into v_inv
  from team_invitations
  where token = p_token
  for update;

  if v_inv.id is null then
    raise exception 'La invitación no existe';
  end if;

  if v_inv.status = 'accepted' then
    raise exception 'Esta invitación ya fue aceptada';
  end if;

  if v_inv.status = 'revoked' then
    raise exception 'Esta invitación fue revocada';
  end if;

  if v_inv.status = 'expired' or v_inv.expires_at < now() then
    raise exception 'La invitación expiró';
  end if;

  if lower(v_user_email) <> v_inv.email then
    raise exception 'Esta invitación fue enviada a otro correo electrónico';
  end if;

  if exists (
    select 1 from memberships
    where organization_id = v_inv.organization_id and user_id = v_user
  ) then
    -- Ya es miembro: no se duplica la membresia, solo se cierra la invitacion.
    -- Sin chequeos de plan aqui, porque no se crea ningun registro nuevo.
    update team_invitations
      set status = 'accepted', accepted_by = v_user, accepted_at = now()
      where id = v_inv.id;
    return v_inv.organization_id;
  end if;

  -- El ESTADO comercial (suspendida / cancelada) sigue viniendo de
  -- organization_subscriptions: es donde vive, y no es un plan.
  select coalesce(status, 'active') into v_plan_status
  from organization_subscriptions
  where organization_id = v_inv.organization_id;
  v_plan_status := coalesce(v_plan_status, 'active');

  if v_plan_status = 'suspended' then
    raise exception 'La cuenta de esta empresa está suspendida. Contacta al equipo de Trazaloop.';
  end if;
  if v_plan_status = 'cancelled' then
    raise exception 'La cuenta de esta empresa no está activa. Contacta al equipo de Trazaloop.';
  end if;

  -- EL CAMBIO: el plan sale del acceso REAL por módulos, igual que en la
  -- creación de la invitación. Es la empresa de LA INVITACIÓN, no la de quien
  -- acepta.
  v_plan_code := coalesce(public.organization_effective_plan_code(v_inv.organization_id), 'demo');

  select limit_value, is_unlimited into v_roles_limit
  from plan_limits
  where plan_code = v_plan_code and resource_code = 'roles_enabled';

  if v_roles_limit is not null and not v_roles_limit.is_unlimited and coalesce(v_roles_limit.limit_value, 0) <= 0 then
    raise exception 'Las invitaciones y roles están disponibles en los planes Full y Extra.';
  end if;

  select limit_value, is_unlimited into v_members_limit
  from plan_limits
  where plan_code = v_plan_code and resource_code = 'team_members';

  if v_members_limit is not null and not v_members_limit.is_unlimited then
    select count(*) into v_members_count
    from memberships
    where organization_id = v_inv.organization_id and status = 'active';

    if v_members_count >= coalesce(v_members_limit.limit_value, 0) then
      raise exception 'Tu plan Demo alcanzó el límite para este recurso. Actualiza a Full o Extra para continuar creando registros.';
    end if;
  end if;

  insert into memberships (organization_id, user_id, role_code, status)
  values (v_inv.organization_id, v_user, v_inv.role_code, 'active');

  update team_invitations
    set status = 'accepted', accepted_by = v_user, accepted_at = now()
    where id = v_inv.id;

  perform log_event(
    v_inv.organization_id,
    'team_invitation_accepted',
    jsonb_build_object('role_code', v_inv.role_code),
    v_user
  );

  return v_inv.organization_id;
end;
$$;

revoke all on function public.accept_team_invitation(text) from public, anon;
grant execute on function public.accept_team_invitation(text) to authenticated;

comment on function public.accept_team_invitation(text) is
  'QUALITY-01.1 · Acepta una invitacion. El plan que decide se resuelve con organization_effective_plan_code (0103), no con la copia heredada de organization_subscriptions: antes una empresa con modulos Full podia crear la invitacion pero nadie podia aceptarla.';


-- ---------------------------------------------------------------------------
-- §4 · Nombres de las categorias base: en español correcto y en UNA sola fuente
--
-- 0112 sembro los nombres sin tildes («Estrategicos») porque las migraciones de
-- este repositorio evitan acentos en los COMENTARIOS — un criterio razonable
-- para el codigo fuente que se aplico por inercia a los DATOS, que sí acaban
-- en la pantalla de una persona.
--
-- Ademas habia dos fuentes que no coincidian: el nombre de la BD y un mapa de
-- etiquetas en el dominio, que decia «De apoyo» y «De gestion del sistema».
-- Dos verdades para lo mismo terminan divergiendo; se dejan las CONGELADAS
-- (Estrategicos / Misionales / Apoyo / Sistema) en ambas, y una prueba
-- comprueba que sigan de acuerdo.
--
-- Idempotente y solo sobre el catalogo GLOBAL: no toca ninguna categoria que
-- una empresa haya creado.
-- ---------------------------------------------------------------------------

-- El trigger de 0112 protege el catalogo base de CUALQUIER modificacion, y por
-- tanto tambien de esta. Su proposito es impedir que un CLIENTE lo altere —no
-- que la plataforma no pueda mantenerlo— asi que se afina: sigue bloqueando a
-- anon y authenticated, y deja pasar a los roles de mantenimiento, que son los
-- unicos que ejecutan migraciones. Es mas preciso que desactivar el trigger
-- alrededor del update, porque no abre una ventana en la que nadie lo vigila.
create or replace function public.protect_global_quality_process_categories()
returns trigger
language plpgsql
as $$
begin
  if (tg_op in ('UPDATE', 'DELETE')) and old.organization_id is null
     and current_user in ('anon', 'authenticated') then
    raise exception 'Las categorias de proceso del catalogo base de Trazaloop no se modifican ni se eliminan';
  end if;
  return coalesce(new, old);
end;
$$;

update public.quality_process_categories set name = 'Estratégicos'
 where organization_id is null and code = 'strategic' and name <> 'Estratégicos';
update public.quality_process_categories set name = 'Misionales'
 where organization_id is null and code = 'core' and name <> 'Misionales';
update public.quality_process_categories set name = 'Apoyo'
 where organization_id is null and code = 'support' and name <> 'Apoyo';
update public.quality_process_categories set name = 'Sistema'
 where organization_id is null and code = 'system' and name <> 'Sistema';


-- ---------------------------------------------------------------------------
-- §5 · PRIVILEGIOS
-- ---------------------------------------------------------------------------
-- No se crean tablas ni funciones nuevas, de modo que no hay privilegios
-- nuevos que conceder: 0112 ya concedio DELETE sobre quality_positions a
-- authenticated y revoco todo de anon. Se re-afirma la revocacion a anon como
-- defensa en profundidad, porque cambiar politicas es justo el momento en que
-- conviene volver a comprobarlo.

revoke all on table public.quality_positions from anon;
revoke truncate, references, trigger on table
  public.trazadoc_documents,
  public.trazadoc_blueprints
from anon, authenticated;
