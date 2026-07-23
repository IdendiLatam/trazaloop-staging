# Trazaloop Textil · Decisiones técnicas

> Sprint T0, consolidado en T0.1 — Solo documentación. Registro de decisiones (ADR
> ligero). Las decisiones **cerradas formalmente en T0.1** están además en
> `TEXTILES_DECISION_LOG.md` con IDs DL-nn. Estado:
> **Actualización T0.2**: las decisiones de plataforma DL-16…DL-22 (Trazaloop como
> plataforma, landing, acceso y planes por módulo) viven en el decision log y en
> los documentos TRAZALOOP_*; D-04 (activación por plan) queda subsumida por
> DL-20/DL-22 y `TRAZALOOP_MODULE_PLANS_DECISION.md`: el plan por módulo se
> implementa en Plataforma-M1, no en fase comercial "suelta".
>
> **Propuesta** = requiere ratificación antes del sprint indicado; **Decidida** =
> lista para implementar cuando llegue su sprint.

## 1. Objetivo

Consolidar las decisiones técnicas transversales del módulo Textil con su racional,
alternativas y sprint de aplicación.

## 2. Alcance

Decisiones de plataforma. Las decisiones de datos finas viven en
`TEXTILES_DATA_MODEL_PROPOSAL.md`; las de TrazaDocs en `TEXTILES_TRAZADOCS_MODEL.md`.

## 3. Registro de decisiones

### D-01 · Clave del módulo — **Decidida (cerrada en T0.1, DL-01)**
`module_key`/`module_code` oficial: **`textiles`** en tablas, documentación, rutas
y TrazaDocs. No se usan "textil", "textile", "trazaloop_textil" ni variantes. Hoy
el portal (`app/(app)/modules/page.tsx`) usa `key: "textil"` en una tarjeta
puramente visual: se actualiza esa constante en T1 (cambio de UI sin efecto
funcional CPR). Alternativa descartada: mantener "textil" y crear un mapeo doble —
fuente de inconsistencias.

### D-02 · Namespace de rutas — **Decidida (ratificada en T0.1, DL-04)**
Análisis de las dos candidatas:
- `/modules/textiles`: agruparía módulos bajo `/modules`, pero en CPR `/modules` es
  una **página** (portal de selección, `app/(app)/modules/page.tsx`), no un
  namespace; anidar debajo obligaría a reestructurarla (riesgo sobre ruta
  productiva) y las funciones CPR tampoco viven bajo `/modules` (viven en la raíz
  del shell: `/dashboard`, `/diagnostic`…). Descartada.
- `/textiles`: namespace propio al nivel del shell, cero contacto con rutas CPR,
  URLs cortas y guard único en el layout. **Recomendada y adoptada.**

Todas las rutas del módulo bajo `app/(app)/(shell)/textiles/...` y vistas de
impresión bajo `app/(app)/(print)/textiles/...`. Las rutas CPR existentes quedan
intactas en su ubicación actual (no se reorganiza CPR bajo `/cpr/...` en esta fase;
esa reorganización sería un cambio de rutas productivas, prohibido).

### D-03 · Feature flag y activación — **Decidida**
Doble control: (1) flag de entorno para ocultar el módulo en despliegues donde no
deba existir; (2) activación por organización vía `organization_modules`
(`module_code='textiles'`), gestionada solo por superadmin desde la consola. Guard
`require-textiles-module` en el layout del namespace. El flag muere al llegar a fase
comercial; la activación por organización permanece.

### D-04 · Activación por plan — **Propuesta (fase comercial)**
En MVP/piloto la activación es manual. En fase comercial, la disponibilidad del
módulo y sus límites se expresan en `plan_definitions`/`plan_limits` con recursos
textiles nuevos (ver D-09). No se crean columnas de plan por módulo ad-hoc.

### D-05 · Organizations y memberships — **Decidida**
Una organización puede tener CPR, Textil o ambos activos; una sola membresía y rol
por usuario-organización sirve a ambos módulos. No existen "roles textiles"
separados: la política documental textil se aplica sobre los roles existentes
(`admin`/`quality`/`consultant`).

### D-06 · Política de aprobación documental por módulo — **Propuesta (T8)**
Flag de configuración por organización (módulo Textil): "el supervisor puede aprobar
documentos" (default: sí). El consultor nunca aprueba en Textil. Implementación en
guardas de server actions + RLS condicionada, sin alterar el comportamiento CPR.

### D-07 · Storage — **Decidida**
Mismo patrón de buckets de CPR con separación por módulo: evidencias textiles en
bucket propio (o prefijo `textiles/{organization_id}/...` dentro del bucket de
evidencias — decidir en T5 según políticas de storage vigentes), archivos TrazaDocs
Textil bajo el prefijo de módulo del bucket documental. Nunca se mezclan evidencias
con documentos (regla CPR vigente). Tamaños y MIME permitidos: heredar límites CPR.

