# QUALITY-12 · Rendimiento

## 1 · Qué se mide (§157)

Cada ejecución guarda: latencia total, tokens de entrada, tokens de salida y
cuántas fuentes tenía el contexto. No hay un objetivo de servicio comprometido;
lo que hay es la instrumentación para poder mirarlo.

## 2 · Lo observado, con el doble determinístico

Sobre el escenario de las pruebas (una empresa con procesos, indicadores con dos
años de mediciones, casos, señales, una campaña con cuatro comentarios):

| Fase | Tiempo típico |
|---|---|
| Comprobación de topes y apertura de la ejecución | 15–40 ms |
| Construcción del contexto (once adaptadores) | 40–200 ms |
| Registro de las referencias | 10–30 ms · una llamada por fuente |
| Proveedor (doble) | < 5 ms |
| Validación y cierre | 10–25 ms |
| **Total** | **< 400 ms** |

| Medida | Valor |
|---|---|
| Fuentes por consulta | 3–20 |
| Tamaño del contexto | 1–6 KB de 24 KB de presupuesto |
| Hechos ya calculados | 3–15 |

## 3 · Lo que no se ha medido

**La latencia del proveedor real.** No hay credencial en este entorno (GAP-01).
Cuando la haya, `quality_ai_runs.latency_ms` la registra sin tocar nada: la
instrumentación ya está puesta y el informe de consumo ya la muestra.

Una estimación honesta: la llamada al modelo dominará el total con diferencia
—segundos frente a milisegundos—, y por eso el tiempo máximo por omisión son 30
segundos y se cancela de verdad.

## 4 · Dónde está el coste, y qué lo acota

**El número de adaptadores que aplican.** Una pregunta abierta activa casi
todos; una pregunta desde un indicador activa muchos menos y además acotados.
Es una consulta por adaptador, no una por entidad.

**El registro de referencias.** Hoy es una llamada por fuente. Con veinte
fuentes son veinte llamadas cortas. Si algún día se notara, se agrupan en una
sola llamada; no se ha hecho porque a esta escala no es donde está el tiempo.

**El presupuesto de contexto.** 24 000 caracteres. Cuando se llena, se recorta y
se dice.

## 5 · Dónde miraría primero si un día va lento

1. `quality_ai_runs.latency_ms` junto a `context_items`: si el tiempo crece con
   las fuentes, es el registro de referencias; si no, es el proveedor.
2. El adaptador de indicadores cuando la pregunta es histórica: es el único que
   hace una consulta adicional por indicador para traer sus mediciones. Está
   acotado a 8 periodos y solo se activa con indicador fijado o pregunta
   temporal, precisamente por eso.
3. El presupuesto: si `truncated` sale a menudo, el contexto está entrando
   demasiado grande y conviene afinar los topes por adaptador antes que subir el
   presupuesto.
