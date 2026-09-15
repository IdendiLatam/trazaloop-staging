/**
 * Trazaloop · PE-02B4 · EL VOCABULARIO DE PANTALLAS.
 *
 * POR QUÉ EXISTE
 *
 * PE-02A encontró tres vocabularios estables en el repositorio —el de módulos,
 * el de secciones de TrazaDocs y el de entidades de Intelligence— y ninguno de
 * PANTALLAS. La ayuda contextual necesita uno: hay que poder decir «la ayuda de
 * este campo, en esta pantalla» sin depender de nada que cambie.
 *
 *
 * POR QUÉ NO LA URL
 *
 * Porque la URL cambia y la pantalla sigue siendo la misma. PE-01B movió una
 * superficie entera sin cambiar ninguna promesa; una ayuda atada a la ruta
 * habría desaparecido ese día sin que nadie tocara su contenido. Y al revés:
 * dos rutas pueden llevar a la misma pantalla.
 *
 *
 * UNA SOLA FAMILIA, TAMBIÉN PARA PE-03
 *
 * PE-02A (PEH-08) y §5 del encargo de este tramo piden lo mismo con distintas
 * palabras: que los tutoriales de PE-03 usen ESTAS claves y no inventen
 * `tutorial_page_key`. Por eso el registro vive aquí, en `lib/modules/`, junto
 * al catálogo de módulos y al registro del shell —y no dentro de la ayuda—: no
 * es «las claves de la ayuda», es «cómo se llaman las pantallas de Trazaloop».
 *
 *
 * LA FORMA
 *
 *   modulo.zona.pantalla        quality.context.interested_parties
 *   modulo.pantalla             quality.processes
 *   platform.pantalla           platform.modules
 *
 * Minúsculas, puntos, sin acentos. El primer segmento es SIEMPRE una clave del
 * catálogo comercial o `platform`, para que no nazca un cuarto vocabulario de
 * módulos por la puerta de atrás.
 */

import { COMMERCIAL_MODULES } from "@/lib/modules/catalog";
import { PLATFORM_SURFACE_KEY } from "@/lib/modules/registry";

/** Una pantalla del producto, con nombre para las personas que la administran. */
export type PageKeyEntry = {
  /** La identidad. No cambia nunca, aunque cambien la ruta y el título. */
  key: string;
  /** Cómo se llama en la consola. Puede cambiar. */
  label: string;
  /** A qué módulo pertenece. `platform` para lo transversal. */
  module: string;
  /**
   * Dónde vive HOY. Es informativo —para que quien administra sepa de qué
   * pantalla habla— y no forma parte de la identidad: si mañana cambia la ruta,
   * se corrige aquí y ninguna ayuda se mueve.
   */
  route: string;
  /**
   * PE-03B4 · UNA PESTAÑA QUE COMPARTE DIRECCIÓN CON OTRA.
   *
   * El repaso de cobertura encontró dos pantallas —y solo dos— donde dos
   * superficies funcionales distintas viven en la MISMA ruta y se distinguen
   * por un parámetro: riesgos y oportunidades en `/quality/risks?vista=`, y
   * materias primas y producto terminado en `/traceability/inventory?vista=`.
   *
   * En las dos, un solo tutorial serviría a la mitad de quien lo abre. Y la
   * alternativa —inventar una ruta falsa para que el tutorial pudiera
   * distinguirlas— habría movido el producto para acomodar la ayuda.
   *
   * Así que la clave admite un parámetro. La entrada SIN `subview` de esa misma
   * ruta es la vista por defecto: la que se ve al entrar sin parámetro.
   */
  subview?: { param: string; value: string };
};

/**
 * El registro. Empieza por lo que la ayuda administrable necesita hoy y crece
 * cuando alguien la necesite: una clave sin contenido no sirve a nadie, y un
 * registro lleno de pantallas sin ayuda haría más difícil encontrar las que sí.
 */
/**
 * El registro.
 *
 * PE-02B4 lo abrió con once entradas —lo que la ayuda administrable necesitaba
 * entonces— y dejó escrito que crecería cuando alguien lo necesitara.
 *
 * PE-03B4 lo cierra sobre el producto entero. El propietario del producto pidió
 * que CADA pantalla funcional de Quality, PCR y Textiles pueda tener su vídeo,
 * y once no era una primera ola: era el 7 % de las pantallas.
 *
 * Ahora hay una entrada por cada pantalla navegable del producto, más las dos
 * pestañas que comparten dirección con otra. Lo que no está aquí está en
 * `PAGE_KEY_EXCLUSIONS`, con su motivo escrito, y una prueba comprueba que
 * ninguna pantalla se queda fuera de las dos listas.
 *
 * UNA CLAVE POR TIPO DE PANTALLA, NO POR REGISTRO. `quality.processes.detail`
 * es la ficha de proceso, no la ficha del proceso 8f2c. Un tutorial por
 * registro sería una biblioteca imposible de mantener y una identidad que nace
 * y muere con un dato.
 */
