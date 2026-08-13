# PCR-02 — TEST MATRIX

> **⚠ ACTUALIZADO POR PCR-02.1 (sprint correctivo de hardening).** PCR-02
> recibió NO-GO en revisión independiente; este repositorio ya incorpora las
> correcciones. Documentos vigentes: `docs/PCR-02.1-REVIEW-FIXES.md`,
> `docs/PCR-02.1-IMPLEMENTATION-REPORT.md`, `docs/PCR-02.1-TEST-MATRIX.md`,
> `docs/PCR-02.1-PRODUCTION-DEPLOY.md` y `docs/PCR-02.1-ROLLBACK.md`. Este
> documento se conserva como registro del sprint PCR-02 original.

> **Estados superados por PCR-02.1**: los escenarios marcados aquí
> «BLOCKED — requiere BD» relativos a constraints, trigger anti-autoconsumo,
> RLS de `output_batch_consumption`, completitud e implementación fueron
> ejecutados DE VERDAD contra PostgreSQL 16 local aplicando las migraciones
> reales 0025+0104 (33 aserciones, EXIT 0): ver `docs/PCR-02.1-TEST-MATRIX.md`,
> que es la matriz vigente. Siguen BLOCKED únicamente Supabase real
> (auth/storage, `test:rls`, `test:smoke`) y navegador.

Convención de estados (heredada de la revisión PCR-01.1):

- **PASS — lógica pura ejecutada**: la lógica corrió realmente en este
  entorno con casos de entrada/salida (funciones de dominio).
- **PASS — verificación estática**: se verificó el código fuente REAL que la
  aplicación consume (SQL de la migración, cadenas de llamadas, redirects,
  selects); el candado falla si el código cambia. NO valida ejecución en
  navegador ni en BD.
- **BLOCKED — requiere BD**: exige PostgreSQL/Supabase (entorno QA).
- **BLOCKED — requiere navegador**: exige recorrido visual real.

Nada marcado «verificación estática» afirma que el comportamiento en
ejecución esté validado: triggers reales, RLS real, redirects renderizados y
recorridos solo se validan en los escenarios BLOCKED, listos para el QA del
cliente.

Comandos ejecutados en este entorno (resultados en §H):
`npm run typecheck` · `npm run lint` · `npm run build` (webpack) ·
`npm run test:all` (EXIT 0) · las 4 suites `test:pcr02-*` individualmente.

---

## A. Orden como eje (Bloques A/B) — §25.1

| # | Escenario | Estado |
|---|-----------|--------|
| A1 | Existe el detalle `/traceability/production-orders/[id]` con secciones Identificación y proceso / Materiales · lotes consumidos / Lotes producidos · salidas / evidencias, y 404 para ids ajenos | **PASS — verificación estática** (`pcr02-order-hub` §1) |
| A2 | Crear orden → aterriza en la sección de consumos del DETALLE con los textos exactos del punto 14 (PCR-01 conservado) | **PASS — verificación estática** (`pcr02-order-hub` §6; `pcr01-ux-flow` §3) |
| A3 | Registrar salida DESDE la orden: orden oculta (asociación automática, no se re-pregunta), redirect de vuelta al detalle con el lote resaltado y guía de composición | **PASS — verificación estática** (`pcr02-order-hub` §2) |
| A4 | Editar orden → confirma en el detalle («Cambios guardados correctamente.») | **PASS — verificación estática** (`pcr01-ux-flow` §5) |
| A5 | Enlaces históricos `?order=<id>` y «Ir al registro» de evidencias llegan al detalle | **PASS — verificación estática** (`pcr02-order-hub` §4; `pcr01-ux-flow` §11) |
| A6 | Recorrido real: crear orden → registrar consumos → registrar salida sin salir del contexto | **BLOCKED — requiere BD** + **navegador** |

## B. Múltiples salidas por orden (Bloque C) — §25.2

