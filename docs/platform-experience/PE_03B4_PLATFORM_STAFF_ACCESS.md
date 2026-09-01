# PE-03B4 · Llegar a «Tutoriales» sin saberse la dirección

> **Observación humana (GAP 1).** «Al entrar en el contexto de empresa, el
> acceso a la administración de tutoriales desaparece o deja de ser
> descubrible.»

Era cierto, y por dos caminos distintos. Este documento explica los dos, porque
solo uno de ellos era el que se veía.

---

## 1 · Lo que estaba roto de verdad

**La consola de plataforma no nombraba «Tutoriales» en su propio menú.**

PE-03B2 añadió la entrada a `PLATFORM_GROUP` —el grupo plegable del menú del
shell de empresa— y se olvidó del menú de `app/(app)/platform/layout.tsx`, que
es el de la consola. Ahí estaban Preguntas frecuentes, Ayuda del producto y
Documentos legales; Tutoriales no.

Resultado: estando **dentro de la administración de plataforma**, la única
manera de llegar a los tutoriales era escribir la dirección.

Eso no es «poco descubrible»: es una omisión.

---

## 2 · Lo que estaba escondido

Dentro de una empresa el enlace **sí existía**, en el grupo «Plataforma» del
menú lateral. Pero ese grupo va al final, después de las trece entradas del
módulo activo, dentro de un `<details>` plegable.

Existía y no se encontraba. Para quien busca, eso es lo mismo que no existir.

---

## 3 · Lo que se hizo

### 3.1 · En la consola de plataforma

Dos cosas:

- **El menú** nombra «Tutoriales», entre sus iguales — detrás de «Ayuda del
  producto» y delante de «Documentos legales». Una prueba comprueba que va antes
  de las entradas de cuenta, comparando posiciones y no leyendo el orden a ojo.
- **El panel** (`/platform`) ahora enseña sus cinco destinos de contenido en
  tarjetas: Tutoriales, Preguntas frecuentes, Ayuda del producto, Documentos
  legales y Estructuras TrazaDocs. Antes no nombraba ninguno: un panel que no
  enseña sus destinos obliga a recordarlos.

### 3.2 · Dentro de una empresa

Un enlace **«Tutoriales» en la barra superior**, junto a «Ayuda» y «Ver video
tutorial».

Va en la barra por dos razones. Es donde ya viven las dos cosas que se buscan
cuando uno se atasca. Y la barra no cambia al navegar entre pantallas del
módulo: eso es lo que hace que el acceso sea **persistente** y no un enlace que
aparece en algunas pantallas.

El grupo del menú lateral **no se quitó**. Quien ya sabía buscarlo ahí no tiene
que aprender nada nuevo.

---

## 4 · Y no contamina la navegación de la empresa

`PlatformTutorialsLink` devuelve `null` si quien mira no es personal de
plataforma. No está oculto por CSS ni deshabilitado: **no se pinta**.

La decisión la toma el **servidor**: `checkPlatformStatus()` en el layout del
shell, la misma llamada que ya decidía si mostrar el grupo «Plataforma». No es
un rol de empresa —`platform_staff` es una capa aparte de las pertenencias— y no
depende de la organización activa.

Va además **marcado como herramienta interna**: borde ámbar y un `title` que lo
dice. Un superadministrador que esté acompañando a un cliente compartiendo
pantalla tiene que poder ver, de un vistazo, que eso no lo ve el cliente.

Y el enlace no es una puerta. Si alguien llega a `/platform/tutorials` por la
dirección sin papel de plataforma, `requirePlatformStaff()` sigue estando.

---

## 5 · Superadministrador y soporte

| Papel | Qué puede |
|---|---|
| `superadmin` | Entra a la consola, crea, sube, publica, repone y retira |
| `support` | Entra a la consola y lo consulta todo, incluida la historia |
| Usuario de empresa | **No ve el enlace, y el guard lo devolvería a la puerta** |

El enlace nuevo se ofrece a todo el personal de plataforma, igual que el del
menú lateral. Que `support` pueda consultar y no escribir **lo decide la base**,
no este enlace: las funciones de escritura exigen `is_platform_superadmin()`.
Esconderle el enlace a `support` habría sido decidir en el menú algo que ya está
decidido donde importa.

---

## 6 · Son dos cosas distintas, y se llaman distinto

|  | Quién lo usa | Qué hace |
|---|---|---|
| **«Ver video tutorial»** | cualquiera | Ver el vídeo **de esta pantalla** |
| **«Tutoriales»** | personal de plataforma | **Administrar** los vídeos |

Un superadministrador ve los dos a la vez, y por eso no pueden llamarse igual.
Una prueba comprueba que ninguno usa el nombre del otro.

---

## 7 · Qué NO se hizo

- No se creó un sistema de diseño de administración nuevo.
- No se movió la consola de tutoriales dentro del shell de empresa. Sigue fuera,
  y por la razón de siempre: administrar la plataforma no exige tener una
  empresa activa.
- No se añadió ninguna herramienta de plataforma a la puerta de módulos, que la
  ve cualquiera.
