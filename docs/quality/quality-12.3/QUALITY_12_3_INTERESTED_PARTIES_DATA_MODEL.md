# QUALITY-12.3A · Partes interesadas · MODELO DE DATOS CANDIDATO

> **Diseño, no implementación.** Ninguna migración. Los nombres son
> candidatos; lo que se congela es la responsabilidad de cada tabla y por qué
> no puede resolverse con algo que ya existe.
>
> Corregido por la revisión humana 12.3A.1: **ocho** tablas (la versión
> anterior decía «seis» y enumeraba siete), el sujeto pasa a **dos** tipos y
> la relación estrategia↔requisito se hace core. Ver
> [ARCHITECTURE_REVIEW](./QUALITY_12_3_ARCHITECTURE_REVIEW.md).

---

## 0 · Antes de proponer: qué se resuelve SIN tabla nueva

| Se necesita | Se resuelve con | Tabla nueva |
|---|---|---|
| Identidad de una entidad externa | `quality_external_parties` | **no** |
| Contactos y sedes | `quality_external_party_contacts` / `_sites` | **no** |
| Colectivo interno | tabla 2 (**no** `quality_org_units`: el organigrama no es una parte interesada, PI-38) | sí |
| Vínculo a riesgo / oportunidad | `work_references` | **no** |
| Vínculo a objetivo / indicador | `work_references` | **no** |
| Vínculo a acción / caso | `work_references` | **no** |
| Vínculo a documento o evidencia | `work_references` | **no** |
| Encuesta de satisfacción | `quality_survey_*` | **no** |
| Evaluación de proveedor | `quality_supplier_evaluations` | **no** |
| Medición de un indicador | `quality_measurements` | **no** |
| Entrada de Revisión por la Dirección | fila en `quality_management_review_input_catalog` | **no** |
| Evento de automatización | fila en `quality_automation_event_catalog` | **no** |
| Fuente de Intelligence | fila en `quality_ai_sources` | **no** |

**Ocho tablas** se proponen. Todo lo demás son filas de catálogo y dos CHECK
ampliados.

**Y `work_references` NO sirve para todo.** Comprobado contra el esquema real:

```sql
work_references
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  FOREIGN KEY (created_by)      REFERENCES profiles(id)
  UNIQUE (owner_kind, owner_id, ref_kind, ref_id, relation)
  relation ∈ {origin, evidence, related}
```

`owner_id` y `ref_id` son **uuid sin clave foránea**. No hay integridad
referencial, ni vigencia, ni vocabulario tipado. Es el mecanismo correcto para
lo periférico y el equivocado para la semántica de dominio (PI-37).

---

## 1 · `quality_stakeholder_categories`

**Propósito.** Taxonomía 4.2 configurable por organización. NO es
`quality_external_party_roles`: aquel dice qué papel comercial juega una
entidad externa; este dice por qué una parte importa para el SGC, e incluye
partes internas y colectivas.

| | |
|---|---|
| Identidad | estable (`id`), única por `(organization_id, code)` |
| Temporal | ninguno; `is_active` para retirar sin borrar |
| Columnas | `code` · `name` · `description` · `sort_order` · `is_active` |
| Semilla | 15 categorías no sectoriales, todas editables |
| Borrado | **no se borra**; se desactiva (PI-07) |
| RLS | lectura miembro · escritura `quality_manages_interested_parties` |
| Precedente | `quality_process_categories` |

---

## 2 · `quality_stakeholder_groups`

**Propósito.** Colectivos, internos y externos, sin entidad jurídica concreta:
trabajadores, dirección, propietarios y accionistas, la comunidad del entorno,
la academia, «los entes reguladores» como colectivo.

**Por qué no va en `quality_external_parties`:** esa tabla exige `legal_name` y
la apuntan nueve claves foráneas de proveedores, clientes y alcance de
auditoría. Meter «Comunidad» allí contaminaría el registro de entidades
externas con algo que no es una entidad, y lo verían PCR y Textiles.

**Por qué no va en `quality_org_units` (PI-38):** el organigrama es la
estructura sobre la que cuelgan cargos y personas. «Trabajadores» atraviesa
varias unidades, y «Dirección» como parte interesada no es la unidad de la que
dependen tres cargos. Atar los sujetos del análisis 4.2 al organigrama haría
que cada reorganización interna moviera las partes interesadas.

