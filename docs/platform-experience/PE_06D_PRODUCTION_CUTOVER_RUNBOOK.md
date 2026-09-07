# PE-06D · Manual de corte a Producción

*Preparado en PE-06C3 el 6 de septiembre de 2026. **Nada de este manual se ha
ejecutado.** Producción sigue en 0111, con sus datos, su entorno y su despliegue
sin tocar.*

**Este documento es la fuente de verdad del corte.** Se ejecuta de arriba abajo,
una fase cada vez, anotando la evidencia. Si una condición de parada se cumple,
se para: no hay improvisación de SQL a mitad de un corte.

---

## Cómo se lee cada fase

Cada paso trae **precondición**, **qué hacer**, **qué se espera**, **cómo se
comprueba**, **cuándo se para** y **qué se hace si pasa**. Las casillas se marcan
con la hora y quién lo hizo.

Los marcadores `<…>` **no son ejecutables**: van entre comillas simples, así que
copiar y pegar un comando sin sustituirlos no hace nada — falla al conectar o al
resolver el dominio. Ningún comando usa el proyecto «actual» implícito: todos
nombran su destino. Y ningún secreto aparece escrito aquí, ni de ejemplo.

Los comandos que **sí** mutan Producción llevan aviso encima: son el `db push` de
la fase 4, la limpieza real de la 3.2 y los despliegues de la 6 y la 7.

---

## Las dos puertas que no se mezclan

| | Qué permite |
|---|---|
| **`PLATFORM_DEPLOY_ALLOWED`** | migrar y desplegar la aplicación. Contratar queda **fallando cerrado** |
| **`COMMERCIAL_PAYMENTS_ALLOWED`** | aceptar cobros reales de clientes |

**La segunda exige la primera, pero no al revés.** Se puede salir a Producción
sin cobro: es lo que el producto ya hace hoy sin credenciales de Wompi. Confundir
las dos es lo que llevaría a anunciar cobros que no se pueden procesar.

---

## FASE 0 · Las puertas externas

| | Puerta | Estado hoy | Bloquea |
|---|---|---|---|
| ☐ | `WOMPI_GTW_PRODUCTION_ENABLEMENT_REQUIRED = NO` | **YES · abierta** | pagos |
| ☐ | `TAX_LEGAL_VERIFICATION_PENDING = NO` | **YES · abierta** | pagos |
| ☐ | Decisión de producto: ¿se despliega la plataforma sin cobro? | pendiente | nada |

**Parada:** si el dueño de producto **no** autoriza desplegar sin cobro y las dos
puertas externas siguen abiertas, el corte **no empieza**.

**Si autoriza:** se ejecutan las fases 1 a 7 y 9, y se aplazan la 8 y la 10.

---

## FASE 1 · Volver a mirar Producción

**Precondición:** ninguna. Es lo primero.

```bash
# Solo lectura. Ningún INSERT, UPDATE, DELETE ni DDL.
#   Se usa el mismo camino de PE-06B/C2: token de la cuenta → llave de servicio
#   → peticiones GET al API del proyecto.
```

| | Comprobación | Esperado el 6-sep-2026 | Parada |
|---|---|---|---|
| ☐ | `organizations` | **3** | ≠ 3 → **PARAR** |
| ☐ | identificadores exactos | los tres de `~/trazaloop-release-artifacts/pe06c3/approved-disposable-tenants.json` | cualquier diferencia → **PARAR** |
| ☐ | `organization_modules` | 9 | cambio → revisar |
| ☐ | `memberships` | 4 | cambio → revisar |
| ☐ | objetos por cubo | 8 · 1 · 1 | prefijo de empresa desconocida → **PARAR** |
| ☐ | `platform_staff` | 1, activa | 0 → **PARAR** |
| ☐ | `legal_documents` | 4 | ≠ 4 → **PARAR** |
| ☐ | `audit_log` | ≥ 255 | menos → **PARAR** |

> **Si aparece una empresa que no está en la lista aprobada, el corte se para
> aquí.** La decisión de que estos datos son desechables vale para tres empresas
> concretas, no para las que hayan llegado después.

