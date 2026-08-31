# PE-01A · ARQUITECTURA DE LA EXPERIENCIA DE ENTRADA

Decisiones **PEM-01 … PEM-14**. Congeladas salvo las cinco marcadas
**«requiere decisión humana»**, que van al final del informe.

---

## PEM-01 · Después de entrar se ve la puerta, no un módulo

El destino tras el login sigue siendo `/modules`, y pasa a llamarse por lo que es: la
**puerta de Trazaloop**. No se redirige a ningún módulo automáticamente, ni siquiera cuando
la empresa tiene uno solo.

**Por qué.** Entrar directo al único módulo ahorra un clic el primer día y esconde el
producto para siempre: quien nunca ve la puerta no sabe que hay más módulos, ni que el suyo
tiene un estado, ni cómo volver. Y el ahorro es de **un** clic.

**Riesgo, y cómo se cubre.** Un clic extra cada día para una empresa de un solo módulo.
Se mitiga con PEM-09 —una entrada grande, obvia y por encima del pliegue—, no volviendo a
redirigir.

→ **Requiere decisión humana (D1):** si el humano prefiere autoentrar con un solo módulo,
la alternativa está descrita en §D1 del informe.

---

## PEM-02 · La puerta es una HOME, no una lista

Deja de titularse «Elige un módulo». Pasa a ser la **Home de Trazaloop**: qué es esto, en
qué empresa estás, qué módulos tienes y a cuál entras.

Contenido mínimo, y nada más (§14):

```
Cabecera         Trazaloop · empresa activa · cambiar
Frase corta      qué es Trazaloop
QUALITY          bloque protagonista
Especializados   PCR · Textiles · Construcción
Estado           lo que no se puede abrir, y por qué
```

**Fuera de PE-01:** FAQ, precios, vídeos, tutoriales, novedades y soporte. Se dejan
**huecos con nombre** (PEM-14), no marcadores falsos.

---

## PEM-03 · Quality es el protagonista, y la jerarquía lo dice

Un bloque de ancho completo arriba; los tres especializados debajo, en una fila secundaria.
Las cuatro tarjetas **dejan de ser iguales**.

**Por qué Quality y no otro.** Es el sistema de gestión transversal: procesos, riesgos,
objetivos, personas, proveedores, auditorías, acciones y mejora. PCR y Textiles son
trazabilidades **especializadas** que resuelven un sector. Presentarlos al mismo nivel
cuenta mal el producto.

**Lo que la jerarquía NO puede hacer:** conceder acceso. Si la empresa no tiene Quality, el
bloque protagonista lo dice y no ofrece entrada. La jerarquía es del **producto**; el acceso
es de la empresa (PEM-11).

---

## PEM-04 · Los estados son los que ya existen

Se reutilizan los nueve de `lib/modules/access.ts` sin añadir ninguno. El mapeo con el
vocabulario del encargo:

| Encargo | Estado real |
|---|---|
| AVAILABLE | `full` · `extra` · `demo_permanent` |
| TRIAL / DEMO | `demo_active` |
| EXPIRED | `demo_expired` |
| NOT INCLUDED | `not_assigned` |
| COMING SOON | `coming_soon` |
| DISABLED | `disabled` |
| *(kill switch)* | `globally_disabled` |
| FREE / FREEMIUM | **no existe todavía** → PE-04 |

**No se inventa `free`.** El diseño deja sitio para una etiqueta más y una línea de límite
(PEM-12), y nada más.

---

## PEM-05 · Sin dato NO es «no lo tienes» · corrige **PE-D1**

`getOrganizationModuleAssignment` descarta el `error` de la lectura, así que un fallo se
convierte en `not_assigned` y la tarjeta dice **«no está asignado a la empresa»**.

**Decisión:** el acceso de un módulo pasa a distinguir tres cosas —**se pudo leer y no hay
asignación**, **no se pudo leer**, y **el rol no llega**— y el selector las comunica
distinto:

| Situación | Qué se ve |
|---|---|
| leído, sin asignación | «No incluido en tu plan» |
| **no se pudo leer** | «No fue posible comprobar tu acceso a este módulo.» + reintentar |
| cargando | esqueleto, **nunca** una tarjeta con estado |

**Nunca** se pinta PCR —ni ningún módulo— «por defecto» mientras carga.

**Es la decisión más importante de PE-01.** Es la misma que Quality tomó cinco veces, y la
puerta de entrada es donde más caro sale equivocarse: quien lee «no lo tienes» cierra el
navegador.

---

## PEM-06 · Un módulo existente y no contratado SE MUESTRA

Se ve, con su nombre, su descripción y su estado. Sin enlace de entrada.

**Por qué no esconderlo.** Un catálogo que oculta lo que no has comprado impide saber que
existe. Y esconderlo tampoco protege de nada: el portal público ya los lista.

**Por qué no engañar.** Nada de «Entrar» que lleve a un rechazo. El botón, cuando lo haya,
dirá **«Ver planes»** y lo resolverá PE-05.

