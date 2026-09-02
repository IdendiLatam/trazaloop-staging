# PE-04 · Cierre

## Qué era PE-04

Convertir «Trazaloop tiene planes» en un sistema comercial que el producto
respeta, que se puede administrar sin desplegar código y que dice la verdad
cuando no sabe algo.

| Tramo | Qué dejó | Migración |
|---|---|---|
| **A** | Descubrimiento y 36 decisiones congeladas | — |
| **B1** | Catálogo canónico, revisiones inmutables, resolutor en sombra | 0162 |
| **B2** | Base comercial cerrada, migración de empresas, cambio de autoridad | 0163 |
| **B3** | Una sola cuota de almacenamiento por empresa | 0164 |
| **SEC-01** | RLS en siete catálogos de Quality que nacieron sin ella | 0165 |
| **B4** | Créditos ponderados de Intelligence y reloj de uso de Free | 0166 |
| **B5** | Derechos de soporte y consola comercial | 0167 |
| **B6** | Aceptación integrada, retirada del legacy y este cierre | — |

## Las cuatro ideas que sostienen todo

**Identidad, revisión y asignación son cosas distintas.** Un plan tiene nombre,
sus condiciones son revisiones inmutables, y lo que una empresa contrató apunta a
*su* revisión. Publicar una revisión nueva no reescribe a nadie. Por eso se puede
cambiar de precio sin cambiarle el contrato a quien ya compró.

**Un fallo de lectura no es un plan.** Antes, no poder resolver el plan devolvía
el más bajo, y un cliente Full leía «Plan Demo». Ahora hay un tercer estado
—`unavailable`— que **niega y lo dice**. La misma idea aparece en los cuatro
ejes: `not_configured` no es «ilimitado» ni «cero», es que nadie lo ha decidido.

**Agotar un cupo no puede secuestrar los datos de nadie.** Por encima del límite
de almacenamiento y en modo consulta, el cliente **sigue pudiendo borrar**. Es la
única salida que le queda, y bloquearla lo dejaría atrapado.

**La decisión vive en la base.** Cada límite se resuelve y se reserva en una sola
transacción, bajo candado por empresa. La pantalla refleja; no decide.

## Lo que hay que saber para mantenerlo

- **La unión, no la suma.** Los minutos de uso se guardan como un conjunto de
  minutos por empresa. Tres personas a la vez consumen diez minutos, no treinta,
  y eso no se calcula: sale de la clave primaria. La misma decisión hace
  imposible construir encima un panel de productividad, porque la tabla **no
  guarda quién**.
- **Una llamada no es un crédito.** El peso lo dice un registro configurable, y
  el libro guarda el peso **aplicado**: cambiar la tarifa no reescribe lo cobrado.
- **La severidad manda sobre lo comercial.** Un incidente crítico de una empresa
  Free adelanta a una consulta de una Extra. Pagar no te cuela delante de una
  caída.
- **Reportar una avería nunca cuesta.** En ningún plan, ni en modo consulta, ni
  cuando el plan no se puede resolver. Si un cliente dudara, dejaría de reportar,
  y ese es el peor resultado posible.

## Lo que se aprendió por las malas

**Un `UPDATE` que la RLS filtra no da error: da cero filas.** Una prueba de
seguridad que comprobaba el error daba verde sin comprobar nada. Desde B5 se
comprueba el **efecto**.

**Los guardias hay que verlos fallar.** Los tres de cobertura —bytes, IA y
mutaciones— se probaron poniéndolos en rojo a propósito, y los tres atraparon
trabajo real en tramos posteriores.

**Un catálogo que nace sin RLS parece correcto.** Las siete tablas de SEC-01
tenían los `grant` cuidadosamente ajustados. Faltaba una línea, y el hallazgo lo
trajo un correo del proveedor. Ahora hay un guardia que pregunta al estado de la
base y un preflight que viaja dentro de las migraciones.

## Estado al cierre

| | |
|---|---|
| Local | **0167** |
| Staging | **0167** |
| Producción | **0111** · no tocada |

Replay limpio, 0 tablas sin RLS, typecheck y build en verde, lint sin errores.

**`test:all` está en rojo por una comprobación**, y es un defecto real
encontrado por esta misma aceptación: la bajada de plan no baja el plan. Necesita
la migración **0168**, que no se ha creado porque el encargo pide detenerse y
reportar antes de abrirla. Está descrito, reproducido y acotado en
`PE_04B6_COMMERCIAL_TRUTH.md`.

PE-04 **no se declara cerrado** mientras ese defecto siga abierto.