**Contención:** no hay nada que contener; todavía no se ha tocado nada.

---

## FASE 2 · La red

**Precondición:** fase 1 en verde.

| | Acción | Esperado | Parada |
|---|---|---|---|
| ☐ | Verificar que existen los cuatro artefactos de `~/trazaloop-release-artifacts/pe06c2/` | 4 ficheros + índice | falta uno → **volver a exportar** |
| ☐ | Recalcular sus SHA-256 y compararlos con `INDICE.json` | coinciden | no coinciden → **volver a exportar** |
| ☐ | **Volver a exportar** con el mismo procedimiento, para tener la foto del día | 4 artefactos nuevos, verificados | error de lectura → **PARAR** |
| ☐ | Comparar filas con Producción **ahora** | iguales | diferencia → investigar antes de seguir |

**Por qué se reexporta:** los artefactos de C2 son del 6 de septiembre. Si el
corte es otro día, la red tiene que ser de ese día.

**Contención:** sin red verificada **no se sigue**. Es barato y es lo único que
protege lo irrepetible.

---

## FASE 3 · Limpiar los inquilinos de prueba

**Precondición:** fases 1 y 2 en verde.

### 3.1 · En seco, primero

```bash
export PRODUCTION_DB_URL='<cadena de conexión de Producción>'   # no se guarda

npx tsx scripts/release/pe06/cleanup-production-tenants.ts \
  --project-ref=mvmpadeixomwkpxbnhky \
  --organizations='<los tres identificadores aprobados, separados por comas>'
```

**Esperado** (probado contra una base con la forma de Producción):

```
Empresas aprobadas  : 3 · y son las que hay
Tablas candidatas   : 65 (derivadas del esquema)
Tablas con datos    : 6 · 23 filas
Se preservan        : audit_log … · legal_documents … · platform_staff 1
Candados a bajar    : recycled_content_calculations
Cuentas de Auth     : NO se tocan
MODO SECO · no se ha borrado nada.
```

| | Parada |
|---|---|
| ☐ | «no coinciden con las aprobadas» → **PARAR**, volver a la fase 1 |
| ☐ | `platform_staff 0` → **PARAR**: limpiar dejaría a todos fuera |
| ☐ | `legal_documents 0` → **PARAR** |
| ☐ | aparece una tabla candidata que no se esperaba → **revisar antes de seguir** |

### 3.2 · De verdad

> ⚠️ **Borra datos de Producción.** Solo después de que 3.1 haya dicho, con
> estas cifras exactas, qué se va a borrar.

```bash
export PRODUCTION_DB_URL='<cadena de conexión de Producción>'
export PRODUCTION_TENANT_CLEANUP_ENABLED=true

npx tsx scripts/release/pe06/cleanup-production-tenants.ts \
  --project-ref=mvmpadeixomwkpxbnhky \
  --organizations='<los tres identificadores aprobados>' \
  --execute \
  --confirm="BORRAR INQUILINOS DE PRUEBA EN PRODUCCION"
```

**Las cinco llaves a la vez.** No hay `--yes` genérico que convierta el modo seco
en real: la frase se escribe entera, a mano.

> **La ejecución real todavía no está implementada.** Hoy la herramienta llega
> hasta aquí y se detiene diciéndolo. Implementarla es el primer trabajo de
> PE-06D, sobre lo ya ensayado, y **no** se hace dentro de este manual.

**Contención si algo sale mal a mitad:** la limpieza corre en una transacción.
Si aborta, no ha borrado nada. Si terminó y el resultado no es el esperado, **no
se sigue a la fase 4**: se restaura desde la red de la fase 2 y se replantea.

---

## FASE 4 · Migrar 0112 → 0183

**Precondición:** fase 3 verificada.

| | Comprobación previa | Esperado |
|---|---|---|
| ☐ | `organizations` | **0** |
| ☐ | `organization_modules` | 0 |
| ☐ | órdenes · lotes · evidencias · proveedores · materiales · productos | 0 |
| ☐ | `storage_upload_intents` | 0 |
| ☐ | objetos de inquilino en los cubos | 0 |
| ☐ | `legal_documents` · `platform_staff` · `audit_log` | **intactos** |

