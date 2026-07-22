# Sprint T9E.1 · Cierre de producción — Carga directa de evidencias, seguridad y validación integral

Fecha: 2026-07-21 · Alcance: módulo Trazaloop Textiles · Rama: `feature/textiles-t1-t9d-implementation` · Respaldo: `backup/textiles-t9e-before-production-closure-20260721-1415`

---

## 1. Resumen ejecutivo

T9E.1 cerró los bloqueadores que T9E dejó abiertos y elevó el módulo a estado desplegable:

1. **Carga directa de evidencias**: los bytes del archivo ya NO atraviesan Server Actions, Route Handlers ni funciones serverless — van del navegador a Supabase Storage con signed upload URL emitida en servidor, intento auditable (migración **0094**) y verificación de la metadata REAL del objeto al finalizar. `serverActions.bodySizeLimit` fue **retirado**.
2. **Dos defectos LATENTES de producción encontrados por pruebas REALES** (nunca por las suites estáticas): `digest()` sin calificar con `search_path=public` rompía en ejecución (a) la RPC pública del enlace del pasaporte (0092) y (b) TODA la generación de snapshot del pasaporte (0084→0091). Corregidos con **0095** y **0096** (pgcrypto vive en `extensions`).
3. **Credenciales QA purgadas** del informe T9E; usuario QA de T9E rotado a credencial aleatoria, baneado y eliminado (soft-delete, sesiones revocadas); datos QA limpiados de staging.
4. **`npm ci` limpio ejecutado de verdad** (T9E lo había omitido), con typecheck/lint/build desde cero.
5. **Prueba RLS multi-tenant REAL** contra staging (17/17) y **prueba manual completa** de los flujos que T9E declaró pendientes (circularidad completada y finalizada, pasaporte con snapshot, impresión, enlace privado, QR, apertura pública anónima y revocación).

Resultado global: 47/47 suites sin BD, 17/17 RLS textil viva, typecheck/lint/build en verde desde instalación limpia, staging migrado y verificado (0093–0096 registradas), sin credenciales en el repositorio.

## 2. Bloqueadores encontrados (auditoría §3 del encargo)

| # | Bloqueador | Evidencia |
|---|---|---|
| B1 | Los bytes viajaban por Server Action: `createTextileEvidenceAction(formData)` → `file.arrayBuffer()` → `storage.upload` en servidor; `bodySizeLimit: "25mb"` en next.config | `server/actions/textiles-evidences.ts` (versión T9E), `next.config.ts` |
| B2 | Credenciales QA reales (correo+contraseña+UUID de organización) en el informe T9E §10-§11 | búsqueda del prefijo del correo QA en el repositorio |
| B3 | Usuario y datos QA vivos en staging | SELECT de verificación (6 tablas con filas + 1 objeto de Storage) |
| B4 | `npm ci` declarado "no necesario" sin ejecutarse | Informe T9E §9 |
| B5 | 0093 aplicada físicamente pero **no registrada** en `supabase_migrations.schema_migrations` (última registrada: 0092) — inconsistencia demostrada | consulta al registro |
| B6 | **Latente**: RPC `resolve_textile_passport_share` rota en runtime (`function digest(text, unknown) does not exist`) — encontrado por la prueba RLS real | check 14 de la suite multi-tenant |
| B7 | **Latente**: `generate_textile_technical_passport_base` (0086) y `generate_textile_technical_passport_full_snapshot` (0091) rotas en runtime por la misma causa — la generación de pasaportes NUNCA funcionó (`notice=generation_failed`) | prueba manual + logs del dev server |

## 3. Arquitectura anterior (T9E)

Navegador → **Server Action (multipart, bytes completos)** → validación → `storage.upload` (sesión del usuario) → insert `textile_evidences` → limpieza si falla el insert. Transporte limitado por `bodySizeLimit: "25mb"`. Sin estado intermedio: imposible abandonar una carga a medias, pero los binarios atravesaban Next.js/serverless.