**Diferido:** anclar un grupo a una unidad —«trabajadores de planta 2»— sería
una FK nulable `org_unit_id` **en esta tabla**, append-only, no un tercer tipo
de sujeto.

| | |
|---|---|
| Identidad | estable, única por `(organization_id, code)` |
| Columnas | `code` · `name` · `description` · `is_active` |
| Borrado | desactivación |
| RLS | igual que el resto |

---

## 3 · `quality_stakeholder_assessments` ← **el núcleo**

**Propósito.** El análisis fechado de un sujeto: quién es para nosotros, en qué
periodo, con qué prioridad y si es pertinente.

**Sujeto de dos tipos, con FK compuestas reales (PI-02):**

```sql
subject_kind ∈ {external_party, group}
external_party_id  uuid null → quality_external_parties(organization_id, id)
group_id           uuid null → quality_stakeholder_groups(organization_id, id)

CHECK: exactamente UNA no nula, y coherente con subject_kind
```

**No es `subject_type` / `subject_id`.** Un par genérico perdería la clave
foránea, y con ella el aislamiento estructural por `(organization_id, id)` que
en esta casa es la primera barrera —la RLS es la segunda—. Dos columnas
nulables con FK compuesta cuestan una columna más y garantizan que un análisis
no pueda apuntar a una fila inexistente ni de otra empresa.

| | |
|---|---|
| Identidad | estable por análisis; el **sujeto** es la identidad de negocio |
| Temporal | **evaluación fechada** — `assessed_on`, `effective_from`, `effective_to` |
| Columnas | `category_id` · `subject_kind` · `external_party_id` · `group_id` · `assessed_on` · `assessed_by` · `relevance_status` · `relevance_rationale` · `priority_label` · `priority_score` · `priority_derivation` jsonb · `methodology_version_id` null · `owner_position_id` · `effective_from` · `effective_to` · `supersedes_id` · `status` |
| Unicidad | como mucho **un** análisis vigente por `(sujeto, category_id)` — índice parcial sobre `effective_to is null` |
| Pertinencia | `relevant` / `not_relevant` / `under_review`; `relevance_rationale` **obligatorio** si `not_relevant` (PI-11) |
| Prioridad | **Opcional siempre** (PI-26). `priority_label` cualitativo **o** `priority_score` + `derivation` con la metodología y su versión (PI-27). Un número nunca se enseña sin su origen (PI-39) |
| Borrado | **prohibido**. Se cierra vigencia y se sucede con `supersedes_id` |
| RLS | lectura miembro · escritura gestor |
| Precedente | `quality_risk_assessments` (evaluación fechada con derivación y justificación) |

**Por qué evaluación y no revisión publicada:** un proceso se publica y su
versión anterior queda derogada; un juicio sobre una parte interesada se emite
y el siguiente lo **sucede** sin negarlo. Elegir `quality_process_revisions`
aquí obligaría a un `revision_number` y a un `published_at` que no significan
nada para esto.

---

## 4 · `quality_stakeholder_requirements`

**Propósito.** Necesidad, expectativa y requisito. **Una tabla, tres tipos**,
porque el ciclo de vida es el mismo y la conversión debe conservar el origen
(PI-13). Tres tablas obligarían a copiar la fila al convertir, que es
exactamente perder la trazabilidad.

| | |
|---|---|
| Identidad | estable |
| Pertenencia | `assessment_id` → el análisis del que salió |
| Tipo | `entry_kind ∈ {need, expectation, requirement}` |
| Subtipo | `requirement_kind ∈ {legal, regulatory, contractual, standard, internal_commitment, other}` — **obligatorio si** `entry_kind = requirement`, **nulo si no** (CHECK) |
| Conversión | `derived_from_id` → la necesidad/expectativa de origen · `converted_at` · `converted_by` · `conversion_rationale` |
| Pertinencia | `relevance_status` + `relevance_rationale` + `effective_from/to` (PI-15) |
| Evidencia | por `work_references` con `relation = 'evidence'`; los cuatro subtipos duros la exigen (PI-14) |
| Borrado | **prohibido**. Se cierra vigencia |
| Unicidad | `(organization_id, code)` cuando la organización usa códigos |
| RLS | lectura miembro · escritura gestor |
| Precedente | `quality_supplier_requirements` (identidad estable + asignación con vigencia) |

