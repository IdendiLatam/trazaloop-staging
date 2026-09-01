# PE-04B1 · El resolutor

Tres respuestas, y la tercera es el motivo de que exista.

---

## 1 · El defecto que corrige

`getOrganizationEffectivePlanCode` devuelve **`'demo'` ante cualquier error**.
Falla cerrado —bien— y a la vez **miente sobre la identidad del plan**: no
distingue «es el plan más bajo» de «no pude saberlo».

Esa confusión es la que hace que la consola le diga «Plan Demo» a un cliente que
tiene Full.

```
found        hay asignación vigente. Aquí está el plan
absent       no hay ninguna. La empresa no tiene derecho a esto
unavailable  no se pudo determinar
```

Quien consuma esto debe **denegar** ante `unavailable` igual que ante `absent`
—jamás conceder por avería— y **no puede enseñarlo como si fuera un plan**.

Es la regla que PE-01 congeló para los módulos y PE-03 para los vídeos: **sin
dato no es cero**. Aquí, un fallo no es un plan.

Probado en tres direcciones: sin sesión, contra una empresa ajena, y con un
identificador inventado. Las tres devuelven `unavailable` y **ninguna trae un
código de plan** — el tipo de TypeScript lo hace imposible, y la prueba lo
comprueba en ejecución.

Y un código de plan que no esté en el catálogo canónico tampoco se «arregla»
eligiendo uno: se declara indeterminado. Adivinar ahí sería volver al fallo de
hoy.

---

## 2 · La precedencia, escrita una vez

```sql
create function plan_rank(code) returns integer immutable as
  case code when 'extra' then 3 when 'full' then 2 when 'free' then 1 else 0 end
```

**Una** función, **una** vez. Hoy la precedencia está dentro de un `case` en
`organization_effective_plan_code`; repartirla por el código es como dos sitios
acaban discrepando. Una prueba cuenta las apariciones de `when 'extra' then 3` y
exige que sea exactamente una.

Un código desconocido vale 0 y por tanto nunca gana.

---

## 3 · Dos resolutores, dos ámbitos

### Por módulo · `plan_effective_for_module(org, module, as_of)`

Cuentan la asignación **del módulo** y la **de empresa**; gana la mejor. Así una
empresa con base Free y Quality comprado en Full resuelve Free en PCR y Full en
Quality — la mezcla se conserva.

### Por empresa · `plan_effective_for_organization(org, as_of)`

Para los recursos que son de la empresa: el almacenamiento y la IA, que el
propietario del producto congeló como cuota única.

**Excluye los módulos no funcionales**, y esa línea es más importante de lo que
parece:

```sql
and (a.scope = 'organization' or coalesce(m.is_functional, false))
```

`core` nace en `full` **para siempre en toda empresa**, porque es
infraestructura. Si contara, cualquier empresa del producto resolvería a Full
comercialmente y **el plan dejaría de significar nada**. Hay una prueba dedicada:
se asigna `core` en Full a una empresa con base Free y se comprueba que sigue
resolviendo Free.

---

## 4 · La prueba caduca por efecto del tiempo

No hay proceso programado. No hay cron. No hay ninguna escritura que baje a
nadie de plan.

```sql
and a.starts_at <= p_as_of
and (a.ends_at is null or a.ends_at > p_as_of)
```

Al vencer, la asignación **deja de participar en el `where`**. Y como el suelo
Free sigue abierto debajo, la resolución cae sola a Free.

La prueba que lo demuestra pregunta por un momento **futuro** y recibe Free sin
que se haya escrito nada:

```
prueba de Full vigente        → full / trial
la misma, a las 72 horas      → free / base
```

Y la fila de la prueba **sigue ahí**, con su `grant_kind = 'trial'` y su fecha:
una prueba caducada es historia comercial, no basura.

**Por qué importa:** un modelo que necesita un proceso para bajar de plan tiene
una ventana en la que el estado está mal porque el proceso no ha corrido. Aquí
no hay ventana.

---

## 5 · `as_of`, y para qué sirve de verdad

Permite preguntar «¿qué tendrá esta empresa cuando venza la prueba?» **sin
escribir nada**. Sirve para tres cosas:

- probar la caducidad de forma determinista, sin esperar 48 horas;
- que la consola pueda avisar de lo que va a pasar;
- que la migración de B2 pueda comprobar el antes y el después.

---

## 6 · Los límites deniegan cuando no se saben

```ts
allowsUsage(limit, currentUsage, requested)
```

Una sola función traduce un límite en un sí o un no, para que la regla viva en
un sitio.

| Estado | Resultado |
|---|---|
| `unlimited` | permite |
| `finite` | compara `uso + pedido ≤ valor` |
| `not_configured` | **DENIEGA** |
| `unavailable` | **DENIEGA** |

Los dos últimos son lo contrario de lo cómodo. Lo cómodo sería dejar pasar
mientras no se haya decidido — pero **un límite sin decidir que concede es un
límite que no existe**, y una avería que concede es una puerta abierta por
accidente.

Y el borde se prueba: con límite 5, `4 + 1` pasa y `5 + 1` no.

---

## 7 · La autorización sigue donde estaba

Los dos resolutores exigen sesión y `is_org_member(org) or is_platform_staff()`
antes de responder. Son `security definer` con `search_path` fijo — la lección de
0141: una subconsulta dentro de una política se evalúa con la identidad de quien
llama, y puede devolver cero filas en silencio.

**Una comprobación de plan no sustituye a una de permiso, ni al revés.** Eso es
PEC-31 y se probará entero en B3, cuando haya algo que bloquear.

---

## 8 · Y no está conectado a nada

Ninguna acción del producto lo llama. Las subidas, el acceso a módulos, la IA y
los tickets siguen consultando el modelo de hoy.

Una prueba estática recorre **todo** `app/`, `components/`, `server/` y `lib/` y
exige que ningún fichero —salvo los dos del propio modelo nuevo— importe
`commercial-plans` ni `plan-shadow`, ni nombre las tablas nuevas.

Es la comprobación que más fácil se pierde: basta con que alguien «conecte» el
resolutor para que B1 deje de ser lo que dice ser, y desde fuera no se notaría
hasta que una empresa se quedara sin acceso.
