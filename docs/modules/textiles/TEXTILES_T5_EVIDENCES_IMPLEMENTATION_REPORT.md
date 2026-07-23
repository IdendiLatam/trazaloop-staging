# Trazaloop Textil — Sprint T5 · Evidencias textiles — Reporte de implementación

**Fecha:** Julio 2026 · **Base:** ZIP del Sprint T4 (release candidate CPR + módulo Textil T1–T4)

---

## 1. Qué se implementó

La gestión de evidencias textiles: carga de soportes documentales al bucket
privado, registro con metadatos, revisión interna por estados, vinculación
polimórfica a las entidades textiles de T3/T4 (con bloqueo cross-tenant en
tres capas) y brechas simples de evidencia para reciclado/orgánico/
composición. Base directa para T6 (órdenes/lotes), T7 (circularidad), T8
(TrazaDocs Textil) y T9 (pasaporte técnico textil).

**Decisión de arquitectura (encargo §5): OPCIÓN B.** Tablas específicas
textiles (`textile_evidences`, `textile_evidence_links`) reutilizando solo
los PATRONES de CPR: tabla 0019 (guard de estado security definer), trigger
polimórfico mismo-tenant 0020 (`validate_evidence_link_org`), bucket privado
0015 y signed URLs (patrón TrazaDocs/logo). El motor CPR queda intacto; la
evolución a motor multi-módulo (Opción C) queda documentada en §11 como
futuro, sin refactor en T5.

## 2. Archivos creados

| Archivo | Contenido |
|---|---|
| `supabase/migrations/0075_textile_evidences.sql` | 2 tablas + guards + RLS |
| `lib/domain/textiles-evidences.ts` | Enums, MIME/tamaño, avisos, brechas puras, ruta de storage |
| `lib/db/textiles-evidences.ts` | Consultas RLS, signed URLs, resolución de etiquetas, opciones vinculables |
| `server/actions/textiles-evidences.ts` | 7 actions (crear/editar/estado/archivar/signed URL/vincular/quitar) |
| `app/(app)/(shell)/textiles/evidences/page.tsx` | Centro de evidencias (filtros tipo/estado) |
| `app/(app)/(shell)/textiles/evidences/new/page.tsx` | Carga de evidencia |
| `app/(app)/(shell)/textiles/evidences/[id]/page.tsx` | Detalle: metadatos, apertura, revisión, vínculos, edición |
| `components/domain/textiles/evidence-upload-form.tsx` | Form crear (archivo) / editar metadatos |
| `components/domain/textiles/evidence-status-panel.tsx` | Revisión interna + botón de apertura por signed URL |
| `components/domain/textiles/evidence-link-manager.tsx` | Selector entidad/tipo de vínculo + listado/quitar |
| `tests/evidences/textiles-evidences.test.ts` | 21 checks (24 puntos del encargo) |
| `docs/modules/textiles/TEXTILES_T5_EVIDENCES_IMPLEMENTATION_REPORT.md` | Este reporte |

## 3. Archivos modificados (mínimos, ninguno CPR)

| Archivo | Cambio |
|---|---|
| `app/(app)/(shell)/textiles/page.tsx` | Cuarta tarjeta "Evidencias textiles · Disponible" |
| `lib/modules/textiles.ts` | Secciones futuras 5 → 4 (evidencias sale de la lista) |
| `app/(app)/(shell)/textiles/references/[id]/page.tsx` | Sección "Evidencias asociadas": contador, listado, **brechas** y link de gestión |
| `app/(app)/(shell)/textiles/products/[id]/page.tsx` | Contador de evidencias vinculadas directamente |
| `tests/unit/textiles-module.test.ts` | Migraciones esperadas 0070–0075; shell con `evidences/`; 4 futuras |
| `package.json` | Scripts `test:textiles-products` (pendiente de T4) y `test:textiles-evidences`, encadenados a `test:all` |

## 4. Migración y modelo de datos (0075)

**`textile_evidences`** — soporte documental org-scoped: título, tipo
(13 valores CHECK: `supplier_datasheet` … `other`), descripción, fecha,
emisor, código, archivo (`file_path` not null, nombre/mime/tamaño), estado
(CHECK: `pending_review`/`accepted`/`rejected`/`expired`/`archived`), notas
de revisión, vigencia (`valid_from ≤ valid_until` por CHECK), `is_active`,
`created_by/updated_by/reviewed_by/reviewed_at`, timestamps,
`unique (organization_id, id)` para FKs compuestas.

