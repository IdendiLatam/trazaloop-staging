# QUALITY-04 · Informe de implementación

**Casos, hallazgos, no conformidades, correcciones y acciones.**

| | |
|---|---|
| Rama | `feature/quality-04-cases-actions` |
| Base | `e0afadf` — QUALITY-03 + 03.1 + 03.1a + hotfix de módulos |
| Migración | `0121_work_cases_and_actions_engine.sql` |
| Pruebas propias | **63** (30 puras · 33 base real) |
| Regresión local | `test:all` **exit 0** · 1 999 comprobaciones |
| Staging | `qchzkxbnbqeyuxinipln` · 0120 → **0121** |
| Production | **intacta** |

---

## 1. Lo que este sprint NO es

No es un CRUD de No Conformidades. Las decisiones AC-01…AC-35 están congeladas y
describen otra cosa: un **contenedor de gestión común con especializaciones
semánticas** (AC-02) y **un solo motor de acciones** (AC-01) que reutilizarán
Auditorías, Voz del Cliente, Proveedores, Riesgos y la Revisión por la Dirección.

Por eso el prefijo es `work_`, como `work_tasks`/`work_alerts`/`work_events` de
0116, y no `quality_`. Quality-04 construye la primera experiencia sobre el
motor; **el motor no es de Quality**.

## 2. Las separaciones

```
CASO ≠ HALLAZGO ≠ NO CONFORMIDAD ≠ CORRECCIÓN ≠ ACCIÓN CORRECTIVA
     ≠ ACCIÓN DE MEJORA ≠ TAREA
```

- Un **hallazgo** es un hecho observado que pide evaluación (AC-03). Puede
  terminar en observación, en mejora o en nada.
- La **no conformidad** es una **decisión humana**, no un estado derivado
  (AC-04).
- **Contención**, **corrección** y **acción correctiva** son tres cosas (AC-05,
  AC-06): detener el daño, arreglar lo que se rompió, impedir que se repita.
  Confundir las dos últimas es el error clásico: se arregla el documento
  vencido, se cierra la NC, y seis meses después vuelve a vencerse porque nadie
  tocó el control que lo permitió.
- Una **acción** es un compromiso de gestión; una **tarea** es la unidad
  operativa que ayuda a ejecutarla. Una acción **produce** tareas; no se guarda
  como una.

Y la que más se incumple en los sistemas reales:

```
COMPLETADA ≠ CERRADA ≠ EFICAZ   (AC-13)
```

«closed = success» es la mentira que hace que los planes de acción no valgan
nada. Aquí una acción completada con verificación pendiente **no** se da por
terminada, y una verificación negativa se conserva.

## 3. Señal ≠ caso ≠ no conformidad (AC-04)

QUALITY-03 ya emite eventos, alertas y tareas cuando un indicador queda fuera de
meta. **Nada de eso se convierte en caso solo**: alguien con autoridad decide
crear el caso desde la señal, y el caso la **referencia** en vez de copiarla.

Un indicador por debajo de la meta puede ser una variación puntual, un cambio de
método o un error de captura. Llamarlo automáticamente «no conformidad»
sustituye el juicio de una persona por una comparación aritmética, y devalúa las
no conformidades de verdad.

**Verificado con 82 frente a meta 95:** el contador queda en 0 al medir (`A1`),
en 0 al crear el caso (`A2`), en 0 al evaluarlo como observación (`A3`), y sube
a 1 **solo** al formalizar una NC (`B3`).

## 4. Cumplimiento AC-01…AC-35

