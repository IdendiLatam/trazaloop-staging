# QUALITY-12.3A · Partes interesadas · ARQUITECTURA

> Congelación de decisiones **PI-01 … PI-39**. Sin implementación.
> Corregida por la revisión humana: ver
> [ARCHITECTURE_REVIEW](./QUALITY_12_3_ARCHITECTURE_REVIEW.md).
> Base: `a1bfd53` · Local 0148. Ver
> [DISCOVERY](./QUALITY_12_3_INTERESTED_PARTIES_DISCOVERY.md).

---

## 0 · La idea en una frase

**Una parte interesada no es un formulario: es un sujeto que ya existe en la
plataforma, sobre el que se hace un análisis fechado, del que salen requisitos
pertinentes que se conectan a procesos, y una estrategia que se apoya en los
motores que ya están construidos.**

Cuatro capas, y ninguna duplica nada:

```
IDENTIDAD          quality_external_parties · quality_org_units · catálogo de grupos
    ↓ (sujeto polimórfico)
ANÁLISIS           quién es para nosotros, en qué periodo, con qué prioridad
    ↓
REQUISITOS         necesidad → expectativa → requisito, con pertinencia explícita
    ↓                                  ↘ vínculo a procesos
ESTRATEGIA         qué haremos, quién responde, cómo lo vigilamos
                              ↘ enlaza a OI · RO · AC · VC · GP · documentos
```

---

## 1 · Identidad · PI-01 … PI-05

**PI-01 · La identidad NO se crea.** Una parte interesada externa y concreta
**es** una `quality_external_parties`. Está congelado en GP-02/GP-33 y ya lo
apuntan nueve claves foráneas, incluidas PCR y Textiles. Crear una identidad
propia sería el tercer proveedor de la casa.

**PI-02 · El sujeto del análisis tiene DOS tipos, ambos con clave foránea
compuesta real.** *(modificada en 12.3A.1: eran tres)*

| `subject_kind` | Apunta a | Ejemplo |
|---|---|---|
| `external_party` | `quality_external_parties(organization_id, id)` | Cliente ABC, Proveedor XYZ, ente certificador |
| `group` | `quality_stakeholder_groups(organization_id, id)` | Trabajadores, Dirección, la comunidad del entorno, la academia |

Un CHECK obliga a que exactamente una de las dos referencias esté presente y
sea coherente con `subject_kind`. **No es un `subject_type` / `subject_id`
genérico:** eso perdería la clave foránea y con ella el aislamiento
estructural por `(organization_id, id)`, que en esta casa es la primera
barrera y no la RLS.

Inventar una fila «Comunidad» en el registro de entidades externas sería meter
en él algo que no es una entidad, y lo verían PCR y Textiles.

**PI-03 · Los grupos son un catálogo de la organización**, no texto libre, y
cubren tanto lo genérico externo —la comunidad, la academia— como los
**colectivos internos** —trabajadores, dirección, propietarios—. *(modificada
en 12.3A.1: antes solo lo genérico.)* Mismo patrón que
`quality_process_categories`. Texto libre haría que «Comunidad» y «comunidad
local» fueran dos partes distintas en el mismo informe.

**PI-38 · El organigrama NO es una parte interesada.** *(nueva en 12.3A.1.)*
`quality_org_units` es la estructura sobre la que cuelgan cargos y personas. Un
colectivo con intereses no es una casilla del organigrama: «Trabajadores»
atraviesa varias unidades, y «Dirección» como parte interesada no es la misma
cosa que la unidad de la que dependen tres cargos. Usarlo como sujeto habría
sido elegirlo por existir, y habría atado los sujetos del análisis 4.2 a cada
reorganización interna.

**Diferido:** si hace falta anclar un grupo a una unidad concreta
—«trabajadores de planta 2»—, se añade una FK nulable `org_unit_id` **al
grupo**, no un tercer tipo de sujeto. Append-only, sin tocar consultas.

**PI-04 · Una entidad puede ser parte interesada por varias razones**, y eso no
la duplica: son varias filas de análisis sobre el **mismo** sujeto, cada una
con su categoría. Un mismo proveedor puede importar como proveedor y como
vecino de la planta.

**PI-05 · Los papeles de entidad externa y las categorías de parte interesada
son ejes distintos y no se mezclan.** `quality_external_party_roles.role_code`
responde «¿qué me vende?»; la categoría responde «¿por qué me importa para el
SGC?». Fundirlos obligaría a ampliar un CHECK cada vez que aparezca una parte
que no comercia con la organización. La interfaz PUEDE proponer la categoría a
partir del papel; no la deriva sola.