export const PAGE_KEYS: readonly PageKeyEntry[] = [

  // === Trazaloop Quality =========================================
  {
    key: "quality.audits",
    label: "Auditorías · Resumen",
    module: "quality",
    route: "/quality/audits",
  },
  {
    key: "quality.audits.checklists",
    label: "Auditorías · Checklists",
    module: "quality",
    route: "/quality/audits/checklists",
  },
  {
    key: "quality.audits.detail",
    label: "Auditorías · Ficha de auditoría",
    module: "quality",
    route: "/quality/audits/[auditId]",
  },
  {
    key: "quality.audits.findings",
    label: "Auditorías · Hallazgos",
    module: "quality",
    route: "/quality/audits/findings",
  },
  {
    key: "quality.audits.list",
    label: "Auditorías · Listado",
    module: "quality",
    route: "/quality/audits/list",
  },
  {
    key: "quality.audits.programs",
    label: "Auditorías · Programa",
    module: "quality",
    route: "/quality/audits/programs",
  },
  {
    key: "quality.audits.programs.detail",
    label: "Auditorías · Ficha de programa",
    module: "quality",
    route: "/quality/audits/programs/[programId]",
  },
  {
    key: "quality.automation",
    label: "Automatización · Resumen",
    module: "quality",
    route: "/quality/automation",
  },
  {
    key: "quality.automation.rules",
    label: "Automatización · Reglas",
    module: "quality",
    route: "/quality/automation/rules",
  },
  {
    key: "quality.automation.rules.detail",
    label: "Automatización · Ficha de regla",
    module: "quality",
    route: "/quality/automation/rules/[ruleId]",
  },
  {
    key: "quality.automation.runs",
    label: "Automatización · Ejecuciones",
    module: "quality",
    route: "/quality/automation/runs",
  },
  {
    key: "quality.automation.signals",
    label: "Automatización · Señales",
    module: "quality",
    route: "/quality/automation/signals",
  },
  {
    key: "quality.automation.signals.detail",
    label: "Automatización · Ficha de señal",
    module: "quality",
    route: "/quality/automation/signals/[signalId]",
  },
  {
    key: "quality.cases",
    label: "Casos y acciones · Listado",
    module: "quality",
    route: "/quality/cases",
  },
  {
    key: "quality.cases.detail",
    label: "Casos y acciones · Ficha de caso",
    module: "quality",
    route: "/quality/cases/[caseId]",
  },
  {
    key: "quality.context.interested_parties",
    label: "Contexto · Partes interesadas",
    module: "quality",
    route: "/quality/context/interested-parties",
  },
  {
    key: "quality.context.interested_parties.categories",
    label: "Contexto · Categorías de partes interesadas",
    module: "quality",
    route: "/quality/context/interested-parties/categories",
  },
  {
    key: "quality.context.interested_parties.detail",
    label: "Contexto · Ficha de parte interesada",
    module: "quality",
    route: "/quality/context/interested-parties/[assessmentId]",
  },
  {
    // La clave dice «intelligence» y la ruta sigue diciendo «copilot»: la
    // identidad lleva el nombre de HOY del producto y la dirección es la que
    // hay. Es exactamente la separación que este registro existe para sostener.
    key: "quality.intelligence",
    label: "Trazaloop Intelligence",
    module: "quality",
    route: "/quality/copilot",
  },
  {
    key: "quality.customer_voice",
    label: "Voz del cliente · Resumen",
    module: "quality",
    route: "/quality/customer-voice",
  },
  {
    key: "quality.customer_voice.campaigns",
    label: "Voz del cliente · Campañas",
    module: "quality",
    route: "/quality/customer-voice/campaigns",
  },
  {
    key: "quality.customer_voice.campaigns.detail",
    label: "Voz del cliente · Ficha de campaña",
    module: "quality",
    route: "/quality/customer-voice/campaigns/[campaignId]",
  },
  {
    key: "quality.customer_voice.customers",
    label: "Voz del cliente · Clientes",
    module: "quality",
    route: "/quality/customer-voice/customers",
  },
  {
    key: "quality.customer_voice.customers.detail",
    label: "Voz del cliente · Ficha de cliente",
    module: "quality",
    route: "/quality/customer-voice/customers/[profileId]",
  },
  {
    key: "quality.customer_voice.feedback",
    label: "Voz del cliente · Retroalimentación",
    module: "quality",
    route: "/quality/customer-voice/feedback",
  },
  {
    key: "quality.customer_voice.surveys",
    label: "Voz del cliente · Encuestas",
    module: "quality",
    route: "/quality/customer-voice/surveys",
  },
  {
    key: "quality.documents",
    label: "Documentación · Documentos",
    module: "quality",
    route: "/quality/documents",
  },
  {
    key: "quality.documents.detail",
    label: "Documentación · Ficha de documento",
    module: "quality",
    route: "/quality/documents/[documentId]",
  },
  {
    key: "quality.documents.master",
    label: "Documentación · Lista Maestra",
    module: "quality",
    route: "/quality/documents/master",
  },
  {
    key: "quality.home",
    label: "Inicio Quality",
    module: "quality",
    route: "/quality",
  },
  {
    key: "quality.indicators",
    label: "Evaluación · Indicadores",
    module: "quality",
    route: "/quality/indicators",
  },
  {
    key: "quality.indicators.detail",
    label: "Evaluación · Ficha de indicador",
    module: "quality",
    route: "/quality/indicators/[indicatorId]",
  },
  {
    key: "quality.management_review",
    label: "Revisión por la dirección · Revisiones",
    module: "quality",
    route: "/quality/management-review",
  },
  {
    key: "quality.management_review.detail",
    label: "Revisión por la dirección · Ficha de revisión",
    module: "quality",
    route: "/quality/management-review/[reviewId]",
  },
  {
    key: "quality.management_review.followup",
    label: "Revisión por la dirección · Seguimiento",
    module: "quality",
    route: "/quality/management-review/followup",
  },
  {
    key: "quality.map",
    label: "Sistema de gestión · Mapa de procesos",
    module: "quality",
    route: "/quality/map",
  },
  {
    key: "quality.objectives",
    label: "Evaluación · Objetivos",
    module: "quality",
    route: "/quality/objectives",
  },
  {
    key: "quality.objectives.detail",
    label: "Evaluación · Ficha de objetivo",
    module: "quality",
    route: "/quality/objectives/[objectiveId]",
  },
  {
    key: "quality.people",
    label: "Personas · Listado",
    module: "quality",
    route: "/quality/people",
  },
  {
    key: "quality.people.competencies",
    label: "Personas · Competencias",
    module: "quality",
    route: "/quality/people/competencies",
  },
  {
    key: "quality.people.competencies.matrix",
    label: "Personas · Matriz de competencias",
    module: "quality",
    route: "/quality/people/competencies/matrix",
  },
  {
    key: "quality.people.detail",
    label: "Personas · Ficha de persona",
    module: "quality",
    route: "/quality/people/[personId]",
  },
  {
    key: "quality.people.development",
    label: "Personas · Desarrollo",
    module: "quality",
    route: "/quality/people/development",
  },
  {
    key: "quality.people.knowledge",
    label: "Personas · Conocimiento",
    module: "quality",
    route: "/quality/people/knowledge",
  },
  {
    key: "quality.people.lessons",
    label: "Personas · Lecciones aprendidas",
    module: "quality",
    route: "/quality/people/lessons",
  },
  {
    key: "quality.people.onboarding",
    label: "Personas · Incorporación de una persona",
    module: "quality",
    route: "/quality/people/[personId]/onboarding/[assignmentId]",
  },
  {
    key: "quality.people.performance",
    label: "Personas · Desempeño",
    module: "quality",
    route: "/quality/people/performance",
  },
  {
    key: "quality.people.performance.detail",
    label: "Personas · Ficha de evaluación de desempeño",
    module: "quality",
    route: "/quality/people/performance/[evaluationId]",
  },
  {
    key: "quality.people.positions.detail",
    label: "Personas · Ficha de cargo",
    module: "quality",
    route: "/quality/people/positions/[positionId]",
  },
  {
    key: "quality.people.structure",
    label: "Personas · Estructura de la empresa",
    module: "quality",
    route: "/quality/people/structure",
  },
  {
    key: "quality.positions",
    label: "Sistema de gestión · Cargos",
    module: "quality",
    route: "/quality/positions",
  },
  {
    key: "quality.processes",
    label: "Sistema de gestión · Procesos",
    module: "quality",
    route: "/quality/processes",
  },
  {
    key: "quality.processes.detail",
    label: "Sistema de gestión · Ficha de proceso",
    module: "quality",
    route: "/quality/processes/[processId]",
  },
  {
    key: "quality.risks",
    label: "Riesgos y oportunidades · Riesgos",
    module: "quality",
    route: "/quality/risks",
  },
  {
    key: "quality.risks.opportunities",
    label: "Riesgos y oportunidades · Oportunidades",
    module: "quality",
    route: "/quality/risks",
    subview: { param: "vista", value: "oportunidades" },
  },
  {
    key: "quality.risks.detail",
    label: "Riesgos y oportunidades · Ficha de riesgo",
    module: "quality",
    route: "/quality/risks/[riskId]",
  },
  {
    key: "quality.risks.methodology",
    label: "Riesgos y oportunidades · Metodología",
    module: "quality",
    route: "/quality/risks/methodology",
  },
  {
    key: "quality.risks.opportunities.detail",
    label: "Riesgos y oportunidades · Ficha de oportunidad",
    module: "quality",
    route: "/quality/risks/opportunities/[opportunityId]",
  },
  {
    key: "quality.suppliers",
    label: "Proveedores · Listado",
    module: "quality",
    route: "/quality/suppliers",
  },
  {
    key: "quality.suppliers.categories",
    label: "Proveedores · Categorías",
    module: "quality",
    route: "/quality/suppliers/categories",
  },
  {
    key: "quality.suppliers.detail",
    label: "Proveedores · Ficha de proveedor",
    module: "quality",
    route: "/quality/suppliers/[profileId]",
  },
  {
    key: "quality.suppliers.evaluations",
    label: "Proveedores · Evaluaciones",
    module: "quality",
    route: "/quality/suppliers/evaluations",
  },
  {
    key: "quality.suppliers.evaluations.detail",
    label: "Proveedores · Ficha de evaluación",
    module: "quality",
    route: "/quality/suppliers/evaluations/[evaluationId]",
  },
  {
    key: "quality.suppliers.reevaluations",
    label: "Proveedores · Reevaluaciones",
    module: "quality",
    route: "/quality/suppliers/reevaluations",
  },
  {
    key: "quality.suppliers.sites.detail",
    label: "Proveedores · Ficha de sede",
    module: "quality",
    route: "/quality/suppliers/[profileId]/sites/[siteId]",
  },
  {
    key: "quality.suppliers.templates",
    label: "Proveedores · Plantillas de evaluación",
    module: "quality",
    route: "/quality/suppliers/templates",
  },
  {
    key: "quality.tasks",
    label: "Mis tareas",
    module: "quality",
    route: "/quality/tasks",
  },

  // === Trazaloop PCR =============================================
  {
    key: "cpr.audit_prep.dossiers",
    label: "Preparación de auditoría · Expedientes",
    module: "cpr",
    route: "/audit-prep/dossiers",
  },
  {
    key: "cpr.audit_prep.dossiers.detail",
    label: "Preparación de auditoría · Ficha de expediente",
    module: "cpr",
    route: "/audit-prep/dossiers/[id]",
  },
  {
    key: "cpr.audit_prep.exercises",
    label: "Preparación de auditoría · Ejercicios de trazabilidad",
    module: "cpr",
    route: "/audit-prep/exercises",
  },
  {
    key: "cpr.audit_prep.exercises.detail",
    label: "Preparación de auditoría · Ficha de ejercicio",
    module: "cpr",
    route: "/audit-prep/exercises/[id]",
  },
  {
    key: "cpr.audit_support",
    label: "Soporte técnico · Resumen",
    module: "cpr",
    route: "/audit-support",
  },
  {
    key: "cpr.audit_support.calculations.detail",
    label: "Soporte técnico · Ficha de cálculo",
    module: "cpr",
    route: "/audit-support/calculations/[id]",
  },
  {
    key: "cpr.audit_support.evidence_matrix",
    label: "Soporte técnico · Matriz de evidencias",
    module: "cpr",
    route: "/audit-support/output-batches/[id]/evidence-matrix",
  },
  {
    key: "cpr.catalog",
    label: "Catálogos · Resumen",
    module: "cpr",
    route: "/catalog",
  },
  {
    key: "cpr.catalog.customer_requirements",
    label: "Catálogos · Requisitos de cliente",
    module: "cpr",
    route: "/catalog/customer-requirements",
  },
  {
    key: "cpr.catalog.families",
    label: "Catálogos · Familias",
    module: "cpr",
    route: "/catalog/families",
  },
  {
    key: "cpr.catalog.import",
    label: "Catálogos · Importar",
    module: "cpr",
    route: "/catalog/import",
  },
  {
    key: "cpr.catalog.materials",
    label: "Catálogos · Materiales",
    module: "cpr",
    route: "/catalog/materials",
  },
  {
    key: "cpr.catalog.products",
    label: "Catálogos · Productos",
    module: "cpr",
    route: "/catalog/products",
  },
  {
    key: "cpr.catalog.suppliers",
    label: "Catálogos · Proveedores",
    module: "cpr",
    route: "/catalog/suppliers",
  },
  {
    key: "cpr.dashboard",
    label: "Dashboard",
    module: "cpr",
    route: "/dashboard",
  },
  {
    key: "cpr.diagnostic",
    label: "Trazabilidad · Diagnóstico",
    module: "cpr",
    route: "/diagnostic",
  },
  {
    key: "cpr.evidences",
    label: "Evidencias",
    module: "cpr",
    route: "/evidences",
  },
  {
    key: "cpr.guided_flow",
    label: "Flujo guiado",
    module: "cpr",
    route: "/guided-flow",
  },
  {
    key: "cpr.guided_flow.output_batches.detail",
    label: "Flujo guiado · Ficha de lote producido",
    module: "cpr",
    route: "/guided-flow/output-batches/[id]",
  },
  {
    key: "cpr.implementation",
    label: "Implementación",
    module: "cpr",
    route: "/implementation",
  },
  {
    key: "cpr.implementation.feedback",
    label: "Implementación · Retroalimentación",
    module: "cpr",
    route: "/implementation/feedback",
  },
  {
    key: "cpr.imports",
    label: "Importaciones",
    module: "cpr",
    route: "/imports",
  },
  {
    key: "cpr.imports.detail",
    label: "Importaciones · Ficha de importación",
    module: "cpr",
    route: "/imports/[id]",
  },
  {
    key: "cpr.onboarding",
    label: "Onboarding",
    module: "cpr",
    route: "/onboarding",
  },
  {
    key: "cpr.recycled_content",
    label: "Contenido reciclado · Resumen",
    module: "cpr",
    route: "/recycled-content",
  },
  {
    key: "cpr.recycled_content.output_batches",
    label: "Contenido reciclado · Lotes producidos",
    module: "cpr",
    route: "/recycled-content/output-batches",
  },
  {
    key: "cpr.recycled_content.output_batches.detail",
    label: "Contenido reciclado · Ficha de lote",
    module: "cpr",
    route: "/recycled-content/output-batches/[id]",
  },
  {
    key: "cpr.recycled_content.reports",
    label: "Contenido reciclado · Informes",
    module: "cpr",
    route: "/recycled-content/reports",
  },
  {
    key: "cpr.traceability",
    label: "Trazabilidad · Resumen",
    module: "cpr",
    route: "/traceability",
  },
  {
    key: "cpr.traceability.genealogy",
    label: "Trazabilidad · Genealogía",
    module: "cpr",
    route: "/traceability/genealogy",
  },
  {
    key: "cpr.traceability.input_batches",
    label: "Trazabilidad · Lotes de entrada",
    module: "cpr",
    route: "/traceability/input-batches",
  },
  {
    key: "cpr.traceability.inventory",
    label: "Inventario · Materias primas",
    module: "cpr",
    route: "/traceability/inventory",
  },
  {
    key: "cpr.traceability.inventory.products",
    label: "Inventario · Producto terminado",
    module: "cpr",
    route: "/traceability/inventory",
    subview: { param: "vista", value: "productos" },
  },
  {
    key: "cpr.traceability.output_batches",
    label: "Trazabilidad · Lotes producidos",
    module: "cpr",
    route: "/traceability/output-batches",
  },
  {
    key: "cpr.traceability.production_orders",
    label: "Trazabilidad · Órdenes / corridas de producción",
    module: "cpr",
    route: "/traceability/production-orders",
  },
  {
    key: "cpr.traceability.production_orders.detail",
    label: "Trazabilidad · Ficha de orden / corrida de producción",
    module: "cpr",
    route: "/traceability/production-orders/[id]",
  },
  {
    key: "cpr.trazadocs",
    label: "TrazaDocs · Documentos",
    module: "cpr",
    route: "/trazadocs",
  },
  {
    key: "cpr.trazadocs.detail",
    label: "TrazaDocs · Ficha de documento",
    module: "cpr",
    route: "/trazadocs/[id]",
  },
  {
    key: "cpr.trazadocs.edit",
    label: "TrazaDocs · Editar documento",
    module: "cpr",
    route: "/trazadocs/[id]/edit",
  },
  {
    key: "cpr.trazadocs.files.detail",
    label: "TrazaDocs · Ficha de archivo",
    module: "cpr",
    route: "/trazadocs/files/[id]",
  },
  {
    key: "cpr.trazadocs.files.new",
    label: "TrazaDocs · Nuevo archivo",
    module: "cpr",
    route: "/trazadocs/files/new",
  },
  {
    key: "cpr.trazadocs.master",
    label: "TrazaDocs · Maestro de documentos",
    module: "cpr",
    route: "/trazadocs/master",
  },
  {
    key: "cpr.trazadocs.new",
    label: "TrazaDocs · Nuevo documento",
    module: "cpr",
    route: "/trazadocs/new",
  },
  {
    key: "cpr.trazadocs.versions",
    label: "TrazaDocs · Versiones de un documento",
    module: "cpr",
    route: "/trazadocs/[id]/versions",
  },

  // === Trazaloop Textiles ========================================
  {
    key: "textiles.catalogs",
    label: "Catálogos textiles · Resumen",
    module: "textiles",
    route: "/textiles/catalogs",
  },
  {
    key: "textiles.catalogs.components",
    label: "Catálogos textiles · Componentes",
    module: "textiles",
    route: "/textiles/catalogs/components",
  },
  {
    key: "textiles.catalogs.fibers",
    label: "Catálogos textiles · Fibras",
    module: "textiles",
    route: "/textiles/catalogs/fibers",
  },
  {
    key: "textiles.catalogs.materials",
    label: "Catálogos textiles · Materiales",
    module: "textiles",
    route: "/textiles/catalogs/materials",
  },
  {
    key: "textiles.catalogs.outsourced_processes",
    label: "Catálogos textiles · Procesos tercerizados",
    module: "textiles",
    route: "/textiles/catalogs/outsourced-processes",
  },
  {
    key: "textiles.catalogs.processes",
    label: "Catálogos textiles · Procesos",
    module: "textiles",
    route: "/textiles/catalogs/processes",
  },
  {
    key: "textiles.catalogs.suppliers",
    label: "Catálogos textiles · Proveedores",
    module: "textiles",
    route: "/textiles/catalogs/suppliers",
  },
  {
    key: "textiles.circularity",
    label: "Circularidad · Resumen",
    module: "textiles",
    route: "/textiles/circularity",
  },
  {
    key: "textiles.circularity.assessments",
    label: "Circularidad · Evaluaciones",
    module: "textiles",
    route: "/textiles/circularity/assessments",
  },
  {
    key: "textiles.circularity.assessments.detail",
    label: "Circularidad · Ficha de evaluación",
    module: "textiles",
    route: "/textiles/circularity/assessments/[id]",
  },
  {
    key: "textiles.circularity.assessments.new",
    label: "Circularidad · Nueva evaluación",
    module: "textiles",
    route: "/textiles/circularity/assessments/new",
  },
  {
    key: "textiles.diagnostic",
    label: "Gestión textil · Diagnóstico",
    module: "textiles",
    route: "/textiles/diagnostic",
  },
  {
    key: "textiles.diagnostic.results",
    label: "Gestión textil · Resultados del diagnóstico",
    module: "textiles",
    route: "/textiles/diagnostic/results",
  },
  {
    key: "textiles.evidences",
    label: "Evidencias textiles · Listado",
    module: "textiles",
    route: "/textiles/evidences",
  },
  {
    key: "textiles.evidences.detail",
    label: "Evidencias textiles · Ficha de evidencia",
    module: "textiles",
    route: "/textiles/evidences/[id]",
  },
  {
    key: "textiles.evidences.new",
    label: "Evidencias textiles · Nueva evidencia",
    module: "textiles",
    route: "/textiles/evidences/new",
  },
  {
    key: "textiles.home",
    label: "Inicio Textiles",
    module: "textiles",
    route: "/textiles",
  },
  {
    key: "textiles.passports",
    label: "Pasaportes técnicos · Listado",
    module: "textiles",
    route: "/textiles/passports",
  },
  {
    key: "textiles.passports.detail",
    label: "Pasaportes técnicos · Ficha de pasaporte",
    module: "textiles",
    route: "/textiles/passports/[id]",
  },
  {
    key: "textiles.passports.new",
    label: "Pasaportes técnicos · Nuevo pasaporte",
    module: "textiles",
    route: "/textiles/passports/new",
  },
  {
    key: "textiles.products",
    label: "Productos y referencias · Listado",
    module: "textiles",
    route: "/textiles/products",
  },
  {
    key: "textiles.products.collections",
    label: "Productos y referencias · Colecciones",
    module: "textiles",
    route: "/textiles/products/collections",
  },
  {
    key: "textiles.products.detail",
    label: "Productos y referencias · Ficha de producto",
    module: "textiles",
    route: "/textiles/products/[id]",
  },
  {
    key: "textiles.references.detail",
    label: "Productos y referencias · Ficha de referencia",
    module: "textiles",
    route: "/textiles/references/[id]",
  },
  {
    key: "textiles.traceability",
    label: "Trazabilidad textil · Resumen",
    module: "textiles",
    route: "/textiles/traceability",
  },
  {
    key: "textiles.traceability.input_lots",
    label: "Trazabilidad textil · Lotes de entrada",
    module: "textiles",
    route: "/textiles/traceability/input-lots",
  },
  {
    key: "textiles.traceability.inventory",
    label: "Saldo de materia prima",
    module: "textiles",
    route: "/textiles/traceability/inventory",
  },
  {
    key: "textiles.traceability.orders",
    label: "Trazabilidad textil · Órdenes",
    module: "textiles",
    route: "/textiles/traceability/orders",
  },
  {
    key: "textiles.traceability.orders.detail",
    label: "Trazabilidad textil · Ficha de orden",
    module: "textiles",
    route: "/textiles/traceability/orders/[id]",
  },
  {
    key: "textiles.traceability.output_lots",
    label: "Trazabilidad textil · Lotes producidos",
    module: "textiles",
    route: "/textiles/traceability/output-lots",
  },
  {
    key: "textiles.traceability.output_lots.detail",
    label: "Trazabilidad textil · Ficha de lote producido",
    module: "textiles",
    route: "/textiles/traceability/output-lots/[id]",
  },
  {
    key: "textiles.trazadocs",
    label: "TrazaDocs Textil · Documentos",
    module: "textiles",
    route: "/textiles/trazadocs",
  },
  {
    key: "textiles.trazadocs.detail",
    label: "TrazaDocs Textil · Ficha de documento",
    module: "textiles",
    route: "/textiles/trazadocs/[documentId]",
  },

  // === Transversal · Trazaloop sin módulo ========================
  {
    key: "platform.modules",
    label: "Plataforma · Puerta de módulos",
    module: PLATFORM_SURFACE_KEY,
    route: "/modules",
  },
  {
    key: "platform.select_org",
    label: "Plataforma · Seleccionar empresa",
    module: PLATFORM_SURFACE_KEY,
    route: "/select-org",
  },
  {
    key: "platform.settings.billing",
    label: "Sistema · Plan y facturación",
    module: PLATFORM_SURFACE_KEY,
    route: "/settings/billing",
  },
  {
    key: "platform.settings.billing.checkout",
    label: "Sistema · Contratar un plan",
    module: PLATFORM_SURFACE_KEY,
    route: "/settings/billing/checkout",
  },
  {
    key: "platform.settings.company",
    label: "Sistema · Datos de empresa",
    module: PLATFORM_SURFACE_KEY,
    route: "/settings/company",
  },
  {
    key: "platform.settings.profile",
    label: "Sistema · Mi perfil",
    module: PLATFORM_SURFACE_KEY,
    route: "/settings/profile",
  },
  {
    key: "platform.support",
    label: "Sistema · Centro de soporte",
    module: PLATFORM_SURFACE_KEY,
    route: "/support",
  },
  {
    key: "platform.support.detail",
    label: "Sistema · Ficha de ticket de soporte",
    module: PLATFORM_SURFACE_KEY,
    route: "/support/[id]",
  },
  {
    key: "platform.support.new",
    label: "Sistema · Nuevo ticket de soporte",
    module: PLATFORM_SURFACE_KEY,
    route: "/support/new",
  },
  {
    key: "platform.team",
    label: "Sistema · Equipo",
    module: PLATFORM_SURFACE_KEY,
    route: "/team",
  },
] as const;

