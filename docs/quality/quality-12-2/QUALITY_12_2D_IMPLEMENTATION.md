# QUALITY-12.2D · Revisión contextual de documentos

> Segunda capacidad documental de Trazaloop Intelligence.
> Rama `feature/quality-12-2d-contextual-document-review`
> **Local 0139 · Staging 0139 · Production 0111 — sin tocar**

---

## A · La pregunta que contesta

QUALITY-12.2C enseñó a mejorar un párrafo mirando **solo el párrafo**, la guía
de su sección y el perfil de la empresa. Deliberadamente no miraba nada más:
para que un texto se lea mejor no hace falta saber quién es el responsable
registrado.

12.2D contesta otra pregunta:

> **Lo que escribiste, ¿coincide con lo que Trazaloop ya tiene registrado?**

Y esa sí obliga a traer hechos.

| | 12.2C · Mejorar redacción | 12.2D · Revisar consistencia |
|---|---|---|
| Pregunta | ¿se lee bien? | ¿coincide con lo registrado? |
| Mira | el texto | el texto **y** la base |
| Devuelve | un texto para sustituir | una lista de sitios donde mirar |
| Casi siempre | hay algo que sustituir | **no** hay nada que sustituir |

Por eso son dos paneles y no uno. Pintarlas juntas llevaría a leer un hallazgo
como si fuera una propuesta de redacción, que es exactamente el malentendido
que hay que evitar: una discrepancia no se «aplica», se decide.

---

## B · La decisión de arquitectura del sprint

La tentación evidente era reutilizar el Context Pack de QUALITY-12:
diecinueve adaptadores, el sistema de gestión entero, 2 514–2 886 tokens y
diecisiete segundos. Habría sido más fácil de escribir y estaría mal, porque
para revisar la sección «Responsables» de un procedimiento no hacen falta la
voz del cliente ni las auditorías del año.

**Quién decide qué se busca: la guía canónica.**

`related_context_types` es una columna que QUALITY-12.2A creó sin que nada la
leyera y que 12.2B cerró a doce valores. Esto es lo que por fin la usa.

Suena a detalle de implementación y no lo es. La alternativa —una tabla en el
código que diga «responsabilidades lleva cargos y procesos»— parece lo mismo y
no lo es: esa tabla envejece en el repositorio, no la ve quien redacta las
guías, y el día que alguien añada una sección habrá que acordarse de tocarla.
La metadata viaja con la guía, se versiona con ella y se revisa cuando se
revisa la guía.

### Lo que declaran los datos reales, hoy

| Tipos declarados | Guías |
|---|---|
| ninguno | 183 |
| uno | 2 |
| dos | 66 |
| tres | 1 |
| cuatro | 1 |

**Ninguna declara cinco.** La recuperación es pequeña porque la metadata dice
que lo sea, no porque se haya recortado a ojo.

---

## C · El contexto progresivo

```
NIVEL 0   TEXTO             siempre
NIVEL 1   DOCUMENTO         siempre — metadatos, baratos
NIVEL 2   GUÍA              la canónica de 12.2A; trae related_context_types
NIVEL 3   PERFIL            solo si la guía declara organization_profile
NIVEL 4   HECHOS            solo los tipos que la guía declara
```

El nivel 3 dejó de ser automático. En 12.2C el perfil iba siempre; aquí se
enruta como todo lo demás. Es la disciplina de §4 aplicada también a lo que
resulta cómodo enviar.

---

## D · El alcance NO sale del texto

Es la propiedad que impide que esto se convierta en otra cosa.

Si el alcance dependiera de lo que alguien escribe en un `textarea`, cualquier
párrafo que mencione «compras» empezaría a hablar de proveedores que nadie
citó, y una frase bien elegida podría pasear por la base entera. Una API de
enumeración con otro nombre.

Así que el alcance sale de la **estructura**:

```
DOCUMENTO
   ├── owner_position_id                    → cargo responsable
   └── quality_process_documents            → sus procesos
         ├── processes.owner_position_id    → cargos dueños
         ├── quality_control_activity_links → controles
         ├── quality_indicators.scope_process_id → indicadores
         ├── quality_risk_processes         → riesgos
         └── quality_process_documents      → otros documentos
```

Todas son relaciones que alguien creó a mano en Trazaloop. Ninguna la dedujo un
modelo. Un documento sin procesos atados y sin cargo dueño tiene alcance vacío,
y entonces no hay revisión que hacer: se dice y no se gasta una llamada.

