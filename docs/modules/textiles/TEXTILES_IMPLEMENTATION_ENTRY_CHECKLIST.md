# Trazaloop Textil · Checklist de entrada a implementación (pre-T1)

> Sprints T0.1/T0.2 — Solo documentación. Checklist operativo: se verifica
> **completo** antes de escribir la primera línea de código de T1. Marcar cada ítem.
> T1 se ejecuta con `TEXTILES_T1_READY_PROMPT_REVISED.md` (la versión T0.1 quedó
> superseded).

## 0. Plataforma modular (agregado en T0.2)

Antes de iniciar T1 confirmar:

- [ ] La plataforma se llama **Trazaloop**; ningún entregable nuevo la nombra
  "Trazaloop CPR" (DL-16).
- [ ] CPR será tratado como **módulo** (disponible), con sus normas como normas del
  módulo, no de la plataforma.
- [ ] Textil será tratado como **módulo** (privado/próximamente).
- [ ] El namespace de rutas de Textil se mantiene en **`/textiles`** (DL-04).
- [ ] `module_key = "textiles"` en todo (DL-01).
- [ ] La **landing debe corregirse en T1**: hero "Trazaloop" + subtítulo de
  plataforma + tarjetas según `TRAZALOOP_PUBLIC_LANDING_AND_MODULES_COPY.md`
  (DL-17/DL-21).
- [ ] `/modules` debe mostrar los módulos con el estado correcto para cada empresa;
  en T1 solo cambia la constante de la tarjeta Textil.
- [ ] El **superadministrador conserva el control**: activación de módulos por
  empresa solo desde consola (DL-19); usuarios normales no se autohabilitan nada.
- [ ] **NO se implementan planes por módulo** en T1 (DL-22): cero cambios a
  `plan_definitions`/`plan_limits`/`organization_subscriptions`.
- [ ] La **deuda técnica de acceso modular avanzado** queda documentada
  (`TRAZALOOP_MODULE_ACCESS_MODEL.md`, `TRAZALOOP_MODULE_PLANS_DECISION.md`,
  sprint futuro Plataforma-M1 en el roadmap).
- [ ] **CPR no debe romperse**: regresión de landing, `/modules`, planes,
  onboarding y TrazaDocs CPR como criterio de salida de T1.

## 1. Repositorio

- [ ] **Rama recomendada**: crear `feature/textiles-t1-shell` desde la rama
  principal actualizada; una rama por sprint (`feature/textiles-tN-*`); merge solo
  con build y tests verdes.
- [ ] **Estado esperado del repo**: rama principal en verde (build + `tests/`
  completos) antes de ramificar; sin migraciones pendientes de aplicar en staging.
- [ ] **Archivos que SÍ se pueden tocar en T1**:
  - `app/page.tsx`: **solo textos** del hero/tarjetas y el comentario de cabecera,
    según el documento de copy (Parte A, T0.2);
  - layout raíz (`app/layout.tsx`) **solo si** su metadato nombra la plataforma
    como "Trazaloop CPR";
  - nuevos bajo `app/(app)/(shell)/textiles/**` (layout, page, dashboard placeholder);
  - nuevo `lib/auth/require-textiles-module.ts` (o equivalente);
  - nuevo `server/actions/textiles-module.ts` (activación desde consola);
  - migración nueva mínima: fila en catálogo `modules` (`code='textiles'`) —
    ninguna tabla nueva;
  - la constante visual de la tarjeta en `app/(app)/modules/page.tsx`
    (`key: "textil"` → `"textiles"`, disponibilidad condicionada) — sin cambiar la
    lógica de la página;
  - vista de configuración del módulo en la consola `app/(app)/platform/**`
    (adición, sin modificar lo existente);
  - `docs/modules/textiles/**` y la guía de plataforma en `docs/`.
- [ ] **Archivos que NO se deben tocar**: cualquier ruta funcional CPR
  (`dashboard, diagnostic, catalog, traceability, recycled-content, evidences,
  audit-support, trazadocs, imports, guided-flow, implementation`), `lib/db/*` y
  `lib/domain/*` de CPR, tablas/migraciones existentes, `package.json`,
  configuración de Supabase, variables de entorno documentadas, tests existentes,
  `plan_limits`/lógica de planes, TrazaDocs (todo `trazadoc_*` es intocable hasta T8).
- [ ] **Validaciones antes de iniciar**: `TEXTILES_T0_1_CONSOLIDATION_REPORT.md`
  con veredicto "Listo"; DL-01…DL-15 leídas por quien implementa; build local verde.

## 2. Producto

- [ ] **Definición cerrada**: módulo para **empresas de confección textil**
  (uniformes, dotaciones, moda) que centraliza trazabilidad de producto,
  composición, evidencias, evaluación de circularidad y pasaporte técnico textil
  interno. No es certificadora, no emite DPP oficial.
- [ ] **Usuario objetivo**: confeccionista pyme; roles admin/supervisor/consultor
  existentes.
- [ ] **Alcance MVP**: el de `TEXTILES_MVP_SCOPE.md` §4 (13 capacidades).
- [ ] **Exclusiones**: lista vinculante §5 (QR público, blockchain, ERP,
  certificadoras, DPP oficial, ACV, huella, marketplace, IA, auditorías, acciones
  correctivas, firma electrónica, prenda a prenda, API pública, PDF server-side,
  cálculo de contenido reciclado).
- [ ] **Lenguaje comercial permitido**: preparación, soporte documental,
  evidencias, brechas, revisión técnica interna, trazabilidad, pasaporte técnico
  (interno), índice de preparación circular.
