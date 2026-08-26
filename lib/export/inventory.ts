/**
 * Trazaloop · EXPORT-01.1 · El inventario de objetos de negocio, COMO DATO.
 *
 * POR QUÉ ESTO ES CÓDIGO Y NO UN DOCUMENTO
 *
 * EXPORT-01 dejó el inventario en un markdown. Un markdown no falla: se queda
 * atrás en silencio mientras el registro crece, y quien lo consulte creerá que
 * dice la verdad. Aquí el inventario es una estructura tipada que las pruebas
 * recorren: si una entidad declara ficha y no existe la definición, la suite
 * falla; si alguien añade una exportación y no la clasifica, falla; si un
 * `NOT_APPLICABLE` se queda sin motivo, falla.
 *
 * El markdown se sigue publicando —es lo que la gente lee— pero se comprueba
 * contra ESTO.
 *
 * LOS CUATRO ESTADOS FINALES (§33, §70)
 *
 *   AVAILABLE                 · tiene su propia clave y se descarga.
 *   EMBEDDED                  · se imprime DENTRO del PDF de su padre, porque
 *                               no tiene identidad de negocio propia.
 *   NOT_APPLICABLE            · no es un objeto documentable, con motivo.
 *   HISTORICAL_NOT_SUPPORTED  · el dominio no conserva versión temporal
 *                               suficiente para reconstruir el pasado con
 *                               verdad. NUNCA significa que falte el PDF
 *                               actual: eso sería usarlo para no implementar.
 *
 * No existe `PENDING`. Ese es el punto entero del sprint.
 */

export type AxisState =
  | { state: "AVAILABLE"; key: string }
  | { state: "EMBEDDED"; parent: string; reason: string }
  | { state: "NOT_APPLICABLE"; reason: string }
  | { state: "HISTORICAL_NOT_SUPPORTED"; reason: string };

export type InventoryModule = "quality" | "trazadocs" | "cpr" | "textiles" | "core";

export type InventoryRow = {
  /** Cómo se llama en el vocabulario del dominio. */
  entity: string;
  module: InventoryModule;
  /** Dónde vive en la aplicación, o `null` si no tiene pantalla propia. */
  route: string | null;
  /** `A` ficha · `B` listado · `C` ficha + listado · `D` embebido · `E` no documentable. */
  klass: "A" | "B" | "C" | "D" | "E";
  detail: AxisState;
  list: AxisState;
  historical: AxisState;
};

/** Motivos que se repiten. Escribirlos una vez evita que se degraden. */
const EMBEDDED_NO_IDENTITY =
  "Fila de relación sin identidad empresarial propia: se representa dentro de su registro padre.";
const NAV_ONLY = "Ayuda de navegación, no un objeto de negocio.";
const PLATFORM_SCOPE =
  "Backoffice de plataforma: administra datos de TODAS las empresas. Exportarlo produciría un PDF multiempresa, y un PDF no concede permisos nuevos (EX-10). Exigiría un permiso de plataforma y una clave propia.";
const LIST_ONLY_NO_SHEET =
  "Es un elemento de catálogo: su información completa cabe en la fila del listado, y una hoja por elemento no añadiría nada que el listado no diga.";
const NO_LIST_SINGLETON =
  "Es único por empresa: no existe una colección que listar.";
const PROJECTION_NOT_ENTITY =
  "Es una proyección de otros registros, no una entidad con identidad propia.";

const has = (key: string): AxisState => ({ state: "AVAILABLE", key });
const embedded = (parent: string, reason = EMBEDDED_NO_IDENTITY): AxisState =>
  ({ state: "EMBEDDED", parent, reason });
const na = (reason: string): AxisState => ({ state: "NOT_APPLICABLE", reason });
const noHistory = (reason: string): AxisState =>
  ({ state: "HISTORICAL_NOT_SUPPORTED", reason });

