-- =============================================================================
-- Trazaloop · SECURITY-HOTFIX-01 · La familia quality_mr_src_* deja de ser
-- alcanzable sin sesión
-- =============================================================================
--
-- LA EXPOSICIÓN, MEDIDA
--
-- Comprobado en Staging el 15 de septiembre de 2026, como rol `anon`, sin
-- sesión y sin testigo:
--
--     quality_mr_src_audits(<uuid de una empresa>, <desde>, <hasta>)
--       → 7 auditorías reales de esa empresa, con código, título, tipo,
--         estado, fechas y conteos de hallazgos, acciones y casos abiertos.
--
-- Lo único que hacía falta para leer datos de otra empresa era conocer —o
-- adivinar— un uuid de organización.
--
--
-- LA CAUSA
--
-- 0128 construyó la revisión por la dirección con una puerta bien puesta: el
-- DESPACHADOR `quality_mr_source_payload` comprueba `is_org_member` contra la
-- SESIÓN y está revocado de `public` y de `anon`. Lo mismo cada una de las once
-- funciones de orquestación del subsistema.
--
-- Lo que no se revocó fueron sus catorce ADAPTADORES —las piezas internas a las
-- que el despachador delega—, y Supabase concede EXECUTE a `anon` sobre todo lo
-- que nace en `public`. Se cerró la puerta de la casa y se dejaron abiertas las
-- ventanas de la misma planta. 0150, al añadir el decimoquinto
-- (`interested_parties`), sí lo revocó: la omisión era de 0128, no del patrón.
--
-- Y como los adaptadores son `SECURITY DEFINER`, la RLS de las tablas no los
-- frena: se ejecutan con los permisos del dueño.
--
--
-- POR QUÉ NO BASTA CON REVOCAR
--
-- Los quince comprueban `is_org_member` EXACTAMENTE UNA VEZ, dentro de su
-- primera subconsulta, mientras tienen hasta ocho subconsultas filtradas por
-- organización. En `audits` la puerta cubre el programa de auditoría; las
-- auditorías, los hallazgos y los casos salían igual. No es un descuido de una
-- función: es el mismo patrón repetido quince veces.
--
-- Así que se ponen las DOS capas, que es lo que pide el encargo:
--
--   · frontera de privilegio — quien no debería poder llamar, no puede;
--   · autorización interna   — y si algún día alguien vuelve a concederla, o
--                              una función nueva la llama sin comprobar nada,
--                              la propia función se niega.
--
--
-- CÓMO, SIN REESCRIBIR QUALITY-10
--
-- No se toca ni una línea de los cuerpos. Cada adaptador se RENOMBRA a `_impl`
-- y en su lugar queda una puerta con el nombre de siempre y la misma firma, que
-- comprueba la pertenencia —con las mismas palabras que el despachador— y
-- delega.
--
-- Reescribir a mano las subconsultas de quince funciones de unas mil quinientas
-- líneas, en un hotfix de seguridad, habría sido la forma más probable de
-- introducir un defecto nuevo mientras se corrige uno viejo. Esta forma hace la
-- propiedad cierta POR CONSTRUCCIÓN, y una sola prueba la comprueba en los
-- quince.
--
--
-- QUÉ NO CAMBIA PARA QUIEN USA LA APLICACIÓN
--
-- Nada. El despachador es `SECURITY DEFINER` y se ejecuta como su dueño, así
-- que sigue pudiendo llamar a los adaptadores aunque nadie más pueda. Y ya
-- devolvía `null` a quien no es miembro, de modo que la puerta nueva jamás se
-- cierra delante de un camino que hoy funcione.
--
-- ALCANCE: solo esta familia. El inventario completo de las ~107 funciones
-- históricas con EXECUTE para `anon` sigue siendo
-- PUBLIC-ANON-EXECUTE-AUDIT-01, y sigue abierto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 · Cada adaptador, detrás de su puerta
-- -----------------------------------------------------------------------------

-- Auditorías internas: programa, ejecución y hallazgos.
alter function public.quality_mr_src_audits(uuid, date, date)
  rename to quality_mr_src_audits_impl;

