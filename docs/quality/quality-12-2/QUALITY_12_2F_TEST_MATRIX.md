# QUALITY-12.2F · Matriz de pruebas

**94 comprobaciones en tres suites · 0 fallos**

| Suite | Qué mira | |
|---|---|---|
| `test:quality122f` | el código y el esquema | **41 ✔** |
| `test:quality122f-cost` | la fórmula del dinero | **23 ✔** |
| `test:quality122f-rls` | límites contra base real | **30 ✔** |

Las dos primeras entran en `test:all`. La tercera se ejecuta aparte, como todas
las `-rls`.

---

## La suite del dinero, y por qué va sola

Un error en una fórmula de coste **no se nota**. No rompe una pantalla ni lanza
una excepción: produce un número plausible que alguien usará para decidir un
precio. Los errores que no se ven hay que buscarlos a propósito.

Los casos son de números redondos:

| | Esperado |
|---|---|
| 1 M de entrada | exactamente **$0,25** |
| 1 M de salida | exactamente **$2,00** |
| 1 M **todo cacheado** | exactamente **$0,025** |
| mitad cacheada | la mitad de cada tarifa |
| el doble determinístico | **cero** |
| un modelo sin tarifa | **nulo**, no cero |

`A3` es la que más vale: el error clásico es cobrar la entrada **y** el caché,
lo que inflaría el coste justo en el caso que se supone que lo abarata.

Y `B2` suma mil operaciones y exige el resultado exacto: el dinero son
microdólares **enteros**, no coma flotante.

### Escrita dos veces, comparada una

`A4` de la suite de base real ejecuta la fórmula de SQL y la de TypeScript con
los mismos datos y exige el mismo resultado. Dos implementaciones de la misma
cuenta que nadie compara acaban separándose, y el día que se separen no habrá
forma de saber cuál lleva razón.

---

## Lo que la suite estática protege

| | |
|---|---|
| `A1`–`A3` | **no hay un segundo registro** de tokens ni contadores mutables |
| `B1`–`B2` | el **derecho** se comprueba antes que el presupuesto |
| `C1`–`C2` | los límites **no conocen el plan**; no hay producto nuevo |
| `D1`–`D4` | se decide con operaciones, **no con dólares**; UTC; sin bloqueos permanentes |
| `E1`–`E5` | tarifa versionada, inmutable, histórica, y sin coma flotante |
| `F1`–`F3` | ninguna vista de consumo lee la pregunta ni la respuesta |
| `G1`–`G4` | la pantalla de la empresa **no enseña dinero** ni tokens |
| `H1`–`H4` | la consola separa observado de previsión |
| `I1`–`I3` | excepciones con motivo; **ver ≠ poder cambiar** |
| `J1`–`J3` | avisos en el bus existente, deduplicados, y que no tumban nada |
| `K1`–`K4` | los números están justificados y las clases son internas |
| `L1`–`L4` | migración append-only, RLS y `security_invoker` en todo |

`B2` merece una nota: comprueba, **leyendo el código del guardián**, que no
consulta el plan del módulo. Si lo hiciera, el presupuesto podría dar acceso, y
la regla es que solo puede quitarlo.

---

## Lo que solo se puede probar con base real

| | |
|---|---|
| `B2` | el tope por minuto: abre 3 y bloquea 3, con el motivo exacto |
| `B5` | tres operaciones en vuelo y la cuarta denegada |
| `B6` | **un run colgado de hace una hora no bloquea a la empresa** |
| `C1` | **cincuenta peticiones simultáneas, límite de cinco, pasan cinco** |
| `D1` | Demo con presupuesto de sobra sigue sin acceso |
| `D2` | Full y Extra: mismos límites y mismo comportamiento |
| `E1`–`E5` | excepción aplica, caducada no aplica, y un admin no puede tocarlas |
| `F1`–`F5` | aislamiento: ni consumo, ni estado, ni tarifa de otra empresa |
| `G1`–`G3` | un fallo no se cobra, pero **sí cuenta como intento** |
| `H1`–`H3` | el aviso se emite, no se repite y no lleva contenido |
| `I1` | los agregados se **reconstruyen** sumando los runs a mano |

`C1` es la que justifica el bloqueo de aviso. `B6` es la que evita que un
proceso muerto deje a una empresa sin servicio.

---

## Los tres defectos que encontraron

Ninguno se buscó: los tres salieron de una prueba que fue a mirar el resultado
en vez de conformarse con que la llamada no fallara.

1. **`G1` encontró que `provider_called` nacía en `true`.** Una operación que
   nunca llamó al proveedor constaba como llamada.
2. **`G1`, otra vez, encontró la función ambigua.** Tras el primer arreglo, el
   run seguía sin cerrarse: dos funciones del mismo nombre y PostgREST sin
   poder elegir. El síntoma no era un error, era silencio.
3. **Las suites de 12.2C y 12.2D encontraron los límites mal calibrados.**
   Empezaron a fallar con «demasiadas operaciones seguidas» y tenían razón: los
   números estaban pensados para una persona y el límite es por empresa.

---

## Regresión completa

| | |
|---|---|
| `quality12` 70 · `-rls` 31 · `-safety` 25 | |
| `quality121` 56 · `-rls` 31 | |
| `quality122a` 30 · `-rls` 24 · `quality122b` 28 · `-rls` 29 | |
| `quality122c` 39 · `-budget` 14 · `-ui` 13 · `-rls` 24 · `-safety` 14 | |
| `quality122d` 72 · `-budget` 15 · `-ui` 16 · `-rls` 39 · `-safety` 22 | |
| `quality122e` 32 | |
| **`quality122f` 41 · `-cost` 23 · `-rls` 30** | **94** |
| `deploy-safety` 7 · TrazaDocs · PCR · Textiles | verdes |
| **`npm run test:all`** | **EXIT 0** |

**Réplica limpia 0001 → 0140 desde cero: 132 migraciones, 0 fallos**, con las
diez suites de base real repetidas contra ella.

### Dos barreras de alcance que caducaron

`quality122c` J1 asertaba que ninguna migración posterior reescribiera su
puerta. 12.2F la reescribe **a propósito**, para añadirle el guardián. La
comprobación pasa a verificar lo que de verdad importa: que al reescribirla no
se pierda ninguna de sus tres reglas —módulo del documento, Full/Extra, tope
diario—.

`quality122e` F2 asertaba que 0139 era la última migración. Pasa a verificar la
invariante duradera: que **ninguna** migración renombre el espacio técnico ni
reescriba `use_case` histórico.

Las dos eran correctas cuando se escribieron. Cuando el alcance cambia de
verdad, una prueba se reescribe a lo que sigue valiendo; no se borra ni se deja
fallando.

**Sin una sola llamada al proveedor.** Este sprint no la necesita.
