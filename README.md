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
  - `output_batches` (lotes producidos / lotes finales; orden obligatoria con FK `restrict`, producto opcional).
  - `batch_composition` (composición del lote producido / lote final; única por lote+material, `is_same_process` y `counts_override` quedan preparados para el Sprint 4 **sin uso en cálculo**).
  - Roles: **select** cualquier miembro; **insert/update** admin, quality y consultant; **delete** solo admin/quality. El trigger polimórfico de `evidence_links` ahora también acepta `input_batch`, `production_order` y `output_batch` (mismo tenant obligatorio).
- **`0026_traceability_views.sql`** — cuatro vistas `security_invoker` (la RLS de las tablas base aplica): `v_output_batch_completeness` (estado `incomplete` / `complete_with_warnings` / `complete`, `missing_items` en español y advertencia de balance con tolerancia fija del 5%), `v_traceability_backward`, `v_traceability_forward` y `v_production_order_mass_balance`.
- **`0027_import_input_batches.sql`** — amplía `import_jobs.entity` con `input_batches`.

### Flujo de trazabilidad manual

1. Crear un **proveedor** (Catálogos → Proveedores).
2. Crear un **material** con su clasificación (Catálogos → Materiales).
3. Crear un **lote de entrada** (Trazabilidad → Lotes de entrada): código, proveedor, material, fecha de recepción; cantidad, sede, tipo de residuo y procedencia opcionales.
4. Crear una **orden / corrida de producción** (Trazabilidad → Órdenes).
5. Abrir la orden con **Consumos** y registrar los lotes de entrada consumidos con su masa. Si el acumulado consumido supera lo recibido del lote, la UI lo advierte (no bloquea).
6. Crear un **lote producido / lote final** asociado a la orden (producto opcional).
7. Abrir el lote con **Composición** y registrar los materiales con su masa (y marcar "mismo proceso" cuando aplique).
8. Revisar la **genealogía** (Trazabilidad → Genealogía): hacia atrás desde el lote producido / lote final (producto → orden → lotes de entrada → proveedores/materiales) o hacia adelante desde el lote de entrada (órdenes → lotes producidos / lotes finales → productos).

En cada lote y orden se pueden **asociar evidencias existentes** (subidas en el menú Evidencias).

### Importar lotes de entrada por CSV

En Trazabilidad → Lotes de entrada → *Importar por CSV*: descargar plantilla (`batch_code,supplier_name,material_name,residue_type,provenance,received_date,quantity_kg,storage_location,notes`), subir el archivo, revisar la validación fila por fila y confirmar. Reglas: código único por empresa; `supplier_name` y `material_name` deben existir en los catálogos; `residue_type` opcional (`preconsumer`, `postconsumer`, `postindustrial`, `virgin`, `other`); `received_date` obligatoria en formato `AAAA-MM-DD`; `quantity_kg` opcional > 0. **Commit solo con 0 errores**: si hay una fila mala, no se importa nada. Cada importación queda registrada en `import_jobs`.

### Trazabilidad completa / incompleta

`v_output_batch_completeness` evalúa cada lote producido / lote final: es **incompleta** si falta orden, consumos, composición o la información de proveedor/material de sus entradas (los faltantes se listan en la UI); es **completa con advertencias** si está todo pero el balance de masa difiere más del 5% (consumido vs composición, y producido vs composición cuando se informa la cantidad); es **completa** en caso contrario. El badge aparece en Lotes producidos / lotes finales y las métricas en el índice de Trazabilidad y el dashboard. Es una **advertencia informativa**, nunca un bloqueo, y **no es cálculo de contenido reciclado**.

### Pruebas del Sprint 3

`tests/rls/isolation.test.ts` suma los casos 24–30: aislamiento de las 5 tablas, FK compuestas cruzadas (consumo con lote de otra empresa, salida con orden ajena, composición con material ajeno), inmutabilidad de `organization_id`, enlaces de evidencia entre empresas bloqueados, consultant creando toda la cadena, delete restringido a admin/quality y — integrados en `test:rls` porque requieren las vistas sobre Postgres real — los seis escenarios de trazabilidad: lote sin composición `incomplete`, cadena balanceada `complete`, desbalance > 5% `complete_with_warnings`, reconstrucción backward y forward, y sumas de masa por lote y por orden. El barrido de RLS y el de triggers cubrían 27 tablas (29 desde Sprint 4) (también `tests/rls/check-rls-enabled.sql`).

## Sprint 3.1 · corrección del build colgado

**Causa:** `app/page.tsx` consultaba `supabase.auth.getUser()` — una petición HTTP real — para decidir entre `/dashboard` y `/login`, y las rutas protegidas dependían solo de la detección dinámica implícita de Next. En la fase *"Collecting page data"* del build, según red y número de workers, esa evaluación podía intentar conectar a Supabase y quedarse esperando indefinidamente (con destinos que descartan paquetes no hay `connection refused` que corte rápido).

**Corrección:** (1) `app/page.tsx` es ahora un `redirect("/dashboard")` puro sin importar Supabase — el layout del shell ya exige sesión y manda a `/login`; (2) `export const dynamic = "force-dynamic"` explícito en `app/(app)/(shell)/layout.tsx`, en las 14 páginas server del shell, en `select-org` y en `app/api/import/template` (ninguna es Client Component, la directiva no choca con `"use client"`); (3) `createServerClient` valida las variables de entorno y **falla inmediato con mensaje claro** en lugar de asumirlas con `!`.

**Resultado:** el build pasa de prerenderizar 23 páginas a solo 7 (raíz como redirect estático, `_not-found` y las 3 de auth, ninguna toca Supabase). `npm run build` **termina completo incluso sin `.env.local`**, porque ya no existe ninguna llamada de datos posible durante build; toda consulta a Supabase ocurre únicamente en runtime dinámico. Verificado con las variables dummy (`http://127.0.0.1:54321`) y sin variables. No hay clientes instanciados a nivel de módulo ni side effects top-level en `app/`, `lib/` ni `server/`.

## Qué queda para el Sprint 4

- Metodología de cálculo y **cálculo de contenido reciclado** sobre `batch_composition` (con `is_same_process` y las reglas de clasificación).
- **Snapshots inmutables** de cada cálculo y su defendibilidad (datos de origen congelados).
- **Reportes de contenido reciclado** y documentos/PDFs congelados (subfase 1B).


## Sprint 4 · Motor de cálculo de contenido reciclado

Capa de cálculo para **NTC 6632:2022** y **UNE-EN 15343:2008**. Sin documentos, sin constructor documental, sin PDFs congelados: solo el motor. El lenguaje del producto habla de cálculo, trazabilidad, soporte documental, nivel de defendibilidad y preparación frente a auditorías y revisión de cumplimiento normativo.

### Migraciones nuevas

