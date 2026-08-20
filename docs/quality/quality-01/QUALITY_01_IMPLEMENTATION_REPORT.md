# QUALITY-01 · Informe final

**Sprint:** Foundation + Process Management Vertical — primera implementación real de Trazaloop Quality
**Fecha:** 19–20 de agosto de 2026

---

# VEREDICTO

## `QUALITY-01 READY FOR USER TESTING`

El recorrido completo del objetivo del sprint funciona de extremo a extremo en STAGING:
crear cargos → crear procesos → clasificarlos → asignar propietario = Cargo → definir entradas y
salidas → definir interacciones → construir el mapa → publicar una versión → relacionar
documentos existentes de TrazaDocs → consultar el mapa oficial vigente.

Los diez puntos del alcance funcional están implementados. Las 98 comprobaciones propias del
sprint están en verde, 66 de ellas contra la base gestionada de Staging. La regresión de
plataforma (~1.400 comprobaciones) pasa. No hay ningún punto del alcance sin entregar.

Se declara **READY FOR USER TESTING** y no *READY WITH GAPS* porque los pendientes de la sección
S no son partes faltantes de este alcance, sino consecuencias conocidas del entorno (SSO de
Vercel, ausencia de SMTP en Staging) y trabajo explícitamente aplazado en el propio encargo
(competencias, evaluaciones, D-01…D-30).

---

# A. Rama

`feature/quality-01-process-foundation`, creada desde `ef09356` (último commit del cierre de
infraestructura pre-Quality).

Publicada en `origin`. **Sin `force push`. Sin mezclar ninguna otra rama.** `main` no se tocó.

---

# B. Commits

| Commit | Qué contiene |
|---|---|
| `3eac3e3` | `feat(quality)` — la fundación completa: migración 0112, capa de módulo, dominio, datos, actions, UI, tres suites de prueba, y la corrección del kill switch genérico |
| `7c4c36b` | `test(quality)` — impedir que las pruebas mezclen entornos (guarda de proyecto y cookie derivada del host) |
| `58a30ca` | `feat(quality)` — lectura inversa desde TrazaDocs y retiro de procesos |

Total: **56 archivos, +8.632 / −99 líneas**. De ellos, 25 archivos nuevos de Quality; las 99
líneas eliminadas son actualizaciones de pruebas existentes (sección N).

---

# C. Migraciones nuevas

Una sola: **`0112_quality_process_foundation.sql`**, append-only tras 0111.

**Ninguna migración de 0001 a 0111 fue modificada.** Verificado por la comprobación 26 de
`test:quality01` (append-only, sin prefijos duplicados) y por las 16 listas de migraciones
autorizadas del repositorio, que ahora declaran 0111 y 0112.

Convención de Q0 aplicada desde el primer día:

- Privilegios **explícitos** y enumerados: `grant select, insert, update, delete`.
- **Sin `GRANT ALL`.**
- **Sin `ALTER DEFAULT PRIVILEGES`**: cada tabla futura de Quality tendrá que declarar los suyos.
  Es deliberadamente incómodo — un olvido se nota, un *default* permisivo no.
- `revoke truncate, references, trigger` de `anon` y `authenticated`. `TRUNCATE` **bypasea la
  RLS**; `REFERENCES` y `TRIGGER` son DDL.
- `revoke all … from anon`: ninguna superficie de Quality es pública.

> Durante el primer `db reset` se descubrió que `anon` había recibido
> `REFERENCES,TRIGGER,TRUNCATE` por la ACL por defecto del rol `postgres` al crear las tablas.
> Los bloques de revocación se añadieron a §12 por eso. Sin la verificación explícita de
> privilegios, habría pasado inadvertido.

Detalle completo en `QUALITY_01_SCHEMA.md`.

---

# D. Tablas nuevas

Once, todas con `organization_id` explícito y RLS activa.

