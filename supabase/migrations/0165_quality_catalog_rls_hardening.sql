-- ===========================================================================
-- 0165 · INCIDENTE DE SEGURIDAD · RLS EN LOS CATÁLOGOS DE QUALITY
-- ---------------------------------------------------------------------------
-- EL HALLAZGO
--
-- El Security Advisor de Supabase reportó `rls_disabled_in_public` en Staging.
-- Reproducido en local: hay SIETE tablas base de `public` con RLS desactivado.
-- Las siete son catálogos globales del producto sembrados por migración; en
-- ninguna hay `organization_id`, así que NO hay datos de cliente expuestos y no
-- hay lectura cruzada entre empresas.
--
-- LA EXPOSICIÓN REAL, MEDIDA Y NO SUPUESTA
--
-- `anon` no tiene NINGÚN privilegio sobre ellas: sin sesión, la lectura ya se
-- deniega. `authenticated` tiene SELECT y nada más —ni INSERT, ni UPDATE, ni
-- DELETE—. De modo que el riesgo demostrado es exactamente uno:
--
--   CUALQUIER cuenta autenticada —comprobado con una recién creada, sin empresa
--   y sin rol— podía leer las 26 + 25 + 21 + 26 + 97 + 22 + 15 filas de estos
--   siete catálogos.
--
-- No es el escenario que sugiere el correo genérico del proveedor («anon puede
-- editar o borrar»), y decirlo así habría sido exagerar el incidente. Tampoco
-- es aceptable: seis de las siete son catálogos que el producto sí enseña a
-- quien usa Quality, pero la séptima describe el diseño interno de las fuentes
-- de Intelligence y no la consume ninguna pantalla.
--
-- EL PRINCIPIO QUE SE APLICA
--
-- Cero tablas base de `public` con RLS desactivado. Sin excepciones silenciosas.
-- Una tabla global de solo lectura también lleva `enable row level security` y
-- una política explícita: la diferencia entre «todos pueden leer esto» y «nadie
-- ha configurado nada» tiene que estar escrita, no deducirse de una ausencia.
--
-- LO QUE NO SE HACE
--
-- No se borra ni una fila. No se cambia ninguna semántica funcional. No se
-- pone `force row level security`: estos catálogos los leen funciones
-- `security definer` (`quality_automation_run`, `quality_mr_prepare_inputs`,
-- `quality_ai_add_reference`) que corren como propietario, y forzar RLS sobre
-- el propietario las rompería sin ganar nada.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A · CATÁLOGOS GLOBALES DEL PRODUCTO · lectura autenticada, explícita
-- ---------------------------------------------------------------------------
-- Los cinco catálogos de automatización y el de entradas de la revisión por la
-- dirección son vocabulario del producto: los consume el constructor de reglas
-- de Quality y las vistas `security_invoker`
-- (`v_quality_signal_overview`, `v_quality_automation_rule_overview`,
-- `v_quality_management_review_input_status`), que corren con la identidad de
-- quien pregunta. Quitarles la lectura autenticada rompería Quality sin cerrar
-- ningún riesgo: no hay nada de ninguna empresa dentro.
--
-- Así que la lectura se CONSERVA, pero pasa a estar declarada. Y no se declara
-- ninguna política de escritura: sin ella, `authenticated` no escribe aunque
-- alguien le conceda el privilegio por descuido en el futuro.

alter table public.quality_automation_sources enable row level security;
create policy quality_automation_sources_read on public.quality_automation_sources
  for select to authenticated using (true);

alter table public.quality_automation_source_fields enable row level security;
create policy quality_automation_source_fields_read on public.quality_automation_source_fields
  for select to authenticated using (true);

alter table public.quality_automation_event_catalog enable row level security;
create policy quality_automation_event_catalog_read on public.quality_automation_event_catalog
  for select to authenticated using (true);

alter table public.quality_automation_event_contracts enable row level security;
create policy quality_automation_event_contracts_read on public.quality_automation_event_contracts
  for select to authenticated using (true);

alter table public.quality_automation_rule_templates enable row level security;
create policy quality_automation_rule_templates_read on public.quality_automation_rule_templates
  for select to authenticated using (true);

alter table public.quality_management_review_input_catalog enable row level security;
create policy quality_management_review_input_catalog_read on public.quality_management_review_input_catalog
  for select to authenticated using (true);

-- Los privilegios quedan en el mínimo que el producto necesita: leer. Se
-- revocan explícitamente los de escritura aunque hoy no estén concedidos, para
-- que un `grant` futuro por costumbre no los reintroduzca en silencio.
revoke insert, update, delete, truncate on
  public.quality_automation_sources,
  public.quality_automation_source_fields,
  public.quality_automation_event_catalog,
  public.quality_automation_event_contracts,
  public.quality_automation_rule_templates,
  public.quality_management_review_input_catalog
  from authenticated, anon;