const POR_CLAVE = new Map(PAGE_KEYS.map((p) => [p.key, p]));

/** ¿Esta clave está en el registro? Lo usan la consola y las pruebas. */
export function isKnownPageKey(key: string): boolean {
  return POR_CLAVE.has(key);
}

export function getPageKey(key: string): PageKeyEntry | null {
  return POR_CLAVE.get(key) ?? null;
}

/** Las pantallas de un módulo, para los filtros de la consola. */
export function pageKeysForModule(moduleKey: string): PageKeyEntry[] {
  return PAGE_KEYS.filter((p) => p.module === moduleKey);
}

/** Las claves de módulo admitidas: las del catálogo, más la superficie neutra. */
export const PAGE_KEY_MODULES: readonly string[] = [
  ...COMMERCIAL_MODULES.map((m) => m.key),
  PLATFORM_SURFACE_KEY,
];

/**
 * La forma de una clave, comprobable sin consultar el registro.
 *
 * Se usa en la base —la restricción de la tabla la repite— y aquí, para que la
 * consola pueda rechazar una clave mal escrita antes de enviarla.
 */
export const PAGE_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isWellFormedPageKey(key: string): boolean {
  if (!PAGE_KEY_PATTERN.test(key)) return false;
  return PAGE_KEY_MODULES.includes(key.split(".")[0]);
}