- **`0028_recycled_content.sql`**
  - `calculation_methodologies`: catálogo **global versionado** (`unique(code, version)` + índice único parcial: una sola versión activa por código). Legible por autenticados; **sin escritura desde cliente**. Seed: `RC-6632-15343` v1 con las reglas en JSON (fórmula, elegibles `preconsumer_valid`/`postconsumer_valid`, mismo proceso no cuenta, postindustrial exige reclasificación, soporte de origen obligatorio, tolerancia de balance 5%).
  - `recycled_content_calculations`: **snapshot inmutable** por lote producido / lote final — sin `updated_at`, trigger `forbid_mutation` en `UPDATE`/`DELETE` (por eso mismo `organization_id` es inmutable por definición, como en `audit_log`), `unique(organization_id, id)`, FK compuesta a `output_batches`, checks de masa/porcentaje/nivel. **Insertar solo puede la RPC**: no hay política de `insert` para clientes.
  - RPC **`calculate_recycled_content(p_output_batch_id, p_methodology_id default null)`** (`security definer` con validación estricta): exige sesión, lote existente, **membresía activa** y rol `admin`/`quality`/`consultant`; usa la metodología activa si no se indica; **jamás** acepta `organization_id` del cliente ni usa `service_role`. Congela las reglas en `methodology_rules_snapshot`, guarda el JSON de `components` con razón de inclusión/exclusión por material, registra el evento semántico `recycled_content_calculated` vía `log_event()` interno y retorna la fila creada. El cálculo se hace en SQL (no en Server Action) para que exista **una sola fuente de la lógica**, sin divergencias entre UI, tests y datos.
- **`0029_recycled_content_views.sql`** (todas `security_invoker`): `v_latest_batch_recycled` (último cálculo por lote, `distinct on` por `calculated_at`), `v_recycled_by_order`, `v_recycled_by_product`, `v_recycled_by_family`, `v_recycled_by_period` (mes de `produced_date`).

### La fórmula y las reglas

```
contenido_reciclado_% = masa_reciclada_válida / masa_total_de_composición * 100
```

`produced_quantity_kg` **nunca** es denominador; solo alimenta la advertencia de balance. Por componente: mismo proceso o `never_counts` suma al denominador pero no al numerador (`same_process_or_never_counts`); postindustrial sin reclasificar no cuenta (`postindustrial_not_reclassified`); solo cuentan clasificaciones efectivas elegibles; el reciclado exige evidencia de origen **`valid`** (criterio estricto: pendiente/rechazada ⇒ `origin_support_not_valid`); la reclasificación exige destino `preconsumer_valid`, justificación, evidencia `valid` y autor autorizado (`invalid_reclassification_support`); virgen/aditivo/pigmento/carga/masterbatch no cuentan (`non_recycled_material`); `other` no cuenta en la metodología v1 (`counts_override` queda guardado en el snapshot para el futuro, sin efecto todavía).

### Recalcular crea un snapshot nuevo

Un cálculo **jamás se sobrescribe**: recalcular inserta otra fila y el vigente es el último por `calculated_at`. `UPDATE`/`DELETE` sobre snapshots lanzan excepción a nivel de trigger, además de estar revocados y sin política RLS.

### Niveles de defendibilidad

- **`preliminary`**: sin consumos/trazabilidad hacia atrás, proveedor faltante, o ninguna masa contó como reciclada (incluido el caso donde toda la masa elegible quedó excluida por falta de soporte).
- **`with_warnings`**: hay cálculo válido pero existe alguna advertencia — balance fuera de tolerancia (consumo o `produced_quantity_kg` vs composición > 5%), calculado por debajo del declarado (además activa `risk_flag`), masa elegible excluida por soporte, postindustrial sin reclasificar, o evidencia pendiente/rechazada asociada.
- **`defensible`**: composición + orden + consumos + genealogía completa, todo lo contado con soporte `valid`, sin advertencias de balance y sin declarado por encima del calculado.

**Agregados**: si algún lote es `preliminary` el grupo es `preliminary`; si no, con alguno `with_warnings` el grupo es `with_warnings`; solo si todos son `defensible` el grupo es `defensible`.

### Agregaciones ponderadas

Siempre `sum(masa_reciclada) / sum(masa_total) * 100` — **nunca se promedian porcentajes**. Vistas por orden, producto, familia y periodo (mes de producción), con conteos de lotes.

### UI (`Contenido reciclado` en la navegación)

- `/recycled-content`: tarjetas (con/sin cálculo, defendibles, con advertencias, preliminares, último cálculo) y tabla de últimos cálculos con detalle.
- `/recycled-content/output-batches`: lotes con estado de trazabilidad, último porcentaje y nivel; **sin composición no se puede calcular**; con trazabilidad incompleta se permite calcular con advertencia visible; con cálculo previo el botón dice **Recalcular** y aclara que se crea un snapshot nuevo.
- `/recycled-content/output-batches/[id]`: lote, producto, orden, composición, consumos, evidencias, resultado con masas/porcentajes/riesgo/advertencias, **tabla de componentes explicada** (¿cuenta? y razón) e historial de cálculos.
- `/recycled-content/reports`: agregaciones por orden, producto, familia y periodo. Sin PDF todavía.

Server Actions (`server/actions/recycled.ts`): `calculateRecycledContentAction`, `getLatestCalculationForOutputBatchAction`, `listCalculationsForOutputBatchAction`, `getCalculationDetailAction`, `listOutputBatchesForCalculationAction`, `getRecycledContentDashboardAction` y las cuatro de agregación — todas con cliente de servidor con sesión, empresa activa validada y errores entendibles; el cálculo siempre pasa por la RPC.

### Cómo preparar datos para calcular

1. Crear proveedor → 2. crear material (con su clasificación) → 3. cargar la evidencia de origen → 4. validarla (admin/calidad) → 5. crear lote de entrada → 6. crear orden / corrida de producción → 7. registrar consumo → 8. crear lote producido / lote final → 9. registrar composición → 10. calcular contenido reciclado. Si un producto declara un porcentaje (campo del catálogo de productos), el cálculo lo compara y marca riesgo cuando el calculado queda por debajo.

### Pruebas de Sprint 4

`tests/rls/isolation.test.ts` suma los casos **31–37** (integrados en `test:rls` porque el motor vive en SQL y exige Postgres real): metodología global legible e inmutable desde cliente; los casos de cálculo 1–6 (postconsumo válido cuenta, mismo proceso no, postindustrial sin reclasificar no, reclasificado con soporte sí, evidencia pendiente no, declarado > calculado ⇒ riesgo y nunca `defensible`); recalcular crea segundo snapshot con el primero intacto y `v_latest` mostrando el último; inmutabilidad total (`UPDATE`/`DELETE`/cambio de empresa fallan); aislamiento multiempresa (A no ve ni calcula lotes de B, consultant sí calcula, vistas sin fugas); y agregaciones ponderadas (por orden con nivel agregado, por producto 170/300 = 56.6667% ≠ promedio 60%, por familia con arrastre a `with_warnings`, por periodo con `produced_date`). Los barridos de RLS y `tests/rls/check-rls-enabled.sql` cubren ahora **29 tablas**.

Las migraciones `0028`/`0029` y la lógica completa del motor se verificaron además contra un PostgreSQL 16 efímero: las 21 migraciones aplican en orden, y el humo funcional confirmó fórmula, razones por componente, riesgo por declarado, doble snapshot, bloqueo de mutaciones, ponderación por masa y el evento `recycled_content_calculated` en `audit_log`.

### Qué queda para el Sprint 5

- **Reportes imprimibles** y preparación para auditoría.
- Mejoras UX del flujo de cálculo.
- Documentación guiada en fase posterior.


