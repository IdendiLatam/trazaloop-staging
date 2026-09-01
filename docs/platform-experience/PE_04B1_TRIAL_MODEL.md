# PE-04B1 · La prueba

---

## 1 · Lo que hay hoy, y qué le pasa

`provision_new_organization_modules` da a cada módulo funcional de una empresa
nueva `access_mode = 'demo'` con `access_expires_at = now() + 48 horas`.

Al vencer, `resolve_organization_module_access` devuelve `demo_expired` y el
módulo **bloquea escrituras**. Los datos sobreviven —no hay borrado ni cron—,
pero la empresa se queda mirando un producto en el que no puede crear nada.

Se queda **sin suelo**, porque en el modelo de hoy `demo` es a la vez la prueba y
el suelo, y cuando la prueba caduca no queda nada debajo.

---

## 2 · Lo que se construye

```
free      ← base permanente, sin caducidad
  +
full      ← concesión temporal, con ends_at
```

La prueba deja de ser un plan y pasa a ser una **concesión temporal de un plan
superior**. Al vencer, la concesión deja de aplicar y **queda el suelo**, que
funciona.

| Situación | Hoy | Con el modelo nuevo |
|---|---|---|
| Empresa nueva | `demo` 48 h | `free` **permanente** + concesión `trial` de `full` |
| Prueba vencida | **bloqueada** | cae a `free`, que funciona |
| Cliente que paga | `full` a mano | `full` con `grant_kind = 'sold'` |
| Cortesía | `access_mode` a mano | `full` con `grant_kind = 'courtesy'`, motivo y vigencia |

**La mejora que más se nota:** hoy la puerta se cierra; con Free debajo, hay un
escalón.

Y una consecuencia que hoy sería imposible: **una empresa Free puede recibir
después una prueba de funciones de pago** sin degradarla. Es una concesión con
vigencia; al caducar vuelve a Free.

---

## 3 · Caduca sola

Sin proceso programado. Sin cron. Sin ninguna escritura.

```sql
and (a.ends_at is null or a.ends_at > p_as_of)
```

Al pasar la fecha, la asignación deja de participar en el `where`, y como el
suelo Free sigue abierto debajo, la resolución **cae sola**.

Comprobado preguntando por un momento futuro: la misma empresa que ahora
resuelve `full / trial` resuelve `free / base` a las 72 horas, y no se ha
escrito nada.

Un modelo que necesitara un proceso para bajar de plan tendría una ventana en la
que el estado está mal porque el proceso no ha corrido. **Aquí no hay ventana.**

---

## 4 · Y no se reescribe

La asignación de la prueba caducada **se queda**, con su `grant_kind = 'trial'`,
su `starts_at`, su `ends_at` y quién la concedió. Es historia comercial: dice que
esa empresa probó Full del día X al día Y.

Reescribirla a Free borraría eso. Borrarla, también.

El disparador de solo-añadir lo impide, y además **no deja reabrir un periodo ya
cerrado**: cambiar el `ends_at` de una prueba pasada cambiaría lo que la empresa
tuvo.

---

## 5 · Una prueba siempre tiene final

```sql
check (grant_kind <> 'trial' or ends_at is not null)
```

Una prueba sin fecha de fin no es una prueba: es un plan. Que lo impida la base
y no la disciplina es la diferencia entre una regla y una intención.

---

## 6 · Las 48 horas, fuera de la función

```sql
commercial_trial_policy (enabled, trial_plan_code, trial_duration_hours)
```

Fila única, sembrada con **Full durante 48 horas**: exactamente lo que hace hoy
el producto, sacado de dentro de una función de PL/pgSQL.

Cambiarla es un `update`, no una migración. Y el propietario del producto puede
tocarla, que es todo el punto: hoy no puede.

Una prueba comprueba además que el número **48 no ha vuelto al código** del
modelo nuevo.

---

## 7 · Lo que B1 NO hace

`create_organization` y `provision_new_organization_modules` **no se tocan**. Una
empresa creada hoy sigue recibiendo `demo` en sus módulos, exactamente como
antes.

Conectar la política de prueba a la creación de empresas es **PE-04B2**, y tiene
que ir junto con la migración de las empresas que ya existen: cambiar solo la
creación dejaría a las nuevas en un modelo y a las viejas en otro.

---

## 8 · Lo que hará B2, y en qué orden

1. Contar lo que hay (la consulta de reconocimiento de PE-04A).
2. Crear la asignación **base Free** de cada empresa.
3. Traducir los módulos: `demo` vigente → concesión `trial` con **la fecha que ya
   tiene**; `full`/`extra` → asignación `sold`.
4. Comprobar empresa por empresa que **el acceso resuelto no bajó**.
5. Cambiar `create_organization` para que lea la política.
6. Mover los consumidores al resolutor canónico.

Los pasos 1 a 4 no cambian el comportamiento de nada: el modelo nuevo está ahí y
nadie lo lee todavía. El punto de no retorno es el 6, y para entonces el 4 ya lo
comprobó.

**Nadie pierde acceso**, y las empresas con prueba vencida **ganan**: hoy están
bloqueadas y pasarán a Free. Eso es un cambio de producto visible para clientes
reales y hay que decirlo, no deslizarlo.
