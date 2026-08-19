# Q0_DATABASE_SCHEMA_INVENTORY

**Sprint:** Q0 — Technical Discovery & Schema Mapping
**Fecha:** 2026-08-18
**Fuente:** `supabase/migrations/*.sql` (102 archivos, 29.758 líneas)
**Alcance:** inventario derivado del CÓDIGO de migración, no de una conexión a la base.

> **Advertencia de método.** Este inventario refleja lo que las migraciones **declaran**. No se
> conectó a Supabase (Q0 no toca entornos). Antes de implementar debe confirmarse contra el
> esquema real que todas las migraciones están aplicadas y que no existen objetos creados fuera
> de migración (p. ej. políticas de Storage creadas desde el Dashboard, algo que 0015 contempla
> explícitamente como posibilidad). → Decisión requerida **DR-01**.

---

## 1. Cifras globales

| Objeto | Cantidad |
|---|---|
| Migraciones | 102 |
| Líneas SQL | 29.758 |
| Tablas (`public`) | **87** |
| Vistas | 33 |
| Funciones | 147 |
| Triggers | 297 |
| Políticas RLS | 291 |
| Bloques `security definer` | 138 |
| Enums | 6 |
| Buckets de Storage | 3 |

**Numeración:** `0001`–`0110` con un único hueco, `0006 → 0015`. Las migraciones 0007–0014 no
existen en el repositorio. No es un error de aplicación: la secuencia simplemente saltó.
Verificar en el entorno real que no hay migraciones aplicadas ausentes del repositorio (DR-01).

---

## 2. Cobertura de RLS — verificación completa

Se compararon las 87 tablas creadas contra las 87 sentencias `enable row level security`:

```text
tablas creadas: 87
tablas con RLS: 87
tablas sin RLS: (ninguna)
RLS sobre tablas no creadas aquí: (ninguna)
```

**Cobertura: 100 %.** Es un resultado poco común y debe preservarse como invariante en Quality.

---

## 3. Tablas por dominio

### 3.1 Plataforma y tenencia (11)

`organizations` · `profiles` · `memberships` · `roles` · `modules` · `organization_modules` ·
`sites` · `platform_staff` · `team_invitations` · `audit_log` · `user_legal_acceptances`

### 3.2 Comercial (4)

`plan_definitions` · `plan_limits` · `organization_subscriptions` · `subscription_plan_history`

### 3.3 Normativo (2)

`frameworks` · `requirements`

### 3.4 Documental — TrazaDocs (8)

`trazadoc_blueprints` · `trazadoc_blueprint_sections` · `trazadoc_documents` ·
`trazadoc_document_sections` · `trazadoc_document_versions` · `trazadoc_status_history` ·
`trazadoc_file_documents` · `trazadoc_file_document_versions`

### 3.5 Evidencias (2 + 2 textiles)

`evidences` · `evidence_links` · `textile_evidences` · `textile_evidence_links`

### 3.6 PCR — catálogo, trazabilidad y cálculo (17)

`product_families` · `products` · `materials` · `material_classifications` · `suppliers` ·
`customer_requirements` · `customer_requirement_links` · `input_batches` · `production_orders` ·
`batch_consumption` · `output_batches` · `output_batch_consumption` · `batch_composition` ·
`recycled_content_calculations` · `calculation_methodologies` · `traceability_exercises` ·
`audit_dossiers`

### 3.7 Diagnóstico (4 + 4 textiles)

`diagnostics` · `diagnostic_sections` · `diagnostic_questions` · `diagnostic_answers` ·
`textile_diagnostics` · `textile_diagnostic_sections` · `textile_diagnostic_questions` ·
`textile_diagnostic_answers`

### 3.8 Textiles — dominio (20)

`textile_suppliers` · `textile_materials` · `textile_components` · `textile_processes` ·
`textile_outsourced_processes` · `textile_fiber_types` · `textile_collections` ·
`textile_products` · `textile_references` · `textile_reference_materials` ·
`textile_reference_components` · `textile_reference_fiber_composition` · `textile_input_lots` ·
`textile_production_orders` · `textile_order_consumptions` · `textile_order_process_steps` ·
`textile_output_lots` · `textile_technical_passports` · `textile_technical_passport_share_links` ·
`textile_evidence_upload_intents`

### 3.9 Circularidad textil (4)