---

## 2 · Taxonomía · PI-06 … PI-08

**PI-06 · Catálogo configurable por organización, con semilla no sectorial.**
Se propone sembrar: clientes · usuarios finales · trabajadores · propietarios y
accionistas · proveedores · contratistas · autoridades · entes reguladores ·
comunidad · aliados · academia · organismos de certificación · aseguradoras ·
entidades financieras · otros. **Todas editables y desactivables.** Ninguna
obligatoria: una consultora de tres personas no tiene «comunidad del entorno» y
no debe verse obligada a justificar por qué no la tiene.

**PI-07 · Una categoría desactivada NO borra los análisis que la usaron.** Es
Historical Truth: lo que se clasificó así, así se clasificó.

**PI-08 · Las categorías son de la organización, no de la plataforma.** Se
siembran al activar el módulo, como `quality_process_categories`. Nada impide
que una organización trabaje con tres.

---

## 3 · Identidad vs análisis · PI-09 … PI-11

**PI-09 · La separación es obligatoria.** «Cliente ABC» es una entidad;
«en 2026 ABC nos importa por entregas a tiempo, con influencia alta, y la
estrategia es seguimiento mensual» es un análisis. El análisis evoluciona sin
crear una parte nueva.

**PI-10 · El análisis es una EVALUACIÓN FECHADA, no una revisión publicada.**
Se sigue el patrón de `quality_risk_assessments`, no el de
`quality_process_revisions`: hay `assessed_on`, `rationale`, opcionalmente una
metodología de priorización y su `derivation`. Un proceso se publica; un juicio
sobre una parte interesada se **emite**, y el siguiente no deroga al anterior:
lo sucede.

**PI-11 · La pertinencia vive en el análisis, con vigencia.** Que una parte
sea pertinente es una afirmación fechada, no un atributo permanente de la
entidad. `relevance_status ∈ {relevant, not_relevant, under_review}` con
`effective_from` / `effective_to` y justificación **obligatoria** cuando se
declara `not_relevant`: descartar una parte sin decir por qué es exactamente lo
que un auditor pregunta.

---

## 4 · Necesidad, expectativa y requisito · PI-12 … PI-16

**PI-12 · Son TRES cosas, no tres palabras para lo mismo.**

| | Qué es | Quién lo afirma | Consecuencia |
|---|---|---|---|
| **Necesidad** | lo que la parte requiere para que la relación funcione | la organización, al analizarla | ninguna por sí sola |
| **Expectativa** | lo que la parte da por supuesto aunque no lo pida | la organización, al analizarla | ninguna por sí sola |
| **Requisito** | aquello a lo que la organización **queda sujeta** | una fuente citable | obliga |

**PI-13 · Una necesidad o expectativa se CONVIERTE en requisito; no se
reetiqueta.** Se conserva de qué necesidad vino (`derived_from_id`), quién lo
decidió y por qué. Sin eso, dentro de un año nadie sabrá si el SLA era una
petición del cliente o una decisión propia.

**PI-14 · El requisito tiene subtipo, y el subtipo manda sobre la evidencia**:

| `requirement_kind` | Fuente típica | ¿Exige referencia? |
|---|---|---|
| `legal` | ley, decreto, resolución | **sí** |
| `regulatory` | resolución de un ente | **sí** |
| `contractual` | contrato, orden de compra, SLA | **sí** |
| `standard` | norma aplicable | **sí** |
| `internal_commitment` | política, compromiso propio | recomendada |
| `other` | — | recomendada |

«Evidence not claims»: un requisito legal sin referencia a su fuente es una
afirmación, no un requisito. La referencia se hace por `work_references`, no
con una columna de texto.

**PI-15 · La pertinencia del requisito es explícita, fechada y auditable**, con
los mismos tres estados que la de la parte. Un requisito deja de ser pertinente
sin borrarse: **nunca se elimina**, se cierra su vigencia.

**PI-16 · No se recrea el modelo de requisitos de proveedor.**
`quality_supplier_requirements` sigue siendo el requisito **que la organización
impone a sus proveedores** — dirección contraria. Un requisito de 4.2 puede
apuntarlo como referencia, pero no lo sustituye ni lo absorbe.

---

## 5 · Relación con procesos · PI-17 … PI-19

