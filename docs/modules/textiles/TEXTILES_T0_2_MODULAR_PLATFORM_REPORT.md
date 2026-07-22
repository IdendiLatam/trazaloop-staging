# Trazaloop · Informe del Sprint T0.2 — Plataforma modular y acceso por módulos

> Sprint T0.2 — Solo documentación. Cierre del sprint y veredicto.

## 1. Resumen del trabajo realizado

Se corrigió la definición de plataforma en todo el paquete documental: **Trazaloop
es la plataforma; CPR es su primer módulo** (DL-16). Se analizó el modelo real de
acceso y planes del código CPR (0004 `modules`/`organization_modules`, 0050
`plan_definitions`/`plan_limits`/`organization_subscriptions`/historial, 0052
`v_organization_plan_usage`) y se verificó en `app/page.tsx` que el hero público
dice "Trazaloop CPR" con las cuatro tarjetas de módulos ya presentes. Sobre esa
base se documentó la arquitectura modular, el modelo de acceso por módulo (con
recomendación), el copy corregido de la landing, la decisión de planes por módulo
por fases, y se revisó el Sprint T1 (prompt nuevo que incorpora la corrección de
comunicación pública). Ningún archivo fuera de `docs/modules/textiles/` fue tocado.

## 2. Documentos creados (6)

| Documento | Contenido |
|---|---|
| `TRAZALOOP_MODULAR_PLATFORM_ARCHITECTURE.md` | Trazaloop como plataforma; módulos CPR/Textil/Quality/Construcción; tabla de niveles; qué se comparte (auth, org, membresías, roles, legal, soporte, consola, seguridad) y qué se separa por módulo (rutas, tablas, diagnósticos, evidencias, documentos por `module_key`, cálculos, pasaportes, reportes); regla anti-mezcla. |
| `TRAZALOOP_MODULE_ACCESS_MODEL.md` | Análisis fiel del modelo actual; 4 opciones (A evolucionar `organization_modules`, B tabla de suscripciones paralela, C `organization_module_access`, D plan global + features); recomendación **Opción C** con campos, estados, transición y precedencias; semántica cuenta Demo / empresa Demo / módulo en Demo; matriz de quién puede qué. |
| `TRAZALOOP_PUBLIC_LANDING_AND_MODULES_COPY.md` | Hero "Trazaloop" + 3 subtítulos (técnico recomendado, comercial, prudente); textos de las 4 tarjetas; botones; lista de lenguaje prohibido. |
| `TRAZALOOP_MODULE_PLANS_DECISION.md` | Respuesta a las 10 preguntas de planes; decisión por fases: **piloto sin cambios** (plan global + activación simple), **comercial = Plataforma-M1** (planes/límites/uso por módulo). |
| `TEXTILES_T1_READY_PROMPT_REVISED.md` | Prompt T1 con Parte A (comunicación pública) + Parte B (shell privado); alcances, archivos, migración única, tests, criterios y checklist. Reemplaza al prompt T0.1. |
| `TEXTILES_T0_2_MODULAR_PLATFORM_REPORT.md` | Este informe. |

## 3. Documentos actualizados (14)

Decision log (+DL-16…DL-22, encabezado y criterios) · Risk register (+R-17…R-24,
lectura y criterios) · Roadmap (Sprint T0.2 insertado; T1 reescrito con Parte A/B;
sprint futuro **Plataforma-M1** especificado; ruta crítica y bloqueos actualizados)
· Entry checklist (nueva sección 0 de plataforma modular; archivos de T1 con la
landing; sección 6 revisada) · T1_READY_PROMPT (banner superseded) ·
Product architecture, Functional model, CPR reuse, MVP scope, Normative
traceability matrix, T0.1 report, Technical decisions (notas T0.2 de plataforma) ·
Data model (§6.5: acceso por módulo futuro, prohibido crearlo en T1–T11) · Open
questions (+Q-21 módulos Demo por defecto; +Q-22 reglas de `team_members`/storage).

## 4. Decisiones nuevas (DL-16…DL-22)

DL-16 Trazaloop es la plataforma; CPR es un módulo · DL-17 la landing comunica
Trazaloop · DL-18 el acceso evoluciona a acceso por módulo (dirección: Opción C,
`organization_module_access`) · DL-19 el superadmin gestiona acceso por empresa y
por módulo · DL-20 Demo/Full/Extra aplicables por módulo · DL-21 T1 corrige la
comunicación pública · DL-22 los planes por módulo se documentan en T0.2 y NO se
implementan todavía (sprint Plataforma-M1).

