-- ============================================================================
-- Trazaloop · PE-02B5A · BORRADORES para revisión humana
-- ----------------------------------------------------------------------------
-- Esto NO publica nada:
--
--   · la política de privacidad sucesora entra como `draft`; la versión
--     vigente no se toca y nadie tiene que volver a aceptar nada;
--   · las respuestas de seguridad entran como entradas de FAQ en `draft`, con
--     su borrador y SIN revisión publicada, así que no aparecen en /faq.
--
-- Es idempotente: se puede aplicar varias veces sin duplicar ni republicar.
--
-- POR QUÉ ES UN GUION Y NO UNA MIGRACIÓN
--
-- Porque es material de REVISIÓN, no catálogo del producto. Una migración lo
-- llevaría a todos los entornos para siempre; esto tiene que estar en Local y
-- en Staging mientras alguien lo lee, y desaparecer o publicarse en B5B según
-- lo que esa persona decida. El encargo además fija la cabecera en 0158.
--
-- ACTUALIZADO EN PE-02B6
--
-- La dirección del producto confirmó dos cosas el 2026-08-31: que Trazaloop no
-- ha activado el uso de datos para entrenamiento, y que no tiene retención cero
-- contratada. Las dos respuestas que dependían de eso ya no están bloqueadas —
-- siguen siendo borradores, porque publicarlas es de B5B—.
--
-- Se aplica con:
--   psql "$URL" -v ON_ERROR_STOP=1 -f scripts/pe02b5a/seed-drafts.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · La política de privacidad sucesora, como BORRADOR
-- ----------------------------------------------------------------------------
-- El contenido íntegro vive en docs/legal/V1.1.0_PRIVACY_POLICY_SUCCESSOR_DRAFT.md
-- y se carga desde allí para que no haya dos textos que puedan divergir.
-- ----------------------------------------------------------------------------

\set contenido `cat docs/legal/V1.1.0_PRIVACY_POLICY_SUCCESSOR_DRAFT.md`

insert into public.legal_documents (document_type, version, title, content, status, change_note, content_hash)
select 'privacy', 'v1.1-draft',
       'Política de tratamiento de datos personales y privacidad',
       :'contenido', 'draft',
       'PE-02B5A · sucesora de la v1.0: incorpora Quality, Intelligence y el proveedor de IA. Pendiente de revisión humana.',
       encode(sha256(convert_to('Política de tratamiento de datos personales y privacidad' || E'\n' || :'contenido', 'UTF8')), 'hex')
where not exists (
  select 1 from public.legal_documents where document_type = 'privacy' and version = 'v1.1-draft');

-- Si ya existía, se refresca el texto: sigue siendo un borrador y se puede
-- corregir. El disparador de 0156 lo permite justamente porque es borrador.
update public.legal_documents
   set content = :'contenido',
       content_hash = encode(sha256(convert_to(title || E'\n' || :'contenido', 'UTF8')), 'hex')
 where document_type = 'privacy' and version = 'v1.1-draft' and status = 'draft';


-- ----------------------------------------------------------------------------
-- 2 · Las respuestas de seguridad, como BORRADORES
-- ----------------------------------------------------------------------------
-- Cada una entra como entrada de FAQ en estado `draft` con su borrador. NO se
-- publica ninguna: la vista pública exige `status = 'published'` y una revisión
-- vigente, y aquí no se crea ninguna revisión.
--
-- El estado de verificación viaja con cada borrador, así que el día que alguien
-- pulse publicar, la barrera de 0155 decidirá: las que dependen de una
-- confirmación humana están marcadas `external_policy_verification_required` y
-- la base las rechazará hasta que se resuelva.
-- ----------------------------------------------------------------------------

