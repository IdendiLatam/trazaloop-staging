# QUALITY-12.3A.1 · Revisión de arquitectura · CORRECCIÓN Y CONGELACIÓN FINAL

> Revisión humana de la arquitectura entregada en `3eb8526`.
> Solo documentación. Local 0148 · Staging 0148 · Production 0111.

---

## 1 · Decisiones humanas incorporadas

| | Decisión | Efecto |
|---|---|---|
| **1** | Las 15 categorías se aprueban como **semilla editable**, no taxonomía cerrada. Clientes ≠ Usuarios; Autoridades ≠ Entes reguladores. Una categoría con historia no se borra | PI-06 confirmada; PI-07 reforzada |
| **2** | **Sin metodología obligatoria.** La plataforma funciona sin puntuación. Plantilla sugerida: influencia × impacto, con los ejes definidos semánticamente | PI-26 y PI-27 reescritas |
| **3** | Menú: **Contexto → Partes interesadas**, con 4.1 compartiendo grupo en el futuro | PI-35 ampliada |
| **4** | La estrategia puede ser general de la parte, o atender **0..N requisitos** | PI-20 reescrita · **PI-36** nueva |

---

## 2 · Las cuatro inconsistencias, y cómo se resuelven

### Corrección 1 · «Seis tablas» era falso

El informe decía seis y la lista tenía **siete**. Era un error de recuento mío,
no una simplificación: el modelo de datos las describe una a una y son siete.

Con la resolución de la Corrección 4 pasan a ser **ocho**.

Se corrige en los cuatro documentos, incluida la prueba **K7**, que decía
«exactamente seis» y por tanto habría fallado contra el propio modelo que
acompañaba. **No se oculta:** el conteo equivocado queda escrito aquí.

### Corrección 2 · «Cero tablas de enlace» era falso

Existía `quality_stakeholder_requirement_processes`, que es una tabla de
enlace. El principio estaba mal enunciado y se sustituye:

> **ZERO REDUNDANT LINK TABLES** — no *zero link tables*.

Una tabla de enlace se justifica cuando la relación es **semántica de dominio**
y necesita lo que `work_references` no puede dar. Comprobado contra el esquema
real:

```sql
work_references
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
  FOREIGN KEY (created_by)      REFERENCES profiles(id)
  UNIQUE (owner_kind, owner_id, ref_kind, ref_id, relation)
```

**`owner_id` y `ref_id` no tienen clave foránea.** Son uuid desnudos. Y
`relation` solo admite `origin`, `evidence`, `related`.

Es decir, `work_references` no ofrece: integridad referencial · borrado en
cascada o restringido · vigencia · vocabulario tipado de relación · aislamiento
estructural por `(organization_id, id)`. Lo que ofrece —y hace bien— es
**enlazar cosas periféricas sin crear una tabla por pareja**.

Regla que queda congelada:

| La relación… | Va en |
|---|---|
| define el dominio, necesita integridad, vigencia o vocabulario propio | **tabla tipada** |
| es transversal o periférica: evidencia, origen, «relacionado con» | **`work_references`** |

Reducir tablas a costa de la semántica de negocio no es una simplificación: es
perder integridad para que un recuento salga más bonito.

### Corrección 3 · El sujeto polimórfico, revisado

El diseño **ya** usaba FK compuestas nulables con un CHECK, no un
`subject_type` / `subject_id` genérico. Eso se mantiene y se refuerza: es la
única forma de conservar `(organization_id, id)` y con ello el aislamiento
estructural.

Lo que **sí** cambia es el número de sujetos. La pregunta era: ¿una unidad
interna es una parte interesada?

**No.** `quality_org_units` es el **organigrama** —la estructura sobre la que
cuelgan cargos y personas—. Una parte interesada interna no es una casilla del
organigrama: es un **colectivo con intereses**. «Trabajadores» no es
`quality_org_units.Producción`; es un grupo que puede atravesar varias
unidades, y «Dirección» como parte interesada no es la misma cosa que la unidad
organizativa «Dirección» de la que dependen tres cargos.

Usar `org_unit` como sujeto habría sido exactamente lo que la revisión advierte:
elegirlo porque ya existe. Y habría traído un efecto colateral peor: cada
reorganización del organigrama tocaría los sujetos del análisis 4.2.

