# QUALITY-05 · Ciclo de vida

**Decisiones:** RO-29, MDR-06, MDR-49, §47, §48, §49, §50. Filosofía de QUALITY-03.1.

## La regla

> Un borrador sin historia se tira. Lo que ya sirvió para decidir, no.

No se usa un `boolean closed` (§47). Cada entidad tiene estados con significado
propio, y el borrado es un **dictamen**, no una casilla.

## Estados

| Entidad | Estados |
|---|---|
| Riesgo | borrador · activo · cerrado · retirado · sustituido |
| Oportunidad | borrador · identificada · en marcha · implementada · cerrada · descartada |
| Control | borrador · vigente · retirado |
| Versión de metodología | borrador · publicada · sustituida · retirada |

**Cerrar** (ya no aplica), **retirar** (deja de gestionarse) y **suceder** (otro
riesgo lo reemplaza) son tres cosas distintas — RO-29 —, y ninguna borra historia.
Reabrir devuelve el riesgo a activo **conservando la decisión de cierre** en el
historial: se ve que se cerró y que se volvió a abrir.

## El dictamen es UNO

```
quality_deletion_eligibility(entity, id)      ← lo consulta la pantalla
        │
        ├─ quality_risk_deletion_verdict
        ├─ quality_opportunity_deletion_verdict
        ├─ quality_control_deletion_verdict
        └─ quality_methodology_version_deletion_verdict
                        ▲
        quality_ro_guard_hard_delete           ← lo consulta el disparador
```

La misma función responde a la interfaz y al `BEFORE DELETE`. Con dos lógicas, el
mensaje que se enseña y el motivo del rechazo acabarían divergiendo — y además se
cierra la ventana entre «se veía borrable» y «se borró»: el dictamen se recalcula
**en el instante** del borrado.

## Qué bloquea cada uno

| Entidad | Deja de ser desechable cuando… |
|---|---|
| Riesgo | tiene evaluaciones, materializaciones, decisiones de tratamiento, decisiones registradas, algo que lo referencia, o salió del borrador |
| Oportunidad | fue priorizada, se decidió qué hacer con ella, tiene decisiones o referencias, o salió del borrador |
| Control | **sustenta una evaluación residual**, tiene evaluaciones de eficacia, está asociado a riesgos, o salió del borrador |
| Versión de metodología | se usó en alguna evaluación, o ya se publicó |

El primero del control es el que de verdad ata: borrarlo dejaría una evaluación
residual sin poder explicarse. §50 exacto.

## El mensaje

El dictamen devuelve el motivo y una lista de bloqueos con **sintagmas nominales**,
que la interfaz compone:

> Este riesgo ya salió del borrador (está activo) y debe conservarse.
> Tiene 2 evaluaciones, 1 materialización registrada, 1 decisión de tratamiento,
> 5 decisiones registradas y 1 registro que lo referencia.

Dos cuidados que costaron una corrección cada uno tras verlos en pantalla:

- Las etiquetas **no** empiezan por «tiene»: si lo hicieran, el mensaje diría
  «Tiene 2 tiene 2 evaluaciones».
- El estado va **en la razón** y en español. La versión anterior decía
  «1 ya salio del borrador (active)», que mezcla un número sin sentido con un
  código interno en inglés.

## Enmascarado (§53)

Para quien no es miembro de la empresa, el dictamen responde exactamente lo mismo
que ante un identificador inventado: `not_found`, sin motivo y con la lista de
bloqueos **vacía**. Ni un contador puede salir: «tiene 3 evaluaciones» ya dice algo
de otra empresa.

## Inmutabilidad

| Registro | Regla |
|---|---|
| Evaluación (riesgo y oportunidad) | Inmutable por completo |
| Factores | Inmutables |
| Evaluación de eficacia de un control | Inmutable |
| Materialización | El **relato** es inmutable; solo admite enlazar el caso que alguien abra después |
| Plan de tratamiento | Solo admite aprobarse y quedar sustituido |
| Versión publicada y sus escalas | Congeladas |

La excepción de la materialización está razonada: el caso no es una reescritura del
hecho, sino algo que pasó después. Bloquearlo también habría obligado a guardar ese
enlace en otro sitio, donde podría contradecir al hecho.

## Numeración (D-04)

`R-2026-001`, `CTRL-2026-001`, `OP-2026-001`. Un número entregado queda ocupado
para siempre dentro de la empresa, **aunque el borrador se elimine**: ya viajó en un
acta o en un correo. La numeración se cuenta sobre la reserva, no sobre las fichas
vivas.
