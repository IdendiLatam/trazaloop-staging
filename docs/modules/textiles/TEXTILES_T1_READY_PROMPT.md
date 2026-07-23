# Trazaloop Textil · Prompt listo para Sprint T1

> ⚠️ **SUPERSEDED (T0.2)**: NO usar este prompt para ejecutar T1. Fue reemplazado
> por `TEXTILES_T1_READY_PROMPT_REVISED.md`, que añade la corrección de la
> comunicación pública (hero "Trazaloop", DL-17/DL-21) y la prohibición explícita
> de planes por módulo (DL-22). Se conserva solo como histórico del Sprint T0.1.

> Sprint T0.1 — Este documento contiene el prompt completo para ejecutar el Sprint
> T1 en un chat futuro de Claude (o modelo equivalente) con acceso al repositorio.
> Copiar desde la línea "=== INICIO DEL PROMPT T1 ===" hasta el final.

=== INICIO DEL PROMPT T1 ===

Necesito que implementes el **Sprint T1 — Shell privado del módulo Trazaloop
Textil** sobre el repositorio de Trazaloop.

## 1. Contexto de la plataforma (CPR)

Trazaloop es una plataforma SaaS multi-tenant (Next.js App Router + Supabase) cuyo
primer módulo, Trazaloop CPR, gestiona trazabilidad de contenido reciclado
plástico. Puntos que debes respetar:

- Rutas de app en `app/(app)/(shell)/...` (dashboard, diagnostic, catalog,
  traceability, recycled-content, evidences, audit-support, trazadocs, imports,
  support, team, settings, onboarding, guided-flow, implementation), impresión en
  `app/(app)/(print)/...`, consola de plataforma en `app/(app)/platform/...`,
  portal de módulos en `app/(app)/modules/page.tsx`.
- Capas: `server/actions/*.ts` (mutaciones con guardas), `lib/db/*.ts` (consultas),
  `lib/domain/*.ts` (lógica pura), `lib/auth/*` (guards: `require-session`,
  `require-active-org`, `require-legal-acceptance`, `require-platform-staff`),
  `lib/plans/*`.
- Multi-tenancy: `organizations`, `memberships` (roles admin/quality/consultant),
  `platform_staff`; catálogo `modules` + `organization_modules`
  (`module_code`, `enabled`) para activación de módulos por organización.
- Migraciones en `supabase/migrations/` (0001–0069+). Patrón de seguridad
  obligatorio (migración 0024): RLS deny-by-default, `unique(organization_id, id)`,
  FK compuestas, triggers estándar, helpers `is_org_member`, `has_org_role`,
  `is_platform_staff`, `is_platform_superadmin`.
- La tarjeta "Trazaloop Textil" ya existe en el portal con `key: "textil"` y
  `available: false` ("Próximamente").

## 2. Contexto de Trazaloop Textil

Trazaloop Textil es el segundo módulo: preparación en trazabilidad de producto,
composición de fibras, evidencias, evaluación de circularidad y pasaporte técnico
textil para empresas de confección. Está completamente especificado en
`docs/modules/textiles/`. El módulo es **privado**: no debe ser accesible ni
visible como disponible para el público en este sprint.

## 3. Documentos que DEBES leer antes de escribir código

En `docs/modules/textiles/`:

1. `TEXTILES_IMPLEMENTATION_ENTRY_CHECKLIST.md` — verifica cada ítem; si alguno
   falla, detente y repórtalo.
2. `TEXTILES_IMPLEMENTATION_ROADMAP.md` — sección Sprint T1.
3. `TEXTILES_DECISION_LOG.md` — DL-01 a DL-15 (obligatorias: DL-01 module_key,
   DL-02 flag, DL-03 no activación pública, DL-04 ruta `/textiles`).
4. `TEXTILES_TECHNICAL_DECISIONS.md` — D-01, D-02, D-03, D-05, D-20.
5. `TEXTILES_DATA_MODEL_PROPOSAL.md` — §6.4 (regla de datos de T1).
6. `TEXTILES_RISK_REGISTER.md` — R-01, R-16.
7. `TEXTILES_PRODUCT_ARCHITECTURE.md` — mensaje y lenguaje prudente.

## 4. Alcance permitido (todo lo de esta lista y nada más)

1. **Clave de módulo**: usar `textiles` en todo (DL-01). Actualizar la constante
   visual de la tarjeta del portal de `key: "textil"` a `key: "textiles"` sin
   cambiar la lógica de la página.
2. **Catálogo**: una migración mínima que inserte la fila del módulo en el catálogo
   `modules` (`code='textiles'`, nombre "Trazaloop Textil"), siguiendo el formato
   de las filas existentes. Ninguna tabla nueva. Ningún cambio de esquema.
3. **Feature flag**: variable de entorno (p. ej. `TEXTILES_MODULE_ENABLED`) que, en
   falso, oculta cualquier rastro del módulo salvo la tarjeta "Próximamente" ya
   existente. Documentar la variable sin modificar archivos de entorno reales.
