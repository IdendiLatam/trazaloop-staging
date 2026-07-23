# Trazaloop Textil · Roadmap técnico de implementación

> Sprints T0/T0.1/T0.2 — Solo documentación. Los sprints T1+ aquí definidos NO se
> ejecutan en estos sprints; este documento es su especificación de arranque.
> Consolidado en T0.1 (riesgos y dependencia por sprint) y actualizado en T0.2
> (Sprint T0.2 insertado; T1 revisado con la corrección de comunicación pública;
> sprint futuro Plataforma-M1 agregado).

## 1. Objetivo

Definir la secuencia de sprints T0–T11 con objetivo, alcance, rutas, tablas, server
actions, UI, tests, documentación, criterios de aceptación, exclusiones, riesgos y
dependencias, para implementar el MVP privado descrito en `TEXTILES_MVP_SCOPE.md`.

## 2. Alcance y reglas comunes a todos los sprints

- Regla de datos: toda tabla nueva cumple el patrón 0024 (RLS deny-by-default,
  `unique(organization_id, id)`, FK compuestas, triggers estándar, auditoría).
- Regla CPR: cero cambios funcionales a CPR; cambios aditivos solo donde este
  roadmap los declara (T8). Regresión CPR cuando se toquen objetos compartidos.
- Regla de lenguaje: ninguna UI/copy promete certificación o cumplimiento.
- Regla de entrada: las decisiones y preguntas que bloquean un sprint deben estar
  cerradas antes de iniciarlo (`TEXTILES_DECISION_LOG.md`,
  `TEXTILES_OPEN_QUESTIONS.md`); el `TEXTILES_IMPLEMENTATION_ENTRY_CHECKLIST.md`
  se verifica antes de T1.
- Cada sprint termina con: migraciones aplicadas en staging, tests verdes
  (`tests/rls`, `tests/unit` + suites del sprint), documentación de guía actualizada
  y demo interna.
- "Qué no hacer" es vinculante por sprint.

## 3. Sprints

### Sprint T0 — Arquitectura documental (completado)
- **Objetivo**: carpeta `docs/modules/textiles/` con los 13 documentos base.
- **Alcance**: solo documentación; análisis del código CPR.
- **Rutas/tablas/acciones/UI/tests**: ninguno.
- **Documentación**: los 13 documentos base.
- **Criterios de aceptación**: cumplidos (documentos creados, referencias cruzadas,
  lenguaje prudente).
- **No hacer**: código, migraciones, seeds, UI, datos demo.
- **Riesgos**: ambigüedades residuales → se atienden en T0.1.
- **Dependencia**: ninguna.

### Sprint T0.1 — Consolidación final documental (este sprint)
- **Objetivo**: revisar coherencia del paquete T0, cerrar decisiones bloqueantes y
  dejar checklist de entrada a implementación.
- **Alcance**: actualización de los 13 documentos donde aplique + 6 documentos
  nuevos: consolidation report, entry checklist, decision log, risk register,
  matriz normativa de trazabilidad y prompt listo para T1.
- **Rutas/tablas/acciones/UI/tests**: ninguno.
- **Documentación**: `TEXTILES_T0_1_CONSOLIDATION_REPORT.md`,
  `TEXTILES_IMPLEMENTATION_ENTRY_CHECKLIST.md`, `TEXTILES_DECISION_LOG.md`,
  `TEXTILES_RISK_REGISTER.md`, `TEXTILES_NORMATIVE_TRACEABILITY_MATRIX.md`,
  `TEXTILES_T1_READY_PROMPT.md`.
- **Criterios de aceptación**: decisiones DL-01…DL-15 cerradas; veredicto de
  preparación emitido; cero contradicciones abiertas.
- **No hacer**: código, migraciones, cambios a CPR, activación del módulo.
- **Riesgos**: cerrar decisiones sin dueño de producto presente → las DL marcan
  qué queda condicionado a ratificación de negocio.
- **Dependencia**: T0 completado.

### Sprint T0.2 — Arquitectura modular de plataforma y acceso por módulos (este sprint)
- **Objetivo**: fijar que Trazaloop es la plataforma y CPR un módulo; documentar el
  modelo de acceso por módulo y corregir el alcance de T1.
- **Alcance**: 6 documentos nuevos (arquitectura modular, modelo de acceso, copy de
  landing, decisión de planes por módulo, prompt T1 revisado, reporte T0.2) +
  actualización de decision log (DL-16…DL-22), risk register (R-17…R-24), roadmap,
  checklist y documentos base afectados.
- **Rutas/tablas/acciones/UI/tests**: ninguno.
- **Documentación**: `TRAZALOOP_MODULAR_PLATFORM_ARCHITECTURE.md`,
  `TRAZALOOP_MODULE_ACCESS_MODEL.md`, `TRAZALOOP_PUBLIC_LANDING_AND_MODULES_COPY.md`,
  `TRAZALOOP_MODULE_PLANS_DECISION.md`, `TEXTILES_T1_READY_PROMPT_REVISED.md`,
  `TEXTILES_T0_2_MODULAR_PLATFORM_REPORT.md`.
- **Criterios de aceptación**: DL-16…DL-22 cerradas; T1 revisado sin ambigüedad;
  planes por módulo documentados y explícitamente NO implementados (DL-22).
- **No hacer**: código, migraciones, cambios a CPR, planes por módulo, facturación.
- **Riesgos**: sobre-diseñar el acceso modular antes del piloto → decisión por
  fases (piloto sin cambios; comercial en Plataforma-M1).
- **Dependencia**: T0.1 completado.

### Sprint T1 — Plataforma en la comunicación pública + shell privado de Textil — **IMPLEMENTADO**

> **Estado (T1 ejecutado)**: implementado según
> `TEXTILES_T1_IMPLEMENTATION_REPORT.md` — landing con hero "Trazaloop", tarjeta
> del portal con clave `textiles` y acceso privado condicional, guard
> `require-textiles-module` (flag + habilitación → 404), migración única 0070
> (`is_available = false`), test `tests/unit/textiles-module.test.ts`, 14 suites
> CPR en verde. Desviaciones documentadas en el reporte §8 (activación de pilotos
> vía SQL del operador; la acción/consola de activación se difiere a
> Plataforma-M1 por la RLS vigente de `organization_modules`).

- **Objetivo**: (A) la landing comunica **Trazaloop** como plataforma con CPR como
  módulo disponible y Textil como módulo privado/próximo (DL-17/DL-21); (B) el
  módulo Textil existe de forma privada e inaccesible al público.
- **Alcance**: Parte A — hero y textos de tarjetas de `app/page.tsx` según
  `TRAZALOOP_PUBLIC_LANDING_AND_MODULES_COPY.md` (+ metadato global si nombra mal
  la plataforma). Parte B — feature flag de entorno; fila `modules.code='textiles'`
  (DL-01) y actualización de la constante visual `key: "textil"` del portal
  interno; activación por `organization_modules` (mecanismo vigente, suficiente
  para T1); guard `require-textiles-module`; layout y navegación del namespace;
  visibilidad de configuración del módulo en consola superadmin. **Sin
  implementación de planes por módulo** (DL-22).
