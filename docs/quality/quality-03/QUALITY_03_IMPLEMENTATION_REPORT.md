# QUALITY-03 · Informe de implementación

**Objetivos, metas, indicadores, mediciones y desempeño.**

| | |
|---|---|
| Rama | `feature/quality-03-objectives-indicators` |
| Base | `a73a514` — HEAD aprobado de QUALITY-02 |
| HEAD | `860d9c8` |
| Migraciones | `0117` (~2 600 líneas) · `0118` (95 líneas) |
| Cambios | 44 archivos · +9 609 / −17 |
| Pruebas propias | **122** (53 puras · 52 base real · 17 recorrido) |
| Regresión local | `test:all` **exit 0** · 1 915 comprobaciones |
| Staging | `qchzkxbnbqeyuxinipln` · 0116 → **0118** |
| Production | **intacta** — ver `QUALITY_03_STAGING_VALIDATION.md` §6 |

---

## 1. La frase que ordena todo el sprint

> **OBJETIVO ≠ INDICADOR ≠ META ≠ MEDICIÓN ≠ RESULTADO DE DESEMPEÑO**

Cinco cosas que un sistema mediocre mete en una tabla llamada `kpis` con una
columna `valor` y otra `estado`. Cuando eso pasa, cambiar la meta reescribe la
historia, corregir un dato borra el original, y nadie puede responder qué se
esperaba en marzo. El modelo de QUALITY-03 existe para que esas cinco cosas no
puedan confundirse ni por accidente de programación.

Y una segunda, que el encargo marca como no negociable:

> **Estado administrativo ≠ desempeño.**

Que un objetivo esté `activo` es una decisión de gestión. Que vaya `en riesgo`
es una consecuencia de los datos. Son vocabularios distintos, viven en columnas
distintas y el segundo **no se puede escribir**.

---

## 2. Qué se construyó

### 2.1 · Base de datos — 0117

Diez tablas, dos vistas derivadas, ocho RPC públicas, catorce funciones internas
y cinco disparadores de integridad. El detalle está en
`QUALITY_03_DATA_MODEL.md`; lo esencial:

- **Identidad separada de configuración.** `quality_indicators` dice qué se mide
  y quién responde. `quality_indicator_configs` guarda meta, dirección, unidad,
  periodicidad y fuente **con vigencia** (`effective_from` / `effective_to`).
  Cambiar la meta abre un tramo nuevo; jamás reescribe uno cerrado.
- **Mediciones con estado de dato.** `0`, `no aplica` y `sin dato` son tres
  cosas, y un CHECK lo impone: solo `data_state = 'reported'` admite valor.
- **Corrección que conserva el original.** Se crea una medición nueva y la
  anterior queda marcada como reemplazada, con motivo, autor y fecha.
- **Desempeño derivado.** Dos vistas con `security_invoker = true` calculan
  estado, evaluación, tendencia y desempeño del objetivo, **con la explicación
  en texto**.

### 2.2 · Motor de evaluación

Determinista y explicable. Cuatro direcciones de meta (`≥`, `≤`, rango, exacto),
umbral de atención del lado correcto, y evaluación **contra la configuración del
periodo medido**, no contra la de hoy. Tendencia consciente de la dirección, con
mínimo tres puntos y tolerancia del 2 %. Detalle en
`QUALITY_03_INDICATOR_ENGINE.md`.

### 2.3 · Tres tipos de fuente

**Manual** · **Calculado** (catálogo cerrado de cinco operaciones; sin SQL, sin
JavaScript, sin `eval`) · **Automático** (cinco fuentes nativas que leen lo que
Quality ya produce). Detalle en `QUALITY_03_AUTOMATIC_SOURCES.md`.

### 2.4 · Interfaz

Cuatro rutas nuevas —`/quality/objectives`, `/quality/objectives/[id]`,
`/quality/indicators`, `/quality/indicators/[id]`—, siete componentes de dominio
y un grupo «Desempeño» en el registro de módulos. La portada de Quality resume
el estado **solo si hay algo que pide acción**: una tarjeta que siempre dice «0
pendientes» enseña a ignorarla.

