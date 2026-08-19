# Q0_REPOSITORY_DISCOVERY

**Sprint:** Q0 — Technical Discovery & Schema Mapping
**Fecha:** 2026-08-18
**Repositorio:** `~/Developer/trazaloop2`
**Rama inspeccionada:** `hotfix/auth-01-password-recovery`
**Alcance:** DISCOVERY-ONLY. Ninguna modificación funcional, ninguna migración, ningún deploy.
**Documentos rectores:** `docs/architecture/Trazaloop_Documento_Maestro_v1.1.md`, `docs/architecture/Trazaloop_Quality_Architecture_Baseline_v1.0.md`

---

## 1. Método y regla de evidencia

Todo lo afirmado aquí procede de **código y migraciones leídos directamente**. La documentación
histórica de `docs/platform/` y `docs/modules/` se usó únicamente como pista de dónde mirar,
nunca como prueba de estado (Baseline §0.5).

Clasificación usada:

| Estado | Significado |
|---|---|
| **IMPLEMENTADO** | Existe tabla/función/código que ejecuta la capacidad y está conectado a una ruta o action real |
| **PARCIAL** | Existe y funciona, pero no cubre la semántica completa que el baseline exige |
| **PLACEHOLDER** | Existe nombre/ruta/fila de catálogo, sin lógica detrás |
| **NO IMPLEMENTADO** | No existe |
| **NO DETERMINADO** | Evidencia insuficiente en el repositorio |

---

## 2. Estado de Git

| Dato | Valor |
|---|---|
| Rama actual | `hotfix/auth-01-password-recovery` |
| Rama principal | `main` |
| Commits totales | 33 |
| Working tree al iniciar Q0 | limpio |
| Último commit | `0289a8d fix(auth): complete password recovery flow` |
| Versión de producto | `1.0.2` (`package.json`) |

Los últimos commits corresponden a estabilización de la v1.0.x: recuperación de contraseña,
alineación de regresión, endurecimiento de almacenamiento de planes y navegación, y una
corrección de `pgcrypto` en la creación de organizaciones.

**Observación:** el historial de Git es corto (33 commits) frente al volumen de código. El
historial de evolución real vive en los informes de `docs/platform/` y en los encabezados de las
migraciones, que están inusualmente bien documentados. Para Quality, **la migración es la unidad
de historia técnica fiable**, no el commit.

---

## 3. Stack real verificado

| Capa | Tecnología | Evidencia |
|---|---|---|
| Framework | Next.js (App Router) | `app/`, `next.config.ts`, `proxy.ts` |
| Lenguaje | TypeScript estricto | `tsconfig.json`; `npx tsc --noEmit` pasa sin errores |
| Base de datos | PostgreSQL (Supabase) | `supabase/migrations/` |
| Auth | Supabase Auth | `lib/supabase/server.ts`, `handle_new_user()` (0004) |
| Storage | Supabase Storage privado | buckets `evidences`, `trazadocs-documents`, `organization-assets` |
| Aislamiento | Row Level Security | 291 políticas en 87 tablas |
| Despliegue | Vercel | `.vercel/`, `scripts/release/` |
| Build | Webpack (`next build --webpack`) | `package.json` |

**Dependencias de producción: 8.** Es un stack deliberadamente austero, sin ORM, sin librería de
estado, sin UI kit pesado. El acceso a datos es SQL y cliente Supabase directo.

**No existe generación de tipos de Supabase.** No hay `database.types.ts` ni equivalente; las
filas se tipan a mano en `lib/db/*` mediante `Record<string, unknown>` y mapeadores explícitos.
Es una decisión consistente en todo el repositorio, no un olvido puntual.
→ Ver decisión requerida **DR-08**.

---

## 4. Arquitectura de carpetas y separación de capas

El repositorio aplica una separación de capas estricta y muy consistente:

```text
lib/domain/     lógica PURA — sin BD, sin React, sin Next. Testeable en aislamiento.
lib/db/         acceso a datos — "server-only", corre bajo RLS con la sesión real.
server/actions/ server actions — validan sesión, organización, rol, módulo y plan.
app/            rutas y UI (App Router).
components/     presentación.
lib/auth/       guards de sesión, organización activa, módulo y plataforma.
lib/modules/    catálogo canónico de módulos y regla de acceso comercial.
lib/plans/      tipos y lógica pura de planes y límites.
```

