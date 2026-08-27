# QUALITY-11 · El motor de reglas

Una sola función evalúa: `quality_automation_run(empresa, modo, regla, día)`.
El botón «Ejecutar ahora», el barrido programado y la simulación entran por
ella. No hay un segundo evaluador, porque una simulación que no comparte código
con la ejecución real deja de ser una simulación y pasa a ser una promesa.

## 1 · Qué hace, en orden

1. **Comprueba el rol** si hay sesión. Sin sesión —el cron— no hay rol que
   comprobar: es el mismo patrón que usan los ocho barridos heredados.
2. **Resuelve el día de negocio una vez**, en la zona horaria de la empresa, y
   lo pasa a todo lo demás. Ninguna condición vuelve a mirar el reloj: si lo
   hiciera, dos condiciones de la misma regla podrían caer en días distintos.
3. **Abre la ejecución** con `clock_timestamp()` y el tipo correcto: `manual`
   con sesión, `scheduled` sin ella, `simulation` si se pidió.
4. **Recorre las reglas activas** no silenciadas, en orden de código.
5. Por cada regla, **elige la versión que gobierna hoy**: la que tiene hoy
   dentro de su ventana de vigencia. Si no hay ninguna, la regla se omite y se
   escribe por qué.
6. **Materializa los sujetos** de la fuente, con sus hechos en `jsonb`.
7. **Evalúa** cada sujeto y, si coincide, emite las salidas declaradas.
8. **Resuelve solas** las señales abiertas de esa regla cuyo sujeto se evaluó y
   ya no cumple la condición.
9. **Ejecuta los ocho observadores de plataforma**, cada uno aislado.
10. **Cierra la ejecución** con sus contadores y su duración real.

## 2 · El catálogo de operadores

| Operador | Qué afirma | Tipos |
|---|---|---|
| `equals` · `not_equals` | igualdad exacta de texto | todos |
| `in` · `not_in` | pertenencia a una lista cerrada | texto |
| `greater_than` · `less_than` · `gte` · `lte` | comparación numérica | número |
| `is_empty` · `is_not_empty` | hay dato o no lo hay | todos |
| `days_before` | la fecha está por llegar y faltan N días o menos | fecha |
| `days_after` | la fecha ya pasó hace N días o más (N=0 incluye hoy) | fecha |
| `consecutive_count` | los N últimos elementos de la serie son ciertos | serie booleana |
| `strictly_decreasing` | los N últimos valores bajan uno tras otro | serie numérica |

Los dos últimos son los que permiten decir «lleva tres periodos fuera de meta» y
«va empeorando» sin ninguna interpretación: `consecutive_count` recorre la serie
desde el final y corta al primer elemento falso; `strictly_decreasing` compara
cada valor con el anterior y exige al menos dos.

Entre condiciones hay **AND**, y no hay O. No es una limitación técnica: «A o B»
son dos reglas, y dos reglas se explican por separado. Una lista de condiciones
vacía **no coincide** — si coincidiera, marcaría a todos los sujetos.

## 3 · Por qué no hay SQL dinámico

El proveedor de sujetos es un `IF/ELSIF` de dieciocho ramas, cada una con su
consulta **escrita a mano**, que devuelve `(subject_id, subject_label,
owner_position_id, facts jsonb)`. El evaluador solo lee `facts ->> campo`.

No hay una sola construcción de SQL en tiempo de ejecución en el proveedor ni en
el evaluador. La única del motor entero es el `execute format('select %I($1)')`
que invoca a los observadores de plataforma, y el nombre sale de una lista
literal escrita en la migración: no viene de datos, no viene del cliente, y va
cualificado como identificador con el argumento parametrizado.

Consecuencia: **la inyección no está filtrada, está ausente**. No hay superficie.

## 4 · Por qué los bucles son imposibles

No hay límite de recursión porque no hay recursión que limitar.

Ninguna de las 18 fuentes observa `work_tasks`, `work_alerts`, `quality_signals`
ni `quality_automation_runs`. El grafo «regla → salida» tiene profundidad uno
por construcción: una regla no puede reaccionar a lo que otra regla produjo,
porque no hay forma de mirarlo. El motor tampoco se llama a sí mismo, y ninguna
tabla de salida tiene un disparador que lo invoque.

La prueba N2 lo comprueba por la vía empírica: cinco barridos seguidos no crean
ni una tarea de más.

## 5 · Cómo falla

- **Un dato con forma inesperada** → la condición devuelve `matched: false` con
  una explicación en castellano. No coincide por defecto.
- **Un operador desconocido** → no coincide.
- **Una regla que revienta** → se anota el fallo con su mensaje y el barrido
  **sigue**. El resto de las reglas y los ocho observadores llegan al final.
- **Un observador heredado que revienta** → igual, y no arrastra a los demás.
- **La ejecución** queda `success` si no hubo fallos, `partial` si hubo fallos y
  algo se evaluó, `failed` si no se evaluó nada.

Un fallo del motor es un problema **operativo**, no una condición de calidad. Se
cuentan aparte a propósito: la avería del termómetro no es fiebre.

## 6 · Lo que cuesta

Medido con `test:quality11-perf`, en local:

| Escenario | Sujetos | Reglas | Motor |
|---|---|---|---|
| 100 sujetos · 1 regla | 100 | 1 | ~126 ms |
| 1 000 sujetos · 1 regla | 1 000 | 1 | ~912 ms |
| 1 000 sujetos · 3 reglas | 3 000 | 3 | ~1 494 ms |

Diez veces más sujetos cuesta unas siete veces más, y triplicar las reglas cuesta
menos del doble. No hay N+1: el coste es una consulta por regla, no una por
sujeto.
