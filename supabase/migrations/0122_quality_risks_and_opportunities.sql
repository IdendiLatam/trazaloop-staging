-- ============================================================================
-- QUALITY-05 · RIESGOS, OPORTUNIDADES, CONTROLES Y TRATAMIENTO
-- ============================================================================
--
-- Decisiones congeladas que manda este archivo: RO-01…RO-35 del Quality
-- Architecture Baseline v1.0 (§13), con los nombres canonicos del inventario
-- de entidades (§21.9) y los patrones relacionales de §22.9.
--
-- Lo que este sprint NO hace, y por que:
--
--   · No crea una matriz generica de probabilidad x impacto cableada. RO-03
--     dice que la metodologia es CONFIGURABLE y RO-04 que las evaluaciones
--     historicas conservan la suya. Una formula fija en el codigo haria
--     imposible las dos cosas.
--   · No crea risk_actions, risk_tasks, risk_alerts ni risk_files. MDR-46:
--     acciones, evidencias, tareas y alertas son transversales. QUALITY-04 ya
--     las construyo; aqui se ENSANCHAN sus catalogos, no se duplican.
--   · No convierte una materializacion en no conformidad. RO-27 separa
--     incidente de riesgo y AC-01 reserva la calificacion a una persona.
--
-- Las seis distinciones que el modelo tiene que sostener, y donde vive cada
-- una:
--
--   RIESGO != NO CONFORMIDAD          quality_risks vs work_cases
--   CONTROL != ACCION                 quality_controls vs work_actions
--   CAUSA != EVENTO != CONSECUENCIA   tres tablas, no un textarea
--   INHERENTE != RESIDUAL             assessment_kind, dos filas, nunca una
--   NIVEL != ESTADO                   result_level_id vs status (RO-18)
--   METODOLOGIA != EVALUACION         version inmutable + FK (MDR-36)
--
-- Append-only. No altera ninguna migracion anterior.
-- ============================================================================


-- ============================================================================
-- §1 · METODOLOGIA CONFIGURABLE Y VERSIONADA (RO-03, RO-04, MDR-08)
-- ============================================================================
--
-- Identidad estable + revisiones inmutables. Una metodologia nueva no
-- recalcula nada: las evaluaciones apuntan por FK a la VERSION con la que se
-- hicieron (MDR-36), asi que su nivel se sigue explicando con las escalas de
-- entonces aunque hoy rijan otras.
--
-- `applies_to` es lo que cumple RO-15: la priorizacion de oportunidades usa su
-- PROPIA metodologia. No es la de riesgos con otras etiquetas.
-- ----------------------------------------------------------------------------
create table public.quality_risk_methodologies (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,

  code             text not null,
  name             text not null,
  description      text,

  -- RO-15. Una empresa puede tener una metodologia para riesgos y otra,
  -- distinta, para oportunidades.
  applies_to       text not null default 'risk'
                   check (applies_to in ('risk','opportunity')),

  -- RO-13.2: cualitativa, semicuantitativa o controlada a medida.
  approach         text not null default 'qualitative'
                   check (approach in ('qualitative','semi_quantitative','custom')),

  is_active        boolean not null default true,

  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_risk_methodologies_code_uniq unique (organization_id, code),
  constraint quality_risk_methodologies_org_id_uniq unique (organization_id, id),
  constraint quality_risk_methodologies_name_not_blank check (length(btrim(name)) > 0)
);
comment on table public.quality_risk_methodologies is
  'QUALITY-05 · RO-03/RO-15 · Identidad estable de una metodologia de valoracion. Lo que cambia con el tiempo vive en sus versiones, no aqui.';


create table public.quality_risk_methodology_versions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  methodology_id   uuid not null,

  version_number   integer not null,

  -- Borrador se edita; publicada se congela. RO-04 y la filosofia Historical
  -- Truth: lo que se uso para decidir no se reescribe.
  status           text not null default 'draft'
                   check (status in ('draft','published','superseded','retired')),

  -- Vigencia de NEGOCIO, distinta del instante de creacion (MDR-07).
  effective_from   date,
  effective_to     date,

  -- Como se combinan los factores. Deterministico y declarado: el usuario
  -- elige niveles validos y el sistema deriva; nadie teclea "Alto".
  aggregation      text not null default 'product'
                   check (aggregation in ('product','sum','weighted_sum','max','min')),

  change_note      text,
  published_at     timestamptz,
  published_by     uuid references public.profiles(id) on delete set null,

  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint quality_risk_methodology_versions_methodology_fk
    foreign key (organization_id, methodology_id)
    references public.quality_risk_methodologies (organization_id, id) on delete restrict,
  constraint quality_risk_methodology_versions_number_uniq
    unique (methodology_id, version_number),
  constraint quality_risk_methodology_versions_org_id_uniq
    unique (organization_id, id),
  constraint quality_risk_methodology_versions_number_positive
    check (version_number > 0),
  constraint quality_risk_methodology_versions_published_consistent
    check ((status = 'draft') = (published_at is null)),
  constraint quality_risk_methodology_versions_range_ordered
    check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
comment on table public.quality_risk_methodology_versions is
  'QUALITY-05 · RO-04 · Revision inmutable de una metodologia. Publicada deja de editarse: una evaluación de 2026 tiene que seguir explicandose con lo que regia en 2026.';


-- Dimensiones de la version. NO se asume «probabilidad x impacto»: eso es una
-- configuracion posible, no la unica. Una escala de tipo `result` es la que
-- traduce el puntaje en nivel, de modo que la matriz entera sale de aqui.
create table public.quality_risk_scales (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  version_id       uuid not null,

  code             text not null,
  label            text not null,
  description      text,

  scale_kind       text not null default 'dimension'
                   check (scale_kind in ('dimension','result')),

  position         integer not null default 1,
  weight           numeric(6,3) not null default 1,

  created_at       timestamptz not null default now(),

  constraint quality_risk_scales_version_fk
    foreign key (organization_id, version_id)
    references public.quality_risk_methodology_versions (organization_id, id) on delete cascade,
  constraint quality_risk_scales_code_uniq unique (version_id, code),
  constraint quality_risk_scales_org_id_uniq unique (organization_id, id),
  constraint quality_risk_scales_label_not_blank check (length(btrim(label)) > 0),
  constraint quality_risk_scales_weight_positive check (weight > 0)
);
comment on table public.quality_risk_scales is
  'QUALITY-05 · RO-03 · Dimensiones de una version de metodologia. `result` es la escala que convierte puntaje en nivel: la matriz no esta cableada, se declara.';


create table public.quality_risk_scale_levels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  scale_id         uuid not null,

  value            numeric(8,3) not null,
  label            text not null,
  description      text,
  position         integer not null default 1,

  -- Solo para escalas `result`: la banda de puntaje que corresponde a este
  -- nivel. Es lo que hace la derivacion deterministica y explicable.
  min_score        numeric(12,4),
  max_score        numeric(12,4),

  -- RO-08 y §31: el apetito no es un numero suelto, es una propiedad del nivel
  -- declarada en la metodologia. «Aceptable» significa que no exige aprobacion
  -- formal para convivir con el riesgo.
  is_acceptable    boolean not null default true,

  -- RO-35: la periodicidad de revision depende de metodologia y criticidad, no
  -- de un aniversario. Un nivel extremo se revisa antes que uno bajo.
  review_months    integer,

  -- La accesibilidad no puede depender solo del color (§61): el token es una
  -- ayuda, la etiqueta es la que informa.
  color_token      text,

  created_at       timestamptz not null default now(),

  constraint quality_risk_scale_levels_scale_fk
    foreign key (organization_id, scale_id)
    references public.quality_risk_scales (organization_id, id) on delete cascade,
  constraint quality_risk_scale_levels_org_id_uniq unique (organization_id, id),
  constraint quality_risk_scale_levels_label_not_blank check (length(btrim(label)) > 0),
  constraint quality_risk_scale_levels_band_ordered
    check (min_score is null or max_score is null or max_score >= min_score),
  constraint quality_risk_scale_levels_review_positive
    check (review_months is null or review_months > 0)
);
comment on table public.quality_risk_scale_levels is
  'QUALITY-05 · RO-03/RO-08/RO-35 · Niveles de una escala. En la escala `result` cada nivel declara su banda de puntaje, si es aceptable y cada cuanto obliga a revisar.';


-- ============================================================================
-- §2 · RIESGOS (RO-01, RO-02, RO-18, RO-29, RO-35)
-- ============================================================================
--
-- RO-01: riesgo y oportunidad son objetos DISTINTOS. No hay una tabla comun
-- con un `type` que los difumine; comparten el motor de valoracion porque eso
-- es infraestructura, no significado.
--
-- La expresion preferida de RO-13.1 es CAUSA -> EVENTO -> CONSECUENCIA. El
-- EVENTO es el riesgo mismo (`event_description`); causas y consecuencias son
-- tablas propias porque un riesgo real tiene varias de cada una y meterlas en
-- un textarea impide relacionarlas, contarlas o tratarlas.
-- ----------------------------------------------------------------------------
create table public.quality_risks (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,

  code                 text not null,
  title                text not null,

  -- El EVENTO: que puede pasar. Obligatorio, porque un riesgo sin evento no es
  -- un riesgo, es una preocupacion.
  event_description    text not null,

  context_note         text,

  identified_on        date not null default current_date,

  -- RO-11: de donde vino la sospecha. Que un indicador o una auditoria la
  -- sugieran no la convierte en riesgo formal; alguien la valida y por eso el
  -- origen queda registrado.
  origin_kind          text not null default 'manual'
                       check (origin_kind in ('manual','indicator','process','document',
                                              'case','audit','supplier','customer',
                                              'management_review','signal','other')),
  origin_note          text,

  -- MDR-33: la responsabilidad permanente apunta a un CARGO. La persona que
  -- lo ocupa hoy puede irse; el riesgo conserva su dueno.
  owner_position_id    uuid,
  owner_profile_id     uuid references public.profiles(id) on delete set null,

  -- RO-18: ESTADO ADMINISTRATIVO. Nada que ver con el nivel: un riesgo extremo
  -- puede estar activo y uno bajo puede estar cerrado.
  status               text not null default 'draft'
                       check (status in ('draft','active','closed','retired','superseded')),

  -- RO-10 / RO-35: toda ficha activa tiene regla de revision, y el plazo sale
  -- del nivel vigente segun la metodologia, no de un aniversario impuesto.
  next_review_on       date,
  review_interval_months integer,
  last_reviewed_on     date,

  -- RO-29: cerrar, retirar y suceder sin perder historia.
  closure_reason       text,
  closed_at            timestamptz,
  closed_by            uuid references public.profiles(id) on delete set null,
  superseded_by_risk_id uuid,

  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint quality_risks_code_uniq unique (organization_id, code),
  constraint quality_risks_org_id_uniq unique (organization_id, id),
  constraint quality_risks_title_not_blank check (length(btrim(title)) > 0),
  constraint quality_risks_event_not_blank check (length(btrim(event_description)) > 0),
  constraint quality_risks_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_risks_superseded_fk
    foreign key (organization_id, superseded_by_risk_id)
    references public.quality_risks (organization_id, id) on delete restrict,
  constraint quality_risks_closed_consistent
    check ((status in ('closed','retired')) = (closed_at is not null)),
  constraint quality_risks_superseded_consistent
    check (superseded_by_risk_id is null or status = 'superseded'),
  constraint quality_risks_review_positive
    check (review_interval_months is null or review_interval_months > 0)
);
comment on table public.quality_risks is
  'QUALITY-05 · RO-01/RO-18 · Riesgo formal. El estado dice en que punto administrativo esta; el nivel sale de sus evaluaciones y vive en otra tabla.';


create table public.quality_risk_codes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  risk_id         uuid,
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  primary key (organization_id, code),
  constraint quality_risk_codes_released_consistent
    check ((risk_id is null) = (released_at is not null))
);
comment on table public.quality_risk_codes is
  'QUALITY-05 · D-04 · Reserva de numeros de riesgo. Un numero usado no se recicla aunque el borrador se tire: ya viajo en un acta.';


create table public.quality_risk_causes (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  risk_id          uuid not null,

  description      text not null,
  -- RO-13.4 distingue la fuente del disparador. No es un adorno: una fuente
  -- externa y una interna se tratan distinto.
  source_kind      text not null default 'internal'
                   check (source_kind in ('internal','external','supplier','customer',
                                          'technology','people','regulatory','other')),
  position         integer not null default 1,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint quality_risk_causes_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete cascade,
  constraint quality_risk_causes_org_id_uniq unique (organization_id, id),
  constraint quality_risk_causes_not_blank check (length(btrim(description)) > 0)
);
comment on table public.quality_risk_causes is
  'QUALITY-05 · RO-13.1 · Por que podria pasar. Separado del evento porque un riesgo tiene varias causas y cada una se ataca distinto.';


create table public.quality_risk_consequences (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  risk_id          uuid not null,

  description      text not null,
  -- Sobre que recae. Permite responder «que se nos rompe» sin abrir un
  -- framework financiero que este sprint no construye.
  impact_area      text not null default 'operational'
                   check (impact_area in ('operational','quality','customer','financial',
                                          'regulatory','reputational','safety',
                                          'environmental','other')),
  position         integer not null default 1,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint quality_risk_consequences_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete cascade,
  constraint quality_risk_consequences_org_id_uniq unique (organization_id, id),
  constraint quality_risk_consequences_not_blank check (length(btrim(description)) > 0)
);
comment on table public.quality_risk_consequences is
  'QUALITY-05 · RO-13.1 · Que pasaria si ocurre. Tercera pata de CAUSA -> EVENTO -> CONSECUENCIA.';


-- N:M con procesos (§22.9). Un riesgo de suministro afecta a Compras, a
-- Produccion y a Despachos: es UN riesgo con tres procesos, no tres riesgos.
create table public.quality_risk_processes (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  risk_id         uuid not null,
  process_id      uuid not null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (risk_id, process_id),
  constraint quality_risk_processes_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete cascade,
  constraint quality_risk_processes_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete restrict
);
comment on table public.quality_risk_processes is
  'QUALITY-05 · §22.9 · Relacion N:M riesgo-proceso. Con FK compuesta por empresa (MDR-42): las dos puntas tienen que ser de la misma.';


-- ============================================================================
-- §3 · CONTROLES (RO-06, RO-24, RO-25, RO-26)
-- ============================================================================
--
-- RO-06: un CONTROL no es una ACCION. La accion es algo que alguien va a hacer
-- y termina; el control es algo que YA existe y funciona de continuo para
-- reducir la exposicion o detectar el evento. Confundirlos es lo que produce
-- planes de accion eternos que nadie cierra.
--
-- RO-26: la efectividad se evalua APARTE de la existencia. Que un control este
-- documentado no dice si funciona.
-- ----------------------------------------------------------------------------
create table public.quality_controls (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete restrict,

  code                text not null,
  title               text not null,
  description         text,

  -- RO-13.3: preventivo, detectivo o correctivo.
  control_nature      text not null default 'preventive'
                      check (control_nature in ('preventive','detective','corrective')),

  -- RO-25: manual, automatico o mixto.
  operation_mode      text not null default 'manual'
                      check (operation_mode in ('manual','automated','mixed')),

  frequency           text,

  -- §23 · MDR-33: el control tiene dueno de CARGO. Quien lo verifica en cada
  -- revision se guarda en la revision, no aqui.
  owner_position_id   uuid,

  status              text not null default 'draft'
                      check (status in ('draft','active','retired')),

  retired_at          timestamptz,
  retirement_reason   text,

  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint quality_controls_code_uniq unique (organization_id, code),
  constraint quality_controls_org_id_uniq unique (organization_id, id),
  constraint quality_controls_title_not_blank check (length(btrim(title)) > 0),
  constraint quality_controls_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_controls_retired_consistent
    check ((status = 'retired') = (retired_at is not null))
);
comment on table public.quality_controls is
  'QUALITY-05 · RO-06/RO-25 · Control existente. No es una accion: ya opera. Su eficacia se juzga en otra tabla porque existir y funcionar son cosas distintas.';


create table public.quality_control_codes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  control_id      uuid,
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  primary key (organization_id, code),
  constraint quality_control_codes_released_consistent
    check ((control_id is null) = (released_at is not null))
);
comment on table public.quality_control_codes is
  'QUALITY-05 · D-04 · Reserva de numeros de control.';


-- §22.9: risk N:M controls.
create table public.quality_risk_control_links (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  risk_id         uuid not null,
  control_id      uuid not null,
  note            text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (risk_id, control_id),
  constraint quality_risk_control_links_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete cascade,
  constraint quality_risk_control_links_control_fk
    foreign key (organization_id, control_id)
    references public.quality_controls (organization_id, id) on delete restrict
);
comment on table public.quality_risk_control_links is
  'QUALITY-05 · §22.9 · Que controles mitigan que riesgos. Un mismo control sirve a varios riesgos: por eso es N:M y no una columna.';


-- RO-24: los controles se relacionan con procesos y actividades. Las
-- actividades (etapas de proceso, MDR-14) todavia no existen como entidad en
-- este esquema; cuando existan, esta tabla gana su columna. Mientras tanto
-- modela lo que SI hay, que son los procesos, en vez de inventar una columna
-- polimorfica que nadie podria validar.
create table public.quality_control_activity_links (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  control_id      uuid not null,
  process_id      uuid not null,
  note            text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (control_id, process_id),
  constraint quality_control_activity_links_control_fk
    foreign key (organization_id, control_id)
    references public.quality_controls (organization_id, id) on delete cascade,
  constraint quality_control_activity_links_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete restrict
);
comment on table public.quality_control_activity_links is
  'QUALITY-05 · RO-24 · Donde opera el control. Hoy apunta a procesos; las etapas llegaran con MDR-14 sin romper esta tabla.';


