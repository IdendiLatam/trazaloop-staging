# Trazaloop · PCR-02.1 — Matriz de pruebas

> **Nota PCR-02.2**: la matriz vigente del paquete es `docs/PCR-02.2-TEST-MATRIX.md` (49 aserciones PostgreSQL acumuladas). Esta matriz se conserva como historial.


Estados:

- **PASS — lógica ejecutada**: corrió de verdad en este entorno (funciones
  de dominio con casos de entrada/salida).
- **PASS — PostgreSQL local**: corrió DE VERDAD contra PostgreSQL 16 local
  aplicando las migraciones **reales** 0025 y 0104 tal como se envían
  (`npm run test:pcr02-1-db`, 33 aserciones, EXIT 0). El arnés emula la
  superficie de Supabase (auth.uid(), roles, grants) — no reemplaza el QA
  contra Supabase real.
- **PASS — verificación estática**: candado sobre el código fuente real
  (falla si el código cambia); no valida ejecución.
- **BLOCKED — requiere Supabase real / navegador**: escenario no ejecutable
  en este entorno (limitación auténtica, no riesgo técnico conocido).
- **N/A**: no corresponde según el dominio (con justificación).

## H1 · Órdenes cerradas/canceladas (matriz §25)

| Escenario | Abierta | Cerrada | Cancelada | Estado |
| --------- | ------- | ------- | --------- | ------ |
| Agregar consumo externo | permitido | rechazado | rechazado | **PASS — lógica ejecutada** (matriz de estados, `pcr02-1` 1.1) + **estática** (guarda en la acción, PCR-02 conservado 1.4). E2E: **BLOCKED — Supabase real** |
| Borrar consumo externo | permitido | rechazado | rechazado | **PASS — lógica ejecutada** (1.1) + **estática** (guarda ANTES del delete, 1.2). E2E: **BLOCKED — Supabase real** |
| Agregar consumo interno | permitido | rechazado | rechazado | Igual que arriba (1.1/1.4) |
| Borrar consumo interno | permitido | rechazado | rechazado | **PASS — lógica ejecutada** (1.1) + **estática** (1.3, acción con estado) |
| Registrar salida | permitido | rechazado | rechazado | **PASS — lógica ejecutada** (1.1) + **estática** (1.4) |
| Eliminar salida | permitido | rechazado | rechazado | **PASS — estática** (1.6: guarda + consumidores + 23503 amable) |
| Reasignar orden productora de un lote consumido | rechazado | rechazado | rechazado | **PASS — PostgreSQL local** (S3.1: trigger §2b con mensaje exacto; S3.2 genealogía intacta) + **estática** (1.5: consumidores + ambas órdenes) |
| Editar campos descriptivos de la salida | permitido | permitido* | permitido* | **PASS — PostgreSQL local** (S3.3). *Decisión §49 documentada: la corrección documental no reescribe genealogía |
| UI: botones de mutación ocultos con orden bloqueada + modo consulta | — | sí | sí | **PASS — estática** (1.8). Render real: **BLOCKED — navegador** |

## H2 · Implementación reconoce ambos orígenes (§11)

| Caso | Esperado | Estado |
| ---- | -------- | ------ |
| 1. Orden sin consumo | recomienda «Registrar consumo» | **PASS — PostgreSQL local** (S6.1, sobre la **vista real** `v_implementation_next_actions` de la 0104) |
| 2. Solo `batch_consumption` | no recomienda | **PASS — PostgreSQL local** (S6.2) |
| 3. Solo `output_batch_consumption` | no recomienda | **PASS — PostgreSQL local** (S6.3) |
| 4. Ambos | no recomienda | **PASS — PostgreSQL local** (S6.4) |
| Regresión demostrada (§42) | la CTE de PCR-02 marca el caso 3 | **PASS — PostgreSQL local** (S6.5) |
| Contrato de la vista intacto (columnas/textos/prioridades de 0065) | — | **PASS — estática** (`pcr02-1` 2.2) |
| Vista integrada con dashboard/readiness/gaps REALES de Supabase | — | **BLOCKED — Supabase real** (el arnés emula esas vistas con conteos reales mínimos) |

## H3 · Trigger acotado por empresa (§14/§34)

| Escenario | Estado |
| --------- | ------ |
| Autoconsumo directo rechazado con mensaje pactado | **PASS — PostgreSQL local** (S2.1) |
| Otra orden, misma empresa: consumo válido | **PASS — PostgreSQL local** (S1.2) |
| Cross-tenant rechazado | **PASS — PostgreSQL local** (S2.2; además S4.4/S4.5 bajo rol `authenticated` con RLS) |
| UUID inexistente falla de forma segura | **PASS — PostgreSQL local** (S2.3) |
| Sin filtración: ajeno e inexistente → mensaje idéntico (comparado por igualdad) | **PASS — PostgreSQL local** (S2.4) |
| `SECURITY INVOKER`, filtro `organization_id`, `search_path` | **PASS — estática** (`pcr02-1` 3.1) + ejecutado implícitamente en S2/S4 |

## H4 · Selectores acotados (§16–18)

