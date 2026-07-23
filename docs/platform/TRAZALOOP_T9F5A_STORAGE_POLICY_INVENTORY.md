# TRAZALOOP · T9F.5A · INVENTARIO DE POLÍTICAS FINALES DE `storage.objects`

- **Auditoría:** T9F.5A — equipo rojo independiente sobre el candidato T9F.4.
- **Repositorio:** `IdendiLatam/trazaloop-staging`
- **Rama:** `feature/t9f5a-red-team-audit`
- **Commit auditado:** `fa07e5aa58cc88e1e06f63da91435ae2f6bdd053` (`fa07e5a`, "chore: import T9F.4 security candidate")
- **Método:** reconstrucción estática del estado ACUMULADO tras aplicar toda la cadena de migraciones `0001 → 0101` (no solo 0101).
- **Alcance de la verificación:** análisis SQL estático. **No** se ejecutó contra Supabase real (ni staging ni producción). Storage físico **no** fue probado.

---

## 1. Método de reconstrucción

Patrones buscados sobre `supabase/migrations/*.sql`:

- `create policy … on storage.objects`
- `drop policy … on storage.objects`
- `insert into storage.buckets`
- referencias a `bucket_id`, `storage.foldername`, `has_org_role`, `is_org_member`, `safe_uuid`.

Migraciones que tocan `storage.objects` (en orden): **0015, 0016, 0049, 0058, 0076, 0099**.
`0100` y `0101` **no** crean ni eliminan políticas sobre `storage.objects` (0101 lo declara explícitamente en su cabecera: *"no toca Storage RLS (0093–0099)"*; verificado: sus únicas referencias a `bucket_id` están dentro de funciones/CHECKs, no en políticas).

Buckets creados: `evidences` (0015), `organization-assets` (0049), `trazadocs-documents` (0058). **No existe bucket "CPR" ni bucket "textiles" propio**: CPR y Textiles comparten el bucket `evidences`, diferenciados por el 2.º segmento de ruta (`{org}/{uuid}/…` = CPR; `{org}/textiles/…` = Textiles).

---

## 2. Estado final acumulado — bucket `evidences` (privado)

| Política | Op | Rol | USING | WITH CHECK | Origen | ¿Eliminada? | Estado final |
|---|---|---|---|---|---|---|---|
| `evidences_select` | SELECT | authenticated | `bucket_id='evidences' AND is_org_member(safe_uuid(foldername[1]))` | — | 0015→0016 | recreada en 0016 | **ACTIVA** |
| `evidences_insert_legacy` | INSERT | authenticated | — | `bucket_id='evidences' AND foldername[2] IS DISTINCT FROM 'textiles' AND has_org_role(safe_uuid(foldername[1]), [admin,quality,consultant])` | 0099 (sustituye `evidences_insert` de 0016) | no | **ACTIVA** |
| `evidences_insert_textiles` | INSERT | authenticated | — | `bucket_id='evidences' AND foldername[2]='textiles' AND EXISTS(intent textil EXACTO propio, pending, no vencido, sin consumir, rol y módulo vigentes)` | 0099 | no | **ACTIVA** |
| `evidences_insert` (genérica) | INSERT | authenticated | — | rol + prefijo | 0016 | **sí (drop en 0099)** | eliminada |
| `evidences_delete_textiles` | DELETE | authenticated | `bucket_id='evidences' AND foldername[2]='textiles' AND has_org_role(...)` | — | 0076 | **sí (drop en 0099)** | eliminada |
| *(sin política UPDATE)* | UPDATE | — | — | — | — | — | **DENY por defecto** |
| *(sin política DELETE tras 0099)* | DELETE | — | — | — | — | — | **DENY por defecto** |

**Lectura adversarial del bucket `evidences`:**

- **INSERT Textiles** → correctamente ligado a un intent EXACTO (`i.object_path = storage.objects.name`, creador, pending, no vencido, `evidence_id is null`, rol y módulo revalidados). **Cerrado.**
- **INSERT CPR (legacy)** → `evidences_insert_legacy` autoriza **solo por rol + prefijo de organización**. **No exige intent alguno.** Cualquier miembro `admin/quality/consultant` puede subir un objeto a `{org}/{uuid-cualquiera}/archivo` sin pasar por `begin_cpr_storage_upload`. 0099 lo declara fuera de alcance textualmente: *"No se corrigen otros asuntos CPR: fuera de alcance."* → habilita **A01**.
- **UPDATE / DELETE** → sin política ⇒ deny-by-default para `authenticated`. Protege evidencias CPR y Textiles contra sobrescritura/borrado físico directo (**A03/A04 protegidos SOLO para este bucket**).

---

## 3. Estado final acumulado — bucket `trazadocs-documents` (privado)

Definido en **0058**, **intacto** después (0076/0099/0100/0101 no lo tocan).

