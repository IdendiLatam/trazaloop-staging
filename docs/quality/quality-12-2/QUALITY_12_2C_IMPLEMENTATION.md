# QUALITY-12.2C · Asistencia de redacción documental

**Base** `1c2c655` (QUALITY-12.2B)
**Migración** `0138_document_authoring_runs.sql`
**Local 0138 · Staging 0138 · Production 0111 — sin tocar**

---

## A · Arquitectura

Cuatro piezas pequeñas y una puerta:

```
lib/domain/document-authoring.ts          las seis acciones · sin dependencias
lib/intelligence/document-authoring/
  policy.ts     la política y la tarea · server-only
  schema.ts     el contrato de salida · cuatro campos
  context.ts    los cuatro cajones
  budget.ts     la medición de tokens
  quick-edit.ts el orquestador
lib/db/assisted-writing.ts                ¿se ofrece aquí? · por módulo
server/actions/document-authoring.ts      la puerta
components/domain/documents/quick-edit.tsx  el panel, compartido
```

El orden del orquestador no es casual:

1. **Sin texto no se llama a nadie.** La persona escribe primero.
2. La base decide, con el permiso del **módulo del documento**.
3. Se construyen los cuatro cajones. **Ni un adaptador del Copilot.**
4. Se llama con una política corta y un esquema pequeño.
5. Se valida. Una salida rota no se pinta.
6. Se cierra con lo que costó.

## B · Transversalidad

`lib/intelligence/document-authoring` **no importa nada de Quality**. Reutiliza
el contrato de proveedor, la configuración y la maquinaria de salida
estructurada de QUALITY-12.1 —el adaptador de OpenAI validado en vivo— sin
quedar acoplado a `app/quality/copilot` ni a los adaptadores de Quality.

Un solo motor para los tres módulos:

| Módulo | Editor | Cómo se resuelve la guía |
|---|---|---|
| PCR | `SectionEditor` compartido | por estructura (12.2A) |
| Quality | `SectionEditor` compartido | por papel de sección (12.2B) |
| Textiles | editor propio + `TextileSectionField` | por estructura |

El editor textil no usa el `SectionEditor` compartido —tiene sus transiciones
de estado alrededor—, así que se extrajo su campo a un componente que reutiliza
**el mismo panel**. Un motor, tres editores, cero duplicación.

## C · Las seis acciones

`improve_writing` · `clarify` · `formalize` · `shorten` ·
`review_against_guidance` · `alternative_wording`

Lista cerrada, validada en el dominio, en la acción de servidor **y en la
base**. No hay campo libre de instrucciones: no se puede convertir esto en el
Copilot por un input oculto.

## D · La política

**348 tokens** frente a los 846 del Copilot. Corta porque aquí solo puede pasar
una cosa: alguien escribió un párrafo y quiere que se lea mejor.

Lo que conserva palabra por palabra es la frontera de todo QUALITY-12.2:

> Si un dato no está en el TEXTO ni en el PERFIL, no existe. Que la GUÍA lo
> pida no significa que la empresa lo tenga: dilo en `missing_information` y
> deja el texto sin ese dato. Nada de marcadores como `[responsable]`.

Y la de conformidad:

> Citar una norma nunca autoriza a escribir que la empresa cumple, está
> certificada, acreditada o verificada.

## E · El esquema

Cuatro campos, **169 tokens** frente a los 742 del Copilot:

```
suggested_text · change_summary (2) · missing_information (3) · warnings (2)
```

Nada de `facts`, `interpretation`, `suggestions`, `sources` ni `evidence`: eso
es del Copilot global y aquí no significa nada.

## F · Coste fijo

**801 tokens** frente a **1 664**. De ellos, 228 son contexto que sirve —guía,
perfil, documento— y 573 la maquinaria.

## G · Presupuesto por tamaño

