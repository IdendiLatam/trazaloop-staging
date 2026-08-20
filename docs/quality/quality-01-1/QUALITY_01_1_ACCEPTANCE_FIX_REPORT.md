# QUALITY-01.1 · Informe de corrección de aceptación

**Rama:** `fix/quality-01-acceptance` · **Migración:** `0113` · **Fecha:** 20 de agosto de 2026

---

# VEREDICTO

## `QUALITY-01.1 READY FOR USER RETEST`

Los cinco defectos reportados están corregidos en su origen, y los dos que
aparecieron al perseguirlos también. El recorrido humano completo —login,
selector, Quality, cargos, categorías, procesos, Sistema, mapa, documentos,
vinculación e invitación— pasa de extremo a extremo contra STAGING, navegando
por los enlaces reales de cada pantalla y sin escribir una sola URL a mano.

Se declara *READY FOR USER RETEST* y no *READY WITH GAPS* porque no queda
ninguna parte del encargo sin entregar. Lo que sí queda son limitaciones ya
conocidas del entorno y trabajo explícitamente aplazado, en la sección U.

---

## Una observación sobre los siete defectos

Vale la pena decirlo antes del detalle, porque cambia qué conviene hacer
después: **ninguno de los siete era un defecto de Quality**. Cuatro son piezas
transversales que solo conocían los módulos existentes cuando se escribieron:

| Pieza | Solo conocía | Consecuencia |
|---|---|---|
| Tabla `clave → ruta` del selector | CPR y Textiles | Quality sin «Entrar» |
| Resolución del kill switch | Textiles | Quality denegado en silencio |
| Grupo de navegación «Sistema» | Rutas de CPR | Quality expulsaba a PCR |
| Plan que valida una invitación | La copia heredada | Nadie podía aceptar |

Es el mismo patrón cuatro veces. Las correcciones no añaden «quality» a esas
listas: eliminan las listas.

---

# A. El selector de Quality sin «Entrar»

**Ya estaba corregido** en `879912b`, del cierre anterior, y se ha
reconfirmado en esta rama.

`app/(app)/modules/page.tsx` mantenía a mano `homeHrefByKey = { cpr, textiles,
quality: null, construccion: null }`. Toda la cadena previa era correcta
—entitlement, kill switch, estado `full`, `isEnterableState`—; el último paso
resolvía la ruta contra ese mapa y Quality devolvía `null`, así que la tarjeta
se renderizaba como bloque inerte.

Ahora la ruta se declara en el catálogo (`CommercialModule.homePath`) y la
resuelve `resolveModuleEntryHref()`. Una prueba exige que **todo módulo
funcional declare ruta y que esa página exista en disco**.

Verificado contra Staging con la cuenta QA: la tarjeta es un `<a>` con
`href="/quality"` y muestra «Entrar →».

---

# B. Cargos: editar, desactivar y eliminar

**Estaba:** solo «Historial», «Asignar persona» y «Desactivar». No había forma
de corregir un nombre mal escrito ni de quitar un cargo creado por error.

**Ahora:** cada cargo ofrece **Editar**, **Asignar persona**, **Desactivar /
Reactivar** y **Eliminar**.

### La regla, y por qué

Un cargo con historial **no se borra**: sus procesos y sus asignaciones son la
respuesta a «quién respondía por esto el 14 de marzo», que es justo lo que T-02
protege. Pero un cargo recién creado por error no debería quedarse para siempre.

`removeQualityPosition()` lee el uso real y decide:

| Situación | Qué ocurre |
|---|---|
| Sin procesos ni asignaciones | Se **elimina** de verdad |
| Con cualquier referencia | Se **desactiva**, conservando todo |

La confirmación **anuncia cuál de las dos cosas va a pasar y por qué**, con las
cifras concretas: «Este cargo tiene información asociada (2 procesos a su cargo
y 1 asignación de personas), así que se DESACTIVARÁ…». Prometer «eliminar» y
desactivar en silencio sería engañoso; avisar después, tarde.