> **Ya se ejecutó una vez, el 6 de septiembre de 2026, y se paró en la 0136.**
> Aplicó `0112` → `0135` y abortó contra un dato real que ni Local ni Staging
> tienen. El relato completo está en
> [`PE_06D1_MIGRATION_0136_INCIDENT.md`](PE_06D1_MIGRATION_0136_INCIDENT.md).
> **Antes de volver a lanzarlo hay que reconciliar** las guías legadas de
> TrazaDocs con `scripts/release/pe06/reconcile-production-trazadoc-hints.ts`.

> ⚠️ **El comando de abajo es real y muta Producción.** Es el único de este
> manual que aplica DDL, y no tiene vuelta atrás. No se copia «para ver qué
> pasa»: se ejecuta cuando las casillas de arriba están todas marcadas.

```bash
# Explícito y sin dejar enlace persistente.
npx supabase db push --project-ref mvmpadeixomwkpxbnhky --include-all
rm -f supabase/.temp/linked-project.json
```

**Esperado**, medido dos veces sobre base limpia con la forma de Producción:

```
72 migraciones · 0 fallos · 15–25 s
```

*(Dos ensayos independientes sobre base limpia: 25 s y 15 s. La diferencia es
carga de la máquina, no de las migraciones.)*

| | Parada |
|---|---|
| ☐ | cualquier salida distinta de cero → **PARAR. No se despliega.** |
| ☐ | `SEC01_RLS_PREFLIGHT` → **PARAR** |
| ☐ | falta una migración esperada → **PARAR** |
| ☐ | aparece una empresa donde había cero → **PARAR** |

**Contención:** las migraciones **no tienen vuelta atrás**. Si falla a mitad, se
para, se lee el error y se decide con la red de la fase 2 delante. **Nada de SQL
a mano para «desatascar».**

---

## FASE 5 · Verificar la base migrada

| | Comprobación | Esperado |
|---|---|---|
| ☐ | cabecera de migración | **0183** |
| ☐ | relaciones de `public` | **407** = 320 tablas + 87 vistas |
| ☐ | guías de TrazaDocs de más de 4000 caracteres | **0** |
| ☐ | tablas base sin RLS | **0** |
| ☐ | 0163 creó asignaciones | **0** (no había empresas) |
| ☐ | `billing_operations_alerts` | existe |
| ☐ | esquema de Quality (`quality_processes`…) | presente |
| ☐ | esquema de facturación (`billing_subscriptions`…) | presente |
| ☐ | esquema comercial (`plan_revisions`…) | presente |
| ☐ | `legal_documents` · `platform_staff` · `audit_log` | **preservados** |
| ☐ | `modules.quality.is_functional` | **true** (lo pone 0112) |

**Parada:** cualquier casilla en rojo → **no se despliega**.

---

## FASE 6 · Construir y desplegar

**Precondición:** fase 5 en verde.

> ⚠️ **El paso 4 publica en Producción.** Los tres primeros son inofensivos.

```bash
# 1 · traer la configuración de PRODUCCIÓN, no la de Preview
npx vercel pull --environment=production --scope idendi-latam-s-projects

# 2 · construir CON DESTINO PRODUCCIÓN
npx vercel build --prod

# 3 · comprobar contra qué proyecto quedó incrustada la configuración pública
npm run verify:build-target -- --expect=mvmpadeixomwkpxbnhky

# 4 · SOLO si el paso 3 devolvió 0
npx vercel deploy --prebuilt --prod --scope idendi-latam-s-projects
```

```
PRODUCTION_BUILD_STRATEGY = FRESH_PRODUCTION_TARGET_BUILD
```

| | Parada |
|---|---|
| ☐ | el guardián devuelve **1** → **NO SE DESPLIEGA**. El artefacto apunta a otro proyecto |
| ☐ | el guardián devuelve **2** → se le olvidó decir qué se esperaba; repetir |

