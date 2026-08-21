# QUALITY-01.2 · Informe de implementación

**Rama:** `fix/quality-01-2-process-relations-docs-map` · **Migraciones:** `0114`, `0115`
**Fecha:** 21 de agosto de 2026

---

# VEREDICTO

## `QUALITY-01.2 READY FOR FINAL USER ACCEPTANCE`

Los cinco hallazgos están corregidos en su origen, y los cuatro que aparecieron
al perseguirlos también. El recorrido humano completo —selector, Quality,
procesos, relaciones en sus dos sentidos, documentos en entradas y salidas,
mapa con flechas, publicación, documentos de Quality, equipo, invitación y
aceptación— pasa de extremo a extremo **contra Staging**, navegando por los
enlaces reales de cada pantalla y sin escribir una sola URL a mano.

Se declara *READY FOR FINAL USER ACCEPTANCE* y no *READY WITH GAPS* porque no
queda ninguna parte del encargo sin entregar. Lo que sí queda son limitaciones
conocidas del entorno y trabajo explícitamente aplazado, en la sección W.

---

## Una observación antes del detalle

Los cinco hallazgos parecían cinco problemas distintos. No lo eran.

**Tres de los cinco son la misma cosa:** una pieza transversal que solo conocía
los módulos que existían cuando se escribió. Es el mismo patrón que QUALITY-01.1
encontró cuatro veces y del que dejó dicho, textualmente, que no había hecho una
auditoría exhaustiva.

| Hallazgo | Pieza | Solo conocía |
|---|---|---|
| 1 · Terminar en PCR tras aceptar | El destino tras aceptar una invitación | PCR |
| 5 · «Crear documento» falla | *(este no: ver J–L)* | — |
| — · Enlace roto al documento asociado | La ruta de un documento de TrazaDocs | PCR |
| — · Atajos de PCR en «Equipo» | La cabecera de una pantalla transversal | PCR |

Las correcciones no añaden «quality» a esas listas: **eliminan las listas**. Y
esta vez la auditoría sí se hizo entera (M), con invariantes que impiden que el
patrón vuelva.

Los otros dos hallazgos —relaciones y mapa— no son defectos: son modelo que
faltaba. El dato estaba completo desde QUALITY-01; lo que no existía era la
forma de leerlo desde ambos extremos y de dibujarlo.

---

# A · Invitaciones y destino final

**Antes:** aceptar una invitación redirigía siempre a `/dashboard`.

**Ahora:** el destino por defecto es el **selector de módulos**, `/modules`.
Desde ahí se entra únicamente a los módulos que la empresa tenga.

La regla vive en una función pura, `resolveAcceptInviteDestination`, y es corta
a propósito:

```
· ¿Hay un return_to que sea exactamente la ruta de inicio de un módulo
  en el que esta empresa puede entrar HOY?  → ese módulo.
· En cualquier otro caso                    → el selector.
```

Los módulos entrables los calcula el **servidor** con el estado comercial real
(`getActiveOrgModuleStatuses` + `isEnterableState`), nunca el cliente. El
parámetro no concede nada: es una pista sobre desde dónde se invitó.

## Por qué no hay open redirect

La lista blanca es de **rutas de inicio completas**, no de prefijos. Una URL
absoluta, un `//host`, un `..`, `javascript:` o cualquier ruta interna
arbitraria sencillamente no coinciden con ninguna entrada y caen al selector.
Comprobado con **once formas hostiles**, una por una (A5 de la matriz).

Y aunque el parámetro pasara, el guard de cada namespace vuelve a comprobar el
acceso al llegar: sería un enlace a una pantalla que rechaza igual.

**No se hardcodea Quality como nuevo fallback.** El fallback no es ningún
módulo.

---

# B · Origen del sesgo hacia PCR

Cuatro sitios, no uno.

| # | Dónde | Qué hacía |
|---|---|---|
| 1 | `acceptTeamInvitationAction` | `redirect("/dashboard")` |
| 2 | `selectActiveOrganizationAction` | `redirect("/dashboard")` |
| 3 | Ficha del proceso | Los documentos enlazaban a `/trazadocs/<id>` |
| 4 | Cabecera de «Equipo» | Cuatro botones a rutas de PCR |

Los cuatro comparten la misma historia: se escribieron cuando PCR era el único
módulo, y entonces eran correctos. «El dashboard» y «el módulo» eran sinónimos.

**El 2 no estaba en el encargo.** Apareció al perseguir el 1, y es el mismo
error: elegir empresa también es transversal. Una empresa sin PCR aterrizaba en
un módulo al que no podía entrar y el guard la devolvía al selector — un rebote
en vez de una navegación. Se corrigió por coherencia: dejar uno de los dos
habría sido la grieta por la que el sesgo vuelve.

**Sobre Textiles:** la sospecha del encargo era correcta, y por la misma razón.
El destino no dependía del módulo de origen en absoluto — era fijo. Por eso
invitar desde Textiles daba idéntico resultado que invitar desde PCR.

---

# C · Modelo definitivo de relaciones

