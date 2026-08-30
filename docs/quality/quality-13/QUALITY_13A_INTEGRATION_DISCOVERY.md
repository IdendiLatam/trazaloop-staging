# QUALITY-13A · DESCUBRIMIENTO DE INTEGRACIÓN

**Solo análisis.** Ni migración, ni código, ni despliegue.
Local **0151** · Staging **0151** · Production **0111**.

Todo lo que sigue está leído del repositorio y de la base, no de la documentación
anterior. Cuando un dato viene de un catálogo, se dice de cuál.

---

## 1 · Lo que hay

Trece dominios implementados, 143 migraciones, **115 exportaciones PDF** de Quality,
**24 fuentes de Intelligence**, **21 fuentes de automatización**, **15 entradas** de
Revisión por la Dirección, **12 grupos** de menú y ~38 destinos.

No es un producto incompleto: es un producto **completo por dominios** cuya integración
transversal está a medias. Ese es exactamente el problema que QUALITY-13 tiene que
resolver, y conviene decirlo así antes de listar huecos, porque la lista es larga y
puede leerse como si nada funcionara.

---

## 2 · Los tres tejidos transversales que YA existen

Antes de proponer nada nuevo hay que reconocer lo que ya conecta:

**`work_references`** — 32 tipos de propietario y 44 de destino. Es el tejido de
contexto: de aquí nació, esto lo respalda, esto viene al caso.

**`work_cases` / `work_actions`** — el motor único de trabajo correctivo. Diez tablas
de dominio apuntan a él: hallazgos de auditoría, retroalimentación de clientes,
materializaciones de riesgo, incidentes de proveedor, lecciones, señales de dos
dominios.

**`work_events`** — 96 tipos de hecho, con `dedupe_key`. Es el bus, y lo escribe solo
la base.

Más dos catálogos de plataforma: `quality_ai_sources` (Intelligence) y
`quality_automation_sources` + `_event_contracts` (automatización).

**Conclusión temprana y importante: no falta tejido. Falta usarlo en los dos sentidos.**

---

## 3 · El hallazgo mayor · el eje de proceso está a medio tender

Veinticinco tablas tienen clave foránea a `quality_processes`:

```
indicadores · objetivos(processes) · riesgos(processes) · oportunidades(processes)
casos(processes) · hallazgos de auditoría · alcance y agenda de auditoría
competencias requeridas · conocimiento · lecciones · documentos del proceso
entradas/salidas · interacciones · mapa · revisiones
requisitos de partes interesadas → proceso
```

Es decir: **la mitad del sistema ya sabe a qué proceso pertenece**. Y sin embargo:

- **no existe ni una vista `v_quality_process_*`** —todos los demás dominios tienen su
  `v_quality_*_overview`; los procesos no—;
- la ficha de proceso muestra identidad, propósito, entradas/salidas, relaciones,
  documentos e historial de revisiones, y **nada más**: ni riesgos, ni indicadores, ni
  hallazgos, ni casos, ni requisitos de partes interesadas, aunque todos ellos guarden
  su `process_id`;
- `work_references.owner_kind` **no incluye `process`**: un proceso puede ser
  *referenciado*, pero no puede *referenciar*.

La pregunta «¿qué significa esto para el proceso X?» tiene respuesta en la base y **no
tiene respuesta en la pantalla**.

Cinco dominios no tienen relación con proceso y **no deberían tenerla forzada**:
proveedores, clientes, partes interesadas, revisión por la dirección y personas. Su
vínculo con el proceso es indirecto y ya está modelado donde corresponde —el requisito
de una parte interesada sí apunta a procesos; el proveedor lo hace a través de lo que
suministra—. Forzar un `process_id` ahí sería inventar una relación.

---

## 4 · El segundo hallazgo · cinco verdades sobre «qué requiere atención»

Existen **cinco mecanismos** que responden a la misma pregunta:

| Mecanismo | Qué es | Quién lo escribe |
|---|---|---|
| `quality_signals` | señales de reglas (QUALITY-11) | el ejecutor único |
| `quality_risk_signals` | señales del dominio de riesgos | barrido propio |
| `quality_supplier_signals` | señales de proveedores | barrido propio |
| `quality_customer_signals` | señales de voz del cliente | barrido propio |
| `quality_knowledge_signals` | señales de conocimiento | barrido propio |

Más `work_alerts` y `work_tasks` como salidas, y **ocho barridos heredados**
(`quality_scan_audits`, `_customer_voice`, `_management_reviews`, `_people_signals`,
`_pending_measurements`, `_risk_reviews`, `_supplier_reviews`, `work_scan_pending_actions`).

