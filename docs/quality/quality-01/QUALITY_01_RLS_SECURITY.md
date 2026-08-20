# QUALITY-01 · Seguridad y aislamiento multiempresa

**Alcance:** las once tablas de `0112_quality_process_foundation.sql`, sus cuatro RPC y la vista.
**Verificado en:** LOCAL y STAGING (`qchzkxbnbqeyuxinipln`), 54/54 comprobaciones en ambos.

---

## 1. El principio: cuatro barreras, no una

Cada operación de Quality atraviesa cuatro comprobaciones independientes. No es redundancia por
exceso de celo: cada capa protege contra un fallo distinto, y ninguna de ellas basta sola.

| Capa | Dónde | Contra qué protege | Si falla sola |
|---|---|---|---|
| **1. Interfaz** | componentes | Ofrecer acciones imposibles | Nada: es cortesía, no barrera |
| **2. Server action** | `server/actions/quality-processes.ts` | Cliente manipulado, módulo no habilitado, rol insuficiente | La capa 3 y 4 siguen deteniendo |
| **3. RLS + triggers** | base de datos | Todo lo anterior, más acceso directo con la clave pública | Última barrera efectiva |
| **4. Privilegios de rol** | `GRANT`/`REVOKE` de 0112 | Operaciones que **saltan** la RLS (`TRUNCATE`) | No hay más abajo |

La regla operativa que se deriva: **ocultar un botón jamás es la barrera**. La interfaz esconde
"Publicar" a un `consultant` para no ofrecer algo que va a fallar; si alguien llama la acción de
todos modos, la RPC lo rechaza en la base.

---

## 2. Aislamiento multiempresa

### 2.1 La forma del esquema hace difícil el error

Cada tabla lleva `organization_id` **explícito** y declara `unique (organization_id, id)`. Eso
habilita el mecanismo central: **claves foráneas compuestas**.

```sql
constraint quality_processes_owner_position_fk
  foreign key (organization_id, owner_position_id)
  references public.quality_positions (organization_id, id)
```

Una FK simple sobre `owner_position_id` dejaría que un proceso de la empresa A apuntase a un
cargo de la empresa B: sería una fila perfectamente válida para la base. La FK compuesta lo hace
**estructuralmente imposible**, sin depender de que ninguna política ni ninguna comprobación de
la aplicación se acuerde de mirar.

Hay **19 FK compuestas** en 0112. Las relaciones que cubren:

| Desde | Hacia |
|---|---|
| `quality_position_assignments` | `quality_positions` |
| `quality_processes` | `quality_positions` (el propietario) |
| `quality_process_revisions` | `quality_processes` |
| `quality_process_io` | `quality_process_revisions`, `quality_processes` |
| `quality_process_interactions` | `quality_processes` (×2), `quality_process_io` (×2) |
| `quality_process_map_versions` | `quality_process_maps` |
| `quality_process_map_nodes` | `quality_process_map_versions`, `quality_processes` |
| `quality_process_documents` | `quality_processes`, **`trazadoc_documents`** |

La última merece atención: es la que garantiza que un proceso solo pueda referenciar documentos
de su propia empresa.

### 2.2 RLS deny-by-default

Las once tablas tienen `enable row level security` y ninguna política permisiva por defecto. La
lectura se concede con `is_org_member(organization_id)`; la escritura con
`has_org_role(organization_id, array[...])`. Ambos helpers son `SECURITY DEFINER` y resuelven
contra `auth.uid()`: no aceptan el `organization_id` como afirmación del cliente, lo comprueban.

### 2.3 Comprobado, no supuesto

La suite ejecuta el ataque real desde una sesión autenticada de otra empresa:

| Comprobación | Resultado |
|---|---|
| 40. B no ve **ninguna** fila de las 10 tablas de datos de A | ✔ |
| 41. B no puede crear un cargo ni un proceso **dentro** de A | ✔ |
| 42. B no puede publicar una revisión de A **ni usando la RPC** | ✔ |
| 43. La vista de titulares aísla por empresa | ✔ |
| 13. Un proceso de A no puede tener como propietario un cargo de B | ✔ |
| 38. Un proceso de A no puede asociar un documento de B | ✔ |
| 9. No se puede asignar a un cargo alguien que no es miembro | ✔ |

