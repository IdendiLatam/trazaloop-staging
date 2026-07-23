# TEXTILES_T3_IMPLEMENTATION_REPORT — Catálogos textiles base

**Sprint**: T3 · **Fecha**: 2026-07-18 · **Estado**: ejecutado, suite completa en verde.

---

## 1. Qué se construyó

Los seis catálogos base del módulo Textil, tras la triple guarda existente
(`TEXTILES_MODULE_ENABLED` + organización activa + módulo `textiles` en
`organization_modules`):

| Catálogo | Ruta | Tabla | Alcance |
|---|---|---|---|
| Resumen | `/textiles/catalogs` | — | Tarjetas con conteos + avisos |
| Proveedores | `/textiles/catalogs/suppliers` | `textile_suppliers` | CRUD + activar/desactivar |
| Fibras | `/textiles/catalogs/fibers` | `textile_fiber_types` | Global, SOLO lectura, seed de 19 |
| Materiales e insumos | `/textiles/catalogs/materials` | `textile_materials` | CRUD; fibra principal + proveedor |
| Avíos / componentes | `/textiles/catalogs/components` | `textile_components` | CRUD; separabilidad preliminar |
| Procesos internos | `/textiles/catalogs/processes` | `textile_processes` | CRUD; riesgo de trazabilidad |
| Procesos tercerizados | `/textiles/catalogs/outsourced-processes` | `textile_outsourced_processes` | CRUD; tercero = proveedor propio |

`/textiles` ahora muestra dos secciones disponibles (Diagnóstico y
Catálogos) y seis futuras alineadas a T4–T9.

## 2. Migración `0073_textile_catalogs.sql`

Aditiva, sin drops, sin tocar CPR ni migraciones previas. Patrón espejo del
catálogo CPR (0020) + inmutabilidad (0024) en las cinco tablas por empresa:

- `unique (organization_id, name)` y `unique (organization_id, id)`;
  `internal_code` de materiales único por empresa (índice parcial).
- Triggers: `set_updated_at`, `force_created_by`,
  `prevent_organization_id_change`, `audit_row_change` (helpers existentes,
  sin modificarlos).
- CHECKs de enums (tipos de proveedor/material/componente/proceso,
  separabilidad, riesgo) y de formato de correo.
- **FK compuesta** `(organization_id, supplier_id) →
  textile_suppliers(organization_id, id)` en materiales, componentes y
  tercerizados: el cross-tenant es imposible a nivel de BD, no solo de app.
- RLS plantilla CPR: select/insert/update para miembros de la empresa;
  delete solo `admin`/`quality` (no expuesto en UI: los catálogos se
  desactivan para no romper referencias de T4–T9). Anónimos: nada.
- `textile_fiber_types`: global, política única de SELECT para
  autenticados; sin escritura de clientes. Seed idempotente
  (`on conflict do nothing`) de 19 fibras con familias (ISO 2076 como
  referencia de nomenclatura) y variantes recicladas/orgánicas marcadas
  como **declaradas**.

## 3. Código

- `lib/domain/textiles-catalogs.ts` — dominio puro: enums espejo de los
  CHECK, etiquetas en español, `validateCatalogName`, `cleanText`,
  `isValidEmail`, aviso de no certificación.
- `lib/db/textiles-catalogs.ts` — listados bajo RLS con sesión real (joins
  de nombre de proveedor/fibra); verificadores de pertenencia de proveedor
  y de fibra activa.
- `server/actions/textiles-catalogs.ts` — 16 actions (5 create, 5 update,
  5 toggle vía helper común, y las listas viven en la capa db). Todas:
  guarda de módulo compartida (`requireTextilesForAction`, extraída a
  `lib/auth/require-textiles-module.ts` y reutilizada por el diagnóstico),
  `checkOrganizationCanMutate`, validación de dominio previa a BD,
  `organization_id` siempre del servidor, updates filtrados por empresa,
  duplicados con mensaje amigable (23505), errores seguros, sin
  service_role.
- `components/domain/textiles/catalog-manager.tsx` — gestor cliente
  genérico (campos configurables por página, actions tipadas por props).

## 4. Lenguaje y normas

Los textos citan marcos solo como referencia conceptual (ISO 22095, ISO
2076, ISO 14021, ESPR 2024/1781) y repiten en UI y seed que registrar un
proveedor, fibra o material **no equivale** a cumplimiento, certificación
ni validación externa; `recycled_claim`/`organic_claim` son declaraciones
preliminares cuya evidencia llega en T5. El escáner de cumplimiento pasa.

## 5. Divergencias respecto al roadmap original

El prompt operativo redefinió T3 (registrado también en el roadmap):
productos, referencias y colecciones se movieron a T4 junto con la
composición (difiere Q-02/Q-03); los avíos/componentes se adelantaron de T4
a T3 como catálogo simple; se añadió el catálogo de procesos tercerizados.
Sin búsqueda avanzada, importación/exportación ni carga de archivos, por
instrucción expresa.

## 6. Qué NO se tocó

CPR (rutas, cálculo, evidencias, TrazaDocs, maestro documental), soporte,
legal, onboarding, planes globales, storage, migraciones existentes,
diagnóstico Textil (solo la guarda compartida, sin cambio de
comportamiento). Sin planes por módulo ni Plataforma-M1. `TEXTILES_MODULE_ENABLED`
sigue en `false` por defecto: nada es visible públicamente.

## 7. Verificación

- `npm run test:all` en verde (typecheck, lint, cumplimiento y todas las
  suites previas) + `npm run build` en verde con las 7 rutas nuevas.
- Nueva suite `npm run test:textiles-catalogs` (16 checks): dominio puro,
  tablas creadas exactas (y prohibidas ausentes), patrón 0020/0024 completo,
  RLS y fibras solo lectura, FK compuestas, seed idempotente, guardas en
  todas las mutaciones, `organization_id` del servidor, rutas bajo el
  namespace protegido y aviso de no certificación.
- Suite T1/T2 actualizada: migraciones 0070–0073 y shell con
  `catalogs/ + diagnostic/`.

## 8. Siguiente paso sugerido

Sprint T4 (productos, referencias y composición estructurada), cerrando
Q-02/Q-03 antes de modelar variantes; `declared_composition` de T3 queda
como texto preliminar a migrar de forma no destructiva.
