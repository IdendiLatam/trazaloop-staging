# PE-04B2 · Las asignaciones de cada empresa

---

## 1 · Tres reglas, y las tres se comprueban

### 1 · Nadie pierde

Un módulo en Full o Extra conserva su nivel. Una prueba vigente conserva **la
fecha que ya tenía**.

```sql
ends_at = coalesce(v_rec.access_expires_at, now() + interval '48 hours')
```

**No se reinician 48 horas desde la migración.** Eso regalaría tiempo que nadie
compró, y a una empresa que llevaba 47 horas de prueba le daría dos días más.

La prueba lo mide: caducidad legacy y caducidad migrada difieren en menos de dos
segundos.

### 2 · Nadie gana por accidente

El error simétrico, y el más fácil de cometer: una suscripción legacy en `full`
**no** eleva un módulo cuya prueba caducó.

La migración deriva de `organization_modules.access_mode`, y la suscripción
legacy no participa. Hay prueba: módulo con prueba vencida + suscripción `full`
→ **Free**.

### 3 · `core` no participa

Ver [PE_04B2_FREE_TRIAL_LIFECYCLE.md](PE_04B2_FREE_TRIAL_LIFECYCLE.md) §6.

---

## 2 · Lo que recibe cada empresa

| Estado del módulo | Asignaciones creadas |
|---|---|
| Extra | base Free + **Extra** `sold` |
| Full | base Free + **Full** `sold` |
| Prueba vigente | base Free + **Full** `trial` con su fecha |
| Prueba vencida | **solo** base Free |
| Deshabilitado | base Free · el acceso legacy lo sigue bloqueando |

La base Free es **por módulo funcional** y **no caduca**.

---

## 3 · La mezcla se conserva

Es lo que un plan único por empresa habría perdido. La prueba construye el caso
completo:

```
Quality  → extra          resuelve extra
PCR      → full           resuelve full
Textiles → demo vencido   resuelve free
la empresa entera         resuelve extra   (el mejor de sus módulos)
```

Los tres resuelven **distinto**, y la empresa resuelve al mejor. Si el modelo
colapsara a un plan por empresa, los tres dirían «extra» — y Textiles habría
recibido un producto que nadie compró.

Y se comprueba también la otra mitad: que Textiles, con la prueba vencida, **no**
recibió ninguna asignación de pago.

---

## 4 · Idempotente

Cada inserción lleva su `where not exists` por (empresa, módulo, tipo de
concesión). Migrar dos veces no crea una segunda base, ni una segunda prueba, ni
duplica una asignación de pago.

Comprobado ejecutando la migración dos veces seguidas y contando las filas antes
y después.

---

## 5 · La historia se conserva

Una asignación no se reescribe: los disparadores de B1 impiden cambiar la
empresa, la revisión, el ámbito, el módulo, el tipo o la fecha de inicio. Y un
periodo ya cerrado no se reabre.

Una prueba caducada **se queda**, con su `grant_kind = 'trial'` y sus fechas: es
historia comercial, no basura. Dice que esa empresa probó Full del día X al Y.

---

## 6 · Y la evidencia legacy tampoco se toca

`organization_subscriptions` no se reescribe ni se borra. Una prueba lo verifica
en el caso más tentador: una empresa con módulos en Full y suscripción en `demo`
sigue teniendo su fila en `demo` después de migrar.

Reescribirla sería falsificar lo que se creyó. Lo que cambió no es el dato: es
**quién manda**.