> **Nunca se promueve una construcción de Preview.** Preview y Producción son el
> mismo proyecto de Vercel con dos destinos, y los `NEXT_PUBLIC_*` se incrustan
> al construir: promover una construcción de Preview publicaría una aplicación
> que lee la base de Staging.

☐ **Después de desplegar**, abrir la aplicación y comprobar en el navegador que la
configuración pública servida es la de Producción.

---

## FASE 7 · Configuración comercial

### 7.1 · Quality

> ⚠️ **Cambia la configuración de Producción y despliega.**

```bash
printf 'true' | npx vercel env add QUALITY_MODULE_ENABLED production \
  --scope idendi-latam-s-projects
npx vercel deploy --prebuilt --prod --scope idendi-latam-s-projects   # recoger la variable
```

Es de **ejecución**: no exige reconstruir el artefacto, pero sí un despliegue que
la recoja. **No concede derechos a nadie**: solo hace visible el módulo.

☐ Comprobar: entrar con una persona de una empresa con el módulo habilitado y ver
Quality en el selector. *(0112 ya deja `modules.quality.is_functional = true`.)*

### 7.2 · Intelligence

```
PRODUCTION_AI_DECISION = ENABLE_AT_CUTOVER
```

Variables: `QUALITY_AI_PROVIDER`, `QUALITY_AI_API_KEY`, `QUALITY_AI_MODEL`,
`QUALITY_AI_REASONING_EFFORT`.

☐ Configurarlas en Producción · ☐ Humo seguro: **una sola** llamada de prueba con
texto sintético, **sin datos de ningún cliente**, y comprobar que consume crédito
y que el crédito se descuenta.

> **Puerta comercial:** si no hay llave de IA, `PRODUCTION_AI_ENV_READY = NO` y
> **no se anuncian planes que prometen créditos de Intelligence**. El esquema
> puede estar desplegado igual: sin llave, el producto se declara sin IA y sigue
> funcionando.

### 7.3 · El tipo de cambio

**Paso humano, no comando.** `/platform/plans → Tipo de cambio → Fijar un tipo de
cambio`.

| | |
|---|---|
| Quién | superadministración humana |
| Cuándo | después de desplegar, **antes** del primer presupuesto |
| Cuánto | **lo decide el dueño de producto en el corte.** No se escribe aquí |
| Desde cuándo | el instante del corte, no una fecha redonda |

☐ Comprobar: la pantalla dice «Vigente ahora» · ☐ una sola tasa activa · ☐ ninguna
sintética de QA · ☐ un presupuesto de prueba da el importe esperado.

**Sin tasa vigente, contratar y cambiar de plan fallan cerrado.** Renovar no la
necesita.

### 7.4 · Impuestos

Base congelada: `self_service_saas` **19 %** y `professional_advisory` **19 %**.

☐ Anotar aquí la regla fiscal aprobada, con fecha y quién la aprobó, **antes** del
humo de pago. Sin cambio explícito y prospectivo, **no se toca nada**.

---

## FASE 8 · El primer cobro real *(solo si `COMMERCIAL_PAYMENTS_ALLOWED`)*

### 8.1 · Credenciales

Solo después de que cierre la puerta del Gateway. **Nunca llaves de sandbox en
Producción**: una llave de pruebas en producción es una promesa de cobro que no
se puede cumplir.

☐ `WOMPI_PUBLIC_KEY` · ☐ `WOMPI_PRIVATE_KEY` · ☐ `WOMPI_EVENTS_SECRET` ·
☐ `WOMPI_INTEGRITY_SECRET`

### 8.2 · El webhook

URL canónica: `https://<dominio de producción>/api/billing/webhooks/wompi`

☐ Registrarla en el panel de Wompi · ☐ **sin ningún parámetro de bypass de
Vercel**: eso es de Preview · ☐ comprobar que sin firma válida responde error.

### 8.3 · El humo

☐ Crear **una empresa nueva de QA en Producción**, etiquetada como tal
(«QA-RELEASE-…»), **después** de migrar. No se usan las tres borradas.

☐ **Una sola** transacción real, la de menor importe que el proveedor admita.

Probar: contratación · tokenización directa navegador→proveedor · POST al
proveedor · **evento firmado real** · liquidación canónica · derecho concedido.

