# Trazaloop Textil · Reutilización y diferenciación frente a Trazaloop CPR

> Sprint T0 — Solo documentación. Basado en el análisis del código real de CPR
> (sprint 10D: 69 migraciones, 21 archivos de server actions, consola de plataforma,
> TrazaDocs + maestro documental, planes Demo/Full/Extra, soporte, legal, onboarding).

## 1. Objetivo

> **Precisión T0.2 (DL-16)**: lo que el §3 llama "componentes CPR heredados" son en
> realidad **componentes de la plataforma Trazaloop** (auth, organizaciones, roles,
> planes, legal, soporte, consola, seguridad) que históricamente nacieron junto al
> módulo CPR. Textil no hereda "de CPR": comparte la plataforma con CPR. Lo que sí
> es de CPR — y no se copia — es su dominio (§6).

Fijar, con base en la arquitectura real de CPR, qué se **hereda**, qué se **adapta**,
qué se **crea nuevo** y qué **no se debe copiar**, para que Textil sea inspirado en
CPR sin ser una copia y sin ponerlo en riesgo.

## 2. Alcance

Decisión de reutilización por capa. El detalle de datos está en
`TEXTILES_DATA_MODEL_PROPOSAL.md`; el de TrazaDocs en `TEXTILES_TRAZADOCS_MODEL.md`.

## 3. Qué se hereda (se usa tal cual, sin cambios funcionales)

| Componente CPR | Evidencia en el código | Uso en Textil |
|---|---|---|
| Autenticación y sesión | `app/(auth)/*`, `lib/auth/require-session.ts` | Misma identidad y sesión; jamás login por módulo. |
| Organizaciones y membresías | `organizations`, `memberships`, `select-org`, `lib/auth/active-organization.ts` | Misma organización activa para ambos módulos. |
| Roles de equipo | `admin` / `quality` ("Supervisor") / `consultant` (`lib/domain/team.ts`) | Mismos roles; política documental textil se aplica sobre ellos. |
| Planes Demo/Full/Extra | `plan_definitions`, `plan_limits`, `lib/plans/*` | Mismo sistema; recursos textiles se agregan después (D-09). "Ajustados posteriormente": límites textiles específicos se definen en sprint de planes. |
| Sistema legal | `legal_documents`, `user_legal_acceptances`, `require-legal-acceptance` | Misma aceptación legal; textos se revisan si el módulo exige cláusulas propias. |
| Soporte / tickets | `support_tickets*`, `/support`, consola | Un solo canal de soporte para toda la plataforma. |
| Onboarding base | `0067_onboarding_status_views`, `components/domain/onboarding/*` | Patrón de checklist/próximo paso, con contenido textil propio. |
| Storage patterns | Buckets separados evidencias/documentos/assets (0015, 0049, 0058) | Mismo patrón con prefijos/buckets del módulo. |
| RLS helpers y patrón de seguridad | `is_org_member`, `has_org_role`, `is_platform_staff`, `is_platform_superadmin`, regla 0024 | Obligatorios en toda tabla textil. |
| Consola superadmin | `app/(app)/platform/*`, `platform_staff` | Misma consola: activación de módulo, planes, soporte, TrazaDocs multi-módulo. |
| TrazaDocs (motor) | 8 tablas + componentes + acciones | Motor compartido con `module_key` (Opción A). |
| Maestro documental (motor) | `trazadoc_file_documents*`, maestro + CSV | Compartido, filtrado por módulo. |
| Layout general y portal de módulos | `app/(app)/modules/page.tsx`, nav, UI kit | Tarjeta Textil pasa a disponible cuando el plan/flag lo permita. |
| Patrón de server actions | guardas → validación → escritura → revalidate | Idéntico en `server/actions/textiles-*.ts`. |
| Patrón de tests | `tests/rls`, `tests/unit`, `tests/diagnostic`, `tests/compliance` | Mismas carpetas con suites textiles. |
| Patrón de documentación | `docs/*.md` en español, guías por función | Esta carpeta lo sigue. |
| Auditoría | `audit_log`, `audit_row_change` | Obligatoria en tablas textiles. |

## 4. Qué se adapta (mismo patrón, contenido nuevo)

| Patrón CPR | Adaptación textil | Por qué no se copia literal |
|---|---|---|
| Diagnóstico (catálogo global + respuestas + wizard) | `textile_diagnostic_*` con 12 dimensiones, 58 preguntas, escala de 4 valores | Preguntas, normas y scoring CPR son de contenido reciclado plástico; el booleano Sí/No es insuficiente en textil. |
| Catálogos (products, suppliers, materials) | `textile_products/references/collections/suppliers/materials` | Semántica distinta: referencias/SKU, colecciones, tipos de proveedor textil, tipos de material de confección. |
| Trazabilidad (input→orden→salida) | `textile_input_batches/process_orders/order_processes/output_batches/traceability_links` | Unidades (metros/rollos/unidades vs kg), tercerización como primera clase, sin `residue_type`. |
| Evidencias (+links polimórficos) | `textile_evidences/evidence_links` con tipos textiles y `scheme_code` | Enum de targets CPR cerrado y plástico; esquemas GRS/RCS/OCS/GOTS/OEKO-TEX como metadato. |
| Dossier de soporte a auditoría / vistas de impresión | Pasaporte técnico textil + reportes con patrón `(print)` | El dossier CPR está estructurado alrededor del cálculo de contenido reciclado. |
| Onboarding/guided flow | Ruta guiada textil: diagnóstico → catálogos → composición → evidencias → pasaporte | Pasos y textos del flujo CPR son de dominio plástico. |
| Importaciones CSV | Posibles `job_type` textiles reutilizando `import_jobs` | Plantillas y validaciones nuevas; solo si T10 lo prioriza. |

