# Q0_QUALITY_SCHEMA_MAPPING

**Sprint:** Q0 — Technical Discovery & Schema Mapping
**Fecha:** 2026-08-18
**Contraste:** inventario lógico del baseline (§21, §35 MDR-01…MDR-50) frente al esquema real.

**Clasificación usada:** REUTILIZAR · EVOLUCIONAR · CREAR · ADAPTAR · DEPRECAR · POSPONER ·
`DESCONOCIDO / REQUIERE VALIDACIÓN`

> **Regla aplicada (Baseline §21):** *"El siguiente es el universo lógico objetivo, no una
> instrucción para crear todas las tablas de inmediato."* Este mapeo identifica reutilización y
> evita duplicación; **no** es una lista de tablas a crear.

---

## 1. Resumen ejecutivo del mapeo

| Clasificación | Nº de objetivos lógicos | Comentario |
|---|---|---|
| REUTILIZAR | 14 | Fundación de plataforma, comercial, storage, autorización |
| EVOLUCIONAR | 9 | TrazaDocs, normativa, evidencias, bitácora |
| CREAR | ~120 | Todos los dominios Quality, automatización, IA |
| ADAPTAR | 5 | PCR/Textiles como fuentes referenciadas |
| DEPRECAR | 0 | Nada del repositorio debe deprecarse por Quality |
| POSPONER | ~45 | IA, coherencia, workflow libre, dominios tardíos |

La lectura corta: **la capa 1 del baseline está resuelta, la capa 3 está a medias, y las capas 4,
5, 6 y 7 están vacías.**

---

## 2. Capa 1 — Plataforma (Baseline §21.1)

| Objetivo lógico | Equivalente real | Clasificación |
|---|---|---|
| `organizations` | `public.organizations` | **REUTILIZAR** |
| `auth.users` | `auth.users` (Supabase) | **REUTILIZAR** |
| `profiles` | `public.profiles` | **REUTILIZAR** |
| `organization_memberships` | `public.memberships` | **REUTILIZAR** |
| `plans` | `plan_definitions` + `plan_limits` | **REUTILIZAR** |
| `subscriptions / entitlements` | `organization_subscriptions` + `organization_modules` | **REUTILIZAR** (con la deuda B-3) |
| `storage` | 3 buckets privados + `storage_upload_intents` + `storage_orphan_candidates` | **REUTILIZAR** |

Añadidos reales del repositorio que el baseline no enumera pero que Quality debe usar:

| Componente | Clasificación |
|---|---|
| `platform_staff` + `is_platform_staff()` / `is_platform_superadmin()` | **REUTILIZAR** |
| `is_org_member()` / `has_org_role()` / `is_org_admin()` | **REUTILIZAR** |
| `resolve_organization_module_access()` | **REUTILIZAR** |
| `organization_effective_plan_code()` | **REUTILIZAR** |
| `set_updated_at()` / `force_created_by()` / `prevent_organization_id_change()` / `forbid_mutation()` | **REUTILIZAR** |
| `safe_uuid()` | **REUTILIZAR** |
| Catálogo canónico `lib/modules/catalog.ts` (ya contiene `quality`) | **EVOLUCIONAR** — cambiar `coming_soon` → `functional` cuando corresponda |

**MDR-02 se cumple sin esfuerzo:** la plataforma ya ofrece todo lo que el baseline pide reutilizar.

---

## 3. Capa de autorización (§19.2, MDR-34)

**Brecha de modelo.** El baseline exige:

```text
AUTORIZACIÓN = ROL + CAPACIDAD + ALCANCE
```

El repositorio implementa hoy **ROL** únicamente, con tres roles fijos por organización
(`admin`, `quality`, `consultant`) y unicidad `(organization_id, user_id)`. No existen
capacidades (`document.approve`, `supplier.evaluate`, `risk.accept`) ni alcances (por proceso,
sede o unidad).

| Objetivo | Clasificación |
|---|---|
| Rol | **REUTILIZAR** |
| Capacidad (`capabilities`) | **CREAR** |
| Alcance (`scopes`) | **CREAR** — pero ver DR-03 |
| Compatibilidad con los 3 roles actuales | **ADAPTAR** — el Maestro §20 exige no romper compatibilidad sin migración |

**Nota de riesgo:** el rol `quality` ya existe en `roles` con el significado *"Responsable de
calidad"* del módulo PCR. Al llegar Trazaloop Quality, ese nombre pasa a ser ambiguo (¿rol de
empresa o módulo?). **No debe renombrarse** (Maestro §77, MDR-38: no renombrar destructivamente
identificadores técnicos por estética). Debe documentarse la ambigüedad. → **DR-03**.

