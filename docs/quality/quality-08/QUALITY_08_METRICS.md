# QUALITY-08 · Métricas, tendencia y comparabilidad

> **VC-12 · VC-13 · VC-28 · §14, §15, §36, §37, §38, §39, §40, §49, §50, §78**

## 1 · VC-13 · Trazaloop no impone ninguna metodología

La empresa define qué mide y cómo, en `quality_customer_metric_definitions`:

| Método | Qué calcula |
|---|---|
| `nps` | %promotores − %detractores, **solo** con escala 0–10 |
| `csat` | promedio de una pregunta de satisfacción |
| `average` | promedio simple de lo respondido |
| `top_box` | % de respuestas iguales o superiores a un umbral que fija la empresa |
| `response_count` | cuántas respuestas se recibieron — es un recuento, no una satisfacción |
| `custom` | una definición propia; el producto no finge conocerla |

Lo único que el sistema **no permite** es llamar NPS a algo que no lo es.

## 2 · §14 · NPS es NPS o no se llama así

```sql
constraint quality_customer_metric_definitions_nps_check
  check (method <> 'nps'
      or (expects_scale_min = 0 and expects_scale_max = 10
          and question_stable_key is not null))
```

Y la fórmula, con las bandas de la metodología:

| Banda | Valores |
|---|---|
| Promotores | 9–10 |
| Pasivos | 7–8 |
| Detractores | 0–6 |

**NPS = %promotores − %detractores.**

El escenario del encargo, comprobado en el dominio y contra base real: respuestas
**10, 9, 8, 6** → 2 promotores (50 %), 1 pasivo (25 %), 1 detractor (25 %) →
**NPS = 25**.

Llamar NPS a un promedio cualquiera es el error que sobrevive años porque nadie
vuelve a mirar la fórmula. Por eso la restricción está en la base y no en un
comentario.

**Si la escala cambió, no se calcula un NPS falso.** El cálculo comprueba que la
pregunta de esa versión siga siendo 0–10; si no lo es, salta la métrica y el
corte de serie queda visible.

## 3 · VC-12, VC-28 · El resultado guarda cómo se calculó

```
quality_customer_metric_results
  value              ← nulo cuando no hay con qué calcular
  sample_size        ← cuántas entraron
  not_applicable     ← cuántas salieron por «no aplica»
  skipped            ← cuántas quedaron sin responder
  distribution       ← el reparto, para no recalcularlo
  method_snapshot    ← método, pregunta, escala y umbral, congelados
  comparability_key  ← la firma del instrumento
```

Es inmutable: recalcular es calcular otra vez. Sin `method_snapshot`, cambiar la
fórmula reescribiría en silencio lo que significó un número de hace dos años.

## 4 · §37 · La clave de comparabilidad

```
comparabilityKey = método | clave estable de la pregunta | escala mín-máx
```

Dos mediciones son la misma serie **solo si** midieron la misma pregunta, en la
misma escala, con el mismo método. Cuando la clave cambia, la serie se parte.

`v_quality_metric_series` lo marca fila a fila con `breaks_comparability`,
calculado contra la medición anterior con `lag()`. La pantalla usa
`splitComparableSeries()` para dibujar **tramos**, no una línea continua, y el
PDF imprime la clave de cada punto.

> §86 · Medir con escala 1–5 y después con 0–10 produce dos claves distintas.
> La gráfica se corta ahí y dice por qué. Unir los puntos afirmaría una
> tendencia que no existe.

## 5 · §38 · La tasa de respuesta solo existe con denominador

```
population_size declarado  →  tasa sobre la población,   basis = 'population'
sin población, con enlaces →  tasa sobre las invitaciones, basis = 'invitations'
ni una cosa ni la otra     →  response_rate = NULL
```

`responses_count` está **siempre**. `response_rate` puede no estar, y la vista
dice sobre qué base calculó cuando la hay. Son dos cosas distintas y
confundirlas fabrica un porcentaje que nadie puede defender.

En pantalla y en papel se dice «Sin denominador», no «0 %».

## 6 · §39 · Cero respuestas no es cero satisfacción

Con `v_sample = 0` el cálculo devuelve `null`, no `0`. La pantalla escribe «Sin
respuestas» y el PDF también.

Un NPS de 0 **sí** es un resultado real —tantos promotores como detractores— y
por eso no se puede confundir con la ausencia de datos. `npsScore([])` devuelve
`null`; `npsScore([0,0])` devuelve `-100`.

## 7 · §40 · «No aplica» no es un cero

Un cero dice «lo hizo mal». «No aplica» dice «esto no se le puede preguntar».
Contar lo segundo como lo primero hunde un resultado por algo que nadie
contestó.

Los tres desenlaces se cuentan por separado en cada resultado, y la pantalla y
el papel los muestran junto al número: un 90 sobre tres respuestas no es un 90
sobre doce.

## 8 · §49, §50 · La integración con QUALITY-03

**No se creó `quality_customer_indicators`.** Se ensanchó el catálogo cerrado de
fuentes automáticas que QUALITY-03 ya tenía, con cuatro claves:

| Clave | Naturaleza | Qué mide |
|---|---|---|
| `quality.customer_complaints_count` | periodo | quejas y reclamos recibidos |
| `quality.customer_complaints_closed_ratio` | periodo | % de las quejas del periodo ya atendidas |
| `quality.customer_survey_responses_count` | periodo | respuestas enviadas |
| `quality.customer_open_complaints_count` | instantánea | quejas sin atender hoy |

Un indicador de satisfacción se configura como cualquier otro, con el mismo
motor, la misma verdad histórica y la misma pantalla. Una prueba comprueba que
el catálogo del dominio y el de la base digan exactamente lo mismo — si
divergieran, se podría configurar un indicador que después no supiera
calcularse.

Y ninguna de esas fuentes mide satisfacción: contar quejas es contar quejas.
`customer_complaints_closed_ratio` devuelve `null` sin quejas, porque un 100 %
sobre cero afirmaría una gestión que no ocurrió.

**§50 · Calcular una métrica no toca ninguna medición cerrada.** El cálculo
produce el dato; qué hacer con él se decide en QUALITY-03, con sus reglas.

## 9 · Y lo que un resultado NO es

`quality_compute_campaign_metrics` devuelve `decides_nothing: true`, y la acción
lo traduce al mensaje que ve quien calcula:

> «Un resultado NO es una decisión: no abre casos, no clasifica no conformidades
> y no crea riesgos.»

La suite lo comprueba contando casos y riesgos antes y después.
