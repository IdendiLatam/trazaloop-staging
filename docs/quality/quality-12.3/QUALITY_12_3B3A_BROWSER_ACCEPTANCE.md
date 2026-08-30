# QUALITY-12.3B3A · ACEPTACIÓN AUTOMATIZADA P1…P10

**Qué es esto:** la matriz de validación humana, ejecutada por máquina hasta donde una
máquina puede llegar. **No** sustituye la mirada de una persona: la deja sin trabajo
mecánico que hacer.

---

## 1 · Dónde se ejecutó cada cosa, sin adornos

| Entorno | Qué se hizo allí |
|---|---|
| **Preview → Staging oficial** `trazaloop-production-5bs4ma9zj…` | Navegador real (Chrome), sesión SSO de Vercel y sesión de aplicación de una persona. P1–P10 con interacción de verdad y las 12 capturas. La empresa es **QA Staging · Pruebas Quality**, de pruebas |
| **Build de producción en local → Supabase local** | La suite de regresión `test:quality123b3a-e2e`: 32 comprobaciones que repiten P1–P10 por HTTP, incluidas las que necesitan comprobar la base después de cada acción |

Las dos son reales y ninguna es la otra. Lo que se validó en Preview se dice como
Preview; lo que se automatizó en local se dice como local.

**No se instaló Playwright.** El repositorio ya tiene su equivalente —`tests/e2e/*`,
recorridos por HTTP contra el build de producción— y el encargo pedía expresamente no
traer un armazón nuevo si ya hay uno. El navegador real salió del Chrome de la persona,
que es la vía autorizada: no se tocó el SSO de Vercel, ni Production, ni ninguna
credencial.

---

## 2 · La matriz

| | Resultado | Dónde | Evidencia |
|---|---|---|---|
| **P1** Navegación y resumen | **PASS** | Preview + local | `P1-resumen.jpg` |
| **P2** Listado, búsqueda, filtros, paginación | **PASS** | Preview + local | `P2-listado-pagina2.jpg` |
| **P3** Análisis y pertinencia | **PASS** | Preview + local | `P3-analisis-pertinencia.jpg` |
| **P4** Necesidad / expectativa / requisito | **PASS** *(tras corregir un defecto)* | Preview + local | `P4-conversion-confirmacion.jpg` |
| **P5** Requisito → proceso | **PASS** | Preview + local | `P5-procesos-relacionados.jpg` |
| **P6** Estrategias | **PASS** | Preview + local | `P6-estrategias-alcance.jpg` |
| **P7** Seguimiento y relacionado | **PASS** | Preview + local | `P7-seguimiento-relacionado.jpg` |
| **P8** Revisiones e historia | **PASS** | Preview + local | `P8-revisiones-historia.jpg` |
| **P9** Estado en fecha | **PASS** | Preview + local | `P9-asof.jpg`, `P9-actual.jpg` |
| **P10** Independencia de módulo y móvil | **PASS** | Preview + local | `P10-movil-listado.jpg`, `P10-movil-ficha.jpg` |

Capturas en `docs/quality/quality-12.3/qa/browser-validation/`.

---

## 3 · Qué se hizo en cada P

**P1.** Se entró a Quality, se comprobó que el grupo **Contexto** va primero y lleva a
Partes interesadas, y que la pantalla abre con su título, su descripción y su botón «i».
Las seis métricas están y **ninguna se llama «desempeño»** —la palabra solo aparece en el
menú lateral, que es otro grupo de Quality—. Se pulsaron las cuatro tarjetas con enlace y
cada una acotó la lista al número que anunciaba: 2, 1, 0 y 2.

**P2.** Se crearon 22 partes para que hubiera dos páginas. La página 1 trajo 20 y la 2
trajo las otras 2 sin repetir ninguna. Después se buscó **«Grupo 13»**, que vivía en la
segunda página: apareció. Los cuatro filtros acotaron de verdad y «Quitar filtros»
devolvió las 22.

**P3.** Se registró una entidad externa nueva, se creó su análisis con prioridad 9 y su
metodología, y se comprobaron las dos negativas: **puntuación sin metodología** y **«no
pertinente» sin justificación**. Las dos se rechazaron con un mensaje escrito para una
persona —sin nombres de restricción ni jerga de PostgreSQL— y, releyendo la base después,
**no habían escrito nada**. La entidad ya analizada queda deshabilitada en el selector con
el motivo al lado. Sustituir pidió confirmación, la confirmación dijo que el anterior se
conserva, y después la historia mostró las dos lecturas: «Vigente» y «Sucedido». **No hay
botón de editar el análisis.**

**P4.** Se registraron una necesidad, una expectativa y un requisito. El requisito exigió
subtipo; la necesidad y la expectativa no lo pidieron. Al convertir, el diálogo se abrió
con el foco en «Cancelar», se cerró con **Escape** sin escribir nada, y al confirmar creó
el requisito derivado **conservando la necesidad**: la ficha quedó con Necesidad (1),
Expectativa (1) y Requisito (2), y el derivado dice de dónde salió y por qué.

**P5.** Desde el requisito se relacionó un proceso: aparece con su tipo de relación y
**desde cuándo**. «Terminar vínculo» lo cerró —y la base conserva la fila con su fecha de
cierre, comprobado en la suite—. Una necesidad no ofrece relacionar procesos.

