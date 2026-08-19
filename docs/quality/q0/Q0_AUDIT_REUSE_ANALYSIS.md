# Q0_AUDIT_REUSE_ANALYSIS

**Sprint:** Q0 — Technical Discovery & Schema Mapping
**Fecha:** 2026-08-18
**Pregunta que responde:** ¿qué existe REALMENTE de Trazaloop Audit, y qué puede compartir Quality
con él (AR-13, AR-09, PDM-04, Maestro §8, §66)?

---

## 1. Veredicto

**Trazaloop Audit, como módulo de gestión de auditorías, NO EXISTE.**

No hay auditorías, ni programas de auditoría, ni hallazgos, ni acciones, ni casos, ni no
conformidades, ni workflows. Ni tabla, ni función, ni ruta, ni server action, ni test.

Lo que existe y **puede confundirse con Audit** son tres cosas distintas, todas legítimas y todas
de otra naturaleza:

1. `audit_log` — **bitácora técnica** de la plataforma.
2. `audit_dossiers` + `traceability_exercises` — **preparación para auditoría** del módulo PCR.
3. Rutas `/audit-prep` y `/audit-support` — la UI de lo anterior.

Ninguna de las tres es gestión de auditorías. Confundirlas llevaría a dar por implementado un
dominio entero que está vacío.

---

## 2. Búsqueda realizada

Sobre las 102 migraciones y todo el código TypeScript:

| Entidad buscada | Resultado |
|---|---|
| `audits` | no existe |
| `audit_programs` | no existe |
| `audit_scopes`, `audit_criteria` | no existe |
| `audit_team_members` | no existe |
| `audit_findings` / `findings` | no existe |
| `audit_reports` | no existe |
| `audit_notes`, `audit_samples` | no existe |
| `nonconformities` | no existe |
| `corrective_actions` / `actions` / `action_plans` | no existe |
| `cases` | no existe |
| `root_cause_analyses` | no existe |
| workflows / tareas / alertas / eventos | no existe |

Verificado también en `lib/`, `server/`, `app/` y `tests/`: ningún módulo de auditoría de gestión.

---

## 3. Lo que sí existe

### 3.1 `audit_log` — bitácora técnica (IMPLEMENTADO)

Descrita en `Q0_DATABASE_SCHEMA_INVENTORY.md` §8. Es el *audit trail* técnico del Maestro §35 y
del baseline §31, no auditoría de gestión. Append-only real, con dos usos mezclados (diff de fila
y eventos semánticos).

Aporta a Quality: el **hábito** de historial inmutable y la primera lista de tipos de evento
semánticos ya emitidos. No aporta el motor de eventos.

### 3.2 `traceability_exercises` — ejercicio de trazabilidad PRE-auditoría (IMPLEMENTADO)

```sql
traceability_exercises (
  organization_id, output_batch_id, started_by, started_at, completed_at,
  status ∈ draft|completed|archived,
  result ∈ complete|complete_with_warnings|incomplete,
  snapshot jsonb, schema_version 'pcr_traceability_exercise_v1',
  source_hash, gaps_count, warnings_count, notes
)
```

La empresa elige un lote y el sistema reconstruye su trazabilidad hacia atrás con datos reales,
clasifica observaciones en *información / advertencia / brecha* y **congela el resultado en un
snapshot inmutable**.

**Detalle que merece subrayarse:** el encabezado de la migración declara que el resultado es
`complete / complete_with_warnings / incomplete` y **jamás "cumple / no cumple"**, con disclaimer
en UI y dentro del snapshot.

Eso es exactamente la disciplina que el baseline exige en §4.3 (*un mapeo no concluye conformidad
automáticamente*), §7.7 (*"Requiere atención" no es una no conformidad ISO*), D-30, RD y el
Maestro §50 y §85. **El proyecto ya interiorizó el principio de no afirmar conformidad
automáticamente.** Es un activo cultural y de producto que Quality hereda.

### 3.3 `audit_dossiers` — expediente de preparación (IMPLEMENTADO)

```sql
audit_dossiers (
  organization_id, output_batch_id, exercise_id,
  dossier_code  -- EXP-PCR-AAAA-NNNN, único por organización
  version, status ∈ generated|archived,
  snapshot jsonb, schema_version 'pcr_audit_dossier_v1',
  source_hash, gaps_count, warnings_count,
  unique (organization_id, output_batch_id, version)
)
```