// ===========================================================================
// PE-03B3 · DE UNA RUTA A SU CLAVE
// ===========================================================================

/**
 * Qué clave de pantalla corresponde a una dirección.
 *
 * LA RUTA NO ES LA IDENTIDAD, Y ESTO NO LA CONVIERTE EN UNA
 *
 * La distinción que PE-02 congeló sigue en pie: la identidad de un tutorial es
 * su clave. Lo que hace esta función es lo contrario de identificar por ruta —
 * mira dónde está la persona AHORA y consulta el registro para saber qué clave
 * aplica ahí.
 *
 * Si mañana una pantalla se muda de dirección, se actualiza su `route` en el
 * registro y nada más: la clave no cambia, y con ella no cambian ni el tutorial,
 * ni su historia, ni la ayuda contextual que cuelga de la misma clave.
 *
 *
 * POR QUÉ SE ELIGE LA COINCIDENCIA MÁS LARGA
 *
 * `/quality/processes` y `/quality/processes/[id]` son dos entradas distintas.
 * Con una comparación por prefijo a secas, la ficha de un proceso recibiría el
 * tutorial del listado — un vídeo de otra pantalla, que es peor que ninguno.
 *
 * Se compara segmento a segmento y gana la ruta MÁS ESPECÍFICA que encaja. Y si
 * ninguna encaja del todo, no se devuelve nada: una pantalla sin clave no
 * admite tutorial, y eso es una respuesta, no un fallo.
 */
