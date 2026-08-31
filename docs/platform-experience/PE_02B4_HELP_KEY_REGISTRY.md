# PE-02B4 · El vocabulario de pantallas

`lib/modules/page-keys.ts`

---

## 1 · Por qué existe

PE-02A encontró tres vocabularios estables en el repositorio —módulos, secciones
de TrazaDocs, entidades de Intelligence— y **ninguno de pantallas**. La ayuda
contextual necesita uno: hay que poder decir «la ayuda de este campo, en esta
pantalla» sin depender de nada que cambie.

---

## 2 · Por qué no la URL

Porque la URL cambia y la pantalla sigue siendo la misma. **PE-01B movió una
superficie entera sin cambiar ninguna promesa**; una ayuda atada a la ruta habría
desaparecido ese día sin que nadie tocara su contenido. Y al revés: dos rutas
pueden llevar a la misma pantalla.

La ruta se declara en el registro, pero como **dato informativo** —para que quien
administra sepa de qué pantalla habla— y la base **no la guarda**. Hay dos
pruebas: una comprueba que la identidad de la tabla no tiene columna de ruta, y
otra que las claves no son la ruta escrita con puntos.

---

## 3 · La forma

```
modulo.zona.pantalla     quality.context.interested_parties
modulo.pantalla          quality.processes
platform.pantalla        platform.modules
```

Minúsculas, puntos, sin acentos. **El primer segmento es siempre una clave del
catálogo comercial o `platform`**, para que no nazca un cuarto vocabulario de
módulos por la puerta de atrás. La base repite esa restricción: una fila mal
formada no debería existir aunque la escriba alguien saltándose la consola.

---

## 4 · Las claves de hoy

| Clave | Pantalla | Ruta hoy |
|---|---|---|
| `quality.context.interested_parties` | Partes interesadas | `/quality/context/interested-parties` |
| `quality.processes` | Procesos | `/quality/processes` |
| `quality.processes.detail` | Ficha de proceso | `/quality/processes/[id]` |
| `quality.risks` | Riesgos | `/quality/risks` |
| `quality.indicators` | Indicadores y objetivos | `/quality/indicators` |
| `quality.documents` | Documentos | `/quality/documents` |
| `quality.cases` | Casos y acciones | `/quality/cases` |
| `cpr.recycled_content` | Contenido reciclado | `/recycled-content` |
| `cpr.traceability.inventory` | Inventario | `/traceability/inventory` |
| `textiles.passports` | Pasaportes | `/textiles/passports` |
| `platform.modules` | Puerta de módulos | `/modules` |

**Once, no cuarenta.** El registro empieza por lo que la ayuda necesita hoy y
crece cuando alguien lo necesite: una clave sin contenido no sirve a nadie, y un
registro lleno de pantallas vacías haría más difícil encontrar las que sí.

---

## 5 · Una sola familia, también para PE-03

PEH-08 de PE-02A y §5 de este encargo piden lo mismo con distintas palabras: que
los tutoriales de PE-03 usen **estas** claves y no inventen `tutorial_page_key`.

Por eso el registro vive en `lib/modules/`, junto al catálogo de módulos y al
registro del shell, y **no dentro de la ayuda**: no es «las claves de la ayuda»,
es «cómo se llaman las pantallas de Trazaloop».

Hay tres pruebas que lo protegen: que no exista un segundo registro en `lib/` ni
en `components/`, que el registro no dependa de las tablas de la ayuda, y que
declare explícitamente que PE-03 lo reutilizará.

---

## 6 · Cómo se añade una pantalla

1. Añadir la entrada a `PAGE_KEYS` con su clave, su nombre y su ruta de hoy.
2. Crear la ayuda desde `/platform/help`, eligiendo esa pantalla del desplegable.
3. En la pantalla, cargar `getPageHelp(clave)` **una vez** y repartir el mapa.

La consola **rechaza** una clave que no esté en el registro, con un mensaje que
dice dónde añadirla. Es a propósito: una ayuda apuntando a una pantalla que nadie
declaró es una ayuda que nadie va a encontrar.

---

## 7 · Cómo se direcciona un elemento

```
(page_key, target_kind, target_key)

page     · la pantalla entera. target_key vale siempre 'page'
section  · un bloque
field    · un campo
concept  · una idea que aparece en varios sitios de la misma pantalla
```

No hay un quinto para «toda la aplicación»: una ayuda que vale en todas partes no
es ayuda contextual, es una pregunta frecuente, y esa ya tiene sitio.

La ayuda de una pantalla entera se llama **siempre** `page` —lo exige una
restricción de la base—: si cada quien inventara su nombre, habría tres «la ayuda
de esta pantalla».
