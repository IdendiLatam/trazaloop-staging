# QUALITY-12.2F · Previsión de coste

> **Todo lo de aquí es PREVISIÓN**, no consumo. Se modela con el gasto medido
> de cada capacidad y una mezcla de uso declarada. Ninguna empresa ha gastado
> estas cifras: son lo que gastaría si usara Intelligence así.
>
> El consumo real observado está en `QUALITY_12_2F_LIVE_VALIDATION.md`.

---

## Lo que cuesta cada operación

Medido con el proveedor real, no supuesto:

| Capacidad | Coste | Medido en |
|---|---|---|
| Mejora de redacción | **$0,0005** | 12.2C · 4 llamadas |
| Revisión contextual | **$0,0015** | 12.2D · 3 llamadas |
| Pregunta a Intelligence | **$0,0021** | 12.1 · consultas reales |

---

## Los tres escenarios

Sobre **350 secciones documentales** —250 de PCR y Textiles ya existentes más
unas 100 de Quality—, que es una implantación completa.

| | Mejoras/sección | Revisiones/sección | Consultas/mes |
|---|---|---|---|
| **Bajo** | 1 | 1 | 25 |
| **Normal** | 2 | 1 | 50 |
| **Intensivo** | 3 | 1 | 100 |

### Lo que cuesta UNA empresa, implantación completa

| Escenario | Operaciones | Tokens | **Coste** |
|---|---|---|---|
| Bajo | 725 | 991 k | **$0,76** |
| Normal | 1 100 | 1,39 M | **$1,00** |
| Intensivo | 1 500 | 1,88 M | **$1,28** |

**Un dólar.** Ese es el orden de magnitud, y es el dato que más decide de todo
el sprint.

---

## La flota

| Empresas | Bajo | Normal | Intensivo |
|---|---|---|---|
| 100 | $76 | **$100** | $128 |
| 500 | $381 | **$498** | $642 |
| 1 000 | $762 | **$997** | $1 284 |
| 5 000 | $3 808 | **$4 985** | $6 421 |
| 10 000 | $7 617 | **$9 970** | $12 841 |

### Cómo se lee esta tabla, y cómo no

**Las columnas son EMPRESAS, no personas usándolo a la vez.** Diez mil empresas
no son diez mil peticiones simultáneas: son diez mil clientes cuyo uso se
reparte a lo largo de meses.

**La implantación ocurre UNA VEZ.** Estas cifras son el esfuerzo de redactar la
documentación, no una factura mensual recurrente. El primer mes de una empresa
cuesta mucho más que el sexto, y meter eso en una media mensual daría un número
que ninguna empresa gastará nunca.

**Y no incluye el uso posterior.** Mantener documentación viva —revisar cuando
cambia un proceso, mejorar una sección que se queda corta— consume, pero mucho
menos, y todavía no hay datos suficientes para modelarlo.

---

## Qué se puede concluir, y qué no

**Se puede concluir** que el coste de proveedor de Trazaloop Intelligence es,
hoy y con estos modelos, **marginal frente a cualquier precio de suscripción
plausible**. Diez mil empresas haciendo una implantación intensiva completa
cuestan menos de trece mil dólares **una sola vez**.

**No se puede concluir** cuál debe ser el precio ni qué se incluye en qué plan.
Eso depende de cosas que este documento no sabe: cuánto se usa después de la
implantación, cómo evolucionan las tarifas del proveedor, y qué se quiere
incentivar. Este sprint no decide eso; produce los números para decidirlo.

**Y hay un riesgo que conviene nombrar:** todo lo anterior asume el consumo
medido con `gpt-5.4-mini`. Un modelo más caro cambia la escala, no la
estructura. Por eso el modelo de coste es por proveedor y modelo, y por eso los
límites no se miden en dinero.

---

## Reproducirlo

Los escenarios y los tamaños de flota viven en
`lib/domain/intelligence-cost.ts` —`SCENARIOS` y `FLEET_SIZES`—, no en este
documento. Cambiarlos ahí cambia el informe y la consola de plataforma a la vez;
no hay una segunda copia que se quede atrás.

`npm run test:quality122f-cost` imprime la tabla y falla si el orden de
magnitud se sale de lo esperado.
