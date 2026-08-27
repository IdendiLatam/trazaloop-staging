# QUALITY-11 · Rendimiento (§156)

No hay un número mágico que aprobar. Lo que se mide es la **forma de la curva**:
si evaluar diez veces más sujetos costara cien veces más, habría una consulta
por sujeto escondida en alguna parte.

## 1 · Lo medido

`npm run test:quality11-perf`, contra el stack local (Postgres 17):

| Escenario | Sujetos | Reglas | Motor | Total (incl. red) | Coincidencias | Señales | Tareas |
|---|---|---|---|---|---|---|---|
| 100 sujetos · 1 regla | 100 | 1 | **126 ms** | 159 ms | 100 | 100 | 100 |
| 100 sujetos · repetido | 100 | 1 | **95 ms** | 100 ms | 100 | 0 | 0 |
| 100 sujetos · tercero | 100 | 1 | **64 ms** | 70 ms | 100 | 0 | 0 |
| 1 000 sujetos · 1 regla | 1 000 | 1 | **912 ms** | 921 ms | 1 000 | 900 | 900 |
| 1 000 sujetos · 3 reglas | 3 000 | 3 | **1 494 ms** | 1 507 ms | 3 000 | 2 000 | 0 |

## 2 · Lo que dicen los números

**×10 sujetos → ×7,2 coste.** Sublineal, porque el coste fijo del barrido —abrir
la ejecución, recorrer las reglas, ejecutar los ocho observadores— se amortiza.
Un N+1 real dispararía esta razón muy por encima de 30.

**×3 reglas → ×1,6 coste.** Cada regla añade **una** consulta de censo y su
bucle de evaluación en memoria. No multiplica el coste de las demás.

**El barrido repetido es más barato**, y eso también es una señal de salud: sin
salidas nuevas que escribir, solo queda leer y comparar.

## 3 · Por qué no hay N+1

El proveedor de sujetos materializa **cada fuente en una consulta** y devuelve
los hechos ya empaquetados en `jsonb`. El evaluador no vuelve a la base: lee
`facts ->> campo` en memoria. El coste es:

```
por regla:    1 consulta de censo  +  N evaluaciones en memoria
por señal:    1 upsert  (+ 1 insert por aviso y por tarea, si la regla los pide)
```

Los sub-`select` que aparecen dentro de algunas ramas del censo —las series de
mediciones de un indicador, las incidencias abiertas de un proveedor— son
laterales acotados a 12 elementos, no consultas por sujeto en el bucle.

## 4 · Lo que acota el barrido

`quality_automation_subjects` recibe `p_limit` (5 000 por omisión) y **las
dieciocho ramas lo aplican**. Una empresa con más sujetos que el tope evalúa los
primeros; el resto entra en el siguiente barrido. Se prefiere un barrido acotado
que termina a uno completo que se queda a medias.

## 5 · Dónde miraría primero si un día va lento

1. `quality_automation_run_rules.duration_ms` — dice qué regla u observador se
   comió el tiempo, en el mismo informe que el usuario ya puede descargar.
2. `subjects_evaluated` por regla — una fuente que devuelve miles de sujetos
   para una condición que casi nunca se cumple es candidata a filtrarse en el
   censo, no en el evaluador.
3. Los ocho observadores heredados: son ocho llamadas cuyo coste no controla
   QUALITY-11 y que aparecen individualmente cronometradas.