| Carpeta | Archivos |
|---|---|
| `app/` | 118 |
| `components/` | 119 |
| `lib/` | 105 |
| `server/` | 37 |
| `supabase/` | 111 (102 migraciones SQL) |
| `tests/` | 110 (95 archivos `.test.ts`) |
| `docs/` | 140 |

Total TypeScript: 248 `.ts` + 233 `.tsx`.

La regla **"la lógica pura no toca la base"** se cumple de forma verificable: `lib/domain/*` no
importa Supabase en ningún archivo, y hay pruebas estáticas que lo vigilan
(`tests/unit/t9f1-module-operational-enforcement.test.ts`).

---

## 5. Módulos existentes

| Módulo | `module_code` | Estado real | Evidencia |
|---|---|---|---|
| Núcleo | `core` | IMPLEMENTADO (infraestructura) | 0004, siempre `full`, nunca vence |
| Trazaloop PCR | `traceability_6632` | IMPLEMENTADO | 0020–0035, 0103–0110; rutas `(cpr)` |
| Trazaloop Textiles | `textiles` | IMPLEMENTADO | 0070–0099; rutas `/textiles` |
| TrazaDocs | `docs` | PARCIAL — ver §6 | 0043–0048, 0057–0058, 0082–0083 |
| **Trazaloop Quality** | `quality` | **PLACEHOLDER** | fila de catálogo en 0100, `is_available=false`, `is_functional=false`; `lib/modules/catalog.ts` lo declara `coming_soon` |
| Trazaloop Construcción | `construccion` | PLACEHOLDER | ídem |

**Hallazgo clave:** Quality **ya existe como identidad de módulo** en la plataforma, tanto en base
de datos (`modules.code='quality'`) como en el catálogo canónico de código
(`lib/modules/catalog.ts`), en estado `coming_soon`. No hay ni una sola tabla, función, ruta,
action o test de Quality. La ruta de activación comercial ya está construida y probada: basta
cambiar `status` a `functional` en el catálogo y `modules.is_functional` a `true` — con la
salvedad de que existe una prueba que exige que ambos coincidan.

Esto significa que **Quality no necesita inventar su modelo de acceso comercial**: lo hereda.

---

## 6. Estado de TrazaDocs (resumen; detalle en `Q0_TRAZADOCS_REUSE_ANALYSIS.md`)

Advertencia importante contra la lectura ingenua del repositorio: la migración **0042** retiró
`docs` de los módulos que se activan automáticamente, con este comentario textual:

> *"activarlo creaba la expectativa visible de un «Trazaloop Docs» funcional que no existe
> (constructor documental, PDF, etc. — explícitamente fuera de alcance)"*.

Esa nota es de **Sprint 8.4**. El Sprint 9 (0043–0048) **sí construyó** el motor documental. Hoy
TrazaDocs está IMPLEMENTADO y en uso real desde CPR y Textiles, pero el `module_code = 'docs'`
sigue sin activarse: **TrazaDocs no se gobierna como módulo comercial**, se comporta como motor
transversal accesible a cualquier miembro de la organización.

Es exactamente la dirección que el baseline pide (D-16, DA-19), pero está **sin formalizar**.

---

## 7. Convenciones obligatorias detectadas

Estas convenciones son sistemáticas y Quality debe respetarlas. No son estilo: son el contrato
de seguridad del proyecto.

1. **`organization_id` explícito** en toda tabla tenant-owned, más `unique (organization_id, id)`
   para habilitar FK compuestas.
2. **FK compuesta obligatoria** `(organization_id, parent_id) → padre(organization_id, id)` en toda
   relación hijo-padre. Impide relaciones cruzadas entre empresas a nivel de base de datos, no de
   aplicación. Regla instaurada en 0024 y respetada después sin excepción.
3. **`organization_id` inmutable** vía trigger `prevent_organization_id_change()`.
4. **`created_by` no falsificable** vía trigger `force_created_by()`: si hay `auth.uid()`, se
   impone; el valor del cliente se ignora.
5. **Migraciones aditivas.** Ninguna migración reescribe otra ya desplegada. Las funciones se
   sustituyen con `create or replace` conservando firma.
