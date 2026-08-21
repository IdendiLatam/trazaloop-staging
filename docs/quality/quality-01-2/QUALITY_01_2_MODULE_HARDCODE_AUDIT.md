# QUALITY-01.2 · Auditoría de listas de módulos escritas a mano

QUALITY-01.1 corrigió cuatro piezas transversales que enumeraban los módulos a
mano y dijo explícitamente que **no** había hecho una auditoría exhaustiva.
Esta es esa auditoría.

---

## Cómo se buscó

Sobre el código ejecutable —`app`, `components`, `lib`, `server`; sin pruebas,
sin `node_modules`— se buscaron los patrones que producen el defecto:

| Patrón | Por qué importa |
|---|---|
| Literales `'cpr'`, `'textiles'`, `'quality'`, `'traceability_6632'` | La forma más directa de la lista a mano |
| Uniones de tipo `"cpr" \| "textiles" \| ...` | Obliga a tocar el archivo al añadir un módulo |
| `Record<string, string>` con claves de módulo | Etiquetas duplicadas por pantalla |
| `moduleKey === …`, `module_key === …`, `switch (module)` | Ramas por módulo |
| Rutas de un módulo en código transversal | El caso de «Sistema» de QUALITY-01.1 |
| Fallbacks a CPR | El sesgo histórico |

**23 apariciones** en 21 archivos. Cada una clasificada:

- **A · Legítima, específica de dominio** — el módulo es el sujeto, no una
  entrada de lista. No se toca.
- **B · Transversal escrita a mano** — se corrige.
- **C · Incierta** — se documenta y se deja anotada.

---

# B · Transversales escritas a mano — CORREGIDAS

## B-1 · La ruta de un documento de TrazaDocs

| | |
|---|---|
| **Dónde** | `components/domain/quality/process-detail.tsx` (era la línea 645) |
| **Qué hacía** | `<Link href={`/trazadocs/${d.documentId}`}>` |

TrazaDocs es un motor **transversal**: el mismo documento puede haber nacido en
PCR, en Textiles o en Quality, y cada módulo lo muestra en su propia pantalla.
La ficha del proceso enlazaba **siempre** a la ruta de PCR.

Para una empresa que solo tiene Quality —el caso de la decisión de producto—
eso significaba que el documento que acababas de asociar te llevaba al guard de
otro módulo y te devolvía al selector. El enlace estaba roto justo para quien
más lo necesitaba.

**Corrección:** la ruta se declara en el registro de módulos
(`ShellModuleDefinition.documentPath`) y se resuelve con
`trazadocDocumentHref(moduleKey, id)`. Un módulo desconocido devuelve `null` y
no se ofrece enlace: es preferible no ofrecerlo a ofrecer uno que falla.

*Comprobado por F3 y F4, que barren todos los componentes de Quality.*

---

## B-2 · Dos mapas de etiquetas de módulo, en dos pantallas

| | |
|---|---|
| **Dónde** | `components/domain/quality/documents-view.tsx` y `process-detail.tsx` |
| **Qué hacía** | `const MODULE_LABEL = { cpr: "PCR", textiles: "Textiles", quality: "Quality" }` |

El mismo dato escrito dos veces, en dos archivos, con dos nombres distintos
(`MODULE_LABEL` y `MODULE_ORIGIN_LABEL`). Un módulo nuevo obligaba a
perseguirlos uno por uno, y olvidarse de uno no rompía nada visible: la
pantalla mostraría la clave interna en lugar del nombre comercial.

**Corrección:** `shellModuleName(key)` lee el registro. Un valor inesperado
devuelve la clave tal cual, para que ninguna pantalla quede en blanco.

*Comprobado por F5.*

---

## B-3 · Los módulos posibles de un documento, enumerados dos veces

| | |
|---|---|
| **Dónde** | `lib/domain/trazadocs.ts` y `lib/db/trazadocs.ts` |
| **Qué hacía** | `export type TrazadocDocumentModule = "cpr" \| "textiles" \| "quality"` — y la misma unión otra vez en la capa de datos |

Es exactamente el patrón que dejó a Quality fuera cuatro veces en
QUALITY-01.1: una lista que hay que acordarse de ampliar.

**Corrección:** el tipo se **deriva** de `SHELL_MODULE_KEYS`, y la capa de
datos lo importa en vez de repetirlo.

