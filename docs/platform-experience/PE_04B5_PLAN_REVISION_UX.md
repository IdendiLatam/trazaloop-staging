# PE-04B5 · Editar y publicar una revisión

## El flujo

1. **Crear sucesora** — copia la vigente, incluidos sus límites, y nace en
   borrador con la numeración siguiente.
2. **Editar** — precio mensual y anual (unidades menores, antes de impuestos) y
   cada condición comercial, una a una, eligiendo entre *con límite*, *sin
   límite* y *sin configurar*.
3. **Previsualizar** — el borrador se ve con las mismas etiquetas humanas que la
   vigente, así que se lee como lo leerá quien decida.
4. **Publicar** — con resumen de cambios y confirmación escrita.

Solo hay un borrador abierto por plan a la vez: la sucesora aparece cuando no
existe otra.

## Qué se puede cambiar sin tocar código

Almacenamiento · créditos de Intelligence · uso diario · uso mensual ·
**orientación funcional** · equipo · roles · importaciones. Todo vive en
`plan_revision_limits`, y todo el producto lo lee de ahí:

- la cuota de almacenamiento desde 0164,
- los créditos y el reloj desde 0166,
- los casos de soporte desde 0167,
- los límites de conteo y las funciones desde 0166.

El **2** de Extra no está escrito en ninguna pantalla ni en ninguna regla: sale
del catálogo. Una revisión futura puede ponerlo en 3 sin desplegar código.

## Estados de un límite

| Estado | Qué significa | Qué hace el producto |
|---|---|---|
| Con límite | hay un número | lo aplica |
| Sin límite | no hay tope | concede |
| **Sin configurar** | **nadie lo ha decidido** | **NIEGA** |

El tercero es deliberado y es el mismo criterio desde 0162: sobre lo que no se
sabe, no se autoriza. La pantalla lo dice al editar.

## Asignar un plan a una empresa

Desde el detalle de la empresa, con: revisión **publicada** (un borrador no se le
vende a nadie), alcance (empresa o módulo), módulo —solo **funcionales**—, inicio,
fin opcional, **motivo obligatorio** y confirmación escrita.

`core` no puede recibir plan comercial. Si pudiera, toda empresa resolvería a ese
plan y el nivel comercial dejaría de significar nada — es el hallazgo de
PE-04B1, y aquí se aplica también a lo que la pantalla llega a ofrecer y a lo que
la base acepta.

## Antes de bajar de plan

Se muestra el impacto, sin bloquear:

- almacenamiento actual frente a la nueva cuota,
- créditos ya consumidos este mes (lo consumido sigue consumido),
- que Free vuelve a aplicar el reloj y, al agotarse, el modo consulta,
- que los casos de soporte ya usados **no se reinician**,
- y, en mayúsculas: **NO SE BORRARÁ NINGÚN DATO**.

No se impide la bajada porque la empresa esté por encima del límite: `OVER_LIMIT`
es un estado legítimo desde PE-04B3, y quedarse ahí no destruye nada.

## Historia

Cada transición deja una fila en `commercial_assignment_events` con **qué tenía
la empresa antes**, qué pasa a tener, con qué revisión, desde cuándo, quién y por
qué. `organization_plan_assignments` ya era append-only, pero no guardaba el
estado anterior, y sin eso una transición no se puede explicar seis meses después
sin reconstruirla a mano. No sustituye a `audit_log`, que es técnico: esto es lo
que hay que poder contarle a un cliente.
