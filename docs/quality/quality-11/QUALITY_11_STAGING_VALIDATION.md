# QUALITY-11 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Antes: validación local completa

Las dos migraciones se replayaron **enteras** contra un stack Supabase local
(Postgres 17, la misma versión mayor que Production) antes de tocar Staging:

```
replay completo 0001…0130   → EXIT 0 · cabecera 0130
npm run test:quality11      → 129 conformes, 0 fallos
npm run test:quality11-rls  →  68 conformes, 0 fallos
npm run test:quality11-perf →   6 conformes, 0 fallos
npm run build               → EXIT 0 · 7 rutas nuevas
npm run test:all            → TEST_ALL_EXIT = 0
```

> Nota sobre el replay: `supabase db reset` se detiene en la `0105`, que exige
> `LOCK TABLE` dentro de una transacción administrada por el cliente. Es una
> característica conocida del repositorio —está documentada en
> `tests/db/run-local-pg.sh`— y no tiene que ver con QUALITY-11. El replay se
> completa aplicando de la `0105` en adelante con `psql --single-transaction`,
> que es exactamente lo que hace el arnés local desde PCR-02.5.

Las quince suites contra base real, en local:

```
quality01-rls  57 ✔   quality011-rls 41 ✔   quality012-rls 33 ✔
quality02-rls  58 ✔   quality03-rls  52 ✔   quality031-rls 30 ✔
quality04-rls  33 ✔   quality05-rls  74 ✔   quality06-rls  58 ✔
quality061-rls 28 ✔   quality07-rls  48 ✔   quality08-rls  60 ✔
quality09-rls  60 ✔   quality10-rls  61 ✔   quality11-rls  68 ✔
```

## 2 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0129_quality_automation_observation.sql...
  {"migrations":["0129_quality_automation_observation.sql"]}
```

Después, al verificar el barrido **programado** contra Staging, aparecieron dos
fallos repetidos —dos barridos heredados que exigen sesión—. Como la 0129 ya
estaba aplicada en remoto, la corrección fue **append-only** (§158):

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0130_quality_automation_scheduled_observers.sql...
  {"migrations":["0130_quality_automation_scheduled_observers.sql"]}
```

Ninguna migración anterior se tocó y no se ejecutó ningún `migration repair`.

## 3 · Paridad

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 122 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0130 · remote 0130
```

| Entorno | Cabecera |
|---|---|
| Local | **0130** |
| Staging | **0130** |
| Production | **0111** — sin tocar |

## 4 · Las suites corrieron CONTRA Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-11-automation-observation.test.ts
  → 68 conformes, 0 fallos

npx tsx tests/rls/quality-08-customer-voice.test.ts     → 60 conformes, 0 fallos
npx tsx tests/rls/quality-09-audits.test.ts             → 60 conformes, 0 fallos
npx tsx tests/rls/quality-10-management-review.test.ts  → 61 conformes, 0 fallos
```

La de QUALITY-08 no es decorativa: es la **regresión de anonimato**. QUALITY-11
observa métricas de la voz del cliente, y comprobar que no introdujo una fuga
lateral hay que hacerlo con datos reales contra el mismo proyecto.

## 5 · Escenarios reales, con datos reales (§161)

La suite sembró los seis dominios que pide el encargo y ejecutó el motor sobre
ellos. Lo emitido en Staging:

```
Q11 A → 12 reglas · 19 señales · 27 ejecuciones · 17 avisos · 20 tareas
Q11 B →  1 regla  ·  0 señales ·  1 ejecución

señales por dominio:
  revisión por la dirección 10 · indicadores 3 · voz del cliente 2
  auditorías 2 · personas 1 · proveedores 1
```

**Dos barridos consecutivos, sin cambiar nada:**

```
segundo barrido (Q11 A):
  {"run_kind":"scheduled","status":"success","rules_evaluated":11,
   "subjects_evaluated":18,"matches":14,
   "signals_created":0,"alerts_created":0,"tasks_created":0,"failures":0}

señales 19 → 19 · avisos 17 → 17 · tareas 20 → 20
```

