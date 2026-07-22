# TEXTILES_T9D_READY_PROMPT — Prompt FUTURO (no implementado) para el Sprint T9D

> **Estado: FUTURO / NO IMPLEMENTADO.** Este documento describe un sprint que
> **aún no debe ejecutarse**. Requiere una decisión previa sobre el modelo de
> exposición del pasaporte y su seguridad. No promete portal público oficial ni
> DPP oficial: cualquier exposición es un enlace **privado y controlado** de solo
> lectura, bajo control de la organización.

---

Cuando se decida abordarlo, adjuntar los ZIP de T9C, T9B.x, T9.0 (arquitectura) y
el release candidate de CPR.

Sprint **T9D — Enlace privado controlado y versionado del pasaporte técnico
textil** (propuesta).

Trazaloop es la plataforma; CPR es un módulo disponible; Textil es privado.
`module_key` en código = `textiles`; habilitación real =
`organization_modules.module_code`. Tabla del pasaporte:
`textile_technical_passports`. La UI y el snapshot completos ya existen (T9B/T9C).

## Estado al iniciar T9D (tras T9C)

- Snapshot histórico completo y corregido; `snapshot_json.sections.*` como ruta
  real; evidencias en `sections.evidences.items` sin signed URLs.
- UI: listado, creación, detalle e impresión por navegador; estados y
  transiciones por RPC controlada; "Aprobado internamente".
- No existe QR, ni portal/enlace público, ni RPC de nueva versión.

## Alcance propuesto (a ratificar antes de implementar)

1. **Nueva versión del pasaporte.** RPC controlada que, a partir de un pasaporte
   (típicamente `approved_internal` u `obsolete`), cree un nuevo registro con el
   mismo `passport_code`, `passport_version + 1`, en `draft`, y marque el
   anterior `obsolete`. La UI ofrece "Crear nueva versión" solo cuando exista la
   RPC. Sin editar snapshots existentes.
2. **Enlace privado controlado (opcional, si se decide).** Token de solo lectura
   por pasaporte **aprobado internamente**, con:
   - control de exposición por organización (activar/desactivar por pasaporte);
   - expiración y revocación del token;
   - vista pública mínima que **no** expone signed URLs, datos sensibles ni
     evidencias descargables; solo un resumen técnico con los disclaimers;
   - lenguaje prudente: es un enlace técnico interno compartible, **no** un DPP
     oficial ni una certificación.
3. **QR (opcional).** Solo como representación del enlace privado anterior; se
   genera en cliente/navegador. No implica portal público oficial.

## Alcance prohibido (se mantiene)

Sin PDF server-side, IA, ACV, huella, certificación, sellos, planes por módulo,
`organization_module_access`/`_subscriptions`. No tocar CPR. No cambiar la
estructura del snapshot ni sus `schema_version`. No exponer signed URLs ni rutas
de storage en ninguna vista, pública o privada.

## Requisitos de seguridad (bloqueantes)

- El enlace privado no debe permitir enumerar pasaportes de otras organizaciones.
- El token debe ser imposible de adivinar y revocable.
- La vista compartible debe pasar por su propia verificación (no reutilizar el
  guard de sesión de la app para contenido tokenizado).
- Ninguna evidencia ni archivo debe descargarse desde la vista compartible.
- Registrar accesos si se decide (auditoría), sin exponer datos personales.

## Tests esperados (T9D)

Nueva versión: la RPC crea v+1 en draft y marca la anterior obsolete; la UI ofrece
el botón solo con soporte. Enlace privado (si se implementa): token revocable y
con expiración; la vista no expone signed URLs ni evidencias descargables; no hay
cross-tenant; lenguaje prudente sin "DPP oficial" ni "certificación". Regresión
CPR + suites Textil + test:all.

## Entrega

Reporte TEXTILES_T9D_*_REPORT.md, actualización del roadmap y de
TEXTILES_TECHNICAL_DECISIONS.md, y ZIP. **T9D solo se implementa tras ratificar
el modelo de exposición y su seguridad; hasta entonces, este documento es una
propuesta.**
