# Trazaloop Textil · Reporte de implementación Sprint T1

> Sprint T1 — Shell privado del módulo Textil + corrección de landing modular.
> Implementado sobre el release candidate de CPR (sprint 10D). Ejecutado según
> `TEXTILES_T1_READY_PROMPT_REVISED.md` con las precisiones del encargo operativo
> de T1 (que prevalece donde difiere; ver §8 Desviaciones).

## 1. Qué se implementó

**Parte A — Comunicación pública (plataforma):**
- Hero de `app/page.tsx`: título **"Trazaloop"** (antes "Trazaloop CPR") con el
  subtítulo de plataforma: "Plataforma modular para gestionar trazabilidad,
  documentación técnica, evidencias y preparación técnica de productos, procesos y
  cadenas de valor." Badge "Beta / lanzamiento controlado" conservado.
- Tarjetas de módulos con los textos del encargo: CPR **Disponible** (sus normas
  NTC 6632 / UNE-EN 15343 viven ahora en la tarjeta del módulo, no en el hero);
  Textil, Quality y Construcción **Próximamente** con sus descripciones.
- Comentario de cabecera del archivo corregido (el botón "Entrar" es de la
  plataforma). El metadato global (`app/layout.tsx`) ya decía "Trazaloop": sin
  cambios.

**Parte B — Shell privado de Trazaloop Textil:**
- `lib/modules/textiles.ts`: clave oficial `textiles` (DL-01), flag
  `TEXTILES_MODULE_ENABLED`, reglas puras de acceso (testeables sin BD).
- `lib/auth/require-textiles-module.ts`: guard de servidor — flag encendido +
  empresa activa validada + fila habilitada en `organization_modules` (bajo RLS);
  cualquier fallo → **404** (para quien no está habilitado, el módulo no existe).
- `app/(app)/(shell)/textiles/layout.tsx`: aplica el guard a **todo** el namespace
  `/textiles` (rutas futuras protegidas por defecto) + banda "Módulo privado en
  preparación".
- `app/(app)/(shell)/textiles/page.tsx`: placeholder honesto — estado,
  `module_key`, advertencia de no disponibilidad pública, lista de 8 futuras
  secciones (solo texto) y nota de no certificación.
- Portal `/modules`: clave de la tarjeta `"textil"` → `"textiles"`; si el flag está
  encendido **y** la organización activa tiene el módulo habilitado, la tarjeta se
  vuelve "Disponible para tu organización (privado)" y enlaza a `/textiles`; para
  el resto permanece "Próximamente" exactamente como antes. La UI nunca es la
  barrera: el guard de servidor decide.
- Migración `0070_add_textiles_module.sql`: fila del catálogo con
  **`is_available = false`** — clave para la privacidad: `create_organization`
  (0004) solo siembra módulos `is_available = true`, así que **ninguna empresa
  nueva recibe Textil automáticamente**.

## 2. Archivos

**Creados (6):**
`supabase/migrations/0070_add_textiles_module.sql` ·
`lib/modules/textiles.ts` · `lib/auth/require-textiles-module.ts` ·
`app/(app)/(shell)/textiles/layout.tsx` · `app/(app)/(shell)/textiles/page.tsx` ·
`tests/unit/textiles-module.test.ts`.

**Modificados (2 + docs):**
`app/page.tsx` (solo textos y comentario) · `app/(app)/modules/page.tsx`
(constante de tarjeta + lógica condicional de la tarjeta Textil) ·
`docs/modules/textiles/` (este reporte, roadmap, ajuste ESPR — ver §8).

**No tocados:** ninguna otra ruta, acción, dominio, migración existente, tabla de
planes, `trazadoc_*`, `package.json`, configuración de Supabase, `.env*` ni tests
existentes.

## 3. Migración

Sí: **una**, `0070_add_textiles_module.sql`. Idempotente
(`on conflict (code) do nothing`), aditiva, solo la fila `textiles` del catálogo
`modules`, sin tablas nuevas, sin tocar CPR ni planes.

## 4. Cómo operar el módulo

**Activar el feature flag (local/staging):**
```bash
# .env.local (variable de SERVIDOR: sin NEXT_PUBLIC_ a propósito)
TEXTILES_MODULE_ENABLED=true
```
Apagado o ausente ⇒ `/textiles` responde 404 para todo el mundo (default seguro).

**Habilitar una organización (operador de plataforma, SQL en Supabase):**
```sql
insert into public.organization_modules (organization_id, module_code)
values ('<ORGANIZATION_ID>', 'textiles')
on conflict (organization_id, module_code) do update set enabled = true;
-- Deshabilitar: update ... set enabled = false where ... (nunca delete)
```

