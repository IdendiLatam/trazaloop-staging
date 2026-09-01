-- ============================================================================
-- Trazaloop · PE-04B1 · LOS CIMIENTOS COMERCIALES CANÓNICOS
-- ----------------------------------------------------------------------------
-- Identidad estable, revisiones inmutables, asignaciones con vigencia y un
-- resolutor que no miente cuando falla.
--
--
-- LO QUE ESTA MIGRACIÓN **NO** HACE
--
-- No cambia el comportamiento de ninguna empresa. Ni una. El modelo que crea
-- vive EN PARALELO al de hoy, sin sincronización oculta y sin doble escritura:
--
--   · `plan_definitions`, `plan_limits`, `organization_subscriptions`,
--     `subscription_plan_history` y `organization_modules` quedan intactos y
--     siguen siendo la autoridad de todo lo que ya funciona;
--   · ninguna subida, ningún acceso a módulo, ninguna consulta de IA y ningún
--     ticket cambian de camino;
--   · `create_organization` no se toca.
--
-- El cambio de autoridad es PE-04B2. Aquí solo se construye el sitio, se
-- siembra el catálogo con los valores que YA existen, y se deja una herramienta
-- para comparar las dos verdades antes de mover nada.
--
--
-- POR QUÉ EN PARALELO Y NO ENCIMA
--
-- Porque PE-04A encontró que hoy hay dos fuentes de verdad de plan en
-- desacuerdo en el 100 % de las empresas de la base local. Migrar y cambiar la
-- autoridad en la misma migración significaría no poder comprobar nada: si algo
-- saliera mal no habría con qué comparar. Primero se construye, después se
-- compara, y solo entonces se mueve.
--
--
-- LOS TRES DEFECTOS DE HOY QUE ESTE MODELO NO REPITE
--
-- 1 · UN SOLO SITIO PARA CADA LÍMITE. Hoy la cuota de almacenamiento vive dos
--     veces —`plan_definitions.storage_limit_bytes` y
--     `plan_limits('storage_bytes')`— con los mismos valores por casualidad.
--     Aquí hay UNA tabla de límites y ninguna columna de cuota en la revisión.
--
-- 2 · NULL NO SIGNIFICA «ILIMITADO». Hoy `limit_value is null` con
--     `is_unlimited` al lado funciona, pero invita a leer el nulo solo. Aquí el
--     estado es explícito y son TRES: `finite`, `unlimited`, `not_configured`.
--     El tercero existe porque B1 tiene que poder decir «esto aún no se ha
--     decidido» sin inventarse un número ni regalar barra libre.
--
-- 3 · UN FALLO NO ES UN PLAN. Hoy `getOrganizationEffectivePlanCode` devuelve
--     'demo' ante cualquier error: falla cerrado —bien— y al mismo tiempo
--     MIENTE sobre la identidad del plan. Aquí el resolutor devuelve tres
--     respuestas: `found`, `absent` y `unavailable`. La tercera deniega igual
--     que la segunda y NO se puede enseñar como si fuera un plan.
--
--
-- QUÉ NO SE SIEMBRA, Y POR QUÉ
--
--   · `demo` NO es un plan canónico. Era cuatro cosas a la vez —ventana de
--     prueba, suelo, fila de catálogo y estado de bloqueo—. Aquí la prueba es
--     una CONCESIÓN temporal de un plan de pago, y el suelo es `free`.
--   · `advisor` NO es un plan. Es un servicio, y se modelará como complemento.
--   · El precio de Extra NO se inventa. Su revisión nace con el precio
--     explícitamente SIN CONFIGURAR, que no es lo mismo que gratis.
-- ============================================================================


-- ============================================================================
-- 1 · LA IDENTIDAD
-- ----------------------------------------------------------------------------
-- Lo que no cambia nunca. Ni precio, ni cuota, ni texto de marketing: todo eso
-- vive en las revisiones, porque todo eso cambia.
-- ============================================================================

create table public.plans (
  code          text        primary key,
  status        text        not null default 'active',
  display_order integer     not null default 0,
  created_at    timestamptz not null default now(),

  constraint plans_code_check   check (code in ('free', 'full', 'extra')),
  constraint plans_status_check check (status in ('active', 'inactive'))
);

comment on table public.plans is
  'PE-04B1 · La IDENTIDAD de un plan comercial. Estable para siempre. Ni precio ni limites ni nombre visible: eso vive en plan_revisions porque eso cambia. No existe demo (era una ventana de prueba, no un plan) ni advisor (es un servicio).';

comment on column public.plans.code is
  'PE-04B1 · Clave LOGICA, jamas el nombre visible. El nombre lo pone la revision vigente y puede cambiar sin romper nada.';


-- ============================================================================
-- 2 · LAS REVISIONES
-- ----------------------------------------------------------------------------
-- Inmutables una vez publicadas. Cambiar el precio de Full mañana crea otra
-- revisión y cierra esta; la empresa que contrató bajo esta sigue apuntando
-- aquí. Es el mismo patrón de 0136 (legal), 0155 (FAQ) y 0159 (tutoriales), y
-- por la misma razón: el pasado no se reescribe.
--
--
-- EL PRECIO, EN UNIDADES MENORES Y ANTES DE IMPUESTOS
--
-- `bigint` de céntimos, nunca coma flotante: 40.00 en binario no es 40.00. Y
-- SIN impuestos, porque el impuesto depende de dónde esté el cliente y lo
-- calcula PE-05. Ninguna columna de aquí puede leerse como «precio final».
--
--
-- `price_state`, PORQUE «SIN PRECIO» NO ES «GRATIS»
--
-- Extra existe y todavía no tiene precio decidido. Dejar sus columnas en nulo
-- sin decir nada invitaría a que alguien lo pintara como 0. El estado lo dice.
-- ============================================================================

