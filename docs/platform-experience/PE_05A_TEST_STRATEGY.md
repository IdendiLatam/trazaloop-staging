# PE-05A · Estrategia de pruebas

Dinero de por medio: aquí una prueba que da verde por accidente cuesta un cobro
mal hecho a un cliente real. Se hereda lo que PE-04 aprendió por las malas.

## Lo que PE-04 enseñó y aquí se aplica desde el primer día

- **Un `UPDATE` que la RLS filtra no da error: da cero filas.** Toda prueba de
  permiso se comprueba **por efecto** —leer el valor antes y después—, nunca
  esperando un error.
- **Los guardias hay que verlos fallar.** Cada guardia de cobertura se prueba
  poniéndolo en rojo a propósito antes de darlo por bueno.
- **Sin dato no es cero.** Un fallo de lectura nunca se interpreta como «no
  pagó», «sin descuento» ni «sin impuesto».
- **Las migraciones aplicadas son historia.** Cada tabla nueva nace con RLS,
  política y grants revisados; el preflight de SEC-01 viaja dentro.

## Autoridad del importe

| | |
|---|---|
| Un `amount` del cliente **se ignora** | no se valida: se ignora |
| El descuento lo resuelve el servidor | el cliente manda un código |
| El impuesto lo resuelve el servidor | la interfaz no calcula |
| El presupuesto **caduca** | y uno caducado no se puede pagar |
| El presupuesto referencia la **revisión** | publicar otra no cambia lo presupuestado |

## Cupones

Existe · activo · en vigor · **plan elegible** · **intervalo elegible** · límite
global · límite por empresa. Y en negativo: el cupón de aliados de Full **no**
descuenta Extra; el Acompañamiento **no** admite cupones de SaaS; un porcentaje
enviado desde el navegador no tiene ningún efecto.

Cambiar el cupón después **no reescribe** un canje ya registrado.

## Moneda e impuestos

El tipo de cambio se **congela** en el presupuesto y no se recalcula durante el
pago. Base, impuesto y total se guardan separados. Un cambio de tipo o de regla
fiscal no altera un cobro pasado.

## Webhooks

| Caso | Resultado esperado |
|---|---|
| Firma válida, evento conocido | efecto de negocio, una vez |
| **Mismo evento repetido** | **sin segundo efecto**, respuesta correcta |
| Firma inválida | **cero efecto**, registrado |
| Tipo desconocido | `ignored`, cero efecto |
| Error al procesar | `failed` → reintento → `needs_review` |
| Evento de otro entorno | rechazado |
| Evento de otra empresa | rechazado |

Y el que más importa: **volver del checkout con `?success=true` no activa nada.**

## Ciclo de vida

Free no crea nada en el proveedor · la prueba tampoco · activación solo con
evento verificado · renovación sin transición de plan redundante · fallo → gracia
conservando el plan · fin de gracia → suelo Free **sin borrar nada** ·
cancelación al final del periodo · bajada al final del periodo · **pasarela caída
≠ pago fallido**.

## Integración con PE-04

La comprobación que cierra el círculo: tras una activación verificada, **los
cinco ejes de PE-04 cuentan la misma historia** —plan efectivo, almacenamiento,
créditos, reloj y soporte—, exactamente como ya comprueba `pe04b6-lifecycle`.

Y al revés: bajar por facturación **no reinicia** consumo de IA, minutos ni casos
de soporte; solo cambia el techo. Eso ya está probado en PE-04B6 y aquí solo hay
que alcanzarlo desde el otro lado.

## Roles y aislamiento

`admin` compra · `quality` **no** · `consultant` **no** · una empresa no ve la
facturación de otra · Soporte lee lo justo y no cambia nada · Superadministración
gestiona · `anon` no ve ni un registro de pago.

## Guardias de cobertura nuevos

Siguiendo el patrón de PE-03 (pantallas), PE-04B3 (bytes) y PE-04B4 (modelo y
mutaciones):

- **Ningún cobro fuera de la frontera**: nadie llama al SDK del proveedor fuera
  de su adaptador.
- **Ningún importe escrito a mano**: ningún precio literal en React ni en
  acciones; todo sale del catálogo canónico.
- **Ninguna activación sin verificación**: ninguna ruta concede derecho
  comercial sin pasar por el registro de pago verificado.

Los tres deben ponerse en rojo al introducir el caso que persiguen, y hay que
verlo.

## Lo que no se puede probar solo con automatización

Que el importe cobrado coincida con el extracto real del banco, y que la
presentación fiscal sea la correcta. Lo primero necesita un pago de prueba en
sandbox con verificación humana; lo segundo, al contador. Ninguna suite verde
sustituye a ninguna de las dos.