La gráfica del histórico es **SVG en línea**, sin librería: rompe la línea donde
falta el dato en vez de interpolarla, marca los huecos con `×`, y no lleva el
eje por debajo de cero si ningún dato es negativo.

Todo funciona **sin JavaScript**: los formularios viven dentro de `<details>` y
las cabeceras dentro de su `<form>`, de modo que el recorrido HTTP los encuentra
y los envía como lo haría una persona con el navegador más pobre.

### 2.5 · Bandeja compartida, no paralela

El encargo prohíbe crear `indicator_alerts` u `objective_alerts`. 0117 §11 se
limita a **ensanchar los CHECK** de `work_tasks` y `work_alerts` de 0116 con los
tipos nuevos. La bandeja «Mis tareas» muestra las tareas de indicador sin que se
haya tocado su código de lectura.

---

## 3. Las decisiones congeladas OI-01…OI-33

| | Decisión | Estado |
|---|---|---|
| OI-01 | Quality by Observation es central | ✅ las cinco fuentes nativas miden lo que Quality ya produce |
| OI-02 | Jerarquía sin cascada obligatoria | ✅ `parent_objective_id`, sin herencia forzada |
| OI-03 | Estado administrativo ≠ desempeño | ✅ vocabularios y columnas distintos; el desempeño no se escribe |
| OI-04 | Dirección estructurada | ✅ cuatro direcciones en base, dominio y pantalla |
| OI-05 | Definición ejecutable ≠ fórmula legible | ✅ `calc_definition` (jsonb validado) y `formula_text` |
| OI-06 | Las fórmulas tienen vigencia | ✅ viven en el tramo con `effective_from`/`to` |
| OI-07 | Metas históricas, evaluadas por periodo aplicable | ✅ `quality_config_for_period`; pruebas `D1`, `D2` |
| OI-08 | Cada indicador declara su automatización | ✅ `source_type` + `native_source_key` |
| OI-09 | La corrección preserva el original | ✅ `superseded_by` + `is_current`; prueba `C5` |
| OI-10 | Linaje de las mediciones automáticas | ✅ `quality_calculation_runs` con componentes y `as_of` |
| OI-11 | Calidad del dato ≠ desempeño | ✅ `data_quality` separado de `evaluation` |
| OI-12 | Cambio de fuente tras el cierre → revisión controlada | ✅ no se puede pisar un tramo cerrado; prueba `H3` |
| OI-13 | Sin meta no se crea NC automática | ✅ evento y alerta, nunca NC; prueba `G4` |
| OI-14 | Alertas con prioridad, deduplicación y escalamiento | ⚠️ **parcial** — prioridad y deduplicación (AT-07) sí; **escalamiento no** |
| OI-15 | La IA distingue correlación, hipótesis y causalidad | ⛔ **fuera de alcance** — este sprint no incorpora IA |
| OI-16 | Indicadores nativos derivados de los dominios de Quality | ✅ catálogo de cinco |
| OI-17 | Los cambios de metodología preservan rupturas de comparabilidad | ⚠️ **parcial** — `comparability_break` y su nota se almacenan; **la gráfica aún no dibuja la ruptura** |
| OI-18 | Estado automático del objetivo, configurable y explicable | ✅ dos reglas, con explicación en texto |
| OI-19 | Las series pueden relacionarse con eventos del sistema | ⚠️ **parcial** — `work_events` existe y se alimenta; **no hay lectura cruzada en la interfaz** |
| OI-20 | Los indicadores agregados declaran método de consolidación | ✅ `consolidation_method` en la configuración |
| OI-21 | Cero, no aplica y no disponible son distintos | ✅ impuesto por CHECK; pruebas `A3`, `C1`, `C2` |
| OI-22 | Evaluación automática explicable y auditable | ✅ explicación en texto + linaje |
| OI-23 | Indicadores útiles antes que proliferación de métricas | ✅ **por diseño** — catálogo cerrado, sin creación masiva ni importador |
| OI-24 | Se preservan los periodos históricos | ✅ nada se recalcula hacia atrás |
| OI-25 | Alcance: empresa, objetivo, proceso, etapa o actividad | ✅ los cinco en el enumerado; **empresa y proceso** seleccionables en esta entrega |
| OI-26 | Fuentes manual, importada, integrada, derivada o nativa | ⚠️ **parcial** — manual, derivada (calculada) y nativa; **importada e integrada no** |
| OI-27 | Resultados preliminares ≠ cerrados | ✅ `quality_period_closures`; pruebas `H1`, `H2` |
| OI-28 | Auditoría completa de correcciones e invalidaciones | ✅ motivo obligatorio, autor y fecha; prueba `C6` |
| OI-29 | La IA puede proponer indicadores, requiere validación | ⛔ **fuera de alcance** — este sprint no incorpora IA |
| OI-30 | Sin rankings automáticos de empleados | ✅ **estructuralmente** — no existe alcance «persona» |
| OI-31 | Un fallo de integración no es mal desempeño | ✅ queda `unavailable` con el error, nunca `not_met` |
| OI-32 | Los indicadores retirados conservan historia y sucesor | ✅ `successor_indicator_id`, `retired_at`, `retirement_reason` |
| OI-33 | La revisión por la dirección puede alimentarse automáticamente | ⚠️ **parcial** — los datos están y las vistas los exponen; **no hay pantalla de revisión por la dirección** |

