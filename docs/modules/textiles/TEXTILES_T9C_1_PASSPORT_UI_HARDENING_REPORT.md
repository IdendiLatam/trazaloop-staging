# Trazaloop Textil · Sprint T9C.1 — Hardening UX de selección de circularidad y mensajes de creación (Reporte)

> Julio 2026. Hardening corto y quirúrgico sobre T9C: en el formulario de
> creación del pasaporte, la evaluación de circularidad debe corresponder a la
> referencia/SKU seleccionada (antes se podían elegir evaluaciones de otra
> referencia), y el aviso de generación fallida dejó de perderse. **Sin rehacer
> T9C, sin rediseñar la UI, sin tocar el builder del snapshot, sin QR/portal/PDF
> server-side/IA/ACV/huella/planes por módulo.** CPR sin cambios funcionales.

## 1. Problema

En el formulario de creación (`passport-create-form.tsx`), los lotes
producidos/finales ya se filtraban por la referencia elegida
(`compatibleLots = lots.filter(l => l.referenceId === referenceId)`), pero las
**evaluaciones de circularidad no**: el selector recorría todas las evaluaciones
de la organización, permitiendo elegir una de otra referencia. Además, la server
action `createTextilePassportDraftAction` validaba el lote contra la referencia
pero **no** la evaluación, de modo que un cliente podía enviar una evaluación
incompatible directamente. Y en el flujo "crear y generar", si la generación
fallaba tras crear el borrador, el formulario redirigía al detalle **descartando
el mensaje** de la generación fallida.

## 2. Correcciones

**UI (filtro simétrico al de lotes).** `AssessmentOpt` gana `referenceId`; se
añade `compatibleAssessments = assessments.filter(a => a.referenceId ===
referenceId)` y el selector recorre esa lista. El selector se deshabilita sin
referencia y muestra "No hay evaluaciones de circularidad para esta referencia"
cuando aplica. Al cambiar la referencia se limpian tanto el lote como la
evaluación seleccionados. La página `/new` pasa el `referenceId` de cada
evaluación al formulario.

**Server action (validación simétrica a la del lote).** Nuevo helper DB
`getReferenceForAssessment(orgId, assessmentId)` (patrón idéntico a
`getReferenceForOutputLot`, filtra por organización). La action rechaza la
evaluación si no existe/es de otra organización o si
`assessmentRef.referenceId !== referenceId`, con el mensaje "La evaluación de
circularidad seleccionada no corresponde a la referencia elegida." La validación
del lote se conserva intacta. Así, la correspondencia queda garantizada en el
servidor, no solo en la UI.

**Mensaje de creación.** El formulario ahora distingue el fallo de creación (sin
`passportId` → se muestra el error en el formulario) del fallo de generación
tras crear (con `passportId` → redirige al detalle con
`?notice=generation_failed`). El detalle lee `searchParams` y, si el pasaporte
sigue sin snapshot, muestra un aviso claro: el borrador se creó pero la
generación automática no se completó, y puede generarse desde allí.

## 3. Verificación

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (las 4 rutas siguen dinámicas `ƒ`).
- Nueva suite `tests/passports/textiles-passports-ui-hardening.test.ts` **11/11**
  (filtro de evaluaciones, deshabilitado/vacío, limpieza al cambiar referencia,
  validación en la action, simetría con el lote, helper por organización, aviso
  propagado y mostrado, hardening quirúrgico sin migraciones ni CPR, lenguaje
  prudente).
- La suite T9C (`textiles-passports-ui.test.ts`) sigue **51/51**. Regresión
  completa: familia pasaporte, módulo Textil, diagnóstico, catálogos, productos,
  evidencias, trazabilidad, circularidad, TrazaDocs, **CPR**, platform/plans/
  launch/compliance. `test:all`: **34 verdes, exit 0** (+1 respecto de T9C).
  `test:smoke`/`test:rls` requieren `.env.local`.

## 4. Validación manual

1. En `/textiles/passports/new`, elegir una referencia A: el selector de
   circularidad solo muestra evaluaciones de A; si no hay, aparece el mensaje de
   vacío y el selector queda deshabilitado hasta elegir referencia.
2. Cambiar de referencia A a B: la evaluación (y el lote) seleccionados se
   limpian.
3. Enviar directamente a la action una evaluación de otra referencia (p. ej. por
   API): la action responde con el error de correspondencia; no se crea el
   pasaporte con una evaluación incompatible.
4. "Crear y generar" con datos que hagan fallar la generación: se redirige al
   detalle y se ve el aviso de que el borrador se creó pero la generación no se
   completó; el botón "Generar snapshot técnico" está disponible.

## 5. Confirmaciones

Hardening quirúrgico: solo se ajustaron el formulario de creación, su página, la
server action, un helper DB y el detalle (aviso). Sin nuevas migraciones (última:
0091); sin tocar el builder del snapshot; sin QR/portal/PDF server-side/IA/ACV/
huella/planes por módulo. **CPR no fue modificado funcionalmente.** Textil sigue
privado. La estructura y el `schema_version` del snapshot no cambian. La
validación de la evaluación por referencia refuerza (no debilita) las garantías
existentes.
