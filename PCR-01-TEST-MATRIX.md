# PCR-01 — TEST MATRIX (revisada en PCR-01.1)

Convención de estados (corregida por la revisión independiente):

- **PASS — lógica pura ejecutada**: la lógica se ejecutó realmente en este
  entorno (funciones de dominio con casos de entrada/salida).
- **PASS — verificación estática**: se verificó el código fuente REAL que la
  aplicación consume (imports, cadenas de llamadas, redirects, SQL de la
  migración); el candado falla si el código cambia. NO valida ejecución en
  navegador ni en BD.
- **BLOCKED — requiere BD**: exige PostgreSQL/Supabase (QA/staging).
- **BLOCKED — requiere navegador**: exige recorrido visual real (scroll,
  anclas, pestañas, popups).
- **N/A** — fuera del alcance del sprint.

Nada marcado «verificación estática» afirma que el comportamiento en
ejecución esté validado: scroll, anclas, navegación real, RLS real y triggers
reales solo se validan en los escenarios BLOCKED.

Comandos ejecutados en este entorno (resultados en §J):
`npm run typecheck` · `npm run lint` · `npm run build` (webpack) ·
`npm run test:all` · las 5 suites `test:pcr01-*` individualmente.

---

## A. Evidencias — ver archivo (punto 1)

| # | Escenario | Estado |
|---|-----------|--------|
| A1 | La acción 👁 Ver evidencia existe en /evidences, en evidencias vinculadas de registros y en soportes de materiales | **PASS — verificación estática** (`pcr01-ux-flow` §6–7) |
| A2 | La URL se firma bajo demanda, TTL 600 s, con la sesión real y verificación multiempresa explícita en el código | **PASS — verificación estática** (`pcr01-ux-flow` §6) |
| A3 | Apertura real en pestaña nueva (PDF/imagen) sin descarga forzada | **BLOCKED — requiere navegador** |
| A4 | Empresa B no puede abrir evidencia de la empresa A (id manipulado); RLS Storage bloquea la firma | **BLOCKED — requiere BD** |
| A5 | La URL firmada expira a los 10 min | **BLOCKED — requiere BD** (Storage real) |

## B. Flujo de creación (punto 2) y edición (punto 7)

| # | Escenario | Estado |
|---|-----------|--------|
| B1 | Las server actions de crear obtienen el id y redirigen a `?created=<id>#ancla` (lote, orden, lote producido, 4 entidades de catálogo) | **PASS — verificación estática** (`pcr01-ux-flow` §4 sobre las actions reales) |
| B2 | Las páginas renderizan banner + resaltado + chip para el id confirmado, y (PCR-01.1) el registro se fija aunque quede fuera de la página | **PASS — verificación estática** (`pcr01-ux-flow` §5, §10) |
| B3 | Editar redirige a `?updated=<id>#ancla`, cierra la edición y la página muestra «Cambios guardados correctamente.» | **PASS — verificación estática** (`pcr01-ux-flow` §5) |
| B4 | Recorrido visual real: scroll al ancla, resaltado visible, formulario reseteado | **BLOCKED — requiere navegador** |
| B5 | Redirect + render reales con datos (el id insertado existe y la página lo resuelve) | **BLOCKED — requiere BD** |

## C. Búsqueda + paginación (punto 9)

| # | Escenario | Estado |
|---|-----------|--------|
| C1 | Normalización de `q`/`page`, rangos, clamp, saneamiento `,()%_`, resumen X–Y de Z | **PASS — lógica pura ejecutada** (`pcr01-ux-flow` §1–2) |
| C2 | Los 8 listados usan consulta paginada en servidor (`range`+`count`, 20/página) con búsqueda; sin listas ilimitadas | **PASS — verificación estática** (`pcr01-ux-flow` §8) |
| C3 | Editar/expandir/enfocar un registro fuera de la página se resuelve por id (getter) y se fija sin duplicar (PCR-01.1) | **PASS — verificación estática** (`pcr01-ux-flow` §9–10) |
| C4 | Rendimiento y corrección con cientos/miles de filas reales | **BLOCKED — requiere BD** |
| C5 | Filtros proveedor/material se conservan al buscar/paginar | **PASS — verificación estática** (hiddenParams/extraParams); recorrido: **BLOCKED — requiere navegador** |