### D-08 · RLS — **Decidida**
Toda tabla textil aplica el patrón 0024 completo y los helpers existentes. Ninguna
política nueva de "solo lectura entre módulos": el aislamiento es por organización;
el aislamiento por módulo es de aplicación (filtros + guards), salvo TrazaDocs donde
`module_key` participa en unicidad y filtros.

### D-09 · Límites Demo/Full/Extra por módulo — **Propuesta (fase comercial)**
Nuevos `resource_code` textiles en `plan_limits` (p. ej. `textile_products`,
`textile_suppliers`, `textile_evidences`, `textile_passports`,
`documents_trazadocs_textiles`). El conteo TrazaDocs Demo es **por módulo** (2 en
CPR y 2 en Textil de forma independiente): evita que activar Textil consuma el plan
CPR del cliente. Requiere ajuste aditivo del conteo actual al introducir
`module_key`.

### D-10 · TrazaDocs multi-módulo — **Decidida (implementa T8)**
Opción A: `module_key` con default `'cpr'` sobre el motor existente, con las
salvaguardas de `TEXTILES_TRAZADOCS_MODEL.md` §5. Única modificación aditiva
autorizada sobre objetos CPR.

### D-11 · Maestro documental multi-módulo — **Decidida (implementa T8)**
El maestro se filtra por `module_key`; export CSV por módulo; categorías
compartidas (`category_code`), ampliables de forma aditiva.

### D-12 · Dashboards — **Decidida**
Dashboard textil propio (`/textiles/dashboard`); no se tocan las vistas del
dashboard CPR. Vistas SQL nuevas prefijadas `textile_v_*`.

### D-13 · Diagnósticos — **Decidida**
Tablas de diagnóstico textiles propias (no filas nuevas en catálogos CPR); escala
Sí/Parcial/No/No aplica; scoring en `lib/domain` puro.

### D-14 · Versionamiento de pasaportes — **Decidida**
Snapshot `jsonb` con `schema_version` interno; versión incremental por
referencia(+lote); aprobado inmutable; nueva versión desde aprobado; historial de
estados append-only.

### D-15 · Estados de documentos y de pasaporte — **Decidida**
Documentos TrazaDocs: draft/in_review/approved/obsolete (idéntico CPR). Pasaporte:
draft/in_review/**approved_internal**/obsolete — el nombre distinto del estado de
aprobación es deliberado (aprobación interna, no externa). Evaluación de
circularidad: mismo ciclo que el pasaporte.

### D-16 · Relación con soporte — **Decidida**
Un solo sistema de tickets para toda la plataforma; el formulario permite indicar el
módulo (campo/categoría aditiva) para triage, sin duplicar tablas ni rutas.

### D-17 · Relación con onboarding — **Decidida**
Onboarding textil propio (checklist "siguiente paso" del patrón CPR) dentro del
namespace; el onboarding CPR no se modifica. El legal acceptance es único de
plataforma; si el módulo exige textos legales propios, se versionan en
`legal_documents` (contenido, no esquema).

### D-18 · Estrategia futura de QR — **Propuesta (futuro, fuera de MVP)**
Cuando se aborde: vista pública reducida derivada del snapshot aprobado (nunca datos
vivos), con lista blanca de campos públicos (Q-13/Q-14), identificadores no
adivinables y revocación. GS1 Digital Link como candidato de formato. Ninguna
implementación ahora.

### D-19 · Estrategia futura GS1/EPCIS — **Propuesta (futuro)**
`textile_traceability_links` se diseñó para poder proyectarse a eventos EPCIS
(qué/dónde/cuándo/por qué) si algún día se implementa; no se agregan campos EPCIS
ahora. Cualquier afirmación de compatibilidad queda prohibida hasta implementarse.

### D-20 · Convivencia con CPR — **Decidida**
Invariantes de `TEXTILES_CPR_REUSE_AND_DIFFERENTIATION.md` §7 + lint de imports
(prohibido importar dominio de cálculo CPR desde código textil) + regresión CPR en
sprints que toquen objetos compartidos (solo T8).

## 4. Base normativa y referencias internacionales

| Funcionalidad | Norma o marco de referencia | Cómo se aplica | Qué NO debe prometer |
|---|---|---|---|
| D-18 QR futuro | N-16 (GS1 Digital Link) | Referencia de diseño futuro. | Compatibilidad o disponibilidad actual. |
| D-19 EPCIS futuro | N-15 (GS1 EPCIS/CBV) | Proyectabilidad del grafo de trazabilidad. | Implementación o certificación EPCIS. |
| D-14/D-15 estados y snapshots | N-01 (contexto DPP), N-03 | Trazabilidad de cambios y consolidados inmutables. | Validez regulatoria del pasaporte. |

## 5. Riesgos

| Riesgo | Mitigación |
|---|---|
| Decisiones "Propuesta" implementadas sin ratificar | Cada sprint verifica el estado de sus decisiones como criterio de entrada. |
| Divergencia entre D-01 y datos ya sembrados | Ratificar D-01 en T1, antes de cualquier seed. |
| Flags de configuración proliferan (D-06) | Un flag por necesidad demostrada; registro aquí obligatorio. |

