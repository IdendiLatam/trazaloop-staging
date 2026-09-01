# PE-04B1 · Qué se comprobó

**102 comprobaciones**, tres suites.

| Suite | Nivel | Checks |
|---|---|---|
| `pe04b1-commercial-static` | puro · en `test:all` | 38 |
| `pe04b1-plan-catalog` | base real | 34 |
| `pe04b1-resolver` | base real | 30 |

```
npm run test:pe04b1-static     npm run test:pe04b1-catalog     npm run test:pe04b1-resolver
```

---

## 1 · La suite estática es la que guarda la promesa del tramo

B1 dice **no cambiar la autoridad de nada**. Eso es una ausencia, y una ausencia
no se demuestra ejecutando.

Y es la comprobación que más fácil se pierde: basta con que alguien «conecte» el
resolutor nuevo a una acción para que B1 deje de ser lo que dice ser — y desde
fuera no se notaría hasta que una empresa se quedara sin acceso.

| | Qué vigila |
|---|---|
| **A1** | Ningún fichero de producto importa `commercial-plans` ni `plan-shadow` |
| **A2** | Ninguno nombra las tablas nuevas |
| **A3** | 0162 no altera ni borra ninguna tabla legacy |
| **A4** | No redefine `create_organization` ni la provisión de módulos |
| **A5** | No hay doble escritura, ni el resolutor lee el modelo viejo |

A5 tiene un matiz que costó afinar: la **herramienta de sombra sí** lee el modelo
viejo, y es exactamente para lo que existe. Lo que no puede pasar es que el
**resolutor canónico** lo consulte para decidir.

---

## 2 · Lo que solo se puede comprobar ejecutando

| Afirmación | Cómo se comprueba |
|---|---|
| «Una revisión publicada es inmutable» | Se intenta cambiarle el precio, el nombre, la fecha; se borra; se tocan sus límites. **Cinco intentos, cinco rechazos**, y después se relee para confirmar que no cambió a medias |
| «Solo hay una vigente por plan» | Se intenta publicar una segunda |
| «La prueba caduca sola» | Se pregunta por un momento futuro y ya responde Free |
| «`core` no eleva el nivel» | Se le asigna `core` en Full a una empresa Free |
| «Un fallo no es un plan» | Sin sesión, contra otra empresa, con un id inventado |
| «Los bytes se copiaron» | Se compara **contra `plan_definitions`**, no contra un número escrito |

---

## 3 · Las letras del encargo

| | Qué pedía | Dónde |
|---|---|---|
| Identidad estable | `catalog` A1, A4 · `static` B1 |
| Solo free/full/extra | `catalog` A1 · `static` B1, B3 |
| Sin `demo` canónico | `catalog` A2 · `static` B2 |
| Sin plan `advisor` | `catalog` A3 · `static` B2 |
| Revisión inmutable | `catalog` D1–D4 · `static` I1, I2 |
| Una sola vigente | `catalog` E1, E2 |
| Historia conservada | `catalog` E2 · `resolver` D1–D3 |
| Precio en unidades menores | `catalog` C1 · `static` C1 |
| Sin impuestos | `static` C2, C3 |
| Extra sin precio | `catalog` C3 · `static` C4 |
| finite/unlimited/not_configured | `catalog` F1–F3 · `static` D1, D2 |
| Un solo sitio para la cuota | `catalog` B4 · `static` D3 |
| Free copiado de Demo | `catalog` B1, B3 · `resolver` F4 |
| Full y Extra copiados | `catalog` B2, B3 |
| Prueba que caduca | `resolver` C1–C4 |
| Free sobrevive a la prueba | `resolver` C3 |
| Resolución por módulo | `resolver` B5 |
| Resolución por empresa | `resolver` B1–B4 |
| `core` no eleva | `resolver` B2 · `static` H4 |
| Un error no es Free | `resolver` E1–E3 · `static` E1–E3 |
| Soporte no escribe | `catalog` G1 |
| El administrador de empresa tampoco | `catalog` G2 · `resolver` G1 |
| La vista pública oculta lo interno | `catalog` H1, H2 · `static` F1–F3 |
| Asignaciones inmutables | `resolver` D1, D2 · `static` I3, I4 |
| La sombra detecta deriva | `resolver` H1–H6 · `static` J1–J3 |
| El defecto Full→Demo, representado | `resolver` H2, H3 |

---

## 4 · El defecto de PE-04A, representado

`resolver` **H2** construye el caso exacto —módulos en `full`, suscripción en
`demo`— y comprueba que la comparación lo clasifica como `LEGACY_DRIFT` y que el
canónico habría dicho `full`.

**H3** comprueba lo que de verdad hacía falta: que el desacuerdo se marque
**aunque el canónico aún no haya migrado a nadie**. Sin eso, las quince filas
derivadas de la base local quedarían escondidas tras
`EXPECTED_MIGRATION_DIFFERENCE` — que es el estado normal de este tramo.

---

## 5 · Regresión

| | |
|---|---|
| `npm run test:all` | **EXIT 0** |
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run lint` | **0 errores** (68 avisos heredados) |
| `npm run build` | **EXIT 0** |
| Reejecución limpia `0001 → 0162` | **0 fallos**, 154 migraciones |
| Suites de base de PE-02, PE-03 y PE-04B1 | todas en verde sobre la base limpia |
| Comparación en sombra | 20 filas, 15 con desacuerdo legacy |

### Una prueba anterior corregida

`pe03b5-release-readiness` **E1** exigía que la cabecera fuera **0161**. Es una
fotografía: PE-04B1 añadió 0162 sin tocar nada de PE-03 y la rompió sin razón.

Ahora comprueba lo que sigue siendo promesa: que **PE-03 cerró en 0161** y que
ninguna migración posterior lleva su nombre. Y E2 conserva la única cabecera que
ese cierre puede seguir afirmando — **Producción en 0111**.

---

## 6 · Dos trampas que este tramo encontró

### La siembra no era idempotente, y `on conflict` no bastaba

`on conflict do nothing` resuelve el conflicto **después** de ejecutar los
disparadores `before insert`. Una segunda pasada sobre una revisión ya publicada
choca contra el disparador de inmutabilidad —correctamente— y aborta.

Descubierto ejecutando la siembra dos veces. Corregido con `where not exists`,
que ni siquiera intenta la fila duplicada.

### Una prueba no podía deshacer lo que hacía

`catalog` **E2** publicaba una revisión nueva de `free` con 99 bytes de cuota, y
su limpieza intentaba borrarla. **No se puede**: una revisión publicada no se
borra ni vuelve a vigencia, y ese es justamente el invariante que D3 comprueba.

Resultado: dejaba el catálogo con `free` en 99 bytes y rompía la suite del
resolutor, que comprobaba que free tuviera los bytes copiados.

Ahora E2 publica una **copia** de la vigente: la historia crece —que es lo
correcto— y el estado efectivo no cambia. La cuota de free sigue siendo la
copiada, y la propia prueba lo verifica al final.

> **Efecto conocido:** cada ejecución de la suite añade una revisión de `free` a
> la historia. Es lo que cuesta la inmutabilidad, y la reejecución limpia lo
> devuelve a una.

---

## 7 · Lo que NO se prueba aquí

- Que los límites se **apliquen**: B1 no aplica ninguno. Eso es B3.
- Que las empresas migren: B1 no migra a nadie. Eso es B2.
- Que los precios sean los correctos comercialmente: eso lo decide una persona.
- Nada de cobro, impuestos ni cupones: eso es PE-05.
