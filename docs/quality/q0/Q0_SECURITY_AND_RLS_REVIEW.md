# Q0_SECURITY_AND_RLS_REVIEW

**Sprint:** Q0 — Technical Discovery & Schema Mapping
**Fecha:** 2026-08-18
**Alcance:** revisión de seguridad DOCUMENTAL. Q0 **no corrige nada**.
**Severidades:** CRÍTICO · ALTO · MEDIO · BAJO · INFORMATIVO

> **Ninguno de los hallazgos de este documento ha sido corregido.** Q0 es discovery. Las
> correcciones requieren decisión humana y su propio sprint con pruebas y plan de rollback.

---

## 1. Veredicto general

La postura de seguridad de este repositorio es **notablemente sólida** y por encima de lo
habitual en un SaaS de este tamaño. La revisión no encontró ningún bypass de RLS, ninguna
autorización que dependa solo de la UI, ningún uso de `service_role` desde el navegador, ni
ninguna vía de acceso cross-tenant.

Los hallazgos son de **consistencia, robustez y deuda de diseño**, no de vulnerabilidad
explotable. Se documentan igualmente porque Quality multiplicará la superficie y conviene
resolverlos antes, no después.

---

## 2. A · Multi-tenancy — resolución exacta

### 2.1 Cadena de resolución de `organization_id`

```text
cookie tz-active-org (firmada HMAC-SHA256)
        │
        ▼
readActiveOrgCookie()      lib/auth/active-organization.ts
   valida formato UUID + firma; sin secret → degrada a UUID plano con warning
        │
        ▼
getActiveOrganization()    lib/db/organizations.ts
   consulta memberships BAJO RLS y exige que la cookie coincida
   con una membresía ACTIVA real. Sin coincidencia → null.
   Con una sola organización → selección implícita.
        │
        ▼
requireActiveOrg()         lib/auth/require-active-org.ts
   sin organización → redirect('/select-org')
        │
        ▼
server action / lib/db     el organization_id sale SIEMPRE de aquí
```

**La cookie no es una barrera de seguridad y el código lo dice explícitamente.** La barrera es
RLS más la revalidación contra `memberships` en cada carga. La firma HMAC solo reduce
manipulación accidental.

**Verificado:** `organization_id` **nunca** llega desde el cliente en ninguna mutación. Se
comprobó en `server/actions/*` y en las RPC `security definer`, que además revalidan
`is_org_member()` por su cuenta.

### 2.2 Tablas reales

| Concepto | Tabla real |
|---|---|
| Tenant | `public.organizations` |
| Perfil | `public.profiles` (1:1 con `auth.users`, creado por trigger `handle_new_user`) |
| Membresía | `public.memberships` (`organization_id`, `user_id`, `role_code`, `status`) |
| Roles de empresa | `public.roles` — `admin`, `quality`, `consultant` |
| Módulos por empresa | `public.organization_modules` |
| Personal de plataforma | `public.platform_staff` — `superadmin`, `support` |

`memberships` tiene `unique (organization_id, user_id)`: **un usuario tiene como máximo un rol
por organización**. El consultor multiempresa se modela con varias filas.

### 2.3 Superadministrador

Decisión de arquitectura correcta y explícita (0040): el personal de Trazaloop **no** es un rol
dentro de `memberships`. Es una capa separada sin relación con ninguna organización, para no
filtrar el concepto de plataforma a cada política de empresa.

El **bootstrap del primer superadministrador es deliberadamente imposible desde la aplicación**:
`is_platform_superadmin()` es falso mientras la tabla esté vacía, así que la política de `INSERT`
nunca se cumple para el primer registro. Se crea solo por SQL con privilegios de servidor. Es una
decisión de seguridad, no una carencia.

### 2.4 Defensa en profundidad contra relaciones cruzadas

Tres capas independientes:

