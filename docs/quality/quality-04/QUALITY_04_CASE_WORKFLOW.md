# QUALITY-04 · El ciclo del caso

## 1. El ciclo, tal como lo fija el baseline

```
SEÑAL / EVENTO → EVALUACIÓN → CONTENCIÓN → CORRECCIÓN → ANÁLISIS DE CAUSA
→ ACCIONES → EJECUCIÓN → EFICACIA → CIERRE → APRENDIZAJE
```

**No todos los casos recorren todos los pasos.** AC-07 y AC-08 dicen que la
profundidad del tratamiento es proporcional al riesgo, la recurrencia y el
impacto. Una observación no exige análisis de causa; una no conformidad sí.

## 2. Señal ≠ caso ≠ no conformidad (AC-04)

QUALITY-03 ya emite eventos, alertas y tareas cuando un indicador queda fuera de
meta. **Nada de eso se convierte en caso solo.**

```
SEÑAL              →  [ Crear un caso a partir de esta señal ]  →  CASO
(indicator.target_missed)         acto explícito                  (referencia,
                                  de una persona                   no copia)
```

Y el caso tampoco nace clasificado: nace `pending`, que no es un limbo
administrativo sino la afirmación de que **todavía nadie ha decidido**.

Un indicador por debajo de la meta puede ser una variación puntual, un cambio de
método o un error de captura. Llamarlo automáticamente «no conformidad»
sustituye el juicio de una persona por una comparación aritmética, y devalúa las
no conformidades de verdad.

**Comprobado:** con una medición de 82 frente a una meta de 95, el contador de
no conformidades queda en **0** (prueba `A1`); crear el caso desde la señal lo
deja en **0** (`A2`); evaluarlo como observación lo deja en **0** (`A3`).
Solo formalizar una NC lo sube a **1** (`B3`).

## 3. La evaluación

Es la decisión de AC-04, y pasa por `work_classify_case`, que exige:

1. que exista **al menos un hallazgo** — sin hecho observado no hay nada que
   evaluar (`B1`);
2. un **fundamento** escrito — es lo que hace defendible la decisión;
3. si es no conformidad, el **requisito** y la **declaración del
   incumplimiento** (`B2`).

La decisión queda en `work_decisions` y **no se edita**. Si más adelante la
conclusión cambia, se registra otra: el historial debe mostrar que cambió, no
fingir que siempre se pensó lo mismo (`B4`).

Las cuatro clasificaciones son las que el dominio contempla:

| | |
|---|---|
| **No conformidad** | se incumple un requisito. Exige corrección y causa |
| **Observación** | no incumple, pero conviene registrarlo |
| **Oportunidad de mejora** | nada está mal; algo puede estar mejor (AC-20) |
| **No aplica** | se evaluó y no procede tratarlo como caso |

Un caso evaluado como **no** conformidad no se borra: la evaluación ya tiene
valor histórico (§60).

## 4. Corrección ≠ acción correctiva (AC-05, AC-06)

```
Problema:           el procedimiento venció sin revisarse

Contención:         (si aplicara) detener el uso del documento
Corrección:         revisar y actualizar el procedimiento
Acción correctiva:  configurar seguimiento preventivo con responsable
```

Confundir las dos últimas es el error clásico del dominio: se arregla el
documento, se cierra la no conformidad, y seis meses después vuelve a vencerse
porque nadie tocó el control que lo permitió.

Las cuatro viven en **un solo motor** con `action_kind` distinto, y la ficha las
muestra por separado con su explicación.

## 5. Causa: hipótesis ≠ causa validada (AC-10)

Una hipótesis se escribe, se discute y se descarta. Una **causa validada** se
aprueba —`work_approve_cause`— y desde ese momento es historia: un disparador
impide reescribirla (`B7`). Si la conclusión cambia, se registra un análisis
nuevo; el anterior queda.

Metodología elegible: cinco porqués, Ishikawa o análisis estructurado.

## 6. Completada ≠ cerrada ≠ eficaz (AC-13)

La distinción que más se incumple en los sistemas reales.

```
status = completed  +  effectiveness = pending        → «Completada · falta verificar si sirvió»
status = completed  +  effectiveness = not_effective  → «Completada, pero NO eficaz»
status = completed  +  effectiveness = effective      → «Completada y eficaz»       ← closed_at
status = completed  +  effectiveness = not_required   → «Completada»                ← closed_at
```

`work_complete_action` deja la eficacia en `pending` y **no** pone `closed_at`
cuando la acción exige verificación (`B10`). «closed = success» es la mentira que
hace que los planes de acción no valgan nada.

El criterio de eficacia se define **antes** (AC-16): un CHECK impide exigir
verificación sin decir contra qué se comprobará (`B9`).

## 7. Eficacia negativa (AC-17)

Una verificación `not_effective`:

- **no** borra la acción;
- **no** se puede convertir en `effective` con un UPDATE (`B13`);
- devuelve el caso a **análisis** (`B12`);
- permite planificar otra acción, y la primera **sigue ahí** con su «no eficaz»
  (`B14`).

Sobrescribirla borraría exactamente el aprendizaje que justifica todo el ciclo.

## 8. Cierre condicionado (AC-18)

Un caso **no** se cierra porque las tareas estén marcadas.
`work_case_closure_eligibility` devuelve qué falta, en español, para que la
pantalla muestre la lista en vez de un botón deshabilitado sin explicación:

| Condición | ¿Cuándo se exige? |
|---|---|
| Evaluar el caso y clasificarlo | siempre |
| Aprobar el análisis de causa | **solo si es no conformidad** (AC-07, AC-08) |
| Registrar al menos una acción correctiva | **solo si es no conformidad** |
| Ninguna acción sin completar | siempre |
| Ninguna eficacia obligatoria pendiente | siempre |

Y se vuelve a comprobar **en el acto de cerrar**, no antes (`B5`, `B11`, `B15`).
El cierre exige fundamento.

## 9. Cerrado no es borrado. Reabrir no borra el cierre (AC-19)

Un caso cerrado **permanece consultable** y no se edita por la puerta de atrás:
un disparador impide cambiar clasificación, título o declaración con un UPDATE
(`B16`).

Reabrir exige **motivo** y solo puede la administración (`B17`, `X4`). El cierre
anterior **no se borra**: queda en el historial junto con la reapertura, y
`reopen_count` lleva la cuenta.

## 10. El historial

Lo que se decidió, quién y por qué, en español y en pasado:

```
25 ago   Evaluado como observación
         Coordinadora de Calidad
         Variación puntual de un solo periodo…

25 ago   Caso cerrado
         Coordinadora de Calidad
         Se evaluó y no procede tratarlo como no conformidad…
```

Sale de `work_decisions`, que es historia de **negocio**. `audit_log` sigue
siendo técnico y no se usa para esto (§68).

## 11. Quién puede qué

| | Registrar | Clasificar · aprobar causa · verificar · cerrar | Reabrir |
|---|---|---|---|
| Administrador | sí | sí | **sí** |
| Calidad | sí | sí | no |
| Consultor | sí | **no** | no |
| Otros | no | no | no |

Registrar es trabajo operativo; decidir es gobierno. Comprobado con sesiones
reales, no con botones ocultos (`X3`, `X4`).
