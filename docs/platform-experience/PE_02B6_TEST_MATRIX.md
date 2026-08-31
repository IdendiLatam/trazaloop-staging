# PE-02B6 · Qué se comprobó, y qué se demostró

Dos suites, 37 comprobaciones. Ninguna es nueva por gusto: cada una cubre algo
que este tramo cambió o algo que este tramo prometió **no** cambiar.

---

## `tests/unit/pe02b6-consolidation.test.ts` · 23

Puras. Leen el repositorio, no la base. Entran en `test:all`.

| | Qué demuestra |
|---|---|
| **A · La entrada «Ayuda» está donde debe** | |
| A1–A5 | Las cinco superficies con sesión llevan `href="/faq"`. |
| A6 | Y ninguna se llama ya «Preguntas frecuentes» con sesión. |
| A7 | `(print)`, login, registro y aceptar legales **no** la llevan, y eso es deliberado. |
| **B · La palabra «ayuda» apunta a una sola cosa** | |
| B1 | La barra dice «Ayuda». |
| B2 | La portada pública sigue diciendo «Preguntas frecuentes». |
| B3 | La consola distingue lo que administra de la ayuda contextual. |
| **C · Lo aplazado está escrito** | |
| C1–C4 | El inventario existe, nombra las siete familias, dice por qué se aplaza cada una y dice que **no se inventó** contenido. |
| **D · La ayuda contextual tiene una sola verdad** | |
| D1 | La precedencia es determinista y la administrada gana. |
| D2 | Sin ayuda administrada hay respaldo, no hueco. |
| D3 | Ningún componente lee la constante saltándose la precedencia. |
| **E · Las claves de pantalla siguen sanas** | |
| E1–E3 | El registro no tiene duplicados, todas cumplen el patrón, y ninguna pantalla registrada quedó sin ruta. |
| **F · La consolidación está documentada** | |
| F1 | El plan de publicación de B5B existe y dice qué abre la puerta. |
| F2 | El paquete de revisión existe y cubre los diez puntos. |

## `tests/rls/pe02b6-content.test.ts` · 14

Contra la base real, con superadministrador y con anónimo.

| | Qué demuestra |
|---|---|
| **A · Las confirmaciones, aplicadas** | |
| A1 | El entrenamiento ya no está bloqueado, y separa la política del proveedor de nuestra decisión. |
| A2 | La barrera de publicación ya la dejaría pasar — y su salvedad está escrita, sin la cual la base la rechazaría. |
| A3 | La retención dice **hasta 30 días**, dice que **no hay retención cero**, y distingue `store:false` de la retención cero. |
| A4 | Las dos conservan fuente oficial y fecha de consulta. |
| **B · Y sin embargo nada se publicó** | |
| B1 | Las quince siguen en borrador, con cero revisiones. |
| B2 | Ninguna se lee, ni sin sesión ni con ella. |
| B3 | La política vigente sigue siendo la v1. |
| B4 | La sucesora recoge las dos confirmaciones, ya no lleva el aviso de pendiente, y sigue en borrador sin fecha de publicación. |
| B5 | **Una cuenta nueva acepta v1, no v1.1**: la prueba de que no se disparó reaceptación. |
| **C · La ayuda contextual** | |
| C1 | Las once siguen publicadas: si una cayera, la pantalla volvería al respaldo sin avisar. |
| C2 | Las claves de la base y las del código coinciden una a una. |
| C3 | La precedencia se demuestra con un texto que solo puede venir de la base — porque los dos textos reales coinciden a propósito. |
| **D · La FAQ publicada** | |
| D1 | Veinticuatro respuestas, sin jerga, sin cifras comerciales, sin futuros, y ninguna corta pasa de 400 caracteres. |
| D2 | Ninguna pública promete soporte ni certifica cumplimiento. |

---

## La que más importa

**B5.** Todo lo demás se puede arreglar editando un borrador. Una reaceptación
disparada por accidente le aparece a todo el mundo y no se retira. Es la única
comprobación de este tramo que vigila algo irreversible.
