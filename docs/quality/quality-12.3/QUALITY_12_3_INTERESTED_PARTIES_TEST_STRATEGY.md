# QUALITY-12.3A · Partes interesadas · ESTRATEGIA DE PRUEBAS

> **Diseño de pruebas, no implementación.** Ninguna se escribe en 12.3A.
> Cada decisión PI-xx que pueda romperse en silencio necesita una prueba que
> falle con nombre propio. Las que no pueden romperse en silencio no la
> necesitan.

---

## 0 · Qué se prueba dónde

| Capa | Herramienta | Qué demuestra |
|---|---|---|
| Dominio puro | `tsx` unitaria | reglas sin base: conversión, pertinencia, vigencia, derivación de prioridad |
| Estructura | `tsx` estática sobre fuentes | que el cableado existe y que no reapareció lo prohibido |
| Base real | suite RLS con dos sesiones | invariantes, aislamiento, borrado, concurrencia |
| Integración | suite RLS | que los motores existentes se reutilizan y no se duplican |

El reparto no es estético: **una invariante que vive en un CHECK se prueba
contra la base**, porque probarla en TypeScript demostraría que el TypeScript
la respeta, no que la base la impone.

---

## 1 · Identidad y sujeto (PI-01 … PI-05)

| # | Qué demuestra | Capa |
|---|---|---|
| A1 | Un análisis con **dos** sujetos no nulos se rechaza | base |
| A2 | Un análisis con **cero** sujetos se rechaza | base |
| A3 | `subject_kind` incoherente con el campo relleno se rechaza | base |
| A4 | El sujeto externo apunta a `quality_external_parties` por FK **compuesta**: una parte de otra organización no se puede referenciar | base |
| A5 | La misma entidad admite **varios** análisis con categorías distintas, y eso no la duplica | base |
| A6 | No existe ninguna tabla nueva de identidad de parte interesada | estática |
| A7 | `quality_external_party_roles.role_code` **no** se amplía con categorías 4.2 | estática |

**A6 y A7 son las que impiden el error caro**: crear el tercer proveedor de la
casa, o fundir dos ejes que no son el mismo.

---

## 2 · Taxonomía (PI-06 … PI-08)

| # | Qué demuestra | Capa |
|---|---|---|
| B1 | La semilla de categorías no contiene vocabulario sectorial de manufactura | estática |
| B2 | Ninguna categoría es obligatoria: una organización con tres funciona | base |
| B3 | Desactivar una categoría **no** borra ni altera los análisis que la usaron | base |
| B4 | Las categorías son por organización: A no ve las de B | base |

---

## 3 · Necesidad / expectativa / requisito (PI-12 … PI-16)

| # | Qué demuestra | Capa |
|---|---|---|
| C1 | `requirement_kind` nulo con `entry_kind = requirement` se rechaza | base |
| C2 | `requirement_kind` no nulo con `entry_kind = need` se rechaza | base |
| C3 | Convertir conserva `derived_from_id`, `converted_at` y la justificación | base |
| C4 | `derived_from_id` a otra organización se rechaza | base |
| C5 | `derived_from_id` a una fila que ya es `requirement` se rechaza | base |
| C6 | Un requisito `legal` sin referencia de evidencia queda **señalado**, no bloqueado | dominio + estática |
| C7 | Declarar `not_relevant` sin justificación se rechaza | base |
| C8 | Un requisito **nunca** se borra: cierra vigencia | base |
| C9 | El modelo de requisitos de PROVEEDOR sigue intacto y separado | estática |

**C3 es la prueba de fondo:** sin ella, dentro de un año nadie sabrá si un SLA
salió de una petición del cliente o de una decisión propia.

---

## 4 · Procesos (PI-17 … PI-19)

| # | Qué demuestra | Capa |
|---|---|---|
| D1 | El vínculo apunta al proceso por FK; **no** existe columna de nombre de proceso | estática + base |
| D2 | «¿Qué partes afectan a este proceso?» se responde **derivando**, sin tabla parte↔proceso | estática |
| D3 | La consulta inversa devuelve lo mismo que la directa sobre los mismos datos | base |
| D4 | El vínculo guarda la revisión de proceso vigente cuando se pide | base |
| D5 | Cerrar la vigencia de un vínculo no altera el histórico | base |
| D6 | Un proceso de otra organización no se puede enlazar | base |

---

## 5 · Estrategia (PI-20 … PI-23)

| # | Qué demuestra | Capa |
|---|---|---|
| E1 | La dueña es un **cargo**: no existe columna de persona | estática |
| E2 | Como mucho **una** estrategia `active` por análisis/requisito | base |
| E3 | Una estrategia sin dueño o sin método de seguimiento **se guarda** y **se señala** | dominio |
| E4 | Los enlaces a indicadores, objetivos, riesgos y acciones van por `work_references`: **cero** tablas de enlace nuevas | estática |
| E5 | Una estrategia **nunca** se borra: se cancela o se sucede | base |
| E6 | Suceder una estrategia conserva la anterior íntegra | base |

**E4 es la que evita el crecimiento silencioso**: si alguien añade
`quality_stakeholder_strategy_indicators`, esta prueba falla.

---

## 6 · Seguimiento (PI-24 … PI-25)

| # | Qué demuestra | Capa |
|---|---|---|
| F1 | El vocabulario de mecanismos incluye los once, y **no** presupone encuesta | dominio |
| F2 | El seguimiento por encuesta **referencia** una campaña existente; no crea una tabla de encuestas | estática |
| F3 | El seguimiento por evaluación de proveedor referencia `quality_supplier_evaluations` | estática |
| F4 | Ninguna tabla nueva contiene «survey», «score» de encuesta ni «evaluation» de proveedor | estática |
| F5 | El anonimato de la voz del cliente **no se rompe** al citarla desde aquí: se cita el agregado, nunca la respuesta identificada | base |

