# Trazaloop — Sprint 1 · Fundaciones

SaaS multiempresa para trazabilidad y cálculo de contenido reciclado (NTC 6632 / UNE-EN 15343).
Este repositorio contiene **solo las fundaciones técnicas** (Sprint 1): auth, multiempresa, roles, RLS deny-by-default, bitácora append-only, Storage aislado y shell de aplicación.

**Stack:** Next.js (App Router) · TypeScript · Supabase (PostgreSQL 15+, Auth, Storage) · RLS · Vercel-ready.

## Configurar `.env.local`

```bash
cp .env.example .env.local
```

Completa con los valores de tu proyecto Supabase (local o remoto):

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto (pública) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (pública; siempre sujeta a RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor.** Jamás en el navegador |
| `NEXT_PUBLIC_SITE_URL` | Base para enlaces de correo (reset) |
| `SUPABASE_DB_URL` | Opcional; habilita 2 verificaciones extra de la suite RLS |

Con Supabase local, `supabase start` imprime URL, anon key y service key; la DB local queda en `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

## Correr migraciones

Las migraciones viven en `supabase/migrations` y son la **fuente de verdad del esquema** (orden: `0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0015` → `0016`).

```bash
# primera vez en el repo
supabase init            # si aún no existe supabase/config.toml (conserva /migrations)
supabase start           # levanta Postgres+Auth+Storage locales (requiere Docker)
supabase db reset        # aplica TODAS las migraciones desde cero
```

Contra un proyecto remoto: `supabase link --project-ref <ref>` y `supabase db push`.

> Nota Storage: `0015_storage.sql` crea el bucket privado `evidences` y sus políticas por ruta (`evidences/{organization_id}/...`). Si tu proyecto restringe crear políticas sobre `storage.objects` por SQL, crea esas mismas políticas desde el Dashboard con idéntico contenido (están en la migración).

## Correr la app

```bash
npm install
npm run dev        # http://localhost:3000
```

Flujo: registrarse → (confirmar correo si aplica) → iniciar sesión → crear empresa (RPC `create_organization`) → dashboard con empresa activa, rol y módulos. Con varias empresas (consultor), `/select-org` permite cambiar; la empresa activa se guarda en cookie **y se revalida en servidor** contra `memberships` en cada carga.

## Correr pruebas (aislamiento RLS)

Con Supabase local levantado y migraciones aplicadas:

```bash
npm run test:rls
```

La suite crea usuarios y organizaciones de prueba y verifica las 10 comprobaciones del sprint (aislamiento de lectura/escritura entre empresas, gestión de memberships por rol, `audit_log` append-only, RPC de onboarding y barrido de RLS activo). Las verificaciones 8b y 10 requieren `SUPABASE_DB_URL`; sin él, se omiten y puedes correr `tests/rls/check-rls-enabled.sql` con `psql` (debe devolver **0 filas**).

También: `npm run typecheck` y `npm run build`.

## Qué quedó implementado en el Sprint 1

- **Migraciones `0001–0006` y `0015`**: extensiones, enums núcleo (sin `document_status`), helpers (`set_updated_at`, `answer_weight`), tenencia (`profiles`, `organizations`, `roles`, `memberships`, `modules`, `organization_modules`, `sites` con `unique(organization_id, id)` para FK compuestas futuras), trigger `handle_new_user`, helpers de seguridad `SECURITY DEFINER` (`is_org_member`, `has_org_role`, `is_org_admin`, `shares_org_with`), bitácora append-only (`audit_log` + `audit_row_change` + `log_event` + `forbid_mutation`), RLS deny-by-default con políticas por tabla (memberships sin recursión), RPC `create_organization` (org + membership admin + módulos base, atómico y auditado) y bucket privado `evidences` con políticas por ruta.
- **Clientes Supabase**: `browser` (anon), `server` (sesión por cookies), `admin` (`service_role`, protegido con `server-only`; casi sin uso en este sprint).
- **Server Actions**: login, registro, reset, logout, crear organización (vía RPC), seleccionar empresa activa (validada en servidor), listar organizaciones y rol.
- **UI**: `/login`, `/register`, `/forgot-password`, `/select-org`, shell autenticado con navegación placeholder y **empresa activa muy visible**, `/dashboard` ("Trazaloop — núcleo activo" con empresa, rol y módulos).
- **Middleware** de refresco de sesión.
- **Suite de pruebas RLS** (`tests/rls`).

## Sprint 1.1 · Endurecimiento aplicado

Migración incremental **`0016_security_hardening.sql`** (no reescribe el historial). **Orden importante:** `0015_storage.sql` crea el bucket `evidences` y sus **políticas base**; `0016` corre después y **reemplaza** esas políticas (drop/recreate) por las versiones seguras con `safe_uuid`. Numerarla después de `0015` evita que un `supabase db reset` limpio falle por políticas duplicadas:

- **`log_event()` es ahora una función interna.** Se revocó su ejecución para `public`, `anon` y `authenticated`: un cliente ya no puede contaminar la bitácora con eventos falsos (ni siquiera de su propia organización). La invocan únicamente funciones `SECURITY DEFINER` internas (`create_organization` sigue registrando `organization_created` porque ejecuta con los privilegios de su dueño). Si en el futuro se necesita registrar eventos desde cliente, se creará una `log_user_event()` separada con validación de membership, actor forzado a `auth.uid()` y lista blanca de tipos — no se reabrirá `log_event`.
- **Privilegios explícitos en todas las funciones** (Postgres concede `EXECUTE` a `PUBLIC` por defecto): helpers de políticas (`is_org_member`, `has_org_role`, `is_org_admin`, `shares_org_with`) y `answer_weight` quedan solo para `authenticated`; funciones de trigger (`handle_new_user`, `audit_row_change`, `forbid_mutation`, `set_updated_at`, `force_created_by`) cerradas del todo para clientes; `create_organization` para `authenticated`, nunca `anon`.
- **Storage con parsing seguro de ruta:** nueva `safe_uuid(text)` (inmutable; devuelve `null` si el primer segmento no es UUID) y políticas del bucket `evidences` recreadas para **negar sin romper** cuando la ruta es malformada.
- **Autoría no falsificable:** trigger `force_created_by` en `sites` y `organizations` — si hay usuario autenticado, `created_by` siempre es `auth.uid()`, se envíe lo que se envíe. Regla para Sprint 2: adjuntar este trigger a toda tabla nueva con `created_by`, y las Server Actions nunca aceptan `created_by` del cliente.
- **Cookie de empresa activa firmada (HMAC-SHA256)** con `ACTIVE_ORG_COOKIE_SECRET` (ver `.env.example`; genera uno con `openssl rand -base64 32`). Sin secret se degrada a valor sin firma con advertencia en consola (solo aceptable en desarrollo). La barrera de seguridad sigue siendo RLS + revalidación de membership en servidor.
- **Nueva prueba de abuso de `log_event`** en la suite (`11a/11b/11c`): A no puede invocarla contra la organización B **ni contra la suya**, y `create_organization` sigue registrando su evento. Con el estado previo a `0016`, 11a/11b fallan; con `0016`, pasan.

## Sprint 2 · Qué quedó implementado

**Migraciones `0017`–`0022`** (incrementales; no tocan las anteriores):

- `0017_normative.sql`: `frameworks` y `requirements` (catálogo normativo global, solo lectura para autenticados).
- `0018_diagnostics_yes_no.sql`: diagnóstico cerrado **Sí/No** — `diagnostic_sections`, `diagnostic_questions` (globales), `diagnostics` y `diagnostic_answers` (por empresa, con FK compuesta y respuestas `boolean`; el enum `diagnostic_answer` del Sprint 1 queda sin uso por compatibilidad). Un diagnóstico completado es inmutable (trigger) y sus respuestas solo se escriben mientras está en progreso (RLS).
- `0019_evidences_base.sql`: `evidences` (validar = solo admin/quality, por trigger; borrar solo admin/quality y nunca validadas) y `evidence_links` (FK compuesta a evidencias de la misma empresa).
- `0020_catalog.sql`: `product_families`, `products` (con `declared_recycled_percent`), `material_classifications` (global, con banderas normativas), `suppliers` y `materials` (reclasificación exigida por CHECK + trigger: solo admin/quality, destino permitido por catálogo, justificación + evidencia, evento en bitácora). Incluye el trigger polimórfico de `evidence_links` que bloquea enlaces entre empresas y rechaza targets de sprints futuros sin romper.
- `0021_import_jobs.sql`: registro histórico de importaciones CSV (`validated` / `committed` / `failed`).
- `0022_seed_sprint2.sql`: semillas globales — 2 marcos, 17 requisitos, 6 secciones, **52 preguntas Sí/No** (27 críticas) con acción recomendada y referencias a normas, y 10 clasificaciones de material. Sin datos de empresas.

**Diagnóstico de preparación** (`/diagnostic`): preguntas cerradas Sí/No en positivo (Sí = mayor preparación), observaciones opcionales, una sección por vez, barra de progreso, guardado parcial y completar solo cuando todo está respondido (validado también en servidor). El resultado muestra porcentaje total, **nivel de alistamiento**, puntaje por sección, brechas críticas y cada respuesta "No" con su acción recomendada. Nunca se habla de certificación ni se nombran organismos.

**Cálculo del nivel** (`lib/diagnostic/scoring.ts`, función pura): Sí=1, No=0, ponderado por peso; brecha crítica = pregunta crítica en "No". Cascada: `audit_ready_candidate` si ≥90% y 0 brechas críticas; `high` si ≥75% y ≤4; `medium` si ≥50% y ≤8; `low` en el resto. **Una sola brecha crítica impide ser candidato**, sin importar el porcentaje.

**Catálogos** (`/catalog`): CRUD mínimo de proveedores, familias, productos y materiales con clasificación normativa. La reclasificación de postindustrial a preconsumo válido solo la aprueban admin/quality con justificación + evidencia (el trigger la bloquea aunque se manipule la UI).

**Evidencias** (`/evidences`): crear con archivo (bucket privado, ruta `{organization_id}/{evidence_id}/{archivo}`, subida con la sesión del usuario), validar (solo admin/quality), y asociar a proveedores, materiales, productos, familias o sedes de la misma empresa.

**Importación CSV** (`/catalog/import`): plantilla descargable por entidad, validación en servidor con errores fila a fila, confirmación previa y commit solo con cero errores; cada intento queda en `import_jobs`. Solo CSV (XLSX en un sprint posterior).

### Correr el diagnóstico

1. Aplica migraciones (`supabase db reset`) y entra con tu empresa activa.
2. Menú **Diagnóstico** → "Iniciar diagnóstico".
3. Responde Sí/No por sección (puedes guardar avance y volver después).
4. "Completar diagnóstico" cuando todas las preguntas tengan respuesta.
5. Revisa nivel, brechas críticas y acciones; el siguiente paso sugerido es **Catálogos**.

### Importar catálogos por CSV

1. **Catálogos → Importar catálogos desde CSV**.
2. Elige la entidad y descarga la plantilla (para productos, importa primero las familias).
3. Sube el archivo → "Validar archivo" → corrige errores si los hay → "Confirmar e importar".

### Validar que no hay menciones prohibidas

```bash
npm run test:compliance
```

Recorre migraciones, seeds, UI, actions y textos, y **falla** si aparece el nombre de un organismo certificador o lenguaje de reglamentación interna; solo se admiten normas técnicas (NTC 6632:2022, UNE-EN 15343:2008, NTC-ISO 14021, ISO 17422...).

### Pruebas

```bash
npm run test:diagnostic   # puntuación del diagnóstico (sin base de datos)
npm run test:compliance   # barrido de menciones prohibidas (sin base de datos)
npm run test:rls          # aislamiento multiempresa (requiere Supabase local con Docker)
npm run typecheck && npm run lint && npm run build
```

La suite RLS ahora incluye los casos del Sprint 2 (12–18): aislamiento de diagnósticos, catálogos y evidencias entre empresas; bloqueo de enlaces de evidencia entre empresas; consultant crea materiales pero no reclasifica ni valida evidencias; admin/quality sí, con justificación y evidencia.

## Sprint 2.1 · Endurecimiento de evidencias

Migración incremental **`0023_evidence_hardening.sql`**: se reemplaza el guard anterior (que solo cubría el paso a `valid`) por **`guard_evidence_integrity()`**, única fuente de reglas sobre `evidences` (UPDATE y DELETE):

1. Marcar `status = 'valid'` → solo admin/quality.
2. Sacar una evidencia de `valid` hacia otro estado → solo admin/quality.
3. Una evidencia validada **no puede ser modificada por consultant** (ningún campo).
4. Una evidencia validada **no puede eliminarse** (nadie; refuerza la política RLS que ya limitaba delete a admin/quality con estado distinto de `valid`).
5. Cambiar el `storage_path` de una validada → solo admin/quality (mensaje específico).
6. Consultant sigue creando evidencias y editando las **pendientes** con normalidad.

Las acciones `validateEvidenceAction` y `deleteEvidenceAction` ahora devuelven estado `{ error }` con mensajes claros (los rechazos del trigger se muestran tal cual; nada se oculta silenciosamente: si la base no afectó filas, la UI lo dice). Los botones de fila usan un componente cliente con el error visible junto a la acción.

**Pruebas RLS ampliadas** (`tests/rls/isolation.test.ts`): barrido de RLS activo sobre las **22 tablas** (Sprint 1 + 2) cuando hay `SUPABASE_DB_URL`; visibilidad cruzada completa (A no ve de B: diagnósticos, respuestas, evidencias, enlaces, proveedores, familias, productos, materiales e import_jobs); consultant crea evidencia pendiente y materiales pero no valida, no modifica validadas (ni su `storage_path`) y no reclasifica; admin/quality validan y reclasifican con justificación + evidencia; y una evidencia validada no se elimina ni siquiera por admin. Sin `SUPABASE_DB_URL`, la suite explica que se omite solo la inspección directa y las pruebas por cliente siguen corriendo con Supabase local.

**Lenguaje prudente**: el barrido de cumplimiento ahora también falla ante promesas comerciales fuertes ("obtener la certificación", "garantizar la certificación", "certificado asegurado", "certificación garantizada" y variantes). La frase del acceso ahora habla de "prepararte frente a auditorías y revisión de cumplimiento normativo". El diagnóstico quedó intacto: mismas 52 preguntas Sí/No.

## Sprint 2.2 · organization_id inmutable en toda fila org-scoped

Migración incremental **`0024_tenant_immutability.sql`**: en Trazaloop una fila operativa nace en una empresa y **nunca se traslada a otra**. Aunque RLS y las FK compuestas aíslan, un usuario miembro de dos empresas pasaría el `USING` de la empresa origen y el `WITH CHECK` de la destino en las políticas generales de update. La función `prevent_organization_id_change()` (trigger `BEFORE UPDATE`, `SECURITY DEFINER`, no ejecutable por clientes) cierra esa vía: si `organization_id` cambia, lanza excepción.

**Tablas protegidas (12):** `memberships`, `organization_modules`, `sites`, `diagnostics`, `diagnostic_answers`, `evidences`, `evidence_links`, `product_families`, `products`, `suppliers`, `materials`, `import_jobs`. **`audit_log` se omite deliberadamente**: su trigger `forbid_mutation` (0005) ya bloquea todo update/delete, así que su `organization_id` es inmutable por definición. No se adjunta a `organizations` (raíz), `profiles` ni a los catálogos globales.

**Prueba nueva (caso 22):** un usuario miembro de A **y** de B intenta `update ... set organization_id = orgB` sobre un proveedor, una evidencia pendiente y un material de A; los tres intentos deben fallar y cada fila debe seguir en su empresa original. Con `SUPABASE_DB_URL` disponible, el caso 23 verifica directamente en `pg_trigger` que las 12 tablas llevan el trigger; sin él, la suite lo dice explícitamente y las pruebas por cliente siguen corriendo.

### Regla obligatoria para toda tabla futura con `organization_id` (Sprint 3 en adelante)

1. **RLS activo** deny-by-default con políticas explícitas.
2. **`unique(organization_id, id)`** para habilitar FK compuestas.
3. **FK compuestas** `(organization_id, <fk_id>)` hacia toda tabla org-scoped que referencie.
4. **Trigger `before update` → `prevent_organization_id_change()`**.
5. Trigger `before insert` → `force_created_by()` si la tabla tiene `created_by`.
6. Trigger de auditoría `audit_row_change()` si es tabla de negocio.

(La misma lista vive como comentario al final de `0024` para que acompañe al esquema.)

## Sprint 3 · Trazabilidad operativa

Migraciones nuevas (incrementales, sin tocar las anteriores):

- **`0025_traceability.sql`** — cinco tablas con la regla obligatoria completa (RLS deny-by-default, `unique(organization_id, id)`, FK compuestas, `prevent_organization_id_change`, `set_updated_at`, `force_created_by`, `audit_row_change`):
  - `input_batches` (lotes de entrada; código único por empresa, proveedor y material obligatorios, sede y cantidad opcionales, `quantity_kg > 0` si se informa).
  - `production_orders` (órdenes; estados `draft`/`in_progress`/`closed`/`cancelled`, `process_variables` en JSON).
  - `batch_consumption` (consumos por orden; único por orden+lote, `mass_kg > 0`; borrar la orden borra sus consumos en cascada, borrar un lote consumido está bloqueado por FK `restrict`). El sobreconsumo **no se bloquea**: se muestra como advertencia en UI.
  - `output_batches` (lotes de salida; orden obligatoria con FK `restrict`, producto opcional).
  - `batch_composition` (composición del lote de salida; única por lote+material, `is_same_process` y `counts_override` quedan preparados para el Sprint 4 **sin uso en cálculo**).
  - Roles: **select** cualquier miembro; **insert/update** admin, quality y consultant; **delete** solo admin/quality. El trigger polimórfico de `evidence_links` ahora también acepta `input_batch`, `production_order` y `output_batch` (mismo tenant obligatorio).
- **`0026_traceability_views.sql`** — cuatro vistas `security_invoker` (la RLS de las tablas base aplica): `v_output_batch_completeness` (estado `incomplete` / `complete_with_warnings` / `complete`, `missing_items` en español y advertencia de balance con tolerancia fija del 5%), `v_traceability_backward`, `v_traceability_forward` y `v_production_order_mass_balance`.
- **`0027_import_input_batches.sql`** — amplía `import_jobs.entity` con `input_batches`.

### Flujo de trazabilidad manual

1. Crear un **proveedor** (Catálogos → Proveedores).
2. Crear un **material** con su clasificación (Catálogos → Materiales).
3. Crear un **lote de entrada** (Trazabilidad → Lotes de entrada): código, proveedor, material, fecha de recepción; cantidad, sede, tipo de residuo y procedencia opcionales.
4. Crear una **orden de producción** (Trazabilidad → Órdenes).
5. Abrir la orden con **Consumos** y registrar los lotes de entrada consumidos con su masa. Si el acumulado consumido supera lo recibido del lote, la UI lo advierte (no bloquea).
6. Crear un **lote de salida** asociado a la orden (producto opcional).
7. Abrir el lote con **Composición** y registrar los materiales con su masa (y marcar "mismo proceso" cuando aplique).
8. Revisar la **genealogía** (Trazabilidad → Genealogía): hacia atrás desde el lote de salida (producto → orden → lotes de entrada → proveedores/materiales) o hacia adelante desde el lote de entrada (órdenes → lotes de salida → productos).

En cada lote y orden se pueden **asociar evidencias existentes** (subidas en el menú Evidencias).

### Importar lotes de entrada por CSV

En Trazabilidad → Lotes de entrada → *Importar por CSV*: descargar plantilla (`batch_code,supplier_name,material_name,residue_type,provenance,received_date,quantity_kg,storage_location,notes`), subir el archivo, revisar la validación fila por fila y confirmar. Reglas: código único por empresa; `supplier_name` y `material_name` deben existir en los catálogos; `residue_type` opcional (`preconsumer`, `postconsumer`, `postindustrial`, `virgin`, `other`); `received_date` obligatoria en formato `AAAA-MM-DD`; `quantity_kg` opcional > 0. **Commit solo con 0 errores**: si hay una fila mala, no se importa nada. Cada importación queda registrada en `import_jobs`.

### Trazabilidad completa / incompleta

`v_output_batch_completeness` evalúa cada lote de salida: es **incompleta** si falta orden, consumos, composición o la información de proveedor/material de sus entradas (los faltantes se listan en la UI); es **completa con advertencias** si está todo pero el balance de masa difiere más del 5% (consumido vs composición, y producido vs composición cuando se informa la cantidad); es **completa** en caso contrario. El badge aparece en Lotes de salida y las métricas en el índice de Trazabilidad y el dashboard. Es una **advertencia informativa**, nunca un bloqueo, y **no es cálculo de contenido reciclado**.

### Pruebas del Sprint 3

`tests/rls/isolation.test.ts` suma los casos 24–30: aislamiento de las 5 tablas, FK compuestas cruzadas (consumo con lote de otra empresa, salida con orden ajena, composición con material ajeno), inmutabilidad de `organization_id`, enlaces de evidencia entre empresas bloqueados, consultant creando toda la cadena, delete restringido a admin/quality y — integrados en `test:rls` porque requieren las vistas sobre Postgres real — los seis escenarios de trazabilidad: lote sin composición `incomplete`, cadena balanceada `complete`, desbalance > 5% `complete_with_warnings`, reconstrucción backward y forward, y sumas de masa por lote y por orden. El barrido de RLS y el de triggers cubren ahora 27 tablas (también `tests/rls/check-rls-enabled.sql`).

## Sprint 3.1 · corrección del build colgado

**Causa:** `app/page.tsx` consultaba `supabase.auth.getUser()` — una petición HTTP real — para decidir entre `/dashboard` y `/login`, y las rutas protegidas dependían solo de la detección dinámica implícita de Next. En la fase *"Collecting page data"* del build, según red y número de workers, esa evaluación podía intentar conectar a Supabase y quedarse esperando indefinidamente (con destinos que descartan paquetes no hay `connection refused` que corte rápido).

**Corrección:** (1) `app/page.tsx` es ahora un `redirect("/dashboard")` puro sin importar Supabase — el layout del shell ya exige sesión y manda a `/login`; (2) `export const dynamic = "force-dynamic"` explícito en `app/(app)/(shell)/layout.tsx`, en las 14 páginas server del shell, en `select-org` y en `app/api/import/template` (ninguna es Client Component, la directiva no choca con `"use client"`); (3) `createServerClient` valida las variables de entorno y **falla inmediato con mensaje claro** en lugar de asumirlas con `!`.

**Resultado:** el build pasa de prerenderizar 23 páginas a solo 7 (raíz como redirect estático, `_not-found` y las 3 de auth, ninguna toca Supabase). `npm run build` **termina completo incluso sin `.env.local`**, porque ya no existe ninguna llamada de datos posible durante build; toda consulta a Supabase ocurre únicamente en runtime dinámico. Verificado con las variables dummy (`http://127.0.0.1:54321`) y sin variables. No hay clientes instanciados a nivel de módulo ni side effects top-level en `app/`, `lib/` ni `server/`.

## Qué queda para el Sprint 4

- Metodología de cálculo y **cálculo de contenido reciclado** sobre `batch_composition` (con `is_same_process` y las reglas de clasificación).
- **Snapshots inmutables** de cada cálculo y su defendibilidad (datos de origen congelados).
- **Reportes de contenido reciclado** y documentos/PDFs congelados (subfase 1B).

## Decisiones y riesgos pendientes

0. **`test:rls` requiere Supabase local con Docker** (no ejecutable en todo entorno; ver sección de pruebas).
1. **Confirmación de correo**: decidir si el proyecto exige confirmación (afecta el flujo post-registro; la UI ya contempla ambos casos).
2. **Cookie de empresa activa**: es conveniencia de UI; la barrera es RLS + revalidación de membership en servidor. Endurecimiento futuro: claim en JWT.
3. **Políticas de Storage por SQL**: según plan/entorno puede requerir crearlas por Dashboard (documentado en `0015`).
4. **`audit_row_change` en `organizations`**: registra el propio `id` como `organization_id` (documentado en la función).
5. **Invitación de usuarios**: en Sprint 1 un admin solo puede agregar memberships de usuarios ya registrados; el flujo de invitación por correo queda para un sprint posterior.
