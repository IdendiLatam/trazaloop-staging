# PE-04B4 · El reloj de uso de Free

## Lo que se mide, y lo que NO

Free incluye **30 minutos de uso al día y 300 al mes, por empresa**.

No son «minutos activos». El reloj corre mientras alguien de la empresa tiene
abierta una pantalla funcional, se mueva el ratón o no:

> 09:00 abre una pantalla · 09:10 recibe una llamada · 09:20 vuelve
> → **≈ 20 minutos consumidos**.

Está prohibido —y hay una prueba que lo vigila— escuchar `mousemove`, `keydown`,
`scroll`, `visibilitychange` o cualquier temporizador de inactividad. Detectar
actividad convertiría el medidor en otra cosa, y además en una herramienta de
vigilancia.

Una pestaña en segundo plano **sigue contando**: si el navegador sigue latiendo,
la pantalla sigue abierta.

## La decisión que lo explica todo: un CONJUNTO de minutos

El consumo no se guarda como una suma de duraciones, sino como el conjunto de
minutos que la empresa tuvo ocupados: `organization_usage_minutes`, con clave
primaria `(organization_id, minute_start)`.

Con una suma, tres personas trabajando diez minutos a la vez consumirían treinta
—justo lo que el negocio dijo que no—. Con un conjunto, las tres marcan los
mismos diez y el `on conflict do nothing` los deja en diez. **La unión sale
sola**, sin calcular solapes y sin poder equivocarse.

Y resuelve dos cosas más de regalo:

- **Idempotencia**: repetir un latido no cuenta dos veces el mismo minuto.
- **Concurrencia**: dos latidos simultáneos sobre el mismo minuto son una
  colisión de clave primaria, no una carrera aritmética. No hace falta lock.

Demostrado ejecutando: tres personas a la vez → **1 minuto**. Tres pestañas de la
misma persona → **1 minuto** y 3 concesiones vivas. Tres latidos seguidos → **1
minuto**.

## Los tres números

| | Valor |
|---|---|
| Cadencia del latido | **30 s** |
| Vida de la concesión | **90 s** (tres latidos) |
| Recuperación máxima por latido | **90 s** |

**Sobreconteo máximo tras un cierre brusco: menos de un minuto.** Los minutos se
marcan *en* el latido, así que en cuanto el navegador deja de latir no se cobra
ni uno más; lo único cobrado es el minuto que ya estaba marcado en el último
latido. Si el dispositivo se duerme dos horas y vuelve, esas dos horas **no** se
cobran: el latido solo puede recuperar 90 segundos hacia atrás.

## El cliente no envía tiempo

Envía «esta pestaña sigue abierta con una pantalla funcional». Los minutos los
pone el reloj **del servidor**. Creerle la aritmética a quien la paga sería
regalarle el medidor.

## Qué superficies cuentan

La frontera **no es una lista de rutas, es el shell**. Dentro de
`app/(app)/(shell)` está el trabajo de la empresa —Calidad, PCR, Textiles,
TrazaDocs, equipo, datos de empresa, exportaciones—; fuera están la puerta, el
perfil, la consola de plataforma, la ayuda y lo legal. Se pensó en clasificar
las 150 rutas una a una como en PE-03, y habría sido una lista que envejece en
cuanto alguien añade una pantalla.

El reloj se monta **solo** en el layout del shell, y una prueba lo comprueba.

**Excepción declarada dentro del shell**: `/support`. Escribir a soporte no es
trabajo del sistema de gestión: es pedir ayuda. Cobrar el tiempo de pedir ayuda
—y peor aún, bloquearlo en modo consulta— dejaría sin salida justo a quien
necesita una.

**Fuera del shell y por tanto nunca medido**: autenticación, recuperación de
acceso, invitaciones, selector de empresa, `/modules`, perfil personal,
`/platform`, FAQ, ayuda y legal. Mirar el propio cupo no consume cupo.

## Planes sin reloj

Full, Extra y la prueba de Full mientras dura **no se miden y no se escribe ni
una fila**. Gastar filas para demostrar que algo es ilimitado es gastar por
gastar. Comprobado: un latido en esos planes deja la tabla de minutos vacía.

Al caducar la prueba, el reloj de Free empieza **desde ese momento**: las 48
horas no se cobran retroactivamente. Comprobado con 300 minutos previos de
consumo que en Free habrían agotado el mes.

## El día y el mes de negocio

Se resuelven en la zona horaria **de la empresa**, la que ya existía en
`quality_automation_settings.business_timezone` (0129). No se inventó una
segunda: tener dos zonas horarias por empresa es garantizar que un día se
contradigan. Nunca se deduce del navegador.

El día y el mes se congelan **al escribir** cada minuto: si la empresa cambiara
de zona horaria, el pasado no se recalcula.

Reinicio diario y mensual sin cron: los cubos se resuelven por fecha.
Comprobado: 30 minutos de ayer no gastan hoy pero sí cuentan en el mes; el mes
nuevo arranca en cero aunque el anterior estuviera agotado.

## Privacidad

`organization_usage_minutes` **no tiene `user_id`**, y no lo tiene a propósito:
un panel que dijera cuántos minutos estuvo abierto cada empleado sería una
herramienta de vigilancia laboral. Las concesiones sí guardan quién las sostiene
—hace falta para que dos pestañas no se pisen— y nada más: ni ratón, ni teclado,
ni foco, ni comportamiento.
