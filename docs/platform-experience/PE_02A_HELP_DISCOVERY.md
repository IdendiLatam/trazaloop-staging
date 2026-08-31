# PE-02A · Ayuda, FAQ y autoservicio · Descubrimiento

**Sprint:** PE-02A — Help, FAQ & Self-Service · descubrimiento y arquitectura
**Naturaleza:** sin código, sin migración, sin despliegue
**Cabeceras:** Local 0154 · Staging 0154 · Production 0111
**Base:** PE-01B `e3cf2d7`

Este documento dice **qué hay**, no qué debería haber. Lo segundo está en
[PE_02A_FAQ_ARCHITECTURE.md](./PE_02A_FAQ_ARCHITECTURE.md) y
[PE_02A_CONTEXTUAL_HELP_ARCHITECTURE.md](./PE_02A_CONTEXTUAL_HELP_ARCHITECTURE.md).

---

## 1 · El hallazgo que cambia el sprint

**El motor de contenido administrado, versionado y con vigencia ya existe.** Lo
construyó QUALITY-12.2A en la migración `0136` para la guía de autoría de
TrazaDocs, y tiene exactamente la forma que PE-02 necesita:

| Pieza | Dónde | Qué hace |
|---|---|---|
| `trazadoc_authoring_guidance` | 0136 §1 | **Identidad** estable: `(module_key, blueprint_code, section_key)`. No cambia nunca. |
| `trazadoc_authoring_guidance_revisions` | 0136 §2 | **Texto inmutable** con `effective_from`/`effective_to`, una sola revisión abierta, `content_hash`, `change_note`, `created_by` |
| `trazadoc_publish_guidance(...)` | 0136 §3 | Publicar = **crear revisión y cerrar la anterior**. Solo `is_platform_superadmin()` |
| `trazadoc_guidance_as_of(...)` | 0136 §5 | Lectura `security definer` que aplica la regla de visibilidad **dentro de la base** |
| Disparador de inmutabilidad | 0136 | Una revisión publicada no se edita ni se borra: solo se sucede |

Y sus campos de contenido son, literalmente, el contrato que §12 del encargo
pide diseñar: `guidance`, `purpose`, `example`, `do_not_invent`,
`related_context_types`, `normative_class`.

**Consecuencia para PE-02:** no hay que diseñar un motor de contenido. Hay que
decidir si la FAQ **reutiliza el patrón** (tablas propias, misma forma) o
**reutiliza las tablas** (una tabla genérica para todo). La recomendación está
en la arquitectura; el descubrimiento solo constata que el precedente existe,
está probado y está en producción de Staging desde 0136.

---

## 2 · Ayuda contextual · lo que hay hoy

### 2.1 · El botón «i», compartido y accesible

`components/ui/section-hint.tsx` (Sprint T9G) es **un solo componente** para
todos los módulos: `type="button"`, `aria-expanded`, `aria-label="Más
información"`, cierre con Escape, foco devuelto, panel con desplazamiento, y
**sin contenido no pinta nada** — ni botón, ni panel vacío.

El texto pasa por `HintText`, que admite saltos de línea y enlaces seguros y
**nunca interpreta HTML**.

### 2.2 · Dos orígenes de contenido, y conviene saber cuál es cuál

| Origen | Dónde | Administrable | Puerta comercial |
|---|---|---|---|
| **Administrado** | `trazadoc_authoring_guidance*` (0136), editado en `/platform/trazadocs` | **Sí**, sin desplegar | Sí: en Demo el texto **no sale de la base** (`trazadoc_guidance_as_of`) |
| **Escrito en el código** | nueve constantes `*_HELP` en `lib/domain/` | No: exige desplegar | No |

Las nueve constantes:

```
lib/domain/quality-interested-parties.ts  INTERESTED_PARTIES_HELP   (11 bloques)
lib/domain/document-control.ts            LIFECYCLE_HELP
lib/domain/work-cases.ts                  CLASSIFICATION_HELP, ACTION_KIND_HELP
lib/domain/quality-indicators.ts          OBJECTIVE_RULE_HELP, NATIVE_SOURCE_NATURE_HELP
lib/domain/output-movements.ts            MOVEMENT_KIND_HELP
lib/domain/recycled-readiness.ts          DEFENSIBILITY_HELP
lib/domain/hint-links.ts                  HINT_LINK_HELP_TEXT
```

### 2.3 · La estructura de tres partes ya está escrita, y es buena

`INTERESTED_PARTIES_HELP` usa exactamente el contrato que §12 del encargo pide
inventar:

```
QUÉ ES    · explicación simple
EJEMPLO   · un caso concreto
RESPALDO  · «ISO 9001:2015, 7.5, información documentada: …»
```

Y el respaldo está redactado como **referencia**, no como afirmación de
cumplimiento. Hay ocho referencias así en la interfaz, todas con la misma
disciplina. **PE-02 no inventa este estilo: lo formaliza.**

