# PE-04B2 · La deuda Full → «Plan Demo · 50 MB», cerrada

---

## 1 · Qué era

Una empresa con sus módulos en **Full** aparecía en la consola como **«Plan
Demo»** y con **«0 MB / 50 MB»** de almacenamiento.

PE-04A lo reprodujo y encontró la causa: **dos fuentes de verdad**.

- `create_organization` inserta `organization_subscriptions.plan_code = 'demo'`;
- subir un módulo a Full escribe `organization_modules.access_mode` y **no toca
  esa fila**;
- `v_organization_plan_usage` lee la fila que nadie actualiza, y de ahí salen el
  «Demo» y los 50 MB.

De las cuatro hipótesis del encargo original era **A + B + D** y **no C**: la
cuota que el servidor aplicaba de verdad ya era la correcta, porque
`begin_cpr_storage_upload` lee el `access_mode` del módulo. Lo que estaba mal era
lo que se enseñaba.

En la base local, **el 100 % de las empresas** tenía las dos fuentes en
desacuerdo.

---

## 2 · Y tenía una segunda mitad

`getOrganizationEffectivePlanCode` devolvía `'demo'` ante **cualquier error de
lectura**. Así que había dos caminos distintos hacia la misma pantalla mentirosa:

1. leer la suscripción legacy, que estaba obsoleta;
2. fallar al leer, y presentar el fallo como el plan más bajo.

El primero se veía. El segundo no, y por eso duró.

---

## 3 · Qué se hizo

| Mitad | Arreglo |
|---|---|
| Fuente obsoleta | `organization_effective_plan_code` lee el modelo canónico y **ya no consulta la suscripción** |
| Fallo disfrazado | Devuelve `null` = «no se pudo determinar», y quien llama **deniega** sin enseñarlo como plan |
| Cuota falsa | `organization_commercial_storage_bytes` da la referencia canónica |
| Rótulo suave | «LEGACY · no autoritativo», con esas palabras |

---

## 4 · Cómo se comprueba que está cerrada

Cuatro pruebas, y todas construyen el caso exacto.

**Módulo Full + suscripción Demo → FULL.** Se monta la contradicción, se migra, y
el plan efectivo dice `full`. Y se comprueba que la fila legacy **sigue diciendo
`demo`**: no se reescribió, porque eso sería falsificar la evidencia de lo que se
creyó.

**Módulo con prueba vencida + suscripción Full → FREE.** El error simétrico: una
suscripción legacy no puede elevar un módulo cuya prueba caducó.

**Borrar la suscripción no cambia el plan.** Se comprueba por comportamiento, que
es más fuerte que leer el código: se borra la fila legacy entera y el plan
efectivo sigue diciendo lo mismo. Si todavía la leyera, cambiaría.

**La cuota canónica dice 500 MiB.** Sobre una empresa con módulos Full y
suscripción Demo. Y de paso se verifica que la vista legacy **sigue diciendo
50 MB** — porque si hubiera cambiado, alguien habría tocado evidencia histórica.

---

## 5 · Lo que queda de la deuda

La fila legacy sigue existiendo y sigue diciendo lo que decía. **No se corrige**,
y es deliberado: dice qué se creyó y cuándo, y reescribirla borraría eso.

Lo que cambió no es el dato: es **quién manda**. Y lo que se enseña ahora dice
cuál es cuál.

`v_organization_plan_usage` sigue calculando su `plan_code` y su
`storage_limit_bytes` desde la suscripción. No se tocó —hay consumidores que
dependen de su forma— pero **la consola ya no la usa para decir el plan**. La
vista desaparecerá de los caminos de decisión en **PE-04B3**, cuando la cuota
canónica pase a aplicarse.
