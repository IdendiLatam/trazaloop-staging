-- 0022_seed_sprint2.sql
-- Trazaloop · Sprint 2 · Semillas de catálogos globales.
-- SOLO catálogos globales; ningún dato de empresas de ejemplo.
-- REGLA DE CONTENIDO: se citan únicamente normas técnicas (NTC 6632:2022,
-- UNE-EN 15343:2008 y normas de apoyo como NTC-ISO 14021). El barrido
-- tests/compliance verifica que ningún texto del producto viole esta regla.

-- ---------------------------------------------------------------------------
-- frameworks
-- ---------------------------------------------------------------------------
insert into public.frameworks (code, name, version_label, standard_body, is_active) values
  ('NTC6632',     'NTC 6632',      '2022', null, true),
  ('UNEEN15343',  'UNE-EN 15343',  '2008', null, true)
on conflict (code, version_label) do nothing;

-- ---------------------------------------------------------------------------
-- requirements (alto nivel)
-- ---------------------------------------------------------------------------
insert into public.requirements (framework_id, code, title, description, order_index)
select f.id, v.code, v.title, v.description, v.ord
from (values
  ('R01', 'Material de entrada',                'Control e información del material que ingresa al proceso.', 1),
  ('R02', 'Identificación y control de lotes',  'Identificación única y control de lotes en toda la operación.', 2),
  ('R03', 'Trazabilidad de origen',             'Conocimiento y soporte del origen del material reciclado.', 3),
  ('R04', 'Control del proceso',                'Registro y control de las etapas y variables del proceso productivo.', 4),
  ('R05', 'Control de calidad',                 'Controles de calidad sobre materiales y productos.', 5),
  ('R06', 'Trazabilidad hasta producto final',  'Relación reconstruible entre entradas, proceso y producto terminado.', 6),
  ('R07', 'Cálculo de contenido reciclado',     'Determinación del porcentaje de contenido reciclado con masas reales.', 7),
  ('R08', 'Evidencia documental',               'Registros y soportes que respaldan la trazabilidad y las declaraciones.', 8),
  ('R09', 'Exclusiones del cálculo',            'Materiales que no deben contarse como contenido reciclado.', 9),
  ('R10', 'Competencia del personal',           'Capacitación y competencia del personal involucrado.', 10),
  ('R11', 'Mejora y acciones correctivas',      'Gestión de desviaciones, acciones correctivas y mejora.', 11)
) as v(code, title, description, ord)
join public.frameworks f on f.code = 'NTC6632' and f.version_label = '2022'
on conflict (framework_id, code) do nothing;