1. **RLS** en las 87 tablas.
2. **FK compuesta** `(organization_id, parent_id) → padre(organization_id, id)`, sostenida por
   `unique (organization_id, id)` en cada padre. Una fila hija **no puede** apuntar a un padre de
   otra empresa: lo impide el motor, no la aplicación.
3. **Trigger** `prevent_organization_id_change()`: una fila no puede migrar de empresa.

Esta combinación satisface MDR-42 antes de que Quality exista.

### 2.5 Riesgos cross-tenant identificados

**Ninguno explotable.** Se buscaron específicamente: políticas que omitan `organization_id`,
`USING (true)` en tablas tenant-owned, vistas sin `security_invoker`, FK simples entre tablas
tenant-owned, y lecturas con cliente admin sin filtro de organización. Los resultados están en
§5.

---

## 3. B · Planes y entitlements — lógica real reconstruida

### 3.1 El modelo tiene DOS ejes que no deben confundirse

```text
EJE COMERCIAL (por módulo)         EJE ADMINISTRATIVO (por cuenta)
organization_modules               organization_subscriptions
  .enabled                           .status ∈ active|suspended|cancelled
  .access_mode ∈ demo|full|extra     .plan_code  ← LEGACY
  .access_expires_at
```

- **`organization_modules` es la autoridad comercial** desde T9F (0100).
- **`organization_subscriptions` quedó como legado**: aporta el *estado administrativo de la
  cuenta* y el *uso agregado*, pero ya **no** decide límites.

### 3.2 Demo / Full / Extra

| Estado | Semántica real |
|---|---|
| **Demo** | `access_mode='demo'`. Temporal si `access_expires_at` tiene fecha; permanente si es `NULL`. Límites reducidos: 1 proveedor, 5 materiales, 1 producto, 1 evidencia, 2 documentos, 50 MB; roles/importaciones/recomendaciones **apagados** (`limit_value = 0`). |
| **Full** | Recursos contables **ilimitados**; roles, importaciones y recomendaciones activados; 500 MB. |
| **Extra** | **Idéntico a Full** en función; única diferencia 5 GB de almacenamiento. Verificado en el seed de `plan_limits` (0050): las 13 filas de `extra` son iguales a las de `full` salvo `storage_bytes`. |

Cumple PDM-07 y §19.3 del baseline: *Full y Extra no tienen diferencias funcionales arbitrarias.*

### 3.3 Prueba Demo de 48 horas

`provision_new_organization_modules()` asigna a toda empresa nueva los módulos **funcionales** en
`demo` con `access_expires_at = now() + 48h`, más `core` como infraestructura permanente. Es
idempotente (`on conflict do nothing`): un reintento de registro **no reinicia el vencimiento**.

El vencimiento se deriva **por fecha con la hora del servidor, sin cron**
(`resolve_organization_module_access`). No hay proceso programado que pueda fallar o retrasarse.
Es un diseño acertado.

### 3.4 `effective_plan`

`organization_effective_plan_code(uuid)` (0103) devuelve el **mejor modo vigente**
(`extra > full > demo`) entre los módulos funcionales habilitados, descartando Demo vencido, con
piso `demo`. Si la empresa no tiene ninguna fila de módulo funcional, cae al plan legado.

Nació para corregir un bug real y bien documentado: el superadministrador subía módulos a
Full/Extra pero el subsistema de equipo seguía leyendo `organization_subscriptions`, que seguía
en `demo`, y las invitaciones quedaban bloqueadas sin que ningún refresco lo arreglara —el estado
obsoleto vivía en la base.

### 3.5 Dos capas de enforcement coexistentes

| Capa | Archivo | Ámbito | Autoridad |
|---|---|---|---|
| **Por módulo** | `server/actions/module-plans.ts` | CPR y Textiles | `organization_modules` + uso por módulo |
| **Org-wide (legacy)** | `server/actions/plans.ts` | equipo, logo, lecturas | plan **efectivo** + uso agregado |

