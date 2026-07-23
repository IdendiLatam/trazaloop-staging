# Trazaloop Textil · Prompt REVISADO listo para Sprint T1

> Sprint T0.2 — Este documento **reemplaza** a `TEXTILES_T1_READY_PROMPT.md`
> (conservado como histórico). Cambio principal frente a la versión T0.1: el Sprint
> T1 ahora incluye la **corrección de la comunicación pública** (hero "Trazaloop",
> DL-17/DL-21) además del shell privado de Textil. Copiar desde
> "=== INICIO DEL PROMPT T1 (REVISADO) ===" hasta el final.

=== INICIO DEL PROMPT T1 (REVISADO) ===

Necesito que implementes el **Sprint T1 — Plataforma Trazaloop en la comunicación
pública + Shell privado del módulo Trazaloop Textil** sobre el repositorio de
Trazaloop.

## 1. Contexto de la plataforma

**Trazaloop es la plataforma; Trazaloop CPR es su primer módulo, no la plataforma
completa** (DL-16). La plataforma es un SaaS modular multi-tenant (Next.js App
Router + Supabase) con módulos: CPR (disponible), Textil (en preparación, privado),
Quality y Construcción (futuros). Infraestructura compartida y separación de
dominios: `TRAZALOOP_MODULAR_PLATFORM_ARCHITECTURE.md`.

Estado técnico relevante:
- Landing pública en `app/page.tsx`: el hero dice hoy "Trazaloop CPR" con la
  descripción del módulo; las cuatro tarjetas de módulos ya existen debajo.
- Portal interno `app/(app)/modules/page.tsx` con tarjeta Textil `key: "textil"`,
  `available: false`.
- Rutas CPR en `app/(app)/(shell)/...`; impresión en `(print)`; consola en
  `app/(app)/platform/...`.
- Capas: `server/actions/*`, `lib/db/*`, `lib/domain/*`, `lib/auth/*` (guards),
  `lib/plans/*`.
- Tenancy: `organizations`, `memberships` (admin/quality/consultant),
  `platform_staff`; catálogo `modules` + `organization_modules`
  (`module_code`, `enabled`); plan **global** por empresa en
  `organization_subscriptions` (no se toca en este sprint).
- Migraciones 0001–0069+ con patrón de seguridad 0024.

## 2. Contexto de Trazaloop Textil

Segundo módulo: trazabilidad de confección, composición de fibras, evidencias,
circularidad y pasaporte técnico textil. Especificación completa en
`docs/modules/textiles/`. En este sprint el módulo es **privado**: invisible e
inaccesible para el público.

## 3. Documentos que DEBES leer antes de escribir código

En `docs/modules/textiles/`:

1. `TEXTILES_IMPLEMENTATION_ENTRY_CHECKLIST.md` — verificar TODOS los ítems
   (incluida la sección 0, plataforma modular); si alguno falla, detente y repórtalo.
2. `TRAZALOOP_PUBLIC_LANDING_AND_MODULES_COPY.md` — textos exactos del hero,
   subtítulo (usar Opción 1 salvo indicación), tarjetas y botones; lenguaje
   prohibido (§4).
3. `TEXTILES_DECISION_LOG.md` — DL-01…DL-22 (críticas: DL-01 clave `textiles`,
   DL-02/DL-03 privacidad, DL-04 ruta `/textiles`, DL-16/DL-17/DL-21 plataforma,
   DL-22 planes por módulo NO se implementan).
4. `TEXTILES_IMPLEMENTATION_ROADMAP.md` — sección Sprint T1.
5. `TEXTILES_DATA_MODEL_PROPOSAL.md` — §6.4 (regla de datos de T1).
6. `TRAZALOOP_MODULE_ACCESS_MODEL.md` y `TRAZALOOP_MODULE_PLANS_DECISION.md` —
   SOLO como contexto de lo que NO se implementa todavía (deuda documentada).
