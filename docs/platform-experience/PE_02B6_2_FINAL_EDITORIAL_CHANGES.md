# PE-02B6.2 · Lo que se corrigió, y lo que sigue sin publicarse

PE-02B6.1 encontró cuatro cosas que impedían publicar y una que las englobaba a
todas: el documento se habría mostrado con la sintaxis a la vista. Este tramo las
corrige. **No publica nada.**

*31 de agosto de 2026 · rama `feature/platform-experience-pe02`.*

> Este documento **no repite** la política completa. Está entera y exacta en
> [`PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md`](PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md),
> y lo que cambió respecto de aquella copia es lo que se lista aquí.

---

## A · Los cambios exactos al borrador de privacidad

Cinco. Ninguno toca una afirmación de fondo; los cinco quitan andamiaje o
corrigen una contradicción.

### A1 · Fuera el cartel de borrador y las rutas del repositorio

Se eliminó de la cabecera el recuadro que empezaba «Este documento es un
BORRADOR», con sus dos referencias a ficheros del repositorio, y la línea
`**Estado:** BORRADOR SUCESOR — PENDIENTE DE REVISIÓN Y APROBACIÓN`.

Que sea un borrador **se sigue diciendo**, pero donde corresponde: en el
metadato del producto. La fila tiene `status = 'draft'` y `published_at` vacío, y
la consola lo escribe en su cabecera —«Es un borrador: no está vigente, no se
puede aceptar y no lo ve nadie fuera de esta consola»—. El estado editorial es
del producto, no del contrato.

### A2 · Fuera el recuadro de «Pendiente de confirmación» del § 18.3

Decía que faltaba saber qué proveedor está contratado, y remitía a un fichero del
repositorio. Las dos confirmaciones que sí bloqueaban ya estaban incorporadas —no
hay autorización de entrenamiento activada, no hay retención cero contratada— y
siguen escritas palabra por palabra. Lo que se quitó es la nota interna.

### A3 · El § 21 dejó de fechar el documento en su versión anterior

Decía versión **1.0** y **27 de julio de 2026**, contradiciendo la cabecera.

**Y no se ha puesto una fecha nueva**, que era la trampa fácil. La política no se
publica hoy, así que cualquier fecha escrita ahora sería una invención que
además podría no coincidir con la real. El artículo dice ahora de dónde sale:

> **Fecha de entrada en vigor:** la de su publicación en la plataforma. La
> plataforma la registra al publicar la versión y la muestra junto al documento,
> y esa misma fecha queda en la constancia de cada aceptación.
>
> Esta política no fija su fecha de entrada en vigor dentro del propio texto: la
> toma del registro de publicación, para que lo que dice el documento y lo que
> consta en la plataforma no puedan separarse.

Es lo que el modelo de datos ya soportaba: `published_at` se escribe al publicar
y `retired_at` al suceder. Duplicar ese dato dentro del texto es exactamente
cómo se consigue que un día no coincidan.

### A4 · Resend salió de la tabla de encargados

Ver la sección C.

### A5 · El § 11 dice **cuándo** interviene el proveedor de IA

La tabla de encargados tenía dos columnas y ahora tiene tres. Supabase y Vercel
intervienen «Siempre»; el proveedor de inteligencia artificial, «**Solo** cuando
la empresa tiene habilitado Trazaloop Intelligence y alguien lo usa». Y se añadió:

> La intervención del proveedor de inteligencia artificial **no es permanente ni
> automática** […] Donde la función no está habilitada, o no se usa, **no se
> envía nada a ese proveedor**.

El motivo está en la sección D: en Producción no hay proveedor configurado.
Describir un envío permanente habría sido describir algo que allí no ocurre.

### A6 · El título dejó de salir dos veces

*(Encontrado al construir el intérprete, no en B6.1.)* El cuerpo empezaba con
`# Política de tratamiento de datos personales y privacidad`, que es exactamente
el `title` de la fila. `/privacy` pinta el título y luego el cuerpo, así que el
lector lo habría visto repetido. Se quitó del cuerpo.

### Lo que NO se tocó

Ni una afirmación de fondo. Los artículos 1 a 10, 12 a 20, y las tres capas del
§ 18 están como los aprobó la revisión de B6.1.

---

## B · Los resúmenes del borrador