**PI-17 · Se enlaza el REQUISITO al proceso, no la parte al proceso.** Un
proceso no se ve afectado por «el cliente ABC» en abstracto: se ve afectado por
*algo concreto* que ABC necesita. Enlazar la parte directamente daría un
diagrama denso e inútil.

**PI-18 · La relación parte↔proceso se DERIVA**, no se guarda. «¿Qué partes
afectan a este proceso?» se responde recorriendo requisitos→procesos. Guardarla
además crearía dos verdades que se desincronizan, que es exactamente lo que
«Zero Duplicate Management» prohíbe.

**PI-19 · El vínculo apunta al proceso por FK, nunca por nombre.** Y se guarda
el `revision_id` vigente en el momento del vínculo cuando el requisito exige
saber contra qué versión del proceso se juzgó — el mismo patrón de instantánea
que 0142 usó para la aplicabilidad de la evidencia.

Las dos preguntas quedan respondidas:

```
¿Qué partes interesadas afectan este proceso?
  proceso ← vínculo ← requisito ← análisis ← sujeto

¿Qué procesos gestionan las necesidades de esta parte?
  sujeto → análisis → requisito → vínculo → proceso
```

---

## 6 · Estrategia de gestión · PI-20 … PI-23

**PI-20 · La estrategia es una entidad de primera clase, y su ALCANCE se
expresa por enlaces.** *(modificada en 12.3A.1.)* Sin ella, 4.2 es una lista.

Campos: `purpose` · `approach` · `owner_position_id` **(cargo, T-02)** ·
`status` · `effective_from/to` · `review_cadence_months` · `next_review_on` ·
`monitoring_method` · `monitoring_note`.

El alcance **no** es una columna:

| Alcance | Se expresa como |
|---|---|
| General de la parte | estrategia con **cero** requisitos enlazados |
| Específica de un requisito | **un** enlace |
| Específica de varios | **N** enlaces |

Tener el alcance en dos sitios —una columna `requirement_id` y una tabla de
enlace— permitiría que se contradijeran. Un solo motor de estrategia, un solo
sitio donde vive su alcance.

**PI-36 · La relación estrategia ↔ requisito es CORE y TIPADA.** *(nueva en
12.3A.1.)* No cabe en `work_references`, comprobado contra el esquema real:
esa tabla solo admite `origin`, `evidence` y `related` —«lo atiende» no es
ninguna de las tres—, sus `owner_id` y `ref_id` **no tienen clave foránea**, y
no tiene vigencia. Una estrategia podría decir atender un requisito borrado o
de otra empresa sin que nada chirriara.

**PI-21 · La estrategia NO recrea ningún motor.** *(enunciado corregido en
12.3A.1.)* Enlaza, por `work_references`, a: indicadores · objetivos · riesgos ·
oportunidades · acciones · campañas de voz del cliente · evaluaciones de
proveedor · documentos.

El principio **no** es «cero tablas de enlace» —eso era falso ya en 12.3A, con
`_requirement_processes` en la misma propuesta—. Es:

**PI-37 · ZERO REDUNDANT LINK TABLES.** *(nueva en 12.3A.1.)*

| La relación… | Va en |
|---|---|
| define el dominio y necesita integridad referencial, vigencia o vocabulario propio | **tabla core tipada** |
| es transversal o periférica: evidencia, origen, «relacionado con» | **`work_references`** |

Reducir tablas a costa de la semántica de negocio no es simplificar: es perder
integridad para que un recuento salga más bonito.

**PI-22 · La dueña es un CARGO, nunca una persona.** T-02. Si el cargo cambia
de ocupante, la estrategia sigue teniendo dueño.

**PI-23 · Una estrategia sin dueño o sin método de seguimiento es una
estrategia incompleta, y se dice.** No se bloquea el guardado —una estrategia
se redacta en varias sesiones— pero el tablero la señala y la automatización
puede avisar. Fail Closed aplica a la autorización y al cálculo, no a la
redacción.

---

## 7 · Seguimiento y satisfacción · PI-24 … PI-25

**PI-24 · No toda parte interesada se mide con una encuesta.** El mecanismo de
seguimiento es un vocabulario explícito: `survey` · `indicator` ·
`periodic_evaluation` · `meeting` · `complaint` · `sla` · `audit` · `feedback` ·
`regulatory_compliance` · `document` · `other`.

**PI-25 · Cuando el mecanismo tiene motor, se usa el motor.**

