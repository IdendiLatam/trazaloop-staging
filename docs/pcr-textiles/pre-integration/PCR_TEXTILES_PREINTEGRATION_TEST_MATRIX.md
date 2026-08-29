# PCR / Textiles · Pre-integración · Matriz de pruebas

**160 comprobaciones nuevas** en diez suites. Cinco corren contra la base real
con la sesión de una persona, RLS puesta; cinco son de dominio y cableado.

| Suite | Qué demuestra | ✔ |
|---|---|---|
| `test:pcr-textiles-nav` | navegación entre módulos | 14 |
| `test:pcr-textiles-01` | catálogo de evidencia, vigencia, escala · cableado | 27 |
| `test:pcr-textiles-01-rls` | las cuatro condiciones y la verdad histórica · **base real** | 18 |
| `test:pcr-textiles-scale-rls` | el corte de las mil filas · **1 200 filas reales** | 7 |
| `test:pcr-textiles-03b` | unidades · dominio y cableado | 14 |
| `test:pcr-textiles-03b-rls` | concurrencia y unidades · **transacciones simultáneas** | 15 |
| `test:pcr-textiles-02a` | v2 y saldo · decisiones congeladas | 23 |
| `test:pcr-textiles-02a-rls` | los doce casos A–L · **base real** | 20 |
| `test:pcr-textiles-02b` | movimientos · dominio y cableado | 17 |
| `test:pcr-textiles-02b-rls` | despachos, correcciones y carrera · **base real** | 17 |

Las cinco de dominio están en `test:all` (EXIT 0). Las cinco `-rls` corren
aparte, como el resto de suites contra base del repositorio.

---

## Lo que NO se aceptó como prueba

Tres cosas quedaron fuera a propósito, porque parecen cobertura y no lo son.

**Razonar sobre el fichero de configuración.** `max_rows = 1000` no demuestra
que PostgREST corte: lo demuestra cruzarlo. `scale-rls` crea **1 200
proveedores reales** y comprueba que una consulta sin `.range()` devuelve
exactamente 1 000 **sin error**. Con menos de mil filas no hay nada que
demostrar, porque el corte no llega a producirse.

**Leer que falta un `for update`.** El Design Freeze fue explícito en no
afirmar la carrera hasta probarla. `03b-rls` abre **dos conexiones con
transacciones simultáneas** y demuestra las dos mitades: con el candado uno de
los dos consumos se rechaza; reproduciendo la guarda antigua sobre una tabla de
laboratorio —dentro de una transacción que se deshace— **los dos pasan** y el
lote queda en 120 de 100. Sin esa segunda mitad la prueba diría «funciona» sin
haber enseñado nunca qué era lo que fallaba.

**Invocar la función y ver que devuelve lo correcto.** Una primitiva correcta
que nadie usa deja el fallo donde estaba. Las suites de cableado recorren las
pantallas y exigen que estén conectadas: `E1` de `pcr-textiles-01` comprueba
las once listas textiles una por una.

---

## Cobertura por criterio del encargo (§24)