---

## 4. Capa 3 — Motores transversales

### 4.1 Documentos (§21.4)

Detalle completo en `Q0_TRAZADOCS_REUSE_ANALYSIS.md`.

| Objetivo lógico | Equivalente real | Clasificación |
|---|---|---|
| `document_identities` | `trazadoc_documents` (identidad y revisión mezcladas) | **EVOLUCIONAR** |
| `document_revisions` | `trazadoc_document_versions` (snapshot por transición) | **EVOLUCIONAR** |
| `document_contents` | `trazadoc_document_sections` | **REUTILIZAR** |
| `document_files` | campos dentro de `trazadoc_file_documents` | **EVOLUCIONAR** |
| `document_workflows` | — | **CREAR** |
| `document_approvals` | `approved_by/at` (actor único) | **CREAR** |
| `document_templates` | `trazadoc_blueprints` | **EVOLUCIONAR** (versionar) |
| `document_template_revisions` | — | **CREAR** (D-11, MDR-15) |
| `document_process_links` | — | **CREAR** (POSPONER hasta que existan procesos) |
| `document_activity_links` | — | **CREAR** (POSPONER) |
| `quality_records` | — | **CREAR** |
| `external_documents` (+ versiones) | — | **CREAR** |
| `quality_documents` | — | **NO CREAR** — prohibido por §34 y D-16 |

### 4.2 Evidencias (§21.2, §23)

**Colisión arquitectónica principal del repositorio.**

Existen **dos** sistemas de evidencia paralelos (`evidences`/`evidence_links` y
`textile_evidences`/`textile_evidence_links`), con modelos distintos. El baseline exige **uno solo,
transversal** (MDR-46, MDR-12, §23).

| Objetivo lógico | Situación | Clasificación |
|---|---|---|
| `quality_evidence_refs` | Dos motores existentes, ninguno transversal | **EVOLUCIONAR** — no crear un tercero |
| Enlace polimórfico | `evidence_links.target_type` es **enum cerrado** de 10 valores; `textile_evidence_links.entity_type` es text+CHECK de 11 | **EVOLUCIONAR** |
| Referencia en lugar de copia (MDR-12) | Ya se practica dentro de cada módulo | **REUTILIZAR** el principio |
| Ciclo de subida por intent | `storage_upload_intents` + verificación física + finalización server-only | **REUTILIZAR** |

**Advertencia explícita:** crear `quality_evidence_refs` como tercer sistema sería el error más
caro de todo el proyecto. Habría tres modelos de evidencia, tres ciclos de vigencia y tres
contabilidades de cuota, y el baseline entero se apoya en que la evidencia sea transversal.
→ **DR-07**, la decisión de arquitectura más importante que Q0 deja abierta.

El modelo textil es el más maduro (vigencia con inicio y fin, flujo de revisión con actor y fecha,
emisor, metadatos físicos) y debe ser la **base de la unificación**, no el punto de partida CPR.

### 4.3 Relaciones semánticas (§24)

| Objetivo | Situación | Clasificación |
|---|---|---|
| `quality_relations` | No existe nada equivalente | **CREAR** |
| Relaciones críticas por FK/bridge | Ya es la práctica dominante (FK compuestas) | **REUTILIZAR** el principio |

MDR-13 exige el híbrido: FK normalizada para integridad crítica, grafo flexible para relaciones
secundarias. El repositorio hoy es 100 % FK, lo cual es la mitad correcta.

### 4.4 Eventos, automatización, alertas, tareas, workflow (§21.13–21.15, §26, §27)

**Vacío completo.** Verificado: no existe ninguna tabla de eventos, reglas, ejecuciones,
programaciones, alertas, notificaciones, tareas ni workflow.

| Objetivo lógico | Clasificación |
|---|---|
| `quality_events` | **CREAR** |
| Transactional Outbox (MDR-28) | **CREAR** |
| `quality_automation_rules` (+ versiones, triggers, acciones, runs) | **CREAR** — POSPONER más allá del primer corte |
| `quality_schedules` | **CREAR** — POSPONER |
| `quality_alerts` + `quality_alert_events` | **CREAR** |
| `quality_notifications` (+ entregas, preferencias) | **CREAR** — POSPONER (no hay email saliente hoy) |
| `quality_tasks` + `quality_task_events` | **CREAR** |
| `quality_workflow_definitions` (+ versiones, pasos, transiciones, instancias) | **CREAR** — POSPONER |