## D. Cantidad obligatoria del lote (punto 10 + PCR-01.1)

| # | Escenario | Estado |
|---|-----------|--------|
| D1 | Vacía / 0 / negativa / no numérica → rechazo con el mensaje EXACTO; decimal >0 aceptada; demás obligatorios sin regresión | **PASS — lógica pura ejecutada** (`pcr01-input-batch-quantity` §1–7 sobre `validateInputBatchValues`) |
| D2 | La server action de crear/editar usa esa validación y persiste `Number(...)` | **PASS — verificación estática** (§8) |
| D3 | El formulario marca el campo obligatorio (required, sin «(opcional)») | **PASS — verificación estática** (§9) |
| D4 | Importador REAL de la página (`ImportWizard` → `server/actions/import.ts`): vacío/0/negativo/no numérico rechazados con el mensaje canónico en validación Y en la revalidación pre-commit; el commit no mapea vacío→NULL; ayuda del wizard actualizada | **PASS — verificación estática** (`pcr01-input-batch-quantity` §12, candado del flujo real). Importación ejecutada de un CSV real: **BLOCKED — requiere BD** |
| D5 | Motor `lib/imports/*` (plantillas/validadores) también exige la cantidad | **PASS — lógica pura ejecutada** (la suite `imports` existente ejecuta el validador) + **PASS — verificación estática** (§11) |
| D6 | Trigger 0103: INSERT con NULL/0/negativo rechazado (BD real) | **BLOCKED — requiere BD** (candado estático del SQL: §10) |
| D7 | Trigger 0103 (PCR-01.1): UPDATE válido→NULL/0/negativo rechazado; legacy NULL→NULL editando otro campo permitido; NULL→válido permitido (BD real) | **BLOCKED — requiere BD** (candados estáticos de los 5 escenarios: §10) |
| D8 | Lote legacy con NULL visible con aviso y editable | **PASS — verificación estática** (aviso en la página); con datos reales: **BLOCKED — requiere BD** |

## E. Trazabilidad bidireccional de evidencias (punto 11 + PCR-01.1)

| # | Escenario | Estado |
|---|-----------|--------|
| E1 | Registro→Evidencia: las 7 páginas listan evidencias vinculadas (consulta por página, con Ver) | **PASS — verificación estática** (`pcr01-ux-flow` §7) |
| E2 | Evidencia→Registro: «Utilizada en (n)» con tipo, etiqueta, rol; el código resuelve etiquetas por tipo en lote e incluye las FKs de materiales | **PASS — verificación estática** (`pcr01-ux-flow` §7). Resolución con datos reales (0, 1 y n usos): **BLOCKED — requiere BD** |
| E3 | «Ir al registro» navega al registro CONCRETO (`focus`/`order`/`batch` + ancla), nunca al listado genérico (PCR-01.1) | **PASS — verificación estática** (`pcr01-ux-flow` §11, con candado anti-regresión) |
| E4 | El enlace efectivamente muestra EL registro (fijado + resaltado) al hacer clic | **BLOCKED — requiere navegador** (+ BD para los datos) |

## F. Variables de proceso (punto 13)

| # | Escenario | Estado |
|---|-----------|--------|
| F1 | Vacío/una/varias; canónico; legacy plano SIN pérdida; anidado/malformado conservado; validación ES; serialización y roundtrip; resumen legible | **PASS — lógica pura ejecutada** (`pcr01-process-variables` §1–10) |
| F2 | El formulario usa el editor (sin JSON crudo) y la action valida/serializa server-side con keep_legacy | **PASS — verificación estática** (§11) |
| F3 | Guardado/lectura real contra BD (roundtrip JSONB) y edición en navegador | **BLOCKED — requiere BD** / **BLOCKED — requiere navegador** |

## G. Flujo orden → consumos (punto 14)

| # | Escenario | Estado |
|---|-----------|--------|
| G1 | Crear orden redirige a `#consumos-<id>` y la página contiene los DOS textos exactos + encabezado «Materiales / lotes consumidos» | **PASS — verificación estática** (`pcr01-ux-flow` §3) |
| G2 | Consumo confirma («Consumo registrado correctamente.») y permite encadenar | **PASS — verificación estática**; recorrido: **BLOCKED — requiere navegador** |
| G3 | Flujo análogo lote producido → composición | **PASS — verificación estática** |

