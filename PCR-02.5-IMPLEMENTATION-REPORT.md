# PCR-02.5 / PCR-02.5.1 · Implementation Report

## Alcance
Cuatro brechas de QA cerradas sobre la base `pcr-02.4-ready` (d0f0ae8):
**A** cantidad producida obligatoria; **B** inventario operativo de lotes de
entrada/materiales; **C** control estricto de saldos externo; **D** saldo e
inventario de lotes producidos reutilizables (modelo PCR-02); **E**
transparencia del cálculo PCR ante evidencia faltante. Sprint incremental,
conservador y reversible: 25 archivos modificados + 7 nuevos; 0001–0104
byte-idénticas; una única migración nueva (0105).

## Esquema de inventario (Bloques B/D, §24)
**Derivado, jamás almacenado**: sin tabla de stock mutable. Tres vistas en
0105, todas `security_invoker = true` (heredan la RLS de las tablas base —
mismo patrón que las vistas §4/§4b de la 0104) con `revoke public/anon` y
`grant select` solo a `authenticated`:
- `v_input_batch_inventory` — por lote de entrada: `received_kg`,
  `consumed_kg` (lateral SUM de `batch_consumption`), `available_kg` =
  recibido − consumido; incluye material, proveedor y fecha para la UX.
- `v_output_batch_inventory` — por lote producido: `produced_kg`,
  `consumed_internally_kg` (SUM de `output_batch_consumption`),
  `available_kg`; incluye orden productora y su estado.
- `v_material_inventory` — agregado por material sobre la vista por lote:
  recibido/consumido/disponible + `batches_with_balance`/`batches_total`
  (`count(*) filter (where available_kg > 0)`), agregación EN LA BASE.

Capa de datos `lib/db/inventory.ts`: `listMaterialInventory`,
`listInputBatchInventoryByMaterial`, `getInputBatchBalance`,
`getOutputBatchBalance`, `getOutputBatchInventoryByIds` — todas acotadas
(`organization_id` + `limit`), una consulta por necesidad. Dominio puro
`lib/domain/inventory.ts`: saldo, tope de edición §12, estados
Disponible/Agotado (§18: sin umbral «Bajo» inventado), `formatKg` espejo
del `trim_scale` de la BD y etiqueta de selector con saldo.

## Tratamiento de concurrencia (Bloques C/D, §11/§25)
Trigger BEFORE INSERT/UPDATE en ambas tablas de consumo que ejecuta
`SELECT … FOR UPDATE` del **lote padre** antes de sumar:
- serializa todas las escrituras de consumo de un mismo lote: la segunda
  sesión queda bloqueada en el candado de fila; al despertar (nueva
  instantánea por sentencia en READ COMMITTED) su SUM ve el consumo ya
  confirmado y rechaza;
- el UPDATE excluye la propia fila (`… and id <> new.id`, §12): editar 20
  con otros 70 sobre 100 permite hasta 30, nunca 10; cubre también mover
  el consumo de lote (valida el lote destino; el origen libera solo);
- DELETE sin guarda (§13): devolver saldo nunca lo hace negativo y el
  saldo es derivado — no existe «movimiento manual»;
- guardas de piso: `input_batches.quantity_kg` y
  `output_batches.produced_quantity_kg` no pueden caer por debajo de lo ya
  consumido (la fila del lote ya está bloqueada por el propio UPDATE y los
  triggers de consumo esperan ese candado → sin carreras cruzadas).

**Justificación frente a alternativas**: advisory locks exigen disciplina
de clave y desligan el candado del dato (frágil ante refactors);
SERIALIZABLE global impone reintentos en toda la aplicación por un
problema local. El row-lock del padre es el patrón PostgreSQL canónico:
mínimo alcance, sin deadlocks nuevos (un solo candado por operación,
siempre en el mismo orden) y demostrable — el arnés C1 lanza **dos
procesos psql reales**: A inserta 60 y retiene el candado 2 s; B intenta
60, espera y es rechazada con «Disponible: 40 kg.»; estado final 60/100 en
una fila.