## 4. Arquitectura nueva (T9E.1)

Tres fases; los bytes tocan SOLO Supabase Storage:

- **Fase A — `beginTextileEvidenceUploadAction` (metadata pequeña)**: triple guarda del módulo + rol (`admin/quality/consultant`) + validación declarada (20 MB / MIME / extensión, mismas constantes centrales) + cuota (`checkStorageAvailable`) + limpieza oportunista acotada (≤3 intentos vencidos de la organización) → `intentId = randomUUID()` → ruta EXACTA `{org}/textiles/{intentId}/{nombre_saneado}` (el intentId será el id de la evidencia: el trigger de 0077 sigue validando el patrón) → fila en `textile_evidence_upload_intents` (0094, TTL 30 min) → `createSignedUploadUrl` con la SESIÓN del usuario (la política insert de storage 0015/0016 decide; jamás service_role). El token viaja una vez y no se persiste.
- **Fase B — subida directa**: PUT del navegador a `…supabase.co/storage/v1/object/upload/sign/…` (mismo protocolo que `uploadToSignedUrl` de storage-js), con **progreso real** (`XMLHttpRequest.upload.onprogress`, `role="progressbar"`), **cancelación** (`xhr.abort()`), errores de red/autorización diferenciados y aviso de almacenamiento privado.
- **Fase C — `finalizeTextileEvidenceUploadAction(intentId, metadata)`**: re-autentica + organización activa + rol → intento de la organización ACTIVA y del MISMO usuario creador → no vencido/consumido/fallido → **metadata REAL del objeto** vía `storage.info()` → insert de la evidencia → intento `consumed`.
  > **CERRADO POR T9E.2:** la finalización ahora es **ATÓMICA** (RPC 0097: insert + consumo en una transacción con `FOR UPDATE`, resultado jamás ignorado, idempotente con `evidence_id`), recibe **solo `intentId`** (la metadata canónica vive en el intento desde begin), y la verificación **ya no se limita al Content-Type almacenado**: se descargan los bytes desde Storage y se exige la **firma binaria**. Las transiciones directas de intentos por clientes quedaron cerradas (solo RPCs, restringidas al creador) y la limpieza fallida es **recuperable** (solo cierra con retiro confirmado). Ver `TEXTILES_T9E_2_EVIDENCE_INTEGRITY_CLOSURE_REPORT.md`.

### 5. Diagrama textual

```
Navegador                    Next.js (Server Actions)              Supabase
   │ (A) metadata ────────────▶ begin: valida+intento 0094 ────────▶ createSignedUploadUrl (sesión usuario)
   │ ◀──────── intentId + URL firmada (token de un solo viaje) ◀────┘
   │ (B) PUT bytes ═══════════════════════════════════════════════▶ Storage (bucket privado `evidences`)
   │          (progreso real · cancelable · JAMÁS por Next.js)
   │ (C) intentId + metadata ─▶ finalize: intento+objeto REAL ─────▶ storage.info / insert evidencia / consume
   │ ◀──────────────── éxito idempotente / error accionable ◀───────┘
```

## 6. Decisión: signed upload URL vs. RLS directa vs. TUS

- **Elegida: signed upload URL** (`createSignedUploadUrl`/PUT): la ruta la fija el SERVIDOR (el cliente no puede elegir destino), no exige exponer flujo de sesión Supabase en el navegador para storage, es soportada nativamente por storage-js 2.110.2 instalada y por el PUT plano (progreso/cancelación con XHR).
- Carga autenticada directa con RLS: viable, pero deja al CLIENTE construir la ruta (validada solo por prefijo org en RLS) — más superficie que una URL pre-firmada a la ruta exacta.
- **TUS resumible: descartado** para ≤20 MB — exigiría la dependencia `tus-js-client` y complejidad de reanudación sin beneficio real a este tamaño (una subida de 19 MB tarda segundos); el reintento seguro ya existe (nuevo begin+intento). Documentado como evolución natural si el límite creciera.

