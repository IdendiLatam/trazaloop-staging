# QUALITY-12.2 · Trazaloop Intelligence & Intelligent Document Authoring
# FASE 0 · Diagnóstico del repositorio

**Baseline** `ada4a3b` · Local 0135 · Staging 0135 · Production 0111
**Alcance de esta fase** inspección, análisis y plan. **Sin implementar.**
No se tocó ninguna migración, ningún entorno y no se llamó al proveedor.

---

## Resumen en una página

La buena noticia es grande: **la fuente canónica de guía de autoría ya existe y
ya es transversal**. `trazadoc_blueprint_sections` tiene hoy
`section_key`, `title`, `description`, `hint`, `is_required` y cuelga de un
blueprint que declara `module_key`. Son **250 secciones con hint en 23
estructuras** de CPR y Textiles, y el botón «i» que las muestra es **un solo
componente compartido** por los dos módulos.

La segunda buena noticia: **`lib/ai` no depende de Quality**. Su único import
del proyecto es `@/lib/supabase/server`. Lo que ata el Copilot a Quality son
las puertas —`requireQualityForAction`, `quality_ai_settings`— y los
adaptadores, no la arquitectura.

Los tres problemas reales que este diagnóstico encuentra:

1. **El coste fijo de una llamada del Copilot es de ~1 660 tokens antes de un
   solo byte de contenido** (política 846 + esquema 742 + tarea ~76). Medido.
   Para editar un párrafo eso es inaceptable, y no se arregla recortando el
   contexto: hay que cambiar la política y el esquema.
2. **Quality no tiene blueprints.** Sus documentos son «custom» y el editor
   compartido recibe `hint={null}`. La semilla de guía cubre CPR y Textiles;
   Quality tendría que construirla.
3. **La guía no está versionada.** `updateBlueprintSection` sobrescribe en
   sitio: no hay versión, ni historia, ni forma de saber con qué guía se
   redactó un documento de hace un año.

**Veredicto:** `READY FOR QUALITY-12.2 IMPLEMENTATION`, con la fase A dedicada
a cerrar el versionado de la guía antes de conectar nada al modelo.

---

# A · Mapa actual de documentos

## A.1 · Un solo motor de datos, tres experiencias

Los tres módulos escriben sobre **las mismas dos tablas**:

```
trazadoc_documents          id, organization_id, blueprint_id, source_type, code,
                            title, status, module_key, revision_model,
                            current_version, current_revision_id, category_code, …
trazadoc_document_sections  id, organization_id, document_id,
                            blueprint_section_id,  ← el vínculo con la guía
                            section_key, title, content, sort_order, is_required
```

Pero con **tres juegos de acciones** y **dos modelos de revisión**:

| Módulo | Acciones | `revision_model` | Versionado | Editor |
|---|---|---|---|---|
| **CPR** | `server/actions/trazadocs.ts` | `legacy` | `trazadoc_document_versions` (instantánea) | `SectionEditor` |
| **Textiles** | `server/actions/textiles-trazadocs.ts` | `legacy` | `trazadoc_document_versions` | `TextileTrazadocEditor` (usa `SectionHint`) |
| **Quality** | `server/actions/quality-documents.ts` | `controlled` | `trazadoc_document_revisions` (flujo con revisores y aprobadores, QUALITY-02) | `SectionEditor` con `hint={null}` |

**Respuesta a §5: sí, PCR y Textiles usan TrazaDocs de verdad.** No hay
documentos heredados en tablas separadas. Lo que sí hay es un cuarto tipo
—`trazadoc_file_documents`— para documentos **subidos como archivo**, sin
secciones: quedan **fuera del alcance** de la autoría inteligente porque no hay
texto que mejorar.

## A.2 · Lo que cada capa aporta

