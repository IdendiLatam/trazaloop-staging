# QUALITY-13B3 · LA CONVERGENCIA

Qué se entrega, y qué NO.

---

## 1 · La identidad de un problema

La que congeló B1, sin cambios:

```
dominio : tipo_de_sujeto : id_del_sujeto : condición
```

**Converge.** El aviso del barrido, el pendiente que lo acompaña y la señal de la regla
que releva a ese barrido producen **la misma clave** y se enseñan **una vez**, guardando
quién más lo vio.

**Separa.** Dos condiciones del mismo sujeto —una auditoría vencida y su informe
pendiente— son dos claves y se enseñan las dos.

**Nunca por el texto, ni por la gravedad, ni por la hora.** El texto se traduce y lleva
fechas dentro; la gravedad la pone cada dominio a su manera.

### Lo que NO se toca

`quality_signals.dedupe_key` sigue siendo `auto:<versión>:<sujeto>`. Es la identidad de la
señal **para el motor**, e incluye la versión a propósito: cambiar la regla abre una
condición nueva (§35 de QUALITY-11). Son dos capas distintas y las dos son correctas.
Reescribir la del motor para que se pareciera a la de la portada habría roto el rearme.

---

## 2 · De dónde sale la atención

`lib/db/quality-attention.ts` · `loadAttention({organizationId, processId?, domain?})`

Seis fuentes, en el orden que decide qué observador queda visible cuando varios ven lo
mismo:

1. `quality_signals` abiertas · la observación del motor de reglas;
2. `work_alerts` sin cerrar · el aviso de barridos y emisores por evento;
3. `work_tasks` sin cerrar · el pendiente asignado;
4. `quality_supplier_signals`, `quality_customer_signals`, `quality_knowledge_signals`
   abiertas.

**`quality_risk_signals` no se lee.** No la escribe nadie: leerla sería fingir que hay una
fuente donde solo hay una tabla vacía.

**Los avisos informativos no entran.** «Documento aprobado» y «documento retirado» son
buenas noticias con forma de aviso; contarlas como pendientes convierte lo terminado en
deuda.

### Cómo convergen la regla y el barrido

Cuando una regla declara a quién releva, su condición **es la de ese observador**. No es
una heurística: es un dato que la empresa declaró al adoptar la plantilla. Por eso la
señal nueva y el aviso viejo caen en la misma clave en vez de contarse dos veces.

---

## 3 · El estado, derivado y no guardado

| Estado | De dónde sale |
|---|---|
| `active` | la condición sigue cumpliéndose |
| `resolved` | dejó de cumplirse, o su dominio la cerró |
| `suppressed` | otro observador la releva, o alguien la silenció con motivo |
| `not_visible` | el rol no llega a ese dominio |
| `unavailable` | no se pudo leer |

**Ninguna tabla nueva.** §9 pide preferir la derivación y eso se hace: el estado se lee de
la verdad del dominio y del ciclo de vida del observador.

**Reconocer NO es resolver.** La base ya lo garantizaba desde 0129 —`acknowledge` no toca
`resolved_at`— y la convergencia lo respeta: una señal reconocida **sigue activa**. Quien
marcó «lo vi» no cambió el estado del negocio, y esconderla por eso dejaría que un clic
reescriba la verdad.

**Y mientras un observador siga viéndolo, el problema sigue.** Cerrar el aviso no cierra
el pendiente: si el pendiente sigue abierto, la línea sigue. Es lo contrario de lo que
haría un «ocultar»: no se ha implementado ninguno, y §10 lo prohíbe expresamente.

---

## 4 · El resumen para B4

`summarizeAttention` devuelve total, por dominio, por condición causal, por gravedad, y
**vencidos** y **por vencer** —solo donde el observador habla de fechas, declarado uno por
uno y no adivinado por el nombre—.

Un caso se cuenta aparte y merece decirse: `competence_evidence_expiring` emite **dos**
tipos de aviso —caducada y por caducar— bajo una sola condición. Sin mirar el aviso
concreto no se puede decir en cuál cae, así que no se clasifica: se cuenta como
`timingUnknown`. Es, en pequeño, el mismo problema de granularidad que arregla 0153.

**No hay puntuación global.** Ni `attention_score`, ni prioridad, ni media de gravedades.
Si dos dominios gradúan distinto, se enseñan las dos graduaciones.

**No se puede afirmar un resumen incompleto.** Con una fuente caída el total es un mínimo,
y el resultado lo dice.

---

## 5 · La migración 0153

Cuatro cosas, todas pequeñas:

1. `quality_observer_is_superseded(empresa, observador)` · resuelve el relevo con la
   granularidad de la **condición**, y sigue honrando la forma anterior —el nombre del
   barrido a secas— porque es lo que literalmente dice quien la escribió.
2. Los dos barridos relevados, reescritos para preguntar **condición a condición**.
3. Las dos plantillas que declaran relevo, corregidas a la forma cualificada.
4. Las reglas ya adoptadas desde esas dos plantillas, actualizadas. **Acotado por
   plantilla y por valor exacto**, no un `update` general. Lo que hace es DEVOLVER un
   aviso perdido.

**Sin tablas nuevas. Sin borrar nada. Sin `CASCADE`. Sin tocar el motor**, ni su clave, ni
sus funciones de reconocer, resolver y silenciar.

---

## 6 · Lo que sigue siendo de otro tramo

- **B4 · la portada.** Esto no pinta nada. La consulta existe para que B4 no tenga que
  preguntar a cinco mecanismos, y ahí acaba su trabajo.
- **B5 · Intelligence entre dominios.**
- **La supersesión de `quality_scan_risk_reviews`**, cuando la fuente `risk` exponga
  `status`.
- **La de `knowledge_single_holder`**, cuando se compruebe la paridad del filtro de
  criticidad.
- **Borrar `quality_risk_signals`**, que es limpieza y no convergencia.
