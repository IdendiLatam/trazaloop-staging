# TRAZALOOP · T9F.5A · PLAN DE CORRECCIÓN MÍNIMA

> **No** se implementa ninguna corrección aquí. Este documento describe, para cada ataque **VULNERABLE** o **NO DEMOSTRADO**, únicamente: causa raíz · archivo/política/función a cambiar · cambio mínimo · prueba adversarial que debe pasar · riesgo de regresión · dependencias.
> Sin ampliación de alcance. Sin UI, traducciones, hints, pasaportes, QR, circularidad ni funciones comerciales nuevas.

**Cobertura:** A01, A02, A03, A04, A05, A06, A07, A08, A13, A14.

Las correcciones deben llegar como **una nueva migración** (p. ej. `0102`) creada por el implementador — **no** editando 0101 ni migraciones anteriores.

---

## A01 — Upload CPR directo sin intent

- **Causa raíz:** `evidences_insert_legacy` (0099) autoriza INSERT en `evidences` solo por rol + prefijo de organización, sin exigir un `storage_upload_intents` válido para rutas CPR.
- **Qué cambiar:** política `evidences_insert_legacy` en `storage.objects` (nueva migración; **no** editar 0099).
- **Cambio mínimo:** reemplazar el predicado por uno análogo a `evidences_insert_textiles`: exigir `EXISTS (storage_upload_intents i WHERE i.object_path = storage.objects.name AND i.bucket_id='evidences' AND i.created_by=auth.uid() AND i.status='pending' AND i.expires_at>now() AND i.resource_type='evidence')`. Mantener `has_org_role` como refuerzo.
- **Prueba que debe pasar:** `A01_cpr_upload_without_intent` (upload directo sin intent → rechazado) y regresión del flujo legítimo (begin→upload→finalize → permitido).
- **Riesgo de regresión:** el flujo real (`server/actions/evidences.ts`) sube por el cliente del usuario; hay que garantizar que exista el intent antes del `upload` (ya lo crea `beginCprStorageUpload`). Si algún flujo CPR sube por URL firmada, la política INSERT no aplica (como documenta 0099) — verificar.
- **Dependencias:** comparte diseño con A02; ambos deben usar el mismo patrón intent-EXACTO.

## A02 — Upload TrazaDocs directo sin intent

- **Causa raíz:** `trazadocs_documents_insert` (0058) autoriza INSERT solo por rol.
- **Qué cambiar:** política `trazadocs_documents_insert` en `storage.objects`.
- **Cambio mínimo:** añadir al `with check` la condición `EXISTS (storage_upload_intents i WHERE i.object_path = storage.objects.name AND i.bucket_id='trazadocs-documents' AND i.created_by=auth.uid() AND i.status='pending' AND i.expires_at>now() AND i.resource_type IN ('trazadoc_initial','trazadoc_replace'))`.
- **Prueba que debe pasar:** `A02_trazadocs_upload_without_intent` (rechazo) + regresión begin/finalize inicial y replace.
- **Riesgo de regresión:** `replace` genera ruta `vN`; el intent ya la fija en `begin_cpr_storage_upload` (0101:1667). Verificar que la ruta del intent coincide EXACTAMENTE con la del `upload`.
- **Dependencias:** A01 (mismo patrón), A03/A04 (mismo bucket).

## A03 — UPDATE directo de `storage.objects` (TrazaDocs)

- **Causa raíz:** `trazadocs_documents_update` (0058) permite `upsert` por rol.
- **Qué cambiar:** política `trazadocs_documents_update`.
- **Cambio mínimo:** `drop policy trazadocs_documents_update on storage.objects` (deny-by-default). Cada versión sube un objeto nuevo (no upsert), por lo que la política no es necesaria — igual que `evidences` (0099 §3).
- **Prueba que debe pasar:** `A03_direct_update_storage_object` (upsert sobre objeto existente → rechazado) + regresión: subida de nueva versión a ruta nueva sigue funcionando.
- **Riesgo de regresión:** si algún flujo hiciera `upsert` legítimo (no debería: 0057/0059 crean rutas `vN` nuevas). Verificar que ninguna Server Action use `upsert:true` sobre `trazadocs-documents`.
- **Dependencias:** A04 (mismo bucket/decisión).

## A04 — DELETE directo de `storage.objects` (TrazaDocs)