**No se creó ninguna tabla.** `quality_process_interactions` (0112) ya guardaba
la relación completa en **una sola fila**:

```
source_process_id · source_output_id · target_process_id · target_input_id
```

Lo que faltaba no era el modelo: era leerlo entero y ofrecer los dos puntos de
vista. Hasta ahora la pantalla solo leía los procesos y el texto del ítem, así
que podía decir «Compras → Producción» pero no qué salida alimentaba qué
entrada.

0114 hace tres cosas sobre ese modelo:

| Cambio | Por qué |
|---|---|
| **Unicidad por relación completa** | La de 0112 —(origen, destino, ítem)— impedía registrar dos flujos reales distintos entre el mismo par. «Materia prima aprobada → Materia prima» y «Devoluciones → Producto no conforme» son relaciones legítimas y diferentes. La nueva sigue impidiendo el duplicado **exacto**, que es lo que el encargo pide |
| **Guarda de procesos retirados** | No se registran relaciones **nuevas** con un proceso retirado. Las que ya existían **se conservan**: retirar no reescribe la historia de los mapas publicados |
| **Reenganche al publicar** | Ver I |

## Autorrelación: se mantiene prohibida

Es una decisión del modelo, no una limitación de la interfaz, y por eso vive en
la restricción `CHECK` de 0112, que no se tocó.

**El razonamiento:** un proceso que se entrega a sí mismo no aporta información
al mapa —el flujo interno se describe en el Desarrollo de su revisión— y en
cambio produce una arista que ninguna disposición sabe dibujar sin ensuciar.
El caso empresarial que suele invocarse, «Producción devuelve a Producción», en
un sistema de gestión real se modela como dos procesos o como un reproceso
dentro del mismo, no como un bucle en el mapa.

Si el modelo aprobado cambia de opinión, la restricción se levanta con una
migración de una línea. Pero se decidió **desde el modelo**, no desde la
interfaz, que es lo que el encargo pedía.

## Invariantes, en la base

| Impedido | Cómo |
|---|---|
| Origen y destino de distintas empresas | FK compuesta `(organization_id, id)` — 0112 |
| Salida que no es del proceso origen | Trigger `quality_interaction_io_must_match` — 0112 |
| Entrada que no es del proceso destino | Ídem |
| Usar una entrada como salida | Ídem (comprueba `direction`) |
| Duplicado exacto | Índice único `..._flow_uniq` — 0114 |
| Autorrelación | `CHECK ..._not_self` — 0112 |
| Relación nueva con proceso retirado | Trigger `..._not_retired` — 0114 |

Las siete comprobadas contra base real (B5–B11 de la matriz). La capa de
aplicación solo las traduce a mensajes legibles.

---

# D · «Recibe de»

Dentro de la ficha, sección **Relaciones con otros procesos**, columna
izquierda. Cada relación entrante muestra:

```
RECIBE DE
Compras
Salida origen: Materia prima aprobada
Entrada en este proceso: Materia prima
```

El nombre del proceso es un enlace: desde ahí se salta a su ficha y se ve la
misma relación desde el otro lado.

**Crear desde este extremo:** «Añadir proceso del que recibe» pide, en este
orden, el proceso origen → su salida → la entrada de este proceso → una
descripción opcional. Las salidas del otro proceso se cargan de su revisión
vigente en cuanto se elige, sin recargar la página.

---

# E · «Entrega a»

Columna derecha, misma sección:

```
ENTREGA A
Despachos
Salida de este proceso: Producto terminado
Entrada destino: Producto para despacho
```

**Crear desde este extremo:** «Añadir proceso al que entrega» pide la salida de
este proceso → el proceso destino → su entrada → descripción opcional.

## Una sola relación, dos formularios

Los dos formularios son **el mismo componente**. Cambia el orden de las
preguntas y quién ocupa el papel de origen; la fila que se escribe es idéntica.
Tenerlo duplicado habría sido la primera grieta por la que «entrega a» y «recibe
de» acabarían comportándose distinto.

Comprobado en tres niveles: que la interfaz solo tiene dos llamadas y ambas
envían los cuatro campos (B4 puro), que crear desde cada extremo produce la
misma estructura (B1–B2 base real), y que **existe una sola fila** entre ambos
procesos (B3 base real y paso 8 del recorrido HTTP).

---

# F · Documentos en entradas

Dentro de cada entrada, en la sección «Entradas y salidas»:

```
Materia prima · Material
  DOCUMENTOS ASOCIADOS
  Especificación de materia prima · Rige el proceso     Desvincular
  Vincular documento
```

El documento se abre **en su módulo de origen** (M-1 de la auditoría), muestra
título, código, tipo de relación y —si viene de otro módulo— su procedencia.
Desvincular quita la relación y **no toca el documento**.

Casos de uso previstos: especificación, requisito, ficha técnica, contrato,
orden, procedimiento aplicable. La implementación no los limita: el tipo de
relación es el catálogo transversal (`governs`, `supports`, `records`,
`reference`) y el documento, cualquiera de la empresa.

---

# G · Documentos en salidas

Idéntico, en la columna de salidas:

```
Producto terminado · Material
  DOCUMENTOS ASOCIADOS
  Registro de producto terminado · Registro del proceso  Desvincular
  Vincular documento
```

## La decisión de arquitectura: EVOLUCIONAR, no crear

El encargo pedía buscar primero si QUALITY-01 ya había creado una relación
reutilizable. **La había:** `quality_process_documents` (0112) es exactamente
«algo de un proceso ↔ documento de TrazaDocs».

**No se crearon `quality_input_documents` ni `quality_output_documents`.** Se
añadió una columna `io_id` opcional:

```
io_id NULL      → el documento aplica al proceso entero  (0112, intacto)
io_id NOT NULL  → aplica a esa entrada o salida concreta (0114)
```

**Por qué así, y no con dos tablas.** La pregunta que hay que poder responder es
«¿qué documentos toca este proceso?» — la hace quien mantiene TrazaDocs antes de
marcar un documento obsoleto. Con una tabla es una consulta; con tres son tres
consultas y una unión que alguien olvidará actualizar. Y no hay JSON opaco por
ninguna parte: la relación es una fila con clave foránea.

**Lo que hubo que cambiar:** la unicidad de 0112 era `(proceso, documento,
relación)`, que impedía asociar el mismo documento a dos entradas distintas del
mismo proceso — un caso normal (una ficha técnica que define dos entradas). La
nueva incluye el ámbito, con `NULLS NOT DISTINCT` para que dos relaciones «a
nivel de proceso» sigan chocando entre sí, como en 0112.

## Seguridad

| Garantía | Cómo |
|---|---|
| Nunca un documento de otra empresa | FK compuesta contra `trazadoc_documents` — 0112 |
| La entrada/salida es de **ese** proceso | Trigger `..._io_must_match` — 0114 |
| No se infiere la existencia de documentos ajenos | La RLS de 0043 filtra por empresa antes de que nada llegue |
| Desvincular no borra | Solo se borra la fila de relación |

Comprobado C1–C10 contra base real, incluidos los dos casos cross-tenant.

---

# H · El mapa y sus aristas

**Antes:** bloques por categoría. Decía qué procesos hay y de qué tipo, pero no
quién alimenta a quién.

**Ahora:** las mismas bandas —Estratégicos, Misionales, Apoyo, Sistema— **más**
el flujo real:

```
                    ESTRATÉGICOS
              ┌─────────────────────┐
              │ Planificación estr. │
              └──────────┬──────────┘
      MISIONALES         │ Objetivos de calidad → Materia prima
   Materia prima aprobada → Materia prima
  ┌──────────┐   ┌───────▼──────┐   ┌────────────┐
  │ Compras  │──▶│  Producción  │──▶│ Despachos  │
  └──────────┘   └───────┬──────┘   └────────────┘
      SISTEMA            │ Producto terminado → Resultados de procesos
              ┌──────────▼──────────┐
              │  Gestión del SGC    │
              └─────────────────────┘
```

**Fuente de verdad: las relaciones ya registradas.** El mapa no ofrece dibujar
una conexión a mano, ni tiene con qué. Capture once, reuse many times.

## Por qué la disposición se calcula y no se deja al navegador

Las flechas necesitan coordenadas. Con los bloques colocados por CSS habría que
medirlos después de pintarlos, redibujar al cambiar el tamaño y aceptar que la
primera pintada sale sin flechas. Con la posición calculada, el SVG se
renderiza correcto desde el servidor, escala solo, y —lo que más importa— **la
disposición se prueba sin navegador**: doce comprobaciones puras (D1–D12).

## Tres problemas de legibilidad, encontrados mirando

El encargo pedía corregir el mapa si técnicamente funcionaba pero resultaba
inusable. Al abrirlo en un navegador real aparecieron tres cosas:

| Problema | Corrección |
|---|---|
| Los bloques salían en **orden alfabético**, así que Despachos quedaba entre Compras y Producción y la flecha entre ambos le cruzaba por encima | Ordenación **por flujo** (niveles de Kahn): quien alimenta va antes que quien recibe. Un ciclo conserva el orden de entrada, que ya es determinista |
| Las etiquetas se pintaban **antes** que los bloques, que las tapaban | Se pintan al final, encima de todo |
| Una etiqueta horizontal no cabe en el hueco entre dos bloques contiguos: se salía por ambos lados | El texto de una flecha horizontal va **encima de la fila**, donde tiene todo el ancho de la banda |

Las tres tienen su comprobación (D9, D12, D11) para que no vuelvan.

## Cuando hay muchas relaciones

- Hasta seis relaciones: todas las etiquetas visibles.
- Más: solo al señalar o seleccionar un proceso.
- **Seleccionar** resalta lo que recibe (ámbar) y lo que entrega (verde), atenúa
  el resto y abre un detalle lateral con los nombres exactos.
- Varias relaciones entre el mismo par se abren en abanico, con las etiquetas
  apiladas: no se superponen.
- **Debajo del dibujo va siempre la lista en texto.** Un diagrama puede quedar
  apretado en una pantalla estrecha; la lista no falla nunca, se lee con un
  lector de pantalla y dice la dirección con palabras.