`textile_circularity_methodologies` · `textile_circularity_criteria` ·
`textile_circularity_assessments` · `textile_circularity_answers`

### 3.10 Almacenamiento y contabilidad (2)

`storage_upload_intents` · `storage_orphan_candidates`

### 3.11 Soporte, importación y legal (7)

`support_tickets` · `support_ticket_messages` · `support_ticket_status_history` ·
`import_jobs` · `import_job_rows` · `implementation_feedback` · `legal_documents`

---

## 4. Tablas sin `organization_id` (22) — todas justificadas

| Tabla | Naturaleza |
|---|---|
| `organizations` | Es el tenant |
| `profiles` | Identidad de usuario (transversal) |
| `platform_staff` | Capa de plataforma, deliberadamente fuera de `memberships` |
| `user_legal_acceptances` | Aceptación por persona |
| `roles`, `modules` | Catálogos globales |
| `plan_definitions`, `plan_limits` | Catálogo comercial global |
| `frameworks`, `requirements` | Catálogo normativo global |
| `material_classifications`, `calculation_methodologies` | Catálogos de dominio global |
| `diagnostic_sections`, `diagnostic_questions` | Banco de preguntas global |
| `textile_diagnostic_sections`, `textile_diagnostic_questions` | ídem |
| `textile_circularity_methodologies`, `textile_circularity_criteria` | Metodología global |
| `trazadoc_blueprints`, `trazadoc_blueprint_sections` | Estructuras sugeridas globales |
| `textile_fiber_types` | **Híbrida** — ver nota |
| `legal_documents` | Documentos legales de plataforma |

**Nota sobre `textile_fiber_types`:** nació global (0073) y en 0093 se le añadió
`organization_id` **nullable** con el patrón `NULL = catálogo base / NOT NULL = fibra
personalizada de esa empresa`, índice único parcial por `(organization_id, lower(name))`, RLS
`organization_id is null or is_org_member(organization_id)` y un trigger que protege las filas
globales. **Es el patrón de referencia** para cualquier catálogo de Quality que deba admitir
extensiones por empresa (metodologías de riesgo, competencias, categorías de proveedor).

---

## 5. Enums

Solo 6, todos del núcleo original:

`membership_status` · `evidence_status` · `evidence_target_type` · `residue_type` ·
`diagnostic_status` · `diagnostic_answer`

**Patrón dominante: `text` + `CHECK`, no enum.** Todo lo posterior a 0020 usa restricciones
`CHECK` en lugar de tipos enumerados. Es una decisión consciente y coherente: un `CHECK` se
amplía con `alter table` sin los problemas de `alter type ... add value` en transacción.

Consecuencia directa para Quality: `evidence_target_type` es un **enum cerrado** con 10 valores
(`supplier`, `input_batch`, `production_order`, `output_batch`, `material`, `product`,
`product_family`, `document`, `requirement`, `site`). Cualquier intento de reutilizar
`evidence_links` para entidades de Quality obligaría a extender ese enum.
→ Ver `Q0_QUALITY_SCHEMA_MAPPING.md` §5.

---

## 6. Vistas (33)

Todas con `security_invoker = true` salvo la excepción documentada.

| Grupo | Vistas |
|---|---|
| Plataforma | `v_platform_organizations`*, `v_platform_organization_members`, `v_platform_organization_invitations`, `v_platform_support_ticket_summary` |
| Planes y uso | `v_organization_plan_usage`, `v_organization_module_usage`, `v_organization_onboarding_status` |
| TrazaDocs | `v_trazadoc_document_summary`, `v_trazadoc_blueprint_summary`, `v_trazadoc_document_master` |
| Trazabilidad PCR | `v_traceability_backward`, `v_traceability_forward`, `v_production_order_mass_balance`, `v_output_batch_completeness`, `v_output_batch_readiness`, `v_output_batch_support_gaps`, `v_output_batch_evidence_matrix` |
| Inventario | `v_input_batch_inventory`, `v_material_inventory`, `v_output_batch_inventory` |
| Contenido reciclado | `v_latest_batch_recycled`, `v_recycled_by_family`, `v_recycled_by_order`, `v_recycled_by_period`, `v_recycled_by_product`, `v_calculation_dossier`, `v_calculation_component_rows` |
| Implementación / flujo guiado | `v_implementation_dashboard`, `v_implementation_next_actions`, `v_guided_flow_dashboard` |
| Textiles | `v_textile_input_lot_balance`, `v_textile_output_lot_traceability_summary` |
| Soporte | `v_support_ticket_summary` |