- **Rutas**: `app/(app)/(shell)/textiles/{layout,page}`, `/textiles/dashboard`
  (placeholder honesto, sin datos falsos). No son rutas públicas definitivas.
- **Tablas**: ninguna de dominio (solo fila en catálogo `modules`; ver
  `TEXTILES_DATA_MODEL_PROPOSAL.md` §6.4).
- **Server actions**: activación/desactivación del módulo desde consola plataforma.
- **UI**: hero/tarjetas de la landing (textos); tarjeta del portal habilitada solo
  para orgs activadas; nav lateral textil.
- **Tests**: acceso denegado sin activación (RLS/guards); regresión de portal y
  landing; build verde; ajuste documentado del test de contenido del hero si existe.
- **Documentación**: nota de activación en guía de plataforma; deuda de acceso
  modular avanzado registrada (Plataforma-M1).
- **Criterios**: la landing muestra Trazaloop como plataforma y CPR como módulo;
  usuario sin activación nunca ve rutas textiles; `/modules`, planes, onboarding y
  TrazaDocs CPR intactos; build sin errores.
- **No hacer**: tablas de dominio, diagnóstico, TrazaDocs Textil, datos demo,
  exposición pública, planes por módulo, reestructurar CPR bajo `/cpr`, rediseñar
  la landing.
- **Riesgos**: tocar la página `/modules` o la landing más allá de los textos y la
  constante; guard mal ubicado que filtre rutas. Mitigación: cambios mínimos +
  tests de acceso + diff revisado (R-17 se cierra aquí).
- **Dependencia**: T0.2 (checklist de entrada verificado, prompt revisado).

### Sprint T2 — Diagnóstico Textil — **IMPLEMENTADO**

> **Estado (T2 ejecutado)**: implementado según
> `TEXTILES_T2_IMPLEMENTATION_REPORT.md` — migración 0071 (4 tablas + RLS patrón
> 0024 + seed de 12 dimensiones / 58 preguntas), scoring puro con regla de
> contexto TQ49 y topes por críticas, rutas `/textiles/diagnostic` y
> `/textiles/diagnostic/results`, wizard de 4 opciones, gate Demo de
> recomendaciones con la feature transversal existente, 18 tests de scoring e
> invariantes en verde y regresión CPR completa (14 suites) en verde. La
> validación experta del banco (Q-16) sigue pendiente antes del piloto.

- **Objetivo**: diagnóstico completo con scoring y brechas iniciales.
- **Alcance**: catálogos globales + instancia por organización + wizard + resultado.
- **Rutas**: `/textiles/diagnostic`, `/textiles/diagnostic/result`.
- **Tablas**: `textile_diagnostic_sections`, `textile_diagnostic_questions`,
  `textile_diagnostics`, `textile_diagnostic_answers` (+ seed de 58 preguntas).
- **Server actions**: `textiles-diagnostic.ts` (iniciar, responder, completar).
- **UI**: wizard por dimensiones (patrón CPR), resultado con niveles, advertencia y
  recomendaciones.
- **Tests**: scoring puro (`lib/domain/textiles-diagnostic.ts`): parciales, NA,
  críticas, condicionales D10; RLS de respuestas.
- **Documentación**: guía de diagnóstico textil.
- **Criterios**: fórmulas del `TEXTILES_DIAGNOSTIC_MODEL.md` §5 exactas; Demo sin
  recomendaciones avanzadas.
- **No hacer**: reutilizar tablas/preguntas CPR; recomendaciones automáticas
  complejas.
- **Riesgos**: seed de preguntas sin validación experta (Q-16) → sesión de
  validación previa; errores de scoring → tests exhaustivos de dominio puro.
- **Dependencia**: T1 (shell y activación operativos).

### Sprint T2.1 — Hardening del diagnóstico textil — **IMPLEMENTADO**

> **Estado (T2.1 ejecutado)**: implementado según
> `TEXTILES_T2_1_HARDENING_REPORT.md` — migración 0072: sin UPDATE directo de
> clientes sobre `textile_diagnostics` (política eliminada), INSERT "en cero",
> trigger de protección de campos calculados con bandera transaccional,
> finalización EXCLUSIVA por la RPC SECURITY DEFINER
> `finalize_textile_diagnostic` (valida identidad, membresía, habilitación del
> módulo, borrador, completitud, NA inválidos y regla TQ49, y calcula el
> resultado en SQL espejo del dominio), validación de respuestas en BD (pregunta
> activa; NA prohibido donde `allows_na = false`), respuestas de finalizados
> inmutables para todos los roles, `finalized_by` para trazabilidad y decisión
> de NO reapertura (DL-23/DL-24). Server action de finalizar migrada a la RPC;
> UI sin cambios; 18 tests nuevos + regresión completa en verde.

### Sprint T3 — Catálogos textiles
- **Objetivo**: catálogos base operativos.
- **Alcance**: fibras (global), colecciones, productos, referencias, proveedores,
  materiales, procesos.
- **Rutas**: `/textiles/{products,collections,references,suppliers,materials,processes}`.
- **Tablas**: `textile_fiber_types` (+seed), `textile_collections`,
  `textile_products`, `textile_references`, `textile_suppliers`,
  `textile_materials`, `textile_processes`.
- **Server actions**: `textiles-catalog.ts` (CRUDs con guardas y validaciones).
- **UI**: listados con filtros + formularios (patrón `domain/catalog`).
- **Tests**: RLS por tabla; unicidad de códigos; validaciones de dominio.
- **Documentación**: guía de catálogos.
- **Criterios**: Q-01/Q-02/Q-03/Q-05 cerradas y reflejadas; sin datos demo.
- **No hacer**: composición (T4), lotes (T6), importaciones.
- **Riesgos**: modelar variantes en exceso (Q-02/Q-03) → atributos simples primero.
- **Dependencia**: T2 (o T1 si se decide paralelizar; el diagnóstico no consume
  catálogos).

> **Estado (T3 ejecutado)**: implementado según
> `TEXTILES_T3_IMPLEMENTATION_REPORT.md` con alcance AJUSTADO por el prompt
> operativo del sprint: T3 cubre solo catálogos base — proveedores, fibras
> (global + seed de 19), materiales e insumos, avíos/componentes, procesos
> internos y procesos tercerizados (migración `0073`, rutas
> `/textiles/catalogs/*`, actions `textiles-catalogs.ts`). Productos,
> referencias y colecciones se MOVIERON a T4 (con la composición), lo que
> además difiere Q-02/Q-03 a ese sprint; los componentes (previstos en T4)
> se adelantaron a T3 como catálogo simple con separabilidad. Sin filtros ni
> importaciones (fuera de alcance del prompt). Todo tras la triple guarda
> del módulo; sin cambios funcionales en CPR.

