# QUALITY-03 · Motor de indicadores

Cómo se evalúa, cómo se calcula la tendencia y por qué el resultado siempre
puede explicarse. Todo lo de este documento es **determinista**: los mismos
datos y la misma configuración dan siempre el mismo veredicto.

---

## 1. La regla que ordena el motor

> **Un resultado de desempeño nunca se escribe. Se deriva.**

No hay ninguna columna donde un usuario pueda teclear «cumple». La evaluación
sale de comparar un valor contra la configuración **que estaba vigente en el
periodo medido** —no la de hoy—, y el desempeño de un objetivo sale de sus
indicadores. 0118 lo garantiza en la capa de privilegios y la RLS en la de
políticas; la prueba X2 lo comprueba contra la base real.

---

## 2. Evaluación

### 2.1 · Los cinco veredictos

| Veredicto | Cuándo | Qué significa |
|---|---|---|
| `complies` | el valor satisface la meta | Cumple |
| `attention` | no cumple, pero cae dentro del umbral de aviso | Atención |
| `not_met` | ni cumple ni entra en el umbral | Fuera de meta |
| `no_data` | no hay medición reportada | Sin dato |
| `no_target` | hay valor pero el tramo no define meta | Sin meta definida |

`no_data` y `no_target` existen separados a propósito. «No sé cómo va» y «nunca
dijimos a dónde íbamos» son dos problemas distintos y se arreglan de formas
distintas.

### 2.2 · La meta es consciente de la dirección (OI-04)

```ts
higher_is_better  → cumple si valor ≥ meta
lower_is_better   → cumple si valor ≤ meta
within_range      → cumple si min ≤ valor ≤ max
exact             → cumple si valor = meta
```

Sin la dirección, un motor que solo sabe comparar «≥» declara un desastre cuando
los reclamos bajan. El umbral de atención sigue la misma dirección: en
`lower_is_better` el aviso está **por encima** de la meta, no por debajo.

En `exact`, el umbral se interpreta como **tolerancia**: `attention` si
`|valor − meta| ≤ tolerancia`.

### 2.3 · La evaluación se hace contra la configuración del periodo (OI-07)

Es el caso crítico del encargo, y se comprueba en las tres suites:

```
ENERO   meta ≥ 90   resultado 92   → CUMPLE

        … se publica una configuración nueva: meta ≥ 95, vigente desde FEBRERO

ENERO   meta ≥ 90   resultado 92   → CUMPLE      ← intacto
FEBRERO meta ≥ 95   resultado 92   → FUERA DE META
```

`quality_config_for_period(indicator_id, period_start, period_end)` resuelve qué
tramo aplicaba, buscando el que cubre el periodo por `effective_from` /
`effective_to`. La evaluación histórica no se recalcula nunca contra la meta de
hoy, porque **preguntar por el pasado con las reglas del presente da una
respuesta falsa**.

### 2.4 · Explicable y auditable (OI-22)

Cada evaluación viene con su explicación en texto, construida en SQL a partir de
los mismos datos que produjeron el veredicto:

```
92 ≥ 90 → cumple
8 ≤ 5 es falso; 8 ≤ 10 (umbral) → atención
66,67 % < 80 % → fuera de meta
```

`quality_fmt_number()` unifica el separador decimal. Suena menor y no lo es: la
base escribía `66.67` en la explicación mientras la aplicación mostraba
`66,67 %` dos centímetros más allá, y una cifra que se escribe de dos maneras en
la misma pantalla hace dudar de las dos.

---

## 3. Tendencia

### 3.1 · También consciente de la dirección

```
mayor es mejor:   90 → 95 → 97   →  MEJORA
menor es mejor:   10 →  7 →  4   →  MEJORA
```

Los dos casos suben y bajan en sentidos opuestos y los dos son buenas noticias.
Una tendencia que solo mira la pendiente acertaría en uno y mentiría en el otro.

En `within_range` y `exact`, «mejor» es **más cerca del objetivo**: lo que se
compara es la distancia a la meta, no el valor. Un indicador que debe quedar
entre 20 y 30 y va 45 → 38 → 32 está mejorando aunque esté bajando.

### 3.2 · Tres condiciones para no mentir

1. **Mínimo tres puntos reportados.** Con dos, cualquier par de números tiene
   pendiente y ninguna significa nada. Con menos: `insufficient_data`.
2. **Solo puntos `reported`.** Un periodo sin dato no se interpola ni se cuenta
   como cero: se salta.
