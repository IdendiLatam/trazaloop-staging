# QUALITY-13B1 · CONTRATO DE ATENCIÓN

B1 **no** construye la portada. Construye la forma que B3 y B4 rellenarán, y la pieza de
la que depende que esa portada sea fiable: **la identidad de un problema**.

---

## 1 · La forma

```
AttentionItem {
  domain           de qué dominio sale
  subjectKind/Id   qué cosa concreta lo causa
  label            cómo se llama esa cosa
  reason           por qué pide atención, en la lengua del dominio
  state            el estado del sujeto, si lo tiene
  severity         la del dominio · null si el dominio no gradúa
  since            desde cuándo · para ordenar sin inventar prioridad
  href             OBLIGATORIO · lleva a la causa
  observer         quién lo vio, y a quién releva
  temporal         qué momento describe
  dedupeKey        la identidad del problema
}
```

**No hay una «gravedad de Quality».** Comparar en una escala inventada un riesgo alto,
una revisión vencida y una competencia por caducar es comparar cosas que no se comparan.
Si el dominio gradúa, se conserva su graduación; si no, `null`.

---

## 2 · La clave, que es lo que decide si la portada sirve

```
dominio : tipo_de_sujeto : id_del_sujeto : condición
```

Dos propiedades, y las dos hacen falta:

**Converge.** El mismo problema visto por el estado del dominio, por un barrido heredado
y por una regla de automatización produce **la misma clave** y se enseña **una vez**. Es
exactamente el caso que QUALITY-13A encontró cinco veces.

**Separa.** Dos condiciones distintas del mismo riesgo —revisión vencida y sin
tratamiento— producen **claves distintas** y se enseñan las dos. Fundirlas escondería
trabajo real.

Por eso la clave **no incluye al observador**: si lo incluyera, dos observadores del
mismo problema no convergerían nunca.

Y **nunca** se deduplica por el texto visible: el texto se traduce, se reescribe y lleva
fechas dentro.

`dedupeAttention` conserva además **quién más vio** cada problema. Perder esa lista
impediría después comprobar que el barrido heredado y la regla nueva decían lo mismo, que
es justo lo que B3 necesita para relevarlos.

---

## 3 · El vocabulario de observadores

| Tipo | Qué es |
|---|---|
| `truth_source` | el estado del propio dominio |
| `active_observer` | una regla adoptada por la empresa |
| `superseded_observer` | un barrido ya relevado por una regla |
| `legacy_sweep` | un barrido que todavía corre por su cuenta |

Más `supersedes`, que es el mecanismo que QUALITY-11.1 dejó construido y que hoy usan dos
plantillas de diez posibles.

**B1 no releva ni borra nada.** El inventario completo está en
`QUALITY_13A_INTEGRATION_DISCOVERY.md` §4.bis, y la regla de QI-27 es clara: ningún
barrido se borra sin comprobar antes que la empresa recibe lo mismo.

---

## 4 · Lo que queda para B3 y B4

**B3:** las plantillas que relevan los ocho barridos restantes, y el cargador que produce
`AttentionItem` desde cada fuente.

**B4:** la portada que los ordena, los agrupa y los enseña —con el enlace a la causa, sin
llamar «desempeño» a la completitud administrativa, y contando cada problema una vez.