### Tres capas, no una

1. La lectura de uso decide qué ofrecer y qué explicar.
2. Si aparece una referencia entre la lectura y el borrado, el `23503` se
   traduce a desactivación: no hay carrera que acabe en error opaco.
3. Las **FK `ON DELETE RESTRICT` de 0112 son la barrera real** y no se
   tocaron. 0113 solo añade la política de DELETE (admin/quality) para que la
   operación *llegue* a la base, donde la restricción decide.

Ante un fallo de lectura se asume que **sí** hay uso: equivocarse hacia
desactivar conserva datos; equivocarse hacia borrar los destruye.

---

# C. Causa del salto Sistema → PCR

`resolveShellModuleForPath()` recorría los módulos **saltándose CPR** y
devolvía CPR cuando nadie reclamaba la ruta. Las rutas del grupo transversal
«Sistema» —`/team`, `/settings/*`, `/support`— no las reclama ningún módulo.

Resultado: quien entraba a Quality y pulsaba «Equipo» aterrizaba en `/team` con
el menú de PCR, el distintivo «NTC 6632 · UNE-EN 15343» y sin vuelta atrás
salvo el selector. No había navegado a PCR: la aplicación lo había movido.

**Un segundo problema en el mismo grupo:** «Onboarding» vive bajo `(cpr)` y lo
protege `requireCprModule()`. Estaba en un menú transversal, así que para una
empresa que solo tuviera Quality era un enlace que devolvía al selector.

---

# D. Solución del enrutado

Las rutas transversales **conservan el módulo de origen** mediante un parámetro
de presentación (`?m=<clave>`), y la resolución pasa a tener cuatro pasos:

1. ¿La reclama un módulo no-CPR? → ese módulo.
2. ¿La reclama CPR por sus propios prefijos? → CPR. *(`/dashboard?m=quality` es
   una pantalla de PCR y debe verse como tal.)*
3. ¿Es transversal y se recuerda un módulo? → ese.
4. Si no → CPR.

`moduleAwareHref()` decora solo los enlaces transversales. Los propios del
módulo y los de CPR quedan con la URL limpia, así que el comportamiento
anterior no cambia.

**Es un parámetro de PRESENTACIÓN.** No concede acceso a nada: el guard de cada
namespace sigue siendo la barrera, la ruta manda siempre sobre el parámetro, y
un valor inventado se ignora. Está comprobado con `"hacker"`, `"QUALITY"`,
`"quality "`, vacío y nulo.

Se añadió además un «← Volver a Trazaloop Quality» visible desde cualquier
pantalla transversal, y «Onboarding» pasó a la navegación de CPR.

Verificado por HTTP: desde Quality, «Equipo» enlaza a `/team?m=quality`,
responde 200, el encabezado sigue anunciando Quality y **no** aparece «NTC 6632».

---

# E. Causa de la invitación sin token

Dos defectos encadenados.

### E.1 · El enlace existía una sola vez

El token se generaba, se persistía y la página de aceptación lo leía
correctamente. Lo que fallaba era la **entrega**: el enlace solo aparecía en el
resultado efímero de crear la invitación (`state.inviteLink`). La lista de
invitaciones pendientes tenía el token en sus datos y **no lo mostraba**.

Quien cambiaba de pantalla lo perdía para siempre y acababa abriendo
`/accept-invite` a secas — «El enlace no incluye un token de invitación válido».

A eso se sumaba que el enlace se construía con `NEXT_PUBLIC_SITE_URL`: sin
definir daba una ruta **relativa**, y en Preview apunta a un despliegue
concreto (limitación G-1), de modo que señalaba a uno viejo.

### E.2 · Aceptar leía el plan equivocado

Perseguir el flujo hasta el final destapó un segundo defecto, más grave.
PCR-01 estableció que el plan que decide es el **efectivo por módulos**
(`organization_effective_plan_code`, 0103) y no la copia obsoleta de
`organization_subscriptions.plan_code`. La corrección se aplicó a la
**creación** de invitaciones… y la **aceptación** quedó en 0056 leyendo la
columna heredada.

