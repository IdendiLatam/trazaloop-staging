# Trazaloop Textil · Arquitectura de producto

> Sprint T0 — Arquitectura documental. Este documento NO autoriza a crear código,
> migraciones ni rutas. Define el producto y su arquitectura para sprints posteriores.
> Fuente de verdad estratégica: `Arquitectura_Trazaloop_Textil_v0_1.docx`.
> Fuente de verdad técnica de la plataforma existente: código de Trazaloop CPR (sprint 10D).
> **Actualización T0.2 (DL-16)**: **Trazaloop es la plataforma; CPR es su primer
> módulo**, no la plataforma completa. Textil es el segundo módulo; Quality y
> Construcción son futuros. Toda mención a "la plataforma" en este documento se
> refiere a Trazaloop; la arquitectura de plataforma modular está en
> `TRAZALOOP_MODULAR_PLATFORM_ARCHITECTURE.md` y el acceso por módulo en
> `TRAZALOOP_MODULE_ACCESS_MODEL.md`.

## 1. Objetivo

Definir qué es Trazaloop Textil, para quién es, qué problema resuelve, cómo se posiciona
dentro de la plataforma Trazaloop y qué principios de arquitectura gobiernan su diseño,
de modo que un desarrollador pueda implementar el módulo en sprints posteriores sin
redefinir el producto.

## 2. Alcance

- Cubre: definición ejecutiva, cliente objetivo, principios de producto, arquitectura
  de capas, posicionamiento dentro de la plataforma multi-módulo, mensaje prudente y
  límites de promesa.
- No cubre: detalle funcional por módulo (ver `TEXTILES_FUNCTIONAL_MODEL.md`), modelo
  de datos (ver `TEXTILES_DATA_MODEL_PROPOSAL.md`), roadmap (ver
  `TEXTILES_IMPLEMENTATION_ROADMAP.md`).

## 3. Definición ejecutiva

**Trazaloop Textil** es un módulo de la plataforma Trazaloop para **empresas de
confección textil** (prendas, uniformes, dotaciones, moda, ropa corporativa, productos
textiles terminados) que necesitan:

1. Registrar productos, referencias/SKU, colecciones, órdenes y lotes de confección.
2. Documentar composición de fibras y materiales, insumos y avíos.
3. Registrar proveedores y vincular evidencias verificables.
4. Evaluar trazabilidad de materiales y preparación circular (reparabilidad,
   reutilización, reciclabilidad potencial, separabilidad, cuidado).
5. Generar un **pasaporte técnico textil / pasaporte de materiales preparatorio**.
6. Identificar brechas de información frente a compradores, revisiones técnicas,
   auditorías de cadena de custodia y futuros requisitos de pasaporte digital de
   producto (DPP).

**Lo que NO es**: no es una certificadora, no emite certificados, no garantiza
cumplimiento regulatorio, no genera el Pasaporte Digital de Producto oficial de la UE,
no reemplaza verificación de tercera parte.

### 3.1 Mensaje prudente de producto (obligatorio en toda la UI y documentación)

> "Trazaloop Textil ayuda a preparar información, documentación técnica y evidencias
> para revisiones técnicas, compradores, auditorías de cadena de custodia y futuros
> requerimientos de pasaporte digital de producto. No reemplaza certificaciones de
> tercera parte ni garantiza cumplimiento regulatorio."

Vocabulario permitido: preparación, trazabilidad, documentación técnica, soporte
documental, evidencias, brechas, revisión técnica, pasaporte técnico, pasaporte de
materiales, preparación para pasaporte digital de producto.

Vocabulario prohibido: "certificado", "certifica", "cumple con", "garantiza
cumplimiento", "producto reciclable certificado", "DPP oficial".

## 4. Cliente objetivo

| Perfil | Necesidad principal |
|---|---|
| Confeccionista de uniformes/dotaciones | Responder requisitos documentales de clientes institucionales y licitaciones. |
| Proveedor de marcas/retail/exportación | Responder cuestionarios de trazabilidad, composición y evidencias de compradores. |
| Marca de moda pequeña/mediana | Ordenar fichas técnicas, composición, proveedores y claims antes de crecer. |
| Consultor textil | Acompañar a varias empresas en diagnóstico, documentación y preparación de pasaportes. |

## 5. Principios de arquitectura

1. **Una plataforma, varios módulos.** Textil vive dentro del mismo producto Trazaloop
   (misma identidad, sesión, organización, plan, soporte y legal) que CPR. Nunca un
   login separado.
2. **Inspirado en CPR, no copia de CPR.** Se hereda la infraestructura transversal
   (auth, organizaciones, roles, planes, legal, tickets, storage, RLS, consola de
   plataforma, TrazaDocs, maestro documental, patrones de código y de tests). El
   dominio textil (productos, composición, trazabilidad, circularidad, pasaporte,
   diagnóstico) es propio. Detalle en `TEXTILES_CPR_REUSE_AND_DIFFERENTIATION.md`.
