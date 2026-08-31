# PE-02B1 · Los cimientos de la FAQ

**Sprint:** PE-02B1 — FAQ Data Foundation
**Migración:** `0155_platform_faq_foundation.sql`
**Cabeceras:** Local **0155** · Staging **0155** · Production **0111**
**Base:** PE-02A `39bb679`, decisiones PEH-01 … PEH-20

Sin pantallas. Sin capa de datos. Sin ayuda contextual. Sin tutoriales. Sin
precios. Este tramo decide **dónde vive el contenido, quién lo escribe y qué se
puede leer sin sesión**, y nada más.

---

## 1 · Qué problema cierra

Las preguntas frecuentes de Trazaloop viven hoy en `docs/FAQ_PILOT.md`: diez
respuestas que ningún cliente ve y que nadie puede corregir sin desplegar. Una
respuesta sobre seguridad que se corrige desplegando es una respuesta que se
corrige tarde.

---

## 2 · Cuatro tablas, y por qué cuatro

| Tabla | Qué guarda | ¿Muta? |
|---|---|---|
| `faq_categories` | Las diez categorías. Filas, no un `enum` | sí |
| `faq_entries` | La **identidad**: slug estable, categoría, orden, visibilidad, alcance, estado | sí |
| `faq_entry_revisions` | El **texto**, con su periodo de vigencia | **no** |
| `faq_entry_drafts` | El **borrador** en curso | sí |

### La identidad no guarda el texto

`faq_entries` no tiene ni `question` ni `answer`. Una pregunta se reformula
—«¿Puede otra empresa ver mis datos?» pasa a «…mi información?»— y su identidad
no debería moverse con la redacción. Es lo que permitirá enlazar a una
respuesta, traducirla y medir cuántas veces se leyó sin que nada de eso se rompa
al corregir una coma.

### El borrador vive aparte, y esa es la decisión de diseño del tramo

Podría haber sido una fila de revisión con un estado. No lo es, por una razón
concreta: **mientras se corrige una respuesta publicada, lo publicado tiene que
seguir intacto y visible**. Con el borrador en la misma tabla, la lectura
pública tendría que acordarse de excluirlo — y «acordarse» es exactamente lo
que falla.

Separándolo, la exclusión no es una condición que alguien pueda olvidar: es que
la consulta pública no menciona esa tabla.

Y sirve de vista previa: es lo que la consola enseñará en B2 antes de publicar,
sin que exista ninguna forma de que salga por la lectura pública.

---

## 3 · Por qué se parece tanto a 0136

Porque es el mismo problema y ya estaba resuelto. QUALITY-12.2A construyó para
la guía de autoría exactamente esto: identidad estable, revisiones inmutables
con vigencia, una sola abierta a la vez, publicación como única puerta de
escritura, y lectura que aplica su regla dentro de la base.

Se repite el patrón **a propósito y con las mismas palabras**, para que quien
conozca uno reconozca el otro sin releerlo:

| | 0136 (guía) | 0155 (FAQ) |
|---|---|---|
| Identidad + revisiones | sí | sí |
| Índice único de vigente | `(guidance_id) where effective_to is null` | `(entry_id, language) where effective_to is null` |
| Disparador de inmutabilidad | `trazadoc_guidance_revision_is_immutable` | `faq_revision_is_immutable` |
| Publicar cierra y abre | `trazadoc_publish_guidance` | `faq_publish_entry` |
| Publicar lo mismo no crea revisión | sí | sí |
| Clasificación normativa | cinco valores | **los mismos cinco** |

**Lo que NO se hizo:** meter la FAQ dentro de las tablas de 0136. Son recursos
distintos —una se busca y se ordena por categoría, la otra se pega a la sección
de un documento— y unificarlas obligaría a media docena de columnas nulas según
la fila. Lo decidió PEH-01; aquí solo se cumple.

**Lo que 0155 añade y 0136 no tenía:** la barrera de publicación por estado de
verificación (§5) y el idioma en la revisión (§6).

---

## 4 · Los tres estados

```
draft       · nunca se publicó. No existe para nadie de fuera.
published   · hay una revisión vigente.
unpublished · se publicó y se retiró.
```

Los dos últimos se distinguen a propósito. Un cliente que buscaba una respuesta
que existía merece que podamos saber **cuándo dejó de estar y con qué texto
estuvo**. Colapsarlos en «no visible» borraría esa pregunta.

Retirar **no borra**: cierra la revisión vigente y marca la entrada. Volver a
publicarla es publicar de nuevo, no reabrir — no existe «reactivar», que
reabriría una revisión cerrada y convertiría la inmutabilidad en un adorno.

---

## 5 · La procedencia de lo que se afirma

Cada revisión lleva:

| Campo | Para qué |
|---|---|
| `verification_status` | los cinco estados de la auditoría de PE-02A |
| `source_basis` | dónde se comprobó: migración, política, archivo, medición |
| `verified_at` | cuándo |
| `verification_note` | la salvedad, cuando la hay |
| `external_source_url` + `external_source_checked_on` | qué política de un tercero se leyó, y qué día |

Y **la publicación rechaza** `external_policy_verification_required`,
`not_verified` y `must_not_claim`. No es un aviso en una pantalla: es una
excepción de la base. Así, «no publicar una promesa que depende de un tercero
sin verificarla» deja de depender de que alguien se acuerde.

Dos reglas más, por el mismo motivo:

- **Una salvedad que no se escribe no es una salvedad.** Publicar
  `verified_with_qualifier` sin `verification_note` se rechaza. Es el caso de la
  respuesta sobre el acceso del personal de Trazaloop: cierta, y con un párrafo
  que no se puede quitar.
- **Una comprobación externa sin fecha no es una comprobación.** La política de
  un tercero cambia; sin fecha no se sabe cuándo dejó de ser cierta.

**La política del proveedor no se codifica en la aplicación** (§10 del encargo).
Se comprueba, se fecha y se escribe en la respuesta, que es contenido versionado.
Una prueba estática comprueba que ningún archivo de `lib/`, `server/` o `app/`
contenga una afirmación de ese tipo escrita a mano.

---

## 6 · El idioma, previsto y no implementado

`language` vive en la **revisión**, no en la identidad, y hoy siempre vale `es`.
No hay traducción, ni selector, ni segunda tabla.

Si viviera en la identidad, traducir mañana significaría duplicar cada pregunta
y perder que son la misma. Poniéndolo en la revisión, «la vigente» pasa a ser
«la vigente **en este idioma**» —el índice único es `(entry_id, language)`— y no
hace falta nada más. Cuesta una columna hoy; ahorra una migración de datos
después.

---

## 7 · La aplicabilidad por módulo · un solo vocabulario

```
scope = 'global'   → module_keys vacío   (obligatorio)
scope = 'modules'  → entre 1 y 4 claves  (obligatorio)
```

No se usa «lista vacía significa todos», que es la ambigüedad que convierte un
descuido en una entrada global.

Las claves son las **canónicas** de `lib/modules/catalog.ts`: `cpr`, `textiles`,
`quality`, `construccion`. Ya hay tres vocabularios de módulo en el repositorio
—el comercial, el de estructuras de TrazaDocs y el de tickets de soporte— y un
cuarto sería el que nadie sabría traducir. Una prueba estática compara la
restricción con el catálogo y comprueba además que no se haya colado ninguna
palabra de los otros dos.

**Y no concede nada.** Que una entrada hable de Textiles no exige tener
Textiles: la visibilidad es editorial (PEH-05). Está comprobado contra base real.

---

## 8 · La búsqueda, preparada

`search_document` es una columna **generada** —`to_tsvector('spanish', pregunta
+ respuesta corta + respuesta larga)`— con índice GIN sobre las revisiones
vigentes. Generada y no escrita a mano: no puede quedar desincronizada del
contenido.

Sin servicios externos, sin vectores, sin IA, y sin pantalla de búsqueda: eso es
B3.

---

## 9 · Lo que este tramo NO hizo

- **No** hay capa de datos de FAQ en `lib/db/` — B1 es esquema.
- **No** hay ninguna pantalla, ni pública ni de administración.
- **No** se creó `0156`: la ayuda contextual no es este tramo.
- **No** se creó tabla de vídeos ni de tutoriales.
- **No** se sembró **ninguna pregunta**. Solo las diez categorías.
- **No** se tocó `legal_documents` — ver
  [PE_02B1_SECURITY_CLAIM_GOVERNANCE.md](./PE_02B1_SECURITY_CLAIM_GOVERNANCE.md) §5.
- **No** se creó la categoría de Construcción: el módulo no existe y una
  categoría vacía es una promesa.

### Sobre no sembrar preguntas

§21 permitía sembrar ejemplos mínimos. Se decidió no hacerlo: el día que B3
publique la pantalla, cualquier ejemplo sembrado por migración estaría en
producción. Las suites crean su propio material y lo dejan identificable
(`qa_*_<sello>`).

---

## 10 · Estado de verificación

| | Resultado |
|---|---|
| Replay `0001 → 0155` | **0 FAIL** (método de dos pasos documentado) |
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | **EXIT=0** |
| `npm run lint` | **0 errores**, 66 avisos (línea base) |
| `npm run build` | **EXIT=0** |
| Suites del tramo | 35 + 17 + 13 + 16 = **81 comprobaciones**, 0 en rojo |
| `isolation` | 110 en verde |

Detalle en [PE_02B1_TEST_MATRIX.md](./PE_02B1_TEST_MATRIX.md).

---

## 11 · Una desviación, dicha en voz alta

Añadir la cuarta suite hizo que `npm run build` **agotara la memoria** en una
máquina de 8 GB, sin que ninguna línea de producto hubiera cambiado. La causa:
`tsconfig.json` incluye todo el árbol, así que la compilación de la aplicación
cargaba también el arnés de pruebas —sesenta y tantas suites— para comprobar
tipos que ninguna ruta usa.

**Arreglo:** `tsconfig.build.json` excluye `tests` y `scripts`, y `next.config.ts`
apunta la comprobación de tipos de la compilación a ese archivo. Es la misma
frontera que `outputFileTracingExcludes` ya trazaba en ese mismo archivo por la
misma razón, aplicada también a los tipos.

**No se pierde ninguna comprobación:** `npm run typecheck` sigue usando
`tsconfig.json` —pruebas incluidas— y forma parte de `test:all`. Y se comprobó
que la barrera no se volvió un agujero: con un error de tipos introducido a
propósito en `app/page.tsx`, la compilación falla igual.

Es un cambio de herramienta, fuera del alcance literal de «solo datos y RLS», y
por eso queda escrito aquí en vez de pasar desapercibido en el diff.