| Eje | Dónde vive |
|---|---|
| Identidad | `trazadoc_documents.id` + `code` único por empresa |
| Revisión | `trazadoc_document_revisions` (controlled) · `trazadoc_document_versions` (legacy) |
| Contenido | `trazadoc_document_sections.content` (texto plano) |
| Sección | `section_key` + `title` + `sort_order` + `is_required` |
| Guardado | acción de servidor, campos `section:<id>`, **guardado en bloque, sin autosave** |
| Borrador | `status = draft` · `in_review` |
| Aprobación | `trazadoc_record_document_decision` (Quality) · `approveDocumentAction` (CPR/Textiles) |
| Verdad histórica | `content_snapshot` congelado al aprobar, fila inmutable |
| Exportación | rutas `/print` y `/pdf`; `lib/export/inventory.ts` clases A/B/C |
| Permisos | `canEditDocument(role, status)`: solo `draft`/`in_review`, roles admin·quality·consultant |

**El editor no tiene autosave.** Se escribe y se pulsa guardar. Eso simplifica
mucho la fase A: una propuesta de Intelligence puede sustituir el valor del
`textarea` sin pelearse con un guardado automático.

---

# B · Mapa actual de las ayudas «i»

## B.1 · Un solo mecanismo, no cuatro

| Pieza | Archivo | Qué hace |
|---|---|---|
| Botón «i» | `components/ui/section-hint.tsx` | **compartido** CPR + Textiles; accesible, `type="button"`, Escape, `aria-expanded` |
| Render seguro | `components/ui/hint-text.tsx` | texto plano → nodos React; nunca HTML |
| Enlaces | `lib/domain/hint-links.ts` | parser propio; solo `https` externos y rutas internas |
| Autorización comercial | `lib/domain/hint-access.ts` + `lib/db/hint-access.ts` | **en Demo el contenido no sale del servidor**: llega solo el aviso fijo |
| Almacén | `trazadoc_blueprint_sections.hint` | administrado por el superadministrador |
| Backoffice | `lib/db/trazadocs-platform.ts` → `/platform/trazadocs` | alta, edición, orden, activación |

**No hay hints hardcodeados en componentes.** No hay `tooltip` ni `helperText`
como sistema paralelo: el único `title=` es el del propio botón. Lo que sí hay
—y **no** debe pasar por aquí, y así está escrito en el propio módulo— son los
mensajes de validación, errores y avisos legales.

## B.2 · El inventario

**23 blueprints · 250 secciones · 250 con hint (100 %) · 0 con `description`.**

| Módulo | Blueprints | Secciones |
|---|---|---|
| `cpr` | 11 | 110 |
| `textiles` | 12 | 140 |
| `quality` | **0** | **0** |

Longitud del hint: **media 97 caracteres**, mínimo 41, máximo 221, total
**24 158 caracteres**. Son frases, no manuales — y eso es exactamente lo que
hace viable meterlas en una llamada barata: **≈ 27 tokens de media**.

Ejemplos reales:

> `objetivo` · *«Describe para qué existe este procedimiento y qué busca
> controlar en el cálculo de contenido reciclado.»*
> `responsables` · *«Indica quién prepara la orden, quién registra los consumos
> y quién identifica el lote producido.»*
> `alcance` · *«Delimita productos, referencias, plantas, procesos propios y
> tercerizados cubiertos por el sistema.»*

Son **instrucciones de redacción**, no afirmaciones sobre la empresa. Es
justamente la materia prima que §1 pide.

## B.3 · Qué contienen y qué no

| | Secciones |
|---|---|
| Mencionan una norma ISO (22095, 14021, …) | **15** |
| Mencionan GRS o RCS | 5 |
| Mencionan OEKO-TEX, GOTS u OCS | 6 |
| **Aclaran que citar no es certificar** | 4 |
| Traen un ejemplo explícito | 6 |
| Traen enlaces | 0 |

Sobre §17: los hints **ya son prudentes** donde importa. Textual:

> *«Los esquemas citados son referencias, no promesas de obtención de sellos.»*
> *«La aceptación interna de una evidencia no equivale a certificación
> externa.»*

Pero solo 4 de las 26 secciones que citan un esquema lo aclaran. **Riesgo R-3**
abajo.

---

# C · Inventario de componentes reutilizables

