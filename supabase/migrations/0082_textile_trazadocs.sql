-- 0082_textile_trazadocs.sql
-- Trazaloop · Sprint T8 (Textil) · TrazaDocs Textil sobre el motor
-- TrazaDocs existente (0043–0048/0057), separado por module_key.
--
-- DISEÑO (encargo §2/§7): NO se crea un motor nuevo ni se duplican tablas.
-- El motor actual (blueprints globales + documentos por organización +
-- transiciones/versionado en change_trazadoc_document_status) no conocía
-- módulos: se agrega module_key de forma ADITIVA con default 'cpr'
-- (backfill automático de todo lo existente), un trigger que fija la
-- verdad en servidor (el documento HEREDA el módulo de su estructura y el
-- módulo es inmutable) y las vistas se amplían con la columna al final
-- (create or replace válido: mismas columnas + 1 nueva).
--
-- SEPARACIÓN CPR/TEXTIL (encargo §9): los listados/consultas de código
-- filtran por module_key ('cpr' por defecto — CPR conserva su
-- comportamiento; las envolturas textiles piden 'textiles'). Documentos y
-- tips de un módulo jamás aparecen en el otro. Los documentos CPR
-- existentes no cambian de código, contenido ni comportamiento.
--
-- LENGUAJE (N-05): preparación documental, soporte documental, revisión
-- técnica, brechas documentales, aprobado internamente. Las normas y
-- marcos citados en las estructuras (ISO 22095, ISO 2076, ISO 3758,
-- ISO 5157, ISO 14021, ISO 59004/59010/59020, UNE-EN 15343, GS1 EPCIS,
-- GRS/RCS, OCS/GOTS, OEKO-TEX MADE IN GREEN, ESPR (UE) 2024/1781,
-- Estrategia de la UE para textiles sostenibles y circulares) aparecen
-- ÚNICAMENTE como referencias de preparación documental — nunca como
-- promesa de cumplimiento; "aprobado internamente" nunca significa
-- aprobado por una entidad externa.
--
-- ALCANCE: sin pasaporte, sin QR, sin IA, sin ACV/huella, sin planes por
-- módulo, sin firma avanzada, sin workflows externos. CERO cambios de
-- comportamiento CPR (solo la columna aditiva con default y las vistas
-- con una columna extra al final).

-- ---------------------------------------------------------------------------
-- 1. module_key aditivo en estructuras y documentos
-- ---------------------------------------------------------------------------
alter table public.trazadoc_blueprints
  add column if not exists module_key text not null default 'cpr';
alter table public.trazadoc_blueprints
  add constraint trazadoc_blueprints_module_key_check
  check (module_key in ('cpr', 'textiles'));

alter table public.trazadoc_documents
  add column if not exists module_key text not null default 'cpr';
alter table public.trazadoc_documents
  add constraint trazadoc_documents_module_key_check
  check (module_key in ('cpr', 'textiles'));

create index trazadoc_documents_module_idx
  on public.trazadoc_documents (organization_id, module_key);

-- Verdad en servidor: si el documento nace de una estructura, HEREDA su
-- module_key (cualquier valor enviado por el cliente se ignora); si es
-- documento libre, conserva el valor fijado por la server action (default
-- 'cpr'). En UPDATE el módulo es INMUTABLE: un documento jamás cruza de
-- módulo.
create or replace function public.set_trazadoc_document_module_key()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.blueprint_id is not null then
      select module_key into new.module_key
        from trazadoc_blueprints where id = new.blueprint_id;
    end if;
    return new;
  end if;
  if new.module_key is distinct from old.module_key then
    raise exception 'El módulo de un documento TrazaDocs no puede cambiarse.';
  end if;
  return new;
end;
$$;
revoke execute on function public.set_trazadoc_document_module_key() from public, anon, authenticated;

create trigger t_trazadoc_documents_module_key
  before insert or update on public.trazadoc_documents
  for each row execute function public.set_trazadoc_document_module_key();

-- ---------------------------------------------------------------------------
-- 2. Vistas ampliadas (misma definición + module_key AL FINAL)
-- ---------------------------------------------------------------------------
create or replace view public.v_trazadoc_document_summary
with (security_invoker = true) as
select
  d.organization_id,
  d.id                                                as document_id,
  d.title,
  d.code,
  d.source_type,
  d.status,
  d.current_version,
  owner.full_name                                     as owner_name,
  creator.full_name                                    as created_by_name,
  approver.full_name                                   as approved_by_name,
  d.approved_at,
  coalesce(sec.sections_count, 0)                      as sections_count,
  coalesce(sec.filled_sections_count, 0)                as filled_sections_count,
  coalesce(sec.required_sections_count, 0)              as required_sections_count,
  coalesce(sec.filled_required_sections_count, 0)       as filled_required_sections_count,
  d.updated_at,
  d.module_key
from public.trazadoc_documents d
left join public.profiles owner    on owner.id = d.owner_id
left join public.profiles creator  on creator.id = d.created_by
left join public.profiles approver on approver.id = d.approved_by
left join (
  select
    document_id,
    count(*)                                                            as sections_count,
    count(*) filter (where length(trim(content)) > 0)                    as filled_sections_count,
    count(*) filter (where is_required)                                  as required_sections_count,
    count(*) filter (where is_required and length(trim(content)) > 0)    as filled_required_sections_count
  from public.trazadoc_document_sections
  group by document_id
) sec on sec.document_id = d.id;