**Frontera con `quality_supplier_requirements`:** aquel es lo que la
organización **exige** a sus proveedores; este es aquello a lo que la
organización **queda sujeta**. Direcciones opuestas. Un requisito de 4.2 puede
referenciar uno de proveedor, nunca sustituirlo (PI-16).

---

## 5 · `quality_stakeholder_requirement_processes`

**Propósito.** Qué procesos gestionan un requisito. **Requisito↔proceso, no
parte↔proceso** (PI-17); la relación parte↔proceso se deriva (PI-18).

| | |
|---|---|
| Identidad | estable |
| FK | `requirement_id` · `process_id` → `quality_processes(organization_id, id)` |
| Instantánea | `process_revision_id` null → contra qué revisión se juzgó (PI-19) |
| Temporal | `effective_from` / `effective_to` |
| Unicidad | un vínculo **vigente** por `(requirement_id, process_id)` |
| Relación | `link_kind ∈ {addressed_by, affects, monitored_by}` |
| Borrado | se cierra vigencia; se admite `delete` solo de un vínculo **creado por error y sin historia**, y se decide en 12.3B |
| RLS | igual |

**Por qué tabla y no `work_references`:** este vínculo tiene vigencia propia,
instantánea de revisión y un vocabulario de relación específico.
`work_references` tiene tres relaciones genéricas y ningún periodo: forzarlo
aquí convertiría su `snapshot` en un almacén de reglas.

---

## 6 · `quality_stakeholder_strategies`

**Propósito.** Qué hará la organización: comprender, relacionarse, satisfacer,
vigilar (PI-20).

| | |
|---|---|
| Identidad | estable |
| Alcance | `assessment_id` (la parte). Los requisitos atendidos van en la tabla 7, **no** en una columna: tenerlo en dos sitios permitiría que se contradijeran (PI-20) |
| Temporal | `effective_from` / `effective_to` · `status ∈ {draft, active, superseded, cancelled}` |
| Columnas | `title` · `purpose` · `approach` · `owner_position_id` · `monitoring_method` · `monitoring_note` · `review_cadence_months` null · `next_review_on` · `supersedes_id` |
| Seguimiento | `monitoring_method` del vocabulario de PI-24 |
| Enlaces | **todos por `work_references`**: indicadores, objetivos, riesgos, oportunidades, acciones, campañas, evaluaciones, documentos (PI-21) |
| Dueño | **cargo**, nunca persona (PI-22, T-02) |
| Borrado | **prohibido**; se cancela o se sucede |
| Unicidad | como mucho una `active` **general** por `assessment_id` (sin requisitos enlazados) — índice parcial. Las específicas conviven: una parte puede tener varias estrategias, cada una para requisitos distintos |
| RLS | igual |

---

## 7 · `quality_stakeholder_strategy_requirements` ← **core, añadida en 12.3A.1**

**Propósito.** Qué requisitos atiende una estrategia. Es la relación que hace
que el alcance sea inequívoco.

**Por qué NO puede ser `work_references`** — las tres razones, comprobadas
contra el esquema:

1. **No hay relación tipada.** Solo `origin`, `evidence`, `related`. «Esta
   estrategia atiende este requisito» no es ninguna de las tres, y meterla en
   `related` haría indistinguible «lo atiende» de «tiene algo que ver con él».
2. **No hay integridad referencial.** `ref_id` es un uuid sin FK: una estrategia
   podría decir atender un requisito borrado, o de otra empresa.
3. **No hay vigencia.** Una estrategia puede dejar de atender un requisito sin
   que ninguno de los dos desaparezca, y eso hay que poder fecharlo.

| | |
|---|---|
| Identidad | estable |
| FK | `strategy_id` y `requirement_id`, ambas **compuestas** por `(organization_id, id)` |
| Temporal | `effective_from` / `effective_to` |
| Unicidad | un enlace **vigente** por `(strategy_id, requirement_id)` |
| Columnas | `coverage_note` — qué parte del requisito atiende, cuando no lo atiende entero |
| Borrado | se cierra vigencia |
| RLS | igual |

Las dos consultas que exigía la revisión quedan resueltas por FK, no por
convención:

```
¿Qué requisitos atiende esta estrategia?   strategy_id   → enlaces → requisitos
¿Qué estrategias atienden este requisito?  requirement_id → enlaces → estrategias
```

Y el alcance se lee del conteo de enlaces: cero = general de la parte, uno =
específica, N = varias.

---

## 8 · `quality_stakeholder_reviews`

