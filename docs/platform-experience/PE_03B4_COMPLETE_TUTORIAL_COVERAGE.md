# PE-03B4 · Cobertura completa de tutoriales

El registro pasó de **11 pantallas a 152 claves sobre 150 rutas**. Este
documento es la matriz completa: qué pantalla es cada clave, dónde vive hoy, y
qué se excluyó a propósito.

---

## 1 · El resumen

| | |
|---|---|
| Páginas en el repositorio | **187** |
| Registradas como objetivo de tutorial | **150 rutas · 152 claves** |
| Excluidas a propósito, con motivo | **37** |
| Sin clasificar | **0** — y una prueba lo vigila |

Las dos claves de más son las **pestañas que comparten dirección**: ver §3.

| Módulo | Claves |
|---|---|
| Trazaloop Quality | **67** |
| Trazaloop PCR | **44** |
| Trazaloop Textiles | **33** |
| Transversal | **8** |

Ninguna de las 152 tiene vídeo publicado todavía, y eso **no es un fallo**: el
objetivo de este tramo era que cada pantalla pueda tenerlo, no grabarlos. Hasta
que lo tenga, quien pulse el botón lee la copia congelada de PE-03A —
«Este tutorial está en actualización y estará disponible pronto».

---

## 2 · Cómo se decidió qué entra

Un objetivo de tutorial es **una pantalla funcional distinta donde tendría
sentido un vídeo distinto**. De ahí salen tres reglas.

**Una clave por TIPO de pantalla, no por registro.** `quality.processes.detail`
es la ficha de proceso; no hay una clave por proceso. Un tutorial por registro
sería una biblioteca imposible de mantener y una identidad que nace y muere con
un dato.

**Las fichas son objetivo propio.** El listado de proveedores y la ficha de un
proveedor son dos pantallas distintas y necesitarían dos vídeos distintos. Por
eso la ficha nunca hereda el tutorial del listado — ver §4.

**La ruta no es la identidad.** La columna «ruta» de esta matriz es informativa.
Si una pantalla se muda, se corrige ahí y el tutorial no se entera. El caso más
claro está en el registro: la clave es `quality.intelligence` y la ruta sigue
siendo `/quality/copilot`.

---

## 3 · Las dos pantallas con pestañas en la misma dirección

El repaso encontró exactamente dos sitios donde dos superficies funcionales
distintas comparten `pathname` y se distinguen por un parámetro:

| Pantalla | Parámetro | Claves |
|---|---|---|
| Riesgos y oportunidades | `/quality/risks?vista=` | `quality.risks` · `quality.risks.opportunities` |
| Inventario de PCR | `/traceability/inventory?vista=` | `cpr.traceability.inventory` · `cpr.traceability.inventory.products` |

En las dos, un solo tutorial habría servido a la mitad de quien lo abre: un
riesgo y una oportunidad no se registran igual, y el saldo de materia prima y el
de producto terminado no se leen igual.

**No se inventó una ruta falsa** para que el tutorial pudiera distinguirlas. Eso
habría sido mover el producto para acomodar la ayuda. Lo que se hizo fue enseñar
al resolutor a mirar el parámetro: `PageKeyEntry` admite un `subview`, y la
entrada sin `subview` de esa misma ruta es la vista por defecto.

Sigue habiendo **una sola familia de claves**. No nació un segundo registro.

### Y el resto de parámetros no son pestañas

Se auditaron todos los enlaces internos con parámetro. Los demás —`?edit=`,
`?batch=`, `?version=`, `?q=`, `?item=`, `?revision=`— seleccionan un registro o
filtran una lista: no cambian de superficie funcional y no merecen tutorial
propio.

Y las «pestañas» de Quality —Auditorías, Proveedores, Voz del cliente,
Automatización, Revisión por la dirección, Partes interesadas— resultaron ser
**rutas de verdad**, cada una con su dirección. Ahí `usePathname()` basta, y
cada una tiene su clave.

---

## 4 · La más específica gana

`resolvePageKeyForPath()` compara segmento a segmento y gana la ruta más
específica que encaja. Las reglas, en orden:

1. El número de segmentos tiene que coincidir.
2. Un segmento `[algo]` casa con cualquier cosa; el resto es literal.
3. A igualdad de longitud gana la que tiene **menos comodines**.
4. Una entrada con pestaña gana a la vista por defecto de su ruta **solo si el
   parámetro trae su valor**.
5. Si nada encaja, `null`. Una pantalla sin clave no admite tutorial, y eso es
   una respuesta, no un fallo.

**Una pantalla registrada sin vídeo enseña la copia congelada.** Nunca el vídeo
de otra pantalla: un tutorial equivocado se ve entero antes de que alguien se dé
cuenta de que no era ese.

---

## 5 · La prueba que impide que esto se quede viejo

`tests/unit/pe03b4-complete-page-coverage.test.ts` **no compara una lista con
otra lista**. Recorre `app/` de verdad, resuelve la dirección de cada
`page.tsx` —quitando los grupos de rutas de Next, que no aparecen en la URL— y
exige que cada una esté en el registro o en las exclusiones.

Comprobado empíricamente: al crear una pantalla nueva de Quality, la suite pasa
de 25 en verde a 2 en rojo, y los dos fallos la nombran.

Vigila además lo que una lista a mano nunca vigilaría:

- que ninguna clasificación apunte a una pantalla **que ya no existe**;
- que nada esté a la vez registrado y excluido;
- que **toda exclusión diga por qué**;
- que ninguna clave lleve un identificador dentro;
- que las **once claves de PE-02B4 no hayan cambiado de nombre ni de ruta**.

Esa última es la que protege lo que ya existe: cambiar una clave rompería su
tutorial, su ayuda contextual y su historia de publicación.

---

## 6 · Cómo se añade una pantalla

1. Añadir su entrada en `PAGE_KEYS` (`lib/modules/page-keys.ts`) — o su
   exclusión con motivo en `PAGE_KEY_EXCLUSIONS`.
2. Crear el tutorial en `/platform/tutorials`, que solo ofrece claves del
   registro.
3. Subir una versión y publicarla.

No hace falta tocar la pantalla: el botón vive en la barra del shell y resuelve
la clave por su cuenta.

---

## 7 · La matriz

Ninguna fila lleva un identificador de registro: son tipos de pantalla. El
estado del vídeo es el del cierre de PE-03B4 y se consulta en vivo en
`/platform/tutorials`.


