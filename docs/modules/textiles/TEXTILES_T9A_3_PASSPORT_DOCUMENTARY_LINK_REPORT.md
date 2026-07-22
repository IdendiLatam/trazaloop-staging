# Trazaloop Textil · Sprint T9A.3 — Hotfix link_type documental del pasaporte (Reporte)

> Julio 2026. Hotfix mínimo: añade el `link_type`
> `passport_documentary_support` para `entity_type='technical_passport'`. **Sin
> ampliar funcionalidad, sin UI/rutas/`/textiles/passports`/impresión/QR/portal/
> IA/ACV/huella/generación completa.** CPR sin cambios funcionales.

## 1. Problema

T9A.2 (0086) añadió la familia `passport_*` para vínculos de evidencia del
pasaporte (`passport_support`, `passport_composition_support`,
`passport_traceability_support`, `passport_circularity_support`,
`passport_claim_support`, `passport_care_support`,
`passport_end_of_life_support`) pero **omitió el soporte documental** — el tipo
con que se vinculan al pasaporte las evidencias de los procedimientos TrazaDocs
relacionados (sección 5.12 del pasaporte: manual, procedimientos de composición/
evidencias/trazabilidad/claims/circularidad, matriz). Sin ese `link_type` no se
puede representar el soporte documental del pasaporte.

## 2. Solución — migración `0087_textile_passport_documentary_link_fix.sql` (única)

Dos cambios y nada más:

1. **`check` de `link_type`** de `textile_evidence_links`: se añade
   `passport_documentary_support` de forma **aditiva** (30 → 31 `link_type`;
   verificado que ningún valor previo se pierde).
2. **`validate_textile_passport_evidence_link_type()`** (misma firma; el trigger
   `t_textile_passport_evidence_link_type` de 0085 sigue apuntando a él): admite
   el nuevo tipo. **Sigue sin tocar cualquier otro `entity_type`**: para ellos
   retorna de inmediato, así que CPR y los demás módulos textiles quedan
   idénticos.

Sin tablas, columnas, políticas ni RPC nuevas. El único `alter table` es el
drop/add del `check`. Cero objetos CPR.

## 3. Cambios de código

`lib/domain/textiles-passport.ts`: `passport_documentary_support` añadido a
`TEXTILE_PASSPORT_EVIDENCE_LINK_TYPES`. Pin de inventario de migraciones a 0087.
Nueva suite `tests/passports/textiles-passports-documentary-link.test.ts` (8
checks). Pin de la suite T9A.2 fijado a su slot propio (deriva de pins).

## 4. Verificación

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (sin rutas nuevas).
- Nueva suite **8/8**. Regresión: pasaporte T9A 16/16, hardening T9A.1 12/12,
  fuentes/vínculos T9A.2 11/11, **evidencias 21/13** (0087 amplió su `check`),
  módulo, **CPR `tests/unit/trazadocs.test.ts` ✅**, `test:platform`/`test:plans`/
  `test:launch`/`test:compliance` ✅. `test:all`: 28 resultados verdes.
- `test:smoke`/`test:rls` requieren `.env.local` (ambiental).

## 5. Validación manual (cuando haya entorno)

Vincular una evidencia con `entity_type='technical_passport'`,
`link_type='passport_documentary_support'` → OK (representa el soporte
documental de la sección 5.12). Con un `link_type` fuera de la familia →
rechazado. `passport_documentary_support` sobre otro `entity_type` (p. ej.
`reference`) → el `check` global lo admite pero el validador no lo restringe
(solo actúa sobre `technical_passport`), consistente con el diseño.

## 6. Qué NO se hizo (confirmaciones)

Solo se añadió un `link_type`. Sin generación completa (el snapshot sigue siendo
el base de T9A/T9A.2), sin UI/rutas/QR/portal, sin tablas/columnas/políticas/RPC
nuevas. **CPR no fue modificado funcionalmente** y las evidencias de otros
módulos quedan idénticas. Textil sigue privado tras flag +
`organization_modules.module_code`. La familia completa del pasaporte queda:
`passport_support`, `passport_composition_support`,
`passport_traceability_support`, `passport_circularity_support`,
`passport_claim_support`, `passport_care_support`,
`passport_end_of_life_support`, `passport_documentary_support`. Siguiente: **T9B**
(generación desde fuentes) — ver `TEXTILES_T9B_READY_PROMPT.md`.