Una relación cuyo otro extremo no está en el mapa **no se dibuja pero se
cuenta**: «Hay 1 relación más cuyo otro extremo no está colocado en este mapa».
Desaparecer en silencio habría sido peor.

---

# I · Snapshot y versionado de relaciones

**El modelo de QUALITY-01 era incorrecto para el histórico**, exactamente como
el encargo sospechaba: una versión publicada del mapa congelaba sus **nodos**
pero las conexiones se leían siempre de `quality_process_interactions`, que es
dato vivo. Bastaba con que alguien borrara mañana una interacción para que la
versión publicada de ayer dijera otra cosa.

**0114 crea `quality_process_map_edges`**, y `quality_publish_map_version` la
escribe al publicar, dentro de la misma transacción y **antes** de marcar la
versión como publicada: si algo fallara, no queda una versión publicada sin
conexiones.

## Tres decisiones que hacen que esto funcione

**1 · Se guardan los NOMBRES, no solo los identificadores.** Si mañana se abre
una revisión del proceso y se renombra su salida, la versión publicada sigue
diciendo lo que decía el día que se publicó. Guardar solo referencias habría
dejado el histórico a merced de un cambio de nombre.

**2 · La tabla no tiene política de INSERT, UPDATE ni DELETE.** Ninguna sesión
de cliente puede escribirla ni alterarla, pase lo que pase con la capa de
aplicación. Lo escribe únicamente la RPC, que corre como propietaria.

**3 · Un borrador NO usa esta tabla:** muestra las relaciones vivas, que es lo
que se espera de un borrador.

Y la referencia a la interacción de origen es solo trazabilidad: si esa relación
se borra, la arista **conserva todo** y solo pierde el puntero.

> Un defecto que las pruebas encontraron aquí: la clave foránea con
> `ON DELETE SET NULL` compuesta anulaba también `organization_id`, que es NOT
> NULL, así que borrar una relación fallaba con un error incomprensible. Se
> corrigió a `SET NULL (interaction_id)` — sobre la columna, no sobre la clave
> entera.

**Responde a la pregunta del encargo:**

```sql
select e.* from quality_process_map_edges e
  join quality_process_map_versions v on v.id = e.map_version_id
 where v.status in ('published','superseded')
   and v.effective_from <= :fecha
   and (v.effective_to is null or v.effective_to > :fecha);
```

Comprobado D1–D5 contra base real: publicar congela; borrar una relación
después no altera la versión publicada; una versión nueva refleja el estado
actual sin tocar la anterior; y nadie puede escribir el snapshot a mano.

**No se modificaron 0112 ni 0113.**

---

# J · El error de «Crear documento»

Reproducido en un **navegador real**, con una empresa QUALITY-ONLY, navegando
por los enlaces: selector → Quality → Documentos → **Crear documento** →

> **This page couldn't load**
> Reload to try again, or go back.

La consola del navegador dio la respuesta en una línea:

```
TypeError: x.map is not a function
  at N (…/quality/documents/page-e2c35ab2238a0323.js)
```

**No se dio por resuelto porque una server action pasara.** El servidor
respondía 200 correctamente: el fallo ocurría en el cliente, al desplegar el
formulario.

---

# K · Causa raíz

`QUALITY_DOCUMENT_CATEGORIES` se exportaba desde
`server/actions/quality-documents.ts`, que empieza con `"use server"`.

**Un módulo de servidor no exporta valores al cliente: exporta referencias a
funciones remotas.** Cuando el componente de cliente importaba de ahí una
constante, lo que recibía en el navegador no era el array — era un objeto
opaco. El formulario hacía `.map(...)` y reventaba en pleno render, que React
convierte en esa pantalla.

**Y detrás había un segundo defecto**, latente porque el primero lo tapaba: el
componente llamaba a `router.push()` **durante el render**. Actualizar el Router
mientras React pinta es, en React 19, un error y no un aviso. Habría aparecido
en cuanto se corrigiera el primero.

Ninguno de los dos es de Quality. Son dos formas de la misma clase de error, y
por eso las correcciones vienen con **invariantes que barren todo el código
ejecutable**, no solo este archivo:

| Invariante | Qué impide | Hallazgos hoy |
|---|---|---|
| **E3** | Que un módulo `"use server"` exporte cualquier valor | 0 |
| **E4** | Que se navegue durante el render | 0 |

E4 no usa una heurística de proximidad —da falsos positivos— sino un conteo de
profundidad de funciones. Y **la prueba se comprueba a sí misma**: antes de
barrer el repositorio verifica que marca el código exacto que fallaba y que no
marca el corregido. Un invariante que no puede fallar no protege de nada.

## El resto de la cadena, revisada

El encargo pedía revisar toda la cadena de UI. Se hizo, y el resultado es que
**el resto estaba bien**: la ruta, el layout, el guard, el catálogo, el resolver
del shell, los loaders y las server actions aceptan `module_key = 'quality'`
correctamente desde QUALITY-01.1. Lo único roto era el paquete de cliente.