El flujo estaba partido por la mitad: una empresa con módulos en Full podía
crear la invitación y enviar el enlace, y la persona invitada recibía **«Las
invitaciones y roles están disponibles en los planes Full y Extra»**.

> Esto habría bloqueado la siguiente prueba humana aunque el enlace hubiera
> llegado bien: la empresa QA de Staging tiene Quality en Full y su fila
> heredada dice `demo`.

---

# F. Solución de invitaciones

| Qué | Cómo |
|---|---|
| El enlace deja de perderse | Cada invitación **pendiente** muestra su enlace completo, copiable, en la lista de equipo. Solo a quien administra |
| El enlace es absoluto y correcto | `buildInvitationLink()` usa el **origen real de la petición** (`x-forwarded-host`); `NEXT_PUBLIC_SITE_URL` queda como respaldo |
| Aceptar usa el plan vigente | 0113 sustituye `accept_team_invitation` para resolver con `organization_effective_plan_code` |
| Deja de escribirse un estado imposible | El `update ... status='expired'` previo al `raise` se revertía siempre: se elimina. La caducidad se deriva de `expires_at` |

Los ocho casos del encargo, comprobados contra base real:

| Caso | Resultado |
|---|---|
| A · Persona sin cuenta previa | ✔ se registra y entra con su rol |
| B · Persona con cuenta existente | ✔ acepta y entra |
| C · Token válido | ✔ crea la membresía |
| D · Token expirado | ✔ rechazado; nadie entra |
| E · Token inválido | ✔ «La invitación no existe» |
| F · Token ya utilizado | ✔ «Esta invitación ya fue aceptada» |
| G · Organización correcta | ✔ el rol y la empresa son los invitados |
| H · Cross-tenant | ✔ otra empresa no lee, ni revoca, ni crea, ni usa el token ajeno |

---

# G. Causa de las categorías vacías

`listQualityCategories()` pedía y ordenaba por **`display_order`**. La columna
se llama `sort_order`. PostgREST devolvía error, la función lo tragaba con
`return []`, y el selector salía en blanco.

El error de escritura es trivial. Lo que lo hizo difícil de ver es el patrón que
lo escondía: **devolver una lista vacía ante un fallo vuelve un error de
programación indistinguible de «no hay datos»**. Nada, en ninguna parte, decía
por qué.

Y había un segundo problema, no reportado pero real: los nombres sembrados por
0112 iban **sin tildes** («Estrategicos»), porque las migraciones de este
repositorio evitan acentos en los *comentarios* y ese criterio se aplicó por
inercia a los *datos*, que sí acaban en la pantalla de una persona. Además el
dominio tenía su propio mapa de etiquetas que decía cosas distintas («De
apoyo», «De gestión del sistema»): dos verdades para lo mismo.

---

# H. Solución y aprovisionamiento

1. **Columna corregida** a `sort_order`.
2. **El fallo deja rastro:** `reportQueryFailure()` registra motivo y código en
   las siete lecturas de Quality. La interfaz sigue sin romperse; lo que cambia
   es que ahora se puede saber por qué.
3. **Una sola fuente de nombres:** 0113 fija los congelados —**Estratégicos,
   Misionales, Apoyo, Sistema**— y el mapa del dominio dice exactamente lo
   mismo. Una prueba comprueba que sigan de acuerdo.

### Aprovisionamiento: por qué no hace falta ninguno

Las cuatro categorías son **globales** (`organization_id is null`), sembradas
por 0112, y la política de lectura es `organization_id is null or
is_org_member(...)`. Toda empresa las ve desde el primer día:

| Caso del encargo | Resultado |
|---|---|
| Organizaciones existentes de Staging | ✔ las ven, sin backfill |
| Organizaciones nuevas | ✔ comprobado creando una |
| Empresas que solo contratan Quality | ✔ comprobado |