| Texto | Entrada | Objetivo | |
|---|---|---|---|
| 50 palabras | **898** | ≤ 900 | ✔ |
| 100 | **979** | ≤ 1 000 | ✔ |
| 250 | **1 230** | ≤ 1 300 | ✔ |
| 500 | **1 648** | ≤ 1 800 | ✔ |

**Los cuatro, sin ajustar ninguno.** La primera versión los fallaba los cuatro;
se reescribió la política más corta y se quitó una explicación que viajaba
repetida en cada llamada y que la política ya daba una vez. Detalle en
`QUALITY_12_2C_TOKEN_BUDGET.md`.

Una mejora de 100 palabras cuesta el **39 %** de una consulta real del Copilot.

## H · Perfil de organización

El compacto de 12.2B: nombre, sector, actividad, productos y descripción. **90
tokens** medidos contra Staging. No se vuelve a consultar la empresa. Con el
perfil vacío la asistencia sigue funcionando: llega el nombre y ya.

## I · Guía de autoría

La canónica de 12.2A, y solo esa. Nunca `trazadoc_blueprint_sections.hint`, que
está congelado. Se registra **con qué revisión** se trabajó: cambiar la guía
mañana no reescribe lo que se sugirió hoy.

Los dos vocabularios de módulo se traducen en la acción **y** en la base:
`cpr` ↔ `traceability_6632`. Es el fallo que 12.2A descubrió, y aquí ya no cabe.

## J–L · Los tres módulos

Probados contra base real con documentos de cada uno. Y lo importante:
**Textiles y PCR funcionan con Quality deshabilitado** — hay una prueba que
apaga Quality expresamente antes de ejecutarlos.

## M · Sección a medida

Funciona con texto, documento y perfil, y **declara** `guidance_available =
false`. No se reutiliza la guía de otro papel: ofrecerle a una sección
inventada la guía de otra sería peor que no ofrecer ninguna.

## N · Demo, Full y Extra

| Plan | |
|---|---|
| **Demo** | **no se ofrece**, con motivo `demo` |
| Full | sí |
| Extra | sí, igual que Full |

La razón no es comercial sino de coherencia: la asistencia **usa la guía**, y
en Demo la guía no se entrega (12.2A). Ofrecerla ahí la convertiría en la
puerta de atrás para obtener lo que la pantalla niega. Sin cuarto estado.

## O · Seguridad

* El permiso es del **módulo del documento**, leído de la base.
* La base comprueba que el módulo declarado **coincide** con el del documento.
* Sin pertenencia, nada. Documento de otra empresa, `not_found`.
* La puerta **no depende** de `quality_ai_settings`.
* Freno diario de seguridad —no la cuota comercial, que es 12.2F—.
* `security definer` con `search_path` fijo, sin `service_role`.

## P · No inventar

La prueba reina: guía que pide responsable y frecuencia, texto que no los
tiene, perfil que tampoco. El material enviado **no contiene** ningún cargo ni
ninguna periodicidad, la propuesta no los añade, y lo que falta se **nombra**
sin marcadores copiables.

## Q · Normativa

La política lo prohíbe y la barrera que 12.2A guardó junto a cada guía
normativa **llega al proveedor**. Se comprueba que no se queda en la base.

## R · Procedencia y consumo

`quality_ai_runs` gana `module_key`, `document_id`, `section_key`,
`guidance_revision_id` y `action`. `use_case = document.quick_edit`, separado
del Copilot por `v_document_authoring_usage` —sin el texto—, para poder
compararlos cuando llegue 12.2F.

## S · Latencia

No hay fase de construcción de contexto: dos lecturas acotadas —la guía por
`rpc` y el perfil por `rpc`— y la llamada. Nada del patrón de diecinueve
adaptadores en fila que costaba 17–20 s en QUALITY-12.1. La latencia se
registra en cada operación.

## T · Archivos