Verificado por el paso 14 del recorrido HTTP, que **descarga el JavaScript que
el navegador recibe** para esa pantalla y comprueba que las categorías van
dentro. Una prueba de servidor no lo habría detectado.

---

# L · Solución documental

`QUALITY_DOCUMENT_CATEGORIES` pasa a `lib/domain/quality-documents.ts` —lógica
pura, sin BD y sin sesión—, que es donde pertenece una constante compartida
entre cliente y servidor. La navegación posterior a crear pasa a un efecto.

**La arquitectura documental confirmada no cambia:** Quality tiene experiencia
propia (`/quality/documents`) sobre el motor transversal de TrazaDocs. Sin
tablas nuevas, sin segundo motor.

Verificado en navegador real con una empresa **PCR sin acceso, Textiles sin
acceso, Quality Full**: entrar → Documentos → Crear → editor → escribir →
**«Contenido guardado.»** → consultar. El flujo completo.

Y una mejora que salió de la auditoría: los documentos vinculados ahora se
abren **en su módulo** —«Abrir documento →»— en lugar de enlazar siempre a la
ruta de PCR.

---

# M · Auditoría de hardcodes

**23 apariciones en 21 archivos**, clasificadas una por una. Detalle completo en
`QUALITY_01_2_MODULE_HARDCODE_AUDIT.md`.

| Clase | Nº | Qué se hizo |
|---|---|---|
| **A · Legítima, específica de dominio** | 16 | Nada. El módulo es el sujeto, no una entrada de lista |
| **B · Transversal escrita a mano** | 6 | Corregida |
| **C · Incierta** | 3 | Documentada, con qué mirar cuando llegue el momento |

Las seis corregidas: la ruta de un documento; dos mapas de etiquetas duplicados;
los módulos de TrazaDocs enumerados dos veces; cuatro rutas de PCR en «Equipo»;
y los dos destinos fijos a `/dashboard`.

**No se añadió «quality» a ninguna lista.** Donde había una lista, se derivó del
catálogo o del registro.

Ejemplo de lo que **no** se tocó, por si ayuda a calibrar el criterio:
`lib/db/trazadocs-master.ts` filtra por `module_key = 'cpr'`. Eso no es una
lista olvidada — el maestro documental **es de PCR**, y ese literal es el sujeto
de la consulta. Cambiarlo rompería PCR sin arreglar nada.

---

# N · Migraciones

Dos, append-only tras 0113. **No se modificó ninguna de 0001 a 0113.**

## 0114 · Relaciones, documentos de E/S y aristas del mapa

| § | Contenido |
|---|---|
| 1 | `io_id` en `quality_process_documents` + FK compuesta + trigger + unicidad por ámbito |
| 2 | Unicidad de las relaciones por flujo completo; guarda de procesos retirados |
| 3 | `quality_process_map_edges`: el snapshot, solo lectura |
| 4 | `quality_publish_map_version` congela las relaciones al publicar |
| 5 | `quality_open_process_revision` arrastra los documentos de cada E/S |
| 6 | `quality_publish_process_revision` reengancha las relaciones a las E/S vigentes |
| 7 | Privilegios explícitos |

**§5 y §6 no estaban en el encargo.** Aparecieron al perseguir el modelo: sin
§5 los documentos de una entrada se perderían en cada revisión; sin §6 una
relación seguiría apuntando a la revisión antigua después de publicar. El
reenganche empareja por dirección y nombre, y si la entrada desapareció o cambió
de nombre **deja la relación como está** — perder el dato sería peor que
conservar una referencia histórica.

## 0115 · El snapshot, de solo lectura también en remoto

Salió de validar contra Staging. Su historia completa está en la sección R.

Sin `GRANT ALL`. Sin `ALTER DEFAULT PRIVILEGES`. Sin relajar ninguna clave
foránea.

---

# O · RLS

Ninguna política se debilitó.

| Cambio | Efecto |
|---|---|
| `quality_process_map_edges` | Nueva, con RLS y **una sola política: SELECT** para miembros de la empresa. Sin INSERT, UPDATE ni DELETE, a propósito |
| `quality_process_documents` | Políticas **sin tocar**. La columna nueva hereda las de 0112 |
| `quality_process_interactions` | Políticas **sin tocar**. Lo nuevo son un índice y un trigger, ambos más restrictivos |

Comprobado tras 0114 y 0115, en local **y en Staging**:

| | Local | Staging |
|---|---|---|
| `anon` sobre el snapshot | 0 privilegios | 0 |
| `authenticated` sobre el snapshot | solo `SELECT` | solo `SELECT` |
| Políticas de escritura | ninguna | ninguna |
| RLS activa en toda tabla `quality_*` | sí | sí |

Aislamiento entre empresas verificado en relaciones, documentos de entradas y
salidas, y snapshots del mapa (B12, C10, D6).

---

# P · Pruebas

**93 comprobaciones propias de QUALITY-01.2.** Detalle en
`QUALITY_01_2_TEST_MATRIX.md`.