| # | Tabla | Papel |
|---|---|---|
| 1 | `quality_process_categories` | Catálogo: base global + categorías propias de la empresa |
| 2 | `quality_positions` | **El Cargo** — sujeto estable de la responsabilidad (T-02) |
| 3 | `quality_position_assignments` | Persona ↔ cargo, **con vigencia empresarial** (T-01) |
| 4 | `quality_processes` | Identidad del proceso; `owner_position_id` |
| 5 | `quality_process_revisions` | Contenido versionado, inmutable al publicar |
| 6 | `quality_process_io` | Entradas y salidas — **de la revisión**, no del proceso |
| 7 | `quality_process_interactions` | Relación estructurada entre procesos (DA-06) |
| 8 | `quality_process_maps` | Identidad del mapa |
| 9 | `quality_process_map_versions` | Versiones del mapa, con publicación y vigencia |
| 10 | `quality_process_map_nodes` | Qué proceso, en qué categoría, en qué orden (DA-04) |
| 11 | `quality_process_documents` | Puente con TrazaDocs — **referencia, jamás copia** (T-03) |

Más **4 RPC** atómicas, **1 vista** con `security_invoker` y **7 funciones de trigger** propias.

### Por qué exactamente estas y no más

El MDR propone más entidades. Se crearon **solo** las necesarias para este vertical. Se descartó
deliberadamente crear ahora: competencias, evaluaciones, capacitación, desempeño, y un motor de
evidencia propio de Quality.

Tres decisiones de modelado que merecen justificarse, porque no son obvias:

- **Las entradas y salidas cuelgan de la REVISIÓN, no del proceso.** Si colgaran del proceso,
  publicar no congelaría nada de verdad: bastaría con editar las entradas para cambiar lo
  publicado por la puerta de atrás.
- **`category_code` es texto validado por trigger, no una FK.** La categoría puede ser global
  (`organization_id is null`) o de la empresa, y una FK no puede expresar "una de las dos".
- **No hay política de DELETE sobre cargos ni procesos.** Borrar un cargo rompería el histórico
  de propiedad; borrar un proceso se llevaría por delante sus revisiones publicadas, que son la
  respuesta a "qué regía el 14 de marzo".

---

# E. Tablas reutilizadas / evolucionadas

**Ninguna tabla existente fue alterada estructuralmente.** Quality se apoya en lo que ya había:

| Tabla | Uso | Clasificación |
|---|---|---|
| `organizations` | `organization_id` de las 11 tablas | **REUTILIZAR** |
| `profiles` | Personas asignadas a cargos; `created_by`, `published_by` | **REUTILIZAR** |
| `memberships` | El trigger de asignación exige membresía activa | **REUTILIZAR** |
| `trazadoc_documents` | Referenciada por FK compuesta (T-03) | **REUTILIZAR** |
| `modules` | Una fila actualizada: `quality` → funcional | **EVOLUCIONAR** (dato, no esquema) |
| `audit_log` | Los triggers `audit_row_change()` escriben ahí | **REUTILIZAR** |

Helpers reutilizados sin tocar: `is_org_member`, `has_org_role`, `set_updated_at`,
`prevent_organization_id_change`, `force_created_by`, `audit_row_change`.

**No se creó un motor de evidencia paralelo** (T-03). **No se crearon documentos Quality
paralelos**: el punto 8 del alcance se cumple referenciando TrazaDocs.

---

# F. RLS

Las once tablas con `enable row level security` y políticas *deny-by-default*.

### El mecanismo central: FK compuestas

**19 claves foráneas compuestas** `(organization_id, …)`. Una FK simple sobre `owner_position_id`
dejaría que un proceso de la empresa A apuntara a un cargo de la empresa B — sería una fila
perfectamente válida para la base. La FK compuesta lo hace **estructuralmente imposible**, sin
depender de que ninguna política se acuerde de mirar.

Incluye la que une Quality con TrazaDocs, de modo que un proceso solo puede referenciar
documentos de **su** empresa, y lo garantiza la base.

### Comprobado con ataques reales desde otra empresa