La separación está **vigilada por una prueba estática**
(`tests/unit/t9f1-module-operational-enforcement.test.ts`) que impide que una action de
CPR/Textiles use los helpers org-wide sin `moduleCode`. Es un control de arquitectura ejecutable,
no una convención escrita.

### 3.6 Inconsistencias detectadas (NO corregidas)

**B-1 · La UI de uso muestra los límites del plan LEGADO — MEDIO**
`getOrganizationUsageAction()` (`server/actions/plans.ts:193-198`) resuelve los límites con
`usage.planCode`, que viene de `v_organization_plan_usage` → `organization_subscriptions`. El
enforcement usa el plan **efectivo**. Una empresa con módulos en Full y suscripción legada en
Demo **ve** límites Demo en la pantalla de uso mientras el servidor le permite operar como Full.
No es un fallo de seguridad —el servidor manda— pero es exactamente el tipo de discrepancia que
originó el bug de PCR-01.

**B-2 · Fail-open en los chequeos de plan — MEDIO**
`checkResourceLimit`, `checkFeatureEnabled`, `checkStorageAvailable` y
`checkOrganizationCanMutate` devuelven `{ allowed: true }` cuando `getOrganizationUsage()`
retorna `null` ("sin datos de uso: no bloquear por un fallo de lectura").
Es una decisión deliberada y **el baseline la respalda parcialmente** —el plan es *entitlement*,
no autorización (§19.2, DA-33/PDM-08)— pero contrasta con el principio *Fail Closed* del Maestro
§3.6. El riesgo real es de facturación/cuota, no de acceso a datos. Nótese además que
`getOrganizationEffectivePlanCode` **sí** es fail-closed (devuelve `'demo'` ante error): las dos
políticas conviven en el mismo flujo.

**B-3 · Dos fuentes de verdad comerciales conviviendo — MEDIO (deuda)**
`organization_subscriptions` sigue existiendo con `plan_code`, y el superadministrador todavía
puede cambiarlo vía `change_organization_plan`. Ese valor ya **no** gobierna nada operativo salvo
`status`. Mantener una columna que parece autoritativa y no lo es es la clase de trampa que
Quality debe evitar heredar. → Decisión requerida **DR-04**.

---

## 4. E · Infraestructura de evidencias

### 4.1 Dos sistemas paralelos

| | CPR | Textiles |
|---|---|---|
| Tabla | `evidences` | `textile_evidences` |
| Enlaces | `evidence_links` | `textile_evidence_links` |
| Tipo de destino | **enum** `evidence_target_type` (10 valores) | **text + CHECK** (11 valores) |
| Tipo de vínculo | `link_role text` libre | `link_type` con CHECK (12 valores) |
| Estados | `evidence_status` (pending/valid/rejected/expired) | text CHECK (pending_review/accepted/rejected/expired/archived) |
| Vigencia | `valid_until` | `valid_from` + `valid_until` |
| Revisión | — | `reviewed_by`, `reviewed_at`, `review_notes` |
| Metadatos de archivo | `storage_path` | `file_path`, `file_name`, `file_mime_type`, `file_size_bytes` |
| Emisor | — | `issuer`, `reference_code` |
| Bucket | `evidences/{org}/…` | `evidences/{org}/textiles/…` |

**El modelo textil es estrictamente más maduro**: vigencia con inicio y fin, flujo de revisión con
actor y fecha, emisor, y metadatos físicos del archivo.

Ambos aplican correctamente la FK compuesta por organización.

### 4.2 Ciclo de subida (el patrón bueno)

```text
1. begin      → crea storage_upload_intents (reserva durable, valida rol, plan, cuota)
2. upload     → el cliente sube con URL firmada; la política de Storage exige intent EXACTO
3. verify     → el SERVIDOR lee el objeto físico: tamaño y MIME reales, firma binaria
4. finalize   → RPC server-only con los valores físicos; revalida rol, acceso y cuota ACTUAL
5. fallo      → registerAndRemoveUnreferencedObject: el objeto queda contabilizado o eliminado
                de forma confirmada, jamás invisible
```

