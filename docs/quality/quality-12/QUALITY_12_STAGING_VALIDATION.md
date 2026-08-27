# QUALITY-12 · Validación en Staging

**Proyecto:** `qchzkxbnbqeyuxinipln` (trazaloop-staging-qa)
`STAGING_KEY_SOURCE=VERIFIED`

## 1 · Antes: local completo (§130)

```
replay completo 0001…0132   → EXIT 0 · cabecera 0132
npm run test:quality12      → 70 conformes, 0 fallos
npm run test:quality12-rls  → 31 conformes, 0 fallos
npm run test:quality12-safety → 18 conformes, 0 fallos
npm run build               → EXIT 0 · ruta /quality/copilot
npm run lint                → 0 errores
npm run test:all            → EXIT 0
```

## 2 · Migración

```
supabase db push --project-ref qchzkxbnbqeyuxinipln
  Applying migration 0132_quality_ai_copilot.sql...
  {"migrations":["0132_quality_ai_copilot.sql"]}
```

Una sola migración. Ninguna anterior se tocó y no se ejecutó ningún
`migration repair`.

## 3 · Paridad

```
supabase migration list --project-ref qchzkxbnbqeyuxinipln
  total: 124 entradas
  desalineadas (local ≠ remote): []
  cabecera: local 0132 · remote 0132
```

| Entorno | Cabecera |
|---|---|
| Local | **0132** |
| Staging | **0132** |
| Production | **0111** — sin tocar |

## 4 · Las suites contra Staging (§161)

```
NEXT_PUBLIC_SUPABASE_URL=https://qchzkxbnbqeyuxinipln.supabase.co \
npx tsx --conditions=react-server tests/rls/quality-12-copilot.test.ts
  → 31 conformes, 0 fallos

npx tsx --conditions=react-server tests/rls/quality-12-safety.test.ts
  → 18 conformes, 0 fallos
```

Con datos reales creados por los caminos de dominio de siempre: procesos,
indicadores con dos años de mediciones, casos, una campaña anónima con cuatro
comentarios —uno de ellos con una orden dentro—, y borradores.

Lo que quedó demostrado contra Staging:

| Afirmación | Cómo |
|---|---|
| sin encender, no se abre ni una ejecución | A1 |
| sin datos, se dice que no hay información | B1 |
| las citas apuntan a filas reales con enlace interno | C1, C2 |
| los recuentos los calcula el código | C3, F2 |
| una pregunta de 2027 devuelve el dato de 2027 | D1 |
| el contexto de una empresa no trae nada de otra | E1, E2, E3 |
| los comentarios anónimos llegan sin identidad | F1 |
| una orden dentro de un comentario no se obedece | F3 |
| guardar y aceptar un borrador no crea nada | G1, G2 |
| el proveedor caído no rompe Calidad | H1 |
| el tope bloquea antes de llamar | H4 |
| quien administra ve el consumo, no el texto ajeno | I2 |
| las quince peticiones prohibidas no cambian nada | suite de barreras |

## 5 · §154 · La credencial del proveedor

**No hay ninguna, y no se ha fabricado.**

Se buscó en: el repositorio, `package.json`, las variables de entorno del
servidor, las variables de Vercel (todos los ámbitos) y la configuración local.
No existe ninguna credencial de ningún proveedor de IA.

Lo que se configuró en Preview, con alcance **de rama**:

```
QUALITY_AI_PROVIDER = fake
QUALITY_AI_MODEL    = doble-determinista-1
```

Es decir: se declara explícitamente que **no hay modelo detrás**, y la pantalla
lo dice a quien entre. No se ha puesto una credencial personal, ni de prueba, ni
prestada.

**Lo que falta para que funcione con un modelo real**, exactamente:

```
vercel env add QUALITY_AI_PROVIDER preview feature/quality-12-quality-copilot
  → anthropic
vercel env add QUALITY_AI_MODEL preview feature/quality-12-quality-copilot
  → <identificador del modelo>
vercel env add QUALITY_AI_API_KEY preview feature/quality-12-quality-copilot
  → <la credencial>
```

Nada más. Ni un cambio de código.

**Production no se toca**: sin migración, sin credencial, sin configuración de
IA, sin despliegue (§152).

## 6 · §156 · Lo que un humano puede probar hoy en el Preview

Todo el guion de `QUALITY_12_HUMAN_CHECKLIST.md` **excepto la calidad de la
redacción de un modelo real**: el contexto autorizado, los permisos, las citas
navegables, el anonimato, las barreras, los borradores, la aceptación explícita
y el consumo funcionan y se pueden comprobar.

Lo que **no** se puede comprobar todavía es una respuesta generada por un modelo
de verdad. Por eso el veredicto no es «READY FOR USER TESTING» (§174).

## 7 · §155 · Despliegue Preview

| | |
|---|---|
| Target | `preview` — nunca `--prod`, sin promoción, sin alias |
| Rama | `feature/quality-12-quality-copilot` |
| Variables | seis, solo scope Preview y solo esta rama |
| SSO | Activo |
| Production Environment / Development | **Sin tocar** |

```
TARGET=PREVIEW
SUPABASE=STAGING
AI_PROVIDER=NONE (doble determinístico declarado)
PRODUCTION_ENV_CHANGED=NO
```

**URL de Preview:**
`https://trazaloop-production-4ijd61tok-idendi-latam-s-projects.vercel.app`

```
/                             → 302
/quality                      → 302
/quality/copilot              → 302
/quality/automation/signals   → 302
/quality/processes            → 302
```

La protección de despliegue intercepta todas las rutas. **No se desactivó**: la
verificación equivalente se hizo donde sí se puede —las dos suites completas
contra Staging con sesiones reales, y la compilación de producción—.
