# PE-04B2 · Qué se comprobó

**54 comprobaciones**, dos suites.

| Suite | Nivel | Checks |
|---|---|---|
| `pe04b2-commercial-baseline` | base real | 29 |
| `pe04b2-cutover-static` | puro · en `test:all` | 25 |

```
npm run test:pe04b2-baseline     npm run test:pe04b2-static
```

---

## 1 · Las letras del encargo

### Revisiones comerciales

| | Qué pedía | Dónde |
|---|---|---|
| **A** | Las de B1 siguen siendo historia | `baseline` A1, A2 · `static` A2 |
| **B** | Free representa la base cerrada | `baseline` B1 |
| **C** | Full ídem | `baseline` B2 |
| **D** | Extra 10000 / 100000 | `baseline` B3 |
| **E** | Free 25 créditos | `baseline` B1 |
| **F** | Full 500 | `baseline` B2 |
| **G** | Extra 2000 | `baseline` B3 |
| **H** | Free 30 min/día | `baseline` B1 |
| **I** | Free 300 min/mes | `baseline` B1 |
| **J** | Full y Extra sin tope de tiempo | `baseline` B2, B3 |
| **K** | Prueba con 50 créditos | `baseline` B6, B7 |
| **L** | Prueba de 48 h | `baseline` B6 |
| **M** | Advisor ausente | `baseline` B5 · `static` D1 |

### Migración

| | Qué pedía | Dónde |
|---|---|---|
| **N** | Empresa nueva → Free + prueba | `baseline` C1, C3 |
| **O** | La prueba lleva 50, no los 500 de Full | `baseline` B6, B7 |
| **P** | La duración sale de la política | `baseline` C5 · `static` D3 |
| **Q** | Cambiar la política no toca lo concedido | `baseline` C6 |
| **R** | Prueba vigente conserva su caducidad | `baseline` E2 · `static` F4 |
| **S** | Prueba vencida → Free | `baseline` E3 |
| **T** | Full → Free + Full permanente | `baseline` E1 |
| **U** | Extra ídem | `baseline` E4 |
| **V** | La mezcla se conserva | `baseline` E4 |
| **W** | `core` excluido | `baseline` C2 · `static` F2 |
| **X** | La prueba, una vez | `baseline` D1, D2 · `static` D4 |
| **Y** | Un módulo posterior, una vez | `baseline` D1, D2 |
| **Z** | Reejecutar no duplica | `baseline` E5 · `static` F3 |

### Doble verdad

| | Qué pedía | Dónde |
|---|---|---|
| **AA** | Módulo Full + suscripción Demo → Full | `baseline` F1 |
| **AB** | Módulo Extra + suscripción Demo → Extra | `baseline` E4, F1 |
| **AC** | Prueba vencida + suscripción Full → Free | `baseline` F2 |
| **AD** | El resolutor no lee `plan_code` como autoridad | `baseline` F3 · `static` B1, F1 |

### Fallo

| | Qué pedía | Dónde |
|---|---|---|
| **AE** | Un fallo no es Free | `baseline` G1, G2 · `static` B2 |
| **AF** | Ni Demo | `static` B1, B2 |
| **AG** | «No disponible» es explícito | `baseline` G1 · `static` B3, B4 |

---

## 2 · Las dos que no se pueden falsear

**`baseline` F3 · «el plan efectivo ya no lee la suscripción legacy».** Se
comprueba por **comportamiento**, no leyendo el código: se borra la fila legacy
entera y el plan efectivo sigue diciendo lo mismo. Si todavía la leyera,
cambiaría.

**`baseline` C4 · «al vencer cae a Free sin escribir nada».** Se pregunta por un
momento futuro y la respuesta ya es Free. Ningún proceso ha corrido, y por tanto
no hay ventana en la que el estado esté mal.

---

## 3 · Y las ausencias que guardan el alcance

`static` E1–E6 vigila que nada de B3, B4, B5 ni PE-05 se haya colado: que 0163 no
descuente créditos, no mida tiempo, no toque la reserva de subida, no toque los
tickets, no mencione pasarelas, y **no redefina el acceso al módulo**.

La última es la más importante y la menos obvia: desbloquear una prueba vencida
sin el medidor de minutos dejaría a Free sin ninguna frontera de uso. La prueba
exige además que 0163 diga **a qué tramo** se aplaza el modo consulta.

---

## 4 · Regresión

| | |
|---|---|
| `npm run test:all` | **EXIT 0** |
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run lint` | **0 errores** (68 avisos heredados) |
| `npm run build` | **EXIT 0** |
| Reejecución limpia `0001 → 0163` | **0 fallos**, 155 migraciones |
| Suites de base de PE-02, PE-03, PE-04B1 y B2 | todas en verde sobre la base limpia |
| Reconocimiento previo | `sin_clasificar` = **0** |

---

## 5 · Seis pruebas anteriores corregidas

Ninguna era un fallo del producto. Todas defendían el estado anterior al cambio
de autoridad, y se anota cada una porque cambiar una prueba para que pase es lo
que no se debe hacer en silencio.

| Prueba | Qué exigía | Qué exige ahora |
|---|---|---|
| `plans` | `PLAN_CODES` = exactamente demo/full/extra | Los legacy **más** `free`, y que `demo` **no** sea un plan comercial |
| `rh01` **1** | Cuotas de los tres del seed 0050 | Igual, con el tipo estrecho de los planes legacy |
| `rh01` **9** | Rótulo «Plan heredado (histórico / administrativo)» | **«LEGACY · no autoritativo»**, y que el suave no vuelva |
| `rh01` **10** | Límites desde `effectivePlanCode` | Igual, **más** el camino honesto cuando no hay plan que enseñar |
| `pcr01` **8** | `if (error) return "demo"` | `if (error) return null`, **y** que quien llama deniegue |
| `pe04b1-resolver` | Empresa nueva sin asignaciones | Se limpian primero: B2 hizo que nazcan con ellas |
| `pe04b1-catalog` **C3** | El precio de Extra está sin configurar | El **estado** «sin configurar» existe y no es «gratis» — sobre la revisión de B1, que sigue ahí |

Las dos últimas son consecuencia directa de que B2 hizo su trabajo: una empresa
nueva **ya nace** con Free y prueba, y Extra **ya tiene** precio.

Ninguna quedó más laxa. `pcr01` **8** ganó una comprobación que antes no había:
que el consumidor **deniegue** ante un plan indeterminado, no solo que el
resolutor devuelva algo distinto.

---

## 6 · Un defecto real que las pruebas encontraron

Al redefinir `provision_new_organization_modules` **parafraseé** su cuerpo en vez
de copiarlo, y escribí un `insert into audit_log (..., action, ...)`. `audit_log`
no tiene columna `action`: tiene `event_type`, y el original usa el ayudante
`log_event()`.

Resultado: **crear una empresa fallaba entero**. Catorce comprobaciones en rojo
lo dijeron a la primera.

> **La regla:** al redefinir una función existente, se copia su cuerpo de la
> migración que la creó. Parafrasearlo es reescribir de memoria algo que ya
> funcionaba.
