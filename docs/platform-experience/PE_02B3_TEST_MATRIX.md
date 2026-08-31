# PE-02B3 · Matriz de pruebas

**Cuatro suites, 94 comprobaciones, 0 en rojo.**

| Suite | Naturaleza | Comprobaciones | Comando |
|---|---|---:|---|
| `tests/unit/pe02b3-consumer.test.ts` | estática | **36** | `npm run test:pe02b3-consumer` |
| `tests/ui/pe02b3-faq.test.tsx` | jsdom | **14** | `npm run test:pe02b3-faq-ui` |
| `tests/rls/pe02b3-faq-reader.test.ts` | **base real** | **17** | `npm run test:pe02b3-faq-reader` |
| `tests/e2e/pe02b3-faq.test.ts` | **HTTP** · P1–P8 | **27** | `npm run test:pe02b3-e2e` |

Las dos puras entran en `test:all`.

---

## 1 · La matriz A–Z del encargo

| | Qué | Dónde |
|---|---|---|
| A | Lo público publicado se ve sin sesión | lectura · A |
| B | Con sesión se ve además lo que la exige | lectura · B · HTTP P4.1 |
| C | Lo que exige sesión **no** se filtra al visitante | lectura · C **(cinco caminos)** · HTTP P5.1, P5.2 |
| D | Un borrador no se lee por ninguna puerta | lectura · D |
| E | Una retirada, tampoco | lectura · E |
| F | Ni una revisión cerrada | lectura · F |
| G | Las destacadas salen del dato | lectura · G · HTTP P3.4 |
| H | Las categorías, también, con su orden y su cuenta | lectura · H · pantalla B1–B3 |
| I | La búsqueda entiende español | lectura · I · HTTP P3.1 |
| J | El filtro por tema filtra | lectura · J · HTTP P3.3 |
| K | Y el de módulo | lectura · K · HTTP P5.4 |
| L | **No tener un módulo no oculta su documentación** | lectura · L · HTTP P5.4 |
| M | El enlace directo funciona y es estable | lectura · M · HTTP P6.1 |
| N | **Una avería no es «no hay resultados»** | lectura · N · pantalla D2 · HTTP P3.2 |
| O | Ni una columna de gobierno editorial se filtra | lectura · O · pantalla C4 · HTTP P5.3 |
| P | La consola del superadministrador se encuentra | código · C4 |
| Q | Y no se le ofrece a una empresa | código · C5 · HTTP P8.4 |
| R | Quality domina la portada pública | código · A1, A2 · HTTP P1.1 |
| S | Los tres especializados van debajo | código · A3 · HTTP P1.3 |
| T | Construcción es inerte | código · A6 · HTTP P1.3 |
| U | Se reutiliza el catálogo canónico | código · A5 · HTTP P1.2 |
| V | La copia técnica de `/modules` ya no está | código · B1–B3 · HTTP P7 |
| W | Ninguna respuesta de seguridad publicada | lectura · P · código · F5 |
| X | Ni la del entrenamiento de modelos | lectura · P · código · F5 |
| Y | Ninguna cifra comercial | lectura · P · código · F5, I4 |
| Z | Pantalla estrecha y accesibilidad | código · E1–E5 · pantalla A1, B2 · HTTP P8 |

**C merece detalle.** Una respuesta que exige sesión se intenta alcanzar por
cinco caminos, no uno: el listado, la búsqueda por su texto exacto, su
identificador a mano, el **contador de su categoría** y las **destacadas**. Los
dos últimos son los que se olvidan.

---

## 2 · Los ocho recorridos por HTTP

| | Recorrido | Comprobaciones |
|---|---|---:|
| P1 | La portada: jerarquía, frase congelada, orden, futuro inerte, y sin estado de empresa | 4 |
| P2 | Encontrar la FAQ sin saberse la URL — desde fuera y desde dentro | 3 |
| P3 | Buscar en español, sin resultados ≠ avería, temas, destacadas, **y ningún tema vacío ofrecido** | 5 |
| P4 | Con sesión se lee más; sin ella se dice que hay más | 2 |
| P5 | Lo que no se filtra: por su enlace, buscándola, por su tema, la procedencia, y el módulo no contratado | 4 |
| P6 | El enlace directo, su título, y **ningún enlace muerto** | 3 |
| P7 | La copia de `/modules`, y sin jerga interna | 2 |
| P8 | Buscador anunciado, sin desplazamiento horizontal, FAQ transversal, consola fuera del alcance de una empresa | 4 |