| Mecanismo | Motor existente |
|---|---|
| encuesta / retroalimentación de clientes | `quality_survey_*`, `quality_customer_feedback`, `quality_customer_voice_reviews` |
| evaluación de proveedores | `quality_supplier_evaluations`, `_criticality_assessments`, `_incidents` |
| indicador | `quality_indicators` + `quality_measurements` |
| auditoría | `quality_audits` (con `quality_audit_scope_items`, que ya apunta a party) |
| queja | `work_cases` |
| documento | TrazaDocs |

El seguimiento **referencia** ese motor. No hay encuestas paralelas ni
evaluaciones paralelas.

---

## 8 · Priorización · PI-26 … PI-27

**PI-26 · La plataforma FUNCIONA SIN PUNTUACIÓN.** *(reescrita en 12.3A.1.)*
No hay metodología obligatoria, ni cuadrícula poder/interés impuesta. Una
organización puede trabajar la 4.2 entera sin asignar un solo número, y eso no
es un uso degradado: es el uso normal.

**PI-27 · Se ofrece UNA plantilla sugerida, configurable.** *(reescrita en
12.3A.1.)* Influencia × impacto, con los ejes definidos —porque un eje sin
definición se rellena a ojo y luego se defiende como si fuera medida—:

| Eje | Qué mide |
|---|---|
| **Influencia** | capacidad de la parte para **afectar** a la organización, al sistema de gestión o al logro de los resultados previstos |
| **Impacto** | consecuencia potencial **para la organización** de no atender sus requisitos pertinentes |

Se sigue el precedente de riesgos y de criticidad de proveedor: metodología
versionada, factores, escala y `derivation` en JSONB con el rastro del cálculo.
La organización puede cambiarla o no usar ninguna.

**PI-39 · Un número no es una verdad objetiva, y la interfaz no lo presenta
como tal.** *(nueva en 12.3A.1.)* La puntuación se enseña **siempre** junto a
su metodología, su versión y su justificación. Sin metodología se admite una
prioridad cualitativa declarada (`high`/`medium`/`low`) con justificación, que
es más honesta que un 7,4 sin origen.

---

## 9 · Historia y revisión · PI-28 … PI-30

**PI-28 · Historical Truth por identidad estable + vigencia + sucesión.** Ni
`audit_log` ni ninguna bitácora técnica es la fuente de verdad empresarial
(T-04). Las preguntas que hay que poder responder:

| Pregunta | Se responde con |
|---|---|
| ¿Qué partes eran pertinentes el 30/06/2026? | análisis con `relevance_status = relevant` y vigencia que cubre esa fecha |
| ¿Qué necesidades se conocían? | filas del análisis vigente entonces |
| ¿Cuáles eran requisitos pertinentes? | requisitos con pertinencia vigente en esa fecha |
| ¿Qué estrategia regía? | estrategia con `effective_from/to` que cubre esa fecha |
| ¿Qué procesos estaban relacionados? | vínculos vigentes, con la revisión de proceso registrada |
| ¿Qué cambió y cuándo? | sucesión de análisis + eventos de dominio |

**PI-29 · Una revisión SIN cambios es un hecho registrable, y no es lo mismo
que un cambio.** Se registra la revisión con su fecha, su responsable, su
veredicto (`no_changes` / `changes_applied` / `escalated`) y su nota. Forzar a
crear una versión nueva para poder decir «lo revisamos y sigue igual» sería
fabricar información falsa; no poder decirlo sería perder la prueba de que se
revisó.

**PI-30 · La cadencia es opcional y configurable.** `review_cadence_months`
nulable, `last_reviewed_at`, `next_review_due` derivado. La 4.2 no dice
«anualmente», y la plataforma tampoco.

---

## 10 · Integración con el resto · PI-31 … PI-32

**PI-31 · Lo PERIFÉRICO se enlaza por `work_references`.** *(acotada en
12.3A.1: antes decía «todo».)* Indicadores, objetivos, riesgos, oportunidades,
acciones, campañas, evaluaciones y documentos. Se añaden valores a dos CHECK
—`owner_kind` y `ref_kind`— y no se crea una tabla por pareja: sin esto harían
falta al menos seis tablas más.

Lo **core** —requisito↔proceso y estrategia↔requisito— no va aquí (PI-36,
PI-37).

**PI-32 · Un hallazgo de revisión de partes interesadas puede originar una
acción; NUNCA una no conformidad automática.** Coherente con AC: hallazgo ≠ no
conformidad. Quien clasifica es una persona.

### Revisión por la Dirección

