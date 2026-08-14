# PCR-02.5 / PCR-02.5.1 / PCR-02.5.2 · Review Fixes

| Brecha | Reproducida | Causa | Corrección | Test |
| --- | --- | --- | --- | --- |
| A · Cantidad producida «opcional» | ✅ Etiqueta literal en el form; acciones vacío→NULL; columna nullable; CSV opcional | El modelo 0025 nació con la cantidad opcional y ninguna capa la endureció | 3 capas: form `required` + mensajes («La cantidad producida es obligatoria.» / «…mayor que 0 kg.»); acciones rechazan vacío/NaN/≤0; CSV obligatoria (plantilla+validador+mensaje); 0105 preflight fail-closed (**lista lotes inválidos, jamás inventa cantidades**) + `NOT NULL` (CHECK>0 ya en 0025) | S11.A1 (BD), unit A1–A4, imports.test |
| C · Sobreconsumo externo | ✅ BD real: lote 100 → insert 60+40+1 permitido antes del fix; update 60→101 permitido | Ninguna capa conocía el saldo | Trigger `t_batch_consumption_total_balance_guard` (BEFORE I/U, `FOR UPDATE` del lote, suma excluyendo `bc.id <> new.id` §12, mensaje con `trim_scale`) + pre-chequeo en add/updateBatchConsumptionAction + selector sin agotados con saldo | S11.E1–E5, C1, unit C1–C3/C7/C9 |
| C' · Piso del lote (hallazgo propio) | ✅ `update input_batches set quantity_kg=50` con 80 consumidos → permitido | El saldo también se rompe reduciendo el recibido | `t_input_batches_total_balance_guard` («…no puede quedar por debajo de lo ya consumido…») y equivalente en `output_batches` para el consumo interno | S11.P1/P2, unit C4 |
| D · Sobreconsumo interno | ✅ Lote producido 50 → consumos 30+20+1 permitidos antes del fix | El modelo PCR-02 de consumo interno nació sin saldo | Trigger espejo sobre `output_batch_consumption` (mensaje «…del lote producido…»), pre-chequeo en addOutputConsumptionAction, selector interno sin agotados (conserva `.neq` anti-autoconsumo), saldo visible en el listado §15 | S11.I1–I4, unit C1/C7/C9/B7 |
| C/D · Carrera concurrente | ✅ Diseño: dos sesiones leen 100 y escriben 60+60 | READ COMMITTED sin serialización | `SELECT … FOR UPDATE` del lote padre dentro del trigger: la 2.ª sesión espera el commit y su SUM ve lo confirmado → rechaza. `dbError` deja pasar íntegro el 23514 de saldo para la perdedora | **C1 real: dos procesos psql simultáneos** |
| E · Porcentaje sin explicación | ✅ El resumen mostraba % sin decir por qué la masa elegible no cuenta | La explicación vivía solo fila a fila en la tabla | Nota «¿Por qué el porcentaje no es mayor?»: masa excluida por evidencia (solo motivos de EVIDENCIA §22), permanencia en el denominador (§20) y ruta para corregir. Metodología y `EXCLUSION_LABEL` intactos; denominador confirmado en 0028 y blindado por candado | unit E1–E3 |

## Revisión adversarial §35 — 13/13 cerradas
1 «¿101 de 100 por API?» → NO (S11.E2/E4). 2 «¿60+60 simultáneos?» → NO
(C1 real). 3 «¿Editar y superar saldo?» → NO (S11.E4; tope excluye la
propia fila). 4 «¿Superar stock interno?» → NO (S11.I2/I3). 5 «¿Cantidad
NULL?» → NO (S11.A1 + acción + form). 6 «¿Cantidad 0?» → NO (ídem).
7 «¿Inventario ajeno?» → NO (S11.G2: 0 filas bajo `authenticated` en las 3
vistas). 8 «¿Orden closed muta consumos con las acciones nuevas?» → NO
(las nuevas rutas leen; las escrituras conservan `assertOrderAcceptsMutations`
y en BD el structural guard dispara ANTES — S11.G1 con el mensaje PCR-02.4
intacto). 9 «¿Reabierta conserva `history_locked_at`?» → SÍ (S10.6, sigue
en el arnés). 10 «¿Delete devuelve saldo?» → SÍ (S11.E5/I4). 11 «¿El
material sin evidencia desaparece del denominador?» → NO (0028 línea del
loop incondicional + candado E1 + fórmula intacta). 12 «¿Se tocó
Demo/Full/Extra?» → NO (17 archivos de planes revisados por hash frente al
ZIP base: 0 cambios; la 0105 no contiene `effective_plan`/`organization_modules`/
`organization_subscriptions`). 13 «¿Alguna 0001–0104 modificada?» → NO
(byte a byte frente al ZIP base: 0 diferencias).