### Sprint T4 — Productos, referencias y composición ✅ IMPLEMENTADO
> **Estado (T4)**: implementado. Migración `0074_textile_products_and_composition.sql`
> con `textile_collections`, `textile_products`, `textile_references`,
> `textile_reference_fiber_composition`, `textile_reference_materials` y
> `textile_reference_components` (RLS multiempresa, FKs compuestas,
> inmutabilidad de `organization_id`, auditoría). Rutas reales:
> `/textiles/products`, `/textiles/products/collections`,
> `/textiles/products/[id]` y `/textiles/references/[id]` (no
> `/textiles/composition`: la composición vive como secciones del detalle de
> referencia, coherente con el patrón de páginas del proyecto). El
> polimorfismo `owner_type` previsto se DESCARTÓ: la composición ancla solo
> a la referencia/SKU vía FK compuesta — más simple y org-safe por diseño
> (elimina el riesgo señalado abajo). Estado de completitud not_started /
> incomplete / complete / needs_review calculado por alcance con tolerancia
> 100 ± 0.5, sin bloquear guardados parciales; reciclado/orgánico solo como
> declaración preliminar (evidencia en T5). Ver
> `TEXTILES_T4_PRODUCTS_COMPOSITION_IMPLEMENTATION_REPORT.md`.

- **Objetivo**: composición de fibras y componentes con evidencia pendiente.
- **Alcance**: editor de composición polimórfico; componentes con separabilidad.
- **Rutas**: `/textiles/composition`, pestañas en detalle de producto/referencia.
- **Tablas**: `textile_fiber_compositions`, `textile_components`.
- **Server actions**: `textiles-composition.ts`.
- **UI**: editor con validación de suma 100 %, semáforo declarada/evidenciada.
- **Tests**: suma parcial permitida con brecha; polimorfismo org-safe (RLS + trigger).
- **Documentación**: guía de composición.
- **Criterios**: componentes con roles del modelo; sin claims aún.
- **No hacer**: cálculo de reciclabilidad (T7), evidencias (T5).
- **Riesgos**: el polimorfismo de `owner_type` sin salvaguardas → triggers/tests de
  consistencia organizacional obligatorios.
- **Dependencia**: T3 (catálogos de fibras, productos y referencias).

### Sprint T5 — Proveedores, insumos y evidencias
- **Objetivo**: evidencias operativas y claims documentados.
- **Alcance**: evidencias con estados/vigencias, vínculos polimórficos, claims;
  decisión de bucket/prefijo de storage (D-07).
- **Rutas**: `/textiles/evidences`, `/textiles/claims` (o pestaña).
- **Tablas**: `textile_evidences`, `textile_evidence_links`, `textile_claims`,
  `textile_claim_evidences` (o decisión de usar links; cerrar aquí).
- **Server actions**: `textiles-evidences.ts`, `textiles-claims.ts`.
- **UI**: carga a storage del módulo, validación por supervisor, semáforos de
  vigencia; claim solo "supported" con evidencia válida.
- **Tests**: RLS de storage y tablas; transición de estados de evidencia; regla de
  soporte de claims.
- **Documentación**: guía de evidencias y claims.
- **Criterios**: bucket/prefijo separado de CPR y de TrazaDocs; ISO 14021 reflejada
  en la redacción de claims; matriz de evidencia suficiente (Q-09) publicada.
- **No hacer**: verificación automática, OCR, firma.
- **Riesgos**: claims marcados "soportados" con evidencia débil → regla dura
  evidencia válida + revisión de supervisor; storage mal aislado → tests RLS de
  storage.
- **Dependencia**: T4 (objetos a los que se vinculan evidencias).

### Sprint T6 — Órdenes, lotes y trazabilidad
- **Objetivo**: cadena insumo → proceso → lote reconstruible.
- **Alcance**: órdenes, ruta de procesos (incl. terceros), lotes entrada/salida,
  links, vista de cadena.
- **Rutas**: `/textiles/orders`, `/textiles/batches`, `/textiles/orders/[id]/chain`.
- **Tablas**: `textile_process_orders`, `textile_order_processes`,
  `textile_input_batches`, `textile_output_batches`,
  `textile_traceability_links` + vistas `textile_v_*` de cadena.
- **Server actions**: `textiles-traceability.ts`.
- **UI**: gestión de órdenes/lotes y pantalla de cadena.
- **Tests**: reconstrucción de cadena; links polimórficos org-safe; RLS de vistas.
- **Documentación**: guía de trazabilidad.
- **Criterios**: un usuario reconstruye la cadena de una orden en una pantalla;
  tercerizados registrables con proveedor y evidencia.
- **No hacer**: prenda a prenda, EPCIS, cantidades obligatorias estrictas.
- **Riesgos**: sobre-modelar la ruta de procesos → ruta simple del modelo; grafo
  ilegible → vistas dedicadas.
- **Dependencia**: T5 (proveedores/materiales/evidencias disponibles).

### Sprint T7 — Evaluación de circularidad
- **Objetivo**: matriz de 7 indicadores + índice de preparación circular con estados.
- **Alcance**: evaluación por referencia con versiones y estados.
- **Rutas**: `/textiles/circularity`, pestaña en referencia.
- **Tablas**: `textile_circularity_assessments`.
- **Server actions**: `textiles-circularity.ts`.
- **UI**: matriz editable + resultado con advertencia.
- **Tests**: reglas del `TEXTILES_CIRCULARITY_ASSESSMENT_MODEL.md` §3–§4, incl.
  No evaluable y tope 40 %; en `lib/domain/textiles-circularity.ts` puro.
- **Documentación**: guía de circularidad.
- **Criterios**: advertencia inseparable del índice; versión nueva desde aprobado;
  marca de desactualización.
- **No hacer**: ACV, huella, claims automáticos, badges visuales tipo sello.
- **Riesgos**: umbrales internos leídos como norma → rotularlos "criterio interno";
  validación experta pendiente (Q-16) → sesión previa.
- **Dependencia**: T4 (composición/componentes) y T6 (contexto de lotes, opcional).

### Sprint T8 — TrazaDocs Textil
- **Objetivo**: motor multi-módulo + 13 estructuras textiles + maestro filtrado.
- **Alcance**: migración aditiva `module_key` (+`recommendation_level`), parámetros
  de módulo en dominio/acciones/vistas, consola superadmin con filtro, seed de
  blueprints, política de roles textil (D-06), conteo Demo por módulo (D-09).
- **Rutas**: `/textiles/trazadocs`, `/textiles/trazadocs/master`,
  `(print)/textiles/trazadocs/[id]`; consola `platform/trazadocs` con selector.
- **Tablas**: cambios aditivos sobre `trazadoc_*` (única excepción autorizada).
- **Server actions**: extensión parametrizada por módulo de las acciones TrazaDocs.
- **UI**: TrazaDocs textil + maestro filtrado + selector de módulo en consola.
- **Tests**: **regresión CPR completa** + aislamiento entre módulos + política de
  roles + conteo Demo por módulo.

