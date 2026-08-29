# QUALITY-12.3A · Partes interesadas · DESCUBRIMIENTO

> Inspección del repositorio real. Sin migraciones, sin esquema, sin código.
> Base: rama `feature/pcr-textiles-pre-integration`, commit `a1bfd53`, Local 0148.

---

## 1 · La conclusión, primero

**Casi todo lo que este dominio necesita ya existe.** Lo que falta no es
infraestructura: es la capa de ANÁLISIS que dice, para una parte concreta y en
un periodo concreto, qué necesita, qué espera, qué de eso es un requisito
pertinente, a qué procesos afecta y qué va a hacer la organización al respecto.

No hay ninguna tabla `stakeholder`, `interested_part*` ni equivalente. El único
sitio del repositorio que menciona «partes interesadas» es
`docs/quality/q0/Q0_QUALITY_SCHEMA_MAPPING.md`, donde quedó marcado como
**CREAR · prioridad media** dentro del bloque «Estrategia y desempeño». Es
decir: estaba previsto y sigue pendiente.

---

## 2 · La identidad ya está resuelta, y está congelada

`quality_external_parties` es la identidad transversal de una entidad externa.
La decisión está tomada en **QUALITY-07 (GP-02, GP-33)** y documentada en
`QUALITY_07_SUPPLIER_IDENTITY.md`: una empresa es una sola empresa; lo que
cambia entre módulos es el **papel**, no la identidad.

```
quality_external_parties            legal_name · trade_name · tax_id · country ·
                                    city · website · status
├── quality_external_party_roles    role_code · status · since_on · until_on
├── quality_external_party_contacts full_name · role_title · email · phone
├── quality_external_party_sites    name · code · country · city · address
├── quality_supplier_profiles       relationship_status · owner_position_id ·
│                                   reevaluation_months · next_review_on
└── quality_customer_profiles       relationship_status · segment · owner_position_id
```

Y ya la apuntan **nueve** claves foráneas, incluidas las de PCR y Textiles:

| Tabla | Semántica del borrado |
|---|---|
| `quality_external_party_contacts` | `on delete cascade` |
| `quality_external_party_roles` | `on delete cascade` |
| `quality_external_party_sites` | `on delete cascade` |
| `quality_supplier_profiles` | `on delete restrict` |
| `quality_customer_profiles` | `on delete restrict` |
| `quality_audit_scope_items` | `on delete restrict` |
| `suppliers` (PCR) | `on delete set null` |
| `textile_suppliers` | `on delete set null` |
| `customer_requirements` | `on delete set null` |

**Consecuencia directa:** crear una identidad propia de «parte interesada»
sería el tercer proveedor de la casa. No se hace.

### 2.1 · Pero la identidad externa NO cubre todas las partes interesadas

`quality_external_parties` modela entidades **externas y concretas**. La 4.2
incluye además:

- **colectivos internos** — trabajadores, un área, la dirección;
- **grupos genéricos sin entidad jurídica concreta** — la comunidad del entorno,
  «los entes reguladores» como categoría, la academia.

Para lo interno existe `quality_org_units` (`code`, `name`, `parent_id`,
`is_active`). Para lo genérico no existe nada, y es correcto que no exista:
inventar una fila en `quality_external_parties` llamada «Comunidad» sería
meter en el registro de entidades externas algo que no es una entidad.

**Este es el hueco real del descubrimiento**, y lo resuelve la arquitectura con
un sujeto polimórfico, no con una identidad nueva.

---

## 3 · El vocabulario de papeles existente, y su límite

```sql
quality_external_party_roles_code_check CHECK (role_code = ANY (ARRAY[
  'supplier','customer','laboratory','contractor','consultant',
  'certification_body','other']))
```

Siete valores, en un CHECK. Sirven para lo que fueron creados —el papel
**comercial/funcional** que una entidad juega frente a la organización— y no
sirven como taxonomía de la 4.2, que incluye trabajadores, propietarios,
comunidad, autoridades y academia.

Son **dos ejes distintos**, no una lista incompleta:

| | Papel de la entidad externa | Categoría de parte interesada |
|---|---|---|
| Pregunta | ¿qué me vende / qué me compra? | ¿por qué me importa para el SGC? |
| Ámbito | solo entidades externas | también internas y colectivas |
| Alcance | operativo | 4.2 |
| Vocabulario | CHECK cerrado, 7 valores | catálogo configurable por organización |

Confundirlos obligaría a ampliar un CHECK cada vez que una organización tenga
una parte interesada que no le vende ni le compra nada.

---

## 4 · Precedente de requisitos: ya existe, dos veces

### 4.1 · `quality_supplier_requirements` + `_assignments`

```
quality_supplier_requirements       code · title · description · requirement_kind ·
                                    enforcement · trazadoc_document_id · is_active
quality_supplier_requirement_assignments
                                    requirement_id · category_id · scope_id ·
                                    effective_from · effective_to
```

El patrón está probado: **el requisito es una entidad con identidad estable, y
su aplicación a alguien es una asignación con periodo de vigencia.** Es
exactamente la forma que la 4.2 necesita, y no hay que inventarla.

### 4.2 · `customer_requirements`

```
customer_requirements  customer_name · code · title · description ·
                       starts_on · ends_on · active · external_party_id
```

Nota: conserva `customer_name` en texto **y** `external_party_id`. Es un
puente añadido después, con la identidad opcional. No es un modelo a copiar,
pero sí una advertencia sobre lo que pasa cuando el nombre viaja como texto.

---

## 5 · Lo que se puede reutilizar, tabla por tabla

| Necesidad de 12.3 | Ya existe | Reutilización |
|---|---|---|
| Identidad externa | `quality_external_parties` + roles/contactos/sedes | **directa** |
| Colectivo interno | `quality_org_units` | **directa** |
| Procesos | `quality_processes` (`owner_position_id`, `current_revision`) + `quality_process_revisions` | FK, nunca texto |
| Entradas/salidas de proceso | `quality_process_io` (`direction`, `io_kind`, por revisión) | lectura |
| Riesgos | `quality_risks`, `quality_risk_processes`, `quality_risk_objectives` | vínculo, no copia |
| Oportunidades | `quality_opportunities`, `_processes`, `_objectives` | vínculo |
| Objetivos e indicadores | `quality_objectives`, `quality_indicators`, `quality_objective_indicators`, `quality_measurements` | vínculo |
| Acciones y casos | `work_cases`, `work_actions`, `work_case_processes`, `work_case_requirements` | vínculo |
| Evidencia y enlaces | **`work_references`** | **la pieza clave — ver §6** |
| Documentos | TrazaDocs (`trazadoc_document` ya es `ref_kind` válido) | vínculo |
| Voz del cliente | `quality_customer_*`, encuestas, `quality_customer_voice_reviews` | seguimiento de clientes |
| Proveedores | `quality_supplier_evaluations`, `_criticality_assessments`, `_incidents` | seguimiento de proveedores |
| Auditorías | `quality_audits`, `quality_audit_scope_items` (ya apunta a party) | seguimiento |
| Revisión por la dirección | `quality_management_review_input_catalog` + `_inputs` | **punto de extensión** |
| Automatización | `quality_automation_event_catalog` + `_event_contracts` + `_sources` | **punto de extensión** |
| Intelligence | `quality_ai_sources` (20 fuentes, con `privacy_class` y `historical_mode`) | **punto de extensión** |
| Cargos | `quality_positions`, `quality_position_versions` | dueño = cargo, T-02 |

---

## 6 · `work_references` es la pieza que evita media docena de tablas

```
work_references  owner_kind · owner_id · ref_kind · ref_id · relation · note · snapshot
                 relation ∈ {origin, evidence, related}
```

Con **28** valores en `owner_kind` y **41** en `ref_kind`, entre ellos ya
`quality_external_party`. Es el mecanismo con el que el resto de Quality
enlaza evidencia, origen y relación sin crear una tabla de enlace por pareja.

Ampliarlo es **añadir valores a dos CHECK**, y eso es una migración
append-only: no toca datos ni rompe filas existentes.

**Sin esto**, este dominio necesitaría al menos seis tablas de enlace
(parte↔riesgo, parte↔oportunidad, requisito↔documento, estrategia↔indicador,
estrategia↔objetivo, revisión↔evidencia). Con esto, ninguna.

---

