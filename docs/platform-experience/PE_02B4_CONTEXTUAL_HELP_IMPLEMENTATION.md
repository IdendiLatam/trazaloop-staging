# PE-02B4 · La ayuda del botón «i», administrable

**Migración:** `0158_platform_contextual_help.sql`
**Cabeceras:** Local **0158** · Staging **0158** · Production **0111**

---

## 1 · Qué cierra

El botón «i» funciona desde T9G: accesible, se cierra con Escape, devuelve el
foco, y no pinta nada cuando no hay contenido. Lo que no se podía era **escribir
en él sin desplegar**. Las once ayudas de partes interesadas —las mejores que
tiene el producto, con explicación, ejemplo y respaldo normativo— vivían en una
constante de TypeScript: corregir una coma exigía un despliegue.

---

## 2 · Un solo componente, extendido

`components/ui/section-hint.tsx` **no se toca**. Conserva `type="button"`,
`aria-expanded`, `aria-label`, Escape, foco devuelto y la regla de no pintar nada
sin contenido.

Lo que cambia es de dónde viene el texto. `helpToHint()` convierte la ayuda
administrada al `ResolvedHint` que el componente ya esperaba desde T9G. Es la
diferencia entre extender lo que hay y estrenar un segundo motor de tooltips —hay
una prueba que recorre `components/` y falla si aparece un `HelpPopover`,
`FaqTooltip` o similar.

---

## 3 · Tres tablas, el patrón de siempre

| Tabla | Qué | ¿Muta? |
|---|---|---|
| `help_items` | **dónde** está pegada: módulo, pantalla, tipo y elemento | sí |
| `help_item_revisions` | el **texto**, con su vigencia | **no** |
| `help_item_drafts` | el **borrador** | sí |

Sin `organization_id`: la ayuda es catálogo del producto. Que se lea dentro de
una empresa no la convierte en dato de esa empresa.

La identidad **no guarda el texto** ni la ruta. Cambiar el título de una ayuda o
mover una pantalla de dirección no mueve nada.

---

## 4 · El contenido, en tres campos y no en uno

Hoy las once ayudas guardan `"QUÉ ES\n…\n\nEJEMPLO\n…"` en una sola cadena.
Funciona porque siempre las escribió la misma persona; en cuanto lo administre
alguien más, esa convención se rompe —faltará un salto de línea, o el título irá
en minúsculas— y la pantalla pintará un bloque raro sin que nadie sepa por qué.

Separados: `title`, `explanation`, `example`, `technical_reference`. La pantalla
decide cómo se ven y quien escribe no tiene que acordarse de un formato.

**Solo `explanation` es obligatoria.** Un ejemplo inventado para rellenar un
campo es peor que no tener ejemplo, y dos de las once se sembraron sin respaldo
normativo porque el texto original no lo tenía.

`do_not_invent` y `normative_class` vienen de 0136 y son **internos**: no salen
por la lectura del producto.

---

## 5 · Qué se ve al pulsar

```
QUÉ ES
Una parte interesada es quien puede afectar al sistema de gestión…

EJEMPLO
Un cliente institucional del que dependen la mitad de los pedidos…

RESPALDO
ISO 9001:2015, 4.2. Pide determinar las partes interesadas pertinentes…
```

**Solo se pinta lo que tiene contenido.** Un «EJEMPLO» seguido de nada hace
pensar que falta algo por cargar. Y cuando la explicación va sola, **no lleva
rótulo**: si es lo único que hay, poner «QUÉ ES» encima es ceremonia sin
información.

---

## 6 · Una consulta por pantalla · §25

Es la exigencia central del tramo. Una pantalla de Quality tiene once botones
«i»; si cada uno pidiera su texto, abrirla costaría once consultas, y el
duodécimo botón costaría doce sin que nadie se diera cuenta hasta que fuera
lenta.

`getPageHelp(pageKey)` pide **una vez** y devuelve un mapa. La página lo carga y
lo reparte por props a sus secciones; los componentes de abajo **no consultan
nada**, y hay una prueba estática que falla si alguno lo intenta.

Comprobado contra base con un contador de consultas: **11 ayudas → 1 consulta**,
2 ayudas → 1 consulta, y dos pantallas a la vez → 1 consulta.

---

## 7 · La ayuda no se filtra por plan · decisión congelada

