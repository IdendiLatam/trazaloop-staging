# PE-04B5 · El derecho de soporte

## Tres cosas que no son la misma

| | Qué es | Quién la tiene |
|---|---|---|
| **Reporte técnico** | «Trazaloop parece estar fallando» | **Free, Full y Extra** · no consume nada |
| **Orientación funcional** | «ayúdame a entender o usar Trazaloop» | **Extra** · 2 casos al mes por empresa |
| **Consultoría** | «revísame el sistema», «diséñame el proceso» | **ningún plan** · es Acompañamiento |

## Por qué el reporte técnico no se limita

Capar el reporte de averías con un contador comercial es capar la información
que hace falta para arreglarlas. Y hay algo peor que se evita a propósito: que un
cliente **no reporte un fallo por miedo a gastar su cupo**. Por eso los dos ejes
se enseñan separados y la pantalla dice, con esas palabras, que reportar un
problema técnico *no consume* casos.

Va más lejos: el reporte técnico sigue disponible **aunque el plan no se pueda
resolver**. Enterarse de que el producto está roto no puede depender de haber
podido leer un plan. Comprobado ejecutando, con la empresa sin asignación alguna.

Y sigue disponible en **modo consulta**: `/support` quedó fuera del reloj en
PE-04B4 y el envío no pasa por la puerta de mutación de negocio. Una prueba lo
vigila.

## El resolutor

`organization_support_entitlement(org, as_of)` devuelve plan efectivo, si se
permite reportar, si se incluye orientación, el límite, lo usado, lo que queda,
el periodo, la prioridad comercial y el objetivo de respuesta. Estados `FOUND` y
`UNAVAILABLE`.

`technical_reporting_allowed` es **siempre** cierto, incluso en `UNAVAILABLE`.

## De dónde sale el 2

De `plan_revision_limits.functional_support_cases_monthly`, que ya estaba
sembrado en 0162/0163: Free 0 · Full 0 · **Extra 2**. **No hay ningún «2»
escrito en la lógica ni en la interfaz**: una revisión futura puede cambiarlo
sin tocar código, igual que el almacenamiento, los créditos o el tiempo.

## Las cinco negativas

`FUNCTIONAL_SUPPORT_NOT_INCLUDED` · `FUNCTIONAL_SUPPORT_LIMIT_REACHED` ·
`SUPPORT_ENTITLEMENT_UNAVAILABLE` · `SUPPORT_NOT_ALLOWED_FOR_ACCOUNT_STATE` ·
`SUPPORT_SYSTEM_ERROR`.

Nunca se le dice «usaste tus dos casos» a quien no los usó porque la consulta
falló. Y el mensaje de `UNAVAILABLE` recuerda que el canal técnico sigue abierto.

## Lo que ve cada plan

**Free y Full** — «Reportar un problema técnico: disponible». La orientación
funcional aparece **explicada y deshabilitada**, no escondida: ocultarla dejaría
a alguien preguntándose por qué su duda de uso nunca se responde. Se le apunta a
la FAQ, la ayuda, los tutoriales e Intelligence dentro de su cuota. **No hay
ningún botón de compra**: eso es PE-05.

**Extra** — usados / incluidos / restantes, el periodo, y «objetivo de respuesta
inicial: 1 día hábil», dicho como objetivo de primera respuesta y nunca como
plazo de resolución.

Y en los tres: el Acompañamiento especializado se nombra como **servicio
aparte**, no como plan y no como algo incluido.