create or replace view public.v_trazadoc_blueprint_summary
with (security_invoker = true) as
select
  b.id                                    as blueprint_id,
  b.code,
  b.name,
  b.description,
  b.document_type,
  b.status,
  coalesce(sec.sections_count, 0)          as sections_count,
  coalesce(sec.required_sections_count, 0) as required_sections_count,
  b.updated_at,
  b.module_key
from public.trazadoc_blueprints b
left join (
  select
    blueprint_id,
    count(*)                                as sections_count,
    count(*) filter (where is_required)      as required_sections_count
  from public.trazadoc_blueprint_sections
  where status = 'active'
  group by blueprint_id
) sec on sec.blueprint_id = b.id;

-- Maestro documental: misma definición + module_key AL FINAL (documentos
-- vivos → su módulo; documentos descargables → 'cpr', su módulo de
-- origen) y action_href sensible al módulo. El maestro de la app SIGUE
-- mostrando solo CPR (el filtro vive en la capa de datos con default
-- 'cpr'); la integración de un maestro Textil queda preparada por la
-- columna, no forzada en T8 (encargo §16).
create or replace view public.v_trazadoc_document_master
with (security_invoker = true) as
select
  d.organization_id,
  'live_document'::text                          as source_type,
  d.id                                             as document_id,
  d.category_code,
  case d.category_code
    when 'manual' then 'Manuales'
    when 'procedure' then 'Procedimientos'
    when 'instruction' then 'Instructivos'
    when 'record' then 'Registros'
    when 'technical_support' then 'Soportes técnicos'
    when 'policy' then 'Políticas'
    when 'format' then 'Formatos'
    else 'Otros'
  end                                              as category_label,
  d.code,
  d.title,
  d.description,
  d.status,
  'v' || d.current_version                         as version_label,
  d.current_version,
  d.owner_id,
  owner.full_name                                  as owner_name,
  owner.full_name                                  as responsible_name,
  d.updated_at,
  d.approved_at,
  null::text                                       as file_name,
  null::text                                       as mime_type,
  null::bigint                                      as size_bytes,
  'open'::text                                     as action_type,
  case d.module_key
    when 'textiles' then '/textiles/trazadocs/' || d.id::text
    else '/trazadocs/' || d.id::text
  end                                              as action_href,
  d.module_key
from public.trazadoc_documents d
left join public.profiles owner on owner.id = d.owner_id

union all

select
  f.organization_id,
  'file_document'::text                           as source_type,
  f.id                                              as document_id,
  f.category_code,
  case f.category_code
    when 'manual' then 'Manuales'
    when 'procedure' then 'Procedimientos'
    when 'instruction' then 'Instructivos'
    when 'record' then 'Registros'
    when 'technical_support' then 'Soportes técnicos'
    when 'policy' then 'Políticas'
    when 'format' then 'Formatos'
    else 'Otros'
  end                                               as category_label,
  f.code,
  f.title,
  f.description,
  f.status,
  f.version_label,
  f.current_version,
  f.owner_id,
  owner.full_name                                   as owner_name,
  owner.full_name                                   as responsible_name,
  f.updated_at,
  f.approved_at,
  f.file_name,
  f.mime_type,
  f.size_bytes,
  'download'::text                                  as action_type,
  null::text                                         as action_href,
  'cpr'::text                                       as module_key
from public.trazadoc_file_documents f
left join public.profiles owner on owner.id = f.owner_id;

