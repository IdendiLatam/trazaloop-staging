# PCR-02.5 / PCR-02.5.1 · Test Matrix

## PostgreSQL real (`npm run test:pcr02-5-db` → runner 1–10) — EXIT 0
Pasos: prelude → 0025 → **0104 (inmutable)** → **4a/4b/4c LEGACY
(PCR-02.5.1: la 0105 FALLA con sobreconsumo histórico externo/interno y
aplica con saldo exacto)** → suites PCR-02.1 (S1–S6) → PCR-02.2 (S7–S8) →
PCR-02.3 (S9) → PCR-02.4 (S10) → **PCR-02.5 (S11)** → **concurrencia C1**.
Total: **88 aserciones ✔ + C1 = 89**.

| Escenario | Cobertura (§25) | Resultado |
| --- | --- | --- |
| S11.A1 | INSERT sin cantidad → not-null; 0 y negativo → check 0025; UPDATE a NULL → rechazado | ✔ |
| S11.E1 | Lote 100: 60 + 40 → permitido; vista en 0 | ✔ |
| S11.E2 | Saldo 0 + 1 kg → «Disponible: 0 kg.» literal | ✔ |
| S11.E3 | Update propio 60 → 100 (otros 0) → permitido (§12) | ✔ |
| S11.E4 | Update 100 → 101 → rechazado con tope exacto; la masa no cambia | ✔ |
| S11.E5 | Delete → la vista vuelve a 100 (saldo derivado) | ✔ |
| S11.I1 | Producido 50: 30 + 20 → permitido | ✔ |
| S11.I2 | +1 → «…del lote producido. Disponible: 0 kg.» | ✔ |
| S11.I3 | Update propio: 21 rechazado («Disponible: 20 kg.»), 15 permitido; vista 5 | ✔ |
| S11.I4 | Delete interno → vista 20 | ✔ |
| S11.P1 | `quantity_kg` 100→50 con 80 consumidos → «Consumido: 80 kg.»; →90 permitido | ✔ |
| S11.P2 | `produced_quantity_kg` 50→29 con 30 internos → «Consumido: 30 kg.»; →30 permitido | ✔ |
| S11.G1 | Orden CERRADA + consumo → mensaje PCR-02.4 (structural antes que saldo) | ✔ |
| S11.G2 | RLS en AMBOS sentidos (PCR-02.5.1): la empresa A ve SU inventario bajo `authenticated` (lotes, producidos, agregado) y la empresa B ve 0 filas de A en las TRES vistas | ✔ |
| S11.G3 | Agregado material 230/120/110, 2 de 3 lotes con saldo; agotado visible | ✔ |
| S11.G4 | Paginación/búsqueda server-side (PCR-02.5.1): 25 materiales → páginas 20+5 con total exacto y frontera correcta; búsqueda `ilike`; 24 lotes de un material → 20+4; resolución puntual de un material fuera de la página 1 | ✔ |
| LEGACY-EXT-INVALID | 100 recibidos / 101 consumidos sembrados ANTES → la 0105 FALLA listando `LE-LEGACY-MALO`; atómica: ni vistas ni triggers a medias y el dato queda intacto | ✔ |
| LEGACY-INT-INVALID | 50 producidos / 51 internos → la 0105 FALLA listando `OUT-LEGACY-MALO` | ✔ |
| LEGACY-VALID | Saldo exacto (100/100 y 50/50) → la 0105 aplica y las vistas arrancan sin negativos | ✔ |
| **C1** | **Dos procesos psql simultáneos**: B espera el candado y es rechazada («Disponible: 40 kg.»); total 60/100 en 1 fila | ✔ |

Fixtures previos adecuados: cantidades obligatorias en todas las salidas
del arnés y coherentes con la tolerancia del 5 % de la completitud
(cadena S8: 5 kg por eslabón, 10 en la raíz). Las 69 aserciones previas
siguen pasando sin cambiar su semántica.

## Unit (`npm run test:pcr02-5`) — 39 checks, EXIT 0
PCR-02.5.1 añade: H1.A–C (23514 sin catch genérico; reasignación por
mensaje; `dbError` allowlist con pisos/saldos antes del fallback) ·
H2.1–H2.4 (dominio REAL de `normalizeInventoryPage` y `INVENTORY_PAGE_SIZE`;
count exact + ilike saneado + range; parámetros `inv_*` sin colisión;
total/navegación visibles; resolución puntual; parámetros de la lista
principal conservados) · H3.1 (PCR-02.5.2: la 0105 SIN
BEGIN/COMMIT/ROLLBACK top-level — sin confundir los `begin` internos de
PL/pgSQL —, LOCK de las cuatro tablas ANTES de preflights/DDL/triggers, y
las tres invocaciones del runner con `--single-transaction`) · H3.1b
(compatibilidad transaccional del SQL ejecutable: sin CREATE INDEX
CONCURRENTLY, VACUUM, ALTER SYSTEM ni CREATE/DROP DATABASE) · H3.2–H3.3
(doble preflight con ejemplos y sin imputaciones; pasos 4a/4b/4c).
Dominio REAL ejecutado (saldo, tope §12 «30, jamás 10», estados §18,
formato kg) · Bloque A en 4 capas · vistas/grants/fórmulas 0105 · capa de
datos acotada · UX §6 (lista → inventario → importación) · columnas §7/§8 ·
§15 en lotes producidos · FOR UPDATE + `id <> new.id` + mensajes +
23514 + pisos · orden alfabético vs PCR-02.4 · SECURITY INVOKER/search_path/
EXECUTE · acciones capa 2 + dbError pass-through · selectores §17 ·
denominador §20 confirmado en 0028 · nota E3 solo por motivos de evidencia
(§22) · migraciones 97/0105/sin 0106 · planes y 0104 sin tocar · scripts.

## Regresión completa (`npm run test:all`) — EXIT 0 · 1.558 checks
typecheck ✔ · lint ✔ (1 warning preexistente de Textiles, intacto) · 92
suites: Textiles completo, Demo/Full/Extra, PCR-01.1, PCR-02, PCR-02.1–02.5
y release. `npm run build` (next build --webpack) ✔ compilación limpia.