**Resolución:** los colectivos internos se representan como
`quality_stakeholder_groups` — Trabajadores, Dirección, Propietarios y
accionistas—. El sujeto queda con **dos** tipos, los dos con FK compuesta:

```
external_party_id  → quality_external_parties(organization_id, id)   entidad concreta
group_id           → quality_stakeholder_groups(organization_id, id) colectivo
CHECK: exactamente uno no nulo, coherente con subject_kind
```

**Diferido y documentado:** si algún día hace falta anclar un grupo a una
unidad concreta —«trabajadores de planta 2»—, se añade una FK nulable
`org_unit_id` **al grupo**, no un tercer tipo de sujeto. Es append-only y no
cambia ninguna consulta existente.

### Corrección 4 · Estrategia → requisito

La pregunta era si `work_references` puede expresarlo. **No puede**, y por tres
razones verificadas contra el esquema:

1. **No hay relación tipada.** Solo `origin`, `evidence`, `related`. «Esta
   estrategia atiende este requisito» no es ninguna de las tres, y meterla en
   `related` haría indistinguible «lo atiende» de «tiene algo que ver».
2. **No hay integridad referencial.** `ref_id` es un uuid sin FK: nada impide
   que una estrategia diga atender un requisito borrado o de otra empresa.
3. **No hay vigencia.** Una estrategia puede dejar de atender un requisito sin
   que ninguno de los dos desaparezca, y eso hay que poder fecharlo.

**Resolución:** se crea `quality_stakeholder_strategy_requirements` como
relación **core tipada**, y a cambio se **retira** la columna `requirement_id`
de la estrategia. Con eso el modelo dice lo que la decisión humana pide:

| Alcance | Se expresa como |
|---|---|
| General de la parte | estrategia con **cero** requisitos enlazados |
| Específica de un requisito | **un** enlace |
| Específica de varios | **N** enlaces |

Un solo motor de estrategia, sin la ambigüedad de tener el alcance en dos
sitios —una columna y una tabla— que podrían contradecirse.

Las dos preguntas quedan respondidas por FK, no por convención:

```
¿Qué requisitos atiende esta estrategia?   strategy_id  → enlaces → requisitos
¿Qué estrategias atienden este requisito?  requirement_id → enlaces → estrategias
```

---

## 3 · Delta frente a `3eb8526`

| PI | Estado | Qué cambia |
|---|---|---|
| PI-02 | **modificada** | El sujeto pasa de tres tipos a **dos**: se retira `org_unit` |
| PI-03 | **modificada** | Los grupos cubren también los colectivos **internos** |
| PI-06 | confirmada | 15 categorías como semilla editable |
| PI-07 | reforzada | Una categoría con historia no se borra destructivamente |
| PI-20 | **modificada** | El alcance de la estrategia se expresa por enlaces, no por columna |
| PI-21 | **modificada** | Enunciado corregido: no «cero tablas de enlace» |
| PI-26 | **reescrita** | Sin metodología obligatoria; plantilla sugerida con ejes definidos |
| PI-27 | **reescrita** | La plataforma funciona sin puntuación, y se dice cómo |
| PI-31 | **modificada** | Se acota a relaciones periféricas |
| PI-35 | ampliada | Grupo «Contexto», compartido con el futuro 4.1 |
| **PI-36** | **nueva** | Estrategia ↔ requisito es relación core tipada |
| **PI-37** | **nueva** | Zero **redundant** link tables: criterio para decidir dónde vive una relación |
| **PI-38** | **nueva** | El organigrama no es una parte interesada |
| **PI-39** | **nueva** | Semántica de los ejes de priorización |

Sin cambios: PI-01, 04, 05, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22,
23, 24, 25, 28, 29, 30, 32, 33, 34.

**Total: PI-01 … PI-39.**

---

## 4 · Modelo final de tablas · OCHO

