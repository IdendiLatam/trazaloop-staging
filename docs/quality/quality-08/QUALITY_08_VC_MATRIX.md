# QUALITY-08 · Matriz VC-01 … VC-35

Cada decisión del conjunto congelado, con su estado y su evidencia. **No se
marca IMPLEMENTED por tener una tabla**: se marca cuando existe el
comportamiento y algo lo comprueba.

| VC | Decisión | Estado | Evidencia |
|---|---|---|---|
| **VC-01** | La satisfacción es multifuente | **IMPLEMENTED** | 4 `voice_source` · la manifestación no exige campaña · prueba C2 |
| **VC-02** | Quality no reemplaza CRM ni marketing | **IMPLEMENTED** | sin embudo, valor de cuenta, envío masivo ni seguimiento de apertura · pruebas R1, R2 |
| **VC-03** | El cliente es un papel del maestro de terceros | **IMPLEMENTED** | `quality_customer_profiles` sobre `quality_external_parties` · pruebas A1–A4 · RLS A1–A3 |
| **VC-04** | Relacional, periódica y transaccional | **IMPLEMENTED** | `voice_source` en campaña y manifestación · contexto transaccional referenciado · prueba C3 |
| **VC-05** | Existe un cierre anual formal de satisfacción | **IMPLEMENTED** | `quality_customer_voice_reviews` + `quality_close_customer_voice_review` · pruebas T1–T3 · RLS K1–K4 |
| **VC-06** | El cierre incluye revisar la metodología | **IMPLEMENTED** | `methodology_verdict` obligatorio al cerrar · prueba T2 · RLS K2 |
| **VC-07** | Las plantillas se versionan | **IMPLEMENTED** | `quality_survey_versions` con estructura congelada · pruebas D1–D5 · RLS B1–B5 |
| **VC-08** | Anónimo e identificado tienen tratamiento distinto | **IMPLEMENTED** | `anonymity_mode` estructural, guarda contra la campaña · bloque G (11) · RLS bloque F (8) |
| **VC-09** | Población, muestra, respuestas y cobertura son distintas | **IMPLEMENTED** | `population_size` · `invited_count` · `responses_count` · `response_rate` con su base · pruebas M1, M2 |
| **VC-10** | Resultado y cobertura son distintos | **IMPLEMENTED** | `value` junto a `sample_size`, `not_applicable` y `skipped` · pruebas J4, M3 |
| **VC-11** | Las respuestas cerradas son históricas | **IMPLEMENTED** | `quality_response_is_submitted` · pruebas I1–I4 · RLS J5 |
| **VC-12** | La metodología de cálculo es histórica | **IMPLEMENTED** | `method_snapshot` congelado e inmutable · prueba K6 · RLS D4 |
| **VC-13** | Quality no impone NPS, CSAT ni otra metodología | **IMPLEMENTED** | 6 métodos incluido `custom` · prueba K1 |
| **VC-14** | Las clasificaciones de IA son corregibles | **DEFERRED** | no se implementó IA (§47). La clasificación temática es HUMANA y editable, así que el requisito no tiene sujeto todavía. AT lo abordará |
| **VC-15** | La IA puede detectar, no crear quejas ni NC | **DEFERRED** | sin IA. La invariante que la haría segura —nada crea quejas ni NC automáticamente— ya está impuesta: pruebas N1–N4 |
| **VC-16** | Quejas y satisfacción son dominios distintos | **IMPLEMENTED** | `quality_customer_feedback` separada de campañas y métricas · pruebas N1, N5 |
| **VC-17** | Las señales de comportamiento no equivalen a satisfacción | **IMPLEMENTED** | `quality_customer_signals` no alimenta ninguna métrica · pruebas O1–O4 · RLS I1 |
| **VC-18** | La calidad por observación aplica a las señales del cliente | **IMPLEMENTED** | el barrido observa y avisa; no clasifica, no crea riesgos ni acciones · prueba O1 · RLS I1 |
| **VC-19** | Prioridad, agrupación y escalamiento | **PARTIAL** | hay gravedad, responsable por CARGO, estado, tareas y alertas del motor transversal. **No hay** agrupación de alertas relacionadas ni escalamiento por niveles: §59 lo excluye explícitamente |
| **VC-20** | La IA puede advertir de cobertura sin declarar representatividad | **PARTIAL, sin IA** | el sistema **nunca** declara representatividad: la tasa solo existe con denominador y se dice sobre qué base. La advertencia automática de sesgo queda para AT |
| **VC-21** | Las tendencias pueden contextualizarse con eventos | **PARTIAL** | los eventos existen (`work_events` con 8 tipos nuevos) y la serie lleva su periodo, pero la gráfica todavía no los superpone. El dato está; la vista no |
| **VC-22** | Una respuesta negativa no crea NC automáticamente | **IMPLEMENTED** | nada crea NC · pruebas N1–N3 · RLS H1–H3 |
| **VC-23** | Se preservan instrumentos, campañas, metodología, resultados y acciones | **IMPLEMENTED** | seis guardas de inmutabilidad · `QUALITY_08_HISTORICAL_TRUTH.md` |
| **VC-24** | La retroalimentación no puntúa empleados | **IMPLEMENTED** | ninguna tabla del dominio referencia `quality_people` ni `profiles` como sujeto evaluado · prueba R3 |
| **VC-25** | Se pueden importar resultados externos con su fuente | **PARTIAL** | `quality_survey_responses.source = 'imported'` y `source_note` existen y la RPC los admite; **no hay pantalla de importación**. El modelo está listo, el flujo no |
| **VC-26** | Plantilla, ejecución y resultados son objetos distintos | **IMPLEMENTED** | encuesta / versión / campaña / respuesta / resultado · pruebas D1, F1 |
| **VC-27** | Una plantilla sirve para varias campañas sin cambiar la historia | **IMPLEMENTED** | prueba F2 · RLS C1, C2 |
| **VC-28** | Los cálculos preservan linaje suficiente | **IMPLEMENTED** | `method_snapshot`, `distribution`, `sample_size` y `comparability_key` · prueba K6 |
| **VC-29** | Las respuestas anónimas minimizan información identificable | **IMPLEMENTED** | no la minimizan: **no la tienen**. `QUALITY_08_ANONYMITY.md` · bloque G · RLS bloque F |
| **VC-30** | Las quejas escalan a NC solo por regla o decisión | **IMPLEMENTED** | `quality_open_case_from_customer_feedback` abre SIN clasificar · prueba N3 · RLS H2, H3 |
| **VC-31** | Las felicitaciones son información gestionable | **IMPLEMENTED** | `compliment` es un tipo propio, se cuenta aparte y puede escalar a caso de tipo `issue` · prueba N5 · RLS H5 |
| **VC-32** | Los comentarios pueden relacionarse con procesos, proveedores, productos o servicios | **PARTIAL** | se relacionan con **temas** (`quality_customer_topics`) y con el caso que abran, que sí referencia proceso, producto o proveedor por `work_references`. La relación DIRECTA comentario→proceso no existe: se decidió no añadir una segunda taxonomía paralela a la de casos |
| **VC-33** | La IA distingue correlación, patrón e hipótesis causal | **DEFERRED** | sin IA. §47 lo excluye del alcance |
| **VC-34** | El dominio alimenta la revisión por la dirección | **IMPLEMENTED (preparado)** | el cierre del periodo congela su retrato y deja una `work_decision` con `subject_kind = 'customer_voice_review'`, consumible sin duplicar · §53 no pide implementar RD |
| **VC-35** | La integración con CRM/ERP/help desk evita duplicar | **PARTIAL** | la identidad externa transversal es el punto de anclaje y el puente con PCR existe. **No hay conectores**: quedan fuera del alcance, y el modelo no los presupone |

## Recuento

| Estado | VC |
|---|---|
| **IMPLEMENTED** | 24 |
| **PARTIAL** | 7 — VC-19, VC-20, VC-21, VC-25, VC-32, VC-35, y VC-34 en su forma «preparado» |
| **DEFERRED** | 3 — VC-14, VC-15, VC-33 (todos dependen de IA, excluida por §47) |
| **NOT_APPLICABLE** | 0 |

VC-34 se cuenta como IMPLEMENTED: lo que §53 pide es que RD pueda consumirlo sin
duplicación, y eso existe. Los siete PARTIAL están declarados con lo que falta y
por qué; ninguno es un olvido.