---

## 3 · Lo que la suite estática protege · 36

A (portada, 8) · B (copia de `/modules`, 3) · C (dónde se encuentra la FAQ, 5) ·
D (cómo se lee: sin cliente administrativo, búsqueda en servidor, cuatro vacíos,
enlace estable, metadatos, 8) · E (accesibilidad, 5) · F (el contenido sembrado:
migración sin esquema, barrera intacta, nada bloqueado, el piloto marcado, 7).

---

## 4 · Un hallazgo del camino

Al pasar la portada a leer del catálogo, **las normas NTC 6632 y UNE-EN 15343
habían desaparecido** de la frase de PCR: PE-01B las quitó y en la portada
seguían solo porque el texto estaba escrito a mano. Lo detectó una prueba de
PCR-01 que exigía las normas en la portada — estaba haciendo su trabajo. Se
devolvieron a la frase canónica.

---

## 5 · Ocho pruebas ajenas corregidas

Todas afirmaban **fotografías** donde querían afirmar **promesas**, y se
rompieron al leer la portada del catálogo o al llegar 0157.

| Suite | Decía | Dice ahora |
|---|---|---|
| `t9g-public-platform-entry` (×5) | líneas de importación literales de la portada | la portada lee el catálogo; el kill switch se evalúa en servidor; el estado se pinta dinámico |
| `pcr01-nomenclature` 3 | «la portada contiene NTC 6632» | las normas están en la frase que la portada pinta — **y faltaban** |
| `pcr01-nomenclature` 4 | «la portada contiene "Trazaloop PCR"» | el nombre está en el catálogo; que llegue al HTML lo comprueba P1.3 |
| `pe01-modules` G5 | buscaba «Trazaloop Quality» y «Próximamente» en el archivo | el protagonista se pinta disponible y el futuro sale del catálogo |
| `textiles-module-selector` 8 | «la puerta contiene "Entrar"» | la etiqueta vive en `entry.ts` — **pasaba por casualidad**, la palabra estaba en la nota al pie que este tramo sustituyó |
| `v1-release` 6b y 81 | «la portada muestra Quality y Construcción como Próximamente» | **su nombre era falso desde PE-01**: Quality se anuncia disponible por decisión humana. Ahora comprueban que solo el módulo futuro lleva «Próximamente» |
| `pe02b1-faq` A1, A2, G1, G2 | «una sola migración por encima de 0154», «no hay 0157», «no hay capa ni pantallas de FAQ» | la migración de cimientos es suya; la ayuda contextual sigue sin existir; nada usa `service_role`; la FAQ pública lee por las vistas |
| `pe02b2-admin` A1, A4, I1, I3, I5 | ídem, para su tramo | promesas equivalentes, acotadas a lo que B2 construyó |
| `pe02b1-security-claims` S3 | «hay exactamente 4 funciones de FAQ» | todas cumplen, y la interna no la alcanza ningún rol de la aplicación |

Dos de ellas —`textiles-module-selector` 8 y `v1-release` 6b/81— **estaban
pasando por razones equivocadas**. Vale la pena decirlo: una prueba verde no es
lo mismo que una promesa cumplida.

---

## 6 · Regresión completa

| | Resultado |
|---|---|
| Replay `0001 → 0157` | **0 FAIL** · 53 migraciones en el segundo paso · 24 respuestas publicadas |
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | **EXIT=0** |
| `npm run lint` | 0 errores · 66 avisos (línea base) |
| `npm run build` | **EXIT=0** |
| Suites de PE-02B1 y B2 | 35+17+13+16 y 40+11+20+20, todas en verde tras el replay |
| `test:release` | EXIT=0 |
