# Trazaloop Textil · Sprint T9.0 — Arquitectura del pasaporte técnico textil

> **Sprint documental y arquitectónico.** No implementa código, migraciones,
> rutas, server actions ni UI, y no toca CPR. Deja diseñado el pasaporte
> técnico textil para su implementación en T9A/T9B/T9C. Los nombres de tablas,
> vistas, estados, `entity_type` y `link_type` citados en estos documentos
> fueron verificados contra las migraciones reales 0070–0083.

Este documento es el índice y el resumen ejecutivo de la arquitectura. El
detalle vive en los documentos hermanos de `docs/modules/textiles/`:

| # | Documento | Contenido |
|---|---|---|
| 1 | **TEXTILES_T9_0_TECHNICAL_PASSPORT_ARCHITECTURE.md** (este) | Índice, decisiones, resumen |
| 2 | TEXTILES_PASSPORT_DATA_MODEL_PROPOSAL.md | Tablas propuestas para T9A |
| 3 | TEXTILES_PASSPORT_SECTION_MODEL.md | Las 14 secciones del pasaporte |
| 4 | TEXTILES_PASSPORT_SOURCE_DATA_MAPPING.md | Mapeo sección → tablas/vistas reales |
| 5 | TEXTILES_PASSPORT_SNAPSHOT_AND_VERSIONING_MODEL.md | Snapshot, `source_hash`, versiones |
| 6 | TEXTILES_PASSPORT_SECURITY_AND_RLS_MODEL.md | RLS, triggers, protección de snapshot |
| 7 | TEXTILES_PASSPORT_NORMATIVE_PREPARATION_MATRIX.md | Matriz de preparación (no cumplimiento) |
| 8 | TEXTILES_PASSPORT_GAPS_AND_WARNINGS_MODEL.md | Catálogo de brechas y severidades |
| 9 | TEXTILES_PASSPORT_UI_FLOW_PROPOSAL.md | Rutas y flujo para T9B/T9C |
| 10 | TEXTILES_T9A_READY_PROMPT.md | Prompt listo para ejecutar T9A |

## 1. Qué es (y qué no es) el pasaporte técnico textil

**Es** una herramienta interna que reúne, organiza y presenta —en un momento
dado— la información técnica de una **referencia/SKU** textil y, opcionalmente,
de un **lote producido/final**, tomada de los módulos ya implementados
(catálogos, productos/referencias/composición, evidencias, trazabilidad,
circularidad y TrazaDocs Textil). Sirve para preparar revisiones técnicas,
auditorías, sellos, normas y exigencias futuras de transparencia, y para
visualizar brechas.

**No es** un pasaporte digital de producto oficial, ni una certificación, sello
o declaración regulatoria. No promete cumplimiento ni reemplaza una auditoría.
El nombre principal en producto es **"Pasaporte técnico textil"** (alternativo:
"Pasaporte técnico de materiales textiles"). Nunca "DPP oficial", "pasaporte
regulatorio", "pasaporte certificado" ni "Digital Product Passport oficial".

Texto de advertencia obligatorio, presente en cada pasaporte generado:

> "Este pasaporte técnico textil es una herramienta interna de preparación
> documental y trazabilidad. No equivale a certificación, sello, declaración
> regulatoria oficial ni pasaporte digital de producto oficial."

## 2. Decisiones arquitectónicas (posición tomada)

Las 12 decisiones que el encargo §17 pide resolver, con su posición. El
razonamiento extendido está en los documentos referenciados.

1. **¿Snapshot o vista viva? → SNAPSHOT.** El pasaporte congela los datos al
   momento de generación en `snapshot_json` (servidor). Una vista viva perdería
   el valor probatorio: si mañana cambia una evidencia o la composición, el
   pasaporte emitido hoy debe seguir mostrando lo que existía hoy. Se
   complementa con navegación viva por enlaces (§10) para el trabajo diario,
   pero la fuente de verdad histórica es el snapshot. (Doc 5.)
2. **¿Por referencia o por lote? → AMBOS; el lote es OPCIONAL.** El eje siempre
   es una `reference_id`; `output_lot_id` es nullable y, cuando está, añade la
   sección de trazabilidad operativa. (Docs 3, 8.)
3. **¿Versiones? → UN REGISTRO POR VERSIÓN.** `passport_code` estable +
   `passport_version` incremental por `(organization_id, reference_id,
   output_lot_id)`. Sin tabla de versiones separada en T9A (una fila = una
   versión inmutable ya es el historial). (Doc 5.)