7. `TEXTILES_RISK_REGISTER.md` — R-01, R-16, R-17, R-22.

## 4. Alcance permitido (todo lo de esta lista y nada más)

### Parte A — Comunicación pública (plataforma)
1. **Hero de `app/page.tsx`**: título "Trazaloop"; subtítulo Opción 1 del documento
   de copy; conservar badge "Beta / lanzamiento controlado"; el botón "Entrar"
   pasa a ser el acceso a la plataforma (mismo destino actual: `/modules` con
   sesión, `/login` sin sesión); actualizar el comentario del archivo que lo
   describe como "Entrar de Trazaloop CPR".
2. **Tarjetas de la landing**: CPR "Disponible" con su descripción de módulo
   (incluidas sus normas NTC 6632/UNE-EN 15343, que son del módulo, no del hero);
   Textil/Quality/Construcción "Próximamente" con las descripciones del documento
   de copy. Ajuste de textos solamente: no rediseñar la página.
3. Verificar que ningún metadato/título global de la app (layout raíz) diga
   "Trazaloop CPR" como nombre de la plataforma; si lo dice, corregirlo a
   "Trazaloop".

### Parte B — Shell privado del módulo Textil
4. **Clave de módulo**: `textiles` en todo (DL-01). Actualizar la constante
   `key: "textil"` de la tarjeta del portal interno a `"textiles"` sin cambiar la
   lógica de la página.
5. **Catálogo**: una migración mínima que inserte la fila del módulo en `modules`
   (`code='textiles'`, nombre "Trazaloop Textil", descripción del documento de
   copy). Ninguna tabla nueva, ningún cambio de esquema.
6. **Feature flag**: variable de entorno (p. ej. `TEXTILES_MODULE_ENABLED`) que en
   falso oculta todo rastro del módulo salvo la tarjeta "Próximamente". Documentar
   la variable sin modificar archivos de entorno reales.
7. **Activación por organización**: usar `organization_modules`
   (`module_code='textiles'`) tal como existe — es el mecanismo vigente y
   suficiente para T1. Server action nueva (p. ej.
   `server/actions/textiles-module.ts`) para que el superadministrador
   active/desactive por organización desde la consola; vista/sección de
   configuración del módulo en la consola (adición, sin modificar lo existente).
8. **Guard**: `lib/auth/require-textiles-module.ts` (patrón `require-active-org`):
   sesión + organización activa + aceptación legal + flag + módulo activado; en
   fallo, redirección segura o 404.
9. **Rutas privadas**: `app/(app)/(shell)/textiles/layout.tsx` (guard + navegación
   mínima) y `page.tsx` + `/textiles/dashboard/page.tsx` como placeholders
   honestos ("módulo en preparación"), sin datos falsos ni promesas. Estas rutas
   NO son las rutas públicas definitivas del módulo: son el shell privado.
10. **Tarjeta del portal interno**: enlaza a `/textiles` solo para organizaciones
    activadas con flag encendido; para el resto, exactamente como hoy.
11. **Tests**: (a) guard: sin activación no hay acceso a `/textiles/*`; (b) con
    activación sí; (c) activación rechazada para no-superadmin; (d) regresión:
    `/modules` y la landing renderizan correctamente para usuarios/orgs sin Textil;
    (e) suites existentes intactas y verdes; (f) si existe test de contenido de la
    landing, actualizarlo al nuevo hero (único ajuste permitido sobre tests
    existentes, documentándolo).
12. **Documentación**: nota de activación del módulo en la guía de plataforma;
    registrar en `docs/modules/textiles/` la deuda pendiente de acceso modular
    avanzado (referencia a Plataforma-M1) si no está ya registrada.

## 5. Alcance prohibido (vinculante)

- NO implementar planes por módulo, `organization_module_access`, límites por
  módulo ni cambios a `plan_definitions`/`plan_limits`/`organization_subscriptions`
  (DL-22; eso es Plataforma-M1).
