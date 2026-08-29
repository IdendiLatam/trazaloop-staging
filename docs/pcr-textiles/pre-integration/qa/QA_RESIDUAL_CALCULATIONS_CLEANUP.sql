-- ============================================================================
-- Trazaloop · QA DATA RESIDUE / PRE-RELEASE CLEANUP
-- Cálculos de contenido reciclado emitidos durante la coexistencia v1/v2
-- ----------------------------------------------------------------------------
-- QUÉ ES ESTO, Y QUÉ NO
--
-- No es una migración y no debe convertirse en una. Borra DATOS, y una
-- migración se ejecuta en todos los entornos: una limpieza de fixtures escrita
-- como migración es una bomba con temporizador que el día que Production la
-- ejecute borrará lo que encuentre.
--
-- Es un procedimiento MANUAL, para un entorno que se nombra, y que sabe decir
-- que no. Está aquí —versionado, en el repositorio— y no en un directorio
-- temporal, porque un procedimiento que vive en /tmp no es un procedimiento.
--
--
-- POR QUÉ NO ES UN BLOQUEANTE
--
-- Lo que queda en Staging son cálculos emitidos mientras las dos metodologías
-- convivían. Se comprobó, empresa por empresa, que las 190 organizaciones del
-- entorno son fixtures de QA; no hay un solo dato de cliente. Y ninguno de
-- esos cálculos puede reproducirse ni ampliarse:
--
--   · el motor retirado NO EXISTE — 0147 borró
--     `calculate_recycled_content(uuid, uuid)`;
--   · la metodología se resuelve por `recycled_content_canonical_methodology()`,
--     que apunta a código y versión explícitos;
--   · un disparador BEFORE INSERT rechaza cualquier cálculo nuevo que apunte
--     a una metodología distinta de la canónica.
--
-- Es decir: son filas históricas inertes en un entorno de pruebas. Limpiarlas
-- es higiene, no corrección.
--
--
-- CÓMO SE USA
--
--   1 · Ejecutar el PRECHECK. Si la sección B devuelve UNA SOLA fila, hay
--       organizaciones que este procedimiento no reconoce como QA: DETENERSE.
--   2 · Ejecutar la LIMPIEZA solo si el precheck salió limpio.
--   3 · Ejecutar el POSTCHECK y comprobar que los tres conteos son cero.
--
-- Contra el entorno que se nombre explícitamente, y NUNCA contra Production.
-- ============================================================================


-- ============================================================================
-- A · PRECHECK · qué hay
-- ============================================================================

select
  o.name                                   as organizacion,
  count(*)                                 as calculos,
  count(*) filter (where c.methodology_version = 1) as de_la_metodologia_retirada,
  min(c.calculated_at)::date               as desde,
  max(c.calculated_at)::date               as hasta
from public.recycled_content_calculations c
join public.organizations o on o.id = c.organization_id
group by o.name
order by o.name;


-- ============================================================================
-- B · PRECHECK · LA PARADA DE SEGURIDAD
-- ----------------------------------------------------------------------------
-- Devuelve filas SOLO si hay organizaciones que no encajan en ningún patrón
-- conocido de QA. Si devuelve algo, NO se sigue: hay que clasificarlas a mano
-- antes de borrar nada. La lista de patrones es la misma que usa
-- `scripts/qa-consolidate-recycled.ts`.
-- ============================================================================

select o.id, o.name, o.created_at::date
from public.organizations o
where not (
      o.name ~ '^Q[0-9]'                 -- Q01 Org A …, Q012 UI …, Q111 B …
   or o.name ~* '^QA\b'                  -- QA Empresa A, QA PT PCR, QA Staging · …
   or o.name ~ '^PT[0-9]'                -- PT01 A …, PT02A …, PT02B …
   or o.name ~ '^Org [AB] [0-9]'         -- fixtures de aislamiento
   or o.name ~* '^Probe '
   or o.name ~ '^RETIRADA · '
   or o.name ~ '^Trazaloop QA Permanente'
   or o.name ~ '^QUALITY-[0-9]'
  )
order by o.name;
-- ⟶ CERO FILAS = se puede continuar. UNA O MÁS = DETENERSE.


-- ============================================================================
-- C · LIMPIEZA
-- ----------------------------------------------------------------------------
-- Todo en UNA transacción. El disparador de inmutabilidad (PT-H01) prohíbe el
-- DELETE y hace bien: se levanta y se repone DENTRO de la misma transacción,
-- así que si algo falla el permiso se deshace junto con el borrado.
--
-- El borrado va acotado por JOIN contra los patrones de QA, no por «todo»: una
-- organización que no encaje sobrevive aunque el precheck se haya saltado.
-- ============================================================================

begin;

  alter table public.recycled_content_calculations
    disable trigger t_recycled_calc_immutable;

  delete from public.recycled_content_calculations c
   using public.organizations o
   where o.id = c.organization_id
     and (
          o.name ~ '^Q[0-9]'
       or o.name ~* '^QA\b'
       or o.name ~ '^PT[0-9]'
       or o.name ~ '^Org [AB] [0-9]'
       or o.name ~* '^Probe '
       or o.name ~ '^RETIRADA · '
       or o.name ~ '^Trazaloop QA Permanente'
       or o.name ~ '^QUALITY-[0-9]'
     );

  alter table public.recycled_content_calculations
    enable trigger t_recycled_calc_immutable;

  -- Y la fila de la metodología retirada, si deja de tener quien la apunte.
  -- Misma condición que 0147, para que no dependa del orden de ejecución.
  delete from public.calculation_methodologies m
   where m.code = 'RC-6632-15343'
     and m.version = 1
     and not exists (
       select 1 from public.recycled_content_calculations c
        where c.methodology_id = m.id
     );

commit;


-- ============================================================================
-- D · POSTCHECK · los tres conteos tienen que ser CERO
-- ============================================================================

select
  (select count(*) from public.recycled_content_calculations
    where methodology_version = 1)                        as calculos_de_la_retirada,
  (select count(*) from public.calculation_methodologies
    where code = 'RC-6632-15343' and version = 1)         as filas_de_metodologia_retirada,
  (select count(*) from public.recycled_content_calculations c
     join public.calculation_methodologies m on m.id = c.methodology_id
    where m.version <> 2)                                 as calculos_fuera_de_la_canonica;


-- ============================================================================
-- E · POSTCHECK · lo que debe seguir siendo cierto pase lo que pase
-- ----------------------------------------------------------------------------
-- Estas tres cosas no dependen de la limpieza: son las que hacen que el
-- residuo sea inerte. Se comprueban aquí para no tener que fiarse de la
-- memoria de nadie.
-- ============================================================================

select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'calculate_recycled_content')
                                        as motor_retirado_debe_ser_0,
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'recycled_content_calculations'
      and t.tgname = 't_recycled_calc_canonical_methodology')
                                        as guardian_de_metodologia_debe_ser_1,
  (select version from public.recycled_content_canonical_methodology())
                                        as canonica_debe_ser_2;
