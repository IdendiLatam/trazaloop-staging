# Trazaloop Textil · Sprint T9A.2 — Corrección final de fuentes y vínculos del pasaporte técnico textil (Reporte)

> Julio 2026. Sprint corto y de cierre: resuelve los tres pendientes que dejó
> T9A.1, sin ampliar alcance. **Sin UI, rutas, `/textiles/passports`, páginas,
> navegación, impresión, QR, portal, IA, ACV, huella ni generación completa.**
> CPR sin cambios funcionales.

## 1. Los tres pendientes cerrados

### Pendiente 1 — `schema_version` en `data_sources_json`
`snapshot_json` ya llevaba `schema_version = 'textile_technical_passport_v1'`
desde 0084, pero `data_sources_json` solo tenía `reference_id`, `output_lot_id`,
`circularity_assessment_id` y `extracted_at`. Se **redefine** la RPC
`generate_textile_technical_passport_base` (misma firma, resto **idéntico** a
0084) para que `data_sources_json` incluya
`schema_version = 'textile_technical_passport_sources_v1'`. Ahora ambos
documentos versionados (snapshot y fuentes) son trazables por separado.

### Pendiente 2 — `link_type` específicos `passport_*`
0084/0085 solo habían añadido `passport_support` y el validador de coherencia
(0085) reutilizaba los `link_type` genéricos de sección (`composition_support`,
etc.). Se agrega —de forma **aditiva**— la familia dedicada al pasaporte:
`passport_composition_support`, `passport_traceability_support`,
`passport_circularity_support`, `passport_claim_support`,
`passport_care_support`, `passport_end_of_life_support` (24 → 30 `link_type`, sin
perder ninguno). El validador `validate_textile_passport_evidence_link_type()`
se **redefine** (misma firma; el trigger de 0085 sigue apuntando a él) para
exigir que un vínculo con `entity_type='technical_passport'` use la familia
`passport_*` (o los genéricos `general_support`/`other`). **Sigue sin tocar
cualquier otro `entity_type`**: para ellos retorna de inmediato, así que las
evidencias de CPR y de los demás módulos textiles quedan idénticas.

### Pendiente 3 — `TEXTILES_T9B_READY_PROMPT.md`
Creado: prompt listo para el Sprint T9B (generación completa del snapshot desde
las fuentes reales, cálculo de brechas `PAS-*`, `source_hash` real, vinculación
de evidencias), con el contexto de T9C encadenado.

## 2. Migración `0086_textile_passport_sources_and_links_fix.sql` (única)

Redefine la RPC de generación base (único cambio funcional: `schema_version` en
`data_sources_json`), amplía aditivamente el `check` de `link_type` con la
familia `passport_*`, y redefine el validador de coherencia del pasaporte. Sin
tablas, políticas ni columnas nuevas; el único `alter table` es el drop/add del
`check` de `link_type` sobre `textile_evidence_links`. Cero objetos CPR.

## 3. Cambios de código

`lib/domain/textiles-passport.ts`: nuevas constantes
`TEXTILE_PASSPORT_SOURCES_SCHEMA_VERSION` y `TEXTILE_PASSPORT_EVIDENCE_LINK_TYPES`
(familia `passport_*`) para que T9B las consuma. Pin de inventario de migraciones
a 0086. Tests: nueva suite `tests/passports/textiles-passports-sources-links.test.ts`
(11 checks, alineada con lo **pedido**: schema_version de fuentes, familia
`passport_*` aditiva, validador acotado, dominio, existencia del prompt T9B,
seguridad y lenguaje). Pins de las suites T9A y T9A.1 fijados a su slot propio
(deriva de pins, ya corregida en todos los sprints previos).

## 4. Verificación

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (sin rutas nuevas).
- Nueva suite **11/11**. Regresión: pasaporte T9A 16/16, hardening T9A.1 12/12,
  **evidencias 21/13/11** (0086 amplió su `check`), circularidad 32, TrazaDocs
  hardening 15, **CPR `tests/unit/trazadocs.test.ts` ✅**,
  `test:platform`/`test:plans`/`test:launch`/`test:compliance` ✅ (compliance
  barre 0086). `test:all`: 27 resultados verdes.
- `test:smoke`/`test:rls` requieren `.env.local` (ambiental).

## 5. Validación manual (cuando haya entorno)

1. **schema_version de fuentes**: `select generate_textile_technical_passport_
   base('<id>')` y luego `select data_sources_json->>'schema_version' from
   textile_technical_passports where id='<id>'` → `textile_technical_passport_
   sources_v1`.
2. **Familia passport_***: vincular una evidencia con
   `entity_type='technical_passport'`, `link_type='passport_composition_support'`
   → OK; con `link_type='composition_support'` (genérico) → "El tipo de vínculo …
   no es válido para un pasaporte técnico textil. Use la familia passport_*.".
3. **Otros entity_type intactos**: `composition_support` sobre un `reference` o
   `material` → sin cambios (el validador no los toca).
4. **Regresión de 0085**: un UPDATE directo del snapshot de un pasaporte
   generado sigue bloqueado.

## 6. Qué NO se hizo (confirmaciones)

Sin ampliar funcionalidad: no se implementó la generación completa (el snapshot
sigue siendo el **base**; las secciones nacen en `pending`/`not_applicable`, sin
lectura de fuentes reales — eso es T9B). Sin UI, rutas, `/textiles/passports`,
páginas, navegación, impresión, QR, portal, IA, ACV, huella. Sin tablas,
políticas ni columnas nuevas. **CPR no fue modificado funcionalmente** y las
evidencias de otros módulos quedan idénticas (el validador solo actúa sobre
`entity_type='technical_passport'`). Textil sigue privado tras flag +
`organization_modules.module_code`.


## 7. Corrección posterior (T9A.3)

Ver `TEXTILES_T9A_3_PASSPORT_DOCUMENTARY_LINK_REPORT.md` (migración 0087): la
familia `passport_*` de T9A.2 omitió el soporte documental. T9A.3 añade
`passport_documentary_support` (evidencias de los procedimientos TrazaDocs
relacionados, sección 5.12), de forma aditiva y admitido por el validador. La
familia completa queda con 8 tipos.
