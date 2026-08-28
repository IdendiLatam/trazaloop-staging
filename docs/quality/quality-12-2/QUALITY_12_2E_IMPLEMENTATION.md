# QUALITY-12.2E · Trazaloop Intelligence · identidad visible

> **CERRADO.** Validación humana visual: las cinco comprobaciones **PASS**.
> Rama `feature/quality-12-2e-trazaloop-intelligence-identity`, desde `aeeca3d`.
> **Local 0139 · Staging 0139 · Production 0111 — sin tocar. Sin migración.**

La decisión congelada está en `QUALITY_12_2E_VISIBLE_IDENTITY.md`. Esto cuenta
cómo se aplicó.

---

## A · El sprint que no cambia comportamiento

Y por eso es más delicado de lo que parece. Un renombrado puede, sin querer:

- abrir una capacidad, si una etiqueta se usaba como condición;
- romper un identificador **persistido**, si alguien decide que `copilot.ask`
  también debería llamarse de otra forma;
- dejar media pantalla hablando del nombre viejo, que es peor que no haber
  empezado.

Las tres cosas se comprueban. `test:quality122e` tiene una mitad que exige que
el nombre **haya** cambiado y otra que exige que las tablas, las variables de
entorno, las rutas, los `use_case` y los permisos **no**.

---

## B · Una fuente, no treinta

`lib/domain/intelligence-identity.ts`. Ocho constantes y dos funciones.

El nombre estaba escrito a mano en la navegación, en el encabezado de la
página, en seis botones repartidos por Quality, en cuatro mensajes de error, en
los textos del dominio y en once etiquetas de exportación. Ahora sale de un
sitio.

No es un sistema de marca —para un producto con un nombre, eso sería peor que
el problema—: es que la próxima vez baste con tocar un archivo.

---

## C · Qué se renombró

| Dónde | De | A |
|---|---|---|
| Navegación (grupo y enlace) | «Copilot» | **Intelligence** |
| Pestaña del navegador | «Copilot de Calidad» | **Trazaloop Intelligence** |
| Encabezado de la página | «Trazaloop Quality · Copilot» | **Trazaloop Intelligence** |
| Botón principal | «Preguntar al Copilot» | **Preguntar a Intelligence** |
| Botón repartido por Quality | ídem | ídem, desde la constante |
| Casos, auditorías, señales | «… con Copilot» | **… con Intelligence** |
| Estado apagado | «El Copilot está apagado» | **Intelligence está apagado** |
| Ajustes | «Ajustes del Copilot» | **Ajustes de Intelligence** |
| Borradores | «Borradores del Copilot» | **Propuestas de Intelligence** |
| Errores visibles (4) | «El Copilot no…» | redactados sin la marca o con ella una vez |
| Textos del dominio (5) | «El Copilot…» | **Intelligence…** |
| Exportaciones (11 etiquetas) | «… del Copilot» | **… de Intelligence** |
| Contextual Review | «Revisar consistencia» | **Revisar con Intelligence** |
| Espera de Quick Edit | «Pensando…» | **Preparando…** |

Las exportaciones cuentan como visibles: esas etiquetas se imprimen en los PDF
y en los CSV. Y con ellas se actualizó la matriz de cobertura, que documenta el
inventario vigente y dejaría de decir la verdad si se quedara atrás.

---

## D · Qué NO se tocó

La lista completa, con su porqué, está en `QUALITY_12_2E_VISIBLE_IDENTITY.md`.
En resumen: tablas, variables de entorno, plantillas, `use_case`, rutas,
identificadores internos y **la política que se envía al modelo**.

Esa última merece una frase: cambiarla habría sido cambiar **comportamiento**,
no identidad, y además rompe el versionado del prompt. El modelo sigue leyendo
que es «el Copilot de Trazaloop Quality», y no pasa nada: eso no lo ve nadie.

---

## E · «Pensando» → «Preparando»

Un cambio pequeño y deliberado. «Pensando» antropomorfiza, y §10 pide no
hacerlo. El producto no piensa: prepara una propuesta.

Se cambió también el nombre de la comprobación que lo vigila, para que la
prueba diga lo que comprueba.

---

## F · El guard, y su límite