| Componente | Reutilizable | Nota |
|---|---|---|
| `SectionHint` · `HintText` · `parseHintText` | **sí, tal cual** | ya compartidos |
| `resolveHintForViewer` / `resolveModuleHintsForOrg` | **sí** | la puerta comercial ya está resuelta por módulo |
| `SectionEditor` | **sí** | ya lo usan CPR y Quality |
| `lib/ai/provider.ts` + `providers/*` | **sí, sin cambios** | contrato de tres adaptadores, ya probado en vivo |
| `lib/ai/config.ts` | **sí** | proveedor, modelo, esfuerzo, topes, credencial en un solo sitio |
| `lib/ai/schemas.ts` · `validateAnswer` | **parcial** | el esquema es del Copilot; hace falta uno pequeño |
| `lib/ai/prompts.ts` · `POLITICA_COMUN` | **parcial** | 846 tokens; hace falta una política documental corta |
| `lib/ai/context/builder.ts` | **sí como patrón** | acumulador, presupuesto, citas, lectura concurrente |
| `lib/ai/context/adapters.ts` | **solo para revisión contextual** | 19 adaptadores, todos de Quality |
| `lib/ai/copilot.ts` (orquestador) | **sí como patrón** | permiso → contexto → referencias → llamada → validación → cierre |
| `quality_ai_runs` / `_references` / `_suggestions` | **sí** | `use_case` es texto libre: admite `document.quick_edit` sin migración |

---

# D · Duplicaciones detectadas

| # | Qué | Gravedad |
|---|---|---|
| D-1 | **Tres juegos de acciones** para editar secciones del mismo par de tablas (`updateDocumentSectionsAction`, `updateTextileTrazadocSectionsAction`, `updateQualityDocumentSectionAction`) | media · triplica el punto donde enganchar Intelligence |
| D-2 | **Dos modelos de revisión** conviviendo (`legacy` con instantáneas, `controlled` con flujo) | conocida y deliberada (0116); afecta a dónde se escribe una propuesta aceptada |
| D-3 | **Dos editores** (`SectionEditor` y `TextileTrazadocEditor`) que hacen lo mismo | baja · el segundo añade transiciones de estado |
| D-4 | `description` existe en la tabla y **está vacío en las 250 filas** | baja · hueco ya disponible para `purpose` |

**No hay duplicación de guía.** Es el hallazgo importante: hoy existe **una**
fuente de hints y **un** consumidor. La estructura que §3 pide dibujar ya está
medio construida.

---

# E · Identidad de sección

## E.1 · Lo que ya existe

`section_key` es **`not null`** en las dos tablas, con unicidad
`(blueprint_id, section_key)` y `(document_id, section_key)`. **No depende del
título visible.**

Reutilización real entre estructuras:

| `section_key` | Veces | Módulos |
|---|---|---|
| `objetivo` | 23 | cpr + textiles |
| `alcance` | 20 | cpr + textiles |
| `control_cambios` | 11 | cpr |
| `referencias_tecnicas` | 10 | textiles |
| `responsables` | 8 | cpr |
| `definiciones` | 3 | cpr + textiles |

**`objetivo` y `alcance` ya son transversales de hecho**, sin que nadie lo haya
declarado.

## E.2 · Lo que falta, y la propuesta (sin implementar)

El problema: `objetivo` en el procedimiento de producción de CPR y `objetivo`
en el manual textil comparten clave pero **tienen hints distintos**, y deben
tenerlos. La clave identifica el **rol de la sección**, no la guía.

Propuesta de identidad en tres niveles, ninguno nuevo en la base:

```
module_key      cpr | textiles | quality        ← ya está en el blueprint
blueprint code  procedimiento_produccion        ← ya está
section_key     objetivo                        ← ya está
```

La terna `(module_key, blueprint_code, section_key)` **ya identifica hoy**, de
forma estable y sin depender de traducciones, cualquier sección plantilla. Para
Quality, cuyos documentos son custom, la terna degrada a
`(quality, —, section_key)` y la guía tendría que resolverse por
`section_key` + `category_code` del documento.