- **Causa raíz:** `trazadocs_documents_delete` (0058) permite borrado físico por rol, eludiendo `pending_delete`.
- **Qué cambiar:** política `trazadocs_documents_delete`.
- **Cambio mínimo:** `drop policy trazadocs_documents_delete on storage.objects`. El borrado físico legítimo debe pasar por `queue_and_delete_*` + resolución server-only (0101 §1–§3), como ya hace `evidences` tras 0099.
- **Prueba que debe pasar:** `A04_direct_delete_storage_object` (remove directo → rechazado) + regresión: borrado de borrador vía `queue_and_delete_trazadoc_draft` sigue funcionando.
- **Riesgo de regresión:** limpieza de objetos huérfanos debe ejecutarse server-only con cliente administrativo (patrón ya usado en Textiles). Verificar que el barrido no dependa de DELETE de `authenticated`.
- **Dependencias:** A03; ciclo `pending_delete` (0101 §1).

## A05 — Finalize sin objeto físico (CPR/TrazaDocs)

- **Causa raíz:** `finalize_evidence_attachment` (0101:1793) y `finalize_trazadoc_file_document_initial_version_v2`/`replace_v2` fijan campos físicos sin verificar que el objeto exista en `storage.objects`, y son ejecutables por `authenticated`.
- **Qué cambiar:** grants + cuerpo de esos finalizers (nueva migración con `create or replace`, firmas conservadas) y la capa server TS que los invoca (`server/actions/evidences.ts`, `server/actions/trazadocs-master.ts`).
- **Cambio mínimo:** (1) `revoke execute … from authenticated` y `grant … to service_role` (server-only, como Textiles). (2) El servidor lee la metadata real del objeto (existencia + tamaño) antes de llamar, igual que `getTextileEvidenceObjectInfo` (`textiles-evidences.ts:405`); si no existe → no finaliza.
- **Prueba que debe pasar:** `A05_finalize_without_object` (finalize sin subir → rechazo, sin fila final consistente).
- **Riesgo de regresión:** cambiar a server-only exige que las Server Actions usen el cliente `service_role`; el `auth.uid()` interno pasa a NULL, por lo que la identidad del actor debe pasarse como parámetro y revalidarse (patrón `finalize_textile_evidence_upload_server` con `p_actor_id`).
- **Dependencias:** A06, A07 (misma reescritura server-only del finalizer).

## A06 — Tamaño físico mayor que el declarado (CPR/TrazaDocs)

- **Causa raíz:** los finalizers comparan `p_file_size_bytes` con `expected_size_bytes` (ambos de origen cliente) y `module_storage_snapshot` (0101:1070) contabiliza el `size_bytes` **declarado**; nunca se lee el tamaño físico.
- **Qué cambiar:** mismos finalizers (server-only, ver A05) + capa TS.
- **Cambio mínimo:** el servidor obtiene el tamaño físico real de `storage.objects.metadata` y lo pasa como el tamaño autoritativo; el finalizer exige `real == expected` (o amplía la reserva atómicamente) y hace fail-closed si el objeto no existe. Reutilizar el contrato de `finalize_textile_evidence_upload_server` (0101:1490–1497).
- **Prueba que debe pasar:** `A06_physical_larger_than_declared` (reservar 1 MB, subir 50 MB, finalizar 1 MB → rechazo).
- **Riesgo de regresión:** archivos legítimos donde el tamaño declarado ≈ real deben seguir finalizando; verificar tolerancia cero (igualdad estricta) como en Textiles.
- **Dependencias:** A01 (facilita colocar el objeto grande); A05 (misma reescritura).

## A07 — MIME físico diferente (CPR/TrazaDocs)

- **Causa raíz:** el MIME se fija en `begin_cpr_storage_upload` desde el cliente y nunca se revalida por firma binaria/Content-Type real al finalizar.
- **Qué cambiar:** finalizers server-only + capa TS.
- **Cambio mínimo:** el servidor descarga los bytes (≤ tope) y valida que extensión, MIME declarado, Content-Type almacenado y firma detectada correspondan al mismo tipo, reutilizando `validateTextileEvidenceBinarySignature` (`textiles-evidences.ts:432`) para CPR/TrazaDocs.
- **Prueba que debe pasar:** `A07_physical_mime_mismatch` (declarar PDF, subir otro tipo → rechazo).
- **Riesgo de regresión:** ampliar la validación de firma a los tipos permitidos en CPR/TrazaDocs (pueden diferir de los de Textiles); verificar el catálogo de tipos aceptados.
- **Dependencias:** A05, A06 (misma reescritura server-only).

## A08 — Cambio de plan entre begin y finalize (TrazaDocs)

