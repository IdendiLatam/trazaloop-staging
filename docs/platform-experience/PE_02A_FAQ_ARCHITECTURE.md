# PE-02A · Arquitectura de la FAQ

**Decisiones PEH-01 … PEH-18.** Lo que hay hoy está en
[PE_02A_HELP_DISCOVERY.md](./PE_02A_HELP_DISCOVERY.md); la ayuda contextual, en
[PE_02A_CONTEXTUAL_HELP_ARCHITECTURE.md](./PE_02A_CONTEXTUAL_HELP_ARCHITECTURE.md).

---

## PEH-01 · Dos recursos, un patrón. No una tabla para todo

El encargo pregunta si un modelo genérico puede servir a `FAQ`, `PAGE_HELP`,
`FIELD_HELP` y `MODULE_HELP`. **Recomendación: no meterlo todo en una tabla, y
sí compartir el patrón, la taxonomía y el motor de publicación.**

Por qué no una tabla genérica:

| | FAQ | Ayuda contextual |
|---|---|---|
| Se direcciona por | su propia identidad | **dónde está pegada**: módulo + página + campo |
| Se busca | sí, es su función | no: aparece donde vive |
| Se ordena y se destaca | sí | no |
| Tiene categoría | sí | no — tiene ubicación |
| Se lee sin sesión | a veces, por decisión editorial | no |
| Su forma | pregunta + respuesta | qué es / ejemplo / respaldo / qué no inventar |

Una tabla que sirva a los dos necesitaría media docena de columnas nulas según
la fila y una condición de forma que nadie recuerda. El repositorio ya tiene la
lección aprendida: `trazadoc_authoring_guidance` **sí** unificó dos alcances
(`blueprint_section` y `section_role`) porque comparten forma exacta, y añadió
una restricción para que no exista una fila a medias. Unificar FAQ y ayuda
contextual no cumple esa condición.

**Lo que sí se comparte:**

- el patrón identidad + revisiones inmutables (PEH-02);
- las funciones de publicación y de lectura (PEH-03, PEH-06);
- el vocabulario de módulos y de claves estables (PEH-08);
- la clasificación normativa (PEH-10);
- el idioma (PEH-17).

**Contrapartida aceptada:** dos familias de tablas en vez de una, y por tanto
dos pantallas de administración en vez de una. Se paga a cambio de que cada fila
signifique una sola cosa.

---

## PEH-02 · Identidad estable + revisiones inmutables · opción **B**

De las tres opciones que plantea §30:

| | Modelo | Veredicto |
|---|---|---|
| A | fila única que se sobrescribe | **No.** Una respuesta de seguridad reescrita sin rastro es exactamente lo que §26 quiere evitar |
| **B** | **identidad estable + revisiones inmutables con vigencia** | **Sí** |
| C | híbrido borrador/publicada | Se obtiene **dentro** de B, sin un modelo aparte (ver PEH-03) |

Se elige B porque **ya está construido y probado** en 0136, y porque responde a
las cuatro preguntas de §18 sin inventar nada:

- ¿las ediciones sobrescriben? **No**, crean revisión.
- ¿la respuesta publicada anterior queda auditable? **Sí**, con su periodo de
  vigencia y quién la escribió.
- ¿se puede restaurar? **Sí**: publicar de nuevo el contenido de una revisión
  antigua crea una revisión nueva con ese texto. No hay «deshacer» que borre
  historia.
- ¿la redacción de seguridad y de precios necesita historia? **Sí** — es la
  razón principal.

**Forma conceptual** (no es SQL; PE-02A no crea esquema):

```
faq_categories        code · label · orden · status
faq_entries           IDENTIDAD: slug estable · categoría · orden · destacada
                      visibilidad · módulos aplicables · status
faq_entry_revisions    TEXTO inmutable: pregunta · respuesta_corta ·
                      respuesta_larga · idioma · normative_class ·
                      evidence_basis · verification_state · content_hash ·
                      effective_from · effective_to · change_note · created_by
```