| Criterio | Dónde | Cómo |
|---|---|---|
| tipo evidencia formulario = filtro | `01` A1, A2 | las dos listas se comparan elemento a elemento |
| search encuentra fila >1000 | `scale-rls` B1 | busca la fila 1150, invisible sin paginar |
| export >1000 completo | `scale-rls` A2 · `01` E3, E6 | recorrido completo + los exportadores no consultan solos |
| current obsolete badge | `01` B1, B3 | el catálogo mira hoy |
| historically valid evidence | `01-rls` B1 · `02a-rls` E | vencida hoy, vigente al recibir el lote → **cuenta** |
| evidence invalid at received_date excluded | `01-rls` B2 | ya vencida cuando llegó el lote → rechazada |
| unapproved evidence excluded | `01-rls` A2, A3 · `02a-rls` F | pendiente y rechazada no sostienen |
| cancel association = zero writes | `01-rls` A1 | sin confirmación no queda fila |
| confirm = immutable historical fact | `01-rls` C1, C2, C3 | el snapshot no cambia ni al rechazar después |
| no destructive delete | `02b-rls` B5 · `02b` D1 | dos capas, y la fila sigue |
| v1 unchanged | `02a-rls` O · `02a` A1, A2, A3 | v1 calcula igual y se marca v1 |
| v2 no duplicated composition | `02a` E1 | v2 no lee `batch_composition` |
| φ unknown = incomplete | `02a-rls` D | sin fracción declarada, sin número |
| φ partial mathematically correct | `02a-rls` C, I, J | 60 %, mezclas y lotes distintos |
| mixed virgin/recycled | `02a-rls` J | suma ponderada |
| partial lot consumption | `02a-rls` H | entra lo consumido, no lo recibido |
| multi-input-batch | `02a-rls` I | cada lote con su fracción |
| multi-output-batch según PT-H05 | `02a-rls` M · `02a` D1, D2, D3 | incompleto, sin prorratear |
| legacy unit unresolved = incomplete | `03b-rls` B4 | sin unidad comparable no se consume |
| Textiles concurrent overconsumption | `03b-rls` A1, A3 | las dos mitades |
| raw inventory reconciliation | `02b-rls` D1 · `02a` F1–F7 | dominio y base coinciden |
| finished product dispatch reduces stock | `02b-rls` A1, A3, A4 | despacho, merma, uso interno |
| correction restores appropriate stock | `02b-rls` B1, B4 | corregir a la baja también |
| no destructive movement delete | `02b-rls` B5 | por los dos caminos |
| Textiles only never enters PCR shell | `nav` D1, D2 | las cinco combinaciones |
| Quality only never enters PCR shell | `nav` D1, D2 | idem |
| Full = Extra | `t9f-module-access` (ya existía) | sin tocar |
| Demo unchanged | `t9f1` (ya existía) | sin tocar |
| cross-tenant denied | `01-rls` A5 · `scale-rls` C1 · `02a-rls` S · `02b-rls` C2 | en las cuatro |

---

## Regresiones vigiladas

`test:all` completo tras cada bloque, y de nuevo tras la reejecución limpia.
Se tocaron cuatro aserciones ajenas, todas **caducadas y reescritas**, nunca
debilitadas:

| Suite | Qué decía | Por qué caducó | Qué comprueba ahora |
|---|---|---|---|
| `quality-12-2f-usage` J2c | «0141 es la última migración» | el siguiente sprint legítimo la rompe | que ninguna migración posterior cree un segundo bus ni reescriba el emisor |
| `textiles-evidences` 24 | subcadena `/evidences"` | también aparece en `/textiles/evidences` | la ruta de PCR, distinguida de la textil |
| `support` extra | cadena literal `isTicketModule(module)` | `module` está prohibido como nombre en Next | que la página lea el parámetro **y lo valide** |
| `pcr02-5` B7 | nombre `getOutputBatchInventoryByIds` | PT-02B lo sustituyó por el saldo real | una consulta acotada por página + el saldo a la vista + la distinción de «sin salidas» |

---

## Cómo correrlo todo

```bash
npm run test:all                       # incluye las cinco suites de dominio

npm run test:pcr-textiles-01-rls       # base real
npm run test:pcr-textiles-scale-rls    # crea 1 200 filas en su propia empresa
npm run test:pcr-textiles-03b-rls      # dos conexiones simultáneas
npm run test:pcr-textiles-02a-rls
npm run test:pcr-textiles-02b-rls

bash scripts/replay-local.sh           # reejecución limpia 0001→0146
```

Las suites `-rls` crean su propia empresa y sus propios datos. No tocan nada
existente y no hace falta limpiarlas.

---

## CIERRE · 2026-08-29

**Validación humana P1–P8: PASS.** Blockers 0 · product gaps 0.
Cabecera 0148 · Local 0148 · Staging 0148 · Production 0111 (sin tocar).

El resumen final, las nueve decisiones congeladas y lo diferido están en
[PCR_TEXTILES_PREINTEGRATION_CLOSURE.md](./PCR_TEXTILES_PREINTEGRATION_CLOSURE.md).