6. **Rollback documentado en el encabezado** de cada migración de riesgo.
7. **RLS deny-by-default.** Sin política que conceda, no hay acceso. `DELETE` se omite
   deliberadamente en la mayoría de tablas.
8. **Historial append-only** con `forbid_mutation()` para tablas que no deben cambiar.
9. **`security_invoker = true`** en las vistas, para que hereden la RLS de las tablas base. Con
   una única excepción deliberada y documentada (`v_platform_organizations`, 0041).
10. **`organization_id` jamás viaja desde el cliente.** Siempre sale de `requireActiveOrg()`.
11. **Español** en toda la UI y en los mensajes de error de las funciones SQL.

---

## 8. Pruebas

95 archivos de prueba organizados por dominio: `unit/`, `rls/`, `db/`, `evidences/`,
`traceability/`, `passports/`, `circularity/`, `trazadocs/`, `products/`, `diagnostic/`,
`compliance/`, `release/`.

Tres naturalezas distintas:

- **Estáticas** — leen el código fuente y verifican invariantes arquitectónicas (p. ej. que ninguna
  action de CPR/Textiles use el cliente admin, o que el catálogo de módulos coincida con la BD).
  Son el mecanismo con el que el proyecto impide regresiones de arquitectura. Muy reutilizable
  para Quality.
- **De base (`tests/db/`)** — assertions SQL sobre PostgreSQL local vía `run-local-pg.sh`.
- **De RLS (`tests/rls/`)** — aislamiento multiempresa real contra Supabase, incluida una batería
  adversarial (`t9f5-adversarial-attacks.test.ts`).

`npm run test:all` encadena ~80 suites.

**Ejecutado en Q0:** `npx tsc --noEmit` → **sin errores**.
**Deliberadamente NO ejecutado:** `tests/rls/*` y `tests/release/*`, porque abren cliente real
contra Supabase y podrían escribir. Q0 no toca ningún entorno.

---

## 9. Scripts operativos

`scripts/` contiene utilidades de release y diagnóstico: `verify-production.ts`,
`smoke-staging.ts`, `diagnose-org.ts`, `seed-demo.ts`, `repair-staging-seeds.ts`,
`release/v1/precheck-env.ts`, `release/v1/cleanup-staging.ts`.

`package.json` define `predeploy` como una cadena de typecheck + build + lint + 15 suites. Existe
una disciplina de despliegue real, no improvisada.

---

## 10. Estado funcional general

| Área | Estado |
|---|---|
| Multiempresa, membresías, roles | IMPLEMENTADO |
| RLS deny-by-default | IMPLEMENTADO (87/87 tablas) |
| Superadministración de plataforma | IMPLEMENTADO |
| Planes y acceso comercial por módulo | IMPLEMENTADO |
| Storage privado con contabilidad de cuota | IMPLEMENTADO |
| Bitácora técnica (`audit_log`) | IMPLEMENTADO |
| PCR (trazabilidad + contenido reciclado) | IMPLEMENTADO |
| Textiles (trazabilidad + pasaporte) | IMPLEMENTADO |
| TrazaDocs (documentos vivos + archivos) | IMPLEMENTADO, con brechas frente al baseline |
| Legal (aceptaciones, políticas) | IMPLEMENTADO |
| Soporte (tickets) | IMPLEMENTADO |
| **Trazaloop Audit (gestión)** | **NO IMPLEMENTADO** |
| **Motor de eventos / reglas / alertas / tareas / workflow** | **NO IMPLEMENTADO** |
| **Notificaciones salientes** | **NO IMPLEMENTADO** |
| **Trazaloop Quality** | **NO IMPLEMENTADO** (solo placeholder de catálogo) |

---

## 11. Lectura para Quality

El repositorio está **considerablemente más maduro de lo que un baseline "campo verde" supondría**
en fundación, seguridad y disciplina de migración, y **completamente vacío** en las capas que
Quality necesita como sustrato: eventos, reglas, alertas, tareas, workflow, casos y acciones.

La consecuencia práctica es que Quality **no es un módulo más**: es la primera funcionalidad que
exige construir la capa 3 del baseline (motores transversales), que hoy no existe. Ese es el
verdadero coste de entrada, no las tablas de dominio.