**Recomendación:** no inventar un identificador nuevo. Declarar la terna como
contrato, y añadir un **catálogo de roles de sección** —`objetivo`, `alcance`,
`responsables`, `definiciones`, …— que permita una guía *genérica* de respaldo
cuando no haya una específica.

---

# F · Perfil de organización

## F.1 · Lo que hay hoy

`organizations` almacena: `name`, `legal_name`, `tax_id`, `country`, `city`,
`address`, `phone`, `contact_email`, `website`, `logo_*`.

`create_organization(p_name, p_tax_id, p_country)` — tres argumentos. El alta
desde backoffice recoge además razón social, correo y ciudad. Los ajustes de
empresa (`/settings/company`) permiten editar todo lo anterior.

## F.2 · Lo que NO hay

**Nada de lo que Intelligence necesitaría para redactar en el lenguaje de la
empresa**: ni sector, ni actividad, ni productos, ni descripción, ni tipo de
cliente, ni normas adoptadas, ni terminología propia.

Los procesos sí existen (`quality_processes`) pero **solo en Quality**, y son
demasiado voluminosos para un perfil compacto.

## F.3 · Propuesta de perfil mínimo (sin implementar)

Cinco campos, ninguno obligatorio salvo el que ya lo es:

| Campo | Obligatorio | Para qué lo usa Intelligence |
|---|---|---|
| `name` | **sí** (ya existe) | nombrar la empresa |
| `sector` | no · lista cerrada corta | registro y vocabulario |
| `main_activity` | no · una línea | «qué hace esta empresa» |
| `main_products` | no · una línea | nombrar bien los productos |
| `short_description` | no · ≤ 300 caracteres | el resto del contexto |

**≈ 60–90 tokens** en total. Ése es todo el «nivel 3» de la arquitectura de
contexto.

Distinción que el encargo pide y que conviene respetar: **mínimos
obligatorios** = los de hoy (nombre); **perfil enriquecible** = estos cuatro,
editables en `/settings/company`, con un aviso claro de que mejoran la
redacción asistida y no son un requisito. El registro no se alarga.

**Regla dura:** el perfil es **contexto de estilo**, no evidencia. Que el perfil
diga «fabricante de envases» no autoriza a afirmar nada sobre los procesos de
la empresa.

---

# G · Arquitectura de IA actual · qué se reutiliza

## G.1 · Lo que ya está resuelto y probado en vivo

`lib/ai` **no importa nada de Quality**: su único import interno es
`@/lib/supabase/server`. Verificado con `grep` sobre los once archivos.

| Garantía (QUALITY-12/12.1) | Reutilizable en 12.2 |
|---|---|
| el proveedor **nunca** toca la base | **sí, por construcción** |
| el servidor construye el contexto con la **sesión de quien pregunta** | **sí** |
| RLS respetada, sin `service_role`, sin `security definer` genérico | **sí** |
| sin cruce entre empresas | **sí** |
| ninguna decisión formal de negocio | **sí** — la política lo enumera |
| ninguna aprobación automática | **sí** |
| sin herramientas del proveedor, sin búsqueda web, sin ficheros alojados | **sí** |
| salida estructurada estricta + validación propia | **sí** |
| `store: false` | **sí** |
| credencial en un solo sitio, nunca al navegador ni al registro | **sí** |
| consumo real medido: entrada, caché, salida, razonamiento, total | **sí** |
| `provider_called`: se distingue lo que se llamó de lo que no | **sí** |

## G.2 · Lo que ata el Copilot a Quality, y hay que soltar

| Atadura | Dónde | Qué hacer |
|---|---|---|
| puerta de módulo | `requireQualityForAction()` en `server/actions/quality-ai.ts` | la autoría necesita la puerta del módulo **del documento** |
| interruptor por empresa | `quality_ai_settings` (sin dimensión de módulo) | decidir si la autoría vive bajo el mismo interruptor o bajo uno por módulo |
| ubicación de la interfaz | `app/(app)/(shell)/quality/copilot` | la autoría se invoca **desde el editor**, no desde una página |
| adaptadores | los 19 son de Quality | solo hacen falta en **revisión contextual** |

---

# H · Riesgos

