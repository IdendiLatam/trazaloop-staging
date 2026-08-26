# QUALITY-06 · Addendum · lo que cerró QUALITY-06.1

**Este documento no reescribe nada.** El informe de QUALITY-06 dice lo que decía
el día que se cerró, con sus 111 PASS y sus 2 GAP, y así se queda: el registro
de un sprint es el registro de lo que pasó, no una versión conveniente.

Lo que sigue es lo que ocurrió **después**.

## Los dos gaps, cerrados

| Gap de QUALITY-06 | Criterio | Estado ahora | Dónde |
|---|---|---|---|
| Onboarding QMS sin pantalla propia | 56 | **CERRADO** | `QUALITY_06_1_ONBOARDING.md` |
| Contexto operacional de la evaluación | (§39, PC-28) | **CERRADO** | `QUALITY_06_1_EVALUATION_CONTEXT.md` |

## Efecto sobre la matriz PC-01…PC-28

| Decisión | Estado en Q06 | Estado tras Q06.1 | Por qué cambia |
|---|---|---|---|
| **PC-10** — onboarding/offboarding derivan de cargo, proceso, documentos, competencia y conocimiento | `PARTIAL` | **`IMPLEMENTED`** | El offboarding ya estaba completo. El onboarding tiene ahora pantalla, PDF y tres entradas, y deriva de las cinco fuentes que PC-10 nombra |
| **PC-28** — los datos operacionales apoyan la evaluación pero no la determinan | `IMPLEMENTED` | `IMPLEMENTED` | No cambia de estado, pero deja de estar implementado solo *por ausencia*: ahora existe el apoyo al evaluador, y la prohibición sigue comprobada —incluida una prueba negativa contra base real |

El tercer gap declarado en `QUALITY_06_PC_MATRIX.md` —**actividades de proceso**
(PC-04, PC-16)— **sigue abierto**, y es correcto que siga: el modelo de
*actividad* dentro de un proceso no existe en la plataforma. Los requisitos y las
funciones se enlazan al proceso, que es el nivel disponible. Es un gap de
arquitectura, no de este micro-sprint.

## Lo que NO cambió de QUALITY-06

- Las migraciones **0123** y **0124**, intactas. QUALITY-06.1 no añadió ninguna.
- Las 26 tablas, las 5 vistas y las políticas RLS, sin tocar.
- Las 21 exportaciones de Q06; Q06.1 añadió una, la 22.ª del dominio.
- Los tres círculos de privacidad: el onboarding y el contexto **se apoyan** en
  ellos, no los amplían.

## Una corrección que se mantiene

El informe de QUALITY-06 corrige un dato del encargo: Production no está en
0122, sino en **0111**. Sigue siendo cierto, y QUALITY-06.1 no ejecutó ningún
comando contra Production —ni de lectura— porque no había nada que verificar que
pudiera haber cambiado.
