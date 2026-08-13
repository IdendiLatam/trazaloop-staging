# Trazaloop · PCR-02.3 — Matriz de pruebas

Comandos: `npm run test:pcr02-3` (unit) · `npm run test:pcr02-3-db`
(PostgreSQL real; pasos 1–6: arnés fiel a 0005/0016/0024/0025 + 0104 REAL +
suites PCR-02.1, PCR-02.2 y PCR-02.3). Resultado certificado: unit EXIT 0;
arnés **EXIT 0 con 60 aserciones** (33 PCR-02.1 + 16 PCR-02.2 + 11 PCR-02.3).

## Casos del brief → evidencia

| Caso (§44) | Prueba | Resultado |
| ---------- | ------ | --------- |
| H1 `CLOSED_REOPEN_DELETE_BLOCKED` (§46, caso central) | S9.4: LE-1 → consumo → OP-A; cerrar; reabrir; DELETE → excepción con el mensaje semántico; OP-A, consumo y LE-1 permanecen | PASS |
| H2 `CANCELLED_REOPEN_DELETE_BLOCKED` | S9.6: cancelar activa el candado; reabrir; DELETE → FALLA | PASS |
| H3 `DRAFT_NEVER_FINALIZED_DELETE_ALLOWED` | S9.7 | PASS |
| H4 `IN_PROGRESS_NEVER_FINALIZED_DELETE_ALLOWED` | S9.8 | PASS |
| H5 `DIRECT_API_CLOSE_ACTIVATES_LOCK` (§26) | S9.1: UPDATE SQL directo a `closed` → candado asignado en BD | PASS |
| H6 `DIRECT_API_REOPEN_PRESERVES_LOCK` (§27) | S9.2: reabrir y RE-cerrar conservan la fecha ORIGINAL (§35/§36) | PASS |
| H7 `LOCK_CANNOT_BE_CLEARED` (§25) | S9.3: `set history_locked_at = null` → restaurado; fecha arbitraria → restaurado; INSERT con candado fabricado → descartado. S9.9: ídem bajo `authenticated` | PASS |
| H8 `REOPENED_ORDER_DELETE_BLOCKED_BY_DB` (§24/§48) | S9.9: admin autenticado (RLS real, `set local role authenticated`) cierra, reabre y el DELETE FALLA por candado aunque su RLS de DELETE lo permitiría | PASS |
| H9 `REOPENED_ORDER_DELETE_BLOCKED_SERVER` | unit A.2: la acción carga `history_locked_at` y evalúa la guarda ANTES del delete; barrera §2d traducida al mensaje semántico | PASS |
| H10 `REOPENED_ORDER_HISTORY_SURVIVES` (§47) | S9.5: OP-A → INT-A → OP-B; DELETE de OP-A reabierta FALLA; salida, consumo interno y genealogía permanecen | PASS |
| H11 `CLOSED_UI_SHOWS_REOPEN_NOT_EDIT` (§34) | unit A.5: detalle y listado muestran «Reabrir orden»/«Reabrir» para finalizadas y «Editar» solo para abiertas; unit A.4: la edición genérica de finalizadas queda vetada server-side | PASS |
| H12 `REOPENED_UI_IS_EDITABLE_BUT_NOT_DELETABLE` (§32) | unit A.1 (matriz) + A.5: reabierta = Editar sí, Eliminar no, aviso «Orden histórica reabierta» | PASS |
| Auditoría (§28) | S9.10: cierre y reapertura con fila en `audit_log` (`diff` old/new) | PASS |
| Backfill (§9/§10) | S9.11: finalizada sin candado → cubierta por estado; reabierta pre-sprint → cubierta por evidencia de audit_log; sin evidencia → **nada se inventa** (control negativo) | PASS |
| Transiciones (§18) | dominio documentado + unit A.1 (`orderReopenAllowed`) + S9 (todas las transiciones ejecutadas) | PASS |

## Regresiones

| Suite | Resultado |
| ----- | --------- |
| Arnés PostgreSQL S1–S6 (PCR-02.1, 33 aserciones) | PASS |
| Arnés PostgreSQL S7–S8 (PCR-02.2, 16 aserciones; A3/A4/A7 con el mensaje semántico unificado) | PASS |
| `test:pcr02` / `test:pcr02-1` / `test:pcr02-2` | PASS |
| `test:release` (PCR-01.1) + Textiles (T1…T9F, diagnóstico, pasaportes, share links) | PASS |
| `npm run test:all` | **EXIT 0 — 1505 verificaciones** |
| typecheck / lint / build (`--webpack`) | EXIT 0 |

## QA pendiente (BLOCKED, no bugs)

Supabase real (RLS/PostgREST de extremo a extremo) y navegador (flujo
Reabrir/Editar/Eliminar, aviso de reabierta) — mismos límites de entorno de
los sprints previos; el arnés local con RLS bajo `authenticated` es la
mejor aproximación disponible.
