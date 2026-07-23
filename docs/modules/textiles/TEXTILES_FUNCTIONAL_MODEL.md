# Trazaloop Textil · Modelo funcional de plataforma

> Sprint T0 — Solo documentación. No crea rutas, UI ni migraciones.
> **Actualización T0.2**: Textil es un módulo de la plataforma Trazaloop (DL-16);
> su acceso será gestionable por módulo (`TRAZALOOP_MODULE_ACCESS_MODEL.md`). Los
> módulos internos de este documento son submódulos funcionales de Trazaloop Textil.

## 1. Objetivo

Definir los módulos internos de Trazaloop Textil: propósito, usuario principal,
entradas, salidas, soporte normativo, relaciones, vistas sugeridas, datos mínimos,
riesgos y límites de MVP, como mapa funcional para los sprints T1–T11.

## 2. Alcance

Cubre los 20 módulos internos del módulo Textil. No detalla modelo de datos
(ver `TEXTILES_DATA_MODEL_PROPOSAL.md`) ni sprints (ver
`TEXTILES_IMPLEMENTATION_ROADMAP.md`).

## 3. Mapa de módulos y navegación sugerida

Rutas bajo `/textiles/...` (namespace propio; ver decisión D-02 en
`TEXTILES_TECHNICAL_DECISIONS.md`):

```
/textiles/dashboard          /textiles/orders
/textiles/diagnostic         /textiles/batches
/textiles/products           /textiles/processes
/textiles/collections        /textiles/evidences
/textiles/references         /textiles/circularity
/textiles/materials          /textiles/passports
/textiles/composition        /textiles/gaps
/textiles/suppliers          /textiles/reports
/textiles/trazadocs          /textiles/trazadocs/master
/textiles/settings
```

Se reutilizan sin duplicar: `/support`, `/team`, `/settings` de cuenta, `/legal`,
`/modules` (portal), consola `/platform`.

## 4. Módulos internos

Formato: propósito · usuario principal · entradas → salidas · normas · relaciones ·
vistas · datos mínimos · riesgos · qué NO hace en MVP.

### 4.1 Dashboard Textil
- **Propósito**: vista de estado del módulo: avance de diagnóstico, conteos (productos,
  referencias, proveedores, evidencias), pasaportes por estado, brechas abiertas.
- **Usuario**: administrador de empresa; supervisor/calidad.
- **Entradas → salidas**: datos agregados de los demás módulos → tarjetas e indicadores.
- **Normas**: ISO 59020 (indicadores de desempeño como referencia de medición).
- **Relaciones**: lee de todos los módulos; enlaza a brechas y diagnóstico.
- **Vistas**: tarjetas de conteo, "siguiente paso sugerido" (patrón onboarding CPR).
- **Datos mínimos**: conteos por organización y estado.
- **Riesgos**: convertirse en dashboard decorativo; debe priorizar acciones.
- **No hace en MVP**: gráficas históricas, comparativas entre empresas, exportes.

### 4.2 Diagnóstico Textil
- **Propósito**: evaluar madurez inicial en trazabilidad, composición, evidencias,
  proveedores, circularidad, control documental y preparación de pasaporte.
- **Usuario**: administrador; consultor (diligencia), supervisor (revisa).
- **Entradas → salidas**: respuestas Sí/Parcial/No/No aplica → nivel de madurez,
  brechas y recomendaciones.
- **Normas**: ISO 22095, ISO 5157, ISO 14021, ISO 59020, ISO 3758; ESPR como contexto.
- **Relaciones**: alimenta dashboard y matriz de brechas; sugiere documentos TrazaDocs.
- **Vistas**: wizard por dimensiones (patrón `components/domain/diagnostic/wizard.tsx`),
  resultado con niveles y recomendaciones.
- **Datos mínimos**: catálogo global de dimensiones/preguntas; respuestas por org.
- **Riesgos**: copiar preguntas CPR; el detalle propio está en
  `TEXTILES_DIAGNOSTIC_MODEL.md`.