`test:quality122e` recorre `app/`, `components/`, `lib/` y `server/`, extrae
**solo cadenas y texto de JSX** —los identificadores no los lee nadie— y falla
si alguno dice «Copilot».

Deja fuera `docs/`, `tests/`, `supabase/` y `scripts/`, y eso no es un descuido:
si mirara la documentación, no se podría a la vez exigir que el runtime no diga
«Copilot» y que la historia del proyecto siga siendo verdad. Hay una
comprobación que lo verifica en los dos sentidos.

Excepciones explícitas dentro del runtime: la ruta, los nombres de plantilla
`copilot.*`, el id `copilot-aviso` y la política del modelo.

Se comprobó que el guard falla: reintroduciendo «Ajustes del Copilot» saltan
**tres** comprobaciones a la vez.

---

## G · Lo que rompió, y por qué está bien que rompiera

Cinco suites vecinas fallaron, y las cinco por buenas razones:

| Suite | Qué asertaba | Qué se hizo |
|---|---|---|
| `quality12` K2, L5, M1 | el copy antiguo, palabra por palabra | se actualizó el texto esperado; lo comprobado no cambió |
| `quality122c` K2 | **«NO se hizo el renombrado global»** | era una barrera de alcance para 12.2C; ahora comprueba que la etiqueta salga de la identidad compartida |
| `quality122c-ui` | pulsaba el botón «Pensando» | pasa a «Preparando» |
| `quality122d-ui` | pulsaba «Revisar consistencia» | ahora usa `INTELLIGENCE_ACTIONS.review`, así que no se quedará atrás la próxima vez |
| `export-01` F1 | la matriz nombra las entidades del inventario | se actualizó la matriz |

La de 12.2C es la interesante. Decía literalmente «NO se hizo el renombrado
global» y era **correcta** mientras 12.2E no existía. Cuando una prueba deja de
tener sentido porque el alcance cambió de verdad, se reescribe a lo que sigue
valiendo; no se borra ni se deja fallando.

---

## H · Sin migración

`0139` sigue siendo la última. Ninguna cadena visible vivía en la base: todas
estaban en el código, y la traducción de los `use_case` guardados se resuelve
en presentación con `useCaseLabel()`.

Hay una comprobación que falla si aparece una `0140`, precisamente para que
nadie migre datos por una etiqueta.

---

## H.bis · La validación humana

Cinco comprobaciones visuales sobre el Preview `ig1vypkni`, commit `fdbbc36`.
Las cinco **PASS**:

| | Qué se vio |
|---|---|
| Navegación | **Intelligence** en la barra lateral. Sin «Copilot» |
| Página principal | **Trazaloop Intelligence** · **Intelligence** · **Preguntar a Intelligence**, y la ruta `/quality/copilot` conservada |
| Quick Edit | **Mejorar con Intelligence**, y **Preparando…** durante la operación |
| Contextual Review | **Revisar con Intelligence**, claramente distinta de la anterior |
| Ajustes | **Ajustes de Intelligence** y **Propuestas de Intelligence** |

Sin gastar una sola llamada al proveedor: la rama recibe la credencial pero no
`QUALITY_AI_PROVIDER`, así que resuelve al doble determinístico. Los paneles
funcionan enteros y no hay consumo. Fue deliberado — una validación visual no
tiene por qué costar dinero.

### Un resto que apareció en el repaso final

Dos comentarios del adaptador de exportación seguían diciendo «Copilot» encima
del código que ahora emite «Intelligence». El guard no los veía —y hace bien:
solo mira cadenas visibles—, pero un comentario que describe el comportamiento
actual y se ha quedado atrás confunde a quien lo lee. Actualizados.

No es lo mismo que la documentación histórica de QUALITY-12, que **sí** debe
seguir diciendo «Copilot»: aquello narra lo que pasó, esto describía lo que
hace el código de al lado.

---

## I · Gaps

**Blóqueres: 0. Gaps de 12.2E: 0.**

Diferido por diseño: cuotas y precio → **12.2F**. Un alias de búsqueda para
«Copilot» solo tendría sentido si existiera un buscador de comandos, y hoy no
existe: construirlo aquí sería otro sprint.
