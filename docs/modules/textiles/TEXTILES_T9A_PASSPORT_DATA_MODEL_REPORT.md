# Trazaloop Textil · Sprint T9A — Modelo de datos y snapshot del pasaporte técnico textil (Reporte)

> Julio 2026. Base técnica del pasaporte técnico textil: tabla, versionamiento
> por registros, snapshot protegido, validación de destino, RLS multiempresa,
> RPCs controladas y ampliación aditiva de vínculos de evidencias. **Sin UI,
> rutas, páginas, navegación, impresión, QR ni portal** (eso es T9B/T9C/T9D).
> CPR sin cambios funcionales. Fuente de verdad: la arquitectura T9.0.

## 1. Qué se implementó

Migración `0084_textile_technical_passports.sql` (única, 523 líneas) con:

1. **Tabla `textile_technical_passports`** (nombre correcto; **no**
   `textile_material_passports`) — un registro por versión.
2. **Versionamiento por registros**: `passport_code` estable +
   `passport_version` incremental, con `unique(organization_id, passport_code,
   passport_version)`.
3. **Snapshot y derivados**: `snapshot_json`, `data_sources_json`, `gaps_json`,
   `warnings_json`, `recommendations_json`, `source_hash`.
4. **Sellos de ciclo de vida**: `generated_*`, `reviewed_*`, `approved_*`,
   `obsolete_*`, `created_by`.
5. **Estados** con el ciclo oficial `draft → generated → in_review →
   approved_internal → obsolete` (incluye `generated`; `approved_internal`
   nunca es aprobación externa).
6. **Integridad**: `unique(organization_id, id)`, FKs compuestas por
   `(organization_id, id)` a `textile_references`, `textile_output_lots` y
   `textile_circularity_assessments`, e índices por referencia/lote/estado/
   código.
7. **Validación de destino** (trigger, espejo de `validate_…_target` de 0080):
   el lote debe pertenecer a una orden de la misma `reference_id`; la
   evaluación de circularidad debe corresponder a esa `reference_id`.
8. **Protección del snapshot** (trigger, patrón T7.1): sin el flag
   transaccional interno, el INSERT exige nacer `draft` con snapshot/derivados
   vacíos y sin sellos; en UPDATE, snapshot + derivados + `source_hash` y la
   identidad (referencia, lote, código, versión) son inmutables una vez el
   pasaporte deja de ser `draft`. El trigger solo lee el flag.
9. **RLS deny-by-default**: SELECT miembros; INSERT admin/quality/consultant;
   UPDATE admin/quality siempre y consultant solo en `draft`/`in_review`;
   DELETE admin/quality solo en `draft`.
10. **RPC `generate_textile_technical_passport_base(uuid)`**: verifica sesión,
    organización, módulo Textil habilitado, rol y estado; arma el snapshot
    **base** (identidad + esqueleto de las 14 secciones + `schema_version =
    'textile_technical_passport_v1'` + disclaimer obligatorio), calcula un
    `source_hash` base con `digest(...,'sha256')` y pasa a `generated`, todo
    bajo el flag interno.
11. **RPC `change_textile_technical_passport_status(uuid, text)`**: transiciones
    válidas con roles y sellos atómicos (aprobación interna solo admin/quality).
12. **Evidencias**: ampliación **aditiva** de `textile_evidence_links`
    (`entity_type += 'technical_passport'` → 17 a 18 valores;
    `link_type += 'passport_support'`) y extensión de
    `validate_textile_evidence_link_org()` para resolver la organización del
    pasaporte. Todos los valores previos se conservan.

Helpers mínimos (base para T9B, sin UI): `lib/domain/textiles-passport.ts`
(schema_version, estados + etiquetas, disclaimer, nota de aprobación interna,
las 14 `section_keys`, severidades de brecha, tipos del snapshot base) y
`lib/db/textiles-passport.ts` (`listTechnicalPassports`,
`getTechnicalPassport`, y las dos RPCs envueltas).

## 2. Decisiones respetadas de la arquitectura T9.0

Snapshot (no vista viva); eje referencia + lote opcional; un registro por
versión; `source_hash` para detectar cambios de fuentes; brechas no bloquean;
snapshot protegido por trigger + flag (T7.1); evidencias por link vivo +
snapshot; aprobación **interna**. El nombre antiguo `textile_material_passports`
solo aparece en un comentario aclaratorio ("NO usar"), nunca en el código.

## 3. `snapshot_json` base (T9A) — T9B lo completa

```json
{
  "schema_version": "textile_technical_passport_v1",
  "generated_at": "…",
  "scope": "reference_only" | "reference_and_lot",
  "passport": { "reference_id", "output_lot_id", "circularity_assessment_id" },
  "sections": { "<14 secciones>": { "completeness_status": "pending" | "not_applicable" } },
  "disclaimer": "Este pasaporte técnico textil es una herramienta interna…"
}
```