create or replace function pg_temp.sembrar_faq_borrador(
  p_slug text, p_categoria text, p_visibility text, p_orden integer,
  p_destacada boolean, p_scope text, p_modulos text[],
  p_pregunta text, p_corta text, p_larga text,
  p_normativa text, p_verificacion text, p_base text,
  p_salvedad text default null,
  p_url text default null, p_fecha date default null
) returns uuid
language plpgsql as $$
declare v_cat uuid; v_id uuid;
begin
  select id into v_cat from public.faq_categories where code = p_categoria;
  if v_cat is null then raise exception 'No existe la categoría %', p_categoria; end if;

  select id into v_id from public.faq_entries where slug = p_slug;
  if v_id is null then
    insert into public.faq_entries (slug, category_id, visibility, scope, module_keys,
                                    is_featured, sort_order, status)
    values (p_slug, v_cat, p_visibility, p_scope, coalesce(p_modulos, '{}'::text[]),
            p_destacada, p_orden, 'draft')
    returning id into v_id;
  else
    -- Nunca se toca el estado: si una ejecución anterior la dejó publicada,
    -- este guion no la despublica ni la republica.
    update public.faq_entries
       set category_id = v_cat, visibility = p_visibility, scope = p_scope,
           module_keys = coalesce(p_modulos, '{}'::text[]),
           is_featured = p_destacada, sort_order = p_orden
     where id = v_id;
  end if;

  insert into public.faq_entry_drafts (
    entry_id, language, question, answer_short, answer_long,
    normative_class, verification_status, source_basis, verification_note,
    external_source_url, external_source_checked_on, change_note)
  values (v_id, 'es', p_pregunta, p_corta, p_larga, p_normativa, p_verificacion,
          p_base, p_salvedad, p_url, p_fecha,
          'PE-02B5A · borrador para revisión humana')
  on conflict (entry_id, language) do update set
    question = excluded.question, answer_short = excluded.answer_short,
    answer_long = excluded.answer_long, normative_class = excluded.normative_class,
    verification_status = excluded.verification_status,
    source_basis = excluded.source_basis, verification_note = excluded.verification_note,
    external_source_url = excluded.external_source_url,
    external_source_checked_on = excluded.external_source_checked_on,
    change_note = excluded.change_note;

  return v_id;
end;
$$;

-- 1 · La bandera. Resume las capas verificadas sin exponer nada operativo.
select pg_temp.sembrar_faq_borrador(
  'seguridad_como_protege', 'seguridad', 'public', 5, true, 'global', '{}',
  '¿Cómo protege Trazaloop la información de mi empresa?',
  'Con varias capas que actúan a la vez: solo se entra con sesión, cada empresa queda aislada de las demás en la propia base de datos, tu papel decide qué puedes hacer, los archivos son privados y Trazaloop Intelligence solo trabaja con lo que tú puedes ver.',
  'En detalle, y solo lo que está implementado:

· Para entrar hace falta una sesión: no hay ninguna pantalla con datos de empresa abierta sin identificarse.

· El aislamiento entre empresas se aplica DENTRO de la base de datos, no solo en la pantalla. Cada consulta se resuelve con la identidad de quien pregunta y solo devuelve registros de su empresa.

· La base impide además que un registro de una empresa apunte a información de otra, aunque el programa lo intentara.

· Dentro de tu empresa, tu papel decide qué puedes hacer. Algunos datos, como los de personas, tienen reglas todavía más estrechas.

· Los archivos y evidencias están en almacenamiento privado: no tienen dirección pública y se descargan con enlaces firmados que caducan.

· Trazaloop Intelligence compone lo que consulta en nuestro servidor, con tu sesión y tus permisos. El modelo no accede a la base de datos.

· Lo que se publica queda con su fecha y su autor en los ámbitos donde eso importa —documentos, revisiones, decisiones—, y no se reescribe: se sucede con una versión nueva.

· La conexión con Trazaloop viaja cifrada.

Ninguna medida elimina el riesgo por completo, y no afirmamos lo contrario. Tampoco tenemos certificaciones de seguridad propias: el cifrado en reposo y la infraestructura los aportan nuestros proveedores, con su propia documentación.',
  'safe', 'verified',
  'PE-02B5A §1–§12 · medición del esquema del 2026-08-31: 289 tablas, 282 con control por fila, 0 de 321 columnas organization_id sin él, 409/409 claves compuestas acotadas, 3 de 3 cubos privados.');

-- 2 · Otra empresa
select pg_temp.sembrar_faq_borrador(
  'seguridad_otra_empresa', 'seguridad', 'public', 10, true, 'global', '{}',
  '¿Puede otra empresa ver mi información?',
  'No. Otra empresa no puede consultar la información privada de la tuya a través de Trazaloop. La separación no depende del código de la pantalla: está aplicada en la base de datos.',
  'Cada consulta se resuelve con la identidad de quien pregunta y solo devuelve registros de las empresas a las que pertenece. Además, la propia base rechaza que un registro apunte a información de otra empresa.

Hay una excepción que conviene conocer, y no es un fallo: TU EMPRESA puede decidir publicar algo. Al generar un enlace de pasaporte textil compartido o al enviar una encuesta a tus clientes, lo que compartes deja de ser privado para quien reciba ese enlace. Esa decisión es siempre tuya, y esos enlaces son revocables.',
  'safe', 'verified',
  'PE-02B5A §2 y §3 · políticas de lectura sobre datos de empresa: ninguna abierta; superficies públicas por token, decididas por la empresa.');