4. **¿Detección de cambios posteriores? → `source_hash`.** Hash determinista de
   los `updated_at`/IDs/estados de las entidades fuente, calculado en servidor
   y guardado con el snapshot. En T9C, comparar el hash actual contra el
   guardado dispara la alerta "los datos fuente cambiaron…". (Doc 5.)
5. **¿Datos obligatorios vs advertencia? → mínimo para generar: referencia +
   producto + composición (aunque sea parcial).** Todo lo demás genera brecha,
   no bloqueo. Un pasaporte con muchas brechas es un resultado válido y útil.
   (Docs 8, mapeo en 4.)
6. **¿Estados? → draft, generated, in_review, approved_internal, obsolete.**
   `approved_internal` nunca significa aprobación externa. (Doc 5 §estados.)
7. **¿Roles? → generar: admin/quality/consultant; aprobar internamente:
   admin/quality.** Mismo patrón de roles que TrazaDocs. Consultant prepara y
   genera; no aprueba. (Doc 6.)
8. **¿Protección de `snapshot_json`? → trigger + flag transaccional, patrón
   T7.1.** El snapshot y los campos calculados (`source_hash`, `gaps_json`,
   etc.) solo los escribe la RPC de generación bajo un flag interno; nacen bajo
   control y son inmutables una vez `generated`. (Doc 6.)
9. **¿Evidencias? → AMBAS vías.** `textile_evidence_links` con
   `entity_type = 'technical_passport'` (nuevo) para navegación viva + snapshot
   de estados dentro de `snapshot_json` para el histórico. (Doc 5, 6; §10.)
10. **¿TrazaDocs? → REFERENCIA, no copia.** El pasaporte lista los documentos
    TXT relevantes con su estado/versión aprobada internamente; no reproduce su
    contenido. (Doc 4 §5.12.)
11. **¿Circularidad sin prometer certificación? → score + nivel + dimensiones +
    brechas + recomendaciones + metodología + fecha, siempre con la advertencia
    de circularidad.** Nunca solo el número. (Doc 4 §5.9.)
12. **¿Qué queda fuera de T9A/B/C? → QR, portal público, PDF server-side, firma
    avanzada, comparación entre pasaportes, exportador normativo.** QR/enlace
    público se documenta como T9D futuro, no se implementa. (Doc 9; plan §5.)

## 3. Principio de snapshot (resumen)

El snapshot preserva: los datos visibles del pasaporte, las referencias a los
IDs fuente, la fecha de extracción, la versión de metodología de circularidad,
los estados de evidencias y de documentos, las brechas calculadas y el usuario
generador. Se genera **en servidor** (RPC/builder), nunca se acepta desde
cliente, y una vez el pasaporte pasa a `generated` no puede editarse: los
cambios exigen una nueva versión. El `source_hash` permite detectar, más tarde,
que las fuentes cambiaron. Detalle completo en el documento 5.

## 4. Las 14 secciones (resumen)

Identificación del pasaporte · Identificación del producto · Composición de
fibras · Materiales e insumos · Avíos/componentes · Proveedores y procesos ·
Evidencias documentales · Trazabilidad operativa (solo con lote) · Evaluación
de circularidad · Cuidado, reparación, separabilidad y fin de vida ·
Declaraciones ambientales y claims · Documentos TrazaDocs relacionados ·
Brechas y advertencias · Resumen ejecutivo. Contenido campo por campo, textos
obligatorios y estados por sección en el documento 3; origen de cada dato en el
documento 4.

## 5. Modelo de datos (resumen)

Una tabla principal **`textile_technical_passports`** (un registro por versión,
con `snapshot_json`, `source_hash`, `gaps_json`, `data_sources_json` y sellos de
generación/revisión/aprobación). **No** se crean tablas de secciones ni de
versiones en T9A: las secciones viven dentro de `snapshot_json` (estructura fija
del documento 3) y el versionado es por registros. Se reserva
`textile_technical_passport_sections` como opción futura solo si se necesita
edición sección a sección (no previsto). Esquema completo en el documento 2.

## 6. Plan de implementación

- **T9A — Modelo de datos y snapshot**: migración con la tabla, RLS, trigger de
  protección del snapshot (patrón T7.1), función de generación de snapshot y
  `source_hash`, y tests de integridad/seguridad.