create table public.quality_control_effectiveness_reviews (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  control_id           uuid not null,

  reviewed_on          date not null default current_date,
  reviewed_by          uuid references public.profiles(id) on delete set null,

  -- RO-26. Tres preguntas distintas, tres respuestas: esta bien pensado, se
  -- aplica de verdad, y sirve para algo. No hay formula universal (§26): son
  -- juicios declarados con su criterio a la vista.
  design_verdict       text not null default 'adequate'
                       check (design_verdict in ('adequate','partial','inadequate','not_assessed')),
  implementation_verdict text not null default 'implemented'
                       check (implementation_verdict in ('implemented','partial','not_implemented','not_assessed')),
  effectiveness_verdict text not null default 'effective'
                       check (effectiveness_verdict in ('effective','partially_effective','ineffective','not_assessed')),

  criterion            text,
  note                 text,

  created_at           timestamptz not null default now(),

  constraint quality_control_effectiveness_reviews_control_fk
    foreign key (organization_id, control_id)
    references public.quality_controls (organization_id, id) on delete restrict,
  constraint quality_control_effectiveness_reviews_org_id_uniq unique (organization_id, id)
);
comment on table public.quality_control_effectiveness_reviews is
  'QUALITY-05 · RO-26 · Juicio sobre un control: diseno, implementacion y eficacia por separado. Inmutable: una evaluación residual vieja tiene que seguir explicandose con el veredicto de entonces.';


-- ============================================================================
-- §4 · EVALUACIONES (RO-04, RO-07, RO-09)
-- ============================================================================
--
-- RO-09 es la regla dura: una reevaluación NUNCA sobrescribe la anterior. Por
-- eso no existe `quality_risks.current_score`: el nivel vigente es una
-- PROYECCION (§33 del baseline) que se calcula desde la ultima fila, y la
-- historia entera sigue ahi.
--
-- RO-07: inherente y residual son dos evaluaciones, no dos columnas de la
-- misma fila. Guardar `residual_score` junto a `inherent_score` obligaria a
-- pisar una de las dos en cada revision.
-- ----------------------------------------------------------------------------
create table public.quality_risk_assessments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  risk_id               uuid not null,

  assessment_kind       text not null
                        check (assessment_kind in ('inherent','residual')),

  -- MDR-36: FK a la VERSION inmutable, no una copia de la metodologia. Si
  -- manana se publica la v2, esta fila sigue apuntando a la v1 y se explica
  -- con sus escalas.
  methodology_version_id uuid not null,

  assessed_on           date not null default current_date,
  -- El acto historico lo firma una PERSONA (MDR-33), no un cargo.
  assessed_by           uuid references public.profiles(id) on delete set null,

  -- Derivado, nunca tecleado. §19: el usuario elige factores validos y el
  -- sistema deriva el nivel.
  score                 numeric(12,4) not null,
  result_level_id       uuid not null,

  -- La explicacion visible (§62): que factores, que regla, que banda. No es un
  -- dato critico normalizado, es el rastro de como se llego al numero.
  derivation            jsonb not null default '{}'::jsonb,

  rationale             text,

  created_at            timestamptz not null default now(),

  constraint quality_risk_assessments_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete restrict,
  constraint quality_risk_assessments_version_fk
    foreign key (organization_id, methodology_version_id)
    references public.quality_risk_methodology_versions (organization_id, id) on delete restrict,
  constraint quality_risk_assessments_level_fk
    foreign key (organization_id, result_level_id)
    references public.quality_risk_scale_levels (organization_id, id) on delete restrict,
  constraint quality_risk_assessments_org_id_uniq unique (organization_id, id)
);
comment on table public.quality_risk_assessments is
  'QUALITY-05 · RO-07/RO-09 · Evaluacion formal, inmutable. Marzo Alto, junio Medio y diciembre Bajo son TRES filas: la vigente es una proyeccion, no una sobrescritura.';


-- Los factores son una relacion critica, no un JSON (MDR-10): la FK al nivel
-- de escala es lo que IMPIDE estructuralmente (§18) usar un valor que no
-- pertenece a la version con la que se esta evaluando.
create table public.quality_risk_assessment_factors (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  assessment_id    uuid not null,
  scale_id         uuid not null,
  level_id         uuid not null,
  created_at       timestamptz not null default now(),

  constraint quality_risk_assessment_factors_assessment_fk
    foreign key (organization_id, assessment_id)
    references public.quality_risk_assessments (organization_id, id) on delete cascade,
  constraint quality_risk_assessment_factors_scale_fk
    foreign key (organization_id, scale_id)
    references public.quality_risk_scales (organization_id, id) on delete restrict,
  constraint quality_risk_assessment_factors_level_fk
    foreign key (organization_id, level_id)
    references public.quality_risk_scale_levels (organization_id, id) on delete restrict,
  constraint quality_risk_assessment_factors_one_per_scale unique (assessment_id, scale_id)
);
comment on table public.quality_risk_assessment_factors is
  'QUALITY-05 · §18 · Que valor se escogio en cada dimension. La FK al nivel impide por construccion usar una escala que no es la de esa version.';


-- ============================================================================
-- §5 · TRATAMIENTO (RO-08, §32, §33, §36)
-- ============================================================================
--
-- El TRATAMIENTO es la decision de estrategia, no la tarea. «Reducir» es la
-- decision; homologar un segundo proveedor, subir el stock minimo y escribir
-- el plan de contingencia son TRES acciones de work_actions. Meterlas en la
-- misma fila haria imposible saber cual se cumplio.
--
-- RO-08: aceptar un riesgo cuyo nivel vigente NO es aceptable segun la
-- metodologia exige aprobacion formal. Y aceptar no es ignorar (§32): el plan
-- aceptado conserva su fecha de revision y sigue vivo.
--
-- Append-only (MDR-49): cambiar de estrategia crea un plan nuevo que sucede al
-- anterior. El historico de decisiones no se edita.
-- ----------------------------------------------------------------------------
create table public.quality_risk_treatment_plans (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,
  risk_id              uuid not null,

  -- §33: el catalogo de estrategias de riesgo. `pursue` no esta aqui: eso es
  -- lenguaje de oportunidad y mezclarlo confundiria las dos cosas.
  strategy             text not null
                       check (strategy in ('avoid','reduce','share','accept')),

  rationale            text not null,

  -- Sobre que evaluación se decidio. Congela el contexto: si manana el riesgo
  -- se reevalua, esta decision sigue explicando que se sabia al tomarla.
  based_on_assessment_id uuid,

  decided_on           date not null default current_date,
  decided_by           uuid references public.profiles(id) on delete set null,

  -- RO-08. `requires_approval` lo decide el sistema mirando si el nivel
  -- vigente es aceptable; no es una casilla que el autor pueda desmarcar.
  requires_approval    boolean not null default false,
  status               text not null default 'active'
                       check (status in ('pending_approval','active','superseded','cancelled')),
  approved_by          uuid references public.profiles(id) on delete set null,
  approved_at          timestamptz,
  approval_note        text,

  -- §32: aceptar obliga a seguir mirando.
  review_on            date,

  superseded_by_plan_id uuid,

  created_at           timestamptz not null default now(),

  constraint quality_risk_treatment_plans_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete restrict,
  constraint quality_risk_treatment_plans_assessment_fk
    foreign key (organization_id, based_on_assessment_id)
    references public.quality_risk_assessments (organization_id, id) on delete restrict,
  constraint quality_risk_treatment_plans_superseded_fk
    foreign key (organization_id, superseded_by_plan_id)
    references public.quality_risk_treatment_plans (organization_id, id) on delete restrict,
  constraint quality_risk_treatment_plans_org_id_uniq unique (organization_id, id),
  constraint quality_risk_treatment_plans_rationale_not_blank
    check (length(btrim(rationale)) > 0),
  constraint quality_risk_treatment_plans_approved_consistent
    check ((approved_at is null) = (approved_by is null)),
  constraint quality_risk_treatment_plans_pending_consistent
    check (status <> 'pending_approval' or approved_at is null)
);
comment on table public.quality_risk_treatment_plans is
  'QUALITY-05 · §33 · La ESTRATEGIA frente al riesgo, no la tarea. Aceptar por encima del apetito exige aprobacion formal (RO-08) y no exime de revisar (§32).';


-- ============================================================================
-- §6 · MATERIALIZACION (RO-27, RO-28, §41-43)
-- ============================================================================
--
-- RO-27: el incidente y el riesgo son cosas relacionadas pero distintas. Que
-- el riesgo ocurra es un HECHO con fecha; que eso sea una no conformidad es un
-- JUICIO que le corresponde a una persona (AC-01). Por eso registrar una
-- materializacion no crea ningun caso: deja el hecho, avisa, y ofrece la ruta.
--
-- No se usa work_events como unico registro: ese es el canal de senales, con
-- claves de deduplicacion y vocacion de caducar. Esto es la historia del
-- negocio (§63).
-- ----------------------------------------------------------------------------
create table public.quality_risk_materializations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  risk_id          uuid not null,

  occurred_on      date not null,
  detected_on      date not null default current_date,

  description      text not null,
  observed_consequence text,

  severity         text not null default 'moderate'
                   check (severity in ('minor','moderate','major','severe')),

  reported_by      uuid references public.profiles(id) on delete set null,

  -- RO-28: ocurrir puede obligar a reevaluar. Se registra si esa reevaluación
  -- ya se hizo, sin forzarla en el mismo acto.
  triggered_reassessment boolean not null default false,

  -- §42: si alguien decide abrir un caso, queda enlazado AQUI, en un sentido:
  -- el caso referencia al riesgo por work_references y la materializacion sabe
  -- que caso nacio de ella. No se duplica ni un dato del riesgo.
  case_id          uuid,

  created_at       timestamptz not null default now(),

  constraint quality_risk_materializations_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete restrict,
  constraint quality_risk_materializations_case_fk
    foreign key (organization_id, case_id)
    references public.work_cases (organization_id, id) on delete set null,
  constraint quality_risk_materializations_org_id_uniq unique (organization_id, id),
  constraint quality_risk_materializations_description_not_blank
    check (length(btrim(description)) > 0),
  constraint quality_risk_materializations_dates_ordered
    check (detected_on >= occurred_on)
);
comment on table public.quality_risk_materializations is
  'QUALITY-05 · RO-27 · El riesgo ocurrio. Es un hecho historico, no una no conformidad: calificarlo es una decision humana posterior (AC-01).';


-- ============================================================================
-- §7 · SENALES (RO-11, RO-12, RO-13, RO-21)
-- ============================================================================
--
-- RO-13: una SENAL no es un riesgo. Un indicador fuera de meta sugiere mirar;
-- no crea una ficha ni cambia una evaluación (RO-12). RO-21 exige que sea
-- explicable: por eso guarda de donde salio y por que se emitio.
-- ----------------------------------------------------------------------------
create table public.quality_risk_signals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,

  -- Puede no apuntar a ninguna ficha todavia: eso es exactamente una senal sin
  -- riesgo formal detras, que es lo que RO-13 quiere poder representar.
  risk_id          uuid,

  signal_source    text not null default 'manual'
                   check (signal_source in ('manual','indicator','case','control',
                                            'process','document','audit','supplier',
                                            'customer','event')),

  summary          text not null,
  -- RO-21: la explicacion, no un veredicto opaco.
  explanation      text,
  detected_on      date not null default current_date,

  status           text not null default 'new'
                   check (status in ('new','reviewed','linked','dismissed')),
  review_note      text,
  reviewed_by      uuid references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,

  -- Idempotencia: la misma senal no se emite dos veces.
  dedupe_key       text,

  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint quality_risk_signals_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete set null,
  constraint quality_risk_signals_org_id_uniq unique (organization_id, id),
  constraint quality_risk_signals_summary_not_blank check (length(btrim(summary)) > 0),
  constraint quality_risk_signals_dedupe_uniq unique (organization_id, dedupe_key)
);
comment on table public.quality_risk_signals is
  'QUALITY-05 · RO-13 · Una senal sugiere mirar. No crea riesgos ni mueve evaluaciones (RO-11, RO-12): alguien la revisa y decide.';


-- ============================================================================
-- §8 · OPORTUNIDADES (RO-01, RO-15, RO-16, RO-31, MDR-22)
-- ============================================================================
--
-- RO-01 las separa del riesgo; MDR-22 dice que la oportunidad es UNA identidad
-- transversal con tipos semanticos. Las dos cosas a la vez: tabla propia, y
-- dentro un `opportunity_kind` que distingue de donde viene sin partirla en
-- una tabla por origen.
--
-- RO-15: su priorizacion usa metodologia PROPIA. Por eso apunta a una version
-- de metodologia con `applies_to = 'opportunity'`, con sus dimensiones —
-- beneficio, viabilidad, esfuerzo— y no a la matriz de riesgos con las
-- etiquetas cambiadas.
--
-- §45: una oportunidad NO se convierte en accion. Primero existe, luego puede
-- originar acciones, y sigue existiendo despues.
-- ----------------------------------------------------------------------------
create table public.quality_opportunities (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete restrict,

  code                 text not null,
  title                text not null,

  -- La situacion observada. Es lo que hace que una oportunidad sea concreta y
  -- no un deseo.
  situation            text not null,
  expected_benefit     text,
  context_note         text,

  -- MDR-22: tipos semanticos sobre una identidad unica.
  opportunity_kind     text not null default 'improvement'
                       check (opportunity_kind in ('improvement','innovation','efficiency',
                                                   'risk_derived','customer','audit',
                                                   'supplier','other')),

  identified_on        date not null default current_date,
  origin_kind          text not null default 'manual'
                       check (origin_kind in ('manual','indicator','process','document',
                                              'case','audit','supplier','customer',
                                              'risk','management_review','other')),
  origin_note          text,

  owner_position_id    uuid,
  owner_profile_id     uuid references public.profiles(id) on delete set null,

  -- RO-18 tambien aqui: el estado administrativo no es la prioridad.
  status               text not null default 'draft'
                       check (status in ('draft','active','in_progress','implemented',
                                         'closed','discarded')),

  -- §34 · RO-31: el catalogo de tratamiento de una oportunidad NO es el de
  -- riesgos. Aplazar o convertir en objetivo no tienen equivalente en
  -- «evitar/reducir/transferir/aceptar».
  treatment_decision   text
                       check (treatment_decision in ('pursue','defer','decline','to_objective')),
  treatment_rationale  text,
  decided_on           date,
  decided_by           uuid references public.profiles(id) on delete set null,

  closure_reason       text,
  closed_at            timestamptz,
  closed_by            uuid references public.profiles(id) on delete set null,

  created_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint quality_opportunities_code_uniq unique (organization_id, code),
  constraint quality_opportunities_org_id_uniq unique (organization_id, id),
  constraint quality_opportunities_title_not_blank check (length(btrim(title)) > 0),
  constraint quality_opportunities_situation_not_blank check (length(btrim(situation)) > 0),
  constraint quality_opportunities_owner_position_fk
    foreign key (organization_id, owner_position_id)
    references public.quality_positions (organization_id, id) on delete restrict,
  constraint quality_opportunities_closed_consistent
    check ((status in ('closed','discarded')) = (closed_at is not null)),
  constraint quality_opportunities_decision_consistent
    check ((treatment_decision is null) = (decided_on is null))
);
comment on table public.quality_opportunities is
  'QUALITY-05 · RO-01/MDR-22 · Oportunidad como objeto de negocio propio. Puede originar acciones de mejora y sigue existiendo despues: no se transforma en una work_action.';


create table public.quality_opportunity_codes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  opportunity_id  uuid,
  released_at     timestamptz,
  created_at      timestamptz not null default now(),
  primary key (organization_id, code),
  constraint quality_opportunity_codes_released_consistent
    check ((opportunity_id is null) = (released_at is not null))
);
comment on table public.quality_opportunity_codes is
  'QUALITY-05 · D-04 · Reserva de numeros de oportunidad.';


-- N:M con procesos y objetivos. §12: se REFERENCIA el objetivo, no se copia;
-- si el objetivo cambia despues, la evaluación historica no se rompe porque
-- nunca dependio de una copia.
create table public.quality_opportunity_processes (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  opportunity_id  uuid not null,
  process_id      uuid not null,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (opportunity_id, process_id),
  constraint quality_opportunity_processes_opportunity_fk
    foreign key (organization_id, opportunity_id)
    references public.quality_opportunities (organization_id, id) on delete cascade,
  constraint quality_opportunity_processes_process_fk
    foreign key (organization_id, process_id)
    references public.quality_processes (organization_id, id) on delete restrict
);
comment on table public.quality_opportunity_processes is
  'QUALITY-05 · Relacion N:M oportunidad-proceso, con FK compuesta por empresa.';


create table public.quality_risk_objectives (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  risk_id         uuid not null,
  objective_id    uuid not null,
  note            text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (risk_id, objective_id),
  constraint quality_risk_objectives_risk_fk
    foreign key (organization_id, risk_id)
    references public.quality_risks (organization_id, id) on delete cascade,
  constraint quality_risk_objectives_objective_fk
    foreign key (organization_id, objective_id)
    references public.quality_objectives (organization_id, id) on delete restrict
);
comment on table public.quality_risk_objectives is
  'QUALITY-05 · §12 · Que objetivo pone en peligro este riesgo. Referencia viva: el objetivo puede cambiar sin destruir el contexto de una evaluación ya hecha.';


