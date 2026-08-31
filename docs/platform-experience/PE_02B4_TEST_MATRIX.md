# PE-02B4 · Matriz de pruebas

**Cuatro suites, 89 comprobaciones, 0 en rojo.**

| Suite | Naturaleza | Comprobaciones | Comando |
|---|---|---:|---|
| `tests/unit/pe02b4-help.test.ts` | estática | **40** | `npm run test:pe02b4-help-static` |
| `tests/ui/pe02b4-help.test.tsx` | jsdom | **10** | `npm run test:pe02b4-help-ui` |
| `tests/rls/pe02b4-help.test.ts` | **base real** | **26** | `npm run test:pe02b4-help` |
| `tests/e2e/pe02b4-help.test.ts` | **HTTP** | **13** | `npm run test:pe02b4-e2e` |

Las dos puras entran en `test:all`.

---

## 1 · La matriz A–M · datos

| | Qué | Dónde |
|---|---|---|
| A | La ayuda publicada llega, con sus tres partes | base · A, A2 |
| B | Un borrador **no** reemplaza lo publicado | base · B |
| C | Retirar hace que deje de llegar, sin borrar | base · C |
| D | Una revisión publicada es inmutable **también con `service_role`** | base · D |
| E | Recuperar crea una revisión nueva, no reabre | base · E |
| F | Un administrador de empresa no ve ni toca | base · F |
| G | Soporte lee y no escribe | base · G |
| H | El superadministrador administra | base · H |
| **I** | **En Demo se ve la ayuda igual** | base · I |
| J | Y el derecho al módulo lo defiende la pantalla | base · J |
| K | Una avería ≠ «no hay ayuda configurada» | base · K |
| L | Sin `service_role` en ningún camino | base · L |
| M | El respaldo es referencia, no cumplimiento | base · M · HTTP AB3 |

**I es la decisión congelada del tramo.** Se comprueba con una empresa cuyo
Quality está en **prueba**: llegan las once ayudas con su texto completo, y no el
aviso de «disponible en Full y Extra» que sí aplica a la guía de TrazaDocs.

---

## 2 · La matriz N–S · las claves

| | Qué |
|---|---|
| N | Las claves usadas están en el registro y bien formadas |
| O | Una clave desconocida devuelve vacío sin romper nada; una mal formada se rechaza |
| P | La identidad **no guarda la ruta** |
| Q | No hay dos ayudas para el mismo elemento — y la base lo impide |
| R | Las claves de módulo son las canónicas, y coinciden con el prefijo de la pantalla |
| S | PE-03 puede reutilizarlas: el registro lo declara, vive en `lib/modules/` y no depende de las tablas de la ayuda |

---

## 3 · T · Que no crezca con los botones

| | Escenario | Resultado |
|---|---|---|
| T | Pantalla con **11** ayudas | **1 consulta** |
| T2 | Pantalla con 2 | 1 consulta |
| T3 | Dos pantallas a la vez | 1 consulta |

Medido con un contador que envuelve `from()`. Y una comprobación estática que
falla si algún componente de la pantalla vuelve a consultar por su cuenta — que
es como nace un N+1.

---

## 4 · La matriz U–AA · la entrada global

| | Qué | Resultado |
|---|---|---|
| U | `/modules` muestra «Ayuda» | sí |
| V | Quality | sí |
| W | PCR | sí |
| X | Textiles | sí |
| X2 | Perfil, equipo, soporte, seleccionar empresa | sí |
| Y | Lleva a `/faq`, y la FAQ abre | sí |
| Y2 | Se llama «Ayuda», no «FAQ» | sí |
| Z | No se esconde en pantalla estrecha | sí |
| AA | Login y registro **sin tocar**; la portada conserva la suya | sí |

Y dos más, que son las que demuestran que la ayuda es de verdad administrable:

| | Qué |
|---|---|
| **AB** | Se cambia el texto **en la base** y la pantalla lo refleja — si leyera la constante, no cambiaría nada |
| AB2 | Se ven los tres rótulos, y no se filtra jerga interna |
| AB4 | La consola de ayuda no se ofrece a una empresa |

**AB lleva un `finally`**, y no es decoración: sin él, una comprobación que falle
a mitad dejaría la base con el texto de prueba publicado, y la siguiente
ejecución fallaría por una razón que no es la suya. La suite de base tiene la
misma protección: repara al empezar lo que una ejecución interrumpida pudiera
haber dejado a medias.

---

## 5 · Lo que la suite estática protege · 40

A (un solo componente, 3) · B (la migración, 9) · C (el registro de pantallas, 4)
· D (la carga: una consulta, solo por la vista, distingue la avería, no mira el
plan, 4) · E (lo que se lee, 2) · F (la primera ola, 5) · G (la consola, 5) ·
H (la entrada global, 5) · I (lo que no se hizo, 3).

---

## 6 · Lo que solo se ve pintando · 10

Los tres rótulos en su orden; que sin ejemplo ni respaldo **no se pinte un rótulo
que sobra**; que el botón siga siendo `type="button"` con `aria-expanded`; que
Escape cierre **y devuelva el foco**; que sin ayuda **no se pinte nada**; y que
el texto **nunca** se interprete como HTML.

---

## 7 · Cinco pruebas ajenas corregidas

| Suite | Decía | Dice ahora |
|---|---|---|
| `quality-12-3b3b-help` AJ | buscaba `interestedPartiesHint("clave")` exacto | la llamada recibe también el mapa administrado; la promesa —cada sección ofrece sus ayudas— no cambia |
| `quality-12-3b3b-help` | «el hint tiene la forma que espera SectionHint» | la función puede devolver `null` porque ahora acepta ayuda administrada; sin ella devuelve el texto de siempre |
| `pe02b1-faq` A2 | «no existe una migración de ayuda contextual» | la migración **de ese tramo** no toca sus tablas |
| `pe02b2-admin` I2 | ídem | la consola de FAQ y legales no se enredó con la ayuda |
| `pe02b3-consumer` F1 | «una sola migración por encima de 0156» | PE-02B3 aportó una, y es la del contenido de la FAQ |

Todas eran fotografías donde querían ser promesas.

---

## 8 · Regresión

| | Resultado |
|---|---|
| Replay `0001 → 0158` | **0 FAIL** · 54 migraciones · 11 ayudas + 24 respuestas de FAQ sembradas |
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` / `lint` / `build` | EXIT=0 · 0 errores · EXIT=0 |
| Suites de B1, B2 y B3 | todas en verde tras el replay |
| `quality123b3b-help` | 8 correctas |
