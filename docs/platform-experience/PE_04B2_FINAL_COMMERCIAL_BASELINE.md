# PE-04B2 · La base comercial cerrada

Lo que el propietario del producto congeló después de B1. Está **guardado**;
casi nada de esto se **aplica** todavía, y cada cosa dice en qué tramo se
aplicará.

---

## 1 · Los tres planes

| | Free | Full | Extra |
|---|---|---|---|
| Mensual | **USD 0** | **USD 40** | **USD 100** |
| Anual | USD 0 | **USD 400** | **USD 1 000** |
| Almacenamiento | **50 MiB** · 52 428 800 | **500 MiB** · 524 288 000 | **5 GiB** · 5 368 709 120 |
| Intelligence | **25 créditos/mes** | **500 créditos/mes** | **2 000 créditos/mes** |
| Tiempo activo | **30 min/día · 300/mes** | **sin límite** | **sin límite** |
| Acompañamiento funcional | 0 | 0 | **2 casos/mes** |
| Reportar fallos del producto | sí | sí | sí |

Todos los precios son **antes de impuestos**, en unidades menores enteras. El
anual de Full equivale a **diez meses** —dos gratis—, y hay una prueba que
comprueba la relación para que cambiar uno sin el otro se note.

Los créditos y los casos **no se acumulan**.

---

## 2 · La prueba introductoria

| | |
|---|---|
| Qué da | **Full entero** |
| Cuánto dura | **48 horas** |
| Intelligence | **50 créditos EN TOTAL** — no 500 al mes |
| Automática | sí, al provisionar un módulo funcional |
| Una vez | sí, por (empresa, módulo) |
| Al vencer | cae a **Free**. Ningún dato se borra |

### La bolsa de la prueba es lo más fácil de modelar mal

La forma incorrecta sería duplicar Full en un cuarto plan `full_trial` con otros
créditos. Tendríamos dos planes que hay que mantener iguales en todo lo demás, y
el día que cambie el almacenamiento de Full alguien se olvidará del gemelo.

La forma correcta, que es la implementada: la prueba **apunta a la revisión real
de Full** y la política lleva su propia bolsa.

```sql
commercial_trial_policy (enabled, trial_plan_code, trial_duration_hours, trial_ai_credits)
                        (true,    'full',          48,                   50)
```

Una prueba comprueba que las asignaciones de tipo `trial` apuntan exactamente a
la revisión vigente de Full, y otra que 50 ≠ 500.

---

## 3 · «Créditos ponderados» no es «llamadas»

La unidad comercial es el **crédito ponderado**, y no se define como «una
llamada al proveedor». B4 mapeará clases de operación a pesos configurables —
una consulta breve no puede costar lo mismo que un análisis documental.

**B2 no congela ni un peso.** Solo guarda el saldo de cada plan.

Por dentro, el sistema sigue registrando lo que de verdad se gasta: tokens de
entrada, de caché y de salida, modelo, proveedor y coste. Eso es la **guarda de
coste**, es operativa y **no se le enseña al cliente** — es la separación que
PEC-09 congeló.

---

## 4 · Free no se queda fuera de sus datos

Al agotarse el tiempo activo, Free entra en **modo consulta**. Lo que sigue
funcionando:

- entrar;
- leer sus registros;
- consultar su información;
- descargar donde ya se podía;
- borrar donde ya se podía;
- la FAQ, la ayuda contextual y los tutoriales.

**Nunca se le cierra la puerta a alguien sobre sus propios datos.**

El medidor de tiempo y el modo consulta son **PE-04B4**. B2 guarda la condición
—30 y 300 minutos, `finite`— y no mide nada.

---

## 5 · Acompañamiento: no es un plan

USD 380 + IVA al mes, hasta **4 horas** de especialista, que no se acumulan.
Hora adicional, USD 110 + IVA.

Es un **complemento sobre un plan de pago**, no un cuarto plan: se combina con
Full *y* con Extra, y como plan obligaría a mantener las combinaciones a mano.

**No se implementa en B2.** No existe fila, ni tabla, ni columna — y una prueba
comprueba que `advisor` sigue sin ser un plan.

---

## 6 · Descuentos

| | |
|---|---|
| Full anual | 10 meses pagados / 12 de servicio |
| Cupón de aliado o institución | hasta **40 %**, elegible para **Full** |
| Extra | **sin** cupón institucional de referencia |
| Promociones futuras | configurables · máximo recomendado ~20 % |

Los cupones son **PE-05**. La arquitectura de B1 ya lo sostiene: un descuento se
aplica **sobre el precio de una revisión** y jamás crea un plan (PEC-13).

---

## 7 · Qué está aplicado y qué no

| | Guardado | Aplicado | Tramo |
|---|---|---|---|
| Precios | **sí** | — | PE-05 cobra |
| Almacenamiento | **sí** | no | **B3** |
| Créditos de IA | **sí** | no | **B4** |
| Minutos activos | **sí** | no | **B4** |
| Modo consulta | condición guardada | no | **B4** |
| Casos de acompañamiento | **sí** | no | **B5** |
| Cupones, cobro, impuestos | no | no | **PE-05** |

Una prueba estática vigila cada una de esas ausencias: que 0163 no descuente
créditos, no mida tiempo, no toque la reserva de subida, no toque los tickets y
no mencione pasarelas.