- **T9B — Generación desde datos existentes**: server actions + builder de
  snapshot que lee las fuentes reales, calcula brechas y hash, y vincula
  evidencia/circularidad/trazabilidad.
- **T9C — UI, impresión y hardening**: rutas `/textiles/passports*`, listado,
  creación con pre-chequeo, detalle, impresión por navegador, aprobación
  interna, nueva versión, tests y hardening.
- **T9D (futuro, no inmediato)**: QR / enlace público controlado — solo
  documentado.

Detalle de cada sprint en la sección "Plan de implementación posterior" del
documento 10 (prompt T9A) y en este archivo, §7.

## 7. Plan detallado T9A / T9B / T9C

### T9A — Modelo de datos y snapshot
1. Migración `00XX_textile_technical_passports.sql`: tabla
   `textile_technical_passports` con los patrones 0020/0024 (unique
   `(org,id)`, unique `(org, passport_code, passport_version)`, FKs compuestas
   a `textile_references`/`textile_output_lots`/`textile_circularity_assessments`
   por `(organization_id, id)`, triggers `set_updated_at`/`force_created_by`/
   `prevent_organization_id_change`/`audit_row_change`, RLS deny-by-default).
2. Trigger de protección del snapshot y campos calculados (patrón T7.1): sin el
   flag transaccional interno, el INSERT exige `status='draft'` o `'generated'`
   coherente y prohíbe fijar `snapshot_json`/`source_hash`/`gaps_json`/
   `warnings_json`/`recommendations_json`/sellos desde cliente; el UPDATE los
   vuelve inmutables una vez `generated`.
3. RPC `generate_textile_technical_passport(...)` (security definer, granted a
   authenticated con las guardas de módulo) que arma el snapshot en servidor
   bajo el flag y calcula el hash.
4. Tests: no cross-tenant, snapshot no editable, `generated_by`/`reference_id`/
   `output_lot`/`assessment` pertenecen a la organización, hash presente,
   lenguaje prudente, CPR intacto.

### T9B — Generación desde datos existentes
1. `lib/domain/textiles-passport.ts`: tipos del snapshot, cálculo de brechas
   (catálogo del documento 8), interpretación de estados de evidencia, armado
   del resumen ejecutivo; funciones puras testeables.
2. `lib/db/textiles-passport.ts`: lectores de cada fuente (documento 4) +
   inserción vía RPC.
3. `server/actions/textiles-passport.ts`: `createTextileTechnicalPassport…`
   (pre-chequeo + generación), nueva versión, transiciones; guardas
   `requireTextilesForAction`, módulo fijado en servidor.
4. `source_hash` determinista y `data_sources_json` con los IDs/`updated_at`
   usados.
5. Vinculación de evidencias (`entity_type='technical_passport'`) + snapshot.

### T9C — UI, impresión y hardening
1. Rutas `(shell)/textiles/passports`, `…/new`, `…/[id]` y
   `(print)/textiles/passports/[id]/print` bajo la guarda Textil +
   `force-dynamic`.
2. Componentes: listado, formulario de creación con pre-chequeo de datos,
   detalle por secciones, editor de estado (generar nueva versión / aprobar
   internamente / obsoleto), impresión por navegador (patrón TrazaDocs, con
   logo/NIT).
3. Alerta de `source_hash` desactualizado.
4. Suite de tests de la UI/seguridad + hardening de generación.

## 8. Criterios de aceptación de T9.0 (autoverificación)

Sin cambios de código funcional ✓ · sin migraciones ✓ · sin cambios de UI ✓ ·
CPR intacto ✓ · arquitectura clara ✓ · snapshot vs vista viva definido (§2.1) ✓
· secciones definidas (doc 3) ✓ · modelo de datos (doc 2) ✓ · seguridad/RLS
(doc 6) ✓ · versionamiento (doc 5) ✓ · estados (doc 5) ✓ · gaps/warnings
(doc 8) ✓ · integración con referencias/lote/evidencias/circularidad/TrazaDocs
(doc 4) ✓ · matriz de preparación sin prometer cumplimiento (doc 7) ✓ ·
lenguaje prudente en todo (sin certificación "garantizada", "cumple
automáticamente", "pasaporte oficial", "DPP oficial", "sello garantizado") ✓ ·
plan T9A/B/C (§6–7) ✓ · prompt T9A (doc 10) ✓.
