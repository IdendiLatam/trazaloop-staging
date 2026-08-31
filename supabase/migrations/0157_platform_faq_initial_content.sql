-- ============================================================================
-- Trazaloop · PE-02B3 · LAS PRIMERAS RESPUESTAS
-- ----------------------------------------------------------------------------
-- POR QUÉ ESTO ES UNA MIGRACIÓN Y NO UN GUION
--
-- El contenido de la FAQ es catálogo del producto, igual que las categorías que
-- sembró 0155 o las fuentes que sembró 0154. Tiene que llegar a cada entorno
-- por el mismo camino que el resto del catálogo: si viviera en un guion que
-- alguien ejecuta a mano, Staging y Local dirían cosas distintas y nadie sabría
-- cuál es la buena.
--
-- No se crea NINGUNA tabla. Esta migración solo escribe filas —y refactoriza
-- una función sin cambiar lo que promete—.
--
--
-- EL PROBLEMA QUE HAY QUE RESOLVER PRIMERO
--
-- `faq_publish_entry` exige `is_platform_superadmin()`. Una migración se ejecuta
-- sin sesión, así que `auth.uid()` es nulo y esa comprobación falla. Hay tres
-- salidas y dos son malas:
--
--   1 · Insertar las revisiones a mano desde la migración. Eso salta la barrera
--       de verificación —la que impide publicar una afirmación sin comprobar— y
--       es exactamente lo que el encargo prohíbe.
--   2 · Relajar la comprobación de `faq_publish_entry`. Debilitar el guardián
--       por comodidad de la siembra.
--   3 · Separar las DOS cosas que hoy hace esa función: comprobar QUIÉN publica,
--       y comprobar QUÉ se puede publicar.
--
-- Se hace la tercera. La barrera de verificación se conserva ENTERA y se aplica
-- también a lo que se siembra aquí: si alguna de estas respuestas estuviera sin
-- comprobar, esta migración fallaría. Lo que la siembra no necesita es la
-- comprobación de autorización, porque una migración ES la plataforma actuando
-- sobre sí misma.
-- ============================================================================


-- ============================================================================
-- 1 · LA PUBLICACIÓN, PARTIDA EN DOS
-- ----------------------------------------------------------------------------
-- `faq_publish_entry_internal` es 0155 §7 palabra por palabra, menos la primera
-- línea. Toda la sucesión y toda la barrera de verificación siguen aquí.
--
-- No se concede a nadie: `revoke all … from public, anon, authenticated`. La
-- única forma de llegar a ella desde la aplicación es `faq_publish_entry`, que
-- sigue exigiendo superadministrador y no ha cambiado su promesa.
-- ============================================================================