**`textile_evidence_links`** — vínculo polimórfico org-scoped:
`entity_type` (CHECK, 11 entidades textiles), `entity_id`, `link_type`
(CHECK, 12 tipos), notas, `unique (org, evidence, entity_type, entity_id,
link_type)`; **FK compuesta** `(organization_id, evidence_id) →
textile_evidences (organization_id, id)` on delete cascade.

**Guards (security definer, execute revocado):**
- `guard_textile_evidence_review` — cambiar `status`/`reviewed_by`/
  `reviewed_at` exige admin/quality; una evidencia fuera de
  `pending_review` solo la modifica admin/quality (consultant carga y edita
  pendientes, nunca acepta/rechaza).
- `validate_textile_evidence_link_org` — resuelve la tabla real de las 11
  entidades, exige que exista y pertenezca a la MISMA organización
  (bloqueo cross-tenant), y rechaza tipos sin tabla.

**Triggers comunes:** `set_updated_at`, `force_created_by`,
`prevent_organization_id_change` y `audit_row_change` en ambas tablas.

**RLS:** select/update de miembros; **insert con `status =
'pending_review'`** (toda evidencia nace pendiente — el estado solo avanza
por revisión); delete de evidencias solo admin/quality y **nunca una
aceptada**; vínculos: insert de miembros, delete admin/quality/consultant
(quitar un vínculo es edición normal, patrón T4). Sin políticas `anon`.

Aditiva e idempotente donde aplica; sin drops; sin tocar migraciones
anteriores ni objetos CPR.

## 5. Storage (decisión D-T5-01)

Se **reutiliza el bucket privado `evidences` sin migración de storage**:
ruta textil `{organization_id}/textiles/{evidence_id}/{filename}`
(nombre saneado). El primer segmento sigue siendo el `organization_id`,
así que las políticas 0015/0016 aplican tal cual: lectura de miembros,
subida admin/quality/consultant, sin anon, sin URLs públicas. La subida usa
la **sesión del usuario** (jamás service_role) y la apertura es solo por
**signed URL de 10 minutos** (`getTextileEvidenceSignedUrlAction`). Antes
de subir se validan MIME (PDF/PNG/JPG/WebP/DOCX/XLSX/CSV; nunca
ejecutables), tamaño (20 MB) y **cuota global de almacenamiento**
(`checkStorageAvailable`). Si el registro en BD falla tras subir, el
archivo se elimina para no dejar huérfanos.

**Decisión D-T5-02 (planes):** NO se aplica `checkResourceLimit("evidences")`
porque ese límite cuenta la tabla CPR, y los planes por módulo están fuera
de alcance. *(Actualización T5.1: la vista de uso sí suma ya los bytes
textiles — migración 0076 — sin agregar conteos por módulo.)*

## 6. Roles de revisión interna

| Acción | admin | quality | consultant | operator |
|---|---|---|---|---|
| Cargar / editar pendientes | ✔ | ✔ | ✔ | solo tabla, storage lo bloquea* |
| Cambiar estado (aceptar/rechazar/vencer/archivar) | ✔ | ✔ | ✖ | ✖ |
| Editar evidencia ya revisada | ✔ | ✔ | ✖ | ✖ |
| Vincular / quitar vínculos | ✔ | ✔ | ✔ | vincular sí / quitar no |

\*La política de subida 0015 (CPR, intacta) exige admin/quality/consultant:
un operator no puede subir archivos, coherente con CPR. Validado en
servidor (action) **y** en BD (guard) — nunca solo UI. `accepted` se
presenta siempre como **aceptación interna**: "Evidencia aceptada
internamente como soporte documental. No equivale a certificación externa."

## 7. Brechas simples (§15 del encargo)

`computeReferenceEvidenceGaps` (pura): fibra `is_recycled_declared` sin
`recycled_claim_support`; fibra `is_organic_declared` sin
`organic_claim_support`; composición registrada sin `composition_support`
(los soportes a nivel de referencia cubren sus fibras).
`computeMaterialEvidenceGaps`: `has_supplier_datasheet` sin evidencia
`supplier_datasheet` (función lista; su UI llegará con la matriz).
Las brechas se muestran en el detalle de referencia como avisos
informativos — **nunca bloquean la composición**. Sin matriz de pasaporte
ni scoring (T7/T9).

