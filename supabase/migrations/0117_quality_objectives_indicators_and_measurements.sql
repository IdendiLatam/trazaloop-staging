-- 0117_quality_objectives_indicators_and_measurements.sql
-- Trazaloop Quality · QUALITY-03 · Objetivos, metas, indicadores, mediciones
-- y desempeño.
--
-- ============================================================================
-- ALCANCE
-- ============================================================================
-- Tercer vertical funcional de Trazaloop Quality. Implementa la cadena
-- congelada por OI-01 … OI-33:
--
--     OBJETIVO → INDICADOR → META → MEDICIÓN → EVALUACIÓN → TENDENCIA
--
-- y mantiene separados los cinco conceptos que un «módulo de KPIs» genérico
-- suele mezclar en una tabla y dos columnas.
--
-- NO incluye (deliberadamente aplazado): IA, predicción, benchmarking, no
-- conformidades, acciones correctivas, riesgos, auditorías, revisión por la
-- direccion, constructor universal de formulas, ETL generico ni scheduler.
--
-- ============================================================================
-- LAS CUATRO SEPARACIONES QUE ESTA MIGRACION SOSTIENE
-- ============================================================================
--
-- 1 · ESTADO ADMINISTRATIVO  ≠  DESEMPENO                            (OI-03)
--
--     quality_indicators.admin_state   = activo / suspendido / retirado
--     quality_measurements.evaluation  = cumple / atencion / no cumple
--
--     Un indicador ACTIVO puede NO CUMPLIR. Uno RETIRADO conserva que
--     CUMPLIA. Jamas un unico campo «status» para las dos cosas.
--
-- 2 · CONFIGURACION VERSIONADA  ≠  IDENTIDAD               (OI-06, OI-07, OI-17)
--
--     La meta, los umbrales, la unidad, la periodicidad, la direccion y la
--     formula viven en quality_indicator_configs, con vigencia. Cambiar la
--     meta manana NO reescribe la evaluacion de ayer: cada medicion apunta
--     a la CONFIGURACION que regia en su periodo.
--
-- 3 · CERO  ≠  SIN DATO  ≠  NO APLICA                       (OI-21, 10.5)
--
--     quality_measurements.value      numeric NULL
--     quality_measurements.data_state reported | no_data | not_applicable
--
--     Un valor 0 es una medicion. Un NULL no lo es. Y «no aplica» es una
--     tercera cosa. La restriccion CHECK impide confundirlas.
--
-- 4 · CALIDAD DEL DATO  ≠  DESEMPENO                        (OI-11, OI-31)
--
--     quality_measurements.data_quality ok | suspect | failed_source
--
--     Que una fuente falle es un problema TECNICO, no un mal desempeno. Una
--     fuente caida jamas produce «no cumple»: produce «sin dato» con la
--     calidad marcada.
--
-- ============================================================================
-- FUENTES AUTOMATICAS: EL CLIENTE NO PUEDE APORTAR UN VALOR
-- ============================================================================
-- OI-08 y OI-26 admiten fuentes manual / importada / integrada / derivada /
-- nativa. Este sprint implementa manual, calculada (derivada) y NATIVA.
--
-- Las nativas se calculan ENTERAMENTE EN SQL, dentro de
-- quality_run_indicator_calculation, a partir de un catalogo cerrado de claves
-- (§8). El cliente no envia un valor: envia la orden de calcular. No hay SQL
-- del usuario, no hay eval, no hay expresiones arbitrarias — y no existe forma
-- de fabricar una medicion automatica desde el navegador.
--
-- ============================================================================
-- CONVENCIONES DEL REPOSITORIO RESPETADAS
-- ============================================================================
--  · organization_id explicito en toda tabla tenant-owned (MDR-03).
--  · unique (organization_id, id) para habilitar FK COMPUESTAS.
--  · FK compuesta (organization_id, padre_id) -> padre(organization_id, id):
--    una fila hija NUNCA apunta a un padre de otra empresa (MDR-42).
--  · prevent_organization_id_change / force_created_by / set_updated_at /
--    audit_row_change adjuntados como en el resto del proyecto.
--  · RLS deny-by-default y PRIVILEGIOS EXPLICITOS por tabla (leccion de Q0,
--    convencion de 0111 · 0112 §12 · 0116 §10). Sin ALTER DEFAULT PRIVILEGES.
--
-- ROLLBACK: docs/quality/quality-03/QUALITY_03_ROLLBACK.md
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §0 · Un ayudante con el nombre correcto
--
-- 0116 introdujo trazadoc_current_org_role() para resolver el rol del usuario
-- en una empresa. La funcion no tiene nada de documental: la necesitan tambien
-- los objetivos y los indicadores. En vez de duplicarla con otro prefijo, se
-- crea la version transversal y la documental pasa a delegar en ella — mismo
-- comportamiento, una sola implementacion (MDR-50). 0116 no se toca: se
-- reemplaza el CUERPO de su funcion desde aqui, que es lo que una migracion
-- posterior puede hacer.
-- ----------------------------------------------------------------------------
create or replace function public.current_org_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role_code from memberships m
   where m.organization_id = p_organization_id
     and m.user_id = auth.uid()
     and m.status = 'active';
$$;
revoke all on function public.current_org_role(uuid) from public, anon, authenticated;

create or replace function public.trazadoc_current_org_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.current_org_role(p_organization_id);
$$;
revoke all on function public.trazadoc_current_org_role(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- §1 · quality_objectives — QUE queremos lograr
--
-- OI-02: los objetivos pueden ser jerarquicos SIN cascada obligatoria, asi que
-- parent_objective_id es opcional y no impone nada.
-- OI-03: admin_state es SOLO administrativo. El desempeno se deriva de los
-- indicadores y vive en la vista de §9, jamas en una columna de esta tabla.
-- ----------------------------------------------------------------------------
create table public.quality_objectives (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete restrict,
  code                 text,
  name                 text not null,
  description          text,
  purpose              text,
  parent_objective_id  uuid,
  -- ESTADO ADMINISTRATIVO. No dice nada sobre si el objetivo se cumple.
  admin_state          text not null default 'draft',
  -- Horizonte de gestion (T-01 · MDR-07): vigencia de negocio, no de sistema.
  period_start         date not null,
  period_end           date not null,
  -- MDR-33 · La responsabilidad PERSISTENTE apunta a un CARGO. La persona se
  -- resuelve por la asignacion vigente, de modo que cambiar de titular no
  -- descoloca el objetivo. owner_profile_id existe para las empresas que aun
  -- no trabajan por cargos.
  owner_position_id    uuid,
  owner_profile_id     uuid references public.profiles (id),
  -- OI-18 · El estado automatico del objetivo es CONFIGURABLE y EXPLICABLE.
  -- No se inventa ponderacion: OI no la define, asi que se ofrecen dos reglas
  -- explicitas y se explica cual mando en cada caso.
  evaluation_rule      text not null default 'worst_indicator',
  closure_note         text,
  closed_at            timestamptz,
  closed_by            uuid references public.profiles (id),
  created_by           uuid references public.profiles (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint quality_objectives_org_id_uniq unique (organization_id, id),
  constraint quality_objectives_name_not_blank check (length(trim(name)) > 0),
  constraint quality_objectives_period_check check (period_end >= period_start),
  constraint quality_objectives_admin_state_check
    check (admin_state in ('draft', 'active', 'suspended', 'closed', 'cancelled')),
  constraint quality_objectives_evaluation_rule_check
    check (evaluation_rule in ('worst_indicator', 'majority_comply')),
  constraint quality_objectives_parent_fk
    foreign key (organization_id, parent_objective_id)
    references public.quality_objectives (organization_id, id) on delete restrict,
  constraint quality_objectives_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict
);

create unique index quality_objectives_org_code_uniq
  on public.quality_objectives (organization_id, lower(code)) where code is not null;
create index quality_objectives_org_state_idx
  on public.quality_objectives (organization_id, admin_state);
create index quality_objectives_org_period_idx
  on public.quality_objectives (organization_id, period_start, period_end);
create index quality_objectives_owner_position_idx
  on public.quality_objectives (owner_position_id) where owner_position_id is not null;

create trigger t_quality_objectives_updated
  before update on public.quality_objectives
  for each row execute function public.set_updated_at();
create trigger t_quality_objectives_org_immutable
  before update on public.quality_objectives
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_objectives_force_created_by
  before insert on public.quality_objectives
  for each row execute function public.force_created_by();
create trigger t_audit_quality_objectives
  after insert or update or delete on public.quality_objectives
  for each row execute function public.audit_row_change();

alter table public.quality_objectives enable row level security;

create policy quality_objectives_select on public.quality_objectives
  for select to authenticated using (public.is_org_member(organization_id));
create policy quality_objectives_insert on public.quality_objectives
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality']));
create policy quality_objectives_update on public.quality_objectives
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']))
  with check (public.has_org_role(organization_id, array['admin','quality']));
create policy quality_objectives_delete on public.quality_objectives
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

comment on table public.quality_objectives is
  'QUALITY-03 · Objetivo del sistema de gestion (OI-02). admin_state es SOLO administrativo: el desempeno se DERIVA de los indicadores en v_quality_objective_performance (OI-03, OI-18). La responsabilidad apunta a un CARGO (MDR-33).';


-- ----------------------------------------------------------------------------
-- §2 · quality_objective_processes — a que procesos aplica
--
-- Una tabla de relacion, no un arreglo de ids en JSON: un objetivo puede
-- aplicar a varios procesos y no se duplica el objetivo por proceso (MDR-10,
-- MDR-13). La FK compuesta amarra ambos extremos a la misma empresa.
-- ----------------------------------------------------------------------------
create table public.quality_objective_processes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  objective_id    uuid not null,
  process_id      uuid not null,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint quality_objective_processes_org_id_uniq unique (organization_id, id),
  constraint quality_objective_processes_uniq unique (objective_id, process_id),
  constraint quality_objective_processes_objective_fk
    foreign key (organization_id, objective_id)
    references public.quality_objectives (organization_id, id) on delete cascade,
  constraint quality_objective_processes_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete cascade
);

create index quality_objective_processes_objective_idx
  on public.quality_objective_processes (objective_id);
create index quality_objective_processes_process_idx
  on public.quality_objective_processes (process_id);

create trigger t_quality_objective_processes_org_immutable
  before update on public.quality_objective_processes
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_objective_processes_force_created_by
  before insert on public.quality_objective_processes
  for each row execute function public.force_created_by();

alter table public.quality_objective_processes enable row level security;

create policy quality_objective_processes_select on public.quality_objective_processes
  for select to authenticated using (public.is_org_member(organization_id));
create policy quality_objective_processes_insert on public.quality_objective_processes
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality']));
create policy quality_objective_processes_delete on public.quality_objective_processes
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));


-- ----------------------------------------------------------------------------
-- §3 · quality_indicators — IDENTIDAD estable del indicador
--
-- Aqui NO estan la meta, la unidad, la periodicidad ni la formula: todo eso
-- cambia con el tiempo y vive en la configuracion versionada (§4). Lo que esta
-- aqui es lo que NO cambia: quien es este indicador.
--
-- OI-25 · Un indicador puede medir la empresa, un objetivo, un proceso, una
-- etapa o una actividad. Este sprint implementa empresa y proceso; el resto
-- del enumerado queda declarado para no tener que migrar la columna despues.
-- OI-32 · Un indicador retirado conserva su historia y puede senalar sucesor.
-- ----------------------------------------------------------------------------
create table public.quality_indicators (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  code                    text,
  name                    text not null,
  description             text,
  scope_type              text not null default 'organization',
  scope_process_id        uuid,
  owner_position_id       uuid,
  owner_profile_id        uuid references public.profiles (id),
  -- ESTADO ADMINISTRATIVO, nunca desempeno (OI-03).
  admin_state             text not null default 'draft',
  successor_indicator_id  uuid,
  retired_at              timestamptz,
  retirement_reason       text,
  created_by              uuid references public.profiles (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint quality_indicators_org_id_uniq unique (organization_id, id),
  constraint quality_indicators_name_not_blank check (length(trim(name)) > 0),
  constraint quality_indicators_admin_state_check
    check (admin_state in ('draft', 'active', 'suspended', 'retired')),
  constraint quality_indicators_scope_type_check
    check (scope_type in ('organization', 'objective', 'process', 'stage', 'activity')),
  -- Un indicador de proceso apunta a un proceso; los demas, no.
  constraint quality_indicators_scope_consistent check (
    (scope_type = 'process' and scope_process_id is not null)
    or (scope_type <> 'process' and scope_process_id is null)
  ),
  constraint quality_indicators_retired_consistent check (
    (admin_state = 'retired' and retired_at is not null)
    or (admin_state <> 'retired' and retired_at is null)
  ),
  constraint quality_indicators_process_fk
    foreign key (organization_id, scope_process_id)
    references public.quality_processes (organization_id, id) on delete restrict,
  constraint quality_indicators_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_indicators_successor_fk
    foreign key (organization_id, successor_indicator_id)
    references public.quality_indicators (organization_id, id) on delete restrict
);

create unique index quality_indicators_org_code_uniq
  on public.quality_indicators (organization_id, lower(code)) where code is not null;
create index quality_indicators_org_state_idx
  on public.quality_indicators (organization_id, admin_state);
create index quality_indicators_process_idx
  on public.quality_indicators (scope_process_id) where scope_process_id is not null;

create trigger t_quality_indicators_updated
  before update on public.quality_indicators
  for each row execute function public.set_updated_at();
create trigger t_quality_indicators_org_immutable
  before update on public.quality_indicators
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_indicators_force_created_by
  before insert on public.quality_indicators
  for each row execute function public.force_created_by();
create trigger t_audit_quality_indicators
  after insert or update or delete on public.quality_indicators
  for each row execute function public.audit_row_change();

alter table public.quality_indicators enable row level security;

create policy quality_indicators_select on public.quality_indicators
  for select to authenticated using (public.is_org_member(organization_id));
create policy quality_indicators_insert on public.quality_indicators
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality']));
create policy quality_indicators_update on public.quality_indicators
  for update to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']))
  with check (public.has_org_role(organization_id, array['admin','quality']));
create policy quality_indicators_delete on public.quality_indicators
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));