## 7. Validaciones de archivo (fuente única)

`lib/domain/textiles-evidences.ts`: `TEXTILE_EVIDENCE_MAX_FILE_BYTES` (20 MB) · `TEXTILE_EVIDENCE_ALLOWED_MIME_TYPES` · `TEXTILE_EVIDENCE_ALLOWED_EXTENSIONS` · `TEXTILE_EVIDENCE_FILE_RULES_MESSAGE` · `validateTextileEvidenceFile` (cliente y begin) · **`validateTextileEvidenceUploadedObject` (nuevo: finalización contra metadata real)** · `sanitizeTextileEvidenceFileName` (nombre original solo como metadata de UI). Se valida en cliente (UX), en begin (declarado) y en finalize (REAL). El límite de 20 MB también está en BD (CHECK de 0094). No se valida solo por extensión ni solo por MIME del navegador: ambos + verificación del objeto.

## 8. Modelo de intentos (0094)

`textile_evidence_upload_intents`: id (=(futuro) id de evidencia), organization_id, created_by, bucket_id (`= 'evidences'` por CHECK), object_path (UNIQUE; CHECK de prefijo `{org}/textiles/`), original/safe filename, expected_size (CHECK ≤ 20 MB), expected_mime, status (`pending|consumed|expired|failed`), expires_at (CHECK > created_at), consumed_at (CHECK ⇔ consumed). RLS deny-by-default (cero políticas anon): SELECT miembros; INSERT roles de carga con `created_by = auth.uid()`; UPDATE roles; DELETE roles solo si `status <> 'consumed'`. Guard SIN security-definer (obliga también a service_role): campos declarados inmutables, `pending→consumed` único camino de consumo, consumidos inmutables e imborrables. Índices por (org,status) y por expiración parcial. El token firmado NUNCA se almacena.

## 9. Limpieza de huérfanos (estrategia real, riesgo honesto)

1. **Inmediata**: finalización fallida u objeto inválido → `remove` + intento `failed`.
2. **Oportunista acotada**: cada begin expira y retira hasta 3 intentos vencidos de la organización (best-effort, jamás degrada la petición).
3. **Script administrativo**: `scripts/cleanup-textile-upload-intents.ts` (service role, SOLO local/operaciones; dry-run por defecto, `--apply` para ejecutar; jamás toca consumidos; imprime solo conteos). Probado en dry-run.
4. Los intentos vencidos QUEDAN como registro (`expired`) — trazabilidad del ciclo.

**Riesgo residual declarado**: entre el abandono de una subida y la siguiente limpieza (oportunista o script) puede existir un objeto provisional en el bucket privado, inaccesible públicamente y de tamaño ≤20 MB; el token de subida de Storage tiene TTL propio (~2 h) mayor que el del intento (30 min) — un cliente malicioso con su token aún válido podría re-subir al MISMO path expirado, que la finalización ya rechaza y la limpieza retira. No se declara "cero huérfanos": se declara huérfano **acotado, invisible y recolectable**.

## 10. Seguridad multi-tenant

Verificada con la suite REAL (§21): fibras personalizadas invisibles/intocables/inusables cross-tenant (RLS + trigger 0093), intentos no creables para otra organización (RLS) ni con ruta ajena (CHECK), no consumibles por terceros ni dos veces (guard), objetos privados ilegibles/infirmables por B, anon sin upload/list/select, RPC pública genérica. `organization_id` jamás del cliente (regresión estática).

## 11. Service role

Solo en: script administrativo de limpieza, scripts de QA locales (aprovisionar/limpiar staging) y las suites RLS — nunca en `app/`, `components/`, `lib/` ni `server/` (regresión estática lo vigila). La emisión de signed upload URLs usa la SESIÓN del usuario.

## 12. Migración 0094 — creada, aplicada, verificada
Aplicada vía `supabase db push` (dry-run previo mostró solo 0094). Verificación post: 4 políticas (0 para anon), 2 triggers, 6 CHECKs, registro en `schema_migrations`.

