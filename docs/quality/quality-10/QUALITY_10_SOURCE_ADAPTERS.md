# QUALITY-10 · Los adaptadores de fuente

Catorce funciones, una por entrada. Todas comparten cuatro propiedades que no
son negociables:

1. **Solo leen.** Ninguna escribe en su dominio de origen.
2. **Respetan el periodo.** No devuelven «el estado de hoy».
3. **Revalidan la pertenencia** con `is_org_member`, contra la sesión.
4. **Devuelven linaje.**

Y todas distinguen cero de sin dato: `available: false` significa «no hubo
medición», no «midió cero».

## El despachador

`quality_mr_source_payload(org, code, from, to, review_id)` es la única puerta.
Comprueba la pertenencia **primero** y devuelve `null` para quien no es miembro
—igual que para un código inventado—.

## Los catorce

| Entrada | Función | Qué lee | Qué NO hace |
|---|---|---|---|
| Acciones anteriores | `quality_mr_src_previous_actions` | Revisiones cerradas con periodo anterior → sus decisiones → `work_references` → `work_actions` | No copia ni duplica las acciones |
| Cambios | `quality_mr_src_changes` | Revisiones de documento y de proceso con vigencia en el periodo | No lista 500 documentos porque existan |
| Desempeño del sistema | `quality_mr_src_system_performance` | Agrega las demás | No añade ningún dato nuevo |
| Voz del cliente | `quality_mr_src_customer_voice` | `v_quality_campaign_summary`, `v_quality_metric_series`, manifestaciones y señales | **No lee respuestas, invitaciones ni contactos** |
| Objetivos | `quality_mr_src_objectives` | `v_quality_objective_performance` solapado con el periodo | No inventa un porcentaje global |
| Procesos | `quality_mr_src_process_performance` | Por proceso: indicadores, casos, riesgos, auditorías | No fabrica un `process_score` |
| Conformidad de producto | `quality_mr_src_product_conformity` | Casos de salida no conforme y quejas | No afirma conformidad cuando no hay registro |
| No conformidades y acciones | `quality_mr_src_cases` | Casos, hallazgos, clasificación, acciones y eficacia | No los colapsa en «incidentes» |
| Seguimiento y medición | `quality_mr_src_monitoring` | Mediciones vigentes del periodo **con la meta de su configuración** | No convierte «sin dato» en cero |
| Auditorías | `quality_mr_src_audits` | Cobertura, ejecutadas, hallazgos, escaladas y NC formalizadas | No llama no conformidad a un hallazgo |
| Proveedores | `quality_mr_src_suppliers` | Criticidad, evaluaciones, aprobaciones, reevaluaciones, incidentes | No los reduce a «buenos y malos» |
| Recursos | `quality_mr_src_resources` | Personas, cargos vacantes, brechas, desempeño, conocimiento — **agregados** | No devuelve ni un nombre |
| Riesgos y oportunidades | `quality_mr_src_risks` | Riesgos sobre el criterio, materializaciones, controles, oportunidades | No crea riesgos ni oportunidades |
| Oportunidades de mejora | `quality_mr_src_improvement` | De Q05, de auditorías, de clientes y de casos | No crea acciones |

## Las tres funciones que más se podían torcer

### La voz del cliente

Es la más **estrecha** de las catorce, y a propósito. No aparecen en su cuerpo
`quality_survey_responses`, ni `quality_survey_answers`, ni
`quality_survey_invitations`, ni `quality_customer_contacts`. Lo que devuelve
son métricas de campaña, que ya nacieron agregadas, y conteos de
manifestaciones.

Y devuelve una `anonymity_note` que explica por qué no trae nombres, para que
quien lea el acta entienda que la ausencia es deliberada.

### El seguimiento y la medición

La meta se lee de `quality_indicator_configs` a través de
`quality_measurements.config_id` — es decir, **de la configuración con la que se
midió**, no del indicador de hoy. Es lo que hace que un 82 sobre 95 en 2027 siga
siendo 82/95 cuando en 2028 la meta sube a 98.

**Verificado** (`test:quality10-rls` C1–C4): con 82/95 en el año A y 90/98 en el
año B, la revisión del año A ve **una** medición, 82 sobre 95 — y refrescarla no
la contamina con el año B.

### Los recursos

Devuelve cuántos, nunca quiénes. Ni `full_name` ni `person_name` aparecen en su
cuerpo. La revisión por la dirección no es una evaluación de empleados, y los
nombres siguen detrás de los permisos de QUALITY-06.

## La preparación (§55, RD-03, RD-09)

`quality_mr_prepare_inputs(review_id)` recorre el catálogo, llama al
despachador y escribe las catorce instancias. Es idempotente sobre la clave
`(organización, revisión, código)` y su `do update`:

- actualiza el dato, el periodo, la fecha de preparación y la huella;
- **no menciona** `analysis`, `analysis_at`, `analysis_by`, `conclusion` ni
  `requires_decision`;
- respeta `not_applicable` y `reviewed`.

Esto es RD-09 —«Quality by Observation»— y es la diferencia entre una revisión
por la dirección y una plantilla de Word.

**Verificado** (`test:quality10-rls` A2): preparar devuelve 14, cada entrada
automática respeta el periodo, guarda huella y trae linaje, y los datos reales
—el caso del periodo, su clasificación— llegaron de verdad.
