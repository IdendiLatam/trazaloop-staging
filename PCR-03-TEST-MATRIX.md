# PCR-03 · Test Matrix

## PostgreSQL 16 real (`npm run test:pcr03-db` → runner 1–12) — EXIT 0
Pasos: prelude (stub ampliado a la superficie real de 0019) → 0025 → 0104 →
LEGACY 4a/4b/4c → 0105 → suites S1–S11 + C1 → **0106+0107+0108 con
`psql --single-transaction`** → **S12–S14**. Total: **98 aserciones ✔ + C1
= 99**.

| Sección | Cobertura | Resultado |
| --- | --- | --- |
| S12.1 | Rechazo sin motivo → 23514 literal; consultor no revisa (42501); admin sí; intento de FALSIFICAR reviewed_by/at → sobreescrito por el servidor | ✔ |
| S12.2 | physical + storage_path → check_violation; física y híbrida registrables y localizables | ✔ |
| S12.3 | Consultor no archiva; admin sí con archived_by sellado | ✔ |
| S12.4 | Vínculo de requisito a producto de OTRA empresa → trigger; vínculo válido ✓; evidencia↔requisito vía evidence_links; RLS en ambos sentidos | ✔ |
| S13.1 | draft→completed; editar notas o snapshot de un completado → «fotografía histórica»; hash intacto tras el intento; completed→archived (pura) ✓ | ✔ |
| S13.2 | DELETE de finalizado → vetado; borrador sí se elimina | ✔ |
| S13.3 | Segundo ejercicio del mismo lote → 2 fotografías conviven; la otra empresa ve 0 | ✔ |
| S14.1 | v1 y v2 del mismo lote conviven; versión duplicada → 23505; código EXP-PCR duplicado → 23505 | ✔ |
| S14.2 | Snapshot de un generado → «versión histórica»; generated→archived ✓; DELETE vetado incluso archivado | ✔ |
| S14.3 | FK compuesta rechaza lote de otra org; RLS: la ajena ve 0 expedientes | ✔ |

## Unit — `npm run test:pcr03` (57 checks) EXIT 0
**03.1 (18)**: dominio real (vigencia, etiquetas prudentes, medios,
tipologías aditivas) + candados (0106 única del sub-sprint, guarda con
sellos, CHECK físico, requisitos con RLS/FK/trigger, enum ampliado sin
tablas paralelas, acciones sin service_role ni organization_id del
cliente, UI con filtros y confirmaciones, searchEvidences con archivadas
excluidas por defecto, cálculo y Textiles intactos, runner cableado).
**03.2 (21)**: los casos 1–22 del brief con llamadas REALES al
ensamblador — cadena simple (Completo), multinivel, múltiples entradas,
evidencia aceptada/pendiente/rechazada/física/ausente, cálculo
presente/ausente, requisito, calidad, **ciclo real sin loop (<2 s)**,
**15 niveles → truncado en 10 con advertencia**, hash determinista y
sensible, lenguaje prudente sobre el snapshot completo + candados (0107
inmutable jsonb-minus, DELETE vetado, RLS/FK, sin transaction control,
UI de 13 secciones con disclaimer desde la foto, hub §8).
**03.3 (18)**: secciones A–K reales (portada, resumen, matriz con física
localizable y rechazada no vigente, sin signed URLs en el JSON completo,
duración confiable, brechas con fuente y recomendación, disclaimer
literal, sin ejercicio → constancia honesta sin datos inventados, hash y
código EXP-PCR) + candados (0108 con versionado/inmutabilidad/DELETE
vetado/RLS/FK compuestas, impresión browser-side sin librerías PDF, UI
7.6 con aviso de cambios posteriores, rol para archivar, S14 cableado,
no-regresión Textiles/planes/nomenclatura).

