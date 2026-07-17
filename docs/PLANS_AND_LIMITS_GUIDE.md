# Trazaloop · Planes, cuotas y control de acceso (Sprint 10A)

Esta guía explica los planes Demo, Full y Extra: qué incluye cada uno,
cómo se asignan y cómo se administran desde la consola de plataforma.

## 1. Qué son Demo, Full y Extra

Un **plan** pertenece a la **empresa** (organización), nunca a un usuario
ni a un rol de membership — es una capa completamente separada de
`memberships`/`platform_staff`.

- **Demo**: plan de prueba, con límites reducidos en casi todos los
  recursos. Se asigna automáticamente a toda empresa nueva.
- **Full**: sin límites en los recursos funcionales (proveedores,
  materiales, productos, evidencias, lotes, documentos TrazaDocs,
  equipo), con roles/invitaciones, recomendaciones avanzadas de
  diagnóstico e importaciones habilitadas, y 500 MB de almacenamiento.
- **Extra**: igual que Full, con 5 GB de almacenamiento en vez de 500 MB.

## 2. Límites de cada plan

| Recurso | Demo | Full / Extra |
|---|---|---|
| Documentos TrazaDocs | 2 | Ilimitado |
| Proveedores | 1 | Ilimitado |
| Materiales | 5 | Ilimitado |
| Productos | 1 | Ilimitado |
| Evidencias | 1 | Ilimitado |
| Órdenes / corridas de producción | 1 | Ilimitado |
| Lotes de entrada | 1 | Ilimitado |
| Lotes producidos / lotes finales | 1 | Ilimitado |
| Miembros del equipo | 1 | Ilimitado |
| Roles e invitaciones de equipo | No disponible | Disponible |
| Recomendaciones avanzadas de diagnóstico | No disponible | Disponible |
| Importaciones | No disponible | Disponible |
| Almacenamiento | 50 MB | 500 MB (Full) / 5 GB (Extra) |

El diagnóstico en sí (responder y completar) **siempre está disponible**,
incluso en Demo — lo que Demo no incluye son las recomendaciones
avanzadas derivadas de ese diagnóstico.

**Documentos TrazaDocs (Sprint 10B):** el límite de 2 en Demo cuenta
documentos **vivos y descargables juntos** — el Maestro de documentos
(`/trazadocs/master`) los trata como un solo recurso, sin importar la
mezcla. Un documento descargable también consume la cuota de
almacenamiento del plan, con un tope adicional por archivo (10 MB en
Demo, 25 MB en Full/Extra). Ver `docs/DOCUMENT_MASTER_GUIDE.md`.

## 3. Cómo se asigna Demo automáticamente

Al crear una empresa desde el flujo normal (`/select-org`, sin invitación
pendiente), la función `create_organization` deja la empresa en **Demo**
de inmediato, dentro de la misma transacción que crea la organización —
nunca hace falta un paso aparte, y el cliente **no puede** elegir otro
plan por esta vía (la función ni siquiera acepta ese parámetro).

Las empresas creadas **antes** de que existiera esta capa de planes
(Sprint 10A) recibieron su suscripción real vía la migración
`0054_backfill_existing_organization_subscriptions.sql` — idempotente,
sin borrar nada — y quedaron en **Demo** hasta que un superadministrador
las pase a Full o Extra.

## 4. Cómo el superadmin cambia plan

Desde `/platform/organizations/[id]` (solo superadministrador de
plataforma): plan actual, estado, uso de almacenamiento y formulario
**«Cambiar plan»** con las opciones Demo / Full / Extra, y estado de la
suscripción Activo / Suspendido / Cancelado (equivalentes a "Suspender" y
"Reactivar"). Cada cambio queda en el historial de la empresa, con quién
lo hizo y por qué (motivo opcional).

Al crear una empresa desde `/platform/organizations/new`, el
superadministrador también puede elegir el plan inicial — si no elige
ninguno, queda en Demo, igual que el flujo normal.

## 5. Qué pasa al llegar a los límites

Al intentar crear un registro que supere el límite del plan, el sistema
lo bloquea en **servidor** (no solo en la interfaz) con un mensaje claro:

> «Tu plan Demo alcanzó el límite para este recurso. Actualiza a Full o
> Extra para continuar creando registros.»

Para funciones deshabilitadas (importaciones, roles/invitaciones):

> «Esta función no está disponible en modo Demo.»

Para almacenamiento:

> «Has alcanzado el límite de almacenamiento de tu plan.»

Si la **suscripción** de la empresa (no el plan en sí) está suspendida o
cancelada, se bloquea **cualquier** creación o carga nueva — sin importar
si estaría dentro del límite normal del plan — con su propio mensaje:

> «La cuenta de esta empresa está suspendida. Contacta al equipo de
> Trazaloop.» (suspendida)
>
> «La cuenta de esta empresa no está activa. Contacta al equipo de
> Trazaloop.» (cancelada)