| Momento | md5 del contenido | Longitud |
|---|---|---|
| Al terminar PE-02B6.1 | `03c0ade478219ac4e970e2e25fa3d302` | 25 086 |
| Tras A1–A5 | `e3dde683c8cedbab7d2a46eff2aba9cc` | 24 928 |
| **Final de PE-02B6.2** | **`a963c09ec1acdae7d68c9824a48e796b`** | **24 868** |

**Local y Staging tienen el mismo**, y coincide con el archivo del repositorio.
La política vigente **v1 no se tocó**: hay una comprobación que falla si crece o
si cambia su texto.

---

## C · Resend

**Resultado: eliminado.**

Se volvió a auditar, y esta vez sobre las dependencias además del código:

| Dónde se buscó | Qué apareció |
|---|---|
| `dependencies` del proyecto | `@supabase/ssr`, `@supabase/supabase-js`, `fflate`, `next`, `openai`, `qrcode`, `react`, `react-dom`, `server-only`, `sharp`. **Ningún cliente de correo.** |
| `app/`, `lib/`, `components/` | Una sola aparición de «resend», dentro de `lib/domain/legal-package.ts` — es decir, **dentro del propio texto legal**, no en una integración |
| Envío de correo en general | Cero: ni `nodemailer`, ni `sendgrid`, ni `postmark`, ni `mailgun`, ni ninguna llamada de envío |

Los correos de autenticación los envía el proveedor de identidad. Declarar un
encargado que no trata nada es tan inexacto como omitir uno que sí, y mantenerlo
«por si acaso» habría sido declarar un tratamiento inexistente.

**Queda una cosa por decidir, y no es de este tramo:** `lib/domain/legal-package.ts`
—el paquete jurídico v1.0 que se muestra en `/legal/paquete`— sigue nombrando a
Resend en dos sitios. Es un documento **aprobado el 27 de julio**, no un borrador,
y corregirlo es una decisión editorial sobre el paquete completo. Se señala; no
se toca.

### Y de paso, los encargados que sí

| Proveedor | Servicio | Evidencia |
|---|---|---|
| **Supabase** | Autenticación, base de datos y almacenamiento | `@supabase/ssr` y `@supabase/supabase-js`, usados en todo el acceso a datos |
| **Vercel** | Alojamiento y entrega | Es donde se despliega |
| **Proveedor de IA** | Respuestas de Trazaloop Intelligence | `lib/ai/providers/` · **solo donde la función está habilitada** |

**No se inventó ninguno.** No hay analítica, ni monitorización de errores, ni
pasarela de pago, ni proveedor de correo, ni proveedor de soporte. Se buscaron
los dieciséis sospechosos habituales y los tres únicos aciertos —«resend»,
«sentry», «segment»— resultaron ser: el texto legal, la palabra `processEntry` y
la columna `segment` de un perfil de cliente.

---

## D · El proveedor de IA

### En Preview

```
PREVIEW PROVIDER = OPENAI
```

**Cómo se verificó, sin tocar una credencial.** La plataforma lleva su propio
libro de ejecuciones: `quality_ai_runs` guarda, por consulta, con qué proveedor y
con qué modelo se respondió. Es el diagnóstico que la propia consola de
plataforma usa. En Staging:

| Proveedor | Modelo | ¿Llamó de verdad? | Ejecuciones |
|---|---|---|---|
| **openai** | `gpt-5.4-mini` | **sí** | **26** |
| openai | `gpt-5.4-mini` | no | 3 |
| fake | `doble-determinista-1` | — | 43 |

`anthropic` **no aparece ni una vez**. Y `gpt-5.4-mini` es precisamente
`defaultModel("openai")` en `lib/ai/config.ts`; el de Anthropic sería
`claude-sonnet-5`.

Las `fake` no contradicen nada: son las ejecuciones de arneses de prueba
apuntados a Staging, que no llevan proveedor configurado y caen en el doble
determinista. Aparecen intercaladas con las de OpenAI en los mismos días, así que
no son un cambio de configuración.

**Lo que no se hizo:** leer, exportar ni volcar ninguna variable de entorno.
`QUALITY_AI_PROVIDER`, `QUALITY_AI_MODEL` y `QUALITY_AI_REASONING_EFFORT` están
marcadas **Sensitive** en Vercel, lo que significa que su valor no se puede leer
de vuelta ni siquiera con permisos —es una propiedad del producto, no una
precaución nuestra—. No se ejecutó ningún `env pull`.