### El cargo responsable, y el rodeo que hace falta en PCR y Textiles

Solo los documentos de **Quality** tienen un selector de cargo responsable en
su pantalla. Los de PCR y Textiles no lo tienen: la columna existe, pero nada
la rellena.

Sin rodeo, «responsabilidad en conflicto» sería una función que en dos de los
tres módulos no puede dispararse nunca. Así que el **cargo dueño del proceso**
al que el documento está ligado entra también en el material, y sirve de
referencia cuando el documento no tiene cargo propio.

Con dos condiciones:

- **solo si hay uno.** Con dos procesos y dos dueños distintos no se sabe cuál
  gobierna la frase, y elegir sería adivinar;
- **con su nombre exacto.** El hecho dice «Cargo dueño del proceso *X*: *Y*»,
  nunca «responsable de este documento». No son lo mismo, y escribirlas igual
  invitaría a leer la segunda donde solo está la primera.

No cuesta ni una consulta más: el adaptador de procesos ya pedía esa columna.

### La única excepción, y por qué es segura

El texto **sí** puede meter un cargo o un proceso en el material, con dos
condiciones a la vez:

1. que **ya exista** como fila en la base;
2. que la persona haya escrito su **nombre completo**.

No añade información —la persona ya la escribió— y no puede inventar entidades:
cada acierto es una fila que existe. `quality_positions` y `quality_processes`
tienen el nombre único por empresa, con índice, así que un nombre completo
señala a **una** fila, nunca a dos.

---

## E · Los ocho adaptadores, y el que no existe

| Tipo | Alcance | ¿Histórico? |
|---|---|---|
| `organization_profile` | la empresa | no consulta nada |
| `process` | procesos del documento | **sí** · `quality_process_revisions` |
| `position` | cargo responsable del documento + dueños de sus procesos + los nombrados | **sí** · `quality_position_versions` |
| `document` | otros documentos del mismo proceso | **sí** · `trazadoc_document_revisions` |
| `control` | controles de esos procesos | no |
| `indicator` | indicadores de esos procesos | no |
| `risk` | riesgos de esos procesos | no |
| `evidence` | **no hay alcance** — ver §I | — |
| `objective` `supplier` `customer_feedback` `case` | **no hay alcance** | — |

### Por qué no se reutilizaron los del Copilot

Se miraron uno por uno. No sirven, y por una razón concreta: están escritos
para responder a **cualquier** pregunta sobre la empresa, así que leen a nivel
de empresa. El de controles trae los doce controles activos de la
organización; el de riesgos, los riesgos abiertos. Ninguno acepta «solo los de
este documento», porque el Copilot nunca lo necesitó.

Reutilizarlos habría significado traer el sistema de gestión entero, filtrarlo
después y pagar los tokens igual.

---

## F · «Confirmada» la escribe una función, no el modelo

QUALITY-12 fijó una regla —§58— que aquí vuelve a sostenerlo todo: los números
los calcula el código. La versión de 12.2D es más fuerte:

> **Una discrepancia confirmada la declara una función.**

El modelo puede decir `possible_conflict`. Solo eso: `confirmed_conflict` **no
está entre los valores que el esquema le ofrece**, y si aun así lo escribe, la
validación lo degrada.

La palabra la escribe el código, y únicamente cuando ha comparado dos valores
concretos:

| Comparación | Cuándo confirma |
|---|---|
| **Cargo** | la persona escribió el nombre completo de un cargo registrado **y** el documento tiene otro cargo responsable registrado |
| **Frecuencia** | el texto declara **exactamente una** periodicidad del vocabulario cerrado **y** un control en alcance registra otra |

Con un solo lado resuelto no se confirma nada. Si el texto dice «el responsable
de calidad» sin nombrar un cargo registrado, Trazaloop no sabe si se refiere al
cargo dueño con otras palabras o a otra cosa. Decirlo es honesto; adivinarlo no.

Y el ascenso exige además que el hallazgo **cite el mismo hecho** sobre el que
la comparación se pronunció. Sin esa coincidencia, el modelo hablaría de otra
cosa y ascenderlo sería regalarle la palabra.

---

## G · Un hallazgo NO es una no conformidad

La decisión más importante del sprint, y está en **tres** sitios.