4. **Activación por organización**: usar `organization_modules` con
   `module_code='textiles'`. Server action nueva (p. ej.
   `server/actions/textiles-module.ts`) para que el **superadministrador** active/
   desactive el módulo por organización desde la consola de plataforma; añadir a la
   consola una vista/sección de configuración inicial del módulo (adición, sin
   modificar lo existente).
5. **Guard**: `lib/auth/require-textiles-module.ts` siguiendo el patrón de
   `require-active-org`: exige sesión + organización activa + aceptación legal +
   flag + módulo activado; en fallo, redirección segura (mismo destino que usan los
   guards actuales) o 404.
6. **Rutas**: `app/(app)/(shell)/textiles/layout.tsx` (aplica el guard y una
   navegación mínima propia) y `app/(app)/(shell)/textiles/page.tsx` +
   `/textiles/dashboard/page.tsx` como placeholders honestos: título, descripción
   prudente del módulo y estado "en preparación". Sin datos falsos, sin métricas
   inventadas, sin promesas.
7. **Tarjeta del portal**: para organizaciones con el módulo activado (y flag
   encendido), la tarjeta enlaza a `/textiles`; para el resto permanece exactamente
   como hoy ("Próximamente", no disponible).
8. **Tests**: (a) guard: usuario sin activación no accede a `/textiles/*`; (b)
   usuario de organización activada accede; (c) acción de activación rechazada para
   no-superadmin; (d) regresión: el portal `/modules` renderiza igual para
   organizaciones sin Textil; (e) suites existentes intactas y verdes.
9. **Documentación**: nota breve de activación del módulo en la guía de plataforma
   correspondiente en `docs/` y actualización del estado en
   `docs/modules/textiles/` si procede.

## 5. Alcance prohibido (vinculante)

- NO crear tablas textiles funcionales (`textile_*`): ver
  `TEXTILES_DATA_MODEL_PROPOSAL.md` §6.4.
- NO crear el diagnóstico (T2), catálogos (T3) ni TrazaDocs Textil (T8).
- NO tocar ninguna tabla `trazadoc_*` ni su código (TrazaDocs CPR intocable).
- NO modificar funcionalmente CPR: rutas, acciones, dominio, migraciones
  existentes, planes, onboarding, legal, soporte.
- NO modificar `package.json`, configuración de Supabase ni variables de entorno
  reales.
- NO modificar tests existentes (solo añadir).
- NO crear datos demo ni seeds de contenido.
- NO exponer el módulo públicamente ni cambiar `available` de la tarjeta para
  organizaciones sin activación.
- NO romper `/modules`, planes, onboarding, TrazaDocs CPR ni el build.
- NO usar lenguaje de certificación/cumplimiento en ningún copy (lista de lenguaje
  prohibido en `TEXTILES_IMPLEMENTATION_ENTRY_CHECKLIST.md` §2).

## 6. Estrategia técnica esperada

- Rama: `feature/textiles-t1-shell`.
- Cambios pequeños y aislados; ningún refactor oportunista.
- El guard se aplica en el layout del namespace, de modo que toda ruta futura
  `/textiles/*` quede protegida por defecto.
- La server action de activación usa `require-platform-staff`/
  `is_platform_superadmin` y registra auditoría como las acciones de consola
  existentes.
- Configura (si es viable en este repo) una regla de lint que prohíba importar
  módulos de dominio CPR de cálculo (p. ej. `lib/db/recycled*`,
  dominio de contenido reciclado) desde `**/textiles/**` (riesgo R-01).

## 7. Criterios de aceptación del sprint

1. Usuario de organización sin Textil: cualquier `/textiles/*` responde 404 o
   redirección segura; la tarjeta sigue en "Próximamente".
2. Usuario de organización activada (flag encendido): ve el shell y el placeholder.
3. Superadmin activa/desactiva el módulo por organización desde la consola.
4. `/modules`, planes, onboarding, TrazaDocs CPR y todas las rutas CPR se comportan
   exactamente igual que antes (regresión verde).
5. Build verde y todas las suites (existentes + nuevas) en verde.
6. Ningún copy nuevo contiene lenguaje prohibido.
7. La migración añadida es solo la fila de catálogo; `git diff` no toca archivos
   funcionales CPR salvo la constante de la tarjeta.

## 8. Checklist final antes de entregar

- [ ] `TEXTILES_IMPLEMENTATION_ENTRY_CHECKLIST.md` verificado al inicio.
- [ ] Alcance permitido implementado completo; alcance prohibido intacto.
- [ ] Tests nuevos cubren guard, activación y regresión del portal.
- [ ] Diff revisado archivo por archivo contra la lista "NO tocar".
- [ ] Resumen de entrega con: archivos creados/modificados, migración añadida,
  cómo activar el módulo, cómo probar el guard, confirmación de regresión CPR.

=== FIN DEL PROMPT T1 ===

## Notas de mantenimiento de este documento

- Si una DL cambia antes de ejecutar T1, actualizar el prompt en el mismo PR.
- Tras ejecutar T1, archivar este prompt marcándolo "ejecutado" y generar el
  equivalente para T2 a partir del roadmap.