> **Estado (T8 ejecutado)**: implementado según
> `TEXTILES_T8_TRAZADOCS_IMPLEMENTATION_REPORT.md`. Migración
> `0082_textile_trazadocs.sql`: `module_key` aditivo ('cpr' default,
> check 'cpr'/'textiles') en `trazadoc_blueprints`/`trazadoc_documents`, trigger de
> herencia/inmutabilidad, 3 vistas ampliadas (columna al final) y seed de 12
> estructuras TXT con 140 secciones y tips. Cero tablas nuevas: el motor
> TrazaDocs (transiciones/versionado/roles/límite de plan) se reutiliza
> completo; los listados/consultas de código filtran por módulo con default
> 'cpr' (CPR intacto). Rutas `/textiles/trazadocs`,
> `/textiles/trazadocs/[documentId]` y `(print)/…/print` bajo la guarda Textil.
> Diferencias frente al plan original de este roadmap, decididas en el encargo
> T8: 12 estructuras (no 13), sin `recommendation_level`, sin conteo Demo por
> módulo (mismo límite global `documents_trazadocs`), sin maestro Textil propio
> (columna lista; maestro sigue CPR) y sin selector de módulo en la consola de
> plataforma (los blueprints textiles aparecen allí sin etiqueta — limitación
> documentada). Suite `tests/trazadocs/textiles-trazadocs.test.ts` (20 checks) y
> regresión CPR en verde.

> **Estado (T8.1 ejecutado)**: hardening de edición de secciones —
> `TEXTILES_T8_1_TRAZADOCS_SECTION_HARDENING_REPORT.md`. Migración
> `0083_trazadocs_section_module_hardening.sql` (trigger de integridad de
> secciones: padre editable + inmutabilidad de `document_id`/`section_key`) y
> reemplazo del helper inseguro por `updateSectionContentForDocument({...})`
> con amarre organización+documento+sección+módulo+estado+rol. CPR sin cambios
> funcionales (suite CPR en verde). Suite
> `tests/trazadocs/trazadocs-section-hardening.test.ts` 15/15.
- **Documentación**: guía TrazaDocs Textil.
- **Criterios**: los de `TEXTILES_TRAZADOCS_MODEL.md` §13.
- **No hacer**: motor nuevo (Opción C), export PDF, tocar contenido CPR.
- **Riesgos**: el mayor del programa — romper TrazaDocs CPR (R-02 del
  `TEXTILES_RISK_REGISTER.md`) → sprint aislado, regresión completa, rollback
  planificado; `module_key` aplicado de forma incompleta (R-03) → checklist de
  consultas/acciones/vistas afectadas.
- **Dependencia**: T1 (solo el shell); paralelizable desde T5.

### Sprint T9 — Pasaporte técnico textil
- **Objetivo**: generación, revisión, aprobación interna e impresión del pasaporte.
- **Alcance**: snapshot versionado, transiciones de estado, impresión.
- **Rutas**: `/textiles/passports`, `/textiles/passports/[id]`,
  `(print)/textiles/passports/[id]`.
- **Tablas**: `textile_material_passports` (+ historial de estados).
- **Server actions**: `textiles-passports.ts` (generar snapshot, transiciones,
  nueva versión).
- **UI**: gestión de pasaportes + vista imprimible con advertencia fija.
- **Tests**: inmutabilidad de aprobado; `schema_version` del snapshot; brechas en
  bloque G; marca de desactualización.
- **Documentación**: guía del pasaporte.
- **Criterios**: bloques A–H con niveles MVP-OB completos; advertencia fija;
  Q-12/Q-13/Q-14 con diseño (no implementación) documentado.
- **No hacer**: QR, PDF server-side, compartición externa.
- **Riesgos**: percepción de "DPP oficial" (R-05) → advertencia fija + naming
  interno; snapshot incompleto → generación desde vistas consolidadas testeadas.
- **Dependencia**: T7 (circularidad) y T8 (documentos referenciables en bloque H).

### Sprint T10 — Reportes, brechas y preparación piloto
- **Objetivo**: brechas consolidadas, reportes imprimibles, dashboard final,
  onboarding textil; (opcional) importaciones CSV básicas.
- **Alcance**: consolidación de salida para uso real.
- **Rutas**: `/textiles/gaps`, `/textiles/reports`, dashboard definitivo.
- **Tablas**: vistas de brechas/consolidados (sin tablas nuevas salvo necesidad).
- **Server actions**: lectura/reportes; onboarding textil.
- **UI**: reportes imprimibles, matriz de brechas, dashboard, checklist onboarding.
- **Tests**: consistencia brechas ↔ fuentes; impresión.
- **Documentación**: guías de usuario textil (patrón `docs/*_GUIDE.md`) + guía de
  piloto (patrón `COMPANY_TESTING_GUIDE.md`/`FAQ_PILOT.md`).
- **Criterios**: una empresa de prueba completa el flujo diagnóstico → catálogos →
  composición → evidencias → orden/lote → circularidad → pasaporte sin intervención
  técnica.
- **No hacer**: reportes programados, API.
- **Riesgos**: crecimiento de alcance (importaciones) → marcadas opcionales y
  recortables.
- **Dependencia**: T7 + T8 + T9.

### Sprint T11 — RLS, QA, hardening y beta privada
- **Objetivo**: seguridad y calidad para activar pilotos reales.
- **Alcance**: auditoría RLS de todas las tablas textiles (patrón
  `0016`/`0024`/hardenings), revisión de storage, cuotas si aplican, checklist
  pre-despliegue textil (patrón `PREDEPLOY_CHECKLIST.md`), smoke tests, activación
  controlada de 1–3 empresas piloto.
- **Rutas/tablas**: sin novedades funcionales; correcciones de hardening.
- **Server actions**: correcciones de guardas si la auditoría las exige.
- **UI**: correcciones menores de QA.
- **Tests**: suite RLS completa; `tests/compliance` de lenguaje (búsqueda de
  vocabulario prohibido en copies); smoke E2E del flujo núcleo.
- **Documentación**: checklist pre-despliegue textil; acta de activación de pilotos.
- **Criterios**: cero hallazgos RLS críticos; regresión CPR verde; pilotos activados
  solo por superadmin.
- **No hacer**: lanzamiento público, marketing, límites de plan definitivos (fase
  comercial).
- **Riesgos**: presión por saltar hardening para llegar al piloto → criterio "cero
  hallazgos críticos" no negociable.
- **Dependencia**: T10.

### Sprint Plataforma-M1 — Acceso avanzado por módulo y planes modulares (futuro, fuera de la secuencia T)
- **Objetivo**: implementar el acceso comercial por módulo especificado en
  `TRAZALOOP_MODULE_ACCESS_MODEL.md` y `TRAZALOOP_MODULE_PLANS_DECISION.md`.
- **Alcance**: tabla `organization_module_access` (o equivalente ratificado) con
  plan/estado por módulo + historial append-only; backfill del plan global como
  plan CPR; planes y límites por módulo (`plan_limits` con dimensión de módulo);
  estados y precedencias (suspensión global domina; suspensión de módulo no afecta
  a los demás); consola superadmin avanzada (matriz empresa × módulo × plan ×
  estado × uso); vistas de uso por módulo (evolución de
  `v_organization_plan_usage`); migración de guards a la fuente de verdad nueva con
  sincronización derivada durante la transición.
- **Tests**: pruebas de seguridad y consistencia (una sola fuente de verdad, sin
  acceso sin habilitación — R-22), conteos por módulo (R-23), regresión CPR
  completa (toca planes y guards).
- **Documentación**: guía comercial de módulos y planes; actualización de la
  semántica Demo (R-24) en documentación de usuario.
