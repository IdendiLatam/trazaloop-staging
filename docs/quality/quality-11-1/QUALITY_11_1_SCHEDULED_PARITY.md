# QUALITY-11.1 · GAP-01 · Paridad del barrido programado

## 1 · Qué estaba mal, exactamente

Dos de los ocho barridos heredados empezaban así:

```sql
if auth.uid() is null then raise exception 'No autenticado'; end if;
```

| Barrido | Sprint | Qué detecta | Qué emite |
|---|---|---|---|
| `quality_scan_pending_measurements` | QUALITY-03 (0119) | el periodo cerró y el indicador sigue sin medición, siendo el periodo elegible y no cerrado formalmente | evento `indicator.measurement_due` + tarea `indicator_measurement_due` + aviso `indicator_measurement_due` |
| `work_scan_pending_actions` | QUALITY-04 (0121) | acción `planned`/`in_progress` con `due_on < hoy`; y acción que exige eficacia con `effectiveness_result = 'pending'` | evento `action.overdue` + aviso `action_overdue`; aviso `effectiveness_due` |

Tablas que consulta cada uno:

- **mediciones pendientes** — `quality_indicators`, `quality_indicator_configs`,
  `quality_previous_period()`, `quality_period_is_eligible()`,
  `quality_measurements`, `quality_period_is_closed()`,
  `quality_indicator_owner_profile()`;
- **acciones pendientes** — `work_actions`, `quality_position_assignments`,
  `memberships`.

Ambos se llaman desde su pantalla (QUALITY-03 y QUALITY-04) y desde el motor de
QUALITY-11 como observadores de plataforma. Los seis restantes ya se ejecutaban
sin sesión desde 0117.

La 0130 los anotaba como **omitidos con motivo** cuando corría el planificador.
Honesto, pero una condición de negocio que nadie observa de noche sigue sin
observarse.

## 2 · Lo que se hizo, en tres pasos

### 2.1 · La condición, como observable de QUALITY-11

Faltaban dos hechos en el catálogo tipado para poder escribir **la condición
exacta**, no una parecida:

| Hecho nuevo | Fuente | Por qué hacía falta |
|---|---|---|
| `measurement_period_closed` | `indicator` | el barrido de Q03 no reclama un periodo ya cerrado formalmente. Sin este hecho, la regla equivalente reclamaría de más |
| `requires_effectiveness` | `action` | el barrido de Q04 solo reclama la eficacia de las acciones que la exigen. Sin este hecho, la reclamaría a todas |

Y tres plantillas los usan:

| Plantilla | Condición | Releva a |
|---|---|---|
| `indicator_measurement_due` | `medición pendiente = sí` **y** `periodo ya cerrado = no` | `quality_scan_pending_measurements` |
| `action_overdue` | `estado en (planificada, en curso)` **y** `vencimiento pasó hace 1 día o más` | `work_scan_pending_actions` |
| `action_effectiveness_pending` | `exige eficacia = sí` **y** `resultado = pendiente` | — |

`due_on days_after 1` es literalmente `due_on < current_date`: la traducción es
exacta, no aproximada.

### 2.2 · Los barridos dejan de exigir sesión

```sql
if auth.uid() is not null then
  if not is_org_member(p_organization_id) then … end if;
  if v_role not in ('admin', 'quality') then … end if;
end if;
```

**Con sesión, exactamente los mismos permisos que antes.** Sin sesión, se
ejecutan como proceso del sistema, que es lo que llevan haciendo los otros seis
desde 0117. No se usa `service_role` para saltarse nada: la función sigue siendo
`security definer`, sigue acotada a la empresa que recibe, y sigue emitiendo lo
mismo.

Su lógica de negocio **no se tocó**: las mismas consultas, las mismas claves de
dedupe (`ev:due:`, `tk:due:`, `al:due:`, `ev:act:overdue:`, `al:act:overdue:`,
`al:act:eff:`) y los mismos tipos de aviso. Las suites de QUALITY-03 y
QUALITY-04 pasan sin cambiar una línea.

### 2.3 · Y aprenden a ceder

```sql
if exists (select 1 from quality_automation_rules r
            where r.organization_id = p_organization_id
              and r.status = 'active'
              and r.supersedes_observer = 'quality_scan_pending_measurements')
then
  return 0;
end if;
```

Si la empresa adoptó la regla equivalente, el barrido heredado **calla**. La
comprobación vive dentro de la función, no en quien la llama: así vale igual
cuando la dispara la pantalla, el motor o cualquier otra cosa.

**Una condición, un aviso.** La fuente de verdad es la que la empresa eligió, no
las dos a la vez.

## 3 · Qué queda demostrado, ejecutándolo

| Afirmación | Prueba |
|---|---|
| los ocho barridos corren sin sesión | G1 · 8 observadores, 0 fallos, 0 omitidos |
| la medición pendiente se detecta sin sesión y deja su tarea de siempre | G2 |
| la acción vencida se detecta sin sesión y **la acción no cambia** | G3 |
| el segundo barrido sin sesión no duplica nada | G4 |
| adoptar la regla equivalente calla al barrido heredado | G5 · el heredado pasa de 1 a **0** |
| y la regla de QUALITY-11 detecta la misma condición | G6 |
| la bandeja no se duplica al repetir todo | G7 |

## 4 · Lo que NO cambió

- Ningún estado de negocio: ni el indicador, ni la acción, ni su eficacia.
- Ninguna clave de dedupe, ningún tipo de aviso, ninguna firma de función.
- Ningún permiso, para nadie que tenga sesión.