- **No hace en MVP**: recomendaciones automáticas avanzadas, comparativas sectoriales.

### 4.3 Productos textiles
- **Propósito**: registrar el producto textil terminado (prenda, uniforme, artículo).
- **Usuario**: administrador; consultor.
- **Entradas → salidas**: datos básicos, categoría, colección → producto con estado y
  ficha consultable.
- **Normas**: ESPR/DPP (identificación de producto); ISO 5157 (vocabulario).
- **Relaciones**: agrupa referencias; base de composición, circularidad y pasaporte.
- **Vistas**: listado con filtros, detalle con pestañas (composición, componentes,
  evidencias, circularidad, pasaportes).
- **Datos mínimos**: código, nombre, categoría, colección, estado.
- **Riesgos**: confundir producto con referencia/variante (pregunta abierta Q-01).
- **No hace en MVP**: variantes talla/color completas, fotos de catálogo comercial.

### 4.4 Colecciones / líneas
- **Propósito**: agrupar productos por colección, línea, temporada o cliente.
- **Usuario**: administrador.
- **Entradas → salidas**: código, nombre, temporada → agrupador navegable.
- **Normas**: ESPR (agrupación para gestión de información de producto).
- **Relaciones**: productos y referencias pertenecen a una colección (opcional).
- **Datos mínimos**: código, nombre; temporada y fecha de lanzamiento opcionales.
- **Riesgos**: sobre-modelar jerarquías; una sola capa de agrupación en MVP.
- **No hace en MVP**: jerarquías anidadas, ciclos de vida de colección.

### 4.5 Referencias / SKU
- **Propósito**: unidad comercial-técnica del producto (referencia con su ficha).
- **Usuario**: administrador; consultor.
- **Entradas → salidas**: código de referencia, versión de ficha → referencia trazable.
- **Normas**: ESPR/DPP (identificador de producto); GS1 Digital Link como referencia
  futura de identificación.
- **Relaciones**: pertenece a producto; las órdenes y pasaportes pueden apuntar a
  referencia.
- **Datos mínimos**: código único por organización, producto padre, estado.
- **Riesgos**: duplicidad producto/referencia; resolver en Q-01 antes de T3.
- **No hace en MVP**: matriz completa talla×color (se registra como atributo simple).

### 4.6 Materiales e insumos
- **Propósito**: catálogo de telas, hilos, forros, entretelas, insumos no textiles y
  empaques usados en confección.
- **Usuario**: administrador; consultor.
- **Entradas → salidas**: tipo de material, proveedor, resumen de composición →
  catálogo reutilizable en componentes y lotes.
- **Normas**: ISO 2076 (nombres genéricos de fibras manufacturadas); ISO 22095.
- **Relaciones**: proveedor, composición de fibras, componentes, lotes de entrada,
  evidencias.
- **Datos mínimos**: nombre, tipo, proveedor principal, composición declarada.
- **Riesgos**: mezclar material (catálogo) con lote (entrada física); son entidades
  distintas.
- **No hace en MVP**: costos, inventario, consumo por unidad.

### 4.7 Composición de fibras
- **Propósito**: desglose porcentual de fibras por material o por producto/referencia
  (tela principal, secundaria, forro), con evidencia asociada.
- **Usuario**: administrador; supervisor valida.
- **Entradas → salidas**: fibra (catálogo estandarizado), porcentaje, dueño
  (material/producto/componente) → composición sumando 100 % con alertas.
- **Normas**: ISO 2076 (nombres genéricos), serie ISO 1833 (análisis cuantitativo como
  evidencia posible), ISO 14021 (si la composición soporta claims).
- **Relaciones**: base de monomaterialidad, reciclabilidad potencial y pasaporte.
- **Vistas**: editor de composición con validación de suma y semáforo de evidencia.
- **Datos mínimos**: fibra, porcentaje, dueño, evidencia (opcional pero recomendada).
- **Riesgos**: composiciones sin evidencia presentadas como verificadas; siempre
  distinguir "declarada" vs "con evidencia".
