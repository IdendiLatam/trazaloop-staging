# PE-04B3 · Inventario real de almacenamiento de cliente

Levantado leyendo el esquema aplicado en local (0001→0163), no la documentación
previa. El brief advierte: «Do not assume PE-04A inventory was exhaustive». No
lo era: **el logo de empresa y las versiones de TrazaDocs no aparecían en la
misma contabilidad**, y la cuota que se aplica hoy no es de empresa sino de
módulo.

## 1. Buckets

| Bucket | Público | `file_size_limit` | Dueño de los bytes | ¿Cuota de cliente? |
|---|---|---|---|---|
| `evidences` | no | `null` | empresa (PCR y Textiles comparten bucket) | **sí** |
| `trazadocs-documents` | no | `null` | empresa | **sí** |
| `organization-assets` | no | `null` | empresa (logo) | **sí** |
| `tutorial-media` | no | `null` | **plataforma** (0159/0160) | **no** — contenido del producto, no del cliente |

## 2. Familias de archivo de cliente

Para cada familia: tabla que guarda los bytes, ruta, quién comprueba la cuota
hoy, si hay reserva atómica, qué pasa al borrar y qué pasa con las versiones.

### 2.1 Evidencias PCR — `evidences`
- Bytes: `evidences.size_bytes`; ruta `evidences.storage_path`; bucket `evidences`.
- Reserva: **sí** — `begin_cpr_storage_upload` crea un `storage_upload_intents`
  bajo `pg_advisory_xact_lock('module_storage:<org>/traceability_6632')`.
- Cuota comprobada: `plan_definitions.storage_limit_bytes` del **modo de acceso
  del módulo** contra `module_storage_snapshot(org, 'traceability_6632')`.
- Transporte: subida directa del navegador con sesión (`lib/storage/direct-upload.ts`),
  sujeta a la política INSERT ligada a intent (0101 §12). No se usa URL firmada
  a propósito (hallazgo 0099: una URL firmada autoriza sola y no pasa la política).
- Borrado: libera bytes al desaparecer la fila; el objeto pasa a
  `storage_orphan_candidates` si no se pudo retirar, y **sigue contando**.
- Versiones: un reemplazo es siempre un objeto nuevo (A03).

### 2.2 Documentos de archivo TrazaDocs — `trazadoc_file_documents`
- Bytes: `size_bytes`; ruta `storage_path`; bucket `trazadocs-documents`.
- Reserva, cuota y transporte: **idénticos a 2.1** (misma familia CPR,
  `module_code = 'traceability_6632'`).

### 2.3 Versiones históricas de TrazaDocs — `trazadoc_file_document_versions`
- Bytes: `size_bytes`; ruta `storage_path`; mismo bucket.
- **Contadas** por `module_storage_snapshot`. **NO contadas** por
  `v_organization_plan_usage` (la vista que alimenta la UI de plan y el
  `checkStorageAvailable` del logo). Primera incoherencia real: dos números de
  «uso» distintos para la misma empresa.

### 2.4 Evidencias Textiles — `textile_evidences`
- Bytes: `file_size_bytes`; ruta `file_path`; bucket `evidences`.
- Reserva: **sí** — `begin_textile_evidence_upload_v2`, lock
  `module_storage:<org>/textiles`, intents en `textile_evidence_upload_intents`.
- Cuota: `plan_definitions.storage_limit_bytes` contra
  `module_storage_snapshot(org, 'textiles')` — **un cupo aparte del de PCR**.
- Transporte: URL firmada (`lib/db/textiles-evidences.ts:783`). La barrera aquí
  es la reserva y la contabilidad de finalize, no la política de Storage.

### 2.5 Logo de empresa — `organizations.logo_size_bytes`
- Ruta `organizations.logo_storage_path` = `{org}/logo/logo.{ext}`; bucket
  `organization-assets`; `upsert: true`; tope de producto 2 MB
  (`MAX_LOGO_SIZE_BYTES`).
- Reserva: **NO HAY**. `uploadCompanyLogoAction` llama a `checkStorageAvailable`
  (una comprobación previa, no atómica) y sube.
- Cuota comprobada: `v_organization_plan_usage.storage_used_bytes` — que **no
  incluye versiones de TrazaDocs, ni intents reservados, ni huérfanos** — contra
  el límite legacy de `plan_definitions` traducido con el puente `free→demo`.
- **No aparece en `module_storage_snapshot`**: los bytes del logo son invisibles
  para las dos rutas que sí reservan. Un logo de 2 MB no le quita capacidad a
  PCR ni a Textiles.
- Borrado: `removeCompanyLogo` desvincula y borra; si el borrado falla no se
  registra huérfano.
- **Defecto encontrado**: la extensión forma parte de la ruta. Subir `logo.png`
  y después `logo.webp` deja el `logo.png` anterior en el bucket, sin fila que
  lo referencie y sin candidato huérfano. Bytes acumulados que nadie mide.

### 2.6 Contenido de tutoriales — `platform_tutorial_versions`
- Bucket `tutorial-media`, propiedad de la plataforma (0159/0160). **Fuera de la
  cuota de cliente, correctamente**: ni `v_organization_plan_usage` ni
  `module_storage_snapshot` lo miran. Se deja fuera también en PE-04B3.

### 2.7 Calidad, Construcción, importaciones
- Calidad **no tiene tabla de adjuntos propia con bytes**: sus documentos pasan
  por TrazaDocs (2.2/2.3).
- `import_jobs` no tiene columnas de almacenamiento (solo `filename`): las
  importaciones no ocupan Storage de cliente.

### 2.8 Código muerto con acceso de escritura
- `lib/db/trazadocs-master.ts:uploadFileDocumentFile` sube a
  `trazadocs-documents` **sin intent ni reserva** y no lo llama nadie
  (verificado en todo el repo). Es una puerta lateral latente: se retira en
  PE-04B3 y el guardia de bypass impide reintroducirla.

## 3. Las dos contabilidades que hoy conviven

| | `v_organization_plan_usage` | `module_storage_snapshot` |
|---|---|---|
| Alcance | empresa | **módulo** |
| Evidencias PCR | sí | sí |
| TrazaDocs documentos | sí | sí |
| TrazaDocs **versiones** | **no** | sí |
| Evidencias Textiles | sí | sí |
| **Logo** | sí | **no** |
| Reservas vivas | **no** | sí |
| Huérfanos | **no** | sí |
| Tamaño físico > declarado | **no** | sí (A06) |
| Plan del que sale el límite | `organization_subscriptions` con `coalesce(...,'demo')` | `plan_definitions` por modo de acceso del módulo |

Ninguna de las dos es la cuota que el negocio congeló en PE-04B2: **una sola
cuota compartida por empresa**. Hoy una empresa Full con PCR y Textiles dispone
de 500 MB *en cada módulo* más un logo que no descuenta de ninguno.

## 4. Consecuencias que PE-04B3 debe cerrar

1. Una sola función de uso, de alcance empresa, con todas las familias.
2. Un solo resolutor de cuota, leyendo `plan_revision_limits.storage_bytes`
   (recurso ya declarado con `scope = 'organization'` en 0162).
3. Una sola reserva atómica, con **un lock por empresa** para que PCR, Textiles
   y el logo compitan por el mismo cupo.
4. El logo deja de ser una puerta sin medir, y su cambio de extensión deja de
   abandonar bytes.
5. Se retira el puente `free→demo` del camino de almacenamiento.
