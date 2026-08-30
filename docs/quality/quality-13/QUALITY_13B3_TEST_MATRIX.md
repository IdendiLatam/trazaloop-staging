# QUALITY-13B3 · MATRIZ DE PRUEBAS

Cuatro suites, **96 comprobaciones**. Cada cifra sale de contar los `✔` que imprime su
suite.

| Suite | Qué prueba | Comprobaciones |
|---|---|---|
| `quality13b3-observers` | el inventario, contra las migraciones | 41 |
| `quality13b3-attention` | la convergencia y el resumen, en puro | 21 |
| `quality13b3-convergence` | el defecto, su arreglo y la consulta, contra base real | 25 |
| `quality13b3-history` | la historia y la procedencia | 9 |

Las dos primeras entran en `test:all`. Las dos últimas necesitan Supabase local.

---

## 1 · La comprobación que sostiene el tramo

**`M4b` · la prueba del defecto.** Se devuelve la regla a la forma que traía antes de
0153 —el barrido entero—, se crea una acción con la eficacia por verificar, se corre el
barrido y se comprueba que **no llega el aviso**. Después se pone la forma cualificada y
se comprueba que **sí llega**.

Si el defecto dejara de reproducirse, la prueba falla y avisa de que ya no está
demostrando nada. Es la diferencia entre argumentar un fallo y ejecutarlo.

---

## 2 · Cobertura del encargo (§27 A…Z)

| | Qué pedía | Dónde |
|---|---|---|
| A | el inventario tiene todos los mecanismos | A1 · A2 · A3 · A4 |
| B | los diez clasificados | C1 · C2 · C3 · C4 |
| C | cada supersesión con prueba de compatibilidad | D2 · D3 · D4 · **M4b** |
| D | misma condición por dos observadores → una línea | I1 · I2 · **N2** |
| E | mismo sujeto, otra condición → dos | I3 · N3 |
| F | evento + barrido → una sola | I1 · I6 · N2 |
| G | barrido repetido, idempotente | **M2** |
| H | reintento idempotente | I7 · M2 |
| I | lo resuelto desaparece de lo activo | O1 · S2 |
| J | la historia queda | O3 · S1 · S2 · U1 |
| K | reconocido ≠ resuelto | J2 · **O2** · F2 |
| L | la tarea propia sigue propia | F5 |
| M | indicador fuera de meta no es NC | F4 |
| N | hallazgo no es NC | F4 |
| O | queja no es NC | F3 · F4 |
| P | otra empresa no ve nada | **P1** · M7 |
| Q | denegado ≠ cero | **P2** |
| R | observador caído ≠ cero | **P3** |
| S | sin `service_role` | H2 · P4 |
| T | el mirador de proceso sigue viendo una | **Q3** |
| U | el enlace sigue llevando a la causa | N1 · L3 · Q3 |
| V | lo temporal lo sigue viendo el barrido | **R1** · R2 |
| W | ninguna sexta tabla de atención | E2 · H5 |
| X | ningún motor de tareas nuevo | E3 · F3 |
| Y | consultas acotadas | **Q1** · Q2 |
| Z | la consulta de la futura portada converge | N1 · N5 · K1 |

---

## 3 · Las cuatro que más valen

**M4b** · descrita arriba.

**Q1 · el coste no crece.** Un `Proxy` sobre `from()` cuenta consultas. Se compone la
atención, se crean cuarenta riesgos vencidos más, y se compone otra vez: el número de
consultas tiene que ser **idéntico**.

**P3 · una fuente rota no produce «todo en orden».** Se rompe la lectura de señales y se
comprueba que llega `unavailable`, que las demás siguen, y que el resultado se declara
incompleto.

**A3/A4 · el inventario no puede envejecer.** Se abren las migraciones, se saca el
vocabulario de los CHECK, se busca qué función escribe cada tipo, y se exige que el
inventario coincida en las dos direcciones.

---

## 4 · Regresiones verificadas

`test:all` **EXIT=0** · `typecheck` **0** · `lint` **0 errores** · `build` **0**.

Y aparte: `quality11`, `quality111`, las cuatro de B1, las cuatro de B2 —incluida la
aceptación por HTTP del mirador—, `quality123b2-integrations`, `quality123b3a-e2e`,
`quality123b3b-automation` y `quality123b3b-intelligence`. **Todas EXIT=0.**

**Una prueba de B2 se reescribió**, y conviene decir por qué: afirmaba que la cabecera de
migraciones «sigue en 0152». Esa era una foto del día de la entrega, no una promesa de B2.
La promesa —que B2 no añadió esquema— se sigue comprobando, ahora de una forma que no se
rompe cuando otro tramo añade una migración por un motivo distinto.