Y hay una comprobación que no existía: **F6 exige que la restricción `CHECK` de
la base admita exactamente los módulos del registro**. Si alguien añade un
módulo al registro sin ampliar la migración documental, la prueba falla antes
que la aplicación — que era justo lo que no ocurrió en QUALITY-01.1.

---

## B-4 · Cuatro rutas de PCR en una pantalla transversal

| | |
|---|---|
| **Dónde** | `app/(app)/(shell)/team/page.tsx` |
| **Qué hacía** | Cabecera con «Ir a Implementación», «Ir a Importaciones», «Ir a Evidencias», «Ir a Trazabilidad» |

Es el mismo defecto de «Sistema» de QUALITY-01.1, un piso más abajo. Aquella
corrección arregló el **shell** —el menú y la identidad ya no saltan a PCR—
pero dentro de la página seguían cuatro botones que solo funcionan si la
empresa tiene PCR. Una empresa que solo tenga Quality los veía y, al pulsarlos,
el guard la devolvía al selector.

**Corrección:** los atajos salen de la navegación del módulo desde el que se
llegó, igual que el menú lateral. Con Quality activo, la cabecera de «Equipo»
ofrece Inicio Quality, Cargos, Procesos y Mapa.

*Comprobado por F7 y por el paso 15 del recorrido HTTP.*

---

## B-5 · El destino después de aceptar una invitación

| | |
|---|---|
| **Dónde** | `server/actions/team.ts` |
| **Qué hacía** | `redirect("/dashboard")` |

Es el hallazgo 1 del encargo. Aceptar una invitación es transversal: concede
incorporación a una **empresa**, no acceso a un módulo. El destino fijo era la
portada de PCR.

**Corrección:** el destino por defecto es el selector de módulos. Detalle
completo en el informe principal, secciones A y B.

---

## B-6 · El destino después de elegir empresa

| | |
|---|---|
| **Dónde** | `server/actions/organizations.ts` |
| **Qué hacía** | `redirect("/dashboard")` |

No estaba en el encargo; apareció al perseguir B-5. Es el mismo error: elegir
empresa es transversal, y una empresa sin PCR aterrizaba en un módulo al que no
podía entrar. El guard la devolvía al selector, de modo que el usuario veía un
rebote en lugar de una navegación.

**Corrección:** al selector de módulos, que es la regla que ya aplicaba
`postAuthDestinationPath` después del login. Se corrigió por coherencia: dejar
uno de los dos habría sido la grieta por la que el sesgo vuelve.

*Comprobado por A7.*

---

# A · Legítimas — NO SE TOCAN