**Resumen: 24 completas · 6 parciales · 2 fuera de alcance (las dos de IA · OI-15
y OI-29).**

Ninguna decisión fue reinterpretada ni sustituida por un modelo genérico de KPI.
Las seis parciales y las dos de IA están declaradas como brechas en §AI del
informe final, no disimuladas.

---

## 4. Lo que costó dos intentos

**Los privilegios del motor.** 0117 §21 declaraba las tablas de medición como de
solo lectura y lo conseguía en local. En Staging no: los privilegios por defecto
de un proyecto remoto de Supabase conceden `insert, update, delete` sobre cada
tabla nueva, y **conceder `SELECT` no retira lo que el entorno ya concedió**.

La RLS seguía bloqueando, así que el comportamiento visible era correcto. Pero
«cero filas afectadas» no es «denegado», y solo lo delataron las dos pruebas que
exigen un **error**:

```
✘ G5. los eventos son INMUTABLES (AT-03)
✘ X2. no se puede alterar una evaluación calculada
```

Es la tercera vez que el proyecto tropieza con esto (0111, 0112 §12, 0115).
**0118** lo corrige sin tocar 0117 —una migración desplegada no se edita— y la
prueba **M15** fija el invariante en local para que la próxima tabla de solo
lectura no repita el olvido hasta el despliegue.

---

## 5. Entregables

| Documento | Qué contiene |
|---|---|
| `QUALITY_03_IMPLEMENTATION_REPORT.md` | este documento |
| `QUALITY_03_DATA_MODEL.md` | las diez tablas, los invariantes en constraints, el diagrama |
| `QUALITY_03_INDICATOR_ENGINE.md` | evaluación, tendencia, periodos, corrección, desempeño |
| `QUALITY_03_AUTOMATIC_SOURCES.md` | el catálogo cerrado de cinco fuentes nativas |
| `QUALITY_03_RLS_SECURITY.md` | políticas, privilegios, aislamiento y los ataques comprobados |
| `QUALITY_03_TEST_MATRIX.md` | las 122 pruebas propias y la regresión |
| `QUALITY_03_STAGING_VALIDATION.md` | despliegue, validación remota, Preview y Production |
| `QUALITY_03_ROLLBACK.md` | los tres niveles de reversión |