**0 duplicados.** Ni de las reglas propias ni de los ocho observadores.

## 6 · El planificador, verificado contra Staging (§163)

No se configuró ningún cron: hacerlo habría exigido tocar `vercel.json`, que es
configuración compartida con Production. Se verificó **la invocación**, que es
lo que §163 pide en ese caso: servidor de producción local, variables apuntando
a Staging.

```
POST /api/automation/run  sin secreto            → 404
POST /api/automation/run  secreto equivocado     → 404
GET  /api/automation/run                         → 405
POST /api/automation/run  UUID mal formado       → 404
POST /api/automation/run  con el secreto correcto→ 200

{"organizations":2,"runs":2,"failures":0,"results":[…]}
```

Y las dos ejecuciones que produjo:

```
{"run_kind":"scheduled","status":"success","rules_evaluated":11,
 "subjects_evaluated":18,"matches":14,"signals_created":0,
 "alerts_created":0,"tasks_created":0,"failures":0}
```

Idempotente por HTTP igual que por SQL. Y con la `0130` aplicada, los dos
barridos heredados que exigen sesión se anotan como **omitidos con motivo**, no
como fallos:

```
quality_scan_pending_measurements → skipped · «exige una sesión…»
work_scan_pending_actions         → skipped · «exige una sesión…»
los otros seis                    → success
```

## 7 · §162 · Datos efímeros y residuo

La suite creó dos empresas efímeras (`Q11 A …`, `Q11 B …`) y usuarios
`@test.trazaloop.dev`. Todo se retiró **lógicamente**, sin aflojar ni una
restricción:

| Qué | Cómo quedó |
|---|---|
| Motor de esas empresas | `is_enabled = false` |
| Reglas (13) | `retired`, con motivo escrito |
| Señales abiertas | `dismissed`, con motivo |
| Tareas de automatización (15) | `cancelled` (estado y fecha movidos juntos, que es lo que exige la restricción) |
| Señales (19) y ejecuciones (35) | **se conservan** — son la prueba de qué observó la plataforma y por qué |

Ninguna cuenta permanente de QA se tocó.

## 8 · Production

```
supabase migration list --project-ref mvmpadeixomwkpxbnhky
  cabecera remota: 0111
```

Sin migración, sin datos, sin usuarios, sin semillas, sin cron, sin variables,
sin despliegue, sin promoción, sin alias y sin webhook. Production en 0111 es
**intencional**: QUALITY-01…11 nunca se han aplicado allí.

## 9 · §164 · Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `feature/quality-11-automation-observation` |
| Variables | **cuatro**, solo scope Preview y solo esta rama, apuntando a Staging |
| Estado | ● READY |
| SSO | Sigue activo: seis rutas comprobadas, **302** todas |
| Production Environment / Development | **Sin tocar** |

```
TARGET=PREVIEW
SUPABASE=STAGING
PRODUCTION_ENV_CHANGED=NO
```

```
vercel env ls preview feature/quality-11-automation-observation
  AUTOMATION_RUNNER_SECRET       Preview (feature/quality-11-automation-observation)
  SUPABASE_SERVICE_ROLE_KEY      Preview (feature/quality-11-automation-observation)
  NEXT_PUBLIC_SUPABASE_ANON_KEY  Preview (feature/quality-11-automation-observation)
  NEXT_PUBLIC_SUPABASE_URL       Preview (feature/quality-11-automation-observation)
```

**URL de Preview:**
`https://trazaloop-production-k5yxke1b5-idendi-latam-s-projects.vercel.app`

```
/                                 → 302
/quality                          → 302
/quality/automation               → 302
/quality/automation/rules         → 302
/quality/automation/signals       → 302
/quality/automation/runs          → 302
POST /api/automation/run          → 401  (la protección de despliegue va delante)
```

La protección intercepta todas las rutas, incluida la del planificador. **No se
desactivó**: hacerlo para ver una pantalla expondría el resto de la aplicación.
La verificación equivalente se hizo donde sí se puede —la suite completa contra
Staging con sesiones reales, el endpoint contra Staging desde un servidor de
producción local, y la compilación de producción—.