## H. Bug Demo→Full (punto 16)

| # | Escenario | Estado |
|---|-----------|--------|
| H1 | Causa raíz corregida en la fuente: 0103 define el plan efectivo, la RPC lo usa y los helpers server lo consultan (fail-closed) | **PASS — verificación estática** (`pcr01-effective-plan` §1–5, §8–10 sobre SQL y TS reales) |
| H2 | Mensajes y estado administrativo suspended/cancelled conservados en la RPC | **PASS — verificación estática** (§6) |
| H3 | Caso A: Demo bloquea invitar/aceptar | **BLOCKED — requiere BD** |
| H4 | Caso B: Demo→Full habilita invitar de inmediato | **BLOCKED — requiere BD** |
| H5 | Caso C: el invitado acepta y entra con su rol | **BLOCKED — requiere BD** |
| H6 | Caso D: Full→Demo re-aplica restricciones | **BLOCKED — requiere BD** |
| H7 | Caso E: sin dependencia de sesión/caché (lectura por request; sin caché cliente del plan) | **PASS — verificación estática**; con sesiones reales: **BLOCKED — requiere BD** |
| H8 | Sin plan nuevo; Full≡Extra salvo almacenamiento; autorización de la RPC de lectura | **PASS — verificación estática** (§4, §7, §11) + suites T9F en verde; RLS real: **BLOCKED — requiere BD** |

## I. Nomenclatura PCR y regresión

| # | Escenario | Estado |
|---|-----------|--------|
| I1 | «Trazaloop PCR» en catálogo, shell y superficies visibles; barrido sin «Trazaloop CPR» visible (excepción legal documentada) | **PASS — lógica pura ejecutada** (catálogo importado y evaluado) + **PASS — verificación estática** (barrido del árbol) |
| I2 | Identificadores técnicos intactos (module_code, key, route group, TrazaDocs, normas) | **PASS — verificación estática** (`pcr01-nomenclature` §2–3, §7) |
| I3 | Textiles sin regresión | **PASS — lógica pura/estática** (~60 suites Textiles/T9E/T9F/T9G en verde); recorrido real: **BLOCKED — requiere BD/navegador** |
| I4 | Suites existentes actualizadas por el cambio de producto (nombre + candados de migración → baseline 0103, prohibiendo 0104+) | **PASS — verificación estática** (detalladas en el informe) |

## J. Suites y comandos — resultado en este entorno (tras PCR-01.1)

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | ✅ sin errores |
| `npm run lint` | ✅ 0 errores (1 advertencia preexistente) |
| `npm run build` (next build --webpack) | ✅ compila; todas las rutas |
| `npm run test:pcr01-effective-plan` | ✅ 11/11 |
| `npm run test:pcr01-input-batch-quantity` | ✅ 12/12 (incluye candados PCR-01.1 blockers 1–2) |
| `npm run test:pcr01-process-variables` | ✅ 11/11 |
| `npm run test:pcr01-nomenclature` | ✅ 7/7 |
| `npm run test:pcr01-ux-flow` | ✅ 11/11 (incluye candados PCR-01.1 blockers 3–4) |
| `npm run test:all` | En verde salvo 3 comprobaciones que leen `.env.example` |

**Sobre esas 3 comprobaciones** (24d, 72 y 102 de `v1-release`): leen
`.env.example`, excluido del ZIP de origen por la regla `.env.*` del propio
cliente. El archivo existe en su repositorio local, donde pasarán tras
integrar la rama. Estado: **BLOCKED — archivo excluido del ZIP** (no es
regresión de PCR-01/PCR-01.1; no se reconstruyó para no inventar el contrato
de entorno).

**Suites que exigen BD (fuera de `test:all`)**: `test:rls`, `test:*-rls*`,
`test:smoke` — **BLOCKED — requiere BD** (staging del cliente pausado).
Ejecutarlas en QA junto con todos los escenarios BLOCKED de esta matriz antes
de declarar PCR-01 apto para producción.