| | |
|---|---|
| B no ve **ninguna** fila de las 10 tablas de datos de A | ✔ |
| B no puede escribir dentro de A | ✔ |
| B no puede publicar una revisión de A **ni con la RPC** | ✔ |
| B no ve a qué procesos de A pertenece un documento | ✔ |
| Un proceso de A no puede tener como propietario un cargo de B | ✔ |
| Un proceso de A no puede asociar un documento de B | ✔ |
| No se puede asignar a un cargo alguien que no es miembro | ✔ |
| Desde la interfaz: la **URL exacta** de un proceso ajeno da **404**, no 403 | ✔ |

Detalle en `QUALITY_01_RLS_SECURITY.md`.

---

# G. Privilegios

| Comprobación | Esperado | LOCAL | STAGING |
|---|---|---|---|
| Privilegios de `anon` sobre `quality_*` | 0 | **0** | **0** |
| `TRUNCATE`/`REFERENCES`/`TRIGGER` de rol cliente | 0 | **0** | **0** |
| `authenticated` sobre `quality_positions` | DML | `DELETE,INSERT,SELECT,UPDATE` | ídem |
| Tablas `quality_*` sin RLS | 0 | **0** | **0** |
| Vista con `security_invoker` | sí | **sí** | **sí** |

Las 4 RPC se revocan de `public` y `anon`, y se conceden solo a `authenticated`. Son
`SECURITY DEFINER` porque tocan varias filas de forma atómica, pero resuelven la identidad con
`auth.uid()`: **jamás suplantan a nadie**.

**`service_role` no participa en ninguna ruta de la aplicación.** Comprobado de forma estática,
no revisado a ojo (comprobaciones 21, 22 y 29 de `test:quality01`).

---

# H. UI

Cinco rutas, todas bajo `app/(app)/(shell)/quality/`, todas `force-dynamic`, todas protegidas por
el guard del layout del namespace — de modo que **cualquier ruta futura queda protegida por
defecto**.

| Ruta | Qué hace |
|---|---|
| `/quality` | Inicio: el recorrido en tres pasos, con los **contadores reales** de la empresa |
| `/quality/positions` | Cargos, titular vigente e historial de asignaciones |
| `/quality/processes` | Listado y alta |
| `/quality/processes/[processId]` | El detalle completo |
| `/quality/map` | El mapa por categorías, con sus versiones |

Más un panel insertado en el detalle de TrazaDocs (`components/domain/quality/document-processes-panel.tsx`).

### Un principio que gobierna toda la interfaz

**Solo el borrador se edita.** Cuando se muestra una versión publicada, los formularios
desaparecen y en su lugar aparece la explicación de por qué y qué hacer. No es la barrera —los
triggers lo son— pero evita ofrecer acciones que la base va a rechazar.

Las comprobaciones 6 y 7 del recorrido HTTP verifican la **ausencia** de esas acciones, no solo la
presencia de un texto: una interfaz que siguiera ofreciendo "guardar borrador" sobre una versión
publicada pasaría una prueba de presencia y falla ésta.

### Decisiones de UX que conviene señalar

- El desplegable de propietario ofrece **solo cargos**. Es la forma de que la pantalla exprese
  T-02 sin tener que explicarlo dos veces.
- Cuando el rol no permite publicar, en lugar de esconder el botón sin más se dice por qué:
  *"Publicar corresponde a la administración o al área de calidad."*
- El panel inverso en TrazaDocs **calla en silencio** si Quality no está habilitado. Un aviso del
  tipo "Quality no está disponible" en una pantalla de TrazaDocs delataría la existencia del
  módulo a quien no debe conocerlo.

---

# I. Cargos

Todo lo pedido en el punto 1 del alcance:

| Requisito | Estado |
|---|---|
| Identidad estable del cargo | ✔ |
| Código opcional | ✔ (único por empresa cuando se usa) |
| Nombre | ✔ (único por empresa, sin distinguir mayúsculas) |
| Descripción | ✔ |
| Unidad/área | ✔ (`org_unit`) |
| Activo/inactivo | ✔ (se **desactiva**, no se borra) |
| Asignación Persona ↔ Cargo | ✔ |
| Vigencia de asignación | ✔ (`effective_from` / `effective_to`) |
| Organización | ✔ |
| RLS | ✔ |
| Histórico necesario | ✔ (cerrar vigencia conserva la fila) |