## Sprint 4.1 · agregados de contenido reciclado transparentes

**Problema corregido:** en `0029`, una orden **con lotes producidos / lotes finales pero sin ningún cálculo** aparecía como `defensible`: con todos los `defensibility_level` en null, el `CASE` del agregado caía en `else 3` y `min(...) = 3` se traducía a `defensible`. Un agregado sin un solo snapshot no puede parecer listo.

**Corrección (`0030_recycled_aggregation_fix.sql`, `create or replace view` sin tocar migraciones anteriores):** las cuatro vistas agregadas (orden, producto, familia y periodo) distinguen ahora tres poblaciones dentro del alcance — **lotes totales** (todos los lotes producidos / lotes finales del agregado: los de la orden, los del producto, los de productos de la familia, o los del mes de `produced_date`), **lotes calculados** (los que tienen último snapshot) y **lotes pendientes** (la diferencia) — expuestas como `total_batches_count`/`output_batches_count`, `calculated_batches_count`, `uncalculated_batches_count` y `has_uncalculated_batches`. Reglas de defendibilidad agregada: **sin cálculos → nivel `null`** (y masas/porcentaje `null`); **cálculos parciales → `preliminary`**, aunque cada lote calculado sea defendible, para que un agregado a medias nunca parezca listo; **todos calculados → regla normal** (algún `preliminary` → `preliminary`; si no, algún `with_warnings` → `with_warnings`; solo si todos son `defensible` → `defensible`). Los **porcentajes agregados se calculan únicamente sobre las masas de los lotes con snapshot** — siempre `sum(masa_reciclada)/sum(masa_total)*100`, nunca promedios — y el agregado se marca como parcial cuando hay pendientes. Producto/familia/periodo conservan `batches_count` (lotes calculados, semántica de 0029) por compatibilidad, duplicado en `calculated_batches_count`.

**UI (`/recycled-content/reports`):** la columna de lotes muestra `calculados / totales` (p. ej. `3 / 5`), debajo `2 pendientes` cuando aplica, la advertencia «Agregado parcial: hay lotes sin cálculo.» cuando `has_uncalculated_batches`, y «Sin cálculos» cuando el nivel es `null`.

**Pruebas:** caso **38** en `tests/rls/isolation.test.ts` (integrado en `test:rls`; se ejecuta con Supabase local y `.env.local`): orden sin cálculos con nivel `null` y conteos `1/0/1` (jamás `defensible`); la misma orden con 2 lotes y solo 1 calculado queda `preliminary` con porcentaje solo sobre lo calculado y conteos `2/1/1`; calculado el restante aplica la regla normal (`defensible`, ponderado `(100+70)/200 = 85%`); y producto, familia y periodo con un lote pendiente en el alcance quedan `preliminary` con `total/calculados/pendientes` correctos. La migración `0030` se verificó además sobre el PostgreSQL 16 efímero: el `create or replace` aplica sobre las vistas de `0029` (columnas nuevas solo al final) y el humo reprodujo el bug y confirmó los tres estados (sin cálculos → `null`; parcial → `preliminary` con porcentaje intacto; completo → regla normal).


## Sprint 5A · Soporte técnico: dossiers imprimibles, matriz de evidencias y brechas

Capa de revisión, impresión y compartición interna de la evidencia técnica que soporta cada cálculo. **Todo se lee de los snapshots existentes**: no se recalcula nada, no se modifica ningún cálculo, no se persisten documentos ni PDFs, y no existe todavía Trazaloop Docs ni gestión documental.

### Migración nueva: `0031_audit_support_views.sql` (4 vistas `security_invoker`)

- **`v_calculation_dossier`**: una fila por cálculo con todo el contexto — lote, orden, producto, familia, metodología (código/versión/reglas congeladas), resultado completo del snapshot, autor con nombre, estado de trazabilidad, balance del snapshot y masas consumida/composición. Los opcionales ausentes se devuelven `null` de forma segura (`evidence_code` y `validated_at` no existen en el esquema de evidencias y van como `null` documentado).
- **`v_calculation_component_rows`**: expande el JSON `components` con `jsonb_array_elements ... with ordinality`, casts seguros de masa/booleans y tolerancia a `components` no-array.
- **`v_output_batch_evidence_matrix`**: consolida evidencias por TODAS las rutas — enlaces directos a lote, orden, lotes de entrada consumidos, proveedores, materiales, producto y familia — e incluye los **soportes de origen y de reclasificación de los materiales de la composición aunque no exista `evidence_link` explícito** (una fila por evidencia/rol/entidad, `distinct` contra duplicados). `is_required_for_defensibility = true` para esos dos roles (son las piezas que el motor exige) y `is_valid_for_defensibility` solo con estado `valid`.
- **`v_output_batch_support_gaps`**: una fila por brecha con severidad (`critical`/`warning`/`info`), descripción y **acción sugerida**: cálculo preliminar o con advertencias, declarado por encima del calculado (riesgo), material elegible sin origen o con origen sin validar, postindustrial sin reclasificar, reclasificación sin soporte completo, balance fuera de tolerancia, trazabilidad incompleta y lote sin cálculo.

### Rutas nuevas (navegación: **Soporte técnico**)

- `/audit-support`: tarjetas (defendibles, con advertencias, preliminares, lotes con brechas críticas, lotes con evidencias pendientes), últimos cálculos con «Ver dossier»/«Imprimir» y brechas recientes con acción sugerida.
- `/audit-support/calculations/[id]`: **el dossier técnico** — encabezado con badges (defendibilidad, riesgo, trazabilidad), resultado con diferencia calculado−declarado, fórmula y resumen legible de las reglas congeladas, cadena de trazabilidad (lote → orden → lotes de entrada → proveedores → materiales, con clasificación y recepción), tabla de componentes que deja clarísimo por qué cada masa cuenta o no, matriz de evidencias con filtros (todas/requeridas/pendientes/válidas/no válidas), brechas con acciones y el historial de snapshots del lote.
- `/audit-support/calculations/[id]/print`: versión imprimible en un **route group sin shell** (misma URL, sin navegación), con fecha de generación y nota técnica; el botón «Imprimir / guardar como PDF» usa `window.print()` y los estilos `@media print` de `globals.css` (`.no-print`, `.print-page`, cortes de tabla controlados). **Sin librerías de PDF ni generación server-side**: el usuario usa «Imprimir → Guardar como PDF» del navegador.
- `/audit-support/output-batches/[id]/evidence-matrix`: matriz por lote — qué evidencias lo soportan, qué falta, cuáles están pendientes de validar y cuáles son críticas para la defendibilidad; con acceso al dossier del último cálculo o a calcular si no hay.

Accesos también desde el dashboard de contenido reciclado (dossier del último cálculo, matriz e imprimir). La página de agregaciones (`/recycled-content/reports`) funciona además como **vista ejecutiva imprimible** por orden/producto/familia/periodo: botón «Imprimir / guardar como PDF», encabezado de impresión, fecha de generación y nota técnica; el chrome del shell (navegación lateral y barra superior) queda marcado `no-print`, así que cualquier página se imprime limpia desde el navegador.

### Server Actions (`server/actions/audit-support.ts`)