Se añade una entrada al catálogo, `interested_parties`, con
`source_domain = 'interested_parties'`. Aporta: partes que entraron o salieron
de pertinencia en el periodo · requisitos nuevos y retirados · estrategias
vencidas o sin dueño · indicadores enlazados que se deterioraron · riesgos
relacionados · acciones abiertas. **No se crea un informe paralelo**: se usa la
arquitectura de RD que ya existe.

### Automatización

Eventos candidatos, sujetos a revisión contra AT-01…AT-45 en 12.3B:

| Evento | Sujeto |
|---|---|
| `interested_party.assessed` | análisis |
| `interested_party.relevance_changed` | análisis |
| `interested_party.requirement_added` | requisito |
| `interested_party.requirement_relevance_changed` | requisito |
| `interested_party.strategy_published` | estrategia |
| `interested_party.review_recorded` | revisión |

Reglas candidatas: revisión vencida · requisito pertinente sin proceso
enlazado · parte de prioridad alta sin estrategia vigente · estrategia sin
dueño · estrategia sin método de seguimiento.

**La automatización determinista y la sugerencia de IA no se mezclan.** Lo
determinista emite señal; la IA propone y una persona decide.

### Intelligence

Dos fuentes nuevas en `quality_ai_sources`, sin tocar el proveedor:

| `code` | `privacy_class` | `historical_mode` |
|---|---|---|
| `interested_party` | `open` | `as_of` |
| `interested_party_strategy` | `open` | `as_of` |

`as_of` porque la pregunta natural es «¿qué era pertinente en tal fecha?».
Casos de uso futuros: resumir partes pertinentes · detectar requisitos sin
estrategia · procesos con más exposición · preparar la RD · comparar periodos ·
señalar estrategias sin evidencia de seguimiento. **Nada de esto se implementa
en 12.3.**

---

## 11 · Evidencia, autorización y forma · PI-33 … PI-35

**PI-33 · La evidencia se referencia, no se copia ni se sube aquí.** Ningún
fichero propio del dominio. Un requisito, una estrategia o una revisión apuntan
a un documento de TrazaDocs, a un caso, a una medición o a una evaluación
mediante `work_references` con `relation ∈ {origin, evidence, related}`. Lo que
esta capa aporta es el **vínculo con su justificación**, no una copia del
documento.

**PI-34 · Autorización con el patrón de Quality, sin inventar nada.** Lectura
para cualquier miembro; escritura para
`quality_manages_interested_parties(organization_id) := has_org_role(org,
array['admin','quality','consultant'])`. Sin lectura restringida: una parte
interesada no es un dato sensible de persona. **Entitlement ≠ autorización**:
tener el módulo Quality y poder escribir son dos comprobaciones distintas y las
dos aplican. RLS multiinquilino en las **ocho** tablas, con FK compuestas por
`(organization_id, id)` para que el aislamiento sea estructural y no solo de
política. **Sin `service_role` en runtime.**

**PI-35 · La interfaz es de profundidad, no una hoja de cálculo, y vive en un
grupo «Contexto».** *(ampliada en 12.3A.1.)* El grupo se llama **Contexto**
porque 4.1 —contexto de la organización— compartirá sitio con 4.2 cuando
exista: son la entrada del sistema, no un apéndice de desempeño. El detalle
de una parte se recorre por capas —análisis, necesidades, requisitos, procesos,
estrategia, seguimiento, evidencias, historia—. Y el tablero **no llama
«desempeño» a que un formulario esté completo**: que una estrategia esté
redactada no dice si funciona; eso lo dicen sus indicadores.

---

## 12 · Matriz de decisiones PI-01 … PI-39

Las marcadas ▲ cambiaron en 12.3A.1; las ★ son nuevas. El detalle del delta
está en [ARCHITECTURE_REVIEW](./QUALITY_12_3_ARCHITECTURE_REVIEW.md).

