-- ============================================================================
-- Trazaloop · PE-02B5B · LA PUBLICACIÓN CONTROLADA
-- ----------------------------------------------------------------------------
-- Publica la política de privacidad v1.1 y las quince respuestas de seguridad,
-- por la vía canónica y con la identidad de una persona real.
--
--
-- POR QUÉ NO SE ESCRIBE NINGUNA TABLA A MANO
--
-- Este guion no hace un solo `update legal_documents set status = 'active'`, y
-- eso es deliberado. Publicar es más que cambiar un estado: hay que archivar la
-- vigente con su fecha de retiro, enlazar las dos en los dos sentidos, y dejar
-- constancia de quién publicó. `legal_publish_document` hace las cuatro cosas
-- en una transacción. Hacerlo a mano significaría acertar las cuatro, hoy y
-- cada vez.
--
-- Lo mismo con la FAQ: `faq_publish_entry` copia el borrador a una revisión
-- inmutable, cierra la anterior si la había, y —lo que importa— vuelve a pasar
-- la barrera de verificación. Insertar la revisión a mano se saltaría esa
-- barrera, que es justo lo que la barrera existe para impedir.
--
--
-- POR QUÉ SE ADOPTA UNA IDENTIDAD, Y POR QUÉ ESO NO ES SALTARSE NADA
--
-- Las dos funciones exigen `is_platform_superadmin()`, que lee `auth.uid()`.
-- Ejecutadas desde `psql` sin más, `auth.uid()` es nulo y las dos fallan — como
-- deben. Así que se hace lo mismo que hace PostgREST cuando alguien pulsa el
-- botón: se declara la sesión y se baja al rol `authenticated`.
--
-- La comprobación de autorización SE EJECUTA y tiene que pasar. Si la cuenta
-- que se declara no fuera superadministradora, este guion fallaría.
--
-- Uso:  psql "<cadena>" -v actor="'<uuid de la persona>'" -f publicar.sql
-- ============================================================================

\set ON_ERROR_STOP on

begin;

-- La sesión, igual que la declararía la pasarela.
select set_config('request.jwt.claims',
  json_build_object('sub', :actor, 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_borrador   record;
  v_nueva      uuid;
  v_vigente_id uuid;
  v_slug       text;
  v_entrada    uuid;
  v_publicadas integer := 0;
begin
  if not public.is_platform_superadmin() then
    raise exception 'La cuenta declarada no es superadministradora de plataforma.';
  end if;

  -- ==========================================================================
  -- 1 · LA POLÍTICA DE PRIVACIDAD
  -- --------------------------------------------------------------------------
  -- El borrador se llamaba `v1.1-draft`, que era un nombre de trabajo. Lo que
  -- se publica se llama `v1.1`, porque es lo que el propio texto declara en su
  -- artículo 21 y es lo que verá el cliente junto al título.
  --
  -- Se crea como versión nueva con el MISMO contenido, se publica, y el borrador
  -- de trabajo se descarta. No se renombra la fila: `legal_create_draft` es la
  -- única vía que fija una versión, y renombrar a mano dejaría el resumen de
  -- contenido sin recalcular.
  -- ==========================================================================
  select id, title, content into v_borrador
    from public.legal_documents
   where document_type = 'privacy' and version = 'v1.1-draft' and status = 'draft';

  if v_borrador.id is null then
    raise notice 'No hay borrador v1.1-draft: se supone ya publicado. No se toca.';
  else
    select id into v_vigente_id from public.legal_documents
     where document_type = 'privacy' and status = 'active';
    raise notice 'Vigente antes de publicar: %', v_vigente_id;

    v_nueva := public.legal_create_draft(
      'privacy', 'v1.1', v_borrador.title, v_borrador.content,
      'PE-02B5B · sucesora aprobada por la dirección del producto el 2026-08-31. '
      'Incorpora Quality, Textiles, Intelligence y el proveedor de inteligencia '
      'artificial como encargado. Sucede a la v1.0 aprobada el 27 de julio de 2026.');

    -- El contenido tiene que ser el mismo byte a byte. Si no lo fuera, lo que se
    -- publicaría no sería lo que se revisó.
    if (select md5(content) from public.legal_documents where id = v_nueva)
       is distinct from md5(v_borrador.content) then
      raise exception 'El contenido copiado no coincide con el revisado. No se publica.';
    end if;

    perform public.legal_publish_document(v_nueva);
    raise notice 'Publicada privacy v1.1: %', v_nueva;

    perform public.legal_discard_draft(v_borrador.id);
    raise notice 'Descartado el borrador de trabajo: %', v_borrador.id;
  end if;

  -- ==========================================================================
  -- 2 · LAS QUINCE RESPUESTAS DE SEGURIDAD
  -- --------------------------------------------------------------------------
  -- Una a una y por la función canónica, que vuelve a comprobar la barrera de
  -- verificación en cada una. Las dos que llevan salvedad la llevan escrita, así
  -- que pasarán; si alguien la hubiera borrado al editar, esa se quedaría fuera
  -- y las demás entrarían igual.
  --
  -- La lista está escrita a mano a propósito. Publicar «todo lo que haya en la
  -- categoría» habría publicado también el residuo de las suites de prueba que
  -- vive en la base local.
  -- ==========================================================================
  for v_slug in select unnest(array[
    'seguridad_como_protege', 'seguridad_otra_empresa', 'seguridad_como_separa',
    'seguridad_equipo_trazaloop', 'seguridad_archivos', 'seguridad_permisos',
    'seguridad_intelligence', 'seguridad_ia_otras_empresas',
    'seguridad_que_recibe_proveedor', 'seguridad_entrenamiento_modelos',
    'seguridad_retencion_proveedor', 'seguridad_modelo_sin_base',
    'seguridad_ia_no_decide', 'seguridad_anonimato', 'seguridad_publicar'])
  loop
    select id into v_entrada from public.faq_entries where slug = v_slug;
    if v_entrada is null then
      raise exception 'Falta la entrada «%». No se publica media categoría.', v_slug;
    end if;
    if exists (select 1 from public.faq_entry_revisions
                where entry_id = v_entrada and effective_to is null) then
      raise notice '«%» ya estaba publicada. Se deja como está.', v_slug;
    else
      perform public.faq_publish_entry(v_entrada, 'es',
        'PE-02B5B · publicación aprobada por la dirección del producto el 2026-08-31.');
      v_publicadas := v_publicadas + 1;
    end if;
  end loop;

  raise notice 'Respuestas de seguridad publicadas en esta pasada: %', v_publicadas;
end $$;

commit;