---

# PCR-02.5.1 · Hardening final (revisión adversarial independiente)

| Hallazgo | Reproducido | Causa | Corrección | Test |
| --- | --- | --- | --- | --- |
| 1 · `updateOutputBatchAction` convertía CUALQUIER 23514 en «El lote producido ya fue consumido por otra orden…» | ✅ Código: `error.code === "23514" \|\|` en la rama final del UPDATE. Caso: lote 50 con 30 consumidos internamente, orden ABIERTA, editar cantidad 50→20 → la BD lanza el piso 0105 y el usuario leía la mentira de reasignación | El catch nació en PCR-02.1 cuando el único 23514 posible en ese camino era la reasignación; la 0105 añadió el piso de cantidad (23514 legítimo distinto) | Se elimina el catch por errcode: la reasignación se discrimina SOLO por su mensaje de dominio («consumido por otra orden», 0104 §2b); el resto fluye por `dbError`, cuya allowlist (23514 **y** frase de dominio) entrega íntegros los pisos y saldos y sigue ocultando cualquier otro SQL. La captura análoga del DELETE de órdenes (línea ~501) se analizó y NO se toca: en ese camino el único 23514 alcanzable sigue siendo el del historial (la 0105 no añade triggers a ese flujo) — diff mínimo | Unit H1.A/H1.B/H1.C; conductual: el mensaje del piso llega literal desde la BD (S11.P2) y `dbError` lo deja pasar (candado C8) |
| 2 · Inventario truncado silenciosamente (límites duros 200/100 sin búsqueda, paginación, total ni aviso) | ✅ Código: `limit = 200` / `limit = 100` y componente sin controles — el material 201 y el lote 101 eran inalcanzables y la UI parecía completa | La primera iteración privilegió el caso pequeño y dejó el truncamiento sin señalizar | Búsqueda y paginación SERVER-SIDE propias del inventario: `inv_q` + `inv_page` (agregado) e `inv_lot_page` (detalle), `pageSize` 20 del dominio, `count: "exact"`, total y «página X de Y» visibles, navegación anterior/siguiente, término saneado; el material seleccionado por URL se resuelve por consulta puntual (`getMaterialInventoryById`), de modo que el detalle abre aunque no esté en la página actual; los parámetros de la lista principal (q, supplier, material y su página) se conservan en enlaces y formulario. Sin universos completos y sin sumar en cliente | DB S11.G4 (25 materiales → 20+5 con total exacto; ilike; 24 lotes → 20+4; resolución fuera de página); unit H2.1–H2.4 (dominio real de la normalización de página incluido) |
| 3 · La 0105 no verificaba el sobreconsumo HISTÓRICO: podía activar el inventario con `available_kg < 0` desde el minuto uno | ✅ Diseño: los triggers solo protegen el futuro; un consumido 101 sobre 100 previo a la migración pasaba el preflight original | El preflight solo auditaba `produced_quantity_kg` | Doble preflight fail-closed en la MISMA 0105 (externo: Σ consumos > recibido; interno: Σ consumos internos > producido) que aborta listando cantidad y hasta 5 `batch_code`, sin corregir, borrar ni inventar nada. Ventana de concurrencia cerrada: `begin` + `LOCK TABLE … IN SHARE ROW EXCLUSIVE MODE` sobre las cuatro tablas + `commit` — atómico bajo `psql -f` (el runner real) y semánticamente idéntico bajo la transacción del CLI de Supabase; bloquea escrituras (segundos) sin bloquear SELECT; un solo punto de adquisición → sin interbloqueos propios | Runner 4a/4b/4c: LEGACY-EXT-INVALID y LEGACY-INT-INVALID hacen FALLAR la 0105 con el mensaje y el lote literales y prueban la atomicidad (ni vistas ni triggers a medias, dato legacy intacto); LEGACY-VALID (100/100 y 50/50) aplica limpia. Unit H3.1–H3.3 |