**El límite de esta verificación, dicho:** es el registro de lo que se ejecutó
entre el 27 y el 28 de agosto, no una lectura de la configuración de hoy. Las
tres variables se crearon hace cuatro o cinco días y no constan modificadas
después. Si alguien la cambiara sin que se ejecutara ninguna consulta, este
método no lo vería.

### En Producción

```
PRODUCTION PROVIDER = NOT CONFIGURED
```

Las variables del proyecto de Producción son cinco —`NEXT_PUBLIC_SITE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, `TEXTILES_MODULE_ENABLED`— y ninguna es de IA. Sin
proveedor reconocido, `aiConfig()` cae en el doble determinista, que no llama a
nadie. Coherente con Producción en la migración 0111: ni Quality ni Intelligence
están allí.

**Por eso el § 11 se escribió en condicional.** Ningún texto de cliente afirma
que hoy se envíe información a un proveedor de IA.

---

## E · Las respuestas 10 y 11

| | Estado |
|---|---|
| **FAQ 10 · entrenamiento** | **LISTA** · su procedencia es documentación de OpenAI y OpenAI es el proveedor verificado. Texto sin cambios |
| **FAQ 11 · retención** | **LISTA** · misma procedencia, y con el retoque de legibilidad de abajo |

Las dos siguen en `verified_with_qualifier`, con su salvedad escrita y su fuente
fechada el 31/08/2026. **Ninguna se publicó y no se creó ninguna revisión.**

En la procedencia interna de las dos se sustituyó «documentación oficial del
proveedor» por «documentación oficial de **OpenAI**, que es el proveedor
verificado en el entorno desplegado». Es metadato de revisión, no texto de
cliente: quien apruebe tiene que poder ver de quién es la política citada.

**En el texto que ve el cliente no se nombra a nadie**, ni en la FAQ ni en la
política. Nombrarlo es una decisión de negocio que nadie ha tomado, y además
convertiría cada cambio de proveedor en una versión nueva de la política —y una
versión nueva obliga a todo el mundo a aceptar otra vez—. Queda en la hoja de
decisión.

---

## F · La respuesta 11, antes y después

Solo la respuesta corta y un párrafo de la larga. Las cinco exigencias de
significado se conservan íntegras.

### Respuesta corta

**Antes** *(342 caracteres, una sola frase de 47 palabras)*

> Según la documentación oficial del proveedor, las peticiones y respuestas
> pueden conservarse HASTA 30 DÍAS con fines de prestación del servicio y
> vigilancia de abusos, salvo que una obligación legal o la protección del
> servicio exijan más tiempo. Trazaloop no tiene contratado un acuerdo de
> retención cero, así que ese plazo es el que aplica.

**Después** *(318 caracteres, tres frases; la primera de tres palabras)*

> Hasta 30 días. Según la documentación oficial del proveedor, las preguntas y
> respuestas pueden conservarse ese tiempo para prestar el servicio y vigilar
> abusos, y más si una obligación legal o la protección de su servicio lo
> exigen. Trazaloop no tiene contratado un acuerdo de retención cero, así que
> ese es el plazo que aplica.

### Respuesta larga · segundo párrafo

**Antes**

> Trazaloop pide en cada consulta que el contenido no se almacene en los
> repositorios de la interfaz de programación. Esa petición reduce lo que se
> guarda, pero NO es un acuerdo de retención cero: son dos mecanismos distintos,
> y decimos con claridad que el segundo no lo tenemos.

**Después**

> En cada consulta, Trazaloop le pide además que no guarde el contenido en sus
> repositorios. Esa petición reduce lo que se almacena, pero NO es un acuerdo de
> retención cero: son dos mecanismos distintos, y el segundo no lo tenemos.

### Lo que se comprobó que sigue diciendo

| | |
|---|---|
| Hasta 30 días | ✔ y ahora es lo primero que se lee |
| Que es un máximo, no un plazo fijo | ✔ |
| Las excepciones legales y de protección del servicio | ✔ |
| Que **no** hay retención cero contratada | ✔ |
| Que pedir no almacenar **no es** retención cero | ✔ |
| «interfaz de programación» | **fuera**, de cero apariciones |

Los tres párrafos restantes de la respuesta larga no se tocaron, incluido el que
declara que no afirmamos que nadie del proveedor pueda acceder nunca a contenido
almacenado por él. Es el mismo tipo de límite declarado que hace creíble la
respuesta 4.

---

## G · Cómo se pinta ahora un documento legal

### El defecto

`/privacy`, `/terms` y la consola pintaban el contenido con
`whitespace-pre-wrap`. Con la v1 —cinco párrafos numerados sin formato— funciona.
Con la sucesora, el cliente habría visto veinticinco mil caracteres con los `##`,
los `**` y las tuberías de sus **seis tablas** a la vista.

