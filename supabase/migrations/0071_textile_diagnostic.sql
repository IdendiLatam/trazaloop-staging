-- 0071_textile_diagnostic.sql
-- Trazaloop · Sprint T2 (Textil) · Diagnóstico inicial de Trazaloop Textil.
--
-- ALCANCE ESTRICTO (T2): SOLO el diagnóstico textil. Nada de catálogos,
-- productos, evidencias, TrazaDocs Textil, pasaporte ni planes por módulo.
-- CERO cambios a objetos CPR: este archivo solo CREA tablas nuevas con
-- prefijo textile_ y REUTILIZA helpers transversales ya existentes
-- (set_updated_at, prevent_organization_id_change, lock_completed_diagnostic,
-- audit_row_change, is_org_member, has_org_role) sin modificarlos.
--
-- Modelo: docs/modules/textiles/TEXTILES_DIAGNOSTIC_MODEL.md (DL-09).
--   * Escala de respuesta propia del sector: yes / partial / no /
--     not_applicable — DELIBERADAMENTE distinta del booleano CPR (0018).
--   * 12 dimensiones (pesos que suman 100) y 58 preguntas propias del
--     sector confección. NINGUNA pregunta reutiliza texto del seed CPR
--     (0022): el diagnóstico habla de preparación y brechas, nunca de
--     certificación ni cumplimiento.
--   * allows_na = false en las preguntas donde "No aplica" carece de
--     sentido (1, 6, 12, 18, 23, 56 — todas críticas).
--   * is_context = true en la pregunta 49 (claims): su "No" NO penaliza;
--     convierte 50–52 en No aplica. Regla calculada en lib/domain, con la
--     misma filosofía de CPR: el puntaje es función PURA de la aplicación,
--     nunca SQL.

-- ---------------------------------------------------------------------------
-- textile_diagnostic_sections (catálogo global sembrable)
-- ---------------------------------------------------------------------------
create table public.textile_diagnostic_sections (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  title       text not null,
  description text,
  order_index integer not null default 0,
  weight      numeric(6,3) not null default 1
);

-- ---------------------------------------------------------------------------
-- textile_diagnostic_questions (catálogo global sembrable)
-- ---------------------------------------------------------------------------
create table public.textile_diagnostic_questions (
  id                 uuid not null primary key default gen_random_uuid(),
  section_id         uuid not null references public.textile_diagnostic_sections (id),
  code               text not null unique,
  question_text      text not null,
  help_text          text,
  standard_refs      text[] not null default '{}',
  weight             numeric(6,3) not null default 1,
  is_critical        boolean not null default false,
  allows_na          boolean not null default true,
  is_context         boolean not null default false,
  order_index        integer not null default 0,
  recommended_action text,
  is_active          boolean not null default true
);

create index textile_diagnostic_questions_section_idx
  on public.textile_diagnostic_questions (section_id, order_index);

-- ---------------------------------------------------------------------------
-- textile_diagnostics (instancia por empresa)
-- ---------------------------------------------------------------------------
create table public.textile_diagnostics (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete restrict,
  status           text not null default 'in_progress',
  maturity_percent numeric(7,4),
  maturity_level   text,
  critical_gaps    integer not null default 0,
  dimension_scores jsonb not null default '{}',
  started_by       uuid not null references public.profiles (id),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint textile_diagnostics_org_id_uniq unique (organization_id, id),
  constraint textile_diagnostics_status_check
    check (status in ('in_progress', 'completed')),
  constraint textile_diagnostics_maturity_range
    check (maturity_percent is null or (maturity_percent >= 0 and maturity_percent <= 100)),
  constraint textile_diagnostics_level_check
    check (maturity_level is null
           or maturity_level in ('inicial', 'basico', 'intermedio', 'avanzado', 'preparado'))
);

create index textile_diagnostics_org_idx
  on public.textile_diagnostics (organization_id, started_at desc);

create trigger t_textile_diagnostics_updated
  before update on public.textile_diagnostics
  for each row execute function public.set_updated_at();

-- organization_id inmutable (patrón 0024, función transversal existente).
create trigger t_textile_diagnostics_org_immutable
  before update on public.textile_diagnostics
  for each row execute function public.prevent_organization_id_change();

