# QUALITY-05 · Controles y tratamiento

**Decisiones:** RO-06, RO-08, RO-24, RO-25, RO-26, §32, §33, §36.

## Control ≠ Acción

Es la distinción que más se incumple en los sistemas de calidad reales, y la que
produce planes de acción eternos que nadie cierra.

| | Control | Acción |
|---|---|---|
| Cuándo existe | **Ya** opera | Se hará |
| Termina | No: es continuo | Sí: tiene fecha y cierre |
| Dónde vive | `quality_controls` | `work_actions` (QUALITY-04) |
| Tiene vencimiento | **No** | Sí (`due_on`) |

El esquema lo hace imposible de confundir: `quality_controls` no tiene columna de
vencimiento, y una prueba pura lo comprueba.

## Existir y funcionar son dos preguntas (RO-26)

`quality_control_effectiveness_reviews` guarda **tres veredictos independientes**:

| Pregunta | Campo | Valores |
|---|---|---|
| ¿Está bien pensado? | `design_verdict` | adecuado / parcial / inadecuado / sin evaluar |
| ¿Se aplica de verdad? | `implementation_verdict` | se aplica / a medias / no se aplica / sin evaluar |
| ¿Sirve para algo? | `effectiveness_verdict` | eficaz / parcialmente / no eficaz / sin evaluar |

La eficacia **no se deduce** de las otras dos. Un control bien diseñado que nadie
aplica es un papel; uno que se aplica y no reduce nada es un gasto. No hay fórmula
universal (§26): son juicios declarados, cada uno con su criterio a la vista, y la
evaluación es inmutable.

Un veredicto `ineffective` emite una alerta al titular del cargo dueño del control:
los riesgos que se apoyan en él pueden estar peor de lo que dice su residual.

## Un control puede referenciar, no duplicar

- **Documento** (§24, T-03): el control apunta a la revisión de TrazaDocs que lo
  describe. No se copia el PDF ni se crea un documento paralelo de riesgos.
- **Indicador** (§25): un indicador puede servir de monitoreo. Referenciarlo **no**
  convierte una medición fuera de meta en materialización del riesgo.

## Tratamiento: la estrategia, no la tarea (§33, §36)

```
DECISIÓN: Reducir
   ├─ acción: homologar un segundo proveedor
   ├─ acción: subir el stock mínimo
   └─ acción: formalizar el plan de contingencia
```

`quality_risk_treatment_plans` guarda la estrategia y su fundamento; las acciones
viven en `work_actions` y referencian el riesgo. Meterlas en la misma fila haría
imposible saber cuál se cumplió.

Catálogo exacto de RO: **evitar, reducir, transferir/compartir, aceptar**. No se
inventa ninguna, y el de oportunidades es distinto a propósito.

## Aceptar por encima del apetito exige aprobación (RO-08)

No lo decide quien escribe: lo decide la metodología.

```
¿estrategia = aceptar?
        │
        └─ ¿el nivel vigente es aceptable según la metodología?
                │ sí → plan activo
                └─ no → plan PENDIENTE DE APROBACIÓN
                         + tarea para el titular del cargo
                         + solo la aprueba alguien DISTINTO de quien la propuso
```

`quality_approve_risk_treatment` rechaza al proponente con mensaje propio, y la
interfaz no le ofrece el botón —el servidor lo rechaza igual, pero enseñar un botón
que siempre falla es una forma de mentir.

## Aceptar no es ignorar (§32)

Un plan aceptado conserva su `review_on`. Si no se propone fecha, hereda la del
riesgo, y si tampoco la hay se pide a seis meses. Aceptar **no** borra acciones ni
controles, y el riesgo sigue en la lista con su nivel.

## Las decisiones se suceden, no se editan

Cambiar de estrategia crea un plan nuevo; el anterior pasa a `superseded` y apunta
al que lo sustituye. Un disparador impide reescribir estrategia, fundamento, fecha
o autor de una decisión pasada. El historial muestra las dos.