Dos reglas que impone la base por sí sola: **un solo titular vigente** por cargo (suplencias y
delegaciones sí pueden coexistir), y **solo miembros activos** de la empresa pueden ser
asignados.

**No implementado, según lo pedido:** competencias completas, evaluaciones, capacitación,
conocimiento, desempeño individual.

---

# J. Procesos

| Requisito | Estado |
|---|---|
| `id`, `organization_id`, código, nombre | ✔ |
| Propósito, alcance | ✔ (en la **revisión**, que es donde se versiona) |
| Categoría | ✔ (validada contra el catálogo) |
| **Propietario = Position** | ✔ FK compuesta a `quality_positions` |
| Estado administrativo | ✔ `draft` / `active` / `retired` |
| Revisiones | ✔ |
| Vigencia | ✔ |
| Creación, edición | ✔ |
| **Edición mediante nueva revisión** | ✔ La nueva **copia** la vigente y nace en borrador |
| Publicación | ✔ RPC atómica, solo `admin`/`quality` |
| **Retiro sin destruir histórico** | ✔ Cambio de estado, jamás un borrado |

**Process ≠ Procedure** se respeta: `quality_processes` no contiene pasos, actividades ni
diagramas de flujo. Un procedimiento es un documento y vive en TrazaDocs.

### Entradas y salidas (punto 4)

Estructura real, **sin JSON opaco**: `quality_process_io` con `name`, `description`, `sort_order`,
`direction` (`input`/`output`) y `io_kind` (seis valores). Pertenecen a la revisión.

### Interacciones (punto 5)

`quality_process_interactions` expresa origen, destino, **qué salida concreta alimenta qué entrada
concreta**, descripción y orden. Se guarda una vez y se lee desde ambos extremos.

Un trigger comprueba que la salida referenciada pertenece de verdad al proceso origen y la
entrada al destino: sin él se podría enlazar la salida de un tercer proceso y el mapa mentiría.

**El mapa no es una imagen**: existe la relación aunque nadie haya dibujado nada.

---

# K. Mapas

| Requisito | Estado |
|---|---|
| Identidad del mapa | ✔ (uno por defecto por empresa) |
| Versión versionada/inmutable | ✔ |
| Grupos / nodos | ✔ por categoría, con orden |
| Borrador | ✔ |
| Edición | ✔ solo en borrador |
| Publicación | ✔ solo `admin`/`quality`; **rechaza un mapa vacío** |
| Versión publicada oficial | ✔ |
| Histórico de versiones | ✔ |
| Consulta de la vigente | ✔ |

**DA-04 respetado:** cada bloque del mapa es un proceso **real** (`process_id` es una FK
compuesta, no un texto libre); al pulsarlo se abre su detalle.

### UX del mapa (punto 7)

Bandas horizontales por categoría, en orden de lectura de arriba abajo:
**Estratégicos → Misionales → De apoyo → De gestión del sistema**. Cada bloque muestra el nombre
del proceso, su código y su cargo propietario.

Sin BPMN, según lo pedido: se priorizó claridad, simplicidad, edición usable y lectura gerencial.

Un detalle deliberado: una categoría **propia de la empresa** no desaparece del mapa por no ser
una de las cuatro base — se muestra después, alfabéticamente. Está comprobado (comprobación 17).

---

# L. Versiones

El corazón del sprint, y donde se concentra la mayor densidad de pruebas.

| Garantía | Cómo se impone |
|---|---|
| Un solo borrador abierto por proceso | Índice único parcial |
| Una sola versión vigente | Índice único parcial |
| **Publicada = inmutable** | Trigger que revierte el cambio |
| Las entradas/salidas de lo publicado tampoco cambian | Política + trigger sobre `quality_process_io` |
| Publicar cierra la vigencia de la anterior | RPC atómica, una sola transacción |
| Nunca dos versiones vigentes el mismo día | El día de cierre pertenece ya a la siguiente |
| **"Qué regía el 15 de febrero"** tiene una única respuesta | ✔ comprobado |

