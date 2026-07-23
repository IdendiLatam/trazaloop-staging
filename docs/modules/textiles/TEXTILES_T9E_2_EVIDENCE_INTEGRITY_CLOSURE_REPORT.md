# Sprint T9E.2 · Cierre acotado de integridad — Carga directa de evidencias textiles

Fecha: 2026-07-21 · Alcance: SOLO integridad del flujo directo de evidencias · Rama: `feature/textiles-t1-t9d-implementation` · Respaldo: `backup/textiles-t9e1-before-t9e2-20260721-1627`

> **Actualización T9E.3 (2026-07-21):** una revisión independiente encontró que las dos RPC de este sprint (`finalize_textile_evidence_upload` y `record_textile_upload_intent_cleanup`) conservaban `GRANT` a `authenticated`, de modo que un usuario podía invocarlas **directamente** con su JWT, saltándose las verificaciones de objeto/firma (finalize) o afirmando un retiro no confirmado (cleanup); además, la validación OOXML por subcadenas aceptaba bytes con cadenas incrustadas. Esos tres bypasses se cerraron en el sprint **T9E.3** mediante la migración `0098` (sellado de estas RPC + variantes `*_server` solo para `service_role` con actor explícito) y un parser ZIP real para OOXML. Ver `TEXTILES_T9E_3_SERVER_ONLY_AND_OOXML_CLOSURE_REPORT.md`. Las suites de este informe que llamaban las RPC directamente como `authenticated` se reescribieron en consecuencia.

---

## 1. Resumen ejecutivo

T9E.2 cerró los cinco pendientes de integridad de T9E.1 con **una única migración (0097)** y cambios localizados en el flujo de evidencias:

1. **Finalización ATÓMICA**: el insert de `textile_evidences` y el consumo del intento ahora ocurren en UNA transacción PostgreSQL (RPC `finalize_textile_evidence_upload`, `SELECT … FOR UPDATE`), idempotente y con el resultado siempre comprobado.
2. **Limpieza RECUPERABLE**: un intento solo pasa a `expired` cuando Storage CONFIRMA el retiro del objeto; los retiros fallidos conservan el estado, registran contador/fecha y vuelven a ser candidatos. Antes de retirar cualquier objeto se verifica que su ruta NO pertenezca a una evidencia real.
3. **Firma binaria REAL**: el Content-Type almacenado por Storage proviene del header del PUT del navegador y ya no se trata como prueba; la finalización descarga los bytes desde Storage y exige que extensión ↔ MIME declarado ↔ Content-Type almacenado ↔ **firma detectada** correspondan al mismo tipo permitido.
4. **Transiciones SOLO por RPC**: se retiraron los INSERT/UPDATE/DELETE directos de `textile_evidence_upload_intents` para `authenticated`; el SELECT quedó limitado al CREADOR. Un usuario autorizado de la MISMA organización ya no puede tocar intentos ajenos.
5. **Metadata funcional ANTES de subir**: `begin` valida título/tipo/fechas (mismo dominio que la evidencia) antes de emitir la URL firmada, guarda la copia CANÓNICA en el intento (inmutable por guard) y `finalize` recibe **solo `intent_id`** — el cliente no puede presentar otra metadata tras subir 20 MB.

Verificado con: suite pura de firmas (12/12), suite de regresión actualizada (20/20), **suite REAL de integridad contra staging (14/14: atomicidad con rollback, idempotencia, consumido inmutable incluso para service_role, restricción por creador)**, instalación limpia (`npm ci`) + typecheck/lint/build, `test:all` y prueba manual mínima.

## 2. Alcance estricto
Solo: intents 0094 (+0097), actions/db/domain de evidencias, formulario de carga, script de limpieza, suites de evidencias/RLS, informes. Sin cambios en diagnóstico, catálogos, productos, trazabilidad, circularidad, TrazaDocs, pasaportes, enlaces, CPR, selector, navegación ni branding. 0070–0096 intactas.

## 3. Problemas iniciales y 4. causa raíz (auditoría §4, confirmada desde el código)

