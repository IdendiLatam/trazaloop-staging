# Trazaloop · PCR-02.2 — Matriz de pruebas

Estados: **PASS — lógica ejecutada** (dominio puro corrido aquí) ·
**PASS — PostgreSQL local** (migraciones reales 0025+0104 en PostgreSQL
16.14 local; `npm run test:pcr02-2-db`, **49 aserciones** totales, EXIT 0) ·
**PASS — verificación estática** (candado sobre el código real) ·
**BLOCKED** (Supabase real / navegador) · **N/A** (con justificación).

## Hallazgo A · Inmutabilidad de órdenes (matriz §13 + §14 + §37)

| Caso | Esperado | Estado |
| ---- | -------- | ------ |
| A1 draft sin dependencias | eliminable (histórico) | **PASS — PostgreSQL local** (S7.A1) |
| A2 in_progress sin dependencias | eliminable (histórico documentado; RESTRICT de salidas y RLS intactos) | **PASS — PostgreSQL local** (S7.A2) |
| A3 closed, DELETE directo | FAIL con mensaje pactado | **PASS — PostgreSQL local** (S7.A3, mensaje comparado por igualdad) |
| A4 cancelled, DELETE directo | FAIL, mismo mensaje | **PASS — PostgreSQL local** (S7.A4) |
| A5 closed con `batch_consumption` | FAIL; consumo E input batch sobreviven (**no-cascada §14**) | **PASS — PostgreSQL local** (S7.A5) |
| A6 closed con `output_batch_consumption` | FAIL; genealogía intacta | **PASS — PostgreSQL local** (S7.A6) |
| A7 bypass: rol `authenticated` con RLS DELETE (admin) | elegible SÍ borra; cerrada NO (RLS + trigger conviven, §37) | **PASS — PostgreSQL local** (S7.A7) |
| A8 server action rechaza antes del DELETE | — | **PASS — lógica ejecutada** (matriz `orderDeletionBlockedMessage`, `pcr02-2` A.1) + **estática** (A.2: guarda ANTES del delete, 23514 traducido). E2E: **BLOCKED — Supabase real** |
| UI sin «Eliminar» sobre historial (detalle + listado); consulta/auditoría íntegra | — | **PASS — estática** (A.3). Render real: **BLOCKED — navegador** |
| Rojo-antes: DELETE de cerrada borraba la historia | — | **Reproducido en vivo sobre PCR-02.1** (evidencia en REVIEW-FIXES) |

## Hallazgo B · Completitud fail-closed (§27–§29)

| Caso | Esperado | Estado |
| ---- | -------- | ------ |
| B1 raíz externa válida | complete | **PASS — PostgreSQL local** (S8.B1) |
| B2 cadena interna válida | complete | **PASS — PostgreSQL local** (S8.B2; además S5.C/S5.F de PCR-02.1 siguen verdes) |
| B3 dead end | incomplete | **PASS — PostgreSQL local** (S8.B3; además S5.D) |
| B4 ciclo interno puro | **incomplete** | **PASS — PostgreSQL local** (S8.B4) |
| B5 ciclo con composición suficiente | **incomplete** (la composición no sustituye procedencia) | **PASS — PostgreSQL local** (S8.B4+B5: ambos lotes con composición completa) |
| B6 ciclo mixto (rama externa válida + rama cíclica) | **incomplete** (decisión §25 documentada) | **PASS — PostgreSQL local** (S8.B6) |
| B7 raíz dentro del límite de profundidad | complete (sin sobre-corrección) | **PASS — PostgreSQL local** (S8.B7: raíz a 8 saltos) |
| B8 raíz existente pero fuera del límite | **incomplete** (fail-closed) | **PASS — PostgreSQL local** (S8.B8: raíz a 12 saltos) |
| B9 varias ramas todas completas | complete | **PASS — PostgreSQL local** (S8.B2+B9: externa + interna) |
| B10 varias ramas, una incompleta | incomplete (AND) | **PASS — PostgreSQL local** (S8.B3+B10) |
| PURE_INTERNAL_CYCLE_MUST_NOT_BE_COMPLETE (§28) | rojo con PCR-02.1, verde ahora | **Reproducido en vivo** (`OUT-C1/C2 -> complete` con PCR-02.1) + **S8.R1** fija la fórmula vieja |
| DEPTH_LIMIT_MUST_FAIL_CLOSED (§29, comprueba `traceability_status`, no solo terminación) | rojo con PCR-02.1, verde ahora | **Reproducido en vivo** (`OUT-1 -> complete`) + **S8.R2** |
| Contrato público de la vista intacto (§23) | — | **PASS — estática** (`pcr02-2` B.2: columnas/etiquetas; señales internas) |

## Conservación

| Escenario | Estado |
| --------- | ------ |
| PCR-02.1 completo (33 aserciones DB + suite `pcr02-1` 17 checks) | **PASS** (arnés total 49 EXIT 0; `test:all` incluye `pcr02-1`) |
| PCR-02 (4 suites) y PCR-01.1 (5 suites) | **PASS** dentro de `test:all` |
| Textiles (~60 suites) | **PASS** dentro de `test:all`; recorrido real: **BLOCKED** |
| 0001–0103 intactas; solo la 0104; sin 0105+ | **PASS — estática** (`pcr02-2` C.2 + candados históricos) |
| `package.json` en "1.0.0" (§50); textos legales sin tocar (§49) | **PASS — estática** (C.3; diff sin archivos legales) |

## Comandos (§45) — EXIT codes sobre el árbol definitivo

| Comando | EXIT | Detalle |
| ------- | ---- | ------- |
| `npm run typecheck` | **0** | sin errores |
| `npm run lint` | **0** | 0 errores; 1 warning preexistente v1.0.1 |
| `npm run build` (next build --webpack, §46) | **0** | compila |
| `npm run test:all` | **0** | **1493 verificaciones** (incluye `test:pcr02-2`) |
| `npm run test:pcr02-2` | **0** | 11 checks |
| `npm run test:pcr02-1` | **0** | 17 checks |
| Suites `pcr02-*` / `pcr01-*` | **0** | 10/6/11/7 y 5 suites PCR-01 |
| `npm run test:pcr02-2-db` | **0** | **49 aserciones en PostgreSQL 16.14 local** (33 PCR-02.1 + 16 PCR-02.2) |

**BLOCKED para el QA del cliente**: `test:rls`/`test:smoke` del repo,
auth/storage/service-role de Supabase real y navegador. Guion en
`docs/PCR-02.2-PRODUCTION-DEPLOY.md`.
