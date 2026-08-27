# QUALITY-12.2B · Qué se comprueba, dónde y con qué

## Las dos suites nuevas

| Suite | Cómo se ejecuta | Resultado |
|---|---|---|
| `test:quality122b` | estática, sin base | **28 ✔ · 0 ✘** |
| `test:quality122b-rls` | base real, sesiones reales | **29 ✔ · 0 ✘** |

`test:quality122b` está registrada en `test:all`.

---

## Los diecisiete puntos del encargo

| | Qué | Dónde |
|---|---|---|
| **A** | crear perfil | `C1` real |
| **B** | leer perfil | `B2`, `C2`, `C6` real |
| **C** | actualizar perfil | `C1`, `C4` real |
| **D** | cruce entre empresas | `D1`, `D2`, `D3` real |
| **E** | empresa antigua sin perfil | `B1`, `B2` real · `F6` estática |
| **F** | contexto compacto | `B1` estática · `C2` real |
| **G** | presupuesto de tokens | `B2`, `B3` estáticas · `C3` real |
| **H** | resolución por papel de sección | `E1` real |
| **I** | cobertura de guía en Quality | `D1` estática · `E1` real |
| **J** | regresión PCR | `F1`, `F2` real · `t9g-parity` |
| **K** | regresión Textiles | `F1` real · `textiles-trazadocs` |
| **L** | protección en Demo | `E4` real |
| **M** | Full | `E0`, `E1` real |
| **N** | Extra | `E5` real |
| **O** | clasificación normativa | `D3` estática · `E2` real |
| **P** | validación del contexto relacionado | `E1` estática · `F3` real |
| **Q** | ninguna llamada al proveedor | `F4` estática |

---

## `test:quality122b` · leyendo el código

**A · El perfil.** Cuatro columnas en `organizations`, no una tabla 1:1. El
sector atado a un catálogo con «Otro». Los topes en la base, no solo en el
formulario. Los topes del código coinciden con los de la base — si alguien
cambia uno y olvida el otro, la prueba falla. La validación rechaza lo que la
base rechazaría. El payload nunca lleva el identificador de empresa.

**B · El contexto compacto.** Solo lo que sirve: la prueba mira la función SQL
y comprueba que no toca `logo`, `tax_id`, `created_at`, `updated_at`,
`created_by`, `legal_name`, `address` ni `phone`. Un perfil típico ocupa **106
tokens**; el **máximo posible** —los cinco campos a tope a la vez— ocupa
**256** con un tope de 260. Un perfil vacío devuelve exactamente
`Empresa: <nombre>`. Y no se trunca: ni el renderizado ni el payload contienen
un `slice`.

**C · El perfil no es evidencia.** La base lo dice donde no se puede ignorar, y
nada en este sprint infiere el perfil.

**D · La guía de Quality.** Cinco papeles, exactamente los de
`DEFAULT_SECTIONS` — la prueba lee ese `const` del código de producto y
compara. Ninguna estructura falsa. Ninguna cita normativa. Cada guía declara su
barrera.

**E · El contexto relacionado.** Taxonomía cerrada de doce valores, sin
sinónimos. El enriquecimiento se ata al papel de la sección y no pisa barreras
ya escritas. Enriquecer publica revisión: cierra antes de insertar y enlaza
después.

**F · Seguridad y alcance.** El contexto exige pertenencia. Editar exige rol y
empresa activa. El catálogo es de solo lectura. La 0137 es la última y no edita
ninguna anterior. Las columnas nuevas **no** son obligatorias y **no** se
rellenó el perfil de ninguna empresa existente.

Y una prueba que este sprint necesitaba: **ni una mención a OpenAI, Anthropic,
`QUALITY_AI`, `quick_edit` ni `contextual_review`** en nada de lo que se tocó.

---

## `test:quality122b-rls` · contra una base

**A · El catálogo.** Existe, lo lee cualquier miembro, ninguna empresa puede
escribir en él, el anónimo no lo alcanza.

**B · La empresa sin perfil.** Una empresa recién creada nace con los cuatro
campos en null —no con un perfil inventado— y su contexto compacto es válido y
parcial: solo el nombre.

