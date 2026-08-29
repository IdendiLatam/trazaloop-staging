# PCR/TEXTILES PRE-INTEGRATION · Cierre

**Rama:** `feature/pcr-textiles-pre-integration`
**Cabecera de migraciones:** 0148 · **Local** 0148 · **Staging** 0148 · **Production** 0111
**Fecha de cierre:** 2026-08-29

---

## Validación humana: P1–P8 PASS

| | Prueba | Resultado |
|---|---|---|
| P1 | Temporalidad de la evidencia | **PASS** |
| P2 | Elegibilidad de la evidencia | **PASS** |
| P3 | Confirmación de la asociación | **PASS** |
| P4 | Contenido reciclado | **PASS** |
| P5 | Inventario de materia prima | **PASS** |
| P6 | Inventario de producto terminado | **PASS** |
| P7 | Independencia del módulo Textiles | **PASS** |
| P8 | Búsqueda y paginación | **PASS** |

**Blockers: 0 · Product gaps: 0.**

---

## Lo que queda congelado

Nueve decisiones. Cada una tiene su regresión; si alguna se rompe, falla una
prueba con nombre, no un comportamiento en producción.

### 1 · Una sola metodología de contenido reciclado

Canónica: **RC-6632-15343 versión 2**. La resuelve
`recycled_content_canonical_methodology()` por **código y versión
explícitos** — nunca por `is_active`, «la última» ni `max(version)`. Esa
forma de elegir fue el defecto: cuando 0144 desactivó la versión 1, el motor
antiguo siguió ejecutando su código estampando reglas ajenas.

```
NUMERADOR    Σ consumo_real_i × φ_i
DENOMINADOR  Σ consumo_real_i
% reciclado  NUMERADOR / DENOMINADOR × 100
```

El motor anterior está **borrado**. Un disparador `before insert` rechaza
cualquier cálculo que apunte a otra metodología. La interfaz no habla de v1/v2.

### 2 · No hay composición manual

`batch_composition` quedó **de solo lectura**: sin políticas de escritura y
sin privilegios para `anon` ni `authenticated`. No hay formulario, ni
importador, ni acciones, ni paso, ni llamada a la acción. La tabla y sus filas
se conservan porque seis vistas las leen.

### 3 · Aplicabilidad histórica de la evidencia

Una evidencia hoy obsoleta puede sostener un lote antiguo si era aplicable en
su `received_date`. La escritura entra **exclusivamente** por
`evidence_link_confirm()`, que comprueba empresa, aceptación interna,
vigencia contra la fecha del destino y confirmación humana, y congela el
snapshot de aplicabilidad. Reconfirmar **no** duplica ni reescribe: el
duplicado se busca con `is not distinct from`, porque el índice único trata
los NULL como distintos y `on conflict` nunca disparaba con `link_role`
nulo.

### 4 · Una sola definición de «lote completo»

`outputBatchReadiness()`, y la normalización vive en el punto de ENTRADA
(`getCompleteness`), no en cada pantalla. La composición **no** participa. El
producto tampoco: `product_id` es opcional y no bloquea nada. Tablero,
listado, ficha y dossier dicen lo mismo del mismo lote.

### 5 · Semántica del inventario

```
disponible = producido − reproceso interno − salidas vigentes + ajustes vigentes
techo      = producido − reproceso − despachos − mermas − uso interno
```

El sentido no se pregunta: despacho, uso interno y merma restan siempre. El
recuento pide **lo que se contó** y guarda el conteo y el teórico congelado; la
diferencia se deriva y un CHECK obliga a que el trío cuadre. Anular es corregir
a cero, con el mismo linaje. Nunca «Eliminar». Un saldo negativo se enseña como
anomalía, no se recorta.

### 6 · No hay doble salida

`output_batch_available_kg()` es la **única** fuente, y la usan el guardián de
movimientos, el de reproceso, la vista, el selector y la guarda previa. Ambos
guardianes toman `for update` sobre la fila del lote, así que un despacho y un
reproceso simultáneos hacen cola. Comprobado con dos conexiones reales.

### 7 · Inventario por producto

`v_product_stock`, derivada de la vista de lotes, agrupada por
`(empresa, producto, unidad)`. Sin tabla de existencias. Los lotes sin
producto se agregan aparte para que el total no mienta por defecto.

### 8 · Independencia de Textiles

Una organización con Textiles y sin PCR recorre su módulo entero sin caer en el
shell de PCR. PCR no funciona como respaldo implícito.

### 9 · Paginación y búsqueda en servidor

Orden fijo: inquilino → filtros → búsqueda → conteo → orden → rango. Nada de
filtrar en cliente una página parcial. Las exportaciones recorren el conjunto
completo, paginado.

---

## Migraciones del sprint

| | Qué |
|---|---|
| 0142 | Integridad de la evidencia: catálogo, verdad histórica, escritura solo por RPC |
| 0143 | Textiles: unidades y concurrencia |
| 0144 | Contenido reciclado v2 (fundación) |
| 0145 | Textiles: saldo de materia prima |
| 0146 | Movimientos de lote producido |
| 0147 | Consolidación en una sola metodología |
| 0148 | Endurecimiento de la semántica del inventario |

Ninguna migración histórica fue modificada (verificado con `git diff --name-status`:
todas las del sprint aparecen como **A**, ninguna como **M**). Ningún
`drop … cascade` ejecutable en las siete. No hay 0149.

---

## Diferido / por diseño

- **Residuo de cálculos QA pre-release** en Staging. Procedimiento duradero en
  `qa/QA_RESIDUAL_CALCULATIONS_CLEANUP.sql`, con precheck, parada de
  seguridad, limpieza acotada y postcheck. **No ejecutado en este cierre**: son
  filas inertes de fixtures y no bloquean nada.
- **Inventario de producto terminado en Textiles**, hasta decidir la semántica
  multiunidad. Sus lotes de salida no tienen reproceso interno, así que la
  doble salida no puede ocurrir allí.
- **Rutas raíz globales de PCR**: no se refactorizan preventivamente.
- **Sin conversión automática de unidades**, en ningún módulo.
- **El saldo de materia prima solo refleja movimientos modelados**: recibido
  menos consumido en producción. La pantalla lo declara y dice lo que *no*
  contempla.
