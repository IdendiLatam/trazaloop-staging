# PCR-02.4 · Test Matrix

## PostgreSQL real (`npm run test:pcr02-4-db` → tests/db/run-local-pg.sh, 7/7)
Corre tras las suites PCR-02.1 (S1–S6), PCR-02.2 (S7) y PCR-02.3 (S8–S9):
**69 aserciones, EXIT 0**.

| Escenario | Cobertura | Resultado |
| --- | --- | --- |
| S10.1 | Matriz §38 consumo externo: con orden CLOSED, INSERT/UPDATE/DELETE de `batch_consumption` fallan con el mensaje pactado; el histórico (100 kg) permanece | ✔ |
| S10.2 | Matriz §39 consumo interno: I/U/D de `output_batch_consumption` fallan; la genealogía permanece | ✔ |
| S10.3 | Matriz §40 + política §10/§47: INSERT/DELETE de lote y cambios de orden/producto/cantidad/código fallan (incluido mover un lote HACIA la cerrada); los descriptivos se corrigen y quedan en `audit_log` | ✔ |
| S10.4 | Matriz §41 + §22: I/U/D de composición fallan; mover una composición hacia un lote de orden cerrada falla; la masa histórica permanece | ✔ |
| S10.5 | §26–§28: editar campos de una cerrada, reabrir+reescribir en una sentencia y `closed→draft` fallan; el código de la orden no cambia | ✔ |
| S10.6 | §44: reapertura PURA pasa; corregir consumo, agregar consumo, corregir composición, registrar salida, corregir cantidad y editar la orden PASAN de verdad; `history_locked_at` idéntico; DELETE de la orden sigue vetado con el mensaje histórico | ✔ |
| S10.7 | §45: recierre congela de nuevo; la fecha del candado no cambia; la corrección legítima (90 kg) sobrevive | ✔ |
| S10.8 | §42: `set local role authenticated` + claims de admin real → INSERT consumo, UPDATE composición y DELETE consumo interno sobre la cerrada fallan por el structural guard (la RLS por sí sola autorizaba) | ✔ |
| S10.9 | §54: una orden ABIERTA con consumo sigue siendo eliminable y su cascada limpia las hijas (la guarda no dispara sobre padre inexistente); `cancelled` congela igual que `closed` | ✔ |

Fixtures previos adecuados al ciclo de vida realista (abrir → construir →
cerrar): OC-1 y las OP-PROD de S6 (PCR-02.1), A5/A6 (PCR-02.2). Las 60
aserciones previas siguen pasando sin cambiar su semántica.

## Unit/estático (`npm run test:pcr02-4`) — 20 checks, EXIT 0
§2e completo en la 0104 (guarda SECURITY INVOKER + search_path + mensaje
uniforme + grant a authenticated justificado + 5 triggers + política
descriptiva documentada) · S1–S12 sobre las server actions reales ·
`updateOutputBatchAction` con `structuralChange` · UI de output-batches
congelada condicionalmente · runner 7/7 · fixtures realistas · secuencia
0001–0104 sin 0105+ · sin comandos remotos · sin version bump.

## Regresión completa (`npm run test:all`) — EXIT 0
typecheck ✔ · lint ✔ · 91 suites (Textiles completo, PCR-01.1, PCR-02,
PCR-02.1, PCR-02.2, PCR-02.3, PCR-02.4) · 1.525 checks ✔ · `npm run build`
(next build --webpack) ✔.
