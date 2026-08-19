# Q0_IMPLEMENTATION_DEPENDENCY_GRAPH

**Sprint:** Q0 — Technical Discovery & Schema Mapping
**Fecha:** 2026-08-18
**Principio rector:** MDR-39 — *el orden de implementación sigue el grafo de dependencias, no el
orden del menú.*

---

## 1. Qué determina el orden

Tres fuerzas, en este orden de prioridad:

1. **Dependencia dura** — B no puede existir sin A (un hallazgo de auditoría *es* un caso).
2. **Coste de rehacer** — decisiones que, tomadas tarde, obligan a migrar todo lo anterior.
3. **Valor observable** — cada corte debe producir algo que una persona real pueda usar (§37).

La primera fuerza manda sobre las otras dos.

---

## 2. Fundación ya disponible (nivel 0)

No hay que construirla. Es el suelo sobre el que todo se apoya.

```text
organizations · profiles · memberships · roles · platform_staff
organization_modules · plan_definitions · plan_limits
is_org_member() · has_org_role() · is_platform_superadmin()
resolve_organization_module_access() · organization_effective_plan_code()
set_updated_at() · force_created_by() · prevent_organization_id_change()
forbid_mutation() · safe_uuid() · audit_row_change() · log_event()
Storage privado + storage_upload_intents + storage_orphan_candidates
```

---

## 3. Las cuatro decisiones que preceden a todo

Estas **no son código**: son decisiones de modelo que contaminan cada tabla posterior. Tomarlas
después obliga a migrar lo ya construido.

```text
┌─────────────────────────────────────────────────────────────┐
│  D-a  Vigencia de negocio (effective_from / effective_to)   │  MDR-07, MDR-44
│  D-b  Cargo como sujeto de responsabilidad                  │  MDR-33, D-17, PC-03
│  D-c  Evidencia transversal única                           │  MDR-46, MDR-12, MDR-50
│  D-d  Separación historial técnico / historial de negocio   │  MDR-35
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                   TODO EL RESTO DEL GRAFO
```

`D-a` y `D-c` son las de mayor coste diferido. `D-c` además tiene una ventana que se cierra: cada
sprint que pasa añade filas a los dos sistemas de evidencia existentes.

---

## 4. Grafo de dependencias

```text
NIVEL 0 · PLATAFORMA (existe)
   organizations · memberships · roles · storage · planes · helpers
        │
        ├──────────────────────────────────────────────┐
        ▼                                              ▼
NIVEL 1 · FUNDACIÓN QUALITY                    NIVEL 1' · ACCESO
   quality_external_parties                       módulo 'quality' → functional
   quality_relations                              capacidades + alcances (MDR-34)
   quality_events        (motor, no audit_log)         │
   quality_source_links                                │
   [D-c] evidencia transversal                         │
        │                                              │
        ├──────────────────────────────────────────────┘
        ▼
NIVEL 2 · ORGANIZACIÓN Y RESPONSABILIDAD          ← [D-b]
   quality_org_units
   quality_positions (+ versiones, funciones)
   quality_position_assignments  (histórico, MDR-17)
   quality_people                (≠ profiles, PC-05)
        │
        ├───────────────────────┬──────────────────────┐
        ▼                       ▼                      ▼
NIVEL 3 · PROCESOS       NIVEL 3' · DOCUMENTOS   NIVEL 3'' · NORMATIVA
   quality_processes        TrazaDocs EVOLUCIONA     frameworks EVOLUCIONA
   quality_process_versions   ├ identidad/revisión   requirements EVOLUCIONA
   quality_process_maps       ├ [D-a] vigencia       quality_requirement_mappings
   quality_process_map_*      ├ owner → cargo [D-b]        │
   quality_process_           ├ module_key='quality'       │
     interactions             └ blueprints versionados     │
   quality_process_flows            │                      │
   quality_process_stages           │                      │
   quality_process_activities       │                      │
        │                           │                      │
        └───────────┬───────────────┴──────────────────────┘
                    ▼
NIVEL 4 · NÚCLEO TRANSVERSAL DE GESTIÓN
   quality_cases            (supertipo + especializaciones, MDR-23)
   quality_actions          (N:M orígenes desde el diseño, MDR-24, AC-12)
   quality_action_sources
   quality_root_cause_analyses
   quality_action_effectiveness_reviews
   quality_case_events
   quality_tasks
        │
        ├──────────────┬───────────────┬──────────────┬──────────────┐
        ▼              ▼               ▼              ▼              ▼
NIVEL 5 · DOMINIOS (paralelizables entre sí)
  RIESGOS        PROVEEDORES      DESEMPEÑO      AUDITORÍAS      PERSONAS·2
  metodologías   perfiles         objetivos      audit_programs  competencias
  riesgos        categorías       indicadores    audits          evaluaciones
  valoraciones   criticidad       versiones      alcances        desarrollo
  controles      requisitos       fuentes        criterios       formación
  efectividad    selección        metas          equipo          conocimiento
  señales        aprobación       mediciones     hallazgos       lecciones
  oportunidades  evaluación       linaje         informes
                 reevaluación     eventos desemp.
                 incidentes
        │              │               │              │
        └──────────────┴───────┬───────┴──────────────┘
                               ▼
NIVEL 6 · CLIENTES Y GOBERNANZA
   quality_customer_profiles · segmentos · programas
   encuestas (plantilla → versión → campaña → respuesta → respuestas)
   metodologías de satisfacción · resultados · retroalimentación
   quality_management_reviews (+ participantes, entradas, agenda, decisiones)
        │
        ▼
NIVEL 7 · AUTOMATIZACIÓN
   quality_alerts + alert_events
   quality_automation_rules (+ versiones, triggers, acciones, runs)
   quality_schedules
   quality_workflow_definitions (+ versiones, instancias, pasos)
   quality_notifications (+ entregas, preferencias)   ← requiere email saliente
   Transactional Outbox (MDR-28)
        │
        ▼
NIVEL 8 · COHERENCIA E IA
   quality_coherence_rules · runs · findings   (determinista primero)
   quality_ai_capabilities · prompts · versiones · runs · sources
   quality_ai_insights · quality_ai_proposals
```