Un catálogo por inquilino habría exigido backfill, aprovisionamiento y
mantenimiento de cuatro copias por empresa. Global + extensión propia da el
mismo resultado sin nada de eso. Y sigue siendo extensible: una empresa puede
añadir sus categorías, con `code`, `name`, `sort_order` e `is_active`, y no ve
las de nadie más.

### El trigger que protegía el catálogo

0112 impedía **cualquier** modificación de las filas globales, incluida una
migración. Su propósito es que no las altere un *cliente*, no que la plataforma
no pueda mantenerlas: 0113 lo afina para bloquear a `anon` y `authenticated`.
Se comprobó que una sesión de empresa sigue sin poder renombrarlas ni borrarlas.

No se desactivó el trigger para hacer el cambio: eso habría abierto una ventana
sin vigilancia.

---

# I. Arquitectura de Documentos de Quality

**Principio no negociable, cumplido:** Quality tiene experiencia documental
propia; TrazaDocs sigue siendo el único motor.

```
        TRAZADOCS · motor transversal (0043–0048, 0082)
   trazadoc_documents · _sections · _versions · RPC de transición
                            │  module_key
        ┌───────────────────┼───────────────────┐
     'cpr'             'textiles'           'quality'
   /trazadocs        /textiles/trazadocs   /quality/documents
```

**No se creó ninguna tabla.** 0113 no contiene un solo `create table`: el motor
ya era transversal desde 0082 y lo único que faltaba era que su restricción
`CHECK` admitiera el tercer módulo.

| Qué se reutiliza | Qué es propio de Quality |
|---|---|
| `trazadoc_documents`, secciones, versiones | Rutas `/quality/documents` |
| RPC `change_trazadoc_document_status` | Server actions con la guarda de Quality |
| `SectionEditor`, `DocumentStatusBadge` | Vista de lista con propios / vinculados |
| Roles y estados del dominio | — |

El editor no se reescribió: se monta el del motor. Lo único propio son las
actions, porque la guarda tiene que ser la de Quality — las de CPR viven bajo
`(cpr)` y una empresa sin PCR no puede usarlas. Es el mismo patrón que ya
seguía Textiles.

`module_key = 'quality'` se fija **en servidor**; el cliente no lo envía y, en
`UPDATE`, el módulo es inmutable (trigger de 0082): un documento nunca cruza de
módulo. Comprobado.

---

# J. Documento de Quality en una empresa quality-only

Se probó el caso exacto de la decisión de producto: una empresa con **PCR y
Textiles deshabilitados** y **Quality en Full**.

| Puede | ✔ |
|---|---|
| Entrar a Quality | ✔ |
| Entrar a Documentos | ✔ |
| Crear un documento propio | ✔ nace en borrador, con cinco secciones |
| Editar su contenido | ✔ con el editor del motor |
| Consultarlo | ✔ filtrado por `module_key = 'quality'` |
| Asociarlo a un proceso | ✔ |

Y **no puede** crear documentos de PCR: el trigger de acceso por módulo lo
rechaza con `MODULE_ACCESS_BLOCKED`. No es un fallo — es la separación
funcionando.

Un documento de Quality nace con secciones de partida (objetivo, alcance,
responsabilidades, desarrollo, registros), editables.

---

# K. Vinculación de documentos existentes

Desde el detalle de un proceso, «Asociar documento de TrazaDocs» ofrece
**cualquier documento no obsoleto de la misma empresa**, indicando su módulo de
origen: *«Procedimiento de recepción — de PCR»*.

| Garantía | Comprobado |
|---|---|
| No duplica | ✔ tras vincular sigue existiendo **una** fila |
| No copia revisiones | ✔ solo se crea la relación |
| No cambia el módulo de origen | ✔ el documento de PCR sigue siendo de PCR |
| Aislamiento | ✔ no se puede vincular un documento de otra empresa (FK compuesta) |

La lista distingue las dos cosas de un vistazo:

```
Documentos de Quality
  Procedimiento de auditoría interna     · 3 de 5 secciones · v1

Documentos vinculados
  Procedimiento de recepción de materias primas
  Origen: PCR · usado por Auditorías internas          [Ver proceso →]
```