comment on table public.quality_indicators is
  'QUALITY-03 · IDENTIDAD del indicador (OI-25, OI-32). La meta, la unidad, la periodicidad y la formula NO estan aqui: cambian con el tiempo y viven en quality_indicator_configs (OI-06, OI-07).';


-- ----------------------------------------------------------------------------
-- §4 · quality_indicator_configs — LA CONFIGURACION, CON VIGENCIA
--
-- Es la pieza que impide que cambiar la meta hoy reescriba la evaluacion de
-- ayer (OI-07). Cada medicion apunta a la configuracion que regia en SU
-- periodo, y una configuracion ya sustituida es INMUTABLE (§10.2).
--
-- OI-05 · La definicion EJECUTABLE del calculo (calc_definition, declarativa y
-- validada) esta separada de la formula legible por humanos (formula_text).
-- OI-17 · Un cambio de metodologia puede declarar una RUPTURA DE
-- COMPARABILIDAD, para que nadie compare peras con manzanas sin saberlo.
-- OI-20 · Un indicador agregado declara su metodo de consolidacion.
-- ----------------------------------------------------------------------------
create table public.quality_indicator_configs (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations (id) on delete restrict,
  indicator_id          uuid not null,
  version_number        integer not null,
  effective_from        date not null,
  effective_to          date,

  -- Presentacion y semantica de la magnitud. La unidad NO transforma el valor
  -- almacenado: es como se lee, no como se guarda.
  unit_code             text not null default 'percent',
  unit_label            text,

  -- OI-04 · La direccion es ESTRUCTURADA, no una convencion implicita.
  direction             text not null default 'higher_is_better',
  frequency             text not null default 'monthly',

  -- META y UMBRALES. Ambos opcionales: un indicador puede existir sin meta, y
  -- entonces su evaluacion es «sin meta» — que no es lo mismo que «no cumple».
  target_value          numeric,
  target_min            numeric,
  target_max            numeric,
  warning_value         numeric,
  warning_min           numeric,
  warning_max           numeric,

  -- OI-08 / OI-26 · Cada indicador declara COMO se alimenta.
  source_kind           text not null default 'manual',
  source_key            text,
  calc_definition       jsonb,
  formula_text          text,
  source_note           text,

  consolidation_method  text not null default 'none',
  comparability_break   boolean not null default false,
  comparability_note    text,
  change_note           text,
  created_by            uuid references public.profiles (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint quality_indicator_configs_org_id_uniq unique (organization_id, id),
  constraint quality_indicator_configs_version_uniq unique (indicator_id, version_number),
  constraint quality_indicator_configs_version_check check (version_number >= 1),
  constraint quality_indicator_configs_period_check
    check (effective_to is null or effective_to >= effective_from),
  constraint quality_indicator_configs_direction_check
    check (direction in ('higher_is_better', 'lower_is_better', 'within_range', 'exact')),
  constraint quality_indicator_configs_frequency_check
    check (frequency in ('daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'biannual', 'annual')),
  constraint quality_indicator_configs_source_kind_check
    check (source_kind in ('manual', 'calculated', 'native')),
  constraint quality_indicator_configs_consolidation_check
    check (consolidation_method in ('none', 'sum', 'average', 'last', 'min', 'max')),
  -- Una fuente nativa DEBE declarar su clave; una manual, jamas.
  constraint quality_indicator_configs_source_consistent check (
    (source_kind = 'native' and source_key is not null and calc_definition is null)
    or (source_kind = 'calculated' and calc_definition is not null and source_key is null)
    or (source_kind = 'manual' and source_key is null and calc_definition is null)
  ),
  -- Una meta de RANGO necesita sus dos extremos y no usa target_value; las
  -- demas usan target_value y no extremos. Sin esto, un rango a medio declarar
  -- produciria evaluaciones silenciosamente incorrectas.
  constraint quality_indicator_configs_target_shape check (
    (direction = 'within_range'
      and target_value is null
      and ((target_min is null and target_max is null)
           or (target_min is not null and target_max is not null and target_max >= target_min)))
    or (direction <> 'within_range' and target_min is null and target_max is null)
  ),
  constraint quality_indicator_configs_warning_shape check (
    (direction = 'within_range' and warning_value is null)
    or (direction <> 'within_range' and warning_min is null and warning_max is null)
  ),
  constraint quality_indicator_configs_indicator_fk
    foreign key (organization_id, indicator_id)
    references public.quality_indicators (organization_id, id) on delete cascade
);

create index quality_indicator_configs_indicator_idx
  on public.quality_indicator_configs (indicator_id, version_number desc);
create index quality_indicator_configs_effective_idx
  on public.quality_indicator_configs (indicator_id, effective_from, effective_to);
-- Una sola configuracion VIGENTE por indicador.
create unique index quality_indicator_configs_single_current
  on public.quality_indicator_configs (indicator_id) where effective_to is null;

create trigger t_quality_indicator_configs_updated
  before update on public.quality_indicator_configs
  for each row execute function public.set_updated_at();
create trigger t_quality_indicator_configs_org_immutable
  before update on public.quality_indicator_configs
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_indicator_configs_force_created_by
  before insert on public.quality_indicator_configs
  for each row execute function public.force_created_by();
create trigger t_audit_quality_indicator_configs
  after insert or update or delete on public.quality_indicator_configs
  for each row execute function public.audit_row_change();

alter table public.quality_indicator_configs enable row level security;

create policy quality_indicator_configs_select on public.quality_indicator_configs
  for select to authenticated using (public.is_org_member(organization_id));

-- Sin INSERT/UPDATE/DELETE por politica: publicar una configuracion nueva
-- cierra la anterior y abre la siguiente en una sola transaccion, y eso lo
-- hace quality_publish_indicator_config (§7.2). Conceder INSERT permitiria
-- dejar dos configuraciones vigentes o abrir un hueco en la linea temporal.

comment on table public.quality_indicator_configs is
  'QUALITY-03 · Configuracion VERSIONADA del indicador: meta, umbrales, unidad, periodicidad, direccion, fuente y formula, con vigencia (OI-06, OI-07). Una configuracion sustituida es INMUTABLE: es lo que impide que cambiar la meta hoy reescriba la evaluacion de ayer.';


-- ----------------------------------------------------------------------------
-- §5 · quality_objective_indicators — que indicadores miden que objetivo
-- ----------------------------------------------------------------------------
create table public.quality_objective_indicators (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  objective_id    uuid not null,
  indicator_id    uuid not null,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint quality_objective_indicators_org_id_uniq unique (organization_id, id),
  constraint quality_objective_indicators_uniq unique (objective_id, indicator_id),
  constraint quality_objective_indicators_objective_fk
    foreign key (organization_id, objective_id)
    references public.quality_objectives (organization_id, id) on delete cascade,
  constraint quality_objective_indicators_indicator_fk
    foreign key (organization_id, indicator_id)
    references public.quality_indicators (organization_id, id) on delete cascade
);

create index quality_objective_indicators_objective_idx
  on public.quality_objective_indicators (objective_id);
create index quality_objective_indicators_indicator_idx
  on public.quality_objective_indicators (indicator_id);

create trigger t_quality_objective_indicators_org_immutable
  before update on public.quality_objective_indicators
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_objective_indicators_force_created_by
  before insert on public.quality_objective_indicators
  for each row execute function public.force_created_by();

alter table public.quality_objective_indicators enable row level security;

create policy quality_objective_indicators_select on public.quality_objective_indicators
  for select to authenticated using (public.is_org_member(organization_id));
create policy quality_objective_indicators_insert on public.quality_objective_indicators
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality']));
create policy quality_objective_indicators_delete on public.quality_objective_indicators
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));


-- ----------------------------------------------------------------------------
-- §6 · quality_period_closures — CERRAR un ciclo de gestion
--
-- OI-24 y OI-27 · Un resultado preliminar y uno cerrado son cosas distintas.
-- Cerrar 2026 congela sus mediciones: no se corrigen ni se anaden nuevas sin
-- pasar por la reapertura formal, que exige motivo (OI-12: un cambio de fuente
-- despues del cierre dispara una revision CONTROLADA, no un recalculo
-- silencioso).
--
-- El cierre es por RANGO de fechas, no por «ano»: asi cierra igual de bien un
-- ejercicio anual, un semestre o un trimestre, y una medicion queda cerrada
-- cuando su periodo cae DENTRO del rango cerrado.
-- ----------------------------------------------------------------------------
create table public.quality_period_closures (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  label           text not null,
  period_start    date not null,
  period_end      date not null,
  note            text,
  closed_at       timestamptz not null default now(),
  closed_by       uuid references public.profiles (id),
  reopened_at     timestamptz,
  reopened_by     uuid references public.profiles (id),
  reopen_reason   text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint quality_period_closures_org_id_uniq unique (organization_id, id),
  constraint quality_period_closures_label_not_blank check (length(trim(label)) > 0),
  constraint quality_period_closures_period_check check (period_end >= period_start),
  -- Reabrir EXIGE motivo. Sin el, el cierre no significaria nada.
  constraint quality_period_closures_reopen_reason check (
    reopened_at is null or length(trim(coalesce(reopen_reason, ''))) > 0
  )
);

create index quality_period_closures_org_range_idx
  on public.quality_period_closures (organization_id, period_start, period_end);
-- Un mismo rango no se cierra dos veces mientras siga cerrado.
create unique index quality_period_closures_open_uniq
  on public.quality_period_closures (organization_id, period_start, period_end)
  where reopened_at is null;

create trigger t_quality_period_closures_updated
  before update on public.quality_period_closures
  for each row execute function public.set_updated_at();
create trigger t_quality_period_closures_org_immutable
  before update on public.quality_period_closures
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_period_closures_force_created_by
  before insert on public.quality_period_closures
  for each row execute function public.force_created_by();
create trigger t_audit_quality_period_closures
  after insert or update or delete on public.quality_period_closures
  for each row execute function public.audit_row_change();

alter table public.quality_period_closures enable row level security;

create policy quality_period_closures_select on public.quality_period_closures
  for select to authenticated using (public.is_org_member(organization_id));

-- Sin escritura por politica: cerrar y reabrir pasan por RPC (§7.6, §7.7).

/** ¿Cae este periodo dentro de un cierre vigente? */
create or replace function public.quality_period_is_closed(
  p_organization_id uuid, p_period_start date, p_period_end date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from quality_period_closures c
     where c.organization_id = p_organization_id
       and c.reopened_at is null
       and p_period_start >= c.period_start
       and p_period_end   <= c.period_end
  );
$$;
revoke all on function public.quality_period_is_closed(uuid, date, date) from public, anon, authenticated;
grant execute on function public.quality_period_is_closed(uuid, date, date) to authenticated;


-- ----------------------------------------------------------------------------
-- §7 · quality_calculation_runs — la huella de un calculo (OI-10)
--
-- Una medicion automatica sin trazabilidad de su calculo es un numero sin
-- procedencia. Cada ejecucion deja: que fuente, con que configuracion, sobre
-- que periodo, con que entradas, y si salio bien.
--
-- OI-31 · Un fallo de la fuente es un problema TECNICO. Se registra con
-- status='failed' y produce una medicion SIN DATO con la calidad marcada —
-- jamas un «no cumple», que seria acusar al negocio de un problema de tuberia.
-- ----------------------------------------------------------------------------
create table public.quality_calculation_runs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  indicator_id     uuid not null,
  config_id        uuid not null,
  period_start     date not null,
  period_end       date not null,
  source_kind      text not null,
  source_key       text,
  status           text not null,
  output_value     numeric,
  inputs           jsonb,
  error_text       text,
  ran_at           timestamptz not null default now(),
  ran_by           uuid references public.profiles (id),

  constraint quality_calculation_runs_org_id_uniq unique (organization_id, id),
  constraint quality_calculation_runs_status_check check (status in ('ok', 'failed')),
  constraint quality_calculation_runs_kind_check check (source_kind in ('calculated', 'native')),
  constraint quality_calculation_runs_period_check check (period_end >= period_start),
  constraint quality_calculation_runs_indicator_fk
    foreign key (organization_id, indicator_id)
    references public.quality_indicators (organization_id, id) on delete cascade,
  constraint quality_calculation_runs_config_fk
    foreign key (organization_id, config_id)
    references public.quality_indicator_configs (organization_id, id) on delete cascade
);