En ambos casos, **la empresa sigue pudiendo leer y consultar** todo lo que
ya tenía — solo se bloquean las creaciones nuevas.

**Excepción — Centro de soporte (Sprint 10C):** una empresa suspendida o
cancelada puede seguir creando tickets de soporte de categoría **Cuenta
/ acceso** o **Plan / límites** (para pedir ayuda a reactivarse), y
puede responder cualquier ticket ya existente sin restricción. Es la
única excepción al modo solo lectura general. Ver
`docs/SUPPORT_TICKETS_GUIDE.md`.

**Aceptar una invitación pendiente también revisa el plan** de la empresa
que invita — no solo crearla. Si alguien acepta un enlace de invitación
antiguo (creado cuando la empresa tenía Full, por ejemplo) después de que
la empresa bajó a Demo o quedó suspendida, la aceptación se bloquea igual
que cualquier otra creación de miembro — la invitación queda pendiente,
lista para aceptarse si la empresa vuelve a un plan que lo permita.

### Modo solo lectura completo (suspended / cancelled)

Cuando la suscripción de una empresa está **suspendida** o **cancelada**,
la regla es simple y se aplica sin excepciones en toda la plataforma:

- **Activo**: la empresa opera normalmente, según los límites de su plan.
- **Suspendido / Cancelado**: la empresa **puede seguir leyendo y
  consultando** absolutamente todo lo que ya tenía — catálogos,
  evidencias, trazabilidad, cálculos, TrazaDocs, feedback/tickets — pero
  **no puede crear, editar, eliminar, validar, asociar, calcular,
  importar ni cambiar estados** en ningún módulo. Nada se elimina
  automáticamente por quedar suspendida o cancelada.
- Un **superadministrador de plataforma** puede reactivar la empresa en
  cualquier momento desde `/platform/organizations/[id]`, y la operación
  normal se reanuda de inmediato — sin perder ningún dato.

## 6. Qué pasa al hacer downgrade

Cambiar una empresa a un plan con límites más bajos **nunca borra
datos existentes** — todo lo que ya existe se conserva y se puede seguir
consultando. Lo único que cambia es que, si el uso actual ya supera el
límite del plan nuevo, **no se pueden crear registros nuevos** de ese
recurso hasta que el uso vuelva a estar dentro del límite (por ejemplo,
eliminando algo) o la empresa regrese a un plan superior.

## 7. Cómo se mide el almacenamiento

El uso de almacenamiento se calcula sumando el tamaño real de los
archivos subidos: evidencias y el logo de empresa. Los archivos subidos
**antes** de este sprint no tenían su tamaño guardado — cuentan como 0
bytes en la suma (nunca rompen el cálculo, pero el total puede quedar
subestimado sobre datos históricos). Todo archivo subido **desde** este
sprint guarda su tamaño real, así que la medición es exacta para todo lo
nuevo.

## 8. Cómo activar la confirmación de correo en Supabase

El registro público debe exigir que la persona confirme su correo antes
de tener sesión completa. Esto ya lo maneja Supabase Auth — no se
construyó un sistema propio de confirmación. Para activarlo (si no lo
está ya) en el panel de Supabase del proyecto:

```
Authentication → Providers → Email → Confirm email = enabled
```

Con esto activo, después de registrarse la persona ve «Revisa tu correo
para confirmar tu cuenta.» y **no** puede crear una empresa ni aceptar
una invitación hasta confirmar — Supabase no le entrega una sesión válida
hasta ese momento, así que Trazaloop no necesita ninguna lógica adicional
para bloquear ese paso.

## 9. Facturación

**No existe todavía facturación automática, pasarela de pagos, ni
cobros.** El cambio de plan es completamente manual: lo hace un
superadministrador de plataforma desde la consola, después de un acuerdo
comercial fuera de la plataforma. Esto seguirá siendo así hasta que se
implemente explícitamente en un sprint futuro.

## 10. Portal de módulos

`/modules` es la **entrada interna principal** de Trazaloop: la raíz del
sitio y el post-login/registro (sin una invitación pendiente explícita)
llevan ahí. Muestra los módulos de Trazaloop: **Trazaloop CPR** (este
producto, disponible — "Entrar" lleva al panel o a elegir empresa, según
el estado real del usuario) y **Trazaloop Textil**, **Trazaloop Quality**
(gestión de calidad e ISO 9001) y **Trazaloop Construcción** (los tres,
próximamente — sin ninguna funcionalidad interna construida todavía). La
identidad y la sesión son **una sola** para todos los módulos: no hay
logins separados, ni ahora ni está previsto crearlos por módulo.

Una invitación pendiente (por `next=/accept-invite?token=...` explícito
en la URL, o detectada automáticamente si el usuario tiene exactamente
una) **nunca** pasa por `/modules` — va directo a aceptarla.

## Comandos relacionados

```bash
npm run test:plans   # lógica pura de límites, planes y cuotas (sin BD)
npm run test:rls     # aislamiento de planes/suscripciones (Supabase local)
```