Con la explicación de por qué están separados: editarlos afecta también a su
módulo de origen, y se hace desde allí.

---

# L. Navegación

| Requisito | Estado |
|---|---|
| Ningún enlace saca accidentalmente a PCR | ✔ comprobado sobre **todos** los enlaces de los componentes de Quality |
| Los breadcrumbs dicen Quality | ✔ «← Volver a procesos», «← Volver a Documentos de Quality» |
| Los back links vuelven a Quality | ✔ |
| Los estados vacíos son de Quality | ✔ el de documentos apuntaba a `/trazadocs/new` (ruta de PCR); ahora a `/quality/documents` |
| Los CTA tienen rutas Quality | ✔ |
| Menú del módulo | ✔ Inicio · Sistema de gestión (Cargos, Procesos, Mapa) · Documentación (Documentos) |

Una prueba recorre los `href` de los cuatro componentes de Quality y falla si
alguno sale del módulo.

---

# M. Migraciones

Una sola: **`0113_quality_documents_and_position_lifecycle.sql`**, append-only
tras 0112. **No se modificó ninguna de 0001 a 0112.**

| § | Contenido |
|---|---|
| 1 | `module_key` de TrazaDocs admite `'quality'` (documentos y blueprints) |
| 2 | Política de DELETE en `quality_positions` para `admin`/`quality` |
| 3 | `accept_team_invitation` usa el plan **vigente**; se quita el `update` que el `raise` revertía |
| 4 | Nombres de las cuatro categorías base, en español correcto; trigger de protección afinado |
| 5 | Privilegios: revocación reafirmada a `anon`, y `TRUNCATE`/`REFERENCES`/`TRIGGER` a los roles cliente |

**Sin `create table`.** Sin `GRANT ALL`. Sin `ALTER DEFAULT PRIVILEGES`. No se
relajó ninguna clave foránea: son ellas las que impiden borrar lo que tiene
historial.

---

# N. RLS

Ninguna política se debilitó.

| Cambio | Efecto |
|---|---|
| DELETE en `quality_positions` | Nuevo, restringido a `admin`/`quality`. Las FK `RESTRICT` siguen decidiendo qué se puede borrar de verdad |
| Trigger del catálogo global | **Más preciso**, no más laxo: bloquea a los roles cliente en lugar de a todo el mundo |
| Documentos de Quality | Las políticas de `trazadoc_documents` (0043) no se tocaron |

Comprobado tras 0113: `anon` conserva **0** privilegios sobre `quality_*`; los
roles cliente no tienen `TRUNCATE`/`REFERENCES`/`TRIGGER`; ambas FK que
protegen el historial siguen en `RESTRICT`; una sesión de empresa no puede
alterar el catálogo global.

Aislamiento entre empresas verificado en cargos, procesos, categorías propias,
invitaciones (incluidos sus **tokens**) y documentos.

---

# O. Pruebas

**81 comprobaciones propias de QUALITY-01.1**, sobre las 98 de QUALITY-01.

| Suite | Comando | Nº |
|---|---|---|
| Puras y estáticas (B, G, fronteras) | `test:quality011` | 24 |
| Base real (A, C, D, E, F) | `test:quality011-rls` | 41 |
| Recorrido humano por HTTP | `test:quality011-ui` | 16 |

Detalle en `QUALITY_01_1_TEST_MATRIX.md`.

La suite HTTP **no escribe una sola URL interna a mano**: cada destino sale del
`href` que renderiza la pantalla anterior. No es purismo — es que una prueba que
teclea la URL no habría detectado ni el selector sin «Entrar», ni el salto a
PCR, ni el enlace de invitación ausente.

---

# P. Local

`db reset` completo: **105 migraciones**, 0113 incluida, sin error.

`typecheck` limpio · `lint` 0 errores (1 aviso preexistente, ajeno) · `build`
compila con las 7 rutas de Quality dinámicas · `test:all` **exit 0**.

