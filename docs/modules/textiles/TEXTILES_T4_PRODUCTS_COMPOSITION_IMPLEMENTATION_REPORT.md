# Trazaloop Textil · Sprint T4 — Reporte de implementación
## Productos, referencias/SKU y composición estructurada

> Fecha: 2026-07-18 · Base: RC de Trazaloop CPR (migraciones ≤0069) + Textil
> T1/T2/T2.1/T3 (0070–0073). Este sprint agrega exactamente **una** migración
> (0074) y las rutas/CRUD de productos, referencias y composición. CPR no fue
> modificado funcionalmente. El módulo Textil sigue privado.

---

## 1. Qué se implementó

La base funcional de productos del módulo Textil: una empresa de confección
puede registrar **colecciones/líneas**, **productos textiles**,
**referencias/SKU**, la **composición porcentual de fibras** por referencia
(con alcance por parte del producto), los **materiales/insumos** asociados y
los **avíos/componentes** asociados, todo sobre los catálogos T3. El sistema
calcula un **estado de completitud de composición** (No iniciada / Incompleta /
Completa / Requiere revisión) sin bloquear guardados parciales y sin lenguaje
de cumplimiento. Queda lista la base para T5 (evidencias), T6 (órdenes/lotes),
T7 (circularidad), T8 (TrazaDocs Textil) y T9 (pasaporte técnico).

## 2. Archivos creados

| Archivo | Propósito |
|---|---|
| `supabase/migrations/0074_textile_products_and_composition.sql` | Las 6 tablas del sprint con RLS, triggers y FKs compuestas |
| `lib/domain/textiles-products.ts` | Enums/etiquetas, aviso obligatorio, cálculo de estado de composición, parseo de porcentajes (puro, testeable) |
| `lib/db/textiles-products.ts` | Consultas bajo RLS: listados, detalles, filas de composición y verificadores de pertenencia |
| `server/actions/textiles-products.ts` | 18 server actions (colecciones, productos, referencias, fibras, materiales, componentes) tras la triple guarda |
| `components/domain/textiles/entity-form.tsx` | Formulario cliente genérico crear/editar (reutiliza `CatalogFieldDef` de T3) |
| `components/domain/textiles/reference-association-manager.tsx` | Gestor cliente genérico de filas asociadas (agregar/editar/eliminar) |
| `components/domain/textiles/toggle-active-button.tsx` | Botón activar/desactivar genérico |
| `app/(app)/(shell)/textiles/products/page.tsx` | Listado + creación de productos; enlaces a colecciones y catálogos |
| `app/(app)/(shell)/textiles/products/collections/page.tsx` | CRUD de colecciones/líneas (reutiliza el gestor de catálogos T3) |
| `app/(app)/(shell)/textiles/products/[id]/page.tsx` | Detalle/edición de producto + referencias asociadas + crear referencia |
| `app/(app)/(shell)/textiles/references/[id]/page.tsx` | Detalle/edición de referencia + composición de fibras + materiales + componentes |
| `tests/products/textiles-products.test.ts` | Suite T4 (21 checks que cubren los 24 puntos del encargo) |
| `docs/modules/textiles/TEXTILES_T4_PRODUCTS_COMPOSITION_IMPLEMENTATION_REPORT.md` | Este reporte |

## 3. Archivos modificados (todos dentro del módulo Textil o sus tests)