create table public.plan_revisions (
  id                  uuid        primary key default gen_random_uuid(),
  plan_code           text        not null references public.plans(code),
  revision_number     integer     not null,
  status              text        not null default 'draft',

  -- Lo que ve el cliente. Cambia entre revisiones: por eso está aquí.
  display_name        text        not null,
  description         text,
  public_conditions   text,

  -- El precio. SIN IMPUESTOS. En unidades menores (céntimos).
  price_state         text        not null default 'not_configured',
  currency            text,
  monthly_price_minor bigint,
  annual_price_minor  bigint,

  -- Solo para la plataforma. Nunca sale por la proyección pública.
  internal_notes      text,

  -- Vigencia. `effective_to` nulo = es la vigente.
  effective_from      timestamptz,
  effective_to        timestamptz,

  published_at        timestamptz,
  published_by        uuid references public.profiles(id),
  created_by          uuid references public.profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint plan_revisions_number_uniq unique (plan_code, revision_number),
  constraint plan_revisions_status_check
    check (status in ('draft', 'published', 'retired')),
  constraint plan_revisions_number_positive check (revision_number > 0),
  constraint plan_revisions_price_state_check
    check (price_state in ('configured', 'not_configured')),

  -- Un precio configurado trae moneda e importe mensual. Uno sin configurar no
  -- trae nada: no se puede tener media promesa.
  constraint plan_revisions_price_shape check (
    (price_state = 'configured'
       and currency is not null and monthly_price_minor is not null)
    or
    (price_state = 'not_configured'
       and currency is null and monthly_price_minor is null
       and annual_price_minor is null)
  ),
  constraint plan_revisions_price_not_negative check (
    (monthly_price_minor is null or monthly_price_minor >= 0)
    and (annual_price_minor is null or annual_price_minor >= 0)
  ),

  -- Publicada exige fecha y quién. Borrador no puede tener vigencia.
  constraint plan_revisions_published_shape check (
    (status = 'draft'
       and published_at is null and effective_from is null and effective_to is null)
    or
    (status in ('published', 'retired')
       and published_at is not null and effective_from is not null)
  ),
  constraint plan_revisions_period_order check (
    effective_to is null or effective_from is null or effective_to > effective_from
  )
);

-- UNA sola revisión vigente por plan. Es el índice el que lo impide, no un
-- comentario ni la disciplina de quien escribe.
create unique index plan_revisions_current_uniq
  on public.plan_revisions (plan_code)
  where status = 'published' and effective_to is null;

create index plan_revisions_plan_idx on public.plan_revisions (plan_code, revision_number desc);

comment on table public.plan_revisions is
  'PE-04B1 · Una revision PUBLICADA es inmutable: cambiar un precio o un limite crea otra y cierra esta. Los precios van en unidades menores y SIN IMPUESTOS — el impuesto lo calcula PE-05 y depende de donde este el cliente.';

comment on column public.plan_revisions.monthly_price_minor is
  'PE-04B1 · Precio mensual en unidades MENORES (centimos) y ANTES de impuestos. Entero: el dinero nunca va en coma flotante. Nulo solo si price_state = not_configured.';

comment on column public.plan_revisions.price_state is
  'PE-04B1 · not_configured NO significa gratis. Extra existe sin precio decidido, y dejarlo en nulo sin decirlo invitaria a pintarlo como 0.';

comment on column public.plan_revisions.internal_notes is
  'PE-04B1 · SOLO plataforma. Jamas sale por v_public_plan_catalog.';


-- ============================================================================
-- 3 · EL CATÁLOGO DE RECURSOS
-- ----------------------------------------------------------------------------
-- Vocabulario cerrado, como las claves de pantalla y las de módulo. Un recurso
-- mal escrito que se guarda en silencio es un límite que nadie aplica nunca.
--
-- `unit` no es decoración: dice en qué se mide, y de ahí sale cómo se enseña.
-- «40 consultas al mes» se entiende; «40» no.
-- ============================================================================

create table public.plan_resources (
  code         text        primary key,
  label        text        not null,
  unit         text        not null,
  scope        text        not null,
  is_public    boolean     not null default true,
  created_at   timestamptz not null default now(),

  constraint plan_resources_unit_check
    check (unit in ('count', 'bytes', 'boolean', 'runs_per_month', 'runs_per_day')),
  constraint plan_resources_scope_check
    check (scope in ('organization', 'module'))
);

comment on table public.plan_resources is
  'PE-04B1 · Vocabulario cerrado de recursos limitables. `scope` dice si el limite es de la EMPRESA (almacenamiento, IA) o del MODULO (conteos). `is_public` dice si el numero se le puede enseñar a un cliente.';