| # | Escenario | Estado |
|---|-----------|--------|
| B1 | La BD nunca limitó 1→1 (sin unique sobre production_order_id) y 0104 no añade restricciones sobre output_batches | **PASS — verificación estática** (`pcr02-internal-consumption` §6 sobre 0025 y 0104) |
| B2 | El detalle lista N salidas con contador y kg; el listado de órdenes muestra el chip de salidas | **PASS — verificación estática** (`pcr02-order-hub` §3) |
| B3 | Crear 2+ lotes producidos sobre la misma orden con datos reales | **BLOCKED — requiere BD** |

## C. Consumo interno / producto intermedio (Bloques D/E) — §25.3

| # | Escenario | Estado |
|---|-----------|--------|
| C1 | Tabla `output_batch_consumption` con regla 0024 completa: unique(org,id), unique(orden,lote), mass>0, FK COMPUESTAS (cascade orden / restrict lote), triggers estándar + auditoría, índices | **PASS — verificación estática** (`pcr02-internal-consumption` §1–3) |
| C2 | RLS idéntica a batch_consumption (4 políticas, mismos roles) | **PASS — verificación estática** (§5). Comportamiento real de RLS: **BLOCKED — requiere BD** |
| C3 | Anti-autoconsumo: trigger BD (INSERT y UPDATE) + validación server-side previa, mensaje pactado | **PASS — verificación estática** (§4). Rechazo real: **BLOCKED — requiere BD** |
| C4 | El selector de lotes consumibles excluye los de la propia orden | **PASS — verificación estática** (§9, `.neq`) |
| C5 | El lote intermedio conserva su identidad (jamás se duplica como input_batch) y muestra dónde fue consumido después | **PASS — verificación estática** (§10) |
| C6 | UI distingue los DOS orígenes (chips «Lote de entrada» / «Lote producido interno») en una sola sección de consumos, con orden productora enlazada | **PASS — verificación estática** (§9) |
| C7 | Advertencia (no bloqueo) al consumir más de lo producido | **PASS — verificación estática** (§9). Con datos reales: **BLOCKED — requiere BD** |
| C8 | Duplicado (mismo lote, misma orden) → mensaje propio vía 23505 | **PASS — verificación estática** (§8). Real: **BLOCKED — requiere BD** |
| C9 | Registrar consumo interno de extremo a extremo | **BLOCKED — requiere BD** + **navegador** |

## D. Genealogía multi-salto (Bloque F) — §25.4

| # | Escenario | Estado |
|---|-----------|--------|
| D1 | Cadena canónica: LE-1 → OP-A → INT-1 → OP-B → FIN-1 reconstruida hacia ATRÁS desde el lote final (proveedor incluido, masas correctas) | **PASS — lógica pura ejecutada** (`pcr02-genealogy` §1) |
| D2 | Hacia ADELANTE desde el lote de entrada se llega al lote final (2 saltos, etiquetas de eslabón) | **PASS — lógica pura ejecutada** (§2) |
| D3 | Hacia adelante desde un lote producido (¿dónde se reutilizó?) y caso sin reutilización | **PASS — lógica pura ejecutada** (§3) |
| D4 | Ciclo A→X→B→Y→A: el recorrido NO cuelga, visita cada nodo una vez, en ambas direcciones | **PASS — lógica pura ejecutada** (§4) |
| D5 | Cadena más larga que GENEALOGY_MAX_DEPTH (10) → truncada y marcada | **PASS — lógica pura ejecutada** (§5) |
| D6 | El recolector consulta por niveles con `.in()` acotado a la organización (jamás el universo) y la página usa el recorrido nuevo distinguiendo el eslabón interno | **PASS — verificación estática** (§6) |
| D7 | Genealogía renderizada con datos reales (multi-salto, enlaces a órdenes) | **BLOCKED — requiere BD** + **navegador** |

## E. Estados y alerta 72 h (Bloques H/I) — §25.5