- **Causa raíz:** `finalize_trazadoc_file_document_initial_version_v2` (0101:1922) y `replace_trazadoc_file_document_v2` (0101:1994) revalidan solo `access.allowed`; **no** recalculan cuota.
- **Qué cambiar:** cuerpo de esos dos finalizers (nueva migración, `create or replace`, firmas conservadas).
- **Cambio mínimo:** añadir, tras el chequeo de acceso, la misma revalidación de cuota que `finalize_evidence_attachment` (0101:1868–1876): leer `storage_limit_bytes` del `access_mode` actual, llamar `module_storage_snapshot`, y rechazar si `committed + otras_reservas + tamaño > cuota`.
- **Prueba que debe pasar:** `A08_plan_change_between_begin_and_finalize` (reservar bajo Extra, degradar a Demo, finalizar por encima de cuota Demo → rechazo).
- **Riesgo de regresión:** finalizaciones legítimas bajo el mismo plan no deben verse afectadas (la reserva ya se contó en begin); usar la resta `reserved - expected` como en CPR para no contar dos veces.
- **Dependencias:** ninguna crítica; independiente de A01–A07.

## A13 — Blueprint CPR con `module_key` manipulado

- **Causa raíz:** orden alfabético de triggers BEFORE INSERT en `trazadoc_documents`: `t_trazadoc_documents_limit` (0101) se ejecuta **antes** de `t_trazadoc_documents_module_key` (0082), así que el límite lee el `module_key` enviado por el cliente.
- **Qué cambiar:** o bien el nombre/registro del trigger de normalización, o bien la función de límite (nueva migración).
- **Cambio mínimo (opción A, preferida):** recrear el trigger de normalización con un nombre que ordene ANTES del de límite, p. ej. `t_trazadoc_documents_00_module_key` (drop + create en nueva migración). **Cambio mínimo (opción B):** en `enforce_module_resource_limit`, cuando `tg_argv[0]='BY_MODULE_KEY'`, derivar el módulo del **blueprint** (`trazadoc_blueprints.module_key` vía `new.blueprint_id`/`new.document_id`) en lugar de `new.module_key`.
- **Prueba que debe pasar:** `A13_module_key_spoof_trigger_order` (CPR al límite + Textiles con cupo; insertar CPR con `module_key='textiles'` → rechazo por límite CPR).
- **Riesgo de regresión:** re-ordenar triggers puede alterar interacciones con otros BEFORE INSERT; verificar que `force_created_by`/auditoría no dependan del `module_key` ya normalizado. La opción B evita tocar el orden.
- **Dependencias:** ninguna con A01–A08; interactúa con A10 (misma barrera de límite).

## A14 — Archivo TrazaDocs Full de 22 MB (tope por plan)

- **Causa raíz:** el tope por archivo es un **20 MB fijo** (`begin_cpr_storage_upload` 0101:1649 y gemelos), no diferenciado por plan; no existe el 25 MB del encargo.
- **Qué cambiar:** el/los checks de tamaño máximo por archivo en `begin_cpr_storage_upload` (y, si aplica, en el catálogo `plan_limits`/`plan_definitions`, 0050).
- **Cambio mínimo:** definir el máximo por archivo en el catálogo por plan (p. ej. columna/registro `max_file_bytes` por `plan_code`) y leerlo en begin en lugar del literal `20 * 1024 * 1024`; para Textiles mantener su tope propio si el producto así lo define.
- **Prueba que debe pasar:** `A14_full_22mb_should_be_allowed` (begin 22 MB bajo Full con cuota → éxito) y un negativo (> máximo del plan → rechazo).
- **Riesgo de regresión:** subir el tope amplía la superficie de cuota/tiempo de verificación de firma (descarga de bytes en finalize Textiles asume ≤ 20 MB); revisar ese supuesto si el máximo sube a 25 MB.
- **Dependencias:** confirmar con producto el máximo real (20 vs 25 MB) antes de implementar; independiente del resto.

---

## Orden de implementación sugerido (informativo, no vinculante)

1. **A01–A04** (políticas de Storage) — cierran la superficie que hace opcional todo lo demás.
2. **A05–A07** (finalizers CPR/TrazaDocs server-only + verificación física) — misma reescritura.
3. **A13** (orden de triggers) y **A08** (cuota en finalize TrazaDocs) — cambios acotados e independientes.
4. **A14** (tope por plan) — requiere confirmación de producto.

Cada corrección debe acompañarse de la prueba adversarial correspondiente **en verde contra Supabase QA** antes de considerarse cerrada. Una prueba local (arnés) **no** es suficiente para A01–A07 ni A13 (ver informe §9).