insert into public.plan_resources (code, label, unit, scope, is_public) values
  -- Almacenamiento · DE LA EMPRESA por decisión congelada del propietario del
  -- producto: una sola cuota, venga el archivo de donde venga.
  ('storage_bytes',                      'Almacenamiento',                      'bytes',          'organization', true),
  -- Conteos funcionales, por módulo. Copiados del catálogo de hoy.
  ('documents_trazadocs',                'Documentos TrazaDocs',                'count',          'module',       true),
  ('suppliers',                          'Proveedores',                         'count',          'module',       true),
  ('materials',                          'Materiales',                          'count',          'module',       true),
  ('products',                           'Productos',                           'count',          'module',       true),
  ('evidences',                          'Evidencias',                          'count',          'module',       true),
  ('production_orders',                  'Órdenes / corridas de producción',    'count',          'module',       true),
  ('input_batches',                      'Lotes de entrada',                    'count',          'module',       true),
  ('output_batches',                     'Lotes producidos',                    'count',          'module',       true),
  ('team_members',                       'Personas del equipo',                 'count',          'organization', true),
  -- Interruptores funcionales. Se conservan como estaban: 0 o 1.
  ('roles_enabled',                      'Roles y permisos',                    'boolean',        'organization', true),
  ('diagnostic_recommendations_enabled', 'Recomendaciones del diagnóstico',     'boolean',        'module',       true),
  ('imports_enabled',                    'Importaciones',                       'boolean',        'module',       true),
  -- Inteligencia y uso diario. Existen para que PE-04B4 los rellene; hoy nacen
  -- SIN CONFIGURAR, que no es lo mismo que sin límite.
  ('ai_runs_per_month',                  'Consultas de Intelligence al mes',    'runs_per_month', 'organization', true),
  ('daily_metered_operations',           'Operaciones medidas al día',          'runs_per_day',   'organization', true),
  -- Soporte. Congelado por el propietario del producto en este tramo.
  ('technical_report_enabled',           'Reportar fallos del producto',        'boolean',        'organization', true),
  ('functional_support_enabled',         'Acompañamiento funcional',            'boolean',        'organization', true);


-- ============================================================================
-- 4 · LOS LÍMITES DE UNA REVISIÓN
-- ----------------------------------------------------------------------------
-- UN valor por (revisión, recurso). Ni uno más: no hay columna de cuota en
-- `plan_revisions`, a propósito.
--
-- TRES estados, y el tercero es el que importa hoy:
--
--   finite          hay un número, y es ese
--   unlimited       no hay tope de producto
--   not_configured  todavía no se ha decidido — NO es «ilimitado»
--
-- Sin el tercero, B1 tendría que inventarse una cifra de IA o dejar un nulo que
-- alguien leería como barra libre. Las dos serían mentira.
-- ============================================================================

create table public.plan_revision_limits (
  id               uuid        primary key default gen_random_uuid(),
  plan_revision_id uuid        not null references public.plan_revisions(id) on delete cascade,
  resource_code    text        not null references public.plan_resources(code),
  limit_state      text        not null,
  limit_value      bigint,
  created_at       timestamptz not null default now(),

  constraint plan_revision_limits_uniq unique (plan_revision_id, resource_code),
  constraint plan_revision_limits_state_check
    check (limit_state in ('finite', 'unlimited', 'not_configured')),
  -- El valor existe EXACTAMENTE cuando el estado es `finite`. Ni un nulo con
  -- estado finito, ni un número con estado ilimitado.
  constraint plan_revision_limits_shape
    check ((limit_state = 'finite') = (limit_value is not null)),
  constraint plan_revision_limits_not_negative
    check (limit_value is null or limit_value >= 0)
);

create index plan_revision_limits_rev_idx on public.plan_revision_limits (plan_revision_id);

comment on table public.plan_revision_limits is
  'PE-04B1 · UN valor por (revision, recurso). No hay columna de cuota en plan_revisions: hoy el almacenamiento vive dos veces en el modelo legacy y ese defecto no se repite. limit_state tiene TRES valores porque not_configured no es unlimited.';

comment on column public.plan_revision_limits.limit_state is
  'PE-04B1 · finite | unlimited | not_configured. El tercero significa «aun no decidido» y NO concede nada: quien lo lea debe negar, no regalar.';


-- ============================================================================
-- 5 · LA ASIGNACIÓN
-- ----------------------------------------------------------------------------
-- Qué tiene cada empresa, desde cuándo y hasta cuándo. Apunta a una REVISIÓN
-- concreta, no a un código: ahí está la verdad histórica de qué se le prometió.
--
--
-- POR QUÉ CON ÁMBITO DE MÓDULO
--
-- Porque hoy una empresa puede tener PCR en Full y Textiles en Demo, y eso es
-- un caso real y frecuente. Colapsar a un plan por empresa perdería información
-- que existe: o se le quita el acceso a Textiles, o se le regala Full en un
-- módulo que nadie compró.
--
--
-- POR QUÉ NO HAY COLUMNA «PLAN ACTUAL»
--
-- Porque una columna que se sobrescribe borra el pasado en cada cambio. El plan
-- vigente se DERIVA de las asignaciones con vigencia abierta; las cerradas se
-- quedan con sus fechas, su motivo y quién las hizo. Eso es historia de
-- negocio, no un registro de auditoría.
--
--
-- LA PRUEBA, AQUÍ
--
-- `grant_kind = 'trial'` con `ends_at`. Al vencer, la asignación deja de
-- participar en la resolución **por efecto del tiempo**: no hace falta ningún
-- proceso programado que baje a nadie de plan. Y la fila se queda: una prueba
-- que caducó es historia comercial, no basura.
-- ============================================================================

