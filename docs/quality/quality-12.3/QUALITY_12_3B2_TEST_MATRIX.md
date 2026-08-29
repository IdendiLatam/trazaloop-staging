# QUALITY-12.3B2 · Partes interesadas · MATRIZ DE PRUEBAS

Cuatro suites, 48 comprobaciones. **Todas verificadas por código de salida**
(`EXIT=0`), nunca leyendo glifos.

| Suite | Comando | Comprobaciones |
|---|---|---|
| Dominio y forma del código | `npm run test:quality123b2-domain` | A–T · 20 |
| Capa de aplicación (base real) | `npm run test:quality123b2-domain-rls` | U–AI · 15 |
| Integraciones (base real) | `npm run test:quality123b2-integrations` | AJ–AU · 13 |
| Historia y vigencias (base real) | `npm run test:quality123b2-history` | AV–BC · 8 |

Solo la primera entra en `test:all`: las tres contra base real siguen el mismo
criterio que `test:quality123-rls`, que se corre aparte.

---

## 1 · Dominio y forma del código · `tests/unit/quality-12-3b2-domain.test.ts`

| | Qué demuestra |
|---|---|
| A | `effective_from` inclusivo, `effective_to` **exclusivo** |
| B | una vigencia abierta rige desde su inicio y para siempre |
| C | sucesión sin solape ni hueco: **un** vigente cada día |
| D | `reviewState` distingue «nunca revisado» de «al día», y sin cadencia no acusa de vencido |
| E | `nextReviewFrom` respeta la cadencia y sin ella no inventa fecha |
| F | `today()` devuelve fecha ISO |
| G | la pertinencia **no** se deriva de la prioridad: la función lanza |
| H | la metodología influencia × impacto es sugerida, y el dominio lo dice |
| I | un número sin metodología no se enseña |
| J | el guardián de rol es espejo **exacto** del de 0149 (se compara con el SQL) |
| K | `canManageInterestedParties` niega lo que no conoce |
| L | las 21 acciones de servidor pasan por `gate()` antes de escribir |
| M | **ninguna capa usa `service_role`** ni crea su propio cliente (los comentarios se excluyen) |
| N | `lib/db` es `server-only`; el dominio **no** lo es |
| O | **B2 no creó una sola pantalla**: rutas y componentes ausentes |
| P | las dos relaciones centrales **no** están en el vocabulario de `work_references` |
| Q | no hay una segunda arquitectura de servicios |
| R | ninguna lectura sin `range`, `limit`, `head:true` o `readAllStrict` |
| S | todos los códigos de fallo tienen texto para una persona, sin jerga SQL |
| T | `lib/db` nunca devuelve el mensaje crudo de PostgreSQL |

---

## 2 · Capa de aplicación · `tests/rls/quality-12-3b2-application.test.ts`

Importa `lib/db/quality-interested-parties` y le pasa el cliente de un usuario
real. **No reimplementa las consultas**: la copia siempre acaba siendo más amable
que el original.

| | Qué demuestra |
|---|---|
| U | siembra idempotente de 15 categorías, leídas y ordenadas por la capa real |
| V | un análisis nace vigente, con etiqueta comercial y categoría resueltas |
| W | «no pertinente» sin justificación se rechaza **antes** de la base |
| X | puntuación sin metodología: rechazada |
| Y | dos análisis vigentes de la misma parte: la base lo impide y llega **traducido** |
| Z | necesidad, expectativa y requisito; subtipo obligatorio y subtipo prohibido |
| AA | convertir crea fila nueva, **no** reetiqueta el origen, y de un requisito no se deriva otro |
| AB | requisito → proceso se vincula; un proceso de otra empresa, no |
| AC | desvincular **cierra**; cerrar lo ya cerrado se rechaza |
| AD | una estrategia solo atiende requisitos de **su** análisis |
| AE | la revisión «sin cambios» se registra y marca la estrategia |
| AF | paginación en servidor con total real y sin filas repetidas entre páginas |
| AG | la búsqueda cruza las dos tablas de sujetos; sin resultados devuelve cero |
| AH | el resumen cuenta con `head:true`, sin descargar la tabla |
| AI | la empresa B no lee ni escribe nada de A, ni con identificadores conocidos |

---

## 3 · Integraciones · `tests/rls/quality-12-3b2-integrations.test.ts`

| | Qué demuestra |
|---|---|
| AJ | los cinco tipos de evento están en el catálogo de automatización |
| AK | **suceder emite el hecho una sola vez**, y el doble clic se rechaza |
| AL | cambiar la pertinencia emite su hecho, con severidad `warning`; no cambiarla, no emite nada |
| AM | `requirement_changed` y `strategy_changed` **sí tienen quien los emita** |
| AN | el emisor no deja emitir en una empresa ajena, ni leer sus eventos |
| AO | un enlace periférico exige destino existente y de la empresa |
| AO2 | el vocabulario periférico **no** permite expresar las dos relaciones centrales, y lo periférico sigue funcionando |
| AP | la entrada de Revisión por la Dirección está en el catálogo y **al final** |
| AQ | el constructor devuelve el retrato del periodo, y B no obtiene el de A |
| AR | las dos fuentes de Intelligence son `open` y `as_of` |
| AS | el contexto lleva identificadores y **no** lleva correos, contactos ni columnas `*_by` |
| AT | el contexto no cruza la frontera de empresa |
| AU | **nada de esto llamó a ningún proveedor**: cero filas en `quality_ai_runs` |

---

## 4 · Historia · `tests/rls/quality-12-3b2-history.test.ts`

Línea de tiempo: hace 90 días la parte era pertinente; hace 30 dejó de serlo.

| | Qué demuestra |
|---|---|
| AV | el análisis anterior se conserva entero, con su vigencia cerrada y su sucesor apuntándolo |
| AW | un análisis ya sucedido **no se puede reescribir** ← encontró el defecto del guardián de 0149 |
| AX | un análisis no se borra |
| AY | `as_of` devuelve lo que regía ese día **en todas las capas**, incluidos los requisitos |
| AZ | el día del relevo hay **un** vigente; la víspera, el anterior |
| BA | antes de la primera lectura no había nada, y la historia sigue viéndose |
| BB | una revisión no se edita ni se borra: es un acta |
| BC | **1 100 filas se leen las 1 100**, sin repetidas: `max_rows = 1000` no corta en silencio |

---

## 5 · Regresión

| Comprobación | Resultado |
|---|---|
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | EXIT=0 |
| `npm run lint` | 0 errores |
| `npm run build` | EXIT=0 |
| Replay limpio 0001 → 0150 | cabecera 0150 · 142 en disco · 142 registradas · 0 fallos |
| Suites de base real tras el replay | las seis en EXIT=0 |
| `test:quality123` y `test:quality123-rls` (B1) | EXIT=0 |

Un hallazgo lateral: la suite T9G de glosario detectó dos textos visibles que
decían «organización» en vez de «empresa». Corregidos.