| # | Riesgo | Impacto | Mitigación propuesta |
|---|---|---|---|
| **R-1** | **Coste**: la política y el esquema del Copilot suman ~1 588 tokens fijos. Reutilizarlos para editar un párrafo haría que cada mejora costara como una consulta completa | alto | política documental corta + esquema pequeño (§K) |
| **R-2** | **Confusión guía ↔ hecho**: «Indique el responsable» acabando como «El responsable es…» | **muy alto** | bloques separados y etiquetados en el prompt; prueba adversarial obligatoria (§O) |
| **R-3** | **Conformidad**: 26 secciones citan esquemas normativos y solo 4 aclaran que citar no es certificar | alto | prohibición explícita en la política; barrido de los 250 hints en la fase A |
| **R-4** | **Guía sin versión**: el hint se sobrescribe en sitio | medio | versionar en la fase A, antes de conectar el modelo |
| **R-5** | **Escritura formal**: una propuesta aceptada tocando una revisión aprobada | **muy alto** | la propuesta solo puede escribir en el `textarea` del borrador; nunca una acción de servidor de aprobación |
| **R-6** | **Quality sin guía**: 0 blueprints | medio | guía por rol de sección como respaldo (§E.2) |
| **R-7** | **Tres juegos de acciones** (D-1) | medio | un único punto de entrada de autoría, invocado por los tres editores |
| **R-8** | **Fuga entre empresas por el perfil** | alto | el perfil se lee con la sesión, como cualquier otra fuente |
| **R-9** | **Ruido de citas** en una mejora de redacción | bajo | política de procedencia diferenciada (§L) |

---

# I · Propuesta · Canonical Authoring Guidance

## I.1 · Tabla, no código

`trazadoc_blueprint_sections` **ya es** el registro canónico: está en la base,
lo administra el superadministrador sin desplegar, tiene identidad estable y
está autorizado por módulo. Moverlo a código sería perder las cuatro cosas.

## I.2 · Lo que le falta

| Campo propuesto | Por qué | ¿Existe? |
|---|---|---|
| `purpose` | qué pretende la sección, para la instrucción | **`description`, vacío en las 250** |
| `guidance` | la instrucción de redacción | **`hint`** |
| `example` | un ejemplo corto, marcado como ejemplo | no |
| `do_not_invent` | qué **no** puede rellenar el modelo | no |
| `related_context_types` | qué fuentes pediría una revisión contextual | no |
| `version` + historia | con qué guía se redactó algo | **no · R-4** |
| `active` | ya existe como `status` | **sí** |

## I.3 · Forma propuesta (sin implementar)

Dos movimientos, ambos aditivos:

1. **Enriquecer** `trazadoc_blueprint_sections` con `purpose`, `example`,
   `do_not_invent`, `related_context_types` y `guidance_version`, y **poblar
   `description`**, que hoy está desperdiciado.
2. **Historiar**: una tabla anexa `trazadoc_blueprint_section_guidance_versions`
   que conserve cada texto con su versión, igual que `quality_ai_runs` conserva
   con qué instrucciones se respondió.

Un único consumidor lógico —`resolveAuthoringGuidance(section)`— que sirva **al
botón «i» y a Intelligence**, con el mismo control comercial que hoy. Ni un
texto duplicado.

---

# J · Propuesta · Document Authoring Intelligence

## J.1 · Los dos modos (§10)

| | **QUICK EDIT** | **CONTEXTUAL REVIEW** |
|---|---|---|
| Para | mejorar, aclarar, tecnificar, sintetizar | consistencia, contradicciones, responsabilidades, completar con datos |
| Contexto | niveles 0–3 | 0–4 |
| Adaptadores | **ninguno** | los que la sección declare |
| Coste estimado | **≈ 650–850 tokens** | ≈ 1 500–2 500 |
| Citas | procedencia técnica, sin lista visible | **lista visible obligatoria** |
| `use_case` | `document.quick_edit` | `document.contextual_review` |

Encaja con la arquitectura de QUALITY-12 sin forzarla: el orquestador ya
distingue caso de uso, plantilla y ámbito temporal; lo que cambia es **cuánto
contexto se construye**, que ya es un parámetro.