create table public.quality_opportunity_objectives (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  opportunity_id  uuid not null,
  objective_id    uuid not null,
  note            text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (opportunity_id, objective_id),
  constraint quality_opportunity_objectives_opportunity_fk
    foreign key (organization_id, opportunity_id)
    references public.quality_opportunities (organization_id, id) on delete cascade,
  constraint quality_opportunity_objectives_objective_fk
    foreign key (organization_id, objective_id)
    references public.quality_objectives (organization_id, id) on delete restrict
);
comment on table public.quality_opportunity_objectives is
  'QUALITY-05 · RO-31 · A que objetivo contribuiria esta oportunidad.';


create table public.quality_opportunity_assessments (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete restrict,
  opportunity_id        uuid not null,

  -- RO-16: priorizar antes y comprobar el beneficio real despues son dos
  -- evaluaciones distintas de la misma oportunidad.
  assessment_kind       text not null default 'prioritization'
                        check (assessment_kind in ('prioritization','realized_benefit')),

  methodology_version_id uuid not null,

  assessed_on           date not null default current_date,
  assessed_by           uuid references public.profiles(id) on delete set null,

  score                 numeric(12,4) not null,
  result_level_id       uuid not null,
  derivation            jsonb not null default '{}'::jsonb,
  rationale             text,

  created_at            timestamptz not null default now(),

  constraint quality_opportunity_assessments_opportunity_fk
    foreign key (organization_id, opportunity_id)
    references public.quality_opportunities (organization_id, id) on delete restrict,
  constraint quality_opportunity_assessments_version_fk
    foreign key (organization_id, methodology_version_id)
    references public.quality_risk_methodology_versions (organization_id, id) on delete restrict,
  constraint quality_opportunity_assessments_level_fk
    foreign key (organization_id, result_level_id)
    references public.quality_risk_scale_levels (organization_id, id) on delete restrict,
  constraint quality_opportunity_assessments_org_id_uniq unique (organization_id, id)
);
comment on table public.quality_opportunity_assessments is
  'QUALITY-05 · RO-15/RO-16 · Priorizacion de una oportunidad con su propia metodologia, y revision posterior del beneficio realmente obtenido.';


create table public.quality_opportunity_assessment_factors (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete restrict,
  assessment_id    uuid not null,
  scale_id         uuid not null,
  level_id         uuid not null,
  created_at       timestamptz not null default now(),

  constraint quality_opportunity_assessment_factors_assessment_fk
    foreign key (organization_id, assessment_id)
    references public.quality_opportunity_assessments (organization_id, id) on delete cascade,
  constraint quality_opportunity_assessment_factors_scale_fk
    foreign key (organization_id, scale_id)
    references public.quality_risk_scales (organization_id, id) on delete restrict,
  constraint quality_opportunity_assessment_factors_level_fk
    foreign key (organization_id, level_id)
    references public.quality_risk_scale_levels (organization_id, id) on delete restrict,
  constraint quality_opportunity_assessment_factors_one_per_scale unique (assessment_id, scale_id)
);
comment on table public.quality_opportunity_assessment_factors is
  'QUALITY-05 · Factores de una priorizacion. Tabla propia y no compartida con riesgos: la FK a su evaluación es real, sin columnas polimorficas que nadie pueda validar (§52).';


-- ============================================================================
-- §9 · ENSANCHE DE LOS MOTORES TRANSVERSALES (MDR-46, §35-§38, §52)
-- ============================================================================
--
-- Aqui NO se crean risk_tasks, risk_alerts, risk_actions ni risk_files. Lo que
-- se hace es admitir los nuevos sujetos en los catalogos cerrados que ya
-- existen. Es ensanche aditivo: ningun valor anterior desaparece, asi que
-- nada de QUALITY-04 deja de validar.
-- ----------------------------------------------------------------------------

alter table public.work_tasks  drop constraint work_tasks_source_domain_check;
alter table public.work_tasks  add constraint work_tasks_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control'));
alter table public.work_tasks  drop constraint work_tasks_subject_type_check;
alter table public.work_tasks  add constraint work_tasks_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control'));
alter table public.work_tasks  drop constraint work_tasks_type_check;
alter table public.work_tasks  add constraint work_tasks_type_check
  check (task_type in ('document_review','document_approval','document_changes_requested',
                       'indicator_measurement_due','indicator_off_target',
                       'case_evaluation','case_closure','action_execution','action_effectiveness',
                       'risk_review_due','risk_assessment_due','risk_treatment_approval',
                       'control_verification','opportunity_review'));

alter table public.work_alerts drop constraint work_alerts_source_domain_check;
alter table public.work_alerts add constraint work_alerts_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control'));
alter table public.work_alerts drop constraint work_alerts_subject_type_check;
alter table public.work_alerts add constraint work_alerts_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control'));
alter table public.work_alerts drop constraint work_alerts_type_check;
alter table public.work_alerts add constraint work_alerts_type_check
  check (alert_type in ('document_review_requested','document_approval_requested',
                        'document_changes_requested','document_approved','document_retired',
                        'indicator_measurement_due','indicator_target_missed','objective_at_risk',
                        'case_assigned','action_assigned','action_overdue','effectiveness_due',
                        'risk_review_overdue','risk_above_appetite','risk_materialized',
                        'control_ineffective','opportunity_assigned'));

alter table public.work_events drop constraint work_events_source_domain_check;
alter table public.work_events add constraint work_events_source_domain_check
  check (source_domain in ('document','indicator','objective','case','action',
                           'risk','opportunity','control'));
alter table public.work_events drop constraint work_events_subject_type_check;
alter table public.work_events add constraint work_events_subject_type_check
  check (subject_type in ('trazadoc_document','quality_indicator','quality_objective',
                          'work_case','work_action',
                          'quality_risk','quality_opportunity','quality_control'));
alter table public.work_events drop constraint work_events_type_check;
alter table public.work_events add constraint work_events_type_check
  check (event_type in ('indicator.target_missed','indicator.attention','indicator.recovered',
                        'indicator.measurement_due','indicator.source_failed','objective.at_risk',
                        'case.opened','case.classified','case.closed','case.reopened',
                        'action.planned','action.completed','action.verified','action.overdue',
                        'risk.identified','risk.assessed','risk.treated','risk.accepted',
                        'risk.materialized','risk.reviewed','risk.closed','risk.reopened',
                        'control.linked','control.reviewed',
                        'opportunity.identified','opportunity.assessed','opportunity.treated',
                        'opportunity.closed'));

-- Las decisiones formales de riesgo y oportunidad viven en el MISMO libro que
-- las de los casos (MDR-49). Es lo que permite que la ficha muestre una sola
-- historia y no tres cuadernos paralelos.
alter table public.work_decisions drop constraint work_decisions_subject_kind_check;
alter table public.work_decisions add constraint work_decisions_subject_kind_check
  check (subject_kind in ('case','action','risk','opportunity','control'));
alter table public.work_decisions drop constraint work_decisions_decision_kind_check;
alter table public.work_decisions add constraint work_decisions_decision_kind_check
  check (decision_kind in ('case_opened','classification','correction_needed','cause_approved',
                           'action_planned','action_completed','effectiveness','closure','reopen',
                           'concession',
                           'risk_identified','risk_assessed','risk_treatment','risk_acceptance',
                           'risk_review','risk_materialized','control_effectiveness',
                           'opportunity_assessed','opportunity_treatment'));

-- §52 · work_references gana los nuevos propietarios y las nuevas cosas
-- referenciables. Sigue siendo un catalogo CERRADO con validacion de
-- existencia y empresa: no se abre un `entity_type text` sin comprobar.
alter table public.work_references drop constraint work_references_owner_kind_check;
alter table public.work_references add constraint work_references_owner_kind_check
  check (owner_kind in ('case','action','risk','opportunity','control','risk_assessment'));
alter table public.work_references drop constraint work_references_ref_kind_check;
alter table public.work_references add constraint work_references_ref_kind_check
  check (ref_kind in ('quality_indicator','quality_measurement','quality_process',
                      'quality_process_revision','quality_process_io','trazadoc_document',
                      'trazadoc_document_revision','work_case','work_action',
                      'quality_objective','quality_risk','quality_opportunity',
                      'quality_control','quality_risk_assessment','quality_risk_materialization'));


-- La validacion se reescribe entera. El original resolvia el propietario con
-- un `if case ... else action`: al admitir cinco tipos, ese `else` habria
-- validado un riesgo contra la tabla de acciones y lo habria rechazado
-- siempre. Ahora cada tipo se resuelve por su nombre.
create or replace function public.work_reference_must_be_valid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org       uuid;
  v_owner_org uuid;
begin
  v_org := case new.ref_kind
    when 'quality_indicator'          then (select organization_id from quality_indicators where id = new.ref_id)
    when 'quality_measurement'        then (select organization_id from quality_measurements where id = new.ref_id)
    when 'quality_process'            then (select organization_id from quality_processes where id = new.ref_id)
    when 'quality_process_revision'   then (select organization_id from quality_process_revisions where id = new.ref_id)
    when 'quality_process_io'         then (select organization_id from quality_process_io where id = new.ref_id)
    when 'trazadoc_document'          then (select organization_id from trazadoc_documents where id = new.ref_id)
    when 'trazadoc_document_revision' then (select organization_id from trazadoc_document_revisions where id = new.ref_id)
    when 'work_case'                  then (select organization_id from work_cases where id = new.ref_id)
    when 'work_action'                then (select organization_id from work_actions where id = new.ref_id)
    when 'quality_objective'          then (select organization_id from quality_objectives where id = new.ref_id)
    when 'quality_risk'               then (select organization_id from quality_risks where id = new.ref_id)
    when 'quality_opportunity'        then (select organization_id from quality_opportunities where id = new.ref_id)
    when 'quality_control'            then (select organization_id from quality_controls where id = new.ref_id)
    when 'quality_risk_assessment'    then (select organization_id from quality_risk_assessments where id = new.ref_id)
    when 'quality_risk_materialization' then (select organization_id from quality_risk_materializations where id = new.ref_id)
  end;

  if v_org is null then
    raise exception 'La referencia apunta a algo que no existe.';
  end if;
  if v_org <> new.organization_id then
    raise exception 'La referencia apunta a algo que no es de esta empresa.';
  end if;

  v_owner_org := case new.owner_kind
    when 'case'            then (select organization_id from work_cases where id = new.owner_id)
    when 'action'          then (select organization_id from work_actions where id = new.owner_id)
    when 'risk'            then (select organization_id from quality_risks where id = new.owner_id)
    when 'opportunity'     then (select organization_id from quality_opportunities where id = new.owner_id)
    when 'control'         then (select organization_id from quality_controls where id = new.owner_id)
    when 'risk_assessment' then (select organization_id from quality_risk_assessments where id = new.owner_id)
  end;

  if v_owner_org is null then
    raise exception 'El propietario de la referencia no existe.';
  end if;
  if v_owner_org <> new.organization_id then
    raise exception 'El propietario de la referencia no es de esta empresa.';
  end if;

  return new;
end;
$$;
revoke all on function public.work_reference_must_be_valid() from public, anon, authenticated;


