# Experiencia de plataforma · dónde está cada cosa

Una sola página para no tener que abrir los cuarenta y nueve documentos de
`docs/platform-experience/`.

*Actualizado el 31 de agosto de 2026, al cierre de PE-02B6.*

---

## PE-01 · La entrada

| Tramo | Qué hizo | Estado |
|---|---|---|
| PE-01A | Descubrimiento y arquitectura de la entrada | **cerrado** |
| PE-01B | Implementación · portada, `/modules`, estados por módulo | **cerrado** |

---

## PE-02 · Ayuda y autoservicio

| Tramo | Qué hizo | Migración | Estado |
|---|---|---|---|
| PE-02A | Descubrimiento, arquitectura y auditoría de afirmaciones | — | **cerrado** |
| PE-02B1 | Los cimientos de la FAQ | 0155 | **cerrado** |
| PE-02B2 | La consola de contenido y el endurecimiento legal | 0156 | **cerrado** |
| PE-02B3 | La FAQ que ve el cliente · 24 respuestas | 0157 | **cerrado** |
| PE-02B4 | La ayuda contextual · 11 ayudas | 0158 | **cerrado** |
| PE-02B5A | Los borradores de seguridad, privacidad e IA | — | **cerrado** |
| PE-02B6 | Consolidación y preparación de la revisión | — | **cerrado** |
| PE-02B6.1 | El paquete editorial, para revisar sin consola | — | **cerrado** |
| PE-02B6.2 | Correcciones editoriales y pintado del texto legal | — | **cerrado** |
| PE-02B5B | **Publicación** | — | **NO EMPEZADO** |

### El estado de PE-02, en dos líneas

> **Implementación técnica de PE-02: LISTA.**
> **Publicación de PE-02: PENDIENTE de B5B, y B5B depende de una revisión humana.**

Lo que está listo y no se ve: la sucesora de la política de privacidad
(`v1.1-draft`) y quince respuestas de seguridad. Todo en borrador, a propósito.

Lo que abre la puerta de B5B está en
[`PE_02B6_B5B_PUBLICATION_PLAN.md`](PE_02B6_B5B_PUBLICATION_PLAN.md).

Para revisar el contenido hay dos caminos, según se pueda entrar a la consola:

- **con consola** — [`PE_02B6_HUMAN_REVIEW_PACKAGE.md`](PE_02B6_HUMAN_REVIEW_PACKAGE.md),
  un recorrido de una hora por las pantallas;
- **sin consola** — [`PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md`](PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md),
  el texto exacto de la política y de las quince respuestas, con hoja de decisión.

Y lo que se corrigió después de aquella revisión, en
[`PE_02B6_2_FINAL_EDITORIAL_CHANGES.md`](PE_02B6_2_FINAL_EDITORIAL_CHANGES.md).

---

## Confirmaciones que solo puede dar una persona

| | Estado |
|---|---|
| ¿Autorización de uso de datos para entrenamiento? | **respondida** · no · 2026-08-31 |
| ¿Retención cero contratada? | **respondida** · no · 2026-08-31 |
| ¿Qué proveedor de IA usa el entorno desplegado? | **respondida** · OpenAI · 2026-08-31 |
| ¿Se nombra al proveedor en el texto público? | **abierta** · no bloquea publicar |
| ¿Se publica la política de privacidad v1.1? | **abierta** · bloquea B5B |
| ¿Se publican las quince respuestas de seguridad? | **abierta** · bloquea B5B |

---

## Cabeceras de migración

| Entorno | Cabecera |
|---|---|
| Local | **0158** |
| Staging | **0158** |
| Producción | **0111** |

Producción no tiene las tablas de la FAQ ni las de la ayuda. Publicar allí no es
un paso de B5B: es una decisión aparte que empieza por aplicar 47 migraciones.

---

## Lo que queda pendiente y está escrito

- [`PE_02B6_DEFERRED_HELP_BACKLOG.md`](PE_02B6_DEFERRED_HELP_BACKLOG.md) — las
  siete familias de pantalla sin ayuda contextual administrada, y por qué no se
  inventó contenido para ellas.
- PE-03 · tutorial de pantalla y soporte. Reutilizará `PAGE_KEYS`, que por eso
  vive en `lib/modules/` y no dentro de la ayuda.
