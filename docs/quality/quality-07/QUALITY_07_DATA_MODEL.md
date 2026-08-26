# QUALITY-07 · El modelo de datos

**Migración:** `0125_quality_suppliers_evaluation.sql` · 3 450 líneas ·
append-only · aplicada a Local y a Staging, **no** a Production.

**Recuento:** 21 tablas · 3 vistas · 18 funciones · 39 políticas RLS · 62
disparadores.

---

## 1 · La forma del dominio

```
quality_external_parties            ← la EMPRESA externa (transversal)
├── quality_external_party_roles    ← qué es para nosotros: proveedor, cliente…
├── quality_external_party_sites    ← sus SEDES
└── quality_external_party_contacts ← con quién se habla

quality_supplier_profiles           ← esa empresa COMO PROVEEDOR de Quality
└── quality_supplier_scopes         ← sede × categoría · la unidad de decisión
    ├── quality_supplier_criticality_assessments (+ _factors)
    ├── quality_supplier_evaluations (+ _evaluation_results)
    ├── quality_supplier_approval_decisions
    └── quality_supplier_requirement_assignments

quality_supplier_categories         ← QUÉ se compra
quality_supplier_requirements       ← QUÉ se le exige
quality_supplier_evaluation_templates
└── quality_supplier_template_versions
    └── quality_supplier_evaluation_criteria
quality_supplier_documents          ← su evidencia
quality_supplier_incidents          ← qué pasó
quality_supplier_signals            ← qué habría que mirar
```

## 2 · Por qué el ALCANCE y no el proveedor

La tentación evidente es colgar la aprobación del proveedor: una columna
`is_approved` en `quality_supplier_profiles` y listo. Esa columna responde a una
pregunta que nadie hace.

Nadie pregunta «¿ACME está aprobado?». Se pregunta «¿puedo comprarle a ACME la
resina del lote de marzo?», y eso depende de qué categoría, de qué sede y de qué
se decidió para esa combinación. Un proveedor puede estar aprobado para materia
prima y suspendido para calibración el mismo día, y las dos cosas son ciertas.

Por eso `quality_supplier_scopes` —sede × categoría, cualquiera de las dos
opcional— es la unidad sobre la que se clasifica la criticidad, se evalúa y se
decide. Las tres tablas que representan esos actos llevan `scope_id not null`,
no `profile_id`: no hay forma de escribir una decisión sin decir para qué.

Cuatro índices únicos parciales cubren las cuatro combinaciones de nulos
(sede+categoría, solo sede, solo categoría, ninguna), porque en Postgres un
`unique (a, b)` con nulos no impide el duplicado.

## 3 · Las claves compuestas

Todas las referencias entre tablas del dominio son compuestas
`(organization_id, id)` (MDR-42). No es decoración: impide por construcción que
una fila de una empresa apunte a una fila de otra, incluso si alguien logra
escribir el identificador.

El precio conocido: **PostgREST no resuelve embeds sobre clave compuesta**, y
falla en silencio —el error viaja en `error`, no en `data`, así que
`(data ?? [])` devuelve una lista vacía que parece legítima—. `lib/db/quality-suppliers.ts`
hace consultas separadas y une en memoria; no hay ni un solo embed anidado.

## 4 · Lo que NO se creó

| Lo que se pidió | Lo que se hizo |
|---|---|
| tareas del dominio | `work_tasks` ensanchada con 5 tipos |
| alertas del dominio | `work_alerts` ensanchada con 7 tipos |
| acciones de mejora | `work_actions` con `work_references` |
| casos de proveedor | `work_cases`, SIN clasificar |
| motor de criticidad | `quality_risk_methodologies` con `applies_to` ensanchado |
| decisiones formales | `work_decisions` |

MDR-46 en la práctica: el ensanche es **aditivo**. Ningún valor anterior
desaparece, así que ninguna migración de QUALITY-01…06.1 deja de validar. La
prueba I2 de `test:quality07` lo comprueba nombrando valores viejos.

## 5 · Los estados que no son un cero

`quality_supplier_evaluation_results.outcome` tiene cuatro valores y solo uno
puntúa:

| Valor | Qué significa | ¿Cuenta? |
|---|---|---|
| `scored` | se miró y se puntuó | sí |
| `not_applicable` | no se le puede pedir | **no** |
| `unavailable` | se pidió y no hubo dato | **no** |
| `not_evaluated` | todavía no se ha mirado | **no** |

Y una restricción de tabla lo impone:

```sql
check ((outcome = 'scored' and points is not null and points >= 0)
    or (outcome <> 'scored' and points is null))
```

Sin ella, «no aplica» acabaría guardado como `0` por cualquier formulario
descuidado, y el resultado de un proveedor bajaría por algo que no hizo.

## 6 · Lo inmutable

| Registro | Guarda | Por qué |
|---|---|---|
| Decisión de aprobación | `quality_supplier_decision_is_immutable` | MDR-49 · un acto formal no se corrige, se sustituye |
| Clasificación de criticidad | `quality_ro_record_is_immutable` | reclasificar es clasificar otra vez |
| Evaluación cerrada | `quality_supplier_evaluation_is_closed` | la comparación entre periodos deja de valer si el pasado se mueve |
| Resultados de una cerrada | `quality_supplier_result_parent_is_open` | cambiar un criterio cambia la puntuación por la puerta de atrás |

Las dos últimas se añadieron **después** de que la suite RLS demostrara que un
`update` normal reescribía la puntuación de una evaluación de hace dos años.
Ver `QUALITY_07_TEST_MATRIX.md` §5.