-- ---------------------------------------------------------------------------
-- 3. SEED · 12 estructuras documentales base de TrazaDocs Textil
--    (module_key = 'textiles'), con secciones y tips por sección.
--    Idempotente: ids fijos + on conflict do nothing. Ningún código,
--    documento ni tip CPR se toca. Los tips citan normas y esquemas SOLO
--    como referencias de preparación documental.
-- ---------------------------------------------------------------------------

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000001', 'TXT-MAN-001', 'Manual técnico de trazabilidad y circularidad textil', 'Describir el sistema interno de trazabilidad, composición, evidencias, evaluación circular y control documental textil de la empresa. Referencias de preparación documental: ISO 22095 (cadena de custodia), ISO 5157 (vocabulario ambiental textil), ISO 59004, ISO 59010 e ISO 59020 (economía circular), ESPR (UE) 2024/1781 como marco futuro de ecodiseño y pasaporte digital de producto.', 'manual', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000001', 'objetivo', 'Objetivo', 'Declara para qué existe el sistema: preparar, organizar y fortalecer la trazabilidad y la documentación técnica textil. Evita prometer resultados de terceros.', 10, true),
  ('d0000000-0000-4000-8000-000000000001', 'alcance', 'Alcance', 'Delimita productos, referencias, plantas, procesos propios y tercerizados cubiertos por el sistema.', 20, true),
  ('d0000000-0000-4000-8000-000000000001', 'definiciones', 'Definiciones', 'Usa vocabulario consistente con ISO 5157 e ISO 22095 (referencia/SKU, lote, evidencia, brecha, preparación circular).', 30, false),
  ('d0000000-0000-4000-8000-000000000001', 'roles', 'Roles y responsabilidades', 'Asigna responsables de registrar, revisar y aprobar internamente: administración, calidad/supervisión y consultoría.', 40, true),
  ('d0000000-0000-4000-8000-000000000001', 'flujo', 'Flujo general de trazabilidad textil', 'Describe el recorrido: catálogos → producto/referencia → composición → evidencias → orden/lotes → evaluación circular.', 50, true),
  ('d0000000-0000-4000-8000-000000000001', 'relaciones', 'Relación entre producto, referencia, materiales, evidencias, lotes y circularidad', 'Explica cómo se conectan los módulos de Trazaloop Textil y qué registro vive en cada uno.', 60, true),
  ('d0000000-0000-4000-8000-000000000001', 'control_documental', 'Control documental', 'Referencia el procedimiento TXT-PRO-011: estados borrador / en revisión / aprobado internamente / obsoleto, y versionado.', 70, true),
  ('d0000000-0000-4000-8000-000000000001', 'brechas', 'Gestión de brechas', 'Define cómo se identifican, priorizan y atienden brechas documentales, de evidencia y de trazabilidad.', 80, true),
  ('d0000000-0000-4000-8000-000000000001', 'mejora', 'Revisión y mejora', 'Establece la frecuencia de revisión interna del sistema y cómo se registran los cambios.', 90, false),
  ('d0000000-0000-4000-8000-000000000001', 'referencias', 'Referencias técnicas', 'Referencias de preparación documental: ISO 22095, ISO 5157, ISO 59004, ISO 59010, ISO 59020, ESPR (UE) 2024/1781. Ninguna implica cumplimiento automático.', 100, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000002', 'TXT-PRO-002', 'Procedimiento de identificación de productos, referencias y composición textil', 'Definir cómo la empresa identifica productos textiles, referencias/SKU, composición de fibras, materiales e insumos asociados. Referencias de preparación documental: ISO 2076 (nombres genéricos de fibras manufacturadas), ISO 5157, ISO 14021 (declaraciones ambientales autodeclaradas).', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000002', 'objetivo', 'Objetivo', 'Asegurar identificación única y consistente de productos, referencias y su composición.', 10, true),
  ('d0000000-0000-4000-8000-000000000002', 'alcance', 'Alcance', 'Aplica a todos los productos y referencias activas del módulo Textil.', 20, true),
  ('d0000000-0000-4000-8000-000000000002', 'productos', 'Identificación de productos', 'Define reglas de nombre, colección y estado del producto.', 30, true),
  ('d0000000-0000-4000-8000-000000000002', 'referencias', 'Identificación de referencias/SKU', 'Define la codificación de SKU y sus variantes (color, talla, versión).', 40, true),
  ('d0000000-0000-4000-8000-000000000002', 'composicion', 'Registro de composición de fibras', 'Describe cómo la empresa identifica las fibras de la referencia. Usa nombres consistentes (ISO 2076) y, cuando aplique, soportes del proveedor o fichas técnicas. Evita afirmar contenido reciclado u orgánico sin evidencia.', 50, true),
  ('d0000000-0000-4000-8000-000000000002', 'materiales', 'Registro de materiales principales y secundarios', 'Asocia materiales a la referencia con su rol; registra proveedor y ficha técnica cuando exista.', 60, true),
  ('d0000000-0000-4000-8000-000000000002', 'componentes', 'Registro de avíos/componentes', 'Registra avíos y componentes con su separabilidad evaluada cuando sea posible.', 70, true),
  ('d0000000-0000-4000-8000-000000000002', 'revision', 'Revisión de composición', 'Verifica que cada alcance de composición sume aproximadamente 100% y que los tipos de fibra sean normalizados.', 80, true),
  ('d0000000-0000-4000-8000-000000000002', 'brechas', 'Brechas de composición', 'Documenta composiciones incompletas, sin soporte o inconsistentes, y el plan interno para cerrarlas.', 90, false),
  ('d0000000-0000-4000-8000-000000000002', 'registros', 'Registros asociados', 'Lista los registros de productos, referencias, composición y asociaciones que respaldan este procedimiento.', 100, false),
  ('d0000000-0000-4000-8000-000000000002', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 2076, ISO 5157, ISO 14021.', 110, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000003', 'TXT-PRO-003', 'Procedimiento de control de proveedores textiles y procesos tercerizados', 'Definir criterios de registro, evaluación documental y seguimiento de proveedores de materiales, componentes y servicios tercerizados. Referencias de preparación documental: ISO 22095, ISO 14021; GRS/RCS (contenido reciclado), OCS/GOTS (materiales orgánicos) y OEKO-TEX MADE IN GREEN como esquemas de referencia cuando aplique.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000003', 'objetivo', 'Objetivo', 'Mantener información y soporte documental suficiente de los proveedores que afectan la trazabilidad textil.', 10, true),
  ('d0000000-0000-4000-8000-000000000003', 'alcance', 'Alcance', 'Proveedores de materiales, de avíos/componentes y de procesos tercerizados.', 20, true),
  ('d0000000-0000-4000-8000-000000000003', 'clasificacion', 'Clasificación de proveedores', 'Clasifica por tipo y criticidad para la trazabilidad y las declaraciones.', 30, true),
  ('d0000000-0000-4000-8000-000000000003', 'materiales', 'Proveedores de materiales', 'Registra identificación, contacto, materiales suministrados y soportes disponibles.', 40, true),
  ('d0000000-0000-4000-8000-000000000003', 'componentes', 'Proveedores de avíos/componentes', 'Registra componentes suministrados y su información de separabilidad cuando exista.', 50, false),
  ('d0000000-0000-4000-8000-000000000003', 'tercerizados', 'Procesos tercerizados', 'Identifica procesos externos (tintorería, estampado, lavandería, confección externa) y su soporte documental de ejecución.', 60, true),
  ('d0000000-0000-4000-8000-000000000003', 'informacion', 'Información mínima requerida', 'Define los datos mínimos por proveedor y cuándo se exige ficha técnica o declaración.', 70, true),
  ('d0000000-0000-4000-8000-000000000003', 'evidencias', 'Evidencias documentales', 'Vincula soportes por proveedor en el módulo de evidencias; una evidencia rechazada o vencida no es soporte válido.', 80, true),
  ('d0000000-0000-4000-8000-000000000003', 'revision', 'Revisión periódica', 'Define frecuencia de revisión de la información y los soportes de proveedores.', 90, false),
  ('d0000000-0000-4000-8000-000000000003', 'brechas', 'Brechas y acciones internas', 'Documenta proveedores sin soporte y las acciones internas para cerrarlas.', 100, false),
  ('d0000000-0000-4000-8000-000000000003', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 22095, ISO 14021, GRS/RCS, OCS/GOTS, OEKO-TEX MADE IN GREEN. Los esquemas citados son referencias, no promesas de obtención de sellos.', 110, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000004', 'TXT-PRO-004', 'Procedimiento de gestión de evidencias textiles', 'Establecer cómo se cargan, revisan, aceptan internamente, rechazan, archivan y vinculan soportes documentales textiles. Referencias de preparación documental: ISO 14021, ISO 22095; GRS/RCS y OCS/GOTS como esquemas de referencia de los soportes de reciclado y orgánico.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000004', 'objetivo', 'Objetivo', 'Asegurar que cada afirmación relevante tenga soporte documental identificable y revisado internamente.', 10, true),
  ('d0000000-0000-4000-8000-000000000004', 'alcance', 'Alcance', 'Aplica a todas las evidencias del módulo Textil y sus vínculos.', 20, true),
  ('d0000000-0000-4000-8000-000000000004', 'tipos', 'Tipos de evidencias', 'Fichas técnicas, declaraciones de proveedor, resultados de ensayo, soportes de proceso y otros.', 30, true),
  ('d0000000-0000-4000-8000-000000000004', 'proveedor', 'Evidencias de proveedor', 'Relaciona cada soporte con el proveedor correspondiente.', 40, false),
  ('d0000000-0000-4000-8000-000000000004', 'composicion', 'Evidencias de composición', 'Vincula los soportes de composición a la referencia o a sus fibras declaradas.', 50, true),
  ('d0000000-0000-4000-8000-000000000004', 'reciclado', 'Evidencias de contenido reciclado', 'Toda declaración de contenido reciclado requiere soporte vinculado (GRS/RCS como esquemas de referencia).', 60, true),
  ('d0000000-0000-4000-8000-000000000004', 'organico', 'Evidencias de material orgánico', 'Toda declaración de material orgánico requiere soporte vinculado (OCS/GOTS como esquemas de referencia).', 70, true),
  ('d0000000-0000-4000-8000-000000000004', 'procesos', 'Evidencias de procesos', 'Los procesos tercerizados requieren soporte de ejecución vinculado al paso de la orden.', 80, false),
  ('d0000000-0000-4000-8000-000000000004', 'estados', 'Estados de revisión interna', 'Pendiente de revisión, aceptada internamente, rechazada, vencida y archivada; define quién revisa y con qué criterio.', 90, true),
  ('d0000000-0000-4000-8000-000000000004', 'vinculacion', 'Vinculación de evidencias', 'Relaciona cada soporte documental con proveedor, material, referencia, orden o lote cuando sea posible. La aceptación interna de una evidencia no equivale a certificación externa.', 100, true),
  ('d0000000-0000-4000-8000-000000000004', 'retencion', 'Retención documental', 'Define tiempos de conservación y archivado de soportes.', 110, false),
  ('d0000000-0000-4000-8000-000000000004', 'limitaciones', 'Limitaciones de la revisión interna', 'La aceptación interna de una evidencia no equivale a certificación externa ni validación por una autoridad.', 120, true),
  ('d0000000-0000-4000-8000-000000000004', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 14021, ISO 22095, GRS/RCS, OCS/GOTS.', 130, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000005', 'TXT-PRO-005', 'Procedimiento de trazabilidad de órdenes, lotes y consumos textiles', 'Definir cómo se registran órdenes/corridas de confección, lotes de entrada, consumos, procesos y lotes producidos/finales. Referencias de preparación documental: ISO 22095; GS1 EPCIS y GS1 Digital Link como referencia futura de interoperabilidad.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000005', 'objetivo', 'Objetivo', 'Mantener trazabilidad técnica verificable entre insumos, procesos y lotes producidos.', 10, true),
  ('d0000000-0000-4000-8000-000000000005', 'alcance', 'Alcance', 'Aplica a órdenes/corridas, lotes de entrada, consumos, procesos y lotes finales del módulo Textil.', 20, true),
  ('d0000000-0000-4000-8000-000000000005', 'orden', 'Orden / corrida de confección', 'Define codificación, referencia asociada y estados de la orden.', 30, true),
  ('d0000000-0000-4000-8000-000000000005', 'lotes_entrada', 'Lotes de entrada', 'Registra código, material o componente, proveedor, cantidad recibida y unidad.', 40, true),
  ('d0000000-0000-4000-8000-000000000005', 'consumos', 'Consumos de lote', 'Registra qué lote consume cada orden, en qué cantidad y unidad; usa unidades comparables con el lote.', 50, true),
  ('d0000000-0000-4000-8000-000000000005', 'procesos_internos', 'Procesos internos', 'Registra los pasos internos de la orden y su estado.', 60, false),
  ('d0000000-0000-4000-8000-000000000005', 'tercerizados', 'Procesos tercerizados', 'Registra pasos externos con su soporte documental de ejecución.', 70, true),
  ('d0000000-0000-4000-8000-000000000005', 'lote_final', 'Lote producido / lote final', 'Registra el lote final con su cantidad y estado; su estado de trazabilidad se calcula desde los datos, no se edita a mano.', 80, true),
  ('d0000000-0000-4000-8000-000000000005', 'balance', 'Balance de lotes', 'Revisa saldos consumido/recibido por unidad; el sobreconsumo comparable queda bloqueado o marcado como brecha.', 90, true),
  ('d0000000-0000-4000-8000-000000000005', 'brechas', 'Brechas de trazabilidad', 'Atiende lotes sin proveedor, unidades no comparables, sobreconsumo y tercerizados sin soporte.', 100, true),
  ('d0000000-0000-4000-8000-000000000005', 'evidencias', 'Evidencias asociadas', 'Vincula soportes a órdenes, lotes, consumos y pasos cuando corresponda.', 110, false),
  ('d0000000-0000-4000-8000-000000000005', 'revision', 'Revisión interna', 'Define quién revisa la trazabilidad y con qué frecuencia.', 120, false),
  ('d0000000-0000-4000-8000-000000000005', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 22095; GS1 EPCIS / GS1 Digital Link como referencia futura de interoperabilidad.', 130, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000006', 'TXT-PRO-006', 'Procedimiento de declaraciones ambientales y claims textiles', 'Definir cómo la empresa documenta, revisa y soporta declaraciones ambientales sobre contenido reciclado, material orgánico, reutilización, reciclabilidad, durabilidad u otras afirmaciones. Referencias de preparación documental: ISO 14021, ISO 5157; GRS/RCS, OCS/GOTS y OEKO-TEX MADE IN GREEN como esquemas de referencia cuando aplique.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000006', 'objetivo', 'Objetivo', 'Evitar declaraciones ambientales sin soporte: toda afirmación debe ser específica, verificable y no engañosa (ISO 14021).', 10, true),
  ('d0000000-0000-4000-8000-000000000006', 'alcance', 'Alcance', 'Aplica a toda declaración ambiental sobre productos, referencias o materiales textiles.', 20, true),
  ('d0000000-0000-4000-8000-000000000006', 'tipos', 'Tipos de declaraciones', 'Contenido reciclado, material orgánico, reciclabilidad, reutilización, durabilidad y otras.', 30, true),
  ('d0000000-0000-4000-8000-000000000006', 'reciclado', 'Declaraciones de contenido reciclado', 'Declara porcentaje y alcance; exige soporte vinculado (GRS/RCS como esquemas de referencia; UNE-EN 15343 como referencia metodológica de trazabilidad de reciclado cuando aplique).', 40, true),
  ('d0000000-0000-4000-8000-000000000006', 'organico', 'Declaraciones de material orgánico', 'Declara fibra y alcance; exige soporte vinculado (OCS/GOTS como esquemas de referencia).', 50, true),
  ('d0000000-0000-4000-8000-000000000006', 'reciclabilidad', 'Declaraciones de reciclabilidad', 'Usa lenguaje de potencial de reciclabilidad; apóyala en separabilidad y composición documentadas.', 60, false),
  ('d0000000-0000-4000-8000-000000000006', 'reutilizacion', 'Declaraciones de reutilización', 'Usa lenguaje de potencial de reutilización con soporte interno.', 70, false),
  ('d0000000-0000-4000-8000-000000000006', 'soportes', 'Soportes requeridos', 'Toda declaración ambiental debe estar soportada por evidencia suficiente y revisada internamente antes de ser usada en comunicaciones externas.', 80, true),
  ('d0000000-0000-4000-8000-000000000006', 'revision', 'Revisión interna', 'Antes de usar una declaración ambiental en comunicaciones externas, verifica que exista evidencia suficiente y que la afirmación sea específica, verificable y no engañosa.', 90, true),
  ('d0000000-0000-4000-8000-000000000006', 'comunicacion', 'Restricciones de comunicación', 'Prohíbe comunicar declaraciones sin soporte revisado; define quién autoriza el uso externo.', 100, true),
  ('d0000000-0000-4000-8000-000000000006', 'brechas', 'Brechas de evidencia', 'Registra declaraciones con soporte insuficiente y suspende su uso externo hasta cerrarlas.', 110, true),
  ('d0000000-0000-4000-8000-000000000006', 'cambios', 'Control de cambios', 'Registra cambios de composición o proveedor que afecten declaraciones vigentes.', 120, false),
  ('d0000000-0000-4000-8000-000000000006', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 14021, ISO 5157, GRS/RCS, OCS/GOTS, OEKO-TEX MADE IN GREEN, UNE-EN 15343.', 130, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000007', 'TXT-PRO-007', 'Procedimiento de evaluación de circularidad textil', 'Definir cómo se evalúa la preparación circular de referencias textiles, considerando composición, trazabilidad, evidencia, reparabilidad, separabilidad, reutilización y reciclabilidad potencial. Referencias de preparación documental: ISO 59004, ISO 59010, ISO 59020, ISO 5157, ESPR (UE) 2024/1781.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000007', 'objetivo', 'Objetivo', 'Medir preparación circular técnica interna por referencia/SKU (y lote cuando aplique).', 10, true),
  ('d0000000-0000-4000-8000-000000000007', 'alcance', 'Alcance', 'Aplica a las evaluaciones del módulo de circularidad textil.', 20, true),
  ('d0000000-0000-4000-8000-000000000007', 'metodologia', 'Metodología de evaluación', 'Usa la metodología activa versionada de la plataforma; los criterios derivados se calculan desde datos reales.', 30, true),
  ('d0000000-0000-4000-8000-000000000007', 'dimensiones', 'Dimensiones evaluadas', 'Transparencia de composición, trazabilidad y evidencia, estrategia de materiales, durabilidad/cuidado/reparación, reciclabilidad/separabilidad, reutilización/fin de vida.', 40, true),
  ('d0000000-0000-4000-8000-000000000007', 'criterios', 'Criterios', 'Documenta cómo se responde cada criterio manual y qué datos alimentan los derivados.', 50, true),
  ('d0000000-0000-4000-8000-000000000007', 'respuestas', 'Respuestas y evidencias', 'Responde con escala 1 / 0,5 / 0 / no aplica y vincula soportes cuando el criterio lo espera.', 60, true),
  ('d0000000-0000-4000-8000-000000000007', 'puntaje', 'Puntaje y nivel de preparación', 'El puntaje 0–100 y el nivel (inicial a preparado) los calcula la plataforma desde respuestas y datos; no se editan a mano.', 70, true),
  ('d0000000-0000-4000-8000-000000000007', 'brechas', 'Brechas', 'Revisa las brechas generadas y prioriza su cierre.', 80, true),
  ('d0000000-0000-4000-8000-000000000007', 'recomendaciones', 'Recomendaciones internas', 'Usa las recomendaciones como plan interno de mejora, no como dictamen externo.', 90, false),
  ('d0000000-0000-4000-8000-000000000007', 'actualizacion', 'Revisión y actualización', 'Una evaluación completada es un registro histórico: para actualizar, se crea una nueva evaluación.', 100, true),
  ('d0000000-0000-4000-8000-000000000007', 'limitaciones', 'Limitaciones', 'La evaluación de circularidad es una herramienta técnica interna. No equivale a certificación, cumplimiento regulatorio ni pasaporte oficial.', 110, true),
  ('d0000000-0000-4000-8000-000000000007', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 59004, ISO 59010, ISO 59020, ISO 5157, ESPR (UE) 2024/1781.', 120, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000008', 'TXT-PRO-008', 'Procedimiento de diseño para durabilidad, reparación, separabilidad y fin de vida', 'Definir criterios internos para incorporar consideraciones de durabilidad, reparabilidad, separabilidad de componentes, reutilización y fin de vida en productos textiles. Referencias de preparación documental: ISO 3758 (símbolos e instrucciones de cuidado), ISO 5157, ISO 59004, ISO 59020, Estrategia de la UE para textiles sostenibles y circulares, ESPR (UE) 2024/1781.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000008', 'objetivo', 'Objetivo', 'Incorporar criterios de circularidad desde el diseño del producto textil.', 10, true),
  ('d0000000-0000-4000-8000-000000000008', 'alcance', 'Alcance', 'Aplica al diseño y revisión técnica de productos y referencias.', 20, true),
  ('d0000000-0000-4000-8000-000000000008', 'durabilidad', 'Criterios de durabilidad', 'Define criterios internos de resistencia y vida útil esperada.', 30, true),
  ('d0000000-0000-4000-8000-000000000008', 'reparabilidad', 'Criterios de reparabilidad', 'Prioriza construcciones y componentes reparables.', 40, true),
  ('d0000000-0000-4000-8000-000000000008', 'reemplazables', 'Componentes reemplazables', 'Identifica cierres, botones y avíos reemplazables.', 50, false),
  ('d0000000-0000-4000-8000-000000000008', 'separabilidad', 'Separabilidad de avíos/componentes', 'Evalúa la separabilidad en el catálogo de componentes y evita uniones innecesariamente difíciles de separar.', 60, true),
  ('d0000000-0000-4000-8000-000000000008', 'cuidado', 'Información de cuidado', 'Documenta instrucciones de cuidado usando ISO 3758 como referencia de símbolos.', 70, true),
  ('d0000000-0000-4000-8000-000000000008', 'fin_vida', 'Información preliminar de fin de vida', 'Documenta orientación preliminar de separación y fin de vida de la prenda.', 80, false),
  ('d0000000-0000-4000-8000-000000000008', 'brechas', 'Brechas de diseño', 'Registra brechas de durabilidad, reparación o separabilidad detectadas en la revisión técnica.', 90, false),
  ('d0000000-0000-4000-8000-000000000008', 'revision', 'Revisión técnica', 'Define quién revisa los criterios de diseño y cuándo.', 100, true),
  ('d0000000-0000-4000-8000-000000000008', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 3758, ISO 5157, ISO 59004, ISO 59020, Estrategia de la UE para textiles sostenibles y circulares, ESPR (UE) 2024/1781.', 110, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000009', 'TXT-PRO-009', 'Procedimiento de producto textil no conforme', 'Definir cómo se identifica, controla, documenta y gestiona producto textil no conforme o información documental inconsistente. Referencias de preparación documental: ISO 9001 como referencia general de gestión de no conformidades; ISO 22095.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000009', 'objetivo', 'Objetivo', 'Controlar producto e información no conforme para proteger la trazabilidad y las declaraciones.', 10, true),
  ('d0000000-0000-4000-8000-000000000009', 'alcance', 'Alcance', 'Producto físico, documentación, evidencias y registros de trazabilidad.', 20, true),
  ('d0000000-0000-4000-8000-000000000009', 'tipos', 'Tipos de no conformidad interna', 'Clasifica no conformidades de producto, documentales, de evidencia y de trazabilidad.', 30, true),
  ('d0000000-0000-4000-8000-000000000009', 'producto', 'No conformidad de producto', 'Define identificación, segregación y disposición del producto no conforme.', 40, true),
  ('d0000000-0000-4000-8000-000000000009', 'documental', 'No conformidad documental', 'Trata documentos desactualizados, inconsistentes o sin aprobación interna.', 50, false),
  ('d0000000-0000-4000-8000-000000000009', 'evidencia', 'No conformidad de evidencia', 'Trata evidencias rechazadas, vencidas o mal vinculadas.', 60, true),
  ('d0000000-0000-4000-8000-000000000009', 'trazabilidad', 'No conformidad de trazabilidad', 'Trata sobreconsumos, unidades no comparables y relaciones inconsistentes.', 70, true),
  ('d0000000-0000-4000-8000-000000000009', 'contencion', 'Contención', 'Define acciones inmediatas para evitar uso indebido del producto o la información.', 80, true),
  ('d0000000-0000-4000-8000-000000000009', 'causa', 'Análisis de causa', 'Analiza la causa raíz con el método interno definido.', 90, false),
  ('d0000000-0000-4000-8000-000000000009', 'acciones', 'Acciones internas', 'Define acciones correctivas internas y responsables.', 100, true),
  ('d0000000-0000-4000-8000-000000000009', 'verificacion', 'Verificación', 'Verifica la eficacia de las acciones tomadas.', 110, false),
  ('d0000000-0000-4000-8000-000000000009', 'registros', 'Registros', 'Conserva los registros de no conformidades y acciones.', 120, false),
  ('d0000000-0000-4000-8000-000000000009', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 9001 (referencia general), ISO 22095.', 130, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000010', 'TXT-PRO-010', 'Procedimiento de capacitación del personal en trazabilidad y circularidad textil', 'Definir cómo la empresa capacita al personal involucrado en registro, revisión, trazabilidad, evidencias y circularidad textil. Referencias de preparación documental: ISO 9001 como referencia general de competencia; ISO 22095, ISO 14021, ISO 59020.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000010', 'objetivo', 'Objetivo', 'Asegurar competencia del personal que registra y revisa información textil.', 10, true),
  ('d0000000-0000-4000-8000-000000000010', 'alcance', 'Alcance', 'Personal de registro, calidad/supervisión, consultoría y administración.', 20, true),
  ('d0000000-0000-4000-8000-000000000010', 'roles', 'Roles que requieren capacitación', 'Identifica los roles y sus necesidades de formación.', 30, true),
  ('d0000000-0000-4000-8000-000000000010', 'temas', 'Temas mínimos', 'Trazabilidad, composición, evidencias, declaraciones ambientales y evaluación de circularidad.', 40, true),
  ('d0000000-0000-4000-8000-000000000010', 'frecuencia', 'Frecuencia', 'Define frecuencia de capacitación y de refuerzos.', 50, false),
  ('d0000000-0000-4000-8000-000000000010', 'evidencias', 'Evidencias de capacitación', 'Conserva registros de asistencia y contenidos.', 60, true),
  ('d0000000-0000-4000-8000-000000000010', 'eficacia', 'Evaluación de eficacia', 'Verifica que la capacitación se refleje en registros de mejor calidad.', 70, false),
  ('d0000000-0000-4000-8000-000000000010', 'actualizacion', 'Actualización de contenidos', 'Actualiza contenidos cuando cambien procesos, criterios o referencias técnicas.', 80, false),
  ('d0000000-0000-4000-8000-000000000010', 'registros', 'Registros', 'Lista los registros de capacitación conservados.', 90, false),
  ('d0000000-0000-4000-8000-000000000010', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 9001 (referencia general), ISO 22095, ISO 14021, ISO 59020.', 100, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000011', 'TXT-PRO-011', 'Procedimiento de control documental textil', 'Definir cómo se crean, revisan, aprueban, actualizan, obsoletan y conservan documentos textiles dentro de TrazaDocs Textil. Referencias de preparación documental: ISO 9001 como referencia general de control documental.', 'procedure', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000011', 'objetivo', 'Objetivo', 'Mantener documentos textiles controlados, vigentes y con responsables claros.', 10, true),
  ('d0000000-0000-4000-8000-000000000011', 'alcance', 'Alcance', 'Todos los documentos de TrazaDocs Textil.', 20, true),
  ('d0000000-0000-4000-8000-000000000011', 'tipos', 'Tipos de documentos', 'Manuales, procedimientos y matrices del módulo Textil.', 30, true),
  ('d0000000-0000-4000-8000-000000000011', 'codificacion', 'Codificación', 'Usa la codificación TXT-XXX-NNN de las estructuras base o la propia de la empresa.', 40, true),
  ('d0000000-0000-4000-8000-000000000011', 'creacion', 'Creación', 'Crea documentos desde las estructuras base; el borrador es editable por administración, calidad y consultoría.', 50, true),
  ('d0000000-0000-4000-8000-000000000011', 'revision', 'Revisión', 'Envía a revisión interna antes de aprobar.', 60, true),
  ('d0000000-0000-4000-8000-000000000011', 'aprobacion', 'Aprobación interna', 'Aprueban administración o calidad. Aprobado internamente no significa aprobado por una entidad externa.', 70, true),
  ('d0000000-0000-4000-8000-000000000011', 'versionamiento', 'Versionamiento', 'Cada aprobación genera versión; una versión aprobada no se edita directamente: se crea una nueva versión en borrador.', 80, true),
  ('d0000000-0000-4000-8000-000000000011', 'obsolescencia', 'Obsolescencia', 'Marca obsoleto lo que ya no aplica; el histórico se conserva.', 90, true),
  ('d0000000-0000-4000-8000-000000000011', 'conservacion', 'Conservación', 'Define tiempos y forma de conservación del histórico documental.', 100, false),
  ('d0000000-0000-4000-8000-000000000011', 'acceso', 'Acceso y responsabilidades', 'Define quién ve, edita y aprueba según roles de la organización.', 110, true),
  ('d0000000-0000-4000-8000-000000000011', 'evidencias', 'Relación con evidencias', 'Relaciona documentos con las evidencias que los soportan.', 120, false),
  ('d0000000-0000-4000-8000-000000000011', 'referencias_tecnicas', 'Referencias técnicas', 'Referencias de preparación documental: ISO 9001 (referencia general de control documental).', 130, false)
on conflict (blueprint_id, section_key) do nothing;

insert into public.trazadoc_blueprints (id, code, name, description, document_type, status, module_key)
values ('d0000000-0000-4000-8000-000000000012', 'TXT-MAT-012', 'Matriz de preparación documental textil', 'Relacionar documentos, evidencias, módulos y referencias técnicas para identificar brechas frente a futuras auditorías, sellos, normas o requisitos. Referencias de preparación documental: ISO 22095, ISO 14021, ISO 2076, ISO 3758, ISO 5157, ISO 59004, ISO 59010, ISO 59020, GRS/RCS, OCS/GOTS, OEKO-TEX MADE IN GREEN, ESPR (UE) 2024/1781, Estrategia de la UE para textiles sostenibles y circulares.', 'other', 'active', 'textiles')
on conflict (code) do nothing;

insert into public.trazadoc_blueprint_sections (blueprint_id, section_key, title, hint, sort_order, is_required)
values
  ('d0000000-0000-4000-8000-000000000012', 'objetivo', 'Objetivo', 'Ver en un solo lugar qué está documentado y qué falta para la preparación documental textil.', 10, true),
  ('d0000000-0000-4000-8000-000000000012', 'alcance', 'Alcance', 'Cubre los documentos TXT, las evidencias esperadas y los módulos relacionados.', 20, true),
  ('d0000000-0000-4000-8000-000000000012', 'documentos', 'Documentos requeridos', 'Lista los documentos TXT y su estado documental actual.', 30, true),
  ('d0000000-0000-4000-8000-000000000012', 'evidencias', 'Evidencias esperadas', 'Lista las evidencias esperadas por área (composición, proveedores, reciclado, orgánico, procesos).', 40, true),
  ('d0000000-0000-4000-8000-000000000012', 'modulos', 'Módulos relacionados', 'Relaciona catálogos, productos, evidencias, trazabilidad y circularidad con cada documento.', 50, true),
  ('d0000000-0000-4000-8000-000000000012', 'referencias', 'Referencias técnicas', 'Relaciona cada fila con sus referencias de preparación documental, sin afirmar cumplimiento.', 60, true),
  ('d0000000-0000-4000-8000-000000000012', 'estado', 'Estado documental', 'Usa exclusivamente: documentado, parcialmente documentado, pendiente, no aplica, requiere revisión. La matriz nunca declara el resultado de una revisión externa.', 70, true),
  ('d0000000-0000-4000-8000-000000000012', 'brechas', 'Brechas', 'Registra brechas por documento o evidencia y su prioridad.', 80, true),
  ('d0000000-0000-4000-8000-000000000012', 'acciones', 'Acciones internas', 'Define responsables y fechas para cerrar brechas.', 90, false),
  ('d0000000-0000-4000-8000-000000000012', 'revision', 'Revisión', 'Define la frecuencia de actualización de la matriz.', 100, false)
on conflict (blueprint_id, section_key) do nothing;
