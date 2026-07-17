-- 0066_legal_documents_and_acceptances.sql
-- Trazaloop · Sprint 10D · Consentimiento legal básico.
--
-- legal_documents: catálogo de documentos legales versionados (términos,
-- privacidad, tratamiento de datos). SELECT abierto a `anon` para los
-- documentos activos — es la ÚNICA tabla del proyecto legible sin sesión,
-- porque /terms y /privacy son páginas públicas (Parte 5/14). A lo sumo
-- UN documento 'active' por tipo a la vez (índice único parcial): "el
-- documento activo" nunca es ambiguo.
--
-- user_legal_acceptances: quién aceptó qué versión y cuándo. Nunca se
-- actualiza ni se borra — cada aceptación es un hecho histórico.

create table public.legal_documents (
  id            uuid primary key default gen_random_uuid(),
  document_type text not null,
  version       text not null,
  title         text not null,
  content       text not null,
  status        text not null default 'active',
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint legal_documents_document_type_check check (document_type in ('terms', 'privacy', 'data_processing')),
  constraint legal_documents_status_check check (status in ('draft', 'active', 'archived')),
  constraint legal_documents_type_version_uniq unique (document_type, version)
);

-- A lo sumo un documento activo por tipo — evita cualquier ambigüedad
-- sobre "cuál es el documento vigente" al calcular si alguien ya aceptó.
create unique index legal_documents_one_active_per_type
  on public.legal_documents (document_type)
  where status = 'active';

create trigger t_legal_documents_updated
  before update on public.legal_documents
  for each row execute function public.set_updated_at();

alter table public.legal_documents enable row level security;

-- Único SELECT público del proyecto (sin sesión): /terms y /privacy son
-- páginas públicas y deben poder mostrar el documento activo a
-- cualquiera, incluido un visitante sin cuenta.
create policy legal_documents_select_public on public.legal_documents
  for select to anon, authenticated
  using (status = 'active');

-- Ningún usuario normal ni platform_staff regular puede escribir aquí
-- todavía (Parte 12: "en este sprint no hace falta UI de administración
-- legal") — solo superadmin, por si hace falta publicar una versión
-- nueva a mano.
create policy legal_documents_insert on public.legal_documents
  for insert to authenticated
  with check (public.is_platform_superadmin());

create policy legal_documents_update on public.legal_documents
  for update to authenticated
  using (public.is_platform_superadmin())
  with check (public.is_platform_superadmin());

-- Sin DELETE (deny-by-default): un documento legal nunca se borra, se
-- archiva (status='archived').

insert into public.legal_documents (document_type, version, title, content, status, published_at) values
(
  'terms',
  'v1',
  'Términos de uso de Trazaloop (versión preliminar)',
  E'Esta es una versión preliminar de los términos de uso de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.\n\n'
  || E'1. Trazaloop es una plataforma para gestionar trazabilidad, documentación técnica (TrazaDocs), evidencias y cálculo de contenido reciclado en procesos asociados a NTC 6632 y UNE-EN 15343.\n\n'
  || E'2. Trazaloop no garantiza ni promete la obtención de ninguna certificación. La plataforma ofrece soporte técnico y herramientas de revisión técnica para organizar la información de tu producto objetivo; la evaluación y decisión de certificación, si aplica, corresponde siempre a un organismo externo independiente de Trazaloop.\n\n'
  || E'3. El uso de la plataforma está sujeto a los planes y límites vigentes (Demo, Full, Extra) descritos dentro de la plataforma. Trazaloop puede suspender el acceso de una cuenta que incumpla estos términos, sin perder los datos ya cargados.\n\n'
  || E'4. Este documento es una versión preliminar y puede actualizarse antes del lanzamiento definitivo. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.',
  'active',
  now()
),
(
  'privacy',
  'v1',
  'Política de privacidad de Trazaloop (versión preliminar)',
  E'Esta es una versión preliminar de la política de privacidad de Trazaloop, publicada para la beta / lanzamiento controlado de Trazaloop CPR.\n\n'
  || E'1. Trazaloop recopila los datos que registras dentro de la plataforma (datos de empresa, catálogos, evidencias, trazabilidad, documentos y tickets de soporte) con el único fin de operar el servicio para tu organización.\n\n'
  || E'2. Usamos tu información para: operar la plataforma, brindarte soporte técnico a través del Centro de soporte, proteger la seguridad de tu cuenta y de la de otras empresas (aislamiento entre organizaciones), y mejorar el servicio.\n\n'
  || E'3. No compartimos tus datos con terceros salvo cuando sea necesario para operar la plataforma (por ejemplo, el proveedor de infraestructura donde se aloja Trazaloop) o cuando la ley lo exija.\n\n'
  || E'4. Puedes solicitar información sobre tus datos o su eliminación contactando al equipo de Trazaloop desde el Centro de soporte.\n\n'
  || E'5. Este documento es una versión preliminar y puede actualizarse antes del lanzamiento definitivo. Se te pedirá aceptar cualquier versión nueva antes de continuar usando la plataforma.',
  'active',
  now()
);

-- ---------------------------------------------------------------------------
-- user_legal_acceptances
-- ---------------------------------------------------------------------------
create table public.user_legal_acceptances (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id),
  legal_document_id  uuid not null references public.legal_documents (id),
  document_type      text not null,
  version            text not null,
  accepted_at        timestamptz not null default now(),
  ip_address         text,
  user_agent         text,
  created_at         timestamptz not null default now(),

  constraint user_legal_acceptances_uniq unique (user_id, legal_document_id)
);

create index user_legal_acceptances_user_idx on public.user_legal_acceptances (user_id);

alter table public.user_legal_acceptances enable row level security;

create policy user_legal_acceptances_select on public.user_legal_acceptances
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_staff());

create policy user_legal_acceptances_insert on public.user_legal_acceptances
  for insert to authenticated
  with check (user_id = auth.uid());

-- Sin UPDATE/DELETE (deny-by-default): una aceptación es un hecho
-- histórico, nunca se modifica ni se borra.
