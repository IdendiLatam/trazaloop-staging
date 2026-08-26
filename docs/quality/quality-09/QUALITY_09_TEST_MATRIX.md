# QUALITY-09 · Matriz de pruebas

## 1 · Las dos suites

| Suite | Qué comprueba | Resultado |
|---|---|---|
| `npm run test:quality09` | Puras y estáticas: que las separaciones existan **en el código**, no solo en la prosa | **103 conformes · 0 fallos** |
| `npm run test:quality09-rls` | Contra base real, con la sesión de cada usuario: las afirmaciones que solo se demuestran ejecutándolas | **60 conformes · 0 fallos** |

La segunda corrió dos veces: contra el stack local y **contra Staging**.

## 2 · La suite pura, por bloques

| Bloque | Qué defiende | # |
|---|---|---|
| A | Programa ≠ auditoría · revisiones inmutables · cobertura derivada | 7 |
| B | Reprogramar ≠ reescribir · cancelar ≠ borrar | 6 |
| C | Criterio ≠ pregunta · sin segundo motor documental · versión publicada cerrada · contestar no acusa | 7 |
| D | Evidencia referencia · nota ≠ evidencia · notas restringidas en la base · muestra ≠ cobertura | 5 |
| E | **Hallazgo ≠ NC** · propuesta ≠ clasificación · escalada explícita · el caso tampoco nace NC · conformidad local · la reunión de cierre presenta | 11 |
| F | Auditor ≠ responsable · externo sin cuenta · independencia histórica y nunca declarada · competencia informa | 7 |
| G | Cerrar la auditoría ≠ cerrar las acciones · seguimiento derivado | 4 |
| H | El informe es una foto · revisión de entonces · no se edita · conclusiones humanas | 6 |
| I | **Trazaloop no certifica**, en dominio, papeles e interfaz | 4 |
| J | Priorizar sugiere · barrido idempotente que no decide | 4 |
| K | RLS en las 22 tablas · nada a `anon` · revoke antes de grant · `search_path` · FK compuestas · sin `service_role` · toda acción pasa por la puerta | 9 |
| L | El motor transversal se reusa, no se duplica · catálogos en los dos lados · destinos de la bandeja | 6 |
| M | Ciclo de vida · dictamen único · **guardas heredadas** | 5 |
| N | Inmutabilidad al cerrar | 3 |
| O | Cada enumerado coincide con la base · roles | 4 |
| P | Los doce papeles · gramática · inventario | 5 |
| Q | Navegación · rutas · portada · avisos en pantalla | 6 |
| R | La migración: una sola, append-only, pgcrypto cualificado, sin tocar otros módulos | 4 |

## 3 · Los escenarios contra base real

| # | Escenario | Qué demuestra |
|---|---|---|
| A | El programa no es una auditoría | Sin fechas de ejecución · cobertura `null` sin auditorías · dos revisiones numeradas · una revisión no se edita ni se borra |
| B | Reprogramar conserva la historia | La original no se mueve · rastro con motivo y autor · sin motivo se rechaza |
| C | Cancelar no mejora la cobertura | 2 planificadas → 0 % · cancelar una → sigue 0 % con `cancelled_audits = 1` |
| D | Criterio ≠ pregunta | El criterio no tiene `prompt` ni `stable_key` |
| E | El checklist versiona | Publicar cierra la edición · **la v2 no toca una respuesta de la v1** · marcar «posible brecha» no crea hallazgo |
| F | Evidencia ≠ hallazgo · nota ≠ evidencia | Nota no crea evidencia ni hallazgo · evidencia no crea hallazgo · la nota restringida no la lee quien no conduce ni audita |
| **G** | **HALLAZGO ≠ NO CONFORMIDAD** | Registrar, atar evidencia, evaluar y **escalar**: el conteo de NC no se mueve ni una vez · el caso nace sin clasificar · `'nonconformity'` se rechaza |
| H | La independencia es histórica | Conflicto al preguntar por hace un año · **sin** conflicto al preguntar por hoy · `declares_independence:false` · aceptar sin mitigación se rechaza |
| I | El informe es una foto | Sin conclusiones no se emite · cambiar el equipo después no lo cambia · no se edita ni se borra · la corrección es un informe nuevo |
| J | Cerrar ≠ cerrar las acciones | No se cierra con hallazgos pendientes · sí con un caso abierto · el caso sigue abierto después · cerrada no admite hallazgos nuevos |
| K | Quién puede qué | El consultor conduce y **no** cierra · quien no pertenece no escribe |
| L | La frontera entre empresas | Proceso de B, persona de B, lectura, RPC y cierre: todo cerrado · el anónimo no ve, no escribe, no ejecuta |
| M | El barrido avisa | Dos pasadas, los mismos avisos · no cambia el estado de nada |
| N | Borrar | Con historia no se borra, con motivos · vacía sí · programa con auditorías no · ni el ajeno ni el anónimo obtienen permiso |

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
```

`0127_quality_audits.sql` está autorizada en las **20** listas blancas de
migraciones repartidas por 16 archivos de prueba (cuatro de ellos tienen dos
listas).

## 5 · Los defectos que aparecieron, y cómo

Los cinco primeros son de integración con dominios anteriores y salieron al
aplicar la migración en local. Los tres últimos son los que importan: ninguno lo
habría encontrado una prueba estática.

| # | Defecto | Cómo apareció | Corrección |
|---|---|---|---|
| 1 | `work_actions.case_id` no existe: las acciones se atan por `work_references` | `db reset --local` | Lateral reescrito en `v_quality_audit_overview` |
| 2 | `quality_risks.process_id` no existe | `db reset --local` | `v_quality_risk_overview` + `work_references` |
| 3 | `quality_indicators.process_id` / `last_evaluation` no existen | `db reset --local` | `scope_process_id` y `v_quality_indicator_status` |
| 4 | `quality_risk_assessments.is_acceptable` no existe | `db reset --local` | `v_quality_risk_overview.current_is_acceptable` |
| 5 | `quality_person_competencies.current_level` no existe | `db reset --local` | `demonstrated_level` |
| **6** | El disparador común `force_created_by` sobre `quality_audit_findings`, cuya columna de autor se llama **`raised_by`** | **`test:quality09-rls` G1 contra base real** — `record "new" has no field "created_by"` | Función propia `quality_force_finding_author()` |
| **7** | La política de escritura de las notas estaba declarada `for all`, y en PostgreSQL eso **concede también `select`**: la puerta ancha de escribir reabría la de leer que la de lectura acababa de cerrar | **`test:quality09-rls` F4 contra base real** | Partida en `insert`, `update` y `delete`, con la guarda de lectura en las dos últimas |
| **8** | `quality_scan_audits` devolvía el total de avisos existentes, no los creados: la segunda pasada afirmaba haber creado avisos | **`test:quality09-rls` M1 contra base real** | `get diagnostics … row_count` acumulado por rama |
| 9 | Glosario: «Persona de la organización» | `test:t9g-spanish` | «Persona de la empresa» |
| 10 | `empty()` tipado demasiado estrecho para los cruces heterogéneos | `npm run build` | `Record<string, unknown>[]` |

Los defectos 6, 7 y 8 se encontraron con `0127` aplicada **solo en local**, así
que corregir 0127 en el sitio era legítimo: la regla es no editarla una vez
aplicada a Staging, y no lo estaba. Se editó, se replayó entera con
`db reset --local` y se validó de nuevo antes de subirla.