- **Criterios de aceptación**: los tres escenarios de negocio (CPR Full + Textil
  Demo; CPR Extra + Textil Extra + Quality Demo; solo CPR Demo) son expresables y
  operables por superadmin; cero regresiones CPR; DL-18/DL-19/DL-20 implementadas.
- **Qué no hacer**: facturación y pagos (fuera de alcance de este sprint).
- **Riesgos**: el segundo mayor del programa tras T8 (toca planes/guards de toda la
  plataforma) → sprint dedicado, jamás mezclado con T1 (DL-22); inventario previo
  de guards/vistas dependientes como primer entregable.
- **Dependencia**: T1 (shell y activación simple operativos); recomendable tras el
  piloto (T11) para diseñar límites con datos reales; requiere ratificar Q-21 y la
  regla de `team_members`.

## 4. Dependencias y ruta crítica

T0 → T0.1 → T0.2 → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T9; T8 depende solo de T1
(paralelizable desde T5); T10 depende de T7+T8+T9; T11 cierra la secuencia del MVP.
**Plataforma-M1** es un sprint de plataforma fuera de la secuencia T: depende de T1
y se recomienda después de T11 (piloto), siempre antes de vender módulos
independientes. Bloqueos por preguntas abiertas: Q-01/Q-02/Q-03/Q-05 bloquean T3;
Q-09 bloquea T5; Q-11 bloquea T7; Q-18 bloquea T8; Q-12/Q-13/Q-14 (diseño)
bloquean T9; Q-15/Q-19 bloquean T10/T11; Q-21 y la regla de `team_members`
bloquean Plataforma-M1.

## 5. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Secuencia diagnóstico → datos → evidencias → circularidad → pasaporte | N-03, N-05, N-10, N-01 (contexto) | El orden de sprints replica la lógica "primero información y evidencia, luego consolidados". | Que completar el roadmap otorgue conformidad alguna. |
| Tests de lenguaje (T11) | N-05 | Verificación automatizada de vocabulario prudente. | n/a |

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| T8 (module_key) impacta CPR | Sprint aislado, regresión completa, rollback simple, ventana de despliegue controlada. |
| Acumulación de deuda por polimorfismo | Tests RLS/consistencia obligatorios en T4/T5/T6; vistas para lectura. |
| Alcance de T10 crece (importaciones) | Importaciones marcadas opcionales; recortables sin afectar ruta crítica. |
| Preguntas abiertas sin resolver bloquean sprints | Mapa de bloqueos en §4; resolverlas es criterio de entrada del sprint. |

Registro completo con severidad y probabilidad: `TEXTILES_RISK_REGISTER.md`.

## 7. Criterios de aceptación (del roadmap)

- [ ] Cada sprint tiene objetivo, alcance, rutas, tablas, acciones, UI, tests,
  documentación, criterios, exclusiones, riesgos y dependencia.
- [ ] La ruta crítica y los bloqueos por preguntas abiertas están declarados.
- [ ] Ningún sprint viola las exclusiones del MVP ni los invariantes CPR.

## 8. Próximos pasos

1. Verificar `TEXTILES_IMPLEMENTATION_ENTRY_CHECKLIST.md` y arrancar T1 con
   `TEXTILES_T1_READY_PROMPT.md`.
2. Cerrar Q-01/Q-02/Q-03/Q-05 antes de T3.


---

## Estado T5 (Julio 2026): ✅ IMPLEMENTADO

Migración `0075_textile_evidences.sql`: `textile_evidences` (13 tipos, 5
estados de revisión interna, vigencia, archivo en bucket privado) y
`textile_evidence_links` (vínculo polimórfico a 11 entidades textiles con
FK compuesta + trigger mismo-tenant `validate_textile_evidence_link_org` +
CHECKs de catálogo cerrado). Guard `guard_textile_evidence_review`: estados
solo admin/quality; consultant carga/edita pendientes. Storage: bucket
privado `evidences` reutilizado con ruta `{org}/textiles/{evidencia}/{archivo}`
(políticas 0015 intactas), subida con sesión del usuario, apertura por
signed URL de 10 min, MIME/20 MB/cuota validados. UI: `/textiles/evidences`
(+ `/new`, `/[id]`) con filtros, revisión, vínculos y avisos de no
certificación; brechas simples de reciclado/orgánico/composición en el
detalle de referencia. Suite `tests/evidences/textiles-evidences.test.ts`
(21 checks) en verde; CPR intacto. Detalle:
`TEXTILES_T5_EVIDENCES_IMPLEMENTATION_REPORT.md`. Siguiente: T6 (órdenes,
lotes y trazabilidad).


## Estado T5.1 (Julio 2026): ✅ HARDENING APLICADO

Migración `0076_textile_evidences_hardening_and_storage_usage.sql`: la
vista `v_organization_plan_usage` suma los bytes de evidencias textiles
(mismas columnas/protecciones de 0059, sin conteos por módulo); delete de
storage acotado al prefijo `{org}/textiles/…` con roles de subida y
`safe_uuid` (la limpieza de huérfanos ya es real; rutas CPR sin cambios);
insert/update de evidencias e insert de vínculos endurecidos a
admin/quality/consultant conservando el nacimiento en `pending_review`;
signed URLs con verificación de prefijo; docs de habilitación corregidos a
`module_code` (sin `enabled_by`). Suite
`tests/evidences/textiles-evidences-hardening.test.ts` 13/13. Detalle:
`TEXTILES_T5_1_EVIDENCES_HARDENING_REPORT.md`.


## Estado T5.2 (Julio 2026): ✅ HARDENING APLICADO

Migración `0077_textile_evidence_file_metadata_immutability.sql`:
`protect_textile_evidence_file_metadata` (BEFORE UPDATE, IS DISTINCT FROM)
hace inmutables `file_path`/`file_name`/`file_mime_type`/`file_size_bytes`
tras la creación — en los 5 estados y también para service_role — y
`validate_textile_evidence_file_path` (BEFORE INSERT) exige el patrón
estricto `{org}/textiles/{id}/[A-Za-z0-9._-]+`. Sin reemplazo de archivo
(decisión: nueva evidencia/versión/RPC en el futuro). Actions ya cumplían;
sin cambios de UI. Suite
`tests/evidences/textiles-evidence-file-metadata-immutability.test.ts` en
verde. Detalle: `TEXTILES_T5_2_FILE_METADATA_IMMUTABILITY_REPORT.md`.


## Estado T6 (Julio 2026): ✅ IMPLEMENTADO — Órdenes, lotes y trazabilidad

Migración `0078_textile_orders_lots_traceability.sql`: 5 tablas
(`textile_production_orders`, `textile_input_lots`,
`textile_order_consumptions`, `textile_order_process_steps`,
`textile_output_lots` — si el roadmap original preveía otros nombres, los
definitivos son estos, alineados con el encargo T6 §7), 2 vistas
security_invoker (balance de lote y resumen de trazabilidad por lote
final), guard de sobreconsumo (bloqueo si comparable — D-T6-01), extensión
de vínculos de evidencias a 16 entidades / 17 tipos con el trigger
cross-tenant ampliado, RLS patrón CPR 0025 + T5.1, y 6 rutas bajo
`/textiles/traceability` con estado de trazabilidad y brechas. Suite
`tests/traceability/textiles-traceability.test.ts` 22/22 (30 puntos del
encargo). Detalle: `TEXTILES_T6_ORDERS_LOTS_TRACEABILITY_IMPLEMENTATION_REPORT.md`.


