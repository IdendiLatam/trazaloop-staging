# QUALITY-12.2A · Guía de autoría canónica y verdad histórica

**Base** `a41e3b9` (descubrimiento de QUALITY-12.2)
**Migración** `0136_trazadoc_canonical_authoring_guidance.sql`
**Local 0136 · Staging 0136 · Production 0111 — sin tocar**
**Sin llamadas a ningún proveedor de IA.**

---

## A · El problema, y el diseño elegido

Los 250 textos del botón «i» vivían en `trazadoc_blueprint_sections.hint`, una
columna que el backoffice **sobrescribía en sitio**. Consecuencia: no se podía
saber con qué guía se redactó una sección hace un año, porque esa guía ya no
existía en ninguna parte.

Es el mismo estándar que QUALITY-12 le exige al modelo —cada consulta guarda
con qué plantilla y qué versión se respondió— y que la guía de autoría no
cumplía.

### La decisión: tabla, no código

Se evaluó mover la guía a código versionado con Git. Se descartó por cuatro
razones concretas: la administra el superadministrador **sin desplegar**, está
autorizada **por plan comercial**, tiene **identidad estable en la base**, y ya
existe un backoffice que la edita. Llevarla a código habría perdido las cuatro.

### La decisión: enriquecer lo que ya identificaba

El descubrimiento demostró que `(module_key, blueprint_code, section_key)` ya
identificaba de forma estable cualquier sección de estructura. No se inventó
un identificador nuevo: se le dio a esa terna una tabla propia y una historia.

---

## B · Modelo de datos

```
trazadoc_authoring_guidance                 ← IDENTIDAD · no cambia nunca
  scope                blueprint_section | section_role
  module_key           cpr | textiles | quality
  blueprint_code       null en el alcance por papel
  section_key
  blueprint_section_id comodidad, no identidad
  status               active | inactive
  unique nulls not distinct (module_key, blueprint_code, section_key)

trazadoc_authoring_guidance_revisions       ← EL TEXTO · inmutable
  guidance_id · revision_number
  guidance                 la instrucción de redacción (era `hint`)
  purpose                  para qué existe la sección (era `description`, vacío)
  example                  un ejemplo, marcado COMO ejemplo
  do_not_invent            qué NO se puede rellenar sin dato autorizado
  related_context_types    qué fuentes pediría una revisión contextual
  normative_class          safe | normative_reference | conformity_risk
                           | certification_risk | ambiguous
  content_hash             sha256 del contenido
  effective_from / effective_to / superseded_by_revision_id
  change_note · created_by · created_at
```

### Por qué cada campo nuevo

`purpose` — `description` llevaba dos años vacío en las 250 filas. Aquí tiene
un sitio con sentido.

`example` — un ejemplo que no se distingue de un hecho es una invitación a
copiarlo dentro del documento. Separarlo es lo que permite decir «esto es un
ejemplo» cuando se le entregue a alguien, o a algo, que redacta.

`do_not_invent` — la barrera de §8 **junto al texto que la necesita**, no en
una política lejana. Quien reciba la guía recibe, en el mismo objeto, qué no
puede afirmar con ella.

`related_context_types` — nace vacío. Se llenará cuando exista quien lo
consuma (12.2D), no antes: rellenarlo hoy sería inventar.

`content_hash` — permite demostrar paridad tras un traslado sin comparar 250
textos a ojo, y es lo que hace que republicar el mismo texto no cree una
revisión inútil.

---

## C · Identidad

`(module_key, blueprint_code, section_key)`, con `nulls not distinct` para que
dos guías de papel del mismo módulo no puedan coexistir — en SQL, `null` nunca
es igual a `null`, y sin esa cláusula la unicidad no habría protegido nada.

**No entran en la identidad**: el título visible, el idioma, ni la posición en
pantalla. Los tres cambian sin que cambie de qué sección hablamos, y una
prueba lo vigila (`A2`).

### Los dos vocabularios de módulo

Un hallazgo del propio sprint, encontrado por una prueba: el módulo comercial
de CPR se llama **`traceability_6632`** en `modules` y `organization_modules`,
pero **`cpr`** en las estructuras de TrazaDocs. Son dos vocabularios distintos
que convivían sin que nadie los hubiera enfrentado.

La primera versión del resolver usaba el mismo parámetro para las dos cosas y
no devolvía **ninguna** guía de CPR. El fallo se habría leído como «esta
sección no tiene guía», que es la clase de error que no se nota. Ahora están
separados: el código comercial decide **si el texto sale**; la estructura
decide **qué guías son**.

---

## D · Modelo de revisión