| | Parada |
|---|---|
| ☐ | el proveedor rechaza → **no se reintenta con otra referencia**. Se para y se lee |
| ☐ | el webhook no llega → **no se concede nada a mano**. Se concilia releyendo la transacción |
| ☐ | desenlace en duda → queda en duda, y **el aviso de la fase 9 tiene que llegar** |

☐ Decidir qué se hace con esa empresa de QA: **retirarla** por la operación
canónica de 0176 tras la prueba, o conservarla etiquetada. **No se mezcla con
clientes.**

---

## FASE 9 · Renovación en seco, y los avisos

### 9.1 · Solo el secreto de mirar

☐ `BILLING_RENEWAL_RUNNER_SECRET` en Producción ·
☐ **sin** `BILLING_RENEWAL_EXECUTE_SECRET` ·
☐ **sin** `BILLING_RENEWAL_EXECUTION_ENABLED` ·
☐ **sin** `BILLING_RENEWAL_EXECUTION_ALLOWLIST`

```bash
curl -s -X POST 'https://<dominio de producción>/api/billing/renewals/run' \
  -H 'x-billing-runner-secret: <secreto>' \
  -H 'Content-Type: application/json' -d '{"limit":50}'
```

☐ Esperado: `"mode":"dry_run"` y **`provider_calls: 0`**.

☐ Y sin el secreto: **404**. La puerta no confirma ni que existe.

### 9.2 · Los avisos

☐ `BILLING_OPERATIONS_ALERT_ENDPOINT` · ☐ `BILLING_OPERATIONS_ALERT_RECIPIENT`

☐ **Humo sin dinero:** provocar un aviso sintético —un intento marcado como en
duda por la operación canónica, sin ninguna llamada al proveedor—, y comprobar
que llega **uno**, que repetir el barrido **no** genera otro, y que el estado
financiero **no cambió**.

☐ Comprobar que `/platform/plans → Renovaciones` lo muestra arriba.

**Parada:** si el aviso no llega, **el planificador no se enciende**. Un cobro en
duda que nadie mira es exactamente lo que la fase 10 no puede permitirse.

---

## FASE 10 · Encender el cobro automático

**Precondiciones, todas:** fase 8 en verde · fase 9 en verde · avisos entregando.

**Orden congelado:**

1. ☐ prueba real del proveedor en Producción: **PASA**
2. ☐ avisos en Producción: **PASAN**
3. ☐ renovación en seco: **PASA**
4. ☐ configurar quien despierta al corredor
5. ☐ `BILLING_RENEWAL_EXECUTE_SECRET`
6. ☐ `BILLING_RENEWAL_EXECUTION_ENABLED=true`
7. ☐ `BILLING_RENEWAL_EXECUTION_ALLOWLIST` con **una sola** suscripción
8. ☐ primera ejecución controlada
9. ☐ comprobar `provider_calls` y el desenlace
10. ☐ abrir la lista y pasar a cadencia horaria

### Quién lo despierta

Hoy **no hay `vercel.json` y por tanto no hay cron**. Opciones, de menor a mayor
peso:

| | Qué es | A favor | En contra |
|---|---|---|---|
| **Vercel Cron** | añadir `crons` a `vercel.json` | ya está en la plataforma; sin servicio nuevo | toca configuración **compartida con Preview**: hay que comprobar que no dispara allí |
| Programador externo | un servicio que llama por HTTPS cada hora | no toca configuración compartida | un proveedor más que mantener |
| GitHub Actions | un flujo programado | ya existe la cuenta | el secreto vive en otro sitio más |

**Recomendación: Vercel Cron**, por ser lo más pequeño que ya está —y con la
comprobación explícita de que **Preview no queda con cron encendido**, porque
`vercel.json` es del proyecto, no del destino.

En cualquier caso debe: llamar **cada hora**, autenticarse con el secreto del
corredor, **no exponerlo en una URL**, y dejar rastro cuando falle.