`*` `v_platform_organizations` es la única excepción deliberada a `security_invoker`, documentada
en 0041.

**Relevante para el baseline §33:** el proyecto **ya practica** "vistas derivadas, no duplicadas".
`v_trazadoc_document_master` es exactamente el patrón de *Master Document List* que exige D-13, y
`v_organization_module_usage` es una proyección de uso, no una tabla de contadores. La disciplina
que Quality necesita para *Approved Supplier List* y *Open Actions* ya está establecida.

---

## 7. Funciones relevantes para Quality

### 7.1 Helpers de autorización — REUTILIZAR sin cambios

| Función | Propósito |
|---|---|
| `is_org_member(uuid)` | Membresía activa en la organización |
| `has_org_role(uuid, text[])` | Rol dentro de la organización |
| `is_org_admin(uuid)` | Atajo de `has_org_role(org, ['admin'])` |
| `shares_org_with(uuid)` | Comparte organización con un perfil |
| `is_platform_staff()` | Personal de plataforma activo |
| `is_platform_superadmin()` | Superadministrador |

Todas `stable`, `security definer`, `set search_path = public`, resueltas siempre contra
`auth.uid()` y **nunca contra un `user_id` recibido del cliente**. Los privilegios están
explícitamente revocados de `public`/`anon` y concedidos solo a `authenticated` (0016).

### 7.2 Guardas genéricos de integridad — REUTILIZAR

`set_updated_at()` · `force_created_by()` · `prevent_organization_id_change()` ·
`forbid_mutation()` · `audit_row_change()` · `log_event()` · `safe_uuid(text)`

### 7.3 Acceso comercial — REUTILIZAR

| Función | Propósito |
|---|---|
| `resolve_organization_module_access(uuid, text)` | Acceso EFECTIVO a un módulo, con vencimiento por fecha del servidor, sin cron |
| `organization_effective_plan_code(uuid)` | Plan efectivo org-wide derivado de módulos (`extra > full > demo`) |
| `get_organization_effective_plan(uuid)` | RPC de lectura para servidor |
| `set_organization_module_access(uuid, text, text)` | Gestión por superadministrador, auditada |
| `provision_new_organization_modules(uuid, uuid)` | Provisión Demo 48 h, idempotente |

### 7.4 Documental — EVOLUCIONAR

`change_trazadoc_document_status(uuid, text, text)` ·
`protect_trazadoc_document_section_integrity()` · `set_trazadoc_document_module_key()` ·
`finalize_trazadoc_file_document_initial_version_server(...)` ·
`replace_trazadoc_file_document_server(...)` · `discard_empty_trazadoc_file_document(...)`

### 7.5 Almacenamiento y cuota — REUTILIZAR

`storage_object_matches_upload_intent(text, text, text[])` · `resolve_storage_deletion(...)` ·
`register_storage_orphan(...)` · `resolve_cpr_upload_intent_object(...)` ·
`finalize_evidence_attachment_server(...)`

---

## 8. Bitácora: `audit_log`

```sql
audit_log (
  id, organization_id, actor_id, table_name, operation,
  event_type, row_id, diff jsonb, payload jsonb, changed_at
)
```

- `operation ∈ {INSERT, UPDATE, DELETE, EVENT}`.
- **Append-only real**: trigger `forbid_mutation()` bloquea `UPDATE` y `DELETE` incluso por vía
  privilegiada.
- Dos usos mezclados en una sola tabla:
  - **auditoría técnica de fila** (`audit_row_change()` → `diff`),
  - **eventos semánticos de negocio** (`log_event()` → `event_type` + `payload`).
- `log_event()` está **revocada para clientes** (0016): solo la invocan funciones
  `security definer`.
- RLS de lectura: `admin`/`quality` de la organización. Los eventos de plataforma se registran con
  `organization_id = NULL` y por tanto **no son legibles por ninguna empresa**.