### Trazaloop Quality
| Clave | Pantalla | Ruta de hoy | Estado | Vídeo |
|---|---|---|---|---|
| `quality.audits` | Auditorías · Resumen | `/quality/audits` | registrada | sin vídeo |
| `quality.audits.checklists` | Auditorías · Checklists | `/quality/audits/checklists` | registrada | sin vídeo |
| `quality.audits.detail` | Auditorías · Ficha de auditoría | `/quality/audits/[auditId]` | registrada | sin vídeo |
| `quality.audits.findings` | Auditorías · Hallazgos | `/quality/audits/findings` | registrada | sin vídeo |
| `quality.audits.list` | Auditorías · Listado | `/quality/audits/list` | registrada | sin vídeo |
| `quality.audits.programs` | Auditorías · Programa | `/quality/audits/programs` | registrada | sin vídeo |
| `quality.audits.programs.detail` | Auditorías · Ficha de programa | `/quality/audits/programs/[programId]` | registrada | sin vídeo |
| `quality.automation` | Automatización · Resumen | `/quality/automation` | registrada | sin vídeo |
| `quality.automation.rules` | Automatización · Reglas | `/quality/automation/rules` | registrada | sin vídeo |
| `quality.automation.rules.detail` | Automatización · Ficha de regla | `/quality/automation/rules/[ruleId]` | registrada | sin vídeo |
| `quality.automation.runs` | Automatización · Ejecuciones | `/quality/automation/runs` | registrada | sin vídeo |
| `quality.automation.signals` | Automatización · Señales | `/quality/automation/signals` | registrada | sin vídeo |
| `quality.automation.signals.detail` | Automatización · Ficha de señal | `/quality/automation/signals/[signalId]` | registrada | sin vídeo |
| `quality.cases` | Casos y acciones · Listado | `/quality/cases` | registrada | sin vídeo |
| `quality.cases.detail` | Casos y acciones · Ficha de caso | `/quality/cases/[caseId]` | registrada | sin vídeo |
| `quality.context.interested_parties` | Contexto · Partes interesadas | `/quality/context/interested-parties` | registrada | sin vídeo |
| `quality.context.interested_parties.categories` | Contexto · Categorías de partes interesadas | `/quality/context/interested-parties/categories` | registrada | sin vídeo |
| `quality.context.interested_parties.detail` | Contexto · Ficha de parte interesada | `/quality/context/interested-parties/[assessmentId]` | registrada | sin vídeo |
| `quality.intelligence` | Trazaloop Intelligence | `/quality/copilot` | registrada | sin vídeo |
| `quality.customer_voice` | Voz del cliente · Resumen | `/quality/customer-voice` | registrada | sin vídeo |
| `quality.customer_voice.campaigns` | Voz del cliente · Campañas | `/quality/customer-voice/campaigns` | registrada | sin vídeo |
| `quality.customer_voice.campaigns.detail` | Voz del cliente · Ficha de campaña | `/quality/customer-voice/campaigns/[campaignId]` | registrada | sin vídeo |
| `quality.customer_voice.customers` | Voz del cliente · Clientes | `/quality/customer-voice/customers` | registrada | sin vídeo |
| `quality.customer_voice.customers.detail` | Voz del cliente · Ficha de cliente | `/quality/customer-voice/customers/[profileId]` | registrada | sin vídeo |
| `quality.customer_voice.feedback` | Voz del cliente · Retroalimentación | `/quality/customer-voice/feedback` | registrada | sin vídeo |
| `quality.customer_voice.surveys` | Voz del cliente · Encuestas | `/quality/customer-voice/surveys` | registrada | sin vídeo |
| `quality.documents` | Documentación · Documentos | `/quality/documents` | registrada | sin vídeo |
| `quality.documents.detail` | Documentación · Ficha de documento | `/quality/documents/[documentId]` | registrada | sin vídeo |
| `quality.documents.master` | Documentación · Lista Maestra | `/quality/documents/master` | registrada | sin vídeo |
| `quality.home` | Inicio Quality | `/quality` | registrada | sin vídeo |
| `quality.indicators` | Evaluación · Indicadores | `/quality/indicators` | registrada | sin vídeo |
| `quality.indicators.detail` | Evaluación · Ficha de indicador | `/quality/indicators/[indicatorId]` | registrada | sin vídeo |
| `quality.management_review` | Revisión por la dirección · Revisiones | `/quality/management-review` | registrada | sin vídeo |
| `quality.management_review.detail` | Revisión por la dirección · Ficha de revisión | `/quality/management-review/[reviewId]` | registrada | sin vídeo |
| `quality.management_review.followup` | Revisión por la dirección · Seguimiento | `/quality/management-review/followup` | registrada | sin vídeo |
| `quality.map` | Sistema de gestión · Mapa de procesos | `/quality/map` | registrada | sin vídeo |
| `quality.objectives` | Evaluación · Objetivos | `/quality/objectives` | registrada | sin vídeo |
| `quality.objectives.detail` | Evaluación · Ficha de objetivo | `/quality/objectives/[objectiveId]` | registrada | sin vídeo |
| `quality.people` | Personas · Listado | `/quality/people` | registrada | sin vídeo |
| `quality.people.competencies` | Personas · Competencias | `/quality/people/competencies` | registrada | sin vídeo |
| `quality.people.competencies.matrix` | Personas · Matriz de competencias | `/quality/people/competencies/matrix` | registrada | sin vídeo |
| `quality.people.detail` | Personas · Ficha de persona | `/quality/people/[personId]` | registrada | sin vídeo |
| `quality.people.development` | Personas · Desarrollo | `/quality/people/development` | registrada | sin vídeo |
| `quality.people.knowledge` | Personas · Conocimiento | `/quality/people/knowledge` | registrada | sin vídeo |
| `quality.people.lessons` | Personas · Lecciones aprendidas | `/quality/people/lessons` | registrada | sin vídeo |
| `quality.people.onboarding` | Personas · Incorporación de una persona | `/quality/people/[personId]/onboarding/[assignmentId]` | registrada | sin vídeo |
| `quality.people.performance` | Personas · Desempeño | `/quality/people/performance` | registrada | sin vídeo |
| `quality.people.performance.detail` | Personas · Ficha de evaluación de desempeño | `/quality/people/performance/[evaluationId]` | registrada | sin vídeo |
| `quality.people.positions.detail` | Personas · Ficha de cargo | `/quality/people/positions/[positionId]` | registrada | sin vídeo |
| `quality.people.structure` | Personas · Estructura de la empresa | `/quality/people/structure` | registrada | sin vídeo |
| `quality.positions` | Sistema de gestión · Cargos | `/quality/positions` | registrada | sin vídeo |
| `quality.processes` | Sistema de gestión · Procesos | `/quality/processes` | registrada | sin vídeo |
| `quality.processes.detail` | Sistema de gestión · Ficha de proceso | `/quality/processes/[processId]` | registrada | sin vídeo |
| `quality.risks` | Riesgos y oportunidades · Riesgos | `/quality/risks` | registrada | sin vídeo |
| `quality.risks.opportunities` | Riesgos y oportunidades · Oportunidades | `/quality/risks` `?vista=oportunidades` | registrada | sin vídeo |
| `quality.risks.detail` | Riesgos y oportunidades · Ficha de riesgo | `/quality/risks/[riskId]` | registrada | sin vídeo |
| `quality.risks.methodology` | Riesgos y oportunidades · Metodología | `/quality/risks/methodology` | registrada | sin vídeo |
| `quality.risks.opportunities.detail` | Riesgos y oportunidades · Ficha de oportunidad | `/quality/risks/opportunities/[opportunityId]` | registrada | sin vídeo |
| `quality.suppliers` | Proveedores · Listado | `/quality/suppliers` | registrada | sin vídeo |
| `quality.suppliers.categories` | Proveedores · Categorías | `/quality/suppliers/categories` | registrada | sin vídeo |
| `quality.suppliers.detail` | Proveedores · Ficha de proveedor | `/quality/suppliers/[profileId]` | registrada | sin vídeo |
| `quality.suppliers.evaluations` | Proveedores · Evaluaciones | `/quality/suppliers/evaluations` | registrada | sin vídeo |
| `quality.suppliers.evaluations.detail` | Proveedores · Ficha de evaluación | `/quality/suppliers/evaluations/[evaluationId]` | registrada | sin vídeo |
| `quality.suppliers.reevaluations` | Proveedores · Reevaluaciones | `/quality/suppliers/reevaluations` | registrada | sin vídeo |
| `quality.suppliers.sites.detail` | Proveedores · Ficha de sede | `/quality/suppliers/[profileId]/sites/[siteId]` | registrada | sin vídeo |
| `quality.suppliers.templates` | Proveedores · Plantillas de evaluación | `/quality/suppliers/templates` | registrada | sin vídeo |
| `quality.tasks` | Mis tareas | `/quality/tasks` | registrada | sin vídeo |

