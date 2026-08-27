# QUALITY-11 · El modelo de datos

**Migración:** `0129_quality_automation_observation.sql` — 3 388 líneas, append-only.
**Local 0129 · Staging 0129 · Production 0111.**

## 0 · Lo que NO se creó, y por qué

| No existe | Porque ya existe |
|---|---|
| Un motor de alertas | `work_alerts` · dos tipos nuevos |
| Un motor de tareas | `work_tasks` · un tipo nuevo |
| Un motor de acciones | `work_actions` — y la automatización **no** crea acciones |
| Una bitácora de automatización | `work_events` · cinco tipos nuevos |
| Un planificador propio | Un endpoint con secreto que llama al **mismo** motor |
| Un intérprete de consultas | Un catálogo cerrado de 18 fuentes y 70 campos |
| Inteligencia artificial | §7 · ni LLM, ni embeddings, ni prompts |

Los ocho barridos que QUALITY-03…10 ya traían **siguen intactos**: no se
reescribió ninguno. Se ejecutan dentro del barrido de QUALITY-11 como
*observadores de plataforma*, para que exista una sola puerta.

## 1 · Las diez tablas

### 1.1 · Configuración

`quality_automation_settings` — una fila por empresa: si el motor está
encendido, en qué **zona horaria** cierra su día de negocio, y cuándo corrió por
última vez. La zona horaria vive aquí y no en `organizations` porque es
QUALITY-11 quien la necesita: sin ella, «vence hoy» avisaría con un día de
desfase para media América.

### 1.2 · El catálogo observable — de plataforma, no de empresa

`quality_automation_sources` — **18 fuentes**. Cada una declara su `code`, su
`domain`, el `subject_type` que observa y su enlace profundo. Lo que **no**
declara, deliberadamente, es la tabla ni la columna que hay detrás: si las
guardara, alguien acabaría concatenándolas.

| Dominio | Fuentes |
|---|---|
| documents | `document_revision` |
| indicators | `indicator` |
| objectives | `objective` |
| cases | `case` |
| actions | `action` |
| risks | `risk` · `control` · `opportunity` |
| people | `competency_evidence` · `performance_evaluation` · `knowledge_item` |
| suppliers | `supplier_scope` |
| customer | `customer_feedback` · `customer_metric` |
| audits | `audit` · `audit_finding` |
| management_review | `management_review` · `management_review_input` |

`quality_automation_source_fields` — **70 campos**. Cada uno con su `data_type`
(`text`, `number`, `date`, `boolean`, `bool_series`, `number_series`), sus
`allowed_operators` y, cuando procede, sus `enum_values`. Los dos catálogos son
globales: no tienen `organization_id` y solo conceden `select`.

**La ausencia que sostiene todo el diseño:** ninguna fuente observa tareas,
avisos, señales ni ejecuciones. Es lo que hace estructuralmente imposible el
bucle — ver `QUALITY_11_RULE_ENGINE.md` §4.

### 1.3 · La regla y sus versiones

`quality_automation_rules` — la **identidad estable**: código, nombre,
categoría, fuente, cargo responsable, estado (`draft` · `active` · `inactive` ·
`retired`), nivel de autonomía (A–D) y de qué plantilla salió. No guarda ni
condiciones ni salidas: si las guardara, cambiar la regla reescribiría el pasado.

`quality_automation_rule_versions` — el **contenido formal**, congelado al
publicar: `conditions jsonb`, `outputs jsonb`, gravedad, título de la señal,
tipo de disparo y ventana de vigencia. Un disparador impide editar una versión
publicada, y el número de versión es único por regla.

### 1.4 · La ejecución

`quality_automation_runs` — una fila por barrido: tipo (`manual` ·
`scheduled` · `simulation`), día de negocio evaluado, inicio y fin medidos con
el **reloj de pared**, y los contadores de lo que creó. Una restricción impide
que una ejecución de simulación declare salidas.

`quality_automation_run_rules` — una fila por regla **o** por observador de
plataforma dentro de esa ejecución, con sus sujetos, coincidencias, salidas,
estado y duración. Una restricción exige que sea una cosa o la otra, nunca las
dos.

### 1.5 · La señal

`quality_signals` — el hecho detectado, con su regla, su versión, su ejecución,
su sujeto, su gravedad, su **explicación** y el retrato mínimo de los datos que
la regla miró. Guarda cuándo se detectó por primera vez, cuándo por última y
cuántas veces.

```sql
create unique index quality_signals_open_dedupe_uniq
  on public.quality_signals (organization_id, dedupe_key)
  where resolved_at is null;
```

Ese índice **parcial** es toda la idempotencia del sistema y también todo el
rearme: mientras la señal está abierta ocupa la clave; en cuanto se resuelve la
libera. Ver `QUALITY_11_IDEMPOTENCY.md`.

`quality_signal_suppressions` — silenciar una señal o una regla, con motivo
obligatorio y con fecha de fin opcional. Silenciar **no** es resolver.

### 1.6 · La biblioteca

`quality_automation_rule_templates` — **14 plantillas** de plataforma, ninguna
activa. La empresa instancia la que quiere, ajusta sus números y la publica.

## 2 · Las claves compuestas (MDR-42)

Todas las relaciones internas van por `(organization_id, id)`:

| Desde | Hacia |
|---|---|
| `quality_automation_rule_versions` | `quality_automation_rules` |
| `quality_automation_run_rules` | `quality_automation_runs` · `quality_automation_rules` |
| `quality_signals` | `quality_automation_rules` · `…_rule_versions` · `…_runs` |
| `quality_signal_suppressions` | `quality_signals` · `quality_automation_rules` |

Una fila de una empresa no puede apuntar a una fila de otra ni por error de
programación.

## 3 · Lo que se amplió sin estrechar nada

`work_tasks.task_type` (+1) · `work_alerts.alert_type` (+2) ·
`work_events.event_type` (+5) · `work_*.subject_type` (+2) ·
`work_*.source_domain` (+1).

Cada catálogo se reconstruyó como la **unión** del de 0128 más lo nuevo, y una
prueba automática comprueba que ninguno se estrechó: fue exactamente la
regresión que QUALITY-10 estuvo a punto de introducir.

## 4 · Las tres vistas

| Vista | Para qué |
|---|---|
| `v_quality_automation_rule_overview` | la regla con su versión vigente, sus borradores, sus señales abiertas y su última evaluación |
| `v_quality_signal_overview` | la señal con su regla, su versión y cuántos avisos y tareas produjo |
| `v_quality_automation_run_overview` | la ejecución con su duración, cuántas reglas propias y cuántos observadores de plataforma corrieron |

Las tres son `security_invoker`: quien mira ve lo suyo.