**La convergencia ya está diseñada y casi sin usar.** QUALITY-11.1 añadió
`quality_automation_rules.supersedes_observer`: una regla adoptada **calla** al barrido
heredado que releva. Hoy solo **dos** plantillas lo declaran —`indicator_measurement_due`
y `action_overdue`—. Los otros seis barridos siguen corriendo en paralelo al motor.

Esto no es un fallo: es una migración a medias, con el mecanismo ya construido. Y es la
causa raíz del riesgo de **doble conteo** que el encargo teme para la portada.

### 4.bis · El mapa de convergencia, pieza por pieza (QI-27)

Antes de tocar nada hay que saber qué es cada cosa. Esta tabla es el inventario que
QI-27 exige, y es la referencia para el tramo de convergencia.

| Mecanismo | Qué es | Estado | Destino |
|---|---|---|---|
| `quality_signals` | **fuente de verdad** de la observación por reglas | vigente | se queda; es el destino de todo lo demás |
| `quality_automation_rules` + versiones | **observadores** declarados por la empresa | vigente | se queda |
| `quality_risk_signals` | señales del dominio de riesgos | **barrido heredado** | relevar con plantilla equivalente |
| `quality_supplier_signals` | señales de proveedores | **barrido heredado** | relevar |
| `quality_customer_signals` | señales de voz del cliente | **barrido heredado** | relevar |
| `quality_knowledge_signals` | señales de conocimiento | **barrido heredado** | relevar |
| `quality_scan_pending_measurements` | barrido de mediciones pendientes | **relevado** por `indicator_measurement_due` | hecho |
| `work_scan_pending_actions` | barrido de acciones vencidas | **relevado** por `action_overdue` | hecho |
| `quality_scan_audits` | barrido de auditorías | **barrido heredado** | relevar |
| `quality_scan_customer_voice` | barrido de voz del cliente | **barrido heredado** | relevar |
| `quality_scan_management_reviews` | barrido de revisión por la dirección | **barrido heredado** | relevar |
| `quality_scan_people_signals` | barrido de personas | **barrido heredado** | relevar |
| `quality_scan_risk_reviews` | barrido de revisiones de riesgo | **barrido heredado** | relevar |
| `quality_scan_supplier_reviews` | barrido de reevaluaciones | **barrido heredado** | relevar |
| `work_alerts` / `work_tasks` | **salidas**, no fuentes | vigente | se quedan |

**Regla de compatibilidad, congelada en QI-27:** ningún barrido se borra. Se releva con
`supersedes_observer`, se comprueba contra lo que emitía, y solo después se plantea
retirarlo. Una empresa que no adopte la plantilla equivalente tiene que seguir recibiendo
exactamente lo mismo que recibía.

---

## 5 · Portada de Quality · qué hace hoy

`app/(app)/(shell)/quality/page.tsx` (598 líneas) ya tiene **diez bloques de atención**
—pendientes para ti, desempeño, riesgos, personas, proveedores, voz del cliente,
requieren atención, revisión por la dirección, auditorías, casos— y **siete tarjetas**
de navegación.

No es «cuántos formularios hay»: ya pregunta qué requiere atención. Lo que le pasa es
otra cosa:

1. **Falta Contexto.** No hay una sola línea de partes interesadas, el dominio más
   reciente. `getInterestedPartiesHomeSignals` no existe.
2. **Doce llamadas en paralelo**, una por dominio, cada una con su forma de contar. No
   hay un contrato común: si dos cuentan el mismo problema, la portada lo enseña dos
   veces sin saberlo.
3. **Sin trazabilidad al origen** más allá del enlace al módulo: dice «3 vencidas», no
   *cuáles*.
4. Una tarjeta se titula «Desempeño» y hay otra entrada «Desempeño» dentro de Personas
   (evaluación de desempeño). Dos cosas distintas con el mismo nombre.

---

## 6 · Revisión por la Dirección · el mejor integrador que ya existe

Quince entradas de catálogo, **todas con constructor determinista en SQL** y ninguna
dependiente de IA. Cubre: acciones previas, cambios, desempeño del sistema, voz del
cliente, objetivos, procesos, conformidad del producto, no conformidades, seguimiento y
medición, auditorías, proveedores, recursos, eficacia del tratamiento de riesgos,
oportunidades de mejora y partes interesadas.

**Es, de largo, la integración más fuerte del sistema.** Y sugiere la respuesta a una
pregunta del encargo: el «informe integrado de Quality» probablemente **ya existe** y se
llama Revisión por la Dirección.

Lo que le falta: nada estructural. Falta que lo que la revisión ya sabe reunir esté
también disponible **fuera** de una revisión abierta, que es justo lo que pide la
portada y el mirador de proceso.

---

## 7 · Intelligence · cobertura y huecos

24 fuentes registradas con su clase de privacidad y su modo temporal. La cobertura de
dominio es casi total —incluye proceso, cargo, evidencia, tarea y perfil de empresa—.

