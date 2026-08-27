-- ============================================================================
-- QUALITY-12.2B · QUÉ HACE ESTA EMPRESA, Y CÓMO SE REDACTA EN QUALITY
-- ----------------------------------------------------------------------------
-- Añade. No toca la 0136 ni ninguna anterior.
--
-- DOS COSAS QUE NO TIENEN QUE VER ENTRE SÍ, Y VAN JUNTAS POR UNA RAZÓN
--
--   1 · EL PERFIL DE LA EMPRESA. Hoy Trazaloop sabe cómo se llama una empresa,
--       su NIT y su ciudad. No sabe a qué se dedica. Cuatro campos lo arreglan.
--
--   2 · LA GUÍA DE AUTORÍA DE QUALITY. Sus documentos no nacen de una
--       estructura, así que el botón «i» les llegaba en null. QUALITY-12.2A
--       dejó preparado el alcance por PAPEL de sección; aquí se usa.
--
-- Van juntas porque las dos construyen lo mismo: el contexto que hará falta
-- para ayudar a redactar sin inventar cómo funciona una organización. Y porque
-- las dos tienen que respetar la misma frontera:
--
--   LA GUÍA DICE QUÉ DEBERÍA CONTENER UNA SECCIÓN.
--   EL PERFIL DICE A QUÉ SE DEDICA LA EMPRESA.
--   NINGUNO DE LOS DOS DICE QUÉ HACE LA EMPRESA EN SUS PROCESOS.
--
-- Que el perfil diga «fabricante de envases» no autoriza a afirmar nada sobre
-- sus controles, sus responsables ni sus frecuencias. El perfil es contexto de
-- ESTILO —para hablar en el vocabulario de quien lee—, no evidencia.
--
-- LO QUE ESTA MIGRACIÓN NO HACE
--
-- No llama a ningún proveedor de IA. No rellena el perfil de ninguna empresa
-- existente: quedan vacíos y la aplicación funciona igual. No inventa
-- actividades, sectores ni productos a partir de otros datos.
-- ============================================================================


-- ============================================================================
-- 1 · EL CATÁLOGO DE SECTORES
-- ----------------------------------------------------------------------------
-- Texto libre habría sido más rápido y peor: «Manufactura», «manufactura»,
-- «Industria manufacturera» y «Fabricación» son cuatro filas distintas para lo
-- mismo, y ninguna sirve para agrupar ni para hablar con vocabulario estable.
--
-- No es una clasificación económica oficial y no pretende serlo. Es contexto
-- de autoría: lo justo para que una guía sepa si está ayudando a redactar en
-- una planta de alimentos o en una empresa de software.
--
-- Mismo patrón que `quality_process_categories`: código estable, nombre,
-- orden y activación. Global, sin dueño.
-- ============================================================================

create table public.organization_sectors (
  code        text primary key,
  name        text not null,
  description text,
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint organization_sectors_code_check
    check (code = lower(btrim(code)) and length(code) between 2 and 40)
);

comment on table public.organization_sectors is
  'QUALITY-12.2B · Sectores para el perfil de una empresa. Contexto de autoria, no clasificacion economica oficial. Global y de solo lectura para las empresas.';