`getCalculationDossierAction`, `getPrintableCalculationDossierAction`, `getOutputBatchEvidenceMatrixAction`, `getOutputBatchSupportGapsAction`, `getAuditSupportDashboardAction`, `exportCalculationDossierJsonAction` y `exportEvidenceMatrixCsvAction` — todas con cliente de servidor con sesión, empresa activa validada, sin `organization_id` del cliente y sin `service_role`.

### Exportaciones

- **Dossier JSON** (botón «Exportar JSON»): objeto estructurado con metadata, resultado, snapshot de metodología, componentes, evidencias, brechas e historial breve; se descarga desde el cliente. Se construye exclusivamente del dossier org-validado.
- **Matriz CSV** (botón «Exportar matriz CSV»): exactamente las columnas `evidence_code,evidence_title,evidence_type,evidence_status,linked_entity_type,linked_entity_label,support_role,is_required_for_defensibility,is_valid_for_defensibility` — nada sensible innecesario. Usa `toCsv`, que **escapa comillas, comas y saltos de línea** (verificado por `npm run test:csv`, test unitario sin BD con roundtrip `toCsv → parseCsv`).

### Cómo generar un dossier

1. Crear la trazabilidad (proveedor, material, lote de entrada, orden, consumo, lote producido / lote final) → 2. registrar la composición → 3. cargar y validar evidencias → 4. calcular contenido reciclado → 5. abrir el dossier desde Soporte técnico o desde el dashboard de contenido reciclado → 6. imprimir o guardar como PDF desde el navegador.

El dossier **se basa en el snapshot del cálculo y no lo modifica**; **no constituye por sí mismo una certificación**; **no es todavía un documento formal controlado** (Trazaloop Docs vendrá después).

### Pruebas de Sprint 5A

Caso **39** en `tests/rls/isolation.test.ts` (integrado en `test:rls`; requiere Supabase local y `.env.local`): dossier fiel al snapshot (porcentaje, metodología, producto/familia, autor, nivel); expansión correcta de componentes con casts; matriz que incluye la evidencia de origen del material contado y la de reclasificación **sin enlace explícito**, requeridas y válidas; brechas `missing_origin_support`, `origin_support_not_valid` y `declared_above_calculated`; y aislamiento multiempresa de dossier, matriz y brechas (el export JSON se construye del mismo dossier org-filtrado). El escapado CSV se prueba sin BD con `npm run test:csv`. La migración `0031` se verificó además sobre el PostgreSQL 16 efímero con humo funcional de las cuatro vistas.

### Qué queda para fases posteriores

- Trazaloop Docs: documentos formales controlados, versionado y aprobación.
- Generación de PDF en servidor y PDFs congelados.
- Módulo de auditorías y planes de acción.


## Sprint 5B · Flujo guiado: de datos básicos a dossier sin perderse

Nueva sección **Flujo guiado** (`/guided-flow` y `/guided-flow/output-batches/[id]`) que funciona como centro de trabajo: responde qué falta para calcular, qué hacer después, qué datos están incompletos, qué evidencias faltan, qué lote se puede calcular, cuál se defiende mejor y cómo llegar al dossier técnico. **El flujo guiado NO cambia la metodología de cálculo**: solo lee estados existentes; el cálculo sigue pasando por la misma RPC. No se creó módulo documental ni PDF server-side. Las pantallas existentes siguen intactas para el usuario experto.

### Migración `0032_guided_flow_views.sql` (vistas `security_invoker`, sin tablas nuevas)

- **`v_output_batch_readiness`**: una fila por lote producido / lote final con hechos (producto, orden, consumo, composición, soporte de origen/reclasificación válido, evidencias pendientes o faltantes, último cálculo), más `next_step_code/label/href` y `readiness_level`. Los estados: **`not_ready`** (sin orden — rama defensiva: el esquema exige orden), **`needs_data`** (falta consumo o composición), **`needs_evidence`** (hay materiales elegibles con soporte faltante o pendiente), **`ready_to_calculate`** (todo listo, sin cálculo), **`calculated_with_gaps`** (cálculo con nivel débil o riesgo) y **`calculated_ready`** (defendible sin riesgo → dossier).
- **`v_guided_flow_dashboard`**: agregado por empresa para las tarjetas (conteos de entrada/órdenes/salida, listos para calcular, sin composición, sin consumo, con evidencia pendiente, calculados por nivel y brechas críticas).

### Una sola fuente de las reglas

La cadena de decisión (orden → consumo → composición → soporte faltante → soporte pendiente → calcular → brechas/dossier) está especificada como **función pura** en `lib/domain/guided-flow.ts` (`resolveNextStep`), testeable sin BD con **`npm run test:guided`** (los 9 casos del spec + 2 extras: riesgo sobre defendible y faltante-gana-a-pendiente). La vista SQL implementa la misma cadena y el **caso 40** de `test:rls` cruza vista ↔ función **fila a fila** para garantizar que jamás diverjan, además de validar el aislamiento multiempresa de ambas vistas.

### “Siguiente mejor acción”

Sección con 1–5 acciones priorizadas: 1) lotes con composición sin cálculo, 2) cálculos con riesgo, 3) evidencias requeridas pendientes, 4) lotes sin composición, 5) órdenes sin consumo, 6) catálogos incompletos — cada una con descripción, entidad y botón directo. El CTA principal de la página también es dinámico según el estado real de la empresa.

### UX

Tarjetas de avance (los 7 pasos: catálogos → evidencias → lotes de entrada → órdenes/consumos → salida/composición → cálculo → dossier) con estado textual, contadores y CTA; tabla de lotes con semáforo (`ReadinessBadge` con texto, nunca solo color) y acciones por fila; detalle guiado tipo **stepper de 7 pasos** con acciones contextuales (incluido el botón Calcular/Recalcular existente); componentes reutilizables (`ReadinessBadge`, `RiskBadge`, `EmptyState`, `ProgressStepCard`, `GuidedStep`); estados vacíos útiles en materiales, lotes de entrada, composición y cálculo; y navegación cruzada: Trazabilidad → flujo guiado/calcular/matriz, Contenido reciclado → flujo guiado/brechas, Soporte técnico → flujo guiado/evidencias/recalcular, y en Evidencias el enlace «Ver flujo del lote relacionado» cuando la evidencia está vinculada a un lote producido / lote final. No se implementaron quick-actions duplicadas: los formularios existentes ya cubren la creación y el flujo enlaza a ellos.


## Sprint 5C · Preparación para staging (Supabase Cloud + Vercel)

Sin funcionalidades nuevas de negocio: este sprint deja el sistema **probable, desplegable, demostrable y testeable en nube**. La lógica normativa de cálculo, las reglas de defendibilidad y la RLS quedan intactas.