| | Decisión | Estado |
|---|---|---|
| AC-01 | Un motor de acciones transversal | ✅ `work_actions`, una tabla, cuatro tipos |
| AC-02 | Caso común con especializaciones | ✅ `work_cases.case_type`, siete valores |
| AC-03 | Hallazgo ≠ no conformidad | ✅ `work_case_findings` aparte de la clasificación |
| AC-04 | Las señales no crean NC automática | ✅ `A1`–`A3`; acto explícito en la interfaz |
| AC-05 | Corrección ≠ acción correctiva | ✅ `action_kind`, con explicación propia |
| AC-06 | Contención ≠ corrección ≠ correctiva | ✅ los tres tipos existen |
| AC-07 | Salida no conforme no exige siempre correctiva | ✅ la exigencia de causa/correctiva solo aplica a NC |
| AC-08 | Profundidad proporcional | ✅ el cierre condiciona distinto según clasificación |
| AC-09 | La IA detecta, el humano clasifica | ⛔ **fuera de alcance** — este sprint no incorpora IA |
| AC-10 | Hipótesis ≠ causa validada | ✅ `hypothesis` / `validated_cause`; `B6`, `B7` |
| AC-11 | La IA no determina la causa raíz | ⛔ **fuera de alcance** |
| AC-12 | Una acción puede tener varios orígenes | ✅ `work_references` con `owner_kind='action'` |
| AC-13 | Completada ≠ cerrada | ✅ `status`, `effectiveness_result` y `closed_at` separados; `B10` |
| AC-14 | Las acciones observan eventos del dominio | ⚠️ **parcial** — el barrido deriva atrasos; no hay suscripción a eventos |
| AC-15 | Las prórrogas preservan la fecha original | ✅ `original_due_on`, `extension_count` |
| AC-16 | El criterio de eficacia se define antes | ✅ CHECK; `B9` |
| AC-17 | Una eficacia negativa puede reabrir el análisis | ✅ `B12` |
| AC-18 | La elegibilidad de cierre se determina; el cierre es humano | ✅ `work_case_closure_eligibility`; `B5`, `B15` |
| AC-19 | Reabrir preserva el cierre anterior | ✅ `B17` |
| AC-20 | La mejora puede nacer sin NC previa | ✅ clasificación y tipo de acción propios |
| AC-21 | Auditoría y Quality comparten hallazgos y acciones | ✅ **por arquitectura** — el motor es `work_`; Auditorías no se implementa |
| AC-22 | Las decisiones formales son inmutables | ✅ `work_decisions` append-only; `B4`, `B13` |
| AC-23 | Alertas con agrupación, prioridad, deduplicación y escalamiento | ⚠️ **parcial** — prioridad y deduplicación sí; **agrupación y escalamiento no** |
| AC-24 | Los criterios objetivos pueden evaluarse automáticamente | ⚠️ **parcial** — el criterio se declara; la evaluación automática queda preparada, no implementada |
| AC-25 | La IA no aprueba causa, eficacia ni cierre | ✅ **estructuralmente** — solo personas con rol lo hacen |
| AC-26 | Acciones con dependencias y ejecución paralela | ⛔ **no implementado** — el modelo no impide añadirlas; §64 pide no construir un gestor de proyectos |
| AC-27 | La corrección de salida no conforme preserva evidencia y disposición | ⚠️ **parcial** — el tipo de caso existe; la disposición formal de producto no |
| AC-28 | Las concesiones son decisiones formales trazables | ⚠️ **parcial** — `decision_kind = 'concession'` existe; no hay pantalla |
| AC-29 | La recurrencia eleva la necesidad de análisis sin reclasificar | ⛔ **no implementado** — requiere detección de patrones |
| AC-30 | Los cambios que causan las acciones los ejecutan sus dominios | ✅ **por diseño** — una acción referencia; no muta otros dominios |
| AC-31 | Los datos históricos importados pueden ser parciales | ✅ nada obliga a inventar campos ausentes |
| AC-32 | Quality detecta patrones sistémicos entre casos | ⛔ **no implementado** |
| AC-33 | Las oportunidades se priorizan y se convierten en iniciativas | ⚠️ **parcial** — clasificación y prioridad sí; iniciativas no |
| AC-34 | Las mejoras implantadas evalúan el beneficio | ⚠️ **parcial** — la verificación de eficacia sirve; no hay beneficio cuantificado |
| AC-35 | Este dominio alimenta la revisión por la dirección | ⚠️ **parcial** — los datos y la vista están; no hay pantalla de revisión |

**Resumen: 18 completas · 9 parciales · 8 no implementadas o fuera de alcance.**

Las ocho últimas corresponden a dominios que el encargo prohíbe abrir aquí (IA,
auditorías, patrones, dependencias de acciones) o a capas de análisis que
requieren su propio sprint. Están declaradas, no disimuladas.

## 5. Un defecto propio, encontrado por la suite

**Faltaba la guarda de borrado.** `work_decisions.subject_id` es genérico —apunta
a casos **y** a acciones— y por eso no tiene FK al caso. Sin puerta, borrar un
caso habría dejado su acta huérfana, y una **no conformidad formalizada se podía
destruir**.

La prueba `X8` lo puso en rojo antes de llegar a Staging. §18 de 0121 lo cierra
con el mismo patrón de QUALITY-03.1: dictamen + disparador `BEFORE DELETE`,
aplicado también al administrador.

## 6. Entregables

| Documento | Qué contiene |
|---|---|
| `QUALITY_04_IMPLEMENTATION_REPORT.md` | este documento |
| `QUALITY_04_DATA_MODEL.md` | las nueve tablas y por qué el prefijo es `work_` |
| `QUALITY_04_CASE_WORKFLOW.md` | el ciclo, la evaluación, el cierre condicionado y la reapertura |
| `QUALITY_04_ACTION_ENGINE.md` | el motor único, acción ≠ tarea, prórrogas y eficacia |
| `QUALITY_04_LIFECYCLE.md` | dónde está la frontera histórica de cada entidad |
| `QUALITY_04_RLS_SECURITY.md` | las dos clases de escritura y los ataques comprobados |
| `QUALITY_04_TEST_MATRIX.md` | las 63 pruebas propias y la regresión |
| `QUALITY_04_STAGING_VALIDATION.md` | despliegue, navegador, Preview y Production |
| `QUALITY_04_ROLLBACK.md` | los dos niveles de reversión |
