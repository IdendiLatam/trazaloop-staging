# EXPORT-01 · Verdad histórica

> Nunca se reconstruye el pasado con valores actuales.

Este es el punto donde un PDF puede mentir con más facilidad y más daño: no
inventando datos, sino usando los de hoy para explicar una decisión de ayer.

## Los seis casos, y cómo se resuelve cada uno

### 1 · Indicador · la meta que regía

Si en enero la meta era 90 y hoy es 95, imprimir «enero: 82, meta 95 → no
cumple» convierte un incumplimiento leve en uno grave y hace indefendible la
decisión que se tomó entonces.

`listMeasurements` ya devuelve `appliedTargetValue`, la meta **de ese periodo**.
El PDF usa esa, y la columna se llama literalmente **«Meta de entonces»**, con
una nota que lo explica. La tabla de configuraciones muestra además la
vigencia de cada versión.

### 2 · Riesgo · la metodología con la que se evaluó

Una evaluación apunta por clave foránea a la **versión inmutable** de
metodología que usó. La ficha imprime «Metodología X v1» junto a cada
evaluación, y la matriz que acompaña al riesgo se dibuja con **esa** versión,
no con la vigente. Si la empresa publicó criterios nuevos, el papel sigue
explicándose con los suyos.

### 3 · Documento · su revisión

El PDF del documento controlado imprime la revisión vigente, y si no hay
ninguna vigente lo dice en la primera página. El historial de revisiones
conserva estado, fechas y qué cambió.

### 4 · No conformidad · requisito, evidencia y decisión originales

Requisito, evidencia e incumplimiento se imprimen **separados**, nunca fundidos
en un párrafo. Son tres afirmaciones distintas y una auditoría las separa.

### 5 · Acción · la verificación negativa se conserva

Una verificación que concluyó «no eficaz» aparece en la tabla de eficacia con
su criterio y su observación. No se sustituye por la siguiente.

### 6 · Mapa · el snapshot publicado

El mapa exporta la **versión publicada** tal como quedó al publicarla. Los
cambios posteriores en los procesos no la modifican, y el PDF lo dice.

## Viva contra histórica (§25)

Cuando un PDF muestra una referencia, la etiqueta:

```
INDICADOR · REFERENCIA VIVA
IND-APROB · Tiempo de aprobación documental

EVALUACIÓN DEL RIESGO · COMO ESTABA ENTONCES
Alto
Evaluación residual del 26/08/2026 · puntaje 12
```

Sin esa etiqueta el lector no puede saber si lo que ve es lo que había o lo que
hay. Con ella, no hace falta que lo adivine.

Un ejemplo real del modelo: cuando un caso nace de un riesgo materializado, se
enlaza la evaluación que **regía cuando ocurrió**. Si el riesgo se evaluó
*después* del suceso, no se ata en silencio la evaluación posterior: se ata
diciendo «es POSTERIOR al suceso».