export const EXPORT_INVENTORY: readonly InventoryRow[] = [
  // ---------------------------------------------------------------- Quality
  {
    entity: "Proceso", module: "quality", route: "/quality/processes/[id]", klass: "C",
    detail: has("quality.process.detail"),
    list: has("quality.process.list"),
    historical: has("quality.process-revision.detail"),
  },
  {
    entity: "Entrada / salida de proceso", module: "quality", route: null, klass: "D",
    detail: embedded("Proceso"), list: embedded("Proceso"),
    historical: embedded("Revisión de proceso"),
  },
  {
    entity: "Interacción entre procesos", module: "quality", route: null, klass: "D",
    detail: embedded("Proceso"), list: embedded("Mapa de procesos"),
    historical: embedded("Versión del mapa"),
  },
  {
    entity: "Revisión de proceso", module: "quality", route: null, klass: "A",
    detail: has("quality.process-revision.detail"),
    list: embedded("Proceso", "El historial de revisiones se imprime en la ficha del proceso."),
    historical: has("quality.process-revision.detail"),
  },
  {
    entity: "Mapa de procesos", module: "quality", route: "/quality/map", klass: "A",
    detail: has("quality.map.detail"),
    list: na(NO_LIST_SINGLETON),
    historical: has("quality.map-version.detail"),
  },
  {
    entity: "Versión del mapa", module: "quality", route: "/quality/map", klass: "A",
    detail: has("quality.map-version.detail"),
    list: embedded("Mapa de procesos", "Las versiones se enumeran en la pantalla del mapa."),
    historical: has("quality.map-version.detail"),
  },
  {
    entity: "Cargo", module: "quality", route: "/quality/positions", klass: "C",
    detail: has("quality.position.detail"), list: has("quality.position.list"),
    historical: embedded("Cargo",
      "Las titularidades se imprimen con sus vigencias dentro de la ficha del cargo: el cargo responde, la persona lo ocupó entre fechas."),
  },
  {
    entity: "Titular de cargo", module: "quality", route: null, klass: "D",
    detail: embedded("Cargo"), list: embedded("Cargo"), historical: embedded("Cargo"),
  },
  {
    entity: "Datos de la empresa", module: "core", route: "/settings/company", klass: "A",
    detail: has("core.company.detail"),
    list: na(NO_LIST_SINGLETON),
    historical: noHistory(
      "La ficha de empresa guarda el valor VIGENTE de cada campo: el dominio no conserva la serie de valores anteriores, así que no se puede reconstruir cómo se llamaba o dónde estaba en una fecha pasada."),
  },
  {
    entity: "Equipo / miembros", module: "core", route: "/team", klass: "B",
    detail: na("Una persona no es un registro de la empresa: sus datos son del perfil, no del sistema de gestión."),
    list: has("core.team.list"),
    historical: noHistory(
      "La membresía guarda estado y fecha de alta: el dominio no conserva la serie completa de cambios de rol, así que no se puede reconstruir quién tenía qué permiso en una fecha pasada."),
  },

  // -------------------------------------------------------- Quality · docs
  {
    entity: "Documento controlado", module: "quality", route: "/quality/documents/[id]", klass: "C",
    detail: has("quality.document.detail"),
    list: has("quality.master-list.list"),
    historical: has("quality.document-revision.detail"),
  },
  {
    entity: "Lista Maestra", module: "quality", route: "/quality/documents/master", klass: "B",
    detail: na(PROJECTION_NOT_ENTITY),
    list: has("quality.master-list.list"),
    historical: noHistory(
      "La Lista Maestra es una proyección del estado de HOY: no se guarda una versión de la lista por fecha. La historia de cada documento vive en sus revisiones, que sí se descargan una por una."),
  },
  {
    entity: "Revisión documental", module: "quality", route: null, klass: "A",
    detail: has("quality.document-revision.detail"),
    list: embedded("Documento controlado", "El historial de revisiones se imprime en la ficha del documento."),
    historical: has("quality.document-revision.detail"),
  },
  {
    entity: "Decisión de workflow", module: "quality", route: null, klass: "D",
    detail: embedded("Revisión documental"), list: embedded("Revisión documental"),
    historical: embedded("Revisión documental"),
  },

  // -------------------------------------------------- Quality · desempeño
  {
    entity: "Objetivo", module: "quality", route: "/quality/objectives/[id]", klass: "C",
    detail: has("quality.objective.detail"), list: has("quality.objective.list"),
    historical: embedded("Objetivo", "El desempeño por periodo se imprime dentro de la ficha."),
  },
  {
    entity: "Indicador", module: "quality", route: "/quality/indicators/[id]", klass: "C",
    detail: has("quality.indicator.detail"), list: has("quality.indicator.list"),
    historical: has("quality.measurement.detail"),
  },
  {
    entity: "Medición", module: "quality", route: null, klass: "A",
    detail: has("quality.measurement.detail"),
    list: embedded("Indicador", "El historial por periodos se imprime en la ficha del indicador."),
    historical: has("quality.measurement.detail"),
  },
  {
    entity: "Configuración de indicador", module: "quality", route: null, klass: "D",
    detail: embedded("Indicador"), list: embedded("Indicador"),
    historical: embedded("Medición",
      "Cada medición imprime la configuración que regía en su periodo: es ahí donde la versión importa."),
  },
  {
    entity: "Cierre de periodo", module: "quality", route: "/quality/objectives", klass: "B",
    detail: embedded("Cierres de periodo", "Un cierre es una fila con fecha, autor y motivo: cabe entera en el listado."),
    list: has("quality.period-closure.list"),
    historical: has("quality.period-closure.list"),
  },

  // --------------------------------------------- Quality · casos y mejora
  {
    entity: "Caso", module: "quality", route: "/quality/cases/[id]", klass: "C",
    detail: has("quality.case.detail"), list: has("quality.case.list"),
    historical: embedded("Caso", "El timeline de decisiones se imprime dentro de la ficha."),
  },
  {
    entity: "No conformidad", module: "quality", route: "/quality/cases/[id]", klass: "C",
    detail: has("quality.case.detail"), list: has("quality.case.list"),
    historical: embedded("Caso"),
  },
  {
    entity: "Hallazgo", module: "quality", route: null, klass: "D",
    detail: embedded("Caso"), list: embedded("Caso"), historical: embedded("Caso"),
  },
  {
    entity: "Requisito evaluado", module: "quality", route: null, klass: "D",
    detail: embedded("Caso"), list: embedded("Caso"), historical: embedded("Caso"),
  },
  {
    entity: "Corrección / contención", module: "quality", route: null, klass: "A",
    detail: has("quality.action.detail"), list: has("quality.action.list"),
    historical: has("quality.action.detail"),
  },
  {
    entity: "Análisis de causa", module: "quality", route: null, klass: "D",
    detail: embedded("Caso"), list: embedded("Caso"), historical: embedded("Caso"),
  },
  {
    entity: "Plan de acciones", module: "quality", route: null, klass: "D",
    detail: embedded("Caso", "El plan es el conjunto de acciones del caso; cada acción tiene hoja propia."),
    list: has("quality.action.list"),
    historical: embedded("Caso"),
  },
  {
    entity: "Acción", module: "quality", route: null, klass: "C",
    detail: has("quality.action.detail"), list: has("quality.action.list"),
    historical: has("quality.action.detail"),
  },
  {
    entity: "Verificación de eficacia", module: "quality", route: null, klass: "D",
    detail: embedded("Acción"), list: embedded("Acción"), historical: embedded("Acción"),
  },
  {
    entity: "Mis tareas", module: "quality", route: "/quality/tasks", klass: "B",
    detail: na("Una tarea es un puntero al registro que hay que atender; el registro es el documentable."),
    list: has("quality.task.list"),
    historical: noHistory(
      "La bandeja es una vista del trabajo pendiente HOY para quien la mira: no es un registro versionado. Cada tarea remite al documento o al registro que la originó, y ese sí conserva su historia."),
  },

  // ------------------------------------- Quality · riesgos y oportunidades
  {
    entity: "Riesgo", module: "quality", route: "/quality/risks/[id]", klass: "C",
    detail: has("quality.risk.detail"), list: has("quality.risk.list"),
    historical: has("quality.risk-assessment.detail"),
  },
  {
    entity: "Oportunidad", module: "quality", route: "/quality/risks/opportunities/[id]", klass: "C",
    detail: has("quality.opportunity.detail"), list: has("quality.opportunity.list"),
    historical: embedded("Oportunidad", "Las evaluaciones y decisiones se imprimen dentro de la ficha."),
  },
  {
    entity: "Metodología", module: "quality", route: "/quality/risks/methodology", klass: "A",
    detail: has("quality.methodology.detail"),
    list: na(NO_LIST_SINGLETON),
    historical: has("quality.methodology-version.detail"),
  },
  {
    entity: "Versión de metodología", module: "quality", route: "/quality/risks/methodology", klass: "A",
    detail: has("quality.methodology-version.detail"),
    list: embedded("Metodología", "Las versiones se enumeran en la pantalla de metodología."),
    historical: has("quality.methodology-version.detail"),
  },
  {
    entity: "Escalas y bandas", module: "quality", route: null, klass: "D",
    detail: embedded("Versión de metodología"), list: embedded("Versión de metodología"),
    historical: embedded("Versión de metodología"),
  },
  {
    entity: "Matriz de riesgo", module: "quality", route: null, klass: "D",
    detail: embedded("Riesgo",
      "La matriz se dibuja con la versión de metodología que usó la evaluación: no es un objeto aparte."),
    list: embedded("Versión de metodología"),
    historical: embedded("Evaluación residual",
      "La matriz que acompaña a una evaluación se dibuja con la versión de metodología que esa evaluación usó."),
  },
  {
    entity: "Evaluación inherente", module: "quality", route: null, klass: "A",
    detail: has("quality.risk-assessment.detail"),
    list: embedded("Riesgo", "Las evaluaciones se imprimen dentro de la ficha del riesgo."),
    historical: has("quality.risk-assessment.detail"),
  },
  {
    entity: "Evaluación residual", module: "quality", route: null, klass: "A",
    detail: has("quality.risk-assessment.detail"),
    list: embedded("Riesgo"),
    historical: has("quality.risk-assessment.detail"),
  },
  {
    entity: "Control", module: "quality", route: null, klass: "C",
    detail: has("quality.control.detail"), list: has("quality.control.list"),
    historical: embedded("Control",
      "Las revisiones de eficacia se imprimen fechadas en la ficha del control; la eficacia usada en una evaluación concreta vive en el PDF de esa evaluación, con su snapshot."),
  },
  {
    entity: "Revisión de eficacia del control", module: "quality", route: null, klass: "D",
    detail: embedded("Control"), list: embedded("Control"), historical: embedded("Control"),
  },
  {
    entity: "Plan de tratamiento", module: "quality", route: null, klass: "D",
    detail: embedded("Riesgo"), list: embedded("Riesgo"), historical: embedded("Riesgo"),
  },
  {
    entity: "Materialización", module: "quality", route: null, klass: "D",
    detail: embedded("Riesgo"), list: embedded("Riesgo"), historical: embedded("Riesgo"),
  },
  {
    entity: "Señal de riesgo", module: "quality", route: null, klass: "E",
    detail: na("Sugiere mirar; no afirma nada. No es un objeto documentable."),
    list: na("Sugiere mirar; no afirma nada."),
    historical: na("Sugiere mirar; no afirma nada."),
  },

  // ------------------------------------------------------------ TrazaDocs
  {
    entity: "Documento TrazaDocs", module: "trazadocs", route: "/trazadocs/[id]", klass: "C",
    detail: has("trazadocs.document.detail"), list: has("trazadocs.master-list.list"),
    historical: embedded("Documento TrazaDocs",
      "El historial de revisiones se imprime dentro de la ficha del documento."),
  },
  {
    entity: "Maestro de documentos TrazaDocs", module: "trazadocs", route: "/trazadocs/master", klass: "B",
    detail: na(PROJECTION_NOT_ENTITY),
    list: has("trazadocs.master-list.list"),
    historical: noHistory("El maestro retrata qué documentos existen hoy y en qué estado están. La historia de cada documento vive en sus revisiones, que sí se descargan una por una."),
  },
  {
    entity: "Versión de documento TrazaDocs", module: "trazadocs", route: "/trazadocs/[id]/versions", klass: "D",
    detail: embedded("Documento TrazaDocs"), list: embedded("Documento TrazaDocs"),
    historical: embedded("Documento TrazaDocs"),
  },
  {
    entity: "Vista de impresión", module: "trazadocs", route: "/trazadocs/[id]/print", klass: "E",
    detail: na("Es una vista del navegador, no un registro. La descarga real la da la ficha del documento."),
    list: na(NAV_ONLY), historical: na(NAV_ONLY),
  },
  {
    entity: "Archivo documental", module: "trazadocs", route: "/trazadocs/files/[id]", klass: "E",
    detail: na("Es un archivo subido, no un registro compuesto: el original ES la prueba y aparece en el maestro."),
    list: embedded("Maestro de documentos TrazaDocs"),
    historical: na("El archivo no se versiona como contenido: se reemplaza y queda registrado en el maestro."),
  },

  // ------------------------------------------------------------------ PCR
  {
    entity: "Orden / corrida de producción", module: "cpr", route: "/traceability/production-orders/[id]", klass: "C",
    detail: has("cpr.production-order.detail"), list: has("cpr.production-order.list"),
    historical: embedded("Orden / corrida de producción",
      "La orden congela su estructura al cerrarse; su PDF imprime consumos y salidas tal como quedaron."),
  },
  {
    entity: "Lote de entrada", module: "cpr", route: "/traceability/input-batches", klass: "C",
    detail: has("cpr.input-batch.detail"), list: has("cpr.input-batch.list"),
    historical: embedded("Lote de entrada", "El lote conserva su fecha de recepción y su consumo acumulado."),
  },
  {
    entity: "Lote producido / lote final", module: "cpr", route: "/traceability/output-batches", klass: "C",
    detail: has("cpr.output-batch.detail"), list: has("cpr.output-batch.list"),
    historical: has("cpr.dossier.detail"),
  },
  {
    entity: "Consumo", module: "cpr", route: null, klass: "D",
    detail: embedded("Orden / corrida de producción"), list: embedded("Orden / corrida de producción"),
    historical: embedded("Expediente de auditoría"),
  },
  {
    entity: "Composición del lote", module: "cpr", route: null, klass: "D",
    detail: embedded("Contenido reciclado"), list: embedded("Contenido reciclado"),
    historical: embedded("Expediente de auditoría"),
  },
  {
    entity: "Genealogía", module: "cpr", route: "/traceability/genealogy", klass: "D",
    detail: embedded("Lote producido / lote final",
      "La cadena se imprime dentro del lote, con la misma consulta que alimenta la pantalla."),
    list: embedded("Lote producido / lote final"),
    historical: has("cpr.exercise.detail"),
  },
  {
    entity: "Producto", module: "cpr", route: "/catalog/products", klass: "C",
    detail: has("cpr.product.detail"), list: has("cpr.product.list"),
    historical: noHistory("El catálogo guarda el producto vigente: no conserva la serie de cambios de su porcentaje declarado ni de su familia. Cada cálculo sobre sus lotes sí queda fechado."),
  },
  {
    entity: "Material", module: "cpr", route: "/catalog/materials", klass: "C",
    detail: has("cpr.material.detail"), list: has("cpr.material.list"),
    historical: noHistory("El material guarda su clasificación VIGENTE y el soporte que la sostiene hoy: no conserva la serie de reclasificaciones anteriores. Qué clasificación se usó en un cálculo se lee en ese cálculo."),
  },
  {
    entity: "Proveedor", module: "cpr", route: "/catalog/suppliers", klass: "C",
    detail: has("cpr.supplier.detail"), list: has("cpr.supplier.list"),
    historical: noHistory("El proveedor guarda sus datos VIGENTES: no conserva versiones anteriores de su identificación ni de su contacto. Cada lote recibido de él sí queda fechado."),
  },
  {
    entity: "Familia de producto", module: "cpr", route: "/catalog/families", klass: "B",
    detail: embedded("Producto", LIST_ONLY_NO_SHEET), list: has("cpr.family.list"),
    historical: noHistory("El catálogo guarda la familia vigente: no conserva versiones anteriores de su nombre ni de los productos que agrupaba en una fecha pasada."),
  },
  {
    entity: "Requisito de cliente", module: "cpr", route: "/catalog/customer-requirements", klass: "B",
    detail: embedded("Requisitos de cliente", LIST_ONLY_NO_SHEET),
    list: has("cpr.customer-requirement.list"),
    historical: noHistory("El requisito guarda su vigencia declarada (desde y hasta): no conserva un historial de redacciones anteriores del texto acordado con el cliente."),
  },
  {
    entity: "Contenido reciclado", module: "cpr", route: "/recycled-content/output-batches/[id]", klass: "C",
    detail: has("cpr.recycled-content.detail"), list: has("cpr.recycled-content.list"),
    historical: noHistory(
      "El cálculo guarda su fecha, su resultado y sus componentes, pero el dominio no conserva una versión temporal de la metodología con la que se hizo. El expediente de auditoría sí congela ese contexto."),
  },
  {
    entity: "Reporte de contenido reciclado", module: "cpr", route: "/recycled-content/reports", klass: "B",
    detail: embedded("Contenido reciclado", PROJECTION_NOT_ENTITY),
    list: has("cpr.recycled-content.list"),
    historical: noHistory("Cada fila trae el ÚLTIMO cálculo de su lote: el reporte no conserva la serie de cálculos anteriores ni los supuestos que regían en cada uno."),
  },
  {
    entity: "Cálculo de soporte", module: "cpr", route: "/audit-support/calculations/[id]", klass: "A",
    detail: has("cpr.support-calculation.detail"),
    list: embedded("Reporte de contenido reciclado"),
    historical: noHistory(
      "El dossier de soporte se arma leyendo el estado actual de las evidencias y de la cadena. Congelarlo es exactamente lo que hace el expediente de auditoría."),
  },
  {
    entity: "Matriz de evidencias", module: "cpr", route: "/audit-support/output-batches/[id]/evidence-matrix", klass: "A",
    detail: has("cpr.evidence-matrix.detail"),
    list: embedded("Evidencias"),
    historical: noHistory("La matriz se calcula con el estado de gobernanza vigente de cada evidencia."),
  },
  {
    entity: "Expediente de auditoría", module: "cpr", route: "/audit-prep/dossiers/[id]", klass: "C",
    detail: has("cpr.dossier.detail"), list: has("cpr.dossier.list"),
    historical: has("cpr.dossier.detail"),
  },
  {
    entity: "Ejercicio de trazabilidad", module: "cpr", route: "/audit-prep/exercises/[id]", klass: "C",
    detail: has("cpr.exercise.detail"), list: has("cpr.exercise.list"),
    historical: has("cpr.exercise.detail"),
  },
  {
    entity: "Evidencia", module: "cpr", route: "/evidences", klass: "B",
    detail: embedded("Evidencias",
      "El archivo original ES la prueba; la ficha de gobernanza cabe en la fila del listado y en la matriz."),
    list: has("cpr.evidence.list"),
    historical: noHistory("La evidencia guarda su estado de gobernanza VIGENTE con sus fechas de revisión y archivado: no conserva la serie de estados por los que pasó antes."),
  },
  {
    entity: "Diagnóstico", module: "cpr", route: "/diagnostic", klass: "A",
    detail: has("cpr.diagnostic.detail"),
    list: na(NO_LIST_SINGLETON),
    historical: noHistory(
      "El diagnóstico guarda una fila por empresa con su avance: no conserva las respuestas de una autoevaluación anterior ni el cuestionario que regía entonces."),
  },
  {
    entity: "Importación", module: "cpr", route: "/imports/[id]", klass: "E",
    detail: na("Es un proceso técnico de carga, no un registro de negocio."),
    list: na("Es un proceso técnico de carga."), historical: na("Es un proceso técnico de carga."),
  },
  {
    entity: "Flujo guiado", module: "cpr", route: "/guided-flow", klass: "E",
    detail: na(NAV_ONLY), list: na(NAV_ONLY), historical: na(NAV_ONLY),
  },
  {
    entity: "Panel PCR", module: "cpr", route: "/dashboard", klass: "E",
    detail: na("Agrega lo que ya se exporta por separado."),
    list: na("Agrega lo que ya se exporta por separado."),
    historical: na("Agrega lo que ya se exporta por separado."),
  },
  {
    entity: "Onboarding", module: "cpr", route: "/onboarding", klass: "E",
    detail: na(NAV_ONLY), list: na(NAV_ONLY), historical: na(NAV_ONLY),
  },

  // ------------------------------------------------------------- Textiles
  {
    entity: "Producto textil", module: "textiles", route: "/textiles/products/[id]", klass: "C",
    detail: has("textiles.product.detail"), list: has("textiles.product.list"),
    historical: noHistory("El producto guarda su ficha vigente: no conserva versiones anteriores de su categoría ni de sus referencias. El pasaporte técnico sí congela un snapshot de la referencia."),
  },
  {
    entity: "Referencia", module: "textiles", route: "/textiles/references/[id]", klass: "C",
    detail: has("textiles.reference.detail"),
    list: embedded("Producto textil", "Las referencias se enumeran dentro de la ficha del producto."),
    historical: has("textiles.passport.detail"),
  },
  {
    entity: "Colección", module: "textiles", route: "/textiles/products/collections", klass: "B",
    detail: embedded("Colecciones", LIST_ONLY_NO_SHEET), list: has("textiles.collection.list"),
    historical: noHistory("El catálogo guarda la colección vigente: no conserva versiones anteriores de su temporada, su estado ni las referencias que agrupaba antes."),
  },
  {
    entity: "Orden / corrida de producción textil", module: "textiles", route: "/textiles/traceability/orders/[id]", klass: "C",
    detail: has("textiles.production-order.detail"), list: has("textiles.production-order.list"),
    historical: embedded("Orden / corrida de producción textil", "La orden conserva sus fechas reales y sus etapas."),
  },
  {
    entity: "Lote producido textil", module: "textiles", route: "/textiles/traceability/output-lots/[id]", klass: "C",
    detail: has("textiles.output-lot.detail"), list: has("textiles.output-lot.list"),
    historical: has("textiles.passport.detail"),
  },
  {
    entity: "Lote de entrada textil", module: "textiles", route: "/textiles/traceability/input-lots", klass: "C",
    detail: has("textiles.input-lot.detail"), list: has("textiles.input-lot.list"),
    historical: noHistory("El lote guarda su fecha de recepción y su balance ACUMULADO: el dominio no conserva una serie temporal de saldos que permita reconstruir cuánto quedaba en una fecha pasada."),
  },
  {
    entity: "Consumo textil", module: "textiles", route: null, klass: "D",
    detail: embedded("Orden / corrida de producción textil"), list: embedded("Orden / corrida de producción textil"),
    historical: embedded("Pasaporte técnico"),
  },
  {
    entity: "Etapa de proceso", module: "textiles", route: null, klass: "D",
    detail: embedded("Orden / corrida de producción textil"), list: embedded("Orden / corrida de producción textil"),
    historical: embedded("Pasaporte técnico"),
  },
  {
    entity: "Proveedor textil", module: "textiles", route: "/textiles/catalogs/suppliers", klass: "B",
    detail: embedded("Proveedores textiles", LIST_ONLY_NO_SHEET), list: has("textiles.supplier.list"),
    historical: noHistory("El catálogo guarda el proveedor vigente: no conserva versiones anteriores de sus datos de contacto ni de su alcance declarado."),
  },
  {
    entity: "Evidencia textil", module: "textiles", route: "/textiles/evidences/[id]", klass: "C",
    detail: has("textiles.evidence.detail"), list: has("textiles.evidence.list"),
    historical: noHistory("La evidencia guarda su estado de gobernanza VIGENTE: no conserva la serie de estados por los que pasó. El archivo original sigue siendo la prueba y no se reproduce en el PDF."),
  },
  {
    entity: "Fibra", module: "textiles", route: "/textiles/catalogs/fibers", klass: "B",
    detail: embedded("Fibras", LIST_ONLY_NO_SHEET), list: has("textiles.fiber.list"),
    historical: noHistory("El catálogo base es global y guarda la fibra vigente: no conserva versiones anteriores de su familia ni de sus atributos declarados."),
  },
  {
    entity: "Material textil", module: "textiles", route: "/textiles/catalogs/materials", klass: "B",
    detail: embedded("Materiales textiles", LIST_ONLY_NO_SHEET), list: has("textiles.material.list"),
    historical: noHistory("El catálogo guarda el material vigente: no conserva versiones anteriores de su composición declarada ni de su proveedor."),
  },
  {
    entity: "Componente", module: "textiles", route: "/textiles/catalogs/components", klass: "B",
    detail: embedded("Componentes", LIST_ONLY_NO_SHEET), list: has("textiles.component.list"),
    historical: noHistory("El catálogo guarda el componente vigente: no conserva versiones anteriores de su separabilidad ni de su proveedor."),
  },
  {
    entity: "Proceso textil", module: "textiles", route: "/textiles/catalogs/processes", klass: "B",
    detail: embedded("Procesos textiles", LIST_ONLY_NO_SHEET), list: has("textiles.process.list"),
    historical: noHistory("El catálogo guarda el proceso vigente: no conserva versiones anteriores de su riesgo de trazabilidad ni de los registros que se esperaban antes."),
  },
  {
    entity: "Proceso tercerizado", module: "textiles", route: "/textiles/catalogs/outsourced-processes", klass: "B",
    detail: embedded("Procesos tercerizados", LIST_ONLY_NO_SHEET), list: has("textiles.outsourced-process.list"),
    historical: noHistory("El catálogo guarda el proceso tercerizado vigente: no conserva versiones anteriores de su proveedor ni de su riesgo declarado."),
  },
  {
    entity: "Evaluación de circularidad", module: "textiles", route: "/textiles/circularity/assessments/[id]", klass: "C",
    detail: has("textiles.circularity.detail"), list: has("textiles.circularity.list"),
    historical: noHistory(
      "La evaluación guarda su fecha, su puntaje y sus respuestas, pero apunta a la metodología ACTIVA, no a una copia congelada de sus criterios."),
  },
  {
    entity: "Pasaporte técnico", module: "textiles", route: "/textiles/passports/[id]", klass: "C",
    detail: has("textiles.passport.detail"), list: has("textiles.passport.list"),
    historical: has("textiles.passport.detail"),
  },
  {
    entity: "Documento TrazaDocs textil", module: "textiles", route: "/textiles/trazadocs/[id]", klass: "C",
    detail: has("textiles.document.detail"), list: has("textiles.master-list.list"),
    historical: embedded("Documento TrazaDocs textil",
      "El historial de revisiones se imprime dentro de la ficha del documento."),
  },
  {
    entity: "Diagnóstico textil", module: "textiles", route: "/textiles/diagnostic/results", klass: "A",
    detail: has("textiles.diagnostic.detail"),
    list: na(NO_LIST_SINGLETON),
    historical: noHistory(
      "El diagnóstico textil guarda una fila por empresa con su avance: no conserva las respuestas de una autoevaluación anterior."),
  },

  // ---------------------------------------------- Transversal y backoffice
  {
    entity: "Perfil de la persona", module: "core", route: "/settings/profile", klass: "E",
    detail: na("Son datos de la persona que usa Trazaloop, no un registro del sistema de gestión de la empresa."),
    list: na("Son datos de la persona que usa Trazaloop, no un registro de la empresa."),
    historical: na("Son datos de la persona que usa Trazaloop, no un registro de la empresa."),
  },
  {
    entity: "Selector de módulos", module: "core", route: "/modules", klass: "E",
    detail: na(NAV_ONLY), list: na(NAV_ONLY), historical: na(NAV_ONLY),
  },
  {
    entity: "Selector de empresa", module: "core", route: "/select-org", klass: "E",
    detail: na(NAV_ONLY), list: na(NAV_ONLY), historical: na(NAV_ONLY),
  },
  {
    entity: "Ticket de soporte", module: "core", route: "/support/[id]", klass: "C",
    detail: has("core.support-ticket.detail"), list: has("core.support-ticket.list"),
    historical: has("core.support-ticket.detail"),
  },
  {
    entity: "Empresa (backoffice de plataforma)", module: "core", route: "/platform/organizations/[id]", klass: "E",
    detail: na(PLATFORM_SCOPE), list: na(PLATFORM_SCOPE), historical: na(PLATFORM_SCOPE),
  },
  {
    entity: "Soporte (plataforma)", module: "core", route: "/platform/support/[id]", klass: "E",
    detail: na(PLATFORM_SCOPE), list: na(PLATFORM_SCOPE), historical: na(PLATFORM_SCOPE),
  },
  {
    entity: "Plantillas TrazaDocs (plataforma)", module: "core", route: "/platform/trazadocs/[id]", klass: "E",
    detail: na(PLATFORM_SCOPE), list: na(PLATFORM_SCOPE), historical: na(PLATFORM_SCOPE),
  },
  {
    entity: "Implementación / feedback", module: "cpr", route: "/implementation", klass: "E",
    detail: na("Herramienta interna de seguimiento del acompañamiento, no un objeto del sistema de gestión."),
    list: na("Herramienta interna de seguimiento."),
    historical: na("Herramienta interna de seguimiento."),
  },
];

/** Cuenta cuántas filas hay en cada estado, por eje. */
export function inventoryCounts(): Record<AxisState["state"], number> {
  const out = {
    AVAILABLE: 0, EMBEDDED: 0, NOT_APPLICABLE: 0, HISTORICAL_NOT_SUPPORTED: 0,
  };
  for (const row of EXPORT_INVENTORY) {
    for (const axis of [row.detail, row.list, row.historical]) out[axis.state] += 1;
  }
  return out;
}

/** Todas las claves que el inventario promete. */
export function promisedKeys(): string[] {
  const keys = new Set<string>();
  for (const row of EXPORT_INVENTORY) {
    for (const axis of [row.detail, row.list, row.historical]) {
      if (axis.state === "AVAILABLE") keys.add(axis.key);
    }
  }
  return [...keys].sort();
}