3. **Namespace propio.** Todo dato de dominio textil vive en tablas con prefijo
   `textile_` y toda ruta bajo `/textiles/...` (decisión desarrollada en
   `TEXTILES_TECHNICAL_DECISIONS.md`). CPR no se toca.
4. **Evidencia antes que declaración.** Toda afirmación relevante (composición, origen,
   contenido reciclado, claim ambiental) debe poder vincularse a una evidencia; si no
   hay evidencia, la plataforma lo muestra como **brecha**, no lo oculta.
5. **Preparación, no certificación.** Los resultados se expresan como niveles de
   preparación e información disponible, nunca como veredictos de conformidad.
6. **Soporte normativo explícito.** Cada funcionalidad importante referencia la norma,
   regulación, esquema o marco que la fundamenta (ver
   `TEXTILES_NORMATIVE_MAPPING.md`), distinguiendo su tipo (norma de referencia,
   esquema de certificación, regulación, marco conceptual, estándar de
   interoperabilidad/vocabulario/etiquetado/medición).
7. **MVP privado primero.** El módulo nace detrás de feature flag y activación por
   organización (`organization_modules`), invisible al público hasta piloto.
8. **Documentar antes de programar.** Este sprint T0 entrega solo documentación; las
   migraciones, rutas y UI llegan en T1+.

## 6. Arquitectura de capas (reutiliza el stack CPR)

| Capa | Qué es en Trazaloop hoy | Qué hace Textil |
|---|---|---|
| UI / rutas | Next.js App Router: `app/(app)/(shell)/...`, `app/(app)/(print)/...`, `app/(app)/platform/...` | Nuevo grupo de rutas `/textiles/...` dentro del shell; vistas de impresión bajo `(print)/textiles/...`; gestión de estructuras en `platform/trazadocs` filtrada por módulo. |
| Server actions | `server/actions/*.ts`, validación + guardas + revalidación | Nuevos archivos `server/actions/textiles-*.ts`, mismo patrón (requireSession → requireActiveOrg → requireLegalAcceptance → validar → escribir → revalidate). |
| Acceso a datos | `lib/db/*.ts` (consultas), `lib/domain/*.ts` (lógica pura) | `lib/db/textiles-*.ts` y `lib/domain/textiles-*.ts`; la lógica de scoring circular y de diagnóstico es pura y testeable. |
| Base de datos | Supabase Postgres, migraciones `supabase/migrations/NNNN_*.sql` | Nuevas tablas `textile_*` con el patrón obligatorio de 0024: RLS deny-by-default, `unique(organization_id, id)`, FK compuestas, `prevent_organization_id_change`, `set_updated_at`, `force_created_by`, `audit_row_change`. (Solo propuesto; sin migraciones en T0.) |
| Seguridad multiempresa | Helpers `is_org_member`, `has_org_role`, `is_platform_staff`, `is_platform_superadmin` | Se reutilizan tal cual. |
| Storage | Buckets separados (evidencias vs documentos TrazaDocs vs assets) | Mismo patrón; evidencias textiles y archivos TrazaDocs Textil separados por bucket/prefijo y por organización. |
| Planes y cuotas | `plan_definitions`, `plan_limits`, `lib/plans/*` (Demo/Full/Extra) | Se agregan recursos contables textiles a `plan_limits` en sprint futuro; Demo limitado. |
| Plataforma (superadmin) | `app/(app)/platform/...`, `platform_staff` | Misma consola; gestiona activación del módulo y estructuras TrazaDocs Textil. |

## 7. Posicionamiento en el portal de módulos

Hoy `app/(app)/modules/page.tsx` ya muestra la tarjeta "Trazaloop Textil" con
`key: "textil"` y `available: false` ("Próximamente"). La activación real será:

- `modules` (catálogo global): fila con `code = 'textiles'` (ver decisión de
  unificación de clave en `TEXTILES_TECHNICAL_DECISIONS.md`, D-01).
- `organization_modules`: activación por empresa, controlada por superadmin.
- Feature flag de entorno para el shell privado durante desarrollo.

## 8. Base normativa y referencias internacionales

El detalle completo está en `TEXTILES_NORMATIVE_MAPPING.md`. Resumen de capas:

| Capa del producto | Referencia principal | Tipo |
|---|---|---|
| Contexto regulatorio DPP/ecodiseño | ESPR (UE) 2024/1781; Estrategia UE Textiles Sostenibles y Circulares | Regulación / marco sectorial |
| Cadena de custodia y trazabilidad | ISO 22095 | Norma de referencia (terminología y modelos) |
| Vocabulario ambiental textil | ISO 5157 | Estándar de vocabulario |
| Claims ambientales autodeclarados | ISO 14021 | Norma de referencia para declaraciones |
| Medición de circularidad | ISO 59020 (con ISO 59004/59010 como principios) | Estándar de medición / marco conceptual |
| Cuidado del producto | ISO 3758 (símbolos), ISO 6330 (ensayos) | Estándar de etiquetado / ensayo |
| Fibras y composición | ISO 2076 (nombres genéricos), serie ISO 1833 (análisis cuantitativo) | Norma de referencia / ensayo |
| Esquemas textiles externos | GRS/RCS, OCS/GOTS, OEKO-TEX MADE IN GREEN | Esquemas de certificación (externos; Trazaloop solo organiza sus evidencias) |
| Interoperabilidad futura | GS1 EPCIS/CBV, GS1 Digital Link | Estándares de interoperabilidad (referencia futura) |

| Funcionalidad | Norma o marco de referencia | Cómo se aplica en Trazaloop Textil | Qué NO debe prometer la plataforma |
|---|---|---|---|
| Plataforma completa | ESPR (UE 2024/1781), Estrategia textil UE | Contexto y motivación: preparar información para futuros DPP y exigencias de compradores. | No promete generar el DPP oficial ni cumplimiento del ESPR. |
| Trazabilidad de lotes y proveedores | ISO 22095 | Modelo conceptual de cadena de custodia (identidad, segregación) para vincular insumo → proceso → producto. | No promete certificación de cadena de custodia. |
| Lenguaje circular y de fin de vida | ISO 5157 | Terminología consistente en UI, documentos y pasaporte. | No promete conformidad con ninguna norma por usar su vocabulario. |
| Registro de claims | ISO 14021 | Todo claim exige soporte documental y muestra limitaciones. | No promete que un claim es válido, verificado o certificable. |

## 9. Decisiones clave (resumen)

| # | Decisión | Detalle en |
|---|---|---|
| 1 | Textil es un módulo de la plataforma, no un producto separado | Este documento, §5.1 |
| 2 | Prefijo `textile_` para todo el dominio de datos; sin tocar tablas CPR de dominio | `TEXTILES_DATA_MODEL_PROPOSAL.md` |
| 3 | TrazaDocs evoluciona a multi-módulo con `module_key`, protegiendo CPR | `TEXTILES_TRAZADOCS_MODEL.md` |
| 4 | Diagnóstico propio del sector textil con respuestas Sí/Parcial/No/No aplica | `TEXTILES_DIAGNOSTIC_MODEL.md` |
| 5 | Pasaporte técnico con snapshot versionado, nunca "DPP oficial" | `TEXTILES_MATERIAL_PASSPORT_MODEL.md` |
| 6 | Índice de preparación circular con 5 niveles, sin lenguaje de certificación | `TEXTILES_CIRCULARITY_ASSESSMENT_MODEL.md` |
| 7 | MVP privado sin QR público, blockchain, IA, ACV ni integraciones | `TEXTILES_MVP_SCOPE.md` |
| 8 | Roadmap T0–T11 con criterios de aceptación por sprint | `TEXTILES_IMPLEMENTATION_ROADMAP.md` |

## 10. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sobredimensionar el módulo hacia "sostenibilidad genérica" | Pérdida de foco, MVP inviable | El alcance queda fijado por `TEXTILES_MVP_SCOPE.md`; todo lo demás va a "futuro". |
| Copiar mecánicamente CPR (lotes plásticos, contenido reciclado) | Modelo confuso para confeccionistas | Lista explícita de "no reutilizar" en `TEXTILES_CPR_REUSE_AND_DIFFERENTIATION.md`. |
| Prometer más de lo que la regulación permite afirmar | Riesgo legal/reputacional | Mensaje prudente obligatorio; revisión de coherencia anti-certificación en cada sprint. |
| Incertidumbre normativa del DPP (actos delegados textiles pendientes) | Rediseño futuro del pasaporte | El pasaporte es "preparatorio"; snapshot versionado permite evolucionar el formato. |
| Romper CPR al evolucionar TrazaDocs a multi-módulo | Regresión en producción | Estrategia de `module_key` con default `'cpr'` y tests de regresión (ver TrazaDocs model). |

## 11. Criterios de aceptación (de este documento)

- [ ] Un desarrollador que solo lea esta carpeta entiende qué es Textil y qué no es.
- [ ] Ninguna sección promete certificación ni cumplimiento automático.
- [ ] Toda capa funcional tiene referencia normativa con su tipo declarado.
- [ ] La relación con CPR está resuelta por referencia cruzada, sin ambigüedad.

## 12. Próximos pasos

1. Validar esta arquitectura con el propietario del producto y (si es posible) un
   experto textil.
2. Resolver las preguntas de `TEXTILES_OPEN_QUESTIONS.md` marcadas como bloqueantes.
3. Ejecutar Sprint T1 (shell privado) según `TEXTILES_IMPLEMENTATION_ROADMAP.md`.
