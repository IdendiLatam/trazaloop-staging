# PE-04B4 · Modo consulta

## Qué es

Cuando una empresa Free agota **30 minutos en el día** o **300 en el mes**, entra
en modo consulta hasta que el cupo correspondiente reinicie.

No se cierra la sesión. No se bloquea la autenticación. No se esconden datos. No
se borra nada.

## Qué sigue pudiendo hacer

autenticarse · navegar · **leer** sus registros · **descargar** lo que ya podía
descargar · **borrar** donde el producto lo permite · reducir su almacenamiento ·
FAQ · ayuda contextual · tutoriales · términos y privacidad · ajustes de cuenta y
seguridad.

La autorización (rol y RLS) se sigue aplicando igual y aparte: son dos ejes
distintos.

## Qué queda bloqueado

crear · editar · aprobar cuando la aprobación cambia estado de negocio ·
publicar · registrar evidencia · **subir archivos nuevos** · crear versiones ·
**ejecutar Intelligence** · cualquier otra mutación que aumente o modifique el
sistema de gestión.

## Borrar NO es una mutación cualquiera

Es la regla que impide que agotar un cupo secuestre los datos de nadie. Si se
bloqueara el borrado, una empresa Free con el almacenamiento lleno y el tiempo
agotado no podría crear **ni** liberar espacio: quedaría atrapada.

Hay una prueba dedicada a ese estado combinado: almacenamiento `OVER_LIMIT` +
modo consulta → **borrar sigue permitido**, crear no.

## Cómo se decide: por INTENCIÓN

`organization_commercial_can_mutate(org, intención)` con cinco intenciones:

| Intención | En modo consulta |
|---|---|
| `read` | **permitida** |
| `delete_or_reduce` | **permitida** |
| `essential_account_operation` | **permitida** |
| `business_increase_or_modify` | denegada |
| `ai_execution` | denegada |

Las tres primeras se permiten **siempre**, incluso cuando el plan no se puede
resolver: no poder leer un plan no puede impedirle a alguien leer o borrar lo
suyo.

La intención por omisión es la **restrictiva**. Una acción nueva que no declare
nada se comporta como creación, que es el caso seguro; lo contrario convertiría
cada olvido en una fuga. Hay una prueba que lo vigila.

## Dónde se aplica

En la base y en el servidor, nunca en la interfaz. Las dos puertas canónicas son
`checkOrganizationCanMutate(intención)` para lo transversal y
`checkModuleCanMutate(módulo, intención)` para PCR, Textiles y Quality; las 18
acciones que retiran declaran `delete_or_reduce`.

## Los dos ejes no se mezclan

| | tiempo agotado | créditos agotados |
|---|---|---|
| Escrituras normales | bloqueadas | **permitidas** |
| Intelligence | bloqueada | bloqueada |

Comprobado en ambos sentidos. Quedarse sin créditos de IA no puede paralizar el
resto del producto, y tener créditos no permite ejecutar cuando el tiempo se
agotó: una ejecución de Intelligence es una operación de negocio.

## Precedencia de mensajes

Si el tiempo está agotado, se dice **modo consulta**, no «almacenamiento
agotado» —aunque el almacenamiento también lo estuviera—. Y si no se pudo
resolver el plan se dice que **no se pudo comprobar**, nunca que el cupo se
acabó: afirmar lo segundo sería afirmar algo que no se sabe.