## 7 · Precedentes de temporalidad, y cuál aplica

El repositorio tiene **tres** patrones temporales distintos, cada uno para una
cosa distinta. Elegir mal es la trampa principal de este dominio.

| Patrón | Ejemplo | Para qué sirve |
|---|---|---|
| **Revisión publicada** | `quality_process_revisions` (`revision_number`, `status`, `effective_from/to`, `published_at`) | un documento vivo que se versiona y se publica |
| **Evaluación fechada** | `quality_risk_assessments` (`assessed_on`, `methodology_version_id`, `score`, `derivation`, `rationale`) | un juicio con metodología, repetible en el tiempo |
| **Asignación con vigencia** | `quality_supplier_requirement_assignments` (`effective_from/to`) | «esto aplica a aquello, entre estas fechas» |

La 4.2 necesita **los tres**, para cosas distintas, y ahí está el diseño.

---

## 8 · Precedente de priorización configurable

`quality_risk_methodologies` → `_versions` (`aggregation`, `effective_from/to`,
`published_at`) → `quality_risk_scales` → `_scale_levels`, y la evaluación
guarda `derivation` en JSONB con el rastro del cálculo.

Y en proveedores, `quality_supplier_criticality_assessments` con `score`,
`level_id`, `derivation` y `review_months` derivado del nivel.

**Conclusión:** la plataforma ya sabe hacer priorización configurable con
metodología versionada. La 4.2 no necesita una cuadrícula poder/interés
obligatoria, y no debe inventar una tercera forma de puntuar.

---

## 9 · Puntos de extensión, verificados

| Extensión | Tabla | Estado actual |
|---|---|---|
| Entrada de Revisión por la Dirección | `quality_management_review_input_catalog` | 14 entradas, con `source_domain` y `is_required`. La más cercana es `changes` («Cambios relevantes internos y externos», `source_domain = documents`) |
| Evento de automatización | `quality_automation_event_catalog` | 20 eventos en 12 dominios (`audits`, `cases`, `customer`, `indicators`, `management_review`, `people`, `risks`, `suppliers`). **Ninguno de contexto o partes interesadas** |
| Contrato de evento | `quality_automation_event_contracts` | `subject_type · source_code · resolver` |
| Fuente de Intelligence | `quality_ai_sources` | 20 fuentes con `privacy_class` (`open`/`people`/`anonymous`/`restricted`) y `historical_mode` (`as_of`/`period`/`current`) |

Los tres son catálogos con filas, no listas en código: **extenderlos es
insertar filas y ampliar CHECK, no reescribir nada**.

---

## 10 · Autorización: el patrón está fijado

```sql
-- Lectura
quality_<tabla>_select  USING (is_org_member(organization_id))
-- Escritura
quality_<tabla>_write   USING (quality_manages_<dominio>(organization_id))

quality_manages_suppliers(org) := has_org_role(org, array['admin','quality','consultant'])
```

Existen `quality_manages_{suppliers, customer_voice, audits, management_review,
people, automation}` y sus `quality_reads_*` cuando el dominio tiene lectura
restringida (auditorías, revisión por la dirección, voz del cliente).

Todas las políticas son sobre `authenticated`; **no hay `service_role` en
runtime**.

---

## 11 · Navegación actual de Quality

Nueve grupos: Sistema de gestión · Desempeño · Riesgos y oportunidades · Casos ·
Documentos · Personas · Proveedores · Voz del cliente · Auditorías · Revisión
por la dirección · Intelligence · Automatización.

**No hay grupo de contexto ni de partes interesadas.** El sitio natural es
junto a «Sistema de gestión», porque 4.1 y 4.2 son la entrada del sistema, no
un apéndice de desempeño.

---

## 12 · Lo que el descubrimiento NO encontró

- Ninguna tabla, ruta, componente ni acción de partes interesadas.
- Ningún evento de automatización de contexto.
- Ninguna fuente de Intelligence de contexto.
- Ninguna entrada de Revisión por la Dirección específica de 4.2 (la más
  cercana, `changes`, hoy se alimenta de documentos).
- Ningún modelo de «necesidad» ni de «expectativa» en ningún dominio: lo más
  parecido es el requisito de proveedor, que ya nace siendo requisito.
