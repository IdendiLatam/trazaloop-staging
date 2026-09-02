# PE-04B4 · Matriz de pruebas

## Contra la base real · `npm run test:pe04b4-usage` · **43 en verde**

### A · Cuotas comerciales
| | |
|---|---|
| A | Free = 25 créditos/mes por empresa |
| B | Full = 500 |
| C | Extra = 2 000 |
| I | Dos personas de la misma empresa comparten el saldo: 5 + 5 = 10 usados, 490 libres |

### B · Pesos
| | |
|---|---|
| M/N | Ligera 1, media 2, pesada 5 · **tres llamadas gastan 8 créditos, no 3** |
| L | Una operación sin peso registrado se **rechaza** (`AI_OPERATION_UNKNOWN`) |
| O/P | Cambiar el peso de 1 a 7 afecta a la siguiente y **la fila ya cobrada sigue diciendo 1** |

### C · La prueba
| | |
|---|---|
| D/E | 50 créditos adicionales, informados aparte de los 25 mensuales |
| F | **Se consume primero la bolsa que caduca**: la mensual sigue en cero |
| F2 | Agotada la de prueba, la siguiente pasa a la mensual |
| G | Cerrada la prueba, su bolsa deja de ofrecerse y de ser alcanzable |

### D · Periodo y cambios de plan
| | |
|---|---|
| H | Consumo del mes anterior **no** resta al nuevo: 0 de 25 |
| J | Subir de Free a Full sube el techo y **conserva** los 25 ya consumidos · no regala un mes nuevo |
| K | Bajar de Full a Free deja `OVER_LIMIT` con 60/25 y **el mismo número de filas** |

### E · Atomicidad
| | |
|---|---|
| Q | 1 crédito libre, dos operaciones de 1 en paralelo → **pasa una** |
| R | 5 libres, dos de 5 en paralelo → **pasa una** |
| S | Liberar devuelve el saldo: de 5 usados a 0 |
| T | Confirmar dos veces cobra **una** |
| U | El mismo envío reintentado reutiliza la reserva y **no cobra dos veces** |

### F · Semántica de las negativas
| | |
|---|---|
| V/W/X/Y | Agotarse (`AI_CREDIT_LIMIT_REACHED`), no poder resolver (`ENTITLEMENT_UNAVAILABLE`) y modo consulta (`CONSULTATION_MODE`) son **tres respuestas distintas** |

### G · El reloj
| | |
|---|---|
| Z/AA | Free = 30/día y 300/mes |
| AB | Full y Extra: `metered = false` y **cero filas escritas** tras un latido |
| AC | Durante la prueba tampoco corre el reloj de Free |
| AD/AE | Un latido **sin ninguna interacción** marca minuto |
| **AG** | **Tres personas a la vez → 1 minuto**, no 3 |
| AH | Tres pestañas de la misma persona → 1 minuto y 3 concesiones |
| — | Tres latidos seguidos → 1 minuto (idempotencia) |
| AI/AK | Lo de ayer no gasta hoy pero **sí cuenta en el mes** |
| AJ | El mes nuevo arranca en cero |

### H · Modo consulta
| | |
|---|---|
| AL | 30 del día → `CONSULTATION_DAILY_LIMIT` |
| AM | 300 del mes → `CONSULTATION_MONTHLY_LIMIT` con el día intacto |
| AN–AR | Leer, **borrar** y lo esencial de cuenta siguen permitidos |
| AS/AU | Crear/modificar y subir quedan bloqueados |
| AT | Intelligence se niega **aunque queden 25 créditos** |
| AV | Al reiniciar el cupo, todo vuelve a funcionar |

### I · Estados combinados
| | |
|---|---|
| **AW** | Almacenamiento `OVER_LIMIT` + modo consulta → **borrar sigue posible** |
| AX | Sin créditos y con tiempo → las escrituras normales siguen |
| AY | Con tiempo agotado y créditos de sobra → Intelligence bloqueada |
| AZ | Con la prueba activa se opera con normalidad aunque el mes de Free viniera gastado |