-- ============================================================================
-- §10 · DERIVACION DETERMINISTICA DEL NIVEL (RO-05, §19, §62)
-- ============================================================================
--
-- Una sola funcion, usada por la base Y por la interfaz. Es lo que impide que
-- lo que la pantalla explica y lo que la base guarda se separen: si hubiera
-- dos formulas, tarde o temprano dirian cosas distintas.
--
-- Nadie escribe «Alto». Se eligen niveles que pertenecen a la version, se
-- combinan con la regla declarada en la version, y la banda resultante dice el
-- nivel. La explicacion sale del mismo calculo, no de un texto aparte.
-- ----------------------------------------------------------------------------
create or replace function public.quality_derive_level(
  p_version_id uuid,
  p_level_ids  uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_version     record;
  v_dimensions  integer;
  v_matched     integer;
  v_score       numeric;
  v_result      record;
  v_factors     jsonb;
  v_scale_ids   uuid[];
begin
  select * into v_version from quality_risk_methodology_versions where id = p_version_id;
  if v_version.id is null then
    raise exception 'La metodología indicada no existe.';
  end if;

  -- Los niveles tienen que pertenecer a dimensiones DE ESTA version. Es la
  -- comprobacion del §18: no se admite un valor de otra metodologia, ni de
  -- otra version de la misma.
  select count(*), array_agg(distinct s.id)
    into v_matched, v_scale_ids
    from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where l.id = any(p_level_ids)
     and s.version_id = p_version_id
     and s.scale_kind = 'dimension';

  if v_matched <> coalesce(array_length(p_level_ids, 1), 0) then
    raise exception 'Alguno de los valores elegidos no pertenece a esta versión de la metodología.';
  end if;

  select count(*) into v_dimensions
    from quality_risk_scales
   where version_id = p_version_id and scale_kind = 'dimension';

  if v_dimensions = 0 then
    raise exception 'Esta versión de la metodología no tiene dimensiones definidas.';
  end if;
  if coalesce(array_length(v_scale_ids, 1), 0) <> v_dimensions then
    raise exception 'Faltan dimensiones por valorar: la metodología pide %.', v_dimensions;
  end if;

  -- La regla declarada en la version. Deterministica y auditable.
  select case v_version.aggregation
           when 'product'       then exp(sum(ln(nullif(l.value, 0))))
           when 'sum'           then sum(l.value)
           when 'weighted_sum'  then sum(l.value * s.weight)
           when 'max'           then max(l.value)
           when 'min'           then min(l.value)
         end
    into v_score
    from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where l.id = any(p_level_ids);

  if v_score is null then
    raise exception 'No se pudo calcular el resultado con los valores elegidos.';
  end if;
  v_score := round(v_score, 4);

  -- La banda que contiene el puntaje, dentro de la escala de resultado de esta
  -- misma version.
  select l.* into v_result
    from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where s.version_id = p_version_id
     and s.scale_kind = 'result'
     and (l.min_score is null or v_score >= l.min_score)
     and (l.max_score is null or v_score <= l.max_score)
   order by l.position
   limit 1;

  if v_result.id is null then
    raise exception 'El resultado % no cae en ninguna banda de esta metodología.', v_score;
  end if;

  -- El rastro visible (§62): que se escogio en cada dimension y con que regla
  -- se combino. Sin esto el nivel seria una caja negra.
  select jsonb_agg(jsonb_build_object(
           'scale_code', s.code, 'scale_label', s.label,
           'level_label', l.label, 'value', l.value, 'weight', s.weight)
           order by s.position)
    into v_factors
    from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where l.id = any(p_level_ids);

  return jsonb_build_object(
    'score', v_score,
    'level_id', v_result.id,
    'level_label', v_result.label,
    'is_acceptable', v_result.is_acceptable,
    'review_months', v_result.review_months,
    'color_token', v_result.color_token,
    'aggregation', v_version.aggregation,
    'version_id', p_version_id,
    'factors', coalesce(v_factors, '[]'::jsonb)
  );
end;
$$;
comment on function public.quality_derive_level(uuid, uuid[]) is
  'QUALITY-05 · RO-05/§19 · Unica fuente del nivel. La base y la pantalla llaman a ESTA funcion: por eso lo que se explica y lo que se guarda no pueden divergir.';
revoke all on function public.quality_derive_level(uuid, uuid[]) from public, anon;
grant execute on function public.quality_derive_level(uuid, uuid[]) to authenticated;


-- ----------------------------------------------------------------------------
-- §10.1 · INMUTABILIDAD (RO-04, RO-09, MDR-49)
--
-- Lo que se uso para decidir no se edita. No es una convencion de la interfaz:
-- son disparadores, de modo que tampoco se puede por PostgREST.
-- ----------------------------------------------------------------------------
create or replace function public.quality_ro_record_is_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Este registro es histórico y no se modifica. Si algo cambió, se registra uno nuevo.';
end;
$$;
revoke all on function public.quality_ro_record_is_immutable() from public, anon, authenticated;

create trigger quality_risk_assessments_no_update before update on public.quality_risk_assessments
  for each row execute function public.quality_ro_record_is_immutable();
create trigger quality_risk_assessments_no_delete before delete on public.quality_risk_assessments
  for each row execute function public.quality_ro_record_is_immutable();

create trigger quality_risk_assessment_factors_no_update before update on public.quality_risk_assessment_factors
  for each row execute function public.quality_ro_record_is_immutable();

create trigger quality_opportunity_assessments_no_update before update on public.quality_opportunity_assessments
  for each row execute function public.quality_ro_record_is_immutable();
create trigger quality_opportunity_assessments_no_delete before delete on public.quality_opportunity_assessments
  for each row execute function public.quality_ro_record_is_immutable();

create trigger quality_opportunity_assessment_factors_no_update before update on public.quality_opportunity_assessment_factors
  for each row execute function public.quality_ro_record_is_immutable();

create trigger quality_control_effectiveness_reviews_no_update before update on public.quality_control_effectiveness_reviews
  for each row execute function public.quality_ro_record_is_immutable();
create trigger quality_control_effectiveness_reviews_no_delete before delete on public.quality_control_effectiveness_reviews
  for each row execute function public.quality_ro_record_is_immutable();

-- La materializacion admite EXACTAMENTE dos cambios posteriores: enlazar el
-- caso que alguien decidio abrir, y anotar que ya se reevaluo. Ninguno de los
-- dos reescribe el hecho —lo que ocurrio, cuando y con que gravedad sigue
-- intacto—; son cosas que pasaron DESPUES y que hay que poder registrar.
-- Bloquear tambien esto habria obligado a guardar el enlace en otro sitio, y
-- entonces el hecho y su caso podrian contradecirse.
create or replace function public.quality_materialization_is_fact()
returns trigger language plpgsql as $$
begin
  if new.risk_id is distinct from old.risk_id
     or new.occurred_on is distinct from old.occurred_on
     or new.detected_on is distinct from old.detected_on
     or new.description is distinct from old.description
     or new.observed_consequence is distinct from old.observed_consequence
     or new.severity is distinct from old.severity
     or new.reported_by is distinct from old.reported_by then
    raise exception 'Lo que ocurrió no se reescribe. Si el relato cambia, se registra un hecho nuevo.';
  end if;
  if old.case_id is not null and new.case_id is distinct from old.case_id then
    raise exception 'Esta materialización ya tiene un caso abierto.';
  end if;
  return new;
end;
$$;
revoke all on function public.quality_materialization_is_fact() from public, anon, authenticated;

create trigger quality_risk_materializations_protect before update on public.quality_risk_materializations
  for each row execute function public.quality_materialization_is_fact();
create trigger quality_risk_materializations_no_delete before delete on public.quality_risk_materializations
  for each row execute function public.quality_ro_record_is_immutable();


-- Los planes de tratamiento admiten exactamente dos cambios: aprobarlos y
-- marcarlos sucedidos o cancelados. Su contenido —la estrategia y su
-- fundamento— es historia (§17).
create or replace function public.quality_treatment_plan_is_append_only()
returns trigger language plpgsql as $$
begin
  if new.risk_id is distinct from old.risk_id
     or new.strategy is distinct from old.strategy
     or new.rationale is distinct from old.rationale
     or new.based_on_assessment_id is distinct from old.based_on_assessment_id
     or new.decided_on is distinct from old.decided_on
     or new.decided_by is distinct from old.decided_by
     or new.requires_approval is distinct from old.requires_approval then
    raise exception 'Una decisión de tratamiento no se reescribe. Para cambiar de estrategia se registra una nueva.';
  end if;
  return new;
end;
$$;
revoke all on function public.quality_treatment_plan_is_append_only() from public, anon, authenticated;
create trigger quality_risk_treatment_plans_append_only before update on public.quality_risk_treatment_plans
  for each row execute function public.quality_treatment_plan_is_append_only();
create trigger quality_risk_treatment_plans_no_delete before delete on public.quality_risk_treatment_plans
  for each row execute function public.quality_ro_record_is_immutable();


-- Una version PUBLICADA de metodologia deja de editarse (§17). Solo puede
-- cambiar de estado hacia sucedida o retirada, y cerrar su vigencia.
create or replace function public.quality_methodology_version_is_frozen()
returns trigger language plpgsql as $$
begin
  if old.status = 'draft' then
    return new;
  end if;
  if new.version_number is distinct from old.version_number
     or new.methodology_id is distinct from old.methodology_id
     or new.aggregation is distinct from old.aggregation
     or new.effective_from is distinct from old.effective_from
     or new.published_at is distinct from old.published_at then
    raise exception 'Esta versión ya se publicó y se usó para decidir: no se reescribe. Publica una versión nueva.';
  end if;
  if new.status not in ('published','superseded','retired') then
    raise exception 'Una versión publicada no puede volver a borrador.';
  end if;
  return new;
end;
$$;
revoke all on function public.quality_methodology_version_is_frozen() from public, anon, authenticated;
create trigger quality_risk_methodology_versions_freeze before update on public.quality_risk_methodology_versions
  for each row execute function public.quality_methodology_version_is_frozen();


-- Las escalas y sus niveles pertenecen a la version: si la version esta
-- publicada, tampoco se tocan. Sin esto, congelar la version seria decorativo.
create or replace function public.quality_scale_follows_version_state()
returns trigger language plpgsql as $$
declare v_status text; v_version uuid; v_scale uuid;
begin
  -- Dos ramas de plpgsql y no un CASE: el disparador sirve a dos tablas con
  -- columnas distintas, y una expresion unica intentaria resolver `scale_id`
  -- tambien sobre la tabla que no lo tiene.
  if tg_table_name = 'quality_risk_scales' then
    v_version := coalesce(new.version_id, old.version_id);
  else
    v_scale := coalesce(new.scale_id, old.scale_id);
    select version_id into v_version from quality_risk_scales where id = v_scale;
  end if;
  select status into v_status from quality_risk_methodology_versions where id = v_version;
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Esta versión de la metodología ya está publicada: sus escalas no se modifican.';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function public.quality_scale_follows_version_state() from public, anon, authenticated;
create trigger quality_risk_scales_frozen
  before insert or update or delete on public.quality_risk_scales
  for each row execute function public.quality_scale_follows_version_state();
create trigger quality_risk_scale_levels_frozen
  before insert or update or delete on public.quality_risk_scale_levels
  for each row execute function public.quality_scale_follows_version_state();


-- ----------------------------------------------------------------------------
-- §10.2 · RESERVA DE CODIGOS (D-04) Y MARCA DE TIEMPO
--
-- Mismo patron que QUALITY-04: un numero entregado queda ocupado para siempre
-- dentro de la empresa, aunque el borrador se elimine. Ya viajo en un correo.
-- ----------------------------------------------------------------------------
create or replace function public.quality_ro_reserve_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_taken uuid; v_released timestamptz; v_table text;
begin
  v_table := case tg_table_name
               when 'quality_risks'         then 'quality_risk_codes'
               when 'quality_controls'      then 'quality_control_codes'
               when 'quality_opportunities' then 'quality_opportunity_codes'
             end;
  if v_table = 'quality_risk_codes' then
    select risk_id, released_at into v_taken, v_released from quality_risk_codes
     where organization_id = new.organization_id and code = new.code;
  elsif v_table = 'quality_control_codes' then
    select control_id, released_at into v_taken, v_released from quality_control_codes
     where organization_id = new.organization_id and code = new.code;
  else
    select opportunity_id, released_at into v_taken, v_released from quality_opportunity_codes
     where organization_id = new.organization_id and code = new.code;
  end if;

  if v_taken is null and v_released is null then
    if v_table = 'quality_risk_codes' then
      insert into quality_risk_codes (organization_id, code, risk_id)
      values (new.organization_id, new.code, new.id);
    elsif v_table = 'quality_control_codes' then
      insert into quality_control_codes (organization_id, code, control_id)
      values (new.organization_id, new.code, new.id);
    else
      insert into quality_opportunity_codes (organization_id, code, opportunity_id)
      values (new.organization_id, new.code, new.id);
    end if;
    return new;
  end if;

  if v_taken is not null and v_taken <> new.id then
    raise exception 'El código % ya existe en esta empresa.', new.code;
  end if;
  if v_taken is null then
    raise exception 'El código % ya se usó antes y no puede reutilizarse.', new.code;
  end if;
  return new;
end;
$$;
revoke all on function public.quality_ro_reserve_code() from public, anon, authenticated;

create or replace function public.quality_ro_release_code()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'quality_risks' then
    update quality_risk_codes set risk_id = null, released_at = now()
     where organization_id = old.organization_id and code = old.code and risk_id = old.id;
  elsif tg_table_name = 'quality_controls' then
    update quality_control_codes set control_id = null, released_at = now()
     where organization_id = old.organization_id and code = old.code and control_id = old.id;
  else
    update quality_opportunity_codes set opportunity_id = null, released_at = now()
     where organization_id = old.organization_id and code = old.code and opportunity_id = old.id;
  end if;
  return old;
end;
$$;
revoke all on function public.quality_ro_release_code() from public, anon, authenticated;

create trigger quality_risks_reserve_code after insert on public.quality_risks
  for each row execute function public.quality_ro_reserve_code();
create trigger quality_risks_release_code after delete on public.quality_risks
  for each row execute function public.quality_ro_release_code();
create trigger quality_controls_reserve_code after insert on public.quality_controls
  for each row execute function public.quality_ro_reserve_code();
create trigger quality_controls_release_code after delete on public.quality_controls
  for each row execute function public.quality_ro_release_code();
create trigger quality_opportunities_reserve_code after insert on public.quality_opportunities
  for each row execute function public.quality_ro_reserve_code();
create trigger quality_opportunities_release_code after delete on public.quality_opportunities
  for each row execute function public.quality_ro_release_code();

create or replace function public.quality_ro_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger quality_risks_touch before update on public.quality_risks
  for each row execute function public.quality_ro_touch();
create trigger quality_controls_touch before update on public.quality_controls
  for each row execute function public.quality_ro_touch();
create trigger quality_opportunities_touch before update on public.quality_opportunities
  for each row execute function public.quality_ro_touch();
create trigger quality_risk_methodologies_touch before update on public.quality_risk_methodologies
  for each row execute function public.quality_ro_touch();
create trigger quality_risk_methodology_versions_touch before update on public.quality_risk_methodology_versions
  for each row execute function public.quality_ro_touch();


create or replace function public.quality_next_ro_code(
  p_organization_id uuid,
  p_kind            text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_prefix text; v_year text := to_char(current_date, 'YYYY'); v_n integer;
begin
  if not is_org_member(p_organization_id) then
    raise exception 'No perteneces a esta empresa.';
  end if;
  v_prefix := case p_kind when 'risk' then 'R' when 'control' then 'CTRL'
                          when 'opportunity' then 'OP' end;
  if v_prefix is null then
    raise exception 'Tipo de código desconocido.';
  end if;

  -- Se cuenta sobre la RESERVA, no sobre las fichas vivas: por eso tirar un
  -- borrador no devuelve su numero a la circulacion.
  if p_kind = 'risk' then
    select count(*) + 1 into v_n from quality_risk_codes
     where organization_id = p_organization_id and code like v_prefix || '-' || v_year || '-%';
  elsif p_kind = 'control' then
    select count(*) + 1 into v_n from quality_control_codes
     where organization_id = p_organization_id and code like v_prefix || '-' || v_year || '-%';
  else
    select count(*) + 1 into v_n from quality_opportunity_codes
     where organization_id = p_organization_id and code like v_prefix || '-' || v_year || '-%';
  end if;

  return v_prefix || '-' || v_year || '-' || lpad(v_n::text, 3, '0');
end;
$$;
revoke all on function public.quality_next_ro_code(uuid, text) from public, anon;
grant execute on function public.quality_next_ro_code(uuid, text) to authenticated;



-- ----------------------------------------------------------------------------
-- §11.0 · A QUIEN LE LLEGA
--
-- MDR-33 otra vez, pero al reves: la responsabilidad PERMANENTE apunta a un
-- cargo, y sin embargo una tarea o una alerta tienen que llegarle a una
-- PERSONA concreta —la que ocupa ese cargo hoy—, porque un cargo no abre el
-- correo. Esta funcion hace esa traduccion en un solo sitio.
--
-- Si el cargo no tiene titular, se devuelve el suplente que se indique. Sin
-- destinatario no se crea el aviso: una fila sin dueño no la ve nadie y solo
-- sirve para inflar contadores.
-- ----------------------------------------------------------------------------
create or replace function public.quality_position_holder(
  p_organization_id uuid,
  p_position_id     uuid,
  p_fallback        uuid default null
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select a.profile_id
       from quality_position_assignments a
      where a.organization_id = p_organization_id
        and a.position_id = p_position_id
        and a.assignment_type = 'holder'
      order by a.created_at desc
      limit 1),
    p_fallback);
$$;
revoke all on function public.quality_position_holder(uuid, uuid, uuid) from public, anon, authenticated;


-- ============================================================================
-- §11 · DECISIONES FORMALES (§55, §56)
-- ============================================================================
--
-- Todo acto formal pasa por una funcion que comprueba sesion, empresa,
-- membresia, rol, estado y pertenencia de cada referencia. No se confia en que
-- la interfaz esconda un boton: PostgREST esta ahi para cualquiera que sepa
-- escribir una URL.
--
-- Roles reales del proyecto: admin, quality, consultant. No se inventa un
-- «Risk Manager».
--   · identificar y evaluar        → admin, quality, consultant
--   · decidir tratamiento          → admin, quality
--   · aprobar aceptacion sobre el
--     apetito y cerrar             → admin, quality  (RO-08)
-- ----------------------------------------------------------------------------

create or replace function public.quality_publish_methodology_version(
  p_version_id uuid,
  p_effective_from date default null,
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_ver record; v_dims integer; v_result integer; v_bands integer;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_ver from quality_risk_methodology_versions where id = p_version_id;
  if v_ver.id is null then raise exception 'Esa versión no existe.'; end if;
  if not has_org_role(v_ver.organization_id, array['admin','quality']) then
    raise exception 'No tienes permiso para publicar una metodología.';
  end if;
  if v_ver.status <> 'draft' then
    raise exception 'Esta versión ya se publicó.';
  end if;

  -- Publicar es lo que la vuelve inmutable: mas vale que este completa.
  select count(*) into v_dims from quality_risk_scales
   where version_id = p_version_id and scale_kind = 'dimension';
  select count(*) into v_result from quality_risk_scales
   where version_id = p_version_id and scale_kind = 'result';
  if v_dims = 0 then raise exception 'Define al menos una dimensión antes de publicar.'; end if;
  if v_result <> 1 then raise exception 'La metodología necesita exactamente una escala de resultado.'; end if;

  select count(*) into v_bands from quality_risk_scale_levels l
    join quality_risk_scales s on s.id = l.scale_id
   where s.version_id = p_version_id and s.scale_kind = 'result'
     and l.min_score is not null and l.max_score is not null;
  if v_bands = 0 then
    raise exception 'La escala de resultado necesita bandas de puntaje: sin ellas no se puede derivar un nivel.';
  end if;
  if exists (select 1 from quality_risk_scales s
              where s.version_id = p_version_id and s.scale_kind = 'dimension'
                and not exists (select 1 from quality_risk_scale_levels l where l.scale_id = s.id)) then
    raise exception 'Hay dimensiones sin niveles definidos.';
  end if;

  -- La anterior publicada de esta misma metodologia queda sucedida, con su
  -- vigencia cerrada. No se borra: las evaluaciones que la usaron siguen
  -- apuntando a ella (RO-04).
  update quality_risk_methodology_versions
     set status = 'superseded',
         effective_to = coalesce(effective_to, coalesce(p_effective_from, current_date) - 1)
   where methodology_id = v_ver.methodology_id
     and status = 'published' and id <> p_version_id;

  update quality_risk_methodology_versions
     set status = 'published',
         effective_from = coalesce(p_effective_from, effective_from, current_date),
         change_note = coalesce(p_change_note, change_note),
         published_at = now(),
         published_by = auth.uid()
   where id = p_version_id;

  return p_version_id;
end;
$$;
revoke all on function public.quality_publish_methodology_version(uuid, date, text) from public, anon;
grant execute on function public.quality_publish_methodology_version(uuid, date, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Evaluar un riesgo. Una llamada = una fila nueva. Nunca un UPDATE (RO-09).
--
-- `p_control_ids` solo tiene sentido en la residual: es la lista de controles
-- que se consideraron, y queda guardada como referencia con una foto de su
-- estado de eficacia en ese momento (§27, §51).
-- ----------------------------------------------------------------------------
create or replace function public.quality_assess_risk(
  p_risk_id     uuid,
  p_kind        text,
  p_version_id  uuid,
  p_level_ids   uuid[],
  p_rationale   text default null,
  p_control_ids uuid[] default null,
  p_assessed_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_risk       record;
  v_ver        record;
  v_derived    jsonb;
  v_assessment uuid;
  v_control_id uuid;
  v_ctrl       record;
  v_review     record;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_risk from quality_risks where id = p_risk_id;
  if v_risk.id is null then raise exception 'Ese riesgo no existe.'; end if;
  if not has_org_role(v_risk.organization_id, array['admin','quality','consultant']) then
    raise exception 'No tienes permiso para evaluar riesgos.';
  end if;
  if v_risk.status in ('closed','retired','superseded') then
    raise exception 'Este riesgo ya no está activo: no admite evaluaciones nuevas.';
  end if;
  if p_kind not in ('inherent','residual') then
    raise exception 'Tipo de evaluación desconocido.';
  end if;

  select * into v_ver from quality_risk_methodology_versions where id = p_version_id;
  if v_ver.id is null or v_ver.organization_id <> v_risk.organization_id then
    raise exception 'Esa metodología no es de esta empresa.';
  end if;
  if (select applies_to from quality_risk_methodologies where id = v_ver.methodology_id) <> 'risk' then
    raise exception 'Esa metodología es de oportunidades, no de riesgos.';
  end if;
  if v_ver.status <> 'published' then
    raise exception 'Solo se puede evaluar con una versión publicada de la metodología.';
  end if;

  -- La residual sin controles considerados no es residual: es la inherente
  -- otra vez con otro nombre.
  if p_kind = 'residual' and coalesce(array_length(p_control_ids, 1), 0) = 0 then
    raise exception 'Una evaluación residual tiene que declarar qué controles se consideraron.';
  end if;

  v_derived := quality_derive_level(p_version_id, p_level_ids);

  insert into quality_risk_assessments (
    organization_id, risk_id, assessment_kind, methodology_version_id,
    assessed_on, assessed_by, score, result_level_id, derivation, rationale
  ) values (
    v_risk.organization_id, p_risk_id, p_kind, p_version_id,
    coalesce(p_assessed_on, current_date), auth.uid(),
    (v_derived->>'score')::numeric, (v_derived->>'level_id')::uuid, v_derived, p_rationale
  ) returning id into v_assessment;

  insert into quality_risk_assessment_factors (organization_id, assessment_id, scale_id, level_id)
  select v_risk.organization_id, v_assessment, l.scale_id, l.id
    from quality_risk_scale_levels l where l.id = any(p_level_ids);

  -- Los controles considerados, con la foto de su eficacia de ese dia. Si
  -- manana se revisan otra vez, esta evaluación sigue explicando que se sabia.
  if p_control_ids is not null then
    foreach v_control_id in array p_control_ids loop
      select * into v_ctrl from quality_controls
       where id = v_control_id and organization_id = v_risk.organization_id;
      if v_ctrl.id is null then
        raise exception 'Uno de los controles no es de esta empresa.';
      end if;
      select * into v_review from quality_control_effectiveness_reviews
       where control_id = v_ctrl.id order by reviewed_on desc, created_at desc limit 1;
      insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id,
                                   relation, note, snapshot, created_by)
      values (v_risk.organization_id, 'risk_assessment', v_assessment,
              'quality_control', v_ctrl.id, 'related', null,
              jsonb_build_object(
                'control_code', v_ctrl.code, 'control_title', v_ctrl.title,
                'control_nature', v_ctrl.control_nature, 'operation_mode', v_ctrl.operation_mode,
                'effectiveness_verdict', coalesce(v_review.effectiveness_verdict, 'not_assessed'),
                'reviewed_on', v_review.reviewed_on),
              auth.uid());
    end loop;
  end if;

  -- Un riesgo evaluado deja de ser borrador, y su proxima revision sale del
  -- nivel obtenido (RO-35): la criticidad manda, no el calendario.
  update quality_risks
     set status = case when status = 'draft' then 'active' else status end,
         review_interval_months = coalesce((v_derived->>'review_months')::integer, review_interval_months),
         next_review_on = case
           when (v_derived->>'review_months') is not null
             then coalesce(p_assessed_on, current_date) + ((v_derived->>'review_months')::integer || ' months')::interval
           else next_review_on end
   where id = p_risk_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_risk.organization_id, 'risk', p_risk_id, 'risk_assessed',
          p_kind || ':' || (v_derived->>'level_label'), p_rationale, auth.uid(), v_derived);

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, payload, dedupe_key, created_by)
  values (v_risk.organization_id, 'risk', 'risk.assessed', 'quality_risk', p_risk_id,
          case when (v_derived->>'is_acceptable')::boolean then 'info' else 'warning' end,
          'Riesgo ' || v_risk.code || ' evaluado: ' || (v_derived->>'level_label'),
          v_derived, 'risk.assessed:' || v_assessment::text, auth.uid());

  return v_assessment;
end;
$$;
revoke all on function public.quality_assess_risk(uuid, text, uuid, uuid[], text, uuid[], date) from public, anon;
grant execute on function public.quality_assess_risk(uuid, text, uuid, uuid[], text, uuid[], date) to authenticated;


-- ----------------------------------------------------------------------------
-- Evaluar un control (RO-26). Independiente de que el control exista.
-- ----------------------------------------------------------------------------
create or replace function public.quality_review_control(
  p_control_id uuid,
  p_design     text,
  p_implementation text,
  p_effectiveness  text,
  p_criterion  text default null,
  p_note       text default null,
  p_reviewed_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_ctrl record; v_id uuid; v_to uuid;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_ctrl from quality_controls where id = p_control_id;
  if v_ctrl.id is null then raise exception 'Ese control no existe.'; end if;
  if not has_org_role(v_ctrl.organization_id, array['admin','quality','consultant']) then
    raise exception 'No tienes permiso para evaluar controles.';
  end if;

  insert into quality_control_effectiveness_reviews (
    organization_id, control_id, reviewed_on, reviewed_by,
    design_verdict, implementation_verdict, effectiveness_verdict, criterion, note
  ) values (
    v_ctrl.organization_id, p_control_id, coalesce(p_reviewed_on, current_date), auth.uid(),
    p_design, p_implementation, p_effectiveness, p_criterion, p_note
  ) returning id into v_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_ctrl.organization_id, 'control', p_control_id, 'control_effectiveness',
          p_effectiveness, p_criterion, auth.uid(),
          jsonb_build_object('design', p_design, 'implementation', p_implementation));

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_ctrl.organization_id, 'control', 'control.reviewed', 'quality_control', p_control_id,
          case when p_effectiveness = 'ineffective' then 'warning' else 'info' end,
          'Control ' || v_ctrl.code || ' evaluado: ' || p_effectiveness,
          'control.reviewed:' || v_id::text, auth.uid());

  -- Un control ineficaz avisa a quien tiene que enterarse. RO-26: que exista
  -- no basta.
  if p_effectiveness = 'ineffective' then
    -- A quien: el titular del cargo dueño del control, y si no lo hay, quien
    -- acaba de evaluarlo. Un aviso sin destinatario no lo lee nadie.
    v_to := quality_position_holder(v_ctrl.organization_id, v_ctrl.owner_position_id, auth.uid());
    insert into work_alerts (organization_id, source_domain, alert_type, severity,
                             subject_type, subject_id, recipient_profile_id,
                             title, message, dedupe_key, created_by)
    values (v_ctrl.organization_id, 'control', 'control_ineffective', 'warning',
            'quality_control', p_control_id, v_to,
            'Control sin eficacia: ' || v_ctrl.title,
            'La última evaluación concluyó que no es eficaz. Los riesgos que se apoyan en él pueden estar peor de lo que dice su evaluación residual.',
            'control_ineffective:' || v_id::text, auth.uid())
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;
revoke all on function public.quality_review_control(uuid, text, text, text, text, text, date) from public, anon;
grant execute on function public.quality_review_control(uuid, text, text, text, text, text, date) to authenticated;