revoke all on
  public.quality_automation_sources,
  public.quality_automation_source_fields,
  public.quality_automation_event_catalog,
  public.quality_automation_event_contracts,
  public.quality_automation_rule_templates,
  public.quality_management_review_input_catalog
  from anon;
grant select on
  public.quality_automation_sources,
  public.quality_automation_source_fields,
  public.quality_automation_event_catalog,
  public.quality_automation_event_contracts,
  public.quality_automation_rule_templates,
  public.quality_management_review_input_catalog
  to authenticated;

comment on table public.quality_automation_sources is
  'Catálogo GLOBAL del producto (no de empresa). RLS activo con lectura autenticada explícita desde 0165; sin política de escritura, de modo que nadie salvo el propietario y `service_role` puede modificarlo.';
comment on table public.quality_automation_source_fields is
  'Catálogo GLOBAL del producto. RLS activo con lectura autenticada explícita desde 0165.';
comment on table public.quality_automation_event_catalog is
  'Catálogo GLOBAL del producto. RLS activo con lectura autenticada explícita desde 0165.';
comment on table public.quality_automation_event_contracts is
  'Catálogo GLOBAL del producto. RLS activo con lectura autenticada explícita desde 0165.';
comment on table public.quality_automation_rule_templates is
  'Catálogo GLOBAL del producto (plantillas de regla que la empresa instancia). RLS activo con lectura autenticada explícita desde 0165.';
comment on table public.quality_management_review_input_catalog is
  'Catálogo GLOBAL del producto (entradas obligatorias de la revisión por la dirección, ISO 9001 §9.3.2). RLS activo con lectura autenticada explícita desde 0165.';

-- ---------------------------------------------------------------------------
-- B · CATÁLOGO INTERNO DE PLATAFORMA · lectura solo para personal
-- ---------------------------------------------------------------------------
-- `quality_ai_sources` es distinto de los seis anteriores y por eso no recibe
-- la misma política.
--
-- Qué contiene: las 26 fuentes que Intelligence puede consultar, con su clase
-- de privacidad (`open`, `people`, `anonymous`, `restricted`), el modo temporal
-- y la NOTA DE PERMISO que describe la regla interna de cada una («sin
-- identidad, nunca», «las notas restringidas quedan fuera», «se cita el CARGO,
-- nunca la persona»). No hay prompts, ni proveedor, ni modelo, ni coste, ni
-- URLs internas: los `deep_link` son rutas del propio producto.
--
-- Aun así es el DISEÑO INTERNO de privacidad del Copilot, no vocabulario que el
-- cliente necesite. Y sobre todo: no lo consume nadie. `listAiSources` no tiene
-- un solo llamante en el repositorio, ninguna vista lo referencia, y la única
-- función que lo lee —`quality_ai_add_reference`— es `security definer` y corre
-- como propietario. Las referencias que ve el cliente salen de
-- `quality_ai_run_references`, que guarda su propia copia de etiqueta y enlace.
--
-- De modo que la lectura autenticada no cierra ninguna funcionalidad y sí
-- cierra una filtración de diseño interno.
alter table public.quality_ai_sources enable row level security;

-- Nota sobre el privilegio: NO se revoca el SELECT de `authenticated`, y es
-- deliberado. El personal de plataforma se autentica con ese mismo rol; quitar
-- el privilegio a nivel de rol se lo quitaría también a ellos. El mínimo
-- privilegio correcto aquí es conservar el `grant` y que la POLÍTICA decida,
-- que es justo para lo que existe RLS.
create policy quality_ai_sources_staff_read on public.quality_ai_sources
  for select to authenticated using (public.is_platform_staff());

revoke insert, update, delete, truncate on public.quality_ai_sources from authenticated, anon;
revoke all on public.quality_ai_sources from anon;

comment on table public.quality_ai_sources is
  'Catálogo INTERNO de plataforma: qué fuentes puede consultar Intelligence y con qué clase de privacidad y regla de permiso. Desde 0165 solo lo lee el personal de plataforma. No lo consume ninguna pantalla de cliente: las referencias que ve quien pregunta salen de `quality_ai_run_references`, que guarda su propia copia.';