Si alguien puede ver la pantalla, puede ver la explicación. La carga no mira
`access_mode`, no importa `hint-access` y no conoce la palabra «Demo» — hay
pruebas de las tres cosas, y una contra base que abre la ayuda con una empresa en
**prueba de Quality** y comprueba que llega el texto completo, no un aviso.

El derecho al módulo lo sigue defendiendo **el guardián de la pantalla**, que es
donde tiene que estar: quien no puede entrar a Quality no llega a ver ningún «i».

Esto la separa de la guía de autoría de TrazaDocs, que **sí** tiene puerta
comercial y la conserva sin cambios.

---

## 8 · Cuando la ayuda falla · §24

**El botón «i» no aparece. La página sigue funcionando.**

Es exactamente lo que ya hacía cuando una sección no tenía texto: un
comportamiento que existe, que la gente conoce, y que no obliga a inventar un
estado de error dentro de un tooltip.

Se eligió así y no un «no se pudo cargar la ayuda» porque la ayuda es
secundaria: quien está rellenando un formulario no debería recibir un aviso de
avería por algo que solo iba a explicarle un campo.

**La avería sí se cuenta donde importa:** la carga devuelve `unavailable` —no un
mapa vacío—, y la consola distingue «sin configurar» de «no se pudo consultar».

Mientras la ayuda administrada no llegue, la pantalla enseña el texto de la
constante. **No es doble verdad**: cuando hay ayuda administrada manda ella, y la
constante es el respaldo hasta que el traslado esté verificado en todos los
entornos.

---

## 9 · La entrada global «Ayuda» · carryover de B3

La revisión humana encontró que al entrar, la ayuda desaparecía: estaba en la
portada pública y en el menú lateral, pero **la barra superior no la tenía** —y
es donde se mira cuando uno se atasca—.

Ahora está en:

| Superficie | Dónde |
|---|---|
| Shell de módulo (Quality, PCR, Textiles) | barra superior |
| Puerta de módulos | cabecera |
| Consola de plataforma | menú lateral |
| Seleccionar empresa | cabecera |
| Mi perfil *(vive fuera del shell)* | cabecera propia |

Se llama **«Ayuda»** y no «FAQ» a propósito: PE-03 sumará el tutorial de la
pantalla y el soporte al mismo sitio, y renombrarlo entonces sería mover algo que
la gente ya sabe dónde está. Hoy lleva a `/faq`.

**No se añadió** a login, registro ni aceptación legal: ahí no hay shell, y hay
una prueba que lo comprueba.

---

## 10 · Relación con la guía de TrazaDocs · §12

**Se quedan separadas, y no por comodidad.**

| | Guía de autoría (0136) | Ayuda contextual (0158) |
|---|---|---|
| Qué dice | qué debería contener una sección de un documento | qué significa un campo de una pantalla |
| Se direcciona por | `(module_key, blueprint_code, section_key)` | `(page_key, target_kind, target_key)` |
| Puerta comercial | **sí**: en Demo el texto no sale de la base | **no**, por decisión congelada |
| Quién la lee | quien redacta un documento | quien mira una pantalla |

Las dos comparten patrón —identidad, revisiones inmutables, publicación por
función, clasificación normativa— y ahí acaba el parecido. Forzar una tabla común
obligaría a que la diferencia comercial viviera en una columna, y una regla
comercial en una columna es una regla que alguien acabará cambiando por
accidente.

**Cero gestión duplicada** sigue siendo el objetivo, y se cumple: ninguna ayuda
está en las dos, y ningún componente usa las dos infraestructuras.

---

## 11 · Lo que este tramo NO hizo

- **No** hay vídeos, tutoriales ni tabla de medios: es PE-03. Lo único que se le
  deja preparado es el vocabulario de pantallas, que vive en `lib/modules/` y no
  en la ayuda.
- **No** se tocó la FAQ ni los documentos legales.
- **No** se publicó nada de seguridad ni se cambió la política de privacidad: es
  B5.
- **No** hay planes, precios ni pagos.
- **No** se migraron las ayudas restantes escritas en código: ver el
  [inventario](./PE_02B4_HELP_MIGRATION_INVENTORY.md).

---

## 12 · Estado

| | Resultado |
|---|---|
| Replay `0001 → 0158` | **0 FAIL** · 54 migraciones en el segundo paso |
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | **EXIT=0** |
| `npm run lint` | 0 errores · 66 avisos (línea base) |
| `npm run build` | **EXIT=0** |
| Suites del tramo | 40 + 10 + 26 + 13 = **89 comprobaciones** |