-- 3 · Cómo se separa
select pg_temp.sembrar_faq_borrador(
  'seguridad_como_separa', 'seguridad', 'public', 20, false, 'global', '{}',
  '¿Cómo separa Trazaloop la información entre empresas?',
  'Con dos barreras independientes. La primera: las reglas de acceso se aplican en la base de datos y se evalúan con tu sesión. La segunda: la base impide que un registro apunte a información de otra empresa.',
  'La primera barrera es lo que se llama seguridad a nivel de fila. Significa que aunque una consulta pidiera todos los registros de una tabla, la base solo devolvería los de las empresas a las que pertenece quien pregunta.

La segunda es de integridad: al relacionar dos registros, la base comprueba que los dos sean de la misma empresa. Si el programa intentara enlazar información de dos empresas distintas, la operación falla.

Que sean dos barreras independientes importa: un error en una no abre la otra.',
  'safe', 'verified',
  'PE-02B5A §2 · 282 de 289 tablas con control por fila; las 7 restantes son catálogos sin organization_id. 409 claves compuestas, todas acotadas a la empresa.');

-- 4 · El equipo de Trazaloop · LA SALVEDAD ES OBLIGATORIA
select pg_temp.sembrar_faq_borrador(
  'seguridad_equipo_trazaloop', 'seguridad', 'public', 30, true, 'global', '{}',
  '¿Puede el equipo de Trazaloop acceder a los datos de mi empresa?',
  'En la operación normal de la plataforma, no. La consola de administración no da a nuestro equipo ninguna vía para leer tus procesos, riesgos, documentos, evidencias ni tus consultas a Trazaloop Intelligence: solo ve datos administrativos —tu plan, tu consumo, tus miembros y los tickets de soporte que tú abres—.',
  'Tampoco existe ninguna función que permita a nuestro equipo entrar a la plataforma haciéndose pasar por ti, ni añadirse a tu empresa: gestionar los miembros es potestad exclusiva de un administrador tuyo.

Ahora la parte que no se puede omitir. Como en cualquier servicio alojado en la nube, la administración técnica de la infraestructura implica acceso a los sistemas donde reside la información, y las copias de respaldo contienen todo. Esos accesos técnicos excepcionales pueden ser necesarios para seguridad, soporte, recuperación o cumplimiento legal, y deben limitarse a personal autorizado y a lo estrictamente necesario.

No afirmamos que ese acceso sea imposible, porque no lo es en ningún servicio gestionado. Lo que sí decimos es que la aplicación no lo ofrece como función.

Sobre el registro: las operaciones que se hacen a través de la plataforma quedan registradas. Los accesos administrativos a la infraestructura los registra el proveedor conforme a sus propias herramientas, y eso no lo controla Trazaloop.',
  'safe', 'verified_with_qualifier',
  'PE-02B5A §4 y §5 · solo 7 tablas con organization_id tienen política de plataforma, todas administrativas o de soporte; sin suplantación; memberships sin acceso de plataforma; el registro de auditoría cubre operaciones de la aplicación, no accesos de infraestructura.',
  'La salvedad de infraestructura NO puede quitarse: sin ella la respuesta sería falsa. Y no se puede añadir que todo acceso excepcional quede auditado: eso no está verificado.');

-- 5 · Archivos
select pg_temp.sembrar_faq_borrador(
  'seguridad_archivos', 'seguridad', 'authenticated', 40, false, 'global', '{}',
  '¿Cómo protege Trazaloop mis archivos y evidencias?',
  'Están en almacenamiento privado. Ningún archivo tiene dirección pública: para descargar uno hace falta una sesión que pertenezca a tu empresa, y la descarga se hace con un enlace firmado que caduca.',
  'Conocer la ruta o el identificador de un archivo no basta para abrirlo. El permiso se comprueba en el momento de pedirlo, contra la empresa a la que pertenece la carpeta donde está guardado.

El cifrado en reposo y la ubicación física del almacenamiento corresponden a nuestro proveedor de infraestructura, conforme a su documentación. Trazaloop no implementa cifrado propio, y no afirmamos cifrado de extremo a extremo.',
  'safe', 'verified',
  'PE-02B5A §6 · tres cubos, los tres privados; lectura por is_org_member sobre la carpeta de la empresa; descarga por enlace firmado con caducidad.');

