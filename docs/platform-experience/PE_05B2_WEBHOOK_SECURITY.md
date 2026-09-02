# PE-05B2 · La seguridad del webhook

## Es una puerta de máquina

No hay sesión de Trazaloop detrás y no puede haberla: el que llama es Mercado
Pago. Su seguridad es la **firma**, y nada más. Una prueba comprueba que la
ruta no pide sesión y que sí verifica.

## Se usa el verificador oficial

`mercadopago@3.6.0` publica `WebhookSignatureValidator`, que construye el
manifiesto documentado, calcula HMAC-SHA256 en hexadecimal y compara **en
tiempo constante**. Escribir eso a mano solo añade una copia que envejece: el
día que el proveedor pase a `v2`, la suya se actualiza con el paquete y la
nuestra no.

La receta, verificada contra la documentación actual y contra el código
publicado del SDK:

```
manifiesto = id:[data.id];request-id:[x-request-id];ts:[ts];
firma      = HMAC-SHA256(manifiesto, secreto) en hexadecimal
comparar   = tiempo constante contra el v1 de la cabecera
```

Las partes ausentes se omiten del manifiesto.

## Lo que se añade por encima

**1 · La ventana de tiempo.** El validador la ofrece y no la impone. Una firma
auténtica de hace tres semanas sigue siendo auténtica: sin ventana se puede
reproducir. Se fija en **cinco minutos**, y hay una prueba que reenvía una
notificación buena pero vieja y comprueba que se rechaza.

**2 · La minúscula del `data.id`.** La documentación lo pide y el validador no
lo hace por su cuenta. Los identificadores de `preapproval` son hexadecimales,
así que sin esto se perderían entregas legítimas.

## Sin secreto NO se acepta nada

Un webhook sin firma comprobable es un desconocido diciendo que le pagaron. Se
distingue de un ataque con su propia razón —`SecretNotConfigured`— para que en
los registros no parezca un intento de fraude lo que es una variable sin poner.

## Firma inválida → 401 y cero efecto

Una prueba corta el fichero por el `if (!firma.verified)` y comprueba que
**ninguna** llamada con efecto —liquidar, renovar, marcar estado, releer el
recurso— aparece antes.

Lo único que ocurre antes es anotar el intento, deliberadamente: saber que
alguien está probando suerte es información operativa. Se anota **sin cuerpo**
y en estado `rejected`.

## El orden completo

1. Verificar la firma. Si no cuadra: anotar sin cuerpo y responder **401**.
2. Comprobar el entorno. Falla cerrado.
3. Anotar la notificación. Repetida, incrementa un contador.
4. **Releer el recurso en la API del proveedor.**
5. Conciliar contra lo que el servidor esperaba, y solo entonces liquidar.

Se responde 200 en cuanto la notificación queda resuelta, para que el proveedor
no reintente por un problema nuestro; y 401 solo cuando la firma no cuadra, que
es la única respuesta que le dice algo útil.

## Entorno · el guardia que impide cobrar de verdad en pruebas

El entorno sale del **prefijo del token**, no de un interruptor aparte. Un
interruptor puede quedarse en «pruebas» con un token de producción dentro, y
entonces el guardia que debía proteger la caja dice que todo va bien.

Un evento `live_mode: true` sobre credenciales de prueba no se procesa. Al
revés tampoco. Y **sin dato de `live_mode` tampoco**: sin dato no es «da
igual». El guardia está en la ruta y **otra vez en la base**, porque en la ruta
se puede olvidar y en la función de liquidación no.

## Los registros

Llevan tipo de operación, identificadores canónicos, identificador del recurso,
clase de error y duración. **Nunca** el token, el secreto, la cabecera de
autorización, un token de tarjeta ni el cuerpo del proveedor.