## Revisión adversarial PCR-02.5.1 — 11/11 cerradas
1 Reducir producido bajo consumido → mensaje del piso, no la mentira de
reasignación (H1 + S11.P2 + C8). 2 «¿Material 201?» → búsqueda + página 2
con total exacto (S11.G4). 3 «¿Lote 101?» → paginación del detalle
(S11.G4: 24 → 20+4). 4 URL directa a material fuera de página → resuelve
por id y abre (S11.G4 puntual + H2.3). 5/6 Legacy externo/interno inválido
→ la 0105 aborta listando lotes (4a/4b). 7 Empresa A ve SU inventario →
S11.G2 positivo. 8 Empresa B no ve A → S11.G2 negativo. 9 Concurrencia →
C1 intacta (misma corrida). 10 Demo/Full/Extra → 0 de 17 archivos tocados
(hash vs base). 11 0001–0104 → byte a byte intactas (hash vs base).


---

# PCR-02.5.2 · Compatibilidad de la 0105 con Supabase CLI

| Hallazgo | Reproducido | Causa | Corrección | Test |
| --- | --- | --- | --- | --- |
| BEGIN/COMMIT top-level embebidos en la 0105 (y documentación que afirmaba que el `begin` propio era «un aviso inocuo» bajo el CLI) | ✅ Código: `begin;` … `commit;` en la migración de PCR-02.5.1 | La atomicidad bajo `psql -f` (autocommit por sentencia) se resolvió DENTRO del archivo, ignorando que el runner de Supabase CLI administra por sí mismo transacciones/batches e historial, con antecedentes de comportamiento problemático ante COMMIT/BEGIN manuales | Se eliminan BEGIN/COMMIT top-level de la 0105 (la afirmación retirada de la documentación); el LOCK TABLE de las cuatro tablas se CONSERVA como primera operación de protección, ejecutándose dentro de la transacción del runner; la atomicidad pasa al EJECUTOR: gestión transaccional del CLI en despliegue y `psql --single-transaction` en las TRES invocaciones del arnés (legacy ×2 + aplicación). Guía de deploy reescrita: nunca SQL Editor — flujo de 10 pasos con `link` deliberado, `migration list`, `db push --dry-run` (solo 0105 pendiente), `push`, verificación «Remote database is up to date» y `unlink`. Redacción de locks corregida a prudente: el SRE no frena SELECT, pero el DDL (`SET NOT NULL`) puede exigir candados más fuertes brevemente — ventana de baja actividad, sin prometer cero bloqueo de lecturas | Unit H3.1 (sin BEGIN/COMMIT/ROLLBACK top-level distinguiendo los `begin` de PL/pgSQL; LOCK antes de todo; 3× `--single-transaction` en el runner) + H3.1b (SQL ejecutable sin sentencias que exijan salir de una transacción); conductual: LEGACY-EXT/INT-INVALID abortan bajo la transacción del cliente SIN dejar vistas/triggers y con el dato intacto; LEGACY-VALID aplica; C1 intacta |
| Conteo del informe 02.5.1 («9 archivos») | ✅ Contaba solo código/tests | Omitía los 6 documentos actualizados | Corregido en el Implementation Report: 15 modificados (9 código/tests + 6 docs), 0 nuevos, 0 eliminados respecto a PCR-02.5 | — |

## Revisión adversarial PCR-02.5.2 — 11/11
1 ¿BEGIN/COMMIT top-level en la 0105? **NO** (H3.1 + grep del archivo).
2 ¿El LOCK es la primera protección antes de cualquier preflight? **SÍ**
(H3.1: lock < primer `do $$` < DDL < triggers). 3 ¿psql local aplica con
`--single-transaction`? **SÍ** (3 de 3 invocaciones). 4/5 ¿Queda algo
aplicado si falla LEGACY-EXT/INT? **NO** (el runner verifica: sin vista,
sin trigger, dato legacy intacto). 6 ¿LEGACY-VALID aplica? **SÍ** (vistas
arrancan sin negativos). 7 ¿C1 sigue pasando? **SÍ** (misma corrida:
«Disponible: 40 kg.», 60/100 en 1 fila). 8 ¿Alguna sentencia incompatible
con transacción? **NO** (H3.1b sobre el SQL ejecutable). 9 ¿La guía
recomienda SQL Editor? **NO** (flujo CLI de 10 pasos; el SQL Editor queda
explícitamente vetado para la 0105). 10 ¿Cambiaron 0001–0104? **NO** (hash
byte a byte vs base). 11 ¿Existe 0106? **NO** (97 migraciones, última
0105).
