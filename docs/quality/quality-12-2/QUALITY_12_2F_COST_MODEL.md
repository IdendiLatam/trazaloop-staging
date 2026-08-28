# QUALITY-12.2F · El modelo de coste

## Las tres cosas que no son lo mismo

Casi se mezclan, y mezclarlas habría hecho inservible todo lo demás.

| | Qué es | De dónde sale |
|---|---|---|
| **CONSUMO REAL** | lo que el proveedor dijo que gastó | se **lee** de `quality_ai_runs` |
| **COSTE ESTIMADO** | lo que ese consumo vale en dinero | se **calcula** sobre el anterior |
| **PREVISIÓN** | lo que gastaría algo que aún no ha pasado | se **modela** |

Una previsión presentada como consumo es una mentira con formato de informe. Un
coste estimado presentado como verdad del proveedor lo es igual. Cada función
devuelve un tipo que dice cuál de los tres es, y cada tabla lleva su etiqueta.

---

## La verdad, y por qué no hay una segunda

`quality_ai_runs` guarda desde 0132 —y ampliado en 0133, 0134, 0138 y 0139—
entrada, entrada cacheada, salida, razonamiento, total, proveedor, modelo, caso
de uso, empresa, actor, tiempos, latencia y si hubo llamada.

**No se ha creado ninguna tabla de consumo.** Un segundo registro de tokens
solo puede desincronizarse del primero, y el día que discrepen habrá que
decidir cuál miente. Todo lo demás —vistas, informes, la consola— deriva de esa
fila y se recalcula al mirar.

---

## La tarifa

Versionada en el tiempo, por proveedor y modelo:

```
provider · model · input · cached_input · output · effective_from · effective_to
```

En `numeric(14,6)`, USD por millón de tokens, con la unidad **en el nombre de
la columna**. El dinero no se guarda en coma flotante y la unidad no se deduce.

La vigente hoy:

| Proveedor · modelo | Entrada | Entrada cacheada | Salida |
|---|---|---|---|
| `openai` · `gpt-5.4-mini` | $0,25 /M | $0,025 /M | $2,00 /M |
| `fake` · `doble-determinista-1` | 0 | 0 | 0 |

El doble se declara a cero **explícitamente**, para que un entorno de pruebas no
produzca cifras de dinero que alguien tome en serio.

### Una tarifa vigente no se edita

Corregir un precio es **cerrar la fila y abrir otra**. Lo impone un disparador,
porque una regla que solo vive en la costumbre se rompe el día que alguien
tiene prisa. Comprobado en los dos sentidos: no deja reescribir una vigente, y
tampoco reabrir una cerrada.

### Y por eso la historia se conserva

```
tarifa de enero: $0,25/M      →  un run de febrero cuesta $0,25/M
sube en agosto a $0,50/M      →  ese run de febrero SIGUE costando $0,25/M
```

`intelligence_run_cost_usd(provider, model, cuándo, ...)` resuelve la tarifa
**vigente en ese momento**. No hay que fotografiar el precio en cada run: la
tabla versionada ya lo sabe.

**Sin tarifa devuelve nulo, no cero.** Cero diría «no costó nada»; la verdad es
«no lo sabemos», y las vistas distinguen las dos cosas.

---

## La fórmula

```
coste = (entrada − cacheada) × tarifa_entrada
      + cacheada             × tarifa_cacheada
      + salida               × tarifa_salida
      + razonamiento         × tarifa_razonamiento   (solo si se factura aparte)
```

Los tokens cacheados **se descuentan** de los de entrada: el proveedor los
informa como un subconjunto. Cobrarlos dos veces inflaría el coste justo en el
caso que se supone que lo abarata — y hay una prueba con un millón de tokens
todo cacheado que cuesta exactamente $0,025.

El razonamiento va **dentro de la salida** en los modelos que usamos, y la
tabla lo declara en vez de obligarnos a recordarlo. Si algún día llega uno que
lo cobre aparte, la columna ya está.

### Escrita dos veces, y comparada

En SQL para las vistas y en TypeScript para la previsión. Dos implementaciones
de la misma cuenta que nadie compara acaban separándose, así que hay una prueba
contra base real que ejecuta las dos con los mismos datos y exige el mismo
resultado.

En TypeScript el dinero son **microdólares enteros**: sumar mil operaciones no
arrastra error de coma flotante, y hay una prueba que lo comprueba.

---

## Lo que cuesta cada operación

Con el consumo medido en las validaciones humanas de cada sprint:

| Capacidad | Entrada | Salida | **Coste** | Medido en |
|---|---|---|---|---|
| Mejora de redacción | 727 | 171 | **$0,0005** | 12.2C · 4 llamadas reales |
| Revisión contextual | 1 073 | 618 | **$0,0015** | 12.2D · 3 llamadas reales |
| Pregunta a Intelligence | 2 700 | 700 | **$0,0021** | 12.1 · consultas reales |

Tres décimas de milésima de dólar la más barata. Una revisión contextual cuesta
**tres veces** una mejora de redacción, y una consulta global **cuatro veces**.

Esas proporciones son la información útil: dicen qué capacidad conviene mirar
si algún día hay que contener el gasto.

---

## Lo que NO se hace

**No se usa el dinero para autorizar.** Ver `QUALITY_12_2F_USAGE_LIMITS.md`.

**No se enseña el coste a la empresa.** Una empresa compra Trazaloop, no tokens
de un proveedor. La tarifa solo la lee personal de plataforma, y su RLS lo
impone.

**No se ha decidido ningún precio comercial.** Este sprint produce los datos
para que esa decisión se tome informada; tomarla ahora sería tomarla a ojo.