Consolida identificación, genealogía, balances, cálculo PCR, matriz de evidencias, requisitos de
cliente, calidad, ejercicio previo y brechas en un **snapshot congelado y versionado**. Cada
generación crea una versión nueva; nunca se sobrescribe. Las FK son compuestas y `ON DELETE
RESTRICT`: el histórico documental no desaparece en cascada.

El encabezado es igualmente explícito: *"NO es un certificado ni un informe de auditor externo: el
disclaimer viaja dentro del propio snapshot."*

---

## 4. Por qué esto no es Trazaloop Audit

| Dimensión | `audit_dossiers` (existe) | Trazaloop Audit (baseline §15) |
|---|---|---|
| Sujeto | Un lote producido | Un proceso, área o sistema de gestión |
| Actor | La propia empresa, preparándose | Un auditor con competencia e independencia verificadas |
| Momento | Antes de la auditoría | Durante la auditoría |
| Salida | Expediente congelado | Hallazgos formales clasificados |
| Ciclo | Generar → archivar | Programa → plan → ejecución → hallazgo → informe → caso → acción → seguimiento |
| Consecuencia | Ninguna | Caso Quality, acción, eficacia, cierre |
| Alcance | Solo PCR | Transversal y sectorialmente neutro |

Son **complementarios, no sustitutos**. Cuando exista Audit, `audit_dossiers` seguirá siendo útil
como insumo de preparación (AR-07 pide exactamente un expediente de preparación automático), pero
**referenciado**, no absorbido.

---

## 5. Clasificación para Quality

### REUTILIZAR

| Componente | Uso en Quality |
|---|---|
| Patrón *snapshot + `schema_version` + `source_hash`* | Es la forma correcta de congelar el dossier de revisión por la dirección (RD-04) y el contexto de evidencia de auditoría (§32) |
| Patrón de **código legible único por organización** (`EXP-PCR-AAAA-NNNN`) | Reutilizable para códigos de caso, acción y hallazgo, con la unicidad de la que carece TrazaDocs (D-04) |
| Versionado por `unique (organization_id, sujeto, version)` sin sobrescritura | Aplicable a evaluaciones de proveedor, valoraciones de riesgo y revisiones |
| Lenguaje prudente (`complete_with_warnings`, nunca "cumple") | **Debe conservarse como norma de producto en todo Quality** |
| FK compuesta + `ON DELETE RESTRICT` para históricos | Invariante a mantener |

### CREAR (todo el dominio)

`audit_programs` · `audits` · `audit_scopes` · `audit_criteria` · `audit_team_members` ·
`audit_agenda_items` · `audit_samples` · `audit_evidence_links` · `audit_notes` ·
`audit_findings` · `audit_reports`

Y el núcleo transversal del que dependen (baseline §14):
`quality_cases` · `quality_actions` · `quality_root_cause_analyses` ·
`quality_action_effectiveness_reviews` · `quality_case_events`

### ADAPTAR

`audit_dossiers` y `traceability_exercises` deberán poder **referenciarse** desde un futuro
`audits` o `quality_cases` mediante `quality_source_links`, sin duplicar su contenido (§30, MDR-32,
Maestro §64). No requieren cambios estructurales para ello.

### DEPRECAR

Nada.

### POSPONER

El módulo Audit completo, hasta que exista el núcleo transversal de Casos y Acciones. **El orden
es forzoso** (AR-09, AR-13, MDR-25): un hallazgo de auditoría es un caso, así que Casos y Acciones
debe existir antes que Auditorías. Construir Audit primero obligaría a rehacerlo.

---

## 6. Consecuencia de arquitectura

El baseline exige (AR-13, PDM-04, Maestro §8.1) que Audit y Quality **compartan un núcleo común**
de auditorías, evidencias, hallazgos, casos y acciones, y prohíbe explícitamente que exista

```text
hallazgo Audit  +  copia independiente del hallazgo Quality
```

Como **ninguno de los dos existe todavía**, esta es una situación afortunada: no hay que reconciliar
dos implementaciones divergentes. El núcleo puede nacer compartido desde el primer día.

**Recomendación:** el núcleo de Casos y Acciones debe construirse como **capa transversal
(`quality_cases`, `quality_actions`)**, no dentro de Audit ni dentro de un dominio concreto, y
Audit debe ser su primer consumidor junto con No Conformidades. Esto también implica que
`quality_actions` debe poder tener múltiples orígenes desde el diseño inicial (AC-12, MDR-24,
Maestro §67), no añadirse después.