| Suite | Comando | Nº |
|---|---|---|
| Puras y estáticas | `test:quality012` | 44 |
| Base real | `test:quality012-rls` | 33 |
| Recorrido humano por HTTP | `test:quality012-ui` | 16 |

Las tres corren en local **y contra Staging**, con los mismos resultados.

Tres comprobaciones (S1–S3) necesitan SQL directo y se **omiten anunciándolo**
si no hay `SUPABASE_DB_URL`, en vez de dar un falso verde.

---

# Q · Local

`db reset` + migraciones: **107 migraciones**, `0115` incluida, sin error.

> `supabase db reset` se detiene en 0105 —esa migración toma un `LOCK TABLE` y
> el runner del CLI 2.115.0 ejecuta algunas sentencias fuera de un bloque
> transaccional—. **No es un problema de este sprint:** el propio encabezado de
> 0105 documenta la vía soportada en local (`psql --single-transaction`), y
> contra Staging `db push` no tiene ningún problema. El procedimiento está en el
> documento de validación.

`typecheck` limpio · `lint` **0 errores** (1 aviso preexistente, ajeno) ·
`build` compila · `test:all` **exit 0**, verificado leyendo el código de salida
(ver más abajo).

Suites con base real en local: `test:rls` 110/110 · `test:quality01` 41/41 ·
`test:quality011` 24/24 · `test:quality012` 44/44 · `test:quality01-rls` 56/56 ·
`test:quality011-rls` 41/41 · `test:quality012-rls` 33/33 ·
`test:quality01-ui` 15/15 · `test:quality011-ui` 16/16 ·
`test:quality012-ui` 16/16.

---

# R · Staging

**Destino:** `qchzkxbnbqeyuxinipln`, verificado antes de escribir. El
repositorio sigue desvinculado: toda operación remota exige `--project-ref`
explícito.

```
db push --dry-run  →  solo 0114
db push            →  exit 0
db push            →  0115 · exit 0
```

105 → **107** migraciones. Sin `migration repair`.

## El defecto que solo se vio en Staging

Es la razón por la que validar contra un proyecto real no es un trámite.

0114 concedía `SELECT` sobre el snapshot y revocaba `Dxtm` (truncate,
references, trigger, maintain), que es lo que el entorno **local** concede por
defecto sobre cada tabla nueva. En un proyecto **remoto** de Supabase el
defecto es `arwdDxtm` — es decir, también `INSERT`, `UPDATE` y `DELETE`.
Conceder `SELECT` no quita lo que ya venía dado.

La RLS seguía impidiendo escribir, así que **el comportamiento observable era
correcto y todas las pruebas pasaban en los dos entornos**. Pero la defensa en
profundidad se apoyaba en una capa en vez de dos, y la migración afirmaba algo
que en remoto no era cierto.

**0115** lo revoca explícitamente. Y se añadieron las tres comprobaciones de
privilegios por SQL directo que lo detectaron y que impiden que vuelva.

Es la lección de 0111 y de 0112 §12 aplicada al caso que faltaba: cuando una
tabla debe ser de solo lectura para el cliente, **no basta con conceder
`SELECT`**.

## Suites contra Staging

```
· entorno: qchzkxbnbqeyuxinipln

quality-01-process-foundation   →  56 en verde, 0 en rojo
quality-01-1-acceptance         →  41 en verde, 0 en rojo
quality-01-2-acceptance         →  33 en verde, 0 en rojo
recorrido humano por HTTP       →  16 en verde, 0 en rojo
```

**Production: intacta.** Sin migración, sin variable, sin despliegue, sin datos.
`QUALITY_MODULE_ENABLED` no está definida allí: Quality sigue invisible.

---

# S · Preview

```
https://trazaloop-production-51i6hl5cy-idendi-latam-s-projects.vercel.app
```

Alias de rama:
`https://trazaloop-production-git-fix-qua-768ee2-idendi-latam-s-projects.vercel.app`

Estado **Ready**, `target: preview`, construido desde esta rama.

Sigue tras el SSO de Vercel (G-2): no se desactivó, porque es una opción de
proyecto compartida con Production.

---

# T · Aceptación visual

Revisado en un navegador real, con una empresa QUALITY-ONLY y cinco procesos
en tres categorías.

| # | Pantalla | Resultado |
|---|---|---|
| 1 | Ficha de proceso con **RECIBE DE / ENTREGA A** | ✔ Dos columnas, con salida y entrada nombradas en ambas |
| 2 | **Entrada** con su documento | ✔ «Especificación de materia prima · Rige el proceso · Desvincular» |
| 3 | **Salida** con su documento | ✔ «Registro de producto terminado · Registro del proceso» |
| 4 | **Mapa** con cinco procesos y cuatro relaciones | ✔ Bandas, flechas con punta, etiquetas «salida → entrada» |
| 5 | Mapa con un proceso **seleccionado** | ✔ Entrantes en ámbar, salientes en verde, detalle lateral |
| 6 | **Quality → Documentos → Crear** | ✔ El formulario abre; el documento se crea, se edita y guarda |

## El mapa, evaluado con ojo crítico