## 6. Criterios de aceptación

- [ ] Toda decisión tiene estado, racional, alternativa considerada y sprint.
- [ ] Ninguna decisión contradice el MVP, el modelo de datos ni los invariantes CPR.

## 7. Próximos pasos

1. Ratificar D-01, D-04, D-06, D-09 con el propietario del producto.
2. Revisitar D-18/D-19 solo al cerrar el MVP y el piloto.

## T9C · Decisiones de la UI del pasaporte técnico textil (Julio 2026)

- **D-T9C-1 (Decidida): la UI lee el snapshot histórico, no datos vivos.** El
  detalle y la impresión leen `snapshot_json.sections.*`, `gaps_json`,
  `warnings_json` y `recommendations_json` del registro ya generado; no recalculan
  ni consultan las fuentes. Racional: el pasaporte es un snapshot congelado al
  momento de generación (T9.0); mostrar datos vivos rompería esa garantía.
  Alternativa descartada: recomputar en cada vista (incoherente con el modelo).

- **D-T9C-2 (Decidida): las evidencias visibles se leen desde
  `snapshot_json.sections.evidences.items`.** Ruta real confirmada en T9B.3. La UI
  muestra solo metadata (título, tipo, estado, entidad, vínculo, fechas, nombre de
  archivo); nunca signed URLs ni `file_path`, y no descarga archivos. Racional:
  privacidad de storage y coherencia con el snapshot.

- **D-T9C-3 (Decidida): la impresión inicial usa el navegador, no PDF
  server-side.** Mismo patrón que TrazaDocs: ruta `(print)` con `@media print` y
  `window.print()` (botón "Imprimir / guardar como PDF"). Racional: evitar una
  dependencia de PDF en servidor y mantener el alcance. Alternativa descartada:
  generar PDF en servidor (fuera de alcance de T9C).

- **D-T9C-4 (Decidida): la aprobación es interna, no externa.** La UI usa
  "Aprobado internamente" (nunca "aprobado" a secas) y muestra la nota de alcance.
  consultant no puede aprobar internamente (los botones se filtran por rol y la
  RPC es la autoridad final). Racional: lenguaje prudente (N-05) y control de
  roles del proyecto.

- **D-T9C-5 (Decidida): creación por INSERT mínimo + generación por RPC
  controlada.** El borrador se crea con un INSERT que la BD fuerza a nacer como
  draft sin snapshot ni sellos (trigger de 0084/0085 + RLS); la generación y las
  transiciones pasan por las RPCs controladas. La UI nunca envía snapshot, hash,
  data_sources ni estado arbitrario. Racional: seguridad e integridad del
  snapshot.

- **D-T9C-6 (Futuro): QR/enlace público y nueva versión quedan fuera de T9C.**
  No se creó QR ni portal público (se mantienen fuera hasta definir el modelo de
  exposición y su seguridad), ni una RPC de nueva versión (el botón no se ofrece).
  Ver `TEXTILES_T9D_READY_PROMPT.md`.


## T9D · Decisiones del enlace privado controlado y QR (Julio 2026)

- **D-T9D-1 (Decidida): el token se guarda solo como hash, nunca en claro.** Se
  persiste `token_hash` (sha256) + un prefijo para la UI; el token completo se
  genera server-side (32 bytes) y se muestra una sola vez al crear. Racional:
  aunque la BD se filtrara, los enlaces no serían utilizables. Alternativa
  descartada: guardar el token (riesgo de exfiltración).

- **D-T9D-2 (Decidida): la resolución pública pasa solo por una RPC
  SECURITY DEFINER; anon nunca lee la tabla.** La ruta tokenizada llama a
  `resolve_textile_passport_share`, que valida hash+estado+expiración+accesos y
  devuelve un snapshot reducido. anon tiene grant sobre la RPC, no sobre la
  tabla. Racional: superficie pública mínima y controlada.

- **D-T9D-3 (Decidida): la vista pública muestra un snapshot REDUCIDO.** Sin
  `token_hash`, sin `data_sources_json`, sin signed URLs, con las secciones
  recortadas según flags `include_*`. Mensaje genérico ante fallo (no revela
  organización). noindex. Racional: privacidad y prudencia.

- **D-T9D-4 (Decidida): revocar es irreversible; deshabilitar es reversible.**
  Un enlace `revoked` no puede reactivarse (trigger). `disabled` sí. Racional:
  revocar debe ser una acción de seguridad definitiva.

- **D-T9D-5 (Decidida): QR con la librería `qrcode`, no un encoder casero.** El
  proyecto no tenía generador QR; se añadió `qrcode` (madura) como dependencia
  pequeña y justificada. Un encoder propio podría producir códigos no
  escaneables (peor que no tener QR). El QR se genera client-side desde el enlace
  y no se persiste.

- **D-T9D-6 (Alcance): no es portal público oficial ni DPP.** El enlace es una
  consulta técnica controlada de un snapshot histórico; la vista lo declara
  explícitamente. Sin PDF server-side, IA, ACV, huella ni planes por módulo.