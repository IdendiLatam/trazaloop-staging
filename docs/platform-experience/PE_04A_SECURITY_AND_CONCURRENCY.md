# PE-04A · Seguridad, concurrencia y aislamiento

---

## 1 · Dos ejes, y no se sustituyen

| | ENTITLEMENT | AUTORIZACIÓN |
|---|---|---|
| Pregunta | ¿A qué tiene derecho **la empresa**? | ¿Qué puede hacer **esta persona**? |
| Sujeto | Organización | Persona dentro de la organización |
| Vive en | Plan, módulos, límites | RLS, `memberships`, rol |
| Si falta | «Tu plan no incluye esto» | «No tienes permiso» |

Las dos combinaciones que hay que probar en las dos direcciones:

- **Plan de pago + persona sin permiso → RECHAZADO.** Pagar no da permisos.
- **Persona administradora + empresa sin derecho → RECHAZADO.** Mandar no compra.

> **PEC-31.** Una comprobación de plan **nunca** sustituye a una comprobación de
> autorización, ni al revés. Toda operación pasa por las dos.

El código de hoy ya lo hace bien y conviene decir por qué: en
`enforce_module_resource_limit`, cuando el motivo es `not_member`, el disparador
**devuelve `new` y deja que la RLS deniegue con su error estándar**. No decide
aislamiento. Ese es el patrón a conservar.

---

## 2 · RLS: el plan no abre puertas entre empresas

El catálogo de planes es **global de plataforma** y se puede leer. La asignación
es **de una empresa** y solo la ven sus miembros y el personal de plataforma.

| Objeto | Quién lee |
|---|---|
| `plans` / `plan_revisions` publicadas | Cualquiera con sesión · la vista pública, incluso `anon` |
| Revisiones en borrador | **Solo `platform_staff`** |
| `organization_plan_assignments` | Miembros de esa empresa + `platform_staff` |
| Uso y contadores | Miembros de esa empresa + `platform_staff` |
| Techos de coste, notas operativas | **Solo `platform_staff`** |

El error a evitar: que «el catálogo es compartido» se cuele hasta «la asignación
es legible». Son tablas distintas con políticas distintas.

Y la trampa de 0141, que este repositorio ya pagó una vez: **una subconsulta
dentro de una política se evalúa con la identidad de quien llama**, así que la
RLS de la tabla referenciada puede devolver cero filas en silencio. Toda
comprobación de plan dentro de una política tiene que ir por una función
`security definer` con `search_path` fijo — como ya hacen `is_org_member` y
`resolve_organization_module_access`.

> **PEC-32.** Las comprobaciones de plan dentro de políticas van por funciones
> `security definer`. Nunca subconsulta directa.

---

## 3 · Concurrencia

### Lo que ya está resuelto, y hay que copiar

**Conteos.** `enforce_module_resource_limit` toma
`pg_advisory_xact_lock(hash('module_resource:' || org || '/' || módulo || '/' ||
recurso))` **antes** de contar. Dos creaciones simultáneas del último recurso
permitido quedan en fila; la segunda ve el conteo ya incrementado y se rechaza.
Cero contención entre empresas o recursos distintos.

**Almacenamiento.** `begin_cpr_storage_upload` toma
`pg_advisory_xact_lock(hash('module_storage:' || org || '/' || módulo))` y
comprueba **comprometido + reservado + este archivo**. La reserva es lo que
impide que dos subidas de 30 MB pasen las dos con 50 MB libres.

Las dos son ya la respuesta correcta a la pregunta del encargo: con `restante =
1`, dos operaciones simultáneas no pasan las dos.

### Lo que falta

**El uso de IA no tiene reserva.** `intelligence_usage_guard` cuenta y decide sin
bloqueo, así que dos consultas simultáneas en el límite pueden pasar las dos.

Hoy es tolerable: el desbordamiento máximo es la concurrencia (8), y el coste de
una consulta de más es pequeño. **Cuando la cuota de IA sea comercial y de pago,
deja de serlo**: un cliente que ve 41 consultas cobradas sobre un plan de 40
tiene razón.

> **PEC-33.** Todo límite **duro** con coste real necesita reserva atómica antes
> de gastar. Contar y decidir sin bloqueo solo vale para límites blandos.

**Recomendación:** el mismo bloqueo consultivo por `(empresa, recurso)` que ya
funciona en las otras dos. No hace falta inventar nada.

---

## 4 · Las otras vías de abuso

