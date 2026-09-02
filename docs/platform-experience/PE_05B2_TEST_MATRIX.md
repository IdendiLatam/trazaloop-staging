# PE-05B2 · La matriz

`test:pe05b2-contract` · 42 · sin red ni credenciales.
`test:pe05b2-webhooks` · 24 · contra la base real.

| | Qué | Dónde | Estado |
|---|---|---|---|
| A | API oficial verificada y fechada | [descubrimiento](PE_05B2_MERCADOPAGO_DISCOVERY.md) | ✔ |
| B | Sin plan del proveedor | contrato · B | ✔ |
| C | Recurrencia mensual | contrato · C | ✔ |
| D | Recurrencia anual · representación | contrato · D | ✔ contrato · **sandbox pendiente** |
| E | Importe exacto en pesos, sin coma flotante | contrato · E | ✔ |
| F | Referencia externa opaca | contrato · F · base · F/G | ✔ |
| G | Crear suscripción | adaptador | **pendiente de credenciales** |
| H | Leer suscripción | adaptador | **pendiente de credenciales** |
| I | Cambiar el importe | adaptador | **pendiente de credenciales** |
| J | Cancelar / pausar | adaptador | **pendiente de credenciales** |
| K | Estados de suscripción traducidos | contrato · K | ✔ |
| L | Estados de pago traducidos | contrato · L | ✔ |
| M | Firma válida aceptada | contrato · M | ✔ |
| N | Otro secreto rechazado | contrato · N | ✔ |
| O | Manifiesto alterado rechazado | contrato · O | ✔ |
| P | Notificación repetida · un solo efecto | contrato · P · base · P | ✔ |
| Q | Evento fuera de orden | contrato · Q · base · Q | ✔ |
| R | Tema desconocido sin efecto | contrato · R | ✔ |
| S | Relectura del recurso tras el aviso | contrato · AC/AD | ✔ |
| T | Conciliación exacta del importe | contrato · T · base | ✔ |
| U | Pago aprobado activa **una** vez | base · T/U | ✔ |
| V | Rechazo no activa | base · V | ✔ |
| W | Renovación no duplica | base · W | ✔ |
| X | Caída del proveedor ≠ rechazo | contrato · X | ✔ |
| Y | Otra empresa no se activa | base · Y | ✔ |
| Z | Entorno desalineado falla cerrado | contrato · Z · base · Z | ✔ |
| AA | Eventos crudos privados | base · AA | ✔ |
| AB | Ningún secreto expuesto ni registrado | contrato · AB | ✔ |
| AC | RLS · 0 tablas sin RLS | replay | ✔ |
| AD | Regresión de la prueba de IA · 50 + 25 | `test:pe04-trial-ai` | ✔ 20/20 |
| AE | `test:all` | | ✔ EXIT=0 |

## Además

- Firma **auténtica pero vieja** rechazada · ventana de 5 minutos.
- `data.id` con mayúsculas normalizado antes del manifiesto.
- Sin secreto configurado no se acepta nada, y se dice con su propia razón.
- Firma inválida → **401** y ninguna llamada con efecto antes del corte.
- El sobre no conserva tarjeta, token, correo, documento ni nombre.
- Lo no firmado se anota **sin cuerpo**.
- Importe de **más** tampoco compra.
- Otra moneda tampoco.
- Referencia inventada, no-UUID o ausente: sin efecto.
- Renovación con importe equivocado: no se anota como cobrada.
- Estado desconocido: revisión, y el derecho intacto.
- Un cliente no llama ninguna función privilegiada.
- Un administrador ve su intento y no el de otra empresa.
- Contratar exige ser administrador de esa empresa.
- Un presupuesto tiene un solo intento vivo.
- El correo de facturación sale del contacto de la empresa, y si falta se dice.
- 0171 no altera ni redefine nada de B1.
- Ninguna pantalla importa la frontera de la pasarela.

## Vistas fallar

Se reintrodujo en la base una liquidación **sin conciliación y sin guardia de
entorno**: cayeron 6 de 24. Y en el contrato, tres guardias propios dieron
falsos rojos al escribirlos —medir el corte de firma desde la línea 1, buscar
`"1234"` como subcadena y prohibir nombrar a `0169`—; los tres se corrigieron
comprobando el invariante de verdad, no relajándolos.

## Regresión

| Suite | |
|---|---|
| PE-04B1…B6 | ✔ |
| Transiciones de 0168 | ✔ 18/18 |
| Prueba de IA · 50 + 25, no 500 | ✔ 20/20 |
| PE-05B1 facturación | ✔ 32/32 |
| SEC-01 | ✔ 0 tablas sin RLS |
| Replay `0001 → 0171` | ✔ 163 migraciones, 0 fallos |