## Estado T6.1 (Julio 2026): ✅ HARDENING APLICADO

Migración `0079_textile_traceability_status_hardening.sql`:
`traceability_status` inmutable por UPDATE directo (trigger BEFORE con flag
transaccional `trazaloop.textile_traceability_recalculate`, solo activable
por la función controlada); cálculo del estado replicado en SQL (espejo del
dominio T6/T5); triggers AFTER de recálculo en consumos, procesos, lotes
finales, órdenes, lotes de entrada y vínculos de evidencias (incluye
sobreconsumo posterior); RPC `recalculate_textile_output_lot_traceability`
para el botón manual (valida sesión, membresía y módulo con `module_code`);
evaluador vivo alineado con el SQL. Suite
`tests/traceability/textiles-traceability-hardening.test.ts` 14/14.
Detalle: `TEXTILES_T6_1_TRACEABILITY_STATUS_HARDENING_REPORT.md`.

## Estado T7 (Julio 2026): ✅ IMPLEMENTADO

Migración `0080_textile_circularity_assessments.sql`: metodología global
versionada `TEXTILE_CIRCULARITY_PREP v1` (activa) + 30 criterios seed en 6
dimensiones con pesos 20/20/15/15/20/10 (suman 100);
`textile_circularity_assessments` (por referencia/SKU, lote final opcional
de la MISMA referencia — trigger) y `textile_circularity_answers` (0–1,
N/A solo con `allows_na`, congeladas al completar), ambas con RLS, FKs
compuestas, `organization_id` inmutable y auditoría. Campos calculados
(score, nivel, dimensiones, brechas, recomendaciones, sellos) protegidos
por trigger + flag `trazaloop.textile_circularity_calculate`; evaluación
`completed` = snapshot histórico (solo archivable; actualizar = nueva
evaluación). Cálculo en BD desde DATOS REALES (composición 100 ± 0,5,
materiales/proveedores, soportes por estado — accepted 1 / pending 0,5 /
expired 0,5 + advertencia / rejected 0 + brecha / archived 0 —,
separabilidad T3, consumos y sobreconsumo directo; `traceability_status`
solo como indicador auxiliar) + respuestas manuales; niveles <25/<50/<70/
<85/≥85. RPCs `recalculate…`/`finalize…` validan módulo (`module_code`) y
rol (finaliza admin/quality). Vínculos de evidencia ampliados a
`circularity_assessment` con 6 tipos de soporte nuevos (superconjunto,
cross-tenant intacto). Rutas `/textiles/circularity{,/assessments,/new,
/[id]}` bajo guard; tarjetas en referencia y lote final; shell con sexta
sección (futuras: TrazaDocs Textil y pasaporte). La matriz simple de 7
indicadores prevista originalmente evolucionó al modelo por criterios
ponderados del encargo T7 (§6–§8). Sin certificación, pasaporte, QR, IA,
ACV/huella ni planes por módulo; CPR intacto. Suite
`tests/circularity/textiles-circularity.test.ts` 32/32 (puntos 1–46).
Detalle: `TEXTILES_T7_CIRCULARITY_ASSESSMENT_IMPLEMENTATION_REPORT.md`.


## Estado T7.1 (Julio 2026): ✅ HARDENING APLICADO

Migración `0081_textile_circularity_creation_hardening.sql`: trigger
BEFORE INSERT sobre `textile_circularity_assessments` que exige nacer como
borrador limpio (status `draft`; los 8 campos calculados en sus defaults),
salvo bajo el mismo flag transaccional de 0080. Cierra el riesgo de
insertar por API directa una evaluación ya `completed` con puntaje/nivel/
brechas fabricados. Sin cambios a 0080, RLS ni actions (el insert de la
app ya era mínimo). Suite
`tests/circularity/textiles-circularity-hardening.test.ts` 12/12.
Detalle: `TEXTILES_T7_1_CIRCULARITY_CREATION_HARDENING_REPORT.md`.


## Estado T9.0 (Julio 2026): ✅ ARQUITECTURA DOCUMENTADA (sin código)

Sprint **documental y arquitectónico** del pasaporte técnico textil. No crea
código, migraciones, rutas, server actions ni UI; no toca CPR. Entregó 10
documentos de diseño en `docs/modules/textiles/`
(`TEXTILES_T9_0_TECHNICAL_PASSPORT_ARCHITECTURE.md` y hermanos: modelo de datos,
secciones, mapeo de fuentes, snapshot/versionamiento, seguridad/RLS, matriz de
preparación normativa, gaps/warnings, flujo de UI y prompt T9A).

Decisiones tomadas: pasaporte **snapshot** (no vista viva); eje **referencia**,
lote **opcional**; **un registro por versión** (`passport_code` estable +
`passport_version` incremental); **`source_hash`** para detectar cambios de
fuentes; brechas **no bloquean** la generación; estados draft/generated/
in_review/approved_internal/obsolete (aprobación **interna**, nunca externa);
snapshot protegido por trigger + flag (patrón T7.1); evidencias por **ambas
vías** (link vivo `entity_type='technical_passport'` + snapshot); TrazaDocs se
**referencia**, no se copia. Nombres de tablas/vistas/estados/`entity_type`/
`link_type` verificados contra 0070–0083. Implementación en **T9A** (modelo de
datos + snapshot), **T9B** (generación desde fuentes) y **T9C** (UI, impresión,
hardening); **T9D** (QR/enlace público) queda como futuro documentado. Detalle y
prompt listo en `TEXTILES_T9A_READY_PROMPT.md`.

Tras T9.0, **`TEXTILES_PLANNED_SECTIONS` sigue en `["Pasaporte técnico
textil"]`** hasta que T9C lo vuelva funcional (T9.0 no cambia código).

## Estado T9A (Julio 2026): ✅ BASE TÉCNICA IMPLEMENTADA (sin UI)

Migración `0084_textile_technical_passports.sql`: tabla
`textile_technical_passports` (un registro por versión: `passport_code` estable
+ `passport_version`), con snapshot protegido (`snapshot_json`,
`data_sources_json`, `gaps_json`, `warnings_json`, `recommendations_json`,
`source_hash`), sellos de ciclo (generated/reviewed/approved_internal/obsolete),
FKs compuestas a referencia/lote/evaluación, validación de destino
(lote↔referencia, evaluación↔referencia), trigger de protección del snapshot
(patrón T7.1: nace draft vacío, inmutable tras `generated`, identidad
inmutable), RLS deny-by-default (consultant solo draft/in_review; delete
admin/quality en draft), y dos RPCs controladas
(`generate_textile_technical_passport_base` con `schema_version =
textile_technical_passport_v1` + disclaimer; `change_textile_technical_passport_status`).
`textile_evidence_links` ampliada **aditivamente**
(`entity_type += 'technical_passport'`, `link_type += 'passport_support'`;
validador de organización extendido). Helpers base
`lib/domain|db/textiles-passport.ts`. Suite
`tests/passports/textiles-passports.test.ts` 16/16; regresión completa (incl.
evidencias y CPR) en verde. **Sin UI/rutas/impresión/QR** — eso es T9B
(generación desde fuentes) y T9C (UI, impresión, hardening). `TEXTILES_PLANNED_SECTIONS`
sigue en `["Pasaporte técnico textil"]` hasta T9C. Detalle:
`TEXTILES_T9A_PASSPORT_DATA_MODEL_REPORT.md`.

