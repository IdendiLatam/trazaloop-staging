# QUALITY-03 · Modelo de datos

**Migraciones:** `0117_quality_objectives_indicators_and_measurements.sql` (~2 600 líneas)
y `0118_quality_measurement_engine_privilege_hardening.sql` (95 líneas).
**Append-only.** No se editó 0116 ni ninguna anterior. Sin `migration repair`.

---

## 1. Las cinco cosas que no son la misma cosa

El encargo abre con una separación y todo el modelo existe para sostenerla:

```
OBJETIVO ≠ INDICADOR ≠ META ≠ MEDICIÓN ≠ RESULTADO DE DESEMPEÑO
```

| Concepto | Dónde vive | Qué NO es |
|---|---|---|
| **Objetivo** | `quality_objectives` | No es un indicador. No tiene valor numérico propio |
| **Indicador** | `quality_indicators` | No lleva meta. Es una **identidad**: qué se mide y quién responde |
| **Meta** | `quality_indicator_configs` | No vive en el indicador. Es un **tramo con vigencia** |
| **Medición** | `quality_measurements` | No es una evaluación. Es un valor con estado de dato |
| **Desempeño** | `v_quality_objective_performance` | No se escribe. Se **deriva** y se explica |

La separación indicador/configuración es la que hace posible OI-07: cambiar la
meta abre un tramo nuevo y **no reescribe el pasado**. Si la meta viviera en
`quality_indicators`, un `update` de una fila borraría la historia de golpe.

La separación medición/desempeño es la que hace posible OI-03: el estado
administrativo de un objetivo (`draft`, `active`, `closed`, `cancelled`) es una
decisión de gestión, y su desempeño (`on_track`, `at_risk`, `off_track`,
`no_data`) es una consecuencia de los datos. Nadie puede escribir el segundo.

---

## 2. Las diez tablas

### 2.1 · `quality_objectives` — 19 columnas

Qué quiere lograr la empresa. Responsable **por cargo** (`owner_position_id`),
no por persona: cuando alguien cambia de puesto el objetivo conserva su dueño.
`evaluation_rule` guarda cómo se resume el desempeño a partir de sus
indicadores (OI-18), y es una elección explícita, no una fórmula escondida.

`parent_objective_id` permite jerarquía **sin cascada obligatoria** (OI-02): un
objetivo puede colgar de otro, y ninguna regla fuerza que los hijos hereden meta
ni que el padre agregue automáticamente.

### 2.2 · `quality_objective_processes` — 6 columnas

Qué procesos contribuyen a un objetivo. FK compuesta `(organization_id,
process_id)`: un objetivo no puede apuntar a un proceso de otra empresa ni
siquiera por error de programación.

### 2.3 · `quality_indicators` — 16 columnas · **identidad, nada más**

`code`, `name`, `scope_type`, `scope_process_id`, `owner_position_id`,
`admin_state`, `successor_indicator_id`.

`scope_type` cubre los cinco alcances de OI-25 —`organization`, `objective`,
`process`, `stage`, `activity`—. **No existe un alcance «persona»**, y esa
ausencia es deliberada: es la manera estructural de cumplir OI-30. Un ranking
automático de empleados no se prohíbe con una advertencia en la interfaz; se
prohíbe no dando la columna con la que se construiría.

`successor_indicator_id` cumple OI-32: retirar un indicador conserva su historia
y puede señalar cuál lo reemplaza.

### 2.4 · `quality_indicator_configs` — 28 columnas · **el tramo con vigencia**

Aquí vive **todo lo que puede cambiar sin que el indicador deje de ser el
mismo**: unidad, dirección, periodicidad, tipo de fuente, definición de cálculo,
fórmula legible, meta y umbral de atención.

```
effective_from  date  not null
effective_to    date            -- null = tramo vigente
```

Publicar una configuración nueva **cierra** el tramo anterior poniéndole
`effective_to` y abre uno nuevo. Nunca se hace `update` sobre un tramo cerrado.
Eso es OI-06 (las fórmulas tienen vigencia temporal) y OI-07 (las metas son
históricas) en la misma estructura.

`comparability_break` —con su `comparability_note`— marca los cambios que
rompen comparabilidad (OI-17): si la
forma de medir cambió, la serie no debe leerse como continua, y la gráfica lo
señala en vez de fingir una tendencia.

La meta es **consciente de la dirección** (OI-04):

| `direction` | `target_operator` | Cómo se lee |
|---|---|---|
| `higher_is_better` | `gte` | cumple si valor ≥ meta |
| `lower_is_better` | `lte` | cumple si valor ≤ meta |
| cualquiera | `range` | cumple si `target_min` ≤ valor ≤ `target_max` |
| cualquiera | `eq` | cumple si valor = meta |

### 2.5 · `quality_objective_indicators` — 6 columnas

Qué indicadores comprueban qué objetivo. Un indicador puede servir a varios
objetivos sin duplicarse.

### 2.6 · `quality_period_closures` — 14 columnas