El tamaño y el tipo **nunca** provienen del navegador. La finalización está revocada a
`authenticated` y solo la invoca el cliente admin tras verificar el objeto real.

### 4.3 Descarga

URLs firmadas de vida corta sobre buckets privados. No existe ningún bucket público.
Excepción controlada: `textile_technical_passport_share_links` implementa compartición por token
para pasaportes técnicos — es una decisión de producto explícita con su propia tabla y digest.

---

## 5. F · Hallazgos de seguridad

### F-1 · Políticas de Storage con cast directo a `uuid` — **BAJO**

`trazadocs_documents_select` (0058) y las cuatro políticas de `organization-assets` (0049) usan
`((storage.foldername(name))[1])::uuid` en lugar de `public.safe_uuid(...)`.

`safe_uuid()` se creó precisamente en 0016 para esto: *"El cast directo lanza error con rutas cuyo
primer segmento no es un UUID. safe_uuid devuelve NULL y las políticas NIEGAN sin romper."*

**Impacto real: bajo.** El fallo es un **error SQL**, no una concesión de acceso: la dirección es
segura. Además, las políticas de escritura de esos buckets impiden crear objetos con prefijo
inválido. Es una **inconsistencia de helpers**, no un bypass.

Nótese que las políticas de TrazaDocs `insert`/`update`/`delete` de 0058 **ya fueron sustituidas**
en 0101 por versiones ligadas a intent que sí usan `safe_uuid`. Quedó fuera únicamente el
`select`.

**No corregido.**

### F-2 · `audit_log` mezcla auditoría técnica e historial de negocio — **MEDIO (arquitectura)**

Una sola tabla sirve a dos propósitos que el baseline exige separar (MDR-35, §31). Hoy es
manejable; con Quality —que añade eventos de dominio, reglas y alertas— dejaría de serlo.
Ver `Q0_QUALITY_SCHEMA_MAPPING.md` §7.

### F-3 · Eventos de plataforma invisibles para toda empresa — **INFORMATIVO**

`log_event(null, 'platform_staff_added', …)` escribe con `organization_id = NULL`, y la política
de `audit_log` exige `organization_id is not null`. Correcto por diseño (un cliente no debe ver
eventos de plataforma), pero significa que **no existe hoy ninguna vista de auditoría de
plataforma**: esos eventos solo son consultables con privilegios de servidor.

### F-4 · Cookie de organización activa sin firma si falta el secreto — **BAJO**

Sin `ACTIVE_ORG_COOKIE_SECRET`, `readActiveOrgCookie()` degrada a UUID plano con un `console.warn`.
Documentado como aceptable solo en desarrollo. **No es una vulnerabilidad**: la barrera real es la
revalidación contra `memberships` bajo RLS, así que una cookie falsificada solo puede nombrar una
organización donde el usuario ya tenga membresía activa. Conviene confirmar que la variable está
configurada en producción. → **DR-02**.

### F-5 · Fail-open en entitlements — **MEDIO**

Ver B-2. Se repite aquí por visibilidad.

### F-6 · Uso de `service_role` — **INFORMATIVO (correcto)**

Seis módulos usan `createAdminClient()`. Se revisaron **todos** los puntos de llamada:

| Módulo | Uso | Valoración |
|---|---|---|
| `lib/auth/public-registration.ts` | Lectura de `team_invitations` por token, en contexto sin sesión | Correcto: solo lectura, acotado por token + correo, fail-closed |
| `lib/db/storage-intents.ts` | Finalización server-only; lectura de intent propio | Correcto: filtra por `id` + `created_by` + `organization_id` |
| `lib/db/trazadocs-master.ts` | Finalización y reemplazo de archivo | Correcto: delega a RPC que revalida todo |
| `lib/db/textiles-evidences.ts` | Finalización de evidencia textil | Correcto: ídem |
| `lib/db/storage-deletion.ts` | Retiro físico y resolución contable | Correcto: rutas validadas por RPC `security definer` |
| `lib/db/module-access.ts` | Lectura de módulos de cualquier empresa para el superadministrador | Correcto: el llamador ya pasó `requirePlatformStaff()` |

