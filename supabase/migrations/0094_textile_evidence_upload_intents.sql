-- ============================================================================
-- Trazaloop · Sprint T9E.1 (Textil) · Intentos de carga directa de evidencias
-- ============================================================================
--
-- CONTEXTO: T9E subía el archivo DENTRO de una Server Action (los bytes
-- atravesaban Next.js). T9E.1 lo sustituye por carga DIRECTA del navegador
-- al bucket privado `evidences` con signed upload URL emitida en servidor.
-- Esta tabla registra cada INTENTO de carga para que la finalización pueda
-- verificar en servidor: quién lo creó, para qué organización, en qué ruta
-- EXACTA, con qué tamaño/MIME declarados, si expiró y si ya fue consumido.
--
-- Máquina de estados (limitada a propósito):
--   pending  → consumed   (finalización exitosa: nace la evidencia)
--   pending  → failed     (verificación/insert fallido; objeto pendiente de retiro)
--   pending  → expired    (venció sin finalizar; limpieza retira el objeto)
--   consumed → (INMUTABLE: jamás se reconsume ni se revierte)
--
-- La ruta del objeto es {organization_id}/textiles/{intent_id}/{safe_filename}
-- (el intent_id se convierte en el id de la evidencia al finalizar, de modo
-- que el trigger de 0077 sobre file_path sigue validando exactamente igual).
--
-- SEGURIDAD:
--   · RLS deny-by-default; CERO políticas para anon.
--   · Aislamiento por organización vía is_org_member/has_org_role.
--   · organization_id, created_by, bucket_id, object_path y los datos
--     declarados son INMUTABLES tras crear (trigger sin SECURITY DEFINER:
--     aplica también a service_role, patrón 0077/0093).
--   · Un intento consumido no puede modificarse ni borrarse.
--   · CHECK de ruta: object_path SIEMPRE bajo el prefijo de SU organización.
--   · El token de carga firmado NO se almacena (lo emite Storage y viaja
--     una sola vez al cliente).
--
-- ROLLBACK (solo si se abandona la carga directa):
--   drop trigger trg_guard_textile_evidence_upload_intent on public.textile_evidence_upload_intents;
--   drop function public.guard_textile_evidence_upload_intent();
--   drop table public.textile_evidence_upload_intents;
--   (Los objetos provisionales bajo {org}/textiles/{intent}/ se retiran con
--    scripts/cleanup-textile-upload-intents.ts ANTES del drop.)
-- ============================================================================

create table public.textile_evidence_upload_intents (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  created_by          uuid not null references auth.users(id),
  bucket_id           text not null default 'evidences',
  object_path         text not null unique,
  original_filename   text not null,
  safe_filename       text not null,
  expected_size_bytes bigint not null,
  expected_mime_type  text not null,
  status              text not null default 'pending',
  expires_at          timestamptz not null,
  consumed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint textile_upload_intents_status_check
    check (status in ('pending', 'consumed', 'expired', 'failed')),
  -- Límite funcional máximo (20 MB) también en BD: fuente de verdad espejada.
  constraint textile_upload_intents_size_check
    check (expected_size_bytes > 0 and expected_size_bytes <= 20 * 1024 * 1024),
  constraint textile_upload_intents_expiry_check
    check (expires_at > created_at),
  constraint textile_upload_intents_consumed_check
    check ((status = 'consumed') = (consumed_at is not null)),
  constraint textile_upload_intents_bucket_check
    check (bucket_id = 'evidences'),
  -- La ruta jamás puede apuntar fuera de la organización del intento.
  constraint textile_upload_intents_path_check
    check (position(organization_id::text || '/textiles/' in object_path) = 1)
);

comment on table public.textile_evidence_upload_intents is
  'Intentos de carga DIRECTA de evidencias textiles (T9E.1): el servidor fija ruta y límites, el navegador sube a Storage con signed upload URL y la finalización verifica el objeto real antes de crear la evidencia.';
comment on column public.textile_evidence_upload_intents.object_path is
  'Ruta EXACTA e inmutable en el bucket privado: {organization_id}/textiles/{intent_id}/{safe_filename}.';
comment on column public.textile_evidence_upload_intents.expires_at is
  'Vencimiento del intento (TTL corto). Vencido y sin consumir → limpieza retira el objeto provisional.';

create index textile_upload_intents_org_status_idx
  on public.textile_evidence_upload_intents (organization_id, status);
create index textile_upload_intents_expires_idx
  on public.textile_evidence_upload_intents (expires_at)
  where status = 'pending';

create trigger t_textile_upload_intents_updated
  before update on public.textile_evidence_upload_intents
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS (deny-by-default; sin políticas para anon)
-- ----------------------------------------------------------------------------
alter table public.textile_evidence_upload_intents enable row level security;

create policy textile_upload_intents_select on public.textile_evidence_upload_intents
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy textile_upload_intents_insert on public.textile_evidence_upload_intents
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['admin', 'quality', 'consultant'])
    and created_by = auth.uid()
  );

create policy textile_upload_intents_update on public.textile_evidence_upload_intents
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin', 'quality', 'consultant']))
  with check (public.has_org_role(organization_id, array['admin', 'quality', 'consultant']));

-- Los intentos consumidos son historia: jamás se borran desde clientes.
create policy textile_upload_intents_delete on public.textile_evidence_upload_intents
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['admin', 'quality', 'consultant'])
    and status <> 'consumed'
  );

-- ----------------------------------------------------------------------------
-- Guard de inmutabilidad y máquina de estados (SIN security definer a
-- propósito: obliga también a service_role, patrón 0077/0093).
-- ----------------------------------------------------------------------------
create or replace function public.guard_textile_evidence_upload_intent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'consumed' then
      raise exception 'Un intento de carga consumido no puede eliminarse';
    end if;
    return old;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.created_by is distinct from old.created_by
     or new.bucket_id is distinct from old.bucket_id
     or new.object_path is distinct from old.object_path
     or new.original_filename is distinct from old.original_filename
     or new.safe_filename is distinct from old.safe_filename
     or new.expected_size_bytes is distinct from old.expected_size_bytes
     or new.expected_mime_type is distinct from old.expected_mime_type
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at then
    raise exception
      'Los datos declarados de un intento de carga son inmutables';
  end if;

  if old.status = 'consumed' then
    raise exception 'Un intento de carga consumido es inmutable';
  end if;

  if new.status = 'consumed' and old.status <> 'pending' then
    raise exception 'Solo un intento pendiente puede consumirse';
  end if;

  if new.status not in ('pending', 'consumed', 'expired', 'failed') then
    raise exception 'Estado de intento no válido';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_textile_evidence_upload_intent()
  from public, anon, authenticated;

create trigger trg_guard_textile_evidence_upload_intent
  before update or delete on public.textile_evidence_upload_intents
  for each row execute function public.guard_textile_evidence_upload_intent();