create or replace function public.quality_mr_src_audits(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_audits_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_audits(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- No conformidades, acciones y su eficacia.
alter function public.quality_mr_src_cases(uuid, date, date)
  rename to quality_mr_src_cases_impl;

create or replace function public.quality_mr_src_cases(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_cases_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_cases(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Cambios que afectan al sistema de gestión.
alter function public.quality_mr_src_changes(uuid, date, date)
  rename to quality_mr_src_changes_impl;

create or replace function public.quality_mr_src_changes(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_changes_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_changes(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Voz del cliente: quejas, encuestas y satisfacción.
alter function public.quality_mr_src_customer_voice(uuid, date, date)
  rename to quality_mr_src_customer_voice_impl;

create or replace function public.quality_mr_src_customer_voice(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_customer_voice_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_customer_voice(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Oportunidades de mejora.
alter function public.quality_mr_src_improvement(uuid, date, date)
  rename to quality_mr_src_improvement_impl;

create or replace function public.quality_mr_src_improvement(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_improvement_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_improvement(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Partes interesadas y sus requisitos.
alter function public.quality_mr_src_interested_parties(uuid, date, date)
  rename to quality_mr_src_interested_parties_impl;

create or replace function public.quality_mr_src_interested_parties(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_interested_parties_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_interested_parties(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Resultados de seguimiento y medición.
alter function public.quality_mr_src_monitoring(uuid, date, date)
  rename to quality_mr_src_monitoring_impl;

create or replace function public.quality_mr_src_monitoring(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_monitoring_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_monitoring(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Objetivos de calidad y su avance.
alter function public.quality_mr_src_objectives(uuid, date, date)
  rename to quality_mr_src_objectives_impl;

create or replace function public.quality_mr_src_objectives(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_objectives_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_objectives(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Desempeño de los procesos.
alter function public.quality_mr_src_process_performance(uuid, date, date)
  rename to quality_mr_src_process_performance_impl;

create or replace function public.quality_mr_src_process_performance(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_process_performance_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_process_performance(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Conformidad de producto y servicio.
alter function public.quality_mr_src_product_conformity(uuid, date, date)
  rename to quality_mr_src_product_conformity_impl;

create or replace function public.quality_mr_src_product_conformity(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_product_conformity_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_product_conformity(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Adecuación de los recursos.
alter function public.quality_mr_src_resources(uuid, date, date)
  rename to quality_mr_src_resources_impl;

create or replace function public.quality_mr_src_resources(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_resources_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_resources(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Eficacia de las acciones frente a riesgos y oportunidades.
alter function public.quality_mr_src_risks(uuid, date, date)
  rename to quality_mr_src_risks_impl;

create or replace function public.quality_mr_src_risks(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_risks_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_risks(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Desempeño de proveedores externos.
alter function public.quality_mr_src_suppliers(uuid, date, date)
  rename to quality_mr_src_suppliers_impl;

create or replace function public.quality_mr_src_suppliers(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_suppliers_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_suppliers(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Desempeño global del sistema; se compone de otros retratos.
alter function public.quality_mr_src_system_performance(uuid, date, date)
  rename to quality_mr_src_system_performance_impl;

create or replace function public.quality_mr_src_system_performance(p_organization_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_system_performance_impl(p_organization_id, p_from, p_to);
end $$;

comment on function public.quality_mr_src_system_performance(uuid, date, date) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- Seguimiento de las acciones de la revisión anterior.
alter function public.quality_mr_src_previous_actions(uuid, date, date, uuid)
  rename to quality_mr_src_previous_actions_impl;

create or replace function public.quality_mr_src_previous_actions(p_organization_id uuid, p_from date, p_to date, p_review_id uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_org_member(p_organization_id) then return null; end if;
  return public.quality_mr_src_previous_actions_impl(p_organization_id, p_from, p_to, p_review_id);
end $$;

comment on function public.quality_mr_src_previous_actions(uuid, date, date, uuid) is
  '0200 · Retrato de entrada de la revisión por la dirección, CON la puerta de '
  'pertenencia delante. El cuerpo original vive en _impl y no lo alcanza nadie '
  'salvo esta puerta.';

-- -----------------------------------------------------------------------------
-- 2 · La frontera de privilegio
-- -----------------------------------------------------------------------------
-- Se recorre la familia entera —puertas y cuerpos— en vez de escribir quince
-- pares de líneas: así también quedan cerrados los `_impl` que se acaban de
-- crear, y cualquier hermano que hubiera aparecido sin que nadie lo declarara.
--
-- NO se concede a nadie. El único que necesita llamarlos es el despachador, y
-- lo hace como dueño. `authenticated` tampoco: ningún código llama a un
-- adaptador directamente —se comprobó en el repositorio y en las migraciones—,
-- y `interested_parties` lo tenía sin necesitarlo.

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'quality_mr_src_%'
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated, service_role',
      f.firma);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3 · Y no se da por hecho: se comprueba antes de confirmar
-- -----------------------------------------------------------------------------
-- Si algo quedara alcanzable, esta migración no entra. Es la diferencia entre
-- creer que se cerró y saberlo.

do $$
declare v_abiertas text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.proname)
    into v_abiertas
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'quality_mr_src_%'
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if v_abiertas is not null then
    raise exception '0200_SUPERFICIE_ABIERTA: %', v_abiertas;
  end if;

  -- Y que sigan estando los quince, no vaya a ser que «cerrado» sea «borrado».
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'quality\_mr\_src\_%'
         and p.proname not like '%\_impl') <> 15 then
    raise exception '0200_ADAPTADORES_INESPERADOS: %',
      (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'quality\_mr\_src\_%'
          and p.proname not like '%\_impl');
  end if;

  raise notice '0200 · quince adaptadores con puerta, y ninguno alcanzable sin sesión';
end $$;

-- -----------------------------------------------------------------------------
-- 4 · Lo que sigue igual
-- -----------------------------------------------------------------------------
-- `quality_mr_source_payload` conserva su concesión a `authenticated` y su
-- comprobación de pertenencia: es la puerta por la que la aplicación pide un
-- retrato, y es la que debe seguir abierta para quien tiene sesión.
