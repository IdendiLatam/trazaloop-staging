# Q0_IMPLEMENTATION_ROADMAP

**Sprint:** Q0 — Technical Discovery & Schema Mapping
**Fecha:** 2026-08-18
**Naturaleza:** propuesta. **No implementada, no aprobada.** Requiere decisión humana.

---

## 1. Principios que gobiernan este roadmap

1. **Cortes verticales, no tablas sueltas** (§37): nada se acepta sin esquema + RLS + autorización
   de servidor + UI + reglas de historial + pruebas + rollback entendido.
2. **Orden por dependencias, no por menú** (MDR-39).
3. **Evolución, no reescritura** (Maestro §53): reutilizar, evolucionar, adaptar; crear solo lo
   que no existe.
4. **Sin romper lo existente** (Maestro §91): PCR, Textiles, TrazaDocs, auth, planes y Storage
   siguen funcionando, con pruebas de regresión.
5. **Migraciones aditivas** con rollback documentado (Maestro §55, §38 del baseline).
6. **La IA al final** (AT-25): el núcleo debe operar sin ella.

---

## 2. Fase Q1 — Decisiones de modelo (sin código)

**Antes de la primera migración.** Las cuatro decisiones transversales del grafo contaminan cada
tabla posterior; tomarlas tarde obliga a migrar todo lo anterior.

| Decisión | Referencia |
|---|---|
| **D-a** Patrón de vigencia de negocio (`effective_from`/`effective_to`) y qué entidades lo llevan | MDR-07, MDR-44 |
| **D-b** Modelo de Cargo y su relación con Persona y Usuario | MDR-33, PC-03, PC-05 |
| **D-c** Estrategia de unificación de evidencia | MDR-46, MDR-12, MDR-50 |
| **D-d** Separación de historial técnico y de negocio | MDR-35 |
| **D-e** Modelo de capacidad y alcance sobre los 3 roles actuales, sin romper compatibilidad | MDR-34, Maestro §20 |

**Entregable:** un documento de decisiones de modelo aprobado. Sin código, sin migraciones.

---

## 3. Fase Q2 — Fundación Quality

**Objetivo:** que Quality exista como módulo y tenga su fundación transversal, sin dominio todavía.

| Bloque | Contenido |
|---|---|
| Activación del módulo | `modules.is_functional` + `lib/modules/catalog.ts` → `functional`; guard `requireQualityModule()` siguiendo el patrón exacto de `require-textiles-module.ts`; entrada en el selector `/modules` |
| Terceros | `quality_external_parties` + roles + contactos + sedes |
| Relaciones | `quality_relations` (grafo semántico secundario) |
| Enlaces a fuentes | `quality_source_links` (referencia a PCR/Textiles, nunca copia) |
| Eventos | `quality_events` append-only + outbox transaccional |
| Evidencia | ejecución de la decisión **D-c** |
| Autorización | capacidades y alcances (**D-e**) |

**Criterio de aceptación:** una empresa puede tener Quality en Demo/Full/Extra, el guard bloquea
correctamente, y existe la fundación. Sin pantallas de dominio.

**Riesgo:** es un sprint de fontanería con poco valor visible. Es inevitable y debe comunicarse
como tal; intentar saltárselo es exactamente lo que produce el rehecho.

---

## 4. Fase Q3 — Primer corte vertical

**Recomendación:** un corte **más estrecho** que el del baseline §37, que exige levantar el motor
de alertas solo para cerrar el extremo final.

```text
ORGANIZACIÓN
   → CARGO (quality_positions + asignaciones históricas)
   → PROCESO (quality_processes + versiones)
   → MAPA DE PROCESOS publicado y versionado
   → PROPIETARIO DEL PROCESO = CARGO
   → RELACIÓN PROCESO ↔ DOCUMENTO (TrazaDocs con module_key='quality')
```

**Por qué este corte y no el del baseline:**

- Ejercita las cuatro decisiones transversales sobre entidades reales, que es lo que valida si son
  correctas.
- Toca TrazaDocs, que es el punto de reutilización más importante y el de mayor riesgo si se
  equivoca.
- Produce valor observable inmediato: una organización puede dibujar su mapa de procesos con
  propietarios reales y documentos vinculados. Eso ya es un producto.
- **No** obliga a construir eventos, reglas ni alertas todavía.

**Se deja fuera deliberadamente** (frente al §37): indicador y alerta. Llegan en Q4, cuando el
motor de eventos tenga algo real que observar.

**Criterio de aceptación** (§37 completo): esquema + RLS + autorización de servidor + UI +
reglas de historial y versión + pruebas de aislamiento multiempresa + rollback entendido.

---

## 5. Fases posteriores (orden, sin estimaciones)

