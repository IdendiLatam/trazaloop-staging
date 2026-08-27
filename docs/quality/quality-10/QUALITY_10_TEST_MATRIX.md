# QUALITY-10 · Matriz de pruebas

## 1 · Las dos suites

| Suite | Qué comprueba | Resultado |
|---|---|---|
| `npm run test:quality10` | Puras y estáticas: que las separaciones existan **en el código** | **106 conformes · 0 fallos** |
| `npm run test:quality10-rls` | Contra base real, con la sesión de cada usuario | **61 conformes · 0 fallos** |

La segunda corrió dos veces: contra el stack local y **contra Staging**.

## 2 · La suite pura, por bloques

| Bloque | Qué defiende | # |
|---|---|---|
| A | Identidad, periodo, revisión ≠ reunión ≠ tablero ≠ auditoría, frecuencia configurable, cargo responsable | 7 |
| B | Catálogo global de catorce · tipo ≠ valor | 4 |
| C | Automática ≠ manual · linaje en los catorce adaptadores · recursos sin módulo financiero | 5 |
| D | **Sin dato ≠ cero · no aplica ≠ faltante ≠ pendiente** | 5 |
| E | Dato ≠ conclusión · preparar y refrescar **no borran el análisis** · los adaptadores no escriben | 5 |
| F | Huella, frescura sin sustitución, refresco consciente, revisión cerrada no se refresca | 4 |
| G | Preparación real · el estado de listo no miente | 4 |
| H | **Decisión ≠ acción** · sin columna de acción · registrar no crea · 0..N legítimo | 7 |
| I | Se reusa el motor transversal · catálogos ampliados · validador de referencias | 7 |
| J | El acta se deriva y se congela · RD-18 · inmutabilidad al cerrar | 8 |
| K | Cerrar ≠ cerrar acciones · seguimiento vivo · reabrir sin destruir | 5 |
| L | Asistir ≠ aprobar · cargo de entonces · externo sin cuenta · sobrevive a la baja | 4 |
| M | **Anonimato del cliente · personas agregadas · notas de auditoría · profundización · agregado ≠ acceso** | 6 |
| N | RLS en las ocho · nada a `anon` · `search_path` · FK compuestas · vistas · sin `service_role` · toda acción por la puerta · roles | 9 |
| O | Ciclo de vida · dictamen único · **guardas heredadas** | 5 |
| P | El barrido avisa, es idempotente y deja a Q11 con qué trabajar | 3 |
| Q | **Nada de IA**, y se dice | 3 |
| R | Los ocho papeles · gramática · las diez secciones del informe · inventario | 5 |
| S | Navegación sin fragmentar · rutas · flujo como camino · portada · avisos | 6 |
| T | La migración: una sola, append-only, pgcrypto, sin sembrar datos de negocio | 4 |

## 3 · Los escenarios contra base real

| # | Escenario | Qué demuestra |
|---|---|---|
| A | **Preparar** (§77) | 14 entradas creadas · cada una respeta el periodo, trae huella y linaje · los datos reales del caso llegan · la revisión pasa sola a «en preparación» |
| B | **Sin datos** (§78) | Sin campaña, la entrada queda `missing`, el resumen dice que no se midió y en ninguna parte aparece un cero de satisfacción |
| C | **Indicador histórico** (§79) | 82/95 en el año A · 90/98 en el año B · la revisión del año A sigue diciendo **82 sobre 95**, y refrescarla no la contamina |
| D | **Auditorías** (§80) | 6 programadas, 5 ejecutadas → «5 de 6» · una auditoría del año B no cambia la revisión del año A |
| E | **Anonimato** (§81) | Campaña anónima real · el retrato trae la campaña y **ningún** identificador de respondente |
| F | **Decisión ≠ acción** (§82) | Registrar: 1 decisión, 0 acciones nuevas, 0 tareas · crear dos acciones: sigue siendo 1 decisión · atadas por `work_references` |
| G | **Fuente actualizada** (§85) | Con análisis escrito, la fuente cambia → se avisa y **no se sustituye** · refrescar actualiza el dato y conserva análisis, conclusión y marca · preparar todo tampoco lo borra |
| H | **El participante** (§86) | Ana como Gerente · deja el cargo → la revisión sigue diciendo Gerente · se da de baja → sigue apareciendo · sin columna de aprobación |
| I | **Cerrar con acción abierta** (§83, §84) | No se cierra con entradas pendientes · se emite el acta con las 14 entradas congeladas · se cierra con una acción abierta · cerrar no cerró las acciones · cerrada no admite decisiones ni participantes · el periodo no se reescribe · **la acción avanza y el acta no cambia** · el seguimiento sí · el acta no se edita ni se borra |
| J | **Acciones de la revisión anterior** (§87) | La del año B ve las 2 acciones de la del año A con su estado · no las duplica · la del año A no se ve a sí misma |
| K | **Quién puede qué** (§66) | El consultor prepara · no cierra · no emite el acta |
| L | **La frontera** (§65, §98) | Lectura, escritura, borrado, participante ajeno, cuatro RPC y el adaptador de procesos: todo cerrado · el anónimo no ve, no escribe, no ejecuta, no lee el catálogo |
| M | **Barrido y borrado** (§44, §88) | Dos pasadas, los mismos avisos, la segunda devuelve 0 · no cambia estados · borrador vacío se borra · con decisiones no · guardas heredadas en pie sobre `management_review` **y** sobre `person` |
| N | **Reabrir** (§47) | Con motivo corto se rechaza · reabrir conserva la nota de cierre y el acta · constan los dos hechos formales |

