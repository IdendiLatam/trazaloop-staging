# PE-06C2 · La red antes del salto, y que alguien se entere

*6 de septiembre de 2026. Producción sigue en **0111**: se leyó y se exportó, no
se escribió. Ni una fila, ni una variable, ni un despliegue, ni un cobro.*

---

## Parte A · El estado global, a salvo

### Cómo se leyó

El CLI de Supabase está autenticado en esta máquina, y con el token de la cuenta
—sin la contraseña de la base— se puede pedir la llave de servicio del proyecto y
leer por su API. Todas las peticiones fueron **GET**. La llave vivió en memoria y
no se escribió en ningún fichero.

Así que **no hizo falta una credencial nueva**, y `PRODUCTION_EXPORT_CREDENTIAL_REQUIRED`
queda en **NO**: se pudo hacer con lo ya autorizado.

### Qué se guardó

Fuera del repositorio, en `~/trazaloop-release-artifacts/pe06c2/`, con permisos
`600`:

| Artefacto | Filas | SHA-256 |
|---|---|---|
| `legal_documents.json` | **4** | `39275c3bdac2cb86…` |
| `platform_staff.json` | **1** | `5711eaeb24d7eabc…` |
| `audit_log.json` | **255** | `7a4b4485b84db0f4…` |
| `auth_manifest.json` | **6** | `18091c1acc47dfb3…` |

Y un `INDICE.json` con proyecto, momento, método y huellas.

**No se exportó ni una fila de inquilino de prueba.** Los datos de las tres
empresas son desechables y se van a borrar: guardarlos «por si acaso» habría sido
copiar justo lo que sobra.

### La verificación, y lo que encontró

Un artefacto no vale porque exista. Se comprobó que cada uno es legible, que su
huella coincide, que no está vacío, que sus columnas están, que sus permisos son
`600` y que **el número de filas coincide con Producción en ese momento**.

Y al comprobar que no llevaba secretos apareció uno de verdad: dentro del
`diff` de `audit_log` viajaba el **testigo de una invitación de equipo**. Un
testigo es una llave —quien lo tenga puede entrar—, aunque haya caducado. Se
**tapó** y se volvió a exportar: lo que hace falta conservar es que hubo una
invitación, no con qué testigo.

*Detalle que costó dos vueltas y merece quedar escrito:* el primer comprobador
buscaba las palabras «token» o «secret» en el texto, y saltaba con la política de
privacidad y con mis propias notas. Un comprobador que grita por una palabra en
la prosa no protege: entrena a ignorarlo. El que sirve mira **las claves y la
forma de los valores**, y distingue una **huella** —`source_hash`, que identifica
un contenido y hay que conservar— de una **llave**.

```
VERIFICACION_EXPORT = OK
GLOBAL_STATE_LOGICAL_EXPORT_REQUIRED = NO
```

### Para qué sirve cada cosa si el corte sale mal

Esto **no es una copia de la base** y no se presenta como tal.

| | Cómo se usaría |
|---|---|
| `legal_documents` | **Se vuelve a importar.** Es lo único irrepetible: se publicó en Producción y ninguna migración lo reproduce |
| `platform_staff` | Se vuelve a crear a mano; hace falta saber **quién** era |
| `audit_log` | Copia histórica. Si hubiera que restaurar, el rastro no se pierde |
| `auth_manifest` | **Verificación**, no respaldo de cuentas: sirve para saber quién había y de qué clase, no para recrear a nadie |

---

## La cuenta externa

`getconectarecicla.cl`, sin empresa. Clasificada por evidencia, no por
suposición:

| | |
|---|---|
| Ha entrado alguna vez | **nunca** |
| Correo confirmado | **no** |
| Identidades de proveedor | **ninguna** |
| Papel de plataforma | **0** |
| Pertenencias | **0** |
| Empresas creadas | **0** |
| Aceptaciones legales | **0** |
| Lo único suyo | su fila de perfil, creada por el disparador de alta |

Es **un registro que nunca se completó**. Sin privilegio, sin acceso y sin datos.

```
EXTERNAL_ACCOUNT_CUTOVER_POLICY = PRESERVE_UNTIL_IDENTIFIED
EXTERNAL_ACCOUNT_DECISION_PENDING = NO_BLOCKING_PRESERVE
```

No bloquea el corte y **no se toca**. Una persona no se borra porque no sepamos
para qué se registró.

*(Hay una segunda cuenta sin empresa, de gmail, que sí ha entrado. Misma
política.)*

---

## Parte B · Que alguien se entere

### El hueco

El dominio ya sabe callarse cuando no sabe: `provider_unknown` no concede nada y
nadie vuelve a cobrar solo. Lo que faltaba es que ese silencio **llegue a una
persona**.

### Dónde vive la verdad, y por qué no se creó otra

La incertidumbre ya está escrita en `billing_checkout_intents`: su
`failure_class` (0177) y la marca de las subidas (0181). El barrido **lee eso**;
no hay una segunda tabla de verdad financiera.

Y hubo que leer los intentos **directamente**, no la vista de renovaciones: esa
vista une el intento **por periodo**, y una subida de plan no tiene periodo. Si el
barrido mirara solo ahí, **un cobro de subida en duda no avisaría a nadie**. Está
probado en C2.

### Por qué no `work_alerts`