Suites con base real: `test:rls` 110/110 · `test:quality01` 41/41 ·
`test:quality011` 24/24 · `test:quality01-rls` 56/56 · `test:quality011-rls`
41/41 · `test:quality01-ui` 15/15 · `test:quality011-ui` 16/16 ·
`t9f-rls`, `t9f1-rls`, `t9f2-rls`, `t9f4-rls`, `textiles-rls-*` — todas verdes.

---

# Q. Staging

**Destino:** `qchzkxbnbqeyuxinipln`, verificado antes de escribir.
`db push --dry-run` listó exactamente 0113. Aplicada con **exit 0**. 104 → 105
migraciones. Sin `migration repair`.

Estado idéntico al local. Suites contra Staging: **56/56**, **41/41** y
**16/16**. La cuenta QA real recorre las seis pantallas correctamente.

Detalle en `QUALITY_01_1_STAGING_VALIDATION.md`.

---

# R. Preview

```
https://trazaloop-production-pdxgvxnhr-idendi-latam-s-projects.vercel.app
```

Estado **Ready**. Las credenciales de prueba **no cambian**: siguen siendo
`quality.qa@trazaloop-staging.local` con la contraseña que ya tienes.

Los Preview siguen tras el SSO de Vercel (G-2): no se desactivó, porque es una
opción de proyecto compartida con Production.

---

# S. Regresión de PCR y Textiles

`test:all` (~1.400 comprobaciones, 82 suites) → **exit 0**.

| Área | Estado |
|---|---|
| PCR | ✔ El dashboard sigue siendo suyo; `/dashboard?m=quality` se resuelve como PCR |
| Textiles | ✔ Entrada, navegación, documentos y aislamiento intactos |
| TrazaDocs | ✔ Ampliar `module_key` es aditivo; el default sigue siendo `'cpr'` |
| Auth | ✔ |
| Equipos e invitaciones | ✔ Los ocho casos, dentro y fuera de Quality |
| Planes y Demo/Full/Extra | ✔ Aceptar ahora usa el plan vigente, que era la intención de PCR-01 |
| Aislamiento | ✔ `test:rls` 110/110 |

### Pruebas actualizadas, ninguna debilitada

| Prueba | Antes | Ahora |
|---|---|---|
| `textiles-trazadocs` 12 | `TrazadocModuleKey = "cpr" \| "textiles"` | Los tres. La exigencia no cambia: default `'cpr'`, cada consulta filtra por módulo |
| `v1-release` 24c | La variable de sitio en `team.ts` | En el constructor de enlaces, **más** la exigencia de usarlo |
| `quality-01-foundation` 26 | La última migración es 112 | 0112 existe, sin renumeraciones, y la cola no retrocede |
| 16 listas de migraciones | 0111 + 0112 | Declaran también 0113 |

### Corrección transversal, con su regresión

`accept_team_invitation` es transversal. Se ejecutó la batería completa más
`test:rls` (110/110), y los ocho casos de invitación se comprueban
explícitamente en `test:quality011-rls`.

---

# T. Commits

| Commit | Contenido |
|---|---|
| `879912b` | La entrada del selector se resuelve por catálogo *(reconfirmado)* |
| `e00f862` | QUALITY-01.1 — las correcciones de la prueba humana |

48 archivos, +3.512 / −85 líneas. Sin `force push`. Sin mezclar otras ramas.

---

# U. Gaps

## Limitaciones del entorno, no del código

| # | Situación | Bloquea |
|---|---|---|
| G-1 | `NEXT_PUBLIC_SITE_URL` de Preview apunta a un despliegue concreto | **Ya no**: el enlace de invitación usa el origen real |
| G-2 | Preview tras SSO de Vercel | No. Navegable con cuenta del equipo |
| G-3 | Staging sin SMTP | No. El enlace se comparte a mano — y por eso ahora está siempre disponible |

## Trabajo deliberadamente aplazado

