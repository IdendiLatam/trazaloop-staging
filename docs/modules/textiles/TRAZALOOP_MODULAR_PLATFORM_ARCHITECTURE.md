# Trazaloop · Arquitectura modular de plataforma

> Sprint T0.2 — Solo documentación. Documento de **plataforma** (no exclusivo de
> Textil); vive en `docs/modules/textiles/` por ser el sprint que lo origina y para
> mantener el paquete T0.x unido. Si más adelante se crea `docs/platform/`, este
> documento puede moverse allí (decisión de ubicación, no de contenido).

## 1. Objetivo

Fijar la definición oficial: **Trazaloop es la plataforma; CPR es su primer
módulo**, no la plataforma completa. Establecer cómo conviven los módulos, cómo se
comparte lo transversal y cómo se separan los dominios.

## 2. Qué es Trazaloop

Trazaloop es una plataforma SaaS **modular** multi-tenant para gestionar
trazabilidad, documentación técnica, evidencias y preparación técnica de productos,
procesos y cadenas de valor. La plataforma provee la infraestructura común
(identidad, empresas, equipos, planes, legal, soporte, documentación, seguridad) y
cada **módulo** aporta un dominio vertical con sus propios datos, flujos y
resultados.

## 3. Qué son los módulos

Un módulo es un dominio funcional vertical, activable por empresa, con su propia
clave (`module_key`), su namespace de rutas, sus tablas de dominio, sus contenidos
(diagnósticos, evidencias, documentos, consolidados) y su nivel de acceso.

| Módulo | `module_key` | Estado hoy | Dominio |
|---|---|---|---|
| Trazaloop CPR | `cpr` | Disponible (beta/lanzamiento controlado) | Trazabilidad y cálculo de contenido reciclado en plásticos (NTC 6632 / UNE-EN 15343). |
| Trazaloop Textil | `textiles` | En preparación (privado) | Trazabilidad de confección, composición de fibras, evidencias, circularidad, pasaporte técnico textil. |
| Trazaloop Quality | `quality` | Futuro (sin diseño) | Gestión documental y soporte para sistemas de gestión de calidad. |
| Trazaloop Construcción | `construction` | Futuro (sin diseño) | Trazabilidad documental y técnica para productos, materiales y proyectos de construcción. |

Nota histórica: el catálogo `modules` y `organization_modules` existen desde la
migración 0004 — la plataforma **ya nació modular**; lo que corrige T0.2 es la
comunicación (hero público "Trazaloop CPR") y la evolución del acceso por módulo.

## 4. Por qué CPR no debe tratarse como la plataforma completa

1. **Comercial**: presentar CPR como "la plataforma" acopla la marca a un solo
   sector y dificulta vender Textil y futuros módulos (riesgos R-17/R-18).
2. **Técnico**: induce a colgar cosas transversales del dominio CPR (ya evitado en
   el diseño Textil, `TEXTILES_CPR_REUSE_AND_DIFFERENTIATION.md`).
3. **De producto**: una empresa puede necesitar solo Textil; la puerta de entrada
   debe ser Trazaloop, y dentro, sus módulos contratados.

## 5. Niveles de la plataforma

| Nivel | Qué representa | Ejemplo |
|---|---|---|
| Plataforma | Trazaloop | SaaS principal: identidad, empresas, planes, legal, soporte, seguridad |
| Módulo | Trazaloop CPR | Contenido reciclado en plásticos |
| Módulo | Trazaloop Textil | Trazabilidad textil y pasaporte técnico |
| Módulo | Trazaloop Quality | Soporte documental a sistemas de calidad (futuro) |
| Módulo | Trazaloop Construcción | Trazabilidad para construcción (futuro) |
| Empresa | Organización cliente | Confecciones ABC |
| Usuario | Miembro de empresa | Administrador, supervisor, consultor |
| Acceso por módulo | Plan y estado de cada módulo para cada empresa | CPR Full, Textil Demo |

## 6. Qué comparte la plataforma (una sola vez, para todos los módulos)

| Capa | Mecanismo actual | Regla |
|---|---|---|
| Autenticación | Supabase Auth + `require-session` | Una identidad y una sesión para toda la plataforma; nunca login por módulo. |
| Organizaciones | `organizations` + organización activa | Una sola organización cliente sirve a todos sus módulos. |
| Membresías | `memberships` (active/suspended/revoked) | Una membresía por usuario-empresa, válida en todos los módulos habilitados. |
| Roles | `admin` / `quality` ("Supervisor") / `consultant` | Roles comunes; cada módulo define **políticas** sobre esos roles (p. ej. quién aprueba documentos), no roles nuevos. |
| Planes (hoy) | `plan_definitions`, `plan_limits`, `organization_subscriptions` (global) | Evoluciona hacia acceso por módulo: `TRAZALOOP_MODULE_ACCESS_MODEL.md`. |
| Legal | `legal_documents` + aceptaciones | Aceptación de plataforma; cláusulas por módulo son contenido versionado, no mecanismos nuevos. |
| Soporte | `support_tickets*` | Canal único con categoría/etiqueta de módulo. |
| Consola de plataforma | `app/(app)/platform/*`, `platform_staff` | Una consola; secciones por módulo donde aplique (TrazaDocs, activaciones). |
| Seguridad | RLS deny-by-default + helpers (patrón 0024) | Idéntico en todo módulo, sin excepciones. |
| Auditoría | `audit_log` | Transversal. |