-- Un diagnóstico completado es histórico: ni se edita ni se borra
-- (misma función transversal que usa CPR — se reutiliza, no se modifica).
create trigger t_textile_diagnostics_lock_completed
  before update or delete on public.textile_diagnostics
  for each row execute function public.lock_completed_diagnostic();

create trigger t_audit_textile_diagnostics
  after insert or update or delete on public.textile_diagnostics
  for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- textile_diagnostic_answers (respuestas de 4 opciones por instancia)
-- ---------------------------------------------------------------------------
create table public.textile_diagnostic_answers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  diagnostic_id   uuid not null,
  question_id     uuid not null references public.textile_diagnostic_questions (id),
  answer          text not null,
  observations    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint textile_diagnostic_answers_answer_check
    check (answer in ('yes', 'partial', 'no', 'not_applicable')),
  constraint textile_diagnostic_answers_diag_question_uniq unique (diagnostic_id, question_id),
  constraint textile_diagnostic_answers_org_id_uniq unique (organization_id, id),
  -- FK compuesta (patrón 0024): la respuesta pertenece al diagnóstico DE LA
  -- MISMA empresa — imposible cruzar organizaciones.
  constraint textile_diagnostic_answers_diagnostic_fk
    foreign key (organization_id, diagnostic_id)
    references public.textile_diagnostics (organization_id, id)
    on delete cascade
);

create index textile_diagnostic_answers_diag_idx on public.textile_diagnostic_answers (diagnostic_id);
create index textile_diagnostic_answers_org_idx  on public.textile_diagnostic_answers (organization_id);

create trigger t_textile_diagnostic_answers_updated
  before update on public.textile_diagnostic_answers
  for each row execute function public.set_updated_at();

create trigger t_textile_diagnostic_answers_org_immutable
  before update on public.textile_diagnostic_answers
  for each row execute function public.prevent_organization_id_change();

-- ---------------------------------------------------------------------------
-- RLS (deny-by-default; espejo del patrón probado del diagnóstico CPR 0018)
-- ---------------------------------------------------------------------------
alter table public.textile_diagnostic_sections  enable row level security;
alter table public.textile_diagnostic_questions enable row level security;
alter table public.textile_diagnostics          enable row level security;
alter table public.textile_diagnostic_answers   enable row level security;

-- Catálogos globales: lectura autenticada; escritura de cliente: ninguna.
create policy textile_diagnostic_sections_select on public.textile_diagnostic_sections
  for select to authenticated using (true);

create policy textile_diagnostic_questions_select on public.textile_diagnostic_questions
  for select to authenticated using (true);

create policy textile_diagnostics_select on public.textile_diagnostics
  for select to authenticated using (public.is_org_member(organization_id));

create policy textile_diagnostics_insert on public.textile_diagnostics
  for insert to authenticated with check (public.is_org_member(organization_id));

create policy textile_diagnostics_update on public.textile_diagnostics
  for update to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy textile_diagnostics_delete on public.textile_diagnostics
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['admin', 'quality'])
    and status = 'in_progress'
  );

-- Respuestas: escritura solo mientras el diagnóstico está en progreso.
create policy textile_diagnostic_answers_select on public.textile_diagnostic_answers
  for select to authenticated using (public.is_org_member(organization_id));

create policy textile_diagnostic_answers_insert on public.textile_diagnostic_answers
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.textile_diagnostics d
      where d.id = diagnostic_id
        and d.organization_id = textile_diagnostic_answers.organization_id
        and d.status = 'in_progress'
    )
  );

create policy textile_diagnostic_answers_update on public.textile_diagnostic_answers
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.textile_diagnostics d
      where d.id = diagnostic_id
        and d.organization_id = textile_diagnostic_answers.organization_id
        and d.status = 'in_progress'
    )
  )
  with check (public.is_org_member(organization_id));

create policy textile_diagnostic_answers_delete on public.textile_diagnostic_answers
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.textile_diagnostics d
      where d.id = diagnostic_id
        and d.organization_id = textile_diagnostic_answers.organization_id
        and d.status = 'in_progress'
    )
  );