export function resolvePageKeyForPath(
  pathname: string,
  params?: URLSearchParams | Record<string, string | undefined> | null
): string | null {
  const partes = pathname.split("?")[0].split("#")[0]
    .split("/").filter((s) => s.length > 0);

  const leer = (nombre: string): string | undefined => {
    if (!params) return undefined;
    if (typeof (params as URLSearchParams).get === "function") {
      return (params as URLSearchParams).get(nombre) ?? undefined;
    }
    return (params as Record<string, string | undefined>)[nombre];
  };

  let mejor: { key: string; especificidad: number } | null = null;

  for (const entrada of PAGE_KEYS) {
    const patron = entrada.route.split("/").filter((s) => s.length > 0);
    if (patron.length !== partes.length) continue;

    let encaja = true;
    for (let i = 0; i < patron.length; i += 1) {
      const p = patron[i];
      // `[id]` casa con cualquier segmento; el resto tiene que ser literal.
      if (p.startsWith("[") && p.endsWith("]")) continue;
      if (p !== partes[i]) { encaja = false; break; }
    }
    if (!encaja) continue;

    // Una entrada con pestaña solo cuenta si el parámetro trae SU valor. Una
    // entrada sin pestaña vale siempre: es la vista por defecto de esa ruta.
    if (entrada.subview && leer(entrada.subview.param) !== entrada.subview.value) {
      continue;
    }

    // A igualdad de longitud gana la que tiene menos comodines: una ruta
    // literal describe la pantalla mejor que una con parámetros. Y una pestaña
    // que encaja gana a la vista por defecto de su propia ruta, que es lo que
    // hace que `?vista=oportunidades` no reciba el tutorial de los riesgos.
    const comodines = patron.filter((p) => p.startsWith("[")).length;
    const especificidad = patron.length * 100 - comodines * 10 + (entrada.subview ? 1 : 0);
    if (!mejor || especificidad > mejor.especificidad) {
      mejor = { key: entrada.key, especificidad };
    }
  }

  return mejor?.key ?? null;
}