## 7. Qué se separa por módulo (nunca se mezcla)

| Dominio | CPR | Textil | Regla de separación |
|---|---|---|---|
| Rutas | `/dashboard`, `/diagnostic`, `/recycled-content`, … (posición histórica) | `/textiles/*` | Namespaces distintos; CPR no se reestructura bajo `/cpr` (ruta productiva). |
| Tablas de dominio | Sin prefijo (histórico) | Prefijo `textile_` | Cada módulo futuro estrena prefijo (`quality_`, `construction_`). |
| Diagnósticos | `diagnostic_*` (booleano, contenido plástico) | `textile_diagnostic_*` (escala de 4, contenido confección) | Catálogos y respuestas independientes. |
| Evidencias | `evidences` + enum de targets CPR | `textile_evidences` + targets textiles | Buckets/prefijos de storage separados por módulo. |
| Documentos (TrazaDocs) | Motor común | Motor común | Separación **lógica** por `module_key` en blueprints, documentos y maestro (DL-06); conteos de plan por módulo. |
| Cálculos | Contenido reciclado (NTC 6632/UNE-EN 15343) | Índice de preparación circular (ISO 59020 como referencia) | Prohibido compartir fórmulas o metodologías entre módulos. |
| Pasaportes/consolidados | Dossier de soporte a auditoría | Pasaporte técnico textil | Estructuras y snapshots propios. |
| Reportes/dashboards | Vistas CPR | Vistas `textile_v_*` | Vistas SQL por módulo; nada de UNION entre dominios. |

**Regla anti-mezcla**: los datos de un módulo jamás se leen/escriben desde el código
de otro módulo (lint de imports, R-01); lo único legítimamente compartido es la capa
de plataforma del §6.

## 8. Cómo una empresa tiene uno o varios módulos

1. La empresa existe una sola vez (`organizations`).
2. Cada módulo se habilita explícitamente para esa empresa (hoy:
   `organization_modules`; futuro: acceso con plan y estado por módulo —
   `TRAZALOOP_MODULE_ACCESS_MODEL.md`).
3. El portal `/modules` muestra a cada usuario los módulos de su empresa: los
   habilitados como accesibles, el resto como "Próximamente" o sin acceso.
4. El superadministrador decide qué módulos tiene cada empresa y en qué nivel
   (DL-19); un usuario normal no puede autohabilitarse módulos.
5. Ejemplos válidos por diseño: CPR Full + Textil Demo; CPR Extra + Textil sin
   acceso; solo Textil Demo.

## 9. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| Arquitectura modular | — (decisión de producto/arquitectura, no normativa) | Cada módulo declara su propio soporte normativo (CPR: NTC 6632/UNE-EN 15343; Textil: catálogo N-01…N-17). | Que el soporte normativo de un módulo aplique a otro. |
| Comunicación pública de módulos | N-05 (ISO 14021) como guía de lenguaje prudente | Copy de plataforma y módulos sin promesas de certificación/cumplimiento (`TRAZALOOP_PUBLIC_LANDING_AND_MODULES_COPY.md`). | Certificación, cumplimiento automático, sustitución de auditoría, DPP oficial. |

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| La marca siga acoplada a CPR (R-17/R-18) | DL-16/DL-17/DL-21: hero "Trazaloop" en T1; módulos como catálogo visible. |
| Transversales nuevos se cuelguen de un módulo | Toda pieza nueva se clasifica primero: ¿plataforma o módulo? (regla de PR). |
| Quality/Construcción se diseñen copiando Textil sin análisis propio | Cada módulo futuro exige su propio T0 documental. |

## 11. Criterios de aceptación

- [ ] Cualquier documento del paquete que hable de "la plataforma" se refiere a
  Trazaloop, y de CPR/Textil como módulos.
- [ ] La tabla de niveles y las reglas de compartición/separación no contradicen el
  código CPR actual.

## 12. Próximos pasos

1. T1: corregir el hero público (DL-17/DL-21).
2. Plataforma-M1 (futuro): acceso avanzado por módulo (`TRAZALOOP_MODULE_ACCESS_MODEL.md`).