-- ---------------------------------------------------------------------------
-- Seed · 12 dimensiones (pesos sobre 100) — idempotente
-- ---------------------------------------------------------------------------
insert into public.textile_diagnostic_sections (code, title, description, order_index, weight) values
  ('TD1',  'Identificación de productos y referencias', 'Códigos, colecciones, fichas técnicas y responsables de la información de producto.', 1, 10),
  ('TD2',  'Composición de fibras y materiales', 'Registro porcentual de fibras de telas principales, secundarias e hilos.', 2, 12),
  ('TD3',  'Evidencias de composición y origen', 'Soporte documental: fichas, declaraciones, certificados de proveedor y ensayos.', 3, 12),
  ('TD4',  'Proveedores', 'Identificación de proveedores, documentos técnicos y origen de las telas.', 4, 8),
  ('TD5',  'Trazabilidad de insumos, órdenes y lotes', 'Cadena insumo → orden de confección → producto terminado reconstruible.', 5, 12),
  ('TD6',  'Procesos de confección y tercerizados', 'Procesos internos y con terceros (maquila, lavandería, estampación) documentados.', 6, 8),
  ('TD7',  'Avíos y componentes', 'Botones, cierres, etiquetas, empaque y separabilidad de componentes.', 7, 8),
  ('TD8',  'Cuidado del producto', 'Recomendaciones de cuidado por referencia con criterio técnico.', 8, 5),
  ('TD9',  'Circularidad del producto', 'Reparabilidad, reutilización, reciclabilidad potencial y dificultades de reciclaje.', 9, 10),
  ('TD10', 'Claims ambientales y esquemas externos', 'Afirmaciones ambientales y su soporte documental.', 10, 5),
  ('TD11', 'Control documental', 'Versionamiento, formato digital y conocimiento de los procedimientos.', 11, 5),
  ('TD12', 'Preparación para pasaporte técnico', 'Capacidad de consolidar información por referencia y conocer brechas.', 12, 5)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Seed · 58 preguntas propias del sector confección — idempotente
-- (crit = crítica: un "No" limita el nivel; na = admite "No aplica";
--  ctx = pregunta de contexto: no puntúa, activa "No aplica" en 50–52)
-- ---------------------------------------------------------------------------
insert into public.textile_diagnostic_questions
  (section_id, code, question_text, help_text, standard_refs, weight, is_critical, allows_na, is_context, order_index, recommended_action)