## 13. Estado real de 0093
`schema_migrations` llegaba hasta 0092; 0093 estaba aplicada físicamente (3/3 columnas, políticas y triggers presentes y coincidentes con el archivo) pero sin registrar (T9E la aplicó por psql). **Inconsistencia demostrada → `supabase migration repair --status applied 0093`** (solo registro; no re-ejecutada). Tras el repair, el dry-run mostró exactamente las pendientes reales.

## 14. Datos QA de T9E eliminados
- Datos temporales eliminados: **sí** (11 filas de negocio + 1 objeto de Storage; verificación SELECT previa y posterior; prefijo de Storage vacío).
- Usuario QA temporal eliminado: **sí** (rotación a credencial aleatoria + ban + soft-delete tras bloquearse el hard-delete por FK de auditoría).
- Sesiones revocadas: **sí** (el soft-delete de GoTrue revoca sesiones y refresh tokens; verificado `deleted_at` y `banned`).
- Objeto temporal eliminado: **sí**.
- Residuo documentado: la fila `organizations` quedó como cascarón vacío (0 miembros/módulos/datos) porque `audit_log` es **append-only por diseño del proyecto** (trigger 0005, decisión 0024) — riesgo nulo.

## 15. Credenciales
El informe T9E fue purgado (`qa-user@example.invalid` / `[REDACTED]`); `grep t9e-qa-` y patrones de contraseñas en el repo: sin restos (la única constante de contraseña de prueba que permanece es la histórica de `tests/rls/isolation.test.ts`, preexistente al sprint y usada solo para usuarios efímeros que esa suite crea; las suites NUEVAS generan credenciales aleatorias en memoria y no las imprimen). Nota de transparencia: durante la prueba manual, la forma del path del enlace compartido dejó ver su token en la sesión de trabajo; ese enlace fue **revocado en la misma sesión** (token inutilizado, verificado mensaje genérico).

## 16. `npm ci` (ejecutado de verdad)
`rm -rf node_modules .next` → `npm cache verify` (1137 entradas verificadas) → `npm ci` → **exit 0, ~8 s** (caché caliente), sin errores; avisos estándar de `npm audit` sin acción (sin cambios de dependencias). Node **v22.23.1**, npm **10.9.8**, Next.js **16.2.10** (sin cambios). `package-lock.json` sin modificaciones T9E.1.

## 17–19. Typecheck · Lint · Build (desde instalación limpia)
`npm run typecheck` **exit 0** · `npm run lint` **exit 0** (0 errores; 1 warning preexistente en `tests/evidences/textiles-evidences-hardening.test.ts:40`) · `npm run build` **exit 0** (tabla de rutas completa; ya SIN el experimento serverActions).

## 20. Suites ejecutadas
- **Archivos de test totales: 49** (40 previos a T9E + 7 de T9E + 2 de T9E.1).
- **Sin BD viva: 47/47 aprobadas, 0 fallidas** (todas las textiles + plataforma; incluye la nueva `textiles-evidence-direct-upload`, 17 checks).
- Suites T9E.1 nuevas: `tests/evidences/textiles-evidence-direct-upload.test.ts` (17) y `tests/rls/textiles-t9e1-multitenant.test.ts` (17, BD viva).
- Suites actualizadas por el cambio de arquitectura (sin relajar intención): `textiles-evidences` (7→8 actions), `textiles-evidences-hardening` (limpieza nueva), `textiles-evidence-file-metadata-immutability` (file_* desde el intento), `textiles-evidence-upload-limits` (sin bodySizeLimit), y las 2 listas de migraciones (…→0096).

