# QUALITY-07 · Evaluación

> **GP-15 · GP-16 · GP-24 · §18…§24, §30, §66**

## 1 · Una tabla, cuatro motivos

Selección, evaluación periódica, reevaluación y reevaluación extraordinaria son
**el mismo acto en momentos distintos**. Lo que cambia es por qué se hace, y eso
cabe en una columna:

```
quality_supplier_evaluations.evaluation_kind
  selection | periodic | reevaluation | extraordinary
```

Se consideró la alternativa —tres tablas gemelas, como sugiere la lista lógica
de nombres del encargo— y se descartó: habrían compartido criterios, resultados,
cálculo, cierre y papel, y la primera divergencia entre ellas habría sido un
error, no una decisión. La desviación queda declarada aquí.

`trigger_reason` guarda el porqué. En una extraordinaria es lo único que hace
comprensible, dos años después, por qué se evaluó fuera de ciclo.

## 2 · La plantilla se VERSIONA

```
quality_supplier_evaluation_templates      ← «Evaluación estándar de insumos»
└── quality_supplier_template_versions     ← v1 (sustituida) · v2 (publicada)
    └── quality_supplier_evaluation_criteria  ← cuelgan de la VERSIÓN
```

Los criterios cuelgan de la versión, no de la plantilla. Si colgaran de la
plantilla, cambiar el peso de un criterio en 2027 haría que todas las
evaluaciones anteriores empezaran a significar otra cosa sin que nadie las
hubiera tocado, y la comparación entre años dejaría de tener sentido.

`quality_supplier_evaluations.version_id` ata cada evaluación a la versión con
la que se hizo. `getSupplierEvaluation` lee los criterios de **esa** versión, y
el PDF los imprime con una nota que lo dice.

`quality_publish_supplier_template_version` cierra la versión anterior el día
antes, la deja en `superseded` y numera la nueva. Nunca hay dos vigentes, y no
toca ninguna evaluación ya hecha.

## 3 · El cálculo, y lo que deja fuera

```
weightedScore(resultados) =
  Σ(peso × 100 × puntos / máximo)  ÷  Σ(peso)     — solo sobre los `scored`
```

Los otros tres desenlaces salen del cálculo. Y el resultado va siempre
acompañado de **cuánto se pudo mirar**:

> «Resultado: 92 · Excelente (2 de 3 criterios puntuados; 1 no aplica).»

Un 90 sobre tres criterios no es un 90 sobre doce, y decir solo «90» es
esconderlo. `summarizeOutcomes` produce el desglose y tanto la pantalla como el
papel lo imprimen.

Si **ningún** criterio se pudo puntuar, `weightedScore` devuelve `null`, no `0`.
Un cero significa «lo hizo mal»; la ausencia de datos significa otra cosa.

## 4 · Cerrar informa; no homologa

`quality_close_supplier_evaluation` calcula, fija la puntuación y la banda,
actualiza `last_evaluated_on` / `next_review_on` del proveedor, y devuelve:

```json
{ "score": 92, "band": "Excelente", "scored": 2, "not_applicable": 1,
  "decides_nothing": true }
```

Ese `decides_nothing` no es adorno: es la afirmación que el dominio quiere que
llegue hasta la pantalla. El mensaje que ve quien cierra termina en

> «Esto NO aprueba al proveedor: la decisión de aprobación es un acto aparte.»

`scoreApproves()` existe en el dominio de TypeScript con un solo trabajo:
devolver `false` siempre. Es la forma de que una prueba pueda comprobar que
nadie introdujo un umbral automático.

## 5 · Una evaluación cerrada es final

Dos disparadores, añadidos tras encontrarlo con la suite:

- `quality_supplier_evaluation_is_closed` — rechaza cualquier `update` o
  `delete` sobre una evaluación cuyo estado **anterior** ya era `closed`. Mira
  `old.status`, no `new.status`, para no bloquear el propio cierre.
- `quality_supplier_result_parent_is_open` — rechaza tocar los criterios de una
  evaluación cerrada, que sería cambiar la puntuación por la puerta de atrás.

Reevaluar es abrir una evaluación **nueva**. La anterior sigue ahí, y si el
resultado bajó, la evolución lo enseña.

## 6 · GP-24 · La tendencia solo se afirma cuando existe

`describeTrend` se niega a decir «mejora» o «empeora» con menos de dos
evaluaciones cerradas. Con una sola dice qué hay y calla el resto; con ninguna,
dice que no hay con qué comparar.

Y el informe de desempeño añade la advertencia que hace falta: dos resultados
solo son comparables si se midieron con la misma plantilla, así que la tabla
dice cuál se usó en cada caso.