-- ----------------------------------------------------------------------------
-- Decidir el tratamiento (§33, RO-08). La estrategia, no la tarea.
--
-- La aceptacion por encima del apetito NO la decide quien escribe: la decide
-- la metodologia. Si el nivel vigente no es aceptable, el plan nace pendiente
-- de aprobacion y necesita a alguien con autoridad para quedar activo.
-- ----------------------------------------------------------------------------
create or replace function public.quality_decide_risk_treatment(
  p_risk_id   uuid,
  p_strategy  text,
  p_rationale text,
  p_review_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_risk       record;
  v_assessment record;
  v_acceptable boolean;
  v_needs      boolean := false;
  v_id         uuid;
  v_to         uuid;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_risk from quality_risks where id = p_risk_id;
  if v_risk.id is null then raise exception 'Ese riesgo no existe.'; end if;
  if not has_org_role(v_risk.organization_id, array['admin','quality']) then
    raise exception 'No tienes permiso para decidir el tratamiento de un riesgo.';
  end if;
  if v_risk.status in ('closed','retired','superseded') then
    raise exception 'Este riesgo ya no está activo.';
  end if;
  if p_strategy not in ('avoid','reduce','share','accept') then
    raise exception 'Estrategia desconocida.';
  end if;
  if length(btrim(coalesce(p_rationale, ''))) = 0 then
    raise exception 'Una decisión de tratamiento necesita su fundamento.';
  end if;

  -- Se decide sobre la evaluación vigente, y queda registrado cual era.
  select a.* into v_assessment from quality_risk_assessments a
   where a.risk_id = p_risk_id
   order by case a.assessment_kind when 'residual' then 0 else 1 end,
            a.assessed_on desc, a.created_at desc
   limit 1;
  if v_assessment.id is null then
    raise exception 'Antes de decidir hay que evaluar: no se trata lo que no se ha medido.';
  end if;

  select l.is_acceptable into v_acceptable from quality_risk_scale_levels l
   where l.id = v_assessment.result_level_id;

  -- RO-08. Aceptar algo que la propia metodologia declara inaceptable exige
  -- que alguien lo apruebe con nombre y fecha.
  if p_strategy = 'accept' and not coalesce(v_acceptable, true) then
    v_needs := true;
  end if;

  update quality_risk_treatment_plans
     set status = 'superseded'
   where risk_id = p_risk_id and status in ('active','pending_approval');

  insert into quality_risk_treatment_plans (
    organization_id, risk_id, strategy, rationale, based_on_assessment_id,
    decided_on, decided_by, requires_approval, status, review_on
  ) values (
    v_risk.organization_id, p_risk_id, p_strategy, p_rationale, v_assessment.id,
    current_date, auth.uid(), v_needs,
    case when v_needs then 'pending_approval' else 'active' end,
    -- §32: aceptar no es olvidarse. Si no se propone fecha, se hereda la del
    -- riesgo, y si tampoco la hay se pide a seis meses.
    coalesce(p_review_on, v_risk.next_review_on, current_date + interval '6 months')
  ) returning id into v_id;

  update quality_risk_treatment_plans set superseded_by_plan_id = v_id
   where risk_id = p_risk_id and status = 'superseded' and superseded_by_plan_id is null;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_risk.organization_id, 'risk', p_risk_id,
          case when p_strategy = 'accept' then 'risk_acceptance' else 'risk_treatment' end,
          p_strategy, p_rationale, auth.uid(),
          jsonb_build_object('requires_approval', v_needs,
                             'based_on_assessment', v_assessment.id,
                             'level_was_acceptable', v_acceptable));

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_risk.organization_id, 'risk',
          case when p_strategy = 'accept' then 'risk.accepted' else 'risk.treated' end,
          'quality_risk', p_risk_id, 'info',
          'Riesgo ' || v_risk.code || ': tratamiento ' || p_strategy,
          'risk.treated:' || v_id::text, auth.uid());

  -- Si hace falta aprobacion, alguien tiene que verlo en su lista.
  if v_needs then
    -- El cargo responde; la persona que lo ocupa hoy es quien recibe la tarea.
    v_to := quality_position_holder(v_risk.organization_id, v_risk.owner_position_id, null);
    if v_to is not null then
      insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                              title, description, assignee_profile_id, assignee_position_id,
                              status, due_at, dedupe_key, created_by)
      values (v_risk.organization_id, 'risk', 'risk_treatment_approval', 'quality_risk', p_risk_id,
              'Aprobar la aceptación del riesgo ' || v_risk.code,
              'El nivel vigente está por encima de lo que la metodología considera aceptable. Aceptarlo requiere aprobación formal.',
              v_to, v_risk.owner_position_id, 'open', now() + interval '15 days',
              'risk_treatment_approval:' || v_id::text, auth.uid())
      on conflict do nothing;
    end if;
  end if;

  return v_id;
end;
$$;
revoke all on function public.quality_decide_risk_treatment(uuid, text, text, date) from public, anon;
grant execute on function public.quality_decide_risk_treatment(uuid, text, text, date) to authenticated;


create or replace function public.quality_approve_risk_treatment(
  p_plan_id uuid,
  p_note    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_plan record;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_plan from quality_risk_treatment_plans where id = p_plan_id;
  if v_plan.id is null then raise exception 'Ese plan no existe.'; end if;
  if not has_org_role(v_plan.organization_id, array['admin','quality']) then
    raise exception 'No tienes permiso para aprobar la aceptación de un riesgo.';
  end if;
  if v_plan.status <> 'pending_approval' then
    raise exception 'Ese plan no está esperando aprobación.';
  end if;
  -- Quien decide y quien aprueba no deberian ser la misma persona cuando se
  -- trata de convivir con un riesgo por encima del apetito.
  if v_plan.decided_by = auth.uid() then
    raise exception 'La aceptación la tiene que aprobar alguien distinto de quien la propuso.';
  end if;

  update quality_risk_treatment_plans
     set status = 'active', approved_by = auth.uid(), approved_at = now(), approval_note = p_note
   where id = p_plan_id;

  update work_tasks set status = 'done', completed_at = now(), completed_by = auth.uid(),
         resolution = 'Aceptación aprobada.'
   where dedupe_key = 'risk_treatment_approval:' || p_plan_id::text and status in ('open','in_progress');

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_plan.organization_id, 'risk', v_plan.risk_id, 'risk_acceptance',
          'approved', p_note, auth.uid(), jsonb_build_object('plan_id', p_plan_id));

  return p_plan_id;
end;
$$;
revoke all on function public.quality_approve_risk_treatment(uuid, text) from public, anon;
grant execute on function public.quality_approve_risk_treatment(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Materializar un riesgo (RO-27, RO-28, §41, §43).
--
-- Esta funcion NO crea ninguna no conformidad, y esa ausencia es la decision
-- de diseno, no un olvido: calificar corresponde a una persona (AC-01). Deja
-- el hecho, avisa, y abre la ruta explicita hacia un caso.
-- ----------------------------------------------------------------------------
create or replace function public.quality_materialize_risk(
  p_risk_id     uuid,
  p_occurred_on date,
  p_description text,
  p_severity    text default 'moderate',
  p_consequence text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_risk record; v_id uuid; v_to uuid;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_risk from quality_risks where id = p_risk_id;
  if v_risk.id is null then raise exception 'Ese riesgo no existe.'; end if;
  if not has_org_role(v_risk.organization_id, array['admin','quality','consultant']) then
    raise exception 'No tienes permiso para registrar la materialización de un riesgo.';
  end if;
  if v_risk.status = 'draft' then
    raise exception 'Un riesgo en borrador todavía no está identificado formalmente.';
  end if;
  if p_occurred_on > current_date then
    raise exception 'No se puede registrar algo que todavía no ha pasado.';
  end if;

  insert into quality_risk_materializations (
    organization_id, risk_id, occurred_on, detected_on, description,
    observed_consequence, severity, reported_by
  ) values (
    v_risk.organization_id, p_risk_id, p_occurred_on, current_date, p_description,
    p_consequence, p_severity, auth.uid()
  ) returning id into v_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_risk.organization_id, 'risk', p_risk_id, 'risk_materialized',
          p_severity, p_description, auth.uid(),
          jsonb_build_object('materialization_id', v_id, 'occurred_on', p_occurred_on));

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, payload, dedupe_key, created_by)
  values (v_risk.organization_id, 'risk', 'risk.materialized', 'quality_risk', p_risk_id,
          case p_severity when 'severe' then 'critical' when 'major' then 'critical' else 'warning' end,
          'El riesgo ' || v_risk.code || ' se materializó el ' || to_char(p_occurred_on, 'DD/MM/YYYY'),
          jsonb_build_object('materialization_id', v_id), 'risk.materialized:' || v_id::text, auth.uid());

  v_to := quality_position_holder(v_risk.organization_id, v_risk.owner_position_id, auth.uid());
  insert into work_alerts (organization_id, source_domain, alert_type, severity,
                           subject_type, subject_id, recipient_profile_id,
                           title, message, dedupe_key, created_by)
  values (v_risk.organization_id, 'risk', 'risk_materialized',
          case p_severity when 'severe' then 'critical' when 'major' then 'critical' else 'warning' end,
          'quality_risk', p_risk_id, v_to,
          'Se materializó el riesgo ' || v_risk.code,
          'Queda registrado como hecho. No se ha abierto ninguna no conformidad: eso lo decide una persona después de evaluarlo.',
          'risk_materialized:' || v_id::text, auth.uid())
  on conflict do nothing;

  -- RO-28: ocurrir es motivo para volver a mirar. Se pide la revision; no se
  -- cambia ninguna evaluación por cuenta propia (RO-12, RO-20).
  if v_to is not null then
    insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                            title, description, assignee_profile_id, assignee_position_id,
                            status, due_at, dedupe_key, created_by)
    values (v_risk.organization_id, 'risk', 'risk_assessment_due', 'quality_risk', p_risk_id,
            'Reevaluar el riesgo ' || v_risk.code || ' tras materializarse',
            'Ocurrió de verdad. Conviene revisar si la evaluación vigente sigue describiendo la exposición real.',
            v_to, v_risk.owner_position_id, 'open', now() + interval '30 days',
            'risk_reassess_after:' || v_id::text, auth.uid())
    on conflict do nothing;
  end if;

  return v_id;