| # | Tabla | Por qué existe y no puede ser otra cosa |
|---|---|---|
| 1 | `quality_stakeholder_categories` | Taxonomía 4.2 configurable. No es `quality_external_party_roles`: ejes distintos |
| 2 | `quality_stakeholder_groups` | Colectivos internos y grupos genéricos. No caben en `quality_external_parties` ni son organigrama |
| 3 | `quality_stakeholder_assessments` | El análisis fechado. El núcleo |
| 4 | `quality_stakeholder_requirements` | Necesidad, expectativa y requisito, con la conversión trazada |
| 5 | `quality_stakeholder_requirement_processes` | **Core.** Vigencia + instantánea de revisión + vocabulario propio |
| 6 | `quality_stakeholder_strategies` | La gestión |
| 7 | `quality_stakeholder_strategy_requirements` | **Core.** Relación tipada con integridad y vigencia |
| 8 | `quality_stakeholder_reviews` | «Se revisó y no cambió nada» sin fabricar una versión falsa |

Y **cero** tablas para: identidad, contactos, sedes, tareas, acciones,
encuestas, evaluaciones, riesgos, indicadores, mediciones, documentos y
ficheros. Todo eso ya existe.

---

## 5 · Core vs `work_references`, fila por fila

| Relación | Dónde vive | Por qué |
|---|---|---|
| análisis → sujeto | FK compuesta | integridad y aislamiento |
| análisis → categoría | FK compuesta | integridad |
| requisito → análisis | FK compuesta | pertenencia |
| requisito → requisito de origen | FK compuesta | la conversión es trazabilidad, no una nota |
| **requisito → proceso** | **tabla core** | vigencia, instantánea de revisión, `link_kind` |
| **estrategia → requisito** | **tabla core** | vigencia y relación tipada; `related` no distingue |
| estrategia → dueño | FK a `quality_positions` | T-02 |
| revisión → análisis / estrategia | FK compuesta | pertenencia |
| estrategia → indicador · objetivo | `work_references` | periférica: el motor es OI |
| estrategia → riesgo · oportunidad | `work_references` | periférica: el motor es RO |
| estrategia → acción · caso | `work_references` | periférica: el motor es AC |
| estrategia → campaña · evaluación de proveedor | `work_references` | periférica: los motores son VC y GP |
| requisito → documento · norma · contrato | `work_references` (`evidence`) | evidencia, no estructura |
| revisión → evidencia | `work_references` (`evidence`) | evidencia |

**Criterio, dicho una vez:** si la relación necesita integridad referencial,
vigencia o un vocabulario propio, es core. Si es «esto tiene que ver con
aquello», es `work_references`.

---

## 6 · Las doce preguntas, contra el modelo corregido

| # | Pregunta | Se responde con |
|---|---|---|
| 1 | ¿Qué partes son pertinentes hoy? | análisis con `relevance_status='relevant'` y vigencia abierta |
| 2 | ¿Y en la fecha X? | mismo filtro con vigencia que cubre X |
| 3 | ¿Qué necesidades/expectativas/requisitos se conocían? | requisitos del análisis vigente entonces, por `entry_kind` |
| 4 | ¿Por qué fue pertinente o no? | `relevance_rationale`, obligatorio al descartar |
| 5 | ¿Qué procesos afecta cada requisito? | `_requirement_processes` vigentes, con su revisión |
| 6 | ¿Qué estrategia lo gestiona? | `_strategy_requirements` → estrategia `active` |
| 7 | ¿Cómo se monitorea? | `monitoring_method` + `monitoring_note` de la estrategia |
| 8 | ¿Qué indicadores, evidencias, riesgos y acciones se relacionan? | `work_references` desde la estrategia y el requisito |
| 9 | ¿Cuándo se revisó? | `quality_stakeholder_reviews` |
| 10 | ¿Qué cambió desde la revisión anterior? | sucesión de análisis y estrategias + veredicto de la revisión |
| 11 | ¿Qué entra a Revisión por la Dirección? | entrada `interested_parties` del catálogo |
| 12 | ¿Qué contexto consume Intelligence `as_of`? | fuentes `interested_party` e `interested_party_strategy` |

Las doce se responden **sin** `audit_log` y **sin** ninguna consulta que
dependa de un uuid sin clave foránea.

---

## 7 · Lo que esta revisión no cambió

El descubrimiento sigue valiendo entero: la identidad externa está congelada en
GP-02/GP-33, `work_references` sigue siendo el mecanismo periférico correcto, y
los tres catálogos —Revisión por la Dirección, automatización e Intelligence—
siguen siendo puntos de extensión append-only.

Lo que cambió es **dónde** se pone la frontera entre lo core y lo periférico, y
un recuento que estaba mal.