### Trazaloop PCR
| Clave | Pantalla | Ruta de hoy | Estado | Vídeo |
|---|---|---|---|---|
| `cpr.audit_prep.dossiers` | Preparación de auditoría · Expedientes | `/audit-prep/dossiers` | registrada | sin vídeo |
| `cpr.audit_prep.dossiers.detail` | Preparación de auditoría · Ficha de expediente | `/audit-prep/dossiers/[id]` | registrada | sin vídeo |
| `cpr.audit_prep.exercises` | Preparación de auditoría · Ejercicios de trazabilidad | `/audit-prep/exercises` | registrada | sin vídeo |
| `cpr.audit_prep.exercises.detail` | Preparación de auditoría · Ficha de ejercicio | `/audit-prep/exercises/[id]` | registrada | sin vídeo |
| `cpr.audit_support` | Soporte técnico · Resumen | `/audit-support` | registrada | sin vídeo |
| `cpr.audit_support.calculations.detail` | Soporte técnico · Ficha de cálculo | `/audit-support/calculations/[id]` | registrada | sin vídeo |
| `cpr.audit_support.evidence_matrix` | Soporte técnico · Matriz de evidencias | `/audit-support/output-batches/[id]/evidence-matrix` | registrada | sin vídeo |
| `cpr.catalog` | Catálogos · Resumen | `/catalog` | registrada | sin vídeo |
| `cpr.catalog.customer_requirements` | Catálogos · Requisitos de cliente | `/catalog/customer-requirements` | registrada | sin vídeo |
| `cpr.catalog.families` | Catálogos · Familias | `/catalog/families` | registrada | sin vídeo |
| `cpr.catalog.import` | Catálogos · Importar | `/catalog/import` | registrada | sin vídeo |
| `cpr.catalog.materials` | Catálogos · Materiales | `/catalog/materials` | registrada | sin vídeo |
| `cpr.catalog.products` | Catálogos · Productos | `/catalog/products` | registrada | sin vídeo |
| `cpr.catalog.suppliers` | Catálogos · Proveedores | `/catalog/suppliers` | registrada | sin vídeo |
| `cpr.dashboard` | Dashboard | `/dashboard` | registrada | sin vídeo |
| `cpr.diagnostic` | Trazabilidad · Diagnóstico | `/diagnostic` | registrada | sin vídeo |
| `cpr.evidences` | Evidencias | `/evidences` | registrada | sin vídeo |
| `cpr.guided_flow` | Flujo guiado | `/guided-flow` | registrada | sin vídeo |
| `cpr.guided_flow.output_batches.detail` | Flujo guiado · Ficha de lote producido | `/guided-flow/output-batches/[id]` | registrada | sin vídeo |
| `cpr.implementation` | Implementación | `/implementation` | registrada | sin vídeo |
| `cpr.implementation.feedback` | Implementación · Retroalimentación | `/implementation/feedback` | registrada | sin vídeo |
| `cpr.imports` | Importaciones | `/imports` | registrada | sin vídeo |
| `cpr.imports.detail` | Importaciones · Ficha de importación | `/imports/[id]` | registrada | sin vídeo |
| `cpr.onboarding` | Onboarding | `/onboarding` | registrada | sin vídeo |
| `cpr.recycled_content` | Contenido reciclado · Resumen | `/recycled-content` | registrada | sin vídeo |
| `cpr.recycled_content.output_batches` | Contenido reciclado · Lotes producidos | `/recycled-content/output-batches` | registrada | sin vídeo |
| `cpr.recycled_content.output_batches.detail` | Contenido reciclado · Ficha de lote | `/recycled-content/output-batches/[id]` | registrada | sin vídeo |
| `cpr.recycled_content.reports` | Contenido reciclado · Informes | `/recycled-content/reports` | registrada | sin vídeo |
| `cpr.traceability` | Trazabilidad · Resumen | `/traceability` | registrada | sin vídeo |
| `cpr.traceability.genealogy` | Trazabilidad · Genealogía | `/traceability/genealogy` | registrada | sin vídeo |
| `cpr.traceability.input_batches` | Trazabilidad · Lotes de entrada | `/traceability/input-batches` | registrada | sin vídeo |
| `cpr.traceability.inventory` | Inventario · Materias primas | `/traceability/inventory` | registrada | sin vídeo |
| `cpr.traceability.inventory.products` | Inventario · Producto terminado | `/traceability/inventory` `?vista=productos` | registrada | sin vídeo |
| `cpr.traceability.output_batches` | Trazabilidad · Lotes producidos | `/traceability/output-batches` | registrada | sin vídeo |
| `cpr.traceability.production_orders` | Trazabilidad · Órdenes / corridas de producción | `/traceability/production-orders` | registrada | sin vídeo |
| `cpr.traceability.production_orders.detail` | Trazabilidad · Ficha de orden / corrida de producción | `/traceability/production-orders/[id]` | registrada | sin vídeo |
| `cpr.trazadocs` | TrazaDocs · Documentos | `/trazadocs` | registrada | sin vídeo |
| `cpr.trazadocs.detail` | TrazaDocs · Ficha de documento | `/trazadocs/[id]` | registrada | sin vídeo |
| `cpr.trazadocs.edit` | TrazaDocs · Editar documento | `/trazadocs/[id]/edit` | registrada | sin vídeo |
| `cpr.trazadocs.files.detail` | TrazaDocs · Ficha de archivo | `/trazadocs/files/[id]` | registrada | sin vídeo |
| `cpr.trazadocs.files.new` | TrazaDocs · Nuevo archivo | `/trazadocs/files/new` | registrada | sin vídeo |
| `cpr.trazadocs.master` | TrazaDocs · Maestro de documentos | `/trazadocs/master` | registrada | sin vídeo |
| `cpr.trazadocs.new` | TrazaDocs · Nuevo documento | `/trazadocs/new` | registrada | sin vídeo |
| `cpr.trazadocs.versions` | TrazaDocs · Versiones de un documento | `/trazadocs/[id]/versions` | registrada | sin vídeo |

