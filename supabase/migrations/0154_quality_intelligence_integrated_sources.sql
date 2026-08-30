-- ============================================================================
-- Trazaloop · QUALITY-13B5 · LAS DOS FUENTES INTEGRADAS, EN EL CATÁLOGO
-- ----------------------------------------------------------------------------
-- POR QUÉ EXISTE ESTA MIGRACIÓN, Y POR QUÉ ES TAN PEQUEÑA
--
-- QUALITY-12 puso una guarda deliberada: `quality_ai_add_reference` rechaza
-- cualquier cita cuya fuente no esté en `quality_ai_sources`. Es la razón por la
-- que una cita solo puede apuntar a algo que el catálogo reconoce, y no se toca.
--
-- B5 añade dos fuentes de contexto —la atención convergida de B3 y el contexto
-- de proceso de B1/B2— que no existían cuando se escribió ese catálogo. Sin
-- registrarlas, sus citas se rechazan: la respuesta las enseña y el servidor no
-- las guarda. Es decir, una cita **no direccionable**, que es exactamente lo que
-- §18 del encargo prohíbe.
--
-- Se comprobó midiendo, no leyendo: la suite de QUALITY-12 empezó a fallar en
-- «las citas están guardadas y tienen enlace interno» en cuanto las dos fuentes
-- entraron en juego.
--
--
-- LO QUE NO HACE
--
--   · No crea ninguna tabla. Es un `insert` en un catálogo que ya existe, con la
--     misma forma que las veinticuatro filas que ya están.
--   · No toca el proveedor, ni el libro de consumo, ni los topes, ni los precios.
--     B5 reutiliza `quality_ai_runs` entero y no abre ninguna cuota aparte.
--   · No añade casos de uso: los nuevos habrían quedado fuera de
--     `intelligence_use_cases` y con ellos fuera su clase de coste y su tope.
--   · No reabre ninguna decisión de dominio (QI-01…QI-29).
--
--
-- LAS DOS FILAS, CAMPO POR CAMPO
--
--   privacy_class = 'open'      ninguna de las dos añade datos personales: la
--                               atención lleva sujeto, motivo y enlace, y el
--                               contexto de proceso lleva recuentos y muestras.
--                               Lo que cada fuente de origen no deja ver, sigue
--                               sin verse: las dos leen con la sesión de quien
--                               pregunta.
--
--   historical_mode = 'current' y esto es lo importante: NINGUNA de las dos
--                               reconstruye el pasado. La atención es la de
--                               ahora y el contexto de proceso es el de ahora.
--                               Declararlo aquí es lo que hace que, al preguntar
--                               por una fecha pasada, el constructor avise de que
--                               esa fuente responde con su estado actual en vez
--                               de rellenar el hueco en silencio.
-- ============================================================================

insert into public.quality_ai_sources
  (code, label, domain, entity_type, privacy_class, historical_mode,
   permission_note, deep_link, position_order)
values
  ('attention', 'Lo que requiere atención', 'cross_domain', 'quality_attention_item',
   'open', 'current',
   'Miembro de la empresa. Cada dominio conserva su propio permiso: lo que tu rol no puede ver no entra, y si un dominio no se pudo leer se dice.',
   '/quality', 25),
  ('process_context', 'Contexto integrado de un proceso', 'cross_domain', 'quality_process',
   'open', 'current',
   'Miembro de la empresa. Se compone con las primitivas de proceso, que ya respetan el permiso de cada dominio; una seccion denegada se omite y se declara.',
   '/quality/processes', 26)
on conflict (code) do nothing;

comment on table public.quality_ai_sources is
  'QUALITY-12 · §11 · El catalogo de fuentes que el Copilot sabe citar. QUALITY-13B5 anadio dos transversales: la atencion convergida y el contexto de proceso. Una cita cuya fuente no este aqui se rechaza, y esa guarda no se toca.';
