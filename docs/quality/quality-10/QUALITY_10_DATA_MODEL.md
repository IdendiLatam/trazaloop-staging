# QUALITY-10 · El modelo de datos

**Migración:** `0128_quality_management_review.sql` — 3 948 líneas, append-only.
**Local 0128 · Staging 0128 · Production 0111.**

## 0 · Lo que NO se creó, y por qué

| No existe | Porque ya existe |
|---|---|
| Un motor de acciones de la revisión | `work_actions` — RD-19, y las acciones se atan por `work_references` |
| Un motor de tareas | `work_tasks` · cinco tipos nuevos |
| Un sistema de avisos | `work_alerts` · seis tipos nuevos |
| Un motor documental | TrazaDocs · el acta puede atarse a una revisión controlada |
| Un módulo financiero | La adecuación de recursos se **registra**, no se presupuesta |
| Inteligencia artificial | RD-10 · QUALITY-12 |

QUALITY-04 había anticipado este dominio en 0121: `work_cases.origin_kind` ya
incluía `'management_review'`. Se usa tal cual.

## 1 · Las nueve tablas

### El catálogo (§13, §14)

`quality_management_review_input_catalog` — **catorce** entradas, con código,
etiqueta, descripción, dominio de origen y orden. Es **global**, sin
`organization_id`: si cada empresa se inventara las suyas, «revisamos todo»
dejaría de significar nada y dos revisiones no serían comparables. Solo se
concede `select`.

| # | Código | De dónde sale |
|---|---|---|
| 1 | `previous_actions` | QUALITY-04 · acciones |
| 2 | `changes` | QUALITY-01/02 + aportación de la dirección |
| 3 | `system_performance` | agregación de las demás |
| 4 | `customer_voice` | QUALITY-08 |
| 5 | `objectives` | QUALITY-03 |
| 6 | `process_performance` | QUALITY-01 |
| 7 | `product_conformity` | QUALITY-04 |
| 8 | `nonconformities_actions` | QUALITY-04 |
| 9 | `monitoring_results` | QUALITY-03 |
| 10 | `audits` | QUALITY-09 |
| 11 | `supplier_performance` | QUALITY-07 |
| 12 | `resources_adequacy` | QUALITY-06 |
| 13 | `risk_action_effectiveness` | QUALITY-05 |
| 14 | `improvement_opportunities` | QUALITY-05/08/09 |

### La revisión (§6, §7, §10)

`quality_management_reviews` — código único por empresa, título, naturaleza
(`full`/`extraordinary`/`thematic`), **periodo obligatorio**, estado, cargo
responsable, sesión (día, lugar, nota), conclusiones, cierre, seguimiento,
próxima revisión y reapertura.

**§7 · REVISIÓN ≠ REUNIÓN.** No hay tabla de reuniones. La sesión son tres
columnas de esta misma fila, y `session_held_on` es *nullable*: una revisión se
prepara durante semanas antes de que exista fecha de sesión.

**§8 · La responsabilidad es del CARGO** (`owner_position_id`, MDR-33). Quién
lo ocupaba aquel día está en los participantes.

### Participantes (§9, §69, §70)

`quality_management_review_participants` — persona **o** nombre externo, papel,
asistencia, aportación y **`position_name_at_review`**: el cargo copiado como
texto en el momento. Resolverlo al leer haría que un acta de 2027 mostrara la
estructura de 2029.

No tiene ninguna columna de aprobación: **asistir no es aprobar**.

### Agenda (§33) y notas (§51)

`quality_management_review_agenda_items` con orden configurable y enlace
opcional a una entrada del catálogo. `quality_management_review_notes` para lo
que complementa el acta sin sustituirla.

### La entrada (§14…§18, §35…§38)

`quality_management_review_inputs` — una instancia por tipo y revisión
(`unique (organization_id, review_id, catalog_code)`), con cuatro capas
separadas:

| Capa | Columnas |
|---|---|
| **Dato fuente** | `snapshot jsonb`, `summary` |
| **Linaje** | `source_domain`, `source_period_start/end`, `prepared_at`, `prepared_by`, `source_fingerprint` |
| **Análisis humano** | `analysis`, `analysis_at`, `analysis_by`, `conclusion` |
| **Necesidad** | `requires_decision` — que **no** es una decisión |

Estados: `pending` · `prepared` · `reviewed` · `not_applicable` · `missing`.
Un `check` impide `not_applicable` sin razón escrita, y otro impide declarar
una entrada preparada sin decir de qué periodo y cuándo.

### Aportaciones de la dirección (§17, §30, §31)

`quality_management_review_manual_entries` — categoría, recurso (cuando aplica),
título, contenido, **autor y fecha**. Ocho categorías y seis clases de recurso.

### La decisión (§39, §41)

`quality_management_review_decisions` — código por revisión, tema, decisión,
fundamento, resultado esperado, entrada que la motivó, cargo responsable, actor
y fecha.

**No tiene ninguna columna de acción.** Las acciones viven en `work_actions` y
se atan con `work_references(owner_kind='management_review_decision',
ref_kind='work_action')`. Una decisión puede tener 0..N, y «muchas» es
exactamente lo que una columna no sabe guardar.

### El acta (§50, RD-07, RD-18)

`quality_management_review_minutes` — versión, fecha, resumen, **`snapshot
jsonb not null`**, `supersedes_id` y `document_revision_id` opcional hacia
TrazaDocs. Sin política de `insert`, `update` ni `delete`: la única puerta es
`quality_mr_issue_minutes`.

## 2 · Vistas

Las tres son `security_invoker`.

| Vista | Qué responde |
|---|---|
| `v_quality_management_review_overview` | Por revisión: entradas por estado, participantes, decisiones, actas y **acciones derivadas del motor transversal** |
| `v_quality_management_review_input_status` | Por entrada: estado, frescura, si tiene análisis y cuántas decisiones salieron |
| `v_quality_management_review_decision_actions` | Una decisión y sus 0..N acciones, **en columnas distintas** |

Ninguna copia contadores de acciones a la revisión: una columna almacenada se
desincroniza el primer día que alguien completa una acción.

## 3 · Multiempresa

Toda relación usa FK compuestas `(organization_id, id)` (MDR-42). Una revisión
de A no alcanza un proceso, una persona ni una decisión de B ni con el UUID en
la mano.