create table public.organization_plan_assignments (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete restrict,
  plan_revision_id uuid        not null references public.plan_revisions(id),

  scope            text        not null,
  module_code      text        references public.modules(code),

  grant_kind       text        not null,
  source           text        not null,

  starts_at        timestamptz not null default now(),
  ends_at          timestamptz,

  assigned_by      uuid references public.profiles(id),
  reason           text,
  created_at       timestamptz not null default now(),

  constraint opa_scope_check check (scope in ('organization', 'module')),
  -- El módulo se nombra EXACTAMENTE cuando el ámbito es de módulo.
  constraint opa_module_shape check ((scope = 'module') = (module_code is not null)),
  constraint opa_grant_kind_check
    check (grant_kind in ('base', 'trial', 'sold', 'courtesy')),
  constraint opa_source_check
    check (source in ('seed', 'migration', 'trial', 'manual', 'checkout', 'promotion')),
  constraint opa_period_order check (ends_at is null or ends_at > starts_at),
  -- Una prueba SIEMPRE tiene final. Una prueba sin fecha de fin es un plan.
  constraint opa_trial_has_end check (grant_kind <> 'trial' or ends_at is not null)
);

create index opa_org_idx    on public.organization_plan_assignments (organization_id, starts_at desc);
create index opa_module_idx on public.organization_plan_assignments (organization_id, module_code)
  where module_code is not null;

comment on table public.organization_plan_assignments is
  'PE-04B1 · Que tiene cada empresa y desde cuando. Apunta a una REVISION, no a un codigo: ahi esta la verdad historica. Sin columna de plan actual — el vigente se deriva, y las asignaciones cerradas se conservan.';

comment on column public.organization_plan_assignments.grant_kind is
  'PE-04B1 · base (el suelo permanente) | trial (concesion temporal, SIEMPRE con ends_at) | sold | courtesy. Una prueba vencida deja de aplicar sola, por efecto del tiempo: no hace falta ningun proceso programado.';


-- ============================================================================
-- 6 · LA POLÍTICA DE PRUEBA, COMO CONFIGURACIÓN
-- ----------------------------------------------------------------------------
-- Hoy las 48 horas están escritas DENTRO de
-- `provision_new_organization_modules`. Es el peor sitio posible para un
-- parámetro comercial: cambiarlo exige una migración y el propietario del
-- producto no puede tocarlo.
--
-- Aquí es una fila. B1 la siembra con lo que hay hoy —Full, 48 horas— y NO
-- cambia todavía la creación de empresas: eso es B2.
-- ============================================================================

create table public.commercial_trial_policy (
  id                   boolean     primary key default true,
  enabled              boolean     not null default true,
  trial_plan_code      text        not null references public.plans(code),
  trial_duration_hours integer     not null,
  updated_by           uuid references public.profiles(id),
  updated_at           timestamptz not null default now(),

  -- Fila única: una sola política, y el tipo lo garantiza.
  constraint ctp_singleton check (id),
  constraint ctp_duration_positive
    check (trial_duration_hours > 0 and trial_duration_hours <= 24 * 365)
);

comment on table public.commercial_trial_policy is
  'PE-04B1 · La duracion de la prueba, como CONFIGURACION. Hoy vive dentro de provision_new_organization_modules, donde cambiarla exige una migracion. Fila unica. B1 la siembra y NO cambia todavia la creacion de empresas.';


-- ============================================================================
-- 7 · LO QUE NO SE PUEDE CAMBIAR
-- ----------------------------------------------------------------------------
-- Una revisión publicada es inmutable. Lo dice un DISPARADOR y no una política,
-- por la razón de siempre en este repositorio: una política no detiene a
-- `service_role`, y un disparador sí.
--
-- Lo único que puede moverse en una publicada es su CIERRE: `effective_to` y el
-- paso a `retired`. Todo lo demás —precio, textos, fechas de inicio— queda
-- congelado en el momento de publicar.
-- ============================================================================

create or replace function public.plan_revision_is_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'draft' then
    return new;   -- un borrador se edita libremente: para eso es un borrador
  end if;

  if new.plan_code is distinct from old.plan_code
     or new.revision_number is distinct from old.revision_number
     or new.display_name is distinct from old.display_name
     or new.description is distinct from old.description
     or new.public_conditions is distinct from old.public_conditions
     or new.price_state is distinct from old.price_state
     or new.currency is distinct from old.currency
     or new.monthly_price_minor is distinct from old.monthly_price_minor
     or new.annual_price_minor is distinct from old.annual_price_minor
     or new.effective_from is distinct from old.effective_from
     or new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by then
    raise exception 'PLAN_REVISION_IMMUTABLE'
      using hint = 'Una revisión publicada no se edita: se publica otra. Lo contratado bajo esta debe seguir diciendo lo que decía.';
  end if;

  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'PLAN_REVISION_IMMUTABLE'
      using hint = 'Una revisión retirada no vuelve a vigencia. Se publica una nueva.';
  end if;

  return new;
end;
$$;

create trigger t_plan_revisions_immutable
  before update on public.plan_revisions
  for each row execute function public.plan_revision_is_immutable();

-- Y una publicada no se borra. Ni con `delete`, ni por error.
create or replace function public.plan_revision_no_delete_published()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'PLAN_REVISION_IMMUTABLE'
      using hint = 'Una revisión que se publicó forma parte de la historia comercial y no se borra.';
  end if;
  return old;
end;
$$;

create trigger t_plan_revisions_no_delete
  before delete on public.plan_revisions
  for each row execute function public.plan_revision_no_delete_published();

-- Los límites de una revisión publicada tampoco. Si se pudieran cambiar, la
-- inmutabilidad de la revisión no serviría de nada: el precio seguiría igual y
-- la promesa sería otra.
create or replace function public.plan_revision_limits_are_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from plan_revisions
   where id = coalesce(new.plan_revision_id, old.plan_revision_id);
  if v_status is distinct from 'draft' then
    raise exception 'PLAN_REVISION_IMMUTABLE'
      using hint = 'Los límites de una revisión publicada no se tocan: se publica otra revisión.';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger t_plan_revision_limits_immutable
  before insert or update or delete on public.plan_revision_limits
  for each row execute function public.plan_revision_limits_are_immutable();