insert into public.requirements (framework_id, code, title, description, order_index)
select f.id, v.code, v.title, v.description, v.ord
from (values
  ('T01', 'Trazabilidad de origen del material',   'Información sobre la procedencia del material reciclado.', 1),
  ('T02', 'Identificación de lotes',               'Identificación de lotes de entrada y de producto.', 2),
  ('T03', 'Control del proceso de transformación', 'Registro de las etapas del proceso de reciclado o transformación.', 3),
  ('T04', 'Caracterización del material',          'Conocimiento de las características del material reciclado.', 4),
  ('T05', 'Registros de trazabilidad',             'Conservación de registros que permiten reconstruir la cadena.', 5),
  ('T06', 'Contenido reciclado',                   'Determinación y soporte del contenido reciclado del producto.', 6)
) as v(code, title, description, ord)
join public.frameworks f on f.code = 'UNEEN15343' and f.version_label = '2008'
on conflict (framework_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- diagnostic_sections
-- ---------------------------------------------------------------------------
insert into public.diagnostic_sections (code, title, description, order_index, weight) values
  ('input_materials',   'Material de entrada y proveedores',       'Cómo recibe, identifica y clasifica el material que ingresa.', 1, 1),
  ('process_control',   'Proceso productivo y control de calidad', 'Cómo registra la producción y controla la calidad.', 2, 1),
  ('traceability',      'Trazabilidad e identificación de lotes',  'Si puede reconstruir la cadena desde la entrada hasta el producto.', 3, 1),
  ('recycled_content',  'Contenido reciclado y soporte documental','Cómo calcula y respalda el contenido reciclado.', 4, 1),
  ('people_competence', 'Personal, capacitación y competencias',   'Si el personal sabe hacer y registrar su trabajo.', 5, 1),
  ('improvement',       'No conformidades, acciones y mejora',     'Cómo gestiona desviaciones y mejora el proceso.', 6, 1)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- diagnostic_questions (52; Sí = mayor preparación; peso 1; críticas marcadas)
-- ---------------------------------------------------------------------------
insert into public.diagnostic_questions
  (section_id, requirement_id, code, question_text, help_text, standard_refs, weight, is_critical, order_index, recommended_action)
select
  s.id,
  r.id,
  v.qcode,
  v.qtext,
  v.help,
  v.refs,
  1,
  v.critical,
  v.ord,
  v.action
from (values
  -- ============ Sección 1 · input_materials ============
  ('input_materials','R02','S1Q01','¿La empresa identifica cada lote de material plástico que ingresa?',
   'Un lote es una cantidad de material que se recibe y maneja como una unidad.',
   array['NTC 6632:2022','UNE-EN 15343:2008'], true, 1,
   'Implemente un registro de recepción donde cada ingreso de material quede identificado como un lote.'),
  ('input_materials','R02','S1Q02','¿Cada lote de entrada tiene un código o identificación única?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], true, 2,
   'Defina una codificación única de lotes de entrada (por ejemplo: fecha + proveedor + consecutivo).'),
  ('input_materials','R01','S1Q03','¿La empresa registra el proveedor de cada lote de material de entrada?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], true, 3,
   'Agregue el proveedor como dato obligatorio del registro de recepción de cada lote.'),
  ('input_materials','R01','S1Q04','¿La empresa registra la fecha de recepción de cada lote de material de entrada?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], false, 4,
   'Incluya la fecha de recepción en el registro de cada lote de entrada.'),
  ('input_materials','R03','S1Q05','¿La empresa clasifica el material de entrada según su origen?',
   'Origen: de dónde proviene el material antes de llegar a la planta.',
   array['NTC 6632:2022','UNE-EN 15343:2008'], true, 5,
   'Clasifique cada material recibido según su origen y regístrelo en la recepción.'),
  ('input_materials','R03','S1Q06','¿La empresa diferencia material posconsumo, preconsumo, postindustrial, virgen y reproceso interno?',
   'Estas categorías afectan qué material puede contarse como reciclado según las normas aplicables.',
   array['NTC 6632:2022','UNE-EN 15343:2008'], false, 6,
   'Adopte las categorías de material de las normas aplicables y capacite al personal para diferenciarlas.'),
  ('input_materials','R03','S1Q07','¿La empresa conserva soportes del origen del material reciclado recibido?',
   'Por ejemplo: declaraciones del proveedor, remisiones o fichas del material.',
   array['NTC 6632:2022','UNE-EN 15343:2008'], true, 7,
   'Solicite y archive un soporte de origen por cada lote de material reciclado recibido.'),
  ('input_materials','R01','S1Q08','¿La empresa verifica que el proveedor entregue información suficiente sobre el material reciclado?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], false, 8,
   'Defina qué información mínima debe entregar el proveedor y verifíquela en cada recepción.'),
  ('input_materials','R08','S1Q09','¿La empresa mantiene registros actualizados de los materiales reciclados que ingresan?',
   null, array['NTC 6632:2022'], false, 9,
   'Mantenga al día un listado de materiales reciclados con su clasificación y soporte.'),
  ('input_materials','R02','S1Q10','¿La empresa identifica físicamente los materiales durante almacenamiento para evitar mezclas no controladas?',
   null, array['UNE-EN 15343:2008','NTC 6632:2022'], false, 10,
   'Marque físicamente los materiales almacenados (etiquetas, zonas o contenedores identificados).'),

  -- ============ Sección 2 · process_control ============
  ('process_control','R04','S2Q11','¿La empresa registra las órdenes de producción donde se usa material reciclado?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], true, 11,
   'Implemente un registro de órdenes de producción que indique cuándo se usa material reciclado.'),
  ('process_control','R04','S2Q12','¿La empresa registra qué lotes de entrada se consumen en cada orden de producción?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], true, 12,
   'Registre en cada orden de producción los lotes de entrada consumidos.'),
  ('process_control','R04','S2Q13','¿La empresa registra la cantidad de material consumido en cada orden de producción?',
   'La cantidad (masa) consumida es la base del cálculo de contenido reciclado.',
   array['NTC 6632:2022','UNE-EN 15343:2008'], true, 13,
   'Registre la masa consumida de cada material en cada orden de producción.'),
  ('process_control','R04','S2Q14','¿La empresa registra las variables principales del proceso productivo?',
   null, array['UNE-EN 15343:2008'], false, 14,
   'Defina y registre las variables principales del proceso (por ejemplo: temperatura, tiempos, equipo).'),
  ('process_control','R06','S2Q15','¿La empresa identifica cada lote de producto terminado?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], true, 15,
   'Asigne un código único a cada lote de producto terminado.'),
  ('process_control','R06','S2Q16','¿Cada lote de producto terminado puede relacionarse con una orden de producción?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], true, 16,
   'Vincule cada lote de producto terminado con la orden de producción que lo generó.'),
  ('process_control','R05','S2Q17','¿La empresa realiza controles de calidad sobre los productos fabricados con material reciclado?',
   null, array['NTC 6632:2022'], false, 17,
   'Defina controles de calidad mínimos para los productos con material reciclado.'),
  ('process_control','R05','S2Q18','¿La empresa conserva registros de los controles de calidad realizados?',
   null, array['NTC 6632:2022'], false, 18,
   'Conserve los registros de calidad asociados a cada lote o producción.'),
  ('process_control','R05','S2Q19','¿La empresa revisa los resultados de calidad para detectar desviaciones del proceso?',
   null, array['NTC 6632:2022'], false, 19,
   'Revise periódicamente los resultados de calidad y registre las desviaciones detectadas.'),
  ('process_control','R05','S2Q20','¿La empresa tiene criterios definidos para aceptar o rechazar producto no conforme?',
   null, array['NTC 6632:2022'], false, 20,
   'Documente criterios claros de aceptación y rechazo de producto no conforme.'),

  -- ============ Sección 3 · traceability ============
  ('traceability','R06','S3Q21','¿La empresa puede reconstruir la trazabilidad desde el producto terminado hasta los lotes de entrada?',
   'Es decir: partiendo de un producto, saber qué materiales y proveedores lo componen.',
   array['UNE-EN 15343:2008','NTC 6632:2022'], true, 21,
   'Asegure el vínculo producto → orden → lotes de entrada para poder reconstruir la cadena hacia atrás.'),
  ('traceability','R06','S3Q22','¿La empresa puede reconstruir la trazabilidad desde un lote de entrada hasta los productos fabricados con él?',
   null, array['UNE-EN 15343:2008','NTC 6632:2022'], true, 22,
   'Asegure el vínculo lote de entrada → órdenes → productos para poder reconstruir la cadena hacia adelante.'),
  ('traceability','R02','S3Q23','¿Los materiales se mantienen identificados durante producción, almacenamiento y entrega?',
   null, array['UNE-EN 15343:2008'], false, 23,
   'Mantenga la identificación de los materiales en todas las etapas, no solo en la recepción.'),
  ('traceability','R03','S3Q24','¿La empresa evita mezclar materiales de origen diferente sin registrarlo?',
   null, array['UNE-EN 15343:2008','NTC 6632:2022'], false, 24,
   'Cuando se mezclen materiales de origen distinto, registre qué se mezcló y en qué cantidad.'),
  ('traceability','R08','S3Q25','¿La empresa conserva registros de cada etapa relevante del proceso?',
   null, array['UNE-EN 15343:2008','NTC 6632:2022'], true, 25,
   'Defina las etapas relevantes del proceso y conserve un registro por cada una.'),
  ('traceability','R06','S3Q26','¿La empresa entrega o puede entregar información de trazabilidad cuando el cliente la solicita?',
   null, array['UNE-EN 15343:2008'], false, 26,
   'Prepare un formato de respuesta con la información de trazabilidad que puede entregar a clientes.'),
  ('traceability','R02','S3Q27','¿La empresa usa identificadores únicos para los lotes de producto terminado?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], true, 27,
   'Establezca identificadores únicos por lote de producto terminado y úselos en etiquetas y registros.'),
  ('traceability','R04','S3Q28','¿La empresa controla los cambios de lote durante la producción?',
   null, array['UNE-EN 15343:2008'], false, 28,
   'Registre el momento y las condiciones de cada cambio de lote durante la producción.'),
  ('traceability','R06','S3Q29','¿La empresa tiene un procedimiento o método definido para gestionar la trazabilidad?',
   null, array['UNE-EN 15343:2008','NTC 6632:2022'], true, 29,
   'Documente un procedimiento sencillo de trazabilidad: qué se registra, quién, cuándo y dónde.'),
  ('traceability','R08','S3Q30','¿La empresa revisa periódicamente si sus registros de trazabilidad son completos?',
   null, array['NTC 6632:2022'], false, 30,
   'Programe revisiones periódicas de los registros de trazabilidad para detectar vacíos.'),

  -- ============ Sección 4 · recycled_content ============
  ('recycled_content','R07','S4Q31','¿La empresa calcula el porcentaje de contenido reciclado de sus productos?',
   null, array['NTC 6632:2022','UNE-EN 15343:2008'], true, 31,
   'Implemente el cálculo del contenido reciclado: masa de material reciclado válido sobre masa total del producto.'),
  ('recycled_content','R07','S4Q32','¿El cálculo utiliza masas reales de materiales consumidos?',
   'Masas reales: cantidades pesadas o registradas, no estimaciones.',
   array['NTC 6632:2022','UNE-EN 15343:2008'], true, 32,
   'Use masas reales registradas en producción como base del cálculo, no porcentajes teóricos de fórmula.'),
  ('recycled_content','R07','S4Q33','¿El cálculo diferencia material reciclado, material virgen, aditivos, pigmentos y cargas?',
   null, array['NTC 6632:2022'], false, 33,
   'Desglose la composición del producto por tipo de material antes de calcular.'),
  ('recycled_content','R09','S4Q34','¿La empresa excluye el material recuperado en el mismo proceso cuando calcula contenido reciclado?',
   'El material recuperado en el mismo proceso que lo generó (scrap, retales, mermas reprocesadas) no cuenta como contenido reciclado según las normas aplicables.',
   array['NTC 6632:2022','UNE-EN 15343:2008'], true, 34,
   'Excluya del contenido reciclado el material recuperado en el mismo proceso; cuéntelo solo en la masa total.'),
  ('recycled_content','R09','S4Q35','¿La empresa considera como reciclado únicamente material permitido por la metodología definida?',
   null, array['NTC 6632:2022'], false, 35,
   'Defina por escrito qué categorías de material cuentan como reciclado y aplíquelo de forma consistente.'),
  ('recycled_content','R07','S4Q36','¿El resultado del cálculo queda registrado por lote, producto u orden de producción?',
   null, array['NTC 6632:2022'], false, 36,
   'Registre cada cálculo con su fecha, datos usados y resultado, asociado al lote, producto u orden.'),
  ('recycled_content','R08','S4Q37','¿La empresa conserva evidencia documental que respalda el contenido reciclado declarado?',
   null, array['NTC 6632:2022','NTC-ISO 14021'], true, 37,
   'Archive la evidencia (soportes de origen, registros de masa, cálculos) que respalda cada declaración.'),
  ('recycled_content','R08','S4Q38','¿Cada material contado como reciclado tiene soporte de origen?',
   'Sin soporte de origen, un material no debería contarse como reciclado.',
   array['NTC 6632:2022','NTC-ISO 14021'], true, 38,
   'Verifique que todo material contado como reciclado tenga su soporte de origen archivado y vigente.'),
  ('recycled_content','R07','S4Q39','¿La empresa compara el contenido reciclado calculado contra el contenido reciclado declarado?',
   null, array['NTC 6632:2022','NTC-ISO 14021'], false, 39,
   'Compare periódicamente el porcentaje calculado contra el declarado y registre las diferencias.'),
  ('recycled_content','R09','S4Q40','¿La empresa puede explicar qué materiales fueron incluidos y excluidos del cálculo?',
   null, array['NTC 6632:2022'], true, 40,
   'Documente, por cada cálculo, la lista de materiales incluidos y excluidos con su razón.'),

  -- ============ Sección 5 · people_competence ============
  ('people_competence','R10','S5Q41','¿El personal que maneja material reciclado conoce los criterios básicos de identificación y separación?',
   null, array['NTC 6632:2022'], true, 41,
   'Capacite al personal operativo en identificación y separación de materiales por origen.'),
  ('people_competence','R10','S5Q42','¿El personal que registra información de lotes sabe cómo diligenciar los registros requeridos?',
   null, array['NTC 6632:2022'], true, 42,
   'Entrene al personal en el diligenciamiento correcto de los registros de lotes y producción.'),
  ('people_competence','R10','S5Q43','¿La empresa capacita al personal involucrado en trazabilidad y contenido reciclado?',
   null, array['NTC 6632:2022'], false, 43,
   'Programe capacitaciones periódicas sobre trazabilidad y contenido reciclado.'),
  ('people_competence','R10','S5Q44','¿La empresa conserva registros de capacitación del personal relacionado con estos procesos?',
   null, array['NTC 6632:2022'], false, 44,
   'Conserve registros de asistencia y contenido de cada capacitación realizada.'),
  ('people_competence','R10','S5Q45','¿La empresa verifica que el personal aplique correctamente los procedimientos de trabajo?',
   null, array['NTC 6632:2022'], true, 45,
   'Verifique en piso la aplicación de los procedimientos y registre las verificaciones.'),
  ('people_competence','R10','S5Q46','¿La empresa actualiza la capacitación cuando cambian procesos, productos o requisitos técnicos?',
   null, array['NTC 6632:2022'], false, 46,
   'Actualice la capacitación cada vez que cambien procesos, productos o requisitos técnicos.'),

  -- ============ Sección 6 · improvement ============
  ('improvement','R11','S6Q47','¿La empresa registra desviaciones o problemas relacionados con material reciclado?',
   null, array['NTC 6632:2022'], true, 47,
   'Implemente un registro sencillo de desviaciones o problemas relacionados con material reciclado.'),
  ('improvement','R11','S6Q48','¿La empresa analiza las causas de las desviaciones detectadas?',
   null, array['NTC 6632:2022'], false, 48,
   'Analice la causa de cada desviación relevante antes de definir la acción.'),
  ('improvement','R11','S6Q49','¿La empresa implementa acciones correctivas cuando encuentra fallas de trazabilidad o cálculo?',
   null, array['NTC 6632:2022'], true, 49,
   'Defina e implemente acciones correctivas cuando detecte fallas de trazabilidad o de cálculo.'),
  ('improvement','R11','S6Q50','¿La empresa verifica si las acciones correctivas fueron eficaces?',
   null, array['NTC 6632:2022'], false, 50,
   'Revise después de un tiempo si la acción correctiva eliminó el problema y regístrelo.'),
  ('improvement','R11','S6Q51','¿La empresa revisa periódicamente sus registros para mejorar la trazabilidad?',
   null, array['NTC 6632:2022'], false, 51,
   'Programe revisiones periódicas de registros para identificar mejoras de trazabilidad.'),
  ('improvement','R11','S6Q52','¿La empresa conserva evidencia de las acciones tomadas para mejorar el proceso?',
   null, array['NTC 6632:2022'], true, 52,
   'Conserve la evidencia de cada acción de mejora implementada (qué se hizo, cuándo y resultado).')
) as v(section_code, req_code, qcode, qtext, help, refs, critical, ord, action)
join public.diagnostic_sections s on s.code = v.section_code
join public.frameworks f on f.code = 'NTC6632' and f.version_label = '2022'
join public.requirements r on r.framework_id = f.id and r.code = v.req_code
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- material_classifications
-- Banderas para el cálculo futuro (Sprint 4): elegible como reciclado,
-- exige soporte, nunca cuenta, reclasificación permitida.
-- ---------------------------------------------------------------------------
insert into public.material_classifications
  (code, label, eligible_as_recycled, requires_support, never_counts, can_reclassify_to, description) values
  ('preconsumer_valid',     'Reciclado preconsumo válido',   true,  true,  false, null,
   'Material recuperado antes del consumo, proveniente de un proceso externo, con soporte de origen.'),
  ('postconsumer_valid',    'Reciclado posconsumo válido',   true,  true,  false, null,
   'Material recuperado después del uso por el consumidor, con soporte de origen.'),
  ('postindustrial',        'Postindustrial',                false, false, false, 'preconsumer_valid',
   'Material de origen industrial externo. Por defecto no cuenta como reciclado; puede reclasificarse a preconsumo válido con soporte y justificación.'),
  ('internal_same_process', 'Recuperado en el mismo proceso',false, false, true,  null,
   'Scrap, retales, mermas o reproceso del mismo proceso que lo generó. Nunca cuenta como contenido reciclado; sí suma a la masa total.'),
  ('virgin',                'Virgen',                        false, false, false, null,
   'Material virgen sin contenido reciclado.'),
  ('additive',              'Aditivo',                       false, false, false, null,
   'Aditivo del proceso o del producto.'),
  ('pigment',               'Pigmento',                      false, false, false, null,
   'Pigmento o colorante.'),
  ('mineral_filler',        'Carga mineral',                 false, false, false, null,
   'Carga mineral incorporada al producto.'),
  ('masterbatch',           'Masterbatch',                   false, false, false, null,
   'Concentrado de color o aditivos; su portador suele ser virgen.'),
  ('other',                 'Otro',                          false, false, false, null,
   'Otro material. Requiere criterio explícito documentado para el cálculo.')
on conflict (code) do nothing;