Mismo patrón de vigencia que las revisiones documentales de QUALITY-02:
`effective_from` / `effective_to`, con **una sola abierta por guía** garantizada
por un índice único parcial.

**Inmutable de verdad.** El trigger bloquea cambios en `guidance`, `purpose`,
`example`, `do_not_invent`, `related_context_types`, `normative_class`,
`content_hash`, `revision_number`, `guidance_id`, `effective_from` y
`created_at`, y bloquea el borrado. La **única** excepción es cerrar la
revisión —poner su fin de vigencia y quién la sucede— y solo una vez. Sin esa
excepción no habría forma de suceder una revisión; con más margen, «inmutable»
sería un adorno.

**El orden importa.** `trazadoc_publish_guidance` cierra la vigente **antes**
de abrir la siguiente. El índice único parcial no se puede diferir, así que
insertar primero dejaría dos revisiones abiertas durante un instante y la
inserción fallaría. Lo descubrió la prueba `B2`, no un razonamiento previo.

**Republicar lo mismo no crea revisión.** Se compara la huella. Una historia
llena de revisiones idénticas no explica nada y ensucia la resolución
histórica.

---

## E · Resolución

```
trazadoc_guidance_as_of(org, module_code, blueprint_id, as_of)   → vigente o histórica
trazadoc_guidance_for_section_role(org, module_code, guidance_module, keys, as_of)
```

En TypeScript, un único módulo `lib/db/authoring-guidance.ts`:

```
getCurrentAuthoringGuidance(...)     la vigente
getAuthoringGuidanceAsOf(...)        la de una fecha
getSectionRoleGuidance(...)          la del papel de sección
resolveGuidanceHintMap(...)          lo que pinta el botón «i»
```

Es el **único** sitio del código que consulta la guía. Si mañana la necesita
otro módulo —o Trazaloop Intelligence— pasa por aquí.

---

## F · Traslado · 250/250

| | |
|---|---|
| Hints antes | **250** |
| Identidades | **250** |
| Guías vigentes | **250** |
| Revisiones totales | **259** |
| Textos idénticos al original | **241** |
| Textos corregidos (revisión 2) | **9** |

Sin pérdida de módulo, estructura, clave, título ni contenido — comprobado fila
a fila contra el original en la prueba `A2`, no por recuento.

Las nueve diferencias son **intencionadas y documentadas**: la revisión
normativa de la familia «Referencias técnicas». Cada una conserva su revisión 1
cerrada y consultable.

`purpose` nace vacío en las 250 porque `description` estaba vacío en las 250.
No se inventó un propósito que nadie escribió.

---

## G · Revisión normativa

Detalle completo en `QUALITY_12_2A_GUIDANCE_NORMATIVE_REVIEW.md`.

| | |
|---|---|
| `safe` | 231 |
| `normative_reference` | 18 |
| `ambiguous` | 1 |
| `conformity_risk` | **0** |
| `certification_risk` | **0** |

Nueve textos corregidos, todos de la misma familia. Seis textos que la primera
pasada marcó como riesgo resultaron **sanos**: lo que se corrigió fue el
clasificador, no el texto.

---

## H · El botón «i»

**Misma UX. Mismo contenido. Mismas reglas comerciales.**

Lo que cambia es de dónde sale y quién decide:

| | Antes | Ahora |
|---|---|---|
| Origen | `blueprint_sections.hint` | guía canónica vigente |
| Quién decide el plan | la aplicación, sobre un texto que ya tenía | **la base**, y el texto no sale |
| Lectura directa de la tabla | posible para cualquier miembro | **imposible** |
| Editar | sobrescribe | **publica una revisión** |

En el backoffice, la etiqueta del campo pasa a decir «Guía de autoría» y, cuando
ya hay historia, qué revisión está vigente. Debajo, una línea explica que
guardar un texto distinto publica una revisión nueva y que la anterior no se
pierde.

---

## I · Demo, Full y Extra

Congelado para 12.2A, tal como pedía el encargo: **la guía contextual NO se
expone en Demo**.

| Plan | Qué recibe |
|---|---|
| **Demo** | `has_guidance: true`, `restricted: true` y **nada más**: ni texto, ni propósito, ni ejemplo, ni clase normativa, ni número de revisión |
| **Full** | la guía completa |
| **Extra** | la guía completa |
| **Plataforma** | siempre el contenido real, sin depender de ningún plan |

`has_guidance` se devuelve siempre porque la pantalla necesita saber que la
sección **tiene** guía para poder ofrecer el aviso de Demo — exactamente como
antes. El aviso lo compone la aplicación y **no se guarda en la base**, igual
que hasta hoy.