> **Corrección a PE-02B6.1:** aquel documento dijo «nueve tablas». Son **seis**.
> El número se escribió sin contarlo. La comprobación que lo vigila ahora las
> cuenta en el propio documento en vez de llevar el número escrito a mano.

### Lo que se decidió

**Se escribió un intérprete propio** en `lib/legal/markdown.ts`, en lugar de
instalar `react-markdown` con `remark-gfm`.

Primero se buscó uno existente: el repositorio **no tenía ninguno**, ni ningún
`remark`, `marked` ni equivalente.

La alternativa era añadir dos dependencias y su cuarentena de paquetes
transitivos. Este repositorio ya tomó la decisión contraria en un caso más
difícil: `lib/ai/providers/anthropic.ts` llama al proveedor con `fetch` en vez de
instalar su SDK, y lo razona —«cargar una cadena de suministro entera a cambio de
ahorrar cuarenta líneas»—. Aquí el argumento es más fuerte, porque lo que hay que
interpretar está cerrado y es pequeño: encabezados, párrafos, negrita, cursiva,
literales, listas, enlaces, tablas, citas y separadores. **Cero dependencias
nuevas.**

### Por qué es seguro

**No es que se limpie el HTML: es que no se produce HTML.** El módulo devuelve un
árbol de datos y `components/legal/legal-content.tsx` lo convierte en elementos
de React, donde todo el texto pasa por el escapado de React. No hay
`dangerouslySetInnerHTML` en ninguno de los dos ficheros, y hay una comprobación
que falla si aparece. Un `<script>` escrito dentro de un documento **se ve**; no
se ejecuta, y está probado en un DOM real.

Los enlaces solo se crean con `http://`, `https://`, `mailto:` o un destino
relativo del propio sitio. `javascript:` y `data:` no producen enlace — y **no se
pierde el texto**: se pinta en llano. Los externos llevan `rel="noopener
noreferrer"`.

**Y no hay una sola expresión regular en el intérprete.** Las estructuras se
reconocen leyendo caracteres. Una expresión regular sobre texto que escribe una
persona en una consola es donde aparecen los retrocesos catastróficos, y hay una
comprobación que falla si alguien introduce una.

### Tres detalles que importan más de lo que parecen

**Una línea en blanco no cierra una lista** si detrás viene otro punto del mismo
tipo. Sin eso, la política vigente —cinco párrafos numerados separados por
blancos— habría salido como cinco listas empezando todas en «1.».

**Una línea sangrada continúa el punto anterior.** El borrador tiene puntos de
tres líneas; partirlos habría inventado puntos.

**El guion bajo NO abre cursiva.** En Markdown estándar sí; aquí no, porque en
este dominio los guiones bajos viven dentro de identificadores y
`organization_id` en cursiva rompe el texto sin que nadie lo pidiera.

### Tipografía y jerarquía

Se usa la paleta de siempre —`ink`, `ink-soft`, `hairline`, `loop`— con ancho de
párrafo cómodo, listas legibles, bordes finos en las tablas y enlaces subrayados
y en verde. Nada decorativo.

La jerarquía **se normaliza**: se toma el nivel más alto que el documento
realmente usa y se lleva a `<h2>`, porque la página ya pone su `<h1>`. Así ningún
documento salta de `<h1>` a `<h3>`, escriba quien escriba y use `#` o `##` para
sus artículos. Está probado recorriendo los niveles del documento real.

### En un teléfono