| Escenario | Estado |
| --------- | ------ |
| Buscadores con límite 20, `ilike` saneado y filtro de empresa (entrada/internos/evidencias) | **PASS — estática** (`pcr02-1` 4.1 sobre las funciones reales) |
| Detalle sin universos completos; búsqueda por sección con aviso de recorte | **PASS — estática** (4.2) |
| Genealogía con búsqueda paginada PCR-01.1 y resolución por id | **PASS — estática** (4.3) |
| Lote consumido en edición: orden productora fija (§49) | **PASS — estática** (4.4) |
| UX real de búsqueda/selección con datos | **BLOCKED — Supabase real + navegador** |
| Deep links `?output=`/`?input=`/`?order=` conservados | **PASS — estática** (genealogía resuelve por id; redirect legacy intacto en la suite `pcr02-order-hub` §4) |

## H5 · Completitud (§22)

| Caso | Esperado | Estado |
| ---- | -------- | ------ |
| A. Externo documentado | complete | **PASS — PostgreSQL local** (S5.A) |
| B. Externo incompleto | — | **N/A como se enunció**: `supplier_id`/`material_id` son NOT NULL desde 0025 (sin filas históricas nulas) → irrealizable. Variante realizable probada: documentación propia faltante → incomplete (S5.B) |
| C. Intermedio con cadena documentada | complete | **PASS — PostgreSQL local** (S5.C) |
| D. Intermedio con cadena aguas arriba incompleta | incomplete (sin falso positivo) | **PASS — PostgreSQL local** (S5.D, con «información de proveedor» en missing_items) |
| Regresión demostrada (§42) | la regla PCR-02 daba `true` | **PASS — PostgreSQL local** (S5.D2) |
| E. Mezcla externo + interno | complete | **PASS — PostgreSQL local** (S5.E) |
| F. Cadena de 3 órdenes | complete | **PASS — PostgreSQL local** (S5.F) |
| Ciclo A⇄B: la vista responde acotada | sin colgarse | **PASS — PostgreSQL local** (S5.G) |
| Semántica documentada (5 puntos §21) | — | **PASS — estática** (en el propio SQL de 0104 §4; candado `pcr02-1` 5.2) |
| Readiness/gaps/dossier con la vista corregida en Supabase real | — | **BLOCKED — Supabase real** (readiness hereda vía join a la vista; gaps no usa los flags) |

## H6 · RLS y constraints reales (§33/§35)

| Escenario | Estado |
| --------- | ------ |
| `mass_kg > 0`, unique (orden, lote), FK compuestas | **PASS — PostgreSQL local** (S1.1–S1.3) |
| `ON DELETE RESTRICT` del lote consumido / CASCADE de la orden consumidora | **PASS — PostgreSQL local** (S1.4–S1.5) |
| SELECT: miembro ve; empresa B no ve empresa A | **PASS — PostgreSQL local** (S4.1, S4.3) |
| INSERT: viewer no; consultant sí; empresa B no puede en A | **PASS — PostgreSQL local** (S4.2, S4.6, S4.4) |
| DELETE: consultant no; admin sí | **PASS — PostgreSQL local** (S4.7, S4.8) |
| RLS bajo el stack completo de Supabase (JWT real, service role, storage) | **BLOCKED — Supabase real** |

## Regresión

| Escenario | Estado |
| --------- | ------ |
| PCR-01.1 completo (suites `pcr01-*`) | **PASS** — 5 suites en verde dentro de `test:all` |
| PCR-02 conservado (suites `pcr02-*`) | **PASS** — 4 suites en verde (candado 8 endurecido, nunca relajado) |
| Textiles | **PASS** — ~60 suites en verde dentro de `test:all`; recorrido real: **BLOCKED — Supabase real/navegador** |
| Migraciones 0001–0103 intactas; sin 0105+ | **PASS — estática** (`pcr02-1` 6.2 + candados baseline de 6 suites históricas) |

## Comandos ejecutados (§40) — EXIT codes

| Comando | EXIT | Detalle |
| ------- | ---- | ------- |
| `npm run typecheck` | **0** | sin errores |
| `npm run lint` | **0** | 0 errores; 1 warning preexistente de v1.0.1 (`textiles-evidences-hardening.test.ts`, sin tocar por §43) |
| `npm run build` (next build --webpack) | **0** | compila; incluye el detalle de orden |
| `npm run test:all` | **0** | **1482 verificaciones en verde** (incluye `test:pcr02-1`) |
| `npm run test:pcr02-1` | **0** | 17 checks |
| `npm run test:pcr02-alerts` / `-genealogy` / `-internal-consumption` / `-order-hub` | **0** | 10 / 6 / 11 / 7 |
| `npm run test:pcr02-1-db` | **0** | **33 aserciones conductuales contra PostgreSQL 16.14 local** (migraciones reales 0025+0104) |

**Siguen BLOCKED para el QA del cliente**: `test:rls`, `test:*-rls*`,
`test:smoke` del repositorio (exigen proyecto Supabase con auth/storage) y
todos los escenarios de navegador. Guion en `docs/PCR-02.1-PRODUCTION-DEPLOY.md`.
