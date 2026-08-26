# QUALITY-06 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Antes: validación local completa

La migración se replayó **entera** contra un stack Supabase local (Postgres 17,
la misma versión mayor que Production) antes de tocar Staging:

```
supabase db reset --local     → EXIT 0 · cabecera 0124
npm run test:quality06        → 77 conformes, 0 fallos
npm run test:quality06-rls    → 58 conformes, 0 fallos
npm run build                 → EXIT 0 · 10 rutas nuevas bajo /quality/people
npm run test:all              → TEST_ALL_EXIT_REAL=0
```

Los cinco defectos que aparecieron —y se corrigieron— están en
`QUALITY_06_TEST_MATRIX.md` §5.

## 2 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0123_quality_people_competence_knowledge.sql...
  {"migrations":["0123_quality_people_competence_knowledge.sql"]}

supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0124_quality_people_tasks_from_sweep.sql...
  {"migrations":["0124_quality_people_tasks_from_sweep.sql"]}
```

Antes: cabecera 0122. Después: **0124**. Solo se aplicaron las migraciones
nuevas; ninguna anterior se tocó y no se ejecutó ningún `migration repair`.

**Por qué dos y no una.** El encargo anticipaba `0123`. Con 0123 ya aplicada a
Staging, la revisión de §68 mostró que el barrido emitía alertas pero ninguna
TAREA, así que «integrar las tareas generadas en Mis tareas» no tenía nada que
integrar. Corregirlo editando 0123 habría exigido un `migration repair`, que está
prohibido y que además convierte el histórico de migraciones en una versión
conveniente de los hechos. 0124 reescribe el cuerpo del barrido —no crea
esquema— y respeta la invariante que de verdad importa: **append-only**.

## 3 · Paridad de migraciones

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 116 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0124 · remote 0124
```

| Entorno | Cabecera |
|---|---|
| Local | **0124** |
| Staging | **0124** |
| Production | **0111** — ver §7 |

## 4 · El esquema, comprobado en remoto

```
26 tablas nuevas presentes
0 tablas quality_* sin RLS
0 privilegios de `anon` sobre personas, competencia, desempeño y señales
quality_knowledge_signals para `authenticated` → SELECT, UPDATE (y nada más)
5 vistas con security_invoker = true
```

La última línea incluye `v_quality_position_current_holder`, que 0123 reemplaza:
sigue siendo `security_invoker` después del cambio.

## 5 · La suite RLS corrió CONTRA Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx tests/rls/quality-06-people-competence-knowledge.test.ts
  → 58 conformes, 0 fallos   ·   EXIT=0
```

No es una repetición decorativa de la corrida local. Un proyecto de Supabase
concede privilegios por defecto sobre cada tabla nueva; las comprobaciones que
verifican que un consultor **no** puede leer una ficha, una competencia ni una
evaluación —y que la sesión no puede fabricar tareas ni alertas— son exactamente
las que habrían fallado sin las revocaciones explícitas de §13 de la migración.

Y las que atacan las funciones `security definer` con el identificador de otra
empresa son las que fallaban de verdad hasta que se endurecieron.

## 6 · Datos efímeros y residuo

La suite creó dos empresas efímeras (`Q06 A …`, `Q06 B …`), cinco usuarios de
prueba y su contenido. Todo se retiró **lógicamente**, sin debilitar ninguna
invariante:

| Qué | Cómo quedó |
|---|---|
| Personas | `former`, con fecha de salida |
| Cargos y competencias | `is_active = false` |
| Conocimiento | `retired` |
| Lecciones | `archived` |
| Ciclo de desempeño | `closed` |
| Señales de continuidad | `dismissed` |
| Alertas | `dismissed` |
| Tareas generadas por el barrido | `cancelled`, con su motivo escrito |

Recuento posterior: **0** personas activas, **0** cargos activos, **0**
conocimientos activos, **0** señales abiertas, **0** alertas pendientes, **0**
tareas pendientes.

**Residuo declarado:** quedan **2 evaluaciones de desempeño cerradas** (una por
cada corrida de la suite en Staging: la de 0123 y la de 0124). Es historia
por diseño: cerrarla es un acto formal y el dominio no ofrece deshacerlo. No se
tocó ninguna invariante para borrarla.

## 7 · Production

**No se tocó.** Ninguna migración, ningún dato, ningún usuario, ninguna semilla,
ninguna variable, ningún despliegue, ninguna promoción, ningún alias.

La única interacción fue una lectura para poder afirmarlo:
`supabase migration list --project-ref mvmpadeixomwkpxbnhky`.

**Corrección de un dato del encargo.** El encargo dice «Production sigue en
0122». No es así: la cabecera remota de Production es **0111**. QUALITY-01…05
nunca se aplicaron allí, lo cual es coherente con que Quality sea un módulo
privado todavía en prueba. Lo que el encargo pide de verdad —que este sprint no
toque Production— se cumple: sigue exactamente donde estaba.

Al ejecutar esa lectura, la CLI imprimió `Initialising login role...`, que es su
preparación de conexión. No se aplicó ninguna migración ni se escribió ningún
dato de la aplicación, y la cabecera remota siguió en 0111 después.

## 8 · Cuentas QA permanentes, intactas

```
✔ quality.admin@trazaloop-staging.local
✔ quality.approver@trazaloop-staging.local
✔ quality.qa@trazaloop-staging.local
✔ quality.reviewer@trazaloop-staging.local
```

No se cambió ninguna contraseña, no se recreó ninguna cuenta y no se ejecutó
ningún cleanup sobre ellas. Los usuarios de la suite son efímeros y llevan otro
dominio (`@test.trazaloop.dev`).

## 9 · Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `feature/quality-06-people-competence-knowledge` |
| Variables | tres, **solo scope Preview y solo esta rama**, apuntando a Staging |
| Estado | ● Ready |
| SSO | Sigue activo: `/` y `/quality/people` responden **302** sin sesión |
| Production Environment / Development | **Sin tocar** (todas sus variables siguen con 32 días) |

```
TARGET=PREVIEW
SUPABASE=STAGING
PRODUCTION_ENV_CHANGED=NO
```

Comprobación de destino, resuelta por la propia plataforma para esta rama:

```
vercel env pull --environment=preview --git-branch=feature/quality-06-…
  NEXT_PUBLIC_SUPABASE_URL="https://qchzkxbnbqeyuxinipln.supabase.co"
  referencia de Production en el entorno Preview: 0 ocurrencias
```

**URL de Preview:**
`https://trazaloop-production-4c0vivc60-idendi-latam-s-projects.vercel.app`

La protección de despliegue impide una comprobación anónima en tiempo de
ejecución —que es justo lo que debe hacer—, así que la prueba de destino es la
de configuración, no una petición a una página protegida.