1. **La palabra no existe** entre los siete tipos ni entre las tres severidades.
2. **El esquema no se la ofrece** al modelo.
3. **Las pruebas lo comprueban**, incluidas las etiquetas visibles.

Una no conformidad es un REGISTRO del sistema de gestión: la declara una
persona con autoridad, tiene código, dueño, causa, tratamiento, cierre y
evidencia; se audita; se cuenta en la revisión por la dirección. Un hallazgo de
esta pantalla es una observación que alguien puede mirar y descartar sin dejar
rastro.

Si el vocabulario se pareciera —«no conformidad menor», «hallazgo mayor»—, la
confusión llegaría sola: alguien exportaría la lista, la llevaría a una
auditoría y presentaría como diagnóstico del sistema lo que un modelo dedujo de
un párrafo.

| Tipo | Qué dice |
|---|---|
| `consistent` | el texto y el registro coinciden |
| `missing_information` | falta un dato que la guía pide |
| `possible_conflict` | podría no coincidir |
| `confirmed_conflict` | **el código comparó y no coinciden** |
| `unverifiable_claim` | Trazaloop no puede respaldar la afirmación |
| `ambiguous_reference` | encaja con varios y no se elige |
| `guidance_gap` | la guía pide algo que el texto no aborda |

Severidades: `info`, `attention`, `conflict`. Editoriales, no de auditoría:
dicen cuánta atención merece leer esto, no cuánta gravedad tiene para el
sistema de gestión.

**Y `consistent` tampoco declara conformidad.** Dice que dos cosas coinciden.
No que esté bien, ni que cumpla una norma, ni que se pueda certificar.

---

## H · Verdad histórica sin fingir

**Primero: cómo puede ocurrir desde la pantalla.** El panel opera sobre el
borrador vivo del editor. No hay ningún sitio en la interfaz desde donde se
pueda pedir una revisión de una revisión histórica. Así que hoy la pantalla
revisa **siempre** contra el estado actual, y la acción de servidor manda
`asOf: null` sin aceptar fecha del cliente.

La biblioteca **sí** acepta una fecha, y se comporta bien con ella, porque el
modelo documental de Trazaloop tiene verdad histórica y fingir que no la tiene
sería peor que soportarla.

Con fecha, cada adaptador hace lo que sabe:

- los que **saben** reconstruir el pasado filtran por vigencia;
- los que **no** saben se **apagan** y la revisión lo declara.

No se entrega el valor de hoy con etiqueta de entonces. Está probado: a
`2021-06-30`, controles, indicadores y riesgos quedan fuera con su límite
declarado, y **no se confirma ninguna discrepancia de frecuencia** contra un
control que no sabe qué frecuencia tenía aquel día.

---

## I · Una relación que no existe

Diecisiete guías —las secciones «Registros» y «Evidencias» de Textiles y el
papel `records` de Quality— declaran `evidence` como contexto pertinente. Tiene
todo el sentido: la sección que enumera los registros que deja una actividad
debería poder contrastarse con las evidencias de esa actividad.

**Solo que esa relación no existe.** Se buscó una por una:

- `evidence_links` apunta a proveedores, materiales, productos, lotes y
  órdenes, y su disparador de validación **rechaza `document`** de forma
  explícita, aunque el enum tenga el valor;
- `textile_evidence_links` apunta a entidades textiles;
- ninguna clave ajena de la base lleva de una evidencia a un `trazadoc_document`.

Había un adaptador escrito para esto. Una prueba lo pilló devolviendo cero
filas **siempre**.

Se podría haber inventado el enlace. Habría sido un cambio de dominio hecho de
pasada, dentro de un sprint de IA, para que una prueba enseñara algo. Se ha
quitado el adaptador, `evidence` está entre los tipos sin alcance, y la
revisión **declara que no puede mirar ahí** en vez de parecer que miró.

Queda anotado para quien decida si esa relación debe existir.

---

## J · Secciones sin guía

Una sección sin guía no tiene `related_context_types`, y sin eso no hay ninguna
base para decidir qué contexto es pertinente.

De las tres opciones que planteaba el encargo se eligió la más segura:
**no hay revisión contextual profunda**, y no se llama al proveedor. Deducir
los tipos del título libre de la sección es exactamente lo que §7 prohíbe:
convertiría un título en un mapeo inventado.

Quick Edit sigue funcionando ahí con normalidad: mejorar la redacción de una
sección propia no necesita saber contra qué contrastarla.

