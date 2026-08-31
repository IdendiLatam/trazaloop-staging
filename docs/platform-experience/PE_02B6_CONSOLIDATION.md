# PE-02B6 · Lo que quedaba suelto de PE-02

PE-02 se hizo en seis tramos y cada uno cerró lo suyo. Este cierra lo que solo
se ve cuando se miran los seis juntos.

---

## 1 · Las dos confirmaciones de la dirección

Se recibieron el 31 de agosto de 2026 y las dos son negativas:

| | |
|---|---|
| ¿Hay activada una autorización para usar datos en el entrenamiento del proveedor? | **NO** |
| ¿Hay contratado un acuerdo de retención cero (ZDR)? | **NO** |

Ninguna de las dos se podía averiguar leyendo el repositorio: viven en la
consola del proveedor y en el contrato. Por eso B5A las dejó bloqueadas en
`external_policy_verification_required`, que es el estado que impide publicar.

### Qué cambió con ellas

**La respuesta del entrenamiento** pasó de bloqueada a `verified_with_qualifier`.
Ahora dice **no**, y lo dice en dos mitades que se leen por separado: lo que dice
la documentación del proveedor —no se entrena con datos de API salvo
autorización expresa— y **la decisión de Trazaloop de no activarla**. La salvedad
escrita en la propia respuesta dice de dónde viene cada mitad: la primera de la
documentación pública, la segunda de una persona.

Lo que la respuesta **no** dice, y no debe decir, es que el proveedor no
entrenará nunca bajo ninguna circunstancia. Su política dice «salvo
autorización», y esa autorización es nuestra: prometer lo primero sería prometer
en nombre de un tercero.

**La respuesta de la retención** también pasó a `verified_with_qualifier`. Dice
**hasta 30 días** con sus excepciones, y añade la frase que la hace verdadera:
que **no hay retención cero contratada**, así que ese plazo aplica de verdad. Y
mantiene la distinción que la propia documentación del proveedor establece:
pedir que una petición no se almacene **no es** un acuerdo de retención cero.

Decir que no tenemos retención cero podría parecer que resta. Nuestra posición es
la contraria: quien hace esa pregunta sabe que la retención cero existe, y
callarlo sería lo que resta.

### Y en la política de privacidad

La sección 18.3 de la sucesora tenía un recuadro de «pendiente de confirmación
humana». Se sustituyó por las dos afirmaciones. Queda una sola pendiente, más
pequeña: **cuál es el proveedor concreto contratado en producción**, que solo
afecta a si la FAQ puede nombrarlo.

**Y nada se publicó.** La política vigente sigue siendo la v1 y las quince
respuestas de seguridad siguen sin una sola revisión publicada. Hay dos pruebas
que fallan si eso deja de ser cierto.

---

## 2 · «Ayuda» dejó de significar dos cosas

PE-01B puso una entrada «Preguntas frecuentes» en la barra. PE-02B4 introdujo la
**ayuda contextual**: el botón «i» de cada campo. Y la consola de plataforma tiene
«Ayuda del producto». Tres cosas, y la palabra «ayuda» apuntando a dos.

Se resolvió por destino, no por gusto:

| Sitio | Se llama | Por qué |
|---|---|---|
| Barra superior, con sesión | **Ayuda** | Es la puerta a todo el autoservicio, y va a crecer con el tutorial de pantalla y el soporte de PE-03. |
| Portada pública | **Preguntas frecuentes** | Quien aún no entró busca respuestas concretas, no una puerta. |
| Consola de plataforma | **Preguntas frecuentes** / **Ayuda del producto** | Nombran lo que se administra, y son dos cosas distintas de verdad. |
| Botón «i» | *(sin etiqueta)* | Es un icono, y lo que administra se llama ayuda contextual. |

El cambio fue de dos palabras: `SISTEMA_GROUP` en `lib/modules/registry.ts` y el
pie de `/modules`.

---

## 3 · La entrada «Ayuda», auditada superficie por superficie

| Superficie | Estado |
|---|---|
| `(shell)/layout.tsx` — todos los módulos | presente |
| `modules/page.tsx` — la puerta | presente |
| `platform/layout.tsx` — la consola | presente |
| `select-org/page.tsx` | presente |
| `settings/profile/page.tsx` | presente |
| `(print)` — impresión | **no aplica**: es papel |
| login · registro · aceptar legales | **excluidas a propósito** |

Las tres últimas se excluyen porque son pantallas de un solo acto. Poner una
salida hacia la FAQ en `/legal/accept` sería ofrecer una manera de no aceptar.

---

## 4 · Una sola verdad para cada ayuda

La ayuda de partes interesadas existe en dos sitios: la constante
`INTERESTED_PARTIES_HELP` del código y las once filas publicadas en `help_items`.
Eso podría ser una duplicación de la verdad. No lo es, y la razón está en la
precedencia:

```
si hay ayuda administrada  → manda ella
si no                      → el texto de siempre
```

La base **es** la verdad; la constante es el **respaldo**. Y 0158 sembró las once
copiando la constante, así que publicar la ayuda no cambió una sola palabra de lo
que ya se leía. Hoy los dos textos coinciden, y por eso comparar textos no
demuestra nada: la prueba C3 lo demuestra con un texto que solo puede venir de la
base.

El respaldo no sobra. Es lo que evita que una avería de lectura se lea como
«esta pantalla no tiene ayuda» — la regla de siempre: **sin dato no es cero**.

---

## 5 · Las veinticuatro respuestas publicadas

Se revisaron todas contra las siete familias de defecto del encargo: promesas de
soporte, cifras comerciales, funciones como futuras, jerga de desarrollo,
certificaciones ajenas, garantías de cumplimiento y respuestas demasiado largas.

**Cero defectos.**

También se buscaron respuestas que se pisaran. Los tres pares más parecidos
—entre 0.62 y 0.74 de similitud— resultaron ser preguntas genuinamente
distintas: quién ve qué frente a quién puede cambiar qué, y qué mide Quality
frente a qué mide PCR.

---

## 6 · Lo que se aplaza, dicho en voz alta

`PE_02B6_DEFERRED_HELP_BACKLOG.md` recoge las siete familias de pantalla que aún
no tienen ayuda contextual administrada. No es una lista de deudas: es lo que
PE-02B4 acotó a propósito para no inventar contenido que nadie había escrito.
**No se inventó contenido para trasladarlas** —ningún ejemplo, ninguna referencia
normativa—, porque contenido inventado en una ayuda es peor que ausencia de
ayuda.

---

## 7 · Lo que este tramo NO hizo

- No publicó la política de privacidad ni ninguna respuesta de seguridad.
- No provocó una sola reaceptación.
- No añadió migración: las tres cabeceras siguen donde estaban.
- No restableció credenciales.
- No tocó Producción.
