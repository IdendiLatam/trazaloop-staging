# Trazaloop · PCR-02.2 — Informe de implementación

Micro-sprint focalizado sobre `trazaloop-sprint-PCR-02.1.zip` (base
verificada byte a byte, 0 diferencias). Dos hallazgos, tres bugs, todos
**reproducidos con evidencia en PostgreSQL real antes de corregir** (ver
`docs/PCR-02.2-REVIEW-FIXES.md`). Diff mínimo; nada de PCR-02.1 se debilitó.

## 1. Archivos modificados / nuevos

### Migración (corregida in situ; sigue sin existir 0105)

`supabase/migrations/0104_pcr02_internal_consumption_and_completeness.sql`

* **§2c nuevo** — `production_orders_protect_history()` +
  `t_production_orders_protect_history` (BEFORE DELETE): una orden
  `closed`/`cancelled` no puede eliminarse ni por acceso directo a la API.
  `SECURITY INVOKER`, `search_path` fijado, solo lee `OLD` (sin consultas a
  otras tablas ni organizaciones), `revoke execute`, estados reales de 0025.
  **Orden respecto a FK/cascade documentado en el SQL**: BEFORE DELETE por
  fila dispara antes de que el borrado comience → si aborta, las cascadas de
  `batch_consumption`/`output_batch_consumption` jamás arrancan y el
  RESTRICT de `output_batches` queda como estaba. draft/in_progress
  conservan el comportamiento histórico (sin ampliar ni recortar permisos).
* **§4** — semántica **fail-closed** (punto 6 nuevo de la documentación
  interna, con los cuatro desenlaces: RAÍZ VÁLIDA / DEAD END / CICLO /
  LÍMITE DE PROFUNDIDAD): nuevas CTEs `cycle_edges` (saltos que volverían a
  una orden del camino: la recursión los omite, la vista ahora los
  **registra**) y `truncated_branches` (órdenes en el límite de profundidad
  con consumo interno por seguir). `chain_supplier_ok` y `chain_material_ok`
  exigen además la ausencia de ambos. Señales internas al CTE; **columnas
  públicas, tipos y etiquetas idénticos** (§23). La protección operacional
  (`depth < 10` + `path`) se conserva sin cambios (§20/§30).
* **§5** — verificaciones post-migración ampliadas (delete de historial,
  ciclo puro, profundidad).
* Cabecera/índice actualizados registrando PCR-02.2.

### Aplicación

| Archivo | Cambio |
| ------- | ------ |
| `lib/domain/production-alerts.ts` | Nueva `orderDeletionBlockedMessage(status)`: política de eliminación pura y documentada (draft/in_progress → null; closed/cancelled → mensaje del historial, el mismo del trigger §2c). |
| `server/actions/traceability.ts` | `deleteProductionOrderAction`: resuelve `id, status` de la orden (acotado a la empresa), aplica la política **antes** del delete, traduce el `23514` del trigger §2c al mismo mensaje y conserva el `23503` del RESTRICT de salidas. |
| `app/(app)/(shell)/(cpr)/traceability/production-orders/[id]/page.tsx` | El botón «Eliminar» del encabezado queda dentro de `!mutationBlocked` (mismos estados). «Editar» permanece: es la vía legítima para reabrir. La pantalla de una orden cerrada sigue siendo consulta/auditoría completa (secciones, evidencias, genealogía, alertas). |
| `app/(app)/(shell)/(cpr)/traceability/production-orders/page.tsx` | «Eliminar» por fila condicionado a `!orderDeletionBlockedMessage(o.status)`. |

### Pruebas

| Archivo | Contenido |
| ------- | --------- |
| `tests/db/pcr02_2_assertions.sql` (nuevo) | 16 aserciones conductuales: S7.A1–A7 (matriz de borrado + **no-cascada §14** + bypass con rol `authenticated`) y S8.B1–B10 + R1/R2 (fail-closed + regresiones demostradas). |
| `tests/db/run-local-pg.sh` | Paso 5/5: ejecuta la suite PCR-02.2 tras la PCR-02.1 (total **49 aserciones**). |
| `tests/unit/pcr02-2-hardening.test.ts` (nuevo) | 11 checks: matriz pura de eliminación ejecutada, candados de acción/UI/trigger/vista (contra el cuerpo real, §42), conservación PCR-02.1, migraciones y no-remoto. |
| `package.json` | `test:pcr02-2` (dentro de `test:all`) y `test:pcr02-2-db` (arnés PostgreSQL, fuera de `test:all`). `test:pcr02-1*` intactos (§44). |

### Documentación

Nuevos: los 5 `docs/PCR-02.2-*.md`. Anotados como sustituidos:
`docs/PCR-02.1-PRODUCTION-DEPLOY.md` y `docs/PCR-02.1-ROLLBACK.md`. El
historial documental PCR-02 y PCR-02.1 se conserva íntegro (§55).

## 2. Decisiones

1. **Política de eliminación = política de mutación.** Los estados que
   bloquean mutar (closed/cancelled) son exactamente los que bloquean
   eliminar — coherencia verificada en la suite (A.1). draft e in_progress
   conservan la eliminación histórica; el RESTRICT de salidas y la RLS
   admin/quality no se tocan (§12/§36).
2. **El ciclo invalida aunque exista rama externa válida (§25).** Una
   historia cíclica no puede cerrarse documentalmente; para trazabilidad
   auditable la completitud exige que TODAS las ramas terminen en raíz
   válida (AND, §26). Documentado en el SQL.
3. **Truncamiento = no demostrado.** Alcanzar la profundidad máxima con
   consumo interno pendiente marca la rama como no resuelta. La cadena legal
   que llega a su raíz dentro del límite sigue siendo `complete` (S8.B7:
   sin sobre-corrección).
4. **Señales internas, contrato intacto (§23).** `cycle_edges` y
   `truncated_branches` viven dentro del CTE; ninguna columna pública nueva.
   Compat §39 analizada: ver la guía de despliegue.

## 3. Riesgos

* QA contra Supabase real y navegador: pendiente (escenario no ejecutable
  aquí, no bug conocido).
* `cycle_edges` añade un join sobre el cierre recursivo; acotado por el
  mismo `depth < 10` y por RLS de las tablas base — vigilar el plan en
  organizaciones con cadenas internas masivas (nota en la migración).
* Ciclos largos siguen sin bloquearse en INSERT (decisión §30 conservada):
  ahora son visibles como `incomplete`, que es el comportamiento deseado.
