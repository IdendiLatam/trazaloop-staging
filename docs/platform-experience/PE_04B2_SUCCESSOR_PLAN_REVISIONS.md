# PE-04B2 · Las revisiones sucesoras

B1 publicó tres revisiones. El propietario del producto cerró después una base
distinta. **Las de B1 no se tocan.**

---

## 1 · Por qué suceder en vez de corregir

Editar una revisión publicada haría desaparecer lo que se creyó en su momento —y
lo que, si alguien hubiera contratado bajo ella, se le prometió—. Es el
invariante que B1 construyó y que tres disparadores defienden.

Así que B2 hace lo que el modelo dice que hay que hacer: publica sucesoras.

```
free   rev 1 (B1) → retirada, con su periodo cerrado
       rev 2 (B2) → vigente
full   rev 1 (B1) → retirada
       rev 2 (B2) → vigente
extra  rev 1 (B1) → retirada · precio SIN CONFIGURAR, conservado
       rev 2 (B2) → vigente · USD 100
```

Una prueba comprueba que las tres de B1 siguen ahí, **retiradas, con su periodo
cerrado y con sus valores intactos** — incluido que la de Full sigue diciendo
4000 y la de Extra sigue sin precio.

Y otra intenta editarlas: sigue siendo imposible.

---

## 2 · Qué cambió entre la 1 y la 2

| | B1 (rev 1) | B2 (rev 2) |
|---|---|---|
| Precio de Extra | **sin configurar** | USD 100 / USD 1 000 |
| Intelligence | `ai_runs_per_month` **sin configurar** | `ai_weighted_credits_monthly` **25 / 500 / 2 000** |
| Tiempo activo | `daily_metered_operations` sin configurar | `active_minutes_daily` y `_monthly` |
| Acompañamiento | `functional_support_enabled` 0/1 | `functional_support_cases_monthly` **0 / 0 / 2** |
| Almacenamiento | 50 MiB / 500 MiB / 5 GiB | **iguales** |
| Conteos funcionales | copiados del catálogo legacy | **copiados de la rev 1** |

Los conteos no se reescriben: se **copian** de la revisión anterior. Nadie los ha
revisado comercialmente, y cambiarlos de paso habría sido colar una decisión que
nadie tomó.

---

## 3 · Los marcadores provisionales de B1

`ai_runs_per_month` y `daily_metered_operations` fueron marcadores de B1, puestos
cuando aún no había decisión comercial. La decisión trajo **otras unidades**:
créditos ponderados y minutos activos.

Los provisionales **no se borran** del catálogo de recursos. La revisión 1 los
referencia y la revisión 1 es inmutable: borrarlos rompería su integridad
referencial y, con ella, la historia.

Se quedan sin usar en las revisiones nuevas. **Es lo que cuesta la historia, y
es el precio correcto.**

---

## 4 · Idempotencia por marca

```sql
if exists (select 1 from plan_revisions
            where plan_code = v_plan and internal_notes like 'PE-04B2%') then
  continue;
end if;
```

Reejecutar 0163 no genera una revisión por pasada. Y el número sale de
`max(revision_number) + 1`, así que sobrevive a las revisiones extra que una
suite de pruebas pueda haber dejado.

---

## 5 · Publicar sin sesión

`plan_publish_revision()` exige `is_platform_superadmin()`, y una migración no
tiene `auth.uid()`. Así que 0163 hace el mismo efecto en su `do $$`: cierra la
vigente, abre la nueva y deja `published_by` en **nulo**.

Nulo y no un identificador inventado: no hubo ninguna persona, y atribuírselo a
alguien sería falsificar quién publicó qué.

---

## 6 · Los estados de límite, usados de verdad

B1 creó tres estados y B2 los estrena:

| | Free | Full | Extra |
|---|---|---|---|
| `active_minutes_daily` | `finite` 30 | **`unlimited`** | **`unlimited`** |
| `ai_weighted_credits_monthly` | `finite` 25 | `finite` 500 | `finite` 2 000 |
| `functional_support_cases_monthly` | `finite` **0** | `finite` **0** | `finite` **2** |

`unlimited` y no un número enorme: son cosas distintas, y quien lee un número
enorme se pregunta cuál es. `finite 0` y no ausencia: «no incluye» es una
decisión tomada, y la ausencia sería `not_configured` — que significa otra cosa
y **deniega**.
