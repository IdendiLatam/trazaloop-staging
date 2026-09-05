# PE-05B6F.1 · La administración comercial, en idioma de negocio

*Cerrado el 5 de septiembre de 2026. Cabeceras: Local **0182** · Staging **0182** ·
Producción **0111**. **Sin migración.** Cobros al proveedor: **0**.*

---

## El problema, dicho sin rodeos

La consola comercial estaba escrita para quien diseñó el dominio, no para quien
lo administra. Pedía saber que un plan tiene **revisiones sucesoras**, que
**USD 40 se escriben 4000**, y que un descuento lleva además un **techo** que
nadie explicaba. Dos campos numéricos sin etiqueta obligaban a adivinar cuál era
el mensual.

Eso no es una cuestión de gusto: quien no entiende un formulario de precios o se
equivoca al escribirlo, o deja de tocarlo por miedo. Las dos cosas cuestan
dinero.

**Nada del dominio cambió.** El modelo sigue creando revisiones sucesoras,
guardando centavos y protegiendo el techo institucional. Lo que cambió es lo que
se lee y lo que se escribe.

---

## Lo que se dice ahora

| Antes | Ahora |
|---|---|
| «Una revisión publicada no se edita: para cambiar condiciones se crea una sucesora en borrador y se publica» | «Aquí puedes administrar las condiciones comerciales de cada plan. Cuando cambias un plan, Trazaloop conserva las condiciones anteriores en el historial para no modificar lo que ya fue ofrecido o contratado» |
| **Crear revisión sucesora** | **Cambiar condiciones del plan** |
| Borrador · revisión 3 | **Nuevas condiciones — Borrador** · «Versión 3» debajo |
| Historia de revisiones | **Historial de condiciones** |
| Revisión 2 · vigente desde 2026-09-01 | Versión 2 · vigente desde **1 de septiembre de 2026** |
| Publicar revisión | Publicar las nuevas condiciones |
| «"Sin configurar" no es "sin límite": es que nadie lo ha decidido, y el producto lo trata como una negativa» | «Si una condición no está configurada, Trazaloop la considera **no incluida** hasta que definas su valor» |
| «Los precios son ANTES DE IMPUESTOS · IVA aplicable según el país» | «Los precios mostrados son antes de impuestos. Los impuestos aplicables se calculan por separado» |

Al entrar en el borrador se explica, ahí mismo, qué va a pasar: *«Las condiciones
actuales se conservarán en el historial. Los cambios solo aplicarán cuando
publiques las nuevas condiciones.»*

El número de versión **no desaparece** —sirve para rastrear— pero deja de ser el
concepto con el que se interactúa.

---

## Los precios

Antes:

```
Precio (unidades menores, antes de impuestos)
[        ] [        ] [Guardar precio]
```

Ahora:

```
Precios antes de impuestos

Precio mensual (USD)      Precio anual (USD)
[ 40 ]                    [ 400 ]

                          [ Guardar precios ]

Escribe el precio como se dice: 40 para USD 40.
El precio anual es un precio propio, no doce mensuales.
```

Cada campo dentro de su `<label>` —también para quien navega con teclado o con
lector de pantalla—, y el nombre de campo que viaja al servidor pasó de
`monthly_price_minor` a `monthly_price_usd`.

### Quién convierte

**El servidor.** `parseUsdToMinor` vive en el dominio y la acción de servidor la
llama: el navegador manda lo que se escribió y nada más. El importe de un plan es
una decisión comercial, y el servidor tiene que poder rehacer la cuenta sin
fiarse de lo que le llegue.

Y convierte **en enteros**: `40.50 * 100` en coma flotante da `4049.999…`, así
que se separan la parte entera y los decimales y se suman. Probado con los cien
valores de `1,00` a `1,99`; truncar en vez de sumar convierte `1,13` en 112
centavos, y esa mutación se ve fallar.

Lo que **no** se acepta, y por qué:

| Entrada | Qué pasa |
|---|---|
| `40`, `400`, `0`, `40,50`, `40.50` | válidas |
| `-1`, `abc`, `1e3`, `40,505` | inválidas |
| `1.000`, `1,000` | **ambiguas** — «mil» para quien escribe en español, «uno» en inglés. Se rechaza diciendo: *«Escribe el precio sin separador de miles: 1000, no 1.000.»* |

Adivinar cuál de las dos es habría sido inventar un precio.

---

## Las campañas

El campo **«Techo máximo (%)»** desapareció del formulario. No del dominio: el
techo es **política**, y ahora lo pone el servidor.

- Programa **General** → sin techo.
- Programa **Institucional Full** → techo 40 %, y la ayuda lo dice: *«Este
  programa permite descuentos de hasta el 40 %.»* Si se escribe 45, el botón se
  desactiva y el mensaje es el que pidió el encargo. Y el servidor lo vuelve a
  rechazar, y la base también.
- En **Institucional Full** ya no hay casillas de plan: se muestra «Full» con la
  razón debajo. No se invita a elegir algo que la política no permite.

La acción pasó de **«Crear en borrador»** a **«Crear campaña»**; el estado
«Borrador» sigue viéndose y publicar sigue siendo un paso aparte y explícito.

Y el texto de cabecera dice ahora lo que hace un cupón: *«Un cupón cambia el
precio que paga el cliente; no cambia lo que incluye el plan. La campaña se crea
primero como borrador y se le da un código. Cuando la publiques, sus condiciones
quedarán fijas para los nuevos canjes.»*

---

## Lo que se volvió a probar

`npm run test:pe05b6f1-ux` · **21 comprobaciones**, y no solo de texto:

- que la conversión USD → centavos es exacta en los dos sentidos;
- que **una revisión publicada sigue sin poder editarse**;
- que **una campaña publicada sigue sin poder reescribirse**;
- que un institucional del 45 % lo rechaza **el servidor**;
- que un institucional apuntando a Extra lo rechaza **el servidor**;
- que el historial de versiones se sigue viendo;
- que las cifras comerciales **no se han movido**: Free 0/0, Full 4000/40000,
  Extra 10000/100000 centavos;
- y que soporte lee sin escribir, y una empresa cualquiera no administra nada.

**Vistas fallar**, con tres mutaciones: devolver el texto viejo del botón (A y
B), devolver el nombre de campo en centavos (D y E), y truncar en vez de sumar
en la conversión (F3).

---

## Lo que NO se tocó

Ni la economía de los planes, ni el motor de impuestos, ni la arquitectura del
tipo de cambio, ni las invariantes de cupones, ni `/settings/billing` —que en la
prueba humana ya se entendía—. **Sin migración**: esto era presentación sobre un
dominio que ya estaba bien.