## 5. Qué se crea nuevo (sin equivalente CPR)

- Composición de fibras (`textile_fiber_types`, `textile_fiber_compositions`).
- Componentes y separabilidad (`textile_components`).
- Procesos y tercerización como ruta (`textile_processes`, `textile_order_processes`).
- Evaluación de circularidad e índice de preparación circular.
- Claims ambientales con estados de soporte (`textile_claims*`).
- Pasaporte técnico textil con snapshot versionado.
- Matriz de brechas orientada a pasaporte.
- 13 estructuras TrazaDocs textiles y política de roles documental por módulo.

## 6. Qué NO se debe copiar de CPR (lista de exclusión vinculante)

| Elemento CPR | Motivo de exclusión |
|---|---|
| Cálculo de contenido reciclado (`recycled_content_calculations`, `calculation_methodologies`, acciones/vistas `recycled*`) | Metodología plástica; el contenido reciclado textil, si algún día se aborda, requiere rediseño metodológico propio (evidencias GRS/RCS mientras tanto). |
| Metodología NTC 6632 / UNE-EN 15343 | Normas de plásticos reciclados; citarlas en textil sería inventar soporte normativo. |
| Lógica de clasificación de plásticos (`material_classifications`, `residue_type`) | Sin equivalencia semántica textil. |
| Nombres de lotes plásticos y sus conceptos (kg, preconsumer/postconsumer como enum central) | Generarían confusión en confección; Textil usa sus unidades y tipos. |
| Reglas de elegibilidad CPR | Ligadas al esquema CPR. |
| Dossier CPR (`audit-support/dossier-body.tsx` y vistas 0031) | Estructurado alrededor del cálculo reciclado; el pasaporte textil es otra cosa. |
| Fórmulas CPR | Ninguna fórmula CPR aplica a los índices textiles. |
| Preguntas y seed del diagnóstico CPR (`0022`) | Contenido de dominio plástico. |

Regla operativa: ningún archivo nuevo de Textil importa desde `lib/db/recycled.ts`,
`lib/domain` de cálculo CPR ni referencia tablas del §6. Un test de arquitectura
(lint de imports) lo verificará desde T1.

## 7. Protección de CPR (invariantes)

1. Ningún sprint textil modifica lógica funcional CPR; los únicos cambios sobre
   objetos CPR permitidos son **aditivos** y acotados: `module_key` +
   `recommendation_level` en TrazaDocs (T8) y filas nuevas en catálogos
   transversales (`modules`, `plan_limits`).
2. Rutas productivas CPR intactas; Textil vive bajo `/textiles/...`.
3. Toda migración futura que toque una tabla compartida exige regresión CPR completa.
4. El módulo Textil permanece privado (flag + `organization_modules`) hasta beta.

## 8. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Herencia de infraestructura | — (decisión de arquitectura, no normativa) | Reutilización de capas transversales probadas. | n/a |
| Adaptación de trazabilidad | N-03 (ISO 22095) en lugar de NTC 6632/UNE-EN 15343 | El modelo de custodia textil se ancla en ISO 22095. | Continuidad metodológica con CPR o certificación. |
| Exclusión del cálculo reciclado | N-12 (GRS/RCS) como vía de evidencia | El contenido reciclado textil se documenta con certificados externos, no se calcula. | Cálculo o verificación de contenido reciclado textil. |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Deriva hacia copia de CPR por comodidad | Lista de exclusión §6 + lint de imports + revisión de coherencia por sprint. |
| Cambios aditivos sobre TrazaDocs rompen CPR | Salvaguardas de `TEXTILES_TRAZADOCS_MODEL.md` §5. |
| Duplicación conceptual (dos módulos de evidencias) confunde al usuario multi-módulo | UI siempre contextualizada por módulo; naming distinto (Evidencias Textil). |

## 10. Criterios de aceptación

- [ ] Cada componente CPR está clasificado en hereda / adapta / crea nuevo / no copia.
- [ ] La lista de exclusión es verificable por lint de imports y revisión de PR.
- [ ] Los invariantes de protección de CPR aparecen en los criterios de cada sprint
  del roadmap.

## 11. Próximos pasos

1. Configurar el lint de imports (regla "no importar recycled/CPR-domain") en T1.
2. Acordar el checklist de regresión CPR mínimo para sprints que toquen tablas
   compartidas (T8).