3. **Tolerancia del 2 %.** Una variación menor es `stable`. Sin ella, un
   indicador que va 90,0 → 90,1 → 90,0 alternaría entre «mejora» y «empeora»
   cada mes y enseñaría a ignorar la columna.

---

## 4. Los tres tipos de fuente (OI-08, OI-26)

Cada indicador **declara** cómo se alimenta, y eso decide qué puede hacer la
interfaz.

### 4.1 · Manual

Una persona registra el valor por periodo. Es el único caso en que el navegador
envía un número.

### 4.2 · Calculado

El usuario declara **componentes** y elige una **operación de un catálogo
cerrado**:

| Operación | Fórmula |
|---|---|
| `ratio_percent` | A ÷ B × 100 |
| `ratio` | A ÷ B |
| `difference` | A − B |
| `sum` | suma de los componentes |
| `average` | promedio de los componentes |

La persona registra los componentes; el resultado **lo calcula la base**.

> **No hay SQL, ni JavaScript, ni `eval`, ni expresiones libres.** Es un
> requisito explícito del encargo (§41) y la razón por la que la operación es un
> enumerado y no una cadena. `quality_validate_calc_definition()` rechaza
> cualquier definición que no encaje en el catálogo, y lo hace en la base: un
> cliente manipulado no puede saltárselo. Una división por cero devuelve
> `unavailable`, no un error ni un cero silencioso.

La **fórmula legible** (`formula_text`) es un campo aparte, para humanos. Que la
definición ejecutable y la explicación sean dos cosas distintas es OI-05.

### 4.3 · Automático — nativo de Quality

El valor sale de datos que Trazaloop **ya tiene**. Ver
`QUALITY_03_AUTOMATIC_SOURCES.md`.

**Nadie puede escribir el resultado de un automático.** No es una validación de
formulario: la server action ni siquiera envía el campo, la RPC lo rechaza y la
tabla no concede `insert` ni `update` a `authenticated`. Tres capas, porque la
primera es la que un atacante no usa.

---

## 5. Periodos

`quality_period_bounds(frequency, date)` devuelve el periodo que contiene una
fecha para cada periodicidad —`monthly`, `quarterly`, `semiannual`, `annual`—, y
`quality_previous_period()` el anterior. Los periodos son **explícitos**
(`period_start`, `period_end`), nunca inferidos de la fecha en que alguien
registró el dato: medir el martes lo que pasó en enero debe quedar en enero.

### 5.1 · Medición pendiente (§X del informe)

`v_quality_indicator_status` **deriva** si falta la medición del periodo
vencido: no hay proceso que marque nada. `quality_scan_pending_measurements()`
convierte esa derivación en tarea y alerta para el **titular actual del cargo**
responsable, y repetir el barrido **no duplica** (AT-07): busca la tarea abierta
antes de crearla.

---

## 6. Corrección (OI-09, OI-28)

Corregir **no borra y no reescribe**:

1. se crea una medición nueva con el valor correcto;
2. la anterior queda con `superseded_by_measurement_id` e `is_current = false`;
3. el motivo, el autor y la fecha de la corrección quedan registrados;
4. el original sigue siendo legible.

Un dato que se corrige en sitio es un dato del que ya no se puede responder.

---

## 7. Desempeño del objetivo (OI-18)

Se deriva de los indicadores del objetivo según la regla que el objetivo
**declara**, y viene con la explicación de por qué salió así:

| Regla | Resultado |
|---|---|
| `worst_indicator` | el objetivo vale lo que su peor indicador: basta uno fuera de meta |
| `majority_comply` | más de la mitad de los indicadores con dato deben cumplir |

> **Ponderación.** OI no define pesos, y el encargo prohíbe inventarlos. Por eso
> **no existe una regla ponderada**: ni en el enumerado de la base, ni en el
> dominio, ni en la interfaz. Un peso inventado es peor que ninguno: convierte
> una decisión de gestión que nadie tomó en un número que parece objetivo.
> Cuando OI defina los pesos, la regla se añade ensanchando el CHECK.

---

## 8. Fuera de meta ≠ no conformidad (OI-13)

Un indicador fuera de meta produce un **evento**, una **alerta** y una **tarea
de análisis**. No produce una no conformidad.

La distinción es de fondo, no de vocabulario: una no conformidad es un
incumplimiento declarado por alguien que lo evaluó, con su proceso y sus
consecuencias. Un número por debajo de la meta es una **señal** que pide
análisis, y a veces la conclusión es que la meta estaba mal puesta. Crear la NC
automáticamente sustituiría el juicio de la persona por una comparación
aritmética. La prueba G4 lo comprueba contra la base real.