| # | Dónde | Qué es | Por qué es legítima |
|---|---|---|---|
| A-1 | `lib/modules/catalog.ts` | `COMMERCIAL_MODULES` y `CommercialModuleKey` | **Es la fuente canónica.** Alguien tiene que declarar qué módulos existen; el problema son las *copias*, no el original |
| A-2 | `lib/modules/registry.ts` | `SHELL_MODULES`, `SHELL_MODULE_KEYS` | Ídem, para el shell. Ahora las claves también son dato en tiempo de ejecución, para que F2 exija que registro y claves no se separen |
| A-3 | `lib/db/trazadocs-master.ts` | `.eq("module_key", "cpr")` | El **maestro documental es de PCR**. No es una lista: es el sujeto de la consulta |
| A-4 | `lib/db/textiles-trazadocs.ts` | `const MODULE = "textiles"` | La capa textil fija su módulo en servidor. Es la garantía de que Textil no lee documentos de otro módulo |
| A-5 | `lib/db/quality-documents.ts` | `QUALITY_DOC_MODULE = "quality"` | Ídem para Quality |
| A-6 | `server/actions/trazadocs.ts` (5 sitios) | `getDocumentFacts(..., "cpr")` | Son las actions **de PCR**. Fijar su módulo es lo que impide que toquen un documento ajeno |
| A-7 | `server/actions/textiles-trazadocs.ts` | `moduleKey: "textiles"` | Ídem |
| A-8 | `lib/modules/textiles.ts` | `TEXTILES_MODULE_KEY` | Constante con nombre del propio módulo |
| A-9 | `lib/domain/textiles-evidences.ts` | `if (prefix !== "textiles")` | Valida el prefijo de una ruta de almacenamiento **textil**. Es una guarda de seguridad de ese dominio |
| A-10 | `lib/db/storage-deletion.ts` | `moduleCode: "traceability_6632" \| "textiles"` | Los únicos dos módulos que **hoy** tienen archivos en almacenamiento. Ver C-1 |
| A-11 | `lib/domain/support.ts` | `TICKET_MODULES` | Catálogo de **áreas de soporte**, no de módulos comerciales: incluye `diagnostic`, `catalog`, `team`… Un tema de ticket es una taxonomía propia |
| A-12 | `lib/domain/implementation.ts` | `MODULE_LABEL` / `FEEDBACK_MODULES` | Ídem: áreas funcionales de PCR (`auth`, `organization`, `guided_flow`…) |
| A-13 | `components/layout/nav.tsx` | `activeModule.key !== "cpr"` | «Volver al módulo» se ofrece cuando el módulo activo **no** es el destino por defecto. Es la definición de «por defecto», no una lista |
| A-14 | `lib/modules/registry.ts` | `resolveShellModuleForPath` con CPR al final | CPR es el módulo por defecto **por diseño**, documentado desde T9E. No es un fallback olvidado |
| A-15 | `app/(app)/modules/page.tsx` | `runtimeHrefByKey = { cpr: … }` | El único destino que no puede conocerse de antemano: depende de la sesión. Ya lleva el comentario que prohíbe añadir otros |
| A-16 | `app/page.tsx` | `getCommercialModuleByKey("textiles")` | La portada pública describe Textiles concretamente |

---

# C · Inciertas — documentadas, no tocadas

## C-1 · `storage-deletion.ts` enumera dos módulos

```ts
moduleCode: "traceability_6632" | "textiles";
```

**Por qué es incierta:** hoy es correcta —Quality no sube archivos: su
documentación es contenido estructurado en TrazaDocs, y las evidencias con
fichero llegarían en QUALITY-02 o más adelante— pero es exactamente la forma de
lista que hay que perseguir después.

**Por qué no se toca:** derivarla exigiría que el catálogo declarase qué
módulos tienen almacenamiento, y eso es una decisión de modelo comercial que
excede este sprint. Cambiarla «por si acaso» tocaría el borrado de archivos de
PCR y de Textiles sin ninguna necesidad presente.

**Qué mirar cuando llegue el momento:** el día que Quality tenga archivos, este
es el primer sitio.

## C-2 · Los prefijos de ruta de cada módulo

Cada `ShellModuleDefinition` lista sus `pathPrefixes` a mano. Es una lista, pero
está **junto a la identidad del módulo**, no en una pieza transversal: añadir un
módulo significa escribir su definición, y sus prefijos forman parte de ella.
Derivarlos del árbol de rutas exigiría leer el sistema de archivos en tiempo de
ejecución. Se deja como está.

## C-3 · Las claves del catálogo comercial incluyen `construccion`

`CommercialModuleKey` tiene cuatro claves y `ShellModuleKey` tres:
`construccion` es «próximamente» y no tiene shell. La diferencia es correcta y
está comprobada por F1 (todo módulo **funcional** debe tener shell y página
real). Se anota porque a primera vista parece una divergencia.

---

# El objetivo, comprobado

El encargo pide que el próximo módulo funcional no obligue a perseguir estas
listas otra vez. Lo que impide que vuelva a pasar no es haberlas corregido —eso
ya se hizo en QUALITY-01.1 y volvieron a aparecer— sino los invariantes:

| Invariante | Qué impide |
|---|---|
| **F1** | Un módulo funcional sin shell, sin ruta o con una ruta que no existe en disco |
| **F2** | Que el registro y sus claves se separen |
| **F3** | Que un módulo no declare cómo se abre uno de sus documentos |
| **F4** | Que una pantalla de Quality enlace a la ruta de PCR |
| **F6** | Que un módulo entre al registro sin que la base acepte sus documentos |
| **F7** | Que una pantalla transversal ofrezca atajos de un solo módulo |
| **E3** | Que una constante compartida se exporte desde un módulo `"use server"` |

Los tres primeros ya existían en QUALITY-01.1; los cuatro últimos son de este
sprint.