| Política | Op | Rol | USING | WITH CHECK | Origen | ¿Eliminada? | Estado final |
|---|---|---|---|---|---|---|---|
| `trazadocs_documents_select` | SELECT | authenticated | `bucket_id='trazadocs-documents' AND is_org_member(foldername[1]::uuid)` | — | 0058 | no | **ACTIVA** |
| `trazadocs_documents_insert` | INSERT | authenticated | — | `bucket_id='trazadocs-documents' AND has_org_role(foldername[1]::uuid,[admin,quality,consultant])` | 0058 | no | **ACTIVA (rol, SIN intent)** |
| `trazadocs_documents_update` | UPDATE | authenticated | `bucket_id=… AND has_org_role(foldername[1]::uuid,[admin,quality])` | idéntico | 0058 | no | **ACTIVA** |
| `trazadocs_documents_delete` | DELETE | authenticated | `bucket_id=… AND has_org_role(foldername[1]::uuid,[admin,quality])` | — | 0058 | no | **ACTIVA** |

**Lectura adversarial del bucket `trazadocs-documents`:**

- **INSERT** por rol, **sin vinculación a intent** → habilita **A02** (subida directa sin `begin_cpr_storage_upload`). El objeto queda fuera de la reserva/cuota.
- **UPDATE** habilitado para `admin/quality` → habilita **A03** para TrazaDocs: `upsert:true` sobre un objeto existente reemplaza el contenido físico sin cambiar la fila de dominio (elude versionado y el guard de campos físicos, que actúa sobre la tabla, no sobre `storage.objects`).
- **DELETE** habilitado para `admin/quality` → habilita **A04** para TrazaDocs: borrado físico del objeto mientras `trazadoc_file_documents` sigue apuntándolo ⇒ referencia colgante y elusión del ciclo `pending_delete`.

Este bucket es la asimetría central: Textiles se endureció en 0099, pero `trazadocs-documents` conserva el patrón permisivo "cualquier miembro con rol puede INSERT/UPDATE/DELETE directo" de 0058.

---

## 4. Estado final acumulado — bucket `organization-assets` (privado, fuera del núcleo CPR/Textiles/TrazaDocs)

| Política | Op | Rol | Predicado | Origen | Estado |
|---|---|---|---|---|---|
| `organization_assets_select` | SELECT | authenticated | `is_org_member(foldername[1])` | 0049 | ACTIVA |
| `organization_assets_insert` | INSERT | authenticated | `has_org_role(...admin...)` | 0049 | ACTIVA |
| `organization_assets_update` | UPDATE | authenticated | `has_org_role(...)` | 0049 | ACTIVA |
| `organization_assets_delete` | DELETE | authenticated | `has_org_role(...)` | 0049 | ACTIVA |

Bucket de logos/branding. No almacena evidencias CPR/Textiles ni documentos TrazaDocs. Sus políticas CRUD por rol **no** están en el alcance de A01–A18 (no hay reserva/cuota por objeto asociada a este bucket en el flujo comercial auditado), pero se documentan por completitud: son otra superficie donde `authenticated` escribe directamente a Storage por rol.

---

## 5. Políticas permisivas que sobreviven y permiten `authenticated → INSERT/UPDATE/DELETE` sin intent válido

Requisito §6 del encargo — **identificación explícita**:

| # | Bucket | Política | Operación abierta a authenticated sin intent | Ataque |
|---|---|---|---|---|
| 1 | `evidences` | `evidences_insert_legacy` (0099) | INSERT CPR por rol + prefijo | **A01** |
| 2 | `trazadocs-documents` | `trazadocs_documents_insert` (0058) | INSERT por rol | **A02** |
| 3 | `trazadocs-documents` | `trazadocs_documents_update` (0058) | UPDATE/upsert por rol | **A03** |
| 4 | `trazadocs-documents` | `trazadocs_documents_delete` (0058) | DELETE por rol | **A04** |
| 5 | `organization-assets` | `organization_assets_{insert,update,delete}` (0049) | CRUD por rol (fuera de alcance A-matrix) | — |

**Única superficie de Storage correctamente ligada a intent:** `evidences_insert_textiles` (0099). Ninguna otra política de escritura sobre `storage.objects` exige la existencia de un `*_upload_intent` válido.

---

## 6. Límite honesto de este inventario

- Reconstrucción **estática**. No se ejecutó `select … from pg_policies` en Supabase real; el estado se derivó leyendo `create/drop policy` en el orden de migración. Una divergencia entre el repositorio y el esquema realmente desplegado **no** sería visible aquí.
- Supabase Storage evalúa estas políticas sobre `storage.objects`; el arnés local (`scripts/t9f*-local-sql-harness`) **no** reproduce RLS ni Storage físico (su propio README lo indica), de modo que **ninguna** de estas conclusiones fue ejercida por las pruebas locales existentes.
- La verificación definitiva requiere ejecutar la suite `tests/rls/t9f5-adversarial-attacks.test.ts` (preparada, no ejecutada) contra un proyecto Supabase QA con Storage real.
