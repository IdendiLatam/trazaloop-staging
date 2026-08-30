# QUALITY-13B2 · MATRIZ DE PRUEBAS

Cuatro suites, **124 comprobaciones**. Cada cifra sale de contar los `✔` que imprime su
suite; ninguna está escrita a ojo.

| Suite | Qué prueba | Comprobaciones |
|---|---|---|
| `quality13b2-cockpit` | las decisiones, sin base ni DOM | 51 |
| `quality13b2-cockpit-ui` | el mirador pintado en un DOM real | 26 |
| `quality13b2-cockpit-db` | el cargador contra base real | 19 |
| `quality13b2-cockpit-e2e` | el recorrido P1…P8 por HTTP | 28 |

Las dos primeras entran en `test:all`. Las dos últimas necesitan Supabase local y el
build de producción, y se corren aparte —mismo criterio que B1 y que 12.3—.

---

## 1 · Por qué cuatro y no una

Cada una ve lo que las demás no pueden:

- **Decisiones** · el orden, los textos y la atención son funciones puras. Probarlas
  montando un DOM las haría lentas y frágiles, y probarlas leyendo el fuente no
  comprobaría que hacen lo que dicen.
- **Pantalla** · una decisión correcta puede no llegar al HTML. Aquí se mira **lo que
  queda escrito**, y sobre todo lo que **no** queda cuando una sección viene denegada.
- **Base real** · los recuentos, la derivación y el número de consultas solo se
  comprueban contra datos de verdad.
- **Aceptación** · es la única que abre los enlaces. Encontró el 404 de los documentos de
  otro módulo, que ninguna de las tres anteriores podía ver.

---

## 2 · Cobertura del encargo (§30 A…AE)

| | Qué pedía | Dónde |
|---|---|---|
| A | la ficha enseña el mirador | A1 · P1.5 |
| B | las nueve secciones de B1 | B1 · N1 · W1 |
| C | el recuento del servidor, no de las filas | D2 · O1 |
| D | muestra acotada | D1 · O2 · AA2 |
| E | los enlaces resuelven | P1 · **P8.1** (los abre) |
| F | sin ficha no se fabrica URL | E4 · P3 · P5.2(e2e) |
| G | requisito → parte interesada | Q1 · X1 · P2.1 |
| H | ninguna escritura parte→proceso | X2 · Z6 |
| I | proveedor derivado | Y1 · Y3 · P6.4 |
| J | queja derivada | Y2 · P6.4 |
| K | resumen de riesgos | P3.1 · P3.2 |
| L | objetivos ≠ indicadores | B4 · P4.1 |
| M | atención de indicador | G3 · W2 · P4.2 |
| N | documentos y evidencia | P5.1 · W2b |
| O | auditorías y hallazgos | P6.1 |
| P | hallazgo ≠ no conformidad | G4 · P6.1 |
| Q | casos y acciones | P6.2 |
| R | tareas propias no convertidas | J1 · J2 · P6.3 |
| S | etiqueta del presente | F1 · N2 · P7.2 |
| T | comportamiento a fecha | F2 · T1 · **P7.3** |
| U | comportamiento por periodo | F2 · T1 |
| V | momentos incompatibles, etiquetados | F2 · T1 · P7.3 |
| W | sección rota ≠ 0 | C1 · R2 · Z4 |
| X | sección denegada no filtra recuento | C2 · R1 · Z3 |
| Y | un fallo no tumba el mirador | R3 · Z4 · Z5 |
| Z | identidad rota es fatal | **P7.5** (404) |
| AA | estructura para pantalla pequeña | V3 · V4 · P8.4 |
| AB | sin enlaces a PCR ni Textiles | E1 · E2 · P8.2 · P8.3 |
| AC | consultas acotadas | **AA1** (1 vs 41) |
| AD | ninguna tabla nueva | I4 · K1 · K2 · X2 |
| AE | renombrado de navegación | L1…L5 · P1.1 |

---

## 3 · Las cuatro que más valen

**AA1 · un riesgo o cuarenta y uno cuestan lo mismo.** Un `Proxy` sobre `from()` cuenta
consultas. Se compone el mirador con un riesgo, se crean cuarenta más, y se compone otra
vez: el número de consultas tiene que ser **idéntico**. No «parecido»: idéntico.

**P8.1 · todos los destinos abren.** Se recogen los `href` que el mirador renderizó y se
piden uno a uno. Es la que encontró el 404.

**R1 · la sección denegada no filtra nada.** Se comprueba que en el HTML de esa caja no
queda ni el recuento, ni una etiqueta de fila, ni un enlace.

**Z5 · si no se pueden leer los casos, lo derivado lo dice.** Los dos caminos derivados
parten de los casos del proceso. Si esa lectura falla, decir «ningún proveedor
relacionado» sería mentir dos veces.

---

## 4 · Regresiones verificadas

`test:all` **EXIT=0** · `typecheck` **0** · `lint` **0 errores** · `build` **0**.

Y aparte, por tocar el cargador de B1 y la ficha de proceso:
`quality13b1-process-context`, `quality13b1-rls`, `quality13b1-integration`,
`quality13b1-attention`, `quality01`, `quality011`, `quality012`, `quality012-ui`,
`quality02`, `quality03`, `quality03-ui`, `quality123b2-domain`,
`quality123b2-integrations`, `quality123b3a-ux`, `quality123b3a-ui`,
`quality123b3a-e2e`, `quality123b3b-help`, `quality123b3b-automation`,
`quality123b3b-intelligence`, `quality123b3b-outputs`. **Todas EXIT=0.**
