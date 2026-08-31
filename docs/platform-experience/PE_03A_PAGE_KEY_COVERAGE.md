# PE-03A · Qué pantallas llevan tutorial

147 páginas bajo el shell. El registro de PE-02 tiene 10 claves. Este documento
dice cuáles hacen falta, cuáles se excluyen y en qué orden.

---

## PET-35 · El botón vive en la barra, no en 147 cabeceras

**El hallazgo que decide el diseño:** no existe ningún componente de cabecera
compartido. Cada una de las 147 páginas escribe la suya a mano.

Poner «Ver video tutorial» en la cabecera de cada página significa **tocar 147
ficheros**, y significa que la página 148 nacerá sin él.

La barra superior del shell ya tiene el sitio, y PE-02B4 lo dejó reservado por
escrito:

> «se llama «Ayuda» y no «FAQ» porque **PE-03 sumará el tutorial de la pantalla y
> el soporte al mismo sitio».»

Ahí conviven ya `ModuleSwitcher`, `ModuleAwareSettingsLink` y `ModuleHeaderBadge`,
componentes de cliente que resuelven por `usePathname()`. El mecanismo existe y
está en uso.

**Una implementación, 147 páginas cubiertas, y la 148 nace cubierta.**

### Y la identidad sigue sin ser la ruta

El componente mira la ruta para saber **en qué pantalla está**, y consulta el
registro de PE-02 para saber **qué clave le corresponde**. La identidad del
tutorial sigue siendo la clave.

Si una pantalla se muda, se actualiza el `route` de su entrada en el registro y
el tutorial no se entera: misma clave, mismas versiones, misma historia. Es
exactamente lo que el encargo §5 exige, y por eso mirar la ruta aquí no es
usarla como identidad.

### El precedente

`ExportPdfButton` con `exportKey`, en 70 sitios: una acción secundaria
identificada por una clave estable que no depende de la ruta. Ya se resolvió una
vez y funcionó.

---

## PET-36 · ¿El botón siempre, o solo si hay vídeo?

**Opción C del encargo: visible en toda pantalla que admita tutorial, haya vídeo
o no.**

| | A · siempre en todas | B · solo si hay vídeo | **C · si la pantalla admite tutorial** |
|---|---|---|---|
| Se descubre que existen | sí | **no** | sí |
| Aparece donde no toca | sí | no | no |
| El botón salta de sitio | no | **sí** | no |

La B es la que parece más limpia y es la peor. Un botón que aparece y desaparece
según haya vídeo enseña a no mirar ahí, y además hace que nadie sepa que la
plataforma tiene tutoriales hasta que se topa con uno.

Cuando no hay vídeo, el botón sigue y al pulsarlo dice:

> **Este tutorial está en actualización y estará disponible pronto**

Que es la copia congelada. **Nunca un reproductor roto**, ni un botón que no hace
nada.

Y eso permite estrenar el sistema con cinco vídeos en lugar de esperar a
cuarenta.

---

## PET-37 · Dónde NO va

| Clase | Ejemplos | ¿Tutorial? |
|---|---|---|
| **Producto normal** | Quality, PCR y Textiles bajo el shell | **sí** |
| **Global de producto** | `/modules`, `/select-org`, `/team`, `/settings/*` | **sí** |
| **Editorial / ayuda** | `/faq`, `/faq/[slug]`, `/legal`, `/privacy`, `/terms` | no |
| **Autenticación y legal** | `/login`, `/register`, `/legal/accept`, recuperación | **no, nunca** |
| **Sistema** | 404, error | no |
| **Consola de plataforma** | `/platform/*` | no |
| **Impresión** | `(print)` | no aplica |

Las razones, que no son las mismas:

- **Autenticación y legal**: son pantallas de un solo acto. Un botón de tutorial
  en `/legal/accept` ofrece una manera de no aceptar. Es la misma exclusión que
  PE-02 aplicó a «Ayuda», y por el mismo motivo.
- **Editorial**: la FAQ ya es la ayuda. Un tutorial de cómo usar la ayuda es una
  señal de que la ayuda no se entiende.
- **Consola de plataforma**: sus usuarios son tres personas de Trazaloop. Si
  alguna vez hacen falta, no son producto.
- **Impresión**: es papel.

---

## PET-38 · Las claves que hacen falta

**Existen: 10.** El registro de PE-02 cubre Quality (7), PCR (2) y Textiles (1).

**Se proponen ~15 más** para llegar a una cobertura de primera ola. No se añaden
en PE-03A: se listan.

### Quality · faltan