La sección `traceability` nace `not_applicable` cuando no hay lote. T9B llenará
el contenido de cada sección desde las fuentes (documento
`TEXTILES_PASSPORT_SOURCE_DATA_MAPPING.md`) y recalculará `source_hash` sobre
los `updated_at`/estados reales.

## 4. Activación y habilitación

Igual que el resto del módulo: `TEXTILES_MODULE_ENABLED=true` + organización
activa + habilitación real
`insert into organization_modules (organization_id, module_code, enabled)
values ('<org>','textiles',true) on conflict … do update set enabled = true;`
(nunca `module_key`/`enabled_by`). Las RPCs verifican el módulo habilitado en
`organization_modules.module_code='textiles'`.

## 5. Verificación

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (sin rutas nuevas: T9A es solo base de datos).
- Nueva suite `tests/passports/textiles-passports.test.ts` → **16/16** (única
  migración; nombre correcto; una sola tabla; identidad/versionamiento; FKs
  compuestas; campos de snapshot/hash/sellos; triggers estándar; validación de
  destino; protección del snapshot patrón T7.1; RLS con 4 políticas y roles;
  ampliación aditiva de evidencias; RPC de generación base con schema_version;
  RPC de transición; sin service_role ni alcance prohibido; helpers base;
  lenguaje prudente).
- Regresión: **evidencias 21/13/11** (0084 amplió su tabla), circularidad
  32/12, TrazaDocs textil 20 + hardening 15, módulo, catálogos, scoring,
  productos 21, trazabilidad 22/14, **CPR `tests/unit/trazadocs.test.ts` ✅** ·
  `test:platform`/`test:plans`/`test:launch`/`test:compliance` ✅ (compliance
  barre 0084). `test:all`: 25 resultados verdes.
- `test:smoke`/`test:rls` requieren `.env.local` con Supabase real (ambiental).

## 6. Validación manual (cuando haya entorno)

1. **Nacer aprobado (bloqueado)**: `insert into textile_technical_passports(...
   status='generated' ...)` o con `snapshot_json`/`source_hash` → trigger:
   "debe crearse como borrador" / "no pueden fijarse al crearlo".
2. **Editar snapshot generado (bloqueado)**: `update … set snapshot_json=…`
   sobre un `generated` → "El snapshot de un pasaporte generado no puede
   modificarse. Cree una nueva versión."
3. **Mudar identidad (bloqueado)**: `update … set reference_id=…` → "La
   identidad del pasaporte … no puede cambiarse."
4. **Destino incoherente (bloqueado)**: lote de otra referencia o evaluación de
   otra referencia → mensajes de destino.
5. **Flujo legítimo**: crear un `draft`, `select
   generate_textile_technical_passport_base('<id>')` → pasa a `generated` con
   snapshot base y hash; `change_textile_technical_passport_status('<id>',
   'in_review')` y `'approved_internal'` con los roles correctos.
6. **Cross-tenant**: FKs compuestas impiden referenciar entidades de otra
   organización; RLS impide ver/editar pasaportes ajenos.

## 7. Riesgos y qué queda para T9B/C

- **T9A entrega el snapshot BASE** (esqueleto). El contenido real de cada
  sección, el cálculo de brechas (catálogo del documento
  `TEXTILES_PASSPORT_GAPS_AND_WARNINGS_MODEL.md`) y el `source_hash` sobre
  fuentes reales son **T9B**.
- **Creación de registros con pre-chequeo**: en T9A un pasaporte se inserta como
  `draft` (por RLS/aplicación) y luego se genera vía RPC; el flujo de creación
  con selección de referencia/lote/evaluación y pre-chequeo de datos es **T9B**
  (server actions) y **T9C** (UI). No hay rutas ni páginas todavía.
- **`source_hash` de T9A** cubre la identidad; su uso para alertar "los datos
  fuente cambiaron" se implementa en **T9C** al comparar contra el hash de
  fuentes reales de T9B.

## 8. Qué NO se hizo (confirmaciones)

Sin UI, rutas, páginas, navegación visible, impresión, QR, portal público ni
pasaporte visual. Sin PDF server-side, sin firma, sin planes por módulo, sin
`organization_module_*`. **CPR no fue modificado funcionalmente.** La ampliación
de `textile_evidence_links` es estrictamente **aditiva** (no altera vínculos
existentes; suites de evidencias en verde). Textil sigue privado tras flag +
`organization_modules.module_code`.


## 9. Hardening posterior (T9A.1)

Ver `TEXTILES_T9A_1_PASSPORT_STATE_HARDENING_REPORT.md` (migración 0085): el
guard de snapshot de 0084 protegía los campos controlados solo cuando el
pasaporte ya no estaba en `draft`. T9A.1 lo redefine para que, fuera del flag
transaccional interno, ningún UPDATE directo pueda cambiar `status`,
snapshot/derivados/`source_hash` ni los 8 sellos —en ningún estado, incluido
`draft`—, cerrando la fabricación de un pasaporte "aprobado internamente" sin
pasar por las RPCs. Además añade un validador que restringe los `link_type`
válidos para `entity_type='technical_passport'`.