### Trazaloop Textiles
| Clave | Pantalla | Ruta de hoy | Estado | Vídeo |
|---|---|---|---|---|
| `textiles.catalogs` | Catálogos textiles · Resumen | `/textiles/catalogs` | registrada | sin vídeo |
| `textiles.catalogs.components` | Catálogos textiles · Componentes | `/textiles/catalogs/components` | registrada | sin vídeo |
| `textiles.catalogs.fibers` | Catálogos textiles · Fibras | `/textiles/catalogs/fibers` | registrada | sin vídeo |
| `textiles.catalogs.materials` | Catálogos textiles · Materiales | `/textiles/catalogs/materials` | registrada | sin vídeo |
| `textiles.catalogs.outsourced_processes` | Catálogos textiles · Procesos tercerizados | `/textiles/catalogs/outsourced-processes` | registrada | sin vídeo |
| `textiles.catalogs.processes` | Catálogos textiles · Procesos | `/textiles/catalogs/processes` | registrada | sin vídeo |
| `textiles.catalogs.suppliers` | Catálogos textiles · Proveedores | `/textiles/catalogs/suppliers` | registrada | sin vídeo |
| `textiles.circularity` | Circularidad · Resumen | `/textiles/circularity` | registrada | sin vídeo |
| `textiles.circularity.assessments` | Circularidad · Evaluaciones | `/textiles/circularity/assessments` | registrada | sin vídeo |
| `textiles.circularity.assessments.detail` | Circularidad · Ficha de evaluación | `/textiles/circularity/assessments/[id]` | registrada | sin vídeo |
| `textiles.circularity.assessments.new` | Circularidad · Nueva evaluación | `/textiles/circularity/assessments/new` | registrada | sin vídeo |
| `textiles.diagnostic` | Gestión textil · Diagnóstico | `/textiles/diagnostic` | registrada | sin vídeo |
| `textiles.diagnostic.results` | Gestión textil · Resultados del diagnóstico | `/textiles/diagnostic/results` | registrada | sin vídeo |
| `textiles.evidences` | Evidencias textiles · Listado | `/textiles/evidences` | registrada | sin vídeo |
| `textiles.evidences.detail` | Evidencias textiles · Ficha de evidencia | `/textiles/evidences/[id]` | registrada | sin vídeo |
| `textiles.evidences.new` | Evidencias textiles · Nueva evidencia | `/textiles/evidences/new` | registrada | sin vídeo |
| `textiles.home` | Inicio Textiles | `/textiles` | registrada | sin vídeo |
| `textiles.passports` | Pasaportes técnicos · Listado | `/textiles/passports` | registrada | sin vídeo |
| `textiles.passports.detail` | Pasaportes técnicos · Ficha de pasaporte | `/textiles/passports/[id]` | registrada | sin vídeo |
| `textiles.passports.new` | Pasaportes técnicos · Nuevo pasaporte | `/textiles/passports/new` | registrada | sin vídeo |
| `textiles.products` | Productos y referencias · Listado | `/textiles/products` | registrada | sin vídeo |
| `textiles.products.collections` | Productos y referencias · Colecciones | `/textiles/products/collections` | registrada | sin vídeo |
| `textiles.products.detail` | Productos y referencias · Ficha de producto | `/textiles/products/[id]` | registrada | sin vídeo |
| `textiles.references.detail` | Productos y referencias · Ficha de referencia | `/textiles/references/[id]` | registrada | sin vídeo |
| `textiles.traceability` | Trazabilidad textil · Resumen | `/textiles/traceability` | registrada | sin vídeo |
| `textiles.traceability.input_lots` | Trazabilidad textil · Lotes de entrada | `/textiles/traceability/input-lots` | registrada | sin vídeo |
| `textiles.traceability.inventory` | Saldo de materia prima | `/textiles/traceability/inventory` | registrada | sin vídeo |
| `textiles.traceability.orders` | Trazabilidad textil · Órdenes | `/textiles/traceability/orders` | registrada | sin vídeo |
| `textiles.traceability.orders.detail` | Trazabilidad textil · Ficha de orden | `/textiles/traceability/orders/[id]` | registrada | sin vídeo |
| `textiles.traceability.output_lots` | Trazabilidad textil · Lotes producidos | `/textiles/traceability/output-lots` | registrada | sin vídeo |
| `textiles.traceability.output_lots.detail` | Trazabilidad textil · Ficha de lote producido | `/textiles/traceability/output-lots/[id]` | registrada | sin vídeo |
| `textiles.trazadocs` | TrazaDocs Textil · Documentos | `/textiles/trazadocs` | registrada | sin vídeo |
| `textiles.trazadocs.detail` | TrazaDocs Textil · Ficha de documento | `/textiles/trazadocs/[documentId]` | registrada | sin vídeo |