| Área | Nota |
|---|---|
| D-01…D-30 de TrazaDocs | Fuera del alcance, según el encargo |
| Versiones de documentos de Quality | El motor las soporta; falta la pantalla de historial |
| Plantillas de documentos de Quality | No hay blueprints con `module_key='quality'`. Los documentos nacen libres |
| Menú ISO completo | Fuera del alcance |
| Categorías propias desde la interfaz | El modelo las soporta y la RLS las aísla; falta la pantalla |
| Reordenar el mapa arrastrando | Hay `sort_order`; la interfaz no lo expone |
| Competencias y evaluaciones | Excluidos desde QUALITY-01 |

## Deuda ajena detectada y no tocada

| Tema | Nota |
|---|---|
| `tests/rls/isolation.test.ts:2642` | Token de invitación **literal**: impide repetir la suite sobre la misma base |
| `test:t9f3-rls` | Dos residuos de limpieza; preexistentes en `ef09356` |
| Aviso de lint en `textiles-evidences-hardening.test.ts:40` | Preexistente, ajeno |

## Una observación sobre el patrón

El defecto del selector y el del kill switch son el mismo error dos veces; el
de «Sistema» y el del plan de invitaciones, dos variantes del mismo. **Merece
la pena revisar si quedan más listas escritas a mano que enumeren módulos.** Se
buscaron las evidentes y se corrigieron las cuatro; no se hizo una auditoría
exhaustiva porque excedía el alcance de este sprint.

---

# V. Qué conviene que pruebes a mano

Los enlaces salen de la pantalla anterior, así que basta con navegar.

### 1 · El defecto que reportaste primero
- Entra al **selector de módulos**. Quality debe mostrar **Plan Full** y
  **«Entrar →»**. Pulsa la tarjeta.

### 2 · Cargos
- Crea uno. Comprueba que aparecen **Editar**, **Asignar persona**,
  **Desactivar** y **Eliminar**.
- Edita el nombre y el área; confirma que se guarda.
- **Elimina un cargo recién creado**: debe desaparecer.
- Asígnale un proceso a otro cargo y **elimínalo**: el aviso debe decir que se
  DESACTIVARÁ, con las cifras. Confirma y comprueba que el proceso conserva su
  propietario.

### 3 · Categorías y procesos
- Crea un proceso. El desplegable debe ofrecer **Estratégicos, Misionales,
  Apoyo, Sistema**.
- Comprueba que el listado muestra la categoría y el cargo propietario.

### 4 · La navegación que te expulsaba
- Desde Quality, entra a **Equipo** (grupo «Sistema»). Debes **seguir en
  Quality**: el encabezado dice «Trazaloop Quality», no «NTC 6632», y hay un
  «← Volver a Trazaloop Quality».
- Prueba también **Configuración**, **Mi perfil** y **Centro de soporte**.

### 5 · Invitaciones
- Invita a alguien. **Cambia de pantalla y vuelve a Equipo**: el enlace debe
  seguir ahí, completo y copiable. Ese era el defecto.
- Ábrelo en una ventana privada: la página debe reconocer la invitación, no
  decir que falta el token.
- Acepta desde una cuenta con ese correo y comprueba que entra con su rol.

### 6 · Documentos
- **Quality → Documentos**. Crea uno, escribe una sección, guarda.
- Envíalo a revisión y apruébalo: debe registrarse la versión.
- Desde el detalle de un proceso, **asocia un documento existente**. Vuelve a
  Documentos: debe aparecer bajo **«Documentos vinculados»** con su origen, y
  **no** duplicado.

### 7 · Lo que conviene mirar con ojo crítico
- **Los nombres y los textos.** Se ha cuidado el lenguaje, pero eres tú quien
  sabe cómo habla un responsable de calidad.
- **Las secciones por defecto de un documento.** Son cinco; puede que sobren o
  falten para vuestro caso.
- **Si el mapa se entiende sin dibujar las flechas.** Las interacciones se leen
  como listas en el detalle del proceso. El dato está completo; dibujarlas es
  incremental, y conviene decidirlo viendo un mapa real antes de invertir ahí.