Una sola revisión con `effective_to is null` por entrada: «la vigente» es una
pregunta con una respuesta.

**`evidence_basis` y `verification_state` no son adorno.** Son la aplicación
directa de la auditoría de seguridad: cada respuesta lleva escrito en qué se
apoya y con qué grado de certeza (`verified`, `verified_qualified`,
`external_pending`). Una respuesta marcada `external_pending` **no se puede
publicar**; la función de publicación lo impide. Así, la promesa de §9 —«no
publicar una promesa no verificada»— deja de depender de que alguien se acuerde.

---

## PEH-03 · Publicación explícita · borrador y vigente

Editar **no** publica. El ciclo es:

```
crear entrada           → status = draft, sin revisión vigente → invisible
publicar revisión       → nace la revisión 1, vigente          → visible
editar y publicar       → nace la revisión 2, se cierra la 1   → visible la 2
despublicar             → status = unpublished                 → invisible
```

Entre publicaciones, el texto en curso vive como **revisión de borrador**
(`effective_from` en el futuro o marcada `draft`), y la lectura pública **nunca**
la devuelve. Es lo que §25 pide: editar contenido publicado no expone texto a
medio escribir.

`draft` y `unpublished` son estados distintos a propósito: uno nunca se publicó,
el otro se retiró. Un cliente que buscaba una respuesta que existía merece que
podamos saber cuándo dejó de estar.

---

## PEH-04 · Categorías · administrables, y pocas

Taxonomía inicial, **diez**, en este orden:

| # | Categoría | Nota |
|---|---|---|
| 1 | Primeros pasos | |
| 2 | Cuenta y empresa | |
| 3 | **Seguridad y privacidad** | **prioridad de producto**; se muestra destacada |
| 4 | Trazaloop Quality | |
| 5 | Trazaloop PCR | |
| 6 | Trazaloop Textiles | |
| 7 | Documentos y evidencias | transversal: TrazaDocs sirve a los tres módulos |
| 8 | Trazaloop Intelligence | |
| 9 | Planes y facturación | crece en PE-04/05 |
| 10 | Soporte | |

**Construcción no tiene categoría** hasta que el módulo exista: una categoría
vacía es una promesa.

Las categorías son filas, no un `enum`: se administran desde el
superadministrador (crear, renombrar, reordenar, retirar). Un `enum` obligaría a
migrar para añadir una categoría, que es justo lo que §4 del encargo quiere
evitar. La **clave** (`code`) sí es estable e inmutable, porque es lo que
referencian las entradas.

---

## PEH-05 · Visibilidad ≠ derecho de módulo

Dos ejes independientes, y **no** deben mezclarse:

- **`visibility`**: `public` (se lee sin sesión) o `authenticated` (exige
  sesión). Es una decisión **editorial**.
- **`applies_to_modules`**: a qué módulos se refiere la entrada. Es una decisión
  **de contenido**.

La regla de §16, escrita para que nadie la reinterprete:

> Que una empresa no tenga contratado un módulo **no oculta** la documentación
> educativa sobre ese módulo. Lo que el derecho comercial gobierna es el
> **acceso al módulo**, no el derecho a leer qué hace.

Y su reverso:

> Una entrada `authenticated` no se lee sin sesión, aunque hable de un módulo
> público. Y ninguna entrada de FAQ puede contener datos de una empresa: la FAQ
> es catálogo del producto, y su tabla **no tiene `organization_id`**.

Esa última frase es también la razón por la que la FAQ no necesita RLS por
empresa: no hay empresa que separar.

---

## PEH-06 · Lectura pública segura, sin `service_role`

El repositorio ya resolvió esto **dos veces** y las dos soluciones sirven:

- `legal_documents` (0066): política con `using (status = 'active')` para
  `{anon, authenticated}`, escritura solo `is_platform_superadmin()`.