**Patrón consistente y bien razonado:** cuando se usa `service_role`, la autorización **no** se
omite — se traslada a una función `security definer` que revalida membresía, rol, propiedad,
acceso comercial y cuota, y el actor viaja explícito porque bajo `service_role` `auth.uid()` es
`NULL`. Nueve pruebas distintas vigilan que las actions no usen el cliente admin.

**Ninguna clave de servicio se expone al navegador.** `lib/supabase/browser.ts` no la recibe y
`admin.ts` es `server-only`.

### F-7 · Autorización solo en UI — **NO ENCONTRADO**

Se buscó específicamente. Todas las rutas protegidas usan guards de servidor
(`requireSession` → `requireActiveOrg` → `require<Módulo>Module`), las actions revalidan, y la
RLS respalda por debajo. Los guards de módulo se aplican en `layout.tsx`, de modo que **toda**
ruta bajo el segmento queda protegida por defecto.

### F-8 · `getUser()` en lugar de `getSession()` — **INFORMATIVO (correcto)**

`requireSession()` usa `supabase.auth.getUser()`, que **verifica el JWT contra Supabase Auth** en
lugar de confiar en la cookie local. Es la opción correcta y está comentada como tal.

---

## 6. Resumen de hallazgos

| ID | Hallazgo | Severidad | Corregido |
|---|---|---|---|
| F-1 | Políticas de Storage sin `safe_uuid` (2 buckets) | BAJO | No |
| F-2 | `audit_log` mezcla auditoría técnica e historial de negocio | MEDIO | No |
| F-3 | Eventos de plataforma sin vista de consulta | INFORMATIVO | No |
| F-4 | Cookie sin firma si falta el secreto | BAJO | No |
| F-5 / B-2 | Fail-open en chequeos de plan | MEDIO | No |
| B-1 | UI de uso muestra límites del plan legado | MEDIO | No |
| B-3 | Dos fuentes de verdad comerciales conviviendo | MEDIO (deuda) | No |
| F-6 | Uso de `service_role` | INFORMATIVO — correcto | n/a |
| F-7 | Autorización solo en UI | **no encontrado** | n/a |
| F-8 | Verificación de JWT con `getUser()` | INFORMATIVO — correcto | n/a |

**Sin hallazgos CRÍTICOS ni ALTOS.**

---

## 7. Invariantes que Quality debe preservar

1. `organization_id` explícito y **nunca** proveniente del cliente.
2. RLS deny-by-default en **toda** tabla nueva, sin excepción.
3. FK compuesta `(organization_id, parent_id)` en **toda** relación hijo-padre.
4. `prevent_organization_id_change()` y `force_created_by()` en toda tabla nueva aplicable.
5. `service_role` solo para operaciones físicas, siempre delegando la autorización a una RPC
   `security definer` que revalida, con actor explícito.
6. Vistas con `security_invoker = true`.
7. Escritura en Storage **solo** ligada a intent durable verificado.
8. Autorización = rol + capacidad + alcance; el plan comercial **nunca** sustituye al permiso.
9. Historial append-only con `forbid_mutation()` donde corresponda.
10. Pruebas de aislamiento multiempresa por cada entidad sensible nueva: *A ve A, A no ve B, A no
    edita B*.

---

# Remote verification addendum

**Añadido:** 2026-08-18 (Sprint Q0.1)
**Fuente:** volcado de esquema de `trazaloop-production` (`mvmpadeixomwkpxbnhky`), solo lectura.
**Nada de lo escrito arriba se ha reescrito.** Esta sección confirma, acota y añade; el texto
original se conserva tal como se redactó con evidencia únicamente local.
**Ningún hallazgo ha sido corregido**, tampoco los ahora confirmados en producción.