// ===========================================================================
// PE-03B4 · LO QUE NO LLEVA TUTORIAL, Y POR QUÉ
// ===========================================================================

/**
 * Las pantallas que a propósito NO son objetivo de tutorial.
 *
 * POR QUÉ SE ESCRIBEN EN VEZ DE OMITIRSE
 *
 * Una pantalla ausente de `PAGE_KEYS` y ausente de aquí es indistinguible de
 * una pantalla olvidada. Esta lista convierte «no lleva tutorial» en una
 * decisión con motivo, y permite que la prueba de cobertura falle cuando nazca
 * una pantalla nueva que nadie clasificó.
 *
 * La ruta se escribe igual que en `PAGE_KEYS`: con `[param]` donde el producto
 * tiene un parámetro.
 */
export type PageKeyExclusion = {
  route: string;
  /** Por qué esta pantalla no lleva vídeo. Se lee en la consola y en la prueba. */
  reason: string;
};

export const PAGE_KEY_EXCLUSIONS: readonly PageKeyExclusion[] = [
  // --- Autenticación -------------------------------------------------------
  // Quien está aquí todavía no ha entrado: no hay sesión, y el botón del
  // tutorial vive dentro del shell autenticado.
  { route: "/login", reason: "Autenticación · la persona todavía no ha entrado" },
  { route: "/register", reason: "Autenticación · la persona todavía no ha entrado" },
  { route: "/forgot-password", reason: "Recuperación de acceso · sin sesión" },
  { route: "/reset-password", reason: "Recuperación de acceso · sin sesión" },
  { route: "/accept-invite", reason: "Enlace de invitación · trámite de una sola vez" },

  // --- Trámite de un solo paso ---------------------------------------------
  // PROD-LAUNCH-01B · La vuelta de la pasarela. No es una pantalla que se
  // opere: se entra una vez, se lee si el pago consta y se sale. Un tutorial
  // encima de alguien que acaba de pagar y quiere saber si tiene plan sería
  // ruido en el peor momento.
  { route: "/settings/billing/checkout/return",
    reason: "Vuelta del pago · trámite de una sola vez, no se opera" },

  // --- Legal ---------------------------------------------------------------
  // Un vídeo encima de un texto que hay que aceptar compite con el texto. Y la
  // aceptación es una puerta obligatoria: nada puede taparla.
  { route: "/legal", reason: "Legal · texto que se lee, no pantalla que se opera" },
  { route: "/legal/accept", reason: "Legal · puerta obligatoria, nada puede taparla" },
  { route: "/legal/paquete", reason: "Legal · texto que se lee" },
  { route: "/privacy", reason: "Legal · texto que se lee" },
  { route: "/terms", reason: "Legal · texto que se lee" },

  // --- Público -------------------------------------------------------------
  { route: "/", reason: "Portada pública · fuera del producto" },
  { route: "/faq", reason: "Ayuda pública · tiene su propio sistema, PE-02" },
  { route: "/faq/[slug]", reason: "Ayuda pública · tiene su propio sistema, PE-02" },
  { route: "/survey/[token]", reason: "Público por testigo · lo abre un cliente, no un usuario" },
  { route: "/textile-passport-share/[token]",
    reason: "Público por testigo · lo abre un tercero, no un usuario" },

  // --- Consola interna de plataforma ---------------------------------------
  // No es producto: es la herramienta con la que Trazaloop administra el
  // producto. Quien entra aquí es personal de plataforma, no un cliente.
  { route: "/platform", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/faq", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/faq/[id]", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/faq/categorias", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/help", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/help/[id]", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/intelligence", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/legal", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/legal/[id]", reason: "Consola de plataforma · herramienta interna" },
  // PD-01D · Administración de campañas públicas de diagnóstico. Como el resto
  // de la consola: la usa el equipo de plataforma, no las empresas, así que no
  // lleva tutorial.
  { route: "/platform/public-diagnostics", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/public-diagnostics/[campaignId]", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/plans", reason: "Consola de plataforma · administración comercial interna" },
  { route: "/platform/organizations/new", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/organizations/[id]", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/support", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/support/[id]", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/trazadocs", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/trazadocs/[id]", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/tutorials", reason: "Consola de plataforma · herramienta interna" },
  { route: "/platform/tutorials/[id]", reason: "Consola de plataforma · herramienta interna" },

  // --- Superficies de impresión --------------------------------------------
  // No se navegan: se abren para imprimir y se cierran. El shell no las
  // envuelve, así que ni siquiera hay barra donde poner el botón.
  { route: "/trazadocs/[id]/print", reason: "Superficie de impresión · no se navega" },
  { route: "/trazadocs/master/print", reason: "Superficie de impresión · no se navega" },
  { route: "/audit-support/calculations/[id]/print",
    reason: "Superficie de impresión · no se navega" },
  { route: "/textiles/passports/[id]/print", reason: "Superficie de impresión · no se navega" },
  { route: "/textiles/trazadocs/[documentId]/print",
    reason: "Superficie de impresión · no se navega" },
];

const RUTAS_EXCLUIDAS = new Set(PAGE_KEY_EXCLUSIONS.map((e) => e.route));

/** ¿Esta ruta está excluida a propósito? */
export function isExcludedRoute(route: string): boolean {
  return RUTAS_EXCLUIDAS.has(route);
}

export function exclusionReason(route: string): string | null {
  return PAGE_KEY_EXCLUSIONS.find((e) => e.route === route)?.reason ?? null;
}

/** Las rutas que el registro reclama, sin repetir las de las pestañas. */
export const REGISTERED_ROUTES: readonly string[] =
  [...new Set(PAGE_KEYS.map((p) => p.route))];

