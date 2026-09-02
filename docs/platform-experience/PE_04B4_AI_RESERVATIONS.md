# PE-04B4 · Reservar, consumir y liberar

## El libro, no un contador

`ai_credit_ledger` guarda cada movimiento con el peso que se le aplicó. No hay
un entero `creditos_restantes` que solo baja: un número así no se puede
auditar, no se puede explicar y no se puede reconstruir. Los totales del periodo
se **derivan**.

Estados: `reserved` → `consumed` o `released`. Un `check` obliga a que
`settled_at` exista exactamente cuando el movimiento deja de estar reservado.

## Dos bolsas que no se mezclan

| | `trial` | `monthly` |
|---|---|---|
| Identidad del periodo | la concesión de prueba | el mes de negocio |
| Caduca | con la prueba | al acabar el mes |
| Acumula | no | no |

Un `check` obliga a que cada fila lleve **su** identidad de periodo y prohíba la
de la otra: sin eso, una fila podría no pertenecer a ningún periodo y desaparecer
de todos los totales.

## El orden de consumo: primero lo que caduca

Se gasta la bolsa de la prueba **antes** que la mensual. Al revés se tirarían
créditos que el cliente ya tenía. Comprobado ejecutando: con prueba activa, una
pregunta sale de `trial` y la mensual sigue en cero; agotada la prueba, la
siguiente pasa a `monthly` sin avisar de nada.

Una empresa Free con prueba activa dispone temporalmente de **50 + 25**. Eso no
la convierte en Full: la mensual sigue siendo 25 y las dos bolsas se informan
por separado.

## La reserva, paso a paso

`ai_credits_reserve(org, operación, clave)` bajo `pg_advisory_xact_lock` por
empresa:

1. Resuelve el **peso** en el registro. Sin peso → `AI_OPERATION_UNKNOWN`.
2. Idempotencia bajo el candado: misma clave → **misma** reserva.
3. **Eje del tiempo**: una ejecución de Intelligence es una operación de
   negocio. Si Free agotó su reloj → `CONSULTATION_MODE`, aunque queden
   créditos. No se pierden: vuelven a poder usarse al reiniciar el cupo.
4. Estado de créditos. Plan ausente o ilegible → `ENTITLEMENT_UNAVAILABLE`.
5. Bolsa de prueba si cabe; si no, mensual.
6. `usado + peso > límite` → `AI_CREDIT_LIMIT_REACHED`.

La reserva va **antes** de crear la fila de ejecución y **antes** de llamar al
proveedor. Lo primero porque `quality_ai_runs` es el libro de lo que se ejecutó,
no de lo que se intentó. Lo segundo porque reservar después de llamar regala la
última operación a quien llegue en el instante justo.

## Cuándo se consuma

**Solo** con un resultado validado y utilizable. Se libera en las cuatro salidas
sin resultado: denegación de una salvaguarda interna, contexto vacío (no se
llamó a nadie), fallo del proveedor y salida ilegible.

Un fallo de infraestructura **no se le cobra al cliente** y, sobre todo, no se
le presenta como «alcanzaste tu límite». El coste que el proveedor haya
incurrido se sigue registrando aparte, en la propia ejecución.

## Idempotencia

La clave la deriva el **servidor**: `actor · operación · minuto · huella del
contenido`. Una clave que eligiera el navegador sería una clave reutilizable
para no pagar. Un reintento del mismo envío dentro del mismo minuto reutiliza la
reserva; la misma pregunta hecha a conciencia un minuto después es otra
operación y sí cuesta.

El índice único es parcial —ignora las liberadas—: si la primera se soltó por un
fallo del proveedor, reintentar debe poder reservar de nuevo.

## Concurrencia, demostrada

- 1 crédito libre, dos operaciones de 1 en paralelo → **pasa una**.
- 5 libres, dos operaciones de 5 en paralelo → **pasa una**.
- Confirmar dos veces cobra **una**.

## Nadie se regala créditos

`ai_credit_ledger` tiene política de **lectura** y ninguna de escritura: solo lo
mueven las funciones `security definer`. Comprobado: el dueño de la empresa no
puede insertar una fila.

## Las cinco negativas, distinguidas

`CREDIT_LIMIT_REACHED` · `CONSULTATION_MODE` · `ENTITLEMENT_UNAVAILABLE` ·
`OPERATION_UNKNOWN` · `SYSTEM_ERROR`. Cada una con su mensaje. Decirle «agotaste
tus créditos» a quien no los ha agotado es la misma familia de defecto que
hacerle leer «Plan Demo» a un cliente Full.