| Archivo | Cambio |
|---|---|
| `lib/modules/textiles.ts` | `TEXTILES_PLANNED_SECTIONS`: "Productos, referencias y composición" sale de futuras (quedan 5) |
| `app/(app)/(shell)/textiles/page.tsx` | Tercera tarjeta "Productos textiles · Disponible" |
| `tests/unit/textiles-module.test.ts` | Instantáneas actualizadas: migraciones 0070–0074; shell con `products/` y `references/`; 5 futuras |
| `tests/diagnostic/textiles-scoring.test.ts` (check 18) y `tests/diagnostic/textiles-diagnostic-hardening.test.ts` (checks 1 y 16) | **Justificación clara**: eran checks-instantánea de T2.1 desfasados — fijaban TODAS las migraciones ≥0070 al trío de esa época (fallaban desde 0073) y buscaban nombres literales de guardas que el propio T2.1 encapsuló en `requireTextilesForAction`. Se actualizaron para verificar la garantía real: rango 0070–0072 intacto + guarda verificada siguiendo la indirección al helper. Cambios comentados en el código |
| `docs/modules/textiles/TEXTILES_IMPLEMENTATION_ROADMAP.md` | T4 marcado ✅ IMPLEMENTADO con nota de decisiones |
| `docs/modules/textiles/TEXTILES_DATA_MODEL_PROPOSAL.md` | Adenda T4 con las decisiones técnicas reales |

**No se tocó**: ninguna migración existente, ningún archivo CPR funcional,
diagnóstico Textil (salvo los 3 checks desfasados descritos), catálogos T3,
soporte, legal, onboarding, planes, storage, middleware.

## 4. Migración y tablas creadas (0074)

Seis tablas, todas org-scoped, aditivas, sin drops, con:
`organization_id not null → organizations`, `unique(organization_id, id)`,
triggers `set_updated_at` + `force_created_by` + `prevent_organization_id_change`
+ `audit_row_change`, y RLS deny-by-default.

| Tabla | Rol | Claves de negocio |
|---|---|---|
| `textile_collections` | Colecciones, líneas, temporadas, programas | `unique(org, name)`; `unique(org, code)` parcial; status draft/active/archived |
| `textile_products` | Producto textil genérico | `unique(org, product_code)` parcial; categoría (11 valores); FK compuesta → colección |
| `textile_references` | Referencia/SKU trazable | **`unique(org, sku)`**; FK compuesta → producto; `composition_status` informativo |
| `textile_reference_fiber_composition` | % de fibras por referencia y alcance | check `>0 y ≤100`; `unique(org, ref, fibra, alcance)`; FK → `textile_fiber_types` (global T3); FK compuesta opcional → material fuente |
| `textile_reference_materials` | Insumos por referencia | rol (8 valores); `%` estimado opcional con check; `unique(org, ref, material, rol)` |
| `textile_reference_components` | Avíos por referencia | rol (7 valores); overrides de separabilidad/reemplazabilidad; `unique(org, ref, componente, rol)` |

**Todas las relaciones entre tablas org-scoped usan FK compuesta
`(organization_id, x_id)`** → el cross-tenant es imposible a nivel de BD,
además de RLS y de las verificaciones de pertenencia en las actions. Las tres
tablas de asociación tienen `on delete cascade` desde la referencia (eliminar
una referencia por consola limpia su composición; la UI no expone deletes de
maestros).

Decisiones divergentes del texto sugerido (documentadas también en la adenda
del modelo de datos): default de `composition_status` = `not_started` (una
referencia recién creada no tiene fibras; `incomplete` habría sido falso);
`role` de componentes `not null default 'functional'` (un rol nullable dentro
del unique permitiría duplicados con NULL); sin unique de nombre en productos
(dos colecciones pueden repetir "Camisa Oxford"; el código sí es único).

## 5. RLS aplicado

- `select/insert/update`: `is_org_member` (plantilla de catálogos T3, como pide
  el encargo). `to authenticated` siempre; anónimos no ven nada.
- `delete` de maestros (colecciones/productos/referencias): `admin, quality`
  (idéntico a T3; la UI usa desactivación, no borrado).
- `delete` de las tres tablas de asociación: `admin, quality, consultant` —
  quitar una fila de composición hace parte de la edición normal; son los
  mismos roles de escritura de composición de CPR (0025). Nunca más débil que
  T3. Si RLS niega el borrado, la action detecta 0 filas afectadas y devuelve
  un error claro en vez de fallar en silencio.
- `organization_id` inmutable por trigger en las 6 tablas; imposible moverlo
  desde formularios porque las actions lo fijan siempre del servidor.