---

## 5. Dependencias duras (no negociables)

| Dependencia | Motivo | Fuente |
|---|---|---|
| Cargo **antes** de propietario documental | El propietario debe ser un cargo, no una persona | D-17, MDR-33 |
| Cargo **antes** de competencias | La competencia requerida cuelga del cargo | PC-16, §9.1 |
| Procesos **antes** de caracterización | La caracterización se genera de datos de proceso | DA-13, D-29 |
| Procesos **antes** de actividades y flujos | Jerarquía estructural | §7.3, §22.4 |
| **Casos y Acciones antes de Auditorías** | Un hallazgo enlaza a un caso formal | AR-09, MDR-25 |
| **Casos y Acciones antes de No Conformidades** | La NC es una especialización del caso | AC-02, MDR-23 |
| Terceros **antes** de proveedores y clientes | Ambos son roles de la misma identidad | MDR-11, GP-02, VC-03 |
| Indicadores **antes** de eventos de desempeño | El evento nace de una medición contra meta | OI §10.1 |
| Riesgos **antes** de controles evaluables | La efectividad del control se valora contra el riesgo | RO-26 |
| Eventos **antes** de reglas | Una regla reacciona a un evento | §17.3 |
| Reglas **antes** de alertas automáticas | La alerta la produce una regla | AT-12, §27 |
| Dominios **antes** de revisión por la dirección | Las entradas salen de objetos reales | RD-02 |
| **Todo lo determinista antes de la IA** | La IA lee el sistema; sin sistema no hay qué leer | AT-25, AT-26, §2.4 |
| Vigencia de negocio **antes** de auditorías | El auditor resuelve criterios del periodo auditado | AR-05, AR-17 |
| Evidencia transversal **antes** de que cada dominio adjunte evidencia | Evita un cuarto motor | MDR-46 |

---

## 6. Lo que puede ir en paralelo

- **Nivel 3, 3' y 3''** — procesos, documentos y normativa no dependen entre sí en su primera
  iteración. Los vínculos entre ellos llegan después.
- **Nivel 5 completo** — riesgos, proveedores, desempeño, auditorías y personas·2 son paralelos
  una vez existe el núcleo de Casos y Acciones.
- **Evolución de TrazaDocs** puede empezar en cuanto exista Cargo, sin esperar a Procesos.

---

## 7. Lo que NO debe construirse todavía

Del baseline y del Maestro §88/§89, y de la propia lógica del grafo:

| Elemento | Motivo |
|---|---|
| Constructor de automatizaciones no-code libre | AT-35: primero automatizaciones parametrizadas seguras |
| Capa de IA | AT-25: el núcleo debe operar sin IA; y no hay sistema que leer todavía |
| Coherencia semántica asistida por IA | Primero la determinista (§18) |
| Portal externo de proveedor | GP-28 |
| Notificaciones multicanal | No existe infraestructura de email saliente |
| BPMN completo | DA-09: primero notación funcional nativa simple |
| Cascada rígida de objetivos | OI-02 |
| Versión anual artificial de riesgos | RO-35 |
| Tablas por numeral ISO | §34, MDR-01 — prohibido siempre |
| Segundo motor documental | §34, D-16 — prohibido siempre |
| Tercer motor de evidencia | MDR-46 — prohibido siempre |

---

## 8. Coste de invertir el orden

| Si se construye antes… | Consecuencia |
|---|---|
| Auditorías antes que Casos | Los hallazgos nacen como entidad propia y luego hay que migrarlos a casos, rompiendo AR-09 y MDR-25 |
| Documentos antes que Cargo | `owner_id` apunta a personas y hay que migrar cada documento al cambiar de titular |
| Cualquier dominio antes de decidir la vigencia | Ninguna entidad puede responder por fecha efectiva; migración transversal posterior |
| Evidencia por dominio antes que la transversal | Tercer, cuarto y quinto motor de evidencia |
| Alertas antes que eventos | Alertas generadas por consulta directa, sin deduplicación ni linaje (AT-13) |
| IA antes que el modelo determinista | La IA no tiene hechos estructurados que citar; se cae en AT-20 |

---

## 9. Primer corte vertical recomendado

El baseline §37 propone:

```text
ORGANIZACIÓN → PROCESO → MAPA → CARGO PROPIETARIO → RELACIÓN DOCUMENTAL → INDICADOR → ALERTA
```

Ese corte atraviesa los niveles 1 a 7 y es **demasiado ancho para un primer sprint** en este
repositorio, porque exige levantar el motor de eventos y alertas —que no existe— solo para cerrar
el extremo final.

Propuesta concreta y justificada en `Q0_IMPLEMENTATION_ROADMAP.md` §4.