| # | Problema | Causa raíz confirmada |
|---|---|---|
| P1 | Insert+consumo no atómicos | `finalizeTextileEvidenceUploadAction` hacía `insert` y luego `consumeTextileEvidenceUploadIntent` en dos sentencias; el `await` del consumo **ignoraba el resultado** → insert OK + consumo fallido = evidencia con intento `pending` |
| P2 | Huérfano no recuperable | La limpieza (oportunista y script) ejecutaba `storage.remove()` y marcaba `expired` **sin condicionar al resultado**; un remove fallido sacaba el intento del ciclo para siempre; tampoco se comprobaba si la ruta pertenecía a una evidencia real |
| P3 | MIME de metadata controlable | `storage.info().contentType` refleja el header `content-type` del PUT del navegador; era la única "verificación de tipo real" |
| P4 | Intentos manipulables intra-org | Políticas 0094 de UPDATE/DELETE con `has_org_role(...)` sin filtro `created_by` → cualquier admin/quality/consultant de la org podía consumir/fallar/expirar/borrar intentos ajenos |
| P5 | Metadata tardía | `parseMetadata` corría en la FINALIZACIÓN: título/tipo/fechas inválidos se descubrían después de subir hasta 20 MB |

## 5. Finalización anterior
Ver P1: dos sentencias TS separadas, PK como única barrera de duplicado y consumo best-effort ignorado.

## 6–7. Finalización atómica nueva (RPC y transacción)
`finalize_textile_evidence_upload(p_intent_id, p_file_size_bytes, p_file_mime_type)` — SECURITY DEFINER, `search_path=public`, `revoke` de public/anon, `grant` a authenticated:
`auth.uid()` obligatorio → `SELECT … FOR UPDATE` del intento → existe / rol `admin|quality|consultant` en SU organización / `created_by = auth.uid()` / `pending` / no vencido / con metadata → tamaño y MIME verificados == declarados en el intento (y dentro de límites) → `INSERT textile_evidences` (metadata CANÓNICA del intento; `created_by` lo fuerza el trigger de 0075 con `auth.uid()`) → `UPDATE` del intento a `consumed` + `consumed_at` + `evidence_id` → **una transacción: ambas confirman o ambas revierten**. Los argumentos tamaño/MIME los deriva el SERVIDOR del objeto real (nunca el cliente) y la RPC los re-verifica contra el intento.

## 8. Idempotencia
El intento almacena `evidence_id` (índice único parcial; FK a `textile_evidences`). Si ya está `consumed`, la RPC devuelve el MISMO `evidence_id` con `already_finalized: true` (verificando que la evidencia exista; si no: `INTENT_CONSUMED_INCONSISTENT`). El `FOR UPDATE` serializa la carrera del doble clic. Imposible: dos evidencias por intento (unique), consumido sin evidencia (CHECK `consumed_link` + guard), cambiar `evidence_id` después (guard). Probado en staging (checks 7–9 de la suite T9E.2).

## 9. Hardening de RLS y 10. restricción por creador
0097 elimina las políticas INSERT/UPDATE/DELETE de 0094 para `authenticated` y recrea SOLO el SELECT con `is_org_member(organization_id) AND created_by = auth.uid()`. Transiciones exclusivamente por RPC: inicio (`begin_…`), consumo (`finalize_…` atómica), fallo (`mark_…_failed`), expiración/limpieza (`record_…_cleanup`) — todas re-validan rol **y creador** (`INTENT_NOT_OWNED`). `anon` sin acceso. El script administrativo usa service_role (solo local) con UPDATE directo bajo el guard, que también lo obliga. Probado en staging: A2 (misma org, rol autorizado) no ve, no finaliza, no falla ni borra el intento de A1 (check 4); B y anon tampoco (check 5); ni siquiera el creador puede UPDATE/DELETE directo (check 3).