La inmutabilidad se impone en **tres puntos** porque cada uno cierra una puerta distinta: la fila
de la revisión, sus entradas/salidas, y los nodos de la versión del mapa.

> Detalle de la prueba 20: el `UPDATE` sobre una revisión publicada **no da error** — el trigger
> lo revierte. La prueba comprueba el **estado resultante**, no el código de error. Comprobar solo
> el error habría dejado pasar un trigger que no revierte nada.

Abrir una revisión es **idempotente**: pulsar dos veces —o un doble envío del formulario— devuelve
el borrador que ya estaba abierto en lugar de crear un segundo y fallar con un error
incomprensible.

---

# M. TrazaDocs

Punto 8 del alcance, completo:

| Requisito | Estado |
|---|---|
| Asociar uno o varios documentos **existentes** | ✔ |
| Consultar los documentos desde el proceso | ✔ |
| **Consultar los procesos desde TrazaDocs** | ✔ panel en el detalle del documento |
| Preservar organización | ✔ FK compuesta contra `trazadoc_documents` |
| Preservar RLS | ✔ |
| **No duplicar el documento** | ✔ comprobado: Quality no crea documentos |

Quitar la asociación borra la relación; **el documento no se toca**.

El panel inverso resuelve un problema concreto: quien mantiene TrazaDocs no tenía forma de saber
a qué procesos afecta un documento antes de marcarlo obsoleto. Ahora lo ve, con una advertencia
explícita.

**No se implementó D-01…D-30**, según lo pedido: solo la integración necesaria para este vertical.

---

# N. Pruebas

**98 comprobaciones propias**, en tres suites que miran cosas distintas:

| Suite | Comando | Nº | LOCAL | STAGING |
|---|---|---|---|---|
| Unitaria / estática | `npm run test:quality01` | 32 | ✅ | n/a |
| RLS contra base real | `npm run test:quality01-rls` | 56 | ✅ | ✅ **56/56** |
| Recorrido HTTP autenticado | `npm run test:quality01-ui` | 10 | ✅ | ✅ **10/10** |

La tercera existe porque las dos primeras dejaban una franja ciega — y esa franja tenía un fallo
real dentro (sección S). Detalle completo en `QUALITY_01_TEST_MATRIX.md`.

### Regresión de plataforma

`npm run test:all` (~1.400 comprobaciones, 80 suites) → **exit 0**.
`typecheck` limpio · `lint` 0 errores (1 aviso preexistente, ajeno) · `build` compila.

Suites de RLS con base real: `test:rls` 110/110, `t9f-rls`, `t9f1-rls`, `t9f2-rls`, `t9f4-rls`,
`textiles-rls-multitenant`, `t9e2`, `t9e4` — todas en verde.

### Pruebas actualizadas — ninguna debilitada

Catorce grupos de aserciones afirmaban que Quality seguía siendo *"próximamente"*. En cada caso
se sustituyó la afirmación que había dejado de ser cierta por la equivalente sobre el estado
nuevo, **conservando o reforzando** lo que la prueba protegía. Por ejemplo, `launch` 22 dejó de
exigir que `/quality` no existiera y pasó a exigir que **exista con su guard** y que **ninguna
ruta de Quality viva fuera del shell**.

Tabla completa en `QUALITY_01_TEST_MATRIX.md` §6.

**No se debilitó ninguna RLS para hacer pasar una prueba. No se convirtió ningún error legítimo
de seguridad en una expectativa permisiva.**

### Hallazgo previo, corregido de paso

Tres aserciones de `v1-release` («la última migración debe ser 0110») **ya fallaban en la base de
la rama** (`ef09356`): 0111 se commiteó sin actualizarlas. Verificado ejecutando la suite en un
worktree de ese commit. Se sustituyó el número fijo por la lista declarada.

---

# O. LOCAL

