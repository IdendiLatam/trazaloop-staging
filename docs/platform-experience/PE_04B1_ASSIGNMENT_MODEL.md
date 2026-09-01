# PE-04B1 · Qué tiene cada empresa

---

## 1 · La forma

```sql
organization_plan_assignments (
  organization_id, plan_revision_id,
  scope: organization | module,   module_code,
  grant_kind: base | trial | sold | courtesy,
  source: seed | migration | trial | manual | checkout | promotion,
  starts_at, ends_at,
  assigned_by, reason, created_at
)
```

Tres decisiones, cada una con su motivo.

---

## 2 · Apunta a una REVISIÓN, no a un código

Ahí está la verdad histórica. Una empresa asignada a la revisión 3 de Full sigue
apuntando a la revisión 3 aunque mañana se publique la 4, y por eso se puede
responder **qué se le prometió** — con su precio, sus límites y sus fechas.

Apuntar al código `full` habría hecho que cambiar el catálogo cambiara
retroactivamente lo contratado por todos.

---

## 3 · No hay columna «plan actual»

Una columna que se sobrescribe borra el pasado en cada cambio. El plan vigente
se **deriva** de las asignaciones con vigencia abierta; las cerradas se quedan
con sus fechas, su motivo y quién las hizo.

Eso es **historia de negocio**, no un registro de auditoría. La diferencia
importa: un `audit_log` guarda qué fila cambió; esto guarda qué tuvo la empresa.

Una prueba comprueba que la tabla no tiene ninguna columna `current_plan` ni
`active_plan`, y que sí tiene vigencia.

---

## 4 · Ámbito de módulo, porque la mezcla existe

Hoy una empresa puede tener **PCR en Full y Textiles en Demo**, y es un caso
real y frecuente. Colapsar a un plan por empresa perdería información que
existe: o se le quita el acceso a Textiles, o se le regala Full en un módulo que
nadie compró.

| `scope` | `module_code` | Cuenta para |
|---|---|---|
| `organization` | debe ser nulo | Toda la empresa y todos sus módulos |
| `module` | obligatorio | Ese módulo |

La restricción ata las dos cosas: el módulo se nombra **exactamente** cuando el
ámbito es de módulo. Ni un ámbito de empresa con módulo, ni uno de módulo sin él.

Al resolver un módulo cuentan **las dos**: la suya y la de la empresa, y gana la
mejor. Una empresa con base Free y Quality comprado en Full resuelve Free en PCR
y Full en Quality — comprobado.

---

## 5 · `grant_kind`: por qué lo tiene

| | Qué es | Caduca |
|---|---|---|
| `base` | El suelo permanente | no |
| `trial` | Concesión temporal de un plan superior | **siempre** |
| `sold` | Contratado | según el contrato |
| `courtesy` | Cortesía comercial, con motivo | debería |

La restricción exige que **una prueba siempre tenga `ends_at`**:

```sql
check (grant_kind <> 'trial' or ends_at is not null)
```

Una prueba sin fecha de fin no es una prueba: es un plan. Que lo impida la base y
no la disciplina es la diferencia entre una regla y una intención.

`courtesy` es lo que hoy se hace poniendo un `access_mode` a mano. La diferencia
es que aquí lleva **motivo y vigencia**: una excepción explícita y auditable, no
un valor suelto que nadie sabe por qué está ahí.

---

## 6 · `source`: de dónde vino, sin implementar PE-05

`seed`, `migration`, `trial`, `manual`, **`checkout`**, `promotion`.

`checkout` y `promotion` están **reservados** para que PE-05 pueda crear
transiciones autorizadas sin cambiar el esquema. Reservar el hueco no es
implementarlo, y B1 no tiene ni una línea de pasarela.

Y sostiene una decisión de PE-04A: **un cupón cambia el precio, no la
capacidad**. Una promoción produce una asignación a la misma revisión con otro
origen; no inventa un plan «Full con descuento».

---

## 7 · Solo se añade

Un disparador impide cambiar `organization_id`, `plan_revision_id`, `scope`,
`module_code`, `grant_kind` y `starts_at`. Cambiar de plan es **cerrar una y
abrir otra**, no reescribir.

Y **un periodo ya cerrado no se reabre**:

```
si old.ends_at ya pasó y alguien intenta cambiarlo → PLAN_ASSIGNMENT_APPEND_ONLY
```

Reabrirlo cambiaría lo que la empresa **tuvo**, que es precisamente lo que esta
tabla existe para conservar.

Cerrar una vigente **sí** se puede: es como se cambia de plan.

---

## 8 · Subir y bajar

**Subir** es inmediato y sin migrar nada: se cierra la actual, se abre la nueva
apuntando a la revisión del plan superior, y el resolutor devuelve otra cosa en
la siguiente consulta. No hay datos que copiar.

**Bajar** conserva todo. B1 no aplica límites todavía —eso es B3—, pero el modelo
ya sostiene la regla: los datos se quedan, se bloquea lo nuevo, y estar por
encima del límite es un estado legítimo.

Ni una línea de 0162 borra datos de negocio, y no puede haberla: la tabla de
asignaciones no tiene ningún camino hacia los datos del cliente.

---

## 9 · Quién asigna

Solo el superadministrador de plataforma. Ni `support`, ni el administrador de
una empresa, ni el propio cliente.

Y lo dice la base: la política de escritura exige `is_platform_superadmin()` en
el `using` **y** en el `with check`. Sin el segundo, alguien podría insertar una
fila a nombre de otra empresa.

Una prueba lo intenta con soporte y con un usuario normal, y las dos veces no se
escribe ni una fila.

**Un cliente nunca elige su plan, su revisión, su descuento ni la duración de su
prueba.** Ese camino lo abrirá PE-05 con su transacción autorizada, no el
formulario de crear empresa.