**Contención:** ante cualquier anomalía —`provider_calls` inesperados, un
desenlace raro—, **quitar `BILLING_RENEWAL_EXECUTION_ENABLED`**. Eso devuelve la
ruta a solo mirar, en el acto.

---

## FASE 11 · Identidades y firma

☐ Verificar que `idendilatam@gmail.com` entra y sigue siendo superadministración
(su papel vive en `platform_staff`, que la limpieza no toca).

☐ Tras la limpieza no pertenecerá a ninguna empresa: **crear una por el
producto** si hace falta operar.

☐ Inventariar las cuentas de las empresas borradas y **desactivarlas, sin
borrarlas**. La atribución histórica se conserva siempre.

☐ La cuenta externa (`getconectarecicla.cl`) **se preserva**: registro nunca
completado, sin privilegio ni acceso.

☐ Seguridad final:

```bash
npm run test:sec01-guard
npm run verify:build-target -- --expect=mvmpadeixomwkpxbnhky
```

☐ 0 tablas de `public` sin RLS *(320 de 320 con RLS en el ensayo)* · ☐ aislamiento entre empresas · ☐ soporte solo
lee · ☐ sin secretos en el navegador · ☐ webhook valida firma y entorno.

☐ **Prueba humana corta**: entrar · selector de módulos · Quality visible ·
pantalla de planes · tipo de cambio · presentación de la contratación · historial
de cobros · ayuda y tutoriales.

*No se repiten a mano las comprobaciones deterministas: RLS, inmutabilidad,
conversión de centavos, techos de cupón ni permisos.*

☐ **Firma del corte**: fecha, hora, quién, y qué quedó abierto.

---

## Cuándo se puede vender de verdad

Antes de aceptar el primer pago de un cliente **real**, todas:

☐ migraciones · ☐ despliegue · ☐ impuestos aprobados · ☐ Quality e IA alineados
con lo que se anuncia · ☐ tipo de cambio vigente · ☐ puerta del Gateway cerrada ·
☐ credenciales de Wompi · ☐ humo de pago · ☐ seguridad.

**El planificador no hace falta para la primera compra** —nadie tiene todavía una
renovación que vencer—, **pero sí antes de que la primera suscripción llegue a su
obligación siguiente**. Un mes es mucho margen; olvidarlo es perder un cobro y,
peor, dejar caer a un cliente que sí pagó.

---

## Paradas y contención, de un vistazo

| Fase | Qué falla | Se para antes de | Contención |
|---|---|---|---|
| 1 | las empresas no coinciden | limpiar | replantear el corte |
| 2 | la red no verifica | limpiar | volver a exportar |
| 3 | lo global cambió | migrar | restaurar desde la red |
| 4 | una migración falla | desplegar | leer el error; sin SQL a mano |
| 5 | falta RLS o esquema | desplegar | investigar; no se despliega |
| 6 | el artefacto apunta a otro proyecto | desplegar | reconstruir con destino producción |
| 7 | no hay tipo de cambio | cobrar | fijarlo; renovar sigue |
| 8 | el proveedor falla | encender el planificador | contratar queda no disponible |
| 8 | el cobro queda en duda | cualquier segundo cobro | esperar el evento; **nunca otra referencia** |
| 9 | el aviso no llega | encender el planificador | el planificador se queda apagado |
| 10 | el planificador se comporta raro | seguir | quitar el interruptor |
| — | aparece un cliente real sin avisar | **todo** | parar y reclasificar |

---

## Registro de evidencia

*Se rellena **durante** el corte. Una fase sin fila rellenada no está hecha,
aunque «se acuerde» haberla hecho.*