insert into public.organization_sectors (code, name, description, sort_order) values
  ('manufacturing',  'Manufactura',            'Transformación de materias primas en productos terminados.', 10),
  ('food',           'Alimentos y bebidas',    'Producción, transformación o envasado de alimentos y bebidas.', 20),
  ('textile',        'Textil y confección',    'Hilatura, tejeduría, confección, acabados y comercialización textil.', 30),
  ('plastics',       'Plásticos y caucho',     'Transformación de polímeros, incluido el aprovechamiento de material reciclado.', 40),
  ('chemical',       'Química y farmacéutica', 'Formulación y producción de productos químicos, cosméticos o farmacéuticos.', 50),
  ('metal',          'Metalmecánica',          'Trabajo de metales, estructuras, piezas y ensambles.', 60),
  ('construction',   'Construcción',           'Obra civil, edificación, montaje e infraestructura.', 70),
  ('agriculture',    'Agropecuario',           'Producción agrícola, pecuaria, acuícola o forestal.', 80),
  ('energy',         'Energía y servicios públicos', 'Generación, distribución o comercialización de energía, agua o gas.', 90),
  ('logistics',      'Transporte y logística', 'Transporte, almacenamiento, distribución y operación logística.', 100),
  ('retail',         'Comercio',               'Compra y venta de bienes al por mayor o al detal.', 110),
  ('services',       'Servicios profesionales', 'Consultoría, ingeniería, contabilidad, legal y servicios a empresas.', 120),
  ('technology',     'Tecnología',             'Desarrollo de software, servicios informáticos y telecomunicaciones.', 130),
  ('health',         'Salud',                  'Prestación de servicios de salud, laboratorios y dispositivos médicos.', 140),
  ('education',      'Educación',              'Formación, capacitación e instituciones educativas.', 150),
  ('hospitality',    'Hotelería y turismo',    'Alojamiento, alimentación fuera del hogar, turismo y eventos.', 160),
  ('waste',          'Gestión de residuos y reciclaje', 'Recolección, aprovechamiento, valorización y disposición de residuos.', 170),
  ('public',         'Sector público',         'Entidades estatales, territoriales y organismos públicos.', 180),
  ('nonprofit',      'Organizaciones sin ánimo de lucro', 'Fundaciones, asociaciones, cooperativas y gremios.', 190),
  ('other',          'Otro',                   'Ninguno de los anteriores. Descríbelo en la actividad principal.', 900)
on conflict (code) do nothing;

alter table public.organization_sectors enable row level security;
create policy organization_sectors_select on public.organization_sectors
  for select to authenticated using (true);
revoke all on table public.organization_sectors from anon, authenticated;
grant select on table public.organization_sectors to authenticated;


-- ============================================================================
-- 2 · EL PERFIL, EN LA PROPIA EMPRESA
-- ----------------------------------------------------------------------------
-- Cuatro columnas en `organizations`, no una tabla aparte.
--
-- La relación sería 1:1 y siempre existiría, así que una tabla anexa habría
-- añadido una unión, una RLS nueva y un caso «no tiene fila» que no significa
-- nada distinto de «tiene fila vacía». `organizations` ya tiene la política
-- correcta: la lee cualquier miembro, la edita quien administra.
--
-- LAS LONGITUDES NO SON DECORATIVAS
--
-- Este perfil está pensado para caber en un contexto de IA junto al texto que
-- se está redactando. Un campo sin tope convierte «contexto compacto» en una
-- promesa incumplible, así que el tope está en la BASE y no solo en el
-- formulario.
--
-- Los números no son redondos por casualidad: son los que hacen que el perfil
-- MÁS LARGO POSIBLE —los cinco campos a tope a la vez— siga cabiendo en el
-- presupuesto de doscientos sesenta tokens. Un perfil típico bien diligenciado
-- ronda los ciento diez. La primera versión ponía 320 en la descripción y el
-- máximo se iba a 267: cabía «casi», que en un presupuesto es lo mismo que no
-- caber.
-- ============================================================================

-- ¿Es una lista de productos usable como contexto? Nula, o de uno a seis
-- elementos con algo escrito y sin párrafos dentro.
create or replace function public.organization_products_services_ok(p text[])
returns boolean
language sql
immutable
as $$
  select p is null
      or (
        array_length(p, 1) between 1 and 6
        and not exists (
          select 1 from unnest(p) as x
           where x is null or length(btrim(x)) < 2 or length(btrim(x)) > 50
        )
      );
$$;

alter table public.organizations
  add column if not exists sector_code text references public.organization_sectors (code),
  add column if not exists primary_activity text,
  add column if not exists products_services text[],
  add column if not exists organization_description text;

comment on column public.organizations.sector_code is
  'QUALITY-12.2B · A que se dedica la empresa, del catalogo organization_sectors. Contexto de autoria.';
comment on column public.organizations.primary_activity is
  'QUALITY-12.2B · Una linea: que hace esta empresa. Ej: «Fabricacion de envases plasticos a partir de resina reciclada».';
comment on column public.organizations.products_services is
  'QUALITY-12.2B · Hasta seis productos o servicios principales, cortos. No es un catalogo de productos: es vocabulario para redactar.';
comment on column public.organizations.organization_description is
  'QUALITY-12.2B · Parrafo breve. Contexto de ESTILO, nunca evidencia: describir a que se dedica una empresa no dice nada sobre sus procesos, controles ni responsables.';

