# QUALITY-12.3B1 · Matriz de pruebas

Dos suites. Las invariantes que viven en un CHECK se prueban **contra la base**:
probarlas en TypeScript demostraría que el TypeScript las respeta, no que la
base las impone.

| Suite | Comando | Qué cubre |
|---|---|---|
| Estructura | `npm run test:quality123` | 17 comprobaciones sobre el SQL: qué se creó, qué **no**, y las fronteras |
| Base real | `npm run test:quality123-rls` | 31 comprobaciones con sesiones reales de dos empresas |

Ambas integradas en `test:all`. **Verificación por código de salida**, nunca
buscando símbolos en el texto.

---

## Contra base real · las letras del encargo

| # | Comprobación | Resultado |
|---|---|---|
| A | 15 categorías de semilla, idempotente (la segunda siembra devuelve 0) | ✔ |
| B | Categoría propia de la empresa | ✔ |
| C | Una categoría no se borra: se desactiva y conserva su historia | ✔ |
| D | Análisis sobre entidad externa | ✔ |
| E | Análisis sobre colectivo | ✔ |
| F | Dos sujetos a la vez → rechazado | ✔ |
| G | Cero sujetos → rechazado | ✔ |
| G2 | Sujeto incoherente con lo declarado → rechazado | ✔ |
| H | Sujeto de otra empresa → rechazado **por clave foránea**, no por RLS | ✔ |
| H2 | Un solo análisis vigente por (sujeto, categoría) | ✔ |
| I | La historia se sucede y no se reescribe; no se puede reabrir ni borrar | ✔ |
| I2 | Descartar una parte sin justificar → rechazado | ✔ |
| J | Necesidad ≠ expectativa ≠ requisito; subtipo obligatorio y solo en requisitos | ✔ |
| J2 | Convertir conserva el origen; un requisito no deriva de otro requisito | ✔ |
| K | Descartar un requisito exige justificación | ✔ |
| L | Requisito → proceso: FK, unicidad de vigente, consulta en los dos sentidos | ✔ |
| M | Proceso de otra empresa → rechazado por FK | ✔ |
| N | La dueña de la estrategia es un cargo; cargo ajeno → rechazado | ✔ |
| O | Estrategia sin requisitos = general; **no existe** columna `requirement_id` | ✔ |
| P | Estrategia con un requisito, y las dos consultas de PI-36 | ✔ |
| Q | Estrategia con varios requisitos | ✔ |
| R | Estrategia con requisito de otra parte → rechazado por el guardián | ✔ |
| S | Revisión sin cambios: representable y **no** crea versión nueva | ✔ |
| T | Una revisión ni se edita ni se borra; sin objeto → rechazada | ✔ |
| U | Priorización opcional: nulos aceptados | ✔ |
| V | Puntuación sin metodología → rechazada; con metodología, aceptada | ✔ |
| W | Las relaciones core **no** viven en `work_references` | ✔ |
| X | Aislamiento entre empresas en las **ocho** tablas, lectura y escritura | ✔ |
| Y | Leer y escribir son dos autorizaciones distintas | ✔ |
| Y2 | Quien no es miembro no lee ni escribe nada | ✔ |
| Z | Quien administra A no administra B | ✔ |

**Y quedó reformulada.** «Un miembro sin permiso de escritura lee pero no muta»
no es representable: la plataforma tiene tres roles y los tres administran. Se
comprueba la separación estructuralmente y con quien no es miembro. Está
documentado en IMPLEMENTATION §9.3.

---

## Estructura · 17 comprobaciones

Las que impiden que el diseño se erosione sin que nadie lo note:

| # | Qué protege |
|---|---|
| 1 | **Exactamente ocho** tablas |
| 2 | Ninguna identidad nueva |
| 3 | Dos sujetos con FK compuestas; **sin** `quality_org_units`, **sin** `subject_id` |
| 4 | **Todas** las FK del dominio son compuestas |
| 5 | Los tres tipos, el subtipo con su `is not null`, y la conversión con origen |
| 6 | El motivo obligatorio al descartar, en el análisis **y** en el requisito |
| 7 | Las dos relaciones core tienen vigencia y FK; el dominio no las escribe en `work_references` |
| 8 | El alcance de la estrategia vive en un solo sitio |
| 9 | Dueña cargo, nunca persona ni usuario |
| 10 | Once mecanismos de seguimiento, y opcional |
| 11 | Priorización opcional; ningún número desnudo |
| 12 | Sin borrado por ninguna vía, y revocado también a `authenticated` |
| 13 | RLS en las ocho, permiso propio, sin `service_role` |
| 14 | Semilla de 15, por empresa, idempotente |
| 15 | Sin vocabulario sectorial en la semilla |
| 16 | Lo diferido sigue diferido: sin automatización, Intelligence, RD ni `work_references` |
| 17 | Sin `cascade` y sin tocar otros dominios |

---

## Regresiones ejecutadas

Todo por código de salida:

| | EXIT |
|---|---|
| `npm run test:all` (128+ suites) | **0** |
| `test:quality123` | **0** |
| `test:quality123-rls` | **0** |
| `test:rls` | **0** |
| `test:quality012-rls` · `test:quality05-rls` · `test:quality10-rls` | **0** |
| `test:pcr-textiles-02a-rls` · `test:pcr-textiles-02b-rls` | **0** |
| `typecheck` · `build` | **0** |
| `lint` | 0 errores |

Repetidas **después** de la reejecución limpia 0001→0149.

---

## Una comprobación caduca que hubo que reescribir

`pcr-textiles-preflight` A1 afirmaba «no existe ninguna 0149». Protegía contra
un fichero colado en el sprint de PCR/Textiles, pero por un camino que caduca
en cuanto empieza el sprint siguiente — y 0149 es de otro sprint.

Se reescribió para comprobar lo que de verdad importa: que el **rango**
0142–0148 contiene exactamente esos siete nombres. Es más estricto que antes:
detecta una migración de más, una de menos y una renombrada, y no depende de lo
que hagan los sprints posteriores.