create index quality_calculation_runs_indicator_idx
  on public.quality_calculation_runs (indicator_id, ran_at desc);

create trigger t_quality_calculation_runs_org_immutable
  before update on public.quality_calculation_runs
  for each row execute function public.prevent_organization_id_change();

alter table public.quality_calculation_runs enable row level security;

create policy quality_calculation_runs_select on public.quality_calculation_runs
  for select to authenticated using (public.is_org_member(organization_id));

-- Sin escritura por politica: las escribe la RPC de calculo. Si el cliente
-- pudiera insertarlas, podria fabricar la procedencia de un numero.


-- ----------------------------------------------------------------------------
-- §8 · quality_measurements — EL DATO
--
-- OI-21 y 10.5 · value es NULLABLE a proposito y data_state distingue las tres
-- cosas que un sistema mal hecho confunde:
--
--     value = 0     data_state = 'reported'         →  se midio, y dio cero
--     value = NULL  data_state = 'no_data'          →  no se midio
--     value = NULL  data_state = 'not_applicable'   →  no aplica a este periodo
--
-- OI-07 · config_id apunta a la configuracion que regia EN ESTE PERIODO. No se
-- copia la meta: la configuracion es inmutable una vez sustituida, asi que la
-- FK preserva la meta aplicable mejor que un snapshot (MDR-36).
--
-- OI-09 y OI-28 · Corregir NO sobrescribe: crea una fila nueva y marca la
-- anterior como sustituida, con motivo. El valor originalmente registrado
-- sigue ahi, y se puede responder quien lo corrigio, cuando y por que.
-- ----------------------------------------------------------------------------
create table public.quality_measurements (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations (id) on delete restrict,
  indicator_id            uuid not null,
  config_id               uuid not null,

  -- PERIODO EXPLICITO (§15 del encargo). created_at no determina el periodo:
  -- una medicion de enero puede registrarse en marzo.
  period_label            text not null,
  period_start            date not null,
  period_end              date not null,

  value                   numeric,
  data_state              text not null default 'reported',
  data_quality            text not null default 'ok',

  source_kind             text not null,
  source_key              text,
  source_detail           jsonb,
  input_components        jsonb,
  calculation_run_id      uuid,

  measured_at             timestamptz not null default now(),

  -- Derivada SIEMPRE en servidor (OI-22): el navegador no la envia y, si la
  -- enviara, la RPC la ignora.
  evaluation              text not null default 'no_data',
  evaluation_explanation  text,

  result_state            text not null default 'preliminary',

  -- Correccion (OI-09, OI-28)
  corrects_measurement_id uuid,
  superseded_by_measurement_id uuid,
  correction_reason       text,
  -- is_current NO duplica a superseded_by: dicen cosas distintas. El segundo
  -- es LINAJE («quién ocupó su lugar»); el primero es la marca sobre la que se
  -- construye el índice de unicidad. Hacen falta las dos porque corregir es
  -- retirar una fila y añadir otra, y un índice único parcial no se puede
  -- diferir al final de la transacción: sin una marca que se pueda apagar
  -- ANTES de insertar la sustituta, las dos coexistirían un instante y el
  -- índice lo rechazaría.
  is_current              boolean not null default true,

  note                    text,
  created_by              uuid references public.profiles (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint quality_measurements_org_id_uniq unique (organization_id, id),
  constraint quality_measurements_period_check check (period_end >= period_start),
  constraint quality_measurements_label_not_blank check (length(trim(period_label)) > 0),
  constraint quality_measurements_data_state_check
    check (data_state in ('reported', 'no_data', 'not_applicable')),
  constraint quality_measurements_data_quality_check
    check (data_quality in ('ok', 'suspect', 'failed_source')),
  constraint quality_measurements_source_kind_check
    check (source_kind in ('manual', 'calculated', 'native')),
  constraint quality_measurements_evaluation_check
    check (evaluation in ('complies', 'attention', 'not_met', 'no_target', 'no_data')),
  constraint quality_measurements_result_state_check
    check (result_state in ('preliminary', 'closed')),
  -- LA restriccion que sostiene «cero no es sin dato»: si se reporto, hay
  -- valor; si no se reporto, no lo hay. Ni un NULL disfrazado de cero ni un
  -- cero disfrazado de ausencia.
  constraint quality_measurements_value_consistent check (
    (data_state = 'reported' and value is not null)
    or (data_state <> 'reported' and value is null)
  ),
  constraint quality_measurements_correction_reason check (
    corrects_measurement_id is null or length(trim(coalesce(correction_reason, ''))) > 0
  ),
  -- La direccion que importa: una medicion que YA TIENE sustituta no puede
  -- seguir siendo la vigente. La contraria no se exige a proposito, porque
  -- corregir apaga la anterior un instante antes de que exista la fila que la
  -- sustituye, y una CHECK no se puede diferir al final de la transaccion.
  -- El caso peligroso —dos vigentes -- lo impide el indice unico.
  constraint quality_measurements_current_consistent check (
    superseded_by_measurement_id is null or not is_current
  ),
  constraint quality_measurements_indicator_fk
    foreign key (organization_id, indicator_id)
    references public.quality_indicators (organization_id, id) on delete cascade,
  constraint quality_measurements_config_fk
    foreign key (organization_id, config_id)
    references public.quality_indicator_configs (organization_id, id) on delete restrict,
  constraint quality_measurements_run_fk
    foreign key (organization_id, calculation_run_id)
    references public.quality_calculation_runs (organization_id, id) on delete set null,
  constraint quality_measurements_corrects_fk
    foreign key (organization_id, corrects_measurement_id)
    references public.quality_measurements (organization_id, id) on delete restrict,
  constraint quality_measurements_superseded_fk
    foreign key (organization_id, superseded_by_measurement_id)
    references public.quality_measurements (organization_id, id) on delete restrict
);

create index quality_measurements_indicator_period_idx
  on public.quality_measurements (indicator_id, period_start desc);
create index quality_measurements_org_eval_idx
  on public.quality_measurements (organization_id, evaluation);
-- UNA medicion vigente por indicador y periodo. Las corregidas quedan, pero
-- con is_current en falso, asi que no compiten por este indice.
create unique index quality_measurements_current_uniq
  on public.quality_measurements (indicator_id, period_start, period_end)
  where is_current;

create trigger t_quality_measurements_updated
  before update on public.quality_measurements
  for each row execute function public.set_updated_at();
create trigger t_quality_measurements_org_immutable
  before update on public.quality_measurements
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_measurements_force_created_by
  before insert on public.quality_measurements
  for each row execute function public.force_created_by();
create trigger t_audit_quality_measurements
  after insert or update or delete on public.quality_measurements
  for each row execute function public.audit_row_change();

alter table public.quality_measurements enable row level security;

create policy quality_measurements_select on public.quality_measurements
  for select to authenticated using (public.is_org_member(organization_id));

-- Sin escritura por politica: registrar, calcular y corregir pasan por RPC.
-- Es lo que impide que el navegador fabrique una evaluacion o una medicion
-- automatica (§41 del encargo).

comment on table public.quality_measurements is
  'QUALITY-03 · La medicion (OI-10, OI-21, OI-27, OI-28). value NULL + data_state distinguen cero, sin dato y no aplica. config_id preserva la meta aplicable al periodo. Corregir crea una fila nueva y marca la anterior; el valor original nunca desaparece.';


-- ----------------------------------------------------------------------------
-- §9 · quality_measurement_evidence — REFERENCIAS, no copias
--
-- T-03 · Quality no crea un tercer motor de evidencias. Una medicion apunta a
-- lo que ya existe —un documento, una revision documental, un proceso— y nada
-- se copia entre motores (DA-17, MDR-12).
-- ----------------------------------------------------------------------------
create table public.quality_measurement_evidence (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  measurement_id  uuid not null,
  ref_type        text not null,
  ref_id          uuid,
  note            text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),

  constraint quality_measurement_evidence_org_id_uniq unique (organization_id, id),
  constraint quality_measurement_evidence_type_check
    check (ref_type in ('document', 'document_revision', 'process', 'note')),
  -- Una referencia apunta a algo; una nota, no.
  constraint quality_measurement_evidence_ref_consistent check (
    (ref_type = 'note' and ref_id is null and length(trim(coalesce(note, ''))) > 0)
    or (ref_type <> 'note' and ref_id is not null)
  ),
  constraint quality_measurement_evidence_measurement_fk
    foreign key (organization_id, measurement_id)
    references public.quality_measurements (organization_id, id) on delete cascade
);

create index quality_measurement_evidence_measurement_idx
  on public.quality_measurement_evidence (measurement_id);

create trigger t_quality_measurement_evidence_org_immutable
  before update on public.quality_measurement_evidence
  for each row execute function public.prevent_organization_id_change();
create trigger t_quality_measurement_evidence_force_created_by
  before insert on public.quality_measurement_evidence
  for each row execute function public.force_created_by();

alter table public.quality_measurement_evidence enable row level security;

create policy quality_measurement_evidence_select on public.quality_measurement_evidence
  for select to authenticated using (public.is_org_member(organization_id));
create policy quality_measurement_evidence_insert on public.quality_measurement_evidence
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_measurement_evidence_delete on public.quality_measurement_evidence
  for delete to authenticated
  using (public.has_org_role(organization_id, array['admin','quality']));


-- ----------------------------------------------------------------------------
-- §10 · work_events — EL EVENTO, la pieza que faltaba de la triada
--
-- AT-02 · Evento, Alerta y Tarea son cosas distintas. QUALITY-02 estreno la
-- Tarea y la Alerta; el Evento entra aqui porque OI-13 y 10.6 lo exigen
-- literalmente: quedar por debajo de la meta NO crea una no conformidad, crea
-- un EVENTO DE DESEMPENO para analisis y posible tratamiento.
--
-- AT-03 · Los eventos de negocio persistidos son INMUTABLES: append-only, sin
-- politicas de UPDATE ni DELETE.
--
-- Transversal como work_tasks y work_alerts, y acoplado al origen por contrato
-- —(source_domain, subject_type, subject_id)— y no por FK de dominio (AT-04):
-- riesgos, auditorias y acciones lo reutilizaran sin tocar esta tabla.
-- ----------------------------------------------------------------------------
create table public.work_events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  source_domain    text not null,
  event_type       text not null,
  subject_type     text not null,
  subject_id       uuid not null,
  subject_period   text,
  severity         text not null default 'info',
  summary          text not null,
  payload          jsonb,
  dedupe_key       text,
  occurred_at      timestamptz not null default now(),
  created_by       uuid references public.profiles (id),

  constraint work_events_org_id_uniq unique (organization_id, id),
  constraint work_events_summary_not_blank check (length(trim(summary)) > 0),
  constraint work_events_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint work_events_source_domain_check check (source_domain in ('document', 'indicator', 'objective')),
  constraint work_events_subject_type_check
    check (subject_type in ('trazadoc_document', 'quality_indicator', 'quality_objective')),
  constraint work_events_type_check check (event_type in (
    'indicator.target_missed', 'indicator.attention', 'indicator.recovered',
    'indicator.measurement_due', 'indicator.source_failed',
    'objective.at_risk'
  ))
);

create index work_events_subject_idx
  on public.work_events (organization_id, subject_type, subject_id, occurred_at desc);
create index work_events_org_type_idx
  on public.work_events (organization_id, event_type, occurred_at desc);
-- AT-07 · Un mismo hecho no se registra dos veces.
create unique index work_events_dedupe_uniq
  on public.work_events (organization_id, dedupe_key) where dedupe_key is not null;

alter table public.work_events enable row level security;

create policy work_events_select on public.work_events
  for select to authenticated using (public.is_org_member(organization_id));

-- Sin INSERT/UPDATE/DELETE por politica: append-only escrito por las RPC.

comment on table public.work_events is
  'QUALITY-03 · Evento de negocio TRANSVERSAL e inmutable (AT-02, AT-03). Quedar por debajo de la meta produce un evento de desempeno para analisis, NUNCA una no conformidad automatica (OI-13, 10.6). Acoplado por contrato, no por FK de dominio (AT-04).';


-- ----------------------------------------------------------------------------
-- §11 · Ampliacion ADITIVA de la bandeja de QUALITY-02
--
-- work_tasks y work_alerts se disenaron transversales en 0116 y este sprint es
-- el primero en demostrarlo: se amplian sus enumerados para admitir el dominio
-- de indicadores. No se crea indicator_alerts ni objective_alerts — que es
-- exactamente lo que el encargo prohibe y lo que MDR-46 evita.
--
-- Sustituir una CHECK enumerada no es modificar la migracion historica: 0116
-- sigue intacta y esta declara el estado nuevo de forma explicita (mismo
-- procedimiento que 0113 §1 con module_key).
-- ----------------------------------------------------------------------------
alter table public.work_tasks drop constraint if exists work_tasks_source_domain_check;
alter table public.work_tasks add constraint work_tasks_source_domain_check
  check (source_domain in ('document', 'indicator', 'objective'));

