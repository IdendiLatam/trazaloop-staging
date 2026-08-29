# QUALITY-12.3B1 · Partes interesadas · FUNDACIÓN RELACIONAL

**Migración:** `0149_quality_interested_parties_core.sql`
**Arquitectura:** QUALITY-12.3A final (`b9b059b`), PI-01 … PI-39, sin reinterpretar.
**Local** 0149 · **Staging** `qchzkxbnbqeyuxinipln` 0149 · **Production** 0111, sin tocar.

Sin interfaz, sin automatización, sin Intelligence.

---

## 1 · Lo que se construyó

Ocho tablas, un permiso, tres guardianes, una función de siembra y RLS en las
ocho. Y —lo que más importa— **ninguna identidad nueva**: la parte interesada
externa sigue siendo `quality_external_parties`, congelada en GP-02/GP-33 y ya
apuntada por nueve claves foráneas incluidas las de PCR y Textiles.

| Tabla | Qué sostiene |
|---|---|
| `quality_stakeholder_categories` | taxonomía 4.2 por empresa, 15 de semilla editable |
| `quality_stakeholder_groups` | colectivos: trabajadores, dirección, comunidad, academia |
| `quality_stakeholder_assessments` | el análisis fechado. El núcleo |
| `quality_stakeholder_requirements` | necesidad, expectativa y requisito, con la conversión trazada |
| `quality_stakeholder_requirement_processes` | **core**: requisito → proceso |
| `quality_stakeholder_strategies` | la gestión, con dueña **cargo** |
| `quality_stakeholder_strategy_requirements` | **core**: estrategia → requisito |
| `quality_stakeholder_reviews` | «se revisó y no cambió nada», sin fabricar versiones |

---

## 2 · El aislamiento es estructural antes que de política

**Todas** las claves foráneas del dominio son compuestas por
`(organization_id, id)`. Un análisis no puede apuntar a una parte de otra
empresa aunque alguien conozca su uuid, y lo impide la base, no la política.
La RLS es la segunda barrera.

Comprobado contra base real: el intento de analizar una parte de otra empresa
falla con violación de clave foránea, no con «cero filas».

---

## 3 · Dos sujetos, no tres (PI-02, PI-38)

```sql
subject_kind ∈ ('external_party', 'group')
external_party_id    → quality_external_parties(organization_id, id)
stakeholder_group_id → quality_stakeholder_groups(organization_id, id)
CHECK num_nonnulls(external_party_id, stakeholder_group_id) = 1
CHECK el sujeto declarado coincide con el relleno
```

`quality_org_units` **no** aparece en la migración: es el organigrama, y atar
los sujetos del análisis 4.2 a él haría que cada reorganización interna moviera
las partes interesadas. Y no hay `subject_type`/`subject_id`: eso perdería la
clave foránea.

---

## 4 · Historical Truth

| Mecanismo | Qué garantiza |
|---|---|
| `effective_from` / `effective_to` + `supersedes_id` + `status` | el análisis y la estrategia se **suceden**, no se editan |
| `quality_stakeholder_history_guard` | una fila ya sucedida no vuelve a estar vigente ni se mueve |
| índices únicos parciales | **un** análisis vigente por (sujeto, categoría); **un** vínculo vigente por pareja; **un** sucesor por fila |
| `forbid_mutation` en revisiones | una revisión es un hecho: ni se edita ni se borra |
| **sin política de DELETE** en las ocho | lo que no tiene política, no se puede hacer |
| **sin privilegio de DELETE** en las ocho | segunda capa, ver §7 |

`audit_log` no participa en ninguna de las respuestas históricas.

---

## 5 · Las dos relaciones core, y por qué no fueron `work_references`

`requisito → proceso` lleva vigencia, instantánea de la revisión del proceso y
vocabulario propio (`addressed_by` / `affects` / `monitored_by`).
`estrategia → requisito` lleva vigencia y una relación tipada.

`work_references` no tiene ninguna de esas tres cosas: solo `origin`,
`evidence` y `related`, y sin vigencia. La prueba W comprueba que el dominio no
registra sus relaciones core ahí.

Y hay un guardián que va más allá de la clave foránea: una estrategia solo
puede atender requisitos **del mismo análisis**. Sin él, una estrategia del
cliente ABC podría decir que atiende un requisito del proveedor XYZ, y las dos
consultas de PI-36 devolverían respuestas ciertas y absurdas.