## 5. Riesgos nuevos (R-17…R-24)

R-17 comunicar CPR como plataforma (se cierra en T1) · R-18 Textil acoplado
comercialmente a CPR · R-19 imposibilidad de comprar módulos independientes (se
cierra en Plataforma-M1) · R-20 planes globales frenan el escalamiento · R-21
superadmin sin control por módulo · R-22 acceso sin habilitación explícita · R-23
storage/límites mal calculados con varios módulos · R-24 confusión de "Demo"
(cuenta/empresa/módulo).

## 6. Recomendaciones centrales

- **Modelo de acceso por módulo**: Opción C — tabla `organization_module_access`
  (org × módulo × plan × estado, escritura solo superadmin, historial append-only,
  backfill del plan global como plan CPR, precedencia de la suspensión global),
  implementada exclusivamente en Plataforma-M1. Opción D descartada por no poder
  expresar la necesidad; A descartada por mutar tenancy núcleo; B descartada por
  doble fuente de verdad.
- **Landing pública**: hero "Trazaloop" + subtítulo técnico (Opción 1) + tarjetas
  de módulos con estados; cambio acotado de textos en T1.
- **Planes Demo/Full/Extra por módulo**: piloto sin cambios (simple y seguro);
  comercial con planes/límites/vistas de uso por módulo; TrazaDocs Demo ya decidido
  por módulo (DL-06/D-09); regla propuesta "máximo de los módulos" para
  `team_members` (ratificar, Q-22).

## 7. Estado del Sprint T1 revisado

Definido sin ambigüedad en `TEXTILES_T1_READY_PROMPT_REVISED.md` + roadmap +
checklist (consistentes entre sí): Parte A corrige el hero y textos; Parte B
construye el shell privado con `module_key='textiles'`, flag y activación por
`organization_modules`; una sola migración (fila de catálogo); planes por módulo
prohibidos; CPR sin cambios funcionales; sin rutas públicas definitivas de Textil;
deuda de acceso modular avanzado documentada hacia Plataforma-M1.

## 8. Validaciones finales (las 15 del encargo)

1. ✅ No se creó código. 2. ✅ No se crearon migraciones. 3. ✅ No se modificó CPR
(cero archivos fuera de `docs/modules/textiles/`; verificado por fecha de
modificación). 4. ✅ Trazaloop documentado como plataforma principal. 5. ✅ CPR
documentado como módulo. 6. ✅ Textil documentado como módulo. 7. ✅ Modelo de
acceso por módulo documentado con recomendación. 8. ✅ Rol del superadministrador
para activar módulos documentado (DL-19, matriz de permisos). 9. ✅ Diferencia
cuenta Demo / empresa Demo / módulo Demo documentada (R-24 mitigándose). 10. ✅
Prompt T1 actualizado (versión revisada; la anterior marcada superseded). 11. ✅
Roadmap actualizado (T0.2 + T1 revisado + Plataforma-M1). 12. ✅ Riesgos
actualizados (R-17…R-24). 13. ✅ Decisiones actualizadas (DL-16…DL-22). 14. ✅
Explícito que los planes por módulo NO se implementan todavía (DL-22, en prompt,
roadmap, checklist y modelo de datos §6.5). 15. ✅ Explícito qué SÍ corrige T1
(hero/textos + shell privado; Parte A/B del prompt revisado).

Verificación de lenguaje: la búsqueda de vocabulario prohibido en los documentos
nuevos solo arroja apariciones en listas de prohibición y columnas "qué NO
prometer".

## 9. Veredicto

**Listo para ejecutar el Sprint T1 revisado.**

Razón: las decisiones que gobiernan T1 (DL-01…DL-04, DL-16…DL-22) están cerradas;
el alcance de T1 sigue siendo pequeño, aislado y reversible (textos de una página
pública + shell privado + una fila de catálogo); la parte con más riesgo del nuevo
enfoque (acceso y planes por módulo) quedó explícitamente fuera de T1 y
especificada para Plataforma-M1; CPR queda protegido por las mismas reglas de
regresión y por la lista de archivos intocables. Las cuestiones abiertas nuevas
(Q-21, Q-22) bloquean Plataforma-M1, no T1.
