# QUALITY-11 · El planificador

## 1 · La decisión, y por qué

El repositorio **no tenía ninguna infraestructura de tareas programadas**: ni
`vercel.json` con `crons`, ni `pg_cron`, ni funciones de borde. Crearla habría
significado tocar configuración **compartida con Production** —un bloque `crons`
en `vercel.json` se aplica a los despliegues de producción— y este sprint tiene
prohibido tocar Production (§165).

Se aplica §163 al pie de la letra: **la invocación del planificador queda
verificada contra Staging y el paso de despliegue se declara con precisión**,
sin comprometer el aislamiento.

## 2 · Lo que existe

`POST /api/automation/run`

| | |
|---|---|
| Autenticación | cabecera `x-automation-secret` contra `AUTOMATION_RUNNER_SECRET` |
| Sin secreto configurado | **404**. El endpoint no existe |
| Secreto que no coincide | **404**. Sin pistas: quien no lo trae no merece un mensaje distinto de quien se equivoca de URL |
| Secreto de menos de 16 caracteres | **404**. Falla cerrada |
| Cuerpo | `{ "organization_id"?: uuid, "business_date"?: "YYYY-MM-DD" }` — ambos validados por forma |
| Sin `organization_id` | barre todas las empresas con el motor encendido |
| Qué hace | llama a `quality_automation_run(empresa, 'live')` — **el mismo motor** |
| Qué devuelve | cuántas empresas, cuántos barridos, cuántos fallos. Ningún secreto |

Una empresa que falle no arrastra a las demás.

## 3 · Cómo se despliega el día que se quiera un cron

El endpoint es la puerta; el planificador es intercambiable. Cualquiera de estos
sirve **sin tocar el código**:

1. **Cron de Vercel** — añadir a `vercel.json`:
   ```json
   { "crons": [{ "path": "/api/automation/run", "schedule": "0 6 * * *" }] }
   ```
   Advertencia: esto es configuración compartida y afecta a Production. Es
   exactamente lo que este sprint NO hace.
2. **Planificador externo** (GitHub Actions, cron de un servidor, Zapier):
   ```bash
   curl -X POST https://<host>/api/automation/run \
        -H "x-automation-secret: $AUTOMATION_RUNNER_SECRET" \
        -H "content-type: application/json" -d '{}'
   ```
3. **pg_cron en Supabase**, llamando directamente a
   `quality_automation_run(empresa, 'live')` — sin pasar por HTTP.

La cadencia recomendada es **una vez al día**, temprano en la zona horaria de
negocio de cada empresa. El motor es idempotente: correrlo de más no duplica
nada; correrlo de menos solo retrasa el aviso.

## 4 · Qué está verificado

| Afirmación | Cómo se comprobó |
|---|---|
| el barrido sin sesión evalúa igual | V1 · `run_kind = 'scheduled'`, reglas > 0 y sujetos > 0 |
| el barrido sin sesión es idempotente | V2 · segunda pasada: 0 señales, 0 avisos, 0 tareas |
| el barrido sin sesión es acotado | V3 · dos pasadas idénticas evalúan el mismo número de sujetos y reglas |
| sin sesión NO se puede simular | V4 · la simulación exige una sesión |
| un modo inventado se rechaza | V5 |
| el endpoint falla cerrado | pruebas estáticas T2 · 404 en los cinco caminos |

El detalle que lo hacía frágil y ya no lo es: el proveedor de sujetos comprueba
la pertenencia **contra la sesión**. Sin la salvedad para la ejecución sin
sesión, el cron habría entrado, evaluado cero sujetos y escrito una ejecución
«correcta» que no miró nada — la peor forma de fallar, porque no se nota.

## 5 · El reloj

El día de negocio lo resuelve el **servidor**, en la zona horaria de la empresa
(`quality_automation_settings.business_timezone`, por omisión `UTC`). Ninguna
acción de la interfaz envía la fecha. El endpoint acepta `business_date` —tras
el secreto y validada por forma— porque un planificador que reintenta el barrido
de ayer tiene que poder decirlo, y porque permite verificar el motor contra
Staging sin esperar a mañana.