| Tema | Decisiones |
|---|---|
| Identidad y sujeto | PI-01 · **PI-02 ▲** · **PI-03 ▲** · PI-04 · PI-05 · **PI-38 ★** |
| Categorías | PI-06 · PI-07 · PI-08 |
| Identidad vs análisis | PI-09 · PI-10 |
| Pertinencia | PI-11 · PI-15 |
| Necesidades y expectativas | PI-12 · PI-13 |
| Requisitos | PI-12 · PI-14 · PI-16 |
| Vínculo con procesos | PI-17 · PI-18 · PI-19 |
| Estrategias | **PI-20 ▲** · **PI-21 ▲** · PI-22 · PI-23 · **PI-36 ★** |
| Frontera core / periférico | **PI-37 ★** |
| Seguimiento y satisfacción | PI-24 · PI-25 |
| Priorización | **PI-26 ▲** · **PI-27 ▲** · **PI-39 ★** |
| Historia | PI-28 |
| Revisiones | PI-29 · PI-30 |
| Evidencia | PI-14 · PI-33 |
| Riesgos y oportunidades | PI-31 ▲ |
| Objetivos e indicadores | PI-31 ▲ |
| Acciones | PI-31 ▲ · PI-32 |
| Revisión por la dirección | PI-31 ▲ |
| Automatización | PI-31 ▲ |
| Intelligence | PI-31 ▲ |
| Autorización | PI-34 |
| Forma de la interfaz | **PI-35 ▲** |

---

## 13 · Conflictos con lo ya congelado, y cómo se resuelven

| # | Tensión | Resolución |
|---|---|---|
| 1 | **GP-02/GP-33** fijaron `quality_external_parties` como identidad única, pero la 4.2 incluye partes internas y colectivas | No se toca la baseline. El sujeto es polimórfico (PI-02): lo externo sigue siendo esa tabla, y lo interno y lo genérico van por otras dos que **no** compiten con ella |
| 2 | `quality_external_party_roles.role_code` es un CHECK de 7 valores y la taxonomía 4.2 no cabe | No se amplía. Son dos ejes distintos (PI-05); ampliarlo obligaría a meter «comunidad» en un vocabulario de papeles comerciales |
| 3 | `customer_requirements` conserva `customer_name` como texto junto a `external_party_id` | No se toca: es de PCR y funciona. Se documenta como advertencia y **no** se replica el patrón |
| 4 | **AC**: hallazgo ≠ no conformidad | Se hereda tal cual (PI-32): un hallazgo de revisión puede originar una acción; clasificar lo hace una persona |
| 5 | **VC**: anonimato de campañas anónimas | Se hereda: citar la voz del cliente desde aquí usa el agregado, nunca la respuesta identificada |
| 6 | **RO/OI**: no duplicar riesgos ni indicadores | Se enlazan por `work_references` (PI-21). La prueba K7 falla si aparece una tabla de enlace propia |
| 7 | **RD**: no crear informes paralelos | Fila nueva en el catálogo de entradas, con la arquitectura existente (PI-31) |
| 8 | **AT-01…AT-45**: vocabulario de eventos | Los seis eventos propuestos quedan **sujetos a revisión** contra esa baseline en 12.3B; aquí no se congelan sus nombres |
| 9 | **T-01/T-04**: tiempo de negocio e historia por dominio | El análisis usa evaluación fechada + vigencia + sucesión; `audit_log` **no** es fuente de verdad (PI-28, prueba H8) |
| 10 | **MDR**: el documento no es el fichero | Ningún fichero propio (PI-33) |

**Ninguna baseline anterior se modifica.** Donde hubo tensión, prevalece la
decisión anterior y este dominio se acomoda.

---

## 14 · Interfaz propuesta · PI-35

Grupo nuevo **«Contexto»**, junto a «Sistema de gestión» y antes de
«Desempeño»: 4.1 y 4.2 son la entrada del sistema, no un apéndice. **Aprobado
en la revisión humana**, con 4.1 compartiendo el grupo cuando exista.

```
Contexto
├── Partes interesadas        lista con categoría, prioridad, pertinencia, estado de revisión
├── Requisitos                transversal, filtrable por pertinencia, tipo y proceso
├── Estrategias               con dueño, vigencia, próxima revisión
└── (futuro) Contexto de la organización        ← 4.1, mismo grupo
```

**Detalle de una parte, con profundidad en vez de rejilla:**

```
Parte  ▸ Análisis (periodo vigente + histórico)
       ▸ Necesidades y expectativas
       ▸ Requisitos pertinentes → procesos afectados
       ▸ Estrategia vigente → indicadores · objetivos · riesgos · acciones
       ▸ Seguimiento → encuestas · evaluaciones · mediciones
       ▸ Evidencias y documentos
       ▸ Historia
```

**Tablero:** partes pertinentes por categoría · requisitos sin proceso
enlazado · estrategias vencidas o por vencer · partes de prioridad alta sin
estrategia vigente · revisiones vencidas · cambios del periodo.

**Lo que el tablero NO hace:** llamar «desempeño» a que un formulario esté
completo. Que una estrategia esté redactada no dice si funciona; eso lo dicen
sus indicadores.
