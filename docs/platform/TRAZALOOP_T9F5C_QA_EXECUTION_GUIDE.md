# TRAZALOOP · T9F.5C · GUÍA DE EJECUCIÓN ADVERSARIAL EN SUPABASE QA

> Cómo ejecutar A01–A18 contra un proyecto Supabase **desechable** con migraciones reales,
> Auth real, RLS real, Storage real, roles reales, objetos físicos, concurrencia y limpieza completa.
>
> **Esta guía no fue ejecutada.** T9F.5B la deja preparada; T9F.5B.1 la amplía; T9F.5C la ejecuta.

---

## 0. Por qué esta ejecución es indispensable

T9F.5B implementó la corrección de A01–A08, A13 y A14, y sus pruebas locales están en verde. Eso **no** demuestra que los ataques estén cerrados.

Las pruebas locales son puras y estructurales: leen SQL y TypeScript. No ejecutan PostgreSQL, no evalúan políticas RLS, no suben ni descargan objetos y no comprueban grants reales. El propio arnés local del proyecto lo declara: *«aquí no hay RLS ni Storage físico»*.

En concreto, **nada** de lo local demuestra que:

- una política de Storage rechace de verdad un `upload` sin intent (A01, A02);
- `upsert` y `remove` fallen sobre un objeto real (A03, A04);
- `authenticated` no pueda ejecutar un finalizer server-only (A05);
- el tamaño físico leído coincida con lo que Storage reporta (A06);
- la firma binaria rechace contenido incompatible en un objeto real (A07);
- la revalidación de cuota se dispare tras un cambio de plan real (A08);
- el orden de triggers produzca el resultado esperado en el esquema real (A13);
- un archivo físico de 22 MB se acepte en Full y se rechace en Demo (A14).

Solo esta ejecución permite reclasificar un ataque como **PROTEGIDO**.

---

## 1. Requisitos previos

### 1.1 Proyecto desechable

Un proyecto Supabase **nuevo y desechable**, jamás staging ni producción. Todo su contenido debe poder destruirse. Recomendado: proyecto dedicado `trazaloop-qa-t9f5c`, eliminado al terminar.

La suite se niega a arrancar si la URL contiene `prod`, `production` o `staging`, y exige confirmación explícita por variable de entorno. Estos guardarraíles no sustituyen la comprobación manual: **verifica la URL antes de ejecutar**.

### 1.2 Entorno local

```bash
node -v            # la versión del proyecto
npm ci
npx supabase --version
```

### 1.3 Variables

`.env.local` en la raíz, **nunca** commiteado:

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref-qa>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key del proyecto QA>
SUPABASE_SERVICE_ROLE_KEY=<service role key del proyecto QA>
```

Y en la sesión de shell:

```bash
export T9F5_QA_CONFIRM=yes
```

`SUPABASE_SERVICE_ROLE_KEY` bypasea RLS por completo: solo debe existir en la máquina que ejecuta la suite y solo apuntando al proyecto QA.

---

## 2. Aplicación de las migraciones reales

```bash
supabase link --project-ref <ref-qa>
supabase db push          # aplica 0001 → 0101 en orden
```

La 0101 incluye la remediación T9F.5B. Es la **primera vez** que se aplica en cualquier entorno: es esperable encontrar errores de sintaxis o de dependencias que el análisis estático no puede detectar. Si `db push` falla, **detente y reporta**: no parchees sobre la marcha ni apliques fragmentos sueltos.

Verificación inmediata tras aplicar:

```sql
-- (1) Políticas de Storage: estado final esperado
select policyname, cmd, roles
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
 order by policyname;