-- ---------------------------------------------------------------------------
-- C · EL GUARDIA · para no volver a enterarse por un correo del proveedor
-- ---------------------------------------------------------------------------
-- Tres primitivas de auditoría que preguntan al ESTADO REAL de la base. Una
-- prueba que lea el SQL de una migración solo demuestra que alguien escribió la
-- intención; lo que hay que comprobar es lo que la base tiene puesto.
--
-- Solo las ejecuta `service_role`: son herramientas de operación, no de
-- producto, y no hay ninguna pantalla que las necesite.

/** Tablas base de `public` con RLS desactivado. Lo esperado, siempre, es cero. */
create or replace function public.public_tables_without_rls()
returns table (schema_name text, table_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select n.nspname::text, c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
   order by 1, 2;
$$;

/**
 * Privilegios que no deberían existir. La regla es EXACTAMENTE la forma que
 * tuvo este incidente: cualquier privilegio concedido a `anon` o
 * `authenticated` sobre una tabla que NO tiene RLS. Con RLS desactivado, un
 * `grant` es acceso efectivo; con RLS activo, un `grant` sin política es inerte.
 *
 * Deliberadamente NO se marca como sospechoso el `select` autenticado sobre un
 * catálogo global legítimo: prohibirlo dejaría el guardia en rojo permanente y
 * un guardia que nadie puede poner en verde acaba borrado.
 */
create or replace function public.public_tables_with_unexpected_grants()
returns table (table_name text, grantee text, privilege_type text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select g.table_name::text, g.grantee::text, g.privilege_type::text
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where g.table_schema = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
     and g.grantee in ('anon', 'authenticated')
   order by 1, 2, 3;
$$;

/** Tablas con FORCE RLS: el propietario también queda sujeto. Se consulta para
 *  poder afirmar que NO se forzó donde hay funciones `security definer` que
 *  dependen de correr como propietario. */
create or replace function public.public_forced_rls_tables()
returns table (table_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.relname::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity
   order by 1;
$$;

/** Políticas que alcanzan al rol `anon`. Hoy debe haber exactamente una: la
 *  lectura de los documentos legales vigentes, que por definición tiene que
 *  poder leerse ANTES de iniciar sesión. Cualquier otra es una decisión nueva
 *  que alguien tiene que justificar. */
create or replace function public.public_policies_reaching_anon()
returns table (table_name text, policy_name text, command text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.tablename::text, p.policyname::text, p.cmd::text
    from pg_policies p
   where p.schemaname = 'public'
     and p.roles::text like '%anon%'
   order by 1, 2;
$$;

revoke all on function public.public_tables_without_rls() from public, anon, authenticated;
revoke all on function public.public_tables_with_unexpected_grants() from public, anon, authenticated;
revoke all on function public.public_forced_rls_tables() from public, anon, authenticated;
revoke all on function public.public_policies_reaching_anon() from public, anon, authenticated;
grant execute on function public.public_tables_without_rls() to service_role;
grant execute on function public.public_tables_with_unexpected_grants() to service_role;
grant execute on function public.public_forced_rls_tables() to service_role;
grant execute on function public.public_policies_reaching_anon() to service_role;

comment on function public.public_tables_without_rls() is
  'SEC-01 · Auditoría: tablas base de `public` con RLS desactivado. Lo esperado es CERO filas. Existe para no volver a depender del Security Advisor del proveedor para descubrirlo.';
comment on function public.public_tables_with_unexpected_grants() is
  'SEC-01 · Auditoría: privilegios de `anon` o `authenticated` sobre tablas SIN RLS, que es la forma exacta que tuvo el incidente. Un grant sin RLS es acceso; un grant con RLS y sin política es inerte.';

/** Vistas de `public` que corren como PROPIETARIO —sin `security_invoker`— y
 *  están concedidas a `anon` o `authenticated`. Son la segunda vía de
 *  exposición: su definición ignora la RLS de las tablas que cruza, así que
 *  cada una tiene que filtrar por dentro. Se enumeran para que ninguna
 *  aparezca sin que alguien la haya clasificado. */
create or replace function public.public_owner_views_granted()
returns table (view_name text, grantee text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct g.table_name::text, g.grantee::text
    from information_schema.role_table_grants g
    join pg_class c on c.relname = g.table_name
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
   where c.relkind = 'v'
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type = 'SELECT'
     and coalesce((select option_value from pg_options_to_table(c.reloptions)
                    where option_name = 'security_invoker'), 'false') <> 'true'
   order by 1, 2;
$$;

revoke all on function public.public_owner_views_granted() from public, anon, authenticated;
grant execute on function public.public_owner_views_granted() to service_role;

comment on function public.public_owner_views_granted() is
  'SEC-01 · Auditoría: vistas que corren como propietario y están concedidas a anon/authenticated. Ignoran la RLS de lo que cruzan, así que cada una debe filtrar por dentro.';
