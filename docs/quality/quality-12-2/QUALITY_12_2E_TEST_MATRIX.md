# QUALITY-12.2E · Matriz de pruebas

**`test:quality122e` · 32 comprobaciones · 0 fallos**, dentro de `test:all`.

No hay suite de UI propia: los paneles ya tienen la suya —`quality122c-ui` y
`quality122d-ui`— y las dos pulsan los botones por su etiqueta, así que
verifican el renombrado por el camino. Crear una tercera que hiciera lo mismo
sería ruido.

---

## Las dos mitades

| | |
|---|---|
| **A · La identidad está en un solo sitio** | nombres, acciones, títulos, y que el módulo no sea `server-only` |
| **B · Navegación** | nombre corto, que quepa, que no diga «Quality Intelligence» |
| **C · La página global** | pestaña, encabezado, acción principal |
| **D · Las dos capacidades documentales** | mejorar ≠ revisar, y sin antropomorfizar |
| **E · Ajustes y propuestas** | títulos desde la identidad |
| **F · Lo que NO se toca** | entorno, base, `use_case`, plantillas, rutas, prompt |
| **G · Permisos y planes** | un renombrado no abre una capacidad |
| **H · El guard de cadenas** | runtime limpio, documentación intacta |
| **I · Mensajes de estado** | sin nombres de variables, y la filosofía visible |

---

## Las que más valen

**F2 · no hay migración nueva.** Falla si aparece una `0140`. Existe para que
nadie migre datos por una etiqueta.

**F3 y F4 · los `use_case` no se renombran.** Un run de `copilot.ask` de hace
tres meses sigue siendo esa consulta. La traducción vive en `useCaseLabel()`, y
un identificador desconocido se devuelve tal cual: disfrazarlo escondería que
apareció uno nuevo.

**F6 · el prompt no se toca.** Comprueba que la política enviada al modelo
sigue diciendo lo que decía. Cambiarla sería comportamiento, no identidad.

**G1 · un renombrado no abre una capacidad.** Las puertas siguen donde estaban.

**H1 + H2 + H3, juntas.** H1 exige que ninguna cadena visible del runtime diga
«Copilot». H2 exige que la documentación histórica **sí** lo diga. H3 comprueba
que el guard mira sitios distintos, porque si no, las dos anteriores no podrían
ser ciertas a la vez.

**D3 · las dos capacidades siguen siendo dos.** Un renombrado no puede sugerir
que mejorar y revisar hacen lo mismo.

**D4 · no se antropomorfiza.** Prohíbe «Intelligence sabe», «entiende»,
«garantiza», «piensa» y el «Pensando…» que había.

---

## Se comprobó que el guard falla

Reintroduciendo «Ajustes del Copilot» en el panel de administración:

```
✘ E1. los títulos salen de la identidad
✘ E2. no queda «Copilot» visible en los ajustes
✘ H1. ninguna cadena VISIBLE del runtime dice «Copilot»
```

Restaurado, 32 verdes. Una prueba de regresión que nunca se ha visto fallar no
es una prueba de regresión.

---

## Regresión completa

| | |
|---|---|
| `quality12` 70 · `-rls` 31 · `-safety` 25 | |
| `quality121` 56 · `-rls` 31 | |
| `quality122a` 30 · `-rls` 24 · `quality122b` 28 · `-rls` 29 | |
| `quality122c` 39 · `-budget` 14 · `-ui` 13 · `-rls` 24 · `-safety` 14 | |
| `quality122d` 72 · `-budget` 15 · `-ui` 16 · `-rls` 39 · `-safety` 22 | |
| **`quality122e`** | **32** |
| `deploy-safety` 7 · `export01` 54 · `export011` 31 | |
| TrazaDocs · PCR · Textiles · Quality | verdes |
| **`npm run test:all`** | **EXIT 0** |

Sin una sola llamada al proveedor: este sprint no la necesita.