---

## K · El proveedor solo cuando hace falta

```
1. ¿Hay texto?                  no → no se llama
2. ¿Hay permiso del módulo?     no → no se llama · no se lee nada
3. Enrutar el contexto
4. ¿Hay ALGÚN hecho?            no → NO SE LLAMA
5. Llamar
6. Validar y ascender
7. Cerrar con lo que costó
```

**El paso 4 es el que más se nota.** Una sección sin cargos, sin procesos y sin
nada registrado alrededor no tiene contra qué contrastarse. Se podría llamar
igual y el modelo diría, con mucha educación, que no encontró nada; pero eso
cuesta ochocientos tokens y tres segundos para producir una frase que el código
ya sabe escribir. Se responde sin llamar, `provider_called` queda en falso, y
quien lea el consumo dentro de seis meses verá la verdad y no una llamada de
cortesía.

El **paso 2 antes del 3** también importa: construir el contexto de una empresa
que no tiene derecho a esto y descartarlo después sería leer lo que no toca.

---

## L · Nada se escribe

| | |
|---|---|
| Documento, sección, estado | **sin tocar** |
| Revisiones, versiones | **ninguna** |
| Casos, acciones, riesgos, controles, objetivos, indicadores | **ninguno** |
| Los hallazgos | **no se guardan** |
| Lo único que queda | la operación y sus fuentes |

Los hallazgos no se persisten a propósito. Un hallazgo de la IA no es un
registro del sistema de gestión, y guardarlo lo convertiría, con el tiempo, en
algo que alguien creería.

«Aplicar redacción» —cuando un hallazgo trae una alternativa— cambia el
`textarea` del borrador y se acabó. Después la persona sigue teniendo que
pulsar Guardar.

---

## M · La pantalla

```
[ Mejorar con Intelligence ]   [ Revisar consistencia ]
```

Cada hallazgo enseña los dos lados, uno al lado del otro:

```
┌─────────────────────────┬──────────────────────────────────┐
│ Tu texto dice           │ Trazaloop tiene registrado       │
│ El Coordinador de       │ Responsable registrado de este   │
│ Calidad revisará        │ documento: cargo «Coordinador    │
│                         │ de Compras».                     │
└─────────────────────────┴──────────────────────────────────┘
El texto nombra un cargo distinto del registrado.
Puedes: decidir cuál de los dos hay que corregir.
[Ir a Cargo Coordinador de Compras] [Aplicar redacción] [Copiar] [Ignorar]
```

Puestos así, quien lee decide en dos segundos y sin creerle nada a nadie. Un
párrafo de prosa explicando la discrepancia se lee peor y se audita peor.

Y la pantalla dice lo que **no** pudo mirar. Un contexto recortado en silencio
se lee igual que uno completo, y esa es exactamente la lectura que no debe
poder hacerse.

### Sin `<form>`, y no es una preferencia

El panel vive dentro del formulario de guardado de la sección, y un `<form>`
dentro de otro es HTML inválido: el navegador descarta la etiqueta interna.
React no lo valida, así que el árbol se ve perfecto en el código y en el
servidor, y en el navegador el botón no hace nada. Le pasó a 12.2C en los tres
módulos y lo encontró una persona pulsando, no las pruebas.

El panel de 12.2D **nace con su prueba de cableado**: monta el componente en un
DOM real, dentro del formulario de guardado, pulsa el botón y mira qué pasa. Se
comprobó que la prueba detecta el defecto reintroduciéndolo a propósito.

---

## N · Los tres módulos

El permiso lo da el **módulo del documento**, nunca Quality. Una empresa con
PCR en Full y sin Quality tiene derecho a que alguien revise si su
procedimiento contradice lo que ella misma tiene registrado.

| Módulo | Documental | Comercial | Probado con |
|---|---|---|---|
| PCR | `cpr` | `traceability_6632` | `procedimiento_produccion` · sección `responsables` · `{position, process}` |
| Textiles | `textiles` | `textiles` | `TXT-PRO-007` · sección `alcance` · `{organization_profile, process}` |
| Quality | `quality` | `quality` | papeles `responsibilities` y `development` |

El módulo se **lee de la base**. Si el cliente pudiera declararlo, bastaría con
decir «textiles» sobre un documento de Quality para que se comprobara el plan
equivocado.

Hay una prueba que apaga Quality y comprueba que PCR y Textiles siguen
funcionando mientras Quality deniega.