**P6.** Se creó una estrategia **general** —queda «General para esta parte»— y otra
**específica con dos requisitos**, que queda «Atiende varios requisitos (2)» porque se
cuentan los vínculos. El selector de responsable ofrece **solo cargos**. El seguimiento
lista los **once mecanismos** y avisa de que no tiene por qué ser una encuesta. Sin
cadencia ni fecha prevista, la estrategia dice «Sin revisar», **no** «Vencida».

**P7.** «Relacionar» ofrece indicador, objetivo, riesgo, oportunidad, caso, acción,
documento, campaña, evaluación de proveedor y retroalimentación: lenguaje de producto, sin
`owner_kind`, sin `ref_kind` y sin un solo identificador en pantalla. **No ofrece** ni
proceso ni requisito, que son las relaciones centrales, y la base también las rechaza por
esa vía. El cruce con Voz del cliente y Proveedores no se pudo mirar en Preview —esa
empresa no tiene ninguna parte que sea además cliente o proveedor— y se automatizó en la
suite: aparecen los dos bloques, con enlace a su ficha y **sin copiar** una sola métrica.

**P8.** Se registró **«Revisado, sin cambios»**: quedó el acta y **no se fabricó ningún
análisis nuevo**. La estrategia pasó de «Sin revisar» a «Al día». Escalar exige nota.

**P9.** Con dos lecturas de un colectivo —una del 29 y otra del 30 de agosto—, pedir el
**29** devolvió la primera: su justificación, su fecha, su prioridad. El aviso «Estás
viendo el estado del 2026-08-29» se anuncia con `role="status"`, la insignia lo repite en
la cabecera, y **no queda un solo formulario que escriba**: los únicos botones de envío
son el de cerrar sesión del armazón y el «Ver ese día», que solo navega. Volver al estado
actual devolvió la segunda lectura.

**P10.** El recorrido lista → ficha → categorías → volver → recargar funciona en una
empresa **sin PCR ni Textiles**, y ninguna de las pantallas enlaza a esos módulos. En
ancho de móvil la tabla desaparece, la lista se convierte en 20 tarjetas pulsables, el
resumen pasa a dos columnas, la navegación de secciones se ajusta y **no hay desbordamiento
horizontal**.

---

## 4 · Accesibilidad (sondeo, no certificación)

Comprobado durante el recorrido: campos con etiqueta real —el `placeholder` nunca hace de
etiqueta—, tabla con `<caption>` y `scope="col"`, paginador anunciado, diálogos con
`role="dialog"`, `aria-modal`, `aria-labelledby`, **foco inicial en «Cancelar»** y cierre
con **Escape**, aviso del modo histórico con `role="status"`, y estados que se leen con
palabras además de color.

**No es una certificación WCAG** y no se presenta como tal.

---

## 5 · El defecto que encontró el navegador

**El alta de necesidades, expectativas y requisitos no llegaba a guardar nada.**

`RequirementsSection` no recibía `assessmentId` y su formulario no llevaba el campo. La
pantalla se pintaba entera, el botón enviaba, y la acción respondía «falta el análisis al
que pertenece». Desde la interfaz **no se podía registrar ni una necesidad**.

Ninguna de las 49 comprobaciones anteriores lo vio, y merece decirse por qué: la estática
no podía —el campo no existía, así que no había nada que buscar— y la de DOM comprobaba
que el envío **ocurría**, no **qué llevaba**. Hizo falta pulsar el botón de verdad.

Corregido en `c2bd25e`, y las dos suites aprendieron: la estática exige ahora que cada
formulario de escritura declare el identificador de su dueño; la de DOM comprueba que el
alta viaja con `assessment_id`. La suite E2E lo verifica una tercera vez, mirando la fila
guardada.

No hubo ningún otro defecto de producto. Ocho comprobaciones más fallaron durante el
desarrollo de la suite y **ninguna era del producto**: buscaban texto en el armazón, en la
carga RSC o en el formulario equivocado, o usaban una fecha que la propia regla de negocio
rechaza con razón. Están corregidas en la prueba, no en el código.

---

## 6 · Seguridad de escritura

Se comprobó en las dos direcciones:

- **Acción válida → estado esperado.** Cada creación se releyó de la base: el análisis con
  su pertinencia y su metodología, la entrada atada a su análisis, el vínculo con su
  vigencia, los dos vínculos de la estrategia múltiple, el acta de revisión.
- **Validación fallida → cero escrituras.** Tras rechazar la puntuación sin metodología y
  el «no pertinente» sin justificación, la tabla de análisis seguía vacía. Tras cerrar el
  diálogo de conversión con Escape, no había ningún requisito derivado.

Ningún componente escribe en la base por su cuenta: todo pasa por las acciones de
servidor. Hay una prueba estática que lo vigila.

---

## 7 · Lo que sigue necesitando ojos humanos

Una máquina comprueba que el botón hace lo que dice. No comprueba si **merece la pena**
que lo diga así. Queda para la persona:

- si el orden de las secciones es el orden en que se piensa el problema;
- si las explicaciones de necesidad / expectativa / requisito se entienden sin haber leído
  la norma;
- si el resumen enseña lo que de verdad hace falta mirar cada mañana;
- si el vocabulario suena a la empresa o a un manual;
- si la densidad de la ficha es cómoda con veinte requisitos, no con cuatro;
- y si algo, aun funcionando, **estorba**.

La matriz de `QUALITY_12_3B3A_HUMAN_VALIDATION.md` sigue siendo la guía: lo mecánico ya
está comprobado, así que la lectura humana puede ir a lo que solo ella ve.