-- 6 · Permisos
select pg_temp.sembrar_faq_borrador(
  'seguridad_permisos', 'seguridad', 'authenticated', 50, false, 'global', '{}',
  '¿Cómo se controlan los permisos de las personas?',
  'Tu papel dentro de la empresa decide qué puedes hacer, y se comprueba en cada operación, no solo al abrir la pantalla.',
  'Hay dos cosas distintas que a veces se confunden. Que tu empresa tenga acceso a un módulo decide si se puede entrar en él. Tu papel decide qué puedes hacer una vez dentro. Lo primero es del acuerdo de tu empresa; lo segundo, de quien la administra.

Alguna información tiene reglas más estrechas que el papel: los datos de personas, por ejemplo, solo los ve quien tiene motivo para verlos.

Los miembros de tu empresa los gestiona un administrador tuyo, y solo él.',
  'safe', 'verified',
  'PE-02B5A §9 · las políticas de escritura exigen papel; funciones de permiso más estrechas para datos de personas; políticas de memberships solo para is_org_admin.');

-- 7 · Intelligence · cómo protege
select pg_temp.sembrar_faq_borrador(
  'seguridad_intelligence', 'seguridad', 'authenticated', 60, false, 'modules', '{quality}',
  '¿Cómo protege Trazaloop Intelligence la información de mi empresa?',
  'Lo que se consulta lo compone nuestro servidor leyendo la base con TU sesión y TUS permisos, y siempre acotado a tu empresa. Si tú no puedes ver un dato, no entra en la consulta, ni siquiera resumido.',
  'El modelo no tiene acceso a la base de datos ni herramientas para buscar por su cuenta: recibe un texto ya preparado y responde sobre él.

Las fuentes que Intelligence puede usar están declaradas una a una, con su nivel de sensibilidad, y se respetan los permisos de quien pregunta.

Los números los calcula la plataforma, no el modelo: el modelo los explica y señala de dónde salen, para que puedas comprobarlo.

Y queda registrado con qué proveedor y con qué modelo se produjo cada respuesta, para que dentro de un año se pueda saber con qué se respondió.',
  'safe', 'verified',
  'PE-02B5A §10 · contexto compuesto en el servidor con la sesión de quien pregunta; cero usos del cliente administrativo en lib/ai/context/; 26 fuentes con clase de privacidad; sin herramientas de búsqueda, ficheros ni código.');

-- 8 · IA y otras empresas
select pg_temp.sembrar_faq_borrador(
  'seguridad_ia_otras_empresas', 'seguridad', 'public', 70, true, 'modules', '{quality}',
  '¿La IA utiliza información de otras empresas para responderme?',
  'No. La información de una empresa no se usa como contexto de Trazaloop Intelligence para otra empresa.',
  'Cada consulta se compone en nuestro servidor, con la sesión de quien pregunta y acotada a su empresa activa. No existe ningún modo en que el contenido de una empresa entre en la respuesta de otra.

El modelo tampoco puede ir a buscarlo: no tiene acceso a la base de datos ni herramientas de búsqueda.',
  'safe', 'verified',
  'PE-02B5A §10 · el constructor de contexto acota por organization_id y lee con la sesión; el modelo no recibe herramientas.');

-- 9 · Qué recibe el proveedor
select pg_temp.sembrar_faq_borrador(
  'seguridad_que_recibe_proveedor', 'seguridad', 'public', 80, false, 'modules', '{quality}',
  '¿Qué información recibe el proveedor de inteligencia artificial?',
  'Únicamente la pregunta y el contexto que nuestro servidor seleccionó para responderla, junto con las instrucciones del sistema. No recibe la base de datos ni acceso a ella.',
  'Trazaloop no envía toda tu información: envía lo que hace falta para la pregunta concreta, elegido con tus permisos.

Tampoco se le entregan herramientas: no puede buscar en internet, ni abrir archivos, ni ejecutar código, ni consultar la base.

En cada petición se le solicita además que no almacene el contenido en sus repositorios.',
  'safe', 'verified',
  'PE-02B5A §10 y AI_PROVIDER_POLICY §3 · el adaptador envía instructions + input; store:false; sin herramientas.');