**Advertencia sobre `audit_log`:** es tentador tratarlo como el motor de eventos porque ya emite
`organization_created`, `organization_module_demo_started`,
`organization_module_access_changed`, `platform_staff_added`, `platform_organization_created`.
**No lo es.** Le faltan `event_type` tipado, `schema_version`, `dedupe_key`, `occurred_at`
separado de `changed_at`, y sobre todo consumidores. Además mezcla auditoría técnica con negocio,
lo que MDR-35 prohíbe.

Clasificación: `audit_log` **se REUTILIZA como audit trail técnico** y **se CREA `quality_events`
aparte** como motor de eventos de negocio. No se deprecará ni se migrará.

**AT-35 aplicable desde ya:** el MVP usa automatizaciones parametrizadas seguras antes que un
constructor no-code libre.

---

## 5. Capa 4 — Dominios Quality (§21.3, §21.5–21.12)

**Todo CREAR.** No existe ni una sola de estas entidades.

| Bloque | Objetivos | Clasificación | Prioridad |
|---|---|---|---|
| **Terceros** | `quality_external_parties` (+ roles, contactos, sedes) | **CREAR** | Alta — es la raíz de proveedores y clientes |
| **Procesos** | mapas, versiones, grupos, nodos, procesos, interacciones, flujos, etapas, actividades, aristas, decisiones | **CREAR** | Alta — es la columna vertebral (§40) |
| **Personas** | unidades, cargos, versiones, funciones, asignaciones, personas, competencias, evaluaciones, desarrollo, formación, conocimiento, lecciones | **CREAR** | Media |
| **Estrategia y desempeño** | contexto, partes interesadas, políticas, objetivos, indicadores, fuentes, metas, mediciones, linaje, eventos de desempeño | **CREAR** | Media |
| **Proveedores** | perfiles, categorías, alcances, criticidad, requisitos, documentos, selección, aprobación, evaluación, reevaluación, incidentes, desarrollo | **CREAR** | Media |
| **Clientes** | perfiles, segmentos, programas, plantillas de encuesta, versiones, campañas, respuestas, metodologías, resultados, retroalimentación | **CREAR** | Baja |
| **Riesgos** | metodologías, escalas, riesgos, causas, consecuencias, valoraciones, controles, efectividad, señales, tratamiento, oportunidades | **CREAR** | Media |
| **Casos y acciones** | casos, detalle de NC, análisis de causa, hipótesis, causas, acciones, orígenes, dependencias, actualizaciones, eficacia, eventos | **CREAR** | **Alta** — núcleo transversal del que depende Audit |
| **Auditorías** | programas, auditorías, alcances, criterios, equipo, agenda, muestras, notas, hallazgos, informes | **CREAR** | Media — después de Casos |
| **Revisión por la dirección** | revisiones, participantes, entradas, agenda, discusiones, decisiones, vínculos | **CREAR** | Baja |
| **Coherencia** | reglas, ejecuciones, hallazgos | **CREAR** | **POSPONER** |
| **IA** | capacidades, ajustes, prompts, versiones, ejecuciones, fuentes, insights, propuestas | **CREAR** | **POSPONER** |

**Precisiones sobre entidades concretas:**

- **`quality_positions` (Cargo)** es prerrequisito de D-17, MDR-33 y PC-03. Hoy toda
  responsabilidad apunta a `profiles` (persona/usuario). Sin Cargo, el SGC hay que reescribirlo
  cada vez que alguien cambia de puesto (Maestro §28). **Debe existir antes** de que los
  documentos migren su `owner_id`.
- **`quality_people` ≠ `profiles`** (PC-05, Maestro §27): una persona puede existir en Quality sin
  cuenta de usuario. `profiles` **no** debe reutilizarse como tabla de personas.
- **`quality_external_parties`** debe nacer transversal (MDR-11): proveedor y cliente son **roles**
  de una misma identidad. Nótese que ya existen dos tablas de proveedor por módulo —`suppliers`
  (PCR) y `textile_suppliers` (Textiles)— que **no deben absorberse** sino mapearse mediante
  `quality_source_links` (§30, MDR-32, MDR-45). El baseline prohíbe expresamente
  `separate_supplier_master` / `separate_customer_master` **dentro de Quality**; las tablas
  operativas de PCR y Textiles son otra cosa y se conservan.

---

## 6. Capa normativa (§29, §21.18)

