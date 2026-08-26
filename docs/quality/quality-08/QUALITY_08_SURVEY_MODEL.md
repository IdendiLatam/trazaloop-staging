# QUALITY-08 · Encuestas, versiones y campañas

> **VC-07 · VC-26 · VC-27 · §9…§19, §76, §77**

## 1 · Encuesta ≠ versión

La encuesta es la **identidad estable** —«Encuesta de satisfacción»— y sobrevive
a todos sus cambios. La versión es la **estructura congelada** con la que
alguien respondió.

Si las preguntas colgaran de la encuesta, cambiar una escala en 2028 haría que
todas las respuestas de 2027 empezaran a significar otra cosa sin que nadie las
hubiera tocado. Una respuesta a la v1 se interpreta **siempre** con la v1.

```
quality_surveys                    ← identidad
└── quality_survey_versions        ← draft → published → superseded
    └── quality_survey_questions   ← cuelgan de la VERSIÓN
```

## 2 · §10 · Draft se edita; publicada no

`quality_survey_version_is_published()` dispara en `insert`, `update` y `delete`
sobre las preguntas y rechaza cualquier cambio si su versión no está en
borrador. No es una convención de la interfaz: es la base.

`quality_publish_survey_version()`:

1. exige que la versión tenga al menos una pregunta —una encuesta vacía no se
   publica—;
2. exige que la fecha de entrada en vigor sea posterior a la de la versión que
   sustituye;
3. cierra la anterior el día antes y la deja en `superseded`;
4. **no toca ninguna respuesta ya recogida**, y una prueba lee su cuerpo para
   comprobarlo.

Crear una versión nueva **copia las preguntas de la anterior** como punto de
partida. Empezar de cero invita a reescribir una encuesta que funcionaba, y con
ella la clave estable que hace comparables las series.

## 3 · §11 · Siete tipos de pregunta

`single_choice` · `multiple_choice` · `scale` · `numeric` · `yes_no` · `text` ·
`long_text`.

Y ni uno más. Trazaloop no es un constructor de formularios: **no hay lógica
condicional ni saltos**, porque un formulario que se ramifica produce datos que
después nadie sabe comparar. Una prueba falla si aparecen las palabras `branch`,
`skip_logic` o `conditional`.

La base exige lo que cada tipo necesita: una escala sin extremos se rechaza, y
una pregunta de opciones con menos de dos también.

## 4 · §12 · La pregunta tiene identidad estable

`stable_key` sobrevive a las versiones. Es lo que permite decir «la pregunta de
entregas» y comparar 2027 con 2028 sin depender de que siga siendo la tercera.

`unique (version_id, stable_key)` impide repetirla dentro de una versión, y las
definiciones de métrica localizan su pregunta **por esa clave**, no por
identificador ni por posición.

## 5 · §13 · Las escalas son configurables

`scale_min`, `scale_max`, `scale_step`, `scale_min_label`, `scale_max_label`. No
hay ningún 1–5 cableado en ninguna parte, ni un valor por defecto que lo
insinúe. Una empresa puede usar 1–5, 1–10, 0–10 o lo que su metodología diga.

## 6 · §17 · Definición ≠ aplicación

«Encuesta de satisfacción v2» es la definición. «Clientes agosto 2027» es una
**campaña**. La misma versión puede usarse en tantas campañas como haga falta
sin que ninguna toque el resultado de otra (VC-27).

La campaña conoce:

| | |
|---|---|
| `voice_source` | relacional · periódica · transaccional · espontánea (VC-04) |
| `period_label`, `period_start`, `period_end` | el periodo que MIDE |
| `opens_on`, `closes_on` | la ventana en la que se puede RESPONDER |
| `anonymity_mode` | identificada o anónima — estructural, y final |
| `population_size` | a cuántos se preguntó, **o nulo** |
| `context_ref_kind` / `context_ref_id` | contexto transaccional, si existe de verdad |
| `owner_position_id` | MDR-33: la responsabilidad es del cargo |

## 7 · §18 · Cerrar y reabrir

Cerrar una campaña:

- fija `closed_at` y su nota;
- **expira los enlaces sin usar** — un token vivo de una campaña cerrada es una
  puerta abierta a un cuarto vacío;
- devuelve el recuento de respuestas, la tasa si existe denominador, y
  `decides_nothing: true`.

Reabrir exige un **motivo escrito** y deja `reopened_at`, `reopen_count` y
`reopen_reason`. No se reabre en silencio, y solo puede hacerlo quien cierra el
periodo.

## 8 · §19 · Contexto transaccional

`context_ref_kind` / `context_ref_id` permiten anclar una campaña a algo que
ocurrió —una entrega, un lote, un servicio— **solo cuando existe la relación en
el repositorio**. Una restricción impide declarar media referencia. No se
inventa un ERP para tener a qué apuntar.

## 9 · §20, §21 · Borrador y enviada

| Estado | Se puede | No se puede |
|---|---|---|
| `draft` | editar sus valores | — |
| `submitted` | leerse; ser sustituida por una corrección | editarse, borrarse, cambiar de estado |
| `void` | — | — |

`quality_response_is_submitted()` admite exactamente una transición sobre una
respuesta enviada: marcarla como sustituida. Cualquier otro cambio —el estado,
la campaña, la versión, la fecha, la identidad, el origen— se rechaza.

## 10 · §61 · Corregir es una respuesta nueva

`supersedes_id`, `superseded_by` y `correction_note`. La original se conserva
siempre; la corrección es otra fila que apunta a ella.

Para las anónimas ese camino está cerrado de hecho: sin identidad no se puede
saber cuál corregir, y forzarlo exigiría introducir la identidad que se prometió
no guardar.