```
supabase/migrations/0138_document_authoring_runs.sql          nuevo
lib/domain/document-authoring.ts                              nuevo
lib/intelligence/document-authoring/{policy,schema,context,budget,quick-edit}.ts  nuevos
lib/db/assisted-writing.ts                                    nuevo
server/actions/document-authoring.ts                          nuevo
components/domain/documents/quick-edit.tsx                    nuevo
components/domain/textiles/trazadoc-section-field.tsx         nuevo
components/domain/trazadocs/section-editor.tsx        + panel, textarea controlado
components/domain/trazadocs/document-editor.tsx       + assistedWriting
components/domain/textiles/trazadoc-editor.tsx        + assistedWriting
components/domain/quality/document-control-detail.tsx + assistedWriting
lib/db/authoring-guidance.ts       + cliente inyectable · + revisionId
lib/db/organization-profile.ts     + cliente inyectable
lib/ai/providers/fake.ts           + el contrato de redacción
app/(app)/(shell)/(cpr)/trazadocs/[id]/edit/page.tsx
app/(app)/(shell)/textiles/trazadocs/[documentId]/page.tsx
app/(app)/(shell)/quality/documents/[documentId]/page.tsx
tests/unit/quality-12-2c-quick-edit.test.ts    36
tests/unit/quality-12-2c-budget.test.ts        14
tests/rls/quality-12-2c-quick-edit.test.ts     24
tests/rls/quality-12-2c-safety.test.ts         14
```

## U · Migración

`0138`, append-only. No toca la 0137 ni ninguna anterior.

**Se evaluó no hacer ninguna.** `quality_ai_runs` sirve para registrar esto y
reutilizarlo permite comparar los dos casos de uso. Lo que no servía era su
**puerta**: `quality_ai_start_run` comprueba `quality_ai_settings`, que es de
Quality. Una empresa con PCR en Full no debería necesitar Quality para mejorar
un párrafo de PCR. Por eso la migración añade una puerta transversal y cinco
columnas de procedencia, y no una tabla nueva.

## V · Pruebas

36 + 14 + 24 + 14, cero fallos. `test:all` **EXIT 0**.

## W · Réplica limpia

0001…0138 desde cero, con las suites de base real repetidas.

## X · Cabeceras

| Entorno | |
|---|---|
| Local | **0138** |
| Staging | **0138** · 0 desalineadas |
| **Production** | **0111 · sin tocar** |

## Y · Preview

`trazaloop-production-6388tnsj7` — con la credencial de OpenAI de la rama.

## Z · Nombre visible

La capacidad nueva se llama **«Mejorar con Intelligence»**, en su propio panel.
**No se hizo ningún renombrado global**: el menú sigue diciendo «Copilot», y una
prueba lo vigila. El renombrado transversal es 12.2E.

La convivencia es coherente porque son dos superficies distintas: una página
llamada Copilot, y un botón dentro del editor de documentos. No hay un sitio
donde las dos etiquetas se vean juntas contradiciéndose.

## AA · Gaps

**Blóqueres: ninguno.** El único que hubo —el botón que no respondía— quedó
cerrado con su causa raíz, su arreglo y dos regresiones.

**Gaps del alcance de 12.2C: ninguno.**

**Diferido por decisión, no por olvido:**

| Qué | A dónde |
|---|---|
| Revisión contextual con fuentes del sistema de gestión | **12.2D** |
| Renombrado global Copilot → Trazaloop Intelligence | **12.2E** |
| Cuotas y precio comercial | **12.2F** |

Y una observación que no es un gap: los cuatro runs no aprovecharon el caché de
entrada porque cada uno usó una acción distinta. En uso continuado el prefijo
se repite y el proveedor lo sirve desde caché. No hay nada que arreglar; hay
algo que medir cuando haya uso real.


---

# Addendum · El botón que no hacía nada

La primera validación humana encontró un blóquer: al pulsar **Proponer** no
ocurría absolutamente nada. Ni carga, ni propuesta, ni error.

## A · Causa raíz

**Un `<form>` dentro de otro `<form>`.**

