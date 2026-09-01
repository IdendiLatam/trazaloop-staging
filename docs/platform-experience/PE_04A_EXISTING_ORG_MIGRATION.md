# PE-04A · Cómo migran las empresas que ya existen

**Ninguna empresa se toca en PE-04A.** Esto es el plan para B2.

---

## 1 · La deriva, medida

En la base local, tras la reejecución limpia y las suites:

```
organization_subscriptions.plan_code   demo → 3 empresas
organization_modules.access_mode       full → 3 empresas (9 filas de módulo)
```

**El 100 % de las empresas tiene las dos fuentes en desacuerdo.** No es un caso
raro: es el caso normal, porque `create_organization` escribe `demo` en la
suscripción y nadie la vuelve a tocar cuando el superadministrador sube un
módulo.

Local no es Staging ni Producción, pero el mecanismo es el mismo código y por
tanto la deriva se produce igual allí. Los números reales se obtienen con la
consulta de §5, que es de solo lectura.

---

## 2 · Las siete categorías

| # | Categoría | Cómo se reconoce | Qué se hace en B2 |
|---|---|---|---|
| 1 | **Demo vigente** | Módulos en `demo`, `access_expires_at > now()` | `free` + concesión `trial` de `full` con **la fecha que ya tiene** |
| 2 | **Demo vencido** | Módulos en `demo`, `access_expires_at <= now()` | `free`. **Gana acceso** |
| 3 | **Full real** | Módulos en `full` | `full`, `grant_kind='sold'` |
| 4 | **Extra real** | Algún módulo en `extra` | `extra`, `grant_kind='sold'` |
| 5 | **Mezcla por módulo** | PCR en Full y Textiles en Demo | **Se conserva la mezcla.** Una asignación por módulo |
| 6 | **Legacy sin módulos** | Sin filas en `organization_modules` | `free` + revisión manual |
| 7 | **Incoherente** | Suscripción y módulos en desacuerdo | **Manda el módulo.** La fila legacy se archiva |

La categoría 7 es hoy la mayoritaria, y la regla ya está decidida desde T9F.1:
el módulo es la autoridad. La migración no la inventa — la hace explícita.

### La 5 es la que no se puede perder

Una empresa con **PCR en Full y Textiles en Demo** es un caso legítimo y
frecuente. Si la migración colapsa a un plan por empresa, o pierde el acceso a
Textiles o regala Full en un módulo que nadie compró.

> **PEC-04.** La asignación de plan admite **ámbito de módulo**. Colapsar a un
> plan único por empresa perdería información real.

---

## 3 · Nadie pierde acceso

Es el invariante de la migración, y se comprueba **antes y después** de cada
empresa: para cada módulo, el acceso resuelto después es igual o mayor que
antes.

| | Antes | Después |
|---|---|---|
| Demo vigente | acceso Full temporal | igual, con la misma fecha |
| Demo vencido | **bloqueado** | **`free`, que funciona** |
| Full | Full | Full |
| Mezcla | mezcla | misma mezcla |

La segunda fila es una **mejora de producto**, no un efecto colateral: hoy una
prueba vencida deja la empresa sin poder crear nada. Hay que decírselo al
propietario del producto porque cambia lo que ven clientes reales.

---

## 4 · Y nadie gana nada por accidente

El error simétrico sería que la migración regalara Full. Dos salvaguardas:

1. **La asignación se deriva del `access_mode` observado**, nunca de la
   suscripción legacy ni de un valor por defecto generoso.
2. **`grant_kind` se anota.** Lo que era `auto_demo_trial` no se convierte en
   `sold`: `assignment_source` ya lo distingue y se conserva.

---

## 5 · La consulta de reconocimiento · SOLO LECTURA

Antes de migrar nada, hay que saber qué hay. Esta consulta no escribe:

```sql
select
  o.id, o.name,
  coalesce(s.plan_code, '(sin fila)')                as suscripcion_legacy,
  coalesce(s.status,   '(sin fila)')                 as estado_cuenta,
  organization_effective_plan_code(o.id)             as plan_efectivo,
  (select string_agg(om.module_code || '=' || om.access_mode
                     || case when om.enabled then '' else '(off)' end
                     || case when om.access_mode = 'demo'
                                  and om.access_expires_at is not null
                                  and om.access_expires_at <= now()
                             then '(vencido)' else '' end, ' ' order by om.module_code)
     from organization_modules om join modules m on m.code = om.module_code
    where om.organization_id = o.id and m.is_functional)   as modulos,
  case
    when not exists (select 1 from organization_modules om join modules m on m.code = om.module_code
                      where om.organization_id = o.id and m.is_functional) then '6-legacy'
    when exists (select 1 from organization_modules om join modules m on m.code = om.module_code
                  where om.organization_id = o.id and m.is_functional and om.access_mode = 'extra')
         then '4-extra'
    when exists (select 1 from organization_modules om join modules m on m.code = om.module_code
                  where om.organization_id = o.id and m.is_functional and om.access_mode = 'full')
     and exists (select 1 from organization_modules om join modules m on m.code = om.module_code
                  where om.organization_id = o.id and m.is_functional and om.access_mode = 'demo')
         then '5-mezcla'
    when exists (select 1 from organization_modules om join modules m on m.code = om.module_code
                  where om.organization_id = o.id and m.is_functional and om.access_mode = 'full')
         then '3-full'
    when exists (select 1 from organization_modules om join modules m on m.code = om.module_code
                  where om.organization_id = o.id and m.is_functional
                    and om.access_mode = 'demo'
                    and (om.access_expires_at is null or om.access_expires_at > now()))
         then '1-demo-vigente'
    else '2-demo-vencido'
  end as categoria
from organizations o
left join organization_subscriptions s on s.organization_id = o.id
order by categoria, o.name;
```

Se ejecuta **antes** de escribir la migración, y su resultado se pega en el
informe de B2. Migrar sin haber contado es como limpiar sin haber inventariado —
la lección de PE-03.

---

## 6 · La fila legacy: se conserva, no se obedece

`organization_subscriptions` **no se borra**. Es historia: dice qué se creyó que
tenía cada empresa y cuándo.

| | |
|---|---|
| `plan_code` | Deja de leerse para decisiones. Se conserva |
| `status` | **Sigue mandando**: `suspended`/`cancelled` bloquean escritura |
| `subscription_plan_history` | Se conserva íntegra |

Lo que sí hay que hacer es **quitarla del camino de la vista de uso**, que es de
donde sale el «Plan Demo · 50 MB». Mientras la vista lea una fila que nadie
mantiene, alguien la creerá.

> **PEC-30.** El estado administrativo de la cuenta (`suspended`/`cancelled`) es
> un eje **independiente** del plan y sobrevive a la migración sin cambios.

---

## 7 · Orden, y marcha atrás

1. **Contar** con la consulta de §5. Sin escribir.
2. Publicar la revisión inicial de cada plan, incluido `free`.
3. Crear las asignaciones **derivadas de los módulos**, con `effective_from =
   now()` y `grant_kind` según el origen observado.
4. **Comprobar** empresa por empresa que el acceso resuelto no bajó.
5. Cambiar los lectores a la nueva fuente.
6. Dejar de leer `plan_code` en la vista de uso.

**Marcha atrás:** hasta el paso 5, el sistema sigue funcionando con las fuentes
de hoy — las asignaciones nuevas están ahí y nadie las lee. El punto de no
retorno es el 5, y para entonces el 4 ya lo comprobó.

Ninguna operación de esta lista borra ni una fila.