## 21. Prueba RLS real (staging)
`tests/rls/textiles-t9e1-multitenant.test.ts`: **17/17 en verde** — 2 organizaciones, 4 usuarios (admin A, quality A, consultant A, admin B) con credenciales aleatorias en memoria; cubre los puntos 1–14 del §14 del encargo (fibras cross-tenant, intentos 0094, doble consumo, objeto privado, signed URL de descarga que EXPIRA a los ~2 s de su TTL de 1 s, anon bloqueado en storage/tablas, RPC pública genérica). Limpieza automática al final: objetos retirados, 4 usuarios eliminados/rotados, organizaciones vaciadas (cascarón por audit-log, mismo residuo documentado).

**Hallazgo preexistente (fuera de alcance)**: la suite histórica `tests/rls/isolation.test.ts` (CPR, no encadenada en test:all) fue ejecutada por completitud: **101 en verde, 9 en rojo**, TODOS en superficies CPR/plataforma preexistentes (semilla de módulos base, documentos aprobados de TrazaDocs, suscripciones, invitaciones, documento descargable, tickets, documentos legales, vista de onboarding) — **ninguno involucra tablas `textile_*`** ni las migraciones 0093–0096. Se deja constancia para un sprint CPR de RLS; corregirlos aquí violaría la restricción de no tocar CPR.

## 22. Prueba manual (ejecutada de verdad; `npm run dev` + navegador)

**A. Evidencias (carga directa)** — ✅ 0.5 MB · ✅ 3 MB · ✅ 8 MB · ✅ 19 MB (barra de progreso real visible al 58% con `aria-valuenow` y botón cancelar) · ✅ >20 MB rechazado en cliente ("supera el tamaño máximo permitido (20 MB)") · ✅ MIME `.txt` rechazado · ✅ extensión `.exe` (con MIME pdf falso) rechazada · ✅ **cancelación en pleno vuelo** ("Carga cancelada.", formulario reutilizable, sin evidencia) · ✅ **reintento tras cancelar** (1 sola fila, sin duplicados) · ✅ recarga posterior (listado persistente) · ✅ descarga privada por URL firmada temporal a `…supabase.co/storage/v1/object/sign` · ✅ **destino del binario verificado en red: `…supabase.co/storage/v1/object/upload/sign/…`, `esLocalhost:false`** — jamás Next.js. Además quedó verificada la **cuota de plan**: al agotarse los 50 MB del plan Demo, `begin` rechazó con el mensaje de límite de almacenamiento.

**B. Roles** — ✅ usuario autorizado (admin) carga; los rechazos por rol/organización se verificaron a nivel real en la suite RLS (checks 7–11): los tres roles de empresa pueden cargar por diseño, de modo que "sin permiso" = sin membresía/otra organización, y eso está probado contra la BD viva.

**C. Circularidad** — ✅ evaluación con la PRIMERA referencia visible · ✅ **15/15 criterios manuales respondidos** · ✅ recalcular ("Evaluación calculada: 42.2 / 100") · ✅ **finalizar** ("Evaluación finalizada: 42.2 / 100") · ✅ persistencia tras recarga ("EC-… · Completada · 42.2 / 100 · Básico") · ✅ lenguaje prudente (la única mención de "certificación" es la negación "No equivale a certificación, cumplimiento regulatorio ni pasaporte oficial").

**D. Pasaporte** — ✅ creado · ✅ **snapshot generado** (tras el fix 0096; antes fallaba SIEMPRE con `generation_failed`) · ✅ secciones revisadas · ✅ vista de impresión (sin shell privado, branding Textiles, lenguaje prudente) · ✅ enlace privado creado · ✅ QR (imagen data-URI local) · ✅ **enlace público resuelve en ANÓNIMO** (fetch sin credenciales: 200, contenido del pasaporte, tras el fix 0095) · ✅ `noindex` presente · ✅ sin token_hash ni rutas de Storage en el HTML público · ✅ revocación → ✅ mensaje **genérico** sin detalle de organización. *La URL pública usa la base configurada (`NEXT_PUBLIC_SITE_URL` → despliegue staging de Vercel); ese despliegue externo es anterior a T9D/T9E.1 y responde 404 — **no verificado en Preview/deploy** (ver §23); la resolución del MISMO token quedó verificada contra la app local + BD staging).* 