- **Limpieza**: `tsconfig.tsbuildinfo` eliminado del repo y de los entregables (ya estaba en `.gitignore` vía `*.tsbuildinfo`); `.gitignore` ampliado con `dist`; barrido de secretos limpio (el único match de `eyJ` es un integrity hash de `package-lock.json`, no una credencial).
- **`.env.example`** reescrito con las 5 variables y comentarios explicativos, incluido cómo generar el secreto de la cookie (`openssl rand -base64 32`).
- **`lib/env.ts`**: validación de entorno con mensajes claros («Falta X. Configúrala en .env.local o en Vercel → Environment Variables»), invocada SOLO en runtime (jamás top-level: el build sigue terminando sin `.env.local`, regla del Sprint 3.1). `createServerClient` la usa; `isStagingEnvironment()` activa el badge **«Ambiente staging»** en el header cuando `NEXT_PUBLIC_SITE_URL` apunta a Vercel/staging.
- **Scripts**: `npm run test:smoke` (`scripts/smoke-staging.ts`) verifica variables, conexión, migraciones (tablas y vistas clave), **RLS conductual** (un cliente anónimo no debe leer filas), y con la service key como herramienta administrativa: bucket `evidences` privado, metodología `RC-6632-15343` activa, 52 preguntas y 10 clasificaciones — con ✅/❌ y qué revisar en cada fallo. `npm run seed:demo` (`scripts/seed-demo.ts`) siembra el caso demo completo **iniciando sesión como el usuario demo** (sin `service_role` en operaciones de negocio: aplican RLS y triggers reales), exige `DEMO_ORGANIZATION_ID` explícito, verifica membresía, solo inserta en esa organización y calcula por la misma RPC; imprime las URLs de flujo guiado y dossier. También `test:all` y `predeploy` (sin `test:rls` a propósito: requiere Supabase; documentado como obligatorio antes de producción real).
- **`test:rls`** ahora falla sin variables con el mensaje exacto y la advertencia («crea usuarios y datos de prueba; solo staging o local»), sin stacktrace.
- **Docs**: `docs/STAGING_DEPLOYMENT.md` (18 secciones: requisitos, `npm ci`, `.env.local`, GitHub, Supabase CLI con `login/link/db push`, verificaciones SQL de semillas y bucket, Auth Redirect URLs, Vercel + env vars, flujo demo manual de 14 pasos o por script, smoke, RLS contra staging, y troubleshooting de los 7 errores frecuentes: PAT de GitHub, `db push`, variables en Vercel, redirects de Auth, evidencias que no suben, app sin datos y build colgado) y `docs/PREDEPLOY_CHECKLIST.md` con la checklist completa.
- **Seguridad §14 verificada**: cero referencias a la service key en `app/`/`components/` (solo `lib/supabase/admin.ts` server-only y scripts administrativos); bucket privado con políticas por organización; RLS en las 29 tablas; **19/19 vistas `security_invoker`**; Server Actions con empresa activa; rutas protegidas dinámicas con sesión.

`test:smoke` se ejecutó en sus caminos de fallo (sin variables → mensaje claro; URL inalcanzable → «Supabase connection ❌» con guía): la corrida completa exige un Supabase real de staging, igual que `test:rls`.


## Sprint 5D · Pulido de terminología y experiencia pre-piloto

Sin cambios de esquema, metodología ni RLS. Terminología visible unificada en toda la app y documentación: **«Orden / corrida de producción»** y **«Lote producido / lote final»** (los nombres internos —tablas, columnas, rutas, vistas y migraciones— quedan intactos; los mensajes de la RPC se transforman solo en la capa de presentación para no romper el matching, y el label del siguiente paso del flujo guiado se renderiza desde el mapa TS en lugar de la columna de la vista). Textos de ayuda cortos en órdenes/corridas, lotes producidos, composición, consumos y materiales (evidencia de origen). Estados vacíos útiles también en proveedores, órdenes/corridas y evidencias. El flujo «asociar evidencia de origen y que el material cuente al recalcular» quedó corregido y cubierto por regresión en el fix previo (caso 41). Nuevos `docs/DEMO_FLOW.md` (13 pasos + casos A 100 % defendible, B 90 %, C 0 % preliminar con remate de recálculo, y notas de balance para que los números salgan exactos) y `docs/PILOT_QA_CHECKLIST.md` (recorrido manual completo, incluido el chequeo de aislamiento multiempresa).


## Estado del producto — v0.5.x (fase piloto)

**Qué incluye esta versión:** multiempresa con RLS estricta y roles; diagnóstico normativo (52 preguntas); catálogos (proveedores, materiales con clasificación y reclasificación soportada, productos con % declarado, familias); evidencias en bucket privado con validación y soporte de origen; trazabilidad lote a lote (entrada → orden/corrida → lote producido → composición) con importación CSV y genealogía; motor de cálculo de contenido reciclado (NTC 6632:2022 / UNE-EN 15343:2008) con snapshots inmutables, niveles de defendibilidad y agregaciones ponderadas; soporte técnico (dossier imprimible, matriz de evidencias, brechas con acciones); flujo guiado; implementación con empresa (checklist de 17 pasos, siguiente acción recomendada y feedback de la prueba real); carga masiva real por CSV de las diez entidades del flujo, con vista previa, validación por fila y confirmación explícita; y tooling de operación (smoke, verificación de producción, reparación de semillas, seed demo, guías de despliegue/backup/QA).

**Qué NO incluye todavía:** Trazaloop Docs (documentos formales controlados con versionado y aprobación), generación de PDF en servidor, módulo de auditorías y planes de acción, facturación/planes, notificaciones por correo, e integraciones externas. Trazaloop no emite certificaciones; ver `/legal` en la app.


## Sprint 5E · Cierre para producción (v0.5.0 pilot)

Sin cambios de negocio, metodología, migraciones ni RLS. Versión visible **v0.5.0 · pilot** (fuente única `package.json` vía `lib/version.ts`) en el aside del shell y en la nueva página pública **`/legal`** («Acerca de Trazaloop»: qué hace, no emite certificaciones, los resultados dependen de la información ingresada, la responsabilidad del uso es del usuario; enlazada desde el shell y el login). Nuevo **`npm run verify:prod`** (`scripts/verify-production.ts`): verificación ESTRICTA y 100 % de solo lectura para producción — conexión API y SQL, migraciones (tablas + vistas clave por `to_regclass`), semillas (52/10/frameworks/metodología v1 activa, con remedio `repair:seeds`), bucket `evidences` privado por SQL directo, **RLS activo de verdad por `pg_class`** y chequeo conductual con anon; exit 1 ante cualquier rojo; verificado contra PostgreSQL real incluidos los detectores (metodología inactiva y RLS desactivada). Nuevas guías `docs/PRODUCTION_DEPLOYMENT.md` (proyecto separado, migraciones, semillas, Auth productivo sin localhost, variables Production con secreto de cookie NUEVO, qué no ejecutar en producción, y rollback mínimo app/variables/BD) y `docs/BACKUP_RESTORE.md` (backups automáticos y manuales con `db dump`, restauración SIEMPRE a proyecto nuevo validado con `verify:prod`, y prueba mensual del procedimiento).


## Sprint 5F · Herramientas de soporte post-piloto

Sin cambios de negocio, metodología, migraciones ni RLS. Nuevo **`npm run diagnose:org -- --org <uuid>`** (`scripts/diagnose-org.ts`): diagnóstico de UNA organización en **solo lectura** (únicamente SELECTs vía `SUPABASE_DB_URL`) — existencia y miembros por rol/estado, conteos de catálogos/evidencias/trazabilidad, huecos (órdenes sin consumo, lotes sin composición), **materiales elegibles sin soporte de origen válido** (la causa clásica del 0 %), últimos cálculos con nivel y riesgo, brechas por severidad, semáforo del flujo guiado y **conclusiones con causas probables y remedio**; verificado contra datos reales (detectó las cuatro causas sembradas del fixture) y con caminos de error claros (UUID inválido, organización inexistente). Nueva **`docs/SUPPORT_GUIDE.md`** (las 10 preguntas de soporte con dónde mirar en la app y cuándo usar el diagnóstico) y **`docs/FAQ_PILOT.md`** (10 respuestas en lenguaje simple para usuarios finales, sin promesas de certificación). UX: los cálculos **preliminares** muestran ahora el enlace «Ver causas en Soporte técnico» en el detalle del lote y en la lista de cálculo.

