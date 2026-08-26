# QUALITY-08 · El modelo de datos

**Migración:** `0126_quality_customer_voice.sql` · ~3 700 líneas · append-only ·
aplicada a Local y a Staging, **no** a Production.

**Recuento:** 14 tablas · 3 vistas · 21 funciones · 25 políticas RLS · 46
disparadores.

---

## 1 · La forma del dominio

```
quality_external_parties          ← la EMPRESA externa (de QUALITY-07)
├── quality_external_party_roles  ← 'customer' ya estaba en el catálogo
├── quality_external_party_sites
└── quality_external_party_contacts

quality_customer_profiles         ← esa empresa COMO CLIENTE del sistema

quality_surveys                   ← la identidad estable
└── quality_survey_versions       ← la estructura CONGELADA
    └── quality_survey_questions  ← cuelgan de la VERSIÓN

quality_survey_campaigns          ← aplicar una versión a un periodo
├── quality_survey_invitations    ← a quién se invitó · hash del token
└── quality_survey_responses      ← lo que contestaron
    └── quality_survey_answers    ← valor por pregunta

quality_customer_metric_definitions
└── quality_customer_metric_results   ← con su método y su clave de comparabilidad

quality_customer_topics           ← clasificación temática humana
quality_customer_feedback         ← lo que dijeron sin encuesta
quality_customer_signals          ← qué habría que mirar
quality_customer_voice_reviews    ← el cierre formal del periodo
```

## 2 · Por qué el cliente NO es una tabla nueva

**VC-03 · El cliente es un PAPEL de la empresa externa.**

QUALITY-07 ya creó `quality_external_parties` y su catálogo de papeles ya
admitía `'customer'`. Crear `quality_customers` habría dado el resultado
predecible: ACME dos veces en la misma base, una como proveedor y otra como
cliente, con dos direcciones que se desincronizan.

Lo que se creó es `quality_customer_profiles`: el PERFIL del cliente, hermano
de `quality_supplier_profiles`. Un único `(organization_id, party_id)` impide
duplicar la relación, y la vista de la ficha dice `is_also_supplier` cuando la
misma empresa juega los dos papeles.

Sus **sedes y contactos se comparten**, porque son de la empresa y no del papel.
Por eso no existe `quality_customer_contacts`.

## 3 · El puente con PCR

`customer_requirements` de PCR identifica al cliente con `customer_name TEXT` y
nada más — el patrón que §6 prohíbe repetir. No se migró ese texto: tocarlo
movería la cadena de evidencias y ejercicios de trazabilidad de PCR. Pero sí se
abrió el puente, igual que QUALITY-07 hizo con los proveedores:

```sql
alter table public.customer_requirements add column external_party_id uuid;
```

Columna nueva y **opcional**. PCR sigue funcionando con Quality apagado.

## 4 · Encuesta ≠ versión ≠ campaña ≠ respuesta

| Objeto | Qué es | Qué congela |
|---|---|---|
| `quality_surveys` | la identidad estable | nada: sobrevive a sus cambios |
| `quality_survey_versions` | la estructura publicada | preguntas, orden, tipo, obligatoriedad, opciones, escalas |
| `quality_survey_campaigns` | aplicar una versión a un periodo y una población | la versión con la que se recogió, y el anonimato |
| `quality_survey_responses` | lo que contestó alguien | su versión y su contenido, para siempre |

Los criterios cuelgan de la **versión**. Si colgaran de la encuesta, cambiar una
escala en 2028 haría que todas las respuestas anteriores significaran otra cosa
sin que nadie las hubiera tocado.

`quality_survey_questions.stable_key` es la identidad que atraviesa versiones.
Sin ella, comparar «la pregunta de entregas» entre 2027 y 2028 dependería de que
siguiera siendo la tercera, y bastaría insertar una para romper la serie.

## 5 · Lo inmutable

| Registro | Guarda | Por qué |
|---|---|---|
| Versión publicada | `quality_survey_version_is_published` | cambiar una pregunta cambia lo que contestó quien ya respondió |
| Respuesta enviada | `quality_response_is_submitted` | un «5» no se convierte en «10» |
| Valores de una enviada | `quality_answer_parent_is_open` | cambiarlos mueve el resultado por la puerta de atrás |
| Resultado de métrica | `quality_ro_record_is_immutable` | recalcular con otra fórmula lo cambiaría en silencio |
| Cierre de periodo | `quality_voice_review_is_closed` | es un acto formal de la empresa |
| Anonimato de la campaña | `quality_campaign_anonymity_is_final` | prometer anonimato y revelarlo después es una trampa |

## 6 · Lo que NO se creó

| Lo que hacía falta | Lo que se usó |
|---|---|
| tareas del dominio | `work_tasks` ensanchada con 4 tipos |
| alertas del dominio | `work_alerts` ensanchada con 6 tipos |
| acciones de mejora | `work_actions` con `work_references` |
| casos de queja | `work_cases` — `case_type='complaint'` **ya existía** |
| indicadores de satisfacción | `quality_native_source_keys` ensanchado con 4 fuentes |
| decisiones formales | `work_decisions` con un `decision_kind` nuevo |

Dos cosas no hubo que tocar, porque QUALITY-04 ya las había previsto:
`work_cases.case_type` admitía `'complaint'` y `origin_kind` admitía
`'customer'`. Un caso abierto desde una queja nace con
`classification = 'pending'`, que es exactamente lo que §30 exige.

## 7 · «No aplica» no es un cero

`quality_survey_answers.outcome` tiene tres valores y solo uno cuenta:

| Valor | Qué significa | ¿Entra en el cálculo? |
|---|---|---|
| `answered` | se contestó | sí |
| `not_applicable` | no se le puede preguntar eso | **no** |
| `skipped` | se dejó en blanco | **no** |

Y una restricción lo impone: `outcome <> 'answered'` obliga a que los tres
campos de valor sean nulos. Sin ella, «no aplica» acabaría guardado como `0` por
cualquier formulario descuidado, y el resultado bajaría por algo que nadie
contestó.
