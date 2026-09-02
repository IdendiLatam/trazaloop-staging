# PE-04B6 · El ciclo completo de una empresa

Probado sobre la base real, con el camino de aprovisionamiento del producto.

## Nace

`create_organization` deja **base Free por módulo funcional** y **una prueba de
Full por módulo funcional**, con `ends_at` propio. Efectivo durante la prueba:
**Full**. `core` no eleva nada — nace en Full en toda empresa porque es
infraestructura, y si contara el plan no significaría nada.

Los cinco ejes coinciden: almacenamiento 500 MiB · tiempo **no medido** ·
créditos mensuales 500 + **50 de prueba aparte** · soporte técnico sí ·
orientación funcional **no** (es de Extra, y la prueba es de Full).

## La prueba caduca sola

Cerrando el `ends_at` de las concesiones —que es como caducan de verdad, por el
paso del tiempo— el efectivo cae a **Free** sin cron, sin proceso y **sin borrar
ni una asignación**. Las cinco lecturas vuelven a Free a la vez: 50 MiB, 25
créditos, reloj 30/300, soporte técnico sí, orientación no. Los créditos de
prueba dejan de ser alcanzables; la bolsa mensual sigue intacta.

> Detalle de método: la provisión crea **una prueba por módulo**, no una. Cerrar
> solo la primera dejaba a la empresa en Full por las otras, y las diez
> comprobaciones siguientes medían otra cosa. Fue un fallo de la suite, no del
> producto, y está corregido.

## Bajada con datos dentro

Con 200 MiB ocupados, Free queda **OVER_LIMIT** y **no desaparece ni un byte**.
Se puede leer, descargar y **borrar**; no se puede subir. Al borrar hasta 10 MiB,
subir vuelve a permitirse. Ningún dato se pierde en el camino.

## El reloj y el modo consulta

A los 30 minutos del día: **modo consulta**. Leer, descargar, borrar y las
operaciones esenciales de cuenta siguen; crear, subir y ejecutar Intelligence no.
**Reportar una avería sigue disponible** — si se bloqueara, dejaríamos de
enterarnos de que el producto falla justo para quien más barato lo tiene.

Al reiniciar el día vuelve la operación normal. Y el tope **mensual** no se
escapa reiniciando el día: con 300 minutos de ayer, hoy está a cero y la empresa
sigue en modo consulta mensual.

## Subir y bajar

**Free → Full**: efecto inmediato en los cinco ejes, y lo ya consumido del mes
**sigue consumido** — subir no regala un mes nuevo.

**Full → Extra**: 5 GiB, 2 000 créditos, 2 casos de soporte. **No concede acceso
a ningún módulo**: comercial y acceso son ejes distintos, y se comprueba
comparando `organization_modules` antes y después.

**Extra → Full**: los casos ya aceptados siguen abiertos y el reporte técnico
sigue. **Aquí aparece el defecto abierto de este tramo** (ver
`PE_04B6_COMMERCIAL_TRUTH.md`).

**Volver a Extra el mismo mes**: el cupo de soporte sigue en 2/2 y el consumo de
IA no se duplica. Cambiar de plan no regala nada.

## Módulos mezclados

Quality en Extra, PCR en Full, Textiles en Free: cada módulo resuelve **su**
plan, y los recursos de empresa toman el nivel más alto elegible —almacenamiento
5 GiB, 2 casos de soporte—. Tener Extra **no abre** un módulo no contratado.

## Cuando no se puede saber

Sin asignación resoluble, los cuatro estados lo dicen y **ninguno inventa un
plan**: `QUOTA_UNAVAILABLE/plan_absent`, `UNAVAILABLE/plan_absent`,
`ENTITLEMENT_UNAVAILABLE`, soporte `UNAVAILABLE`. Y aun así: leer, borrar y
**reportar averías** siguen disponibles; crear, no.