alter table public.work_tasks drop constraint if exists work_tasks_subject_type_check;
alter table public.work_tasks add constraint work_tasks_subject_type_check
  check (subject_type in ('trazadoc_document', 'quality_indicator', 'quality_objective'));

alter table public.work_tasks drop constraint if exists work_tasks_type_check;
alter table public.work_tasks add constraint work_tasks_type_check check (task_type in (
  'document_review', 'document_approval', 'document_changes_requested',
  'indicator_measurement_due', 'indicator_off_target'
));

alter table public.work_alerts drop constraint if exists work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document', 'indicator', 'objective'));

alter table public.work_alerts drop constraint if exists work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
  check (subject_type in ('trazadoc_document', 'quality_indicator', 'quality_objective'));

alter table public.work_alerts drop constraint if exists work_alerts_type_check;
alter table public.work_alerts add constraint work_alerts_type_check check (alert_type in (
  'document_review_requested', 'document_approval_requested',
  'document_changes_requested', 'document_approved', 'document_retired',
  'indicator_measurement_due', 'indicator_target_missed', 'objective_at_risk'
));


-- ----------------------------------------------------------------------------
-- §12 · PERIODOS — deterministas, nunca deducidos de created_at
--
-- Un periodo es un intervalo de fechas con nombre, y su calculo debe dar
-- siempre lo mismo para la misma frecuencia y la misma fecha. Sin esto,
-- «la medicion de enero» seria «la que se registro en enero», que no es lo
-- mismo y falla en cuanto alguien registra tarde (§15 del encargo).
-- ----------------------------------------------------------------------------
create or replace function public.quality_period_bounds(p_frequency text, p_ref date)
returns table (period_start date, period_end date, period_label text)
language plpgsql
immutable
as $$
declare
  v_year  integer := extract(year from p_ref)::integer;
  v_month integer := extract(month from p_ref)::integer;
  v_block integer;
begin
  case p_frequency
    when 'daily' then
      period_start := p_ref;
      period_end   := p_ref;
      period_label := to_char(p_ref, 'YYYY-MM-DD');
    when 'weekly' then
      period_start := (date_trunc('week', p_ref))::date;
      period_end   := period_start + 6;
      period_label := to_char(p_ref, 'IYYY') || '-S' || to_char(p_ref, 'IW');
    when 'monthly' then
      period_start := make_date(v_year, v_month, 1);
      period_end   := (period_start + interval '1 month - 1 day')::date;
      period_label := to_char(period_start, 'YYYY-MM');
    when 'bimonthly' then
      v_block      := ((v_month - 1) / 2);
      period_start := make_date(v_year, v_block * 2 + 1, 1);
      period_end   := (period_start + interval '2 months - 1 day')::date;
      period_label := v_year || '-B' || (v_block + 1);
    when 'quarterly' then
      v_block      := ((v_month - 1) / 3);
      period_start := make_date(v_year, v_block * 3 + 1, 1);
      period_end   := (period_start + interval '3 months - 1 day')::date;
      period_label := v_year || '-Q' || (v_block + 1);
    when 'biannual' then
      v_block      := ((v_month - 1) / 6);
      period_start := make_date(v_year, v_block * 6 + 1, 1);
      period_end   := (period_start + interval '6 months - 1 day')::date;
      period_label := v_year || '-S' || (v_block + 1);
    when 'annual' then
      period_start := make_date(v_year, 1, 1);
      period_end   := make_date(v_year, 12, 31);
      period_label := v_year::text;
    else
      raise exception 'Periodicidad no válida: %', p_frequency;
  end case;
  return next;
end;
$$;
revoke all on function public.quality_period_bounds(text, date) from public, anon, authenticated;
grant execute on function public.quality_period_bounds(text, date) to authenticated;

/** El periodo INMEDIATAMENTE ANTERIOR al que contiene p_ref. */
create or replace function public.quality_previous_period(p_frequency text, p_ref date)
returns table (period_start date, period_end date, period_label text)
language sql
immutable
as $$
  select b2.period_start, b2.period_end, b2.period_label
    from quality_period_bounds(p_frequency, p_ref) b1,
         lateral quality_period_bounds(p_frequency, b1.period_start - 1) b2;
$$;
revoke all on function public.quality_previous_period(text, date) from public, anon, authenticated;
grant execute on function public.quality_previous_period(text, date) to authenticated;


-- ----------------------------------------------------------------------------
-- §13 · EVALUACION — determinista y EXPLICABLE (OI-22)
--
-- El sistema deriva el resultado; el usuario no elige «esto está en rojo»
-- (§24 del encargo). Y no basta con derivarlo: hay que poder decir POR QUE,
-- porque una evaluacion que no se puede explicar no se puede defender ante un
-- auditor.
--
-- La direccion es estructurada (OI-04): `actual >= target` NO es la unica
-- regla. Un indicador de reclamos mejora bajando, y uno de temperatura mejora
-- quedandose dentro de un rango.
-- ----------------------------------------------------------------------------
create or replace function public.quality_evaluate_value(
  p_direction   text,
  p_target      numeric,
  p_target_min  numeric,
  p_target_max  numeric,
  p_warning     numeric,
  p_warning_min numeric,
  p_warning_max numeric,
  p_value       numeric,
  p_data_state  text
)
returns table (evaluation text, explanation text)
language plpgsql
immutable
as $$
declare
  v_n text := trim(trailing '.' from trim(trailing '0' from to_char(p_value, 'FM999999999990.999')));
  v_t text := trim(trailing '.' from trim(trailing '0' from to_char(p_target, 'FM999999999990.999')));
begin
  if p_data_state = 'not_applicable' then
    return query select 'no_data'::text, 'No aplica a este periodo.'::text; return;
  end if;
  if p_data_state <> 'reported' or p_value is null then
    return query select 'no_data'::text, 'Todavía no hay dato para este periodo.'::text; return;
  end if;

  if p_direction = 'within_range' then
    if p_target_min is null or p_target_max is null then
      return query select 'no_target'::text,
        ('Resultado ' || v_n || '. Este indicador no tiene rango definido, así que no se evalúa.')::text;
      return;
    end if;
    if p_value >= p_target_min and p_value <= p_target_max then
      return query select 'complies'::text,
        (v_n || ' está dentro del rango ' || p_target_min || '–' || p_target_max || ' → cumple.')::text;
    elsif p_warning_min is not null and p_warning_max is not null
          and p_value >= p_warning_min and p_value <= p_warning_max then
      return query select 'attention'::text,
        (v_n || ' está fuera del rango ' || p_target_min || '–' || p_target_max ||
         ' pero dentro del margen de atención ' || p_warning_min || '–' || p_warning_max || '.')::text;
    else
      return query select 'not_met'::text,
        (v_n || ' está fuera del rango ' || p_target_min || '–' || p_target_max || ' → no cumple.')::text;
    end if;
    return;
  end if;

  if p_target is null then
    return query select 'no_target'::text,
      ('Resultado ' || v_n || '. Este indicador no tiene meta definida, así que no se evalúa.')::text;
    return;
  end if;

  case p_direction
    when 'higher_is_better' then
      if p_value >= p_target then
        return query select 'complies'::text, (v_n || ' ≥ meta ' || v_t || ' → cumple.')::text;
      elsif p_warning is not null and p_value >= p_warning then
        return query select 'attention'::text,
          (v_n || ' no alcanza la meta ' || v_t || ', pero se mantiene por encima del umbral de atención ' ||
           trim(trailing '.' from trim(trailing '0' from to_char(p_warning, 'FM999999999990.999'))) || '.')::text;
      else
        return query select 'not_met'::text, (v_n || ' < meta ' || v_t || ' → no cumple.')::text;
      end if;
    when 'lower_is_better' then
      if p_value <= p_target then
        return query select 'complies'::text, (v_n || ' ≤ meta ' || v_t || ' → cumple.')::text;
      elsif p_warning is not null and p_value <= p_warning then
        return query select 'attention'::text,
          (v_n || ' supera la meta ' || v_t || ', pero se mantiene por debajo del umbral de atención ' ||
           trim(trailing '.' from trim(trailing '0' from to_char(p_warning, 'FM999999999990.999'))) || '.')::text;
      else
        return query select 'not_met'::text, (v_n || ' > meta ' || v_t || ' → no cumple.')::text;
      end if;
    when 'exact' then
      if p_value = p_target then
        return query select 'complies'::text, (v_n || ' = meta ' || v_t || ' → cumple.')::text;
      elsif p_warning is not null and abs(p_value - p_target) <= p_warning then
        return query select 'attention'::text,
          (v_n || ' se desvía de la meta ' || v_t || ' dentro de la tolerancia admitida.')::text;
      else
        return query select 'not_met'::text, (v_n || ' ≠ meta ' || v_t || ' → no cumple.')::text;
      end if;
    else
      raise exception 'Dirección de meta no válida: %', p_direction;
  end case;