### J · Privacidad y autorización
Los minutos no guardan `user_id` · una persona de otra empresa no lee créditos ni
reloj **ni puede gastar el tiempo ajeno** · el dueño de la empresa **no** puede
escribir el libro de créditos · el personal de plataforma consulta la misma
fuente.

## Guardias estáticos · `npm run test:pe04b4-coverage` · **18 en verde**

**A · Intelligence.** Toda llamada al modelo sale de un camino declarado; cada
camino **reserva antes** de llamar (se comprueba el orden, no solo la
presencia), confirma con resultado y libera en al menos tres salidas sin él;
las diez operaciones tienen peso; ningún peso puede ser cero.

**B · Mutaciones.** Toda escritura sin puerta está declarada con su motivo, y la
lista no acumula entradas obsoletas; las acciones que retiran declaran
`delete_or_reduce`; la intención por omisión es la restrictiva.

**C · El reloj.** No escucha ratón, teclado, scroll ni foco; el cliente no envía
duraciones; los minutos son de la empresa y sin `user_id`.

**D · RLS.** Toda tabla que 0166 crea activa RLS **en la misma migración** y
tiene política; 0166 lleva el preflight SEC-01.

**E · UX.** No se enseñan tokens, coste ni pesos; las dos bolsas van separadas y
se dice que las de prueba caducan; cliente y consola usan la misma fuente; la
puerta está fuera del shell y el reloj se monta **solo** en el layout del shell.

### Guardias probados fallando
Un archivo nuevo con `generateStructured(` sin declarar → **rojo**, con nombre.
Una acción nueva con `revalidatePath` sin puerta → **rojo**, con nombre. Ambos
retirados, ambos de vuelta a verde.

## SECURITY-RLS-01

Lo cubre `npm run test:sec01-guard` (5 en verde), que pregunta al **estado real**
de la base después del replay: cero tablas base de `public` sin RLS, cero
privilegios sobre tablas sin RLS, políticas que alcanzan a `anon` declaradas y
vistas de propietario clasificadas. Verificado tras el replay 0001→0166:
**0 infractoras**.

## Reejecución y regresión

- `bash scripts/replay-local.sh` — **158 migraciones, 0 fallos, cabecera 0166**.
- Tablas de `public` sin RLS tras el replay: **0**.
- `npm run test:all` — **en verde**; lint 0 errores y **68 avisos heredados**.
- `npm run build` — correcto.
- PE-04B1 (30 ✔), PE-04B2 (29 ✔), PE-04B3 (22 ✔), PE-03, PE-02 y SEC-01 siguen
  en verde sobre la base reejecutada.

## Pruebas heredadas actualizadas

En todas se sustituyó la afirmación sobre la **forma vieja** por la del **mismo
invariante**; ninguna se relajó.

| Prueba | Antes | Ahora |
|---|---|---|
| `plans` · barrido de 35 escrituras | `checkXCanMutate()` literal | `checkXCanMutate(` · la puerta es la misma, ahora con intención |
| `plans` · corrección 8 | el logo hereda el bloqueo de la cuota | pide `checkOrganizationCanMutate` **explícito**, y al quitarlo declara `delete_or_reduce` |
| `document-master` 15 | `checkCprCanMutate()` | `checkCprCanMutate("delete_or_reduce")` · borrar un borrador retira |
| `pcr01` 8 | `tier === null` deniega | `unavailable` **y** `not_configured` deniegan |
| `pcr01` 9 | resuelve con `getOrganizationEffectivePlanCode` | resuelve con `getOrganizationPlanLimit` y **sin** puente legacy |
| `rh01` 2–5 | ejercitaban `resolveEffectiveStorageLimitBytes` | comprueban que **no vuelva**, y que los números congelados sigan en el catálogo canónico |
| `rh01` 10 | la consola traduce a plan legacy | la consola lee `listOrganizationPlanLimits` |
| `pe04b2` C3 | el puente existe y dice cuándo se retira | el puente **se retiró**, y consta en qué tramo |
| `quality-12-2b` F2 | `checkOrganizationCanMutate()` | `checkOrganizationCanMutate(` |

## Autorización de la migración

`0166_intelligence_and_free_usage_limits.sql` añadida a las listas blancas de las
**16** suites que las mantienen, junto a `0165_quality_catalog_rls_hardening.sql`.