create or replace function public.faq_publish_entry_internal(
  p_entry_id    uuid,
  p_language    text default 'es',
  p_change_note text default null,
  p_actor       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry   record;
  v_draft   record;
  v_actual  record;
  v_nuevo   uuid;
  v_numero  integer;
  v_hash    text;
  v_ahora   timestamptz := now();
begin
  select * into v_entry from faq_entries where id = p_entry_id;
  if v_entry.id is null then raise exception 'Esa pregunta no existe.'; end if;

  select * into v_draft
    from faq_entry_drafts
   where entry_id = p_entry_id and language = p_language;
  if v_draft.entry_id is null then
    raise exception 'No hay borrador que publicar para esa pregunta en ese idioma.';
  end if;

  -- LA BARRERA. Intacta, y aplicada también a la siembra.
  if v_draft.verification_status in
       ('external_policy_verification_required', 'not_verified', 'must_not_claim') then
    raise exception 'Esta respuesta no se puede publicar: su estado de verificación es «%». Compruébala antes, o cámbiale el estado con la comprobación hecha.',
      v_draft.verification_status;
  end if;

  if v_draft.verification_status = 'verified_with_qualifier'
     and length(btrim(coalesce(v_draft.verification_note, ''))) < 10 then
    raise exception 'Una respuesta verificada CON SALVEDAD tiene que decir cuál es la salvedad.';
  end if;

  if v_draft.external_source_url is not null
     and v_draft.external_source_checked_on is null then
    raise exception 'Una comprobación de política externa sin fecha no es una comprobación.';
  end if;

  v_hash := encode(sha256(convert_to(
    coalesce(v_draft.question, '') || E'\n' || coalesce(v_draft.answer_short, '') || E'\n'
    || coalesce(v_draft.answer_long, ''), 'UTF8')), 'hex');

  select * into v_actual
    from faq_entry_revisions
   where entry_id = p_entry_id and language = p_language and effective_to is null;

  if v_actual.id is not null and v_actual.content_hash = v_hash
     and v_actual.normative_class = v_draft.normative_class
     and v_actual.verification_status = v_draft.verification_status then
    update faq_entries set status = 'published' where id = p_entry_id;
    return v_actual.id;
  end if;

  select coalesce(max(revision_number), 0) + 1 into v_numero
    from faq_entry_revisions where entry_id = p_entry_id and language = p_language;

  if v_actual.id is not null then
    update faq_entry_revisions set effective_to = v_ahora where id = v_actual.id;
  end if;

  insert into faq_entry_revisions (
    entry_id, revision_number, language, question, answer_short, answer_long,
    normative_class, verification_status, source_basis, verified_at,
    verification_note, external_source_url, external_source_checked_on,
    content_hash, effective_from, change_note, created_by)
  values (
    p_entry_id, v_numero, p_language, btrim(v_draft.question),
    btrim(v_draft.answer_short), v_draft.answer_long,
    v_draft.normative_class, v_draft.verification_status, v_draft.source_basis,
    v_ahora, v_draft.verification_note, v_draft.external_source_url,
    v_draft.external_source_checked_on,
    v_hash, v_ahora, coalesce(p_change_note, v_draft.change_note), p_actor)
  returning id into v_nuevo;

  if v_actual.id is not null then
    update faq_entry_revisions
       set superseded_by_revision_id = v_nuevo
     where id = v_actual.id;
  end if;

  update faq_entries set status = 'published' where id = p_entry_id;

  return v_nuevo;
end;
$$;

revoke all on function public.faq_publish_entry_internal(uuid, text, text, uuid)
  from public, anon, authenticated;

comment on function public.faq_publish_entry_internal(uuid, text, text, uuid) is
  'PE-02B3 · La publicacion SIN la comprobacion de quien publica. Conserva entera la barrera de verificacion. No se concede a nadie: la aplicacion llega por faq_publish_entry, que sigue exigiendo superadministrador.';


-- La puerta de la aplicación: comprueba QUIÉN, y delega en QUÉ. Su promesa no
-- cambia ni una palabra.
create or replace function public.faq_publish_entry(
  p_entry_id    uuid,
  p_language    text default 'es',
  p_change_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_platform_superadmin() then
    raise exception 'Solo la administración de plataforma publica preguntas frecuentes.';
  end if;
  return faq_publish_entry_internal(p_entry_id, p_language, p_change_note, auth.uid());
end;
$$;

revoke all on function public.faq_publish_entry(uuid, text, text) from public, anon;
grant execute on function public.faq_publish_entry(uuid, text, text) to authenticated;


-- ============================================================================
-- 2 · SEMBRAR UNA RESPUESTA
-- ----------------------------------------------------------------------------
-- Idempotente por el `slug`: volver a aplicar esta migración no duplica nada, y
-- si el texto no cambió, tampoco crea una revisión (lo garantiza la huella de
-- 0155). Esto importa porque el replay completo se ejecuta en cada sprint.
--
-- La función se borra al final del archivo: existe para esta siembra y no debe
-- quedarse como una puerta más.
-- ============================================================================

create or replace function public.faq_seed_entry(
  p_slug          text,
  p_category      text,
  p_visibility    text,
  p_scope         text,
  p_module_keys   text[],
  p_featured      boolean,
  p_order         integer,
  p_question      text,
  p_answer_short  text,
  p_answer_long   text,
  p_normative     text,
  p_verification  text,
  p_source_basis  text,
  p_note          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat   uuid;
  v_entry uuid;
begin
  select id into v_cat from faq_categories where code = p_category;
  if v_cat is null then
    raise exception 'La categoría «%» no existe. La siembra no inventa categorías.', p_category;
  end if;

  select id into v_entry from faq_entries where slug = p_slug;
  if v_entry is null then
    insert into faq_entries (slug, category_id, visibility, scope, module_keys,
                             is_featured, sort_order)
    values (p_slug, v_cat, p_visibility, p_scope, coalesce(p_module_keys, '{}'::text[]),
            p_featured, p_order)
    returning id into v_entry;
  else
    update faq_entries
       set category_id = v_cat, visibility = p_visibility, scope = p_scope,
           module_keys = coalesce(p_module_keys, '{}'::text[]),
           is_featured = p_featured, sort_order = p_order
     where id = v_entry;
  end if;

  insert into faq_entry_drafts (
    entry_id, language, question, answer_short, answer_long,
    normative_class, verification_status, source_basis, verification_note)
  values (
    v_entry, 'es', p_question, p_answer_short, p_answer_long,
    p_normative, p_verification, p_source_basis, p_note)
  on conflict (entry_id, language) do update set
    question = excluded.question,
    answer_short = excluded.answer_short,
    answer_long = excluded.answer_long,
    normative_class = excluded.normative_class,
    verification_status = excluded.verification_status,
    source_basis = excluded.source_basis,
    verification_note = excluded.verification_note;

  -- Y se publica por el camino de siempre, barrera incluida.
  perform faq_publish_entry_internal(v_entry, 'es',
    'Contenido inicial de la FAQ · PE-02B3', null);

  return v_entry;
end;
$$;


-- ============================================================================
-- 3 · EL CONTENIDO
-- ----------------------------------------------------------------------------
-- Sale de la propuesta de PE-02A, y SOLO lo que allí quedó marcado como
-- publicable. Lo que no está aquí, y por qué:
--
--   · Las diez preguntas de SEGURIDAD Y PRIVACIDAD. Su redacción depende de que
--     la política de privacidad deje de ser preliminar y mencione al proveedor
--     de IA. Es el bloqueo editorial que PE-02A identificó y que resuelve B5.
--     La categoría existe y de momento no se ofrece, porque una categoría vacía
--     es una promesa.
--
--   · «¿Mis datos se utilizan para entrenar modelos?». Depende de una política
--     externa; la comprobación existe y la redacción es de B5.
--
--   · Cualquier cifra de precio, límite o cuota. La configuración comercial
--     canónica llega en PE-04/05 y la FAQ no la duplica.
--
--   · «¿Puedo dejar de compartir un pasaporte ya compartido?». PE-02A la dejó
--     sin comprobar y sigue sin comprobarse.
-- ============================================================================

-- --- Primeros pasos ---------------------------------------------------------

select public.faq_seed_entry(
  'que_es_trazaloop', 'primeros_pasos', 'public', 'global', '{}', true, 10,
  '¿Qué es Trazaloop?',
  'Una plataforma con varios módulos que comparten una sola cuenta. Cada módulo resuelve un ámbito —calidad, trazabilidad de contenido reciclado, textiles— y tu empresa entra a los que tenga activos.',
  'No hay que elegir entre un módulo y otro: son partes del mismo sistema. Lo que cambia entre empresas es a cuáles tiene acceso, y eso se ve al entrar, en la pantalla de módulos.',
  'safe', 'verified', 'Catálogo de módulos (lib/modules/catalog.ts) y portada pública.');

select public.faq_seed_entry(
  'por_donde_empiezo', 'primeros_pasos', 'authenticated', 'global', '{}', true, 20,
  'Acabo de entrar y no sé por dónde empezar',
  'Empieza por la pantalla de módulos: es la puerta. Entra al módulo que uses y su portada te dirá qué requiere atención primero.',
  'La portada de cada módulo está pensada para eso: no es un resumen de todo, es una lista de lo que está esperando algo de alguien. Si algo no se pudo consultar, te lo dice en vez de enseñarte un cero.',
  'safe', 'verified', 'PE-01B (la puerta) y QUALITY-13B4 (la portada de Quality).');

select public.faq_seed_entry(
  'una_cuenta_varios_modulos', 'primeros_pasos', 'public', 'global', '{}', false, 30,
  '¿Necesito una cuenta por cada módulo?',
  'No. Una sola cuenta de Trazaloop da acceso a todos los módulos que tu empresa tenga activos. Nunca hay inicios de sesión separados.',
  null,
  'safe', 'verified', 'Portada pública y PE-01B.');

select public.faq_seed_entry(
  'varias_empresas', 'primeros_pasos', 'authenticated', 'global', '{}', false, 40,
  '¿Puedo pertenecer a más de una empresa?',
  'Sí. Si te han invitado a varias, cambias de empresa desde la puerta de módulos, y lo que ves se recalcula para la empresa activa.',
  'Nada de una empresa se arrastra a otra: los módulos, los permisos y los datos se resuelven de nuevo cada vez.',
  'safe', 'verified', 'Suite pe01-modules-access, comprobación K.');

-- --- Cuenta y empresa -------------------------------------------------------

select public.faq_seed_entry(
  'quien_invita', 'cuenta_empresa', 'authenticated', 'global', '{}', false, 10,
  '¿Quién puede invitar a alguien a mi empresa?',
  'Solo un administrador de tu empresa.',
  'Ni el equipo de Trazaloop ni ninguna otra empresa pueden añadir personas a la tuya.',
  'safe', 'verified', 'Las cuatro políticas de la tabla de membresías exigen ser administrador de la empresa.');

select public.faq_seed_entry(
  'papeles', 'cuenta_empresa', 'authenticated', 'global', '{}', true, 20,
  '¿Qué papeles existen y qué puede hacer cada uno?',
  'Tres: administrador de empresa, responsable de calidad y consultor externo. Tu papel decide qué puedes hacer; entrar a un módulo no lo decide.',
  'Que un módulo esté disponible para tu empresa y que tú puedas hacer algo dentro de él son dos cosas distintas. Lo primero depende del acceso de la empresa; lo segundo, de tu papel.',
  'safe', 'verified', 'Catálogo de papeles y políticas de escritura por papel.');

select public.faq_seed_entry(
  'perdi_contrasena', 'cuenta_empresa', 'public', 'global', '{}', false, 30,
  'Perdí mi contraseña',
  'Desde «Iniciar sesión» pide el enlace de recuperación; llega a tu correo.',
  null,
  'safe', 'verified', 'Flujo de recuperación probado en test:auth-password-recovery.');

select public.faq_seed_entry(
  'datos_de_empresa', 'cuenta_empresa', 'authenticated', 'global', '{}', false, 40,
  '¿Cómo cambio los datos de mi empresa?',
  'En Datos de empresa, dentro de Trazaloop. Los cambia un administrador.',
  null,
  'safe', 'verified', 'Pantalla /settings/company.');

-- --- Trazaloop Quality ------------------------------------------------------

select public.faq_seed_entry(
  'que_hace_quality', 'quality', 'public', 'modules', '{quality}', true, 10,
  '¿Qué hace Trazaloop Quality?',
  'Gestiona procesos, riesgos, objetivos, personas, proveedores, auditorías y mejora continua desde un entorno conectado y trazable.',
  null,
  'safe', 'verified', 'Copia congelada por decisión humana en PE-01.');

select public.faq_seed_entry(
  'quality_certifica', 'quality', 'public', 'modules', '{quality}', true, 20,
  '¿Trazaloop me certifica en ISO 9001?',
  'No. Trazaloop no emite certificaciones ni declara conformidad. Organiza tu información con criterios de las normas técnicas y te prepara para una auditoría; quien certifica es un organismo certificador.',
  'Lo mismo vale para el resto de módulos y de normas: la plataforma ordena, relaciona y conserva lo que hiciste, para que puedas demostrarlo. La decisión sobre si cumples es de quien audita.',
  'normative_reference', 'verified',
  'docs/FAQ_PILOT.md #8 y la disciplina de clasificación normativa de 0136.');

select public.faq_seed_entry(
  'portada_quality', 'quality', 'authenticated', 'modules', '{quality}', false, 30,
  '¿Por qué la portada me muestra unas cosas y no otras?',
  'Porque muestra lo que requiere atención según tu papel y lo que hay abierto en tu empresa. Si algo no se pudo consultar, se dice — no se enseña un cero.',
  'Un cero y un «no se pudo consultar» significan cosas muy distintas, y confundirlos hace tomar decisiones equivocadas. Por eso la portada nunca inventa un cero.',
  'safe', 'verified', 'QUALITY-13B4.');

select public.faq_seed_entry(
  'documento_hace_meses', 'quality', 'authenticated', 'modules', '{quality}', false, 40,
  '¿Puedo saber qué decía un documento hace seis meses?',
  'Sí. Las revisiones no se sobrescriben: cada una conserva su periodo de vigencia, así que se puede reconstruir qué regía en una fecha.',
  'Es el mismo principio en todo lo que sirve de prueba de algo: lo que se publicó se conserva, y cambiarlo crea una versión nueva en vez de borrar la anterior.',
  'normative_reference', 'verified', 'QUALITY-02, revisiones documentales con vigencia.');

-- --- Trazaloop Intelligence -------------------------------------------------

select public.faq_seed_entry(
  'que_hace_intelligence', 'intelligence', 'authenticated', 'modules', '{quality}', true, 10,
  '¿Qué hace Trazaloop Intelligence y qué no hace?',
  'Explica y resume información que ya está en tu Trazaloop, y cita de dónde la sacó. No toma decisiones formales: no aprueba, no declara conformidad y no cierra nada por ti.',
  'Cuando responde, señala en qué registros se apoyó, para que puedas comprobarlo. Y si no encuentra datos suficientes, lo dice en vez de rellenar el hueco.',
  'safe', 'verified', 'QUALITY-12 y QUALITY-13B5.');

-- --- Trazaloop PCR ----------------------------------------------------------

select public.faq_seed_entry(
  'calculo_cero', 'pcr', 'authenticated', 'modules', '{cpr}', false, 10,
  '¿Por qué mi cálculo salió 0 %?',
  'Casi siempre porque el material reciclado no tiene su evidencia de origen asociada como soporte y validada.',
  'Revisa el distintivo del material en Catálogos → Materiales, corrige lo que falte y vuelve a calcular. Sin la evidencia validada, esa masa no cuenta.',
  'safe', 'verified', 'docs/FAQ_PILOT.md #2.');

select public.faq_seed_entry(
  'defendibilidad', 'pcr', 'authenticated', 'modules', '{cpr}', false, 20,
  '¿Qué es el nivel de defendibilidad?',
  'Qué tan respaldado está tu cálculo: defendible, con advertencias o preliminar. La aplicación te dice exactamente qué falta.',
  null,
  'safe', 'verified', 'DEFENSIBILITY_HELP y docs/FAQ_PILOT.md #1.');

select public.faq_seed_entry(
  'recalcular_historial', 'pcr', 'authenticated', 'modules', '{cpr}', false, 30,
  'Si recalculo, ¿pierdo el cálculo anterior?',
  'No. Cada cálculo queda congelado como un registro nuevo y el historial se conserva.',
  null,
  'safe', 'verified', 'docs/FAQ_PILOT.md #5.');

select public.faq_seed_entry(
  'quien_valida_evidencias', 'pcr', 'authenticated', 'modules', '{cpr}', false, 40,
  '¿Quién valida las evidencias?',
  'Las personas con papel de administrador o de calidad en tu empresa.',
  null,
  'safe', 'verified', 'docs/FAQ_PILOT.md #4 y las políticas de evidencias.');

-- --- Trazaloop Textiles -----------------------------------------------------

select public.faq_seed_entry(
  'pasaporte_textil', 'textiles', 'public', 'modules', '{textiles}', false, 10,
  '¿Qué es el pasaporte textil y quién puede verlo?',
  'Es la ficha técnica publicable de una referencia. Solo se ve fuera de tu empresa si tú generas un enlace para compartirlo, y solo muestra la vista que publicaste.',
  'Mientras no generes ese enlace, no hay ninguna forma de llegar al pasaporte desde fuera de tu empresa.',
  'safe', 'verified', 'La resolución del pasaporte compartido se hace por token, en la base.');

-- --- Documentos y evidencias ------------------------------------------------

select public.faq_seed_entry(
  'que_pasa_si_cambia_mi_plan', 'documentos', 'public', 'global', '{}', true, 10,
  '¿Qué pasa con mis documentos si cambia mi plan o termina una prueba?',
  'Tus datos se conservan. Un módulo sin acceso deja de poder usarse, pero no borra nada: cuando se restablece el acceso, todo sigue donde estaba.',
  'No existe ningún proceso que borre información por caducidad de un acceso. Lo que cambia es lo que puedes hacer, no lo que tienes guardado.',
  'safe', 'verified',
  'PE-01B: los mensajes de bloqueo y la puerta; no existe ninguna ruta de borrado por caducidad.');

select public.faq_seed_entry(
  'borrar_documento', 'documentos', 'authenticated', 'global', '{}', false, 20,
  '¿Puedo borrar un documento?',
  'Depende de su estado: lo que sirve de evidencia de algo que ya ocurrió no se borra, se sucede con una versión nueva.',
  'Es lo que permite que un registro antiguo siga demostrando lo que demostraba. Si se pudiera reescribir, dejaría de demostrar nada.',
  'normative_reference', 'verified', 'Inmutabilidad documental de QUALITY-02 y TrazaDocs.');

select public.faq_seed_entry(
  'cuanto_espacio', 'documentos', 'authenticated', 'global', '{}', false, 30,
  '¿Cuánto espacio tengo?',
  'Lo ves en la pantalla de plan de cada módulo, con lo usado y lo disponible.',
  'El espacio se cuenta por módulo, no por empresa: cada módulo tiene el suyo.',
  'safe', 'verified', 'T9F.1 y T9F.2. Sin cifras a propósito: la configuración comercial es su dueña.');

-- --- Planes -----------------------------------------------------------------

select public.faq_seed_entry(
  'que_modulos_tengo', 'planes', 'authenticated', 'global', '{}', false, 10,
  '¿Cómo sé qué módulos tiene mi empresa?',
  'En la pantalla de módulos: cada uno muestra su estado. Que veas un módulo no significa que lo tengas — significa que existe.',
  'Los módulos que tu empresa no tiene se siguen viendo, con su estado, para que sepas qué hay en Trazaloop. Entrar solo es posible en los que estén activos.',
  'safe', 'verified', 'PE-01B.');

-- --- Soporte ----------------------------------------------------------------

select public.faq_seed_entry(
  'como_pido_ayuda', 'soporte', 'authenticated', 'global', '{}', true, 10,
  '¿Cómo pido ayuda?',
  'Desde el Centro de soporte, dentro de Trazaloop.',
  'Antes de abrir un ticket, mira si la pregunta está aquí: estas respuestas están para resolver lo habitual sin esperar a nadie.',
  'safe', 'verified', 'Pantalla /support.');

select public.faq_seed_entry(
  'implantacion', 'soporte', 'public', 'global', '{}', false, 20,
  '¿Trazaloop hace la implantación por mí?',
  'La documentación y la ayuda explican cómo funciona Trazaloop. El acompañamiento para implantar un sistema de gestión en tu empresa es un servicio distinto del producto.',
  'Estas respuestas explican cómo funciona la plataforma; no dicen a tu empresa qué debe hacer, ni interpretan una norma para tu caso.',
  'safe', 'verified', 'Frontera editorial PEH-13 de PE-02A.');


-- ============================================================================
-- 4 · Y LA HERRAMIENTA DE SIEMBRA SE VA
-- ----------------------------------------------------------------------------
-- Existió para esta migración. Dejarla sería dejar una función que crea y
-- publica preguntas sin comprobar quién la llama: no hay ninguna razón para que
-- siga ahí cuando la consola ya hace lo mismo por el camino correcto.
-- ============================================================================

drop function public.faq_seed_entry(
  text, text, text, text, text[], boolean, integer, text, text, text, text,
  text, text, text);


-- ============================================================================
-- 5 · LO QUE NO SE HIZO
-- ----------------------------------------------------------------------------
--   · Ninguna tabla nueva. Ninguna columna nueva. Ninguna política nueva.
--   · Ninguna respuesta de seguridad: su redacción depende de que la política
--     de privacidad deje de ser preliminar (B5).
--   · Ninguna cifra de precio, límite ni cuota.
--   · La categoría «Seguridad y privacidad» se queda sin preguntas, y por eso
--     no se ofrece: la pantalla solo enseña categorías con contenido.
-- ============================================================================
