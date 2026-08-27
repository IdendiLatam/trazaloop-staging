# QUALITY-11.1 · GAP-02 · El puente de eventos

## 1 · Qué faltaba

`trigger_kind = 'event'` existía en el modelo desde la 0129, con su columna
`event_types` y su evaluador compartido. Lo que no existía era el puente: nada
leía la bitácora, nada enrutaba, nada evaluaba al ocurrir un hecho.

## 2 · La cadena, entera

```
HECHO DE NEGOCIO        una RPC de dominio escribe en work_events
                        DENTRO de su transacción (outbox, §28)
        ↓
ENRUTADOR               reglas activas con trigger_kind='event' cuyo
                        event_types contiene el tipo, con versión vigente hoy
                        y sin silenciar · una versión por regla
        ↓
CONTRATO DE SUJETO      subject_type → fuente del catálogo, con resolutor
                        CON NOMBRE · nunca una tabla del JSON del evento
        ↓
SUJETO TIPADO           quality_automation_subjects(…, p_subject_id)
                        EL MISMO proveedor, acotado a un sujeto
        ↓
EVALUADOR               quality_automation_evaluate  ← el de QUALITY-11
        ↓
EJECUTOR DE SALIDAS     quality_automation_emit      ← extraído aquí
        ↓
SEÑAL · AVISO · TAREA   con el mismo dedupe, el mismo linaje, la misma RLS
```

## 3 · Por qué el ejecutor de salidas se extrajo

Hasta QUALITY-11 las salidas se emitían **en línea** dentro del barrido. Con un
solo camino bastaba. Con dos, no: si el puente insertara sus propias señales, el
dedupe, el linaje, la seguridad y el reintento serían *parecidos* en vez de ser
*los mismos*, y la primera divergencia aparecería el día que alguien tocara uno
de los dos.

`quality_automation_emit` es literalmente el bloque que la 0130 ejecutaba en
línea, con un argumento nuevo —el hecho de origen, cuando lo hay— y devolviendo
lo que creó. Las 68 comprobaciones de QUALITY-11 contra base real siguen verdes
después de la extracción: es la prueba de que no cambió nada.

## 4 · La colisión que no puede ocurrir (§59)

La clave de dedupe es:

```
auto:<versión de la regla>:<sujeto>
```

**No lleva el camino por el que se detectó.** Consecuencia: la misma condición
produce UNA señal, la vea el hecho al ocurrir o el barrido de la noche. No hay
que elegir entre los dos caminos, ni evitar que coincidan, ni desactivar uno
cuando se enciende el otro.

Y una regla por evento **no se barre**: se anota como omitida, con su motivo, en
el informe de la ejecución programada. Barrerla además no duplicaría nada, pero
el barrido cerraría sola una señal nacida de un hecho —y un hecho no deja de ser
cierto porque el estado cambie después—.

## 5 · Idempotencia y reintento

`quality_automation_event_deliveries` guarda un **acuse por (hecho, versión de
regla)**, con restricción única. De ahí salen las tres garantías:

| Situación | Qué pasa |
|---|---|
| el mismo hecho se procesa dos veces | el acuse ya existe → no se vuelve a evaluar |
| dos procesadores toman el mismo hecho a la vez | solo uno inserta el acuse; el otro sigue de largo |
| una entrega falló y se reintenta | el acuse pasa de `failed` a reintento, `attempts` sube, y la emisión —idempotente— completa lo que faltaba exactamente una vez |

La **marca de agua** (`events_processed_through`) no es la garantía: solo evita
releer la bitácora entera cada noche. Por eso el procesador incluye siempre los
hechos con entrega fallida **aunque la marca ya haya pasado por encima** — sin
eso, un reintento sería imposible.

## 6 · Aislamiento

- El hecho de negocio ya está escrito cuando el puente corre: **una regla rota
  no deshace una queja guardada** (§26).
- Cada par (hecho, regla) va en su propio bloque de excepción: una regla rota no
  impide que otra regla del mismo hecho complete (§58). Comprobado con una regla
  deliberadamente rota junto a una válida.
- El fallo queda escrito en el acuse, con su mensaje, y cuenta como fallo en la
  ejecución. No se pierde.

## 7 · Bucles

El enrutador descarta los hechos con `source_domain = 'automation'`. Es la
guarda de profundidad: los hechos que produce QUALITY-11 —señal emitida, señal
resuelta, ejecución terminada— **no se enrutan nunca**. Sumado a que ninguna
fuente del catálogo observa tareas, avisos ni señales, el grafo sigue teniendo
profundidad uno.

Comprobado por las dos vías: ningún acuse referencia un hecho de la
automatización, y cinco pasadas seguidas del puente no crean nada.

## 8 · Qué NO se construyó

- **Ninguna cola externa** (§27): `work_events` ya era el outbox.
- **Ningún segundo planificador** (§29): el endpoint de QUALITY-11 drena los
  hechos y después barre, por la misma puerta y con el mismo secreto.
- **Ningún evaluador alternativo** (§19).
- **Ninguna semántica de sujeto nueva** (§18).
- **Ninguna IA.**

## 9 · Orden de entrega (§24)

`work_events` se recorre por `occurred_at` ascendente. Las reglas por evento de
QUALITY-11.1 dependen del **estado actual autorizado** del sujeto —se relee por
el proveedor tipado en el momento de evaluar—, no del contenido del evento, así
que un desorden de entrega no cambia el resultado: lo que se evalúa es lo que
es cierto ahora sobre el objeto que el hecho señala.

Lo que sí garantiza el orden es la lectura del informe, y por eso se conserva.
