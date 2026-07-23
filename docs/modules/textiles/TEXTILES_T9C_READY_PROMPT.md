# TEXTILES_T9C_READY_PROMPT — Prompt listo para ejecutar el Sprint T9C

> Copiar como encargo del Sprint T9C. Presupone leídos la arquitectura T9.0 y
> los reportes T9A/T9A.1/T9A.2/T9A.3/T9B. La base de datos y la **generación
> completa del snapshot** ya existen (RPC
> `generate_textile_technical_passport_full_snapshot`). T9C implementa la **UI,
> impresión y hardening visual**.

---

Voy a adjuntarte los ZIP de T9B, T9A.x, T9.0 (arquitectura) y el release
candidate de CPR.

Necesito que implementes el **Sprint T9C — UI, impresión y hardening del
pasaporte técnico textil**.

Trazaloop es la plataforma; CPR es un módulo disponible; Textil es un módulo
privado/en preparación. `module_key` en código = `textiles`; habilitación real
= `organization_modules.module_code` (no `module_key`, no `enabled_by`). Acceso
Textil tras `TEXTILES_MODULE_ENABLED` + organización activa + habilitación del
módulo. No activar Textil públicamente. No tocar CPR funcionalmente.

## Estado actual (T9A–T9B)

- Tabla `textile_technical_passports`; snapshot protegido; estados draft/
  generated/in_review/approved_internal/obsolete.
- RPC `generate_textile_technical_passport_full_snapshot(uuid)` arma el snapshot
  COMPLETO desde las fuentes (14 secciones + gaps/warnings/recommendations +
  `source_hash` real) y pasa a `generated`.
- RPC `change_textile_technical_passport_status(uuid, text)` para transiciones.
- Server actions mínimas `generateTextilePassportSnapshotAction` /
  `changeTextilePassportStatusAction` (sin UI). Helpers de dominio/DB completos.
- **T9B.1/T9B.2**: el snapshot ya es completo y corregido. La UI de T9C debe
  leer las evidencias desde `snapshot_json.sections.evidences.items` (ya cubre todas las
  entidades, con metadata y sin signed URLs), las brechas desde `gaps_json`/
  `warnings_json`/`snapshot_json.warnings_summary`, y detectar cambios de fuente
  recomputando el hash sobre `data_sources_json` (que incluye
  `source_records.evidence_links` y `source_records.process_steps`). No recalcular
  el snapshot en la UI.

## Alcance permitido (T9C)

1. **Rutas** (documento `TEXTILES_PASSPORT_UI_FLOW_PROPOSAL.md`), todas bajo la
   guarda Textil (`requireTextilesModule`) + `force-dynamic`:
   - `(shell)/textiles/passports` — listado (referencia/SKU, lote, versión,
     estado, fecha, nº de brechas por severidad, acciones);
   - `(shell)/textiles/passports/new` — creación con **pre-chequeo** (selección
     de referencia + lote opcional + evaluación opcional; vista previa de
     completitud/brechas sin escribir; luego generar vía la action de T9B);
   - `(shell)/textiles/passports/[id]` — detalle por secciones desde
     `snapshot_json`, con la **alerta de `source_hash`** (recomputar el hash de
     las fuentes actuales y comparar con el guardado → "los datos fuente
     cambiaron…"), transiciones (enviar a revisión / aprobar internamente /
     nueva versión / obsoleto) y enlaces vivos;
   - `(print)/textiles/passports/[id]/print` — impresión por navegador (patrón
     TrazaDocs, con logo/NIT; **sin PDF server-side**).
2. **Nueva versión**: al regenerar, insertar un registro con el mismo
   `passport_code`, `passport_version + 1`, y marcar la anterior `obsolete`
   (server action + RPC/flag). Crear el `draft` inicial también en servidor.
3. Componentes de UI: listado, formulario de creación con selects encadenados,
   tarjetas de sección neutras (estado como badge), lista de brechas por
   severidad (paleta amber/danger), editor de estado.
4. Card "Pasaporte técnico textil" en `/textiles`; `TEXTILES_PLANNED_SECTIONS`
   pasa a `[]` (última sección planificada del módulo).
5. Alerta de `source_hash` desactualizado (requiere una función/lector que
   compute el hash de las fuentes vigentes; puede reutilizar la lógica de 0088
   o una RPC de solo-lectura que devuelva el hash actual sin escribir).
6. Tests de UI/seguridad + hardening; documentación.

## Alcance prohibido (T9C)

Sin QR, portal público, PDF server-side, IA, ACV, huella, certificación, firma,
planes por módulo. No tocar CPR. No cambiar el contrato de estados ni los
`schema_version`. No implementar T9D.

## Tests esperados (T9C)

`tests/passports/textiles-passports-ui.test.ts`: rutas existen y están bajo la
guarda Textil + `force-dynamic`; el detalle renderiza desde `snapshot_json` sin
recalcular; la creación usa la action de generación (no arma snapshot en
cliente); nueva versión preserva la anterior (obsolete) y crea v+1; la alerta de
hash compara contra `source_hash`; el shell enlaza; `TEXTILES_PLANNED_SECTIONS`
vacío; sin promesas de certificación en textos; regresión CPR + suites textiles.
Actualizar el pin de `tests/unit/textiles-module.test.ts` (shell gana `passports`)
y encadenar el script a `test:all`.

## Entrega T9C

Reporte `TEXTILES_T9C_PASSPORT_UI_REPORT.md` + roadmap actualizado + ZIP. Con
T9C el pasaporte técnico textil queda funcional de extremo a extremo (datos →
generación → UI → impresión), como herramienta interna de preparación
documental — nunca como certificación, sello ni pasaporte oficial.

## T9D (futuro, NO inmediato)

QR / enlace público controlado de solo lectura por pasaporte aprobado, con
token y control de exposición por organización. Solo se documenta cuando se
decida el modelo de exposición y su seguridad; no se implementa en T9C.