| Clave propuesta | Pantalla |
|---|---|
| `quality.home` | Inicio de Quality |
| `quality.map` | Mapa de procesos |
| `quality.people` | Personas y cargos |
| `quality.suppliers` | Proveedores |
| `quality.audits` | Auditorías |
| `quality.customer_voice` | Voz del cliente |
| `quality.management_review` | Revisión por la dirección |
| `quality.objectives` | Objetivos |
| `quality.copilot` | Trazaloop Intelligence |

### PCR · faltan

| Clave propuesta | Pantalla |
|---|---|
| `cpr.home` | Panel de PCR |
| `cpr.catalog` | Catálogos |
| `cpr.trazadocs` | TrazaDocs |
| `cpr.diagnostic` | Diagnóstico |

### Textiles · faltan

| Clave propuesta | Pantalla |
|---|---|
| `textiles.home` | Inicio de Textiles |
| `textiles.traceability` | Trazabilidad |
| `textiles.products` | Productos y composiciones |

### Global · faltan

| Clave propuesta | Pantalla |
|---|---|
| `platform.modules` | La puerta · `/modules` |
| `platform.team` | Equipo |
| `platform.settings.company` | Datos de empresa |

### Las 43 páginas de detalle

**Excluidas de la primera ola, no del sistema.** Una ficha de proceso concreta no
necesita su propio vídeo: lo que hay que aprender es cómo funcionan las fichas de
proceso, y eso se explica en el listado.

PE-02 ya creó `quality.processes.detail`, así que el registro admite fichas de
detalle cuando alguna lo merezca de verdad.

---

## PET-39 · Los módulos son independientes

Un tutorial de Quality no aparece en PCR, y **no hay respaldo entre módulos**. Si
una pantalla de Textiles no tiene vídeo, dice que está en actualización; no
enseña el de PCR.

La clave ya lleva el módulo dentro —`quality.*`, `cpr.*`, `textiles.*`— y el
registro lo declara aparte, así que la independencia no hay que vigilarla: no hay
por dónde mezclarse.

**Construcción no tiene tutoriales**, porque no tiene módulo. Cuando lo tenga, sus
claves llegarán con él. No se fabrica contenido para algo que no existe.

---

## PET-40 · Demo, Free, Full y Extra ven lo mismo

**El tutorial no se cobra.** Decisión congelada §32, y coincide con lo que PE-02B4
decidió para la ayuda contextual: si se puede ver la pantalla, se puede ver su
explicación.

Lo que sí sigue aplicando es el **acceso al módulo**: quien no entra a Textiles
tampoco ve sus pantallas, así que tampoco sus tutoriales. Pero eso lo decide la
puerta del módulo, no una comprobación de plan dentro del tutorial.

**No hay ninguna consulta de plan en el camino del tutorial.** Es la forma de
garantizarlo: no se puede olvidar de comprobar algo que no se comprueba.

---

## PET-41 · Primera ola

No hace falta cubrir 147 pantallas para cerrar PE-03. Hace falta que las que más
se usan tengan vídeo y el resto lo diga.

**Ocho, por orden:**

| | Pantalla | Por qué |
|---|---|---|
| 1 | Bienvenida | qué es Trazaloop, antes que cualquier pantalla |
| 2 | `/modules` | la puerta; se ve siempre |
| 3 | Inicio de Quality | el módulo principal |
| 4 | Procesos | el corazón de Quality |
| 5 | Partes interesadas | la que ya tiene ayuda contextual, y se compara bien |
| 6 | Mapa de procesos | la que más cuesta entender sin ver |
| 7 | Contenido reciclado · PCR | la operación principal de PCR |
| 8 | Pasaportes · Textiles | la operación principal de Textiles |

Las tres últimas garantizan que **los tres módulos estrenan con vídeo**, que es lo
que evita que el sistema parezca «una cosa de Quality».

---

## PET-42 · La relación con Ayuda

**Se dejan separados**, y no se convierte «Ayuda» en un desplegable.

| | Responde a | Dónde |
|---|---|---|
| **Ayuda** | «¿cómo funciona esto en general?» | barra superior → `/faq` |
| **Ver video tutorial** | «¿cómo se usa **esta** pantalla?» | barra superior, junto a Ayuda |
| **Botón «i»** | «¿qué es este campo?» | dentro del formulario |

Tres preguntas distintas, tres respuestas en tres sitios. Un desplegable las
juntaría en un sitio y añadiría un clic a las tres.

**Y no se duplica contenido.** El botón «i» da *qué es / ejemplo / respaldo*; el
vídeo enseña *cómo se hace*. Son complementarios, y no hay ningún motor que
copie el texto de uno al otro.

Cuando PE-03 sume el soporte, la barra tendrá tres entradas y habrá que
reconsiderarlo. **Hoy son dos, y dos caben.**