### 2.4 · La puerta comercial de la ayuda

`lib/domain/hint-access.ts` decide quién ve el contenido administrado:

- **Demo** → un aviso fijo, sin una palabra ni una URL del texto real.
- **Full / Extra** → el contenido.
- **Backoffice** → siempre el contenido.
- Sin modo resoluble → se trata como Demo (*fail-closed*).

El texto administrado **no viaja al navegador** cuando no corresponde: la regla
se aplica dentro de la base, no en la pantalla.

---

## 3 · FAQ · lo que hay hoy

**No hay FAQ en el producto.** Ni pública, ni autenticada, ni tabla, ni
componente, ni ruta. `grep -r "FAQ" app components lib server` no devuelve
nada.

Lo que sí hay es **contenido de FAQ escrito y sin publicar**: `docs/FAQ_PILOT.md`
— diez preguntas para las empresas piloto, en lenguaje directo, incluidas dos
que este sprint necesita:

> **8. ¿Trazaloop me certifica el contenido reciclado?** No. Trazaloop no emite
> certificaciones: organiza tu información, calcula con criterios de las normas
> técnicas y te prepara frente a auditorías…
>
> **9. ¿Pueden otras empresas ver mis datos?** No. Cada empresa solo ve lo suyo;
> el aislamiento se aplica en la base de datos misma y se prueba en cada versión.

Ese documento vive en el repositorio, **no lo ve ningún cliente**, y no se puede
editar sin desplegar. Es el problema que PE-02 resuelve.

Además hay trece guías largas en `docs/` (`SUPPORT_GUIDE`, `TRAZADOCS_GUIDE`,
`PLANS_AND_LIMITS_GUIDE`, `TEAM_MANAGEMENT_GUIDE`…) escritas para operadores,
no para clientes. Son **materia prima de FAQ**, no FAQ.

---

## 4 · El precedente de contenido público administrable

`legal_documents` (0066) es la segunda pieza que PE-02 debería copiar:

| Propiedad | Cómo está resuelto |
|---|---|
| Lectura **anónima** | política `legal_documents_select_public` · `using (status = 'active')` · roles `{anon, authenticated}` |
| Escritura | `is_platform_superadmin()`, en `INSERT` y `UPDATE` |
| Versión | columna `version` + `status` + `published_at` |
| Sin `service_role` | la página `/privacy` lee con el cliente normal |

Es **exactamente** el modelo de lectura pública segura que pide §31, ya
funcionando: el anónimo solo ve lo activo, y no ve nada más porque no hay nada
más que ver en esa tabla.

**Hueco:** `legal_documents` **no tiene pantalla de administración**. Se siembra
por migración. Nadie edita la política de privacidad sin desplegar. Es la misma
carencia que PE-02 va a resolver para la FAQ, y conviene decidir si se resuelve
también para los documentos legales o se deja escrito como deuda.

---

## 5 · Superadministrador · qué sabe hacer hoy

`app/(app)/platform/` tiene cinco superficies: portada, organizaciones (lista,
alta, detalle), TrazaDocs (estructuras y guía), soporte (tickets) e Intelligence
(consumo).

La gestión de la **guía de autoría** en `/platform/trazadocs/[id]` es la plantilla
de trabajo para la FAQ. `lib/db/trazadocs-platform.ts` ya resuelve:

```
listAllBlueprintsForPlatform      · listar
insertBlueprint / updateBlueprint · crear y editar
updateBlueprintStatus             · publicar / retirar
insertBlueprintSection            · crear elemento
reorderBlueprintSections          · ORDENAR
publishSectionGuidance            · publicar una revisión de contenido
```

Listar, crear, editar, ordenar, publicar y retirar **ya existen como patrón de
interfaz y de datos**. Faltan, para la FAQ: buscar, filtrar, destacar y vista
previa.

**Permisos:** `platform_staff` tiene dos papeles, `superadmin` y `support`
(0040). La distinción vigente en Intelligence es «support VE, superadmin
ESCRIBE» (0141 §3). La FAQ debería heredarla sin discutirla.

---

## 6 · Claves estables · qué hay y qué falta

| Espacio de claves | Dónde | ¿Estable? |
|---|---|---|
| **Módulo** | `lib/modules/catalog.ts` · `cpr` `textiles` `quality` `construccion` + `moduleCode` comercial | **Sí**, congelado en T9F y confirmado en PE-01 |
| **Superficie de shell** | `lib/modules/registry.ts` · las cuatro + `platform` (PE-01B) | Sí |
| **Sección de documento** | `section_key` en TrazaDocs, con identidad `(module_key, blueprint_code, section_key)` | Sí, desde 0136 |
| **Entidad / contexto** | `quality_ai_sources.code` — 26 filas: `quality_process`, `quality_risk`, `trazadoc_document`, `customer_comment`… con `privacy_class`, `permission_note`, `deep_link` | **Sí**, y es catálogo en base |
| **Página** | — | **NO EXISTE.** La navegación se identifica por `href` |

