-- 0044_trazadocs_seed_blueprints.sql
-- Trazaloop · Sprint 9 · Estructuras sugeridas (blueprints) y secciones
-- con sus tips, para los 11 documentos sugeridos iniciales (Parte 3/4/14).
--
-- ESTO NO ES UN CASO PILOTO NI DATOS DEMO: son estructuras y ayudas de
-- plataforma (configuración base, administrada después desde
-- /platform/trazadocs), sin ningún contenido diligenciado de ninguna
-- empresa. No lleva datos reales de ninguna organización.

-- Manual técnico del sistema de trazabilidad
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('manual_tecnico_trazabilidad', 'Manual técnico del sistema de trazabilidad', 'Visión general de cómo funciona el sistema de trazabilidad de la empresa dentro de Trazaloop.', 'manual', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este documento y qué busca controlar dentro del sistema de trazabilidad.', 1, true),
    ('alcance_sistema', 'Alcance del sistema', 'Indica qué materiales, productos, sitios o procesos cubre el sistema de trazabilidad de la empresa.', 2, true),
    ('estructura_general', 'Estructura general', 'Describe en términos generales cómo está organizado el sistema: catálogos, trazabilidad, cálculo y soporte técnico.', 3, true),
    ('roles_responsabilidades', 'Roles y responsabilidades', 'Indica quién administra la empresa, quién valida evidencias y quién carga datos operativos dentro de Trazaloop.', 4, true),
    ('flujo_informacion', 'Flujo de información', 'Describe cómo se mueve la información desde el proveedor hasta el lote producido y el cálculo de contenido reciclado.', 5, true),
    ('catalogos', 'Catálogos', 'Explica qué catálogos mantiene la empresa (proveedores, materiales, productos, familias) y quién los actualiza.', 6, true),
    ('evidencias', 'Evidencias', 'Explica qué evidencias se exigen para respaldar el origen de los materiales reciclados y cómo se validan.', 7, true),
    ('trazabilidad', 'Trazabilidad', 'Describe cómo se relacionan lotes de entrada, órdenes / corridas de producción y lotes producidos / lotes finales.', 8, true),
    ('calculo', 'Cálculo', 'Describe, en términos generales, cómo se calcula el contenido reciclado a partir de la composición de cada lote.', 9, true),
    ('dossier_tecnico', 'Dossier técnico', 'Explica para qué sirve el dossier técnico de un cálculo y cuándo se debe revisar.', 10, true),
    ('implementacion_mejora', 'Implementación y mejora', 'Describe cómo la empresa registra hallazgos o mejoras durante la prueba real del sistema.', 11, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 12, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'manual_tecnico_trazabilidad';

-- Procedimiento de trazabilidad de material reciclado
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('procedimiento_trazabilidad_material_reciclado', 'Procedimiento de trazabilidad de material reciclado', 'Cómo la empresa sigue un material reciclado desde su recepción hasta el lote producido / lote final.', 'procedure', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este procedimiento y qué busca controlar dentro del sistema de trazabilidad.', 1, true),
    ('alcance', 'Alcance', 'Indica desde dónde inicia y hasta dónde llega este procedimiento. Por ejemplo, desde la recepción del material reciclado hasta el lote producido / lote final.', 2, true),
    ('responsables', 'Responsables', 'Indica qué rol (administrador, supervisor o consultor) es responsable de cada paso de la trazabilidad.', 3, true),
    ('definiciones', 'Definiciones', 'Define los términos propios de este procedimiento que no sean obvios para quien lo lea por primera vez.', 4, true),
    ('identificacion_materiales', 'Identificación de materiales reciclados', 'Explica cómo la empresa reconoce e identifica un material como reciclado dentro de su catálogo.', 5, true),
    ('trazabilidad_lotes_entrada', 'Trazabilidad de lotes de entrada', 'Describe cómo se registra cada lote de entrada y cómo queda vinculado a su proveedor y material.', 6, true),
    ('trazabilidad_orden_produccion', 'Trazabilidad de orden / corrida de producción', 'Describe cómo se registra una orden / corrida de producción y qué lotes de entrada consume.', 7, true),
    ('trazabilidad_lote_producido', 'Trazabilidad de lote producido / lote final', 'Explique cómo la empresa identifica el lote producido, cómo lo relaciona con la orden / corrida de producción y cómo conserva la relación con los materiales consumidos.', 8, true),
    ('registros_asociados', 'Registros asociados', 'Enumera los registros o evidencias que soportan este procedimiento, como lotes de entrada, órdenes / corridas, lotes producidos, evidencias de origen o cálculos.', 9, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 10, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'procedimiento_trazabilidad_material_reciclado';

-- Procedimiento de recepción de material reciclado
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('procedimiento_recepcion_material_reciclado', 'Procedimiento de recepción de material reciclado', 'Cómo se recibe, verifica y registra un material reciclado al llegar a la empresa.', 'procedure', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este procedimiento y qué busca controlar al recibir material reciclado.', 1, true),
    ('alcance', 'Alcance', 'Indica desde qué momento inicia la recepción (por ejemplo, la llegada del vehículo del proveedor) y hasta dónde llega (el registro del lote de entrada).', 2, true),
    ('responsables', 'Responsables', 'Indica quién recibe el material, quién lo inspecciona y quién registra el lote de entrada en Trazaloop.', 3, true),
    ('verificacion_proveedor', 'Verificación del proveedor', 'Describe cómo se confirma que el proveedor que entrega el material ya existe en el catálogo de la empresa.', 4, true),
    ('verificacion_documental', 'Verificación documental', 'Describe qué evidencia de origen se revisa antes de aceptar el material (por ejemplo, ficha del proveedor o certificado de origen).', 5, true),
    ('inspeccion_material', 'Inspección del material recibido', 'Describe qué se revisa físicamente del material (cantidad, calidad, tipo) antes de registrarlo.', 6, true),
    ('registro_lote_entrada', 'Registro de lote de entrada', 'Describe cómo se crea el lote de entrada en Trazaloop: código, cantidad, material y proveedor.', 7, true),
    ('tratamiento_inconsistencias', 'Tratamiento de inconsistencias', 'Describe qué hacer si el material recibido no coincide con lo esperado (cantidad, tipo o evidencia).', 8, true),
    ('registros_asociados', 'Registros asociados', 'Enumera los registros que soportan este procedimiento: lotes de entrada, evidencias de origen y proveedores.', 9, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 10, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'procedimiento_recepcion_material_reciclado';

-- Procedimiento de clasificación de materiales reciclados
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('procedimiento_clasificacion_materiales_reciclados', 'Procedimiento de clasificación de materiales reciclados', 'Cómo la empresa clasifica sus materiales según la normativa y qué evidencia respalda esa clasificación.', 'procedure', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este procedimiento y qué busca controlar al clasificar materiales.', 1, true),
    ('alcance', 'Alcance', 'Indica qué materiales cubre este procedimiento (todos los del catálogo, o solo los reciclados).', 2, true),
    ('criterios_clasificacion', 'Criterios de clasificación', 'Describe con qué criterios la empresa decide en qué categoría normativa clasificar cada material.', 3, true),
    ('clasificacion_preconsumo', 'Clasificación como preconsumo', 'Describe cuándo un material se clasifica como reciclado preconsumo y qué lo distingue.', 4, true),
    ('clasificacion_posconsumo', 'Clasificación como posconsumo', 'Describe cuándo un material se clasifica como reciclado posconsumo y qué lo distingue.', 5, true),
    ('material_no_elegible', 'Material no elegible', 'Describe qué materiales NO cuentan como reciclado y por qué (por ejemplo, material virgen).', 6, true),
    ('reclasificacion', 'Reclasificación, si aplica', 'Describe cuándo y cómo se reclasifica un material que estaba mal clasificado, y qué evidencia respalda ese cambio.', 7, true),
    ('evidencias_requeridas', 'Evidencias requeridas', 'Indica qué evidencia de origen debe existir y estar validada para sostener la clasificación de cada material.', 8, true),
    ('responsables', 'Responsables', 'Indica quién clasifica los materiales y quién revisa o aprueba una reclasificación.', 9, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 10, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'procedimiento_clasificacion_materiales_reciclados';

-- Procedimiento de control de evidencias de origen
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('procedimiento_control_evidencias_origen', 'Procedimiento de control de evidencias de origen', 'Cómo se cargan, revisan, validan y conservan las evidencias que respaldan el origen del material reciclado.', 'procedure', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este procedimiento y qué busca controlar sobre las evidencias de origen.', 1, true),
    ('alcance', 'Alcance', 'Indica qué tipos de evidencia cubre este procedimiento y a qué materiales o proveedores aplica.', 2, true),
    ('tipos_evidencias_aceptadas', 'Tipos de evidencias aceptadas', 'Enumera qué tipos de evidencia acepta la empresa como soporte de origen (fichas de proveedor, certificados, declaraciones, etc.).', 3, true),
    ('criterios_revision', 'Criterios de revisión', 'Describe qué se revisa de cada evidencia antes de aceptarla (vigencia, legibilidad, coincidencia con el material).', 4, true),
    ('validacion_evidencias', 'Validación de evidencias', 'Describe quién valida una evidencia dentro de Trazaloop y qué la hace pasar de pendiente a válida.', 5, true),
    ('asociacion_material', 'Asociación de evidencias al material', 'Describe cómo se vincula una evidencia validada como soporte de origen de un material específico.', 6, true),
    ('conservacion_evidencias', 'Conservación de evidencias', 'Describe por cuánto tiempo y de qué forma se conservan las evidencias cargadas en la empresa.', 7, true),
    ('responsables', 'Responsables', 'Indica quién carga, quién valida y quién audita las evidencias de origen.', 8, true),
    ('registros_asociados', 'Registros asociados', 'Enumera los registros que soportan este procedimiento: evidencias, materiales y su soporte de origen.', 9, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 10, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'procedimiento_control_evidencias_origen';

-- Procedimiento de producción
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('procedimiento_produccion', 'Procedimiento de producción', 'Cómo se prepara, ejecuta y registra una orden / corrida de producción hasta obtener el lote producido / lote final.', 'procedure', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este procedimiento y qué busca controlar durante la producción.', 1, true),
    ('alcance', 'Alcance', 'Indica desde dónde inicia (preparación de la orden / corrida) y hasta dónde llega (registro del lote producido) este procedimiento.', 2, true),
    ('responsables', 'Responsables', 'Indica quién prepara la orden, quién registra los consumos y quién identifica el lote producido.', 3, true),
    ('preparacion_orden', 'Preparación de la orden / corrida de producción', 'Describe cómo se crea la orden / corrida de producción antes de iniciar la producción física.', 4, true),
    ('consumo_lotes_entrada', 'Consumo de lotes de entrada', 'Describe cómo se registran los lotes de entrada realmente consumidos por la orden / corrida.', 5, true),
    ('control_durante_produccion', 'Control durante producción', 'Describe qué controles se hacen mientras la producción está en curso (cantidades, mezclas, incidencias).', 6, true),
    ('identificacion_lote_producido', 'Identificación del lote producido / lote final', 'Describe cómo se asigna un código al lote producido / lote final y cómo queda vinculado a su orden / corrida.', 7, true),
    ('registro_composicion', 'Registro de composición', 'Describe cómo se registra qué materiales y en qué masa componen el lote producido / lote final.', 8, true),
    ('manejo_desviaciones', 'Manejo de desviaciones', 'Describe qué hacer si la producción se desvía de lo planeado (por ejemplo, diferencias de masa).', 9, true),
    ('registros_asociados', 'Registros asociados', 'Enumera los registros que soportan este procedimiento: órdenes / corridas, consumos, lotes producidos y composición.', 10, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 11, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'procedimiento_produccion';

-- Procedimiento de cálculo de contenido reciclado
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('procedimiento_calculo_contenido_reciclado', 'Procedimiento de cálculo de contenido reciclado', 'Cómo se calcula el contenido reciclado de un lote producido y cómo se revisan sus resultados.', 'procedure', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este procedimiento y qué busca controlar en el cálculo de contenido reciclado.', 1, true),
    ('alcance', 'Alcance', 'Indica desde dónde inicia (composición registrada) y hasta dónde llega (resultado revisado) este procedimiento.', 2, true),
    ('responsables', 'Responsables', 'Indica quién calcula, quién revisa el resultado y quién decide si el dossier queda listo como respaldo técnico.', 3, true),
    ('datos_requeridos', 'Datos requeridos para el cálculo', 'Enumera qué datos deben existir antes de calcular: composición, evidencias de origen y clasificación de materiales.', 4, true),
    ('composicion_lote', 'Composición del lote producido / lote final', 'Describe cómo se registra la composición (materiales y masas) que alimenta el cálculo.', 5, true),
    ('evidencias_requeridas', 'Evidencias requeridas', 'Indica qué evidencias de origen deben estar validadas para que el cálculo sea defendible.', 6, true),
    ('criterios_material_cuenta', 'Criterios para material que cuenta', 'Describe qué hace que un material cuente o no como reciclado dentro del cálculo (clasificación, soporte, mismo proceso).', 7, true),
    ('revision_resultados', 'Revisión de resultados', 'Describe cómo se revisa el porcentaje calculado antes de darlo por bueno, incluida la comparación con el porcentaje declarado.', 8, true),
    ('manejo_brechas', 'Manejo de advertencias o brechas', 'Describe qué hacer cuando el cálculo queda con advertencias o brechas de soporte identificadas.', 9, true),
    ('dossier_tecnico', 'Dossier técnico', 'Describe cuándo el cálculo queda listo para usarse como respaldo técnico en el dossier.', 10, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 11, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'procedimiento_calculo_contenido_reciclado';

-- Procedimiento de producto no conforme
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('procedimiento_producto_no_conforme', 'Procedimiento de producto no conforme', 'Cómo se detecta, identifica y trata un producto o registro no conforme dentro del sistema de trazabilidad.', 'procedure', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este procedimiento y qué busca controlar frente a un producto o registro no conforme.', 1, true),
    ('alcance', 'Alcance', 'Indica qué situaciones cubre este procedimiento, desde la detección hasta el cierre del tratamiento.', 2, true),
    ('definiciones', 'Definiciones', 'Define qué entiende la empresa por producto o registro no conforme dentro de su propio sistema.', 3, true),
    ('tipos_no_conformidad', 'Tipos de producto o registro no conforme', 'Enumera ejemplos: material sin evidencia válida, lote producido con composición incompleta, diferencia entre porcentaje declarado y calculado, trazabilidad insuficiente, error de clasificación o error documental.', 4, true),
    ('deteccion', 'Detección del producto no conforme', 'Describe cómo se detecta una no conformidad (revisión de brechas, feedback de implementación, revisión manual).', 5, true),
    ('identificacion_segregacion', 'Identificación y segregación', 'Describe cómo se marca o separa lo no conforme para que no se use ni se declare como si fuera correcto.', 6, true),
    ('evaluacion_decision', 'Evaluación y decisión', 'Describe quién evalúa la no conformidad y qué decisión toma (corregir, descartar, reclasificar).', 7, true),
    ('tratamiento', 'Tratamiento', 'Describe qué acción se ejecuta para resolver la no conformidad detectada.', 8, true),
    ('registros_asociados', 'Registros asociados', 'Enumera los registros que dejan huella de la no conformidad y su tratamiento (feedback, brechas, reclasificaciones).', 9, true),
    ('responsables', 'Responsables', 'Indica quién detecta, quién decide y quién ejecuta el tratamiento de la no conformidad.', 10, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 11, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'procedimiento_producto_no_conforme';

-- Procedimiento de capacitación del personal
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('procedimiento_capacitacion_personal', 'Procedimiento de capacitación del personal', 'Cómo se capacita al personal que participa en el sistema de trazabilidad y cálculo de contenido reciclado.', 'procedure', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué existe este procedimiento y qué busca garantizar sobre la capacitación del personal.', 1, true),
    ('alcance', 'Alcance', 'Indica a qué personal (interno, de planta, administrativo) cubre este procedimiento.', 2, true),
    ('personal_a_capacitar', 'Personal que debe ser capacitado', 'Indica qué roles o cargos deben recibir esta capacitación antes de operar el sistema.', 3, true),
    ('temas_minimos', 'Temas mínimos de capacitación', 'Enumera los temas mínimos: catálogos, evidencias, trazabilidad, cálculo, y uso de Trazaloop.', 4, true),
    ('frecuencia', 'Frecuencia', 'Indica cada cuánto se repite o refuerza la capacitación.', 5, true),
    ('evaluacion_comprension', 'Evaluación de comprensión', 'Describe cómo se confirma que la persona capacitada entendió el procedimiento.', 6, true),
    ('registros_capacitacion', 'Registros de capacitación', 'Describe qué queda registrado de cada capacitación (fecha, tema, personas, resultado).', 7, true),
    ('responsables', 'Responsables', 'Indica quién organiza, dicta y registra las capacitaciones.', 8, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 9, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'procedimiento_capacitacion_personal';

-- Instructivo de carga de evidencias
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('instructivo_carga_evidencias', 'Instructivo de carga de evidencias', 'Guía paso a paso para cargar y organizar evidencias dentro de Trazaloop.', 'instruction', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué sirve este instructivo y a quién está dirigido.', 1, true),
    ('cuando_cargar', 'Cuándo cargar evidencias', 'Indica en qué momento del proceso se debe cargar una evidencia (recepción, validación de material, etc.).', 2, true),
    ('tipos_archivos', 'Tipos de archivos aceptados', 'Indica qué formatos de archivo acepta la empresa para sus evidencias.', 3, true),
    ('como_nombrar', 'Cómo nombrar evidencias', 'Da una convención simple de nombres para que las evidencias sean fáciles de identificar.', 4, true),
    ('como_asociar', 'Cómo asociar evidencias a materiales', 'Explica paso a paso cómo vincular una evidencia validada como soporte de origen de un material.', 5, true),
    ('como_revisar_estado', 'Cómo revisar estado de evidencia', 'Explica dónde ver si una evidencia está pendiente, válida o rechazada.', 6, true),
    ('errores_frecuentes', 'Errores frecuentes', 'Enumera errores comunes al cargar evidencias y cómo evitarlos (archivo equivocado, evidencia vencida, material sin asociar).', 7, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 8, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'instructivo_carga_evidencias';

-- Instructivo de preparación del dossier técnico
insert into public.trazadoc_blueprints (code, name, description, document_type, status) values
  ('instructivo_preparacion_dossier_tecnico', 'Instructivo de preparación del dossier técnico', 'Guía paso a paso para dejar listo el dossier técnico de un cálculo de contenido reciclado.', 'instruction', 'active');

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required, status)
select b.id, v.section_key, v.title, v.hint, v.sort_order, v.is_required, 'active'
from public.trazadoc_blueprints b,
  (values
    ('objetivo', 'Objetivo', 'Describe para qué sirve este instructivo y en qué momento se usa.', 1, true),
    ('informacion_revisar', 'Información que debe revisarse', 'Enumera qué se revisa antes de preparar el dossier: trazabilidad, composición y evidencias.', 2, true),
    ('calculo_contenido', 'Cálculo de contenido reciclado', 'Indica cómo confirmar que el cálculo del lote está hecho y su nivel de defendibilidad.', 3, true),
    ('evidencias_relacionadas', 'Evidencias relacionadas', 'Indica cómo revisar la matriz de evidencias asociada al lote antes de armar el dossier.', 4, true),
    ('brechas_advertencias', 'Brechas o advertencias', 'Indica cómo revisar si el cálculo tiene brechas o advertencias pendientes antes de continuar.', 5, true),
    ('revision_final', 'Revisión final', 'Describe la última revisión antes de considerar el dossier listo como respaldo técnico.', 6, true),
    ('exportacion_impresion', 'Exportación o impresión', 'Indica cómo exportar o imprimir el dossier técnico desde Trazaloop.', 7, true),
    ('control_cambios', 'Control de cambios', 'Registra qué cambió en cada versión de este documento, cuándo y quién lo hizo — así queda claro por qué el contenido es distinto al de una versión anterior.', 8, true)
  ) as v(section_key, title, hint, sort_order, is_required)
where b.code = 'instructivo_preparacion_dossier_tecnico';

