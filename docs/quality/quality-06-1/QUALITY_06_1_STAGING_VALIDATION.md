# QUALITY-06.1 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Sin migración

QUALITY-06.1 se resolvió por consultas y proyecciones. No hay nada que aplicar.

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 116 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0124 · remote 0124
```

| Entorno | Cabecera antes | Cabecera después |
|---|---|---|
| Local | 0124 | **0124** |
| Staging | 0124 | **0124** |
| Production | 0111 | **0111** |

No se ejecutó `db push`, ni `db reset`, ni `migration repair`.

## 2 · Antes: validación local

```
npm run test:quality061       → 46 conformes, 0 fallos
npm run test:quality061-rls   → 28 conformes, 0 fallos
npm run build                 → EXIT 0 · dos rutas nuevas
npm run test:all              → TEST_ALL_EXIT_REAL=0
```

## 3 · La suite corrió CONTRA Staging

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx --conditions=react-server tests/rls/quality-06-1-…test.ts
  → 28 conformes, 0 fallos   ·   EXIT=0
```

Y como regresión de QUALITY-06 sobre el mismo entorno:

```
npx tsx tests/rls/quality-06-people-competence-knowledge.test.ts
  → 58 conformes, 0 fallos   ·   EXIT=0
```

Importa: la suite ejercita `getOnboarding` y `getEvaluationContext` reales con
la sesión de un usuario de Staging. Lo que pasa aquí es lo que pasará en el
Preview, no una aproximación.

## 4 · Datos efímeros y residuo

La suite creó dos empresas efímeras (`Q061 A …`, `Q061 B …`), cuatro usuarios de
prueba y su contenido. Todo se retiró **lógicamente**, sin debilitar ninguna
invariante:

| Qué | Cómo quedó |
|---|---|
| Personas | `former`, con fecha |
| Cargos y competencias | `is_active = false` |
| Procesos | `retired` |
| Indicadores | `retired`, con su motivo escrito |
| Conocimiento | `retired` |
| Ciclo de desempeño | `closed` |
| Señales y alertas | `dismissed` |
| Tareas | `cancelled`, con su motivo |

Recuento posterior sobre las empresas efímeras de QUALITY-06 y 06.1: **0**
personas activas, **0** cargos activos, **0** indicadores activos, **0**
conocimientos activos, **0** alertas pendientes, **0** tareas pendientes.

**Residuo declarado:** quedan **4 evaluaciones de desempeño cerradas** y **3
mediciones**. Las dos cosas son historia por diseño: cerrar una evaluación es un
acto formal y una medición no se pisa —se corrige creando otra que la
sustituye—. No se tocó ninguna invariante para borrarlas.

## 5 · Cuentas QA permanentes, intactas

Las cuatro `quality.*@trazaloop-staging.local` siguen ahí. No se cambió ninguna
contraseña, no se recreó ninguna cuenta y no se ejecutó ningún cleanup sobre
ellas. Los usuarios de la suite son efímeros y llevan otro dominio.

## 6 · Production

**Sin tocar.** Ninguna migración, dato, usuario, semilla, variable, despliegue,
promoción ni alias. Su cabecera sigue en **0111**, que es lo que QUALITY-06 ya
había verificado y documentado.

Este sprint **no ejecutó ningún comando contra Production**, ni siquiera de
lectura: el estado se conoce del sprint anterior y no cambió, porque nada pudo
cambiarlo.

## 7 · Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `fix/quality-06-1-onboarding-evaluation-context` |
| Variables | tres, **solo scope Preview y solo esta rama**, apuntando a Staging |
| Estado | ● Ready |
| SSO | Activo: `/` y `/quality/people` responden **302** sin sesión |
| Production Environment / Development | **Sin tocar** (variables con 32 días) |

```
TARGET=PREVIEW
SUPABASE=STAGING
PRODUCTION_ENV_CHANGED=NO
```

Comprobación de destino, resuelta por la plataforma para esta rama:

```
vercel env pull --environment=preview --git-branch=fix/quality-06-1-…
  NEXT_PUBLIC_SUPABASE_URL="https://qchzkxbnbqeyuxinipln.supabase.co"
  referencia de Production en el entorno Preview: 0 ocurrencias
```

Las dos rutas nuevas están en el despliegue:

```
├ ƒ /quality/people/[personId]/onboarding/[assignmentId]
├ ƒ /quality/people/performance/[evaluationId]
```

**URL de Preview:**
`https://trazaloop-production-9g6j4103h-idendi-latam-s-projects.vercel.app`

La protección de despliegue impide una comprobación anónima en tiempo de
ejecución —que es lo que debe hacer—, así que la prueba de destino es la de
configuración, no una petición a una página protegida.
