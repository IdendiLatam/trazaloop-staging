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

## Corrección de onboarding · Usuarios invitados ya no son forzados a crear empresa

Bug encontrado tras el Sprint 8: `signInAction`/`signUpAction` redirigían
siempre a `/dashboard`/`/select-org` sin revisar si la persona ya tenía
membership o invitación pendiente; y `/select-org`, con cero memberships,
solo mostraba "Crea tu primera empresa" — **sin mencionar la invitación
pendiente en absoluto** si el usuario no conservaba el enlace. Sin módulos
nuevos; sin caso piloto ni datos demo; sin cambios de cálculo ni
metodología.

**Migración `0038_my_pending_invitations.sql`**: agrega la pieza que
faltaba — `list_my_pending_invitations()` (RPC `security definer`, solo
`authenticated`), que resuelve `auth.uid() → profiles.email`
internamente y devuelve las invitaciones pendientes y vigentes **del
propio usuario**, sin necesitar conocer el token de antemano (la única
vía existente, `get_invitation_preview`, exige ya tener el token). No
cambia `team_invitations` ni su RLS. Verificado sobre PostgreSQL 16 real:
un usuario sin membership en ninguna empresa ve sus invitaciones de
**dos** empresas distintas; un usuario no invitado ve cero; una invitación
expirada no aparece.

**Lógica pura** (`lib/domain/team.ts`): `resolvePostAuthDestination` —
espejo puro de la decisión de a dónde ir después de autenticarse (Caso A:
con membership → nunca a crear empresa; Caso B: sin membership pero con
invitación → a aceptarla, o a elegir si hay varias; Caso C: sin nada → a
crear empresa) — e `isSafeAcceptInviteNext`, una lista blanca angosta
(solo rutas que empiecen por `/accept-invite`) para el parámetro `next`
de login/registro, evitando un open redirect.

**`server/actions/auth.ts`**: `signInAction`/`signUpAction` ahora aceptan
`next` (preservado end to end desde `/accept-invite` → login/registro →
de vuelta), y cuando no hay `next` calculan el destino con
`getPostAuthDestinationAction` (nuevo, en `server/actions/team.ts`) en
vez de redirigir a ciegas.

**UI**: `/select-org` ya no dice "crea tu primera empresa" cuando hay una
invitación pendiente — la muestra con un botón «Aceptar invitación»
directo (reutilizando `AcceptInviteForm` del Sprint 8), y con exactamente
una invitación y cero empresas manda directo a `/accept-invite`. Los
enlaces de login/registro dentro de `/accept-invite` ahora sí preservan el
destino (antes solo pedían "vuelve a abrir este enlace" sin mecanismo
real). `/accept-invite` redirige con aviso claro si la invitación ya se
había aceptado antes, en vez de dejar a la persona en una pantalla sin
salida.

**Pruebas**: `npm run test:team` suma 12 casos nuevos (30 en total) sobre
la resolución de destino post-auth y la lista blanca de `next` — sin BD,
mismo patrón que el resto del sprint.

## Sprint 8.3 · Configuración de empresa y perfil de usuario

Usuarios autorizados pueden editar datos básicos de la empresa activa, y
cada usuario puede editar su propio perfil — sin tocar Supabase
manualmente. Sin caso piloto, sin datos demo, sin cambios de cálculo ni
metodología.

**Hallazgo clave al revisar la estructura existente**: `organizations`
(name, tax_id, country) y `profiles` (full_name, email) ya tenían la RLS
correcta desde el Sprint 1 — `organizations_update` exige
`is_org_admin(id)`, `profiles_update` exige `id = auth.uid()`. Este sprint
**no crea ninguna política ni trigger nuevo**: solo agrega las columnas
que faltaban con `ALTER TABLE`, que las políticas y el trigger de
auditoría (`audit_row_change`, ya adjunto a `organizations`) cubren
automáticamente por ser genéricos (RLS es por fila, no por columna;
`audit_row_change` serializa con `to_jsonb()`).

**Migración `0039_company_and_profile_settings.sql`**: agrega a
`organizations` → `legal_name`, `contact_email`, `phone`, `address`,
`city`, `website` (no duplica `name`, `tax_id`, `country`, que ya
existían); agrega a `profiles` → `phone`, `position` (no duplica
`full_name`, `email`). Sin `avatar_url`: no hay soporte de carga de
archivos todavía, no se implementó a propósito. Verificado sobre
PostgreSQL 16 real: admin edita la empresa, consultant queda bloqueado por
RLS, un usuario edita su propio perfil, el mismo usuario NO puede editar
el de otro, y `audit_log` recoge las columnas nuevas sin cambios.

**Lógica pura** (`lib/domain/settings.ts`): `canEditCompany` (solo admin),
`canEditProfile` (solo el propio), `validateCompanySettings` /
`validateProfileSettings`, y `buildCompanySettingsUpdatePayload` /
`buildProfileUpdatePayload` — mismo patrón que
`buildInvitationInsertPayload` (Sprint 8): el tipo de entrada ni siquiera
declara un campo de identidad (`organization_id`/`id`/`user_id`/`email`),
así que no hay forma de que un intento de manipularlo llegue a alguna
parte que lo use. Reutiliza `isValidEmail`/`normalizeEmail` de
`lib/domain/team.ts` en vez de duplicarlos.

**Server Actions** (`server/actions/settings.ts` + `lib/db/settings.ts`):
`getCompanySettingsAction`, `updateCompanySettingsAction`,
`getMyProfileAction`, `updateMyProfileAction` — el `organization_id` del
UPDATE de empresa siempre sale de `requireActiveOrg()`, el id de perfil
siempre de `requireSession()`; ninguno de los dos se lee jamás de un
campo del formulario. Sin `service_role`.

**UI**: `/settings/company` («Datos de empresa», editable solo por admin;
quality/consultant ven un resumen de solo lectura con el aviso
correspondiente) y `/settings/profile` («Mi perfil», con el correo de
autenticación en solo lectura y su aviso). Enlaces cruzados desde la barra
superior del shell, la navegación principal, `/team` («Mi perfil») e
internamente entre ambas pantallas de configuración.

**Documentación**: nueva `docs/SETTINGS_GUIDE.md`.
`docs/TEAM_MANAGEMENT_GUIDE.md`, `docs/COMPANY_TESTING_GUIDE.md` y
`docs/PREDEPLOY_CHECKLIST.md` actualizados con `test:settings` y el rango
de migraciones `0001` … `0039`.

**Pruebas**: `npm run test:settings` (`tests/unit/settings.test.ts`) cubre
los 12 casos mínimos del sprint (más 2 adicionales) sobre permisos,
validación de datos de empresa/perfil y la garantía estructural de que
ningún payload construido puede transportar `organization_id`, `id`,
`user_id` ni `email`.

## Sprint 8.4 · Superadministrador de plataforma y restricción de creación de empresas

Separa dos niveles de administración que antes no existían como conceptos
distintos: administración de UNA empresa (ya cubierta por `memberships` y
`/team` desde el Sprint 8) y administración INTERNA de la plataforma
Trazaloop (nueva, `platform_staff`). Sin caso piloto, sin datos demo, sin
cambios de cálculo ni metodología.