## J.2 · Las cuatro clases de contenido (§7)

El paquete de contexto de hoy tiene dos cajones —hechos calculados y notas del
tenant—. La autoría necesita **cuatro**, etiquetados y separados en el prompt:

```
A · USER_TEXT              lo que la persona escribió · es lo que se mejora
B · AUTHORING_GUIDANCE     guía editorial de Trazaloop · NO es evidencia
C · ORGANIZATION_CONTEXT   hechos autorizados · SÍ es evidencia
D · RELATED_SYSTEM_CONTEXT proceso, cargo, riesgo, control, indicador
```

La regla que la política tendrá que decir con estas palabras:

> **La guía de autoría describe QUÉ debería contener la sección. No afirma nada
> sobre esta empresa.** Si la guía dice «indique el responsable» y el contexto
> autorizado no dice quién es, la respuesta señala que falta ese dato. Nunca lo
> rellena.

## J.3 · Lo que no puede inventar

Procesos, cargos, responsables, frecuencias, controles, riesgos, criterios,
normas, métodos, productos, clientes y cualquier hecho de la organización. Es
la lista del encargo y se convierte en texto de la política y en pruebas.

---

# K · Propuesta · arquitectura de presupuesto de tokens

## K.1 · Lo medido, no lo supuesto

| Pieza | Caracteres | ≈ Tokens |
|---|---|---|
| `POLITICA_COMUN` | 3 047 | **846** |
| `copilot.ask` (tarea) | 275 | 76 |
| `copilot.customer_themes` | 1 080 | 300 |
| `ANSWER_SCHEMA` | 2 670 | **742** |
| **Coste fijo de una consulta `ask`** | — | **≈ 1 664** |

Y lo realmente facturado en la validación de QUALITY-12.1, con 16–17 fuentes:

```
entrada 2 514 – 2 886 · caché hasta 2 304 · salida 250 – 967 · razonamiento 16 – 186
```

**El contexto de negocio es menos de la mitad del coste.** Recortar fuentes sin
tocar política y esquema no resolvería nada: ése es el hallazgo central de §13.

## K.2 · Contexto progresivo

| Nivel | Contenido | ≈ Tokens |
|---|---|---|
| **0** | texto seleccionado / sección | 150 – 300 |
| **1** | documento y sección: título, tipo, clave, obligatoria | 25 – 40 |
| **2** | guía de autoría de esa sección | **27** (media real) |
| **3** | perfil compacto de la empresa | 60 – 90 |
| **4** | contexto relacionado, **solo si la sección lo declara** | 200 – 900 |

Más una política documental corta (objetivo ≈ 250) y un esquema pequeño
(objetivo ≈ 130).

```
QUICK EDIT          ≈ 250 + 130 + 300 + 40 + 27 + 90   ≈  840 tokens
copilot.ask actual                                     ≈ 2 700 tokens
```

**Aproximadamente un tercio.** Y con el prefijo estable —política y esquema
idénticos entre llamadas— el proveedor lo sirve desde caché: en la validación,
2 304 de 2 519 tokens de entrada vinieron cacheados a partir de la segunda
consulta. Ordenar el prompt con lo estable delante y lo variable detrás **no es
un detalle de estilo: es la diferencia de precio**.

## K.3 · Lo que NO se carga para mejorar un párrafo

Voz del cliente, auditorías, acciones, riesgos, proveedores, indicadores,
señales, revisión por la dirección, competencias. **Ninguno.** Nivel 4 solo se
activa en revisión contextual y **solo con las fuentes que la sección declare**
en `related_context_types`.

---

# L · UX propuesta

## L.1 · Dónde se engancha

En `SectionEditor` —que ya usan CPR y Quality— y en `TextileTrazadocEditor`,
junto al botón «i» que ya está ahí. La misma sección que ofrece «qué escribir»
pasa a ofrecer «mejorar lo escrito».

## L.2 · El flujo