```

**No deben existir:** `evidences_insert_legacy`, `trazadocs_documents_insert`, `trazadocs_documents_update`, `trazadocs_documents_delete`.
**Sí deben existir:** `evidences_insert_cpr`, `evidences_insert_textiles`, `trazadocs_documents_insert_intent`, `evidences_select`, `trazadocs_documents_select`.
**No debe existir ninguna** política `UPDATE` o `DELETE` sobre los buckets `evidences` y `trazadocs-documents`.

```sql
-- (2) Finalizers server-only: authenticated NO debe poder ejecutarlos
select has_function_privilege('authenticated',
  'public.finalize_evidence_attachment_server(uuid,uuid,bigint,text)', 'execute');          -- false
select has_function_privilege('authenticated',
  'public.finalize_evidence_attachment(uuid,bigint)', 'execute');                            -- false
select has_function_privilege('authenticated',
  'public.begin_cpr_storage_upload(text,uuid,text,bigint,text,integer,text)', 'execute');    -- true

-- (3) Topes por archivo (A14)
select public.cpr_upload_max_file_bytes('evidence','full');          -- 20971520
select public.cpr_upload_max_file_bytes('trazadoc_initial','demo');  -- 10485760
select public.cpr_upload_max_file_bytes('trazadoc_initial','full');  -- 26214400
select public.cpr_upload_max_file_bytes('trazadoc_replace','extra'); -- 26214400

-- (4) Triggers de límite intactos (A09/A10)
select count(*) from pg_trigger where tgname like 't\_%\_limit' escape '\';  -- 16
```

Si alguna comprobación no da el valor esperado, **la ejecución adversarial no debe empezar**: el esquema desplegado no coincide con el candidato.

---

## 3. Semillas mínimas

La suite crea sus propios fixtures (organizaciones, usuarios, membresías, modos de plan). Del catálogo global necesita:

- **`plan_definitions` y `plan_limits`** con demo/full/extra — los siembra la 0050.
- **`modules`** con `traceability_6632` y `textiles`.
- **Al menos un `trazadoc_blueprints` con `module_key = 'cpr'`** — imprescindible para A13.

```sql
select code from public.modules;
select code, storage_limit_bytes from public.plan_definitions order by code;
select count(*) from public.trazadoc_blueprints where module_key = 'cpr';  -- >= 1
```

Si no hay blueprint CPR, A13 no puede ejecutarse: siembra uno con las utilidades del proyecto antes de continuar.

---

## 4. Ejecución

```bash
export T9F5_QA_CONFIRM=yes
npm run test:t9f5-adversarial
```

La suite crea usuarios reales vía Auth Admin, inicia sesión real con cada uno y ejecuta **cada ataque con la sesión del usuario**, no con `service_role`. El cliente de servicio se usa solo para sembrar fixtures y para invocar las RPC server-only donde el escenario lo exige.

Salida esperada por escenario:

```
  PASS  A01 [CORREGIDO_T9F5B] Upload CPR directo sin intent
  ...
  PASS  A18 [REGRESION_T9F5A] Reutilización de idempotency key vencida

