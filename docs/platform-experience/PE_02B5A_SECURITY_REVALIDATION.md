# PE-02B5A · Revalidación de la base de seguridad

**Medido el 2026-08-31** contra la base local en 0158, idéntica en esquema a
Staging. Producción no se tocó.

**Método:** consultas de solo lectura al catálogo del sistema y lectura del
código de servidor. **No se reutilizaron los números de PE-02A**: se volvieron a
medir.

---

## 1 · Qué cambió desde PE-02A

| Medida | PE-02A (2026-08-30) | Hoy | Cambio |
|---|---:|---:|---|
| Tablas en `public` | 282 | **289** | +7: las cuatro de la FAQ y las tres de la ayuda |
| Tablas **sin** RLS | 7 | **7** | igual |
| Columnas `organization_id` | 321 | **321** | igual |
| `organization_id` en tabla sin RLS | 0 | **0** | igual |
| Políticas RLS | 630 | **643** | +13, todas de las tablas nuevas |
| Políticas de lectura `true` sobre datos de empresa | 0 | **0** | igual |
| Claves foráneas compuestas con empresa | 409 | **409** | igual |
| De esas, con `organization_id` en los dos lados | 409 | **409 · 100 %** | igual |
| Cubos de almacenamiento públicos | 0 de 3 | **0 de 3** | igual |
| Tablas de empresa con política de plataforma | 7 | **7** | igual |
| Políticas que alcanzan al rol anónimo | 1 | **1** | igual |

**Nada empeoró.** Las siete tablas nuevas son catálogo de plataforma —FAQ y
ayuda—, no tienen `organization_id`, y las trece políticas nuevas exigen
`is_platform_staff()` o `is_platform_superadmin()`.

Las siete tablas sin RLS siguen siendo las mismas siete de siempre: catálogos del
producto sin `organization_id`, con `anon` revocado y lectura solo con sesión.

---

## 2 · Aislamiento entre empresas · **VERIFIED**

Dos barreras independientes, las dos vueltas a medir:

1. **Control por fila.** 289 tablas, 282 con RLS. Las 7 sin ella no tienen ni una
   columna `organization_id`. **Cero** de las 321 columnas `organization_id` vive
   en una tabla sin RLS.
2. **La base rechaza apuntar a otra empresa.** 409 claves foráneas compuestas, el
   **100 %** con la forma `(organization_id, x) → (organization_id, x)`. Un
   registro no puede referenciar el de otra empresa aunque el código lo
   intentara.

Y **ninguna** política de lectura sobre datos de empresa es `true`: todas pasan
por `is_org_member`, `has_org_role` o una función de permiso más estrecha.

---

## 3 · Excepciones públicas · **VERIFIED, y son intencionales**

| Superficie | Qué expone | Quién decide |
|---|---|---|
| Pasaporte textil compartido | la vista que la empresa **publicó**, resuelta por token | la empresa |
| Encuesta de voz de cliente | el formulario de la campaña, resuelto por token | la empresa |
| Documentos legales activos | términos y privacidad | Trazaloop |
| FAQ pública publicada | contenido de plataforma, nunca de una empresa | Trazaloop |

`anon` no tiene privilegios sobre ninguna tabla del dominio. Las dos primeras
pasan por funciones de la base que resuelven el token; la cuarta, por una vista
sin datos de empresa.

**Consecuencia para la redacción:** no se puede decir «nadie fuera de tu empresa
ve nunca nada». Sería falso en cuanto la propia empresa publica un pasaporte.

---

## 4 · Personal de plataforma · **VERIFIED_WITH_QUALIFIER**

Solo **7** tablas con `organization_id` tienen política que nombre a
`is_platform_staff()` o `is_platform_superadmin()`:

```
intelligence_limit_overrides   intelligence_usage_limits
organization_subscriptions     subscription_plan_history
support_tickets   support_ticket_messages   support_ticket_status_history
```

Es decir: **límites y consumo de IA, plan y suscripción, y los tickets que la
propia empresa escribe.**