| # | Escenario | Estado |
|---|-----------|--------|
| E1 | Umbral = constante de dominio 72 (sin env var); estados = los 4 reales de 0025, sin estados nuevos | **PASS — lógica pura ejecutada** (`pcr02-alerts` §1–2) |
| E2 | <72 h no alerta; >72 h alerta (draft e in_progress); cerrada/cancelada NUNCA alerta; created_at ausente no rompe | **PASS — lógica pura ejecutada** (§3–6) |
| E3 | Días y mensaje pactado («Esta orden lleva abierta X días…», singular/plural) | **PASS — lógica pura ejecutada** (§7) |
| E4 | Alerta visible en detalle (banner), listado (chip) y dashboard (línea mínima con enlace); sin correos ni cron | **PASS — verificación estática** (§9). Render real: **BLOCKED — requiere navegador** |
| E5 | Guarda server-side: consumo externo, consumo interno y creación de salida rechazan órdenes cerradas/canceladas con mensajes en español | **PASS — lógica pura ejecutada** (mensajes, §8) + **verificación estática** (3+ usos de la guarda, §10). Rechazo real: **BLOCKED — requiere BD** |
| E6 | Cerrar una orden sin salidas → aviso (no bloqueo) en el detalle | **PASS — verificación estática** (detalle) |

## F. Seguridad multiempresa (§16/§25.6)

| # | Escenario | Estado |
|---|-----------|--------|
| F1 | Cross-tenant estructuralmente imposible: FK compuestas en la tabla nueva | **PASS — verificación estática** (`pcr02-internal-consumption` §2) |
| F2 | Acciones: requireActiveOrg + checkCprCanMutate + assertSameOrg por id + borrado acotado a la empresa | **PASS — verificación estática** (§8) |
| F3 | Detalle/genealogía: toda consulta con `.eq(organization_id)` y sesión real; detalle 404 ante ids ajenos | **PASS — verificación estática** (§6 de genealogía; §1 de order-hub) |
| F4 | Empresa B no ve ni consume lotes/órdenes de la empresa A (RLS + FK reales) | **BLOCKED — requiere BD** |

## G. Regresión (§15/§22)

| # | Escenario | Estado |
|---|-----------|--------|
| G1 | Todo PCR-01/PCR-01.1 operativo: cantidad obligatoria (form/API/import), plan efectivo, evidencias, búsqueda+paginación, fijado focus, variables de proceso | **PASS** — las 5 suites `pcr01-*` en verde (expectativas del flujo de orden actualizadas al detalle, comportamiento conservado y verificado) |
| G2 | Textiles intacto | **PASS** — ~60 suites Textiles/T9E/T9F/T9G en verde en `test:all`; recorrido real: **BLOCKED — requiere BD/navegador** |
| G3 | Reciclado/completitud: el cálculo reciclado no usa consumos (0029/0030) y la vista de completitud conserva columnas | **PASS — verificación estática** (`pcr02-internal-consumption` §7) |
| G4 | Candados de integridad avanzados a baseline 0104 (prohíben 0105+) en las 10 aserciones de 6 suites | **PASS** — `test:all` EXIT 0 |

## H. Suites y comandos — resultado en este entorno

| Comando | Resultado |
|---------|-----------|
| `npm run typecheck` | ✅ sin errores |
| `npm run lint` | ✅ 0 errores (1 advertencia preexistente en `textiles-evidences-hardening.test.ts`) |
| `npm run build` (next build --webpack) | ✅ compila; incluye `/traceability/production-orders/[id]` |
| `npm run test:pcr02-alerts` | ✅ 10/10 |
| `npm run test:pcr02-genealogy` | ✅ 6/6 |
| `npm run test:pcr02-internal-consumption` | ✅ 10/10 |
| `npm run test:pcr02-order-hub` | ✅ 7/7 |
| `npm run test:all` | ✅ **EXIT 0 — 1460 verificaciones en verde** (incluye `.env.example`, presente en esta base v1.0.1) |

**Suites que exigen BD (fuera de `test:all`)**: `test:rls`, `test:*-rls*`,
`test:smoke` — **BLOCKED — requiere BD** (proyecto Supabase QA). Ejecutarlas
en la validación QA junto con TODOS los escenarios BLOCKED de esta matriz
(el guion funcional está en PCR-02-PRODUCTION-DEPLOY.md §7) antes de
declarar PCR-02 apto para producción.