Quality ya tiene una tabla de avisos, pero es **de inquilino**: exige empresa y
persona destinataria, y sirve para avisar al equipo de un cliente. Un cobro en
duda no es asunto del cliente: es de quien opera la plataforma. Reutilizarla
habría convertido la automatización de Quality en autoridad de facturación.

### El canal

El producto **no tiene infraestructura de correo propia** —solo la que Supabase
usa para invitar y recuperar contraseña—. Montar un proveedor de correo entero
habría añadido una dependencia, una credencial y un bloqueo nuevo justo cuando se
trata de cerrar uno.

Así que se entrega por **HTTPS a un punto configurado por quien opera**:

- `BILLING_OPERATIONS_ALERT_ENDPOINT` — adónde se manda
- `BILLING_OPERATIONS_ALERT_RECIPIENT` — a quién va dirigido, dentro del mensaje

Un solo canal, sin SDK de nadie, y **probado de punta a punta** contra un
receptor real. Sin punto configurado el aviso **queda guardado y visible en la
consola**: lo que falta es avisar, no saber.

### Lo que sale por el cable

Identificadores, clases y momentos. Nada de tarjeta, ninguna llave, ningún sobre
firmado, y **ningún campo de acción**: el aviso lleva una **ruta de consulta**
(`/platform/plans`), no un botón de cobrar.

### Una vez, y solo una

`dedupe_key = intent:<id>:<clase>`, con índice único. Repetir el barrido no llena
el buzón; un hecho nuevo —o el mismo intento con otra clase— sí genera un aviso
nuevo.

### Y no toca dinero

Si la entrega falla, se anota el intento y el error, y **la suscripción, el
periodo y el cobro se quedan donde estaban**. Probado en las **dos** formas de
fallar: el punto que contesta mal, y el que no contesta.

### En la consola

`/platform/plans → Renovaciones` abre con lo que hace falta mirar: cuántos cobros
esperan a una persona, qué pasó en cada uno y si se pudo avisar. Sin botón de
reintentar: eso no se implementa aquí.

```
PROVIDER_UNKNOWN_ALERTING_MISSING = NO
```

### Las pruebas

`npm run test:pe06c2-alerts` · **14 comprobaciones**: la duda no concede nada;
levanta un aviso y solo uno; repetir no duplica; con canal sale y se marca; el
mensaje no lleva nada que no se pueda enseñar; sin canal queda pendiente; si la
entrega falla —de las dos maneras— el dinero no se mueve; un hecho nuevo sí
avisa; el descuadre de integridad también; una subida en duda también; un rechazo
normal **no** avisa; plataforma los ve y una empresa no; y el aviso apunta a
consultar, no a cobrar.

**Vistas fallar**, con tres mutaciones: quitar la unicidad del deduplicado (A3
cae), y hacer que la entrega fallida degrade la suscripción en cada una de las
dos ramas (B4 y B4b caen). *La primera vez la mutación no se vio porque la puse
en la rama que la prueba no recorría —y eso destapó que faltaba cubrir el caso
del punto que no responde, que ahora está.*

---

## Parte C · Producción, preparada hasta donde se puede

En [`PE_06_PRODUCTION_ENV_MATRIX.md`](PE_06_PRODUCTION_ENV_MATRIX.md), con la
regla que lo ordena todo: **lo que falta falla cerrado, no roto**, así que se
puede desplegar antes de tener credenciales de pago.

Y un guardián nuevo, `npm run verify:build-target`, que abre el artefacto ya
construido y **falla si la configuración pública apunta a otro proyecto**.
Comprobado: contra Producción con un artefacto local sale `1`; contra el propio
local, `0`; sin decirle qué esperar, `2`.

---

## Parte D · La herramienta de limpieza, inerte

`scripts/release/pe06/cleanup-production-tenants.ts`.

**La puerta de Staging no se debilitó.** Quitarle el candado a
`cleanup-staging.ts` para reutilizarla habría convertido la única barrera que
impide un accidente en una comodidad. Esta es una puerta aparte.

Exige, todas a la vez: `--execute`, `--project-ref`, `--organizations` con los
identificadores aprobados, `--confirm` con la frase escrita a mano,
`PRODUCTION_TENANT_CLEANUP_ENABLED=true`, y que la base tenga **exactamente**
esas empresas y ninguna más.

Probado contra una base real, una puerta cada vez:

| Lo que se dio | Resultado |
|---|---|
| nada | `falta --project-ref` |
| solo la referencia | `falta --organizations` |
| ejecutar sin interruptor | `PRODUCTION_TENANT_CLEANUP_ENABLED no está en «true»` |
| con interruptor, sin frase | `la confirmación no coincide` |
| todo, pero las empresas no cuadran | `la base tiene 15 empresa(s) y no coinciden con la 1 aprobada` |

Ese último es el que más importa: es el que impide borrar cuando ha aparecido
alguien que no estaba.

**Nunca toca** `audit_log`, `legal_documents`, `platform_staff` ni los catálogos.
**Ni las cuentas de Auth**: una persona no se borra porque su empresa de prueba
desaparezca.

Y la ejecución real **no está implementada**: es trabajo de PE-06D, después de
volver a mirar la base.

```
PRODUCTION_CLEANUP_EXECUTED = NO
```

---

## Migración

**0183**, append-only: la tabla de avisos, cómo levantarlos sin duplicar, el
barrido que lee la verdad que ya existe, la anotación de la entrega y la vista de
plataforma.

Local **0183** · Staging **0183** · **Producción 0111**.
