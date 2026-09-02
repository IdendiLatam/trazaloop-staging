# PE-05A · Moneda y conversión

## Cuatro monedas que no son la misma

Confundirlas es la forma habitual de que un cliente pague algo distinto de lo que
vio:

| | Qué es | Hoy |
|---|---|---|
| **Catálogo** | en qué se declaran las condiciones comerciales | **USD** |
| **Presentación** | qué ve el cliente en pantalla | por decidir |
| **Cobro** | qué moneda cobra el proveedor | por decidir |
| **Liquidación** | en qué recibe el dinero la empresa | COP, casi con seguridad |

Que un plan valga «USD 40» no significa que un proveedor colombiano pueda cobrar
40 dólares a una tarjeta colombiana. Son cosas distintas y el modelo las separa.

## Las cuatro opciones

| | Cómo | A favor | En contra |
|---|---|---|---|
| **A** | cobrar en **USD** | el catálogo y el cobro coinciden; nada que convertir | depende de que el proveedor lo permita a un comercio colombiano; el banco del cliente aplica su propia conversión y comisión, y el cargo no coincide con lo mostrado |
| **B** | mostrar USD, **cobrar COP** | el cliente ve el importe exacto en su moneda antes de pagar | hay que fijar una política de tipo de cambio y sostenerla |
| **C** | precios **en COP** en el catálogo | lo más simple de cobrar y de entender en Colombia | rompe el catálogo actual y complica vender fuera |
| **D** | híbrido por país | lo mejor de cada uno | dos catálogos que mantener y una fuente más de contradicción |

> **PAY-05 · Recomendación: B.** Catálogo en USD —ya lo está, y es lo que
> permite vender fuera sin rehacer nada— y **cobro en COP con el importe exacto
> mostrado antes de pagar**.
>
> El motivo es de producto, no técnico: un cliente colombiano que ve «USD 40» y
> recibe en su extracto un cargo de un importe que no reconoce escribe a soporte.
> Y tiene razón en escribir.

**Decisión humana pendiente 2.** Cobrar en USD o en COP. Depende de qué permita
el proveedor elegido, así que va después de la decisión 1.

## Si se cobra en COP: la política de conversión

> **PAY-06** · Hay cuatro maneras de fijar el tipo, y solo una es sencilla de
> auditar el primer año:
>
> | | Cómo | Problema |
> |---|---|---|
> | Conversión del proveedor | el proveedor cobra USD y convierte | el cliente no sabe el importe exacto antes de pagar |
> | Tasa diaria automática | se consulta una fuente de mercado cada día | hay que elegir fuente, tolerar caídas y explicar saltos |
> | **Tasa comercial fijada por administración** | un superadministrador fija la tasa y su vigencia | hay que acordarse de actualizarla |
> | Tasa fija por periodo | se revisa cada trimestre | se despega del mercado |
>
> **Recomendación: tasa comercial fijada por administración**, con vigencia
> explícita y un margen incorporado que absorba la volatilidad. Es la única que
> se puede explicar a un cliente y auditar contra un extracto sin depender de un
> tercero, y la que no rompe el cobro si una API de divisas se cae.
>
> **No se inventan tipos de cambio aquí.** Esto es arquitectura: qué se guarda y
> quién manda, no cuánto vale el dólar hoy.

## El tipo se congela en el presupuesto

> **PAY-07** · El importe de un cobro **se fija cuando se emite el presupuesto** y
> no se recalcula mientras el pago está en curso. Si el cliente tarda diez
> minutos en pagar y la tasa cambia entretanto, paga lo que vio.
>
> El presupuesto guarda, para siempre:
>
> - importe y moneda **de catálogo**;
> - descuento aplicado;
> - base imponible, impuesto y total;
> - **tipo de cambio usado, su origen y su instante**, si hubo conversión;
> - importe y moneda **cobrados**;
> - cuándo caduca el presupuesto.
>
> Con eso, seis meses después se puede reconstruir exactamente por qué se cobró
> lo que se cobró. Sin eso, no.

## Precios anuales y conversión

El anual no es «el mensual por doce con descuento escondido»: es un precio
publicado propio (`annual_price_minor`). La conversión se aplica igual, sobre ese
precio, y se congela igual.

## Lo que NO se hace

No se guarda un histórico de divisas, no se construye un conversor multi-moneda y
no se consulta una API de tipos en cada carga de página. Se guarda **el tipo que
se usó en cada cobro**, que es lo único que hace falta para responder a un
cliente y a un contador.