-- Una asignación no se reescribe. Cerrarla es poner `ends_at`; lo demás es
-- historia y no cambia.
create or replace function public.plan_assignment_is_append_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.plan_revision_id is distinct from old.plan_revision_id
     or new.scope is distinct from old.scope
     or new.module_code is distinct from old.module_code
     or new.grant_kind is distinct from old.grant_kind
     or new.starts_at is distinct from old.starts_at then
    raise exception 'PLAN_ASSIGNMENT_APPEND_ONLY'
      using hint = 'Una asignación no se reescribe: se cierra con ends_at y se abre otra.';
  end if;

  -- Un periodo ya cerrado en el pasado no se reabre.
  if old.ends_at is not null and old.ends_at <= now()
     and (new.ends_at is null or new.ends_at is distinct from old.ends_at) then
    raise exception 'PLAN_ASSIGNMENT_APPEND_ONLY'
      using hint = 'Ese periodo ya terminó. Reabrirlo cambiaría lo que la empresa tuvo.';
  end if;

  return new;
end;
$$;

create trigger t_plan_assignments_append_only
  before update on public.organization_plan_assignments
  for each row execute function public.plan_assignment_is_append_only();


-- ============================================================================
-- 8 · PUBLICAR, POR LA VÍA CANÓNICA
-- ----------------------------------------------------------------------------
-- Publicar es cerrar la anterior, abrir esta y dejar constancia. Tres cosas en
-- una transacción. A mano habría que acertar las tres, hoy y cada vez — y es
-- exactamente lo que `legal_publish_document` enseñó a no hacer a mano.
-- ============================================================================