Y desde la propia interfaz, con sesión real (recorrido HTTP):

| Comprobación | Resultado |
|---|---|
| 8. Otra empresa ve su estado vacío en `/quality/processes` | ✔ |
| 8. La **URL exacta** de un proceso ajeno devuelve **404**, no 403 | ✔ |

> El 404 en lugar de 403 es deliberado: un 403 confirmaría que ese identificador existe.

---

## 3. Autorización por rol

| Operación | `admin` | `quality` | `consultant` |
|---|:---:|:---:|:---:|
| Consultar todo Quality | ✔ | ✔ | ✔ |
| Crear y editar cargos, asignar personas | ✔ | ✔ | ✘ |
| Crear y editar procesos, entradas, salidas, relaciones | ✔ | ✔ | ✔ |
| Asociar documentos de TrazaDocs | ✔ | ✔ | ✔ |
| Armar el mapa | ✔ | ✔ | ✔ |
| **Publicar** revisión o mapa | ✔ | ✔ | ✘ |

Dos elecciones que conviene justificar:

- **El `consultant` documenta pero no publica.** Puede describir un proceso completo; convertirlo
  en versión oficial es un acto de la organización, no del consultor.
- **Los cargos los gestionan `admin`/`quality`.** Un cargo define quién responde por un proceso;
  no debería poder redefinirlo quien documenta.

Comprobado en la base (6, 18, 31) y en la RPC (`quality_publish_process_revision` verifica el rol
internamente, así que rechaza aunque se la llame directamente).

**La capa de plataforma sigue separada.** `platform_staff` no aparece en ninguna política de
Quality. Un superadministrador gestiona el módulo comercialmente; no lee los procesos de una
empresa por esa vía.

---

## 4. Inmutabilidad de lo publicado

Es una propiedad de **seguridad**, no solo de producto: si una versión publicada pudiera
alterarse, el sistema no podría afirmar qué regía en una fecha.

Se impone en tres puntos, porque cada uno cierra una puerta distinta:

1. **Trigger sobre la revisión** — revierte el cambio de contenido de una fila publicada.
2. **Política de las entradas/salidas** — exige `status = 'draft'` en la revisión padre. Sin esto
   se alteraría lo publicado por la puerta de atrás, sin tocar la fila protegida.
3. **Trigger sobre los nodos del mapa** — lo mismo para las versiones del mapa.

| Comprobación | Resultado |
|---|---|
| 20. Editar el contenido de una revisión publicada no surte efecto | ✔ |
| 21. Añadir una entrada a una revisión publicada se rechaza | ✔ |
| 33. Editar una versión publicada del mapa no surte efecto | ✔ |
| 34. Añadir un nodo a una versión publicada se rechaza; conserva sus 2 nodos | ✔ |
| 23. Publicar la revisión 2 cierra la vigencia de la 1 y la marca `superseded` | ✔ |
| 24. Se puede responder qué revisión regía el 15/02 — exactamente una | ✔ |

El caso 20 tiene un matiz importante: el `UPDATE` **no da error**, simplemente no cambia nada
(el trigger revierte). La prueba comprueba el **estado resultante**, no el código de error —
comprobar solo el error habría dejado pasar un trigger que no revierte.

---

## 5. Privilegios de rol: la capa que la RLS no cubre

`TRUNCATE` **no pasa por la RLS**. Un rol con ese privilegio vacía una tabla entera aunque las
políticas sean impecables. `REFERENCES` y `TRIGGER` son DDL disfrazado de privilegio de tabla.

0112 los revoca explícitamente de `anon` y `authenticated`, y revoca **todo** de `anon`.

| Comprobación (SQL directo) | Esperado | LOCAL | STAGING |
|---|---|---|---|
| 51. Privilegios de `anon` sobre `quality_*` | 0 | 0 | 0 |
| 52. `TRUNCATE`/`REFERENCES`/`TRIGGER` de rol cliente | 0 | 0 | 0 |
| 50. Tablas `quality_*` sin RLS | 0 | 0 | 0 |
| 53. Tablas sin `organization_id` | 0 | 0 | 0 |
| 54. FK compuestas | ≥ 8 | 19 | 19 |

**Ninguna superficie de Quality es pública.** No hay ruta anónima, no hay token de compartición,
`anon` no tiene privilegios y la vista tampoco se le concede.