## 11. Ruta exacta
La construye la RPC begin en SQL: `{organization_id}/textiles/{gen_random_uuid()}/{regexp_replace(nombre, '[^a-zA-Z0-9._-]', '_', 'g')}`. CHECK nuevo (0097, NOT VALID para filas históricas T9E.1, efectivo para todo insert/update): `object_path = organization_id||'/textiles/'||id||'/'||safe_filename` + alfabeto saneado + sin `..` + sin `\` (sin segmentos vacíos por construcción) + UNIQUE de 0094 (imposible pisar otro intento). El cliente jamás envía rutas (regresión estática) y el INSERT directo está bloqueado (staging check 2); rutas cruzadas de organización imposibles también por el CHECK de 0094.

## 12–13. Metadata validada en begin y almacenada en el intento
`beginTextileEvidenceUploadAction` ejecuta `parseMetadata` (EXACTAMENTE el mismo esquema de dominio que usaba la finalización) ANTES de la cuota y de la RPC; la RPC re-valida en BD (título ≤200, tipo del catálogo, fechas casteables, vigencia coherente) y guarda la copia **canónica** (solo claves del dominio, normalizadas) en `evidence_metadata jsonb` — inmutable tras el inicio (guard). `finalize` recibe **solo `intent_id`** y la evidencia nace de esa copia. No se duplicaron columnas de `textile_evidences`: un JSONB restringido y validado basta porque el intento es efímero y la evidencia final sí usa columnas tipadas. Entidad/tipo de vínculo: no aplican en este formulario (los vínculos se crean después con su propio gestor validado); documentado.

## 14–16. Verificación de firma
`lib/domain/textiles-evidence-signatures.ts` (puro, testeable):
- `detectTextileEvidenceFileType(bytes)` → PDF (`%PDF-`), PNG (firma de 8 bytes), JPEG (`FF D8 FF`), WebP (`RIFF…WEBP`), contenedor ZIP (`PK\x03\x04`) con estructura OOXML (`[Content_Types].xml` + `word/` → docx; + `xl/` → xlsx; ZIP sin estructura → `zip` genérico, inválido para OOXML), CSV (texto razonable: sin NUL, ≥95 % imprimible; jamás interpreta fórmulas), `unknown`.
- `validateTextileEvidenceBinarySignature({bytes, fileName, declaredMimeType, storedContentType})` → matriz completa: extensión ↔ MIME declarado ↔ Content-Type almacenado ↔ firma detectada deben corresponder al MISMO tipo permitido.
La finalización descarga los bytes desde Storage con la sesión del usuario (≤20 MB verificado antes; el archivo **jamás** viaja como cuerpo de una Server Action) y rechaza con retiro del objeto + intento `failed`.
**Limitaciones documentadas (riesgo residual)**: la firma estructural NO sustituye un escaneo antimalware (un PDF real puede ser hostil para el visor); la validación OOXML busca la estructura mínima (no valida el XML interno); el CSV se valida por heurística textual prudente.

## 17. Limpieza anterior
Ver P2: `remove()` ignorado + `expired` incondicional + sin barrera de evidencia vinculada.

## 18–19. Limpieza recuperable y estados
**Decisión documentada: NO se añadió el estado `cleanup_failed`** — se conserva el estado anterior (pending vencido o failed) hasta que Storage confirme el retiro, con `cleanup_attempts` y `last_cleanup_attempt_at`. Ventaja: las consultas de candidatos (`pending` vencidos, `failed`) re-encuentran naturalmente los fallidos sin ampliar la máquina; el CHECK de estados de 0094 queda intacto. Regla dura: **solo `expired` con retiro confirmado**. Barreras: nunca `consumed` (RPC devuelve `consumed_untouchable`; guard lo bloquea en BD), nunca rutas de evidencias reales (`linked_evidence`). Probado en staging (checks 10–12).

## 20. Script administrativo
`scripts/cleanup-textile-upload-intents.ts`: dry-run por defecto (`--apply` para ejecutar), candidatos = pending vencidos + failed (incluye reintentos: reporta cuántos llevan intentos previos), barrera de evidencia vinculada ANTES del remove, `expired` SOLO tras retiro confirmado, fallo → contador + estado conservado, jamás consumidos, idempotente, imprime solo conteos (sin rutas, URLs ni secretos). Ejecutado en dry-run como parte de la validación.

## 21. Migración 0097
Única migración nueva: columnas (`evidence_id` + índice único parcial + FK, `evidence_metadata`, `cleanup_attempts`, `last_cleanup_attempt_at`), CHECKs (`consumed⇒evidence_id`, forma de metadata, **ruta exacta** — `NOT VALID` por filas históricas T9E.1, efectivos hacia adelante), guard reforzado (metadata y `evidence_id` inmutables; consumo exige evidencia; sin security definer: obliga a service_role), RLS reducida a SELECT-del-creador, 4 RPCs SECURITY DEFINER con `search_path=public`, `revoke` public/anon y `grant` a authenticated. Rollback: §32.

**Aplicación**: `supabase migration list` confirmó remoto …0093, 0094, 0095, 0096 → `db push --dry-run` mostró SOLO 0097 → `db push` → verificación post: registro `0097:atomic_textile_evidence_upload_finalize`, 4 columnas, políticas = solo `textile_upload_intents_select`, 4 RPCs (secdef + search_path), grants (`authenticated`), checks e índice presentes. Sin `migration repair` (no hubo inconsistencias) y sin `db reset`.

**Consultas de verificación:**
```sql
select version, name from supabase_migrations.schema_migrations where version = '0097';
select policyname, cmd from pg_policies where tablename = 'textile_evidence_upload_intents';        -- solo SELECT
select proname, prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname like '%textile_evidence_upload%';                            -- 4 RPCs secdef
select conname, convalidated from pg_constraint
 where conrelid = 'public.textile_evidence_upload_intents'::regclass and contype = 'c';