```
texto actual
  → [ Mejorar con Intelligence ]        (deshabilitado si el texto está vacío)
  → propuesta, en comparación lado a lado
  → [ Reemplazar ]  [ Insertar como alternativa ]  [ Otra redacción ]  [ Descartar ]
```

**«Reemplazar» escribe en el `textarea` del borrador abierto y en ningún otro
sitio.** No llama a la acción de guardado, no toca `content`, no toca una
revisión aprobada ni un estado de aprobación. La persona sigue teniendo que
guardar, y guardar sigue exigiendo `draft`/`in_review` y su rol. Que el editor
no tenga autosave hace esto **estructuralmente fácil**, no una promesa.

## L.3 · Nombre

| Antes | Después |
|---|---|
| Copilot | **Trazaloop Intelligence** |
| menú «Copilot» | **Intelligence** |
| «Explicar con Copilot» | «Explicar con Intelligence» |
| «Hipótesis con Copilot» | «Analizar con Intelligence» |

Superficie medida: **13 archivos de interfaz** con 52 apariciones visibles, más
`lib/domain/quality-ai.ts` (textos de producto), `lib/modules/registry.ts`
(menú) y `lib/export/inventory.ts` (nombre de la entidad exportable).
**22 archivos de prueba** fijan la palabra y habrá que actualizarlos.

**No se renombra** `quality_ai_*`, `QualityAiProvider`, `QUALITY_AI_*` ni las
rutas de base de datos. Es identidad de producto, no de esquema.

---

# M · Modelo de permisos y seguridad

| Control | Cómo se hereda |
|---|---|
| puerta de módulo | la del **documento** (`module_key`), no la de Quality |
| acceso comercial a la guía | `resolveHintForViewer` — **en Demo la guía no sale del servidor** |
| edición | `canEditDocument(role, status)` sin cambios |
| RLS | el contexto se construye con la sesión de quien edita |
| aislamiento | acotado por `organization_id`, como hoy |
| credencial | `lib/ai/config.ts`, servidor, nunca al navegador |
| proveedor | sin herramientas, sin búsqueda, `store: false` |
| registro | `quality_ai_runs` con `provider_called` y consumo real |
| decisiones formales | prohibidas en la política y comprobadas por pruebas adversariales |

**Pregunta abierta que la fase A debe resolver:** en Demo la guía no se
entrega. ¿Debe entonces Intelligence estar disponible en Demo **sin** guía, o no
estar disponible? Recomendación: **no ofrecerla**, para no dar una versión
degradada que parezca la buena.

---

# N · Impacto probable de migración

Todo aditivo, sobre la cabecera **0135**.

| Migración probable | Qué traería | Fase |
|---|---|---|
| `0136` | guía canónica: `purpose`, `example`, `do_not_invent`, `related_context_types`, `guidance_version` + tabla de historia | A |
| `0137` | perfil de empresa: `sector`, `main_activity`, `main_products`, `short_description` | B |
| `0138` | autoría: `quality_ai_runs.document_id` / `section_id` opcionales, y cuotas por caso de uso si se confirman | C |

`use_case` es **texto libre** en la base: `document.quick_edit` y
`document.contextual_review` **no requieren migración** para empezar a
registrarse. Los topes de hoy (`monthly_run_limit`, `daily_user_limit`) son
globales; separar cuotas por caso de uso **sí** la requeriría.

Ninguna toca 0132–0135. Production sigue en 0111.

---

# O · Pruebas necesarias

## O.1 · Estáticas

* la guía tiene **una sola** fuente: ningún hint hardcodeado en componentes;
* el botón «i» e Intelligence leen **el mismo** registro;
* la política documental **no** arrastra `POLITICA_COMUN` entera;
* el esquema de autoría **no** es `ANSWER_SCHEMA`;
* quick edit **no** registra ningún adaptador de contexto;
* sin herramientas del proveedor, `store: false`, sin `temperature`;
* «Reemplazar» **no** invoca ninguna acción de aprobación ni de guardado.

## O.2 · Contra base real, con sesión real

* la guía de una sección llega al contexto **etiquetada como guía**;
* con la guía diciendo «indique el responsable» y sin dato autorizado, la
  respuesta **señala que falta** y no nombra a nadie — **la prueba central**;
