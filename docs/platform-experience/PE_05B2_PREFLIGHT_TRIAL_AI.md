# PE-05B2 · §0 · La comprobación previa que detuvo el tramo

Antes de tocar una sola línea de pagos, el encargo pedía comprobar una cosa: que
lo que el runtime concede a una empresa **en prueba** coincida con la verdad
comercial congelada en PE-04B4.

No coincide. **PE-05B2 no se empezó.**

## Lo que dice la verdad comercial

| | Créditos ponderados |
|---|---|
| Free | 25 al mes, por empresa |
| Prueba de 48 h | **+50 en total**, bolsa aparte que caduca |
| Empresa en prueba | **50 + 25** |

La documentación del propio tramo lo dice con esas palabras:

> Una empresa Free con prueba activa dispone temporalmente de **50 + 25**. Eso
> no la convierte en Full: la mensual sigue siendo 25.
> — `PE_04B4_AI_RESERVATIONS.md`

La bolsa de la prueba **no es un adelanto** de los 500 de Full. Son cosas
distintas y el modelo las declaró distintas.

## Lo que hace el runtime

**50 + 500.**

```
Plan efectivo durante la prueba: {"plan_code":"full","grant_kind":"trial",...}

1 · Bolsas al empezar la prueba
   prueba:  50   (esperado 50)
   mensual: 500  (esperado 25)
```

Reproducible: `npx tsx scripts/pe05b2/preflight-trial-ai.ts`. El guion recorre
el camino real del producto —crear empresa, habilitar un módulo funcional, que
es lo que concede la prueba—, gasta créditos como los gastaría una persona y
retira lo que creó. Sale con código 1 mientras la discrepancia exista.

## Por qué pasa

No es un error de escritura: es una consecuencia del diseño, y por eso ninguna
prueba lo vio.

`ai_credits_status` resuelve la bolsa mensual así:

```sql
v_plan := plan_effective_for_organization(p_organization_id, now());
v_lim  := plan_limit_for_revision(v_plan->'plan_revision_id',
                                  'ai_weighted_credits_monthly');
```

Y `plan_effective_for_organization` devuelve, **correctamente**, el plan de
mayor rango entre las concesiones vivas. Durante la prueba conviven dos:

```
module/quality base  → free#2   sin fin
module/quality trial → full#4   hasta +48 h
```

`plan_rank('full') > plan_rank('free')`, así que el plan efectivo es Full. Eso
es lo que la prueba **debe** hacer para todo lo demás: el almacenamiento de
Full, los conteos de Full, las funciones de Full, el reloj sin tope de Full.
PE-04B3 lo congeló explícitamente para el almacenamiento.

Los créditos de Intelligence son **el único recurso** donde la verdad comercial
dice lo contrario, y el resolutor no tiene forma de saberlo: lee el mismo plan
efectivo que todos los demás.

## La segunda consecuencia, que es peor que la primera

Lo que se gasta de la bolsa **mensual** se anota en el mes en curso. Durante la
prueba se mide contra el tope de Full; cuando la prueba caduca, **las mismas
filas** se miden contra el tope de Free.

Comprobado ejecutando, con cincuenta operaciones de peso 5:

```
2 · Cincuenta operaciones de peso 5 durante la prueba
   aceptadas: 50   rechazadas: 0
   consumido: 250 créditos   (el techo comercial son 75)

3 · Cerrada la prueba, la empresa vuelve a Free
   mensual: 200/25 → OVER_LIMIT
   una operación nueva: AI_CREDIT_LIMIT_REACHED
```

Ni una sola operación fue rechazada mientras duraba la prueba: el producto se
las ofreció todas. Al caducar, esa empresa queda **ocho veces por encima** del
cupo de un plan que nunca excedió, e Intelligence deja de funcionarle hasta que
cambie el mes. No hizo nada mal; usó lo que se le enseñó.

Es el peor momento posible para que eso ocurra: justo cuando termina la prueba
y hay que decidir si se paga. Y PE-05 existe para cobrar esa decisión.

## Por qué las pruebas de B4 estaban en verde

La comprobación D/E de `tests/rls/pe04b4-credits-and-clock.test.ts` mira la
bolsa de la prueba y el consumo mensual, pero **no mira el tope mensual**:

```ts
assert(c.trial_total === 50 && c.trial_remaining === 50, ...);
assert(c.monthly_used === 0, ...);   // ← el LÍMITE no se comprueba
```

Y el comentario de al lado dejó escrito el supuesto sin comprobarlo: «El plan
efectivo es Full mientras dura, pero la bolsa de la prueba se informa aparte».
Lo primero es cierto; lo segundo no arregla lo primero.

Quien corrija esto debería añadir la aserción que falta —`monthly_limit === 25`
con la prueba activa— para que la prueba tenga dientes.

## Cerrado

La decisión de producto se confirmó sin cambios —la verdad comercial es la que
estaba— y la corrección vive en `0170_trial_ai_monthly_pool_fix.sql`. La regla
que se aplicó es general, no un 25 fijo:
[la bolsa mensual y la prueba](PE_04_TRIAL_AI_MONTHLY_POOL.md).

Lo que sigue describe el estado en el momento del hallazgo.

## Lo que NO se tocó entonces

No se corrigió nada en ese momento. El encargo de PE-05B2 §0 dice que ante esta discrepancia
hay que **parar y reportarla como una regresión de PE-04 que requiere
corrección**, y la corrección de PE-04 no está autorizada en este tramo.

Tampoco se empezó nada de Mercado Pago: ni documentación consultada, ni
dependencia, ni adaptador, ni endpoint, ni migración `0170`.

## La forma que tendría el remedio

Para quien lo autorice, y sin implementarlo:

1. La bolsa mensual de Intelligence debe salir del plan **base** de la empresa
   —la concesión de mayor rango que **no** sea `grant_kind = 'trial'`—, no del
   plan efectivo. Todo lo demás sigue saliendo del plan efectivo, sin cambios.
2. Si no hay base resoluble, se deniega. Sin dato no es cero.
3. La aserción que falta en D/E, para que no vuelva a pasar en silencio.

Dos decisiones son del negocio, no del código:

- **Los libros ya contaminados.** Cualquier empresa que haya gastado bolsa
  mensual durante una prueba tiene filas anotadas contra un tope de 500. Al
  corregir, esas mismas filas pasan a medirse contra 25. La historia no se
  reescribe para quedar limpia: hay que decidir si esas filas se reclasifican a
  la bolsa de la prueba, si se dejan como están, o si el mes se perdona. Habría
  que mirar Staging antes de corregir.
- **Si la intención comercial cambió.** Si en algún momento se decidió que la
  prueba sí lleve los 500 de Full, entonces lo que hay que corregir es la
  verdad congelada y la documentación, no el código. Pero eso es una decisión,
  no un descubrimiento, y no consta en ninguna parte.

## Producción

**No está afectada.** Producción sigue en la cabecera **0111**, que es anterior
a `0162` —el modelo canónico de planes— y a `0166` —los créditos ponderados—.
Allí no existe ninguna de estas funciones.

Local y Staging están en **0169** y comparten la definición de `0166`, así que
ambas tienen el defecto.