end;
$$;
revoke all on function public.quality_evaluate_value(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.quality_evaluate_value(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text)
  to authenticated;


-- ----------------------------------------------------------------------------
-- §14 · CATALOGO CERRADO DE FUENTES NATIVAS (OI-16, OI-26)
--
-- «Quality by Observation» (OI-01): el sistema mira lo que ya ocurrió en la
-- operación en vez de pedirle a alguien que teclee un número cada mes.
--
-- El catálogo es CERRADO y vive en SQL, no en la aplicación. Tres razones:
--
--  1. El cliente no puede aportar un valor. Pide «calcula», y el cálculo
--     ocurre entero dentro de la base.
--  2. No hay SQL de usuario, ni eval, ni expresiones arbitrarias. Solo un
--     CASE sobre claves conocidas.
--  3. Cada consulta está acotada por p_organization_id. Una empresa no puede
--     calcular con datos de otra ni por accidente ni a propósito.
--
-- Las fuentes de este sprint son deliberadamente pocas y REALES: salen de lo
-- que QUALITY-01 y QUALITY-02 ya registran. Añadir una más es añadir una rama
-- a este CASE y una entrada al catálogo del dominio, que una prueba obliga a
-- mantener de acuerdo.
--
-- Nota de honestidad sobre el momento del cálculo: las fuentes marcadas
-- «instantánea» miden el estado EN EL MOMENTO DE CALCULAR, no reconstruyen el
-- estado que había al cierre del periodo. Reconstruirlo exigiría historia
-- punto-en-el-tiempo del ciclo de vida documental, que existe para las
-- revisiones pero no para la disposición del documento. Se declara en el
-- linaje (`inputs.as_of`) para que nadie lo confunda con una serie histórica
-- reconstruida.
-- ----------------------------------------------------------------------------
create or replace function public.quality_native_source_value(
  p_organization_id uuid,
  p_source_key      text,
  p_period_start    date,
  p_period_end      date
)
returns table (value numeric, inputs jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total   numeric;
  v_matched numeric;
begin
  case p_source_key

    -- % de documentos de Quality vigentes sobre los activos. Instantánea.
    when 'quality.documents_effective_ratio' then
      select count(*) filter (where d.disposition = 'active'),
             count(*) filter (where d.disposition = 'active' and c.lifecycle_state = 'effective')
        into v_total, v_matched
        from trazadoc_documents d
        join v_trazadoc_document_control c on c.document_id = d.id
       where d.organization_id = p_organization_id and d.module_key = 'quality';
      return query select
        case when v_total = 0 then null else round(v_matched * 100.0 / v_total, 2) end,
        jsonb_build_object('total_active', v_total, 'effective', v_matched,
                           'as_of', now(), 'nature', 'snapshot');

    -- Documentos de Quality con revisión periódica vencida. Instantánea.
    when 'quality.documents_review_overdue_count' then
      select count(*) into v_matched
        from v_trazadoc_document_control c
       where c.organization_id = p_organization_id
         and c.module_key = 'quality'
         and c.review_overdue;
      return query select v_matched,
        jsonb_build_object('overdue', v_matched, 'as_of', now(), 'nature', 'snapshot');

    -- Días promedio entre enviar a revisión y aprobar, para las revisiones
    -- APROBADAS DENTRO del periodo. Esta sí es propia del periodo.
    when 'quality.document_approval_lead_time_days' then
      select count(*),
             avg(extract(epoch from (r.approved_at - r.submitted_at)) / 86400.0)
        into v_total, v_matched
        from trazadoc_document_revisions r
        join trazadoc_documents d
          on d.id = r.document_id and d.module_key = 'quality'
       where r.organization_id = p_organization_id
         and r.approved_at is not null
         and r.submitted_at is not null
         and r.approved_at::date between p_period_start and p_period_end;
      return query select
        case when v_total = 0 then null else round(v_matched, 2) end,
        jsonb_build_object('approved_revisions', v_total, 'period_start', p_period_start,
                           'period_end', p_period_end, 'nature', 'period');

    -- % de procesos con una revisión publicada vigente. Instantánea.
    when 'quality.processes_published_ratio' then
      select count(*),
             count(*) filter (where exists (
               select 1 from quality_process_revisions r
                where r.process_id = p.id and r.status = 'published' and r.effective_to is null))
        into v_total, v_matched
        from quality_processes p
       where p.organization_id = p_organization_id and p.status = 'active';
      return query select
        case when v_total = 0 then null else round(v_matched * 100.0 / v_total, 2) end,
        jsonb_build_object('active_processes', v_total, 'published', v_matched,
                           'as_of', now(), 'nature', 'snapshot');

    -- Tareas documentales todavía abiertas. Instantánea.
    when 'quality.open_document_tasks_count' then
      select count(*) into v_matched
        from work_tasks t
       where t.organization_id = p_organization_id
         and t.source_domain = 'document'
         and t.status in ('open', 'in_progress');
      return query select v_matched,
        jsonb_build_object('open_tasks', v_matched, 'as_of', now(), 'nature', 'snapshot');

    else
      raise exception 'La fuente automática «%» no existe en el catálogo de Trazaloop.', p_source_key;
  end case;
end;
$$;
revoke all on function public.quality_native_source_value(uuid, text, date, date) from public, anon, authenticated;

/**
 * Las claves ADMITIDAS, como dato consultable. Existe para dos cosas: que la
 * configuración pueda negarse a guardar una clave inventada —mejor fallar al
 * configurar que cada mes al calcular— y que una prueba pueda comprobar que el
 * catálogo del dominio y el de la base dicen exactamente lo mismo.
 */
create or replace function public.quality_native_source_keys()
returns setof text
language sql
immutable
as $$
  select unnest(array[
    'quality.documents_effective_ratio',
    'quality.documents_review_overdue_count',
    'quality.document_approval_lead_time_days',
    'quality.processes_published_ratio',
    'quality.open_document_tasks_count'
  ]);
$$;
revoke all on function public.quality_native_source_keys() from public, anon;
grant execute on function public.quality_native_source_keys() to authenticated;

comment on function public.quality_native_source_value(uuid, text, date, date) is
  'QUALITY-03 · Catálogo CERRADO de fuentes nativas (OI-16, OI-26). Sin SQL de usuario y siempre acotado por organization_id: una empresa no puede calcular con datos de otra. El cliente no aporta el valor, solo pide el cálculo.';


-- ----------------------------------------------------------------------------
-- §15 · FORMULAS DECLARATIVAS (OI-05)
--
-- Un indicador calculado NO ejecuta nada que el usuario escriba: declara una
-- operación de un conjunto cerrado sobre operandos con nombre. Sin SQL, sin
-- JavaScript, sin eval, sin expresiones. Es suficiente para los casos clásicos
-- —A/B, A/B×100, sumas, promedios, diferencias— y no es un lenguaje de
-- programación, que es justo lo que el encargo pide no construir.
--
--   { "operation": "ratio_percent",
--     "operands": [ {"key":"conformes","label":"Entregas conformes"},
--                   {"key":"totales","label":"Entregas totales"} ] }
-- ----------------------------------------------------------------------------
create or replace function public.quality_validate_calc_definition(p_calc jsonb)
returns void
language plpgsql
immutable
as $$
declare
  v_op       text := p_calc->>'operation';
  v_operands jsonb := p_calc->'operands';
  v_count    integer;
  v_item     jsonb;
  v_keys     text[] := array[]::text[];
begin
  if v_op is null then raise exception 'La fórmula no declara ninguna operación.'; end if;
  if v_op not in ('ratio', 'ratio_percent', 'sum', 'difference', 'average') then
    raise exception 'Operación de fórmula no admitida: %', v_op;
  end if;
  if v_operands is null or jsonb_typeof(v_operands) <> 'array' then
    raise exception 'La fórmula no declara sus componentes.';
  end if;
  v_count := jsonb_array_length(v_operands);
  if v_op in ('ratio', 'ratio_percent', 'difference') and v_count <> 2 then
    raise exception 'La operación % necesita exactamente dos componentes.', v_op;
  end if;
  if v_op in ('sum', 'average') and v_count < 1 then
    raise exception 'La operación % necesita al menos un componente.', v_op;
  end if;
  for v_item in select * from jsonb_array_elements(v_operands) loop
    if coalesce(trim(v_item->>'key'), '') = '' then
      raise exception 'Cada componente de la fórmula necesita una clave.';
    end if;
    if v_item->>'key' = any (v_keys) then
      raise exception 'La fórmula repite el componente «%».', v_item->>'key';
    end if;
    v_keys := v_keys || (v_item->>'key');
  end loop;
end;
$$;
revoke all on function public.quality_validate_calc_definition(jsonb) from public, anon, authenticated;

create or replace function public.quality_compute_calculated(p_calc jsonb, p_components jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  v_op   text := p_calc->>'operation';
  v_item jsonb;
  v_vals numeric[] := array[]::numeric[];
  v_raw  text;
begin
  for v_item in select * from jsonb_array_elements(p_calc->'operands') loop
    v_raw := p_components->>(v_item->>'key');
    if v_raw is null or trim(v_raw) = '' then
      raise exception 'Falta el componente «%» de la fórmula.',
        coalesce(v_item->>'label', v_item->>'key');
    end if;
    begin
      v_vals := v_vals || v_raw::numeric;
    exception when others then
      raise exception 'El componente «%» no es un número.', coalesce(v_item->>'label', v_item->>'key');
    end;
  end loop;

  case v_op
    when 'ratio' then
      if v_vals[2] = 0 then raise exception 'No se puede dividir entre cero.'; end if;
      return round(v_vals[1] / v_vals[2], 4);
    when 'ratio_percent' then
      if v_vals[2] = 0 then raise exception 'No se puede dividir entre cero.'; end if;
      return round(v_vals[1] * 100.0 / v_vals[2], 2);
    when 'difference' then
      return v_vals[1] - v_vals[2];
    when 'sum' then
      return (select sum(v) from unnest(v_vals) v);
    when 'average' then
      return round((select avg(v) from unnest(v_vals) v), 4);
    else
      raise exception 'Operación de fórmula no admitida: %', v_op;
  end case;
end;
$$;
revoke all on function public.quality_compute_calculated(jsonb, jsonb) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- §16 · AYUDANTES DE RESOLUCION
-- ----------------------------------------------------------------------------

/** La configuración que REGÍA en un periodo (OI-07). Es lo que impide que
 *  cambiar la meta hoy reescriba la evaluación de ayer. */
create or replace function public.quality_config_for_period(
  p_indicator_id uuid, p_period_start date, p_period_end date
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id from quality_indicator_configs c
   where c.indicator_id = p_indicator_id
     and c.effective_from <= p_period_end
     and (c.effective_to is null or c.effective_to >= p_period_start)
   order by c.effective_from desc, c.version_number desc
   limit 1;
$$;
revoke all on function public.quality_config_for_period(uuid, date, date) from public, anon, authenticated;
grant execute on function public.quality_config_for_period(uuid, date, date) to authenticated;

/** A quién le corresponde un indicador: el titular vigente del cargo (MDR-33),
 *  y si no hay cargo, la persona designada; en último término, quien lo creó.
 *  Nunca devuelve a alguien que ya no sea miembro activo. */
create or replace function public.quality_indicator_owner_profile(p_indicator_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ind  record;
  v_prof uuid;
begin
  select * into v_ind from quality_indicators where id = p_indicator_id;
  if v_ind.id is null then return null; end if;

  if v_ind.owner_position_id is not null then
    select a.profile_id into v_prof
      from quality_position_assignments a
     where a.organization_id = v_ind.organization_id
       and a.position_id = v_ind.owner_position_id
       and a.assignment_type = 'holder'
       and a.effective_to is null
     limit 1;
  end if;
  v_prof := coalesce(v_prof, v_ind.owner_profile_id, v_ind.created_by);

  if v_prof is not null and not exists (
    select 1 from memberships m
     where m.organization_id = v_ind.organization_id and m.user_id = v_prof and m.status = 'active'
  ) then
    v_prof := null;
  end if;
  return v_prof;
end;
$$;
revoke all on function public.quality_indicator_owner_profile(uuid) from public, anon, authenticated;
grant execute on function public.quality_indicator_owner_profile(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- §17 · SENALES DE DESEMPENO (OI-13, OI-14, 10.6)
--
-- Quedar por debajo de la meta produce un EVENTO DE DESEMPENO y una alerta
-- para quien responde. NUNCA una no conformidad: eso es una decisión formal de
-- otro dominio, y confundirlas convertiría cada mes flojo en un hallazgo.
--
-- AT-07 / OI-14 · Todo lleva clave de deduplicación: recalcular un indicador
-- diez veces no produce diez alertas.
-- ----------------------------------------------------------------------------
create or replace function public.quality_emit_performance_signals(p_measurement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m     record;
  v_ind   record;
  v_owner uuid;
  v_key   text;
begin
  select * into v_m from quality_measurements where id = p_measurement_id;
  if v_m.id is null then return; end if;
  select * into v_ind from quality_indicators where id = v_m.indicator_id;
  v_owner := quality_indicator_owner_profile(v_m.indicator_id);
  v_key := v_m.indicator_id::text || ':' || v_m.period_label;

  -- Una fuente caída es un problema TÉCNICO, no un mal desempeño (OI-31).
  if v_m.data_quality = 'failed_source' then
    insert into work_events
      (organization_id, source_domain, event_type, subject_type, subject_id, subject_period,
       severity, summary, payload, dedupe_key, created_by)
    values
      (v_m.organization_id, 'indicator', 'indicator.source_failed', 'quality_indicator',
       v_m.indicator_id, v_m.period_label, 'warning',
       'La fuente automática de «' || v_ind.name || '» no pudo consultarse en ' || v_m.period_label,
       jsonb_build_object('measurement_id', v_m.id), 'ev:src:' || v_key, auth.uid())
    on conflict do nothing;
    return;
  end if;

  if v_m.evaluation = 'not_met' then
    insert into work_events
      (organization_id, source_domain, event_type, subject_type, subject_id, subject_period,
       severity, summary, payload, dedupe_key, created_by)
    values
      (v_m.organization_id, 'indicator', 'indicator.target_missed', 'quality_indicator',
       v_m.indicator_id, v_m.period_label, 'warning',
       '«' || v_ind.name || '» no cumplió la meta en ' || v_m.period_label,
       jsonb_build_object('measurement_id', v_m.id, 'value', v_m.value,
                          'explanation', v_m.evaluation_explanation),
       'ev:miss:' || v_key, auth.uid())
    on conflict do nothing;

    if v_owner is not null then
      insert into work_alerts
        (organization_id, source_domain, alert_type, severity, subject_type, subject_id,
         title, message, recipient_profile_id, status, dedupe_key, created_by)
      values
        (v_m.organization_id, 'indicator', 'indicator_target_missed', 'warning',
         'quality_indicator', v_m.indicator_id,
         'Indicador fuera de meta: ' || v_ind.name,
         v_m.period_label || ' · ' || coalesce(v_m.evaluation_explanation, ''),
         v_owner, 'new', 'al:miss:' || v_key, auth.uid())
      on conflict do nothing;
    end if;

  elsif v_m.evaluation = 'attention' then
    insert into work_events
      (organization_id, source_domain, event_type, subject_type, subject_id, subject_period,
       severity, summary, payload, dedupe_key, created_by)
    values
      (v_m.organization_id, 'indicator', 'indicator.attention', 'quality_indicator',
       v_m.indicator_id, v_m.period_label, 'info',
       '«' || v_ind.name || '» quedó en zona de atención en ' || v_m.period_label,
       jsonb_build_object('measurement_id', v_m.id, 'value', v_m.value),
       'ev:att:' || v_key, auth.uid())
    on conflict do nothing;
  end if;

  -- Medir cierra la tarea de «medición pendiente» de ese periodo, si la había.
  update work_tasks
     set status = 'done', completed_at = now(), completed_by = auth.uid(),
         resolution = 'Medición registrada'
   where organization_id = v_m.organization_id
     and subject_type = 'quality_indicator'
     and subject_id = v_m.indicator_id
     and task_type = 'indicator_measurement_due'
     and dedupe_key = 'tk:due:' || v_key
     and status in ('open', 'in_progress');
end;
$$;
revoke all on function public.quality_emit_performance_signals(uuid) from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- §18 · RPCs DEL MOTOR DE INDICADORES
--
-- Todas SECURITY DEFINER, con la sesión REAL (auth.uid()) y nunca con
-- service_role. Son la ÚNICA vía de escritura de configuraciones, mediciones,
-- ejecuciones de cálculo, eventos y cierres: ninguna de esas tablas concede
-- INSERT por política. Es lo que impide que el navegador fabrique un valor
-- automático o una evaluación (§41 del encargo).
-- ----------------------------------------------------------------------------

-- §18.1 · Publicar una CONFIGURACIÓN nueva ------------------------------------
-- Cierra la vigente el día anterior y abre la siguiente. Nunca deja dos
-- vigentes ni un hueco. La anterior queda inmutable (§20.1).
create or replace function public.quality_publish_indicator_config(
  p_indicator_id        uuid,
  p_effective_from      date,
  p_unit_code           text,
  p_direction           text,
  p_frequency           text,
  p_target_value        numeric default null,
  p_target_min          numeric default null,
  p_target_max          numeric default null,
  p_warning_value       numeric default null,
  p_warning_min         numeric default null,
  p_warning_max         numeric default null,
  p_source_kind         text    default 'manual',
  p_source_key          text    default null,
  p_calc_definition     jsonb   default null,
  p_formula_text        text    default null,
  p_unit_label          text    default null,
  p_source_note         text    default null,
  p_consolidation       text    default 'none',
  p_comparability_break boolean default false,
  p_comparability_note  text    default null,
  p_change_note         text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_ind     record;
  v_role    text;
  v_current record;
  v_version integer;
  v_id      uuid;
begin
  if v_user is null then raise exception 'No autenticado'; end if;

  select * into v_ind from quality_indicators where id = p_indicator_id for update;
  if v_ind.id is null then raise exception 'El indicador no existe'; end if;
  if not is_org_member(v_ind.organization_id) then
    raise exception 'No perteneces a la empresa de este indicador';
  end if;
  v_role := current_org_role(v_ind.organization_id);
  if v_role not in ('admin', 'quality') then
    raise exception 'Solo la administración o el área de calidad configuran un indicador';
  end if;
  if v_ind.admin_state = 'retired' then
    raise exception 'Un indicador retirado no admite configuraciones nuevas';
  end if;

  if p_source_kind = 'native' then
    -- Se comprueba AQUÍ que la clave existe: es preferible negarse al
    -- configurar que fallar cada mes al calcular.
    if not exists (select 1 from quality_native_source_keys() k where k = p_source_key) then
      raise exception 'La fuente automática «%» no existe en el catálogo de Trazaloop.', p_source_key;
    end if;
  end if;
  if p_source_kind = 'calculated' then
    perform quality_validate_calc_definition(p_calc_definition);
  end if;

  select * into v_current from quality_indicator_configs
   where indicator_id = p_indicator_id and effective_to is null
   for update;

  if v_current.id is not null then
    if p_effective_from <= v_current.effective_from then
      raise exception 'La configuración nueva debe empezar después del % (inicio de la vigente).',
        to_char(v_current.effective_from, 'DD/MM/YYYY');
    end if;
    -- Cerrar una configuración cuyo periodo ya está cerrado alteraría el
    -- pasado por la puerta de atrás (OI-12).
    if quality_period_is_closed(v_ind.organization_id, v_current.effective_from, p_effective_from - 1) then
      raise exception 'Ese tramo pertenece a un periodo cerrado. Reábrelo formalmente si de verdad hay que cambiarlo.';
    end if;
    update quality_indicator_configs
       set effective_to = p_effective_from - 1
     where id = v_current.id;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
    from quality_indicator_configs where indicator_id = p_indicator_id;

  insert into quality_indicator_configs (
    organization_id, indicator_id, version_number, effective_from, effective_to,
    unit_code, unit_label, direction, frequency,
    target_value, target_min, target_max, warning_value, warning_min, warning_max,
    source_kind, source_key, calc_definition, formula_text, source_note,
    consolidation_method, comparability_break, comparability_note, change_note, created_by
  ) values (
    v_ind.organization_id, p_indicator_id, v_version, p_effective_from, null,
    p_unit_code, nullif(trim(coalesce(p_unit_label, '')), ''), p_direction, p_frequency,
    p_target_value, p_target_min, p_target_max, p_warning_value, p_warning_min, p_warning_max,
    p_source_kind, p_source_key, p_calc_definition,
    nullif(trim(coalesce(p_formula_text, '')), ''), nullif(trim(coalesce(p_source_note, '')), ''),
    coalesce(p_consolidation, 'none'), coalesce(p_comparability_break, false),
    nullif(trim(coalesce(p_comparability_note, '')), ''),
    nullif(trim(coalesce(p_change_note, '')), ''), v_user
  ) returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.quality_publish_indicator_config(
  uuid, date, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, jsonb, text, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.quality_publish_indicator_config(
  uuid, date, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, jsonb, text, text, text, text, boolean, text, text) to authenticated;


-- §18.2 · Guardas comunes de una medición -------------------------------------
create or replace function public.quality_measurement_guard(
  p_indicator_id uuid, p_period_start date, p_period_end date,
  out organization_id uuid, out config_id uuid, out period_label text, out frequency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ind    record;
  v_role   text;
  v_cfg    record;
  v_bounds record;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;

  select * into v_ind from quality_indicators where id = p_indicator_id;
  if v_ind.id is null then raise exception 'El indicador no existe'; end if;
  if not is_org_member(v_ind.organization_id) then
    raise exception 'No perteneces a la empresa de este indicador';
  end if;
  v_role := current_org_role(v_ind.organization_id);
  if v_role not in ('admin', 'quality', 'consultant') then
    raise exception 'Tu rol no permite registrar mediciones';
  end if;
  if v_ind.admin_state <> 'active' then
    raise exception 'Solo un indicador activo admite mediciones. Este está en «%».', v_ind.admin_state;
  end if;

  config_id := quality_config_for_period(p_indicator_id, p_period_start, p_period_end);
  if config_id is null then
    raise exception 'Este indicador no tenía configuración vigente en ese periodo.';
  end if;
  select * into v_cfg from quality_indicator_configs where id = config_id;

  -- El periodo debe ser uno CANÓNICO de la periodicidad configurada: así
  -- «enero» significa lo mismo para todo el mundo y las series se pueden
  -- comparar. Un rango arbitrario se rechaza.
  select * into v_bounds from quality_period_bounds(v_cfg.frequency, p_period_start);
  if v_bounds.period_start <> p_period_start or v_bounds.period_end <> p_period_end then
    raise exception 'El periodo no corresponde a la periodicidad % del indicador (esperado % a %).',
      v_cfg.frequency, to_char(v_bounds.period_start, 'DD/MM/YYYY'), to_char(v_bounds.period_end, 'DD/MM/YYYY');
  end if;

  if quality_period_is_closed(v_ind.organization_id, p_period_start, p_period_end) then
    raise exception 'Ese periodo está cerrado. Reábrelo formalmente si de verdad hay que cambiarlo.';
  end if;

  organization_id := v_ind.organization_id;
  period_label := v_bounds.period_label;
  frequency := v_cfg.frequency;
end;
$$;
revoke all on function public.quality_measurement_guard(uuid, date, date) from public, anon, authenticated;


-- §18.3 · Registrar una medición MANUAL o CALCULADA ---------------------------
create or replace function public.quality_record_measurement(
  p_indicator_id uuid,
  p_period_start date,
  p_period_end   date,
  p_value        numeric default null,
  p_data_state   text    default 'reported',
  p_components   jsonb   default null,
  p_note         text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g     record;
  v_cfg   record;
  v_value numeric;
  v_eval  record;
  v_id    uuid;
begin
  select * into v_g from quality_measurement_guard(p_indicator_id, p_period_start, p_period_end);
  select * into v_cfg from quality_indicator_configs where id = v_g.config_id;

  if v_cfg.source_kind = 'native' then
    raise exception 'Este indicador se alimenta solo. Usa «Calcular ahora» en vez de escribir el resultado.';
  end if;
  if p_data_state not in ('reported', 'no_data', 'not_applicable') then
    raise exception 'Estado del dato no válido';
  end if;

  if p_data_state <> 'reported' then
    v_value := null;
  elsif v_cfg.source_kind = 'calculated' then
    -- El usuario aporta los COMPONENTES; el resultado lo calcula el sistema
    -- (§22 del encargo). Si además pudiera escribir el resultado, los dos
    -- podrían no coincidir y nadie sabría cuál vale.
    v_value := quality_compute_calculated(v_cfg.calc_definition, coalesce(p_components, '{}'::jsonb));
  else
    if p_value is null then raise exception 'Escribe el resultado del periodo.'; end if;
    v_value := p_value;
  end if;

  select * into v_eval from quality_evaluate_value(
    v_cfg.direction, v_cfg.target_value, v_cfg.target_min, v_cfg.target_max,
    v_cfg.warning_value, v_cfg.warning_min, v_cfg.warning_max, v_value, p_data_state);

  begin
    insert into quality_measurements (
      organization_id, indicator_id, config_id, period_label, period_start, period_end,
      value, data_state, data_quality, source_kind, input_components,
      evaluation, evaluation_explanation, note, created_by
    ) values (
      v_g.organization_id, p_indicator_id, v_g.config_id, v_g.period_label, p_period_start, p_period_end,
      v_value, p_data_state, 'ok', v_cfg.source_kind,
      case when v_cfg.source_kind = 'calculated' then p_components else null end,
      v_eval.evaluation, v_eval.explanation, nullif(trim(coalesce(p_note, '')), ''), auth.uid()
    ) returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya hay una medición registrada para %. Corrígela en vez de añadir otra.', v_g.period_label;
  end;

  perform quality_emit_performance_signals(v_id);
  return v_id;
end;
$$;
revoke all on function public.quality_record_measurement(uuid, date, date, numeric, text, jsonb, text)
  from public, anon;
grant execute on function public.quality_record_measurement(uuid, date, date, numeric, text, jsonb, text)
  to authenticated;


-- §18.4 · CALCULAR una medición automática ------------------------------------
-- El cliente NO envía un valor: envía el indicador y el periodo. Todo lo demás
-- ocurre dentro de la base.
create or replace function public.quality_run_indicator_calculation(
  p_indicator_id uuid,
  p_period_start date,
  p_period_end   date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_g       record;
  v_cfg     record;
  v_src     record;
  v_run     uuid;
  v_eval    record;
  v_state   text := 'reported';
  v_quality text := 'ok';
  v_value   numeric;
  v_inputs  jsonb;
  v_err     text;
  v_prev    record;
  v_id      uuid;
begin
  select * into v_g from quality_measurement_guard(p_indicator_id, p_period_start, p_period_end);
  select * into v_cfg from quality_indicator_configs where id = v_g.config_id;

  if v_cfg.source_kind <> 'native' then
    raise exception 'Este indicador no se alimenta de una fuente automática.';
  end if;

  -- OI-31 · Un fallo de la fuente es TÉCNICO. Se registra, se marca la calidad
  -- del dato y se deja SIN DATO — jamás se convierte en un «no cumple».
  begin
    select * into v_src from quality_native_source_value(
      v_g.organization_id, v_cfg.source_key, p_period_start, p_period_end);
    v_value  := v_src.value;
    v_inputs := v_src.inputs;
    if v_value is null then
      v_state := 'no_data';
      v_inputs := coalesce(v_inputs, '{}'::jsonb) || jsonb_build_object('reason', 'sin datos de origen en el periodo');
    end if;
  exception when others then
    v_err := SQLERRM;
    v_state := 'no_data';
    v_quality := 'failed_source';
    v_value := null;
    v_inputs := jsonb_build_object('error', v_err);
  end;

  insert into quality_calculation_runs (
    organization_id, indicator_id, config_id, period_start, period_end,
    source_kind, source_key, status, output_value, inputs, error_text, ran_by
  ) values (
    v_g.organization_id, p_indicator_id, v_g.config_id, p_period_start, p_period_end,
    'native', v_cfg.source_key, case when v_err is null then 'ok' else 'failed' end,
    v_value, v_inputs, v_err, auth.uid()
  ) returning id into v_run;

  select * into v_eval from quality_evaluate_value(
    v_cfg.direction, v_cfg.target_value, v_cfg.target_min, v_cfg.target_max,
    v_cfg.warning_value, v_cfg.warning_min, v_cfg.warning_max, v_value, v_state);

  select * into v_prev from quality_measurements
   where indicator_id = p_indicator_id and period_start = p_period_start
     and period_end = p_period_end and is_current;

  -- Recalcular y obtener lo mismo no crea una fila nueva: solo deja la huella
  -- de que se volvió a mirar. Así «Calcular ahora» diez veces no ensucia el
  -- historial con diez mediciones idénticas.
  if v_prev.id is not null
     and v_prev.value is not distinct from v_value
     and v_prev.data_state = v_state
     and v_prev.data_quality = v_quality then
    update quality_measurements
       set calculation_run_id = v_run, source_detail = v_inputs, measured_at = now()
     where id = v_prev.id;
    return v_prev.id;
  end if;

  -- Mismo orden que en la corrección: apagar antes de insertar.
  if v_prev.id is not null then
    update quality_measurements set is_current = false where id = v_prev.id;
  end if;

  insert into quality_measurements (
    organization_id, indicator_id, config_id, period_label, period_start, period_end,
    value, data_state, data_quality, source_kind, source_key, source_detail,
    calculation_run_id, evaluation, evaluation_explanation,
    corrects_measurement_id, correction_reason, created_by
  ) values (
    v_g.organization_id, p_indicator_id, v_g.config_id, v_g.period_label, p_period_start, p_period_end,
    v_value, v_state, v_quality, 'native', v_cfg.source_key, v_inputs,
    v_run, v_eval.evaluation, v_eval.explanation,
    v_prev.id, case when v_prev.id is not null then 'Recálculo automático de la fuente' end,
    auth.uid()
  ) returning id into v_id;

  if v_prev.id is not null then
    update quality_measurements set superseded_by_measurement_id = v_id where id = v_prev.id;
  end if;

  perform quality_emit_performance_signals(v_id);
  return v_id;
end;
$$;
revoke all on function public.quality_run_indicator_calculation(uuid, date, date) from public, anon;
grant execute on function public.quality_run_indicator_calculation(uuid, date, date) to authenticated;


-- §18.5 · CORREGIR una medición (OI-09, OI-28) --------------------------------
-- No sobrescribe: crea una fila nueva y marca la anterior. El valor
-- originalmente registrado sigue estando, con quién lo corrigió y por qué.
create or replace function public.quality_correct_measurement(
  p_measurement_id uuid,
  p_value          numeric,
  p_data_state     text,
  p_reason         text,
  p_components     jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    record;
  v_g      record;
  v_cfg    record;
  v_value  numeric;
  v_eval   record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if v_reason is null then raise exception 'Escribe el motivo de la corrección.'; end if;

  select * into v_old from quality_measurements where id = p_measurement_id for update;
  if v_old.id is null then raise exception 'La medición no existe'; end if;
  if not v_old.is_current then
    raise exception 'Esa medición ya fue corregida. Corrige la vigente.';
  end if;

  select * into v_g from quality_measurement_guard(v_old.indicator_id, v_old.period_start, v_old.period_end);
  select * into v_cfg from quality_indicator_configs where id = v_old.config_id;

  if p_data_state not in ('reported', 'no_data', 'not_applicable') then
    raise exception 'Estado del dato no válido';
  end if;

  if p_data_state <> 'reported' then
    v_value := null;
  elsif v_cfg.source_kind = 'calculated' and p_components is not null then
    v_value := quality_compute_calculated(v_cfg.calc_definition, p_components);
  else
    if p_value is null then raise exception 'Escribe el valor corregido.'; end if;
    v_value := p_value;
  end if;

  select * into v_eval from quality_evaluate_value(
    v_cfg.direction, v_cfg.target_value, v_cfg.target_min, v_cfg.target_max,
    v_cfg.warning_value, v_cfg.warning_min, v_cfg.warning_max, v_value, p_data_state);

  -- Primero se apaga la anterior: si se insertara antes la sustituta, las dos
  -- serían «vigentes» durante un instante y el índice único lo rechazaría.
  update quality_measurements set is_current = false where id = v_old.id;

  insert into quality_measurements (
    organization_id, indicator_id, config_id, period_label, period_start, period_end,
    value, data_state, data_quality, source_kind, source_key, source_detail,
    input_components, evaluation, evaluation_explanation,
    corrects_measurement_id, correction_reason, note, created_by
  ) values (
    v_old.organization_id, v_old.indicator_id, v_old.config_id, v_old.period_label,
    v_old.period_start, v_old.period_end,
    v_value, p_data_state, 'ok', v_old.source_kind, v_old.source_key, v_old.source_detail,
    coalesce(p_components, v_old.input_components), v_eval.evaluation, v_eval.explanation,
    v_old.id, v_reason, v_old.note, auth.uid()
  ) returning id into v_id;

  update quality_measurements set superseded_by_measurement_id = v_id where id = v_old.id;

  perform quality_emit_performance_signals(v_id);
  return v_id;
end;
$$;
revoke all on function public.quality_correct_measurement(uuid, numeric, text, text, jsonb) from public, anon;
grant execute on function public.quality_correct_measurement(uuid, numeric, text, text, jsonb) to authenticated;


-- §18.6 · MEDICIONES PENDIENTES (§33 del encargo) -----------------------------
-- Un indicador mensual cuyo mes venció sin medición está PENDIENTE. La
-- condición se ve siempre en la vista de §21 —no depende de que nadie corra
-- nada—, y esta función materializa la tarea y la alerta para el responsable.
--
-- Se ejecuta bajo demanda, no con un planificador: el encargo pide no construir
-- un scheduler complejo, y una acción explícita es honesta y comprobable.
-- Idempotente por clave de deduplicación: llamarla dos veces no duplica nada.
--
-- Nunca inventa un cero. Una medición que falta es una ausencia, no un valor.
create or replace function public.quality_scan_pending_measurements(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text;
  v_row   record;
  v_owner uuid;
  v_count integer := 0;
  v_key   text;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_org_member(p_organization_id) then
    raise exception 'No perteneces a esta empresa';
  end if;
  v_role := current_org_role(p_organization_id);
  if v_role not in ('admin', 'quality') then
    raise exception 'Solo la administración o el área de calidad revisan las mediciones pendientes';
  end if;

  for v_row in
    select i.id as indicator_id, i.name, b.period_start, b.period_end, b.period_label
      from quality_indicators i
      join quality_indicator_configs c
        on c.indicator_id = i.id and c.effective_to is null
      cross join lateral quality_previous_period(c.frequency, current_date) b
     where i.organization_id = p_organization_id
       and i.admin_state = 'active'
       and c.effective_from <= b.period_end
       and not exists (
         select 1 from quality_measurements m
          where m.indicator_id = i.id
            and m.period_start = b.period_start
            and m.period_end = b.period_end
            and m.is_current)
       and not quality_period_is_closed(p_organization_id, b.period_start, b.period_end)
  loop
    v_key := v_row.indicator_id::text || ':' || v_row.period_label;
    v_owner := quality_indicator_owner_profile(v_row.indicator_id);

    insert into work_events
      (organization_id, source_domain, event_type, subject_type, subject_id, subject_period,
       severity, summary, dedupe_key, created_by)
    values
      (p_organization_id, 'indicator', 'indicator.measurement_due', 'quality_indicator',
       v_row.indicator_id, v_row.period_label, 'info',
       'Falta la medición de «' || v_row.name || '» para ' || v_row.period_label,
       'ev:due:' || v_key, auth.uid())
    on conflict do nothing;

    if v_owner is not null then
      insert into work_tasks
        (organization_id, source_domain, task_type, subject_type, subject_id,
         title, description, assignee_profile_id, status, due_at, dedupe_key, created_by)
      values
        (p_organization_id, 'indicator', 'indicator_measurement_due', 'quality_indicator',
         v_row.indicator_id,
         'Medir «' || v_row.name || '» · ' || v_row.period_label,
         'El periodo terminó el ' || to_char(v_row.period_end, 'DD/MM/YYYY') || ' y todavía no tiene medición.',
         v_owner, 'open', v_row.period_end, 'tk:due:' || v_key, auth.uid())
      on conflict do nothing;

      insert into work_alerts
        (organization_id, source_domain, alert_type, severity, subject_type, subject_id,
         title, message, recipient_profile_id, status, dedupe_key, created_by)
      values
        (p_organization_id, 'indicator', 'indicator_measurement_due', 'info',
         'quality_indicator', v_row.indicator_id,
         'Medición pendiente: ' || v_row.name,
         'Falta el resultado de ' || v_row.period_label || '.',
         v_owner, 'new', 'al:due:' || v_key, auth.uid())
      on conflict do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
revoke all on function public.quality_scan_pending_measurements(uuid) from public, anon;
grant execute on function public.quality_scan_pending_measurements(uuid) to authenticated;


-- §18.7 · CERRAR y REABRIR un ciclo (OI-12, OI-24, OI-27) ---------------------
create or replace function public.quality_close_period(
  p_organization_id uuid, p_label text, p_period_start date, p_period_end date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_id   uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if not is_org_member(p_organization_id) then
    raise exception 'No perteneces a esta empresa';
  end if;
  v_role := current_org_role(p_organization_id);
  if v_role not in ('admin', 'quality') then
    raise exception 'Solo la administración o el área de calidad cierran un periodo';
  end if;
  if p_period_end < p_period_start then
    raise exception 'El periodo termina antes de empezar';
  end if;
  if coalesce(trim(p_label), '') = '' then
    raise exception 'Ponle nombre al periodo que cierras (por ejemplo, 2026).';
  end if;

  insert into quality_period_closures
    (organization_id, label, period_start, period_end, note, closed_by, created_by)
  values
    (p_organization_id, trim(p_label), p_period_start, p_period_end,
     nullif(trim(coalesce(p_note, '')), ''), auth.uid(), auth.uid())
  returning id into v_id;

  -- OI-27 · Lo cerrado deja de ser preliminar.
  update quality_measurements
     set result_state = 'closed'
   where organization_id = p_organization_id
     and period_start >= p_period_start
     and period_end <= p_period_end;

  return v_id;
end;
$$;
revoke all on function public.quality_close_period(uuid, text, date, date, text) from public, anon;
grant execute on function public.quality_close_period(uuid, text, date, date, text) to authenticated;

create or replace function public.quality_reopen_period(p_closure_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c      record;
  v_role   text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if v_reason is null then raise exception 'Escribe el motivo de la reapertura.'; end if;

  select * into v_c from quality_period_closures where id = p_closure_id for update;
  if v_c.id is null then raise exception 'Ese cierre no existe'; end if;
  if v_c.reopened_at is not null then raise exception 'Ese periodo ya fue reabierto'; end if;
  if not is_org_member(v_c.organization_id) then
    raise exception 'No perteneces a esta empresa';
  end if;
  v_role := current_org_role(v_c.organization_id);
  if v_role <> 'admin' then
    raise exception 'Solo un administrador reabre un periodo cerrado';
  end if;

  update quality_period_closures
     set reopened_at = now(), reopened_by = auth.uid(), reopen_reason = v_reason
   where id = p_closure_id;

  update quality_measurements
     set result_state = 'preliminary'
   where organization_id = v_c.organization_id
     and period_start >= v_c.period_start
     and period_end <= v_c.period_end
     and not quality_period_is_closed(organization_id, period_start, period_end);
end;
$$;
revoke all on function public.quality_reopen_period(uuid, text) from public, anon;
grant execute on function public.quality_reopen_period(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- §19 · GUARDAS DE INTEGRIDAD
--
-- Lo que la aplicación promete, la base lo exige. Cada trigger cubre una vía
-- por la que alguien podría reescribir el pasado sin pasar por la interfaz.
-- ----------------------------------------------------------------------------

-- §19.1 · Una CONFIGURACIÓN ya sustituida es inmutable (OI-06, OI-07).
-- Es la pieza sobre la que descansa «cambiar la meta hoy no reescribe la
-- evaluación de ayer»: si la configuración de enero se pudiera editar, la
-- medición de enero cambiaría de veredicto sin que nadie lo notara.
create or replace function public.protect_quality_indicator_config_immutability()
returns trigger
language plpgsql
as $$
begin
  if old.effective_to is not null then
    if new.target_value is distinct from old.target_value
       or new.target_min is distinct from old.target_min
       or new.target_max is distinct from old.target_max
       or new.warning_value is distinct from old.warning_value
       or new.warning_min is distinct from old.warning_min
       or new.warning_max is distinct from old.warning_max
       or new.direction is distinct from old.direction
       or new.unit_code is distinct from old.unit_code
       or new.frequency is distinct from old.frequency
       or new.source_kind is distinct from old.source_kind
       or new.source_key is distinct from old.source_key
       or new.calc_definition is distinct from old.calc_definition
       or new.effective_from is distinct from old.effective_from then
      raise exception 'Una configuración que ya no está vigente no se modifica: su meta rige mediciones históricas. Publica una configuración nueva.';
    end if;
  end if;
  if new.indicator_id is distinct from old.indicator_id
     or new.version_number is distinct from old.version_number then
    raise exception 'La identidad de una configuración no cambia.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_quality_indicator_config_immutability() from public, anon, authenticated;

create trigger t_quality_indicator_configs_immutable
  before update on public.quality_indicator_configs
  for each row execute function public.protect_quality_indicator_config_immutability();


-- §19.2 · Una MEDICIÓN no se reescribe (OI-28).
-- Corregir crea una fila nueva; lo único que puede cambiar en una fila
-- existente es quedar marcada como sustituida, cerrarse con el periodo o
-- registrar la huella del recálculo.
create or replace function public.protect_quality_measurement_immutability()
returns trigger
language plpgsql
as $$
begin
  if new.value is distinct from old.value
     or new.data_state is distinct from old.data_state
     or new.evaluation is distinct from old.evaluation
     or new.period_start is distinct from old.period_start
     or new.period_end is distinct from old.period_end
     or new.indicator_id is distinct from old.indicator_id
     or new.config_id is distinct from old.config_id
     or new.created_by is distinct from old.created_by
     or new.corrects_measurement_id is distinct from old.corrects_measurement_id then
    raise exception 'Una medición registrada no se reescribe. Corrígela: el valor original debe conservarse.';
  end if;
  -- Una medición ya sustituida no vuelve a ser la vigente.
  if old.is_current = false and new.is_current = true then
    raise exception 'Una medición sustituida no vuelve a ser la vigente.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_quality_measurement_immutability() from public, anon, authenticated;

create trigger t_quality_measurements_immutable
  before update on public.quality_measurements
  for each row execute function public.protect_quality_measurement_immutability();


-- §19.3 · El estado ADMINISTRATIVO de un indicador no se convierte en desempeño
-- por la puerta de atrás, y retirar exige motivo (OI-03, OI-32).
create or replace function public.protect_quality_indicator_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if new.admin_state = 'retired' and old.admin_state <> 'retired' then
    if coalesce(trim(new.retirement_reason), '') = '' then
      raise exception 'Escribe el motivo del retiro del indicador.';
    end if;
    new.retired_at := coalesce(new.retired_at, now());
  end if;
  if old.admin_state = 'retired' and new.admin_state <> 'retired' then
    raise exception 'Un indicador retirado no vuelve al servicio: crea uno nuevo y decláralo sucesor.';
  end if;
  if new.successor_indicator_id is not null and new.successor_indicator_id = new.id then
    raise exception 'Un indicador no puede ser su propio sucesor.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_quality_indicator_lifecycle() from public, anon, authenticated;

create trigger t_quality_indicators_lifecycle
  before update on public.quality_indicators
  for each row execute function public.protect_quality_indicator_lifecycle();


-- §19.4 · Un objetivo cerrado no se reabre editando su estado a mano, y cerrar
-- deja constancia de cuándo.
create or replace function public.protect_quality_objective_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if new.admin_state = 'closed' and old.admin_state <> 'closed' then
    new.closed_at := coalesce(new.closed_at, now());
    new.closed_by := coalesce(new.closed_by, auth.uid());
  end if;
  if old.admin_state = 'closed' and new.admin_state not in ('closed', 'cancelled') then
    raise exception 'Un objetivo cerrado no vuelve a abrirse. Crea el objetivo del ciclo siguiente.';
  end if;
  if new.parent_objective_id is not null and new.parent_objective_id = new.id then
    raise exception 'Un objetivo no puede depender de sí mismo.';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_quality_objective_lifecycle() from public, anon, authenticated;

create trigger t_quality_objectives_lifecycle
  before update on public.quality_objectives
  for each row execute function public.protect_quality_objective_lifecycle();


-- ----------------------------------------------------------------------------
-- §20 · VISTAS DERIVADAS
--
-- Nada de lo que se puede calcular se almacena. El desempeño de un indicador y
-- el de un objetivo son PROYECCIONES: así no existe la posibilidad de que un
-- estado guardado se quede desactualizado respecto de los datos que lo
-- justifican (MDR-37).
--
-- security_invoker = true en todas: heredan la RLS real de sus tablas origen y
-- nunca pueden mostrar más de lo que ve quien consulta.
-- ----------------------------------------------------------------------------

-- §20.1 · Estado actual de cada indicador
create view public.v_quality_indicator_status
with (security_invoker = true) as
select
  i.organization_id,
  i.id                                        as indicator_id,
  i.code,
  i.name,
  i.description,
  i.scope_type,
  i.scope_process_id,
  proc.name                                   as scope_process_name,
  i.admin_state,
  i.retired_at,
  i.successor_indicator_id,
  i.owner_position_id,
  pos.name                                    as owner_position_name,
  coalesce(nullif(trim(holder.full_name), ''), holder.email) as owner_holder_name,
  coalesce(nullif(trim(op.full_name), ''), op.email)         as owner_profile_name,
  i.created_at,

  cfg.id                                      as config_id,
  cfg.version_number                          as config_version,
  cfg.effective_from                          as config_effective_from,
  cfg.unit_code,
  cfg.unit_label,
  cfg.direction,
  cfg.frequency,
  cfg.target_value,
  cfg.target_min,
  cfg.target_max,
  cfg.warning_value,
  cfg.warning_min,
  cfg.warning_max,
  cfg.source_kind,
  cfg.source_key,
  cfg.formula_text,
  cfg.calc_definition,
  cfg.consolidation_method,
  cfg.comparability_break,

  last_m.period_label                         as last_period_label,
  last_m.period_start                         as last_period_start,
  last_m.period_end                           as last_period_end,
  last_m.value                                as last_value,
  last_m.data_state                           as last_data_state,
  last_m.data_quality                         as last_data_quality,
  last_m.evaluation                           as last_evaluation,
  last_m.evaluation_explanation               as last_evaluation_explanation,
  last_m.result_state                         as last_result_state,
  last_m.measured_at                          as last_measured_at,

  due.period_label                            as due_period_label,
  due.period_start                            as due_period_start,
  due.period_end                              as due_period_end,
  -- MEDICIÓN PENDIENTE: el último periodo cerrado no tiene medición vigente.
  -- Se DERIVA siempre; no depende de que nadie haya corrido el barrido.
  (i.admin_state = 'active' and cfg.id is not null and not exists (
     select 1 from public.quality_measurements m
      where m.indicator_id = i.id and m.period_start = due.period_start
        and m.period_end = due.period_end and m.is_current
   ))                                          as measurement_pending,

  nxt.period_label                            as current_period_label,
  nxt.period_end                              as next_measurement_due_on,

  coalesce(stats.measurement_count, 0)        as measurement_count
from public.quality_indicators i
left join public.quality_processes proc on proc.id = i.scope_process_id
left join public.quality_positions pos   on pos.id = i.owner_position_id
left join public.profiles op             on op.id = i.owner_profile_id
left join public.v_quality_position_current_holder h on h.position_id = i.owner_position_id
left join public.profiles holder         on holder.id = h.profile_id

-- Configuración VIGENTE hoy.
left join lateral (
  select c.* from public.quality_indicator_configs c
   where c.indicator_id = i.id and c.effective_to is null
   limit 1
) cfg on true

-- Última medición vigente, por periodo (no por fecha de registro).
left join lateral (
  select m.* from public.quality_measurements m
   where m.indicator_id = i.id and m.is_current
   order by m.period_start desc limit 1
) last_m on true

left join lateral (
  select * from public.quality_previous_period(coalesce(cfg.frequency, 'monthly'), current_date)
) due on true

left join lateral (
  select * from public.quality_period_bounds(coalesce(cfg.frequency, 'monthly'), current_date)
) nxt on true

left join lateral (
  select count(*) as measurement_count from public.quality_measurements m
   where m.indicator_id = i.id and m.is_current
) stats on true;

comment on view public.v_quality_indicator_status is
  'QUALITY-03 · Estado de cada indicador, DERIVADO (MDR-37). Distingue el estado administrativo del desempeño (OI-03) y calcula la medición pendiente sin depender de ningún proceso programado.';


-- §20.2 · Desempeño de cada objetivo, explicable (OI-18)
--
-- OI no define ponderación, así que no se inventa: se ofrecen dos reglas
-- explícitas y la vista dice CUÁL mandó y POR QUÉ.
create view public.v_quality_objective_performance
with (security_invoker = true) as
select
  o.organization_id,
  o.id                                        as objective_id,
  o.code,
  o.name,
  o.description,
  o.purpose,
  o.admin_state,
  o.period_start,
  o.period_end,
  o.evaluation_rule,
  o.parent_objective_id,
  o.owner_position_id,
  pos.name                                    as owner_position_name,
  coalesce(nullif(trim(holder.full_name), ''), holder.email) as owner_holder_name,
  coalesce(nullif(trim(op.full_name), ''), op.email)         as owner_profile_name,
  o.closed_at,
  o.created_at,

  coalesce(ind.total, 0)                      as indicator_count,
  coalesce(ind.complies, 0)                   as indicators_complying,
  coalesce(ind.attention, 0)                  as indicators_attention,
  coalesce(ind.not_met, 0)                    as indicators_not_met,
  coalesce(ind.no_data, 0)                    as indicators_without_data,
  coalesce(pend.pending, 0)                   as indicators_pending_measurement,
  coalesce(proc.process_names, '')            as process_names,
  coalesce(proc.process_count, 0)             as process_count,

  -- El desempeño del objetivo. Nunca lo escribe una persona: se deriva.
  case
    when coalesce(ind.total, 0) = 0 then 'no_indicators'
    when coalesce(ind.complies, 0) + coalesce(ind.attention, 0) + coalesce(ind.not_met, 0) = 0
      then 'no_data'
    when o.evaluation_rule = 'majority_comply' then
      case when ind.complies * 2 > (ind.complies + ind.attention + ind.not_met) then 'complies'
           when ind.not_met > 0 then 'not_met'
           else 'attention' end
    else -- worst_indicator
      case when ind.not_met > 0 then 'not_met'
           when ind.attention > 0 then 'attention'
           else 'complies' end
  end                                          as performance,

  case
    when coalesce(ind.total, 0) = 0 then 'Todavía no tiene indicadores asociados.'
    when coalesce(ind.complies, 0) + coalesce(ind.attention, 0) + coalesce(ind.not_met, 0) = 0
      then 'Sus indicadores aún no tienen mediciones evaluables.'
    when o.evaluation_rule = 'majority_comply' then
      'Regla: cumple si más de la mitad de sus indicadores cumple. ' ||
      ind.complies || ' de ' || (ind.complies + ind.attention + ind.not_met) || ' cumplen.'
    else
      'Regla: manda el peor indicador. ' ||
      case when ind.not_met > 0 then ind.not_met || ' no cumple(n).'
           when ind.attention > 0 then ind.attention || ' en atención.'
           else 'todos cumplen.' end
  end                                          as performance_explanation
from public.quality_objectives o
left join public.quality_positions pos on pos.id = o.owner_position_id
left join public.profiles op           on op.id = o.owner_profile_id
left join public.v_quality_position_current_holder h on h.position_id = o.owner_position_id
left join public.profiles holder       on holder.id = h.profile_id

left join lateral (
  select
    count(*)                                                          as total,
    count(*) filter (where s.last_evaluation = 'complies')            as complies,
    count(*) filter (where s.last_evaluation = 'attention')           as attention,
    count(*) filter (where s.last_evaluation = 'not_met')             as not_met,
    count(*) filter (where s.last_evaluation in ('no_data', 'no_target')
                        or s.last_evaluation is null)                 as no_data
  from public.quality_objective_indicators oi
  join public.v_quality_indicator_status s on s.indicator_id = oi.indicator_id
  where oi.objective_id = o.id and s.admin_state = 'active'
) ind on true

left join lateral (
  select count(*) as pending
  from public.quality_objective_indicators oi
  join public.v_quality_indicator_status s on s.indicator_id = oi.indicator_id
  where oi.objective_id = o.id and s.measurement_pending
) pend on true

left join lateral (
  select string_agg(distinct p.name, ', ') as process_names, count(distinct p.id) as process_count
  from public.quality_objective_processes op2
  join public.quality_processes p on p.id = op2.process_id
  where op2.objective_id = o.id
) proc on true;

comment on view public.v_quality_objective_performance is
  'QUALITY-03 · Desempeño del objetivo, DERIVADO de sus indicadores y EXPLICABLE (OI-18). OI no define ponderación, así que no se inventa: dos reglas explícitas y la vista dice cuál mandó.';


-- ----------------------------------------------------------------------------
-- §21 · PRIVILEGIOS EXPLÍCITOS (lección de Q0 · convención de 0111 · 0112 §12 ·
--       0116 §10)
--
-- Ninguna tabla de este sprint depende del bootstrap de Supabase. Se concede
-- solo el DML que la RLS puede llegar a permitir: nunca GRANT ALL, nunca
-- TRUNCATE (bypasea RLS), nunca REFERENCES ni TRIGGER (son DDL).
--
-- Las tablas del motor de medición reciben SELECT y nada más: sus escrituras
-- son exclusivamente de las RPC SECURITY DEFINER. Conceder INSERT «por si
-- acaso» permitiría fabricar una medición automática o una evaluación desde el
-- navegador, que es justo lo que §41 del encargo prohíbe.
-- ----------------------------------------------------------------------------
grant select, insert, update, delete on table
  public.quality_objectives,
  public.quality_objective_processes,
  public.quality_objective_indicators,
  public.quality_indicators
to authenticated;

grant select, insert, delete on table public.quality_measurement_evidence to authenticated;

grant select on table
  public.quality_indicator_configs,
  public.quality_measurements,
  public.quality_calculation_runs,
  public.quality_period_closures,
  public.work_events,
  public.v_quality_indicator_status,
  public.v_quality_objective_performance
to authenticated;

grant select, insert, update, delete on table
  public.quality_objectives,
  public.quality_objective_processes,
  public.quality_objective_indicators,
  public.quality_indicators,
  public.quality_indicator_configs,
  public.quality_measurements,
  public.quality_measurement_evidence,
  public.quality_calculation_runs,
  public.quality_period_closures,
  public.work_events
to service_role;

grant select on table
  public.v_quality_indicator_status,
  public.v_quality_objective_performance
to service_role;

-- Retirar lo que concede el ENTORNO, no esta migración. Los privilegios por
-- defecto del rol postgres otorgan Dxtm a anon y authenticated en CADA tabla
-- que se crea, así que sin este bloque las tablas nuevas nacerían con TRUNCATE
-- en manos de roles de cliente — y TRUNCATE BYPASEA RLS por completo.
revoke truncate, references, trigger on table
  public.quality_objectives,
  public.quality_objective_processes,
  public.quality_objective_indicators,
  public.quality_indicators,
  public.quality_indicator_configs,
  public.quality_measurements,
  public.quality_measurement_evidence,
  public.quality_calculation_runs,
  public.quality_period_closures,
  public.work_events
from anon, authenticated;

-- anon no recibe NADA: ninguna superficie de Quality es pública.
revoke all on table
  public.quality_objectives,
  public.quality_objective_processes,
  public.quality_objective_indicators,
  public.quality_indicators,
  public.quality_indicator_configs,
  public.quality_measurements,
  public.quality_measurement_evidence,
  public.quality_calculation_runs,
  public.quality_period_closures,
  public.work_events,
  public.v_quality_indicator_status,
  public.v_quality_objective_performance
from anon;
