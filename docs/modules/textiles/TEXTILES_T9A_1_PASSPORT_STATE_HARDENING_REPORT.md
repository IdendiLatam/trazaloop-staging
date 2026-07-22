# Trazaloop Textil · Sprint T9A.1 — Hardening de estados, snapshot y vínculos del pasaporte técnico textil (Reporte)

> Julio 2026. Sprint quirúrgico: cierra la manipulación directa de
> `textile_technical_passports` en estado `draft` y completa la coherencia de
> los vínculos de evidencia del pasaporte. **Sin UI, rutas, páginas,
> navegación, impresión, QR, portal ni generación completa.** CPR sin cambios
> funcionales.

## 1. Problema (T9A)

El guard `protect_textile_technical_passport_snapshot()` de 0084 protegía el
snapshot y los derivados **solo cuando `old.status <> 'draft'`**. Como la RLS de
UPDATE (0084) permite a admin/quality escribir cualquier columna, un usuario con
rol legítimo y acceso directo a la API de Supabase podía, sobre un pasaporte
**en `draft`**, ejecutar un único UPDATE crudo —esquivando las RPCs
controladas— y fijar:

```
status = 'approved_internal',
snapshot_json = {...}, data_sources_json = {...}, source_hash = 'fake',
generated_at = now(), generated_by = ..., approved_at = now(), approved_by = ...
```

fabricando un pasaporte "aprobado internamente" con snapshot y sellos falsos que
jamás pasó por `generate_textile_technical_passport_base` ni por
`change_textile_technical_passport_status`. El diseño T9A confiaba en que las
transiciones pasaran por la RPC, pero nada a nivel de datos lo obligaba en
`draft`.

## 2. Solución — migración `0085_textile_technical_passport_state_hardening.sql` (única)

Se **redefine** `protect_textile_technical_passport_snapshot()` (misma firma; el
trigger `t_textile_passports_protect_snapshot` de 0084 sigue apuntando a ella)
para que, **fuera del flag transaccional interno** `trazaloop.textile_passport_
generate` (que solo activan las RPCs controladas), **ningún UPDATE** pueda tocar
—en **ningún** estado, incluido `draft`— el conjunto controlado:

- **`status`**: toda transición pasa por la RPC ("El estado del pasaporte solo
  puede cambiarse mediante el flujo controlado…"). Antes esto solo se vigilaba
  cuando `old.status <> 'draft'`.
- **snapshot y derivados**: `snapshot_json`, `data_sources_json`, `gaps_json`,
  `warnings_json`, `recommendations_json`, `source_hash` — inmutables por UPDATE
  directo en cualquier estado ("…no pueden modificarse directamente. Se generan
  o se regeneran en una nueva versión.").
- **los 8 sellos**: `generated_*`, `reviewed_*`, `approved_*`, `obsolete_*` —
  solo los fija el flujo controlado.
- **identidad**: `reference_id`, `passport_code`, `passport_version` inmutables
  siempre; `output_lot_id`/`circularity_assessment_id` seleccionables solo
  mientras el pasaporte está en `draft` (preparación previa a generar; la
  validación de destino de 0084 sigue aplicando) y congelados tras generar.

Lo único que un UPDATE directo puede cambiar es `notes` y, en `draft`, la
selección de lote/evaluación. El **INSERT conserva exactamente** las reglas de
0084 (nacer `draft` y vacío). Bajo el flag, las RPCs escriben con normalidad (el
guard retorna temprano). La función solo **lee** el flag, jamás lo fija;
`search_path` fijo y `execute` revocado.

Con esto, el ataque del §1 queda cerrado a nivel de base de datos, incluso vía
API directa o `service_role`: no hay forma de fabricar un pasaporte generado o
aprobado sin pasar por las RPCs.

## 3. Vínculos de evidencia del pasaporte (completar lo previsto en T9.0)

El `check` de `link_type` de 0084 es **global** (una lista para todos los
`entity_type`), así que `passport_support` y los tipos de sección ya eran
técnicamente válidos sobre `entity_type='technical_passport'`. Lo que faltaba
—y este sprint completa— es **restringir** qué `link_type` tienen sentido para
un pasaporte, evitando combinaciones absurdas (p. ej. `input_lot_support`
colgado de un pasaporte).

Nuevo validador `validate_textile_passport_evidence_link_type()` (trigger BEFORE
INSERT OR UPDATE sobre `textile_evidence_links`): para
`entity_type='technical_passport'`, solo admite los tipos de soporte por sección
previstos en la arquitectura T9.0 — `passport_support`, `composition_support`,
`traceability_support`, `circularity_support`, `recycled_claim_support`,
`organic_claim_support`, `care_support`, `end_of_life_support`, más
`general_support`/`other`. **Para cualquier otro `entity_type` retorna sin tocar
nada** — el comportamiento de las evidencias de CPR y de los demás módulos
textiles queda idéntico (suites de evidencias en verde).

## 4. Verificación

- `npx tsc --noEmit` ✅ · `npm run lint` ✅ (solo el warning preexistente de
  T5.2) · `npm run build` ✅ (sin rutas nuevas: T9A.1 es solo BD).
- Nueva suite `tests/passports/textiles-passports-hardening.test.ts` → **12/12**
  (única migración; solo redefine 2 funciones + 1 trigger; no toca CPR ni la
  generación completa; el estado no cambia por UPDATE directo ni en `draft`;
  snapshot/derivados/sellos inmutables sin el flag; escritura legítima bajo el
  flag; INSERT idéntico a 0084; identidad inmutable y lote/evaluación
  congelados tras generar; validador de vínculos acotado a `technical_passport`;
  seguridad de las funciones; sin service_role ni alcance prohibido).
- Regresión: pasaporte T9A **16/16**, **evidencias 21/13/11** (0085 añadió un
  trigger a su tabla), circularidad 32/12, trazabilidad 22/14, productos 21,
  TrazaDocs 20 + hardening 15, **CPR `tests/unit/trazadocs.test.ts` ✅** ·
  `test:platform`/`test:plans`/`test:launch`/`test:compliance` ✅ (compliance
  barre 0085). `test:all`: 26 resultados verdes.
- `test:smoke`/`test:rls` requieren `.env.local` con Supabase real (ambiental).

## 5. Validación manual (cuando haya entorno)

1. **Ataque del §1 (bloqueado)**: sobre un pasaporte en `draft`,
   `update textile_technical_passports set status='approved_internal',
   snapshot_json='{...}', source_hash='fake', approved_by='<user>' where id=…`
   → el guard corta en el primer campo controlado: "El estado del pasaporte solo
   puede cambiarse mediante el flujo controlado…".
2. **Snapshot en draft (bloqueado)**: `update … set snapshot_json='{...}'` sobre
   un `draft` sin cambiar estado → "El snapshot y los campos calculados… no
   pueden modificarse directamente."
3. **Sellos a mano (bloqueado)**: `update … set generated_by='<user>'` → "Los
   sellos… solo los fija el flujo controlado."
4. **Flujo legítimo (intacto)**: `select
   generate_textile_technical_passport_base('<id>')` pasa el `draft` a
   `generated` con snapshot base y sellos; `change_textile_technical_passport_
   status('<id>','in_review'|'approved_internal')` con los roles correctos.
5. **Preparación en draft (permitida)**: `update … set
   circularity_assessment_id='<id>'` sobre un `draft` con evaluación de la misma
   referencia → OK (validación de destino de 0084 aplica). El mismo cambio tras
   `generated` → bloqueado.
6. **Vínculo de evidencia**: `input_lot_support` sobre un
   `entity_type='technical_passport'` → "El tipo de vínculo … no es válido para
   un pasaporte técnico textil."; `composition_support` sobre un `input_lot` →
   sin cambios (otros entity_type intactos).

## 6. Qué NO se hizo (confirmaciones)

Sin UI, rutas, páginas, navegación, impresión, QR, portal. Sin generación
completa del pasaporte (el snapshot sigue siendo el **base** de T9A; el llenado
desde fuentes es T9B). Sin tablas nuevas, sin políticas nuevas, sin columnas
nuevas. **CPR no fue modificado funcionalmente** y las evidencias de otros
módulos quedan idénticas (el nuevo validador solo actúa sobre
`entity_type='technical_passport'`). Textil sigue privado tras flag +
`organization_modules.module_code`.


## 7. Corrección posterior (T9A.2)

Ver `TEXTILES_T9A_2_PASSPORT_SOURCES_LINKS_REPORT.md` (migración 0086): T9A.1
dejó tres pendientes, cerrados en T9A.2 — `schema_version` en
`data_sources_json` (`textile_technical_passport_sources_v1`), la familia
`link_type` específica `passport_*` para `entity_type='technical_passport'`, y
el prompt `TEXTILES_T9B_READY_PROMPT.md`. El validador de vínculos de 0085 pasó
de admitir los genéricos de sección a exigir la familia `passport_*` (sigue sin
tocar otros entity_type).