- **No hace en MVP**: cálculo automático desde ensayos, tolerancias normativas.

### 4.8 Proveedores
- **Propósito**: registrar proveedores de telas, avíos, procesos tercerizados y
  empaques, con documentos asociados.
- **Usuario**: administrador; consultor.
- **Entradas → salidas**: identificación, país, tipo → proveedor vinculable a
  materiales, lotes y evidencias.
- **Normas**: ISO 22095 (actores de la cadena de custodia).
- **Relaciones**: materiales, lotes de entrada, procesos tercerizados, evidencias
  (certificados GRS/RCS/OCS/GOTS/OEKO-TEX del proveedor cuando existan).
- **Datos mínimos**: nombre, tipo de proveedor, país.
- **Riesgos**: prometer "proveedor certificado" sin evidencia vigente; el estado lo da
  la evidencia, no el registro.
- **No hace en MVP**: evaluación/scoring de proveedores, portales de proveedor.

### 4.9 Órdenes de confección
- **Propósito**: registrar la orden de producción que conecta referencia, cantidad y
  ruta de procesos.
- **Usuario**: administrador; consultor.
- **Entradas → salidas**: producto/referencia, cantidad planeada, ruta → orden en
  estados (borrador/en proceso/cerrada).
- **Normas**: ISO 22095 (unidad de seguimiento); GS1 EPCIS como referencia futura de
  eventos.
- **Relaciones**: consume lotes de entrada, genera lotes de salida, agrupa procesos.
- **Datos mínimos**: código, producto/referencia, cantidad, estado.
- **Riesgos**: exigir granularidad industrial que la pyme no tiene; mantener simple.
- **No hace en MVP**: planeación de producción, capacidades, costos.

### 4.10 Lotes confeccionados
- **Propósito**: lote de salida/producto terminado asociado a una orden.
- **Usuario**: administrador; consultor.
- **Entradas → salidas**: orden, código de lote, cantidad → lote trazable y
  pasaporteable.
- **Normas**: ISO 22095.
- **Relaciones**: origen de pasaportes por lote; destino de vínculos de trazabilidad.
- **Datos mínimos**: código, orden, producto/referencia, cantidad.
- **Riesgos**: confusión con "lote de salida" plástico de CPR; naming propio
  (`textile_output_batches`).
- **No hace en MVP**: trazabilidad prenda a prenda (unidad individual).

### 4.11 Procesos
- **Propósito**: catálogo de procesos de confección: corte, confección, lavado,
  estampación, bordado, acabado, empaque.
- **Usuario**: administrador.
- **Normas**: ISO 22095 (pasos de transformación en la cadena).
- **Relaciones**: rutas de órdenes; procesos tercerizados referencian este catálogo.
- **Datos mínimos**: código, nombre, interno/tercerizado por defecto.
- **Riesgos**: sobre-modelar rutas; en MVP la ruta es una lista ordenada simple.
- **No hace en MVP**: tiempos, costos, control de piso.

### 4.12 Procesos tercerizados
- **Propósito**: registrar qué procesos se ejecutan con terceros (maquila, lavandería,
  estampación externa) y con qué proveedor, dejando rastro documental.
- **Usuario**: administrador; consultor.
- **Normas**: ISO 22095 (custodia al cambiar de actor).
- **Relaciones**: proveedor (tipo servicio), orden, evidencias (remisiones, actas).
- **Datos mínimos**: orden, proceso, proveedor, fechas, evidencia opcional.
- **Riesgos**: puntos ciegos de trazabilidad; el módulo los marca como brecha, no los
  inventa.
- **No hace en MVP**: intercambio de datos con el tercero.

### 4.13 Evidencias
- **Propósito**: cargar y asociar fichas técnicas, certificados de esquemas externos,
  declaraciones de proveedor, facturas, resultados de ensayo y fotos, con estado y
  vigencia.
