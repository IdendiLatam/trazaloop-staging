# QUALITY-13B4 · MATRIZ DE PRUEBAS

Cuatro suites, **96 comprobaciones**. Cada cifra sale de contar los `✔` que imprime su
suite.

| Suite | Qué prueba | Comprobaciones |
|---|---|---|
| `quality13b4-home` | las decisiones y la auditoría de cargadores | 34 |
| `quality13b4-home-ui` | la portada pintada en un DOM real | 23 |
| `quality13b4-home-db` | la composición contra base real | 16 |
| `quality13b4-home-e2e` | el recorrido P1…P8 por HTTP | 23 |

Las dos primeras entran en `test:all`. Las dos últimas necesitan Supabase local y el
build de producción.

---

## 1 · Cobertura del encargo (§34 A…AB)

| | Qué pedía | Dónde |
|---|---|---|
| A | la portada usa atención convergida | A1 · A4 · M1 |
| B | un asunto por dos observadores se cuenta una vez | **M2** · **P2.2** |
| C | dos condiciones se cuentan por separado | M3 · D4 |
| D | enlace válido a la causa | M4 · J4 · **P3.1** (los abre) |
| E | no se pudo leer ≠ cero | B2 · I2 · O1 · O3 |
| F | denegado no filtra nada | B4 · I3 · I4 · O2 |
| G | se enseña el estado incompleto | B4 · I2 · O4 |
| H | «no hay nada» solo con todo leído y cero | **B1** · **B2** · I1 · I2 · P6.1 |
| I | ninguna promesa de conformidad | B3 · I1 · P6.1 |
| J | filtro por dominio | E2 · E3 · K1 · N1 · **P4.1** |
| K | filtro por proceso | E5 · K2 · N2 · P5.1 |
| L | enlace al mirador de proceso | E5 · K2 · **P5.1** |
| M | Contexto incluido | D1 · J1 · **P7.2** |
| N | los indicadores conservan su semántica | **J3** · F3 |
| O | hallazgo no es NC | F3 · H5 · P2.4 |
| P | queja no es NC | F3 |
| Q | la tarea propia sigue propia | F4 |
| R | la revisión usa su fuente determinista | A3 · M1 (`getManagementReviewHomeSignals`) |
| S | nada de vocabulario interno | F1 · F2 · **H4** · P2.3 |
| T | muestra acotada | G1 · H1 · P4 |
| U | sin filtrado parcial en cliente | **E1** · K1 |
| V | estructura para pantalla pequeña | L3 · P8.1 |
| W | independencia de módulo | G5 · P8.2 · P8.3 |
| X | sin recurso a PCR/Textiles | G5 · J4 · P8.2 |
| Y | ninguna sexta tabla de atención | **G4** |
| Z | ninguna puntuación global | C2 · H2 |
| AA | los cargadores viejos, clasificados | **A2** · **A3** |
| AB | consultas acotadas | **P3** (mismo número con 3 asuntos que con 43) |

---

## 2 · Las cinco que más valen

**M2 · un asunto, una línea.** El barrido de riesgos deja un aviso **y** un pendiente para
la misma condición. Se comprueba que las dos filas están en la base y que la portada
enseña **una**.

**B1/B2 · cuándo se puede decir que no hay nada.** Con todo leído y cero, se dice. Con una
fuente caída y cero, se dice lo contrario. Son dos comprobaciones y no una porque el fallo
está en confundirlas.

**P3 · el coste no crece.** Un `Proxy` sobre `from()` cuenta consultas. Con tres asuntos y
con cuarenta y tres, el número es **idéntico**: está acotado por los dominios que se leen,
no por los datos.

**P3.1 · todos los destinos abren.** Se recogen los `href` que la portada renderizó y se
piden uno a uno. Es la comprobación que encontró el 404 en B2.

**A2/A3 · no vuelve a contar.** Los tres cargadores que solo contaban atención no pueden
reaparecer en la composición; los que quedan tienen que seguir dando su contexto. Si
alguien devolviera uno, la duplicación que B3 quitó volvería por la puerta de atrás.

---

## 3 · Datos de QA

Todos con prefijo `QA Q13 B4 ·`, en una empresa nueva y **solo con Quality**:

- riesgo con la revisión vencida, ligado a un proceso → aviso **y** pendiente;
- auditoría vencida **y** hallazgo sin evaluar → dos condiciones, dos sujetos;
- proveedor con la reevaluación vencida;
- parte interesada pertinente con su requisito;
- proceso al que pertenece el riesgo y el hallazgo.

Ninguno inventado: los cinco son estados que el dominio admite.

---

## 4 · Regresiones verificadas

`test:all` **EXIT=0** · `typecheck` **0** · `lint` **0 errores, 66 avisos** (el mismo
número que antes del tramo) · `build` **0**.

Y aparte: las cuatro de B1, las cuatro de B2 —incluida la aceptación por HTTP del
mirador—, las cuatro de B3, `quality01`…`quality11`, `quality03-ui` y `quality123b3a-e2e`.
**Todas EXIT=0.**

**Cuatro pruebas de otros tramos se reescribieron**, y las cuatro por el mismo motivo:
comprobaban que el fichero de la portada contenía el nombre de un cargador. La composición
se mudó a `lib/db/quality-home.ts` y la atención pasó a venir de B3, así que la dirección
cambió aunque la promesa no:

| Prueba | Antes | Ahora |
|---|---|---|
| `quality09` Q4 | la portada llama a `getAuditHomeSignals` | auditorías es un dominio de la portada y el hallazgo sin evaluar sigue siendo una condición observada, con su aclaración |
| `quality10` S4 | la portada llama a `getManagementReviewHomeSignals` | lo llama la composición, y la portada **no** reconstruye las entradas de la revisión |
| `quality11` S5 | existe una tarjeta «Requieren atención» | la automatización entra en la MISMA lista convergida —que es lo que §171 pedía— y la avería del motor se distingue |
| `quality03-ui` 15 | la portada tiene un bloque «Desempeño» | la portada avisa del indicador fuera de meta y aclara que no es una no conformidad, sin usar esa palabra |