## Sprint 6 · Hotfixes + Implementación con empresa

Dos hotfixes pendientes más una capa nueva de apoyo para probar Trazaloop
con empresas y **datos reales** (no un caso piloto, no datos demo). Sin
cambios en la metodología de cálculo, el motor normativo ni la RLS de las
tablas de sprints anteriores.

**Hotfixes:**

- **`npm run build` colgado por telemetría de Next.js**: el script `build`
  de `package.json` ahora exporta `NEXT_TELEMETRY_DISABLED=1` con
  `cross-env` (multiplataforma: macOS, Linux y Vercel; también aplicado a
  `dev` y `start`), sin depender de exportarla a mano. `.env.example` la
  documenta y `docs/STAGING_DEPLOYMENT.md` recomienda configurarla también
  como variable de entorno en Vercel, como defensa en profundidad.
- **Texto de `components/layout/create-org-form.tsx`**: ya no menciona
  «Trazaloop Docs» (módulo que no existe todavía); ahora dice que se
  activan los módulos base disponibles para trazabilidad, cálculo de
  contenido reciclado y soporte técnico.

**Migraciones nuevas:**

- **`0033_implementation_feedback.sql`**: tabla `implementation_feedback`
  (errores, dudas, hallazgos de prueba y mejoras registrados durante la
  prueba real), con la regla obligatoria completa (RLS deny-by-default,
  `unique(organization_id, id)`, `prevent_organization_id_change`,
  `set_updated_at`, `force_created_by`, `audit_row_change`) más un trigger
  propio que fija/limpia `resolved_at` al entrar o salir del estado
  `resolved`. Checks para `module`, `category`, `severity` y `status`.
  Roles: **select** cualquier miembro; **insert** admin, quality o
  consultant; **update** admin/quality (cualquier feedback) o el creador
  (el suyo); **delete** solo admin/quality.
- **`0034_implementation_views.sql`** (`security_invoker`): **no recalcula
  contenido reciclado, solo cuenta y resume** reutilizando vistas ya
  existentes (`v_guided_flow_dashboard`, `v_output_batch_readiness`,
  `v_output_batch_support_gaps`, `v_latest_batch_recycled`).
  `v_implementation_dashboard` (una fila por empresa, 18 conteos: catálogos,
  evidencias, trazabilidad, cálculo por nivel y feedback) y
  `v_implementation_next_actions` (recomendaciones priorizadas 1–12: sin
  proveedores → crear proveedor … todo avanzado → registrar feedback; la
  fila de menor `priority` es la «siguiente acción recomendada»).
  Ambas migraciones se verificaron sobre un PostgreSQL 16 efímero: las 34
  migraciones aplican en orden, y un humo funcional confirmó los conteos,
  la cascada de prioridad extremo a extremo (sin proveedores → … → cálculo
  defendible → dossier) y la RLS de `implementation_feedback` (aislamiento
  de lectura/escritura entre empresas, edición del feedback propio y
  borrado restringido a admin/quality).

**Lógica pura** (`lib/domain/implementation.ts`, mismo patrón que
`lib/domain/guided-flow.ts` del Sprint 5B): `resolveNextAction` decide la
acción de mayor prioridad y `resolveChecklist` arma el checklist de 17
pasos; ambas testeables sin BD con `npm run test:implementation`.

**Server Actions** (`server/actions/implementation.ts`): lecturas
`getImplementationDashboardAction`, `getImplementationChecklistAction`,
`getImplementationNextActionsAction`, `listImplementationFeedbackAction` y
mutaciones `createImplementationFeedbackAction`,
`updateImplementationFeedbackAction`,
`updateImplementationFeedbackStatusAction`,
`deleteImplementationFeedbackAction` — todas con cliente de servidor con
sesión, empresa activa validada (`requireActiveOrg`, nunca `organization_id`
del cliente), validación de enums en servidor y, cuando la entidad
relacionada del feedback es de un tipo validable (material, evidencia, lote
de entrada, orden/corrida, lote producido/lote final, cálculo), confirmación
de que pertenece a la empresa activa antes de guardar.

**UI**: nueva sección **Implementación** en la navegación.
`/implementation` («Implementación con empresa»): estado general (18
tarjetas), checklist de 17 pasos con estado/explicación/acceso directo,
siguiente acción recomendada, últimos cálculos y dossiers (con botones Ver
cálculo / Ver dossier / Registrar feedback) y feedback reciente.
`/implementation/feedback`: listar y filtrar por módulo/categoría/severidad/
estado, registrar, cambiar estado, editar y eliminar (según rol), con
prellenado desde `?module=…&related_entity_type=…&related_entity_id=…`.
Botones discretos «Registrar feedback…» agregados en flujo guiado, detalle
de cálculo de contenido reciclado, dossier técnico, evidencias y
trazabilidad. Estados vacíos útiles («No hay datos suficientes…», «Hay
materiales reciclados sin soporte de origen…», «Aún no hay lotes
calculables…», «Existen cálculos preliminares…») — nunca «listo para
certificación».

**Restricciones respetadas**: sin caso piloto, sin datos demo automáticos,
sin importador demo, sin Trazaloop Docs, sin constructor documental, sin
PDF server-side, sin módulo ISO 9001, sin módulo formal de auditorías, sin
planes de acción ni acciones correctivas, sin cambios de metodología de
cálculo ni de motor normativo, sin promesas de certificación.

**Documentación**: nueva `docs/COMPANY_TESTING_GUIDE.md` (los 17 pasos para
probar con una empresa real). `docs/DEMO_FLOW.md` y
`docs/PILOT_QA_CHECKLIST.md` aclaran que ese guion usa datos de
**demostración** y remiten a `/implementation` + `COMPANY_TESTING_GUIDE.md`
para la prueba con datos reales. `docs/STAGING_DEPLOYMENT.md` y
`docs/PREDEPLOY_CHECKLIST.md` actualizados con `NEXT_TELEMETRY_DISABLED`,
`test:implementation` y el rango de migraciones `0001` … `0034`.

**Pruebas**: `npm run test:implementation` (`tests/unit/implementation.test.ts`)
cubre los 12 casos de `resolveNextAction` (sin proveedores → `create_supplier`
… todo completo → `record_feedback`) y validaciones de feedback (crear
válido, rechazar severidad/módulo inválidos, rechazar título vacío, cambiar
estado, no aceptar `organization_id` del cliente). `test:compliance` amplía
el barrido a `docs/` y agrega el patrón «listo para certificación» a la
lista de frases prohibidas. `tests/rls/isolation.test.ts` suma los casos de
`implementation_feedback` (aislamiento de lectura/escritura entre empresas,
edición del feedback propio, borrado restringido a admin/quality, sin
asociación a organización ajena) — integrados en `test:rls` porque
requieren Postgres real con RLS activa.

