# QUALITY-12.3B2 · Partes interesadas · INTEGRACIONES

**Migración:** `0150_quality_interested_parties_integrations.sql`

Partes interesadas no es una isla. Toca cuatro cosas que ya existían, y en las
cuatro la regla fue la misma: **ampliar el vocabulario, no duplicar la
maquinaria**.

---

## 1 · `work_references` · lo periférico

Se ampliaron dos CHECK y se reescribió `work_reference_must_be_valid()` con las
ramas nuevas —cuatro propietarios y tres destinos—.

| Propietarios nuevos | Destinos nuevos |
|---|---|
| `stakeholder_assessment` | `quality_stakeholder_assessment` |
| `stakeholder_requirement` | `quality_stakeholder_requirement` |
| `stakeholder_strategy` | `quality_stakeholder_strategy` |
| `stakeholder_review` | |

Ahí van el objetivo que responde a un requisito, el riesgo que nace de una parte
interesada, la campaña que la escuchó, la evaluación de proveedor que respalda el
cumplimiento, el documento que lo prueba.

### La puerta que la ampliación abrió, y hubo que cerrar

Una vez que `stakeholder_strategy` es propietario válido y
`quality_stakeholder_requirement` es destino válido, **la pareja de los dos
expresa la relación que tiene tabla propia**. Y esta tabla no tiene periodo de
validez, así que registrarla ahí perdería el «desde cuándo».

No es una hipótesis: la prueba W de B1 comprobaba que ese vocabulario no existía,
y al ampliarlo en esta misma migración se puso roja. La respuesta correcta no era
relajar la prueba, era cerrar la pareja. El disparador ahora rechaza
explícitamente:

- `stakeholder_strategy` → `quality_stakeholder_requirement`
- `stakeholder_requirement` → `quality_process` / `quality_process_revision`

Lo periférico de verdad sigue entrando: la puerta se cerró para dos parejas, no
para la tabla.

---

## 2 · Revisión por la Dirección

Una fila de catálogo —`interested_parties`, `position_order` 15— y su
constructor, `quality_mr_src_interested_parties`. Se amplió el CHECK de
`source_domain` y se reescribió el despachador `quality_mr_source_payload`
conservando su `p_review_id uuid default null` (PostgreSQL no permite quitar un
valor por defecto con `create or replace`, y quitarlo rompería a quien la llama
con cuatro argumentos).

**La fila va AL FINAL, nunca intercalada.** Reordenar las catorce existentes
reescribiría el orden del día con el que se prepararon revisiones ya cerradas, y
ese orden es parte de lo que se firmó. Una prueba lo comprueba.

**Sin informe paralelo.** La entrada se prepara y se refresca con la maquinaria
de 0128. Si el retrato se armara en TypeScript, una revisión preparada hace seis
meses y reabierta hoy enseñaría números de hoy, y eso es falsificar un acta.

---

## 3 · Intelligence

Dos fuentes en `quality_ai_sources`, las dos `privacy_class = 'open'` y
`historical_mode = 'as_of'`:

| Código | Qué cita |
|---|---|
| `interested_party` | la parte, su categoría, su pertinencia, sus entradas |
| `interested_party_strategy` | la estrategia, su seguimiento y su estado de revisión |

Son **abiertas** porque lo que devuelven no lleva personas: la parte se cita por
su nombre comercial y el responsable por su **cargo**. Ni correos, ni teléfonos,
ni contactos, ni quién firmó. Una fuente «abierta» que colara un contacto dejaría
de serlo sin que el catálogo se enterara, así que hay una prueba que registra el
contexto entero y busca arrobas, palabras de contacto y columnas `*_by`.

`historical_mode = 'as_of'` no es decorativo: preguntar por marzo devuelve lo
vigente en marzo. Devolver lo de hoy con fecha de marzo sería la peor respuesta
posible —convincente y falsa—.

`loadIntelligenceContext()` **no llama a ningún proveedor**. Prepara datos
estructurados con su procedencia; quien decida usarlos pasará por la puerta de
12.2 con sus límites y su registro. Corre bajo la sesión de quien pregunta: si su
rol no alcanza, el contexto sale más corto, que es lo correcto —no puede enseñar
más de lo que esa persona vería en pantalla—.

---

## 4 · Voz del cliente y Proveedores · leer, nunca copiar

`customerViewOf()` y `supplierViewOf()` leen el perfil que cuelga de la **misma**
`quality_external_parties` y devuelven estado de la relación, última evaluación y
próxima revisión. Para mostrar y enlazar; no se copia una sola fila.

En proveedores son dos saltos —perfil → alcance → evaluación— porque un proveedor
puede estar evaluado para una cosa y no para otra, y decir «evaluado» a secas
sería falso.

---

## 5 · Dos correcciones que este sprint encontró

**El guardián de historia de B1 miraba las columnas equivocadas.** 0149 declaró
en su propio comentario que impedía «cambiar el CONTENIDO de una fila ya
sucedida», y después comprobó `effective_from`, `effective_to` y `status`, que
son justamente las tres que no son contenido. Una fila sucedida conservaba sus
fechas y admitía que le reescribieran el resumen, la pertinencia y la prioridad:
permitía exactamente lo único que existía para impedir. Ahora una fila ya
sucedida no admite **ninguna** modificación. Lo encontró la prueba AW, no una
lectura del código: el comentario describía lo correcto y la condición hacía otra
cosa, y por encima los dos parecen lo mismo.

**El despachador conmuta por `p_code`, no por `p_source_domain`.** La primera
versión del constructor de Revisión por la Dirección en TypeScript pasaba el
dominio. La RPC devolvía `null` sin error, que es la forma de fallar de la que
este repositorio ya tiene cicatrices. Lo encontró la prueba AQ.