### Transversal
| Clave | Pantalla | Ruta de hoy | Estado | Vídeo |
|---|---|---|---|---|
| `platform.modules` | Plataforma · Puerta de módulos | `/modules` | registrada | sin vídeo |
| `platform.select_org` | Plataforma · Seleccionar empresa | `/select-org` | registrada | sin vídeo |
| `platform.settings.company` | Sistema · Datos de empresa | `/settings/company` | registrada | sin vídeo |
| `platform.settings.profile` | Sistema · Mi perfil | `/settings/profile` | registrada | sin vídeo |
| `platform.support` | Sistema · Centro de soporte | `/support` | registrada | sin vídeo |
| `platform.support.detail` | Sistema · Ficha de ticket de soporte | `/support/[id]` | registrada | sin vídeo |
| `platform.support.new` | Sistema · Nuevo ticket de soporte | `/support/new` | registrada | sin vídeo |
| `platform.team` | Sistema · Equipo | `/team` | registrada | sin vídeo |

### Excluidas a propósito

| Pantallas | Por qué no llevan tutorial |
|---|---|
| `/login` · `/register` | Autenticación · la persona todavía no ha entrado |
| `/forgot-password` · `/reset-password` | Recuperación de acceso · sin sesión |
| `/accept-invite` | Enlace de invitación · trámite de una sola vez |
| `/legal` | Legal · texto que se lee, no pantalla que se opera |
| `/legal/accept` | Legal · puerta obligatoria, nada puede taparla |
| `/legal/paquete` · `/privacy` · `/terms` | Legal · texto que se lee |
| `/` | Portada pública · fuera del producto |
| `/faq` · `/faq/[slug]` | Ayuda pública · tiene su propio sistema, PE-02 |
| `/survey/[token]` | Público por testigo · lo abre un cliente, no un usuario |
| `/textile-passport-share/[token]` | Público por testigo · lo abre un tercero, no un usuario |
| `/platform` · `/platform/faq` · `/platform/faq/[id]` · `/platform/faq/categorias` · `/platform/help` · `/platform/help/[id]` · `/platform/intelligence` · `/platform/legal` · `/platform/legal/[id]` · `/platform/organizations/new` · `/platform/organizations/[id]` · `/platform/support` · `/platform/support/[id]` · `/platform/trazadocs` · `/platform/trazadocs/[id]` · `/platform/tutorials` · `/platform/tutorials/[id]` | Consola de plataforma · herramienta interna |
| `/trazadocs/[id]/print` · `/trazadocs/master/print` · `/audit-support/calculations/[id]/print` · `/textiles/passports/[id]/print` · `/textiles/trazadocs/[documentId]/print` | Superficie de impresión · no se navega |