alter table public.organizations
  add constraint organizations_primary_activity_len
    check (primary_activity is null or length(btrim(primary_activity)) between 3 and 160),
  add constraint organizations_description_len
    check (organization_description is null or length(btrim(organization_description)) between 10 and 280),
  -- Seis elementos como mucho, de cincuenta caracteres como mucho, sin vacíos.
  -- Una lista de treinta productos no es contexto: es un catálogo, y para eso
  -- hay otras pantallas.
  --
  -- La comprobación por elemento vive en una función porque una restricción
  -- CHECK no admite subconsultas —ni siquiera sobre su propia fila—.
  add constraint organizations_products_services_shape
    check (public.organization_products_services_ok(products_services));


-- ----------------------------------------------------------------------------
-- El perfil compacto, calculado en la base
-- ----------------------------------------------------------------------------
-- Devuelve SOLO lo que sirve para redactar. Ni identificadores internos, ni
-- fechas técnicas, ni facturación, ni almacenamiento, ni miembros, ni planes.
-- Un perfil a medio llenar devuelve lo que tenga: parcial es un estado
-- legítimo, y muy común el primer día.
-- ----------------------------------------------------------------------------
create or replace function public.organization_authoring_context(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_org record; v_sector text;
begin
  if not (is_org_member(p_organization_id) or is_platform_staff()) then
    raise exception 'No perteneces a esta empresa.';
  end if;

  select o.name, o.sector_code, o.primary_activity, o.products_services,
         o.organization_description
    into v_org
    from organizations o where o.id = p_organization_id;
  if v_org.name is null then raise exception 'Esa empresa no existe.'; end if;

  select s.name into v_sector from organization_sectors s where s.code = v_org.sector_code;

  return jsonb_strip_nulls(jsonb_build_object(
    'organization_name', v_org.name,
    'sector', v_sector,
    'primary_activity', nullif(btrim(coalesce(v_org.primary_activity, '')), ''),
    'products_services', case
      when v_org.products_services is null or array_length(v_org.products_services, 1) is null
        then null else to_jsonb(v_org.products_services) end,
    'description', nullif(btrim(coalesce(v_org.organization_description, '')), '')
  ));
end;
$$;
revoke all on function public.organization_authoring_context(uuid) from public, anon;
grant execute on function public.organization_authoring_context(uuid) to authenticated;

comment on function public.organization_authoring_context(uuid) is
  'QUALITY-12.2B · El perfil compacto de una empresa para ayudar a redactar. Solo lo que sirve: nombre, sector, actividad, productos y descripcion. Es contexto de ESTILO, nunca evidencia de lo que la empresa hace en sus procesos.';


-- ============================================================================
-- 3 · QUÉ CONTEXTO PIDE UNA GUÍA · taxonomía cerrada
-- ----------------------------------------------------------------------------
-- QUALITY-12.2A dejó `related_context_types` como un `text[]` sin validar,
-- porque todavía no había nada que lo consumiera. Ahora que se va a rellenar,
-- una lista abierta se llenaría de sinónimos —`position`, `positions`, `cargo`,
-- `role`— y en 12.2D habría que adivinar cuál significa qué.
--
-- La lista es corta a propósito: nombra FAMILIAS de fuente, no tablas.
-- ============================================================================

alter table public.trazadoc_authoring_guidance_revisions
  add constraint trazadoc_guidance_related_context_check
  check (related_context_types <@ array[
    'organization_profile',  -- a qué se dedica la empresa
    'process',               -- procesos del sistema de gestión
    'position',              -- cargos y responsabilidades
    'document',              -- otros documentos y sus revisiones
    'risk',                  -- riesgos y oportunidades
    'control',               -- controles
    'indicator',             -- indicadores y sus mediciones
    'objective',             -- objetivos
    'supplier',              -- proveedores y su evaluación
    'customer_feedback',     -- voz del cliente
    'evidence',              -- evidencias y soportes
    'case'                   -- casos, no conformidades y acciones
  ]::text[]);


-- ============================================================================
-- 4 · LA GUÍA DE AUTORÍA DE QUALITY
-- ----------------------------------------------------------------------------
-- Cinco papeles, ni uno más. Son EXACTAMENTE los que el producto crea al abrir
-- un documento controlado de Quality (`DEFAULT_SECTIONS`): objetivo, alcance,
-- responsabilidades, desarrollo y registros.
--
-- Las secciones que una empresa añade a mano no son papeles: son suyas, con el
-- título que ella eligió, y no hay guía genérica que pueda ayudarlas sin
-- inventar de qué tratan. No tener guía ahí es la respuesta correcta.
--
-- CÓMO ESTÁN ESCRITAS
--
-- Neutrales respecto al sector, breves y de autoría: dicen qué debería
-- contener la sección, no qué contiene la de esta empresa. Ninguna cita una
-- cláusula de ninguna norma, y no hace falta: orientar la redacción de un
-- «Objetivo» no requiere invocar ISO 9001, y hacerlo habría convertido una
-- ayuda editorial en una insinuación de conformidad.
-- ============================================================================

do $$
declare
  v_id  uuid;
  v_fila record;
begin
  for v_fila in
    select * from (values
      ('purpose', 'objetivo',
       'Dejar claro para qué existe el documento y qué se espera conseguir al aplicarlo.',
       'Explica qué busca lograr este documento y sobre qué asunto de la organización actúa. Una o dos frases bastan: el detalle va en el desarrollo.',
       'No atribuir a la organización metas, compromisos ni resultados que no haya definido.',
       array['organization_profile', 'process']),

      ('scope', 'alcance',
       'Delimitar a qué y a quién aplica el documento, y qué queda fuera.',
       'Indica a qué actividades, áreas, sedes o productos aplica, y di también qué NO cubre. Un alcance que no excluye nada suele estar sin decidir.',
       'No dar por incluidas sedes, líneas, procesos ni actividades que la organización no haya declarado.',
       array['organization_profile', 'process', 'document']),

      ('responsibilities', 'responsabilidades',
       'Dejar claro quién hace qué dentro de lo que el documento describe.',
       'Nombra los cargos —no las personas— y di qué le corresponde a cada uno: quién ejecuta, quién revisa, quién decide. Si un cargo no existe en la organización, primero se crea.',
       'No inventar responsables, cargos ni atribuciones. Si no está definido quién lo hace, se dice que falta definirlo.',
       array['position', 'process']),

      ('development', 'desarrollo',
       'Describir cómo se hace lo que el documento regula, en el orden en que ocurre.',
       'Cuenta la secuencia real: qué se hace, en qué orden y con qué se decide continuar. Escribe lo que la organización hace hoy, no lo que debería hacer algún día.',
       'No inventar pasos, frecuencias, criterios de aceptación, métodos ni herramientas que la organización no use.',
       array['process', 'control', 'indicator', 'risk']),

      ('records', 'registros',
       'Enumerar qué queda como huella de que esto se hizo, y dónde vive.',
       'Lista los registros que deja esta actividad, dónde se guardan y cuánto tiempo se conservan. Un registro que nadie sabe dónde está no sirve como evidencia.',
       'No inventar registros, formatos, tiempos de conservación ni ubicaciones que no existan.',
       array['document', 'evidence'])
    ) as t(section_key, etiqueta, purpose, guidance, do_not_invent, contexto)
  loop
    insert into trazadoc_authoring_guidance
      (scope, module_key, blueprint_code, section_key, blueprint_section_id, status)
    values ('section_role', 'quality', null, v_fila.section_key, null, 'active')
    on conflict do nothing
    returning id into v_id;

    if v_id is null then
      select id into v_id from trazadoc_authoring_guidance
       where scope = 'section_role' and module_key = 'quality'
         and section_key = v_fila.section_key;
    end if;

    insert into trazadoc_authoring_guidance_revisions
      (guidance_id, revision_number, guidance, purpose, do_not_invent,
       related_context_types, normative_class, content_hash, effective_from, change_note)
    select v_id, 1, v_fila.guidance, v_fila.purpose, v_fila.do_not_invent,
           v_fila.contexto, 'safe',
           encode(sha256(convert_to(v_fila.guidance || E'\n' || v_fila.purpose || E'\n'
                  || '' || E'\n' || v_fila.do_not_invent, 'UTF8')), 'hex'),
           now(),
           'QUALITY-12.2B · Guía de autoría para los papeles de sección de Quality.'
     where not exists (
       select 1 from trazadoc_authoring_guidance_revisions where guidance_id = v_id);
  end loop;
end $$;


-- ============================================================================
-- 5 · LA BARRERA, DONDE EL PAPEL DE LA SECCIÓN LA PIDE
-- ----------------------------------------------------------------------------
-- QUALITY-12.2A trasladó los 250 hints con `do_not_invent` vacío salvo en los
-- que citaban una norma. Rellenarlo entonces habría sido inventar.
--
-- Ahora sí hay base para algunos: el PAPEL de la sección dice qué se puede
-- rellenar de más. Una sección de «responsables» invita a poner un cargo que
-- nadie ha definido; una de «registros», a listar formatos que no existen. Eso
-- se deriva de la clave de la sección, no de una opinión sobre el texto.
--
-- Solo los papeles con una trampa clara y una única lectura. Los demás se
-- quedan como están: repetir el mismo párrafo burocrático en 250 filas no
-- protege de nada y enseña a ignorarlo.
--
-- Cada enriquecimiento es una REVISIÓN NUEVA. La anterior queda cerrada y
-- consultable, como manda QUALITY-12.2A.
-- ============================================================================

do $$
declare
  v_fila   record;
  v_nuevo  uuid;
  v_numero integer;
  v_ahora  timestamptz := now();
begin
  for v_fila in
    select g.id as guidance_id, r.id as rev_id, r.guidance, r.purpose, r.example,
           r.normative_class, r.revision_number, m.barrera, m.contexto
      from trazadoc_authoring_guidance g
      join trazadoc_authoring_guidance_revisions r
        on r.guidance_id = g.id and r.effective_to is null
      join (values
        ('responsables',
         'No inventar responsables ni cargos: si no está definido quién lo hace, dilo en lugar de suponerlo.',
         array['position', 'process']),
        ('responsabilidades',
         'No inventar responsables ni cargos: si no está definido quién lo hace, dilo en lugar de suponerlo.',
         array['position', 'process']),
        ('registros',
         'No inventar registros, formatos ni tiempos de conservación que no existan.',
         array['document', 'evidence']),
        ('registros_asociados',
         'No inventar registros, formatos ni tiempos de conservación que no existan.',
         array['document', 'evidence']),
        ('evidencias',
         'No dar por aceptada una evidencia que la organización no haya definido como válida.',
         array['evidence', 'document']),
        ('evidencias_requeridas',
         'No dar por aceptada una evidencia que la organización no haya definido como válida.',
         array['evidence', 'document']),
        ('definiciones',
         'No atribuir a la organización definiciones propias que no haya adoptado.',
         array['document']),
        ('alcance',
         'No dar por incluidas sedes, líneas, procesos ni productos que la organización no haya declarado.',
         array['organization_profile', 'process']),
        ('objetivo',
         'No atribuir a la organización metas ni compromisos que no haya definido.',
         array['organization_profile', 'process'])
      ) as m(clave, barrera, contexto) on m.clave = g.section_key
     where g.scope = 'blueprint_section'
       and r.do_not_invent is null
  loop
    -- Cerrar la vigente antes de abrir la siguiente: solo puede haber una
    -- abierta por guía, y su índice único no se puede diferir.
    update trazadoc_authoring_guidance_revisions
       set effective_to = v_ahora where id = v_fila.rev_id;

    v_numero := v_fila.revision_number + 1;

    insert into trazadoc_authoring_guidance_revisions
      (guidance_id, revision_number, guidance, purpose, example, do_not_invent,
       related_context_types, normative_class, content_hash, effective_from, change_note)
    values (
      v_fila.guidance_id, v_numero, v_fila.guidance, v_fila.purpose, v_fila.example,
      v_fila.barrera, v_fila.contexto, v_fila.normative_class,
      encode(sha256(convert_to(v_fila.guidance || E'\n' || coalesce(v_fila.purpose, '')
             || E'\n' || coalesce(v_fila.example, '') || E'\n' || v_fila.barrera, 'UTF8')), 'hex'),
      v_ahora,
      'QUALITY-12.2B · Se añade qué no se puede inventar en este papel de sección, y qué contexto pediría revisarlo.')
    returning id into v_nuevo;

    update trazadoc_authoring_guidance_revisions
       set superseded_by_revision_id = v_nuevo where id = v_fila.rev_id;
  end loop;
end $$;