- NO crear tablas textiles funcionales (`textile_*`) — §6.4 del modelo de datos.
- NO crear el diagnóstico Textil (T2), catálogos (T3) ni TrazaDocs Textil (T8).
- NO tocar `trazadoc_*` ni su código.
- NO modificar lógica CPR: rutas, acciones, dominio, migraciones existentes,
  onboarding, legal, soporte.
- NO reestructurar CPR bajo `/cpr` (las rutas CPR quedan donde están).
- NO crear rutas públicas definitivas de Textil ni exponer el módulo.
- NO modificar `package.json`, configuración de Supabase ni variables de entorno
  reales.
- NO modificar tests existentes (única excepción: 11.f, documentada).
- NO crear datos demo ni seeds de contenido.
- NO romper `/modules`, la landing, planes, onboarding, TrazaDocs CPR ni el build.
- NO usar lenguaje prohibido (§4 del documento de copy) en ningún texto nuevo.

## 6. Archivos

**Puede tocar**: `app/page.tsx` (hero + textos de tarjetas + comentario); layout
raíz SOLO si su metadato nombra mal la plataforma; `app/(app)/modules/page.tsx`
SOLO la constante de la tarjeta Textil; nuevos archivos bajo
`app/(app)/(shell)/textiles/**`, `lib/auth/require-textiles-module.ts`,
`server/actions/textiles-module.ts`, adiciones en `app/(app)/platform/**`; una
migración nueva (fila de catálogo `modules`); `docs/**`.

**No puede tocar**: todo lo demás — en particular rutas funcionales CPR,
`lib/db/*` y `lib/domain/*` de CPR, migraciones existentes, tablas de planes,
`trazadoc_*`, `package.json`, config Supabase, `.env*`, tests existentes (salvo
11.f).

**Migraciones permitidas**: exactamente una, con el insert de la fila
`modules.code='textiles'` (formato de las filas existentes). Nada más.

## 7. Criterios de aceptación del sprint

1. La landing muestra "Trazaloop" como título con subtítulo de plataforma; CPR
   aparece como módulo Disponible; Textil/Quality/Construcción como Próximamente.
2. Ningún texto público presenta a CPR como la plataforma completa.
3. Usuario de organización sin Textil: `/textiles/*` responde 404/redirección; su
   portal no cambia.
4. Usuario de organización activada (flag encendido): ve el shell placeholder.
5. Superadmin activa/desactiva Textil por organización desde la consola.
6. `/modules`, planes, onboarding, TrazaDocs CPR y todas las rutas CPR se comportan
   igual que antes (regresión verde).
7. Build verde; suites existentes + nuevas en verde.
8. Ningún copy nuevo contiene lenguaje prohibido.
9. `git diff` limitado a los archivos del §6; la migración añadida es solo la fila
   de catálogo.

## 8. Checklist final antes de entregar

- [ ] Entry checklist (incluida sección 0) verificado al inicio.
- [ ] Parte A (comunicación pública) y Parte B (shell privado) completas.
- [ ] Deuda de acceso modular avanzado documentada y NO implementada.
- [ ] Diff revisado archivo por archivo contra "No puede tocar".
- [ ] Resumen de entrega: archivos creados/modificados, migración añadida, textos
  aplicados, cómo activar el módulo, cómo probar el guard, confirmación de
  regresión CPR y de que no se implementaron planes por módulo.

=== FIN DEL PROMPT T1 (REVISADO) ===

## Notas de mantenimiento

- `TEXTILES_T1_READY_PROMPT.md` (T0.1) queda superseded: no usarlo para ejecutar T1.
- Si una DL cambia antes de ejecutar T1, actualizar este prompt en el mismo PR.
- Tras ejecutar T1, marcarlo "ejecutado" y derivar el prompt de T2 desde el roadmap.