## Estado T9A.1 (Julio 2026): ✅ HARDENING APLICADO

Migración `0085_textile_technical_passport_state_hardening.sql` (quirúrgica):
redefine `protect_textile_technical_passport_snapshot()` para cerrar la
manipulación directa de un pasaporte en `draft` — fuera del flag transaccional
interno, ningún UPDATE puede cambiar `status`, snapshot/derivados/`source_hash`
ni los sellos generated/reviewed/approved/obsolete en ningún estado (antes solo
se vigilaba tras `generated`). La identidad sigue inmutable; lote/evaluación
seleccionables solo en `draft`. Añade `validate_textile_passport_evidence_link_
type()` que restringe los `link_type` válidos para
`entity_type='technical_passport'` (acotado: otros entity_type intactos, CPR sin
cambios). INSERT idéntico a 0084. Suite
`tests/passports/textiles-passports-hardening.test.ts` 12/12; regresión completa
(incl. evidencias y CPR) en verde. Detalle:
`TEXTILES_T9A_1_PASSPORT_STATE_HARDENING_REPORT.md`.

## Estado T9A.2 (Julio 2026): ✅ CIERRE DE FUENTES Y VÍNCULOS

Migración `0086_textile_passport_sources_and_links_fix.sql` (cierre): cierra los
tres pendientes de T9A.1 — (1) `data_sources_json` ahora incluye
`schema_version = 'textile_technical_passport_sources_v1'` (RPC de generación
base redefinida, resto idéntico); (2) familia `link_type` específica del
pasaporte (`passport_composition_support`, `passport_traceability_support`,
`passport_circularity_support`, `passport_claim_support`, `passport_care_support`,
`passport_end_of_life_support`) añadida de forma aditiva y exigida por el
validador para `entity_type='technical_passport'` (24→30 tipos, otros entity_type
intactos); (3) `TEXTILES_T9B_READY_PROMPT.md` creado. Sin ampliar funcionalidad
ni generación completa. Suite
`tests/passports/textiles-passports-sources-links.test.ts` 11/11; regresión
completa (incl. evidencias y CPR) en verde. Siguiente: **T9B** (generación desde
fuentes). Detalle: `TEXTILES_T9A_2_PASSPORT_SOURCES_LINKS_REPORT.md`.

## Estado T9A.3 (Julio 2026): ✅ HOTFIX VÍNCULO DOCUMENTAL

Migración `0087_textile_passport_documentary_link_fix.sql` (hotfix mínimo):
añade `passport_documentary_support` para `entity_type='technical_passport'`
(soporte documental de los procedimientos TrazaDocs, sección 5.12), de forma
aditiva (30→31 link_type) y admitido por el validador de coherencia. Familia
completa: passport_support + composition/traceability/circularity/claim/care/
end_of_life + documentary. Sin tablas/columnas/RPC nuevas; otros entity_type y
CPR intactos. Suite
`tests/passports/textiles-passports-documentary-link.test.ts` 8/8; regresión
completa en verde. Siguiente: **T9B**. Detalle:
`TEXTILES_T9A_3_PASSPORT_DOCUMENTARY_LINK_REPORT.md`.

## Estado T9B (Julio 2026): ✅ GENERACIÓN COMPLETA DEL SNAPSHOT

Migración `0088_textile_technical_passport_full_snapshot.sql`: RPC
`generate_textile_technical_passport_full_snapshot(uuid)` que lee las fuentes
reales (organización, producto/referencia, composición, materiales, componentes,
proveedores, evidencias, orden/lotes/consumos, circularidad, TrazaDocs Textil) y
construye el snapshot COMPLETO de las 14 secciones + gaps/warnings/
recommendations + `data_sources_json` (con updated_at de cada fuente) +
`source_hash` sha256, bajo el flag interno (respeta la protección de 0085) y pasa
a `generated`. Estados por sección neutros; brechas `PAS-*` no bloqueantes;
interpretación de estados de evidencia; disclaimers obligatorios embebidos. No
acepta snapshot/gaps/hash desde cliente (la RPC no tiene parámetros de datos).
Server actions mínimas `generateTextilePassportSnapshotAction` /
`changeTextilePassportStatusAction` (SIN UI ni rutas). Solo lectura de los
módulos existentes; única escritura, la fila del pasaporte. Suite
`tests/passports/textiles-passports-generation.test.ts` 16/16; regresión
completa (incl. CPR) en verde. **Sin UI/rutas/impresión/QR** — eso es T9C. La UI,
listado, detalle e impresión quedan para T9C
(`TEXTILES_T9C_READY_PROMPT.md`). Detalle:
`TEXTILES_T9B_PASSPORT_GENERATION_REPORT.md`.

## Estado T9B.1 (Julio 2026): ✅ CORRECCIÓN FUNCIONAL DEL SNAPSHOT

Migración `0089_textile_technical_passport_snapshot_fixes.sql`: **redefine** la
RPC de generación (misma firma/grant) corrigiendo seis problemas de T9B —(1) la
composición se evalúa POR ALCANCE real con la regla del dominio/0080, no con el
inexistente `component_scope='main'`; (2) circularidad auto-selecciona la última
evaluación `completed` de la referencia (warning si solo hay draft/in_review, gap
si ninguna); (3) trazabilidad incluye pasos de proceso internos/tercerizados
(`textile_order_process_steps` + processes) con `PAS-TRACE-004`; (4)
`data_sources.evidences` y el hash cubren evidencias de todas las entidades
(reference/material/component/output_lot/production_order/order_process_step/
circularity_assessment/technical_passport, solo metadata) y los proveedores se
materializan distintos antes de agregar; (5) `source_hash` = sha256 sobre
snapshot+data_sources+gaps+warnings+recommendations; (6) `recommendations_json`
son objetos estructurados
`{recommendation_code, section_key, message, priority, related_gap_code}`—. Sin
tablas/columnas/políticas nuevas; solo lectura + escritura de la fila del
pasaporte bajo el flag. Sin UI/rutas/impresión/QR — eso es T9C. Sintaxis
validada con `pglast`; suite `tests/passports/textiles-passports-snapshot-fixes.test.ts`
14/14; regresión completa (incl. CPR) en verde; `test:all` = 30. Detalle:
`TEXTILES_T9B_1_PASSPORT_SNAPSHOT_FIXES_REPORT.md`.

## Estado T9B.2 (Julio 2026): ✅ CIERRE DE FUENTES, EVIDENCIAS Y WARNINGS