Cada tabla va dentro de su **propio** contenedor con desplazamiento horizontal, y
el ancho mínimo lo lleva la tabla, no el contenedor. Al revés, el que se
desplazaría sería la página entera y el documento se leería de lado. Las dos
condiciones están probadas en el DOM.

### Las tres pantallas ven lo mismo

`/privacy`, `/terms` y `/platform/legal/[id]` usan el mismo componente. Que la
consola enseñara algo distinto de lo que verá el cliente es justo el fallo que
hace que se apruebe una cosa y se publique otra.

**Y no cambia nada del documento.** El componente recibe el texto y pinta: no lo
guarda, no lo normaliza y no toca la aceptación. La v1 vigente se sigue viendo
bien **sin migrar nada**, y hay tres comprobaciones dedicadas a ello.

---

## H · Las observaciones de identidad, clasificadas

| Observación | Clase | Por qué |
|---|---|---|
| El § 21 fechaba el documento en la versión 1.0 | **CORREGIDO** | Era una contradicción interna, no una preferencia |
| El canal alterno es una dirección postal | **DECISIÓN DE NEGOCIO** | No es un defecto: hay un correo de habeas data que funciona. Solo hay que confirmar que lo que llegue por correo postal se atiende, o añadir el teléfono del § 1 como alterno |
| El mismo correo sirve para lo general y para privacidad | **ACEPTABLE COMO ESTÁ** | Es válido y habitual en organizaciones de este tamaño. Solo conviene saber que mezcla correspondencia con plazos legales y correspondencia sin ellos |
| La autoridad de vigilancia no se nombra | **REVISIÓN JURÍDICA RECOMENDADA** | En Colombia sería la Superintendencia de Industria y Comercio. Nombrarla ayuda al titular; omitirla puede ser deliberado, y esa es una decisión de abogado |
| Tres dominios sin explicar la relación | **DECISIÓN DE NEGOCIO** | `@idendi.org` legal, `@cirquiloconsultores.com` soporte, `@trazaloop.com` el sitio. No es falso, pero quien escriba a `privacidad@trazaloop.com` no llegará a nadie |
| Resend como encargado | **CORREGIDO** en el borrador · **SEÑALADO** en el paquete v1.0 | Ver la sección C |

**Ninguna se corrigió por preferencia.** Las dos corregidas eran defectos
factuales; las otras cuatro se dejan como están y se deciden fuera.

---

## I · Lo que sigue necesitando una persona

1. **¿Se aprueba la política v1.1?** Es lo único que abre B5B.
2. **¿Se publican las quince respuestas?** Las quince, o algunas.
3. **¿Se nombra al proveedor de IA en la FAQ?** Hoy se dice «el proveedor». Está
   verificado que es OpenAI; nombrarlo en público es decisión de negocio.
4. **¿Se corrige el paquete jurídico v1.0** —Resend, y que cuatro de sus seis
   documentos tampoco mencionan Intelligence—, o se deja para después?
5. **La autoridad de vigilancia**: ¿se nombra en el § 15?
6. **El canal alterno**: ¿se confirma el postal o se añade el teléfono?
7. **Las fechas**, si se aprueba: la de aprobación se decide; la de entrada en
   vigor la pone la plataforma al publicar.

**Y una advertencia jurídica que no cambia:** que las pruebas estén en verde
significa que lo que el documento afirma coincide con lo que la plataforma hace.
**No significa conformidad legal.** Nadie ha revisado este texto como abogado, y
este documento no lo declara conforme a ninguna ley.

---

## J · El conjunto de publicación propuesto

| | Respuestas | Condición |
|---|---|---|
| **Listas, sin depender del proveedor** | 1–9, 12–15 · **trece** | Ninguna |
| **Listas, con el proveedor ya verificado** | **10** y **11** | Ninguna. La comprobación pendiente en B6.1 se hizo: es OpenAI |

**Las quince están listas.** La condición que las separaba desapareció al
verificar el proveedor.

**Orden recomendado**, sin cambios respecto de B6.1: las trece → la política v1.1
→ las dos de IA. Las dos de IA no deberían salir mientras la política vigente sea
la preliminar que no menciona la inteligencia artificial; publicarlas antes
dejaría dos textos públicos que no coinciden.

**Nada de esto se ha ejecutado.** Cero revisiones publicadas, la vigente sigue
siendo la v1, y nadie ha tenido que volver a aceptar.