| Objetivo lógico | Equivalente real | Clasificación |
|---|---|---|
| `quality_standards` | `frameworks` | **EVOLUCIONAR** |
| `quality_standard_editions` | `frameworks.version_label` (colapsado) | **EVOLUCIONAR** — separar edición |
| `quality_standard_requirements` | `requirements` (jerárquico, con `parent_id`) | **EVOLUCIONAR** |
| `quality_requirement_mappings` | — | **CREAR** |

`frameworks` ya modela versión (`unique (code, version_label)`), organismo emisor
(`standard_body`), fecha de vigencia (`effective_date`) e `is_active`. `requirements` es
jerárquico con unicidad por marco.

Es el objeto lógico del baseline **mejor cubierto por el repositorio**. La brecha real es que
norma y edición comparten tabla, y que **no existe la capa de mapeo**: ninguna tabla relaciona hoy
un requisito con un proceso, documento, riesgo o evidencia.

**MDR-31 / D-30 / §4.3 deben respetarse desde el primer día:** un mapeo indica *relacionado /
soporta / evidencia*, **nunca** conformidad automática. El repositorio ya demuestra esta
disciplina en `traceability_exercises` (§3.2 de `Q0_AUDIT_REUSE_ANALYSIS.md`).

**Prohibido crear** `iso_clause_4_data`, `iso_clause_5_data`, … (§34, MDR-01, DA-01).

---

## 7. Integración con PCR y Textiles (§30, MDR-32, Maestro §64)

| Objetivo lógico | Clasificación |
|---|---|
| `quality_source_links` | **CREAR** |
| `quality_integration_connections` | **CREAR** — POSPONER |
| `quality_external_entity_mappings` | **CREAR** — POSPONER |
| Tablas de dominio PCR/Textiles | **ADAPTAR** — referenciadas, nunca duplicadas |

Regla que Quality debe respetar sin excepción (Maestro §64): *"Quality no debe copiar toda la
genealogía del lote. Debe referenciar el objeto fuente."*

El repositorio **ya practica** la separación por contratos: PCR y Textiles no comparten tablas
entre sí, y TrazaDocs los sirve a ambos por `module_key` sin acoplarse a ninguno. Es una base
sana para que Quality entre como cuarto consumidor.

---

## 8. Contraste con las 50 decisiones MDR