`supabase db reset` completo desde cero: **104 migraciones aplicadas en orden, 0112 incluida,
sin error**.

| | |
|---|---|
| Migraciones | 104 |
| Tablas `quality_*` | 11 |
| Sin RLS | 0 |
| Privilegios de `anon` | 0 |
| `TRUNCATE`/`REFERENCES`/`TRIGGER` de rol cliente | 0 |
| Categorías base sembradas | 4 |
| `modules.quality.is_functional` | `true` |

Tras el reset: `test:rls` 110/110, `test:quality01-rls` 56/56, `test:quality01-ui` 10/10.

`QUALITY_MODULE_ENABLED=true` en `.env.local`, y documentada en `.env.example` con la nota de que
en **Producción debe quedar sin definir**.

---

# P. STAGING

**Destino:** `qchzkxbnbqeyuxinipln` — `trazaloop-staging-qa`. Verificado explícitamente antes de
escribir, con aborto previsto si coincidía con Production.

```
db push --dry-run  →  solo 0112
db push            →  exit 0
```

Migraciones remotas: 103 → **104**. Sin `migration repair`. Sin marcar nada como aplicado sin
ejecutarlo.

El estado resultante es **idéntico** al local en las once comprobaciones de la sección G. La
preocupación de Q0 —que un entorno gestionado se comporte distinto en materia de privilegios— **no
se materializó**.

El repositorio sigue **desvinculado**: toda operación remota exige `--project-ref` explícito, así
que no existe destino implícito posible.

Detalle en `QUALITY_01_STAGING_DEPLOYMENT.md`.

---

# Q. Preview

| | |
|---|---|
| Variable añadida | `QUALITY_MODULE_ENABLED = true`, entorno **Preview** |
| Despliegue | `https://trazaloop-production-c6z5p4d1h-idendi-latam-s-projects.vercel.app` |
| Estado | **Ready** (2 min) |
| Target | `preview` |

Preview apunta **exclusivamente** a Staging.

### Production, intacta

```
$ vercel env ls production | grep -ci quality
0
```

Las siete variables de Production siguen con 26 días de antigüedad: **ninguna creada, modificada
ni eliminada**. Sin `QUALITY_MODULE_ENABLED`, `/quality` respondería 404 allí aunque el código
llegara.

---

# R. Smoke

### Contra Staging, con sesión real — 10/10

```
✔ /quality abre y resume el estado real de la empresa
✔ /quality/positions muestra el cargo y su titular vigente
✔ /quality/processes lista los procesos con su cargo propietario
✔ El detalle reúne propósito, entradas, salidas, relaciones y documento
✔ /quality/map agrupa los procesos por categoría
✔ Publicado el proceso, la pantalla lo presenta como oficial NO editable
✔ Publicado el mapa, la versión vigente se consulta y no se edita
✔ Otra empresa no ve nada de esto, ni con la URL exacta
✔ Sin sesión, /quality no entrega contenido
✔ Con el kill switch APAGADO, /quality no existe ni con sesión válida
```

La última verifica además que `/dashboard` sigue devolviendo 200 en el mismo servidor: **el switch
apaga Quality, no la plataforma**.

### Sobre el SSO de Vercel

Los despliegues Preview están tras la autenticación SSO de Vercel (gap G-2 documentado en Q0):
todas las rutas devuelven `302 → vercel.com/sso-api`.

**No se desactivó el SSO ni se creó un token de omisión**, porque es una opción **a nivel de
proyecto** y el proyecto de Vercel es compartido con Production: relajarla expondría también los
despliegues de producción. Es la misma decisión que se tomó en el cierre de Q0.

Por eso la validación de la capa de aplicación contra Staging se hizo ejecutando el build de
producción localmente **contra la base de Staging** — que ejercita exactamente el mismo código
con exactamente los mismos datos. El Preview **es navegable por ti** con tu cuenta del equipo.

---

# S. Gaps

## S.1 · Un fallo real encontrado y corregido en este sprint

`lib/db/module-access.ts` resolvía el kill switch comparando a mano el nombre de la variable, y
**solo conocía la de Textiles**:

```ts
if (mod.killSwitchEnv === "TEXTILES_MODULE_ENABLED") return isTextilesModuleEnabled();
return mod.killSwitchEnv === null;   // ← cualquier otro módulo caía aquí
```

Un módulo nuevo con kill switch caía por el `return` final y quedaba **denegado en silencio**,
aunque su variable estuviera encendida y la empresa lo tuviera asignado.

**No lo detectaron ni el typecheck, ni el build, ni las 56 comprobaciones de RLS.** Solo apareció
al pedir `/quality` por HTTP con una sesión real. Sin el recorrido HTTP, el sprint habría llegado
a Staging con Quality inaccesible y con toda la suite en verde.

Corregido: ahora se resuelve por catálogo, para cualquier módulo. La comprobación 3 de
`test:quality01` recorre **todos** los módulos y verifica que cada uno se enciende con su
variable, se apaga sin ella y **no** se enciende con una ajena.

## S.2 · Dos formas de obtener un verde falso, cerradas

Aparecieron al ejecutar las suites contra Staging:

- **Mezcla de entornos.** `dotenv` no pisa las variables exportadas, pero **sí rellena las que
  falten**. Apuntando la API a Staging y olvidando `SUPABASE_DB_URL`, las cinco comprobaciones
  por SQL se ejecutaban contra la base **local** y la suite decía "54 en verde" sin haber mirado
  Staging. Ahora se exige que ambas señalen al mismo proyecto y se aborta si no.
- **Cookie de sesión fijada al proyecto local.** Contra Staging el servidor no veía sesión y todo
  redirigía a `/login`: nueve fallos que parecían de la aplicación. Ahora se deriva del host y
  una comprobación previa lo diagnostica con un solo mensaje claro.

## S.3 · Limitaciones del entorno, no del código

| # | Situación | Impacto | Bloquea |
|---|---|---|---|
| G-1 | Preview tras SSO de Vercel | No navegable sin cuenta del equipo; no probable por HTTP anónimo | No |
| G-2 | Staging sin SMTP | Invitar a un usuario nuevo por correo no es ejercitable en Staging; los usuarios se crean directamente | No |
| G-3 | `NEXT_PUBLIC_SITE_URL` de Preview apunta a un despliegue concreto, no a un alias estable | Heredado de Q0 | No |

## S.4 · Dos fallos ajenos, deliberadamente no tocados

| Suite | Situación |
|---|---|
| `test:t9f3-rls` | Las 16 comprobaciones pasan; fallan **2 residuos de limpieza** al no poder borrar un usuario de una organización que la propia suite conserva a propósito. **Reproducido idéntico en `ef09356`** |
| `test:rls` 80–81 | Verde desde base limpia. Al repetir sobre la misma base chocan con un token de invitación **literal** (`s10a-old-invite-token`, línea 2642), previo y ajeno a Quality |

No se modificaron: corregirlos habría sido tocar código fuera del alcance de este sprint.

## S.5 · Un cambio de comportamiento observable

`modules.quality.is_functional = true` hace que **una empresa nueva reciba Quality en Demo de
48 h** junto a CPR y Textiles, porque la provisión sigue exactamente a esa columna. Es necesario
para que el módulo sea asignable.

Que la asignación exista **no** significa que el módulo sea accesible: el kill switch decide eso,
y en Production está apagado. Se documenta aquí porque es un efecto derivado que no se pidió
explícitamente y conviene que esté sobre la mesa.

---

# T. Deuda deliberadamente pospuesta

Todo lo de esta lista se dejó fuera **a propósito**, no por falta de tiempo.

### Excluido por el propio encargo

| Área | Nota |
|---|---|
| Competencias, evaluaciones, capacitación, conocimiento, desempeño | Punto 1: "no implementar todavía" |
| D-01…D-30 de TrazaDocs | Punto 8: "solo la integración necesaria para este vertical" |
| BPMN completo | Punto 7: "no necesitamos BPMN completo" |
| Motor de evidencia propio de Quality | T-03: se referencia, no se duplica |