```

## 22. Pruebas unitarias
- **Nueva** `textiles-evidence-signatures` (12 checks): TODOS los casos del §13 del encargo — `documento.pdf` con bytes PNG → rechazado; `.png` con PDF, `.jpg` arbitrario, DOCX-ZIP sin `word/`, XLSX sin `xl/`, CSV binario/NUL → rechazados; PDF/PNG/JPEG/WebP/DOCX/XLSX/CSV reales → aceptados; MIME cruzado y Content-Type divergente → rechazados.
- `textiles-evidence-direct-upload` actualizada a T9E.2 (20 checks): sin INSERT directo de evidencias en TS, RPC atómica con FOR UPDATE e insert+consumo en la misma función, resultado del consumo jamás ignorado, firma obligatoria en finalize, finalize solo-intentId, transiciones cerradas (política única de SELECT-creador, 4 RPCs con revoke), metadata en begin e inmutable, vínculo intento↔evidencia, limpieza recuperable (app y script).
- Actualizadas sin relajar intención: `textiles-evidences` (las 8 actions), `-hardening` (limpieza nueva), `-file-metadata-immutability` (0 escrituras de file_* en TS; la única vive en la RPC), `-upload-limits`, y las 2 listas de migraciones (…→0097).

## 23. Pruebas RLS reales (staging)
`tests/rls/textiles-t9e2-integrity.test.ts`: **14/14** (detalle §1 y §9–§11). Además `textiles-t9e1-multitenant` sigue verde (17/17, re-ejecutada tras 0097 en la validación final). Datos temporales con credenciales aleatorias en memoria; limpieza automática (residuo: intentos `consumed` + filas `organizations` cascarón — protegidos por diseño 0097/audit-log, sin miembros ni objetos).

## 24. Pruebas manuales (mínimas §19) — ver resultados en la respuesta del sprint
PDF válido end-to-end con Network verificado (PUT a Supabase), intento `consumed` + `evidence_id`, doble finalize sin duplicado, `.pdf` falso rechazado, DOCX válido aceptado, ZIP-renombrado rechazado, >20 MB y metadata inválida rechazados ANTES de subir, cancelación recuperable, manipulación por otro usuario de la misma organización bloqueada (cubierta también por la suite real).

## 25–29. Validación limpia
`rm -rf node_modules .next tsconfig.tsbuildinfo` → `npm cache verify` → **`npm ci` exit 0** → `typecheck` exit 0 → `lint` exit 0 (0 errores; 1 warning preexistente ajeno) → `build` exit 0 → `test:all` completo en verde (números exactos en la respuesta del sprint). Node v22.23.1 · npm 10.9.8 · Next 16.2.10 (sin cambios de dependencias ni de `package-lock.json`).

## 30. Riesgos residuales (honestos)
1. La firma estructural NO es antivirus (documentado; fuera de alcance).
2. Huérfano temporal entre abandono y limpieza persiste, pero ya es IRRECUPERABLE-imposible: contador + estado conservado garantizan reintento; el objeto es invisible públicamente.
3. Token de subida de Storage (~2 h) > TTL del intento (30 min): re-subida tardía posible e inocua (finalize la rechaza; limpieza la retira).
4. Los CHECKs de 0097 son `NOT VALID` para filas históricas T9E.1 (consumidas sin `evidence_id`, datos QA ya limpiados) — efectivos para todo el flujo nuevo; el guard los hace operativos.
5. Deriva RLS preexistente en superficies CPR (9 checks de `isolation.test.ts`) sigue documentada y fuera de alcance.

## 31. Despliegue
Integrar la rama → en el staging de `.env.local` **0097 ya está aplicada y registrada**; en otros entornos `supabase db push` (dry-run primero; pendientes esperadas: 0094–0097 según el entorno) → `npm ci && npm run build` → sin variables nuevas.

## 32. Rollback (NO ejecutar en staging sin decisión explícita)
Orden correcto, conservando datos históricos:
1. **Verificación previa** (¿qué se creó después de 0097?):
```sql
select count(*) from textile_evidence_upload_intents where evidence_metadata is not null;   -- intentos T9E.2
select count(*) from textile_evidence_upload_intents where evidence_id is not null;         -- consumidos ligados
```
2. Revertir la APLICACIÓN al commit previo (la rama `backup/textiles-t9e1-before-t9e2-…` conserva el estado exacto). La app T9E.1 vuelve a INSERT/UPDATE directos → deben restaurarse las políticas de 0094 ANTES de servir tráfico.
3. BD (en una transacción): `drop` de las 4 RPCs (`begin_…`, `finalize_…`, `mark_…_failed`, `record_…_cleanup`); recrear las políticas insert/update/delete/select EXACTAMENTE como aparecen en `0094_…sql`; recrear `guard_textile_evidence_upload_intent` con el cuerpo de 0094; `drop` de los CHECKs/índice nuevos y de las columnas `evidence_id, evidence_metadata, cleanup_attempts, last_cleanup_attempt_at`.
   **ADVERTENCIA**: el drop de `evidence_id` elimina el vínculo verificable de los intentos consumidos post-0097 (las EVIDENCIAS —datos válidos— no se tocan JAMÁS); los intentos con metadata pierden su copia canónica. Nada de esto borra evidencias ni objetos.
4. Registrar la reversión (`supabase migration repair --status reverted 0097`) SOLO si se usa la CLI para el estado.
5. Sin `db reset` en ningún caso.

## 33. Checklist final de revisión humana
1. `npm ci && npm run test:all` → verde. 2. `npm run test:textiles-rls-t9e2` (staging) → 14/14. 3. `npm run test:textiles-rls-multitenant` → 17/17. 4. `npm run dev`: subir un PDF real (Network → PUT a supabase.co) y verificar en BD `status='consumed'` + `evidence_id` del intento. 5. Renombrar un PNG a `.pdf` y subirlo → rechazo por contenido. 6. Doble clic en finalizar → una sola evidencia. 7. `npx tsx scripts/cleanup-textile-upload-intents.ts` → dry-run con conteos. 8. Con un segundo usuario de la misma organización: no ve el intento del primero (SELECT) ni puede finalizarlo. 9. `select policyname from pg_policies where tablename='textile_evidence_upload_intents'` → solo `textile_upload_intents_select`. 10. ZIP sin `.env*`, `node_modules`, `.next`, `.git`, `tsconfig.tsbuildinfo` ni credenciales.
