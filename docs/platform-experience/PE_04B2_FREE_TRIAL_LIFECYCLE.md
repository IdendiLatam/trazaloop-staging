# PE-04B2 · Free y la prueba

---

## 1 · El ciclo, entero

```
empresa nueva
   ├─ base Free        permanente, por módulo funcional, SIN caducidad
   └─ prueba de Full   48 h, con ends_at

      ── 48 horas después, sin que corra ningún proceso ──

   └─ base Free        sigue ahí, y ahora es lo que aplica
```

Al vencer, la concesión deja de participar en el `where` del resolutor. **No hay
proceso programado, no hay cron, no hay ninguna escritura.** Se comprueba
preguntando por un momento futuro: la misma empresa que ahora resuelve
`full / trial` resuelve `free / base` a las 72 horas, y no se ha escrito nada.

Un modelo que necesitara un proceso tendría una ventana en la que el estado está
mal porque el proceso no ha corrido. **Aquí no hay ventana.**

---

## 2 · Free es un plan, no una prueba caducada

Es la diferencia que este tramo hace real. Antes, `demo` significaba cuatro
cosas: ventana de prueba, suelo, fila de catálogo y estado de bloqueo. Cuando la
prueba caducaba, **no quedaba nada debajo**.

Ahora el suelo es Free, y Free tiene su propia base comercial: 50 MiB, 25
créditos al mes y 30 minutos activos al día.

---

## 3 · La prueba se da una vez

Sin tabla nueva. Se **deriva de la historia**:

```sql
select exists (
  select 1 from organization_plan_assignments a
   where a.organization_id = ... and a.module_code = ...
     and a.grant_kind = 'trial')
```

Si ya hubo una prueba para ese (empresa, módulo) —**aunque haya caducado**— no
se concede otra.

Dos pruebas lo comprueban, y la segunda es la que importa: se caduca una prueba
a mano y se vuelve a provisionar. No se regala otra. **Apagar y encender un
módulo no regala producto**, que era el camino de abuso obvio.

---

## 4 · Las 48 horas, fuera de la función

```sql
commercial_trial_policy (enabled, trial_plan_code, trial_duration_hours, trial_ai_credits)
```

Antes vivían **dentro** de `provision_new_organization_modules`: cambiarlas
exigía una migración y el propietario del producto no podía tocarlas.

Una prueba cambia la política a 6 horas, crea una empresa y comprueba que su
prueba dura 6. Y otra comprueba que **la prueba anterior sigue durando 48**:
cambiar la política no reescribe lo ya concedido.

---

## 5 · La bolsa de IA de la prueba

**50 créditos en total**, no 500 al mes. Es la única diferencia entre la prueba y
Full, y es deliberada: un mes de Full en dos días saldría carísimo.

Vive en la política, no en un cuarto plan. Ver
[PE_04B2_FINAL_COMMERCIAL_BASELINE.md](PE_04B2_FINAL_COMMERCIAL_BASELINE.md) §2.

**No se descuenta todavía.** Eso es B4.

---

## 6 · `core` no participa

`core` nace en `full` para siempre en toda empresa porque es infraestructura. Si
recibiera asignación comercial, cualquier empresa resolvería a Full y el plan
dejaría de significar nada.

Ni la migración ni la provisión le dan asignación: las dos filtran por
`is_functional`. Hay prueba en las dos direcciones — que `core` no recibe
asignación, y que un módulo funcional en Full **sí** eleva.

---

## 7 · Lo que la prueba NO cambia todavía

Al vencer, el **acceso al módulo** sigue comportándose como hoy:
`resolve_organization_module_access` devuelve `demo_expired` y el módulo bloquea
escrituras.

Es deliberado, y merece decirse claro: que un Free pueda escribir dentro de sus
límites es el **modo consulta**, y el modo consulta necesita el medidor de
minutos activos. Desbloquearlo aquí, sin medidor, dejaría a Free sin ninguna
frontera de uso.

**Es una dependencia de PE-04B4**, anotada en la cabecera de 0163 y comprobada
por una prueba estática que exige que 0163 no redefina esa función.
