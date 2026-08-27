# QUALITY-10 · El modelo de entradas

## 1 · TIPO DE ENTRADA ≠ VALOR DE LA ENTRADA (§14)

```
CATÁLOGO                        INSTANCIA
«Resultados de auditorías»  →   Programa 2027 · 5 de 6 ejecutadas ·
(qué hay que mirar,             12 hallazgos · 3 NC formalizadas ·
 global, catorce)               2 seguimientos pendientes
                                (qué se vio ESA vez, en ESE periodo)
```

La alternativa —catorce columnas en `quality_management_reviews`— habría hecho
imposible añadir la decimoquinta, y habría convertido cada entrada en un `text`
sin estado, sin periodo y sin origen.

## 2 · Las cuatro capas de una entrada

Están en columnas distintas de la misma fila, y nunca se pisan:

| Capa | Qué es | Quién la escribe |
|---|---|---|
| **Dato fuente** | `snapshot` + `summary` | El adaptador, leyendo su dominio |
| **Linaje** | dominio, entidad, periodo, huella | El adaptador |
| **Análisis** | `analysis`, `conclusion` | Una persona |
| **Necesidad** | `requires_decision` | Una persona |

**§37 · El análisis no modifica el dato.** Un sistema donde la dirección puede
«corregir» el número que le incomoda deja de ser un sistema de gestión.

**§38 · Y `requires_decision` no es una decisión.** Decir «esto hay que
resolverlo» no es haberlo resuelto: la decisión es otro objeto, con autor y
fecha.

## 3 · AUTOMÁTICA ≠ MANUAL (§16, §17)

Trece entradas las reúne la plataforma. Una —`changes`— es mixta: los cambios
documentales y de proceso salen del sistema; el contexto, la regulación, el
mercado y la estrategia los aporta la dirección.

Y cualquier entrada admite aportaciones manuales, que quedan con **autor,
fecha y categoría**, marcadas como aportación humana:

```
change_internal · change_external · regulatory · strategic
resource_need · improvement_opportunity · context · other
```

Convertir cualquier texto en «evidencia objetiva» es lo que hace que un acta no
valga delante de nadie.

## 4 · Los cinco estados, y por qué son cinco (§34, §35, §36)

| Estado | Qué significa | ¿Está mirada? |
|---|---|---|
| `pending` | Nadie la ha mirado todavía | **No** |
| `prepared` | Se consultó y había dato | Sí |
| `reviewed` | Además, alguien la analizó | Sí |
| `missing` | Se consultó y **no había dato** en el periodo | Sí |
| `not_applicable` | Alguien decidió que no corresponde, **con razón escrita** | Sí |

Las dos confusiones que esto evita:

> **«Sin datos» no es cero.** Si no hubo campaña de satisfacción en el periodo,
> el resumen lo dice con palabras. Escribir «satisfacción = 0» afirmaría un mal
> resultado que nadie midió.

> **«No aplica» no es «faltante», y ninguno es «pendiente».** Una entrada
> faltante SÍ está revisada: se comprobó y no había nada. Una pendiente no se ha
> mirado. Cerrar la revisión exige que no quede ninguna pendiente.

**Verificado contra base real** (`test:quality10-rls` B1–B2): sin campaña, la
entrada queda en `missing`, el resumen dice «NO significa satisfacción cero» y
en el retrato no aparece ningún cero de satisfacción.

## 5 · El estado de listo (§34)

`quality_mr_readiness(review_id)` devuelve los cinco conteos, cuántas entradas
siguen sin análisis y una bandera `is_ready` que **no** se enciende si queda
algo pendiente. Un indicador de preparación que siempre dice «listo» solo enseña
a ignorarlo.

```
Todavía no está lista: 2 entrada(s) sin preparar y 1 esperan aportación
de la dirección.
```

## 6 · Frescura y refresco (§56, §57, §85)

Cada entrada guarda la **huella** del dato preparado: `md5` del propio retrato.
`jsonb` ordena sus claves, así que el mismo dato produce siempre la misma huella.

`quality_mr_input_freshness(input_id)` compara la huella de hoy con la guardada
y devuelve `source_updated`. **No toca nada.** Cambiar por debajo un retrato que
alguien ya revisó es peor que dejarlo viejo, porque nadie se entera.

Refrescar es un acto separado y consciente, y **conserva el análisis**:

- las columnas de análisis **no aparecen** en el `set` del refresco;
- ni en el `do update` del conflicto al preparar;
- y una entrada ya `reviewed` no vuelve a `prepared` porque el dato cambie.

**Verificado** (`test:quality10-rls` G1–G5): con análisis escrito, se añade un
caso al periodo; la frescura dice `source_updated: true` y el retrato sigue
intacto; al refrescar, el dato se actualiza y `analysis`, `conclusion` y
`requires_decision` siguen exactamente donde estaban; y preparar la revisión
entera tampoco los borra.

## 7 · Linaje: ningún número mágico (§58, §59, §60)

Cada adaptador devuelve un array `lineage`:

```json
[{"domain": "QUALITY-09 · hallazgos",
  "entity": "quality_audit_findings",
  "filter": "levantados entre 2027-01-01 y 2027-12-31"}]
```

La pantalla lo pinta bajo «De dónde viene este número», y el PDF del paquete de
entradas lo imprime en su propia tabla. Un dato sin origen no se puede discutir
en una reunión, y tampoco se puede defender delante de un auditor.

**Verificado** (`test:quality10-rls` A2): las catorce entradas traen `lineage`
con al menos un elemento, y las automáticas traen huella y periodo.