## Regresión completa
`npm run test:all` → **EXIT 0 · 1.624 checks / 95 suites** (typecheck,
lint con solo el warning histórico `domainSrc`, Textiles completo,
Demo/Full/Extra, PCR-01.1, PCR-02.x, PCR-03 y release con las fronteras de
migración extendidas a la reserva exacta del bloque).
`npm run build` (`next build --webpack`) → **EXIT 0** con las rutas
`/audit-prep/exercises`, `/audit-prep/exercises/[id]`,
`/audit-prep/dossiers`, `/audit-prep/dossiers/[id]` y
`/catalog/customer-requirements` compiladas.

## Rev. 03.1–03.3.1 · pruebas añadidas

| Prueba | Tipo | Cubre |
| --- | --- | --- |
| S12.1b / S12.1c / S12.3 (ataques 33, 7, 34) | DB conductual | Sellos infalsificables sin transición; reapertura solo admin/quality; archived_by verdad-servidor |
| S12.4 ampliada (ataques 1–3 del hallazgo 1 + 35) | DB conductual | Trigger REAL de evidence_links con customer_requirement (misma org / ajena / inexistente / históricos) y organization_id inmutable con usuario de dos orgs |
| S13.1–S13.3 reescritas (ataques 31, 10) | DB conductual | INSERT/UPDATE directos de completed RECHAZADOS; RPC complete_traceability_exercise (coherencia, lote, hash servidor); congelación e historial |
| S14.1–S14.3 reescritas (ataques 32, 13) | DB conductual | INSERT directo vetado (consultor y admin), RPC por rol con v1/v2 atómicas, identidad de portada y hash de servidor, aislamiento |
| tests/db/pcr03_dossier_concurrency.sh (ataque 40) | DB concurrencia real | Dos sesiones psql simultáneas → versiones consecutivas y códigos distintos (paso 13/13 del runner) |
| Candados rev. en pcr03-1/2/3 | Unit | Hallazgos 1–9: redefinición aditiva, sellos, org inmutable, contrato sin casts, RPCs en acciones, rol explícito, búsqueda server-side, sin reintentos 23505 |
| t9f5b1 restaurada | Unit | Hallazgo 10: aserción histórica MIG100 recuperada (21 ✔) |

---

## Rev. 03.1–03.3.2 — pruebas adversariales nuevas (todas ejecutadas)

| ID | Prueba | Capa | Resultado |
|----|--------|------|-----------|
| A1 | RPC del ejercicio ya no acepta `p_snapshot` (firma vieja → `undefined_function`) | PG16 S13 | ✔ |
| A2 | authenticated no puede introducir JSON arbitrario (imposible por firma) | PG16 S13 | ✔ |
| A3 | La fotografía refleja los datos REALES (cadena, saldos, evidencias, conteos, resultado) | PG16 S13 | ✔ |
| A4 | Datos nuevos + ejercicio nuevo → snapshot distinto; histórico y hash intactos | PG16 S13 | ✔ |
| A5 | `source_hash` = sha256 del snapshot construido por el servidor | PG16 S13 | ✔ |
| B1 | RPC del expediente ya no acepta `p_snapshot` (firma vieja → `undefined_function`) | PG16 S14 | ✔ |
| B2 | admin no puede introducir JSON arbitrario (imposible por firma) | PG16 S14 | ✔ |
| B3 | El expediente se construye desde el ejercicio/datos reales (portada, resumen, genealogía, sección ejercicio) | PG16 S14 | ✔ |
| B4 | Secciones A–K + disclaimer literal presentes | PG16 S14 | ✔ |
| B5 | `source_hash` del expediente = sha256 del snapshot del servidor | PG16 S14 | ✔ |
| — | Sin ejercicio completado → “Ejecuta primero un ejercicio de trazabilidad…” | PG16 S14 + acción + UI | ✔ |
| C1 | consultant no archiva ejercicio por Server Action (rol explícito) | candado unit 03.2 | ✔ |
| C2 | consultant no archiva ejercicio por UPDATE directo | PG16 S13 | ✔ |
| C3 | admin archiva ejercicio | PG16 S13 | ✔ |
| C4 | quality archiva ejercicio | PG16 S13 | ✔ |
| D1 | consultant no archiva expediente por Server Action (rol explícito) | candado unit 03.3 | ✔ |
| D2 | consultant no archiva expediente por UPDATE directo | PG16 S14 | ✔ |
| D3 | admin archiva expediente | PG16 S14 | ✔ |
| D4 | quality archiva expediente | PG16 S14 | ✔ |
| E1 | `gaps_count = -1` rechazado por CHECK (incluso con flag) | PG16 S13 | ✔ |
| E2 | `warnings_count = -20` rechazado por CHECK (incluso con flag) | PG16 S14 | ✔ |