El panel tenía su propio formulario, y vive dentro del formulario de guardado
de la sección. Es HTML inválido: el analizador del navegador **descarta la
etiqueta interna** y sus hijos pasan al formulario de fuera, con lo que el
botón pierde la acción a la que estaba atado.

## B · Por qué no lo detectó nada

React **no valida** el anidamiento al renderizar. El árbol se ve correcto en el
código, compila, pasa el linter y se sirve igual desde el servidor. El defecto
solo existe cuando un navegador analiza ese HTML.

Y las 52 comprobaciones que estaban en verde llamaban todas a la acción de
servidor **por su nombre**, que funcionaba. Ninguna montaba el componente.

> Una prueba que invoca la función de servidor comprueba que la función
> existe. No comprueba que alguien pueda llegar a ella.

## C · Componente afectado

`components/domain/documents/quick-edit.tsx`, y por tanto **los tres módulos**:
CPR, Textiles y Quality ponen sus secciones dentro de un formulario de
guardado. Un solo defecto, un solo arreglo.

## D · ¿Salía petición del navegador?

**No.** El defecto está antes del servidor: el botón nunca llegaba a disparar
la acción. Por eso no había ni petición, ni error de consola, ni estado.

## E · ¿Llegaba al server action?

**No.**

## F · ¿Se llamaba al proveedor?

**No.** Cero llamadas gastadas durante el diagnóstico: se reprodujo con el
doble determinístico y con un DOM en memoria.

## G · El arreglo

El panel deja de tener formulario. El `FormData` se construye en el manejador y
la acción se despacha dentro de una transición. El botón es `type="button"`, de
modo que no puede enviar el formulario de guardado ni por accidente — que era
el otro riesgo latente del diseño anterior.

## H · Estados que faltaban

Pase lo que pase, ahora hay tres:

```
IDLE → «Pensando…» (botón deshabilitado) → propuesta
IDLE → «Pensando…» (botón deshabilitado) → error visible
```

Un botón que no responde es peor que uno que falla: con el primero nadie sabe
si llegó a pulsar. El texto del editor queda intacto en los tres estados.

## I · Regresión añadida

Dos cosas, y la segunda es la que importa a largo plazo:

1. **`test:quality122c-ui`** — 13 comprobaciones que montan el panel en un DOM
   real dentro de un formulario, pulsan el botón y miran el resultado. La
   acción se inyecta: sin servidor y sin proveedor.
2. **`L2`, el guarda transitivo** — recorre el grafo de composición a nivel de
   componente y falla si algo colgado de una región `<form>…</form>` acaba
   pintando otro form a cualquier profundidad. Comprobado reintroduciendo el
   defecto: lo caza en los tres módulos.

Para lo primero se añadió `jsdom` como dependencia de desarrollo, y el panel
acepta la acción como propiedad. Esa inyección no es un adorno para la prueba:
es la misma razón por la que las capas de datos aceptan un cliente de Supabase
—si la única forma de probar algo es en producción, no se prueba—.

## J–L · Los tres módulos

El arreglo es del componente compartido, así que cubre los tres. Verificado en
tres niveles: el panel a nivel de DOM (`ui`), el servidor por módulo con
documentos reales de cada uno (`rls`), y el cableado de cada editor y cada
página (`L3`, que comprueba que cada una resuelve la asistencia con **su**
módulo y no con Quality).

## M · La llamada real · HECHA

Cuatro llamadas reales contra `gpt-5.4-mini`, las cuatro aceptadas
humanamente. Entrada media **727 tokens** —un **71 % menos** que el Copilot—,
latencia **1,6 a 3,9 s**, y ninguna escribió nada en la base.

Durante el diagnóstico y el arreglo del blóquer **no se gastó ni una llamada al
proveedor**: se reprodujo con el doble determinístico y un DOM en memoria.

Detalle completo en `QUALITY_12_2C_LIVE_VALIDATION.md`.

## N · Sin migración

No era un problema de base de datos. Staging sigue en **0138**.