| Vía | Estado | Qué hace falta |
|---|---|---|
| **Límite solo en el navegador** | El servidor ya manda en todo | Prueba estática que lo vigile |
| **`organization_id` desde el cliente** | Nunca se acepta: sale de la sesión | Conservarlo |
| **Reloj del cliente** | Todas las ventanas usan `now()` del servidor | Conservarlo |
| **Idempotencia** | `storage_upload_intents.idempotency_key`, con revivido y caducidad | Copiar el patrón |
| **Multiplicar cuota invitando gente** | **Abierto**: el límite diario es por persona | Ver [uso diario](PE_04A_DAILY_USE_ARCHITECTURE.md) §3 |
| **Reservas abandonadas** | Cuentan hasta resolverse; hay huérfanos y TTL | Conservarlo |

La quinta es la única realmente abierta, y solo importa cuando exista un plan
gratuito: hoy nadie invita gente para conseguir cuota de IA porque no hay Free.

---

## 5 · Fallar cerrado sin mentir

Es la lección de PE-01 aplicada al comercio: **no disponible no es lo mismo que
ausente.**

| Situación | Qué se hace | Qué se dice |
|---|---|---|
| No se pudo leer el plan | **Denegar** la capacidad de pago | «No se pudo comprobar tu plan ahora mismo. Inténtalo de nuevo.» |
| No se pudo leer el uso | **Denegar** la operación medida | «No se pudo verificar tu uso.» |
| La empresa no tiene el derecho | Denegar | «Tu plan no incluye esto» |

Lo prohibido son las dos mentiras simétricas:

- **Conceder** una función de pago porque falló la lectura. Regalar por avería.
- **Decirle «eres Free» a un cliente Full** porque falló la lectura. Es
  exactamente el defecto que este sprint investigó: la consola dice «Plan Demo»
  y no es verdad.

Hoy `getOrganizationEffectivePlanCode` devuelve `'demo'` ante cualquier error.
Falla cerrado —bien— y **al mismo tiempo miente sobre la identidad del plan**,
porque no distingue «es demo» de «no pude saberlo».

> **PEC-34.** El resolutor devuelve **tres** respuestas: el plan, «sin derecho»
> y **`ENTITLEMENT_UNAVAILABLE`**. La tercera deniega igual que la segunda y
> **no se muestra como un plan**.

Ya existe el precedente: `RESOURCE_USAGE_UNVERIFIABLE` y
`STORAGE_QUOTA_UNVERIFIABLE` son exactamente eso, y son de este repositorio.

---

## 6 · Coherencia entre lo que ve cada quien

El encargo lo marca como invariante crítico, y con razón — hoy se incumple:

```
la consola dice        Plan Demo · 50 MB
la subida aplica       500 MB
```

**Un solo resolutor.** La consola, la tarjeta de uso de la empresa y la puerta de
subida llaman a la misma función y muestran el mismo número.

> **PEC-35.** Superadministrador, cliente y servidor leen el uso y el límite del
> **mismo resolutor**. Cualquier pantalla que calcule por su cuenta es un defecto.

Y una prueba que lo vigile: para una empresa dada, comparar el límite que
devuelve la consola, el que devuelve la tarjeta y el que aplicaría la subida.
Los tres tienen que ser el mismo número.

---

## 7 · Privacidad

| Dato | Qué es | Implicación |
|---|---|---|
| Bytes almacenados, conteos | Ya se guardan | Ninguna nueva |
| Consultas de IA **por persona** | Ya se guardan con `actor_id` | Es dato de una persona identificada |
| Tickets de soporte | Ya se guardan | Ninguna nueva |

La medición de uso es **dato operativo ordinario**, y la política de privacidad
v1.1 ya cubre el tratamiento de datos de uso.

**Un aviso, sin alarmismo:** si un límite diario **por persona** llega a
mostrarse al administrador de la empresa —«quién gastó la cuota»—, eso es
medición individual del trabajo de alguien. Hoy la interfaz enseña «tuyas hoy»
solo a uno mismo, que es la forma correcta.

> **Bandera legal.** Si PE-04B expone el uso por persona a terceros dentro de la
> empresa, hay que revisar la política de privacidad **antes** de Producción. No
> es un bloqueante de PE-04A y no se reescribe nada aquí.

---

## 8 · Retención

**Bajar de plan o cancelar no borra datos de negocio.** Nunca.

El borrado como mecanismo de cobro está prohibido: los documentos, las
evidencias y la trazabilidad son de la empresa, no de Trazaloop. Una política de
retención —si algún día existe— será una decisión aparte, escrita, avisada y con
plazo. No un efecto colateral de dejar de pagar.

> **PEC-36.** Ninguna transición comercial borra datos de negocio. La retención,
> si llega, es una política propia y explícita.
