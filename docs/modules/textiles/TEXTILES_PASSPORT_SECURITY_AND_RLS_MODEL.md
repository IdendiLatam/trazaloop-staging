# TEXTILES_PASSPORT_SECURITY_AND_RLS_MODEL — Seguridad, RLS y protección de snapshot

> Diseño de seguridad para T9A/B/C, siguiendo los patrones de hardening ya
> probados del módulo (T2.1, T5.2, T6.1, T7.1, T8.1). Nada se implementa en
> T9.0.

## 1. Acceso al módulo

Toda ruta y action del pasaporte queda tras la triple guarda Textil vigente:
feature flag `TEXTILES_MODULE_ENABLED` + organización activa + habilitación en
`organization_modules.module_code = 'textiles'` (nunca `module_key` ni
`enabled_by`). Páginas con `requireTextilesModule` + `force-dynamic`; actions con
`requireTextilesForAction`.

## 2. RLS de `textile_technical_passports`

Deny-by-default, `security_invoker` en cualquier vista. Políticas espejo de
`textile_circularity_assessments` (0080):

- **SELECT**: `is_org_member(organization_id)`.
- **INSERT**: `has_org_role(organization_id, array['admin','quality','consultant'])`
  (consultant puede generar) + `organization_id` = organización activa.
- **UPDATE**: admin/quality siempre; consultant solo mientras el pasaporte esté
  en `draft`/`in_review` (transiciones de preparación). La inmutabilidad del
  snapshot la garantiza además el trigger (§4), no solo la RLS.
- **DELETE**: admin/quality y solo en `draft` (borrar un pasaporte que nunca se
  generó). Los generados/aprobados no se borran: se marcan `obsolete`.

Triggers estándar del módulo: `set_updated_at`, `force_created_by`,
`prevent_organization_id_change`, `audit_row_change`.

## 3. No cross-tenant (defensa en capas)

1. **Esquema**: FKs compuestas `(organization_id, reference_id)`,
   `(organization_id, output_lot_id)`, `(organization_id,
   circularity_assessment_id)` — imposibilitan referenciar entidades de otra
   organización (documento 2).
2. **Trigger de destino** (espejo de `validate_…_target` de 0080): valida que
   `output_lot_id`, si está, corresponda a una orden de la **misma
   `reference_id`**, y que `circularity_assessment_id`, si está, sea de esa
   `reference_id` (y, si hay lote, coherente). Esto no lo cubren las FKs porque
   el lote referencia una orden, no la referencia directamente.
3. **Usuarios**: `generated_by`, `reviewed_by`, `approved_by`, `created_by`
   deben ser miembros de la organización (validado por la action + FK a
   `profiles`; el sello lo escribe el servidor con `auth.uid()`, nunca el
   cliente).
4. **Lecturas de fuentes**: todos los lectores del builder filtran por
   `organization_id` bajo RLS con la sesión real.

## 4. Protección del snapshot y campos calculados (patrón T7.1)

Un trigger `BEFORE INSERT OR UPDATE` sobre `textile_technical_passports`:

- Fuera del flag transaccional interno (`trazaloop.textile_passport_generate`,
  local, `set_config(..., true)`), el **INSERT** exige `status='draft'` y prohíbe
  fijar `snapshot_json`≠`{}`, `source_hash`, `gaps_json`≠`[]`,
  `warnings_json`≠`[]`, `recommendations_json`≠`[]`, y los sellos
  `generated_*`/`reviewed_*`/`approved_*`/`obsolete_*` (mensaje: "Los datos
  calculados del pasaporte no pueden fijarse al crearlo…").
- En **UPDATE**, una vez `status` pasó de `draft`, `snapshot_json`,
  `source_hash`, `data_sources_json`, `gaps_json`, `warnings_json`,
  `recommendations_json`, `reference_id`, `output_lot_id`, `passport_code` y
  `passport_version` son **inmutables** (mensaje espejo). Solo cambian los
  sellos de transición y `status`, y solo vía la RPC.
- El flag lo activan **solo** la RPC de generación y la de transición; el
  trigger jamás lo fija (solo lo lee). `security definer`, `search_path`
  fijo, `execute` revocado de public/anon/authenticated.

Con esto, "nacer aprobado", "inyectar un score", "editar el snapshot de un
pasaporte generado" o "mudar el pasaporte a otra referencia" quedan cerrados a
nivel BD, incluso vía API directa o service_role.

## 5. Generación en servidor (no cliente)

`snapshot_json`, `gaps_json`, `warnings_json`, `recommendations_json` y
`source_hash` se calculan en la RPC `generate_textile_technical_passport`
(security definer, granted a authenticated con verificación de `auth.uid()` +
`is_org_member` + módulo `textiles` habilitado, como la RPC de circularidad de
0080). El cliente solo elige referencia, lote opcional y evaluación opcional; no
provee ningún dato calculado.

## 6. Integración de evidencias (aditiva)

Se **amplía** `textile_evidence_links` de forma aditiva (como hizo 0080):

- `entity_type += 'technical_passport'`;
- `link_type += 'passport_support'`, y se reutilizan los ya existentes
  `composition_support`, `traceability_support`, `circularity_support`,
  `recycled_claim_support`/`organic_claim_support` (para claims),
  `care_support`, `end_of_life_support`.

`validate_textile_evidence_link_org()` (0080) se extiende para resolver la
organización del `technical_passport` (mismo patrón `case new.entity_type`),
garantizando que un pasaporte solo enlace evidencias de su organización. Esto es
para **navegación viva**; el snapshot conserva los estados del momento (documento
5, §7).

## 7. Roles (resumen)

| Acción | Roles |
|---|---|
| Ver | admin, quality, consultant (miembros) |
| Crear / generar / nueva versión | admin, quality, consultant |
| Enviar a revisión | admin, quality, consultant |
| Aprobar internamente | admin, quality |
| Marcar obsoleto | admin, quality |
| Sin membresía / anónimo | sin acceso |

"Aprobado internamente" nunca se presenta como aprobación externa (texto en UART
y print, patrón T8).

## 8. No debilitar lo existente

El diseño no toca la RLS de CPR ni de los demás módulos, no usa `service_role`
en la app, y la ampliación de `textile_evidence_links` es aditiva (no altera
vínculos existentes). Los tests de T9A/B/C incluirán regresión de CPR y de los
módulos textiles previos.
