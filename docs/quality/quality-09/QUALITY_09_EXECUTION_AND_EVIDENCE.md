# QUALITY-09 · Ejecución, notas, muestras y evidencia

## 1 · Tres capas que la gente confunde

```
NOTA DE TRABAJO  →  EVIDENCIA  →  HALLAZGO
   lo que apunto     lo que sostiene    lo que afirmo
```

Colapsarlas tiene dos consecuencias medibles. Si apuntar equivale a acusar, los
auditores dejan de apuntar. Si una evidencia es por sí sola un hallazgo, el
informe se llena de hechos sin juicio.

En el modelo son tres tablas. `quality_audit_notes` no tiene `evidence_id` ni
`finding_id`. `quality_audit_evidence` no tiene `finding_id` obligatorio: el
puente `quality_audit_finding_evidence` se ata **después y a mano**.

**Verificado contra base real** (`test:quality09-rls` F2–F3): registrar una nota
no crea evidencia ni hallazgo; registrar evidencia no crea hallazgo.

## 2 · La evidencia REFERENCIA; no copia

`quality_audit_evidence` no tiene `file_path`, ni `storage_key`, ni `mime_type`,
y la migración no crea ningún bucket. Apunta a lo que ya existe:

| Columna | A dónde apunta |
|---|---|
| `document_id` / `document_revision_id` | TrazaDocs |
| `indicator_id` / `measurement_id` | QUALITY-03 |
| `supplier_evaluation_id` | QUALITY-07 |
| `risk_id` | QUALITY-05 |
| `case_id` | El motor de casos |
| `external_evidence_id` | `evidences` de PCR |
| `sample_id` | La muestra de la que salió |

Un segundo repositorio de archivos convierte cada auditoría en una copia
divergente del sistema documental. La copia envejece; el original no.

## 3 · La muestra no es cobertura

`population_size` y `sample_size`, con un `check` que impide una muestra mayor
que la población. `describeSample()` produce «10 de 400 (2,5 %)», nunca
«revisado».

Es la frase que evita que el informe afirme más de lo que se miró — y la que
permite, un año después, entender por qué un hallazgo apareció y otro no.

## 4 · Las notas restringidas

Una nota de entrevista puede contener lo que alguien dijo de su propio trabajo.
`is_restricted` la reserva a quien conduce el dominio (`admin`, `quality`) y al
equipo auditor de **esa** auditoría.

El filtro está en la base, en la política de `select`:

```sql
using (quality_can_read_audit_note(organization_id, audit_id, is_restricted))
```

### El defecto que esto encontró

La política de escritura estaba declarada `for all`. En PostgreSQL `for all`
concede **también** `select`, y las políticas se suman: la puerta ancha de
escribir volvía a abrir la de leer que la política de lectura acababa de cerrar.

Lo detectó `test:quality09-rls` F4 contra base real —no una prueba estática— y
se corrigió partiendo la política en `insert`, `update` y `delete`, con la
guarda de lectura también en las dos últimas.

## 5 · El checklist, si se usa

Una auditoría corre una **versión publicada**, no «el checklist». El recorrido
(`quality_audit_checklist_runs`) guarda `version_id`, y por eso publicar la v2
no toca una sola respuesta de la v1.

**Verificado contra base real** (`test:quality09-rls` E6): tras publicar la v2,
el recorrido sigue apuntando a la v1, la respuesta guardada sigue atada a su
pregunta original y la v1 queda marcada `superseded`.

Y contestar una pregunta —incluso marcando «posible brecha»— **no crea ningún
hallazgo**. `checkResultCreatesFinding()` devuelve `false` para las cuatro
respuestas posibles, y ninguna rama de la base inserta en
`quality_audit_findings` desde ahí.

## 6 · Las conclusiones las escribe una persona

`quality_audits.conclusions` es texto libre y nadie lo calcula. Deducir «el
proceso es conforme» de «cero hallazgos» convierte la ausencia de evidencia en
evidencia de ausencia, que es precisamente lo que una auditoría por muestreo no
puede afirmar.

Sin conclusiones escritas, el informe no se emite: la RPC lo rechaza.