Mensajes exactos del brief (con saldo `trim_scale`, errcode 23514):
consumo externo «La cantidad a consumir supera el saldo disponible del
lote. Disponible: X kg.» · interno «…del lote producido. Disponible: X
kg.» · pisos «La cantidad recibida/producida no puede quedar por debajo de
lo ya consumido…». `dbError` los deja pasar íntegros (la carrera perdedora
ve el mismo español de dominio). Capa 2: las acciones pre-validan contra
las vistas con los mismos textos; capa 1: los selectores excluyen agotados
e informan «Disponible: X kg» por opción.

## Interacción con PCR-02.4 (§16)
Los triggers nuevos se llaman `t_*_total_balance_guard`: en orden
alfabético BEFORE, `…structural_guard` ('s') dispara ANTES que
`…total_balance_guard` ('t') — sobre una orden cerrada el mensaje sigue
siendo «La orden está cerrada o cancelada. Reábrela…» (S11.G1). Anti-
autoconsumo, tenant (FK compuestas + RLS + `organization_id` en cada
consulta), genealogía, candado histórico y reapertura pura: intactos y
re-verificados por las suites previas dentro del mismo arnés.

## Bloque A (defensa en profundidad)
UI: «Cantidad producida (kg) *», `required`, `min 0.0001`, hint con la
razón de dominio. Acciones create/update: vacío → «La cantidad producida
es obligatoria.»; NaN/≤0 → «La cantidad producida debe ser mayor que 0
kg.»; el insert ya no traduce vacío a NULL. CSV: plantilla `required:
true`, validador con `OUTPUT_BATCH_QUANTITY_REQUIRED_MESSAGE` (espejo del
patrón PCR-01.1 de `quantity_kg`). BD: preflight de la 0105 que FALLA
listando hasta 5 códigos de lote inválidos («No se inventan cantidades» —
§4.3: sin depender del estado supuesto de Production) + `SET NOT NULL`
(el CHECK > 0 vive en 0025 y con NOT NULL queda pleno).

## Bloque E (metodología intacta)
Confirmado en código: `calculate_recycled_content` acumula
`v_total := v_total + comp.mass_kg;` como primera sentencia del loop,
incondicional — la masa sin evidencia PERMANECE en el denominador (§20);
el numerador solo suma bajo `counted`. La tabla ¿Cuenta?/Razón y el
dossier ya existían y se preservan. Novedad: nota «¿Por qué el porcentaje
no es mayor?» en el resumen del cálculo cuando hay masa excluida por
motivos de EVIDENCIA (`missing_origin_support`, `origin_support_not_valid`,
`invalid_reclassification_support` — jamás por clasificación, §22):
cuantifica los kg excluidos, explica que siguen en la masa total y señala
el camino (validar evidencia → recalcular). Candado unitario sobre el
orden de acumulación de 0028 para que ninguna regresión silenciosa cambie
la regla.

## Archivos
**Nuevos (7)**: `supabase/migrations/0105_…`, `lib/domain/inventory.ts`,
`lib/db/inventory.ts`, `components/domain/traceability/inventory-section.tsx`,
`tests/db/pcr02_5_assertions.sql`, `tests/db/pcr02_5_concurrency.sh`,
`tests/unit/pcr02-5-hardening.test.ts`.
**Modificados (25)**: forms, acciones de trazabilidad, `lib/db/traceability`
(selectores + comentario), validador/plantilla CSV + mensaje de dominio,
páginas de lotes de entrada/producidos y detalle del cálculo, runner y 4
fixtures del arnés (cantidades obligatorias y coherentes con la tolerancia
del 5 %), `package.json` (solo scripts) y 10 suites cuyo candado de
frontera de migraciones enumeraba «solo hasta 0104» (extendidas a la 0105
autorizada, conservando su intención y sin relajar nada más).


---

# PCR-02.5.1 · Hardening final (sin 0106)

Alcance real respecto al ZIP PCR-02.5: **15 archivos modificados, 0 nuevos,
0 eliminados** — 9 de código/tests (los listados en cada hallazgo) + los 6
documentos de este dossier. (El informe original de PCR-02.5.1 decía «9
archivos»: contaba solo código/tests; corregido en PCR-02.5.2.)