- `v_platform_organizations` (0055) y las vistas de 0141: la **vista** es la
  frontera y el filtro va dentro.

**Recomendación:**

- La lectura **pública** se resuelve con una **política** sobre la vista/tabla
  de entradas publicadas: `status = 'published' and visibility = 'public'`,
  restringida a las columnas de contenido vigente. El anónimo **no** puede leer
  borradores, ni notas internas, ni quién editó, ni entradas retiradas.
- La lectura **autenticada** añade las entradas `authenticated`.
- Toda la **escritura** exige `is_platform_superadmin()`.
- La lectura de la **historia** —revisiones cerradas, autor, notas de cambio—
  exige `is_platform_staff()`.

**PEH-06 es una prohibición además de una recomendación:** la FAQ pública **no**
se resuelve con el cliente administrativo en tiempo de ejecución (§32). Si la
política no basta, la respuesta correcta es una función `security definer` con el
filtro dentro —el patrón de `trazadoc_guidance_as_of`—, nunca `service_role`.

---

## PEH-07 · Quién administra

| Papel | Puede |
|---|---|
| `superadmin` de plataforma | crear, editar, publicar, despublicar, reordenar, destacar, categorizar |
| `support` de plataforma | **ver** todo, incluida la historia; **no** escribir |
| `admin` de una empresa | **nada**: la FAQ es global, no de su empresa |
| miembro | leer lo publicado que le corresponda |

Es la misma distinción que 0141 §3 fijó para Intelligence —«support VE, solo
superadmin ESCRIBE»— y no hay razón para que la FAQ invente otra.

---

## PEH-08 · Claves estables · una sola familia para PE-02 y PE-03

§14 pide una estrategia de claves compatible entre PE-02 y PE-03, sin duplicar
sistemas. La propuesta se apoya en lo que ya es estable:

```
module_key   cpr | textiles | quality | construccion | platform
             ← lib/modules/catalog.ts + PE-01B. Congelado.

page_key     minúsculas, con puntos:  quality.processes.detail
                                      cpr.evidences.list
                                      platform.modules
             ← NUEVO. Es lo único que PE-02 tiene que crear.

section_key  ← ya existe en TrazaDocs (0136)
field_key    ← minúsculas, dentro de una página
entity_key   ← quality_ai_sources.code (26 filas, con clase de privacidad
                y enlace profundo). Reutilizar, no duplicar.
```

**Reglas:**

1. **La URL no es identidad.** PE-01B movió una superficie entera sin cambiar
   ninguna promesa; una clave basada en la ruta habría roto la ayuda ese día.
2. El `page_key` se **declara en el código** junto a la página, en un catálogo
   único, y la base solo lo referencia como texto. Igual que `section_key`.
3. **PE-03 usa el mismo `page_key`.** No habrá un espacio de claves para ayuda y
   otro para tutoriales. Es la exigencia explícita de §14 y de §34.
4. Cuando ya existe una entidad en `quality_ai_sources`, se usa **su** código.
   Inventar `quality_process_page` al lado de `quality_process` sería crear el
   segundo vocabulario que §14 prohíbe.

---

## PEH-09 · La búsqueda · texto en servidor, y nada más

Lo que §19 permite y basta:

- filtro por **categoría** y por **módulo**;
- búsqueda de texto **en el servidor**, sobre pregunta y respuesta corta de la
  revisión vigente, con la configuración `spanish` de Postgres;
- orden: destacadas primero, después el orden de la categoría.

**No** hay servicio externo de búsqueda, **no** hay base vectorial, y **no** se
usa IA para recuperar una FAQ. Una FAQ de treinta entradas que necesita
embeddings es una FAQ mal escrita.

Si algún día no basta, el siguiente paso es un índice `tsvector` materializado en
la revisión vigente — dentro de la misma base, sin dependencias nuevas.