| Fase | GO | Acción o comando ejecutado | Resultado | Fecha y hora | Operador | ¿Se activó una parada? |
|---|---|---|---|---|---|---|
| 0 · Puertas externas | ☐ sí ☐ no | | | | | ☐ |
| 1 · Volver a mirar Producción | ☐ sí ☐ no | | | | | ☐ |
| 2 · La red | ☐ sí ☐ no | | | | | ☐ |
| 3.1 · Limpieza en seco | ☐ sí ☐ no | | | | | ☐ |
| 3.2 · Limpieza real | ☐ sí ☐ no | | | | | ☐ |
| 4 · Migrar 0112→0183 | ☐ sí ☐ no | | | | | ☐ |
| 5 · Verificar la base | ☐ sí ☐ no | | | | | ☐ |
| 6 · Construir y desplegar | ☐ sí ☐ no | | | | | ☐ |
| 7.1 · Quality | ☐ sí ☐ no | | | | | ☐ |
| 7.2 · Intelligence | ☐ sí ☐ no | | | | | ☐ |
| 7.3 · Tipo de cambio | ☐ sí ☐ no | | | | | ☐ |
| 7.4 · Impuestos | ☐ sí ☐ no | | | | | ☐ |
| 8.1 · Credenciales de Wompi | ☐ sí ☐ no | | | | | ☐ |
| 8.2 · Webhook | ☐ sí ☐ no | | | | | ☐ |
| 8.3 · Humo de pago | ☐ sí ☐ no | | | | | ☐ |
| 9.1 · Renovación en seco | ☐ sí ☐ no | | | | | ☐ |
| 9.2 · Avisos | ☐ sí ☐ no | | | | | ☐ |
| 10 · Cobro automático | ☐ sí ☐ no | | | | | ☐ |
| 11 · Identidades y firma | ☐ sí ☐ no | | | | | ☐ |

**Firma del corte**

| | |
|---|---|
| Fecha y hora de inicio | |
| Fecha y hora de fin | |
| Operador | |
| Quién autorizó desplegar | |
| ¿Se cobró? | ☐ sí ☐ no · si no, por qué |
| Qué quedó abierto | |

---

## Lo que ya está verificado antes de empezar

*Medido el 6 de septiembre de 2026, con los códigos de salida reales.*

| Comprobación | Código | Resultado |
|---|---|---|
| `npm run test:all` | **0** | 74 suites, 0 en rojo · cuatro pases completos |
| `npm run typecheck` | **0** | limpio |
| `npm run lint` | **0** | 0 errores (75 avisos preexistentes) |
| `npm run build` | **0** | compilado en 2,5 min |
| `npm run test:sec01-guard` | **0** | 5 en verde |
| Suite de avisos, dos veces seguidas | **0** y **0** | 14 en verde cada vez |
| `verify:build-target` sin `--expect` | **2** | bloquea por no saber qué se esperaba |
| `verify:build-target` con destino equivocado | **1** | bloquea |
| `verify:build-target` con destino correcto | **0** | pasa |
| Limpieza en seco, camino feliz | **0** | 3 empresas · 65 tablas candidatas · 23 filas |
| Limpieza con la lista sin coincidir | **1** | bloquea |
| Limpieza sin el interruptor de entorno | **1** | bloquea |
| Limpieza con la frase mal escrita | **1** | bloquea |
| Limpieza sin `--project-ref` | **1** | bloquea |
| Limpieza sin cadena de conexión | **1** | bloquea |
| Limpieza con las cinco llaves | **1** | bloquea: **la ejecución real no está escrita todavía** |
| Ensayo limpieza + `0112→0183` | **0** | 23 filas en 2 vueltas · 72 migraciones · 0 fallos · 15 s |
| Esquema resultante | — | 320 tablas y 87 vistas, **el mismo conjunto exacto** que Local en 0183 · 0 sin RLS |

> **Un intermitente encontrado y cerrado por el camino.** En uno de los cuatro
> pases, PE-05B5C se puso 2 en rojo. No era el producto: la prueba leía el plan
> efectivo pasándole el reloj del anfitrión, que va unas décimas por detrás del
> de la base, y un derecho recién cerrado se leía todavía vivo. Diez suites lo
> hacían igual. Ahora el instante lo pone la base — que es de donde sale la
> verdad, y es como lo llama el producto.

---

## Lo que este manual NO hace

Ni migra, ni despliega, ni limpia, ni cobra, ni enciende nada. Y la ejecución
real de la limpieza **todavía no está escrita**: la herramienta llega hasta el
modo seco y ahí se detiene, diciéndolo. Escribirla es el primer trabajo de
PE-06D, sobre lo ya ensayado.