| Fase | Contenido | Depende de |
|---|---|---|
| **Q4** | Objetivos, indicadores, metas, mediciones, linaje, eventos de desempeño | Q3 |
| **Q5** | Núcleo transversal: Casos + Acciones + análisis de causa + eficacia | Q2, Q3 |
| **Q6** | Riesgos, controles, valoraciones, señales, oportunidades | Q5 |
| **Q7** | Proveedores (ciclo completo) | Q2 (terceros), Q5 |
| **Q8** | Auditorías, con núcleo compartido con Trazaloop Audit | **Q5 obligatorio** |
| **Q9** | Personas·2: competencias, evaluaciones, desarrollo, conocimiento | Q3 (cargo) |
| **Q10** | Clientes, encuestas, satisfacción, quejas | Q2, Q5 |
| **Q11** | Revisión por la dirección | Q4–Q10 |
| **Q12** | Automatización: reglas, alertas, tareas, workflow, notificaciones | Q2 (eventos) |
| **Q13** | Coherencia determinista | Q3–Q12 |
| **Q14** | IA: recuperación, ejecuciones, insights, propuestas | Todo lo anterior |

**Q5 es el cuello de botella del roadmap:** cuatro fases posteriores dependen de él. Adelantarlo
respecto de Q4 es una alternativa defendible si se prioriza No Conformidades sobre desempeño.
→ **DR-09**.

---

## 6. Restricciones de producción

Todas heredadas y no negociables:

- Migraciones **aditivas**, nunca editar una desplegada (Maestro §55).
- Rollback documentado en el encabezado de cada migración.
- RLS verificada en cada tabla nueva; pruebas *A ve A, A no ve B, A no edita B* (Maestro §59).
- Pruebas de permisos por capacidad; ocultar un botón no es prueba de seguridad (Maestro §60).
- Pruebas de histórico: versión vigente hoy y versión vigente en fecha pasada (Maestro §61).
- Regresión de PCR, Textiles, TrazaDocs, auth, planes y Storage en cada sprint (Maestro §91).
- Secuencia de producción: implementación → test → chequeo de seguridad → plan de migración →
  deploy → smoke → rollback listo (§38).
- `trazaloop.com` es un sistema real (Maestro §56).

---

## 7. Riesgos del roadmap

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Q2 percibido como "sprint sin valor" y recortado | Alto — arrastra rehecho en todas las fases | Comunicar que es fundación; medir su cierre por invariantes, no por pantallas |
| Decidir la evidencia tarde | Alto | D-c en Q1, ejecutada en Q2 |
| Construir Auditorías antes que Casos | Alto | Dependencia dura declarada; Q8 después de Q5 |
| Crear un segundo motor documental | Alto | D-16 congelada; vigilar con prueba estática |
| Ampliar el alcance de Q3 | Medio | Frontera dura escrita; indicador y alerta quedan fuera |
| Quality rompe PCR/Textiles al evolucionar TrazaDocs | Medio | `module_key` ya aísla; regresión obligatoria |
| El rol `quality` genera ambigüedad | Bajo | Documentar; no renombrar (MDR-38) |

---

## 8. Lo que este roadmap NO decide

- Fechas y estimaciones.
- Asignación de personas.
- Diseño de UI.
- Contenido semilla (estructuras documentales, catálogos de competencias, metodologías de riesgo).
- Interpretación normativa concreta de ISO 9001:2026 — el Maestro §83 exige verificar la edición
  vigente en fuentes oficiales antes de implementar comportamiento normativo.

---

## 9. Decisiones requeridas antes de implementar

| ID | Decisión | Bloquea |
|---|---|---|
| **DR-01** | Confirmar el esquema real contra Supabase: ¿están las 102 migraciones aplicadas?, ¿existen objetos creados fuera de migración?, ¿qué pasó con 0007–0014? | Toda migración nueva |
| **DR-02** | Confirmar `ACTIVE_ORG_COOKIE_SECRET` configurado en producción | Nada; higiene |
| **DR-03** | Modelo de capacidad y alcance sobre los 3 roles actuales; y qué hacer con la ambigüedad del rol `quality` | Q2 |
| **DR-04** | Futuro de `organization_subscriptions.plan_code`: ¿se marca explícitamente como legado o se retira de la consola? | Q2 |
| **DR-05** | Cuánta semántica documental (vigencia, revisión periódica, sustitución, documentos externos, workflow multi-actor) entra antes del primer corte | Q3 |
| **DR-06** | ¿Se implementa exportación PDF en servidor? Diverge hoy del documento de producto (H1.19) | Q3+ |
| **DR-07** | **Estrategia de unificación de evidencia.** La decisión de mayor coste diferido | Q2 |
| **DR-08** | ¿Se adoptan tipos generados de Supabase o se mantiene el tipado manual? Con ~120 tablas nuevas el criterio actual escala mal | Q2 |
| **DR-09** | Orden entre Q4 (desempeño) y Q5 (casos y acciones) | Q4/Q5 |
| **DR-10** | Alcance del primer corte vertical: ¿el propuesto en §4 o el del baseline §37 completo? | Q3 |
| **DR-11** | Corrección de los hallazgos de `Q0_SECURITY_AND_RLS_REVIEW.md`: ¿sprint propio antes de Quality o se arrastran? | Planificación |
| **DR-12** | ¿Se incorporan al repositorio los dos documentos de Arquitectura Técnica de la línea PCR que siguen en `~/Downloads`? | Contexto |

---

## 10. Estado al cierre de Q0

- Discovery completo, ocho entregables producidos.
- **Cero modificaciones** al código, esquema, migraciones, Supabase, Vercel, entorno o Storage.
- **Cero commits, cero push.**
- El Sprint Q1 no ha comenzado.