- [ ] **Lenguaje prohibido**: certificado/certificación por Trazaloop, cumplimiento
  automático/garantizado, "DPP oficial", "válido ante autoridades", "auditoría
  aprobada", "índice de circularidad certificada", compatibilidad GS1/EPCIS actual.

## 3. Arquitectura

- [ ] **Namespace de rutas**: `/textiles` (DL-04); impresión en `(print)/textiles/`.
- [ ] **Feature flag**: flag de entorno + `organization_modules` con
  `module_code='textiles'` (DL-01/DL-02); guard en layout del namespace.
- [ ] **Organizations**: misma organización activa para CPR y Textil; nada nuevo.
- [ ] **Memberships**: mismas membresías/estados; sin membresías por módulo.
- [ ] **Roles**: admin/quality(Supervisor)/consultant existentes; sin roles nuevos;
  política documental textil (D-06) llega en T8, no en T1.
- [ ] **Plans**: sin cambios en T1; límites textiles diferidos (DL-13); Demo/Full/
  Extra intactos.
- [ ] **Legal acceptance**: mecanismo único de plataforma; sin cambios en T1.
- [ ] **Support**: tickets únicos; categoría de módulo (D-16) puede esperar a T2+.
- [ ] **Onboarding**: onboarding CPR intacto; onboarding textil llega con contenido
  (T10); T1 solo placeholder honesto.
- [ ] **TrazaDocs**: intocable en T1; motor multi-módulo es exclusivo de T8 (DL-06).
- [ ] **Maestro documental**: intocable en T1; filtrado por módulo llega en T8.

## 4. Seguridad

- [ ] **RLS esperado**: T1 no crea tablas org-scoped; la fila de `modules` sigue el
  patrón del catálogo existente; `organization_modules` ya tiene sus políticas.
  Desde T2, patrón 0024 completo en toda tabla textil (R-16).
- [ ] **Protección multiempresa**: guard de módulo **además** de
  `require-active-org`, nunca en su lugar; tests de acceso denegado sin activación.
- [ ] **Separación CPR/Textil**: lint de imports configurado en T1 (prohibido
  importar dominio de cálculo CPR desde `**/textiles/**`); namespaces separados.
- [ ] **Riesgos de module_key**: R-03 — en T1 solo aplica a la clave del catálogo
  (`textiles`, DL-01); la extensión TrazaDocs es T8.
- [ ] **Riesgos de storage**: T1 no toca storage; decisión bucket vs prefijo en T5
  (DL-14); nunca mezclar evidencias con documentos.
- [ ] **Riesgos de superadministrador**: activación de módulo solo por
  `is_platform_superadmin`; el staff no interviene datos internos salvo soporte
  autorizado (DL-15).

## 5. Normativa

- [ ] **Normas principales**: catálogo N-01…N-17 (`TEXTILES_NORMATIVE_MAPPING.md`);
  núcleo operativo: ISO 22095 (custodia), ISO 14021 (claims), ISO 3758/6330
  (cuidado), ISO 2076/1833 (fibras), ISO 59020+59004/59010 (circularidad); contexto:
  ESPR 2024/1781 y estrategia textil UE; esquemas externos: GRS/RCS/OCS/GOTS/
  OEKO-TEX; futuro: GS1 EPCIS/Digital Link.
- [ ] **Qué soporta cada norma**: matriz completa en
  `TEXTILES_NORMATIVE_TRACEABILITY_MATRIX.md` (22 áreas).
- [ ] **Qué no se debe prometer**: certificación, cumplimiento, verificación de
  tercera parte, DPP oficial, compatibilidad de interoperabilidad no implementada.
- [ ] **Textos de advertencia obligatorios** (copiar literal donde aplique):
  - General/resultados: "Esta información es de carácter preparatorio y de soporte
    documental. Trazaloop no certifica productos ni procesos, no verifica como
    tercera parte ni garantiza cumplimiento regulatorio."
  - Pasaporte: "Pasaporte técnico interno. No constituye el Pasaporte Digital de
    Producto oficial de la Unión Europea ni un documento certificado."
  - Circularidad: "Índice de preparación circular calculado con base en la
    información registrada por la empresa. No equivale a una certificación."

## 6. Sprint T1 (revisado en T0.2)

- [ ] **Objetivo**: (A) landing comunica Trazaloop como plataforma; (B) shell
  privado del módulo Textil, invisible al público, activable por superadmin.
- [ ] **Alcance permitido**: el del roadmap T1 revisado (Parte A: hero y textos de
  tarjetas; Parte B: flag, fila de catálogo, guard, layout, placeholder, tarjeta
  del portal, vista de consola, tests de acceso, build verde).
- [ ] **Alcance prohibido**: planes por módulo (DL-22), tablas textiles
  funcionales, diagnóstico, TrazaDocs Textil, datos demo, cambios funcionales CPR,
  reestructurar CPR bajo `/cpr`, rediseñar la landing, cambios a `/modules` más
  allá de la constante, cambios a planes/onboarding/TrazaDocs CPR, exposición
  pública, rutas públicas definitivas de Textil.
- [ ] **Criterios de aceptación**: (1) landing con "Trazaloop" y CPR como módulo;
  (2) usuario de org sin activación recibe 404/redirección en toda ruta
  `/textiles/*`; (3) usuario de org activada ve el shell; (4) superadmin
  activa/desactiva desde consola; (5) landing, `/modules`, planes, onboarding y
  TrazaDocs CPR sin cambios de comportamiento (regresión verde); (6) build y
  suites verdes; (7) ningún copy promete certificación ni presenta CPR como la
  plataforma.

**Regla final**: si algún ítem no se puede marcar, T1 no inicia; se documenta el
bloqueo en `TEXTILES_OPEN_QUESTIONS.md` o `TEXTILES_DECISION_LOG.md`.