| Decisión | Estado en el repositorio |
|---|---|
| MDR-01 dominios, no numerales ISO | Pendiente (no hay Quality), pero nada lo contradice |
| MDR-02 reutilizar primitivas | **Cumplido y disponible** |
| MDR-03 `organization_id` explícito | **Cumplido** (65 de 87 tablas; las 22 restantes son catálogos globales justificados) |
| MDR-04 RLS ≠ autorización funcional | **Cumplido** (RLS + guards de servidor + validación en actions) |
| MDR-05 códigos de negocio no son PK | **Cumplido** (UUID en todas las tablas) |
| MDR-06 no borrado físico de históricos | **Cumplido** (`DELETE` omitido; `ON DELETE RESTRICT`) |
| MDR-07 tiempo de sistema ≠ vigencia | **NO cumplido** — no existe `effective_from`/`effective_to` en ninguna tabla |
| MDR-08 identidad + revisión inmutable | **Parcial** — TrazaDocs se acerca; ver §4.1 |
| MDR-09 relacional + historial append-only | **Cumplido** |
| MDR-10 JSONB no sustituye relaciones críticas | **Cumplido** — JSONB solo en snapshots y diffs |
| MDR-11 proveedor y cliente comparten identidad | **No aplica todavía** — CREAR |
| MDR-12 evidencia por referencia | Parcial — se practica dentro de cada módulo |
| MDR-13 FK fuerte + grafo semántico | **Mitad** — FK sí, grafo no |
| MDR-14 etapas como entidades | No aplica todavía |
| MDR-15 registro conserva revisión de plantilla | **NO cumplido** — blueprints sin versionar |
| MDR-16 listado maestro como proyección | **Cumplido** (`v_trazadoc_document_master`) |
| MDR-17 ocupación de cargo como asignaciones históricas | No aplica todavía |
| MDR-18 fórmulas en DSL seguro, nunca SQL de tenant | No aplica todavía — **invariante a preservar** |
| MDR-19 correcciones preservan el original | **Cumplido** en el espíritu (append-only) |
| MDR-20 aprobación por alcance de proveedor | No aplica todavía |
| MDR-21 tratamiento anónimo estructural | No aplica todavía |
| MDR-22 identidad única de Oportunidad | No aplica todavía |
| MDR-23 supertipo + especialización para casos | No aplica todavía |
| MDR-24 acciones con múltiples orígenes (N:M) | No aplica todavía — **decidir desde el diseño inicial** |
| MDR-25 hallazgo enlaza a un caso formal | No aplica todavía |
| MDR-26 entradas de revisión con referencia + snapshot | Patrón ya disponible (`audit_dossiers`) |
| MDR-27 workflow ≠ instancia ≠ tarea | No aplica todavía |
| MDR-28 outbox transaccional | **No existe** |
| MDR-29 coherencia determinista vs. IA distinguible | No aplica todavía |
| MDR-30 no persistir razonamiento del modelo | No aplica todavía |
| MDR-31 normas como capa de mapeo versionada | **Parcial** — `frameworks`/`requirements` sí, mapeo no |
| MDR-32 integración por mapeos, no duplicación | **Cumplido** entre módulos existentes |
| MDR-33 responsabilidad al cargo, actos a la persona | **NO cumplido** — no existe Cargo |
| MDR-34 rol + capacidad + alcance | **Parcial** — solo rol |
| MDR-35 audit trail técnico ≠ historial de negocio | **NO cumplido** — `audit_log` los mezcla |
| MDR-36 preferir FK a versión inmutable sobre snapshot | Parcial — se usan snapshots donde corresponde |
| MDR-37 vistas derivadas no duplican maestros | **Cumplido** |
| MDR-38 sin renombrado destructivo | **Cumplido y declarado** como norma |
| MDR-39 orden por grafo de dependencias | Ver `Q0_IMPLEMENTATION_DEPENDENCY_GRAPH.md` |
| MDR-40 cambios estructurales con solicitud e impacto | **No existe** |
| MDR-41 ajustes simples ≠ políticas versionadas | No aplica todavía |
| MDR-42 relaciones validan misma organización | **Cumplido de forma ejemplar** (FK compuesta) |
| MDR-43 versiones publicadas preservan revisores | Parcial — un solo aprobador |
| MDR-44 consulta por fecha efectiva | **NO cumplido** — depende de MDR-07 |
| MDR-45 sistemas externos conservan sus IDs | **Cumplido** en el espíritu |
| MDR-46 acciones/evidencia/workflow/eventos/alertas transversales | **NO cumplido** — evidencia duplicada; el resto no existe |
| MDR-47 dato derivado de IA no es oficial sin validación | No aplica todavía |
| MDR-48 fallos de integración separados de eventos de calidad | Patrón ya presente (`delete_failed` separado) |
| MDR-49 decisiones formales append-only | **Cumplido** donde aplica |
| MDR-50 preservar Zero Duplicate y Capture Once | **Riesgo** — la duplicación de evidencia lo contradice hoy |

### 8.1 Las cuatro brechas transversales que condicionan todo

1. **MDR-07 + MDR-44 — vigencia de negocio.** Ninguna tabla tiene `effective_from`/`effective_to`.
   Sin esto, *"¿qué era válido el 14 de marzo?"* no tiene respuesta. Afecta a documentos,
   auditorías, revisión por la dirección e IA temporal.
2. **MDR-33 — Cargo.** Toda responsabilidad apunta hoy a una persona. Sin Cargo, el SGC se
   reescribe con cada cambio de personal.
3. **MDR-46 + MDR-50 — evidencia transversal.** Ya hay dos motores; un tercero rompería el
   principio fundacional.
4. **MDR-35 — separación de historiales.** `audit_log` mezcla técnica y negocio.

Estas cuatro son **decisiones de diseño previas al primer corte vertical**, no refinamientos
posteriores. Todo lo que se construya antes de resolverlas habrá que rehacerlo.

---

## 9. `DESCONOCIDO / REQUIERE VALIDACIÓN`

| Punto | Motivo |
|---|---|
| Estado real del esquema en Supabase | Q0 no se conectó. Puede haber objetos creados fuera de migración (0015 lo contempla para políticas de Storage) → **DR-01** |
| Migraciones 0007–0014 | Ausentes del repositorio; se asume que nunca existieron, sin confirmar → **DR-01** |
| `ACTIVE_ORG_COOKIE_SECRET` en producción | No verificable desde el repositorio → **DR-02** |
| Volumen real de datos por organización | Condiciona si las proyecciones deben ser vistas o vistas materializadas (§33) |
| Si existe algún cliente con `module_code='docs'` activo | Determina el impacto de formalizar TrazaDocs como motor transversal |
| Interpretación normativa ISO 9001:2026 | El Maestro §83/§84 exige verificar la edición vigente en fuentes oficiales antes de implementar comportamiento normativo |