**Probar `/textiles`:**
1. Flag apagado → `/textiles` = 404 aunque la organización esté habilitada.
2. Flag encendido + organización SIN fila habilitada → 404; en `/modules` la
   tarjeta sigue "Próximamente".
3. Flag encendido + organización habilitada → `/modules` muestra "Disponible para
   tu organización (privado)" y `/textiles` renderiza el placeholder.
4. La landing pública muestra "Trazaloop" y Textil "Próximamente" en todos los
   casos.

## 5. Resultados de verificación

| Verificación | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm run lint` | ✅ |
| `npm run build` | ✅ (ruta `ƒ /textiles` registrada) |
| Suites existentes (diagnostic, compliance, csv, guided, implementation, imports, team, settings, platform, trazadocs, plans, document-master, support, launch) | ✅ 14/14 — incluidas `launch` check 21 (/modules conserva CPR disponible y 3 tarjetas no disponibles) y check 22 (sin rutas `textil` singular) sin modificarlas |
| Test nuevo `npx tsx tests/unit/textiles-module.test.ts` | ✅ 11/11 (flag apagado por defecto; clave `textiles`; guard flag+habilitación+404; landing con hero "Trazaloop"; migración solo-fila; sin migraciones extra ≥0070) |

## 6. Qué quedó fuera (a propósito)

Tablas `textile_*` · diagnóstico Textil · TrazaDocs Textil · pasaporte textil ·
evidencias textiles · circularidad · `organization_module_access` /
`organization_module_subscriptions` · planes/límites por módulo · consola avanzada
empresa × módulo × plan × estado · rutas públicas definitivas de Textil ·
reestructurar CPR bajo `/cpr`. Los planes por módulo quedan documentados para el
sprint futuro **Plataforma-M1** (`TRAZALOOP_MODULE_ACCESS_MODEL.md`,
`TRAZALOOP_MODULE_PLANS_DECISION.md`, DL-22).

## 7. Riesgos y limitaciones conocidas

| Riesgo | Estado |
|---|---|
| R-17 (hero comunicaba CPR como plataforma) | **Cerrado** en este sprint. |
| RLS de `organization_modules` permite a un **admin de empresa** insertar/activar módulos de su propia organización (política de 0006, patrón CPR vigente). Con el flag encendido, un admin podría autohabilitarse Textil sin superadmin. | **Limitación conocida y aceptada para T1** (R-22): el flag de entorno permanece apagado fuera de entornos de piloto controlado, `is_available=false` evita el sembrado automático, y endurecer esa política sería modificar comportamiento CPR (prohibido en T1). La escritura exclusiva de superadmin llega con `organization_module_access` en **Plataforma-M1**. |
| No se construyó UI de consola para activar módulos | Conforme al encargo (§6: no construir consola nueva si no existe una pantalla de módulos). Activación de pilotos vía SQL del operador (§4). La consola llega con Plataforma-M1. |
| El escáner de compliance CPR veta en `docs/` cierto término genérico regulatorio (regla del Sprint 2) | Resuelto **sin tocar el test**: los 4 documentos textiles citan ahora "ESPR (UE) 2024/1781" (forma corta oficial) en lugar de la denominación larga del instrumento. Referencia intacta. |

## 8. Desviaciones respecto a `TEXTILES_T1_READY_PROMPT_REVISED.md`

1. **Sin server action ni vista de consola** para activación: el encargo operativo
   de T1 (§6) lo restringe explícitamente cuando no existe pantalla de módulos —y
   además, bajo la RLS vigente (escritura de `organization_modules` solo para
   `is_org_admin`), una acción de superadmin requeriría una RPC/política nueva, es
   decir SQL fuera de la única migración permitida. Se difiere a Plataforma-M1.
2. **Ajuste de denominación** del instrumento de ecodiseño de la UE a su forma
   corta "ESPR (UE) 2024/1781" en 4 documentos textiles, para pasar el escáner de
   compliance sin modificarlo.
3. Ningún test existente fue modificado (ni siquiera la excepción prevista 11.f:
   no hizo falta — ningún test asertaba el hero de la landing).

## 9. Confirmaciones

- ✅ **No se implementaron planes por módulo** (cero cambios a `plan_definitions`,
  `plan_limits`, `organization_subscriptions`; no existe `organization_module_access`).
- ✅ **No se crearon tablas textiles** (única migración: fila de catálogo; test 10
  lo verifica automáticamente).
- ✅ **CPR no fue modificado funcionalmente**: los dos únicos archivos existentes
  tocados son textos de la landing y la tarjeta/lógica condicional del portal;
  cero cambios en rutas funcionales, acciones, dominio, RLS, planes, TrazaDocs,
  onboarding, legal o soporte — regresión de las 14 suites en verde.
