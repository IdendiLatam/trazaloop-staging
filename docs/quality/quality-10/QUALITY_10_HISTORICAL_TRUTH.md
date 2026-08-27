# QUALITY-10 · Estado actual ≠ retrato histórico

## 1 · La afirmación

> Una revisión de 2027 cerrada sigue mostrando los resultados de 2027 aunque en
> 2028 existan nuevas metas, nuevos riesgos, nuevas evaluaciones, nuevas
> auditorías y nuevas decisiones.

No se reconstruye la revisión de 2027 con el presente. Se lee lo que se guardó.

## 2 · Las cuatro capas de congelado

| Capa | Dónde vive | Cuándo se congela |
|---|---|---|
| El **dato** de cada entrada | `quality_management_review_inputs.snapshot` | Al preparar o refrescar |
| La **meta** de cada indicador | `quality_measurements.config_id` → la configuración con la que se midió | En QUALITY-03, al medir |
| El **cargo** de cada participante | `position_name_at_review` | Al registrar al participante |
| El **acta entera** | `quality_management_review_minutes.snapshot` | Al emitirla |

## 3 · Por qué el periodo manda

`quality_management_reviews.period_start/end` es obligatorio, y los catorce
adaptadores lo reciben. Ninguno consulta «el estado de hoy»:

- las mediciones se acotan por `period_start >= p_from and period_end <= p_to`;
- los casos por `detected_on between p_from and p_to`;
- las auditorías por su fecha de ejecución;
- las campañas por solapamiento de periodo;
- los objetivos por vigencia solapada.

**Verificado** (`test:quality10-rls` D3): una auditoría ejecutada en el año B no
cambia la entrada de auditorías de la revisión del año A — que sigue diciendo
5 de 6.

## 4 · La meta histórica, en detalle

El adaptador de seguimiento y medición lee:

```sql
join quality_indicator_configs c on c.id = m.config_id
```

No `quality_indicators`, ni la configuración vigente hoy: **la que estaba
vigente cuando se midió**. QUALITY-03 versiona la configuración precisamente
para esto, y aquí se aprovecha en vez de reimplementarlo.

```
Año A · medición 82 · meta 95  ← lo que la revisión del año A dice, siempre
Año B · medición 90 · meta 98  ← lo que la revisión del año B dirá
```

**Verificado** (`test:quality10-rls` C3): tras publicar la configuración con
meta 98 y medir 90 en el año B, la revisión del año A ve **una** medición, 82
sobre 95. Y C4: refrescar esa entrada tampoco trae la meta de hoy.

## 5 · El acta

`quality_mr_issue_minutes` arma un `snapshot jsonb` con:

- los datos de la revisión y sus conclusiones;
- los **participantes con el cargo de entonces**;
- la agenda;
- las catorce entradas con su dato, su periodo, su análisis y sus aportaciones
  manuales;
- las decisiones y **las acciones que existían al emitir**;
- el estado de preparación y el seguimiento en ese momento.

El PDF `quality.management-review-minutes.detail` se imprime **desde ahí**, no
desde el estado de hoy.

**Verificado** (`test:quality10-rls` I8): tras emitir el acta, una acción pasa a
completada y luego a eficaz. El bloque `decisions` del acta no cambia ni un
carácter. Y I9: el seguimiento sí lo refleja, en vivo.

## 6 · Inmutabilidad al cerrar (§49)

Una revisión cerrada no cambia en silencio:

- `quality_mr_review_is_closed()` bloquea insertar, editar y borrar en las cinco
  tablas hijas —entradas, decisiones, participantes, aportaciones manuales y
  agenda—;
- `quality_mr_closed_is_final()` impide reescribir periodo, conclusiones, nota
  de cierre y código;
- el acta no tiene política de escritura.

Lo único que sigue evolucionando son las **acciones**, en su propio motor. Esa
es toda la diferencia entre el acta y el seguimiento.

**Verificado** (I6–I7, I10): con la revisión cerrada, no se añade una decisión
ni un participante; el periodo no se reescribe; el acta no se edita ni se borra.

## 7 · Reabrir, sin destruir (§47)

`quality_mr_reopen_review` exige un motivo de al menos veinte caracteres,
incrementa `reopen_count`, guarda el motivo y **no borra** `closure_note` ni
`closed_by`. El cierre original queda además como hecho formal en
`work_decisions`, con la fecha exacta en la que se cerró.

La vía preferente sigue siendo emitir un acta que **corrija** a la anterior:
no obliga a tocar nada, y las dos actas se conservan.

**Verificado** (N1–N4): reabrir con «porque sí» se rechaza; reabrir de verdad
conserva la nota de cierre y el acta emitida; y constan los dos hechos formales,
el cierre y la reapertura.