---

## 6. `service_role` no participa

La clave secreta no aparece en ninguna ruta del flujo de la aplicación:

- `lib/db/quality-processes.ts` usa `createServerClient()` (sesión real, bajo RLS) y **no importa**
  `createAdminClient`.
- `server/actions/quality-processes.ts` tampoco.
- En 0112, `service_role` solo aparece en los `GRANT` de tabla, nunca en la lógica.

Las tres cosas están comprobadas de forma estática (comprobaciones 21, 22 y 29 de
`test:quality01`), no solo revisadas a ojo.

El `service_role` sí se usa en las **pruebas**, y únicamente para crear los usuarios de prueba —
nunca para ejercitar el comportamiento que se está midiendo. Si se usara para eso, las pruebas
pasarían saltándose la RLS que dicen verificar.

---

## 7. El kill switch como barrera de exposición

`QUALITY_MODULE_ENABLED` es lo que mantiene Quality invisible en Production.

Con el switch apagado, `requireQualityModule()` responde **`notFound()`** —404— **antes** de
exigir sesión y empresa activa. El orden importa y está comprobado (comprobación 24 de
`test:quality01`): si el switch se evaluara después, un usuario sin sesión recibiría una
redirección a `/login` en lugar de un 404, y esa diferencia de comportamiento delataría que la
ruta existe.

Un 403 o una página de "próximamente" confirmarían la existencia del módulo. Un 404 no dice nada.

| Comprobación (HTTP, sesión válida) | Resultado |
|---|---|
| 10. `/quality`, `/quality/positions`, `/quality/processes`, `/quality/map` → **404** | ✔ |
| 10. `/dashboard` sigue devolviendo 200 en el mismo servidor | ✔ |

La segunda mitad importa tanto como la primera: el switch apaga Quality, no la plataforma.

**La variable no lleva prefijo `NEXT_PUBLIC_`**, así que el navegador nunca conoce su valor.
Comprobado además que no aparece en ninguno de los cuatro componentes de cliente.

---

## 8. Un fallo real encontrado en este sprint

`lib/db/module-access.ts` resolvía el kill switch comparando a mano el nombre de la variable:

```ts
if (mod.killSwitchEnv === "TEXTILES_MODULE_ENABLED") return isTextilesModuleEnabled();
return mod.killSwitchEnv === null;   // ← cualquier otro módulo caía aquí
```

Un módulo nuevo con kill switch caía por el `return` final y quedaba **denegado en silencio**,
aunque su variable estuviera encendida y la empresa lo tuviera asignado. No lo detectaron ni el
typecheck, ni el build, ni las pruebas de RLS: solo apareció al pedir `/quality` por HTTP con
una sesión real, que redirigía a `/modules`.

Ahora se resuelve por catálogo (`isModuleKillSwitchActive`), de modo que cualquier módulo futuro
queda cubierto por construcción. La comprobación 3 de `test:quality01` recorre **todos** los
módulos del catálogo y verifica, para cada uno con switch, que se enciende con su variable, que
se apaga sin ella y que **no** se enciende con una variable ajena.

**Es la razón por la que el recorrido HTTP forma parte de los entregables.** Sin él, el sprint
habría llegado a Staging con Quality inaccesible y con toda la suite en verde.

---

## 9. Lo que esta capa NO cubre

Dicho explícitamente para que no se dé por hecho:

- **Sin cifrado a nivel de campo.** Ningún dato de Quality se considera especialmente sensible en
  QUALITY-01. Si en un sprint futuro se guardan datos personales más allá del nombre del titular
  de un cargo, habría que revisarlo.
- **Sin límites por plan.** `checkQualityCanMutate()` comprueba el modo solo lectura de
  plataforma, pero no hay cuotas de procesos ni de cargos. Ningún recurso de Quality consume
  almacenamiento, así que no hay superficie de abuso por tamaño.
- **Sin auditoría en dos tablas.** `quality_process_map_nodes` y `quality_process_documents` no
  llevan `audit_row_change()`: son relaciones puras, y su historial relevante lo aporta el
  versionado del mapa y el del documento en TrazaDocs.
- **Sin exposición pública.** No hay equivalente al pasaporte compartible de Textiles.
