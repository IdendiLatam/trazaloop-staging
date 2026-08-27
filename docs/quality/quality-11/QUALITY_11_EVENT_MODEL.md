# QUALITY-11 · El modelo de eventos

## 1 · Evento ≠ estado actual

Un evento es algo que **ocurrió** y quedó escrito para siempre. El estado actual
es lo que es cierto **hoy**. Confundirlos es lo que convierte una bitácora en un
tablero que miente sobre el pasado.

QUALITY-11 no crea bitácora propia: escribe en `work_events`, que es
append-only desde 0118 —ni siquiera las RPC la reescriben— y añade cinco tipos.

| Evento | Cuándo |
|---|---|
| `automation.rule_published` | se publica una versión de una regla |
| `automation.rule_retired` | se retira una regla |
| `automation.run_completed` | termina un barrido |
| `automation.signal_raised` | nace una señal (no cuando se vuelve a detectar) |
| `automation.signal_resolved` | se cierra una señal |

Todos se nombran en pasado. Ninguno describe una situación.

## 2 · Los dos caminos de observación

**Programado** (`trigger_kind = 'schedule'`) — el barrido mira el estado de hoy.
Es lo que hace falta para «vence en 30 días»: nada *ocurre* el día en que
faltan 30 días, simplemente se llega a él.

**Por evento** (`trigger_kind = 'event'`) — la versión declara a qué tipos de
evento reacciona. La estructura está en la tabla (`event_types text[]`) y el
evaluador es el mismo; lo que QUALITY-11 entrega en ejecución es el camino
programado, que es el que cubren las 14 plantillas. Ver GAPS en el informe.

## 3 · El linaje, entero

Cada señal guarda de dónde viene, y nada de eso se puede reescribir:

```
regla ──▶ versión ──▶ ejecución ──▶ SEÑAL ──▶ aviso(s)
                                        └───▶ tarea(s)
```

Un disparador congela `rule_id`, `rule_version_id`, `run_id`, `dedupe_key`,
`source_code`, `subject_id` y `explanation` en cuanto la señal existe. Una señal
emitida hace un año se sigue explicando con la versión que la emitió, aunque hoy
vaya por la v3.

## 4 · Lo que NO se registra

Una evaluación que **no** coincide no genera evento, ni señal, ni fila. Sería la
inmensa mayoría de las evaluaciones y no documenta nada: la ejecución ya dice
cuántos sujetos se miraron y cuántos coincidieron.