Esto es el hallazgo de §14: **hay tres vocabularios estables y ninguno de
páginas**. Y hay un cuarto vocabulario a mano, `quality_ai_sources.code`, que ya
describe *entidades* del producto con su clase de privacidad y su enlace
profundo — que es más de lo que una clave de página necesita.

La navegación se define por rutas literales (`/team`, `/settings/company`,
`/quality/processes`). Atar la ayuda a la URL sería frágil: PE-01B acaba de
mover una superficie entera sin cambiar ninguna promesa, y una clave basada en
URL habría roto la ayuda.

---

## 7 · Soporte · el gancho de escalación que ya existe

`support_tickets` (0060) tiene:

```
category       account | plan | trazability | evidences | trazadocs | imports
               calculation | technical_support | bug | other
related_module platform | cpr | trazadocs | diagnostic | catalog | evidences
               traceability | recycled_content | imports | implementation
               settings | team | other
```

**Ya existe la distinción que §21 pide preparar**: `bug` y `technical_support`
son técnicos; `implementation` es funcional. No hay que crear un vocabulario
nuevo — hay que decidir cuál ofrece cada plan, y eso es PE-04.

Nota: `related_module` es un **tercer** vocabulario de módulo, distinto del
catálogo comercial y del `module_key` de TrazaDocs. Si la FAQ necesita
aplicabilidad por módulo, debe usar el catálogo comercial, no este.

---

## 8 · Copia pública · lo que hoy dice el producto

Auditado `app/page.tsx`, `/privacy`, `/terms`, `/legal` y la puerta.

| | Qué dice | Relevante para |
|---|---|---|
| 1 | La portada presenta **cuatro tarjetas equivalentes** en `grid sm:grid-cols-2` | **CARRYOVER-01** |
| 2 | `/modules` dice «se resuelve con la **hora del servidor**…» | **CARRYOVER-02** |
| 3 | «Crear cuenta **Demo**» en la cabecera y en el hero (con kill switch) | PE-04, no PE-02 |
| 4 | La política de privacidad vigente se declara **«versión preliminar … para la beta de Trazaloop CPR»** | **Bloqueo blando de PE-02B** · ver §9 |
| 5 | La política de privacidad **no nombra al proveedor de IA** como encargado del tratamiento | **Bloqueo blando de PE-02B** |
| 6 | La portada no menciona seguridad ni aislamiento: **no hay ninguna promesa que retirar** | Ninguno — es una buena noticia |
| 7 | El pie enlaza «Acerca de Trazaloop», términos y privacidad; **no hay dónde poner una FAQ** todavía | PE-02B |

No se encontró **ninguna** afirmación de certificación, SOC 2, ISO 27001,
cifrado de extremo a extremo ni residencia de datos en la copia pública. El
producto hoy **no hace seguridad de escaparate**, y eso es el punto de partida
que hay que conservar.

---

## 9 · Lo que este descubrimiento NO encontró

- **No hay** FAQ de ninguna clase en el producto.
- **No hay** clave estable de página.
- **No hay** pantalla para editar los documentos legales.
- **No hay** un segundo motor de contenido compitiendo con el de 0136.
- **No hay** suplantación de usuarios: `grep` de `impersonat|act_as|login_as`
  no devuelve nada en código ni en migraciones.
- **No hay** ninguna política que dé a `platform_staff` acceso a las
  **membresías** de una empresa.
- **No hay** en el repositorio **ninguna** declaración de la política de uso de
  datos del proveedor de IA. Ver
  [PE_02A_SECURITY_CLAIMS_AUDIT.md](./PE_02A_SECURITY_CLAIMS_AUDIT.md) §9.

El trabajo de PE-02 es **publicar y administrar contenido que hoy existe en
archivos, con un motor que hoy existe en la base**. No es una refundación.

---

## 15 · Nota posterior · lo que PE-02B1 y PE-02B2 confirmaron

Dos cosas que este descubrimiento dio por probables y que después se
comprobaron:

1. **El motor de 0136 sirve.** `0155` lo repitió para la FAQ sin cambiarle una
   idea: identidad estable, revisiones inmutables con vigencia, publicación como
   única puerta. Lo único que hubo que añadir fue la barrera de verificación,
   que 0136 no necesitaba.

2. **`legal_documents` tenía un hueco de verdad.** §4 lo apuntó como carencia de
   pantalla; PE-02B1 descubrió que además su contenido activo se podía reescribir
   en su sitio. `0156` lo cerró y la consola llegó en el mismo tramo. Ver
   [PE_02B2_LEGAL_DOCUMENT_HARDENING.md](./PE_02B2_LEGAL_DOCUMENT_HARDENING.md).

Y una corrección de numeración: la ayuda contextual, si llega a necesitar
esquema, será **0157**.
