# QUALITY-11.1 · Idempotencia

## 1 · Tres capas, y ninguna se pisa

| Capa | Qué protege | Mecanismo |
|---|---|---|
| **La condición** | que la misma condición no abra dos señales | índice único parcial sobre `(organization_id, dedupe_key) where resolved_at is null` |
| **La entrega** | que el mismo hecho no se evalúe dos veces por la misma regla | restricción única sobre `(organization_id, event_id, rule_version_id)` |
| **La salida** | que no haya dos avisos ni dos tareas para la misma señal y persona | `insert … where not exists` sobre la clave `auto_alert:` / `auto_task:` |

Las tres estaban ya en QUALITY-11 salvo la segunda, que es lo único que
QUALITY-11.1 añade.

## 2 · Por qué la clave de dedupe NO lleva el camino

```
auto:<versión>:<sujeto>
```

Si llevara `event` o `scheduled`, el mismo indicador fuera de meta produciría
una señal al cargar la medición y **otra** en el barrido de la noche. Al no
llevarlo, produce una: la segunda detección solo sube `detection_count`.

Esto es lo que resuelve §59 sin escribir una sola línea para resolverlo.

## 3 · Los cuatro escenarios, verificados

| Escenario | Qué se hizo | Resultado |
|---|---|---|
| **mismo hecho, dos veces** (§22, §56) | procesar dos veces sin cambiar nada | 0 señales, 0 avisos, 1 acuse |
| **dos procesadores a la vez** (§57) | dos llamadas en paralelo sobre el mismo hecho | 1 señal, 1 acuse |
| **reintento tras fallo a medias** (§23) | borrar el aviso y marcar el acuse en fallo, reprocesar | 0 señales nuevas, 1 aviso, `attempts = 2` |
| **evento + barrido** (§59) | procesar el hecho y después barrer | 1 señal en total |

## 4 · El rearme sigue funcionando (§60)

El índice de señales es **parcial**: en cuanto una se resuelve, libera la clave.
Un hecho posterior que vuelva a cumplir la condición abre una señal **nueva**,
con su contador a 1. Ni dedupe eterno, ni duplicado.

## 5 · La marca de agua no garantiza nada

`quality_automation_settings.events_processed_through` sirve para no releer la
bitácora entera cada noche, y para nada más. La garantía de no duplicar es el
acuse.

Por eso el procesador incluye **siempre** los hechos con entrega fallida, aunque
la marca ya los haya dejado atrás. Sin esa excepción, un reintento después de un
corte sería imposible — y fue exactamente el defecto que encontró la prueba H1
antes de corregirse.