end;
$$;
revoke all on function public.quality_materialize_risk(uuid, date, text, text, text) from public, anon;
grant execute on function public.quality_materialize_risk(uuid, date, text, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- §42 · La ruta explicita: materializacion -> caso.
--
-- El caso REFERENCIA al riesgo y al hecho; no copia ni el titulo ni el nivel.
-- Nace sin clasificar, como manda AC-04: que venga de un riesgo no adelanta
-- si es o no una no conformidad.
-- ----------------------------------------------------------------------------
create or replace function public.quality_open_case_from_materialization(
  p_materialization_id uuid,
  p_title  text default null,
  p_priority text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mat  record;
  v_risk record;
  v_case uuid;
  v_code text;
  v_assessment record;
  v_after boolean := false;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_mat from quality_risk_materializations where id = p_materialization_id;
  if v_mat.id is null then raise exception 'Ese registro no existe.'; end if;
  if not has_org_role(v_mat.organization_id, array['admin','quality','consultant']) then
    raise exception 'No tienes permiso para abrir casos.';
  end if;
  if v_mat.case_id is not null then
    raise exception 'Esta materialización ya tiene un caso abierto.';
  end if;
  select * into v_risk from quality_risks where id = v_mat.risk_id;

  v_code := work_next_case_code(v_mat.organization_id);

  insert into work_cases (
    organization_id, code, title, description, case_type, detected_on,
    origin_kind, origin_note, reported_by, owner_position_id, priority
  ) values (
    v_mat.organization_id, v_code,
    coalesce(p_title, 'Materialización del riesgo ' || v_risk.code || ': ' || v_risk.title),
    v_mat.description, 'issue', v_mat.occurred_on,
    'risk', 'Abierto desde la materialización del riesgo ' || v_risk.code,
    auth.uid(), v_risk.owner_position_id, coalesce(p_priority, 'normal')
  ) returning id into v_case;

  -- Referencias tipadas y validadas: al riesgo, al hecho, y a la evaluación
  -- que regia entonces. Con eso el caso puede explicar su contexto sin
  -- duplicar una sola columna del riesgo.
  -- El `snapshot.label` no es decoración: es el contrato que ya usa la ficha
  -- del caso para mostrar una referencia. Sin él la pantalla escribe «ver» y
  -- «—», que fue exactamente lo que se vio al revisarla.
  insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id,
                               relation, note, snapshot, created_by)
  values (v_mat.organization_id, 'case', v_case, 'quality_risk', v_risk.id, 'origin',
          'El caso nace de este riesgo.',
          jsonb_build_object('label', v_risk.code || ' · ' || v_risk.title),
          auth.uid()),
         (v_mat.organization_id, 'case', v_case, 'quality_risk_materialization',
          p_materialization_id, 'origin', 'El hecho que lo motivó.',
          jsonb_build_object(
            'label', 'Ocurrió el ' || to_char(v_mat.occurred_on, 'DD/MM/YYYY'),
            'context', v_mat.description),
          auth.uid());

  -- Se busca la evaluación que REGÍA cuando ocurrió. Si el riesgo se evaluó
  -- después del suceso no hay ninguna, y entonces se enlaza la vigente
  -- DICIÉNDOLO: atarle en silencio una evaluación posterior daría a entender
  -- que se sabía algo que nadie sabía todavía.
  select a.* into v_assessment from quality_risk_assessments a
   where a.risk_id = v_risk.id and a.assessed_on <= v_mat.occurred_on
   order by a.assessed_on desc, a.created_at desc limit 1;

  if v_assessment.id is null then
    select a.* into v_assessment from quality_risk_assessments a
     where a.risk_id = v_risk.id
     order by a.assessed_on desc, a.created_at desc limit 1;
    v_after := true;
  end if;

  if v_assessment.id is not null then
    insert into work_references (organization_id, owner_kind, owner_id, ref_kind, ref_id,
                                 relation, note, snapshot, created_by)
    values (v_mat.organization_id, 'case', v_case, 'quality_risk_assessment', v_assessment.id,
            'related',
            case when v_after then 'La evaluación más reciente; es POSTERIOR al suceso.'
                 else 'La evaluación que regía cuando ocurrió.' end,
            jsonb_build_object(
              'label', coalesce(v_assessment.derivation->>'level_label', 'sin nivel'),
              'context',
                case v_assessment.assessment_kind
                  when 'residual' then 'Evaluación residual' else 'Evaluación inherente' end
                || ' del ' || to_char(v_assessment.assessed_on, 'DD/MM/YYYY')
                || ' · puntaje ' || v_assessment.score
                || case when v_after then ' — posterior al suceso' else '' end,
              'kind', v_assessment.assessment_kind,
              'score', v_assessment.score,
              'assessed_on', v_assessment.assessed_on,
              'level', v_assessment.derivation->>'level_label'),
            auth.uid());
  end if;

  update quality_risk_materializations set case_id = v_case where id = p_materialization_id;

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_mat.organization_id, 'case', 'case.opened', 'work_case', v_case, 'info',
          'Caso ' || v_code || ' abierto desde el riesgo ' || v_risk.code,
          'case.opened:' || v_case::text, auth.uid());

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_mat.organization_id, 'case', v_case, 'case_opened', 'open',
          'Abierto desde la materialización del riesgo ' || v_risk.code, auth.uid(),
          jsonb_build_object('risk_id', v_risk.id, 'materialization_id', p_materialization_id));

  return v_case;
end;
$$;
revoke all on function public.quality_open_case_from_materialization(uuid, text, text) from public, anon;
grant execute on function public.quality_open_case_from_materialization(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Revisar un riesgo (RO-10, §39). La revision no toca la evaluación anterior:
-- deja constancia de que se miro y reprograma la siguiente.
-- ----------------------------------------------------------------------------
create or replace function public.quality_review_risk(
  p_risk_id uuid,
  p_note    text,
  p_next_review_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_risk record; v_months integer;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_risk from quality_risks where id = p_risk_id;
  if v_risk.id is null then raise exception 'Ese riesgo no existe.'; end if;
  if not has_org_role(v_risk.organization_id, array['admin','quality','consultant']) then
    raise exception 'No tienes permiso para revisar riesgos.';
  end if;
  if v_risk.status not in ('active') then
    raise exception 'Solo se revisan los riesgos activos.';
  end if;

  v_months := coalesce(v_risk.review_interval_months, 12);

  update quality_risks
     set last_reviewed_on = current_date,
         next_review_on = coalesce(p_next_review_on, current_date + (v_months || ' months')::interval)
   where id = p_risk_id;

  update work_tasks set status = 'done', completed_at = now(), completed_by = auth.uid(),
         resolution = 'Riesgo revisado.'
   where organization_id = v_risk.organization_id and subject_type = 'quality_risk'
     and subject_id = p_risk_id and task_type = 'risk_review_due' and status in ('open','in_progress');

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_risk.organization_id, 'risk', p_risk_id, 'risk_review', 'reviewed', p_note, auth.uid(),
          jsonb_build_object('next_review_on',
                             coalesce(p_next_review_on, current_date + (v_months || ' months')::interval)));

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_risk.organization_id, 'risk', 'risk.reviewed', 'quality_risk', p_risk_id, 'info',
          'Riesgo ' || v_risk.code || ' revisado',
          'risk.reviewed:' || p_risk_id::text || ':' || current_date::text, auth.uid())
  on conflict do nothing;

  return p_risk_id;
end;
$$;
revoke all on function public.quality_review_risk(uuid, text, date) from public, anon;
grant execute on function public.quality_review_risk(uuid, text, date) to authenticated;


-- ----------------------------------------------------------------------------
-- Cerrar, reabrir y suceder (RO-29). Ninguno de los tres pierde historia.
-- ----------------------------------------------------------------------------
create or replace function public.quality_close_risk(
  p_risk_id uuid,
  p_mode    text,
  p_reason  text,
  p_superseded_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_risk record; v_other record;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_risk from quality_risks where id = p_risk_id;
  if v_risk.id is null then raise exception 'Ese riesgo no existe.'; end if;
  if not has_org_role(v_risk.organization_id, array['admin','quality']) then
    raise exception 'No tienes permiso para cerrar un riesgo.';
  end if;
  if v_risk.status in ('closed','retired','superseded') then
    raise exception 'Este riesgo ya está cerrado.';
  end if;
  if p_mode not in ('closed','retired','superseded') then
    raise exception 'Modo de cierre desconocido.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Cerrar un riesgo exige decir por qué.';
  end if;

  if p_mode = 'superseded' then
    if p_superseded_by is null then
      raise exception 'Para suceder un riesgo hay que indicar cuál lo sustituye.';
    end if;
    select * into v_other from quality_risks
     where id = p_superseded_by and organization_id = v_risk.organization_id;
    if v_other.id is null then
      raise exception 'El riesgo que lo sustituye no es de esta empresa.';
    end if;
    if p_superseded_by = p_risk_id then
      raise exception 'Un riesgo no puede sucederse a sí mismo.';
    end if;
    update quality_risks
       set status = 'superseded', superseded_by_risk_id = p_superseded_by,
           closure_reason = p_reason
     where id = p_risk_id;
  else
    update quality_risks
       set status = p_mode, closure_reason = p_reason,
           closed_at = now(), closed_by = auth.uid()
     where id = p_risk_id;
  end if;

  -- Lo que quedaba pendiente deja de pedirse: un riesgo cerrado no genera
  -- deberes. Las tareas se cancelan, no se borran.
  update work_tasks set status = 'cancelled', completed_at = now(), completed_by = auth.uid(),
         resolution = 'El riesgo se cerró.'
   where organization_id = v_risk.organization_id and subject_type = 'quality_risk'
     and subject_id = p_risk_id and status in ('open','in_progress');

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_risk.organization_id, 'risk', p_risk_id, 'closure', p_mode, p_reason, auth.uid(),
          jsonb_build_object('superseded_by', p_superseded_by));

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_risk.organization_id, 'risk', 'risk.closed', 'quality_risk', p_risk_id, 'info',
          'Riesgo ' || v_risk.code || ': ' || p_mode,
          'risk.closed:' || p_risk_id::text || ':' || now()::text, auth.uid());

  return p_risk_id;
end;
$$;
revoke all on function public.quality_close_risk(uuid, text, text, uuid) from public, anon;
grant execute on function public.quality_close_risk(uuid, text, text, uuid) to authenticated;


create or replace function public.quality_reopen_risk(
  p_risk_id uuid,
  p_reason  text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_risk record;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_risk from quality_risks where id = p_risk_id;
  if v_risk.id is null then raise exception 'Ese riesgo no existe.'; end if;
  if not has_org_role(v_risk.organization_id, array['admin','quality']) then
    raise exception 'No tienes permiso para reabrir un riesgo.';
  end if;
  if v_risk.status not in ('closed','retired') then
    raise exception 'Solo se reabre lo que está cerrado o retirado.';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Reabrir exige decir por qué.';
  end if;

  -- Se reabre limpiando el cierre, pero la decision de cierre sigue en el
  -- historial: se ve que se cerro y que se volvio a abrir.
  update quality_risks
     set status = 'active', closed_at = null, closed_by = null, closure_reason = null
   where id = p_risk_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_risk.organization_id, 'risk', p_risk_id, 'reopen', 'active', p_reason, auth.uid(), '{}'::jsonb);

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_risk.organization_id, 'risk', 'risk.reopened', 'quality_risk', p_risk_id, 'warning',
          'Riesgo ' || v_risk.code || ' reabierto',
          'risk.reopened:' || p_risk_id::text || ':' || now()::text, auth.uid());

  return p_risk_id;
end;
$$;
revoke all on function public.quality_reopen_risk(uuid, text) from public, anon;
grant execute on function public.quality_reopen_risk(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- Oportunidades: priorizar y decidir (RO-15, RO-16, RO-31, §45).
-- ----------------------------------------------------------------------------
create or replace function public.quality_assess_opportunity(
  p_opportunity_id uuid,
  p_kind        text,
  p_version_id  uuid,
  p_level_ids   uuid[],
  p_rationale   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_op record; v_ver record; v_derived jsonb; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_op from quality_opportunities where id = p_opportunity_id;
  if v_op.id is null then raise exception 'Esa oportunidad no existe.'; end if;
  if not has_org_role(v_op.organization_id, array['admin','quality','consultant']) then
    raise exception 'No tienes permiso para evaluar oportunidades.';
  end if;
  if v_op.status in ('closed','discarded') then
    raise exception 'Esta oportunidad ya está cerrada.';
  end if;
  if p_kind not in ('prioritization','realized_benefit') then
    raise exception 'Tipo de evaluación desconocido.';
  end if;
  -- RO-16: el beneficio realizado se comprueba DESPUES de implementar.
  if p_kind = 'realized_benefit' and v_op.status not in ('implemented','in_progress') then
    raise exception 'El beneficio obtenido se evalúa cuando la oportunidad ya se implementó.';
  end if;

  select * into v_ver from quality_risk_methodology_versions where id = p_version_id;
  if v_ver.id is null or v_ver.organization_id <> v_op.organization_id then
    raise exception 'Esa metodología no es de esta empresa.';
  end if;
  -- RO-15: la priorizacion de oportunidades usa SU metodologia. Usar la de
  -- riesgos aqui seria describir un beneficio con escalas de dano. Se
  -- comprueba ANTES de la vigencia: es el error que de verdad hay que decir.
  if (select applies_to from quality_risk_methodologies where id = v_ver.methodology_id) <> 'opportunity' then
    raise exception 'Esa metodología es de riesgos. Las oportunidades se priorizan con la suya.';
  end if;
  if v_ver.status <> 'published' then
    raise exception 'Solo se puede evaluar con una versión publicada.';
  end if;

  v_derived := quality_derive_level(p_version_id, p_level_ids);

  insert into quality_opportunity_assessments (
    organization_id, opportunity_id, assessment_kind, methodology_version_id,
    assessed_on, assessed_by, score, result_level_id, derivation, rationale
  ) values (
    v_op.organization_id, p_opportunity_id, p_kind, p_version_id,
    current_date, auth.uid(), (v_derived->>'score')::numeric,
    (v_derived->>'level_id')::uuid, v_derived, p_rationale
  ) returning id into v_id;

  insert into quality_opportunity_assessment_factors (organization_id, assessment_id, scale_id, level_id)
  select v_op.organization_id, v_id, l.scale_id, l.id
    from quality_risk_scale_levels l where l.id = any(p_level_ids);

  update quality_opportunities
     set status = case when status = 'draft' then 'active' else status end
   where id = p_opportunity_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_op.organization_id, 'opportunity', p_opportunity_id, 'opportunity_assessed',
          p_kind || ':' || (v_derived->>'level_label'), p_rationale, auth.uid(), v_derived);

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, payload, dedupe_key, created_by)
  values (v_op.organization_id, 'opportunity', 'opportunity.assessed', 'quality_opportunity',
          p_opportunity_id, 'info',
          'Oportunidad ' || v_op.code || ' priorizada: ' || (v_derived->>'level_label'),
          v_derived, 'opportunity.assessed:' || v_id::text, auth.uid());

  return v_id;
end;
$$;
revoke all on function public.quality_assess_opportunity(uuid, text, uuid, uuid[], text) from public, anon;
grant execute on function public.quality_assess_opportunity(uuid, text, uuid, uuid[], text) to authenticated;


