# QUALITY-12.3B2 · Partes interesadas · CAPA DE APLICACIÓN

**Migración:** `0150_quality_interested_parties_integrations.sql`
**Sobre:** B1 (`0149`) sin reabrir arquitectura. PI-01 … PI-39 intactos.
**Local** 0150 · **Staging** `qchzkxbnbqeyuxinipln` 0150 · **Production** 0111, sin tocar.

**Sin interfaz.** Ni una página, ni un componente, ni una entrada de menú.

---

## 1 · Lo que se construyó

| Archivo | Qué es |
|---|---|
| `lib/domain/quality-interested-parties.ts` | dominio puro: vigencias, estados de revisión, prioridad, vocabulario de fallos. Sin base de datos y sin `server-only` |
| `lib/db/quality-interested-parties.ts` | lectura y escritura bajo RLS, con cliente inyectable |
| `server/actions/quality-interested-parties.ts` | 21 acciones de servidor, misma puerta que el resto de Quality |
| `0150_…_integrations.sql` | eventos, `work_references`, Revisión por la Dirección, fuentes de Intelligence, y dos correcciones |

Ninguna capa nueva: es el reparto de QUALITY-10 y QUALITY-11 aplicado a un
dominio más. No hay `server/services`, no hay `lib/application`, y una prueba
comprueba que no aparezcan.

---

## 2 · Las cuatro decisiones que explican el código

**1 · Lo que crea historia pasa por una RPC.** Suceder un análisis y registrar
una revisión cierran una vigencia, abren otra y emiten su hecho **en el mismo
acto**. Hacerlo en tres pasos desde TypeScript dejaría, ante un fallo de red
entre el segundo y el tercero, una parte interesada sin análisis vigente: ni el
viejo ni el nuevo. Lo demás es escritura normal bajo RLS.

**2 · Las relaciones se cruzan en memoria, no con `embed` de PostgREST.** Las
FK de este esquema son compuestas `(organization_id, id)`, y un
`tabla:columna_id(...)` no las resuelve: devuelve el error dentro de `error`, no
de `data`, y un `(data ?? [])` lo convierte en una lista vacía **silenciosa**.
Ya pasó en QUALITY-04.

**3 · Nunca `service_role`.** Se opera con la sesión de quien pregunta y decide
la RLS. El cliente inyectable de las firmas existe para que la suite contra base
real ejercite **este** código y no una copia; la copia siempre acaba siendo más
amable que el original.

**4 · Ninguna consulta trae «todo».** Las listas paginan en servidor con el
orden inquilino → filtros → búsqueda → conteo → orden → rango. Los recorridos
completos usan `readAllStrict`, que **lanza** si la travesía queda incompleta.
`supabase/config.toml` fija `max_rows = 1000`: una lectura sin `range()` devuelve
mil de mil doscientas sin error, y en pantalla eso no se distingue de un
conjunto completo.

---

## 3 · La primitiva temporal

```
effective_from  INCLUSIVO
effective_to    EXCLUSIVO
```

Una fila que se cierra el 30 de junio deja de regir **ese mismo día**, y su
sucesora empieza el 30. Con las dos inclusivas habría un día con dos vigentes, y
las preguntas históricas devolverían dos respuestas para la misma fecha.

`asOf` recorre **todas** las capas —análisis, requisitos, vínculos con procesos,
estrategias—. Aplicarlo solo a la cabecera daría el análisis de marzo con los
requisitos de hoy: la clase de respuesta que parece correcta y no lo es.

---

## 4 · Dos preguntas que no se derivan una de otra

**Pertinencia** y **prioridad** son independientes. Una parte de prioridad baja
puede ser perfectamente pertinente, y una de prioridad alta puede haber dejado
de serlo. `relevanceFromPriority()` existe únicamente para **lanzar**: está ahí
para que una prueba pueda demostrar que nadie las confunde.

Y una puntuación sin metodología **no se enseña**: `priorityView()` la degrada a
«sin prioridad» en vez de pintar un 9 que nadie puede defender en una auditoría.
La base ya lo impide; esto es la segunda barrera.

---

## 5 · Las dos relaciones centrales, y por qué tienen tabla propia

> Si la relación tiene **vigencia propia** y forma parte de lo que se audita,
> tiene tabla propia. Si es un enlace de contexto, va a `work_references`.

`work_references` **no tiene periodo de validez**, y esa ausencia es su diseño.
La pregunta de auditoría no es «qué procesos atienden esto», es «qué procesos lo
atendían en marzo». Meter ahí requisito→proceso habría ahorrado una tabla a
cambio de no poder responderla.

Desvincular **cierra** la vigencia; nunca borra. Cerrar lo ya cerrado se rechaza
con `historical_record_immutable`, no se cierra dos veces.

---

## 6 · Reutilizar identidades, nunca copiarlas

Un cliente que además es parte interesada **no se duplica**. `customerViewOf()` y
`supplierViewOf()` leen lo que Voz del cliente y Proveedores ya saben de la misma
`quality_external_parties`, y devuelven hechos e identificadores para que la
ficha **enlace**, no para que reimplemente ninguno de los dos módulos.

---

## 7 · Lo que esta fase NO hizo

Ninguna página. Ninguna entrada de menú Contexto. Ningún formulario, tabla
visual, panel ni modal. Ninguna llamada a proveedor de IA. Ningún cambio en
proveedor, precios, límites ni variables `QUALITY_AI_*`. Ninguna escritura en
Production.