Los ataques 1–40 anteriores se conservan y se re-ejecutan en el mismo arnés (13 pasos,
PostgreSQL 16 real) junto con la concurrencia C1 (saldos) y C2 (expedientes).

---

## Rev. 03.1–03.3.3 — integridad de evidencias y completitud (todas ejecutadas)

| ID | Prueba | Capa | Resultado |
|----|--------|------|-----------|
| S15 | Evidencia `valid` cuenta → ARCHIVADA no cuenta en cálculo NUEVO (masa excluida + `components_excluded_for_missing_support` + `related_evidence_not_valid`) → histórico intacto → desarchivada vuelve a contar | PG16 · motor real redefinido en 0106 | ✔ `ARCHIVED_EVIDENCE_CALCULATION = PASS` |
| F1 | Evidencia vinculada a `product` aparece en el ejercicio | PG16 S16 | ✔ `PRODUCT_EVIDENCE_IN_EXERCISE = PASS` |
| F2 | Evidencia vinculada a `customer_requirement` aparece en el ejercicio | PG16 S16 | ✔ `CUSTOMER_REQUIREMENT_EVIDENCE_IN_EXERCISE = PASS` |
| F3/F4 | `origin_support_evidence_id` / `reclassification_evidence_id` SIN evidence_links aparecen | PG16 S16 | ✔ `IMPLICIT_MATERIAL_SUPPORT_IN_EXERCISE = PASS` |
| F5 | Con enlace explícito equivalente NO se duplica | PG16 S16 | ✔ |
| F6 | Physical conserva referencia/ubicación/custodia y `has_digital_file=false` | PG16 S16 | ✔ |
| F7 | Revisión conserva `reviewed_at` / `reviewed_by(_email)` | PG16 S16 | ✔ |
| F8 | `evidence_date` y `responsible` llegan al snapshot | PG16 S16 | ✔ |
| F9 | `quality_control` del producto llega a `quality_evidences` del expediente | PG16 S16 | ✔ `EVIDENCE_METADATA_IN_DOSSIER = PASS` |
| F10/F11 | Archivada y rechazada viajan como históricas con `current=false` | PG16 S16 | ✔ |
| F12 | La matriz no contiene signed URLs ni tokens | PG16 S16 | ✔ |
| N1 | 0028 BYTE-INTACTA (SHA fijado); 0106 redefine el motor conservando TODAS las fórmulas; único cambio: vigencia 03.1 | candados unit 03.1 | ✔ |

---

## Rev. 03.1–03.3.4 — coherencia transversal (todas ejecutadas)

| ID | Prueba | Capa | Resultado |
|----|--------|------|-----------|
| T1/S17 | Vigente → archivada → desarchivada consistente en motor, readiness, matriz, dashboard y next_actions (conteos exactos, `add_origin_evidence` aparece y desaparece) | PG16 | ✔ `ARCHIVED_EVIDENCE_CROSS_SURFACE_CONSISTENCY = PASS` |
| S18 | Material SOLO-composición: soporte en `calculation.components` Y en `snapshot.evidences` (implícito, current), brecha de consumos señalada, sin brecha falsa de material | PG16 | ✔ `COMPOSITION_ONLY_MATERIAL_EVIDENCE = PASS` |
| — | Candados: 4 vistas redefinidas en 0106 con vigencia; catálogo/SupportBadge/matriz-UI/guided-flow usan la vigencia real; conjunto canónico de materiales; requisitos por productos de toda la cadena | unit 03.1/03.2 | ✔ |