## 8. Cómo activar / habilitar / probar

Igual que T2–T4: `TEXTILES_MODULE_ENABLED=true` + fila en
`organization_modules` (**`module_code='textiles'`, `enabled=true`** — la
tabla real usa `module_code`, no `module_key`, y no tiene `enabled_by`;
corrección T5.1) tras aplicar `0070`–`0076`:
`insert into organization_modules (organization_id, module_code, enabled)
values ('<org>', 'textiles', true) on conflict (organization_id,
module_code) do update set enabled = true;`. Prueba: `/textiles` → Evidencias → cargar un PDF →
verificar estado "Revisión pendiente" → abrir por signed URL (enlace
temporal) → vincular a un material/referencia → como admin aceptar
(aparece la nota de aceptación interna) → como consultant comprobar que el
panel de revisión no aparece y que la action rechaza el cambio → en la
referencia con fibra reciclada declarada sin soporte, ver la brecha.
Signed URLs: el botón "Abrir archivo" genera un enlace de 10 min; una URL
del bucket sin firma devuelve 400/403 (bucket privado).

## 9. Resultados de verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` / `npm run lint` / `npm run build` | ✅ (build con `/textiles/evidences`, `/new`, `/[id]` ƒ) |
| `test:platform` · `test:plans` · `test:launch` | ✅ todo en verde |
| Suites textiles T1–T4 (module, scoring, hardening, catálogos*, productos) | ✅ todo verde |
| `npx tsx tests/evidences/textiles-evidences.test.ts` | ✅ 21/21 (24 puntos del encargo) |
| `npm run test:smoke` | ⚠️ requiere `.env.local` (ambiental, igual que sprints previos) |

\*La suite T3 vive en `tests/unit/textiles-catalogs.test.ts` (no en
`tests/catalogs/`): el script `npm run test:textiles-catalogs` apunta ahí.

## 10. Riesgos y limitaciones conocidas

- ~~Bytes textiles fuera del contador de uso~~ **Resuelto en T5.1 (0076)**:
  la vista de uso ahora suma `textile_evidences.file_size_bytes`.
- El estado `expired` es manual: la UI avisa cuando `valid_until` pasó,
  pero no hay job automático.
- No hay reemplazo de archivo en edición (se archiva y se carga una nueva).
- El selector de vínculos cubre 9 tipos (proveedor, material, avío,
  proceso, tercerizado, colección, producto, referencia, fibra);
  `reference_material`/`reference_component` están soportados por BD,
  trigger y actions, sin selector propio aún (arquitectura lista).
- El contador del producto cuenta solo vínculos directos (las evidencias
  de referencias se ven en cada referencia); la vista consolidada llega
  con la matriz.

## 11. Qué quedó fuera (confirmaciones)

Sin órdenes/lotes ni trazabilidad por lote (T6) ✔ · sin circularidad
completa (T7) ✔ · sin TrazaDocs Textil (T8) ✔ · sin pasaporte técnico ni
matriz (T9) ✔ · sin QR/IA/ACV/blockchain/huella ✔ · sin planes por módulo
ni `organization_module_access`/`_subscriptions` ✔ · sin imports CSV ni
export PDF ✔ · **CPR no fue modificado funcionalmente** (0019/0020/0015 y
`server/actions/evidences.ts` intactos; verificado por el check 24) ✔ ·
Textil sigue privado tras la triple guarda ✔. Opción C (motor de
evidencias multi-módulo) queda solo como evolución futura documentada:
unificar cuando existan ≥2 módulos con requisitos de evidencia estables.


---

## 12. Hardening posterior (T5.1)

Ver `TEXTILES_T5_1_EVIDENCES_HARDENING_REPORT.md` (migración 0076): bytes
textiles en la vista de uso; política de delete de storage acotada al
prefijo `{org}/textiles/…` (habilita la limpieza real de huérfanos; rutas
CPR intactas); RLS de escritura alineada con los roles de subida
(admin/quality/consultant); verificación de prefijo antes de firmar URLs; y
corrección documental de la habilitación (`module_code`, sin `enabled_by`).