## Sprint 7 · Carga masiva real de datos por CSV

Nueva sección **Importaciones** (`/imports`) para reducir la fricción de la
implementación real: una empresa carga sus datos reales desde plantillas
CSV, valida errores antes de importar, corrige y confirma — sin caso
piloto, sin datos demo automáticos y sin cambiar el motor de cálculo, la
metodología ni las reglas de evidencia.

**Migración `0035_import_job_rows.sql`:** amplía `import_jobs.entity`
(0021/0027) con las cinco entidades nuevas (`evidences`,
`production_orders`, `batch_consumption`, `output_batches`,
`batch_composition`) y agrega **`import_job_rows`** — detalle por fila
(`raw_data`/`normalized_data`/`errors`/`warnings`/`created_entity_id`) que
`import_jobs` no tenía. `import_jobs` sigue siendo append-only (un evento
por validación y otro por confirmación, igual que el importador de
catálogos del Sprint 2/3); `import_job_rows` sí es mutable mientras dura el
ciclo validar→confirmar, con RLS completa (select cualquier miembro,
insert/update admin·quality·consultant, delete solo admin/quality),
`prevent_organization_id_change` y FK compuesta hacia `import_jobs`.
Verificado sobre un PostgreSQL 16 efímero: las 35 migraciones aplican en
orden y un humo funcional confirmó la cascada completa (proveedor →
material sin soporte → evidencia pendiente → …) tras cada carga.

**Diez entidades importables** (proveedores, materiales, evidencias
—solo metadatos—, familias, productos, lotes de entrada, órdenes/corridas,
consumos, lotes producidos/lotes finales y composición), con **plantillas
estáticas vacías** en `public/templates/imports/` (solo encabezados, sin
filas demo) adaptadas al esquema real — no a una lista genérica; ver
`docs/IMPORTS_GUIDE.md` para el detalle de cada adaptación.

**Lógica pura** (`lib/imports/`: `types.ts`, `templates.ts`, `parse.ts`,
`normalizers.ts`, `validators.ts`), sin imports de Supabase ni de
`server-only`, testeable sin BD con `npm run test:imports`. Reutiliza
`parseCsv`/`toCsv` (Sprint 2) en vez de duplicar el parser. Rechaza de
plano cualquier archivo con columna `organization_id`; valida encabezado,
tipos, masas > 0, porcentajes 0–100, fechas y detecta duplicados internos
del archivo. Modo **"crear solamente"**: un registro que ya existe se
omite con advertencia, nunca se sobrescribe (documentado en
`docs/IMPORTS_GUIDE.md` §7).

**Server Actions** (`server/actions/imports.ts` +
`lib/db/imports.ts`): `getImportTemplatesAction`,
`downloadImportTemplateAction`, `validateImportCsvAction` (paso 1: parsea,
valida contra la empresa activa, registra el job y las filas — **cero**
escritura de negocio), `commitImportAction` (paso 2: solo recibe el
`import_job_id`; **relee y REVALIDA todo desde cero** contra el estado
actual de la base antes de escribir, así que nada que cambie entre validar
y confirmar puede colarse), `listImportJobsAction` y
`getImportJobDetailAction`. `organization_id` nunca se acepta del cliente;
solo admin/quality/consultant pueden importar; sin `service_role`.

**UI**: `/imports` (plantillas, subir/pegar CSV, vista previa con estado
por fila, errores/advertencias, confirmar, historial, enlaces cruzados) y
`/imports/[id]` (detalle fila por fila de una importación pasada). CTA
«Importar datos reales» agregado en `/implementation`; enlace cruzado desde
el importador de catálogos existente (`/catalog/import`, intacto, sin
tocar) hacia `/imports` para las entidades nuevas.

**Documentación**: nueva `docs/IMPORTS_GUIDE.md` (qué se puede/no se puede
importar, columnas por entidad y por qué se adaptaron, duplicados,
relaciones entre archivos, seguridad multiempresa).
`docs/COMPANY_TESTING_GUIDE.md`, `docs/PREDEPLOY_CHECKLIST.md` y
`docs/STAGING_DEPLOYMENT.md` actualizados con `test:imports` y el rango de
migraciones `0001` … `0035`.

**Pruebas**: `npm run test:imports` (`tests/unit/imports.test.ts`) cubre
los 15 casos mínimos del sprint (CSV válido, encabezado faltante,
`organization_id` rechazado, masa/porcentaje/fecha/clasificación
inválidos, duplicado interno, fila vacía ignorada, evidencia que nunca
queda `valid` sola, cantidades en 0 o negativas rechazadas, pureza del
paso de vista previa y revalidación fresca en el commit).
`tests/rls/isolation.test.ts` suma los casos de `import_job_rows`
(aislamiento entre empresas, confirmar en otra organización bloqueado, rol
sin permiso no puede importar) — integrados en `test:rls`.

## Sprint 7.1 · Endurecimiento y pulido

Sin módulos nuevos. Tres ajustes pequeños sobre la entrega del Sprint 7:

- **Encabezado CSV menos rígido**: el importador exigía TODAS las columnas
  de la plantilla, incluidas las opcionales. Ahora `lib/imports/parse.ts`
  valida el encabezado contra `requiredHeader(entity)` (nueva función en
  `lib/imports/templates.ts`, subconjunto de `templateHeader`): solo las
  columnas `required: true` son obligatorias; una opcional ausente del
  encabezado se trata como valor vacío/null fila por fila (los
  normalizadores de `lib/imports/normalizers.ts` ya aceptaban `undefined`,
  así que no hizo falta tocar los validadores). La plantilla descargable
  (`templateHeader`, los CSV de `public/templates/imports/`) sigue trayendo
  todas las columnas sin cambios.
- **`0036_import_jobs_rls_hardening.sql`**: la política de INSERT de
  `import_jobs` (0021) permitía a cualquier miembro activo registrar un
  evento de importación, sin importar su rol. Ahora exige
  admin/quality/consultant, igual que `import_job_rows` (0035) y el resto
  de tablas de negocio. Sin cambios de estructura, sin política de
  UPDATE/DELETE (`import_jobs` sigue append-only) y sin tocar
  `import_job_rows`. Verificado sobre un PostgreSQL 16 efímero: admin y
  consultant siguen pudiendo importar igual que antes; un rol de prueba
  fuera de esos tres queda bloqueado por RLS al insertar, pero conserva
  lectura del historial.
- **Documentación de demo separada con más claridad**: `docs/IMPORTS_GUIDE.md`
  y `docs/COMPANY_TESTING_GUIDE.md` ya no presentan `npm run seed:demo` /
  `docs/DEMO_FLOW.md` como parte del flujo con empresas reales; quedan como
  nota técnica interna claramente aparte, sin promoverse como camino
  recomendado.

## Sprint 8 · Gestión de usuarios, invitaciones y roles por empresa

Nueva sección **Equipo** (`/team`) para que una empresa administre su
propio equipo: ver miembros, invitar, cambiar roles, desactivar/reactivar
accesos — respetando multiempresa y RLS. Reutiliza TODO lo que ya existía
(profiles, organizations, memberships con su columna `status` ya presente
desde el Sprint 1, los 3 roles reales admin/quality/consultant, y los
helpers `is_org_member`/`has_org_role`/`is_org_admin`): no se duplicó
ninguna estructura.