-- 10 · Entrenamiento
--
-- PE-02B6 · La dirección del producto confirmó el 2026-08-31 que Trazaloop NO
-- ha activado la autorización de uso de datos para entrenamiento. Eso es lo que
-- faltaba: la política del proveedor decía «no, por defecto» —que es del
-- proveedor— y ahora se puede añadir el ajuste de NUESTRA cuenta, que es lo que
-- una empresa quiere saber. Pasa de bloqueada a publicable CON salvedad.
select pg_temp.sembrar_faq_borrador(
  'seguridad_entrenamiento_modelos', 'seguridad', 'public', 90, true, 'modules', '{quality}',
  '¿Mis datos se utilizan para entrenar modelos de inteligencia artificial?',
  'No. Trazaloop no entrena modelos con la información de tu empresa, y no ha activado la autorización que permitiría al proveedor usarla para entrenar los suyos. Su documentación oficial establece que los datos enviados a su interfaz de programación no se usan para entrenar ni mejorar sus modelos salvo que el cliente lo autorice expresamente, y Trazaloop no lo ha autorizado.',
  'Conviene separar tres cosas, porque se confunden con facilidad.

Lo que hace Trazaloop: no entrenamos modelos con tu información, ni propios ni de nadie.

Lo que dice la política del proveedor: por defecto, lo que se le envía por su interfaz de programación no alimenta el entrenamiento de sus modelos. Esa autorización existe y es del cliente activarla.

Lo que Trazaloop ha decidido: no activarla. Es una configuración de nuestra cuenta, no una promesa del proveedor.

Lo que sí se le pide en cada consulta: que no almacene el contenido en sus repositorios. Eso reduce lo que se guarda, pero no es lo mismo que un acuerdo de retención cero — ver la pregunta sobre cuánto tiempo puede conservarlo.',
  'safe', 'verified_with_qualifier',
  'AI_PROVIDER_POLICY · documentación oficial del proveedor consultada el 2026-08-31 (política del proveedor) + confirmación de la dirección del producto del 2026-08-31 (ajuste de nuestra cuenta). Son dos fuentes distintas y la respuesta las distingue.',
  'La afirmación tiene dos mitades con procedencia distinta: la política del proveedor está verificada en su documentación oficial; que Trazaloop no haya activado la autorización lo confirmó una persona, no el repositorio. Si ese ajuste cambiara, esta respuesta pasa a ser falsa y hay que rehacerla. Y no se puede escribir que el proveedor no entrenará nunca bajo ninguna circunstancia: lo que dice es que no lo hace salvo autorización.',
  'https://developers.openai.com/api/docs/guides/your-data', '2026-08-31');

-- 11 · Conservación en el proveedor
--
-- PE-02B6 · La dirección confirmó el 2026-08-31 que Trazaloop NO tiene retención
-- cero contratada. Eso no bloquea la respuesta: la desbloquea, porque ya se
-- puede decir con certeza lo que antes solo se podía insinuar — que no la hay, y
-- que por tanto aplica el plazo del proveedor.
select pg_temp.sembrar_faq_borrador(
  'seguridad_retencion_proveedor', 'seguridad', 'public', 100, false, 'modules', '{quality}',
  '¿Cuánto tiempo puede conservar el proveedor de IA la información de una consulta?',
  'Según la documentación oficial del proveedor, las peticiones y respuestas pueden conservarse HASTA 30 DÍAS con fines de prestación del servicio y vigilancia de abusos, salvo que una obligación legal o la protección del servicio exijan más tiempo. Trazaloop no tiene contratado un acuerdo de retención cero, así que ese plazo es el que aplica.',
  '«Hasta 30 días» no significa «siempre 30 días» ni «siempre menos»: es un máximo, con las dos excepciones que la propia política nombra.

Trazaloop pide en cada consulta que el contenido no se almacene en los repositorios de la interfaz de programación. Esa petición reduce lo que se guarda, pero NO es un acuerdo de retención cero: son dos mecanismos distintos, y decimos con claridad que el segundo no lo tenemos.

Por la misma razón no afirmamos que ninguna persona del proveedor pueda acceder nunca a contenido almacenado por él. Existen controles contractuales para eso y no declaramos tenerlos.

Lo que sí controlamos: qué se envía. Solo la pregunta y el contexto que el servidor seleccionó para responderla, con tus permisos.',
  'safe', 'verified_with_qualifier',
  'AI_PROVIDER_POLICY §2 · «retained for up to 30 days, unless longer retention is required by law, or is reasonably necessary to protect our services», consultado el 2026-08-31 + confirmación de la dirección del 2026-08-31: no hay retención cero contratada.',
  'La salvedad es doble y no se puede quitar: el plazo es del proveedor y es un máximo con excepciones, y Trazaloop no tiene retención cero. Si algún día se contratara, esta respuesta hay que rehacerla — decir hoy que no la hay es lo que la hace honesta.',
  'https://developers.openai.com/api/docs/guides/your-data', '2026-08-31');