## 4 · Regresión completa

```
npm run test:all → TEST_ALL_EXIT = 0
```

Suites de base real, todas verdes antes de subir a Staging:

```
test:quality03-rls  → 52 correctas    test:quality031-rls → 30 correctas
test:quality04-rls  → 33 correctas    test:quality05-rls  → 74 conformes
test:quality06-rls  → 58 conformes    test:quality061-rls → 28 conformes
test:quality07-rls  → 48 conformes    test:quality08-rls  → 60 conformes
test:quality09-rls  → 60 conformes    test:quality10-rls  → 61 conformes
```

**§100 · La suite de anonimato de QUALITY-08 se ejecutó completa como
regresión, en local y contra Staging: 60 conformes, 0 fallos.** Este dominio no
introdujo ninguna fuga lateral.

`0128_quality_management_review.sql` está autorizada en las **21** listas
blancas repartidas por 17 archivos de prueba.

## 5 · Los defectos que aparecieron, y cómo

| # | Defecto | Cómo apareció | Corrección |
|---|---|---|---|
| 1 | `quality_indicators.direction` no existe: la dirección vive en la CONFIGURACIÓN | `db reset --local` | Se lee de `quality_indicator_configs`, que además es lo correcto para la verdad histórica |
| 2 | `v_quality_competence_matrix.gap` es un entero —la distancia—, no un booleano | `db reset --local` | `gap > 0` |
| **3** | **`work_events_type_check` se ESTRECHÓ al reescribirlo**: diecinueve tipos que migraciones anteriores insertan de verdad quedaron fuera, y publicar una versión de encuesta empezó a fallar | **`test:quality10-rls` E1 contra base real** | El catálogo se reconstruyó como la UNIÓN de lo que declaraba 0127, lo que cualquier migración inserta y lo nuevo de Q10 — y una comprobación automática verifica que ningún otro catálogo se estrechó |
| **4** | **`quality_mr_summarize` usaba el alias `t`**, que chocaba con las tablas `t` de sus propios subselects | **`test:quality10-rls` A2 contra base real** — `column reference "t" is ambiguous` | Alias renombrado a `tot` |
| **5** | **Reabrir violaba `closed_consistent`**: dos `update` seguidos dejaban un instante con estado reabierto y `closed_at` puesto | **`test:quality10-rls` N2 contra base real** | Un solo `update` que mueve estado y `closed_at` a la vez |
| **6** | **Refrescar DEGRADABA una entrada ya revisada** de `reviewed` a `prepared`: el estado de listo habría mentido después de cada refresco | **`test:quality10-rls` G4 contra base real** | El `case` conserva `reviewed`, igual que ya conservaba `not_applicable` |
| 7 | `describeDecisionOutcome` escribía «2 acciónes» | `test:quality10` H6 | Plural correcto |
| 8 | Glosario: ocho usos visibles de «organización» | `test:t9g-spanish` | «empresa» |

Los defectos 3, 4, 5 y 6 son los que importan: **ninguno lo habría encontrado
una prueba estática**. El tercero además era una regresión que habría roto
QUALITY-08 en producción sin que nada de QUALITY-10 fallara.

Los seis se encontraron con 0128 aplicada **solo en local**, así que corregir
0128 en el sitio era legítimo: la regla es no editarla una vez aplicada a
Staging, y no lo estaba.