**Migración `0037_team_invitations.sql`:**

- **`team_invitations`**: tabla nueva con RLS completa (select
  admin/quality/consultant, insert/update solo admin, sin delete —
  histórico vía `status`), único índice parcial que impide dos
  invitaciones pendientes al mismo correo por empresa, y los triggers
  obligatorios (`prevent_organization_id_change`, `set_updated_at`,
  `force_invited_by` —nuevo, mismo patrón que `force_created_by`—,
  `audit_row_change`).
- **`guard_last_admin()`**: trigger nuevo sobre `memberships` (tabla
  existente) que bloquea, a nivel de base de datos, quitar el rol admin o
  desactivar al **último** administrador activo de una empresa —
  verificado exhaustivamente contra PostgreSQL real (bloquea con un solo
  admin, permite con un segundo admin activo, vuelve a bloquear si ese
  segundo también se degrada).
- **`accept_team_invitation(token)`** (RPC `security definer`, mismo
  patrón que `create_organization`): única vía para aceptar una
  invitación — valida token, estado, expiración y coincidencia exacta de
  correo antes de crear la membership; nunca acepta `organization_id` del
  cliente (todo sale del token).
- **`get_invitation_preview(token)`** (RPC `security definer`, solo
  `authenticated`): vista previa segura (empresa, rol, expiración) para
  `/accept-invite` antes de aceptar, sin exigir membership.

Verificado sobre un PostgreSQL 16 efímero: las 37 migraciones aplican en
orden, y un humo funcional confirmó invitación → email distinto rechazado
→ email correcto aceptado (membership creada con el rol invitado) →
doble-aceptación rechazada → invitación expirada rechazada → guard del
último admin en sus cuatro variantes (demover, suspender, con un segundo
admin, y volver a bloquear si ese segundo se degrada también).

**Lógica pura** (`lib/domain/team.ts`, mismo patrón que
`lib/domain/guided-flow.ts` e `implementation.ts`): roles y su
descripción (solo los 3 reales — sin inventar "user" ni "viewer" porque el
catálogo `roles` no los tiene), validación de invitación, validación de
aceptación y `wouldRemoveLastActiveAdmin` — el mismo espejo en TypeScript
del trigger `guard_last_admin`, testeable sin BD con `npm run test:team`.

**Server Actions** (`server/actions/team.ts` + `lib/db/team.ts`):
`getTeamOverviewAction`, `listOrganizationMembersAction`,
`listTeamInvitationsAction`, `getInvitationPreviewAction`,
`createTeamInvitationAction`, `revokeTeamInvitationAction`,
`acceptTeamInvitationAction`, `updateMemberRoleAction`,
`deactivateMemberAction`, `reactivateMemberAction` — `organization_id`
nunca sale del cliente; solo admin invita/cambia roles/desactiva; el
guard del último admin se valida además en servidor (mensaje claro) antes
de que el trigger lo bloquee de todas formas.

**UI**: `/team` (organización activa, miembros con cambio de rol y
desactivar/reactivar, invitaciones con revocar, formulario de invitar con
enlace copiable, explicación de roles) y `/accept-invite` (ruta pública
fuera del shell, sin tocar el flujo de login/registro existente: si no
hay sesión, pide iniciar sesión y volver al mismo enlace; con sesión,
muestra la vista previa, avisa si el correo no coincide, y permite
aceptar). Tarjeta **"Definir equipo de prueba"** agregada en
`/implementation` de forma aditiva (sin tocar el checklist de 17 pasos
del Sprint 6).

**Documentación**: nueva `docs/TEAM_MANAGEMENT_GUIDE.md` (roles, invitar,
aceptar, cambiar roles, retirar acceso, por qué no se puede quitar el
último admin, cómo usar Equipo en la prueba real).
`docs/COMPANY_TESTING_GUIDE.md`, `docs/PREDEPLOY_CHECKLIST.md` y
`docs/STAGING_DEPLOYMENT.md` actualizados con `test:team` y el rango de
migraciones `0001` … `0037`.

**Pruebas**: `npm run test:team` (`tests/unit/team.test.ts`) cubre los 12
casos mínimos del sprint más 6 adicionales (correo inválido, rango de rol,
determinismo de expiración, checklist de equipo). `tests/rls/isolation.test.ts`
suma los casos de `team_invitations` (aislamiento de lectura/escritura
entre empresas, no se acepta invitación de otra organización, no se
cambia rol de miembro de otra organización, usuario no miembro no ve
equipo) — integrados en `test:rls`.

## Sprint 8.1 · Build: rastreo de archivos acotado a la raíz del proyecto

Sin módulos nuevos. Un ajuste sobre el build tras el Sprint 8:

- **`next.config.ts`**: `outputFileTracingRoot: process.cwd()` (estable
  desde Next 15) fija explícitamente la raíz que usa `@vercel/nft` para
  «Collecting build traces», evitando que Next.js la infiera caminando
  hacia arriba en el árbol de directorios — inferencia que en entornos con
  estructuras de carpetas fuera de lo común puede volverse muy lenta o no
  terminar. `outputFileTracingExcludes` además saca `tests/`, `scripts/`,
  `supabase/` y `docs/` del rastreo (ninguna ruta de la app las necesita
  en su bundle de servidor). Verificado: el build sigue terminando en
  ~1 minuto, y los `.nft.json` generados ya no referencian esas carpetas.
- **`components/domain/team/member-list.tsx`**: ajuste de UX — la tabla de
  miembros de `/team` ya no se oculta cuando solo hay un miembro; siempre
  muestra al usuario actual, con el aviso «Invita a tu equipo…» debajo en
  vez de reemplazar la tabla.

Se revisó exhaustivamente el código nuevo del Sprint 8 (páginas, server
actions, lógica pura, componentes) en busca de imports top-level
problemáticos, llamadas a Supabase fuera de funciones, generación de
tokens fuera de funciones y promesas sin resolver — no se encontró ninguno
de esos patrones. `--webpack` (Sprint 7.1) se mantiene: sigue siendo la
mitigación oficial de Next.js para un teardown defectuoso conocido de
Turbopack en builds de producción de la serie 16.2.x, documentado aparte
del ajuste de rastreo de este sprint.

## Decisiones y riesgos pendientes

0. **`test:rls` requiere Supabase local con Docker** (no ejecutable en todo entorno; ver sección de pruebas).
1. **Confirmación de correo**: decidir si el proyecto exige confirmación (afecta el flujo post-registro; la UI ya contempla ambos casos).
2. **Cookie de empresa activa**: es conveniencia de UI; la barrera es RLS + revalidación de membership en servidor. Endurecimiento futuro: claim en JWT.
3. **Políticas de Storage por SQL**: según plan/entorno puede requerir crearlas por Dashboard (documentado en `0015`).
4. **`audit_row_change` en `organizations`**: registra el propio `id` como `organization_id` (documentado en la función).
5. **Invitación de usuarios**: en Sprint 1 un admin solo puede agregar memberships de usuarios ya registrados; el flujo de invitación por correo queda para un sprint posterior.