create or replace function public.plan_publish_revision(
  p_revision_id uuid,
  p_effective_from timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev   record;
  v_desde timestamptz := coalesce(p_effective_from, now());
  v_faltan integer;
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma publica revisiones comerciales.';
  end if;

  select * into v_rev from plan_revisions where id = p_revision_id;
  if v_rev.id is null then
    raise exception 'Esa revisión no existe.';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'Esa revisión ya se publicó.';
  end if;

  -- Una revisión sin límites es una promesa vacía: se publicaría un plan que no
  -- dice qué incluye. Se exige al menos el almacenamiento, que es el recurso
  -- que toda empresa consume.
  select count(*) into v_faltan
    from plan_revision_limits
   where plan_revision_id = p_revision_id and resource_code = 'storage_bytes';
  if v_faltan = 0 then
    raise exception 'Esa revisión no declara su almacenamiento.'
      using hint = 'Toda revisión publicada dice cuánto almacenamiento incluye.';
  end if;

  -- Se cierra la vigente. `now()` y no v_desde: el periodo anterior termina
  -- cuando de verdad deja de aplicar.
  update plan_revisions
     set effective_to = v_desde, status = 'retired'
   where plan_code = v_rev.plan_code
     and status = 'published' and effective_to is null;

  update plan_revisions
     set status = 'published',
         effective_from = v_desde,
         published_at = now(),
         published_by = auth.uid()
   where id = p_revision_id;

  return p_revision_id;
end;
$$;

comment on function public.plan_publish_revision(uuid, timestamptz) is
  'PE-04B1 · Cierra la vigente, abre esta y deja constancia, en UNA transaccion. Nadie escribe effective_to a mano.';

revoke all on function public.plan_publish_revision(uuid, timestamptz) from public, anon;
grant execute on function public.plan_publish_revision(uuid, timestamptz) to authenticated;


-- ============================================================================
-- 9 · EL RESOLUTOR
-- ----------------------------------------------------------------------------
-- Devuelve TRES respuestas, y esa es la diferencia con el de hoy:
--
--   found        hay asignación vigente. Aquí está el plan
--   absent       no hay ninguna. La empresa no tiene derecho a esto
--   unavailable  no se pudo determinar
--
-- La tercera existe porque el resolutor de hoy devuelve 'demo' ante cualquier
-- error: deniega bien y MIENTE sobre el plan. Un fallo de lectura no es
-- evidencia de que el cliente sea gratuito, y decírselo a un cliente que paga
-- es exactamente el defecto que PE-04A documentó en la consola.
--
-- Quien consuma esto debe DENEGAR ante `unavailable` igual que ante `absent`, y
-- NO enseñarlo como si fuera un plan.
--
--
-- LA PRECEDENCIA, EN UN SOLO SITIO
--
-- extra > full > free. Escrita una vez, aquí. No repartida en `case` por el
-- código, que es como dos sitios acaban discrepando.
--
--
-- LAS PRUEBAS VENCIDAS NO PARTICIPAN
--
-- Por el `where`, no por un proceso que baje a nadie de plan. El tiempo hace el
-- trabajo.
-- ============================================================================

create or replace function public.plan_rank(p_code text)
returns integer
language sql
immutable
as $$
  select case p_code when 'extra' then 3 when 'full' then 2 when 'free' then 1 else 0 end;
$$;

comment on function public.plan_rank(text) is
  'PE-04B1 · La precedencia comercial, escrita UNA vez: extra > full > free. Un codigo desconocido vale 0 y por tanto nunca gana.';


create or replace function public.plan_effective_for_module(
  p_organization_id uuid,
  p_module_code text,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_best record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    raise exception 'No autorizado para consultar el plan de esta empresa';
  end if;

  -- Cuenta la asignación del MÓDULO y también la de ámbito de empresa: una
  -- empresa con un plan general y un módulo comprado aparte tiene las dos, y
  -- gana la mejor.
  select a.id, r.plan_code, r.id as revision_id, a.grant_kind, a.ends_at, a.scope
    into v_best
    from organization_plan_assignments a
    join plan_revisions r on r.id = a.plan_revision_id
   where a.organization_id = p_organization_id
     and (a.scope = 'organization'
          or (a.scope = 'module' and a.module_code = p_module_code))
     and a.starts_at <= p_as_of
     and (a.ends_at is null or a.ends_at > p_as_of)
   order by plan_rank(r.plan_code) desc, a.starts_at desc
   limit 1;

  if v_best.revision_id is null then
    return jsonb_build_object('status', 'absent', 'module_code', p_module_code);
  end if;

  return jsonb_build_object(
    'status', 'found',
    'plan_code', v_best.plan_code,
    'plan_revision_id', v_best.revision_id,
    'grant_kind', v_best.grant_kind,
    'scope', v_best.scope,
    'module_code', p_module_code,
    'ends_at', v_best.ends_at
  );
end;
$$;

comment on function public.plan_effective_for_module(uuid, text, timestamptz) is
  'PE-04B1 · found | absent. NUNCA devuelve un plan por defecto ante un fallo: quien llama traduce el error a unavailable y DENIEGA, sin enseñarlo como plan.';


create or replace function public.plan_effective_for_organization(
  p_organization_id uuid,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_best record;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    raise exception 'No autorizado para consultar el plan de esta empresa';
  end if;

  -- SOLO módulos FUNCIONALES, y por una razón concreta: `core` nace en `full`
  -- para siempre en toda empresa, porque es infraestructura. Si contara, toda
  -- empresa del producto resolvería a Full comercialmente y el plan no
  -- significaría nada. `core` es acceso a la plataforma, no un módulo de pago.
  select r.plan_code, r.id as revision_id, a.grant_kind, a.ends_at
    into v_best
    from organization_plan_assignments a
    join plan_revisions r on r.id = a.plan_revision_id
    left join modules m on m.code = a.module_code
   where a.organization_id = p_organization_id
     and a.starts_at <= p_as_of
     and (a.ends_at is null or a.ends_at > p_as_of)
     and (a.scope = 'organization' or coalesce(m.is_functional, false))
   order by plan_rank(r.plan_code) desc, a.starts_at desc
   limit 1;

  if v_best.revision_id is null then
    return jsonb_build_object('status', 'absent');
  end if;

  return jsonb_build_object(
    'status', 'found',
    'plan_code', v_best.plan_code,
    'plan_revision_id', v_best.revision_id,
    'grant_kind', v_best.grant_kind,
    'ends_at', v_best.ends_at
  );
end;
$$;

comment on function public.plan_effective_for_organization(uuid, timestamptz) is
  'PE-04B1 · Nivel de empresa, para los recursos que son de la empresa (almacenamiento, IA). Excluye los modulos NO funcionales: `core` nace en full para siempre y contarlo haria que toda empresa resolviera a Full.';


create or replace function public.plan_limit_for_revision(
  p_plan_revision_id uuid,
  p_resource_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  select limit_state, limit_value into v_row
    from plan_revision_limits
   where plan_revision_id = p_plan_revision_id and resource_code = p_resource_code;

  if v_row.limit_state is null then
    -- La revisión no declara nada de este recurso. NO es «ilimitado»: es que
    -- nadie lo ha decidido, y quien lo lea debe negar.
    return jsonb_build_object('status', 'not_configured', 'resource_code', p_resource_code);
  end if;

  return jsonb_build_object(
    'status', v_row.limit_state,
    'resource_code', p_resource_code,
    'value', v_row.limit_value
  );
end;
$$;

comment on function public.plan_limit_for_revision(uuid, text) is
  'PE-04B1 · finite | unlimited | not_configured. Un recurso que la revision no declara sale como not_configured, jamas como unlimited.';

revoke all on function public.plan_effective_for_module(uuid, text, timestamptz) from public, anon;
revoke all on function public.plan_effective_for_organization(uuid, timestamptz) from public, anon;
revoke all on function public.plan_limit_for_revision(uuid, text) from public, anon;
grant execute on function public.plan_effective_for_module(uuid, text, timestamptz) to authenticated;
grant execute on function public.plan_effective_for_organization(uuid, timestamptz) to authenticated;
grant execute on function public.plan_limit_for_revision(uuid, text) to authenticated;


-- ============================================================================
-- 10 · LA PROYECCIÓN PÚBLICA
-- ----------------------------------------------------------------------------
-- PE-05 va a enseñar precios en una página pública. Lo que se puede enseñar se
-- decide AQUÍ, con una vista, y no en un componente: «no lo pintamos» es una
-- decisión de pantalla, y PostgREST expone la tabla igualmente.
--
-- Fuera quedan: las notas internas, los borradores y todo lo que no esté
-- publicado. Y los recursos marcados como no públicos.
-- ============================================================================

create view public.v_public_plan_catalog
with (security_invoker = true)
as
select
  p.code            as plan_code,
  p.display_order,
  r.id              as plan_revision_id,
  r.display_name,
  r.description,
  r.public_conditions,
  r.price_state,
  r.currency,
  r.monthly_price_minor,
  r.annual_price_minor,
  r.effective_from
from public.plans p
join public.plan_revisions r
  on r.plan_code = p.code and r.status = 'published' and r.effective_to is null
where p.status = 'active';

comment on view public.v_public_plan_catalog is
  'PE-04B1 · Lo unico que PE-05 puede enseñar en publico. Sin internal_notes, sin borradores, sin revisiones retiradas. Los precios son SIN IMPUESTOS.';

create view public.v_public_plan_limits
with (security_invoker = true)
as
select
  r.plan_code,
  l.plan_revision_id,
  l.resource_code,
  res.label      as resource_label,
  res.unit,
  l.limit_state,
  l.limit_value
from public.plan_revision_limits l
join public.plan_revisions r
  on r.id = l.plan_revision_id and r.status = 'published' and r.effective_to is null
join public.plan_resources res on res.code = l.resource_code
where res.is_public;

comment on view public.v_public_plan_limits is
  'PE-04B1 · Los limites que se le pueden enseñar a un cliente. Los marcados is_public = false no salen.';


-- ============================================================================
-- 11 · QUIÉN LEE Y QUIÉN ESCRIBE
-- ----------------------------------------------------------------------------
-- El catálogo es de plataforma y se puede leer publicado. Los borradores y las
-- notas internas, solo personal de plataforma. La asignación es DE UNA EMPRESA
-- y no se cruza entre empresas por mucho que el plan sea compartido.
--
-- Escribir el catálogo: solo superadministrador. Ni `support`, ni el
-- administrador de una empresa. Y lo dice la base, no una pantalla.
-- ============================================================================

alter table public.plans                          enable row level security;
alter table public.plan_revisions                 enable row level security;
alter table public.plan_resources                 enable row level security;
alter table public.plan_revision_limits           enable row level security;
alter table public.organization_plan_assignments  enable row level security;
alter table public.commercial_trial_policy        enable row level security;

-- --- Identidad y vocabulario: legibles con sesión ---------------------------
create policy plans_select on public.plans
  for select to authenticated using (true);
create policy plans_write on public.plans
  for all to authenticated
  using (is_platform_superadmin()) with check (is_platform_superadmin());

create policy plan_resources_select on public.plan_resources
  for select to authenticated using (true);
create policy plan_resources_write on public.plan_resources
  for all to authenticated
  using (is_platform_superadmin()) with check (is_platform_superadmin());

-- --- Revisiones: publicadas para todos, borradores solo plataforma ---------
create policy plan_revisions_select on public.plan_revisions
  for select to authenticated
  using (status <> 'draft' or is_platform_staff());
create policy plan_revisions_write on public.plan_revisions
  for all to authenticated
  using (is_platform_superadmin()) with check (is_platform_superadmin());

create policy plan_revision_limits_select on public.plan_revision_limits
  for select to authenticated
  using (
    is_platform_staff()
    or exists (select 1 from public.plan_revisions r
                where r.id = plan_revision_id and r.status <> 'draft')
  );
create policy plan_revision_limits_write on public.plan_revision_limits
  for all to authenticated
  using (is_platform_superadmin()) with check (is_platform_superadmin());

-- --- Asignaciones: cada empresa la suya ------------------------------------
create policy opa_select on public.organization_plan_assignments
  for select to authenticated
  using (is_org_member(organization_id) or is_platform_staff());
create policy opa_write on public.organization_plan_assignments
  for all to authenticated
  using (is_platform_superadmin()) with check (is_platform_superadmin());

-- --- La política de prueba --------------------------------------------------
create policy ctp_select on public.commercial_trial_policy
  for select to authenticated using (true);
create policy ctp_write on public.commercial_trial_policy
  for all to authenticated
  using (is_platform_superadmin()) with check (is_platform_superadmin());

revoke all on public.plans, public.plan_revisions, public.plan_resources,
              public.plan_revision_limits, public.organization_plan_assignments,
              public.commercial_trial_policy
  from public, anon;
grant select on public.plans, public.plan_revisions, public.plan_resources,
                public.plan_revision_limits, public.organization_plan_assignments,
                public.commercial_trial_policy
  to authenticated;
grant insert, update, delete on public.plans, public.plan_revisions,
                public.plan_resources, public.plan_revision_limits,
                public.organization_plan_assignments, public.commercial_trial_policy
  to authenticated;

revoke all on public.v_public_plan_catalog, public.v_public_plan_limits from public, anon;
grant select on public.v_public_plan_catalog, public.v_public_plan_limits to authenticated;


-- ============================================================================
-- 12 · LA SIEMBRA
-- ----------------------------------------------------------------------------
-- Los valores NO se inventan: se copian del catálogo que ya existe, byte a
-- byte, con una subconsulta que los lee. Escribirlos a mano desde las etiquetas
-- («50 MB») sería recalcular, y recalcular es como se cambia un número sin
-- querer.
--
--   free  ← los límites del `demo` de hoy, que son los que ya se aplican
--   full  ← los del `full` de hoy
--   extra ← los del `extra` de hoy
--
-- Son semillas SEGURAS PARA MIGRAR, no promesas comerciales para siempre: el
-- propietario del producto las editará publicando revisiones.
--
-- IDEMPOTENTE, y con un cuidado que costó descubrir: los límites se insertan
-- con `where not exists`, NO solo con `on conflict do nothing`.
--
-- La diferencia importa. `on conflict` resuelve el conflicto DESPUÉS de que se
-- hayan ejecutado los disparadores BEFORE INSERT, así que una segunda pasada
-- sobre una revisión ya publicada choca contra el disparador de inmutabilidad
-- —correctamente, porque desde su punto de vista alguien está tocando los
-- límites de algo publicado— y aborta. Con `where not exists` la fila
-- duplicada ni siquiera se intenta.
--
-- Comprobado ejecutando la siembra dos veces.
-- ============================================================================

insert into public.plans (code, status, display_order) values
  ('free',  'active', 10),
  ('full',  'active', 20),
  ('extra', 'active', 30)
on conflict (code) do nothing;

-- --- Las tres revisiones número 1, en borrador -----------------------------
insert into public.plan_revisions (
  plan_code, revision_number, status, display_name, description,
  price_state, currency, monthly_price_minor, annual_price_minor, internal_notes)
values
  ('free', 1, 'draft', 'Free',
   'Plan permanente sin coste. Incluye la ayuda, las preguntas frecuentes y los vídeos tutoriales, como todos los planes.',
   'configured', 'USD', 0, 0,
   'PE-04B1 · Límites copiados del plan «demo» legacy: son los que el producto ya aplica hoy. Semilla segura para migrar, no promesa comercial.'),
  ('full', 1, 'draft', 'Full',
   'Producto completo según los módulos contratados, con la ayuda y los tutoriales incluidos.',
   'configured', 'USD', 4000, 40000,
   'PE-04B1 · USD 40 al mes y USD 400 al año, ANTES de impuestos. El anual equivale a dos meses gratis. El impuesto lo calcula PE-05.'),
  ('extra', 1, 'draft', 'Extra',
   'Como Full, con más almacenamiento y acompañamiento funcional.',
   'not_configured', null, null, null,
   'PE-04B1 · SIN PRECIO a propósito: el propietario del producto no lo ha decidido. not_configured NO es gratis.')
on conflict (plan_code, revision_number) do nothing;

-- --- Los límites, COPIADOS del catálogo de hoy ------------------------------
-- El mapa dice de qué plan legacy sale cada uno. `free` bebe de `demo` porque
-- son los límites que el producto aplica hoy a una empresa sin nada contratado.
insert into public.plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
select r.id,
       pl.resource_code,
       case when pl.is_unlimited then 'unlimited' else 'finite' end,
       case when pl.is_unlimited then null else pl.limit_value end
  from public.plan_revisions r
  join (values ('free', 'demo'), ('full', 'full'), ('extra', 'extra'))
         as mapa(nuevo, legacy) on mapa.nuevo = r.plan_code
  join public.plan_limits pl on pl.plan_code = mapa.legacy
  join public.plan_resources res on res.code = pl.resource_code
 where r.revision_number = 1
   and not exists (select 1 from public.plan_revision_limits x
                    where x.plan_revision_id = r.id and x.resource_code = pl.resource_code);

-- --- Soporte · congelado por el propietario del producto -------------------
-- Reportar que el producto falla: TODOS los planes, Free incluido. Un fallo que
-- nadie puede reportar es un fallo que no se arregla.
-- Acompañamiento funcional: solo Extra.
insert into public.plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
select r.id, 'technical_report_enabled', 'finite', 1
  from public.plan_revisions r
 where r.revision_number = 1
   and not exists (select 1 from public.plan_revision_limits x
                    where x.plan_revision_id = r.id
                      and x.resource_code = 'technical_report_enabled');

insert into public.plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
select r.id, 'functional_support_enabled', 'finite',
       case when r.plan_code = 'extra' then 1 else 0 end
  from public.plan_revisions r
 where r.revision_number = 1
   and not exists (select 1 from public.plan_revision_limits x
                    where x.plan_revision_id = r.id
                      and x.resource_code = 'functional_support_enabled');

-- --- IA y uso diario · SIN CONFIGURAR --------------------------------------
-- El propietario del producto congeló que Free incluirá algo de IA y NO congeló
-- cuánto. Y hoy hay dos motores de límites de IA con dos techos mensuales
-- distintos que nadie concilia: ponerle un número al plan antes de reconciliar
-- eso sería añadir un tercero.
--
-- `not_configured` es la única respuesta honesta, y NO concede nada: quien la
-- lea debe negar, no regalar.
insert into public.plan_revision_limits (plan_revision_id, resource_code, limit_state, limit_value)
select r.id, res.code, 'not_configured', null
  from public.plan_revisions r
  cross join (values ('ai_runs_per_month'), ('daily_metered_operations')) as res(code)
 where r.revision_number = 1
   and not exists (select 1 from public.plan_revision_limits x
                    where x.plan_revision_id = r.id and x.resource_code = res.code);

-- --- Publicar las tres, sin pasar por la función ---------------------------
-- `plan_publish_revision` exige `is_platform_superadmin()` y aquí no hay sesión:
-- una migración no tiene `auth.uid()`. Se publica con el mismo efecto y se
-- anota que fue la migración quien lo hizo — `published_by` queda nulo porque
-- no hubo ninguna persona, y eso es más honesto que atribuírselo a alguien.
update public.plan_revisions
   set status = 'published', effective_from = now(), published_at = now()
 where revision_number = 1
   and status = 'draft'
   and not exists (
     select 1 from public.plan_revisions otra
      where otra.plan_code = plan_revisions.plan_code
        and otra.status = 'published' and otra.effective_to is null
   );

-- --- La política de prueba, con lo que hay hoy -----------------------------
-- Full durante 48 horas: exactamente lo que hace hoy
-- `provision_new_organization_modules`, sacado de dentro de la función.
insert into public.commercial_trial_policy (id, enabled, trial_plan_code, trial_duration_hours)
values (true, true, 'full', 48)
on conflict (id) do nothing;