## Hallazgo 1 · Mapeo del 23514 en `updateOutputBatchAction`
El catch genérico por errcode se sustituye por discriminación semántica: la
rama de reasignación solo se activa si el mensaje contiene «consumido por
otra orden» (texto del trigger 0104 §2b); cualquier otro 23514 —en
particular el piso «La cantidad producida no puede quedar por debajo de lo
ya consumido internamente del lote. Consumido: X kg.»— fluye por `dbError`,
cuya allowlist exige errcode 23514 **y** frase de dominio conocida: los
pisos y saldos llegan íntegros, todo lo demás sigue oculto tras el mensaje
genérico. El catch análogo del DELETE de órdenes se analizó y se conserva:
la 0105 no añade ningún trigger a ese camino (diff mínimo, documentado).

## Hallazgo 2 · Búsqueda y paginación server-side del inventario
Parámetros propios sin colisión con la lista principal: `inv_q` e
`inv_page` (tabla agregada por material) e `inv_lot_page` (saldo por lote),
`pageSize` fijo 20 (`INVENTORY_PAGE_SIZE`, dominio puro con
`normalizeInventoryPage` tolerante a basura), `count: "exact"`, «página X
de Y» y navegación anterior/siguiente visibles en ambas tablas, término
`ilike` saneado. La selección `inventario=<id>` se resuelve con
`getMaterialInventoryById` (una fila, acotada al tenant): el detalle abre
aunque el material no esté en la página actual, y una selección inválida
se comunica en lugar de silenciarse. Los parámetros de la lista principal
de lotes (q, supplier, material **y su página**) viajan en los enlaces y
como hidden inputs del formulario de búsqueda. La estructura §6 (lista →
inventario → importación) no cambia.

## Hallazgo 3 · Preflight fail-closed del sobreconsumo histórico
La 0105 añade dos preflights (externo: Σ `batch_consumption` >
`quantity_kg`; interno: Σ `output_batch_consumption` >
`produced_quantity_kg`) que abortan con errcode 23514 indicando la cantidad
de lotes y hasta 5 `batch_code` de ejemplo, con la promesa explícita: no se
corrigen cantidades, no se borran consumos, no se inventa stock.

**Ventana de concurrencia — diseño final PCR-02.5.2** (sustituye al
párrafo original de 02.5.1, que embebía `begin/commit` en el archivo): la
0105 **no contiene transaction control top-level**. El runner de
migraciones de Supabase CLI administra por sí mismo transacciones/batches
y el historial, y un COMMIT manual embebido tiene antecedentes de
interacción problemática con él — la afirmación anterior («el begin propio
es un aviso inocuo») se retira. La atomicidad la garantiza SIEMPRE el
ejecutor: la gestión transaccional del CLI en despliegues, y
`psql --single-transaction` en el arnés local (sus TRES invocaciones de la
0105: los dos escenarios legacy y la aplicación real). La `LOCK TABLE …
IN SHARE ROW EXCLUSIVE MODE` de las cuatro tablas sigue siendo la PRIMERA
operación de protección —antes de cualquier preflight y dentro de la
transacción del runner—, cerrando la ventana entre verificación e
instalación de triggers; una única sentencia de adquisición → sin
interbloqueos propios. Sobre lecturas, con prudencia: el SRE no frena el
ACCESS SHARE de un SELECT, pero el DDL posterior (`SET NOT NULL`) puede
exigir brevemente candados más fuertes — migración corta y ventana de
baja actividad, sin prometer cero bloqueo de lecturas. Compatibilidad
transaccional verificada y blindada por candado (H3.1b): sin `CREATE
INDEX CONCURRENTLY`, `VACUUM`, `ALTER SYSTEM` ni `CREATE/DROP DATABASE`.

Demostración con el runner real (pasos nuevos): 4a LEGACY-EXT-INVALID
(100 recibidos / 101 consumidos sembrados ANTES de la 0105 → la migración
FALLA con el mensaje y el lote literales); 4b LEGACY-INT-INVALID (50
producidos / 51 internos → FALLA); 4c LEGACY-VALID (saldo exacto 100/100 y
50/50 → aplica y las vistas arrancan sin negativos).

## Extra de la revisión · RLS en ambos sentidos
S11.G2 demuestra simultáneamente own-tenant visible (el admin de la
empresa A ve sus lotes, sus producidos y su agregado bajo `authenticated`)
y cross-tenant invisible (la empresa B ve 0 filas en las tres vistas).