**C · Editar.** Quien administra completa; el contexto devuelve lo completado y
**ni un campo que no sirva para redactar**. El perfil real medido ocupa **90
tokens**. La base rechaza los siete casos límite: actividad de 161, descripción
de 281, descripción de 5, siete productos, un producto de 51, un producto
vacío y un sector inventado. Un consultor **no** puede editar y **sí** puede
leer.

**D · Aislamiento.** Una empresa ajena no resuelve el contexto, no lo lee por
la tabla y no lo alcanza por identificador. El anónimo tampoco. Una empresa
inexistente no filtra su ausencia.

**E · La guía de Quality.** Los cinco papeles con guía, propósito, barrera,
clase `safe` y contexto relacionado. Ninguna cita normativa. Una sección a
medida no recibe nada. En Demo se sabe que hay guía y no llega ni una palabra;
en Extra llega completa. Declarar otro módulo no abre ninguna puerta. Una
empresa ajena no resuelve. Cinco peticiones malformadas —incluidas dos con SQL
dentro— no convierten el resolver en un catálogo enumerable. Y las tablas de
guía **siguen sin ser legibles** por un miembro.

**F · Paridad.** Las 250 guías de estructura siguen en pie y ninguna se quedó
sin texto tras el enriquecimiento. El contexto relacionado solo admite valores
de la taxonomía —y la base rechaza uno inventado, no solo lo respeta por
costumbre—. Las revisiones siguen siendo inmutables.

---

## El enriquecimiento, en números

| `section_key` | Guías enriquecidas |
|---|---|
| `objetivo` | 22 |
| `alcance` | 20 |
| `responsables` | 8 |
| `evidencias` | 6 |
| `registros_asociados` | 5 |
| `registros` | 3 |
| `evidencias_requeridas` | 2 |
| `definiciones` | 2 |

**68 guías** recibieron barrera y contexto relacionado, todas por papeles con
una trampa clara y una única lectura. Las demás se quedaron como estaban:
repetir el mismo párrafo en 250 filas no protege de nada y enseña a ignorarlo.

Cada enriquecimiento es una **revisión nueva**. La anterior queda cerrada y
consultable, como manda 12.2A.

---

## Regresión

`npm run test:all` → **EXIT 0**, dos veces: antes y después de reconstruir la
base desde cero (0001…0137).

Suites verificadas explícitamente: TrazaDocs, TrazaDocs Textiles, hints T9G,
acceso Demo a hints, endurecimiento de secciones, lista maestra, QUALITY-12,
QUALITY-12.1, QUALITY-12.2A, PCR, Textiles, auth, selector de módulos y
exportaciones.

Las suites de base real repetidas tras la réplica: `quality122b-rls` 29,
`quality122a-rls` 24, `quality12-rls` 31, `quality12-safety` 25,
`quality121-rls` 31.

### Un ajuste en la suite de 12.2A

`A2` afirmaba que el número de guías en revisión 2 tenía que ser exactamente el
de textos corregidos. Era cierto cuando 12.2A era lo último, y dejó de serlo en
cuanto 12.2B publicó revisiones **para añadir barreras sin tocar el texto**.

Se cambió por el invariante que de verdad importa: **todo texto distinto del
original tiene que venir de una revisión posterior a la primera**. Al revés no
se cumple, y es correcto — una revisión nueva significa «algo cambió», no «el
texto cambió».

---

## Sobre el despliegue

**No se creó Preview.** El encargo lo dejaba a criterio y aportaba
condicionado a que hubiera algo que validar a ojo.

Lo que cambia en pantalla son tres cosas, y las tres están cubiertas por
pruebas que comprueban el comportamiento, no la apariencia: dos campos
opcionales más en el alta, una sección nueva en Datos de empresa, y el botón
«i» apareciendo en las secciones de Quality con **el mismo componente
compartido** que ya usan CPR y Textiles.

Ninguna de las tres introduce un flujo nuevo que una persona pueda romper de
una forma que las pruebas no vean. Y la que más se acerca —el botón «i» de
Quality— tiene paridad exacta con el que lleva meses en producción en los otros
dos módulos.

Cuando 12.2C ponga delante del usuario un botón que llama a un modelo y
propone reemplazar su texto, ahí sí hará falta un Preview y una persona
mirándolo.