-- 12 · Acceso del modelo a la base
select pg_temp.sembrar_faq_borrador(
  'seguridad_modelo_sin_base', 'seguridad', 'public', 110, false, 'modules', '{quality}',
  '¿El modelo de IA puede acceder directamente a la base de datos?',
  'No. El modelo no se conecta a la base de datos de Trazaloop.',
  'Nuestro servidor lee las fuentes que tú puedes ver, compone un texto con esa información y se lo envía al modelo. El modelo responde sobre ese texto.

Eso significa que no hay consultas escritas por el modelo, no hay forma de que pida más de lo que se le dio, y no puede alcanzar información que tú no puedas ver.',
  'safe', 'verified',
  'PE-02B5A §10 · sin herramientas de base, búsqueda, ficheros ni código en lib/ai/; el contexto se compone antes de la petición.');

-- 13 · Frontera de decisión
select pg_temp.sembrar_faq_borrador(
  'seguridad_ia_no_decide', 'seguridad', 'authenticated', 120, false, 'modules', '{quality}',
  '¿Puede Trazaloop Intelligence modificar o aprobar información por su cuenta?',
  'No. Analiza, resume y sugiere; las decisiones formales siguen siendo de las personas.',
  'Intelligence no aprueba documentos, no cierra acciones, no declara conformidad, no clasifica no conformidades, no acepta riesgos y no aprueba proveedores. Tampoco modifica registros por su cuenta.

Lo que hace es explicar lo que ya está registrado y señalar de dónde lo sacó, para que quien decide lo haga con la información delante.',
  'safe', 'verified',
  'PE-02B5A §10 · QUALITY-12/13B5: el modelo no escribe; las acciones formales pasan por las funciones del dominio con su papel y su registro.');

-- 14 · Anonimato
select pg_temp.sembrar_faq_borrador(
  'seguridad_anonimato', 'seguridad', 'authenticated', 130, false, 'modules', '{quality}',
  '¿Cómo se protege la identidad en las respuestas anónimas de mis clientes?',
  'Cuando una campaña de voz del cliente se declara anónima, la base rechaza guardar cliente, contacto, nombre, correo o invitación junto a la respuesta. No es que la identidad se oculte: no llega a existir.',
  'Como consecuencia, Trazaloop Intelligence no puede revelar una identidad que no está guardada.

Esto aplica al modo anónimo de campaña. Una campaña identificada sí registra quién respondió, porque para eso se elige: son dos modos distintos y la elección es de tu empresa al crearla.',
  'safe', 'verified',
  'PE-02B5A §11 · disparador de 0126 que rechaza identidad en campañas anónimas; fuentes customer_comment y customer_metric marcadas anonymous.');

-- 15 · Qué puede hacerse público
select pg_temp.sembrar_faq_borrador(
  'seguridad_publicar', 'seguridad', 'public', 140, false, 'global', '{}',
  '¿Qué información puede hacerse pública en Trazaloop?',
  'Solo la que tu empresa decide publicar. Por defecto, todo es privado de tu empresa.',
  'Hoy hay dos formas de compartir hacia fuera, y las dos las inicia tu empresa:

· El pasaporte técnico textil, mediante un enlace privado que generas tú, revocable y con caducidad. Muestra la vista que publicaste, no todo el expediente.

· Las encuestas de voz del cliente, cuyo formulario se abre con el enlace que envías a tus clientes.

Fuera de eso, no hay ninguna pantalla que muestre información de una empresa sin haber iniciado sesión en ella. Compartir es una función del producto, no un fallo de aislamiento — pero conviene saber que lo compartido deja de ser privado para quien reciba el enlace.',
  'safe', 'verified',
  'PE-02B5A §3 · resolución por token de pasaporte y encuesta; anon sin privilegios sobre tablas del dominio.');