create or replace function public.quality_decide_opportunity_treatment(
  p_opportunity_id uuid,
  p_decision  text,
  p_rationale text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_op record;
begin
  if auth.uid() is null then raise exception 'Necesitas iniciar sesión.'; end if;
  select * into v_op from quality_opportunities where id = p_opportunity_id;
  if v_op.id is null then raise exception 'Esa oportunidad no existe.'; end if;
  if not has_org_role(v_op.organization_id, array['admin','quality']) then
    raise exception 'No tienes permiso para decidir sobre una oportunidad.';
  end if;
  -- §34: catalogo propio. Ni evitar, ni reducir, ni transferir: eso es
  -- vocabulario de dano.
  if p_decision not in ('pursue','defer','decline','to_objective') then
    raise exception 'Decisión desconocida para una oportunidad.';
  end if;
  if length(btrim(coalesce(p_rationale, ''))) = 0 then
    raise exception 'La decisión necesita su fundamento.';
  end if;
  if not exists (select 1 from quality_opportunity_assessments
                  where opportunity_id = p_opportunity_id and assessment_kind = 'prioritization') then
    raise exception 'Antes de decidir hay que priorizarla.';
  end if;

  update quality_opportunities
     set treatment_decision = p_decision, treatment_rationale = p_rationale,
         decided_on = current_date, decided_by = auth.uid(),
         status = case p_decision
                    when 'decline' then 'discarded'
                    when 'pursue'  then 'in_progress'
                    else status end,
         closed_at = case when p_decision = 'decline' then now() else closed_at end,
         closed_by = case when p_decision = 'decline' then auth.uid() else closed_by end,
         closure_reason = case when p_decision = 'decline' then p_rationale else closure_reason end
   where id = p_opportunity_id;

  insert into work_decisions (organization_id, subject_kind, subject_id, decision_kind,
                              outcome, rationale, decided_by, context)
  values (v_op.organization_id, 'opportunity', p_opportunity_id, 'opportunity_treatment',
          p_decision, p_rationale, auth.uid(), '{}'::jsonb);

  insert into work_events (organization_id, source_domain, event_type, subject_type, subject_id,
                           severity, summary, dedupe_key, created_by)
  values (v_op.organization_id, 'opportunity', 'opportunity.treated', 'quality_opportunity',
          p_opportunity_id, 'info',
          'Oportunidad ' || v_op.code || ': ' || p_decision,
          'opportunity.treated:' || p_opportunity_id::text || ':' || now()::text, auth.uid());

  return p_opportunity_id;
end;
$$;
revoke all on function public.quality_decide_opportunity_treatment(uuid, text, text) from public, anon;
grant execute on function public.quality_decide_opportunity_treatment(uuid, text, text) to authenticated;


-- ----------------------------------------------------------------------------
-- §11.5 · BARRIDO DE REVISIONES (RO-10, §37, §38, §40)
--
-- Idempotente por construccion: la clave de deduplicacion incluye el riesgo y
-- la fecha de revision prevista, de modo que correr el barrido diez veces deja
-- una sola tarea y una sola alerta.
-- ----------------------------------------------------------------------------
create or replace function public.quality_scan_risk_reviews(p_organization_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer := 0;
begin
  with pendientes as (
    select r.* from quality_risks r
     where r.status = 'active'
       and r.next_review_on is not null
       and r.next_review_on <= current_date
       and (p_organization_id is null or r.organization_id = p_organization_id)
  ), destinatarios as (
    -- Un cargo no abre el correo: la tarea y la alerta van a quien lo ocupa
    -- hoy. Si el cargo esta vacante no se emite nada, porque un aviso sin
    -- dueño no lo lee nadie y solo infla contadores.
    select p.*, quality_position_holder(p.organization_id, p.owner_position_id, null) as holder
      from pendientes p
  ), t as (
    insert into work_tasks (organization_id, source_domain, task_type, subject_type, subject_id,
                            title, description, assignee_profile_id, assignee_position_id,
                            status, due_at, dedupe_key)
    select p.organization_id, 'risk', 'risk_review_due', 'quality_risk', p.id,
           'Revisar el riesgo ' || p.code,
           'La revisión estaba prevista para el ' || to_char(p.next_review_on, 'DD/MM/YYYY') || '.',
           p.holder, p.owner_position_id, 'open', p.next_review_on::timestamptz,
           'risk_review_due:' || p.id::text || ':' || p.next_review_on::text
      from destinatarios p
     where p.holder is not null
       and not exists (
         select 1 from work_tasks w
          where w.dedupe_key = 'risk_review_due:' || p.id::text || ':' || p.next_review_on::text)
    returning 1
  ), a as (
    insert into work_alerts (organization_id, source_domain, alert_type, severity,
                             subject_type, subject_id, recipient_profile_id,
                             title, message, dedupe_key)
    select p.organization_id, 'risk', 'risk_review_overdue', 'warning',
           'quality_risk', p.id, p.holder,
           'Revisión vencida: ' || p.code,
           'Este riesgo debía revisarse el ' || to_char(p.next_review_on, 'DD/MM/YYYY') || ' y sigue sin revisar.',
           'risk_review_overdue:' || p.id::text || ':' || p.next_review_on::text
      from destinatarios p
     where p.holder is not null
       and not exists (
         select 1 from work_alerts w
          where w.dedupe_key = 'risk_review_overdue:' || p.id::text || ':' || p.next_review_on::text)
    returning 1
  )
  select (select count(*) from t) into v_count;
  return coalesce(v_count, 0);
end;
$$;
revoke all on function public.quality_scan_risk_reviews(uuid) from public, anon;
grant execute on function public.quality_scan_risk_reviews(uuid) to authenticated;


-- ============================================================================
-- §12 · PROYECCIONES (§29, §30, §33 del baseline)
-- ============================================================================
--
-- La evaluación VIGENTE es una vista, no una columna. Es la unica forma de que
-- «la ultima» y «toda la historia» sean la misma verdad: si el nivel vigente
-- viviera en `quality_risks`, alguien tendria que mantenerlo y tarde o
-- temprano diria algo distinto de las filas.
-- ----------------------------------------------------------------------------
-- `security_invoker` NO es un detalle: sin él la vista se ejecuta con los
-- privilegios de quien la creo y se SALTA la RLS de las tablas que consulta.
-- Una proyeccion asi habria enseñado los riesgos de cualquier empresa a
-- cualquiera que supiera consultarla. Las vistas de QUALITY-03 y QUALITY-04 ya
-- lo llevan; esta tiene que llevarlo igual.
create or replace view public.v_quality_risk_overview
with (security_invoker = true) as
select
  r.id,
  r.organization_id,
  r.code,
  r.title,
  r.event_description,
  r.status,
  r.identified_on,
  r.next_review_on,
  r.last_reviewed_on,
  r.owner_position_id,
  pos.name  as owner_position_name,
  r.superseded_by_risk_id,

  inh.id           as inherent_assessment_id,
  inh.score        as inherent_score,
  inh.assessed_on  as inherent_assessed_on,
  inh.derivation->>'level_label' as inherent_level,

  res.id           as residual_assessment_id,
  res.score        as residual_score,
  res.assessed_on  as residual_assessed_on,
  res.derivation->>'level_label' as residual_level,
  (res.derivation->>'is_acceptable')::boolean as residual_is_acceptable,

  -- El nivel VIGENTE: la residual si existe, y si no la inherente. Nunca un
  -- promedio ni una mezcla: se muestra una evaluación real, con su fecha.
  coalesce(res.derivation->>'level_label', inh.derivation->>'level_label') as current_level,
  coalesce(res.score, inh.score)                                           as current_score,
  coalesce((res.derivation->>'is_acceptable')::boolean,
           (inh.derivation->>'is_acceptable')::boolean)                    as current_is_acceptable,
  coalesce(res.assessed_on, inh.assessed_on)                               as current_assessed_on,

  plan.id       as treatment_plan_id,
  plan.strategy as treatment_strategy,
  plan.status   as treatment_status,
  plan.requires_approval as treatment_requires_approval,

  (select count(*) from quality_risk_assessments a where a.risk_id = r.id)      as assessment_count,
  (select count(*) from quality_risk_control_links c where c.risk_id = r.id)    as control_count,
  (select count(*) from quality_risk_materializations m where m.risk_id = r.id) as materialization_count,
  (select count(*) from quality_risk_processes p where p.risk_id = r.id)        as process_count,
  (select count(*) from work_references wr
    where wr.owner_kind = 'risk' and wr.owner_id = r.id)                        as reference_count,
  (select count(*) from work_actions wa
     join work_references wr on wr.owner_kind = 'action' and wr.owner_id = wa.id
    where wr.ref_kind = 'quality_risk' and wr.ref_id = r.id)                    as action_count,
  (select count(*) from work_actions wa
     join work_references wr on wr.owner_kind = 'action' and wr.owner_id = wa.id
    where wr.ref_kind = 'quality_risk' and wr.ref_id = r.id
      and wa.status not in ('completed','verified','cancelled')
      and wa.due_on is not null and wa.due_on < current_date)                   as overdue_action_count,

  (r.status = 'active' and r.next_review_on is not null
     and r.next_review_on < current_date)                                       as review_overdue

from quality_risks r
left join quality_positions pos
       on pos.id = r.owner_position_id and pos.organization_id = r.organization_id
left join lateral (
  select a.* from quality_risk_assessments a
   where a.risk_id = r.id and a.assessment_kind = 'inherent'
   order by a.assessed_on desc, a.created_at desc limit 1
) inh on true
left join lateral (
  select a.* from quality_risk_assessments a
   where a.risk_id = r.id and a.assessment_kind = 'residual'
   order by a.assessed_on desc, a.created_at desc limit 1
) res on true
left join lateral (
  select p.* from quality_risk_treatment_plans p
   where p.risk_id = r.id and p.status in ('active','pending_approval')
   order by p.decided_on desc, p.created_at desc limit 1
) plan on true;
comment on view public.v_quality_risk_overview is
  'QUALITY-05 · §30 · Proyeccion del estado vigente. Deriva de la ultima evaluación de cada tipo; la historia entera sigue en quality_risk_assessments.';


create or replace view public.v_quality_opportunity_overview
with (security_invoker = true) as
select
  o.id,
  o.organization_id,
  o.code,
  o.title,
  o.situation,
  o.expected_benefit,
  o.opportunity_kind,
  o.status,
  o.identified_on,
  o.owner_position_id,
  pos.name as owner_position_name,
  o.treatment_decision,
  o.decided_on,

  pri.id          as priority_assessment_id,
  pri.score       as priority_score,
  pri.derivation->>'level_label' as priority_level,
  pri.assessed_on as priority_assessed_on,

  ben.id          as benefit_assessment_id,
  ben.derivation->>'level_label' as realized_benefit_level,
  ben.assessed_on as benefit_assessed_on,

  (select count(*) from quality_opportunity_assessments a where a.opportunity_id = o.id) as assessment_count,
  (select count(*) from work_actions wa
     join work_references wr on wr.owner_kind = 'action' and wr.owner_id = wa.id
    where wr.ref_kind = 'quality_opportunity' and wr.ref_id = o.id)                      as action_count,
  (select count(*) from quality_opportunity_objectives j where j.opportunity_id = o.id)  as objective_count

from quality_opportunities o
left join quality_positions pos
       on pos.id = o.owner_position_id and pos.organization_id = o.organization_id
left join lateral (
  select a.* from quality_opportunity_assessments a
   where a.opportunity_id = o.id and a.assessment_kind = 'prioritization'
   order by a.assessed_on desc, a.created_at desc limit 1
) pri on true
left join lateral (
  select a.* from quality_opportunity_assessments a
   where a.opportunity_id = o.id and a.assessment_kind = 'realized_benefit'
   order by a.assessed_on desc, a.created_at desc limit 1
) ben on true;
comment on view public.v_quality_opportunity_overview is
  'QUALITY-05 · Proyeccion de oportunidades: prioridad vigente y beneficio comprobado, con la historia intacta detras.';


-- ============================================================================
-- §13 · CICLO DE VIDA (§48, §49, §50 · filosofia QUALITY-03.1)
-- ============================================================================
--
-- Un borrador sin historia se tira. Lo que ya sirvio para decidir, no.
--
-- Cada dictamen es la UNICA fuente: lo consulta la pantalla para explicar por
-- que no se puede, y lo consulta el disparador para impedirlo. Con dos logicas
-- separadas, el mensaje y el motivo acabarian diciendo cosas distintas.
-- ----------------------------------------------------------------------------

-- Los estados se cuentan en español. Sin esto, un mensaje de la interfaz
-- acaba diciendo «ya salio del borrador (active)», que mezcla un idioma con
-- un código interno y no lo entiende nadie.
create or replace function public.quality_risk_state_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'draft' then 'borrador'
    when 'active' then 'activo'
    when 'closed' then 'cerrado'
    when 'retired' then 'retirado'
    when 'superseded' then 'sustituido'
    else p_status end;
$$;

create or replace function public.quality_opportunity_state_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'draft' then 'borrador'
    when 'active' then 'identificada'
    when 'in_progress' then 'en marcha'
    when 'implemented' then 'implementada'
    when 'closed' then 'cerrada'
    when 'discarded' then 'descartada'
    else p_status end;
$$;

create or replace function public.quality_control_state_label(p_status text)
returns text language sql immutable as $$
  select case p_status
    when 'draft' then 'borrador'
    when 'active' then 'vigente'
    when 'retired' then 'retirado'
    else p_status end;
$$;

create or replace function public.quality_risk_deletion_verdict(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r         record;
  v_block   jsonb := '[]'::jsonb;
  v_assess  integer; v_mat integer; v_plan integer; v_dec integer; v_refs integer;
begin
  select * into r from quality_risks where id = p_id;
  if r.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                              'reason', 'Este riesgo no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_assess from quality_risk_assessments where risk_id = p_id;
  select count(*) into v_mat    from quality_risk_materializations where risk_id = p_id;
  select count(*) into v_plan   from quality_risk_treatment_plans where risk_id = p_id;
  select count(*) into v_dec    from work_decisions
   where subject_kind = 'risk' and subject_id = p_id;
  select count(*) into v_refs   from work_references
   where ref_kind = 'quality_risk' and ref_id = p_id;

  -- Las etiquetas son SINTAGMAS NOMINALES, no frases: la interfaz las compone
  -- como «Tiene 2 evaluaciones, 1 materializacion y 3 decisiones registradas».
  -- Si aqui se escribiera «tiene 2 evaluaciones», el mensaje final diria
  -- «Tiene 2 tiene 2 evaluaciones».
  if v_assess > 0 then
    v_block := v_block || jsonb_build_object(
      'kind', 'assessment', 'count', v_assess,
      'label', case when v_assess = 1 then 'evaluación' else 'evaluaciones' end);
  end if;
  if v_mat > 0 then
    v_block := v_block || jsonb_build_object(
      'kind', 'materialization', 'count', v_mat,
      'label', case when v_mat = 1 then 'materialización registrada'
                    else 'materializaciones registradas' end);
  end if;
  if v_plan > 0 then
    v_block := v_block || jsonb_build_object(
      'kind', 'treatment', 'count', v_plan,
      'label', case when v_plan = 1 then 'decisión de tratamiento'
                    else 'decisiones de tratamiento' end);
  end if;
  if v_dec > 0 then
    v_block := v_block || jsonb_build_object(
      'kind', 'decision', 'count', v_dec,
      'label', case when v_dec = 1 then 'decisión registrada' else 'decisiones registradas' end);
  end if;
  if v_refs > 0 then
    v_block := v_block || jsonb_build_object(
      'kind', 'reference', 'count', v_refs,
      'label', case when v_refs = 1 then 'registro que lo referencia'
                    else 'registros que lo referencian' end);
  end if;

  if jsonb_array_length(v_block) = 0 and r.status = 'draft' then
    return jsonb_build_object(
      'can_hard_delete', true, 'reason_code', 'disposable',
      'reason', 'Este riesgo es un borrador sin historia: se puede eliminar.',
      'blocking', '[]'::jsonb);
  end if;

  -- El ESTADO va en la razon, no en la lista de bloqueos: «1 ya salio del
  -- borrador» no significa nada, y el codigo interno no se enseña.
  return jsonb_build_object(
    'can_hard_delete', false, 'reason_code', 'historical',
    'reason', case when r.status = 'draft'
                then 'Este riesgo ya tiene historia y debe conservarse.'
                else 'Este riesgo ya salió del borrador (está ' ||
                     quality_risk_state_label(r.status) || ') y debe conservarse.' end,
    'blocking', v_block);
end;
$$;
revoke all on function public.quality_risk_deletion_verdict(uuid) from public, anon, authenticated;


create or replace function public.quality_opportunity_deletion_verdict(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r       record;
  v_block jsonb := '[]'::jsonb;
  v_assess integer; v_dec integer; v_refs integer;
begin
  select * into r from quality_opportunities where id = p_id;
  if r.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                              'reason', 'Esta oportunidad no existe.', 'blocking', '[]'::jsonb);
  end if;

  select count(*) into v_assess from quality_opportunity_assessments where opportunity_id = p_id;
  select count(*) into v_dec from work_decisions
   where subject_kind = 'opportunity' and subject_id = p_id;
  select count(*) into v_refs from work_references
   where ref_kind = 'quality_opportunity' and ref_id = p_id;

  if v_assess > 0 then
    v_block := v_block || jsonb_build_object('kind','assessment','count',v_assess,
      'label', case when v_assess = 1 then 'evaluación' else 'evaluaciones' end);
  end if;
  if r.treatment_decision is not null then
    v_block := v_block || jsonb_build_object('kind','treatment','count',1,
      'label','decisión de tratamiento');
  end if;
  if v_dec > 0 then
    v_block := v_block || jsonb_build_object('kind','decision','count',v_dec,
      'label', case when v_dec = 1 then 'decisión registrada' else 'decisiones registradas' end);
  end if;
  if v_refs > 0 then
    v_block := v_block || jsonb_build_object('kind','reference','count',v_refs,
      'label', case when v_refs = 1 then 'registro que la referencia'
                    else 'registros que la referencian' end);
  end if;

  if jsonb_array_length(v_block) = 0 and r.status = 'draft' then
    return jsonb_build_object('can_hard_delete', true, 'reason_code', 'disposable',
      'reason','Esta oportunidad es un borrador sin historia: se puede eliminar.',
      'blocking','[]'::jsonb);
  end if;
  return jsonb_build_object('can_hard_delete', false, 'reason_code', 'historical',
    'reason', case when r.status = 'draft'
                then 'Esta oportunidad ya tiene historia y debe conservarse.'
                else 'Esta oportunidad ya salió del borrador (está ' ||
                     quality_opportunity_state_label(r.status) || ') y debe conservarse.' end,
    'blocking', v_block);
end;
$$;
revoke all on function public.quality_opportunity_deletion_verdict(uuid) from public, anon, authenticated;


create or replace function public.quality_control_deletion_verdict(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r        record;
  v_block  jsonb := '[]'::jsonb;
  v_rev integer; v_links integer; v_used integer; v_dec integer;
begin
  select * into r from quality_controls where id = p_id;
  if r.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                              'reason','Este control no existe.', 'blocking','[]'::jsonb);
  end if;

  select count(*) into v_rev   from quality_control_effectiveness_reviews where control_id = p_id;
  select count(*) into v_links from quality_risk_control_links where control_id = p_id;
  select count(*) into v_dec   from work_decisions
   where subject_kind = 'control' and subject_id = p_id;
  -- §50: lo que de verdad ata un control es haber sustentado una evaluación
  -- residual. Borrarlo dejaria esa evaluación sin poder explicarse.
  select count(*) into v_used  from work_references
   where owner_kind = 'risk_assessment' and ref_kind = 'quality_control' and ref_id = p_id;

  if v_used > 0 then
    v_block := v_block || jsonb_build_object('kind','assessment_use','count',v_used,
      'label', case when v_used = 1 then 'evaluación residual que se apoya en él'
                    else 'evaluaciones residuales que se apoyan en él' end);
  end if;
  if v_rev > 0 then
    v_block := v_block || jsonb_build_object('kind','review','count',v_rev,
      'label', case when v_rev = 1 then 'evaluación de eficacia' else 'evaluaciones de eficacia' end);
  end if;
  if v_links > 0 then
    v_block := v_block || jsonb_build_object('kind','risk_link','count',v_links,
      'label', case when v_links = 1 then 'riesgo asociado' else 'riesgos asociados' end);
  end if;
  if v_dec > 0 then
    v_block := v_block || jsonb_build_object('kind','decision','count',v_dec,
      'label', case when v_dec = 1 then 'decisión registrada' else 'decisiones registradas' end);
  end if;

  if jsonb_array_length(v_block) = 0 and r.status = 'draft' then
    return jsonb_build_object('can_hard_delete', true, 'reason_code','disposable',
      'reason','Este control es un borrador sin uso: se puede eliminar.', 'blocking','[]'::jsonb);
  end if;
  return jsonb_build_object('can_hard_delete', false, 'reason_code','historical',
    'reason', case when r.status = 'draft'
                then 'Este control ya forma parte de la historia y debe conservarse.'
                else 'Este control ya salió del borrador (está ' ||
                     quality_control_state_label(r.status) || ') y debe conservarse.' end,
    'blocking', v_block);
end;
$$;
revoke all on function public.quality_control_deletion_verdict(uuid) from public, anon, authenticated;


-- §49 · Una version de metodologia que se uso para evaluar no se borra. Se
-- publica una nueva; la vieja queda sucedida y sigue explicando lo suyo.
create or replace function public.quality_methodology_version_deletion_verdict(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r       record;
  v_block jsonb := '[]'::jsonb;
  v_risk integer; v_op integer;
begin
  select * into r from quality_risk_methodology_versions where id = p_id;
  if r.id is null then
    return jsonb_build_object('can_hard_delete', false, 'reason_code','not_found',
                              'reason','Esta versión no existe.', 'blocking','[]'::jsonb);
  end if;

  select count(*) into v_risk from quality_risk_assessments where methodology_version_id = p_id;
  select count(*) into v_op   from quality_opportunity_assessments where methodology_version_id = p_id;

  if v_risk + v_op > 0 then
    v_block := v_block || jsonb_build_object('kind','assessment','count', v_risk + v_op,
      'label', case when v_risk + v_op = 1 then 'evaluación hecha con ella'
                    else 'evaluaciones hechas con ella' end);
  end if;

  if jsonb_array_length(v_block) = 0 and r.status = 'draft' then
    return jsonb_build_object('can_hard_delete', true, 'reason_code','disposable',
      'reason','Esta versión es un borrador sin uso: se puede eliminar.', 'blocking','[]'::jsonb);
  end if;
  return jsonb_build_object('can_hard_delete', false, 'reason_code','historical',
    'reason', case when r.status = 'draft'
                then 'Esta versión se usó para decidir y debe conservarse.'
                else 'Esta versión ya se publicó y debe conservarse. Publica una versión nueva en lugar de reescribirla.' end,
    'blocking', v_block);
end;
$$;
revoke all on function public.quality_methodology_version_deletion_verdict(uuid) from public, anon, authenticated;


-- El dictamen publico. Enmascara por completo lo ajeno: ni el motivo ni los
-- contadores salen de la empresa (§53).
create or replace function public.quality_deletion_eligibility(p_entity text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_none jsonb := jsonb_build_object('can_hard_delete', false, 'reason_code', 'not_found',
                                     'reason', 'Este registro no existe.', 'blocking', '[]'::jsonb);
begin
  if auth.uid() is null then return v_none; end if;

  v_org := case p_entity
    when 'indicator' then (select organization_id from quality_indicators where id = p_id)
    when 'objective' then (select organization_id from quality_objectives where id = p_id)
    when 'position'  then (select organization_id from quality_positions  where id = p_id)
    when 'document'  then (select organization_id from trazadoc_documents where id = p_id)
    when 'process'   then (select organization_id from quality_processes  where id = p_id)
    when 'case'      then (select organization_id from work_cases         where id = p_id)
    when 'action'    then (select organization_id from work_actions       where id = p_id)
    when 'risk'        then (select organization_id from quality_risks        where id = p_id)
    when 'opportunity' then (select organization_id from quality_opportunities where id = p_id)
    when 'control'     then (select organization_id from quality_controls     where id = p_id)
    when 'methodology_version' then
      (select organization_id from quality_risk_methodology_versions where id = p_id)
  end;

  if v_org is null or not is_org_member(v_org) then return v_none; end if;

  return case p_entity
    when 'indicator' then quality_indicator_deletion_verdict(p_id)
    when 'objective' then quality_objective_deletion_verdict(p_id)
    when 'position'  then quality_position_deletion_verdict(p_id)
    when 'document'  then trazadoc_document_deletion_verdict(p_id)
    when 'process'   then quality_process_deletion_verdict(p_id)
    when 'case'      then work_case_deletion_verdict(p_id)
    when 'action'    then work_action_deletion_verdict(p_id)
    when 'risk'        then quality_risk_deletion_verdict(p_id)
    when 'opportunity' then quality_opportunity_deletion_verdict(p_id)
    when 'control'     then quality_control_deletion_verdict(p_id)
    when 'methodology_version' then quality_methodology_version_deletion_verdict(p_id)
  end;
end;
$$;
revoke all on function public.quality_deletion_eligibility(text, uuid) from public, anon;
grant execute on function public.quality_deletion_eligibility(text, uuid) to authenticated;


-- El guardia. Se ejecuta en el instante del DELETE, no cuando la pantalla
-- pinto el boton: cierra la ventana entre «se veia borrable» y «se borro».
create or replace function public.quality_ro_guard_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_verdict jsonb;
begin
  v_verdict := case tg_table_name
    when 'quality_risks'         then quality_risk_deletion_verdict(old.id)
    when 'quality_opportunities' then quality_opportunity_deletion_verdict(old.id)
    when 'quality_controls'      then quality_control_deletion_verdict(old.id)
    when 'quality_risk_methodology_versions'
                                 then quality_methodology_version_deletion_verdict(old.id)
  end;
  if not (v_verdict->>'can_hard_delete')::boolean then
    raise exception '%', v_verdict->>'reason';
  end if;
  return old;
end;
$$;
revoke all on function public.quality_ro_guard_hard_delete() from public, anon, authenticated;

create trigger quality_risks_guard_delete before delete on public.quality_risks
  for each row execute function public.quality_ro_guard_hard_delete();
create trigger quality_opportunities_guard_delete before delete on public.quality_opportunities
  for each row execute function public.quality_ro_guard_hard_delete();
create trigger quality_controls_guard_delete before delete on public.quality_controls
  for each row execute function public.quality_ro_guard_hard_delete();
create trigger quality_risk_methodology_versions_guard_delete
  before delete on public.quality_risk_methodology_versions
  for each row execute function public.quality_ro_guard_hard_delete();


-- ============================================================================
-- §14 · RLS (§53, MDR-03, MDR-04)
-- ============================================================================
--
-- Denegar por defecto. Ver es de cualquier miembro; escribir exige rol; los
-- actos formales pasan por las funciones de §11, que ademas comprueban estado.
-- ----------------------------------------------------------------------------
alter table public.quality_risk_methodologies          enable row level security;
alter table public.quality_risk_methodology_versions   enable row level security;
alter table public.quality_risk_scales                 enable row level security;
alter table public.quality_risk_scale_levels           enable row level security;
alter table public.quality_risks                       enable row level security;
alter table public.quality_risk_codes                  enable row level security;
alter table public.quality_risk_causes                 enable row level security;
alter table public.quality_risk_consequences           enable row level security;
alter table public.quality_risk_processes              enable row level security;
alter table public.quality_risk_objectives             enable row level security;
alter table public.quality_controls                    enable row level security;
alter table public.quality_control_codes               enable row level security;
alter table public.quality_risk_control_links          enable row level security;
alter table public.quality_control_activity_links      enable row level security;
alter table public.quality_control_effectiveness_reviews enable row level security;
alter table public.quality_risk_assessments            enable row level security;
alter table public.quality_risk_assessment_factors     enable row level security;
alter table public.quality_risk_treatment_plans        enable row level security;
alter table public.quality_risk_materializations       enable row level security;
alter table public.quality_risk_signals                enable row level security;
alter table public.quality_opportunities               enable row level security;
alter table public.quality_opportunity_codes           enable row level security;
alter table public.quality_opportunity_processes       enable row level security;
alter table public.quality_opportunity_objectives      enable row level security;
alter table public.quality_opportunity_assessments     enable row level security;
alter table public.quality_opportunity_assessment_factors enable row level security;

-- --- lectura: cualquier miembro de la empresa ---
create policy quality_risk_methodologies_select on public.quality_risk_methodologies
  for select using (is_org_member(organization_id));
create policy quality_risk_methodology_versions_select on public.quality_risk_methodology_versions
  for select using (is_org_member(organization_id));
create policy quality_risk_scales_select on public.quality_risk_scales
  for select using (is_org_member(organization_id));
create policy quality_risk_scale_levels_select on public.quality_risk_scale_levels
  for select using (is_org_member(organization_id));
create policy quality_risks_select on public.quality_risks
  for select using (is_org_member(organization_id));
create policy quality_risk_codes_select on public.quality_risk_codes
  for select using (is_org_member(organization_id));
create policy quality_risk_causes_select on public.quality_risk_causes
  for select using (is_org_member(organization_id));
create policy quality_risk_consequences_select on public.quality_risk_consequences
  for select using (is_org_member(organization_id));
create policy quality_risk_processes_select on public.quality_risk_processes
  for select using (is_org_member(organization_id));
create policy quality_risk_objectives_select on public.quality_risk_objectives
  for select using (is_org_member(organization_id));
create policy quality_controls_select on public.quality_controls
  for select using (is_org_member(organization_id));
create policy quality_control_codes_select on public.quality_control_codes
  for select using (is_org_member(organization_id));
create policy quality_risk_control_links_select on public.quality_risk_control_links
  for select using (is_org_member(organization_id));
create policy quality_control_activity_links_select on public.quality_control_activity_links
  for select using (is_org_member(organization_id));
create policy quality_control_effectiveness_reviews_select on public.quality_control_effectiveness_reviews
  for select using (is_org_member(organization_id));
create policy quality_risk_assessments_select on public.quality_risk_assessments
  for select using (is_org_member(organization_id));
create policy quality_risk_assessment_factors_select on public.quality_risk_assessment_factors
  for select using (is_org_member(organization_id));
create policy quality_risk_treatment_plans_select on public.quality_risk_treatment_plans
  for select using (is_org_member(organization_id));
create policy quality_risk_materializations_select on public.quality_risk_materializations
  for select using (is_org_member(organization_id));
create policy quality_risk_signals_select on public.quality_risk_signals
  for select using (is_org_member(organization_id));
create policy quality_opportunities_select on public.quality_opportunities
  for select using (is_org_member(organization_id));
create policy quality_opportunity_codes_select on public.quality_opportunity_codes
  for select using (is_org_member(organization_id));
create policy quality_opportunity_processes_select on public.quality_opportunity_processes
  for select using (is_org_member(organization_id));
create policy quality_opportunity_objectives_select on public.quality_opportunity_objectives
  for select using (is_org_member(organization_id));
create policy quality_opportunity_assessments_select on public.quality_opportunity_assessments
  for select using (is_org_member(organization_id));
create policy quality_opportunity_assessment_factors_select on public.quality_opportunity_assessment_factors
  for select using (is_org_member(organization_id));

-- --- escritura del catalogo y de las fichas ---
create policy quality_risk_methodologies_write on public.quality_risk_methodologies
  for all using (has_org_role(organization_id, array['admin','quality']))
  with check (has_org_role(organization_id, array['admin','quality']));
create policy quality_risk_methodology_versions_write on public.quality_risk_methodology_versions
  for all using (has_org_role(organization_id, array['admin','quality']))
  with check (has_org_role(organization_id, array['admin','quality']));
create policy quality_risk_scales_write on public.quality_risk_scales
  for all using (has_org_role(organization_id, array['admin','quality']))
  with check (has_org_role(organization_id, array['admin','quality']));
create policy quality_risk_scale_levels_write on public.quality_risk_scale_levels
  for all using (has_org_role(organization_id, array['admin','quality']))
  with check (has_org_role(organization_id, array['admin','quality']));

create policy quality_risks_insert on public.quality_risks
  for insert with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_risks_update on public.quality_risks
  for update using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_risks_delete on public.quality_risks
  for delete using (has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_risk_causes_write on public.quality_risk_causes
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_risk_consequences_write on public.quality_risk_consequences
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_risk_processes_write on public.quality_risk_processes
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_risk_objectives_write on public.quality_risk_objectives
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_controls_insert on public.quality_controls
  for insert with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_controls_update on public.quality_controls
  for update using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_controls_delete on public.quality_controls
  for delete using (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_risk_control_links_write on public.quality_risk_control_links
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_control_activity_links_write on public.quality_control_activity_links
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_opportunities_insert on public.quality_opportunities
  for insert with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_opportunities_update on public.quality_opportunities
  for update using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_opportunities_delete on public.quality_opportunities
  for delete using (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_opportunity_processes_write on public.quality_opportunity_processes
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));
create policy quality_opportunity_objectives_write on public.quality_opportunity_objectives
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_risk_signals_write on public.quality_risk_signals
  for all using (has_org_role(organization_id, array['admin','quality','consultant']))
  with check (has_org_role(organization_id, array['admin','quality','consultant']));

create policy quality_risk_methodology_versions_delete on public.quality_risk_methodology_versions
  for delete using (has_org_role(organization_id, array['admin','quality']));


-- ============================================================================
-- §15 · PRIVILEGIOS EXPLICITOS
-- ============================================================================
--
-- La leccion de 0115 y 0118, que solo aparecio en Staging: conceder SELECT no
-- retira lo que el entorno concede. En un proyecto remoto de Supabase las
-- tablas nuevas nacen con `arwdDxtm` para `authenticated`, y un DELETE sin
-- politica devuelve 204 con cero filas, no un error. «Cero filas» no es
-- «denegado». Por eso se revoca de forma explicita, tabla por tabla.
--
-- Regla: todo lo que sea EVALUACION, DECISION o HISTORIA se escribe solo por
-- las funciones de §11. La sesion no tiene DML directo sobre ellas.
-- ----------------------------------------------------------------------------
revoke all on table public.quality_risk_assessments            from anon, authenticated;
revoke all on table public.quality_risk_assessment_factors     from anon, authenticated;
revoke all on table public.quality_opportunity_assessments     from anon, authenticated;
revoke all on table public.quality_opportunity_assessment_factors from anon, authenticated;
revoke all on table public.quality_control_effectiveness_reviews from anon, authenticated;
revoke all on table public.quality_risk_treatment_plans        from anon, authenticated;
revoke all on table public.quality_risk_materializations       from anon, authenticated;
revoke all on table public.quality_risk_codes                  from anon, authenticated;
revoke all on table public.quality_control_codes               from anon, authenticated;
revoke all on table public.quality_opportunity_codes           from anon, authenticated;

grant select on table public.quality_risk_assessments            to authenticated;
grant select on table public.quality_risk_assessment_factors     to authenticated;
grant select on table public.quality_opportunity_assessments     to authenticated;
grant select on table public.quality_opportunity_assessment_factors to authenticated;
grant select on table public.quality_control_effectiveness_reviews to authenticated;
grant select on table public.quality_risk_treatment_plans        to authenticated;
grant select on table public.quality_risk_materializations       to authenticated;
grant select on table public.quality_risk_codes                  to authenticated;
grant select on table public.quality_control_codes               to authenticated;
grant select on table public.quality_opportunity_codes           to authenticated;

-- Estas si admiten DML de sesion, pero bajo RLS y solo lo que las politicas
-- dejan pasar.
revoke all on table public.quality_risk_methodologies        from anon, authenticated;
revoke all on table public.quality_risk_methodology_versions from anon, authenticated;
revoke all on table public.quality_risk_scales               from anon, authenticated;
revoke all on table public.quality_risk_scale_levels         from anon, authenticated;
revoke all on table public.quality_risks                     from anon, authenticated;
revoke all on table public.quality_risk_causes               from anon, authenticated;
revoke all on table public.quality_risk_consequences         from anon, authenticated;
revoke all on table public.quality_risk_processes            from anon, authenticated;
revoke all on table public.quality_risk_objectives           from anon, authenticated;
revoke all on table public.quality_controls                  from anon, authenticated;
revoke all on table public.quality_risk_control_links        from anon, authenticated;
revoke all on table public.quality_control_activity_links    from anon, authenticated;
revoke all on table public.quality_risk_signals              from anon, authenticated;
revoke all on table public.quality_opportunities             from anon, authenticated;
revoke all on table public.quality_opportunity_processes     from anon, authenticated;
revoke all on table public.quality_opportunity_objectives    from anon, authenticated;

grant select, insert, update, delete on table public.quality_risk_methodologies        to authenticated;
grant select, insert, update, delete on table public.quality_risk_methodology_versions to authenticated;
grant select, insert, update, delete on table public.quality_risk_scales               to authenticated;
grant select, insert, update, delete on table public.quality_risk_scale_levels         to authenticated;
grant select, insert, update, delete on table public.quality_risks                     to authenticated;
grant select, insert, update, delete on table public.quality_risk_causes               to authenticated;
grant select, insert, update, delete on table public.quality_risk_consequences         to authenticated;
grant select, insert, update, delete on table public.quality_risk_processes            to authenticated;
grant select, insert, update, delete on table public.quality_risk_objectives           to authenticated;
grant select, insert, update, delete on table public.quality_controls                  to authenticated;
grant select, insert, update, delete on table public.quality_risk_control_links        to authenticated;
grant select, insert, update, delete on table public.quality_control_activity_links    to authenticated;
grant select, insert, update, delete on table public.quality_risk_signals              to authenticated;
grant select, insert, update, delete on table public.quality_opportunities             to authenticated;
grant select, insert, update, delete on table public.quality_opportunity_processes     to authenticated;
grant select, insert, update, delete on table public.quality_opportunity_objectives    to authenticated;

grant select on public.v_quality_risk_overview        to authenticated;
grant select on public.v_quality_opportunity_overview to authenticated;

-- Indices para lo que de verdad se consulta: la ficha, su historia y el
-- barrido de revisiones.
create index quality_risks_org_status_idx        on public.quality_risks (organization_id, status);
create index quality_risks_review_idx            on public.quality_risks (organization_id, next_review_on)
  where status = 'active';
create index quality_risk_assessments_risk_idx   on public.quality_risk_assessments (risk_id, assessment_kind, assessed_on desc);
create index quality_risk_materializations_risk_idx on public.quality_risk_materializations (risk_id, occurred_on desc);
create index quality_risk_treatment_plans_risk_idx  on public.quality_risk_treatment_plans (risk_id, status);
create index quality_controls_org_status_idx     on public.quality_controls (organization_id, status);
create index quality_opportunities_org_status_idx on public.quality_opportunities (organization_id, status);
create index quality_opportunity_assessments_op_idx on public.quality_opportunity_assessments (opportunity_id, assessment_kind, assessed_on desc);
create index quality_risk_signals_org_status_idx on public.quality_risk_signals (organization_id, status);
create index work_references_ref_lookup_idx      on public.work_references (ref_kind, ref_id);