Migración `0090_textile_technical_passport_snapshot_sources_closure.sql`:
**redefine** la RPC (misma firma/grant) cerrando cinco puntos —(1)
`snapshot_json.sections.evidences.items` incluye evidencias de todas las entidades del
pasaporte (production_order, order_process_step, circularity_assessment,
technical_passport, además de las previas) con metadata completa y sin signed
URLs; (2) `data_sources_json.source_records.evidence_links` explícito (el hash
detecta relink/desvinculación; `textile_evidence_links` no tiene updated_at/status,
se usan las columnas reales); (3) `data_sources_json.source_records.process_steps`
explícito (nombres reales step_type/planned_date/completed_date); (4) warning
`PAS-TRACE-005` cuando la orden del lote no tiene pasos, en warnings + sección +
`warnings_summary`; (5) composición no documentada normalizada a `PAS-COMP-002`
(needs_review renumerado a `PAS-COMP-003`, `PAS-COMP-001` intacto)—. entity_type
verificados contra 0075/0078/0084 (no se inventan). Sin tablas/columnas/políticas
nuevas; solo lectura + escritura de la fila bajo el flag. Sin UI/rutas/impresión —
eso es T9C. Sintaxis validada con `pglast`; suite
`tests/passports/textiles-passports-snapshot-closure.test.ts` 13/13; regresión
completa (incl. CPR) en verde; `test:all` = 31. Detalle:
`TEXTILES_T9B_2_PASSPORT_SNAPSHOT_CLOSURE_REPORT.md`.

## Estado T9B.3 (Julio 2026): ✅ HOTFIX CIRCULARIDAD→EVIDENCIAS + RUTA PROMPT

Migración `0091_textile_passport_circularity_evidence_hotfix.sql`: **redefine** la
RPC (misma firma/grant) corrigiendo el ORDEN de construcción —la evaluación de
circularidad definitiva (manual o auto-seleccionada: última `completed` de la
organización y referencia) se resuelve ANTES de armar la sección de evidencias,
de modo que las evidencias vinculadas al `circularity_assessment` entran en
`snapshot_json.sections.evidences.items` (y en `data_sources.evidences` y
`source_records.evidence_links`) en ambos casos—. Se corrige además el flag
`circularity_assessment_auto_selected` (basado en si el id venía fijado). Sin
cambios de estructura, secciones, schema_version ni estados; el hash solo cambia
por incluir bien esas evidencias. Segundo ajuste: se corrigió la ruta
`snapshot_json.evidences.items` → `snapshot_json.sections.evidences.items` en el
prompt T9C y en los reportes (sin cambiar la estructura real). Sintaxis validada
con `pglast`; suite
`tests/passports/textiles-passports-circularity-evidence-hotfix.test.ts` 14/14;
regresión completa (incl. CPR) en verde; `test:all` = 32. Detalle:
`TEXTILES_T9B_3_PASSPORT_CIRCULARITY_EVIDENCE_HOTFIX_REPORT.md`.

## Estado T9C (Julio 2026): ✅ UI, DETALLE, GENERACIÓN E IMPRESIÓN DEL PASAPORTE

Interfaz completa inicial del pasaporte técnico textil sobre el snapshot ya
consolidado. Rutas creadas: `/textiles/passports` (listado), `/textiles/passports/new`
(crear borrador + generar), `/textiles/passports/[id]` (detalle por secciones,
brechas/advertencias/recomendaciones, acciones de estado) y
`/textiles/passports/[id]/print` (impresión por navegador, sin PDF server-side),
todas bajo el guard Textil + `force-dynamic`. Componentes en
`components/textiles/passports/*` (secciones, acciones, formulario, badges).
Server actions: `createTextilePassportDraftAction` (INSERT mínimo + genera
passport_code desde el SKU + valida lote↔referencia + "crear y generar"),
generación y transición por RPC controlada. La UI lee el snapshot histórico
(`snapshot_json.sections.*`); las evidencias desde
`snapshot_json.sections.evidences.items` (sin signed URLs); "Aprobado
internamente" y disclaimers obligatorios visibles; consultant no aprueba
internamente. Card de acceso en `/textiles`; `TEXTILES_PLANNED_SECTIONS` pasa a
vacío (el pasaporte ya es funcional). Sin QR/portal/PDF server-side/IA/ACV/huella/
planes por módulo; CPR intacto. Typecheck/lint/build ✅; suite
`tests/passports/textiles-passports-ui.test.ts` 51/51; regresión completa (incl.
CPR) en verde; `test:all` = 33. QR/enlace privado y nueva versión → T9D
(`TEXTILES_T9D_READY_PROMPT.md`). Detalle:
`TEXTILES_T9C_PASSPORT_UI_REPORT.md`.

## Estado T9C.1 (Julio 2026): ✅ HARDENING UX DE CIRCULARIDAD Y MENSAJES

Hardening quirúrgico del formulario de creación del pasaporte: la evaluación de
circularidad se filtra por la referencia/SKU elegida (simétrico al filtro de
lotes ya existente) tanto en la UI (`compatibleAssessments`, selector
deshabilitado/vacío, limpieza al cambiar referencia) como en la server action
(nuevo helper `getReferenceForAssessment` + validación
`assessmentRef.referenceId !== referenceId`). Además, el aviso de generación
fallida deja de perderse: el formulario distingue fallo de creación de fallo de
generación y, en el segundo caso, redirige al detalle con
`?notice=generation_failed`, que el detalle muestra. Sin nuevas migraciones (última
0091), sin tocar el builder del snapshot, sin QR/portal/PDF server-side/IA/ACV/
huella/planes; CPR intacto. Typecheck/lint/build ✅; suite
`tests/passports/textiles-passports-ui-hardening.test.ts` 11/11; T9C sigue 51/51;
regresión completa (incl. CPR) en verde; `test:all` = 34. Detalle:
`TEXTILES_T9C_1_PASSPORT_UI_HARDENING_REPORT.md`.

## Estado T9D (Julio 2026): ✅ ENLACE PRIVADO CONTROLADO Y QR

Migración `0092_textile_passport_private_share_links.sql`: tabla
`textile_technical_passport_share_links` + RPC pública controlada
`resolve_textile_passport_share` (SECURITY DEFINER). El token en claro nunca se
persiste (solo su hash sha256 + prefijo); se genera server-side y se devuelve una
sola vez. token_hash/passport_id inmutables; revocar irreversible; FK compuesta
(organization_id, passport_id). RLS deny-by-default; anon SIN SELECT sobre la
tabla (solo la RPC, con grant a anon). La RPC valida estado/expiración/límite de
accesos, registra el acceso y devuelve un snapshot REDUCIDO (sin token_hash, sin
data_sources_json, sin signed URLs) con mensaje genérico ante fallo. UI: gestor de
enlaces en el detalle (crear/revocar/copiar + QR client-side, solo admin/quality)
y ruta pública tokenizada `app/textile-passport-share/[token]` fuera del shell,
noindex, que resuelve solo vía RPC. QR con la librería `qrcode` (dependencia
justificada). No es portal público indexable, DPP oficial ni certificación. Sin
PDF server-side/IA/ACV/huella/planes por módulo; CPR intacto. Sintaxis validada
con `pglast`; suite `tests/passports/textiles-passports-share.test.ts` 24/24;
regresión completa (incl. CPR) en verde; `test:all` = 35. Detalle:
`TEXTILES_T9D_PASSPORT_SHARE_REPORT.md`.