## Confirmado en producción

| Elemento | Resultado |
|---|---|
| RLS deny-by-default en **87/87** tablas | **Confirmado.** No es solo una declaración de las migraciones: está activa en el esquema desplegado. |
| `storage.objects` con RLS activa | **Confirmado** |
| Ausencia de objetos remotos sin explicación en migraciones | **Confirmado** — cero en tablas, vistas, funciones, triggers y políticas |
| `organization_modules` sin escritura para `authenticated` | **Confirmado**: una única política, de `SELECT` |
| Ninguna política de `DELETE`/`UPDATE` en `evidences` ni `trazadocs-documents` | **Confirmado**: eliminación física reservada al flujo server-only |
| Dos sistemas de evidencia paralelos (§4.1) | **Confirmado**: las cuatro tablas existen con RLS |

## F-1 — confirmado y acotado con precisión

El hallazgo se mantiene y ahora está delimitado exactamente. En producción, **5 políticas** usan
el cast directo `((storage.foldername(name))[1])::uuid` en lugar de `public.safe_uuid(...)`:

| Política | Operación | Bucket |
|---|---|---|
| `trazadocs_documents_select` | SELECT | `trazadocs-documents` |
| `organization_assets_select` | SELECT | `organization-assets` |
| `organization_assets_insert` | INSERT | `organization-assets` |
| `organization_assets_update` | UPDATE | `organization-assets` |
| `organization_assets_delete` | DELETE | `organization-assets` |

Las restantes están correctas: `evidences_select` usa `safe_uuid` explícitamente, y
`evidences_insert_cpr` y `trazadocs_documents_insert_intent` delegan en
`storage_object_matches_upload_intent()`, que internamente sí usa `safe_uuid`.

La valoración **no cambia: severidad BAJO.** El cast produce un error SQL, no una concesión de
acceso; la dirección sigue siendo segura. **No corregido.**

## Precisión sobre §1 y §5

El recuento de "291 políticas" citado en el cuerpo del documento era el bruto de sentencias en las
migraciones. El estado **final desplegado** es **253 políticas en `public` + 9 en
`storage.objects`**. No altera ninguna conclusión de seguridad.

## Nueva confirmación positiva

**`storage_upload_intents` tiene RLS activa y CERO políticas** en producción: denegación total por
defecto. Ningún cliente puede leer ni escribir la tabla de reservas de subida; el acceso es
exclusivamente por RPC server-only. Refuerza la valoración de §4.2 sobre el ciclo de subida y
establece el patrón que Quality debe replicar en sus propias tablas de reserva.

## Hallazgo nuevo de Q0.1 — configuración de entorno

**S-1 · El entorno Development apunta a un proyecto Supabase inexistente — MEDIO (operativo)**

`.env.local`, generado por `vercel env pull`, apunta a `dtrxxqmdweykzncfmahc`, que **no tiene
ningún registro DNS** (ni de API ni de base) y por tanto ya no existe. El repositorio está
vinculado a `mvmpadeixomwkpxbnhky` (`trazaloop-production`).

No es una vulnerabilidad ni afecta al esquema desplegado: es configuración de entorno obsoleta.
Impide el desarrollo local contra base y obliga a revisar también qué contiene Production.
**No corregido.** → **DR-13**.

## DR-02 — resuelto parcialmente

| Entorno | Resultado |
|---|---|
| Vercel Development | **EXISTS** (`ACTIVE_ORG_COOKIE_SECRET` presente y no vacía en el archivo descargado; valor nunca leído ni impreso) |
| Vercel Production | **NOT DETERMINABLE** — el CLI de Vercel no está instalado y no se instaló |

El hallazgo **F-4** se mantiene abierto para Production.

Detalle completo en `Q0_1_REMOTE_VERIFICATION.md`.
