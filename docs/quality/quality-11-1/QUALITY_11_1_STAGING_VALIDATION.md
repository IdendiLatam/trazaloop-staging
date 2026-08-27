# QUALITY-11.1 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Antes: local completo

```
replay completo 0001…0131   → EXIT 0 · cabecera 0131
npm run test:quality111     → 41 conformes, 0 fallos
npm run test:quality111-rls → 42 conformes, 0 fallos
npm run test:quality11      → 129 conformes, 0 fallos
npm run test:quality11-rls  →  68 conformes, 0 fallos
npm run test:quality11-perf →   6 conformes, 0 fallos
npm run build               → EXIT 0
npm run test:all            → TEST_ALL_EXIT = 0
```

El replay se completa aplicando de la `0105` en adelante con
`psql --single-transaction`, por la razón de siempre —esa migración exige
`LOCK TABLE` dentro de una transacción administrada por el cliente— y que no
tiene nada que ver con QUALITY-11.1.

Regresiones contra base real, en local:

```
quality03-rls  52 ✔   quality04-rls  33 ✔   quality07-rls  48 ✔
quality08-rls  60 ✔   quality09-rls  60 ✔   quality10-rls  61 ✔
quality11-rls  68 ✔   quality11-perf  6 ✔   quality111-rls 42 ✔
```

Las de QUALITY-03 y QUALITY-04 son las que importan: sus barridos se tocaron.

## 2 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0131_quality_automation_event_bridge.sql...
  {"migrations":["0131_quality_automation_event_bridge.sql"]}
```

Una sola migración. Ni la `0129` ni la `0130` se tocaron, y no se ejecutó
ningún `migration repair`.

## 3 · Paridad

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 123 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0131 · remote 0131
```

| Entorno | Cabecera |
|---|---|
| Local | **0131** |
| Staging | **0131** |
| Production | **0111** — sin tocar |

## 4 · La suite completa, contra Staging (§64)

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-11-1-event-scheduled-parity.test.ts
  → 42 conformes, 0 fallos
```

Con datos reales, creados por los caminos de dominio de siempre:

| Lo que pide §64 | Cómo se probó | Resultado |
|---|---|---|
| medición pendiente programada | `quality_scan_pending_measurements` **sin sesión** | detecta y deja su tarea |
| acción vencida programada | `work_scan_pending_actions` **sin sesión** | detecta y la acción no cambia |
| evento queja | `insert` real en `quality_customer_feedback` | hecho → señal · 0 casos · 0 NC |
| evento proveedor | `quality_close_supplier_evaluation` real | hecho → resolutor → señal sobre el alcance · aprobación intacta |
| evento indicador | `quality_record_measurement` real | hecho → señal · el indicador no cambia |
| evento auditoría | `quality_evaluate_audit_finding` real | hecho → señal · 0 NC |
| segundo barrido = 0 duplicados | barrido completo repetido | 0 avisos nuevos |
| reproducir el evento = 0 duplicados | procesar dos veces · dos procesadores a la vez | 1 señal, 1 acuse |

## 5 · Regresiones contra Staging

```
quality11-rls  68 ✔        (QUALITY-11 completo, con el ejecutor ya extraído)
quality04-rls  33 ✔        (su barrido se tocó)
quality08-rls  60 ✔        (regresión de anonimato)
```

La suite de QUALITY-03 **no** se puede correr contra Staging: lleva desde su
sprint una guarda que aborta si la API apunta a un proyecto remoto mientras
`SUPABASE_DB_URL` apunta a local, precisamente para que nadie mezcle los dos sin
darse cuenta. Se corrió en local, que es donde esa guarda permite comprobar
también el esquema:

```
quality03-rls  52 ✔        (su barrido se tocó)
```

## 6 · El planificador (§30, §42)

**No se configuró ningún cron.** El endpoint sigue siendo la única puerta, y
ahora hace las dos cosas por pasada: drena los hechos pendientes y después
barre el estado.

Verificado desde un servidor de producción local apuntando a Staging:

```
POST /api/automation/run   sin secreto     → 404
POST /api/automation/run   con el secreto  → 200

{"organizations":2,"runs":2,"event_runs":2,"failures":0,
 "results":[{"organization_id":"5d787b0d…","event_run_id":"8e773208…","run_id":"ccc10eb2…"},
            {"organization_id":"1905e59d…","event_run_id":"84afe0c5…","run_id":"9c9762b6…"}]}
```

El campo `event_runs` es nuevo: dice cuántas ejecuciones por hechos se abrieron.
Cada pasada abre dos ejecuciones por empresa —una por hechos y una programada—,
y cada una dice honestamente lo que hizo.

## 7 · Datos efímeros

La suite creó dos empresas `Q111 A …` / `Q111 B …` y usuarios
`@test.trazaloop.dev`. Se retiran **lógicamente**, como en QUALITY-11: motor
apagado, reglas retiradas, señales descartadas con motivo, tareas canceladas.
Señales, ejecuciones y **acuses de entrega** se conservan: son la prueba de qué
hecho vio qué regla.

Ninguna cuenta permanente de QA se tocó.

## 8 · Production

```
supabase migration list --project-ref mvmpadeixomwkpxbnhky
  cabecera remota: 0111
```

Sin migración, cron, planificador, variables, datos, usuarios, despliegue,
promoción ni alias.