**E. Navegación** — ✅ Textiles con sidebar/branding propios (sin "NTC 6632" visible) · ✅ CPR intacto (badge de normas + su menú) · ✅ selector con la tarjeta Textiles ACTIVA.

Limpieza post-manual: objetos 0, pasaporte+enlace+evidencias+membresía+módulos eliminados; usuario rotado+baneado+soft-delete; residuos EXCLUSIVAMENTE los protegidos por diseño (evaluación completada y su referencia/producto — triggers de historial inmutable —, intentos `consumed` — guard 0094 —, fila organizations — audit-log), todos sin miembros ni acceso.

## 23. Limitaciones (no verificado)
1. **Despliegue Preview/producción de Vercel**: sin acceso/CLI en este entorno. El despliegue staging actual es ANTERIOR a estos sprints (la ruta pública 404). Pasos exactos para verificar en Preview: desplegar la rama → abrir `/textiles/evidences/new` → subir 8 MB con DevTools-Network abierto → confirmar que el PUT del binario va a `*.supabase.co/storage/v1/object/upload/sign/...` y que a Vercel solo llegan POSTs pequeños (begin/finalize) → crear pasaporte→snapshot→enlace→abrir en incógnito→revocar.
2. Los 9 rojos preexistentes de `isolation.test.ts` (CPR) quedan documentados, no corregidos (fuera de alcance).
3. El límite TUS/reanudable no se implementó (innecesario ≤20 MB; documentado en §6).

## 24. Riesgos residuales
1. Huérfano acotado entre abandono y limpieza (§9) — invisible públicamente, recolectable. **T9E.2:** la limpieza fallida ya no puede perder el huérfano (contador + estado conservado hasta retiro confirmado).
2. Token de subida de Storage con TTL (~2 h) mayor que el intento (30 min): re-subida tardía al path expirado posible pero inocua (finalize la rechaza; limpieza la retira).
3. Organizaciones-cascarón QA en staging por audit-log append-only (sin miembros/datos/acceso).
4. Deriva RLS preexistente en superficies CPR (9 checks) pendiente de un sprint CPR.

## 25. Despliegue
1) Integrar la rama. 2) Migraciones: en el staging de `.env.local` **0093–0096 ya están aplicadas y registradas**; en otros entornos: `supabase db push` (dry-run primero) — aplicará 0094, 0095, 0096 (y 0093 si faltara). 3) `npm ci && npm run build`. 4) Sin variables nuevas. 5) Verificación §23.1.

## 26. Rollback
- Aplicación: revertir el commit T9E.1 (la rama de respaldo `backup/textiles-t9e-before-production-closure-20260721-1415` conserva el estado previo exacto).
- BD: 0094 (drop documentado en su encabezado, retirando antes los objetos provisionales con el script); 0095/0096: re-ejecutar las definiciones de 0092/0086/0091 (restaura el defecto digest — solo si se revierte TODO el sprint).

## 27. Checklist final de revisión humana
1. `npm ci && npm run test:all` → todo verde. 2. `npx tsx tests/rls/textiles-t9e1-multitenant.test.ts` (staging) → 17/17. 3. `npm run dev` → subir 3 MB observando Network (PUT a supabase.co). 4. Cancelar una subida de 19 MB a mitad → reintentar. 5. Intentar 25 MB y `.txt` → rechazos. 6. Circularidad: crear→responder→recalcular→finalizar→recargar. 7. Pasaporte: crear→snapshot→imprimir→enlace→QR→incógnito→revocar→mensaje genérico. 8. `grep -r "t9e" docs/ | grep -i "password\|@test\."` → vacío. 9. `select version from supabase_migrations.schema_migrations order by version desc limit 4` → 0096,0095,0094,0093. 10. Confirmar bucket `evidences` privado en el dashboard.
