# PE-05B1 · Matriz de pruebas

`npm run test:pe05b1-billing` · **32 en verde**, contra la base real.

## Lo que no se compra
**A** Free no se contrata — es el suelo, no un plan de cero pesos ·
**B** la prueba tampoco, y no crea ninguna suscripción de pago.

## El presupuesto
**C–F** Full mensual/anual y Extra mensual/anual con base, IVA y total **exactos**
contra la fórmula documentada · **G** el lanzamiento cobra **19 %** al SaaS
autogestionable, con clase `self_service_saas`.

## Falla cerrado
**H/W** sin regla fiscal vigente el cobro **se para** — ni 0 % ni 19 % ·
sin tipo de cambio vigente, tampoco: no se inventa uno.

## El navegador no mueve el dinero
**I/J** no puede insertar un presupuesto a su medida ni cambiar el total de uno
existente — comprobado **por efecto**.

## El presupuesto no se mueve
**K** caduca a los 30 minutos exactos y uno caducado **no se liquida** ·
**L/M** publicar una tasa nueva no cambia el importe ni el tipo congelados.

## Del pago al derecho
**Y** volver del checkout **no activa nada**: un cliente no puede liquidar ·
**Z/AA** un pago verificado activa por la vía canónica, con origen `checkout`, y
el plan efectivo pasa de `free` a `full` · **AB** pagar no concede módulos no
habilitados ni toca `core` · **AC** un módulo no funcional no hereda plan ·
**AF** una sola suscripción viva por empresa · **AL** liquidar dos veces el mismo
pago **no** cobra ni activa dos veces.

## La futura exención — el bloque que da forma al tramo
**Q/R/S/T** una regla al 0 % con fecha futura **no actúa antes**, **no reescribe**
el cobro de hoy y **no toca** el precio base contratado; en el futuro, misma base
e impuesto cero · **U** el Acompañamiento **conserva su 19 %**: no hay arrastre ·
**V** un borrador de exención no tiene ningún efecto · una regla ya aplicada no
cambia de significado · una regla activa **exige** constancia de aprobación.

## Los tres ejes
**X** un rechazo crea pago sin suscripción y sin derecho; el derecho existe sin
pago (suelo Free y prueba) · un presupuesto rechazado sigue abierto para
reintentar.

## Quién puede qué
**AD** solo `admin` contrata — `quality` recibe `NOT_AUTHORIZED` · **AE** nadie
cotiza ni lee facturación de una empresa ajena · ni soporte ni cliente cambian
tasas ni reglas fiscales · **AK** cero tablas de `public` sin RLS · **AJ** lo
heredado sigue sin mandar.

## Estados que no se confunden
**AG** pasarela caída ≠ rechazo — el doble los devuelve como fallos distintos ·
**AH/AI** cancelación al final del periodo y gracia representadas en el esquema.

## Regresión

- Replay `0001 → 0169` — **161 migraciones, 0 fallos**.
- Tablas de `public` sin RLS: **0**.
- `npm run test:all` — **exit 0**. `typecheck` **0**, `build` **0**, lint **0
  errores / 68 avisos heredados**.
- PE-04B6 transiciones **18/18** tras extraer el núcleo de 0168 — la condición
  para dar la extracción por buena.

## Lo que ninguna suite sustituye

Que el importe cobrado coincida con el extracto real del banco, y que la
presentación fiscal sea la correcta. Lo primero necesita un pago en sandbox con
verificación humana (B2); lo segundo, al contador.