**Colisión con el baseline (MDR-35, §31):** el baseline exige separar *historial empresarial de
negocio* y *audit trail técnico*. Hoy comparten tabla. Los eventos ya emitidos
(`organization_created`, `organization_module_demo_started`,
`organization_module_access_changed`, `platform_staff_added`, `platform_organization_created`)
son un embrión legítimo de motor de eventos, pero `audit_log` **no puede** convertirse en
`quality_events`: le faltan `event_type` tipado, `schema_version`, `dedupe_key`, `occurred_at`
separado de `changed_at`, y sobre todo un consumidor. → Ver `Q0_QUALITY_SCHEMA_MAPPING.md` §7.

---

## 9. Storage

| Bucket | Público | Creado en | Contenido |
|---|---|---|---|
| `evidences` | no | 0015 | Evidencias CPR y Textiles (separadas por 2.º segmento de ruta) |
| `trazadocs-documents` | no | 0058 | Documentos descargables controlados |
| `organization-assets` | no | 0049 | Logo e imagen de marca de la empresa |

**Convención de ruta:** `{bucket}/{organization_id}/...`. El primer segmento es siempre el
`organization_id` y sobre él operan las políticas.

**Evolución del modelo de escritura.** Merece registrarse porque es el patrón que Quality debe
heredar:

1. **0015** — política por rol + prefijo de organización.
2. **0016** — se introduce `safe_uuid()`: una ruta con primer segmento no-UUID **niega** en lugar
   de lanzar error.
3. **0099** — se separa `evidences_insert` en `_legacy` y `_textiles` por el 2.º segmento.
4. **0101** — se elimina la escritura por rol y se sustituye por **escritura ligada a un intent
   durable**: solo se puede escribir un objeto si existe un `storage_upload_intents` exacto
   (misma ruta, bucket, usuario, organización, propósito, `pending`, no vencido, con tamaño
   reservado) **y** el rol y el acceso comercial siguen vigentes en ese instante. `UPDATE` y
   `DELETE` directos quedan prohibidos por ausencia de política.

Este es el modelo más maduro del repositorio y **debe ser el punto de partida de la evidencia de
Quality**, no un diseño nuevo.

---

## 10. Contabilidad de almacenamiento

`storage_upload_intents` (reserva durable previa a subir) y `storage_orphan_candidates` (cola
contable de eliminación) implementan un ciclo poco habitual y muy correcto:

```text
referencia activa → pending_delete → retiro físico verificado → deleted (libera cuota)
                                   └→ delete_failed (SIGUE contando)
```

Un objeto cuya eliminación no se confirma **sigue consumiendo cuota**. Es la dirección segura.
La resolución es server-only (`resolve_storage_deletion` revocada a `authenticated`): un cliente
nunca puede "declarar eliminado" un objeto para liberar cuota.

---

## 11. Capa normativa existente

```sql
frameworks (id, code, name, version_label, standard_body, effective_date, is_active,
            unique (code, version_label))
requirements (id, framework_id, parent_id, code, title, description, order_index,
              unique (framework_id, code))
```

Dos tablas globales, jerárquicas (`parent_id`), con **versión ya modelada** en
`frameworks.version_label` y unicidad por `(code, version_label)`.

Es un mapeo muy cercano a lo que el baseline §29 pide como `quality_standards →
quality_standard_editions → quality_standard_requirements`, aunque colapsa norma y edición en una
sola tabla. **Candidato fuerte a EVOLUCIONAR**, no a duplicar. Lo que **no** existe es la capa de
mapeo (`quality_requirement_mappings`): hoy no hay ninguna tabla que relacione un requisito con
un proceso, documento, riesgo o evidencia.

---

## 12. Ausencias verificadas

Búsqueda explícita en las 102 migraciones, sin resultados:

| Concepto buscado | Resultado |
|---|---|
| `audits`, `audit_programs`, `audit_findings` | **no existe** |
| `findings`, `nonconformities`, `corrective_actions` | **no existe** |
| `actions`, `action_plans` | **no existe** |
| `cases` | **no existe** |
| tabla `*notification*` | **no existe** |
| tabla `*task*` | **no existe** |
| tabla `*workflow*` | **no existe** |
| tabla `*alert*` | **no existe** |
| tabla `*schedule*` / `*cron*` | **no existe** |
| tabla `*outbox*` | **no existe** |
| cualquier tabla `quality_*` | **no existe** |
| `positions`, `people`, `competencies` | **no existe** |
| `objectives`, `indicators`, `measurements` | **no existe** |
| `risks`, `controls` | **no existe** |
| `external_parties` | **no existe** |