**F5 hereda VC:** el anonimato de una campaña anónima no se rompe por cambiar
de pantalla.

---

## 7 · Priorización (PI-26 … PI-27)

| # | Qué demuestra | Capa |
|---|---|---|
| G1 | Un análisis **sin** prioridad numérica es válido | base |
| G2 | Con metodología, `derivation` guarda el rastro del cálculo | base |
| G3 | La metodología es versionada: cambiarla no reescribe evaluaciones anteriores | base |
| G4 | No existe una cuadrícula poder/interés obligatoria en el esquema ni en la interfaz | estática |

---

## 8 · Historia y revisión (PI-28 … PI-30)

Las seis preguntas del encargo, cada una una prueba contra base real:

| # | Pregunta |
|---|---|
| H1 | ¿Qué partes eran pertinentes en la fecha X? |
| H2 | ¿Qué necesidades se conocían en la fecha X? |
| H3 | ¿Cuáles se consideraban requisitos pertinentes en la fecha X? |
| H4 | ¿Qué estrategia estaba vigente en la fecha X? |
| H5 | ¿Qué procesos estaban relacionados en la fecha X? |
| H6 | ¿Qué cambió entre X e Y, y cuándo? |

Y tres más sobre la mecánica:

| # | Qué demuestra | Capa |
|---|---|---|
| H7 | Una revisión con veredicto `no_changes` **no** crea versión nueva y **sí** deja constancia | base |
| H8 | `audit_log` **no** se usa como fuente de ninguna de las respuestas H1–H6 | estática |
| H9 | Sin cadencia configurada, no se inventa un `next_review_due` | dominio |

**H7 es la prueba que impide fabricar información falsa**, y H8 la que impide
que una bitácora técnica se convierta en la memoria de la empresa.

---

## 9 · Integración (PI-31 … PI-32)

| # | Qué demuestra | Capa |
|---|---|---|
| I1 | Un hallazgo puede originar una **acción** | base |
| I2 | Un hallazgo **nunca** crea una no conformidad automática | base + estática |
| I3 | La entrada de RD lee los datos reales; **no** hay informe paralelo | estática |
| I4 | Los eventos de automatización están en el catálogo y respetan AT-01…AT-45 | estática |
| I5 | Lo determinista y la sugerencia de IA están separados: la señal no decide | estática |
| I6 | Las fuentes de Intelligence declaran `privacy_class` e `historical_mode` | base |
| I7 | Ninguna prueba llama a OpenAI | estática |

---

## 10 · Aislamiento y autorización

| # | Qué demuestra | Capa |
|---|---|---|
| J1 | Las seis tablas tienen RLS activa | base |
| J2 | La organización A no lee ni escribe nada de B, en las seis | base |
| J3 | Un miembro sin rol de gestión **lee** y **no escribe** | base |
| J4 | Las FK son **compuestas** por `(organization_id, id)`: el aislamiento es estructural | estática + base |
| J5 | Ninguna política concede a `service_role` en runtime | base |
| J6 | Entitlement (módulo Quality) y autorización (rol) son dos comprobaciones distintas, y las dos aplican | base |

---

## 11 · Regresiones de no duplicación

La familia que protege el principio más caro de romper:

| # | Qué demuestra |
|---|---|
| K1 | No existe tabla de identidad de parte interesada distinta de las tres del sujeto |
| K2 | No existe tabla de tareas ni de acciones propia del dominio |
| K3 | No existe tabla de encuestas propia del dominio |
| K4 | No existe tabla de riesgos propia del dominio |
| K5 | No existe tabla de indicadores ni de mediciones propia del dominio |
| K6 | No existen ficheros propios del dominio: los documentos son TrazaDocs |
| K7 | El número de tablas nuevas es **exactamente seis**, y cada una está justificada en el modelo de datos |

**K7 es deliberadamente rígida.** Si en 12.3B hacen falta siete, la prueba
falla y obliga a escribir por qué — que es exactamente el momento en que hay
que pensarlo, no seis meses después.

---

## 12 · Cómo se demuestra que la reutilización es real

No basta con no crear tablas: hay que probar que las existentes **se usan**.

| # | Qué demuestra |
|---|---|
| L1 | Una estrategia con indicador enlazado devuelve la **misma** medición que el módulo de indicadores |
| L2 | Un requisito con documento enlazado devuelve la **misma** revisión que TrazaDocs |
| L3 | Un seguimiento de cliente devuelve el **mismo** agregado que la voz del cliente |
| L4 | Un seguimiento de proveedor devuelve la **misma** evaluación que el módulo de proveedores |
| L5 | Un riesgo enlazado devuelve la **misma** valoración que el módulo de riesgos |

Cinco pruebas que fallan si alguien copia un dato en vez de enlazarlo.

---

## 13 · Lo que NO se prueba, y por qué

- **Que la interfaz sea agradable.** Eso lo dice la validación humana.
- **Que la clasificación sea correcta.** Que una parte sea pertinente es un
  juicio de la organización; la plataforma prueba que el juicio queda
  registrado, fechado y justificado, no que sea acertado.
- **Que la IA acierte.** No hay IA en 12.3.
- **Cobertura de líneas.** Nunca ha sido la métrica de esta casa: se prueba lo
  que puede romperse en silencio.