**Propósito.** Dejar constancia de que se revisó, **incluso cuando no cambió
nada** (PI-29).

| | |
|---|---|
| Identidad | estable, append-only |
| Alcance | `assessment_id`, o `strategy_id`, o los dos |
| Columnas | `reviewed_on` · `reviewed_by` · `owner_position_id` · `verdict ∈ {no_changes, changes_applied, escalated}` · `note` · `next_review_on` |
| Temporal | punto en el tiempo; no tiene vigencia |
| Borrado | **prohibido** |
| Efecto | actualiza `last_reviewed_at` / `next_review_due` de su objeto; no crea versión nueva si el veredicto es `no_changes` |
| RLS | igual |

**Por qué existe:** sin ella, «lo revisamos y sigue igual» exigiría crear una
versión falsa, o no podría decirse. Las dos salidas son peores que una tabla de
seis columnas.

---

## 9 · Ampliaciones de catálogos existentes (sin tablas nuevas)

| Objeto | Qué se añade |
|---|---|
| `work_references.owner_kind` | `stakeholder_assessment` · `stakeholder_requirement` · `stakeholder_strategy` · `stakeholder_review` |
| `work_references.ref_kind` | `quality_stakeholder_assessment` · `quality_stakeholder_requirement` · `quality_stakeholder_strategy` |
| `quality_management_review_input_catalog` | fila `interested_parties`, `source_domain = 'interested_parties'` |
| `quality_automation_event_catalog` | 6 eventos, dominio `context` (ver arquitectura §10) |
| `quality_automation_event_contracts` | su `subject_type` y `resolver` |
| `quality_ai_sources` | `interested_party` y `interested_party_strategy`, `open` / `as_of` |

Todo es **append-only**: insertar filas y ampliar CHECK. Ninguna migración
histórica se toca, ningún dato existente se reescribe.

---

## 10 · Diagrama

```
quality_external_parties ──┐
                           ├─→ quality_stakeholder_assessments ──→ quality_stakeholder_categories
quality_stakeholder_groups ┘            │
                                        ├─→ quality_stakeholder_requirements
                                        │        │   └─ derived_from_id (auto-referencia: la conversión)
                                        │        └─→ quality_stakeholder_requirement_processes ──→ quality_processes
                                        │                              (core: vigencia + revisión)      (+ revisión)
                                        ├─→ quality_stakeholder_strategies ──→ quality_positions
                                        │            └─→ quality_stakeholder_strategy_requirements ──┐
                                        │                       (core: vigencia + tipada)            │
                                        │                                                            ▼
                                        │                                    quality_stakeholder_requirements
                                        └─→ quality_stakeholder_reviews

           lo PERIFÉRICO ──→ work_references ──→ indicadores · objetivos · riesgos · oportunidades ·
                                                 acciones · documentos · campañas · evaluaciones
```

**Ocho tablas.** Dos de ellas —las marcadas «core»— son relaciones tipadas que
`work_references` no puede expresar sin perder integridad, vigencia o
significado (PI-36, PI-37).

---

## 11 · Invariantes que la base debe garantizar

1. Exactamente **un** sujeto no nulo por análisis (`external_party_id` o
   `group_id`), coherente con `subject_kind`, y **con FK compuesta real**.
2. `requirement_kind` **no nulo** si y solo si `entry_kind = 'requirement'`.
3. `relevance_rationale` **obligatorio** cuando `relevance_status = 'not_relevant'`.
4. Como mucho **un** análisis vigente por `(sujeto, categoría)`.
5. Como mucho **una** estrategia `active` **general** por análisis. Y como
   mucho **un** enlace vigente por `(estrategia, requisito)`.
6. **Sin borrado** en análisis, requisitos, estrategias ni revisiones — como
   `output_batch_movements` y `recycled_content_calculations`.
7. `effective_to >= effective_from` en las cuatro tablas con vigencia.
8. `derived_from_id` solo puede apuntar a una fila de la **misma organización**
   y de tipo `need` o `expectation`.
9. FK **compuestas** por `(organization_id, id)`, como el resto de Quality:
   el aislamiento es estructural, no solo RLS.
10. RLS en las **ocho** tablas; escritura por `quality_manages_interested_parties`.
11. Un enlace estrategia↔requisito solo puede unir filas de la **misma**
    organización, y la estrategia y el requisito deben colgar del **mismo**
    análisis: una estrategia de la parte A no puede atender un requisito de B.