- **Usuario**: consultor carga; supervisor/calidad valida; administrador gestiona.
- **Entradas → salidas**: archivo + metadatos → evidencia con estado
  (pendiente/válida/rechazada/vencida) vinculable a múltiples objetivos.
- **Normas**: ISO 22095 (soporte de trazabilidad), ISO 14021 (soporte de claims);
  GRS/RCS, OCS/GOTS, OEKO-TEX como tipos de certificado externo que se archivan.
- **Relaciones**: transversal — productos, materiales, proveedores, lotes,
  composiciones, claims, evaluaciones y pasaporte.
- **Datos mínimos**: nombre, tipo, archivo, estado, vigencia.
- **Riesgos**: tratar una evidencia cargada como verificada; la validación es interna
  (supervisor) y así se declara.
- **No hace en MVP**: verificación automática, OCR, firma electrónica.

### 4.14 Evaluación de circularidad
- **Propósito**: matriz de reparabilidad, reutilización, reciclabilidad potencial,
  monomaterialidad, dificultad de reciclaje, cuidado y separación, con índice interno
  de preparación circular.
- **Usuario**: administrador/supervisor evalúan; consultor prepara.
- **Normas**: ISO 5157, ISO 59020 (con ISO 59004/59010 como principios), ISO 14021,
  ISO 3758/6330; ESPR y estrategia textil UE como contexto.
- **Relaciones**: consume composición, componentes y evidencias; alimenta pasaporte y
  brechas. Detalle completo en `TEXTILES_CIRCULARITY_ASSESSMENT_MODEL.md`.
- **No hace en MVP**: ACV, huella de carbono, claims automáticos.

### 4.15 Pasaporte técnico textil
- **Propósito**: salida principal: documento/vista consolidada por
  producto/referencia/lote con identificación, composición, cadena de suministro,
  evidencias, circularidad, claims y brechas; snapshot versionado.
- **Normas**: ESPR/DPP (contexto), ISO 22095, ISO 14021; GS1 Digital Link/EPCIS como
  referencia futura. Detalle en `TEXTILES_MATERIAL_PASSPORT_MODEL.md`.
- **No hace en MVP**: QR público, PDF server-side, DPP oficial.

### 4.16 Brechas de información
- **Propósito**: matriz de datos faltantes y evidencia insuficiente por
  producto/referencia (composición sin evidencia, proveedor sin documentos, proceso
  tercerizado sin rastro, claim sin soporte).
- **Normas**: ISO 59020 (medición basada en datos disponibles), ISO 14021 (claims
  basados en evidencia).
- **Relaciones**: se calcula desde composición, evidencias, trazabilidad y
  circularidad; aparece en dashboard y pasaporte.
- **Riesgos**: listas de brechas paralizantes; priorizar por criticidad.
- **No hace en MVP**: planes de acción/acciones correctivas.

### 4.17 Reportes
- **Propósito**: vistas imprimibles/exportables básicas: listado de productos con
  estado de información, matriz de evidencias, resumen de diagnóstico.
- **Normas**: ISO 22095/14021 (contenido reportable), patrón de vistas de impresión
  CPR (`(print)/audit-support`).
- **No hace en MVP**: exportes masivos programados, API de reportes.

### 4.18 TrazaDocs Textil
- **Propósito**: documentos vivos del sector textil (manual de trazabilidad,
  procedimientos, instructivos) con estructuras sugeridas gestionadas por superadmin,
  estados y versionamiento. Detalle en `TEXTILES_TRAZADOCS_MODEL.md`.
- **Normas**: ISO 22095 e ISO 5157 como base documental y terminológica.
- **No hace en MVP**: mezcla con documentos CPR (prohibido), export PDF server-side.

### 4.19 Maestro documental Textil
- **Propósito**: vista única de documentos vivos + documentos descargables
  (archivos controlados) del módulo Textil, con categorías, estados y export CSV,
  siguiendo el patrón de `trazadoc_file_documents` + maestro CPR pero filtrado por
  módulo.