---

## PEH-10 · Referencias normativas · el estilo ya está decidido

`normative_class` existe desde 0136 con cinco valores cerrados: `safe`,
`normative_reference`, `conformity_risk`, `certification_risk`, `ambiguous`.
**Se reutiliza tal cual** para la FAQ y para la ayuda contextual.

La frontera, con las palabras del producto:

| Se puede escribir | No se puede escribir |
|---|---|
| «Relacionado con ISO 9001:2015, 6.1» | «Esto garantiza el cumplimiento de ISO 9001» |
| «La norma pide determinar…» | «Con esto ya cumples el requisito» |
| «Trazaloop organiza la información que una auditoría suele pedir» | «Trazaloop te certifica» |

Una entrada clasificada `conformity_risk` o `certification_risk` **no se publica**
sin revisión explícita. La clasificación no la decide quien escribe: se propone
al publicar y queda en la revisión, y **reclasificar es una revisión nueva**, no
una edición — igual que en 0136.

---

## PEH-11 · Cada afirmación de seguridad lleva su base

Toda entrada de la categoría **Seguridad y privacidad** debe llevar:

- `evidence_basis` — dónde se comprobó (migración, política, archivo, medición);
- `verification_state` — `verified` · `verified_qualified` · `external_pending`.

Y la publicación **rechaza** `external_pending`. Es la aplicación mecánica de
§9 y §11 del encargo: una promesa que nadie verificó no puede salir por
descuido.

---

## PEH-12 · Idioma · previsto, no implementado

§27 pide no cerrar la puerta. La forma más barata de dejarla abierta:

- el **idioma vive en la revisión**, no en la entrada: `language`, hoy siempre
  `es`;
- la identidad de la entrada es **una** para todos los idiomas;
- «la vigente» pasa a ser «la vigente **en este idioma**»: un índice único por
  `(entry_id, language)` en vez de por `entry_id`.

No se traduce nada ahora, no hay selector de idioma, y no hay una segunda tabla.
Lo único que se hace es no construir un modelo que impida traducir.

---

## PEH-13 · La frontera editorial

§20, escrito para que se pueda citar cuando alguien pida más:

> La FAQ y la ayuda explican **cómo funciona Trazaloop**. No dicen a esta empresa
> qué debe hacer.

| Sí | No |
|---|---|
| «Un proceso se relaciona con un riesgo desde la ficha del riesgo» | «Deberías registrar estos cinco riesgos» |
| «La norma pide determinar las partes interesadas» | «Tus partes interesadas son…» |
| «Un cálculo con evidencia sin validar sale en 0 %» | «Tu cálculo está mal porque…» |

Lo que cae fuera —asesoría funcional, interpretación normativa para un caso,
consejo legal, implantación a medida— no se responde en la FAQ. Se deriva, y en
PE-04 se decidirá a dónde.

---

## PEH-14 · Gancho de escalación · reservado, no implementado

§21: se **reserva el sitio** para dos caminos distintos al final de una respuesta
—«Reportar un problema técnico» y «Necesito asesoría funcional»— y no se
implementa ninguno en PE-02.

El vocabulario ya existe: `support_tickets.category` tiene `bug` y
`technical_support` (técnicos) e `implementation` (funcional). **PE-02 no crea
categorías nuevas ni cambia el comportamiento del soporte.** Quién puede abrir
cada camino es PE-04.

---

## PEH-15 · Gancho PE-03 · el mismo `page_key`, y ninguna tabla de vídeo

- La ayuda contextual y la FAQ dejan **sitio** para «Ver tutorial en vídeo».
- El tutorial se localizará por `(module_key, page_key)`: **las mismas claves**.
- **PE-02A no crea ninguna tabla de vídeo** y PE-02B tampoco (§34).

---

## PEH-16 · Gancho PE-04/05 · la FAQ no duplica precios

Regla antiduplicación, para que quede escrita antes de que exista la tentación:

> Una respuesta de FAQ **no escribe un precio, ni un límite, ni una cuota**.
> Enlaza a la configuración comercial canónica o la interpola desde ella.

El repositorio ya tiene la fuente canónica de límites y cuotas
(`plan_definitions` / `plan_limits`, 0050) y ya aprendió esta lección: T9F.1
declaró que el plan org-global heredado **no** gobierna acceso ni cuotas. Una
FAQ con «50 MB» escrito a mano sería la tercera copia de un número que ya tiene
dueño.

Mientras PE-04/05 no existan, las preguntas de precio se responden sin cifras
—«tu plan y tus límites se ven en la pantalla de plan de cada módulo»— o no se
publican.

---

## PEH-17 · Qué NO se hace en PE-02

- **No** se migra a la base la ayuda escrita en código (las nueve constantes
  `*_HELP`) en el mismo movimiento. Ver la arquitectura de ayuda contextual: se
  hace por olas, empezando por lo que ya tiene la forma correcta.
- **No** se toca `trazadoc_authoring_guidance`. Es de TrazaDocs y funciona.
- **No** se implementa traducción.
- **No** se construye la pantalla de administración de documentos legales,
  aunque el descubrimiento la eche en falta. Se deja escrito como deuda.
- **No** se cambia el comportamiento del soporte.

---

## PEH-18 · Migraciones anticipadas

PE-02A **no crea esquema**. Lo que PE-02B previsiblemente necesitará, en **una**
migración:

```
0155  faq_categories
      faq_entries
      faq_entry_revisions
      + índice único de revisión vigente por (entry_id, language)
      + disparador de inmutabilidad de revisión (patrón 0136)
      + faq_publish_entry(...)        security definer · superadmin
      + faq_unpublish_entry(...)      security definer · superadmin
      + políticas: pública, autenticada, historia para staff, escritura superadmin
      + siembra de las 10 categorías
```

Y una segunda, **separable**, para la ayuda contextual:

```
0156  help_items
      help_item_revisions
      + help_publish_item(...)
      + política de lectura autenticada por módulo/página
```

Se recomienda **no fusionarlas**: si la ayuda contextual se aplaza, la FAQ no
arrastra tablas vacías. Y ninguna de las dos toca una migración histórica.

**Recordatorio operativo:** cada migración nueva hay que autorizarla en las
listas blancas de las pruebas, o `test:all` falla.

---

## PEH-19 · Carryover 01 · la portada pública

La corrección es **pequeña y acotada**. No se rediseña el sitio de marketing.

**Hoy:** `app/page.tsx` pinta cuatro tarjetas equivalentes en
`<section className="grid gap-4 sm:grid-cols-2">` — PCR, Textiles, Quality,
Construcción, todas del mismo tamaño y peso.

**Desiderátum:** la misma jerarquía que PE-01 congeló para la puerta.

```
┌──────────────────────────────────────────────┐
│  Trazaloop Quality           [Disponible]    │   ancho completo
│  Gestiona procesos, riesgos, objetivos,      │   título mayor
│  personas, proveedores, auditorías y mejora  │
│  continua desde un entorno conectado y       │
│  trazable.                          Entrar → │
└──────────────────────────────────────────────┘
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Trazaloop PCR │ │ …Textiles     │ │ …Construcción │   sm:grid-cols-2
│ [Disponible]  │ │ [Disponible]  │ │ [Próximamente]│   lg:grid-cols-3
└───────────────┘ └───────────────┘ └───────────────┘
```

**Qué cambia exactamente:**

1. Quality sale de la rejilla y pasa a un bloque de ancho completo, encima.
2. Los otros tres quedan en `sm:grid-cols-2 lg:grid-cols-3`, en ese orden.
3. Construcción conserva «Próximamente» y sigue sin ser un enlace.
4. La frase de Quality es la congelada, **sin tocar una palabra**.