Modo temporal declarado, que es el mapa real de verdad histórica del producto:

| `as_of` | `period` | `current` |
|---|---|---|
| proceso, revisión de documento, indicador, riesgo, revisión por la dirección, cargo, parte interesada, estrategia | objetivo, caso, acción, proveedor, métricas y comentarios de cliente, retroalimentación, auditoría | control, competencia, conocimiento, señal, regla, tarea, evidencia, perfil |

Huecos:

- **Ninguna fuente cruza dominios.** Cada adaptador lee lo suyo; no hay una que
  responda «qué procesos concentran riesgos y acciones abiertas», porque eso exige
  cruzar dos fuentes y el paquete de contexto no compone.
- La clase `restricted` de auditoría y revisión por la dirección es correcta y está bien
  aplicada. La `anonymous` de encuestas también: **ninguna integración de partes
  interesadas puede desanonimizar una respuesta**, y hoy no lo hace.

---

## 8 · Automatización · cobertura

21 fuentes en 12 dominios. **Ninguna para procesos**: no se puede escribir «proceso sin
cargo propietario» ni «proceso con revisión vencida» como regla, aunque el dato exista.

Contratos: 21 sujetos mapeados, todos `direct` salvo la evaluación de proveedor. Sin
contratos huérfanos y sin eventos duplicados.

Eventos catalogados que **nadie consume**: la mayoría de los 96 tipos de `work_events`
no tienen regla por evento posible, porque solo cinco fuentes admiten `event`
—indicador, caso, acción, retroalimentación y las tres de partes interesadas—. No es un
error: es superficie sin explotar.

---

## 9 · Personas y cargos

Regla cumplida en todo lo nuevo: 33 tablas apuntan a `quality_positions`, y las que
guardan responsabilidad guardan **cargo**. `quality_development_plan_items` guarda
`person_id` **y** `position_id`, lo cual es correcto ahí: un plan de desarrollo es de
una persona.

No se encontró ni un `owner` de texto libre ni un `user_id` como responsable en el
dominio de Quality.

Lo que falta es la vista inversa: **no existe** «este cargo responde de estos procesos,
estos riesgos, estas estrategias, estas acciones y estas auditorías». Los datos están;
la pantalla no.

---

## 10 · Semánticas de acción paralelas

`work_cases`/`work_actions` es el motor único, y diez tablas lo usan. Dos candidatos a
duplicación, examinados uno por uno:

- **`quality_risk_treatment_plans`** — NO es una lista de acciones: es la *decisión* de
  tratamiento (estrategia, justificación, aprobación, vigencia). Las acciones del
  tratamiento van a `work_actions`. **Correcto.**
- **`quality_development_plan_items`** — sí tiene semántica de tarea propia (título,
  responsable, fecha objetivo, estado) y **no** pasa por `work_actions`. Es defendible
  —desarrollar a alguien no es una acción correctiva— pero hay que decidirlo
  explícitamente, no dejarlo por omisión.

---

## 11 · Documentos y evidencia

Un solo motor documental (TrazaDocs) y un solo sistema de evidencia por referencias.
`quality_audit_evidence`, `quality_competency_evidence` y `quality_measurement_evidence`
son **enlaces** desde su dominio, no almacenes paralelos. No se encontró ningún tercer
motor.

`evidences` / `evidence_links` y `textile_evidences` son de PCR y Textiles, fuera de
Quality.

---

## 12 · Independencia de módulo

**Cero referencias** a `/traceability` o `/textiles` en las rutas y componentes de
Quality. La independencia está limpia hoy, y hay pruebas que la vigilan en el dominio
más reciente. QUALITY-13 tiene que mantenerla, y es fácil romperla al construir una
portada que «resuma todo».

---

## 13 · Ayuda contextual

El botón «i» compartido (`SectionHint`) se usa en **exactamente un dominio de Quality**:
partes interesadas, con las once ayudas de B3B. Fuera de ahí solo lo usan los editores
de TrazaDocs con contenido administrado.

Los demás dominios explican con párrafos en pantalla —bien escritos, pero sin el patrón
común y sin ejemplo ni respaldo—. Es el inventario que el sprint transversal necesita, y
está en `QUALITY_13A_NAVIGATION_AND_UX_ARCHITECTURE.md`.

---

## 14 · Terminología

El glosario ya está vigilado por prueba: «empresa», nunca «organización» visible. Lo que
sí aparece es una colisión de producto: **«Desempeño»** nombra dos cosas —el grupo de
objetivos e indicadores, y la evaluación de desempeño de personas—.

Y una tercera cosa que conviene decidir de una vez: «análisis», «evaluación» y
«valoración» se usan en dominios distintos para operaciones parecidas.
