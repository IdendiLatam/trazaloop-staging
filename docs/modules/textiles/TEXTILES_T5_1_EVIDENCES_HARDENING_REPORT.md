# Trazaloop Textil — Sprint T5.1 · Hardening de evidencias textiles y uso de almacenamiento

**Fecha:** Julio 2026 · **Base:** Sprint T5 (evidencias textiles, 0075)

---

## 1. Qué se endureció y por qué

| # | Hallazgo en T5 | Corrección T5.1 |
|---|---|---|
| 1 | Los reportes T4/T5 enseñaban a habilitar el módulo con `module_key` y `enabled_by`, columnas que **no existen** (`organization_modules` usa `module_code`, `enabled`, `activated_at` — 0004) | Docs corregidos con el insert real e idempotente; verificado por test |
| 2 | Los bytes de `textile_evidences` consumían storage real sin contar en la cuota (la vista 0059 sumaba solo evidencias CPR + logo + TrazaDocs) | La vista `v_organization_plan_usage` (0076) suma `textile_evidences.file_size_bytes` en `storage_used_bytes/_mb/_percent` |
| 3 | El bucket `evidences` **no tenía política de DELETE** (0015: "sin DELETE en Sprint 1"; nunca llegó) → la limpieza de huérfanos de T5 fallaba en silencio | Política `evidences_delete_textiles` acotada al prefijo `{org}/textiles/…` (segmento 2 = 'textiles', `safe_uuid`, roles admin/quality/consultant). Las rutas CPR siguen sin delete |
| 4 | RLS de tablas más amplia que la de storage: cualquier miembro podía crear filas de evidencia o vínculos, aunque no pudiera subir archivos | Insert/update de `textile_evidences` e insert de `textile_evidence_links` ahora exigen admin/quality/consultant (alineados con 0015/0016); insert sigue forzando `pending_review` |
| 5 | La signed URL firmaba el `file_path` guardado sin re-verificar el prefijo | Defensa en profundidad: `isTextileEvidencePathForOrg` — jamás se firma una ruta fuera de `{organización}/textiles/` (ni CPR ni otra empresa) |

## 2. Migración creada — `0076_textile_evidences_hardening_and_storage_usage.sql` (única)

1. **Vista de uso**: cuerpo vigente de 0059 + join `tev` con `sum(coalesce(file_size_bytes,0))` de `textile_evidences`, sumado en las tres expresiones de storage. **Mismas columnas, mismo orden, mismo `security_barrier`, misma RLS embebida y mismos revoke/grant** — CPR, planes y plataforma leen igual. Deliberadamente **sin** columna de conteo textil: los planes por módulo siguen prohibidos; solo el total de bytes es más veraz.
2. **Storage**: `create policy evidences_delete_textiles` (delete solo del prefijo textil, roles de subida, `safe_uuid`). Bucket privado intacto, sin anon, sin URLs públicas.
3. **RLS**: `drop/recreate` únicamente de `textile_evidences_insert/_update` y `textile_evidence_links_insert` (patrón 0016/0036 de recrear políticas propias por migración nueva). Select de miembros, delete de evidencias (admin/quality, nunca aceptada), delete de vínculos y el guard `guard_textile_evidence_review` quedan intactos de 0075 — nada se debilitó.

## 3. Cambios de código

| Archivo | Cambio |
|---|---|
| `lib/domain/textiles-evidences.ts` | `TEXTILE_EVIDENCE_UPLOAD_ROLES`, `canUploadTextileEvidence`, `isTextileEvidencePathForOrg` |
| `server/actions/textiles-evidences.ts` | Pre-check de rol al crear y al vincular (error claro antes de subir); limpieza de huérfanos en `try/catch` sin enmascarar el error original; verificación de prefijo antes de firmar |
| `app/(app)/(shell)/textiles/evidences/new/page.tsx` | Si el rol no puede cargar, nota informativa en lugar del formulario (la action y RLS re-verifican) |
| `package.json` | Script `test:textiles-evidences-hardening` encadenado a `test:all` |
| `tests/unit/textiles-module.test.ts` | Lista de migraciones 0070–0076 |
| `tests/products/…` y `tests/evidences/…` (check 1 de cada una) | Corrección de la misma deriva de pins ya arreglada en T4 para los checks de T2.1: fijaban "todo lo posterior" a su sprint y rompían con cada sprint legítimo; ahora fijan solo su rango. Comentado en el código |

Sin cambios en CPR, catálogos, productos (salvo nada), diagnóstico ni planes de código (`plans.ts` intacto: la vista se ajustó por migración).

## 4. Corrección documental (obligatoria del encargo)

Habilitación correcta del módulo (T4 §9 y T5 §8 actualizados):

```sql
insert into organization_modules (organization_id, module_code, enabled)
values ('<org>', 'textiles', true)
on conflict (organization_id, module_code) do update set enabled = true;
```

La tabla real usa **`module_code`** (no `module_key`) y **no existe `enabled_by`**. La constante conceptual "module_key = textiles" de los docs de diseño se refiere a `modules.code`; toda instrucción SQL ejecutable quedó con los nombres reales.

## 5. Verificación

| Comando | Resultado |
|---|---|
| `typecheck` / `lint` / `build` | ✅ |
| `test:platform` · `test:plans` · `test:launch` · `test:compliance` | ✅ |
| Suites textiles (module, scoring, hardening T2.1, catálogos, productos 21/21, evidencias 21/21) | ✅ |
| **Nueva** `tests/evidences/textiles-evidences-hardening.test.ts` | ✅ 13/13 |
| `test:smoke` | ⚠️ requiere `.env.local` (ambiental, igual que siempre) |

La suite nueva verifica: 0076 única y sin tablas; vista con bytes textiles en las 3 expresiones conservando todas las columnas/protecciones y sin conteo por módulo; delete de storage acotado al prefijo textil con roles y `safe_uuid`; limpieza de huérfanos tolerante a fallos; RLS endurecida sin debilitar 0075; roles espejados en dominio/actions; prefijo verificado antes de firmar; docs con `module_code` sin `enabled_by`; CPR intacto (0015/0016/0019, actions y `plans.ts`).

## 6. Riesgos restantes y qué quedó fuera

- Archivos huérfanos previos a T5.1 (si los hubo) no se retiran retroactivamente; son inaccesibles fuera del bucket privado y ahora pueden limpiarse manualmente con la nueva política.
- `expired` sigue siendo manual (aviso en UI); sin job automático.
- Sin reemplazo de archivo en edición (archivar + cargar nueva sigue siendo el flujo).
- Confirmaciones: sin órdenes/lotes, circularidad, TrazaDocs Textil, pasaporte, QR/IA/ACV, planes por módulo, imports/PDF ✔ · **CPR sin cambios funcionales** (las rutas CPR del bucket siguen exactamente igual; la vista conserva su contrato) ✔ · **Textil sigue privado** tras la triple guarda ✔.

Listo para T6 — Órdenes, lotes y trazabilidad.


---

## Hardening posterior (T5.2)

Ver `TEXTILES_T5_2_FILE_METADATA_IMMUTABILITY_REPORT.md` (migración 0077):
los metadatos de archivo (`file_path`, `file_name`, `file_mime_type`,
`file_size_bytes`) son INMUTABLES tras la creación (trigger BEFORE UPDATE
con `IS DISTINCT FROM`, aplicable también a service_role) y el patrón
`{organización}/textiles/{evidencia}/{archivo}` se valida estrictamente en
el INSERT. Cierra la posibilidad de manipular signed URLs o el uso de
almacenamiento editando esos campos por API.