### Decisiones tomadas dentro del alcance

| Decisión | Razón |
|---|---|
| Sin límites por plan para Quality | Ningún recurso consume almacenamiento; no hay superficie de abuso por tamaño |
| Sin auditoría en `map_nodes` ni `process_documents` | Son relaciones puras; su historial lo aporta el versionado del mapa y el del documento |
| Sin reordenar nodos por arrastre | Hay `sort_order` en el esquema; la interfaz aún no lo expone |
| Sin exportar el mapa a PDF/imagen | No estaba en el alcance |
| Sin flechas dibujadas entre bloques | Las interacciones se leen como listas en el detalle. El dato está completo y estructurado; el dibujo es incremental |
| Sin categorías propias desde la interfaz | El esquema ya las soporta; falta la pantalla de gestión |
| Sin cifrado a nivel de campo | Ningún dato de Quality se considera especialmente sensible en este corte |

### Trabajo de higiene detectado y no realizado

| Tema | Nota |
|---|---|
| Token literal en `tests/rls/isolation.test.ts:2642` | Hace la suite no repetible sobre la misma base |
| Residuos de limpieza en `t9f3-rls` | Preexistente en `ef09356` |
| El aviso de lint en `textiles-evidences-hardening.test.ts:40` | Preexistente, ajeno |

---

# U. Siguiente sprint recomendado

**No se ha empezado QUALITY-02.** Esto es una recomendación, no trabajo hecho.

### La pregunta que Quality todavía no puede responder

QUALITY-01 responde *"qué procesos tenemos, quién responde por cada uno y cómo se relacionan"*.
La siguiente pregunta natural de un sistema de gestión de la calidad es
**"¿y esto se está cumpliendo?"**.

Eso apunta a **procedimientos y su ejecución**, no a más metadatos del proceso.

### QUALITY-02 sugerido — Procedimientos y su vínculo con el proceso

1. **Aprovechar lo que ya existe.** `Process ≠ Procedure` está respetado: un procedimiento es un
   documento y vive en TrazaDocs. El vínculo ya está construido. QUALITY-02 debería **profundizar
   ese vínculo**, no crear un motor de documentos paralelo.
2. **Cerrar el ciclo del cargo.** Hoy un cargo tiene titular; todavía no tiene responsabilidades
   declaradas ni relación con los procedimientos que debe conocer. Es el puente natural hacia
   competencias, sin construir todavía todo RRHH.
3. **Completar la experiencia del mapa**, si el uso real lo pide: reordenar por arrastre,
   representar visualmente las interacciones, exportar. Recomiendo **esperar a ver el mapa con
   datos reales de una empresa** antes de invertir aquí: es donde más fácil resulta construir algo
   vistoso que nadie necesita.

### Antes de QUALITY-02, dos cosas pequeñas

- **Probar QUALITY-01 con una empresa real.** El diseño de las entradas/salidas y de las
  interacciones es la parte con más supuestos sobre cómo trabaja de verdad una organización.
  Merece contraste antes de construir encima.
- **Decidir sobre la asignación automática en Demo** (S.5). Si no se quiere que toda empresa nueva
  reciba Quality, es un cambio de una línea y conviene tomarlo conscientemente.

---

## Documentos de este sprint

| Documento | Contenido |
|---|---|
| `QUALITY_01_IMPLEMENTATION_REPORT.md` | Este informe |
| `QUALITY_01_SCHEMA.md` | Las 11 tablas, las 4 RPC, la vista, y por qué tienen esa forma |
| `QUALITY_01_RLS_SECURITY.md` | Las cuatro barreras, aislamiento, autorización, inmutabilidad |
| `QUALITY_01_TEST_MATRIX.md` | Las 98 comprobaciones, una por una |
| `QUALITY_01_STAGING_DEPLOYMENT.md` | Qué se ejecutó, contra qué proyecto y qué NO se tocó |
| `QUALITY_01_ROLLBACK.md` | Tres niveles de reversión, de apagar el switch a eliminar el esquema |