**Decisión de arquitectura (Parte 1)**: `platform_staff` es una tabla
**completamente separada** de `memberships` — nunca `memberships.role_code
= 'superadmin'`. `PLATFORM_ROLES` (`superadmin`, `support`) y `TEAM_ROLES`
(`admin`, `quality`, `consultant`) son conjuntos disjuntos a propósito,
verificado tanto en TypeScript (`PLATFORM_AND_TEAM_ROLES_ARE_DISJOINT`)
como en la base (el `role_code` de `memberships` referencia la tabla
`roles`, que solo tiene los 3 roles de empresa; el de `platform_staff`
tiene su propio CHECK con solo `superadmin`/`support`). Se aprovechó para
renombrar la ETIQUETA visible de `quality` → **Supervisor** (antes
"Responsable de calidad") y `consultant` → **Consultor** (antes "Consultor
externo") — el `role_code` interno no cambió, se deduplicó además el mapa
de etiquetas (`RoleBadge` en `components/ui/badge.tsx` ahora importa
`ROLE_LABEL` de `lib/domain/team.ts` en vez de mantener su propia copia).

**Migraciones**:

- **`0040_platform_staff.sql`**: tabla `platform_staff` (RLS: el propio
  registro o cualquiera si eres superadmin; insert/update solo superadmin;
  sin delete), helpers `is_platform_staff()`/`is_platform_superadmin()`
  (mismo patrón que `is_org_member`/`is_org_admin` del Sprint 1), y
  `add_platform_staff(email, role)` (RPC `security definer`: el superadmin
  normalmente NO comparte ninguna empresa con la persona que agrega —es
  personal interno, no de un cliente— así que la RLS normal de `profiles`
  no le dejaría resolver el correo; la RPC sí, tras validar
  `is_platform_superadmin()`). **Bootstrap intencional**: la política de
  INSERT exige ya ser superadmin, así que NADIE puede autoasignarse el
  primer registro desde la app — se documenta el único camino real (SQL
  directo) en `docs/PLATFORM_ADMIN_GUIDE.md`.
- **`0041_platform_views.sql`**: `v_platform_organizations`, la única vista
  del proyecto que se deja **sin** `security_invoker` a propósito (corre
  con privilegios de definidor para poder ver TODAS las empresas a la
  vez), con su propia guarda `where is_platform_staff()` — un usuario
  normal obtiene cero filas, nunca una fuga parcial. Solo cuenta y resume
  (miembros, materiales, evidencias, lotes producidos, cálculos, feedback
  abierto/crítico): no recalcula contenido reciclado.
- **`0042_restrict_organization_creation.sql`**: reemplaza
  `create_organization` (0006) agregando 3 guardas — ya tiene membership
  activa, ya creó una empresa antes, o tiene invitación pendiente — que
  bloquean a un usuario normal (nunca a un `platform_superadmin`, Caso D).
  Agrega `create_platform_organization(...)`, la RPC que usa la consola de
  plataforma: crea la empresa y, según si el correo del administrador
  inicial ya tiene cuenta o no, vincula la membership de inmediato o crea
  una invitación pendiente (mismo mecanismo del Sprint 8, nunca envía
  correo real).

Verificado sobre PostgreSQL 16 real: bootstrap del primer superadmin
bloqueado por RLS para cualquier usuario normal y solo posible por SQL
directo; superadmin ve TODAS las empresas vía la vista, un usuario normal
ve cero; usuario normal crea su primera empresa, la segunda queda
bloqueada con el mensaje correcto, una invitación pendiente también la
bloquea; ambas ramas de `create_platform_organization` (administrador ya
existía → membership creada; no existía → invitación con token generado)
confirmadas con datos reales; superadmin revocado pierde acceso a la vista
de inmediato; `memberships` rechaza `role_code = 'superadmin'` por FK. Un
bug real de ambigüedad de columna (`organization_id` colisionaba con el
nombre de la columna de salida de la RPC) se encontró y corrigió durante
esta verificación.

**Server Actions** (`server/actions/platform.ts` + `lib/db/platform.ts`
+ `lib/auth/require-platform-staff.ts`): `getPlatformOverviewAction`,
`listPlatformOrganizationsAction`, `getPlatformOrganizationDetailAction`,
`createPlatformOrganizationAction`, `listPlatformStaffAction`,
`addPlatformStaffAction`, `updatePlatformStaffStatusAction` —
`requirePlatformStaff()` (mismo patrón que `requireActiveOrg`) exige
sesión + `platform_staff` activo antes de cualquier cosa; las acciones de
escritura además exigen superadmin. `organization_id` nunca sale del
cliente al crear una empresa: la RPC la genera y devuelve su id real.

**UI**: `/platform` (resumen, empresas registradas con sus métricas,
personal de plataforma), `/platform/organizations/new` (crear empresa,
solo superadmin) y `/platform/organizations/[id]` (resumen de
implementación de solo lectura — "Parte 7, opción aceptable": nunca cambia
la organización activa del superadmin, no hay "entrar como soporte" en
este sprint, opción avanzada explícitamente pospuesta). "Plataforma" en la
navegación aparece **solo** si `is_platform_staff()` es verdadero —
calculado en el layout del shell, nunca de forma estática.

**Documentación**: nueva `docs/PLATFORM_ADMIN_GUIDE.md` (diferencia entre
los dos niveles de administración, cómo crear el primer superadmin,
qué puede hacer cada rol de plataforma, riesgos de acceso y auditoría).
`docs/TEAM_MANAGEMENT_GUIDE.md`, `docs/SETTINGS_GUIDE.md`,
`docs/COMPANY_TESTING_GUIDE.md` y `docs/PREDEPLOY_CHECKLIST.md`
actualizados con las nuevas etiquetas de rol, `test:platform` y el rango
de migraciones `0001` … `0042`.

**Pruebas**: `npm run test:platform` (`tests/unit/platform.test.ts`) cubre
los 14 casos mínimos del sprint más 2 adicionales. `tests/rls/isolation.test.ts`
suma 5 casos (55-59) que bootstrapean un superadmin por SQL directo — igual
que en producción — y verifican aislamiento de `platform_staff`,
visibilidad total vs. cero filas de `v_platform_organizations`, bloqueo de
segunda empresa, pérdida de acceso al revocar, y rechazo de `superadmin`
como `role_code` de membership.

## Corrección de arquitectura de plataforma (post Sprint 8.4)

Dos bloqueantes encontrados antes de integrar el Sprint 8.4, corregidos.
Sin módulos nuevos, sin caso piloto, sin datos demo, sin cambios de
cálculo ni metodología.

**Bloqueante 1 — `/platform` dependía de empresa activa.** Vivía dentro de
`app/(app)/(shell)/platform`, y ese shell exige `getActiveOrganization()`
+ redirect a `/select-org` si no hay empresa activa — un superadmin sin
ninguna empresa quedaba bloqueado antes de que su propia
`requirePlatformStaff()` llegara a ejecutarse. Corregido moviendo las 3
rutas a `app/(app)/platform/` (fuera del shell de empresa, mismas URLs:
los grupos de rutas de Next.js no cambian la URL) con un layout propio
(`app/(app)/platform/layout.tsx`) que exige solo sesión + `platform_staff`
activo — nunca organización activa. Verificado con un build real: las 3
rutas siguen resolviendo igual, ahora sin la dependencia.

**Bloqueante 2 — `/select-org` ofrecía "Crear empresa" a quien ya no
podía.** El formulario se mostraba siempre, sin importar si el usuario ya
tenía empresas o invitaciones pendientes — contradecía la restricción del
propio Sprint 8.4. Corregido con una función pura nueva
(`resolveSelectOrgDisplay`, `lib/domain/platform.ts`, testeada): el
formulario solo aparece sin organizaciones y sin invitaciones; con
organizaciones se muestra el mensaje `ALREADY_HAS_ORG_MESSAGE`; con
invitación pendiente (y sin organizaciones), `HAS_PENDING_INVITATION_MESSAGE`
— ambas constantes ya existentes, una sola fuente de verdad compartida con
`create_organization`. El enlace "Ir a administración de plataforma" ahora
aparece para cualquier `platform_staff`, tenga o no empresa.

**Bloqueante 3 — `createOrganizationAction` ocultaba los errores de
negocio.** Todo error de la RPC `create_organization` cambiaba a "No fue
posible crear la empresa. Intenta de nuevo.", incluidos los dos mensajes
de negocio reales que el propio Sprint 8.4 agregó. Corregido con
`toSafeOrgCreationError` (`lib/domain/platform.ts`, testeada): una lista
**blanca** de exactamente los 2 mensajes de negocio conocidos — cualquier
otro texto (técnico, interno, desconocido) sigue cayendo al mensaje
genérico, nunca se reenvía texto de error arbitrario de la base.

**Observación — módulo `docs` activado por defecto.** `create_organization`
y `create_platform_organization` activaban `core`, `traceability_6632` y
`docs` para toda empresa nueva; el dashboard muestra un badge por cada
módulo activo, así que `docs` aparecía como si "Trazaloop Docs" fuera una
función real. Se quitó `docs` de la lista de módulos base en ambas
funciones (`0042_restrict_organization_creation.sql`, la migración que ya
las reemplaza) — la fila del catálogo `modules` sigue existiendo, solo ya
no se activa automáticamente. Verificado con datos reales contra
PostgreSQL: ambos caminos de creación de empresa ahora solo activan `core`
y `traceability_6632`.

**Pruebas**: `npm run test:platform` suma 10 casos nuevos (26 en total)
sobre estas tres correcciones — sin BD, mismo patrón que el resto del
sprint.

## Sprint 9 · TrazaDocs MVP — documentos vivos guiados por secciones

Primer sprint de TrazaDocs: cada empresa puede construir, diligenciar,
guardar, editar, versionar, aprobar y consultar documentos técnicos
**dentro** de Trazaloop. Nunca es una biblioteca de Word/PDF
descargables, ni obliga a bajar un archivo para editarlo fuera de la
plataforma. Sin caso piloto, sin datos demo, sin cambios de cálculo ni
metodología, sin PDF server-side, sin ISO 9001 completo, sin módulo
formal de auditorías.

**Migraciones**:

- **`0043_trazadocs_core.sql`**: 6 tablas — `trazadoc_blueprints` /
  `trazadoc_blueprint_sections` (estructuras sugeridas GLOBALES, solo
  editables por `platform_superadmin`) y `trazadoc_documents` /
  `trazadoc_document_sections` / `trazadoc_document_versions` /
  `trazadoc_status_history` (documentos de cada empresa, org-scoped, con
  FK compuesta a `trazadoc_documents(organization_id, id)`). RLS con la
  MISMA regla de rol por estado en 4 tablas a la vez: admin/quality sin
  restricción; consultant solo mientras el documento está
  draft/in_review, nunca aprueba ni marca obsoleto ni toca un documento ya
  aprobado directamente.
- **`0044_trazadocs_seed_blueprints.sql`**: **11 estructuras sugeridas**
  (manual técnico, 8 procedimientos, 2 instructivos) con **110 secciones**
  y sus tips — generado con un script temporal (borrado tras producir el
  SQL) para evitar errores de transcripción en ~120 filas. No es un caso
  piloto ni datos demo: son estructuras y ayudas de plataforma, sin
  contenido diligenciado de ninguna empresa.
- **`0045_trazadocs_views.sql`**: `v_trazadoc_document_summary` y
  `v_trazadoc_blueprint_summary`, ambas `security_invoker = true` (heredan
  la RLS real, a diferencia de `v_platform_organizations`). Solo cuentan y
  resumen: no recalculan nada del motor de contenido reciclado.
- **`0046_trazadocs_status_transitions.sql`**: `change_trazadoc_document_status`,
  RPC `security definer` que hace atómico lo que necesita 3 tablas a la
  vez (snapshot de versión + historial de estado + actualización del
  documento) — mismo patrón que `create_organization` /
  `accept_team_invitation` / `create_platform_organization`. Valida rol
  por dentro además de la RLS (defensa en profundidad: un consultant no
  puede aprobar ni por RLS ni por la RPC).

Verificado exhaustivamente contra PostgreSQL 16 real: documento creado
desde blueprint con sus secciones copiadas vacías; consultant edita
contenido en borrador pero es bloqueado (por RLS Y por la RPC) al intentar
aprobar; admin aprueba y el snapshot de versión captura el contenido real;
consultant queda bloqueado de editar un documento ya aprobado; admin puede
marcarlo obsoleto; aislamiento cruzado de empresa confirmado en
documentos, secciones y versiones; superadmin edita blueprints/tips
globales, un admin de empresa normal NO puede. Un bug real de ambigüedad
de columna en la RPC (`organization_id` colisionaba con el parámetro de
salida) se encontró y corrigió durante esta verificación, igual que un
falso positivo de compliance (“estuviera” contiene la subcadena “tuv”) en
uno de los 110 hints generados.

**Lógica pura** (`lib/domain/trazadocs.ts`): permisos por rol y estado
(`canEditDocument`, `canApproveDocument`, `canMarkObsolete`,
`canReactivateDocument` — más estricta que la RLS en un punto a propósito:
ni admin edita un documento obsoleto directamente sin reactivarlo
primero), construcción de secciones desde blueprint siempre con
contenido vacío, validación de documento/sección libres,
`resolveNextVersionNumber` (siempre creciente, nunca reutiliza), permisos
de plataforma (`canEditBlueprint`, solo superadmin) y el checklist de
Implementación — reutiliza el mismo `ChecklistStatusBadge` del Sprint 6
(mismos 3 valores exactos, no se crea un badge nuevo para lo mismo).

**Server Actions** (`server/actions/trazadocs.ts` + `lib/db/trazadocs.ts`
+ `lib/db/trazadocs-platform.ts`): lado empresa (listar, crear desde
blueprint o libre, editar secciones, agregar sección, transiciones de
estado, versiones) y lado plataforma (listar/crear/editar blueprints y
sus secciones/hints) — `requireActiveOrg()` para lo primero,
`requirePlatformStaff()` + superadmin para lo segundo. `organization_id`
nunca sale del cliente al crear un documento.

**UI empresa**: `/trazadocs` (listado con estados y accesos rápidos),
`/trazadocs/new` (estructuras sugeridas — nunca llamadas "plantillas
descargables" — o documento libre), `/trazadocs/[id]` (vista + botones de
transición de estado), `/trazadocs/[id]/edit` (editor por secciones: cada
una con título, textarea, botón **i** con su tip, e indicador de
obligatoria/vacía), `/trazadocs/[id]/versions` (historial, cada versión
un snapshot inmutable) y `/trazadocs/[id]/print` (vista limpia
imprimible, botón "Imprimir / guardar como PDF" vía `window.print()` —
reutiliza el mismo `PrintButton` del Sprint 5A, bajo el mismo grupo de
rutas `(print)` ya establecido, sin PDF server-side). Tarjeta "Documentos
técnicos mínimos creados" agregada en `/implementation` de forma aditiva
(sin tocar el checklist de 17 pasos del Sprint 6); nunca bloquea el
cálculo.

**UI plataforma**: `/platform/trazadocs` (listar/crear estructuras) y
`/platform/trazadocs/[id]` (editar estructura + secciones + tips,
activar/desactivar) — dentro de `app/(app)/platform/`, con el mismo
layout sin dependencia de empresa activa establecido en la corrección
post Sprint 8.4.

**Documentación**: nueva `docs/TRAZADOCS_GUIDE.md`. `docs/PLATFORM_ADMIN_GUIDE.md`,
`docs/COMPANY_TESTING_GUIDE.md` y `docs/PREDEPLOY_CHECKLIST.md`
actualizados con `test:trazadocs` y el rango de migraciones `0001` …
`0046`.

**Pruebas**: `npm run test:trazadocs` (`tests/unit/trazadocs.test.ts`)
cubre los 17 casos mínimos del sprint más 4 adicionales.
`tests/rls/isolation.test.ts` suma 9 casos (60-68, con bootstrap directo
de superadmin) sobre aislamiento de documentos/secciones/versiones entre
empresas, bloqueo de aprobación por consultant (RLS y RPC), aprobación por
admin, y edición de blueprints/tips global solo por superadmin.

## Sprint 9.1 · Corrección de control documental TrazaDocs

Cuatro brechas de control documental encontradas y corregidas antes de
integrar el Sprint 9. Sin módulos nuevos, sin caso piloto, sin datos demo,
sin PDF server-side, sin ISO 9001 completo, sin cambios de cálculo ni
metodología.

**Bloqueante 1 — Sin versión inicial real.** Un documento nuevo quedaba
con `current_version = 1` en su propia fila, pero **sin ninguna fila real**
en `trazadoc_document_versions`. Corregido: `insertInitialVersion`
(`lib/db/trazadocs.ts`) inserta "v1 — Borrador inicial" justo después de
crear el documento y sus secciones — para ambos caminos
(`createDocumentFromBlueprintAction` y `createCustomDocumentAction`), con
secciones vacías incluidas en el snapshot cuando vienen de un blueprint, o
un arreglo vacío para un documento libre recién creado. Idempotente: si v1
ya existe (`unique(document_id, version_number)`), el conflicto se trata
como éxito silencioso, no como error.

**Bloqueante 2 — "Guardar nueva versión" no estaba en la UI.** La acción
(`createDocumentVersionAction`) ya existía desde el Sprint 9 pero no había
ningún botón que la llamara. Se agregó un formulario en
`DocumentStatusActions` con una nota de cambio opcional, visible mientras
el documento es editable — mantiene el estado actual y solo agrega un
snapshot nuevo.

**Bloqueante 3 — Documentos aprobados se editaban directamente.** Este
era el hallazgo más serio: `trazadoc_documents_update` y
`trazadoc_document_sections_update` (0043) dejaban a admin/quality editar
el contenido de un documento **aprobado** sin pasar por una versión nueva.
Corregido en `0047_trazadocs_version_control.sql`: ambas políticas ahora
exigen `status in ('draft','in_review')` para los TRES roles por igual —
sin excepción para admin/quality. Al revisar el flujo completo, además
encontré un segundo gap real en la RPC `change_trazadoc_document_status`:
el guarda de `consultant` solo miraba el estado **destino**
(`p_to_status not in ('draft','in_review')`), nunca el estado **de
origen** — así que un consultant SÍ podía "reabrir" un documento ya
aprobado moviéndolo a `draft`, porque `draft` es un destino permitido.
Verificado con datos reales antes y después del fix. Se agregó
`canCreateDraftVersionFromApproved` (solo admin/quality) y la acción
`createDraftVersionFromApprovedAction`: la única vía para volver a tocar
un documento aprobado es crear una versión nueva en borrador a partir de
él — nunca editarlo in place.

**Bloqueante 4 — Documento obsoleto (mantenido).** Ya bloqueaba edición
directa desde el Sprint 9; se confirmó que reactivar (`obsolete` → `draft`)
sigue generando un snapshot de versión claro vía la misma RPC.

Verificado end-to-end contra PostgreSQL 16 real con una corrida completa
de 8 versiones (v1 borrador inicial → v2 guardar cambios → v3 enviar a
revisión → v4 aprobar → v5 nueva versión en borrador desde aprobado → v6
aprobar de nuevo → v7 obsoleto → v8 reactivar): ninguna versión se
sobrescribió, el historial de estados coincide exactamente, y el
documento final quedó con el estado y la versión correctos.

**Pruebas**: `npm run test:trazadocs` suma 10 casos nuevos (31 en total).
`tests/rls/isolation.test.ts` suma 2 casos (69-70) confirmando que ni
admin puede editar un aprobado directamente ni consultant puede reabrirlo
por ninguna vía, con admin creando la nueva versión en borrador
correctamente.

## Sprint 9.2 · Pulido UX, navegación y control documental de TrazaDocs

Ocho mejoras de experiencia antes de probar TrazaDocs con empresas
reales. Sin módulos nuevos grandes, sin caso piloto, sin datos demo, sin
PDF server-side, sin ISO 9001 completo, sin auditorías ni acciones
correctivas, sin cambios de cálculo ni metodología.

**Migraciones**:

- **`0048_trazadocs_ux_hardening.sql`**: 2 índices únicos parciales
  (`organization_id, lower(trim(title))` y `organization_id, blueprint_id
  where blueprint_id is not null`) — seguro de aplicar porque no existe
  ningún dato de empresa real en `trazadoc_documents` todavía. Además
  agrega la política `trazadoc_documents_delete` que faltaba (0043 decía
  "preferir no permitir delete"): ahora sí, acotada a `status = 'draft'`,
  con admin/quality sin restricción y consultant solo sobre su propio
  `created_by`. Las FK compuestas a secciones/versiones/historial ya
  tenían `on delete cascade` desde 0043, así que un solo `DELETE` se
  lleva todo.
- **`0049_organization_assets_storage.sql`**: bucket privado nuevo
  `organization-assets` (separado de `evidences`, 0015 — un logo no es
  una evidencia técnica), mismo patrón exacto de políticas por
  `(storage.foldername(name))[1]` como organization_id. Lectura para
  cualquier miembro de la empresa (y platform_staff, soporte);
  subir/reemplazar/eliminar solo admin. `organizations` gana
  `logo_storage_path` y `logo_updated_at` — nunca se persiste una URL
  pública, la URL firmada se genera bajo demanda en servidor.

Verificado contra PostgreSQL 16 real: título duplicado (case/espacio-
insensitive) rechazado dentro de la misma empresa pero permitido en otra;
blueprint duplicado rechazado; consultant borra solo su propio draft,
bloqueado en el de un admin; documento aprobado/obsoleto protegido de
DELETE; cascada confirmada (secciones y versiones desaparecen con el
documento). **Hallazgo real de infraestructura de pruebas**: el mock local
de `storage.objects` nunca tenía RLS habilitada (a diferencia de un
proyecto Supabase real, donde ya viene activada) — mis primeras pruebas
de las políticas de `organization-assets` pasaban de forma falsa. Corregido
el script de prueba (`alter table storage.objects enable row level
security`) y reverificado: admin sube, consultant bloqueado pero puede
ver, aislamiento cross-tenant confirmado. Esta misma corrección de
infraestructura también habría afectado (sin detectarlo) las pruebas
directas del bucket `evidences` desde el Sprint 1.

**Menú lateral agrupado** (`components/layout/nav.tsx`): 4 grupos
plegables con `<details>` nativo (sin JS de cliente) — Trazabilidad,
TrazaDocs, Sistema, y Plataforma (solo si `showPlatform`). Los grupos se
exportan como constantes (`TRAZABILIDAD_GROUP`, etc.) para poder
verificarlos con pruebas puras. Ninguna ruta cambió.

**Crear documento → edición directa**: `createDocumentFromBlueprintAction`
y `createCustomDocumentAction` ahora usan `redirect()` con
`buildDocumentEditPath` (función pura,
`/trazadocs/[id]/edit?created=1`) en vez de devolver el id al cliente — la
página de edición muestra «Documento creado. Puedes empezar a
diligenciarlo.» al llegar.

**Anti-duplicados**: `findDocumentByNormalizedTitle` /
`findDocumentByBlueprint` (`lib/db/trazadocs.ts`) validan ANTES del
insert, con mensaje claro y enlace "Abrir documento existente" en la UI;
el índice único (0048) es el respaldo real ante una condición de carrera.

**Eliminar borrador**: `deleteDraftTrazadocDocumentAction` + botón
«Eliminar borrador» (confirmación con `window.confirm`, sin librería
nueva) en detalle, edición y listado — visible solo si
`canDeleteDraftDocument` lo permite para ese rol/documento/usuario.

**TrazaDocs sin botones hacia otros módulos**: se quitaron "Ir a
Implementación / Soporte técnico / Evidencias / Trazabilidad" de
`/trazadocs`; esa navegación ahora vive solo en el menú lateral.

**Logo de empresa**: sección nueva en `/settings/company` (solo admin) —
subir/reemplazar/eliminar, PNG/JPG/JPEG/WebP hasta 2 MB (SVG excluido a
propósito: riesgo de script embebido sin sanear). Aparece en el
encabezado de `/trazadocs/[id]/print` junto con razón social y NIT si
existen; sin logo, la impresión no se rompe, solo omite la imagen.

**Pruebas**: 22 casos repartidos donde corresponde por tema —
`test:platform` (menú, 4 casos), `test:trazadocs` (creación/redirect,
anti-duplicados, eliminar borrador, botones, 16 casos) y `test:settings`
(logo, 6 casos) — incluidos 2 casos que leen el código fuente de las
páginas como guarda de regresión (nunca vuelve a aparecer un botón
cross-módulo, el logo siempre queda detrás de un condicional).

## Sprint 10A · Planes, cuotas, modo Demo y control de acceso por plan

Base de planes de acceso para preparar una beta/lanzamiento controlado:
Demo (asignado automáticamente), Full y Extra, con límites reales
aplicados en servidor. Sin pasarela de pagos, sin facturación, sin
marketplace, sin CRM, sin IA, sin Textil/Quality/Construcción
funcionales, sin PDF server-side, sin cambios de cálculo ni metodología.

**Migraciones**:

- **`0050_plans_and_usage.sql`**: 4 tablas — `plan_definitions` /
  `plan_limits` (catálogo global, solo editable por superadmin, mismo
  patrón RLS que `trazadoc_blueprints`) y `organization_subscriptions` /
  `subscription_plan_history` (por empresa, append-only la segunda).
  Seed: 3 planes, 39 límites (13 recursos × 3 planes). **Bug real
  encontrado y corregido**: `plan_limits.limit_value` se había declarado
  `integer`, que desborda con el límite de almacenamiento de Extra
  (5.368.709.120 bytes > máximo de `integer`) — cambiado a `bigint`,
  reverificado con los 3 planes insertados sin error.
- **`0051_storage_size_tracking.sql`**: `evidences.size_bytes` y
  `organizations.logo_size_bytes`, nullable — no rompe archivos ya
  subidos (cuentan como 0 en la suma de uso).
- **`0052_organization_usage_views.sql`**: `v_organization_plan_usage`,
  mismo patrón que `v_platform_organizations` (0041, la otra única
  excepción a `security_invoker` del proyecto) — sirve a la vez a un
  miembro de empresa viendo su propio uso y al superadmin viendo el de
  todas, con la guarda embebida en la vista misma.
- **`0053_organization_plan_assignment.sql`**: reemplaza
  `create_organization` y `create_platform_organization` (última vez:
  0042) para insertar `organization_subscriptions` + su primera fila de
  historial dentro de la MISMA transacción — nunca una segunda llamada
  desde el cliente. Nueva RPC `change_organization_plan` (solo
  superadmin), cubre Demo/Full/Extra + Suspender/Reactivar como
  combinaciones de `(plan_code, status)`. **Riesgo real evitado**: al
  reescribir estas 2 funciones desde memoria para agregar los INSERT de
  suscripción, la primera versión introdujo 3 regresiones silenciosas
  frente al código ya probado (orden de parámetros de `log_event`
  invertido, lógica de invitación pendiente reescrita de forma distinta a
  la original, y un `on conflict` en memberships que no existía antes) —
  detectadas comparando línea por línea contra el `0042` real antes de
  aplicar nada, y corregidas preservando el cuerpo exacto ya probado,
  solo agregando las líneas nuevas.

Verificado contra PostgreSQL 16 real: empresa normal creada por
`create_organization` queda en demo con historial correcto; empresa
creada por `create_platform_organization` con plan explícito ('full')
queda en ese plan; admin normal bloqueado de `change_organization_plan`,
superadmin puede cambiar de plan y suspender, con el historial completo y
exacto (demo→extra→suspendido); aislamiento cruzado confirmado en
`organization_subscriptions`/`subscription_plan_history`; restricción de
una sola empresa por usuario normal sigue intacta (sin regresión).
**Hallazgo de infraestructura de pruebas** (reaprovechado del Sprint 9.2):
se reutilizó el fix de RLS en el mock de `storage.objects`.

**Lógica pura** (`lib/plans/types.ts`, `lib/plans/limits.ts`,
`lib/plans/usage.ts`): catálogo de planes/recursos, `canCreateResource`
(conteo vs. límite), `isPlanFeatureEnabled` (interruptores 0/1),
`resolveUsageSeverity` (normal/advertencia 70%/crítico 90%/bloqueado
100%), `canChangeOrganizationPlan` (solo superadmin), sin ningún import
de Supabase/servidor/Next — misma capa que `lib/domain/*`.

**Server Actions** (`server/actions/plans.ts` + `lib/db/plans.ts`):
`checkResourceLimit` / `checkFeatureEnabled` / `checkStorageAvailable` son
el **helper central** (Parte 7) reutilizado desde otros server actions —
nunca cada acción reimplementa su propio conteo. Aplicado en:
TrazaDocs (`createDocumentFromBlueprintAction`, `createCustomDocumentAction`),
catálogos (`upsertSupplierAction`, `upsertMaterialAction`,
`upsertProductAction` — solo en la rama de CREAR, nunca al editar),
evidencias (`createEvidenceAction`, conteo + cuota de almacenamiento +
`size_bytes` real del archivo), trazabilidad (`createInputBatchAction`,
`createProductionOrderAction`, `createOutputBatchAction`), equipo
(`createTeamInvitationAction`, interruptor `roles_enabled` + conteo
`team_members`) e importaciones (`commitImportAction`, **en los dos
mecanismos de importación que coexisten en el código** —
`server/actions/imports.ts` e `server/actions/import.ts` — ambos
verificados como rutas realmente alcanzables desde la UI antes de
decidir cubrir los dos). El logo de empresa también quedó sujeto a la
cuota de almacenamiento.

**UI empresa**: `PlanUsageCard` (plan, barra de almacenamiento con
severidad, conteos por recurso) en `/dashboard`. **UI plataforma**: la
misma tarjeta + `PlanChangeForm` + `PlanHistoryList` en
`/platform/organizations/[id]`; columna de plan añadida a la tabla de
empresas en `/platform`; selector de plan inicial (por defecto Demo) al
crear una empresa desde `/platform/organizations/new`.

**Portal de módulos**: `/modules` — Trazaloop CPR disponible, Trazaloop
Textil / Quality (gestión de calidad e ISO 9001) / Construcción
"Próximamente", deshabilitados, sin ninguna funcionalidad interna creada
para ellos. Una sola sesión de Trazaloop para todos.

**Documentación**: nueva `docs/PLANS_AND_LIMITS_GUIDE.md` (incluye cómo
activar `Confirm email` en Supabase Auth). `docs/PLATFORM_ADMIN_GUIDE.md`,
`docs/COMPANY_TESTING_GUIDE.md`, `docs/TRAZADOCS_GUIDE.md`,
`docs/SETTINGS_GUIDE.md`, `docs/PREDEPLOY_CHECKLIST.md` y
`docs/STAGING_DEPLOYMENT.md` actualizados.

**Pruebas**: `npm run test:plans` (`tests/unit/plans.test.ts`) cubre los
25 casos mínimos del sprint más 3 adicionales.
`tests/rls/isolation.test.ts` suma 7 casos (71-77): aislamiento de
suscripciones/historial entre empresas, admin normal bloqueado de cambiar
plan, superadmin sí puede y ve el uso de todas las empresas, y una
empresa nueva de un usuario cualquiera (`newUser`) queda en demo sin
importar nada enviado desde el cliente.

**Alcance no cubierto en esta entrega, documentado explícitamente**: el
renombrado cosmético de "Feedback" a "Tickets/Soporte" (Parte 15) se dejó
sin tocar — el propio sprint lo marca como prioridad baja frente a
planes/límites, y no aparece en los 20 criterios de aceptación. La
diagnóstico "recomendaciones avanzadas" (Parte 10/Parte 8) no tiene
todavía una sección propia en la UI de diagnóstico para ocultar — el
interruptor de plan (`diagnostic_recommendations_enabled`) y el helper
`checkFeatureEnabled` ya están listos para cuando esa sección se
construya; tomar el diagnóstico en sí nunca estuvo bloqueado.

## Corrección post Sprint 10A — 6 bloqueantes de planes y control de acceso

Seis bloqueantes encontrados y corregidos antes de integrar el Sprint
10A. Sin facturación, sin pasarela de pagos, sin módulos Textil/Quality/
Construcción funcionales, sin PDF server-side, sin caso piloto, sin datos
demo, sin cambios de cálculo ni metodología.

**Bloqueante 1 — Demo seguía mostrando recomendaciones del diagnóstico.**
`app/(app)/(shell)/diagnostic/page.tsx` mostraba `q.recommendedAction`
sin revisar el plan. Corregido: la página consulta
`checkFeatureEnabled("diagnostic_recommendations_enabled")` y solo
muestra el texto de acción recomendada si está habilitado — el resultado
del diagnóstico (respuestas "No", nivel de preparación) sigue siempre
visible, Demo incluido. Con la función apagada, se muestra «Las
recomendaciones avanzadas están disponibles en los planes Full y Extra.»

**Bloqueante 2 — Demo podía validar importaciones.** `commitImportAction`
ya estaba bloqueado, pero `validateImportCsvAction`
(`server/actions/imports.ts`) — que SÍ escribe filas reales en
`import_jobs`/`import_job_rows` al validar — no tenía ningún chequeo.
Corregido con `checkFeatureEnabled("imports_enabled")` justo al principio
de la función, ANTES del primer INSERT. Se revisó también el importador
anterior que sigue coexistiendo (`server/actions/import.ts`,
`validateImportAction`, usado por `/catalog/import` y embebido en
`/traceability/input-batches`) y se bloqueó igual — ambos mecanismos de
importación quedan cubiertos.

**Bloqueante 3 — Suspender/cancelar plan no bloqueaba creaciones.** Los 3
helpers centrales (`checkResourceLimit`/`checkFeatureEnabled`/
`checkStorageAvailable`, `server/actions/plans.ts`) nunca revisaban
`planStatus`. Corregido centralizando el chequeo UNA sola vez
(`checkPlanStatusBlocking`, llamado desde las 3 funciones): una
suscripción `suspended`/`cancelled` bloquea cualquier creación/carga con
su propio mensaje, sin importar si estaría dentro del límite normal del
plan — la empresa sigue pudiendo leer todo lo que ya tenía.

**Bloqueante 4 — Empresas existentes sin suscripción real.**
`v_organization_plan_usage` usaba `coalesce(sub.plan_code, 'demo')` como
respaldo de LECTURA, así que empresas creadas antes de 0053 parecían
"demo" sin tener ninguna fila real ni historial. Nueva migración
**`0054_backfill_existing_organization_subscriptions.sql`**: idempotente,
sin ningún DELETE, asigna `demo` + primera fila de historial solo donde
no existía ya. Verificado con una empresa "legacy" simulada (creada por
INSERT directo, sin pasar por `create_organization`): antes del backfill,
0 filas de suscripción; después, 1 fila `demo` + 1 de historial; al
volver a correr la migración, 0 filas nuevas (idempotencia confirmada).

**Bloqueante 5 — `/modules` no era una entrada real.** `app/page.tsx`
seguía mandando a `/dashboard`, y el post-login no pasaba por el selector
de módulos. Corregido: `app/page.tsx` redirige a `/modules`;
`postAuthDestinationPath` (`lib/domain/team.ts`) ahora manda TODOS los
destinos normales (dashboard/select-org/create-org) a `/modules` en vez
de a su ruta específica — una invitación pendiente (`next` explícito o
detectada automáticamente) sigue yendo directo a `/accept-invite`, nunca
pasa por el portal. Nueva función `moduleEntryDestinationPath` resuelve
el destino real cuando el usuario elige "Trazaloop CPR" desde `/modules`
— reutiliza la MISMA lógica de estado, sin duplicarla, y nunca vuelve a
mandar a `/modules` (sin ciclos).

**Bloqueante 6 — Consola de plataforma con poca información de
empresa.** `memberships_select` (0006) solo permite `user_id =
auth.uid()` o `is_org_admin(organization_id)`: un superadmin que no es
miembro de una empresa quedaba bloqueado de ver sus miembros por la RLS
normal. Nueva migración **`0055_platform_organization_members_view.sql`**:
2 vistas nuevas (`v_platform_organization_members`,
`v_platform_organization_invitations`) con el MISMO patrón exacto que
`v_platform_organizations` (0041) — guarda `is_platform_staff()` embebida
en la vista misma, nunca `security_invoker`. La migración también
extiende `v_platform_organizations` (CREATE OR REPLACE, agregando
`contact_email`/`phone` al final, sin quitar ni reordenar columnas
existentes) para no tener que crear una tercera vista solo por 2 campos.
Verificado contra PostgreSQL real: superadmin ve miembros+invitación
pendiente de una empresa de la que NO es miembro; un admin de otra
empresa obtiene 0 filas en ambas vistas. El detalle de empresa ahora
muestra administrador principal, miembros con correo/rol, invitaciones
pendientes, correo de contacto y teléfono — "No disponible" cuando algo
falta, nunca datos inventados.

**Pruebas**: `npm run test:plans` suma 8 casos de corrección nuevos.
`npm run test:team` suma 3 casos sobre `/modules` como entrada real.
`tests/rls/isolation.test.ts` suma 2 casos (78-79) sobre las vistas de
miembros/invitaciones de plataforma.

## Corrección post Sprint 10A (2) — brechas de plan en Equipo y cuentas suspendidas

Tres bloqueantes de control de acceso por plan encontrados y corregidos.
Sin facturación, sin pasarela de pagos, sin módulos Textil/Quality/
Construcción funcionales, sin PDF server-side, sin caso piloto, sin datos
demo, sin cambios de cálculo ni metodología.

**Bloqueante 1 — invitaciones antiguas se podían aceptar sin revisar
plan.** Caso real: una empresa en Full crea invitaciones pendientes; el
superadmin la baja a Demo; alguien acepta el enlace antiguo semanas
después — `accept_team_invitation` (0037) creaba la membership sin
revisar nada de plan. **Decisión de arquitectura**: el chequeo se agregó
en SQL (`accept_team_invitation`, `0056_accept_invitation_plan_checks.sql`),
no en TypeScript antes de llamar la RPC, porque quien acepta una
invitación normalmente NO es todavía miembro de esa empresa —
`v_organization_plan_usage` exige `is_org_member(organization_id)` para
poder leerse, así que un chequeo previo con la sesión del invitado
siempre habría visto cero filas por RLS y nunca habría podido bloquear
nada de verdad. Se preservó el cuerpo EXACTO ya probado de 0037,
agregando los 3 chequeos (roles_enabled, límite de team_members,
plan_status) justo después de confirmar que el usuario aún no es miembro
y antes del INSERT en memberships.

Verificado contra PostgreSQL real, reproduciendo el caso exacto del
bloqueante: empresa en Full crea invitación → baja a Demo → el invitado
intenta aceptar el link antiguo → bloqueado con «Las invitaciones y roles
están disponibles en los planes Full y Extra.», sin membership creada, la
invitación queda `pending` (se puede aceptar después si la empresa vuelve
a subir de plan). Confirmado también: Full permite aceptar sin ningún
bloqueo (sin regresión); el límite de `team_members` bloquea de forma
aislada cuando se alcanza; suspendida y cancelada bloquean con sus
mensajes exactos.

**Bloqueante 2 — Demo podía cambiar roles de miembros existentes.**
`updateMemberRoleAction` y `reactivateMemberAction`
(`server/actions/team.ts`) no revisaban `roles_enabled`. Corregido con
`checkFeatureEnabled("roles_enabled")` en ambas — que ya revisa el estado
de la suscripción primero, así que también cubre suspended/cancelled sin
código adicional. `deactivateMemberAction` se dejó **sin** el chequeo a
propósito: desactivar ayuda a una empresa a volver dentro de su límite,
nunca debería estar bloqueado.

**Bloqueante 3 — suspended/cancelled no bloqueaban mutaciones fuera de
los helpers de recursos.** Diagnóstico (`startDiagnosticAction`,
`saveDiagnosticAnswersAction`, `completeDiagnosticAction`), configuración
de empresa (`updateCompanySettingsAction`, `removeCompanyLogoAction`) y
TrazaDocs (metadatos, contenido de secciones, agregar/eliminar/reordenar
sección, y las 6 transiciones de estado a través de un único helper
compartido `transition()`) no pasaban por ningún chequeo de plan. Nuevo
helper central **`checkOrganizationCanMutate()`**
(`server/actions/plans.ts`) — mismo `checkPlanStatusBlocking` ya usado por
los otros 3 helpers, reutilizado sin duplicar lógica. Nunca bloquea
lectura ni borra datos: una empresa suspendida sigue pudiendo consultar
todo lo que ya tenía.

**Pruebas**: `npm run test:team` suma 9 casos (invitaciones/roles en
Demo/suspended/cancelled). `npm run test:plans` suma 4 casos (modo solo
lectura ampliado a diagnóstico, configuración, logo y TrazaDocs).
`tests/rls/isolation.test.ts` suma 2 casos (80-81) reproduciendo el caso
exacto del Bloqueante 1 contra PostgreSQL real.

## Corrección final — modo solo lectura completo para suspended/cancelled

Última brecha de control de acceso por plan: `checkOrganizationCanMutate()`
se aplicó a **35 acciones de escritura restantes** que todavía no lo
usaban, repartidas en 6 archivos. Sin facturación, sin pasarela de pagos,
sin módulos Textil/Quality/Construcción funcionales, sin PDF server-side,
sin caso piloto, sin datos demo, sin cambios de cálculo ni metodología —
esta ronda no cambió ninguna lógica de negocio ni ningún permiso
existente, solo agregó la barrera de `plan_status` antes de escribir.

**Acciones que quedaban sin protección** (confirmado con una lista
explícita en `tests/unit/plans.test.ts`, que además verifica que ninguna
acción de SOLO LECTURA la lleve):

- `server/actions/catalog.ts` (9): `upsertSupplierAction`,
  `deleteSupplierAction`, `upsertFamilyAction`, `deleteFamilyAction`,
  `upsertProductAction`, `deleteProductAction`, `upsertMaterialAction`,
  `deleteMaterialAction`, `reclassifyMaterialAction`.
- `server/actions/evidences.ts` (4): `createEvidenceAction` (chequeo
  explícito agregado por claridad, ya cubierto indirectamente por
  `checkResourceLimit`/`checkStorageAvailable`), `validateEvidenceAction`,
  `deleteEvidenceAction`, `linkEvidenceAction`.
- `server/actions/traceability.ts` (15): las 3 acciones de lotes de
  entrada, las 3 de órdenes/corridas, las 3 de consumo, las 3 de lotes
  producidos y las 3 de composición — create/update/delete de cada una.
  Las acciones de solo lectura (`listInputBatchesAction`,
  `getBackwardTraceabilityAction`, etc.) se dejaron intactas a propósito.
- `server/actions/recycled.ts` (1): `calculateRecycledContentAction` —
  sin tocar la RPC `calculate_recycled_content` ni la metodología: una
  empresa suspendida sigue viendo sus cálculos existentes, solo no puede
  generar uno nuevo.
- `server/actions/implementation.ts` (4):
  `createImplementationFeedbackAction`,
  `updateImplementationFeedbackAction`,
  `updateImplementationFeedbackStatusAction`,
  `deleteImplementationFeedbackAction`.
- `server/actions/team.ts` (2): `revokeTeamInvitationAction` y
  `deactivateMemberAction` — esta última con una distinción deliberada:
  usa `checkOrganizationCanMutate()` (solo estado de la suscripción), NO
  `checkFeatureEnabled("roles_enabled")` — Demo **activo** debía seguir
  pudiendo desactivar miembros (ayuda a volver dentro del límite), pero
  Demo **suspendido/cancelado** no.
- `server/actions/import.ts` / `imports.ts`: ya quedaron cubiertos en la
  corrección anterior (`checkFeatureEnabled("imports_enabled")` ya revisa
  el estado del plan primero) — se confirmó que no existe ningún otro
  camino de escritura en esos 2 archivos sin ese guarda.

**Cómo quedó aplicada la regla**: siempre el mismo patrón — `const
mutateCheck = await checkOrganizationCanMutate(); if
(!mutateCheck.allowed) return { error: mutateCheck.error };` — colocado
después de las validaciones de forma más básicas (campos obligatorios) y
antes de cualquier operación de base de datos o de los chequeos de límite
de recurso (`checkResourceLimit`), para no gastar una consulta de
conteo si la empresa ya está bloqueada por estado.

**Dos bugs de test (no de implementación) encontrados y corregidos** al
escribir las pruebas de esta ronda: (1) un `assert(!fnBody.includes(...))`
demasiado ingenuo daba falso positivo porque el propio comentario
explicativo que agregué dentro de `deactivateMemberAction` contenía la
palabra `checkFeatureEnabled` en prosa — corregido a buscar la llamada
real (`checkFeatureEnabled(`, con el paréntesis) en vez de la subcadena
suelta, y se corrigió el mismo patrón en un test equivalente de la ronda
anterior; (2) un conteo esperado de "34 acciones" que en realidad eran
35 — la lista completa ya tenía el número correcto, solo la aserción
sobre su longitud estaba mal.

**Pruebas**: `npm run test:plans` suma 16 casos (14 pedidos + 2 extra),
incluida una lista exhaustiva y nombrada de las 35 acciones cubiertas y
una verificación explícita de que ninguna acción de lectura quedó
bloqueada.

## Sprint 10B — Maestro de documentos TrazaDocs

Registro documental centralizado dentro de TrazaDocs, uniendo documentos
vivos (ya existentes) con un tipo nuevo — documentos descargables:
archivos controlados (PDF/Word/Excel/CSV/imagen) que la empresa sube tal
cual y versiona, sin editarlos en línea. Sin PDF server-side, sin
tickets completos, sin facturación, sin pasarela de pagos, sin módulos
Textil/Quality/Construcción funcionales, sin cambios de cálculo ni
metodología.

**Migraciones**:

- **`0057_trazadocs_document_master.sql`**: `category_code` en
  `trazadoc_documents` (backfill seguro desde el `document_type` del
  blueprint, `other` como respaldo — nunca rompe datos existentes);
  tablas nuevas `trazadoc_file_documents` / `trazadoc_file_document_versions`
  con el MISMO patrón de RLS/triggers que `trazadoc_documents` (0043,
  corregido en 0047) — edición directa de metadatos solo en
  draft/in_review, para los 3 roles por igual; vista unificada
  `v_trazadoc_document_master` (`security_invoker=true`, UNION de ambas
  fuentes); 2 RPC nuevas SECURITY DEFINER —
  `change_trazadoc_file_document_status` (transición atómica con
  snapshot de versión, mismas reglas de rol/estado que
  `change_trazadoc_document_status`) y `replace_trazadoc_file_document`
  (sube un archivo nuevo como nueva versión; si el documento estaba
  aprobado, la nueva versión SIEMPRE queda en borrador — nunca se
  sobrescribe un aprobado en silencio).
- **`0058_trazadocs_documents_storage.sql`**: bucket privado
  `trazadocs-documents`, separado de `evidences` y de
  `organization-assets` — mismo patrón de políticas por
  `organization_id` en la ruta que los otros 2 buckets del proyecto.

**Bug real encontrado y corregido durante el desarrollo**: al probar
`change_trazadoc_file_document_status` vía RPC, primero intenté simular
una aprobación con un `UPDATE` directo — falló con una violación de RLS.
Esto confirmó (no reveló un bug) que la política de UPDATE exige
draft/in_review tanto antes como después del cambio, por diseño — la
única vía real para cambiar el estado es la RPC SECURITY DEFINER, igual
que en documentos vivos. Verificado exhaustivamente contra PostgreSQL
real: consultant bloqueado de aprobar, admin aprueba correctamente,
reemplazar el archivo de un aprobado lo regresa a borrador conservando
la versión anterior intacta en el historial, aislamiento cruzado
confirmado en la tabla y en la vista unificada.

**Lógica pura** (`lib/domain/trazadocs-master.ts`): reutiliza
`CATEGORY_CODES`/`CATEGORY_LABEL` y TODAS las reglas de rol/estado ya
definidas en `lib/domain/trazadocs.ts` (`canApproveDocument`,
`canMarkObsolete`, `canReactivateDocument`,
`canCreateDraftVersionFromApproved`, `canDeleteDraftDocument`,
`canEditDocument`) — un documento descargable se aprueba/edita con
EXACTAMENTE las mismas reglas que uno vivo, nunca una segunda
especificación paralela. Nueva validación de archivo
(`validateFileDocumentUpload`): tipos permitidos (PDF/Word/Excel/CSV/PNG/
JPG/WebP, nunca ejecutables/ZIP/SVG), tamaño máximo por archivo (10 MB
Demo, 25 MB Full/Extra) independiente de la cuota total de
almacenamiento del plan.

**Server actions** (`server/actions/trazadocs-master.ts`): el límite
`documents_trazadocs` (Sprint 10A) es UN SOLO recurso que cuenta
documentos vivos y descargables juntos —
`uploadFileDocumentAction` llama a `checkResourceLimit("documents_trazadocs")`,
el mismo chequeo que ya usan `createDocumentFromBlueprintAction`/
`createCustomDocumentAction`. Todas las mutaciones (subir, editar
metadatos, reemplazar archivo, eliminar borrador) pasan por
`checkOrganizationCanMutate()` — una empresa suspendida/cancelada puede
seguir viendo el maestro, descargando e imprimiendo, nunca escribir.
**Anti-duplicado cruzado (Parte 18)**: un título ya usado por un
documento vivo bloquea crear un descargable con el mismo nombre, y
viceversa — `createDocumentFromBlueprintAction`/`createCustomDocumentAction`
ahora también revisan `trazadoc_file_documents`
(`findFileDocumentByNormalizedTitle`, nueva función), además de su
chequeo existente contra otros documentos vivos.

**UI**: `/trazadocs/master` (filtros por búsqueda/categoría/estado/tipo
vía querystring, tabla agrupada por categoría, exportar CSV, vista de
impresión, indicadores de conteo); `/trazadocs/master/print` (mismo
patrón que la impresión de documentos vivos — logo de empresa, razón
social, NIT, sin PDF server-side); `/trazadocs/files/new` (subir);
`/trazadocs/files/[id]` (detalle: metadatos, reemplazar archivo,
transiciones de estado, historial de versiones, eliminar borrador).
Categoría editable en documentos vivos desde su pantalla de edición
existente (`/trazadocs/[id]/edit`), con la misma restricción de estado
que el resto del documento. Exportar CSV y descargar reutilizan el
patrón ya establecido (`components/domain/audit-support/export-buttons.tsx`,
Sprint 6) de Blob + `URL.createObjectURL`, sin librerías nuevas.

**Integración**: enlace «Maestro de documentos» agregado al grupo de
navegación TrazaDocs y a la página principal `/trazadocs`, sin quitar
nada existente.

**Pruebas**: `npm run test:document-master` (`tests/unit/document-master.test.ts`)
cubre los 25 casos mínimos del sprint más 2 adicionales.
`tests/rls/isolation.test.ts` suma 4 casos (82-85) verificando contra
PostgreSQL real: aislamiento cruzado del documento descargable y de la
vista unificada, consultant bloqueado/admin aprueba vía RPC, y que
reemplazar el archivo de un aprobado lo regresa a borrador sin perder el
historial.

**Documentación**: nueva `docs/DOCUMENT_MASTER_GUIDE.md`.
`docs/TRAZADOCS_GUIDE.md`, `docs/PLANS_AND_LIMITS_GUIDE.md`,
`docs/COMPANY_TESTING_GUIDE.md`, `docs/PLATFORM_ADMIN_GUIDE.md`,
`docs/PREDEPLOY_CHECKLIST.md` y `docs/STAGING_DEPLOYMENT.md` actualizados.

## Corrección post Sprint 10B — versión inicial, uso de plan y archivos huérfanos

Tres bloqueantes reales encontrados y corregidos antes de integrar el
Maestro de documentos. Sin facturación, sin pasarela de pagos, sin
módulos Textil/Quality/Construcción funcionales, sin PDF server-side, sin
tickets completos, sin IA, sin caso piloto, sin datos demo, sin cambios
de cálculo ni metodología.

**Bloqueante 1 — documento descargable quedaba con `storage_path`
vacío.** `uploadFileDocumentAction` creaba la fila, subía el archivo, y
luego usaba `changeFileDocumentStatus` para "cerrar" la creación — pero
esa función nunca actualiza `storage_path` con la ruta real, y además
SIEMPRE incrementa `current_version` (un documento recién creado quedaba
en v2, no v1). Corregido con una RPC nueva y dedicada,
**`finalize_trazadoc_file_document_initial_version`**
(`0059_document_master_usage_fix.sql`) — única vía para cerrar la
creación inicial: fija `storage_path`/`file_name`/`mime_type`/
`size_bytes` reales, deja `current_version=1`/`version_label='v1'`
explícitos (nunca incrementados), e inserta la versión v1 con la ruta
real — idempotente si se reintenta (no duplica v1 si ya existe).
`uploadFileDocumentAction` ya no usa `changeFileDocumentStatus` para
este paso; esa función queda exclusivamente para transiciones
posteriores (enviar a revisión, aprobar, marcar obsoleto, reactivar).

Verificado contra PostgreSQL real: tras `finalize`, la fila principal y
la versión v1 quedan con la ruta real idéntica; reintentar `finalize` no
duplica la versión.

**Bloqueante 2 — `v_organization_plan_usage` no contaba documentos
descargables.** `documents_trazadocs_count` seguía leyendo solo
`trazadoc_documents`, y `storage_used_bytes` no incluía
`trazadoc_file_documents.size_bytes`. Migración `0059` reemplaza la
vista (mismas columnas, mismo orden, misma guarda `is_org_member(...) or
is_platform_staff()`) sumando ambas fuentes en un solo origen de verdad:
`documents_trazadocs_count` = vivos + descargables;
`storage_used_bytes` = evidencias + logo + descargables. Verificado
contra PostgreSQL real: con 1 documento vivo + 1 descargable de 200 KB,
la vista reporta `documents_trazadocs_count=2` y
`storage_used_bytes=204800` exactos.

**Bloqueante 3 — riesgo de archivos huérfanos al reemplazar.**
`replaceFileDocumentFileAction` subía el archivo nuevo ANTES de saber si
la RPC lo aceptaría. Reordenado: ahora valida documento/rol/estado
(`canReplaceFileDocumentFile`, nueva función pura que espeja
EXACTAMENTE la regla ya escrita en la RPC SQL — draft/in_review para los
3 roles, approved solo admin/quality, obsolete nunca) **antes** de subir
cualquier byte; si la RPC falla después de subir, se intenta borrar el
objeto recién subido (`deleteFileDocumentStorageObject`, best-effort).
`uploadFileDocumentAction` también se corrigió (**Bloqueante 4**): si la
subida inicial falla, la fila borrador recién creada se elimina
automáticamente (`deleteFileDocumentRow`), con mensaje claro si ni
siquiera eso fuera posible.

**Pruebas**: `npm run test:document-master` suma 12 casos de corrección.
`tests/rls/isolation.test.ts` suma 2 casos (86-87) verificando contra
PostgreSQL real la ruta/versión reales tras `finalize` (con reintento
idempotente) y el conteo/almacenamiento combinado de la vista corregida.

## Sprint 10C — Centro de soporte y tickets

Reemplaza visualmente el antiguo «Feedback» por un sistema formal de
tickets de soporte: creación por empresa, conversación, notas internas
(solo plataforma), estados, prioridad, asignación y objetivo de primera
respuesta. Sin CRM, sin chat en tiempo real, sin notificaciones por
email, sin adjuntos, sin bot de IA, sin base de conocimiento, sin SLA
contractual con festivos, sin facturación, sin pasarela de pagos, sin
PDF server-side, sin módulos Textil/Quality/Construcción funcionales,
sin cambios de cálculo ni metodología.

**Migraciones**:

- **`0060_support_tickets.sql`**: 3 tablas — `support_tickets`,
  `support_ticket_messages`, `support_ticket_status_history`
  (append-only). Ninguna transición de estado (reabrir, asignar, cambiar
  estado, cambiar prioridad) admite un `UPDATE` directo desde el cliente
  — MISMO patrón que `change_trazadoc_document_status`/
  `change_organization_plan`: 4 RPC SECURITY DEFINER
  (`reopen_support_ticket`, `assign_support_ticket`,
  `update_support_ticket_status`, `update_support_ticket_priority`), cada
  una con su propio chequeo de rol y su propia entrada de historial. Los
  MENSAJES sí se insertan directamente vía RLS normal — un trigger
  `AFTER INSERT` (`touch_support_ticket_on_message`, SECURITY DEFINER)
  actualiza `last_message_at` siempre y `first_response_at` solo la
  primera vez que llega un mensaje visible (`is_internal_note=false`) de
  plataforma — nunca desde una nota interna, nunca una segunda vez. Un
  CHECK a nivel de datos (no solo RLS) impide que un cliente marque
  `is_internal_note=true`.
- **`0061_migrate_feedback_to_support_tickets.sql`**: preserva
  `implementation_feedback` (nunca la toca ni la borra) creando un
  ticket equivalente por cada fila **con autor conocido** — las filas
  sin `created_by` se omiten a propósito (la migración nunca inventa un
  autor). Idempotente vía `ON CONFLICT (source_type, source_id) DO
  NOTHING`, respaldado por un índice único parcial real
  (`support_tickets_source_uniq`).
- **`0062_support_ticket_views.sql`**: `v_support_ticket_summary`
  (`security_invoker=true`, con SLA calculado) y
  `v_platform_support_ticket_summary` (envuelve a la primera, agrega
  datos de empresa/plan, con la guarda `is_platform_staff()` embebida —
  mismo patrón que `v_platform_organizations`).

**Hallazgo interesante durante el desarrollo**: al anidar
`v_platform_support_ticket_summary` (sin `security_invoker`) sobre
`v_support_ticket_summary` (con `security_invoker=true`), confirmé
empíricamente contra PostgreSQL real que la propiedad `security_invoker`
de la vista interna se sigue aplicando con la identidad del usuario que
hizo la consulta ORIGINAL, sin importar cuántas vistas intermedias haya
— un usuario de empresa consultando la vista de plataforma (bloqueado
por su guarda externa) habría visto, de todas formas, un conteo de
mensajes correctamente filtrado (sin notas internas) si hubiera
alcanzado la vista interna; un superadmin ve el conteo completo. Ambos
casos y el bloqueo cruzado se verificaron con las 4 combinaciones
posibles.

**Lógica pura** (`lib/domain/support.ts`): catálogos de estado/
prioridad/categoría/módulo, `computeFirstResponseTargetAt` (siguiente
día hábil, verificado con los 4 ejemplos exactos del brief: lunes→martes,
viernes→lunes, sábado→lunes, domingo→lunes), `resolveSlaStatus` (misma
lógica exacta que la vista SQL, testeada aquí sin BD), y
**`canCreateSupportTicket`** — la excepción controlada de Parte 12: NUNCA
usa `checkOrganizationCanMutate()` (bloquearía todos los tickets); una
empresa suspendida/cancelada solo puede crear tickets de categoría
cuenta/acceso o plan/límites, mientras que responder un ticket existente
(`canReplySupportTicket`) siempre está permitido sin importar el estado
del plan.

**Server actions** (`server/actions/support.ts`): acciones de empresa
(`listSupportTicketsAction`, `getSupportTicketAction`,
`createSupportTicketAction`, `replySupportTicketAction`,
`reopenSupportTicketAction`) y de plataforma
(`listPlatformSupportTicketsAction`, `getPlatformSupportTicketAction`,
`assignSupportTicketAction` + atajo `assignSupportTicketToMeAction`,
`updateSupportTicketStatusAction`, `updateSupportTicketPriorityAction`,
`replyPlatformSupportTicketAction`, `addInternalSupportNoteAction`,
`getOrganizationSupportSummaryAction`). `organization_id` nunca sale del
cliente en las acciones de empresa.

**UI**: `/support` (lista con filtros, mensaje del objetivo de primera
respuesta), `/support/new`, `/support/[id]` (conversación, responder o
reabrir); `/platform/support` (todos los tickets, filtrable por empresa
vía `?org=`), `/platform/support/[id]` (asignar, estado, prioridad,
responder, nota interna, historial). Bloque de tickets agregado a
`/platform/organizations/[id]` (Parte 17).

**Integración con Implementación**: `/implementation/feedback` se
reemplazó por un aviso («El feedback ahora se gestiona desde el Centro
de soporte» + botón) — la ruta se conserva para no romper enlaces
existentes. Los botones «Registrar feedback» en `/implementation` ahora
dicen «Crear ticket de soporte» y llevan a `/support/new`; la sección de
feedback histórico se conserva, reetiquetada como tal, apuntando al
nuevo Centro de soporte.

**Nav**: «Centro de soporte» agregado al grupo Sistema; «Tickets de
soporte» agregado al grupo Plataforma.

**Compliance**: se agregaron 2 patrones nuevos al barrido
(`tests/compliance/no-certifier-names.test.ts`) — «respuesta
garantizada» y «garantía de respuesta» — verificados con casos positivos
y negativos antes de confirmar que el texto real del producto
(«Tiempo objetivo de primera respuesta: 1 día hábil.») no los dispara.

**Pruebas**: `npm run test:support` (`tests/unit/support.test.ts`) cubre
los 24 casos mínimos del sprint más varios adicionales.
`tests/rls/isolation.test.ts` suma 4 casos (88-91) verificando contra
PostgreSQL real: creación y respuesta de la empresa con SLA calculado,
nota interna invisible para la empresa y `first_response_at` llenado
solo por el primer mensaje visible, permisos asimétricos empresa vs.
plataforma en las 4 RPC, y aislamiento cruzado completo (tabla, RPC y
vista de resumen).

## Corrección post Sprint 10C — descripción visible, RLS reforzada y última actividad

Cinco bloqueantes encontrados y corregidos antes de integrar el Centro
de soporte. Sin CRM, sin chat en tiempo real, sin adjuntos, sin IA, sin
facturación, sin pasarela de pagos, sin PDF server-side, sin módulos
Textil/Quality/Construcción funcionales, sin cambios de cálculo ni
metodología, sin promesa de certificación ni de respuesta garantizada.

**Bloqueante 1 — la descripción inicial no aparecía en el detalle.**
`v_support_ticket_summary` no traía `description`. Corregido con
`CREATE OR REPLACE VIEW` (migración `0063`) agregando la columna **al
final** — aprendiendo de un error real cometido primero al intentar
insertarla en medio de la lista de columnas, lo que `CREATE OR REPLACE
VIEW` rechaza (mismo principio ya aplicado en `0059`, esta vez vuelto a
verificar contra el error real de Postgres antes de corregirlo). Ambos
detalles (`/support/[id]` y `/platform/support/[id]`) ahora muestran una
sección «Descripción inicial» dedicada.

**Bloqueante 2 — RLS de creación permitía campos manipulados.**
`support_tickets_insert` (0060) solo exigía membresía y `created_by`,
sin restringir `status`/`assigned_to`/`first_response_at`/`resolved_at`/
`closed_at`/`source_type`/`source_id`, ni reforzar en base de datos la
excepción de planes suspendidos. Doble defensa nueva: un trigger `BEFORE
INSERT` (`normalize_support_ticket_insert`) que fuerza SIEMPRE estos
campos a sus valores seguros y recalcula `first_response_target_at` con
la misma lógica de siguiente día hábil (nunca confía en lo que mande el
cliente), más una función `can_create_support_ticket_for_org` (espejo
exacto de `canCreateSupportTicket` en TypeScript, ahora también exigida
en SQL) y una política de INSERT más estricta que vuelve a exigir todo
lo que el trigger ya garantiza — si el trigger alguna vez se cayera, la
política seguiría bloqueando. Verificado contra PostgreSQL real: un
INSERT directo con `status='closed'`, `assigned_to` y las 3 fechas ya
llenas tuvo éxito pero quedó completamente normalizado; con la empresa
suspendida, una categoría técnica se bloqueó y `account`/`plan`
siguieron permitidos.

**Bloqueante 3 — el historial aceptaba INSERT directo.**
`support_ticket_status_history_insert` (0060) permitía a cualquier
miembro de empresa insertar una fila de historial sin que el estado
real hubiera cambiado. Se eliminó esa política — deny-by-default real,
sin ninguna política de INSERT para clientes. Verificado que esto NO
rompe las 4 RPC (`reopen_support_ticket`/`assign_support_ticket`/
`update_support_ticket_status`/`update_support_ticket_priority`): todas siguen escribiendo su historial porque son
SECURITY DEFINER y bypasean la RLS de la tabla por completo — probado en
secuencia sobre el mismo ticket (asignar → resolver → reabrir) con el
historial completo y correcto.

**Bloqueante 4 — las notas internas actualizaban la última actividad
visible.** `touch_support_ticket_on_message()` tocaba `last_message_at`
con cualquier mensaje, incluidas notas internas — la empresa veía
"última actividad" cambiar sin ningún mensaje que pudiera leer.
Corregido: `last_message_at` ahora solo se actualiza cuando
`is_internal_note = false`; `first_response_at` sigue exactamente igual
(ya exigía lo mismo). Verificado: una nota interna dejó `last_message_at`
sin cambios; el siguiente mensaje visible sí lo actualizó.

**Bloqueante 5 — lenguaje visible de "Feedback" seguía apareciendo.**
Barrido completo en evidencias, trazabilidad, flujo guiado, dossiers
técnicos, cálculo de contenido reciclado, implementación y toda la
consola de plataforma (resumen general, tabla de empresas, detalle de
empresa) — "Registrar feedback" → "Crear ticket de soporte";
"Feedback abierto"/"crítico" en la consola de plataforma se
**reemplazaron por conteos reales de tickets** (`totalOpenTickets`/
`totalUrgentTickets`, calculados desde `support_tickets`, no solo
relabeled) con enlace a `/platform/support`; las mismas etiquetas en
paneles que siguen mostrando datos históricos de
`implementation_feedback` se relabelaron como "Feedback histórico" para
no confundirlos con tickets reales. `/support/new` ahora acepta
`?module=` para preseleccionar el módulo relacionado, y los enlaces
específicos de cada pantalla lo usan. Un test automatizado
(`tests/unit/support.test.ts`, caso 15) encontró un enlace real que se
me había pasado — "Ver / editar" en el feedback histórico de
`/implementation`, todavía apuntando a la ruta ya reemplazada — corregido
quitando ese enlace (ya no lleva a ningún sitio editable).

**Pruebas**: `npm run test:support` suma 15 casos de corrección más 1
extra. `tests/rls/isolation.test.ts` suma 4 casos (92-95) verificando
contra PostgreSQL real: normalización de campos manipulados, bloqueo de
categoría técnica en suspendida con `account`/`plan` permitidos,
bloqueo de INSERT directo de historial (para empresa y para superadmin
por igual), y el comportamiento correcto de `last_message_at` con notas
internas vs. mensajes visibles.

## Corrección final Sprint 10C — fechas normalizadas y último barrido de lenguaje

Últimos 3 detalles antes de integrar el Centro de soporte. Sin CRM, sin
chat en tiempo real, sin adjuntos, sin IA, sin facturación, sin pasarela
de pagos, sin PDF server-side, sin módulos Textil/Quality/Construcción
funcionales, sin cambios de cálculo ni metodología, sin promesa de
certificación ni de respuesta garantizada.

**Bloqueante 1 — `created_at` de `support_tickets` podía manipular el
SLA indirectamente.** `normalize_support_ticket_insert()` (0063)
calculaba `first_response_target_at` a partir de `new.created_at`, pero
nunca forzaba ese `created_at` — un INSERT directo con
`created_at='2099-01-01'` habría corrido el objetivo de primera
respuesta a esa misma fecha lejana. Migración `0064` agrega
`new.created_at := now()` / `new.updated_at := now()` **antes** del
cálculo del objetivo. Verificado contra PostgreSQL real con fechas
manipuladas tanto al futuro (2099) como al pasado (2000): en ambos
casos `created_at` quedó en la hora real del servidor y
`first_response_target_at` se calculó correctamente sobre esa hora real.

**Bloqueante 2 — `created_at` de `support_ticket_messages` podía
manipular `last_message_at`.** Mismo problema, en la tabla de mensajes.
Nuevo trigger `normalize_support_ticket_message_insert` (0064): fuerza
`created_at`/`updated_at` al reloj del servidor, y además fuerza
`is_internal_note := false` cuando `author_type = 'customer'` — una
TERCERA capa de defensa independiente del CHECK de datos (0060) y de la
política de RLS (ninguna depende de las otras). Verificado: un mensaje
con `created_at='2099-06-01'` dejó `last_message_at` en la hora real;
con el CHECK de datos temporalmente eliminado (solo para aislar la
prueba), el trigger por sí solo siguió bloqueando una nota interna de
un customer.

**Bloqueante 3 — quedaba lenguaje de "Feedback" en varios lugares.**
Barrido completo de las etiquetas restantes ("Feedback histórico
abierto/crítico" → "Solicitudes históricas abiertas"/"Tickets
históricos de alta prioridad", "Feedback anterior (histórico)" →
"Histórico de soporte anterior") y de la documentación operativa
(`docs/COMPANY_TESTING_GUIDE.md`, `docs/PILOT_QA_CHECKLIST.md`,
`docs/TEAM_MANAGEMENT_GUIDE.md`) que todavía orientaba a
`/implementation/feedback` como flujo principal.

Se agregaron 3 patrones nuevos al barrido de compliance (`tests/compliance`)
para blindar esto contra regresión — y al correrlo, **encontraron 2 bugs
reales que ningún barrido manual anterior había detectado**: (1) la fila
de prioridad 12 de `v_implementation_next_actions` (la vista SQL detrás
de "Siguiente acción recomendada" en `/implementation`, Sprint 6)
todavía devolvía el texto y el enlace del flujo de feedback reemplazado
— corregida con `CREATE OR REPLACE VIEW` (migración `0065`, cuerpo
idéntico a `0034` salvo esa única fila, verificado con
`pg_get_viewdef`); (2) el ítem 17 del checklist de 17 pasos de
implementación (`lib/domain/implementation.ts`) tenía el mismo problema
en un objeto TypeScript totalmente aparte — dos capas independientes
con el mismo bug, corregidas por separado. La migración histórica `0034`
se dejó intacta a propósito (las migraciones ya aplicadas nunca se
editan retroactivamente) y se excluyó explícitamente, un archivo a la
vez, del nuevo patrón de compliance — con un comentario que explica por
qué, no un directorio completo.

**Pruebas**: `npm run test:support` suma 9 casos de corrección más 2
extra (los 2 bugs recién encontrados, ahora con guarda de regresión
propia). `tests/rls/isolation.test.ts` suma 3 casos (96-98) verificando
contra PostgreSQL real la normalización de fechas manipuladas en ambas
tablas y el bloqueo de notas internas por parte de un customer.

## Sprint 10D — Portal de lanzamiento, onboarding Demo y consentimiento legal

Reemplaza el redirect simple de `/` por un portal público real, exige
aceptación de términos/privacidad antes de entrar a cualquier parte
protegida, y guía a una empresa recién creada con un checklist de
onboarding calculado 100% desde datos reales. Sin CRM, sin verificación
de correo adicional a Supabase Auth, sin CAPTCHA, sin pasarela de pagos,
sin PDF server-side adicional, sin módulos Textil/Quality/Construcción
funcionales, sin cambios de cálculo ni metodología.

**Migraciones**:

- **`0066_legal_documents_and_acceptances.sql`**: `legal_documents`
  (catálogo versionado; índice único parcial garantiza como máximo UN
  documento `active` por tipo — "el documento vigente" nunca es
  ambiguo) y `user_legal_acceptances` (histórico append-only, único
  `(user_id, legal_document_id)`). **Única tabla del proyecto con SELECT
  público** (`to anon, authenticated`) — necesario porque `/terms` y
  `/privacy` son páginas públicas; verificado contra PostgreSQL real
  consultando explícitamente `set role anon`. Semilla de 2 documentos
  `v1` (`terms`, `privacy`) marcados como versión preliminar, sin
  promesa de certificación, explicando en lenguaje llano para qué se
  usan los datos.
- **`0067_onboarding_status_views.sql`**: `v_organization_onboarding_status`
  — calculada 100% desde tablas de negocio existentes, sin ninguna tabla
  ni flag nuevo que "recordar" (mismo patrón que
  `v_organization_plan_usage`: guarda `is_org_member(...) or
  is_platform_staff()` embebida, no `security_invoker`, para servir a la
  vez a la empresa y al superadmin). 7 pasos calculables cuentan hacia
  `progress_percent`; el diagnóstico distingue explícitamente
  iniciado-sin-terminar de completado (`diagnostic_started` aparte de
  `diagnostic_completed`) porque esa granularidad SÍ existe en los datos
  reales — a diferencia del paso 8 ("revisar límites del plan"), que
  nunca se cuenta porque no hay ningún dato de negocio que indique si
  alguien "revisó" una pantalla.

**Lógica pura**: `lib/domain/legal.ts` —
`hasAcceptedAllRequiredDocuments` compara por `legal_document_id`, no
solo por tipo: si se publica una versión nueva, el documento activo
tiene un id distinto, así que una aceptación de la versión anterior dejó
de contar automáticamente, sin lógica de "comparar versiones" aparte.
`lib/domain/onboarding.ts` — `resolveOnboardingStepStatus` da 3 estados
reales (pendiente/en progreso/completado) donde los datos lo permiten
(datos de empresa, diagnóstico) y binario donde no aplica un estado
intermedio genuino (¿tienes al menos un proveedor? sí o no).

**Guardas de acceso**: `requireLegalAcceptance()`
(`lib/auth/require-legal-acceptance.ts`) se agregó a `(shell)/layout.tsx`,
`platform/layout.tsx` (platform_staff también acepta, sin excepción de
rol), `/modules`, `/select-org` y `/accept-invite` (esta última solo
para quien YA tiene sesión abierta — nunca bloquea el estado "inicia
sesión primero" que necesita seguir funcionando sin auth).
`redirectPostAuth` (`server/actions/auth.ts`) revisa aceptación legal
**antes** de honrar un `next` de invitación — el destino de la
invitación se preserva como parámetro de `/legal/accept`, para volver
ahí automáticamente después de aceptar.

**Flujo de creación de empresa**: `createOrganizationAction` ahora
redirige a `/onboarding` (antes iba directo a `/dashboard`) — nunca deja
a alguien confundido sin saber qué hacer primero. Seleccionar una
empresa YA EXISTENTE sigue yendo directo a `/dashboard`, sin pasar por
onboarding cada vez.

**UI**: portal público en `/` (módulo CPR disponible, Textil/Quality/
Construcción marcados "Próximamente", sin funcionalidad); `/terms` y
`/privacy` (públicas, muestran el documento activo); `/legal/accept`
(checklist de pendientes + casilla de aceptación); `/onboarding`
(checklist de 7 pasos + paso 8 de navegación pura + banner Demo/cuenta
no activa). Dashboard ampliado con progreso de onboarding, tickets
abiertos y conteo del Maestro de documentos. Detalle de empresa en la
consola de plataforma ampliado con progreso de onboarding y tabla de
quién aceptó qué documento legal, en qué versión y cuándo.

**Pruebas**: `npm run test:launch` (`tests/unit/launch.test.ts`) cubre
los 22 casos mínimos del sprint más varios adicionales — incluida una
prueba explícita de que una versión nueva del mismo tipo de documento
invalida automáticamente una aceptación anterior.
`tests/rls/isolation.test.ts` suma 4 casos (99-102) verificando contra
PostgreSQL real: lectura pública de documentos legales activos vía
`anon`, bloqueo de escritura para usuarios normales, bloqueo de
aceptación a nombre de otro usuario, y aislamiento + visibilidad de
plataforma en la vista de onboarding. Se actualizó un test heredado de
Sprint 10A (`tests/unit/plans.test.ts`, Corrección 9) que esperaba que
`app/page.tsx` redirigiera literalmente a `/modules` — ya no aplica
porque `/` es ahora una página pública real, no un redirect.

## Corrección post Sprint 10D — aceptación legal endurecida y último barrido de lanzamiento

Cuatro bloqueantes cerrados antes de integrar. Sin facturación, sin
pasarela de pagos, sin IA, sin CRM, sin chat en tiempo real, sin PDF
server-side, sin módulos Textil/Quality/Construcción funcionales, sin
cambios de cálculo ni metodología, sin promesa de certificación ni de
respuesta garantizada.

**Bloqueante 1 — registro de aceptación legal manipulable.**
`user_legal_acceptances_insert` (0066) solo exigía `user_id =
auth.uid()`, sin restringir `document_type`/`version`/
`legal_document_id`/`accepted_at`/`ip_address`/`user_agent` — un usuario
autenticado podía insertar una fila con datos falsificados sin pasar por
`/legal/accept`. Migración `0068`: se elimina esa política por completo
(deny-by-default real) y se reemplaza por
**`accept_active_legal_documents`** (RPC SECURITY DEFINER) — MISMO
patrón que `change_trazadoc_document_status`/`reopen_support_ticket`:
lee ella misma los documentos `terms`/`privacy` activos, inserta con
`ON CONFLICT (user_id, legal_document_id) DO NOTHING`, y usa `FOUND`
para contar exactamente cuántas aceptaciones fueron realmente nuevas.
Verificado contra PostgreSQL real: primera llamada devuelve `2`
(ambos documentos), la segunda (reintento/doble clic) devuelve `0` sin
duplicar ni fallar; un INSERT directo, incluso a nombre de uno mismo,
queda bloqueado. `server/actions/legal.ts` y `lib/db/legal.ts` se
actualizaron para delegar en la RPC en vez de construir el INSERT.

**Bloqueante 2 — acciones críticas sin revisión legal en servidor.**
`createOrganizationAction`, `acceptTeamInvitationAction` y
`updateMyProfileAction` no revisaban aceptación legal directamente —
dependían solo de que la UI hubiera redirigido a tiempo. Nuevo helper
**`assertMyLegalAcceptance()`** (`server/actions/legal.ts`) — a
diferencia de `requireLegalAcceptance()` (que siempre redirige), este
solo INFORMA si falta aceptar, dejando que cada acción decida: las 2
primeras devuelven un error de formulario claro; `acceptTeamInvitationAction`
redirige a `/legal/accept?next=...` preservando el token de invitación
para volver ahí después de aceptar. `/settings/profile` también se
protegió explícitamente (`requireLegalAcceptance("/settings/profile")`)
porque vive **fuera** de `(shell)` a propósito (debe funcionar para
alguien sin empresa todavía) y por eso nunca heredaba el guard del
layout.

Un detalle real de Next.js encontrado al validar con
`timeout 300s npm run build`: un archivo `"use server"` **solo puede
exportar funciones async** — la primera versión de
`LEGAL_ACCEPTANCE_REQUIRED_MESSAGE` vivía como constante en
`server/actions/legal.ts` y rompía el build. Se movió a
`lib/domain/legal.ts` (junto a `LEGAL_ACCEPT_CHECKBOX_TEXT`, que ya
vivía ahí correctamente desde el principio) y se reconfirmó el build
limpio.

**Bloqueante 3 — onboarding ignoraba documentos descargables.**
`v_organization_onboarding_status` (0067) ya calculaba
`has_document_master_item = has_trazadoc OR has_file_document`, pero
`lib/domain/onboarding.ts` seguía leyendo solo `hasTrazadoc` para
resolver el paso — un documento descargable subido al Maestro nunca
marcaba el paso como completo. Corregido: el paso ahora lee
`hasDocumentMasterItem` (se agregó a `OnboardingStatusFacts`,
conservando `hasTrazadoc` aparte por su valor informativo propio, sin
usarlo ya para esta decisión). Título/descripción del paso actualizados
para reflejar ambas rutas.

**Bloqueante 4 — lenguaje de lanzamiento desactualizado.** El dashboard
seguía diciendo *"Trazaloop — núcleo activo"* y *"el cálculo de
contenido reciclado llega en el siguiente sprint"* (ya existe desde
hace varios sprints); el layout de autenticación seguía mostrando
*"trazaloop · núcleo v0.1"*. Actualizados a *"Trazaloop CPR"* /
*"Gestiona diagnóstico, catálogos, evidencias, trazabilidad, cálculo de
contenido reciclado, TrazaDocs, maestro documental y soporte"* y
*"Trazaloop CPR · beta controlada"* respectivamente.

**Pruebas**: `npm run test:launch` suma 15 casos de corrección — una de
ellas (11-13) reveló un bug real en mi propio test al escribirla (el
límite de búsqueda de texto cortaba antes del cuerpo real del `case`),
corregido antes de dar el caso por válido.
`tests/rls/isolation.test.ts` suma 3 casos (103-105) verificando contra
PostgreSQL real: INSERT directo sigue bloqueado tras el endurecimiento,
idempotencia real de la RPC (2 luego 0, sin duplicar), y que los datos
guardados (tipo/versión/fecha) son siempre los reales del servidor, no
lo que un cliente hubiera podido enviar.

## Corrección final Sprint 10D — completed_steps/progress_percent cuentan documentos descargables

Último bloqueante antes de integrar. Sin facturación, sin pasarela de
pagos, sin IA, sin CRM, sin chat en tiempo real, sin PDF server-side,
sin módulos Textil/Quality/Construcción funcionales, sin cambios de
cálculo ni metodología, sin promesa de certificación ni de respuesta
garantizada.

**Causa del desfase**: la ronda anterior corrigió `has_document_master_item`
en `v_organization_onboarding_status` (0067) para combinar documento
vivo y descargable, y también corrigió `lib/domain/onboarding.ts` para
que el CHECKLIST visual leyera esa columna combinada — pero
`completed_steps` y `progress_percent`, dentro de la MISMA vista SQL,
seguían sumando el paso documental con la expresión aislada
`coalesce(td.has_trazadoc, false)`, sin combinarla con
`fd.has_file_document`. El checklist podía mostrar el paso como
completado mientras el contador numérico y el porcentaje lo seguían
contando como pendiente — un desfase visible en `/onboarding`,
`/dashboard` y `/platform/organizations/[id]` a la vez, porque los 3
leen la misma vista.

**Migración `0069_onboarding_document_master_progress_fix.sql`**:
`CREATE OR REPLACE VIEW` con el cuerpo exacto de 0067 — mismas columnas,
mismo orden — corrigiendo únicamente las 2 expresiones internas de
`completed_steps` y `progress_percent` para usar
`coalesce(td.has_trazadoc, false) or coalesce(fd.has_file_document, false)`,
igual que `has_document_master_item`. Verificado contra PostgreSQL real
con los 3 escenarios sobre la misma organización: sin ningún documento
(`completed_steps=0`), con solo un documento descargable
(`has_trazadoc=false`, `has_document_master_item=true`,
`completed_steps` sube en exactamente 1 — el caso que antes se quedaba
mal contado en 0), y con solo un documento vivo (mismo incremento,
confirmando que no hubo regresión).

**Pruebas**: `npm run test:launch` suma 5 casos de corrección.
`tests/rls/isolation.test.ts` suma 1 caso (106) verificando contra
PostgreSQL real el incremento exacto de `completed_steps`/
`progress_percent` al agregar un documento descargable sin documento
vivo, sobre una organización confirmada sin ningún documento previo.

## Decisiones y riesgos pendientes

0. **`test:rls` requiere Supabase local con Docker** (no ejecutable en todo entorno; ver sección de pruebas).
1. **Confirmación de correo**: decidir si el proyecto exige confirmación (afecta el flujo post-registro; la UI ya contempla ambos casos).
2. **Cookie de empresa activa**: es conveniencia de UI; la barrera es RLS + revalidación de membership en servidor. Endurecimiento futuro: claim en JWT.
3. **Políticas de Storage por SQL**: según plan/entorno puede requerir crearlas por Dashboard (documentado en `0015`).
4. **`audit_row_change` en `organizations`**: registra el propio `id` como `organization_id` (documentado en la función).
5. **Invitación de usuarios**: en Sprint 1 un admin solo puede agregar memberships de usuarios ya registrados; el flujo de invitación por correo queda para un sprint posterior.