`audit_dossiers` (0108) y `traceability_exercises` (0107) **no** son auditoría de gestión: son
artefactos de *preparación* para auditoría del módulo PCR (expediente y ejercicio de trazabilidad).
Ver `Q0_AUDIT_REUSE_ANALYSIS.md`.

Lo que el código llama "alertas" (`lib/domain/production-alerts.ts`) son **cálculos derivados de
UI** — por ejemplo, marcar una orden abierta más de 72 horas — sin persistencia, sin propietario,
sin ciclo de vida y sin deduplicación. No son objetos de atención en el sentido de AT-12.

---

## 13. Consecuencia para Quality

La base de datos ofrece a Quality una **fundación de tenencia, seguridad, comercial y
almacenamiento de calidad industrial** y **cero infraestructura de gestión**.

De los ~200 objetos lógicos del baseline §21, el repositorio cubre hoy de forma reutilizable la
capa 1 (plataforma) y parte de la capa 3 (documentos, evidencia parcial). Las capas 4, 5 y 6
—dominios Quality, automatización e IA— están enteramente por construir.

---

# Remote verification addendum

**Añadido:** 2026-08-18 (Sprint Q0.1)
**Fuente:** `supabase db dump --linked` contra `trazaloop-production` (`mvmpadeixomwkpxbnhky`).
**Nada de lo escrito arriba se ha reescrito.** Esta sección corrige y precisa; el texto original
se conserva tal como se redactó con evidencia únicamente local.

## Qué se confirmó sin cambios

- **87 tablas** — conjunto remoto **idéntico** al local.
- **33 vistas** — conjunto remoto **idéntico** al local.
- **RLS en 87/87 tablas**, confirmado en producción. La cobertura del 100 % es real, no solo
  declarada.
- **Cero objetos remotos no explicables por las migraciones** en las cinco categorías.
- 3 buckets con `storage.objects` bajo RLS.

## Correcciones de recuento

Las cifras de §1 se obtuvieron contando **sentencias** en las migraciones. El estado **final**
desplegado difiere en tres casos, y en todos la causa está en el método de conteo local, no en una
discrepancia con producción:

| Métrica | Dice §1 | Estado real desplegado | Explicación |
|---|---|---|---|
| Funciones | 147 | **146** | `guard_evidence_validation` se crea en 0019 y se **elimina en 0023**. Su ausencia es correcta. |
| Triggers | 297 | **295** en `public` (+1 en `auth.users`) | `on_auth_user_created` vive en `auth.users`, fuera del esquema volcado; `t_evidences_guard_validation` se eliminó en 0023. |
| Políticas | 291 | **253** en `public` + **9** en `storage.objects` | 291 era el bruto de sentencias `create policy`; 17 son de `storage.objects` y 21 fueron dropeadas y recreadas. Neto local 253 = remoto 253. |

## Precisión sobre §5 (numeración) y §12 (ausencias)

- El hueco **0007–0014 queda cerrado**: nunca existieron. Verificado en el historial remoto de
  migraciones y en Git (`--diff-filter=A` y `--diff-filter=D`: nunca añadidas, nunca borradas).
  La advertencia de §1 sobre confirmar migraciones ausentes queda satisfecha.
- Las **ausencias de §12 se confirman en producción**: ninguna tabla de auditoría de gestión,
  casos, acciones, eventos, alertas, tareas, workflow ni `quality_*` existe en el esquema
  desplegado.

## Confirmaciones nuevas de interés para Quality

- **`storage_upload_intents` tiene RLS activa y CERO políticas** en producción: denegación total
  por defecto. Ningún cliente puede leerla ni escribirla; solo las RPC server-only. Es el modelo a
  replicar para cualquier tabla de reserva de Quality.
- **`organization_modules` tiene una única política (`SELECT`)** en producción, confirmando que
  0100 retiró la escritura de `authenticated`.
- **No existe política de `DELETE` ni de `UPDATE`** sobre los buckets `evidences` ni
  `trazadocs-documents`.
- El módulo `quality` se confirma como placeholder no funcional por vía estructural: la columna
  `modules.is_functional` existe en producción con el `COMMENT` literal de 0100.

Detalle completo en `Q0_1_REMOTE_VERIFICATION.md`.