## 6. Modelo funcional

**Producto vs. referencia**: el producto es el genérico ("Camisa Oxford manga
larga"); la referencia/SKU es la versión comercial trazable
("CAM-OXF-ML-BLANCO") con color, rango de tallas y fit como campos simples
(sin tabla de variantes, por decisión explícita del encargo). La composición,
los materiales y los avíos cuelgan **solo** de la referencia.

**Cálculo del estado de composición** (`computeReferenceComposition`, puro):
la suma de porcentajes se evalúa **por alcance** (`component_scope`) para que
"tela principal 100 %" + "forro 100 %" no dé 200 %:

- sin filas → `not_started`;
- algún alcance > 100.5 → `needs_review` (con advertencia);
- todos los alcances con datos en **100 ± 0.5** → `complete`;
- resto → `incomplete` (con advertencia del faltante).

Nunca se bloquea el guardado por suma ≠ 100 (las empresas cargan información
parcial); la página muestra totales por alcance, chip de estado y
advertencias. El campo `composition_status` se recalcula en servidor tras cada
mutación de fibras y la página de detalle recalcula en vivo desde las filas
(el campo persistido solo alimenta listados). Reciclado/orgánico son
**declaraciones preliminares** (`*_declared`); la evidencia llega en T5.

## 7. Server actions (18)

Todas pasan por `gate()` = `requireTextilesForAction` (flag
`TEXTILES_MODULE_ENABLED` + habilitación `textiles` en `organization_modules`
+ empresa activa validada) **más** `checkOrganizationCanMutate` (modo solo
lectura de plataforma). Validación de dominio antes de la BD (nombres/SKU
requeridos y recortados, enums, porcentajes, año), verificación de que
colección/producto/referencia/material/componente pertenecen a la organización
del usuario, `organization_id` siempre del servidor, errores 23505 traducidos
a mensajes claros y errores genéricos sin filtrar detalles. **Nada usa
service_role.** Colecciones/productos/referencias: crear, actualizar,
activar/desactivar. Fibras/materiales/componentes: agregar, actualizar,
eliminar (con recálculo de estado en el caso de fibras).

## 8. Rutas y navegación

| Ruta | Contenido |
|---|---|
| `/textiles/products` | Título, subtítulo y aviso pedidos; listado con categoría/colección/estado/#referencias; creación; enlaces a colecciones y catálogos |
| `/textiles/products/collections` | CRUD de colecciones (gestor genérico T3 reutilizado) |
| `/textiles/products/[id]` | Detalle/edición del producto, activar/desactivar, referencias asociadas, crear referencia |
| `/textiles/references/[id]` | Detalle/edición de la referencia; secciones Composición de fibras (chip de estado + totales por alcance + advertencias), Materiales asociados, Avíos/componentes asociados |

Protección: guard en el layout de `/textiles` **y** `requireTextilesModule`
re-verificado en cada página (todas `force-dynamic`). `/textiles` muestra
ahora tres tarjetas disponibles (Diagnóstico, Catálogos, Productos) y 5
secciones futuras. Navegación CPR intacta.

## 9. Cómo activar en local / habilitar una organización / probar

1. `TEXTILES_MODULE_ENABLED=true` en `.env.local` (sin el flag todo `/textiles*` es 404).
2. Aplicar migraciones hasta 0074 (`npx supabase db push` o el flujo del proyecto).
3. Habilitar la organización piloto:
   `insert into organization_modules (organization_id, module_code, enabled) values ('<org>', 'textiles', true) on conflict (organization_id, module_code) do update set enabled = true;`
   *(Corrección T5.1: la tabla real usa `module_code` — no `module_key` — y no existe columna `enabled_by`.)*
4. Probar: crear una colección en `/textiles/products/collections` → crear un
   producto en `/textiles/products` → abrirlo y crear una referencia (SKU) →
   abrir la referencia: agregar fibras del catálogo (p. ej. Algodón 65 % +
   Poliéster 35 % en "Producto completo") y ver el estado pasar de No iniciada
   a Completa; probar 65 % solo (Incompleta) y 65+40 (Requiere revisión, con
   advertencia, sin bloquear); asociar un material con rol "Tela principal" y
   un avío con separabilidad. Verificar con una segunda organización que nada
   cruza empresas.

## 10. Resultados de verificación

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ sin errores |
| `npm run lint` | ✅ sin errores |
| `npm run build` | ✅ compila; las 4 rutas nuevas dinámicas |
| `npm run test:platform` / `test:plans` / `test:launch` | ✅ todo en verde |
| `npm run test:smoke` | ⚠️ requiere `.env.local` con credenciales de staging (limitación del sandbox, igual que sprints previos) |
| `npx tsx tests/unit/textiles-module.test.ts` | ✅ todo verde |
| `npx tsx tests/diagnostic/textiles-scoring.test.ts` | ✅ todo verde |
| `npx tsx tests/diagnostic/textiles-diagnostic-hardening.test.ts` | ✅ todo verde |
| `npx tsx tests/unit/textiles-catalogs.test.ts` (suite T3; el encargo la cita como `tests/catalogs/...`, pero vive en `tests/unit/` desde T3) | ✅ todo verde |
| `npx tsx tests/products/textiles-products.test.ts` | ✅ 21/21 |

La suite T4 cubre los 24 puntos del encargo: migración única y acotada, sin
órdenes/lotes/pasaporte/TrazaDocs/circularidad, CPR intocado, organization_id
+ RLS + inmutabilidad + FKs compuestas en las 6 tablas, SKU único, checks de
porcentaje, los 4 estados de composición con casos límite (99.5/100.5
inclusivos), guardas y no-service_role en actions, rutas bajo guard, enlace en
`/textiles`, y lenguaje sin certificación/cumplimiento/pasaporte oficial.

## 11. Riesgos y limitaciones conocidas

- `composition_status` persistido es informativo; un cliente malicioso con
  sesión válida podría escribirlo directo (la política de update de miembros
  lo permite). Mitigado: no otorga nada (no habilita claims ni documentos) y
  el detalle recalcula en vivo. Si en T5+ el estado condiciona algo, moverlo a
  trigger o RPC con `security definer` como en el hardening del diagnóstico.
- Sin paginación en listados (suficiente para pilotos; igual que T3).
- La edición de referencia permite mover la referencia a otro producto de la
  misma organización (útil para correcciones; la FK compuesta impide otra org).
- Sin variantes talla/color en tabla separada (decisión del encargo) y sin
  imports CSV/exportes (prohibidos en T4).
- Miembros con rol `operator` no pueden eliminar filas de asociación (RLS);
  reciben un mensaje claro y pueden editar la fila en su lugar.

## 12. Qué NO se hizo (confirmaciones)

- ❌ **No** se implementaron órdenes de confección, lotes ni trazabilidad por
  lote (T6). La migración no crea ninguna tabla de ese dominio (verificado por
  test).
- ❌ **No** se implementaron evidencias textiles (T5) ni evaluación de
  circularidad (T7).
- ❌ **No** se implementó TrazaDocs Textil (T8) ni pasaporte técnico textil
  (T9); la composición nunca se presenta como pasaporte oficial (verificado
  por test de lenguaje).
- ❌ **No** se implementaron planes por módulo, `organization_module_access`,
  `organization_module_subscriptions`, consola modular ni Plataforma-M1.
- ❌ **No** hay QR, blockchain, IA, ACV, huella de carbono, imports CSV ni PDF.
- ✅ **Textil sigue privado**: flag apagado por defecto + habilitación por
  organización + guard en layout y en cada página y action.
- ✅ **CPR queda protegido**: cero cambios funcionales; la migración 0074 no
  toca ningún objeto CPR (verificado por test); rutas y navegación CPR
  intactas; CPR no se reestructuró bajo `/cpr`.
