# PE-06 · Variables de entorno de Producción

*Actualizado en PE-06C2, el 6 de septiembre de 2026. **Solo nombres y presencia.
Ningún valor.** En este tramo no se cambió ni una variable de Producción.*

---

## La regla que ordena todo lo demás

**Lo que falta en Producción falla cerrado, no roto.** Una bandera de módulo solo
enciende con `"true"` o `"1"`; la llave de Intelligence exige más de veinte
caracteres; sin llaves de Wompi el proveedor se declara no configurado; sin
secreto de corredor la ruta responde 404.

Por eso **se puede desplegar Producción antes de tener las credenciales de
pago**: el producto simplemente no ofrecerá lo que no puede sostener.

---

## La matriz

| Variable | Clase | Local | Preview | Producción |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **CONSTRUCCIÓN** | ✔ | ✔ | ✔ |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **CONSTRUCCIÓN** | — | ✔ | ✔ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | construcción · heredada | ✔ | ✔ | — |
| `NEXT_PUBLIC_SITE_URL` | **CONSTRUCCIÓN** | ✔ | ✔ | ✔ |
| `SUPABASE_SECRET_KEY` | **NÚCLEO** | — | ✔ | ✔ |
| `SUPABASE_SERVICE_ROLE_KEY` | núcleo · heredada | ✔ | ✔ | — |
| `ACTIVE_ORG_COOKIE_SECRET` | **NÚCLEO** | ✔ | ✔ | ✔ |
| `PUBLIC_REGISTRATION_ENABLED` | núcleo · bandera | ✔ | ✔ | ✔ |
| `TEXTILES_MODULE_ENABLED` | núcleo · bandera | ✔ | ✔ | ✔ |
| `QUALITY_MODULE_ENABLED` | **QUALITY** | ✔ | ✔ | **FALTA** |
| `QUALITY_AI_PROVIDER` · `_API_KEY` · `_MODEL` · `_REASONING_EFFORT` | **IA** | — | ✔ | **FALTA** |
| `WOMPI_PUBLIC_KEY` · `_PRIVATE_KEY` | **CONTRATACIÓN** | — | ✔ | **FALTA · bloqueada** |
| `WOMPI_EVENTS_SECRET` · `_INTEGRITY_SECRET` | **WEBHOOKS** | — | ✔ | **FALTA · bloqueada** |
| `BILLING_RENEWAL_RUNNER_SECRET` | **RENOVACIÓN EN SECO** | — | ✔ | **FALTA** |
| `BILLING_RENEWAL_EXECUTE_SECRET` | **RENOVACIÓN REAL** | — | — | — |
| `BILLING_RENEWAL_EXECUTION_ENABLED` | **RENOVACIÓN REAL** | — | — | — |
| `BILLING_RENEWAL_EXECUTION_ALLOWLIST` | **RENOVACIÓN REAL** | — | — | — |
| `BILLING_OPERATIONS_ALERT_ENDPOINT` | **AVISOS** *(nueva)* | — | — | **FALTA** |
| `BILLING_OPERATIONS_ALERT_RECIPIENT` | **AVISOS** *(nueva)* | — | — | **FALTA** |
| `AUTOMATION_RUNNER_SECRET` | opcional · barridos de Quality | — | ✔ | **FALTA** |
| `SUPABASE_DB_URL` | solo local | ✔ | — | — |
| `MERCADOPAGO_ACCESS_TOKEN` · `_TEST_BUYER_EMAIL` | **OBSOLETAS** | — | ✔ | — |
| `NEXT_TELEMETRY_DISABLED` | opcional | ✔ | ✔ | — |
| `PRODUCTION_TENANT_CLEANUP_ENABLED` | **limpieza · PE-06D** | — | — | **a propósito ausente** |

Los nombres heredados tienen respaldo en el código —`SUPABASE_SECRET_KEY ??
SUPABASE_SERVICE_ROLE_KEY` y `PUBLISHABLE_KEY ?? ANON_KEY`—, así que Producción
funciona con los nombres nuevos. **No bloquean.**

---

## Preparación por familias

En vez de una bandera gigante y ambigua:

| | Estado | Qué falta |
|---|---|---|
| `PRODUCTION_CORE_ENV_READY` | **SÍ** | nada |
| `PRODUCTION_QUALITY_ENV_READY` | **NO** | `QUALITY_MODULE_ENABLED=true` en el corte |
| `PRODUCTION_AI_ENV_READY` | **NO** | las cuatro de Intelligence, si Quality entra con IA |
| `PRODUCTION_WOMPI_ENV_READY` | **NO · bloqueada fuera** | las cuatro credenciales, tras el Gateway |
| `PRODUCTION_RENEWAL_ENV_READY` | **NO** | el secreto de mirar; el de ejecutar, solo tras Wompi |
| `PRODUCTION_ALERTING_ENV_READY` | **NO** | punto de entrega y destinatario |

---

## Quality

```
QUALITY_MODULE_PRODUCTION_DECISION = ENABLE_AT_CUTOVER
```

- **Nombre:** `QUALITY_MODULE_ENABLED`
- **Valor en Producción:** `true`
- **Cuándo se lee:** en **ejecución**, en el servidor (`lib/modules/quality.ts`).
  No se incrusta al construir.
- **¿Hace falta reconstruir?** **No.** Basta con poner la variable y volver a
  desplegar para que el servidor la lea; no hay que rehacer el artefacto público.
- **No muta derechos de nadie:** solo hace visible el módulo. Que una empresa lo
  tenga contratado lo sigue diciendo `organization_modules`.
- **Cómo comprobarlo después:** entrar como una persona de una empresa con el
  módulo habilitado y ver que aparece en el selector; y comprobar que
  `modules.quality.is_functional` quedó en `true` tras 0112.

---

## Intelligence

Sin `QUALITY_AI_API_KEY` con más de veinte caracteres, el producto **se declara
sin IA y sigue funcionando**: las pantallas que dependen de ella lo dicen, no se
rompen. Ni el arranque ni la construcción fallan.

Decisión pendiente: si Quality entra en el corte **con** IA o **sin** ella. Las
dos son coherentes; hay que elegir una.

---

## Wompi

Bloqueada por la habilitación del Gateway, que es externa.

**No se ponen credenciales de sandbox en Producción**, ni siquiera «para probar»:
una llave de pruebas en producción es una promesa de cobro que no se puede
cumplir. Sin ellas, contratar falla cerrado y todo lo demás funciona.

---

## Mercado Pago

`MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_TEST_BUYER_EMAIL` están en Preview.
El adaptador y sus pruebas deterministas **se quedan** —son historia y
regresión—, pero el tiempo de ejecución desplegado ya no los usa: Wompi es el
proveedor. Retirarlas de Preview es limpieza de PE-06C3 o del propio corte; **no
se tocan ahora** para no alterar un entorno que se está usando para verificar.

---

## El guardián de la construcción

```
PRODUCTION_BUILD_STRATEGY = FRESH_PRODUCTION_TARGET_BUILD
```

**Nunca se promueve una construcción de Preview a Producción.** Los
`NEXT_PUBLIC_*` se incrustan al construir, y Preview y Producción son el mismo
proyecto de Vercel con dos destinos: promover una construcción de Preview
publicaría una aplicación que lee la base de Staging.

Ahora hay un guardián que lo comprueba sobre el artefacto ya construido:

```
npm run verify:build-target -- --expect=mvmpadeixomwkpxbnhky
```

Recorre `.next`, busca contra qué proyecto quedó incrustada la configuración
pública y **falla si aparece cualquier otro** —Staging, el proyecto pausado, el
stack local o uno desconocido—. Devuelve `0` si todo apunta al esperado, `1` si
no, y `2` si no se le dijo qué esperar, porque comprobar sin saber contra qué no
significa nada.

**Flujo para PE-06D:**

1. `vercel pull --environment=production`
2. `vercel build --prod`
3. `npm run verify:build-target -- --expect=mvmpadeixomwkpxbnhky`
4. solo si sale `0`: `vercel deploy --prebuilt --prod`
5. y después, comprobar desde el navegador la configuración pública servida.
