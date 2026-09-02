# PE-05B2 · El libro de notificaciones

Un webhook **no es una verdad financiera**: es un aviso. Se guarda el sobre y
qué se hizo con él.

## Una fila por recurso, con contador

Clave única por `(proveedor, tema, recurso)`. Reentregar la misma notificación
**incrementa `attempt_count`**, no crea otra fila. Comprobado ejecutando: cinco
entregas, una fila, contador en cinco.

Eso resuelve dos cosas a la vez. Un registro sin límite es un vector de
denegación: cualquiera puede mandar avisos forjados hasta llenar la tabla. Con
clave única, mil intentos son una fila y un número.

## Qué se guarda

Proveedor, tema, recurso, identificador de petición, `live_mode`, entorno, si
venía firmado y por qué no, estado de proceso, resultado, clase de error,
número de intentos, cuándo llegó la primera vez y la última, cuándo se procesó,
la empresa cuando se llega a saber, y el **sobre saneado**.

## El sobre, no el cuerpo

Del cuerpo solo se conserva lo que identifica el aviso: `id`, `type`, `action`,
`api_version`, `live_mode`, `date_created`, `user_id` y `data.id`.

Nunca tarjeta, ni código de seguridad, ni token, ni cabeceras de autorización,
ni correo, ni documento, ni nombre del pagador. Hay una prueba que le da un
cuerpo con todo eso dentro y comprueba que ninguno sobrevive.

La razón no es solo privacidad: **la verdad financiera se relee de la API del
proveedor de todas formas**, así que guardar el cuerpo entero añadiría riesgo
sin añadir verdad.

Lo no firmado se anota **sin cuerpo** y en estado `rejected`.

## Retención

Estos eventos son registro operativo y de auditoría financiera. No hay borrado
automático: la historia de un cobro es lo que explica un reclamo. Cuando exista
una política de retención de plataforma, esta tabla entra en ella como dato
interno —no como dato de cliente—, y su contenido ya está reducido al sobre,
que es lo que hace la retención barata y segura.

## Quién lo ve

Dato financiero **interno de la plataforma**. Ni el dueño de una empresa: no le
aporta nada que no esté en su intento y expone la mecánica del proveedor. Solo
personal de plataforma, por política de `SELECT`, y ninguna política de
escritura para nadie.

Comprobado **por efecto** —cuántas filas ve cada quien—, no esperando un error:
RLS filtra, no rechaza.

## Estados de proceso

| Estado | Qué significa |
|---|---|
| `received` | anotado, sin resolver todavía |
| `processed` | resuelto, con su resultado |
| `ignored` | tema conocido sin efecto para Trazaloop |
| `pending_resource` | el recurso no se pudo leer; se reintenta |
| `manual_review` | hace falta una persona |
| `error` | fallo del manejador |
| `rejected` | firma inválida o entorno equivocado |