Lo que **no** puede hacer, vuelto a comprobar:

- **No hay suplantación.** `impersonat|act_as|login_as` no aparece en el código ni
  en las migraciones.
- **No puede añadirse a una empresa.** Las cuatro políticas de `memberships`
  exigen `is_org_admin(...)`; `is_platform_staff()` no aparece en ninguna.
- **Ninguna política** le da lectura sobre riesgos, procesos, documentos,
  evidencias, auditorías, personas, proveedores ni consultas de IA.
- Las vistas de plataforma **no exponen** `question` ni `answer` de Intelligence
  (0141).

**La salvedad que no se puede quitar:** Trazaloop se opera sobre infraestructura
gestionada. Quien administra el proyecto de base de datos tiene, por definición,
acceso técnico. Eso no se arregla con una política, y los respaldos contienen
todo.

---

## 5 · ¿Se audita el acceso técnico excepcional? · **NOT_VERIFIED**

`audit_log` registra **operaciones de la aplicación** —tabla, operación, actor,
diferencia— y el cliente no puede modificarlo ni borrarlo (probado en
`isolation`).

**No consta** registro de:

- accesos administrativos a la base desde la consola del proveedor;
- lecturas (el registro es de escrituras);
- restauraciones de respaldo;
- accesos de la plataforma de alojamiento.

**Por tanto no se puede escribir** «todo acceso técnico excepcional queda
auditado». Lo que sí se puede decir es que las operaciones de la aplicación
quedan registradas — y solo eso.

---

## 6 · Archivos · **VERIFIED**

Tres cubos, los tres **privados**: `evidences`, `trazadocs-documents`,
`organization-assets`. Nueve políticas; las de lectura exigen
`is_org_member(carpeta[1])`, y la carpeta **es** el `organization_id`.

La descarga se hace con **enlaces firmados con caducidad**
(`createSignedUrl` en tres capas). Que exista una ruta de archivo no lo hace
accesible.

**No se puede afirmar** cifrado en reposo, ubicación geográfica ni retención tras
el borrado desde el repositorio: es del proveedor.

---

## 7 · Cifrado · **VERIFIED_WITH_QUALIFIER / EXTERNAL**

| Afirmación | Estado |
|---|---|
| La conexión viaja cifrada (HTTPS) | **VERIFIED_WITH_QUALIFIER** — lo aporta la plataforma de despliegue |
| Cifrado en reposo | **EXTERNAL** — del proveedor de infraestructura, con atribución |
| Cifrado de extremo a extremo / conocimiento cero | **MUST_NOT_CLAIM** |
| Cifrado propietario de Trazaloop | **MUST_NOT_CLAIM** — no existe |

---

## 8 · Autenticación · **VERIFIED**, y lo que NO hay

Verificado: sesión autenticada, contraseñas gestionadas por el proveedor de
identidad con confirmación de correo, recuperación de contraseña probada, y
control por papeles dentro de cada empresa.

**No implementado, y por tanto no se menciona:** segundo factor, inicio de sesión
único, rotación obligatoria de contraseñas y detección de filtraciones.
`grep` de `mfa|multi.factor|sso|password rotation|breach` no devuelve nada.

---

## 9 · Derecho al módulo ≠ permiso · **VERIFIED**

El plan del módulo decide si la empresa **puede entrar**; el papel decide **qué
puede hacer dentro**. La resolución de acceso no lee el papel (PE-01B) y las
políticas de escritura exigen papel en cada operación.

En la FAQ se explica sin la palabra «entitlement».

---

## 10 · Trazaloop Intelligence · **VERIFIED**

Vuelto a comprobar sobre el código actual:

| Afirmación | Evidencia |
|---|---|
| El contexto lo compone el servidor | `lib/ai/context/builder.ts` |
| Se lee con la **sesión de quien pregunta** | **cero** usos del cliente administrativo en `lib/ai/context/` |
| Acotado además por `organization_id` | builder §16 |
| **El modelo no consulta la base** | no se le envían herramientas: `web_search`, `file_search`, `code_interpreter` y `retrieval` **no aparecen** en `lib/ai/` |
| No hay SQL generado por el modelo | no existe superficie donde ejecutarlo |
| Las fuentes conocen su clase de privacidad | 26 fuentes con clases `open`, `restricted`, `people`, `anonymous` |
| Se guarda con qué proveedor y modelo se produjo | `quality_ai_runs` |

Lo que se envía al proveedor: **`instructions` + `input`**, es decir el sistema y
los mensajes que el servidor compuso. No la base, ni una conexión, ni ficheros.

---

## 11 · Voz de cliente anónima · **VERIFIED**

Cuando una campaña se declara anónima, un disparador de la base **rechaza** una
respuesta que lleve cliente, contacto, nombre, correo o invitación, y exige que
se registre como anónima.

No es que la identidad se oculte: **no llega a existir**. Y las fuentes
`customer_comment` y `customer_metric` están marcadas `anonymous` con la nota
«sin identidad, nunca».

**Alcance de la afirmación:** solo el modo anónimo de campaña. Una campaña
identificada sí guarda quién respondió, y decirlo forma parte de la respuesta.

---

## 12 · `service_role` en tiempo de ejecución · **VERIFIED_WITH_QUALIFIER**

Sin cambios desde PE-02A. Se usa en seis archivos de servidor, todos
finalizadores de subida o lectura de superadministrador, donde la función de la
base **revalida** pertenencia, papel, propiedad, estado, vigencia, acceso
comercial y cuota — y el tamaño y el tipo salen del objeto físico, no de lo que
diga el cliente.

Y sigue sin aparecer en ningún camino de FAQ, ayuda contextual ni Intelligence.

---

## 13 · Resumen de estados

| # | Afirmación | Estado |
|---|---|---|
| 1 | Otra empresa no puede ver tu información privada | **VERIFIED** |
| 2 | La separación se aplica en la base, no solo en la pantalla | **VERIFIED** |
| 3 | La base impide apuntar a datos de otra empresa | **VERIFIED** |
| 4 | Lo que tu empresa publica deliberadamente sí se ve | **VERIFIED** |
| 5 | Los archivos son privados y exigen sesión de tu empresa | **VERIFIED** |
| 6 | Tu papel decide lo que puedes hacer | **VERIFIED** |
| 7 | Nadie de Trazaloop entra haciéndose pasar por ti | **VERIFIED** |
| 8 | Nadie de Trazaloop se añade a tu empresa | **VERIFIED** |
| 9 | El personal no accede al contenido en la operación normal | **VERIFIED_WITH_QUALIFIER** |
| 10 | Todo acceso técnico excepcional queda auditado | **NOT_VERIFIED** |
| 11 | La IA no usa datos de otras empresas | **VERIFIED** |
| 12 | El modelo no tiene acceso a la base | **VERIFIED** |
| 13 | Al proveedor solo va el contexto seleccionado | **VERIFIED** |
| 14 | Las respuestas anónimas no guardan identidad | **VERIFIED** |
| 15 | La conexión viaja cifrada | **VERIFIED_WITH_QUALIFIER** |
| 16 | Cifrado en reposo / residencia | **EXTERNAL** |
| 17 | El proveedor no entrena con datos de la API por defecto | **EXTERNAL_POLICY_VERIFIED** |
| 18 | Trazaloop no activó el uso para entrenamiento | **HUMAN_CONFIRMATION_REQUIRED** |
| 19 | Respaldos con calendario concreto | **NOT_VERIFIED** |
| 20 | Segundo factor, inicio único, detección de filtraciones | **MUST_NOT_CLAIM** |
| 21 | Certificaciones, auditorías externas, pruebas de intrusión | **MUST_NOT_CLAIM** |
| 22 | Cifrado de extremo a extremo, conocimiento cero, 100 % seguro | **MUST_NOT_CLAIM** |