---

## 6 · La priorización no obliga a nada

Ninguna columna de prioridad es obligatoria; un análisis sin un solo número es
válido y es el uso normal. Lo único que la base exige es que **un número no
vaya desnudo**: si hay `priority_score`, hay metodología o justificación
(PI-39). La alternativa cualitativa —`high`/`medium`/`low`— vale por sí sola.

---

## 7 · Un hallazgo de privilegios que afecta a todo el proyecto

Supabase tiene un `alter default privileges` que concede **todo** —incluido
`delete`— a `anon`, `authenticated` y `service_role` sobre cada tabla nueva.
La convención del repositorio, `revoke all … from public, anon`, **no** quita
ese privilegio a `authenticated`.

Se verificó en `pg_default_acl` y en las tablas ya existentes: hoy, en el resto
de Quality, la única barrera contra el borrado desde un cliente es la ausencia
de política de RLS. Es suficiente, pero es **una** capa.

Estas ocho revocan también a `authenticated` y conceden exactamente
`select, insert, update` —y solo `select, insert` en revisiones—. Es más
estricto que el entorno, deliberadamente, y está dicho aquí para que no parezca
una inconsistencia.

---

## 8 · Lo que se difirió, y por qué

| Diferido | Razón |
|---|---|
| Entrada de Revisión por la Dirección | registrarla ahora dejaría en la pantalla de RD una entrada obligatoria que **nada puede llenar** hasta que exista la capa de lectura |
| Eventos de automatización | 12.3A dejó los seis nombres **sujetos a revisión** contra AT-01…AT-45; congelarlos sin esa revisión sería decidir por omisión |
| Fuentes de Intelligence | sin capa de aplicación no hay context pack que servir |
| Ampliación de `work_references` | sus `owner_kind`/`ref_kind` requieren además ampliar el `CASE` de `work_reference_must_be_valid`; sin enlaces periféricos que escribir todavía, sería una migración sin uso |

Las cuatro son append-only cuando llegue el momento.

---

## 9 · Desviaciones respecto de la arquitectura

**Ninguna que cambie una decisión PI.** Tres precisiones técnicas:

1. **`work_references` sí valida al escribir.** El descubrimiento dijo que no
   había integridad referencial. La precisión: no hay clave foránea —un borrado
   posterior deja la referencia colgando y no hay `on delete restrict`— pero un
   disparador, `work_reference_must_be_valid`, comprueba al insertar que el
   objeto existe y es de la misma empresa. La decisión PI-36/PI-37 no cambia:
   sigue sin haber vigencia ni relación tipada, que eran las otras dos razones.

2. **«Una estrategia `active` general por análisis» no se puede imponer
   declarativamente.** Ser «general» significa no tener enlaces, y los enlaces
   se crean *después* de la estrategia: en el instante del `insert` toda
   estrategia parece general. Un disparador rechazaría la segunda antes de que
   existieran sus enlaces. Se deja **sin imponer** en la base; es una cuestión
   de calidad de dato que un informe puede señalar, no una violación de
   integridad. Dos estrategias activas para la misma parte no rompen ninguna
   consulta.

3. **«Un miembro lee pero no escribe» no es representable hoy.** La plataforma
   tiene tres roles —`admin`, `quality`, `consultant`— y los tres son
   exactamente los que `quality_manages_interested_parties` concede. La
   separación entre leer (`is_org_member`) y escribir (permiso de dominio) está
   hecha en las políticas y se comprueba estructuralmente; el día que exista un
   rol de solo lectura funcionará sin tocar las ocho tablas.

---

## 10 · Un defecto que encontró la prueba, y no la revisión

El CHECK del subtipo de requisito estaba escrito así:

```sql
check ((entry_kind = 'requirement' and requirement_kind in ('legal', …))
    or (entry_kind <> 'requirement' and requirement_kind is null))
```

Con `entry_kind = 'requirement'` y `requirement_kind` nulo: la primera rama
evalúa `NULL in (…)` → NULL; la segunda, `false`. Y `NULL or false` es **NULL**,
que un CHECK acepta. Un requisito sin subtipo pasaba.

La lógica de tres valores deja pasar justo lo que uno cree haber prohibido. Se
corrigió con un `requirement_kind is not null` explícito, y la prueba J lo
vigila.
