# PE-04B6 · Los ejes, juntos

Cuatro límites comerciales conviven —almacenamiento, Intelligence, tiempo y
soporte— y lo que había que demostrar es que **no se estorban** y que ninguna
combinación deja al cliente atrapado.

## Independencia

| Estado | Escrituras normales | Subir archivos | Intelligence |
|---|---|---|---|
| Créditos agotados, tiempo disponible | **sí** | **sí** | no |
| Tiempo agotado, créditos disponibles | no | no | **no** |
| Almacenamiento lleno, tiempo disponible | sí | no | sí |

Quedarse sin créditos de IA **no paraliza el producto**. Y tener créditos no
permite ejecutar cuando el tiempo se agotó: una ejecución de Intelligence es una
operación de negocio.

Al reiniciar el tiempo, los créditos que quedaban **vuelven a poder usarse**: no
se perdieron, estaban esperando.

## La combinación que importa

**Almacenamiento OVER_LIMIT + modo consulta**: no se puede crear, no se puede
subir… y **sí se puede borrar**. Es la única salida que le queda a esa empresa, y
si se bloqueara quedaría atrapada: sin poder crear y sin poder liberar espacio.
Agotar un cupo comercial no puede secuestrar los datos de nadie.

## Precedencia de mensajes

Cuando coinciden varias causas, se dice la que de verdad manda:

- Tiempo agotado → **modo consulta**, aunque el almacenamiento también esté
  lleno.
- Plan irresoluble → **no se pudo comprobar**, nunca «agotaste tu cuota».
- Créditos agotados → **créditos**, nunca «no incluido en tu plan».

## Un solo calendario

El mes de negocio es el mismo para los tres ejes que lo necesitan —créditos,
reloj y casos de soporte—: `organization_business_month`, sobre la zona horaria
que la empresa ya tenía desde 0129. No se introdujo un segundo ni un tercero. El
almacenamiento no tiene periodo: es un saldo.

## Concurrencia

Los cuatro puntos donde dos peticiones simultáneas podrían pasar están
serializados y probados: reserva de almacenamiento (lock por empresa), reserva de
créditos (lock por empresa), último caso de soporte (lock por empresa) y unión de
minutos (clave primaria `(empresa, minuto)`, sin lock y sin poder equivocarse).

## Los resolutores no se contradicen

Para Free, Full y Extra se comprueba que **los cinco** —plan, almacenamiento, IA,
tiempo y soporte— devuelven el mismo `plan_code` y las cifras congeladas:

| | Free | Full | Extra |
|---|---|---|---|
| Almacenamiento | 50 MiB | 500 MiB | 5 GiB |
| Créditos/mes | 25 | 500 | 2 000 |
| Reloj comercial | **sí** | no | no |
| Casos de soporte | 0 | 0 | 2 |