El cierre de un periodo (OI-27). Guarda quién cerró, cuándo y con qué motivo, y
lo mismo para la reapertura. Un periodo cerrado no se mide ni se corrige, y su
configuración no puede ser pisada por una meta nueva.

### 2.7 · `quality_calculation_runs` — 14 columnas

Cada ejecución de un cálculo: qué se pidió, con qué configuración, qué devolvió,
si falló y por qué. Es el linaje de OI-10 y la base de OI-31: un fallo de
integración se registra como **fallo técnico**, no como mal desempeño.

### 2.8 · `quality_measurements` — 27 columnas · **el corazón**

Tres invariantes viven en constraints, no en la aplicación:

```sql
-- Cero, no aplica y sin dato son cosas distintas (OI-21).
constraint quality_measurements_value_consistent check (
  (data_state = 'reported' and value is not null)
  or (data_state <> 'reported' and value is null)
),
-- Una medición reemplazada no puede seguir siendo la vigente.
constraint quality_measurements_current_consistent check (
  superseded_by_measurement_id is null or not is_current
),
-- Un solo resultado vigente por indicador y periodo.
create unique index quality_measurements_current_uniq
  on public.quality_measurements (indicator_id, period_start, period_end)
  where is_current;
```

`data_state` distingue `reported` (hay un número, aunque sea **0**),
`not_applicable` (el periodo no aplica) y `unavailable` (no se pudo obtener). El
CHECK impide la confusión más cara del dominio: **0 no es «sin dato»**. Un cero
es un resultado —cero reclamos es una noticia excelente— y `null` es una
ausencia. Guardarlos en la misma columna sin distinguirlos convierte una en la
otra.

`data_quality` es una dimensión **separada** de la evaluación (OI-11): un dato
puede ser de baja confianza y aun así cumplir la meta, y el sistema debe poder
decir las dos cosas a la vez.

`superseded_by_measurement_id` + `is_current` implementan la corrección de
OI-09/OI-28: corregir **no borra**. Crea una medición nueva, marca la anterior
como reemplazada y conserva el original con su autor, su fecha y su motivo.

> **Por qué `is_current` es una columna y no un cálculo.** Un índice único
> parcial no puede diferirse dentro de una transacción. Sin el marcador
> explícito, el instante en que existen la medición vieja y la nueva violaría la
> unicidad antes del `commit`. La columna hace visible ese estado intermedio y
> el segundo CHECK impide que se quede así.

### 2.9 · `quality_measurement_evidence` — 8 columnas

Adjuntos de una medición. Se añaden y se quitan; **nunca se reescriben** —0118
revoca `update`—. Una evidencia que cambia de contenido conservando su
identidad deja de ser evidencia.

### 2.10 · `work_events` — 13 columnas · **append-only**

La bitácora de hechos de desempeño (AT-02/AT-03). Ni la aplicación ni las RPC la
reescriben: un trigger impide `update` y `delete`, y 0118 retira además el
privilegio. Es la tabla que hace posible OI-19 —relacionar una serie con lo que
pasó en el sistema— aunque esta entrega todavía no ofrezca esa lectura en la
interfaz (ver §AI del informe).

---

## 3. Lo que se ensanchó sin romper

`work_tasks` y `work_alerts` **son las de 0116**. El encargo prohíbe un sistema
paralelo de alertas y 0117 §11 se limita a ensanchar sus CHECK de tipo:

```
work_tasks   + indicator_measurement_due, indicator_off_target
work_alerts  + indicator_measurement_due, indicator_target_missed, objective_at_risk
```

Ensanchar un CHECK es aditivo: ninguna fila existente deja de ser válida. La
bandeja «Mis tareas» de QUALITY-02 muestra ahora las tareas de indicador sin que
se haya tocado su código de lectura.

---

## 4. Las dos vistas derivadas

Ambas con `security_invoker = true` (MDR-16/MDR-37): una vista no puede ser un
agujero por el que se lea lo que la RLS de la tabla niega.

- **`v_quality_indicator_status`** — para cada indicador: su configuración
  vigente, su última medición, su evaluación, su tendencia y si tiene una
  medición pendiente. Todo **derivado**, nada almacenado.
- **`v_quality_objective_performance`** — el desempeño de cada objetivo a partir
  de sus indicadores, con la regla aplicada y **la explicación en texto** de por
  qué salió ese resultado (OI-22).

---

## 5. Diagrama

```
quality_objectives ──┬─< quality_objective_processes >── quality_processes
                     │
                     └─< quality_objective_indicators >─┐
                                                        │
                                    quality_indicators ─┤ (identidad)
                                                        │
                              quality_indicator_configs ┘ (meta con vigencia)
                                        │
                                        ├─< quality_measurements ─< quality_measurement_evidence
                                        │            │
                                        │            └── superseded_by ──┐ (corrección)
                                        │                                │
                                        └─< quality_calculation_runs ────┘
                                                     │
   quality_period_closures ───────────────────────── │
                                                     ▼
                                        work_events · work_tasks · work_alerts
```