El encargo pedía juzgar si resulta comprensible y corregirlo dentro del sprint
si no lo era. **No lo era**, y se corrigió: los tres problemas de legibilidad de
la sección H salieron precisamente de mirarlo.

El resultado se lee de un vistazo: Compras alimenta a Producción, Producción
alimenta a Despachos y al SGC, y la Planificación estratégica entra en
Producción. Cada flecha dice qué fluye. No es perfección gráfica —no la
buscábamos— pero es un mapa digno de ponerse delante de un cliente.

---

# U · Regresión de PCR, Textiles y TrazaDocs

`test:all` (~1.400 comprobaciones, 84 suites) → **exit 0**.

## Un error propio, y por qué merece estar aquí

Durante el sprint `test:all` estuvo saliendo con **código 1** y se dio por
bueno dos veces. La causa: dieciséis suites llevan una lista blanca de
migraciones «autorizadas», QUALITY-01.2 añadió dos y no las declaró.

Lo que lo hizo invisible fue la forma de mirar: el fallo era una línea entre
~1.400 comprobaciones verdes, y se leyó el **final del registro** en vez del
**código de salida**. La lección no es «mirar mejor» sino que el resultado de
una suite es su código de salida, no su última línea.

Corregido en los dieciséis archivos, y con una comprobación nueva —**M8**— para
que el próximo olvido salga con nombre y apellidos en la suite del sprint. Esas
listas no se derivan a propósito: su valor es que alguien declare cada
migración. Lo que M8 arregla es que olvidarlo deje de ser silencioso.

Es, además, el mismo patrón que esta auditoría persigue: una lista escrita a
mano que hay que acordarse de ampliar.

| Área | Estado |
|---|---|
| **PCR** | ✔ Ninguna tabla suya se toca. Su dashboard sigue siendo suyo |
| **Textiles** | ✔ Entrada, navegación, documentos y aislamiento intactos |
| **TrazaDocs** | ✔ Ni una tabla, ni una política, ni una RPC. La relación nueva es una columna en una tabla de Quality |
| **Auth** | ✔ Sin cambios |
| **Equipos e invitaciones** | ✔ Los ocho casos siguen verdes. `accept_team_invitation` **no se tocó** |
| **Planes y Demo/Full/Extra** | ✔ Sin cambios |
| **Aislamiento** | ✔ `test:rls` 110/110 |

## Los dos cambios transversales, y su alcance real

| Cambio | Qué afecta | Por qué es seguro |
|---|---|---|
| Destino tras aceptar invitación | Todos los módulos | El selector es la entrada canónica desde Sprint 10A. Desde ahí PCR se entra igual que antes |
| Destino tras elegir empresa | Todos los módulos | Ídem. Y evita un rebote que ya ocurría para empresas sin PCR |

Ninguno concede ni deniega acceso: solo cambian a qué pantalla se llega.

## Pruebas ajustadas, ninguna debilitada

| Prueba | Antes | Ahora | Por qué |
|---|---|---|---|
| `quality011` M1 | «la última migración es 113» | 0113 existe y la cola **no retrocede** | El repositorio es append-only. Es el criterio que ya usaba QUALITY-01 |
| `quality01-rls` 50 | «hay exactamente 11 tablas» | ninguna sin RLS, y **al menos** las 11 | Lo que protege —que ninguna quede sin RLS— no cambió |
| `textiles-trazadocs` 12 | el tipo escrito literalmente | el tipo derivado **más** que el registro incluya los tres módulos | La exigencia es más fuerte: antes solo miraba el texto |

---

# V · Commits

| Commit | Contenido |
|---|---|
| `8d2bc11` | QUALITY-01.2 — relaciones, documentos de E/S, mapa e invitaciones |
| *(este)* | Entregables |

30 archivos, +4.703 / −392 líneas. Rama limpia desde QUALITY-01.1 aprobado.
**Sin `force push`.** Sin mezclar otras ramas.

---

# W · Gaps

## Limitaciones del entorno, no del código

| # | Situación | ¿Bloquea? |
|---|---|---|
| G-2 | Preview tras SSO de Vercel | **No.** Navegable con cuenta del equipo |
| G-3 | Staging sin SMTP | **No.** El enlace de invitación se comparte a mano, y está siempre disponible desde QUALITY-01.1 |
| G-4 | `supabase db reset` se detiene en 0105 | **No.** Preexistente y documentado en la propia 0105. Solo afecta a la reconstrucción local |
| G-5 | `NEXT_PUBLIC_*` se inlinea en el build | **No.** Para probar contra otro entorno hay que recompilar. Anotado en el documento de validación |

## Trabajo deliberadamente aplazado

| Área | Nota |
|---|---|
| Reordenar el mapa arrastrando | La disposición se calcula. Mover un bloque a mano exigiría persistir coordenadas, que es un modelo nuevo |
| Varios mapas por empresa | El modelo los soporta (`quality_process_maps`); la pantalla abre el que está por defecto |
| Versiones de documentos de Quality | El motor las soporta; falta la pantalla de historial |
| Plantillas de documentos de Quality | No hay blueprints con `module_key='quality'` |
| Categorías propias desde la interfaz | El modelo las soporta y la RLS las aísla; falta la pantalla |
| Menú ISO completo, competencias, evaluaciones | Excluidos desde QUALITY-01 |
| D-01…D-30 de TrazaDocs | Fuera del alcance |