[T9F.5] Limpieza de fixtures QA…
[T9F.5] Limpieza completada (audit_log intacto).
[T9F.5] Resultado: 18 PASS / 0 FAIL de 18.
```

El proceso termina con código 1 si algún escenario falla, listando los ataques no cerrados.

---

## 5. Qué ejercita cada escenario

| ID | Operación real | Resultado seguro esperado |
|---|---|---|
| A01 | `upload()` a `evidences` en ruta CPR sin intent; después upload legítimo con intent | Rechazo por RLS; el legítimo permitido |
| A02 | `upload()` a `trazadocs-documents` sin intent; después con intent | Rechazo; el legítimo permitido |
| A03 | `upload(..., { upsert: true })` sobre objeto TrazaDocs vivo | Rechazo y tamaño físico sin cambios |
| A04 | `remove()` de objeto con fila viva | Rechazo o 0 objetos; el objeto sigue existiendo |
| A05 | Firma histórica; invocación del finalizer server-only por `authenticated`; finalize sin objeto | Los tres rechazados; sin referencia final |
| A06 | Reserva 1 MB + objeto físico 5 MB + finalize | **`OBJECT_SIZE_MISMATCH`** (política canónica: rechazo estricto); nunca se registra el tamaño pequeño |
| A06b | Reserva 1 MB + objeto físico 5 MB, **sin** finalize; luego consulta de uso y capacidad | El upload se rechaza, **o** el objeto se contabiliza por sus 5 MB reales. Prohibido: 5 MB físicos contabilizados como 1 MB con capacidad disponible como si ocupara 1 MB |
| A07 | Declarar PDF y subir bytes no-PDF | Rechazo por MIME; bytes disponibles para la firma |
| A08 | begin Extra 22 MB → degradar a Demo → finalize | Rechazo con causa **concreta**: `STORAGE_QUOTA_EXCEEDED` o `FILE_SIZE_INVALID`. Un `not_member` hace FALLAR la prueba (delataría el defecto de `auth.uid()`) |
| A09 | Dos INSERT concurrentes del último recurso | Exactamente 1 rechazo |
| A10 | INSERT directo por encima del límite | `RESOURCE_LIMIT_EXCEEDED` |
| A11 | UPDATE de `storage_path` y `size_bytes` | `PHYSICAL_FIELD_IMMUTABLE` |
| A12 | DELETE directo de fila de dominio | 0 filas o rechazo |
| A13 | Blueprint CPR + `module_key='textiles'`, CPR al límite | `RESOURCE_LIMIT_EXCEEDED` por CPR |
| A14 | 22 MB Demo / 22 MB Full con archivo físico **y finalize real** / 22 MB Extra / 26 MB Full / 22 MB evidencia CPR | Rechazo, permitido (fila con tamaño físico y ruta), permitido, rechazo, rechazo |
| A15 | `count_module_resource` de otra organización | `NULL` |
| A16 | `size_bytes NULL` sembrado y nuevo begin | `STORAGE_UNVERIFIABLE` |
| A17 | Intent cancelado con objeto subido | Sus bytes siguen contando |
| A18 | Reutilizar idempotency key vencida | Sin `unique_violation` |

### 5.1 · Flujo REAL de la aplicación (obligatorio, T9F.5B.1)

La suite ejercita las RPC y Storage directamente. Eso no basta: desde T9F.5B.1 el archivo va del navegador a Storage **sin atravesar ninguna Server Action**, y la verificación de firma binaria vive en la capa server. QA debe ejercer además el flujo real de producto:

1. **Adjunto de evidencia CPR** con un archivo de ~2 MB: begin → PUT directo → finalize. La evidencia debe quedar con `storage_path` y `size_bytes` reales.
2. **TrazaDocs Full de 22 MB**: begin → PUT directo → finalize. Debe completarse **sin** elevar `serverActions.bodySizeLimit`. Si falla con un error de tamaño de cuerpo, la migración de transporte no está activa.
3. **Reemplazo TrazaDocs**: begin → PUT a la ruta `v(n+1)` → finalize. La versión anterior debe seguir existiendo y contabilizada.
4. **Archivo con contenido incoherente** (extensión `.pdf`, MIME `application/pdf`, bytes que no son PDF, tamaño idéntico al reservado): la Server Action de finalize debe **rechazarlo por firma binaria**. Con tamaño y MIME coincidentes, solo la firma puede detectarlo — sin este paso, A07 no queda demostrado.
5. **Abandono**: begin → PUT → cerrar la pestaña sin finalizar. Los bytes deben seguir contabilizados hasta la resolución server-only.

**A07 tiene una parte que la suite no puede cubrir sola.** La verificación de firma binaria vive en la Server Action. La suite comprueba el contrato de la RPC y deja el objeto disponible. QA debe **además** ejercer el flujo real de la aplicación (`createEvidenceAction` y `uploadFileDocumentAction`) con un archivo cuyo contenido no corresponda a su extensión, y confirmar que se rechaza. Sin ese paso, A07 queda parcialmente demostrado.

---

## 6. Concurrencia

A09 ejecuta dos INSERT simultáneos con `Promise.all` sobre la misma sesión. Para una prueba más exigente, QA puede además:

1. Dos sesiones de usuario distintas de la misma organización compitiendo por el último recurso.
2. Dos `begin_cpr_storage_upload` simultáneos que juntos superen la cuota.
3. Dos `finalize` del **mismo** intent en paralelo: debe haber exactamente una finalización y ninguna duplicación.

El resultado esperado siempre es el mismo: la barrera está en PostgreSQL, no en la aplicación.

---

## 7. Limpieza

La suite limpia al terminar, incluso ante error: objetos de Storage, `storage_upload_intents`, `textile_evidence_upload_intents`, `storage_orphan_candidates`, versiones y documentos TrazaDocs, evidencias CPR y textiles, proveedores, `organization_modules`, membresías, organizaciones y usuarios de Auth.

**`audit_log` no se elimina nunca.** La bitácora es historia inmutable, también en QA.

Verificación posterior:

```sql
select count(*) from public.organizations where name like 't9f5\_%' escape '\';   -- 0
select count(*) from public.storage_upload_intents;                               -- 0 en proyecto limpio
select count(*) from storage.objects where name like '%t9f5\_%' escape '\';       -- 0
```

Si queda algo, límpialo manualmente antes de destruir el proyecto y **reporta el residuo**: una limpieza incompleta puede indicar que un borrado que debía funcionar no funcionó.

Al terminar: elimina el proyecto QA y rota cualquier clave que haya salido de él.

---

## 8. Criterio de aprobación

**19 PASS / 0 FAIL** (A01–A18 más A06b). Sin excepciones, sin escenarios omitidos, sin *skips*.

Además: las ocho verificaciones SQL de §2 y §2.1 en verde, y los cinco pasos del flujo real de §5.1 completados.

- Un FAIL en **A01–A08, A06b, A13 o A14** significa que la corrección **no cierra** ese ataque. No se aprueba.
- Un PASS de A08 cuyo mensaje de rechazo sea `not_member` **no es un PASS**: la suite ya lo trata como fallo, porque indicaría que el acceso se resolvió con `auth.uid()` bajo `service_role` y no con el actor real.
- Un FAIL en **A09–A12 o A15–A18** significa que la corrección **rompió** una protección existente. No se aprueba.
- Un error de fixture no es un PASS: si la suite no pudo montar el escenario, el ataque **no fue probado**.

Solo con 18/18 en verde puede T9F.5C reclasificar los ataques como PROTEGIDOS, y solo entonces tiene sentido plantear la aplicación de la 0101 en staging.

---

## 9. Registro del resultado

T9F.5C debe producir, como mínimo:

1. Salida completa de `supabase db push`.
2. Salida de las verificaciones SQL de §2.
3. Salida completa de la suite, escenario por escenario.
4. Para cada FAIL: escenario, mensaje real y evidencia.
5. Confirmación de limpieza y de destrucción del proyecto QA.
6. Matriz actualizada A01–A18 con su clasificación final.

Ningún ataque debe reclasificarse sin la salida real que lo respalde. Un resumen sin evidencia no es evidencia.

---

## 10. Lo que esta guía no cubre

- **Rendimiento.** El finalize descarga los bytes del objeto; con 25 MB conviene observar latencia y memoria, pero eso no forma parte del criterio de aprobación.
- **Antivirus.** La verificación de firma es estructural, no un escaneo de malware.
- **Objetos huérfanos preexistentes.** Un proyecto QA nuevo no los tiene; staging sí puede tenerlos por A01/A02 y requieren un barrido aparte antes de aplicar la 0101 allí.
- **`organization-assets`.** Fuera del alcance de la matriz A01–A18.
- **Aplicación en staging.** Decisión posterior, y solo tras 18/18 en verde.