* una empresa no ve la guía de otra, ni su perfil;
* en Demo no llega ni una palabra de la guía;
* la propuesta **no** cambia `content`, ni la revisión, ni el estado;
* un documento aprobado no se puede alterar por esta vía;
* el consumo queda registrado con su caso de uso;
* **el coste de un quick edit es inferior a un tercio de un `copilot.ask`**,
  medido sobre el registro y no estimado.

## O.3 · Adversariales

* texto de sección con órdenes dentro → no obedecidas;
* pedirle que declare conformidad con una norma → se niega;
* pedirle que invente un responsable, una frecuencia o un control → se niega;
* pedirle que apruebe el documento → se niega.

---

# P · Hoja de ruta recomendada

| Fase | Qué | Migración | Depende de |
|---|---|---|---|
| **12.2A** · Guía canónica ✅ **HECHA** | enriquecer y **versionar** la guía; poblar `description`; revisar los 250 hints por lenguaje de conformidad (R-3); un único `resolveAuthoringGuidance` para botón «i» e Intelligence | `0136` | — |
| **12.2B** · Perfil e identidad ✅ **HECHA** | los cuatro campos de perfil; catálogo de roles de sección; guía de respaldo para Quality | `0137` | A |
| **12.2C** · Quick Edit | política documental corta, esquema pequeño, orquestador de autoría, un solo punto de entrada, botón en los editores, comparación y reemplazo en borrador | ninguna | A, B |
| **12.2D** · Revisión contextual | nivel 4 dirigido por `related_context_types`, citas visibles, reutilización de los adaptadores de Quality | ninguna | C |
| **12.2E** · Renombrado | Copilot → Trazaloop Intelligence en interfaz, menú, textos de producto e inventario de exportación; sin tocar `quality_ai_*` | ninguna | independiente |
| **12.2F** · Consumo y cuotas | separar el consumo por caso de uso; cuotas diferenciadas si se confirman | `0138` | C |

**12.2E puede ir primero**: no depende de nada y es el microcierre visual que ya
estaba previsto.

---

# CONCLUSIÓN

## `READY FOR QUALITY-12.2 IMPLEMENTATION`

> **Nota posterior · QUALITY-12.2A y 12.2B están hechas.**
> 12.2A cerró las tres condiciones de abajo; 12.2B añadió el perfil de empresa
> y la guía de autoría de Quality. Ver `QUALITY_12_2B_IMPLEMENTATION.md`.
>
> **QUALITY-12.2A cerró las tres condiciones de abajo.**
> La guía está versionada, los 250 textos revisados y la puerta de Demo
> decidida y reforzada. El detalle está en `QUALITY_12_2A_IMPLEMENTATION.md` y
> en `QUALITY_12_2A_GUIDANCE_NORMATIVE_REVIEW.md`. Lo que sigue es el
> diagnóstico tal como se escribió, sin retocar.

Con tres condiciones que la fase A debe cumplir **antes** de conectar el
modelo a un editor:

1. **Versionar la guía** (R-4). Sin versión no se puede explicar con qué guía se
   redactó un documento, y ése es el estándar que QUALITY-12 ya fijó para las
   instrucciones del modelo.
2. **Revisar los 250 hints** buscando lenguaje que pueda leerse como afirmación
   de conformidad (R-3). Son 24 158 caracteres: es una tarde de trabajo, no un
   proyecto.
3. **Decidir la puerta comercial**: si Intelligence se ofrece en Demo sin guía,
   o no se ofrece.

Ninguna de las tres es un impedimento arquitectónico. Las dos piezas difíciles
—una fuente canónica de guía compartida y una capa de IA que no depende de
Quality— **ya existen en el repositorio**.

## Lo que este diagnóstico NO hizo

No se implementó nada, no se creó ninguna migración, no se tocó Staging ni
Production, no se desplegó y no se llamó al proveedor. Los números de tokens
salen de medir los archivos del repositorio y de leer el consumo ya registrado
en Staging por QUALITY-12.1, no de una estimación.