**En PE-01 no hay destino comercial**, así que **no hay botón**: la tarjeta explica el
estado y ya. Un enlace a una página que no existe es peor que ningún enlace.

→ **Requiere decisión humana (D2)**.

---

## PEM-07 · Una prueba vencida es del módulo, no de la cuenta

Se conserva la clasificación de `classifyDemoNotice`, que ya lo hace bien, con dos cambios:

1. **La banda de pruebas sale del `layout` del shell.** Vivía en todas las pantallas de
   todos los módulos, así que alguien trabajando en Quality leía una y otra vez que su
   prueba de PCR había terminado. Pasa a la **Home** y a la tarjeta del módulo afectado.
2. **Dentro de un módulo solo se avisa de ESE módulo.** Si Quality no está en prueba, en
   Quality no hay banda.

Una prueba vencida **no borra datos**, no se disfraza de módulo activo y no deja a nadie en
el shell equivocado. La vía comercial futura es un hueco (PEM-14), no un enlace roto.

---

## PEM-08 · Empresa · módulo · dos cosas distintas y así se ven

El shell separa las dos identidades sin ambigüedad:

```
[● QA Staging · Pruebas Quality]  cambiar        ← empresa
Trazaloop Quality                 Ver módulos    ← módulo
```

Hoy la empresa está arriba a la derecha con «cambiar», y el módulo aparece como un
`eyebrow` sin acción; volver al selector solo se puede desde el fondo del menú lateral
(«⇄ Cambiar de módulo»), que en móvil está dentro de un desplegable.

**Decisión:** las dos filas anteriores, **visibles en la cabecera** en escritorio y móvil.
Se conserva el enlace del menú lateral: quitar una salida que la gente ya conoce no aporta.

---

## PEM-09 · Ningún módulo es el repuesto de otro · corrige **PE-D2** y **PE-D3**

Tres cambios acotados:

1. `require-platform-staff` deja de mandar a `/dashboard` y manda a **`/modules`**.
2. `resolveShellModuleForPath` deja de caer en CPR: sin ruta de módulo y sin `?m=`, resuelve
   **el módulo entrable de la empresa** si hay uno solo, y si hay varios, una presentación
   **neutra de plataforma** —sin menú de ningún módulo—.
3. El portal público deja de anunciar Quality como «próximamente»: existe.

**Lo que NO cambia:** `/dashboard` sigue siendo la entrada de PCR y `moduleEntryDestinationPath`
sigue devolviéndola. Es correcto: es la casa de PCR, no un repuesto.

---

## PEM-10 · Cambiar de empresa recalcula, y ya lo hace

Se conserva tal cual: cookie + `/modules`. El módulo anterior **no** se arrastra.

**Comprobado:** ninguna ruta conserva el módulo al cambiar de empresa, así que el caso
«empresa A con PCR → empresa B sin PCR» no puede acabar en 404 ni en «acceso denegado».

---

## PEM-11 · Entitlement no es autorización

El selector responde **una** pregunta: *¿puede esta empresa entrar a este módulo?* Nada de
roles, nada de capacidades, nada de «Full = admin».

Dentro del módulo mandan el rol y las capacidades, como hasta ahora. **Ninguna lógica de rol
entra en el selector.**

---

## PEM-12 · Preparado para el plan gratuito, sin inventarlo

La tarjeta admite **una etiqueta de estado** y **una línea de límite opcional**. PE-04
rellenará ambas; PE-01 no las pinta.

**Y se documenta la transición que PE-04 tendrá que resolver:** hoy `demo` es a la vez
*prueba temporal de 48 h* y *suelo* cuando no queda nada vivo. **Demo ≠ Gratis.** Un plan
gratuito es permanente, con límites; una prueba es temporal y vence. Reutilizar `demo` para
el gratuito mezclaría las dos y rompería `classifyDemoNotice`, que hoy es correcto.

---

## PEM-13 · Construcción se ve, no se promete

Visible, sin entrada, con la etiqueta **«Próximamente»** que ya existe. Sin «Conocer más»:
no hay destino real, y un enlace a nada es peor que ninguno. Visualmente atenuada, para que
no parezca disponible.

---

## PEM-14 · Huecos con nombre para los PE siguientes

Sin implementarlos y sin marcadores falsos:

| PE | Hueco |
|---|---|
| **PE-02** | ayuda y FAQ · un sitio en la cabecera de la Home |
| **PE-03** | vídeo de bienvenida y tutoriales · las **claves estables** ya existen: `CommercialModuleKey` para módulo y la ruta para pantalla. **No** se crea tabla de tutoriales |
| **PE-04** | plan y límites · la etiqueta y la línea de PEM-12 |
| **PE-05** | precios y contratación · el botón «Ver planes» de PEM-06 |

La clave de módulo (`cpr` · `textiles` · `quality` · `construccion`) es **estable desde
T9F** y ya es el identificador que PE-03 necesita. No hace falta inventar otro.
