-- 0018_diagnostics_yes_no.sql
-- Trazaloop · Sprint 2 · Diagnóstico cerrado de preparación (Sí/No).
--
-- NOTA: el enum diagnostic_answer y answer_weight() (Sprint 1) NO se usan en
-- este modelo; quedan sin uso por compatibilidad. Las respuestas son boolean:
-- Sí = true (mayor preparación), No = false. Observaciones opcionales.
-- El resultado habla de "nivel de preparación", nunca de certificación.

-- ---------------------------------------------------------------------------
-- diagnostic_sections (catálogo global sembrable — seed en 0022)
-- ---------------------------------------------------------------------------
create table public.diagnostic_sections (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  title       text not null,
  description text,
  order_index integer not null default 0,
  weight      numeric(6,3) not null default 1
);

-- ---------------------------------------------------------------------------
-- diagnostic_questions (catálogo global sembrable — seed en 0022)
-- ---------------------------------------------------------------------------
create table public.diagnostic_questions (
  id                 uuid primary key default gen_random_uuid(),
  section_id         uuid not null references public.diagnostic_sections (id),
  requirement_id     uuid references public.requirements (id),
  code               text not null unique,
  question_text      text not null,
  help_text          text,
  standard_refs      text[] not null default '{}',
  weight             numeric(6,3) not null default 1,
  is_critical        boolean not null default false,
  order_index        integer not null default 0,
  recommended_action text,
  is_active          boolean not null default true
);

create index diagnostic_questions_section_idx on public.diagnostic_questions (section_id, order_index);

-- ---------------------------------------------------------------------------
-- diagnostics (instancia por empresa)
-- ---------------------------------------------------------------------------
create table public.diagnostics (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  status           diagnostic_status not null default 'in_progress',
  maturity_percent numeric(7,4),
  readiness_level  text,
  critical_gaps    integer not null default 0,
  section_scores   jsonb not null default '{}',
  started_by       uuid not null references public.profiles (id),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint diagnostics_org_id_uniq unique (organization_id, id),
  constraint diagnostics_maturity_range
    check (maturity_percent is null or (maturity_percent >= 0 and maturity_percent <= 100)),
  constraint diagnostics_readiness_level_check
    check (readiness_level is null
           or readiness_level in ('low','medium','high','audit_ready_candidate'))
);

create index diagnostics_org_idx on public.diagnostics (organization_id, started_at desc);

create trigger t_diagnostics_updated
  before update on public.diagnostics
  for each row execute function public.set_updated_at();

-- Un diagnóstico completado no se edita ni se borra (histórico).
create or replace function public.lock_completed_diagnostic()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'completed' then
    raise exception 'Un diagnóstico completado no puede modificarse ni eliminarse';
  end if;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.lock_completed_diagnostic() from public, anon, authenticated;

create trigger t_diagnostics_lock_completed
  before update or delete on public.diagnostics
  for each row execute function public.lock_completed_diagnostic();

-- ---------------------------------------------------------------------------
-- diagnostic_answers (respuestas Sí/No por instancia)
-- ---------------------------------------------------------------------------
create table public.diagnostic_answers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  diagnostic_id   uuid not null,
  question_id     uuid not null references public.diagnostic_questions (id),
  answer          boolean not null,
  observations    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint diagnostic_answers_diag_question_uniq unique (diagnostic_id, question_id),
  constraint diagnostic_answers_org_id_uniq unique (organization_id, id),
  -- FK compuesta: la respuesta pertenece al diagnóstico DE LA MISMA empresa.
  constraint diagnostic_answers_diagnostic_fk
    foreign key (organization_id, diagnostic_id)
    references public.diagnostics (organization_id, id)
    on delete cascade
);

create index diagnostic_answers_diag_idx on public.diagnostic_answers (diagnostic_id);
create index diagnostic_answers_org_idx  on public.diagnostic_answers (organization_id);

create trigger t_diagnostic_answers_updated
  before update on public.diagnostic_answers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.diagnostic_sections  enable row level security;
alter table public.diagnostic_questions enable row level security;
alter table public.diagnostics          enable row level security;
alter table public.diagnostic_answers   enable row level security;

-- Catálogos globales: lectura autenticada, sin escritura de cliente.
create policy diagnostic_sections_select on public.diagnostic_sections
  for select to authenticated using (true);

create policy diagnostic_questions_select on public.diagnostic_questions
  for select to authenticated using (true);

-- diagnostics: miembros activos leen/crean/actualizan; borrar solo
-- admin/quality y solo en progreso (completados: bloqueado también por trigger).
create policy diagnostics_select on public.diagnostics
  for select to authenticated using (public.is_org_member(organization_id));

create policy diagnostics_insert on public.diagnostics
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy diagnostics_update on public.diagnostics
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy diagnostics_delete on public.diagnostics
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['admin','quality'])
    and status = 'in_progress'
  );

-- diagnostic_answers: escritura solo mientras el diagnóstico está en progreso.
create policy diagnostic_answers_select on public.diagnostic_answers
  for select to authenticated using (public.is_org_member(organization_id));

create policy diagnostic_answers_insert on public.diagnostic_answers
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.diagnostics d
      where d.id = diagnostic_id
        and d.organization_id = diagnostic_answers.organization_id
        and d.status = 'in_progress'
    )
  );

create policy diagnostic_answers_update on public.diagnostic_answers
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.diagnostics d
      where d.id = diagnostic_id
        and d.organization_id = diagnostic_answers.organization_id
        and d.status = 'in_progress'
    )
  )
  with check (public.is_org_member(organization_id));

create policy diagnostic_answers_delete on public.diagnostic_answers
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.diagnostics d
      where d.id = diagnostic_id
        and d.organization_id = diagnostic_answers.organization_id
        and d.status = 'in_progress'
    )
  );

-- El cálculo del resultado (puntaje ponderado, brechas críticas y nivel de
-- preparación) se implementa como función pura en la aplicación
-- (lib/diagnostic/scoring.ts) invocada por la Server Action de completar,
-- con verificación en servidor de que TODAS las preguntas activas fueron
-- respondidas. Reglas de nivel: ver README y tests/diagnostic/scoring.test.ts.