**Qué NO cambia:** el hero de plataforma, el flujo de registro, «Crear cuenta
Demo» y su kill switch, el pie, los enlaces legales, y las frases de PCR,
Textiles y Construcción.

**Reutilización:** `lib/modules/entry.ts` ya expone `heroModule()`,
`specializedModules()` y `ENTRY_COPY`, y son puras. La portada pública debería
leer de ahí en vez de escribir los nombres a mano — el mismo movimiento que
PE-01B hizo con la puerta, y por la misma razón: dos listas de módulos se
desincronizan.

**Y no se añade FAQ a la portada en PE-02A.** El enlace del pie llega con la
rebanada B3.

---

## PEH-20 · Carryover 02 · la copia de `/modules`

**Hoy**, `app/(app)/modules/page.tsx` línea 177:

> El estado de cada módulo se resuelve con la hora del servidor y con lo que tu
> empresa tiene hoy. Entrar a un módulo no decide qué puedes hacer dentro: eso lo
> determina tu rol.

**Reemplazo congelado:**

> Los módulos disponibles dependen del acceso de tu empresa. Dentro de cada
> módulo, tu rol define las funciones que puedes usar.

Se adopta **tal cual**. No hay ninguna convención del repositorio que sugiera
algo mejor: es más corta, dice lo mismo que importa y no menciona la hora del
servidor, que es vocabulario interno que nunca debió salir a pantalla.

La sustitución es de una constante de texto. **Ninguna regla cambia**: el estado
se sigue resolviendo con la hora del servidor, y el papel sigue decidiendo lo de
dentro. Lo que cambia es que ya no se lo contamos a quien no preguntó.

Regla general que se deriva, y conviene escribir: **en la copia visible no
aparece vocabulario interno** — «hora del servidor», «entitlement», «RLS»,
«tenant», «kill switch», «derivedState».

---

## Rebanadas de PE-02B

Derivadas del descubrimiento, en este orden y por esta razón.

| | Rebanada | Contenido | Por qué va aquí |
|---|---|---|---|
| **B1** | Modelo de datos y acceso | Migración de FAQ (categorías, entradas, revisiones), funciones de publicación, políticas, siembra de las 10 categorías. Suite `pe02-faq-access` | Nada más se puede probar hasta que exista |
| **B2** | Consola del superadministrador | Listar, buscar, filtrar, crear, editar, categorizar, reordenar, destacar, publicar, despublicar, **vista previa** | Sin ella el contenido lo sigue sembrando una migración, que es el problema original |
| **B3** | FAQ pública y autenticada | `/faq` sin sesión y con ella, categorías, búsqueda, destacadas, enlace desde el pie público y desde el producto. Suite `pe02-faq-e2e` | Es lo que ve el cliente |
| **B4** | Ayuda contextual | Tablas de ayuda, publicación, lectura por clave, catálogo de `page_key`, **ola 1** de migración de contenido (partes interesadas). Suite `pe02-help` | Depende de B1 para el patrón y de B2 para editarla |
| **B5** | FAQ de seguridad | Las 10 preguntas de la categoría prioritaria, con `evidence_basis` y `verification_state`; el rechazo de publicación de lo pendiente | Necesita B1..B3 puestos, y la decisión humana sobre la política de privacidad |
| **B6** | Carryovers y aceptación | PEH-19, PEH-20, regresión completa, humo humano | Son pequeños y no deben bloquear lo grande |

**Dos avisos sobre el orden.**

B5 va después de B3 y no antes: publicar la categoría de seguridad exige que la
consola y la vista pública ya funcionen, porque cada respuesta se revisa **viendo
cómo se lee**. Y B5 tiene una dependencia que no es de código: la política de
privacidad vigente (auditoría §12).

B6 se puede adelantar entero si conviene enseñar algo pronto: los dos carryovers
son independientes de la FAQ y ya están especificados al detalle.
