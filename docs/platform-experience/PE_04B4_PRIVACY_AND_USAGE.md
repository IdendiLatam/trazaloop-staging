# PE-04B4 · Privacidad de la medición

## La bandera que PE-04A levantó

Medir «tiempo de uso» roza la vigilancia laboral. La arquitectura de este tramo
está hecha para que eso **no pueda** construirse encima, ni por accidente.

## El consumo es de la EMPRESA

`organization_usage_minutes` tiene clave primaria `(organization_id,
minute_start)` y **no tiene `user_id`**. No es un olvido: es lo que impide que
alguien haga un panel de «minutos por empleado». Aunque quisiera, el dato no
está.

Efecto colateral buscado: la unión sale de la clave primaria. La decisión que
protege la privacidad es la misma que hace correcta la aritmética.

## Lo que sí se guarda, y por qué

`organization_usage_leases` guarda quién sostiene cada concesión y cuándo latió
por última vez. Hace falta para que dos pestañas no se pisen y para saber si
alguien sigue abierto. Se guarda **el mínimo**: empresa, persona, clave de
pestaña, superficie, inicio, último latido y caducidad.

No se guarda —ni se recoge— nada de comportamiento: ni ratón, ni teclado, ni
scroll, ni foco, ni tiempo de inactividad. Una prueba estática lo vigila
buscando esos nombres en el componente del reloj.

## Lo que se le enseña al cliente

Unidades de su plan: créditos de Intelligence y minutos de uso. **Nunca** tokens,
coste del proveedor ni el peso interno de cada operación: es economía nuestra, y
presentarla como si fuera su cuota confundiría lo que se vende con cómo se
produce. Una prueba comprueba que la tarjeta no los nombra.

Las dos bolsas de créditos se enseñan **separadas**. Sumarlas haría leer «75
créditos» a una empresa Free con prueba activa, y al caducar la prueba parecería
que se le quitaron 50 que nunca fueron suyos.

## Quién puede consultar qué

| | Empresa | Personal de plataforma | Otra empresa |
|---|---|---|---|
| `ai_credits_status` | sí | sí | **no** |
| `organization_time_status` | sí | sí | **no** |
| `usage_heartbeat` | sí | — | **no** |
| `ai_credit_ledger` | lectura | lectura | **no** |
| `organization_usage_minutes` | lectura agregada | lectura | **no** |

Comprobado ejecutando con una persona de otra empresa: las tres llamadas fallan,
incluida la del latido —no se puede gastar el tiempo de otro—.

El personal de plataforma ve **los mismos números** que el cliente, de la misma
fuente. Dos aritméticas para el mismo mes es cómo se acaba discutiendo con
alguien que tiene razón.

## Coste interno · preparado, no activado

La telemetría real (tokens, modelo, proveedor, latencia, coste estimado) se
conserva íntegra en `quality_ai_runs` y en las vistas de plataforma, que filtran
con `is_platform_staff()` dentro de la propia definición.

El aviso interno de **coste de IA > 15 % de los ingresos netos del plan durante
dos meses seguidos** queda **documentado y sin activar**, como pide el encargo:
los ingresos netos, los descuentos y los datos de pago pertenecen a PE-05. Y en
ningún caso ese ratio bloquearía a un cliente: es una alerta nuestra.