No se introdujo ningún estado comercial nuevo. Siguen siendo Demo, Full y
Extra.

**Consecuencia asumida:** cuando exista Document Intelligence, tampoco podrá
usar esta guía en Demo. Es una decisión comercial que se tomará después; este
sprint no inventa una alternativa genérica.

---

## J · Quality, sin inventar 250 textos

El alcance **`section_role`** resuelve guía por el **papel** de la sección
—`objetivo`, `alcance`, `responsables`— dentro de un módulo, sin exigir que el
documento nazca de una estructura.

Es lo que permitirá dar guía a los documentos a medida de Quality **sin
duplicar el motor** y sin convertirlos en plantillas, que no es lo que son.

Hoy **no hay ninguna guía de papel escrita**, y está bien: el encargo pedía
dejar la infraestructura preparada, no inventar textos. `module_key` admite
`quality` desde el primer día; el día que alguien escriba esas guías, entran
por la misma puerta.

---

## K · Seguridad

**Se cerró un hueco real que ya existía.** Hasta hoy la protección de Demo era
de aplicación: la página no serializaba el texto. Pero
`trazadoc_blueprint_sections` era legible con la sesión de cualquier miembro,
así que un usuario en Demo podía pedir la fila **por identificador, desde el
navegador**, y obtener lo que la pantalla le negaba.

Ahora:

* las dos tablas nuevas **no son legibles** para los miembros — la política de
  lectura es de plataforma;
* el contenido sale por una función `security definer` que comprueba el plan
  con `resolve_organization_module_access`, la fuente de verdad que ya existía;
* fail-closed: sin pertenencia a la empresa, excepción; sin acceso resoluble,
  se trata como Demo;
* `revoke all` antes de conceder, nada para `anon`;
* toda función definer fija `search_path`;
* sin `service_role` en tiempo de ejecución.

Comprobado por ataque, no por lectura: la prueba `D4` intenta las tres tablas
por identificador directo, `D5` cambia de módulo en la petición, `D6` manda
peticiones malformadas incluyendo una con SQL dentro, `D7` prueba desde otra
empresa y `D8` desde el anónimo.

---

## L · Archivos

```
supabase/migrations/0136_trazadoc_canonical_authoring_guidance.sql   nuevo
lib/db/authoring-guidance.ts                                         nuevo
lib/db/hint-access.ts                                                RETIRADO
lib/db/trazadocs.ts                       deja de leer la columna congelada
lib/db/trazadocs-platform.ts              publica revisiones; lee la vigente
lib/domain/trazadocs.ts                   BlueprintSectionFacts sin `hint`
components/domain/trazadocs/blueprint-detail-editor.tsx   etiqueta y aviso
app/(app)/(shell)/(cpr)/trazadocs/[id]/edit/page.tsx      resolver canónico
app/(app)/(shell)/textiles/trazadocs/[documentId]/page.tsx resolver canónico
tests/unit/quality-12-2a-authoring-guidance.test.ts       nuevo · 30
tests/rls/quality-12-2a-guidance.test.ts                  nuevo · 24
```

Suites ajustadas por el cambio: `hint-demo-access`, `t9g-hint-parity`,
`trazadocs`, `quality-12-1-openai`, más los listados de migraciones
autorizadas.

---

## M · Migración

`0136`, append-only. **No se tocó ninguna anterior** — comprobado por la prueba
`G2` sobre 0132–0135, 0043, 0044 y 0082.

`hint` no se borra: se **congela**. Un trigger impide que cambie, y un
comentario en la columna dice que está obsoleta y no debe leerse. Se conserva
el texto como residuo histórico y como red de seguridad del traslado; lo que se
le quita es la capacidad de divergir en silencio, que es lo que el encargo
prohíbe.

---

## N · Pruebas

Detalle en `QUALITY_12_2A_TEST_MATRIX.md`.

| Suite | Resultado |
|---|---|
| `test:quality122a` (estática) | **30 ✔ · 0 ✘** |
| `test:quality122a-rls` (base real) | **24 ✔ · 0 ✘** |
| `test:trazadocs` · `test:hint-demo-access` · `test:t9g-parity` | verde |
| `test:textiles-trazadocs` · `test:trazadocs-section-hardening` | verde |
| `npm run test:all` | **EXIT 0** |

Réplica limpia 0001…0136 desde cero, con las suites repetidas contra esa base
recién construida.

---

## O · Lo que este sprint NO hizo

No se conectó ningún proveedor de IA. No se implementó Quick Edit. No se
renombró Copilot. No se creó ninguna guía para Quality. No se tocó Production.
No se creó Preview — ver la nota de despliegue en la matriz de pruebas.