- **Normas**: control documental como buena práctica de soporte a ISO 22095;
  sin promesa de conformidad ISO 9001.
- **No hace en MVP**: flujos de distribución/lectura confirmada.

### 4.20 Configuración del módulo
- **Propósito**: preferencias del módulo Textil por organización (p. ej. unidad
  principal de trazabilidad, categorías de producto propias, política de aprobación de
  documentos por supervisor).
- **Usuario**: administrador.
- **Riesgos**: proliferación de flags; mínimo necesario en MVP.
- **No hace en MVP**: personalización de scoring o de estructura de pasaporte.

## 5. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica en Trazaloop Textil | Qué NO debe prometer la plataforma |
|---|---|---|---|
| Diagnóstico | ISO 22095, ISO 5157, ISO 14021, ISO 59020, ISO 3758 | Dimensiones y preguntas alineadas a trazabilidad, vocabulario, claims, circularidad y cuidado. | No promete que un nivel "Alto" implique conformidad con norma alguna. |
| Catálogos (productos, referencias, materiales, fibras) | ISO 2076; ISO 22095; ESPR | Identificación consistente de objetos de trazabilidad y fibras con nombres genéricos estandarizados. | No promete que el nombre de fibra registrado sustituya análisis de laboratorio. |
| Composición | ISO 2076, ISO 1833, ISO 14021 | Registro porcentual con evidencia; distinción declarada vs evidenciada. | No promete exactitud analítica ni etiquetado legal de composición. |
| Trazabilidad órdenes/lotes | ISO 22095; GS1 EPCIS (futuro) | Vínculos insumo → proceso → lote de salida como cadena de custodia documental. | No promete trazabilidad física verificada ni eventos EPCIS reales en MVP. |
| Evidencias | ISO 22095, ISO 14021; esquemas GRS/RCS/OCS/GOTS/OEKO-TEX | Archivo y estado de documentos, incluidos certificados de esquemas externos. | No promete validez de certificados de terceros ni emite certificados. |
| Circularidad | ISO 5157, ISO 59020 (59004/59010), ISO 14021, ESPR | Matriz de preparación con índice interno y advertencia. | No promete "producto reciclable/ certificado" ni resultados de ACV. |
| Cuidado y separación | ISO 3758, ISO 6330; ESPR/estrategia textil | Registro de recomendaciones/símbolos y de instrucciones de separación. | No promete etiquetas de cuidado legalmente válidas por jurisdicción. |
| Pasaporte técnico | ESPR/DPP, ISO 22095, ISO 14021; GS1 futuro | Consolidado versionado con advertencia de no certificación. | No promete el DPP oficial de la UE ni cumplimiento del ESPR. |
| TrazaDocs / maestro | ISO 22095, ISO 5157 (base documental) | Documentos vivos y archivos controlados por módulo. | No promete sistema de gestión certificado (p. ej. ISO 9001). |

## 6. Riesgos generales del modelo funcional

1. Ambigüedad producto vs referencia (bloqueante — Q-01).
2. Sobrecarga de captura para pymes: el flujo debe permitir avanzar con datos parciales
   y mostrar brechas, no bloquear.
3. Dependencias circulares entre módulos (composición ↔ componentes ↔ circularidad):
   resolver con orden de captura sugerido en onboarding textil.

## 7. Criterios de aceptación

- [ ] Los 20 módulos tienen propósito, usuario, E/S, normas, relaciones y límite MVP.
- [ ] Ningún módulo duplica infraestructura transversal existente (soporte, equipo,
  legal, planes).
- [ ] Ningún módulo promete certificación o cumplimiento.

## 8. Próximos pasos

1. Resolver Q-01 (unidad principal) antes de diseñar UI de T3/T4.
2. Derivar el backlog de T1–T11 desde este mapa (ver roadmap).