**Demo no.** La guía de autoría no se entrega en Demo desde 12.2A, y una
revisión que la usa no puede ser la puerta de atrás. En Demo **no se llega a
leer un solo cargo**: la negativa ocurre antes de construir contexto.
**Extra funciona igual que Full**: no hay un cuarto estado.

---

## O · Migración 0139

Append-only. No toca la 0138 ni ninguna anterior.

| | |
|---|---|
| Fuentes nuevas | `position`, `evidence`, `organization_profile` |
| Columnas | `related_context_types text[]`, `context_queries integer` |
| Función | `document_review_start_run(...)` |
| Función | `document_review_record_context(...)` |
| Vista | `v_document_review_usage` · `security_invoker` |

`position` es la fuente más importante de las tres: para hablar de
responsabilidades hay que nombrar a alguien, y se cita el **cargo**. Un
procedimiento dice «el Coordinador de Compras aprueba», no «Marta aprueba»: el
cargo sobrevive a quien lo ocupa y no es un dato personal que haya que enviar a
un tercero.

**El tope diario es suyo**, no compartido con la redacción. Si compartieran
contador, cien mejoras por la mañana dejarían sin revisión toda la tarde, y son
dos cosas que ni cuestan lo mismo ni se usan igual.

---

## P · Dos defectos encontrados durante el desarrollo

No se ocultan: los dos enseñan algo.

### 1 · La ambigüedad se quedaba callada

La validación descartaba todo hallazgo que no citara un hecho. Correcto para
casi todos… y exactamente al revés para `ambiguous_reference`: una ambigüedad
dice «esto encaja con varios y no elijo». Si pudiera citar **un** hecho es que
no era ambigua, y los candidatos no viajan como hechos justamente porque
ninguno está en el alcance.

El efecto era el peor posible: **la única pantalla que existe para no elegir en
silencio se quedaba en silencio.** Lo encontró la prueba funcional del caso E.

### 2 · Un `update` que no tocaba ninguna fila

El contexto resuelto se apuntaba con un `update` sobre `quality_ai_runs`, que
tiene **una** política y es de lectura. Con la sesión de quien pregunta, ese
`update` no da error: simplemente no afecta a ninguna fila. Un fallo que no se
queja.

Lo encontró una prueba que fue a **leer** la columna después de escribirla —no
una que comprobara que la escritura «no falló»—. Ahora va por función
`security definer` con comprobación de autor y de estado.

---

## P.bis · Lo que enseñó la validación humana

Las tres pruebas pasaron en la segunda ronda. La primera dio una parcial y un
fallo, y **ninguna de las dos era un defecto del algoritmo**: faltaba un cargo
en un caso y la relación documento↔proceso en el otro. Se reprodujeron las dos
contra base real, con el doble y sin gastar una llamada al proveedor.

Pero una de ellas sí destapó un defecto propio, y es de los que importan.

**El mensaje no distinguía dos problemas distintos.** «No encontré registros
relacionados con esta sección» se decía igual cuando:

- la guía de la sección **no señala ningún tipo de contexto** —no hay nada que
  hacer, esta sección no se contrasta—; y cuando
- la guía sí señala pero **al documento le falta la relación** —hay algo
  concreto que enlazar—.

El primero no tiene arreglo y el segundo sí, y la pantalla los contaba igual.
Esa ambigüedad convirtió un dato ausente en algo indistinguible de un fallo del
producto, y costó una prueba humana averiguarlo.

Ahora el enrutado dice **por qué** quedó vacío —`no_types` o `empty_scope`— y
el segundo caso explica qué enlazar. Es la clase de mejora que no sale de un
diseño: sale de ver a alguien mirar una pantalla que no le dice lo que
necesita.

---

## Q · Gaps

**Blóqueres: ninguno. Gaps del alcance de 12.2D: ninguno.**

**Diferido por decisión:**

| Qué | A dónde |
|---|---|
| Renombrado global Copilot → Trazaloop Intelligence | **12.2E** |
| Cuotas y precio comercial | **12.2F** |

**Anotado para quien decida:**

- La relación **evidencia → documento** no existe en Trazaloop. Diecisiete
  guías la dan por supuesta. No se ha inventado (§I).
- `objective`, `supplier`, `customer_feedback` y `case` tampoco tienen alcance
  documental. Hoy ninguna guía los declara.