## Deuda ajena, detectada y no tocada

| Tema | Nota |
|---|---|
| `tests/rls/isolation.test.ts:2642` | Token de invitación literal: impide repetir la suite sobre la misma base. Preexistente |
| Aviso de lint en `textiles-evidences-hardening.test.ts:40` | Preexistente, ajeno |
| `storage-deletion.ts` enumera dos módulos | Clasificado **C-1** en la auditoría: hoy correcto, pero es lo primero que mirar cuando Quality tenga archivos |

## Una observación sobre el patrón

QUALITY-01.1 corrigió cuatro listas de módulos escritas a mano. QUALITY-01.2 ha
corregido seis más. Corregirlas no basta: **vuelven**.

Lo que impide que vuelvan no son las correcciones, sino los siete invariantes
(F1–F7, E3). Si el próximo sprint añade un módulo y algo se olvida, lo dirá una
prueba antes que un usuario.

---

# X · Checklist para la prueba humana final

Los enlaces salen de la pantalla anterior: basta con navegar. Cuenta de
Staging, empresa con Quality en Full.

### 1 · El error que reportaste último
- **Quality → Documentos → Crear documento.** El formulario debe abrirse, no la
  pantalla de «This page couldn't load».
- Escribe un título, elige un tipo del desplegable —debe tener siete opciones—
  y crea. Debe abrirse el documento.
- Escribe algo en «Objetivo» y guarda: debe decir **«Contenido guardado.»**

### 2 · Relaciones entre procesos
Crea tres procesos —Compras, Producción, Despachos— con al menos una entrada y
una salida cada uno.

- En **Producción**, sección «Relaciones con otros procesos»: pulsa **«Añadir
  proceso del que recibe»**, elige Compras, su salida y la entrada de
  Producción.
- Pulsa **«Añadir proceso al que entrega»**, elige la salida de Producción,
  Despachos y su entrada.
- Comprueba que Producción muestra **RECIBE DE Compras** y **ENTREGA A
  Despachos**, con los cuatro nombres.
- **Entra a Compras.** Debe mostrar «Entrega a Producción» — la misma relación
  desde el otro lado. No debe haber una segunda entrada duplicada.
- Intenta relacionar un proceso **consigo mismo**: debe rechazarse.

### 3 · Documentos en entradas y salidas
- En una **entrada** de Producción, pulsa «Vincular documento» y elige uno.
- En una **salida**, vincula otro.
- Pulsa el nombre del documento: debe abrirse **dentro de Quality**, no llevarte
  a otro módulo.
- Pulsa **«Desvincular»** y ve a Documentos: el documento **debe seguir ahí**.

### 4 · El mapa
- **Quality → Mapa de procesos.** Coloca los tres procesos y mira el dibujo:
  Compras → Producción → Despachos, con flechas y con el texto «salida →
  entrada» en cada una.
- **Pulsa un proceso:** debe resaltar de quién recibe y a quién entrega, y
  abrirse un detalle debajo.
- **Publica el mapa.**
- Vuelve a un proceso y **borra una relación**. Regresa al mapa: la versión
  publicada **debe seguir mostrándola**. Ese es el punto.
- Abre una versión nueva y publícala: ahí sí debe reflejar el cambio, sin
  alterar la anterior.

### 5 · Invitaciones — el hallazgo 1
- **Equipo → invitar a alguien.** Copia el enlace.
- Ábrelo en una ventana privada, con una cuenta con ese correo.
- **Acepta.** Debes aterrizar en el **selector de módulos**, no en Trazaloop
  PCR.
- Repite invitando desde **Textiles** y desde un área transversal: mismo
  resultado.

### 6 · Navegación
- Desde Quality, entra a **Equipo**. Debes seguir en Quality: el encabezado dice
  «Trazaloop Quality», no «NTC 6632».
- Mira los **atajos de la cabecera**: deben ser de Quality (Inicio, Cargos,
  Procesos, Mapa), no «Ir a Evidencias» ni «Ir a Trazabilidad».

### 7 · Lo que conviene mirar con ojo crítico
- **Si el mapa se entiende sin que nadie lo explique.** Es la pregunta que
  importa, y eres tú quien sabe cómo lo mira un gerente.
- **Los nombres de los tipos de relación documental** —«Rige el proceso»,
  «Registro del proceso», «Sirve de apoyo», «Referencia»—. Puede que un
  responsable de calidad los llame de otra manera.
- **Si «Recibe de» y «Entrega a» son los términos correctos** para vuestro
  vocabulario, o si preferís «Proveedor / Cliente» del proceso.
- **Cuántas relaciones son demasiadas** antes de que el mapa se sature. Hoy las
  etiquetas se ocultan a partir de siete; conviene decidirlo viendo un mapa
  real.