select s.id, v.qcode, v.qtext, v.help, v.refs, 1, v.crit, v.na, v.ctx, v.ord,  v.action
from (values
  -- TD1 · Identificación (5)
  ('TD1', 'TQ01', '¿Cada producto o referencia tiene un código único interno?', null, array['N-01'], true,  false, false, 1,  'Definir un esquema de codificación único de referencias y aplicarlo a las activas.'),
  ('TD1', 'TQ02', '¿Las referencias se agrupan por colección, línea o temporada?', null, array['N-01'], false, true,  false, 2,  'Agrupar las referencias activas por colección o línea para poder priorizar la información.'),
  ('TD1', 'TQ03', '¿Cada referencia tiene ficha técnica con versión identificada?', null, array['N-01','N-03'], false, true, false, 3,  'Crear ficha técnica versionada por referencia, empezando por las de mayor rotación.'),
  ('TD1', 'TQ04', '¿Se distingue formalmente entre producto, referencia y variante (talla/color)?', null, array['N-01'], false, true, false, 4,  'Acordar internamente qué es producto, referencia y variante, y reflejarlo en los registros.'),
  ('TD1', 'TQ05', '¿Existe un responsable definido de crear y actualizar fichas técnicas?', null, array['N-03'], false, true, false, 5,  'Asignar un responsable de fichas técnicas y de su actualización.'),
  -- TD2 · Composición (6)
  ('TD2', 'TQ06', '¿Se registra la composición porcentual de fibras de la tela principal?', null, array['N-08','N-09'], true,  false, false, 1,  'Registrar la composición porcentual de la tela principal de cada referencia activa.'),
  ('TD2', 'TQ07', '¿Se registra la composición de telas secundarias y forros?', null, array['N-08'], false, true, false, 2,  'Extender el registro de composición a forros y telas secundarias.'),
  ('TD2', 'TQ08', '¿Se registra la composición o material de hilos de confección?', null, array['N-08'], false, true, false, 3,  'Registrar el material de los hilos de confección usados por referencia.'),
  ('TD2', 'TQ09', '¿Los nombres de fibra usados siguen nomenclatura estandarizada (nombres genéricos ISO 2076)?', null, array['N-08'], false, true, false, 4,  'Adoptar los nombres genéricos de fibra estandarizados en fichas y etiquetas.'),
  ('TD2', 'TQ10', '¿Las composiciones registradas suman 100 % por componente?', null, array['N-08'], false, true, false, 5,  'Revisar y completar composiciones hasta que cada componente sume 100 %.'),
  ('TD2', 'TQ11', '¿Se identifica la presencia de elastano u otras fibras minoritarias relevantes para reciclaje?', null, array['N-08','N-04'], false, true, false, 6,  'Identificar y registrar fibras minoritarias (p. ej. elastano) en cada referencia.'),
  -- TD3 · Evidencias (6)
  ('TD3', 'TQ12', '¿La composición declarada se soporta con ficha técnica, certificado, ensayo o declaración del proveedor?', null, array['N-05','N-03'], true,  false, false, 1,  'Solicitar al proveedor el documento que soporte la composición de cada tela principal.'),
  ('TD3', 'TQ13', '¿Las evidencias están archivadas de forma centralizada y recuperable?', null, array['N-03'], false, true, false, 2,  'Centralizar las evidencias en un repositorio único y ordenado por referencia/proveedor.'),
  ('TD3', 'TQ14', '¿Las evidencias tienen fecha y responsable identificables?', null, array['N-03'], false, true, false, 3,  'Registrar fecha y responsable de cada evidencia al archivarla.'),
  ('TD3', 'TQ15', '¿Se controla la vigencia de certificados y declaraciones (vencimientos)?', null, array['N-03'], false, true, false, 4,  'Llevar control de vencimientos de certificados y declaraciones, con alertas simples.'),
  ('TD3', 'TQ16', '¿Existen resultados de ensayos de laboratorio de composición (serie ISO 1833) para alguna referencia?', null, array['N-09'], false, true, false, 5,  'Evaluar ensayos de composición para las referencias de mayor riesgo o volumen.'),
  ('TD3', 'TQ17', '¿Se puede ubicar la evidencia de una referencia específica en menos de un día?', null, array['N-03'], false, true, false, 6,  'Organizar el archivo de evidencias para poder ubicarlas el mismo día.'),
  -- TD4 · Proveedores (5)
  ('TD4', 'TQ18', '¿Los proveedores de telas e insumos están identificados con datos básicos completos?', null, array['N-03'], true,  false, false, 1,  'Completar el directorio de proveedores con datos básicos y de contacto.'),
  ('TD4', 'TQ19', '¿Cada material del catálogo tiene proveedor(es) asociado(s)?', null, array['N-03'], false, true, false, 2,  'Asociar cada tela e insumo a su(s) proveedor(es).'),
  ('TD4', 'TQ20', '¿Se solicitan y archivan documentos técnicos del proveedor (fichas, declaraciones, certificados)?', null, array['N-03','N-05'], false, true, false, 3,  'Definir qué documentos pedir a cada tipo de proveedor y archivarlos.'),
  ('TD4', 'TQ21', '¿Se conoce el país de origen de las telas principales?', null, array['N-03','N-01'], false, true, false, 4,  'Registrar el país de origen de las telas principales por referencia.'),
  ('TD4', 'TQ22', '¿Se registran certificados de esquemas externos del proveedor (GRS/RCS, OCS/GOTS, OEKO-TEX) cuando existen?', null, array['N-12','N-13','N-14'], false, true, false, 5,  'Archivar los certificados de esquemas externos vigentes de los proveedores que los tengan.'),
  -- TD5 · Trazabilidad (6)
  ('TD5', 'TQ23', '¿Las órdenes de confección identifican la referencia y cantidad producida?', null, array['N-03'], true,  false, false, 1,  'Asegurar que toda orden de confección registre referencia y cantidad.'),
  ('TD5', 'TQ24', '¿Se registra qué lotes o entregas de tela se usaron en cada orden?', null, array['N-03'], false, true, false, 2,  'Registrar en cada orden los lotes o entregas de tela consumidos.'),
  ('TD5', 'TQ25', '¿Los lotes de entrada conservan el código de lote del proveedor?', null, array['N-03'], false, true, false, 3,  'Conservar el código de lote del proveedor al recibir tela e insumos.'),
  ('TD5', 'TQ26', '¿Los lotes de producto terminado tienen código propio rastreable a su orden?', null, array['N-03'], false, true, false, 4,  'Codificar los lotes de producto terminado y vincularlos a su orden.'),
  ('TD5', 'TQ27', '¿Es posible reconstruir la cadena insumo → proceso → producto terminado para una orden reciente?', null, array['N-03'], false, true, false, 5,  'Hacer un ejercicio de reconstrucción de cadena con una orden reciente y cerrar los vacíos encontrados.'),
  ('TD5', 'TQ28', '¿Se conserva la relación entre facturas/remisiones de compra y lotes de entrada?', null, array['N-03'], false, true, false, 6,  'Vincular facturas y remisiones de compra con los lotes de entrada correspondientes.'),
  -- TD6 · Procesos (5)
  ('TD6', 'TQ29', '¿Los procesos internos (corte, confección, acabado, empaque) están definidos y documentados?', null, array['N-03'], false, true, false, 1,  'Documentar los procesos internos principales, aunque sea de forma breve.'),
  ('TD6', 'TQ30', '¿Se registra qué procesos se ejecutan con terceros (maquila, lavandería, estampación)?', null, array['N-03'], false, true, false, 2,  'Listar los procesos tercerizados por referencia u orden.'),
  ('TD6', 'TQ31', '¿Los terceros están identificados como proveedores con datos completos?', null, array['N-03'], false, true, false, 3,  'Incorporar los talleres y terceros al directorio de proveedores.'),
  ('TD6', 'TQ32', '¿Las salidas y retornos de material con terceros quedan documentados (remisiones, actas)?', null, array['N-03'], false, true, false, 4,  'Documentar salidas y retornos de material con terceros mediante remisiones.'),
  ('TD6', 'TQ33', '¿Los procesos húmedos o de acabado que afectan el producto (lavado, tintura, estampado) quedan asociados a la orden?', null, array['N-03'], false, true, false, 5,  'Asociar los procesos de acabado a la orden correspondiente.'),
  -- TD7 · Avíos (5)
  ('TD7', 'TQ34', '¿Los avíos (botones, cierres, etiquetas, herrajes) están catalogados con material y proveedor?', null, array['N-03','N-08'], false, true, false, 1,  'Catalogar los avíos con su material y proveedor.'),
  ('TD7', 'TQ35', '¿Se registra el material de las etiquetas y marquillas?', null, array['N-08'], false, true, false, 2,  'Registrar el material de etiquetas y marquillas por referencia.'),
  ('TD7', 'TQ36', '¿Se sabe qué componentes del producto son separables manualmente?', null, array['N-04','N-10'], false, true, false, 3,  'Identificar los componentes separables manualmente de las referencias principales.'),
  ('TD7', 'TQ37', '¿El empaque del producto está identificado con su material?', null, array['N-05'], false, true, false, 4,  'Identificar el material del empaque de producto.'),
  ('TD7', 'TQ38', '¿Existen instrucciones internas de separación de componentes para fin de vida?', null, array['N-04','N-01'], false, true, false, 5,  'Redactar instrucciones simples de separación de componentes al fin de vida.'),
  -- TD8 · Cuidado (4)
  ('TD8', 'TQ39', '¿Las prendas llevan recomendaciones de cuidado definidas por referencia?', null, array['N-06'], false, true, false, 1,  'Definir recomendaciones de cuidado por referencia.'),
  ('TD8', 'TQ40', '¿Las recomendaciones usan el código de símbolos estandarizado (ISO 3758)?', null, array['N-06'], false, true, false, 2,  'Alinear las etiquetas de cuidado al sistema de símbolos estandarizado.'),
  ('TD8', 'TQ41', '¿Las recomendaciones de cuidado se definen con criterio técnico (proveedor de tela, ensayo o experiencia documentada)?', null, array['N-06','N-07'], false, true, false, 3,  'Basar el cuidado en la ficha del proveedor de tela o en experiencia documentada.'),
  ('TD8', 'TQ42', '¿Existen ensayos de lavado/secado (p. ej. ISO 6330) o de durabilidad para alguna referencia?', null, array['N-07','N-17'], false, true, false, 4,  'Considerar ensayos de lavado o durabilidad para referencias clave.'),
  -- TD9 · Circularidad (6)
  ('TD9', 'TQ43', '¿Se evalúa si el diseño facilita reparación (costuras accesibles, avíos reemplazables)?', null, array['N-04','N-10'], false, true, false, 1,  'Evaluar la reparabilidad del diseño en las referencias principales.'),
  ('TD9', 'TQ44', '¿La empresa ofrece o documenta opciones de reparación o repuestos?', null, array['N-04'], false, true, false, 2,  'Documentar las opciones de reparación o repuestos disponibles.'),
  ('TD9', 'TQ45', '¿Se evalúa el potencial de reutilización o segunda vida del producto?', null, array['N-04','N-10'], false, true, false, 3,  'Evaluar el potencial de segunda vida de los productos principales.'),
  ('TD9', 'TQ46', '¿Se conoce si las referencias principales son monomaterial o mezcla?', null, array['N-08','N-04'], false, true, false, 4,  'Clasificar las referencias principales como monomaterial o mezcla según su composición.'),
  ('TD9', 'TQ47', '¿Se evalúa la reciclabilidad potencial considerando composición y separabilidad, sin declarar claims no soportados?', null, array['N-05','N-04'], false, true, false, 5,  'Evaluar la reciclabilidad potencial con base en composición y separabilidad registradas.'),
  ('TD9', 'TQ48', '¿Se identifican elementos que dificultan el reciclaje (laminados, recubrimientos, mezclas complejas, herrajes)?', null, array['N-04','N-10'], false, true, false, 6,  'Identificar y registrar los elementos que dificultan el reciclaje por referencia.'),
  -- TD10 · Claims (4) — TQ49 es de CONTEXTO: no puntúa; "No" vuelve 50–52 No aplica
  ('TD10','TQ49', '¿La empresa hace claims ambientales (reciclado, orgánico, reciclable, reutilizable) sobre sus productos?', 'Pregunta de contexto: responder "No" no penaliza; indica que las siguientes tres preguntas no aplican.', array['N-05'], false, true, true,  1,  null),
  ('TD10','TQ50', '¿Cada claim tiene soporte documental identificado?', null, array['N-05'], false, true, false, 2,  'Vincular cada claim ambiental a su documento de soporte.'),
  ('TD10','TQ51', '¿Se distingue entre material certificado, proveedor certificado y producto final certificado?', null, array['N-12','N-13','N-05'], false, true, false, 3,  'Precisar el alcance de cada certificado externo: material, proveedor o producto final.'),
  ('TD10','TQ52', '¿Los claims se redactan de forma específica y no ambigua (tipo de material, porcentaje, alcance)?', null, array['N-05'], false, true, false, 4,  'Reescribir los claims con material, porcentaje y alcance específicos.'),
  -- TD11 · Control documental (3)
  ('TD11','TQ53', '¿Los documentos técnicos (manuales, procedimientos, fichas) tienen versión, estado y responsable?', null, array['N-03'], false, true, false, 1,  'Versionar los documentos técnicos con estado y responsable.'),
  ('TD11','TQ54', '¿La información de producto está en formato digital estructurado (no solo papel o archivos sueltos)?', null, array['N-01'], false, true, false, 2,  'Migrar la información de producto a un formato digital estructurado.'),
  ('TD11','TQ55', '¿El personal involucrado conoce los procedimientos de trazabilidad aplicables a su rol?', null, array['N-03'], false, true, false, 3,  'Socializar los procedimientos de trazabilidad con el personal según su rol.'),
  -- TD12 · Pasaporte técnico (3)
  ('TD12','TQ56', '¿La empresa puede generar hoy una ficha consolidada por referencia con composición, origen, procesos y evidencias?', null, array['N-01','N-03'], true,  false, false, 1,  'Construir una ficha consolidada de prueba para una referencia y detectar los vacíos.'),
  ('TD12','TQ57', '¿La empresa ha recibido o anticipa requerimientos de trazabilidad de compradores o revisiones técnicas?', null, array['N-01','N-02'], false, true, false, 2,  'Inventariar los requerimientos de trazabilidad recibidos o previsibles de los compradores.'),
  ('TD12','TQ58', '¿La empresa conoce las brechas de información que le impedirían responder una revisión técnica este mes?', null, array['N-10'], false, true, false, 3,  'Listar las brechas de información frente a una revisión técnica y priorizarlas.')
) as v(scode, qcode, qtext, help, refs, crit, na, ctx, ord, action)
join public.textile_diagnostic_sections s on s.code = v.scode
on conflict (code) do nothing;
