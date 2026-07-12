-- 0016_security_hardening.sql
-- Trazaloop · Sprint 1.1 · Endurecimiento de seguridad.
-- Migración incremental: no reescribe migraciones anteriores.
-- ORDEN: corre DESPUÉS de 0015_storage.sql — 0015 crea las políticas base del
-- bucket `evidences` y esta migración las REEMPLAZA (drop/recreate) por
-- versiones seguras con safe_uuid.
--
-- Correcciones:
--   1. log_event() deja de ser invocable por clientes (era contaminable).
--   2. Privilegios explícitos para TODAS las funciones (revoke de PUBLIC).
--   3. safe_uuid() para parsing seguro de rutas de Storage (negar, no romper).
--   4. force_created_by(): un cliente no puede atribuir autoría ajena.

-- ---------------------------------------------------------------------------
-- 1. log_event(): función INTERNA. Solo la invocan funciones SECURITY DEFINER
--    (create_organization) y, en el futuro, triggers. La escritura general en
--    audit_log ya la hace audit_row_change() vía trigger. Si algún día se
--    necesita registrar eventos desde cliente, se creará log_user_event() con
--    validación de membership, actor forzado a auth.uid() y lista blanca de
--    tipos de evento — NO reabrir esta función.
--    Nota: create_organization sigue funcionando porque, al ser SECURITY
--    DEFINER, ejecuta log_event con los privilegios de su dueño.
-- ---------------------------------------------------------------------------
revoke execute on function public.log_event(uuid, text, jsonb, uuid) from public;
revoke execute on function public.log_event(uuid, text, jsonb, uuid) from anon;
revoke execute on function public.log_event(uuid, text, jsonb, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Privilegios explícitos por función.
--    Regla: Postgres concede EXECUTE a PUBLIC por defecto al crear funciones;
--    aquí se revoca todo y se concede solo lo necesario.
--
--    · Helpers usados por políticas RLS (se evalúan como el rol consultante,
--      p. ej. authenticated): DEBEN quedar ejecutables por authenticated.
--    · Funciones de trigger: no necesitan EXECUTE del usuario que dispara el
--      trigger (Postgres lo verifica al crear el trigger, como dueño), así
--      que se cierran del todo para clientes.
--    · RPCs de negocio: authenticated sí, anon no.
-- ---------------------------------------------------------------------------

-- Helpers de políticas RLS y UI → authenticated.
revoke execute on function public.is_org_member(uuid)        from public, anon;
grant  execute on function public.is_org_member(uuid)        to authenticated;

revoke execute on function public.has_org_role(uuid, text[]) from public, anon;
grant  execute on function public.has_org_role(uuid, text[]) to authenticated;

revoke execute on function public.is_org_admin(uuid)         from public, anon;
grant  execute on function public.is_org_admin(uuid)         to authenticated;

revoke execute on function public.shares_org_with(uuid)      from public, anon;
grant  execute on function public.shares_org_with(uuid)      to authenticated;

-- Pura y de dominio (la usará el diagnóstico en Sprint 2) → authenticated.
revoke execute on function public.answer_weight(diagnostic_answer) from public, anon;
grant  execute on function public.answer_weight(diagnostic_answer) to authenticated;

-- Funciones de trigger e internas → sin acceso de cliente.
revoke execute on function public.handle_new_user()  from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.forbid_mutation()  from public, anon, authenticated;
revoke execute on function public.set_updated_at()   from public, anon, authenticated;

-- RPC de onboarding → authenticated (la función valida auth.uid() de todos modos).
revoke execute on function public.create_organization(text, text, text) from public, anon;
grant  execute on function public.create_organization(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Parsing seguro de rutas de Storage.
--    El cast directo ((storage.foldername(name))[1])::uuid lanza error con
--    rutas cuyo primer segmento no es un UUID. safe_uuid devuelve NULL en ese
--    caso y las políticas NIEGAN (is_org_member(null) = false) sin romper.
-- ---------------------------------------------------------------------------
create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null
     or value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return null;
  end if;
  return value::uuid;
end;
$$;

-- Las políticas de Storage son `to authenticated`: basta ese grant.
revoke execute on function public.safe_uuid(text) from public, anon;
grant  execute on function public.safe_uuid(text) to authenticated;

-- Recrear las políticas del bucket `evidences` usando safe_uuid.
drop policy if exists evidences_select on storage.objects;
drop policy if exists evidences_insert on storage.objects;

create policy evidences_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'evidences'
    and public.is_org_member(public.safe_uuid((storage.foldername(name))[1]))
  );

create policy evidences_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'evidences'
    and public.has_org_role(
      public.safe_uuid((storage.foldername(name))[1]),
      array['admin', 'quality', 'consultant']
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Autoría no falsificable: si hay usuario autenticado, created_by SIEMPRE
--    es auth.uid(), ignorando lo que envíe el cliente. En contextos sin
--    auth.uid() (service_role de servidor) se respeta el valor provisto.
-- ---------------------------------------------------------------------------
create or replace function public.force_created_by()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke execute on function public.force_created_by() from public, anon, authenticated;

create trigger t_sites_force_created_by
  before insert on public.sites
  for each row execute function public.force_created_by();

create trigger t_organizations_force_created_by
  before insert on public.organizations
  for each row execute function public.force_created_by();

-- Nota para Sprint 2: adjuntar t_<tabla>_force_created_by a TODA tabla nueva
-- con created_by (materiales, proveedores, lotes, etc.) en su migración.
