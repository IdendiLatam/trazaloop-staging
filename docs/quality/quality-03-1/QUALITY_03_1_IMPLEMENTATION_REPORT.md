# QUALITY-03.1 · Informe de implementación

**Endurecimiento temporal, identidad en el PDF y ciclo de vida controlado.**

| | |
|---|---|
| Rama | `fix/quality-03-1-temporal-lifecycle-pdf` |
| Base | `9c13773` — QUALITY-03 (`ec1e7ea`) más el hotfix de acceso por módulo |
| Migración | `0119_quality_temporal_eligibility_and_lifecycle.sql` |
| Pruebas propias | **63** (33 puras · 30 base real) |
| Regresión local | `test:all` **exit 0** · 1 965 comprobaciones |
| Staging | `qchzkxbnbqeyuxinipln` · 0118 → **0119** |
| Production | **intacta** |

Este no es un dominio nuevo: es un sprint corto que cierra tres huecos del que
ya existe.

---

## 1 · Un indicador de agosto pedía medir julio

La vista calculaba el periodo pendiente como «el anterior a hoy», **sin
preguntar nunca** si ese periodo pertenecía a la vida del indicador. Y julio no
es medible: el motor exige una configuración que **cubra** el periodo. La
aplicación pedía algo que su propio dominio rechazaba dos clics después.

```
vigente desde                 | 2026-08-01
la vista pide medir           | 2026-07
  ...y lo marca pendiente     | true
¿el motor acepta ese periodo? | NO — sin configuración vigente
```

**La regla ya existía; lo que faltaba era que la vista la consultara.** Ahora
se expresa una vez —`quality_period_is_eligible()`— y de ella beben la vista,
el barrido, la portada y el desempeño del objetivo.

Por eso la corrección va en la **base** y no solo en la pantalla: la vista es
la fuente, y arreglar la pantalla habría dejado a la fuente fabricando julio
para todos los demás consumidores.

Detalle, incluida la semántica de `effective_from`, el periodo parcial y por
qué el horizonte del objetivo **no** limita al indicador:
`QUALITY_03_1_TEMPORAL_RULES.md`.

## 2 · Un administrador podía borrar un histórico entero

`quality_measurements.indicator_id` era `ON DELETE CASCADE` y la política
permitía a admin/quality borrar cualquier indicador. Borrar uno **destruía en
silencio** sus mediciones, sus metas históricas y su linaje de cálculo. Contra
2.5 «Historical truth matters», OI-24, OI-28 y MDR-49.

La cascada se queda —es correcta cuando el indicador sí es desechable— y se le
pone la puerta que faltaba: un dictamen por entidad y un disparador
`BEFORE DELETE` que consulta **ese mismo dictamen**.

Compartir función tiene dos consecuencias que se notan: el aviso y el rechazo
no pueden discrepar, y la ventana entre «se mostró el aviso» y «se confirmó»
deja de ser aprovechable.

**La frontera histórica de un indicador no es tener configuración.** Crearlo
publica la primera en el mismo gesto, así que tomarla como frontera dejaría
todo indicador indeleble desde el segundo cero —la queja exacta que este sprint
viene a resolver—. La frontera es haber producido un **resultado**.

Matriz completa, auditoría de los borrados existentes y diferencias con la
matriz hipotética: `QUALITY_03_1_LIFECYCLE_MATRIX.md`.

## 3 · Los códigos documentales se reciclaban

D-04 dice que no se reciclan y en la base **no había ninguna restricción**
sobre el código: dos documentos vivos podían compartir `PR-QA-007` y borrar un
borrador liberaba el suyo. Ahora una **lápida** conserva la identidad del
código sin conservar un documento fantasma, y la reserva es por empresa.

## 4 · El logo en los PDF

La brecha que QUALITY-02 declaró. Se reutiliza la fuente que ya existe y el
motor PDF aprende a incrustar imágenes **sin ninguna dependencia nueva**: JPEG
va tal cual (`/DCTDecode`) y PNG se descomprime con `node:zlib` para separar el
canal alfa en una máscara —sin ella, un logo recortado se dibuja sobre un
rectángulo negro—.

El generador **nunca recibe una URL**: eso convertiría el servidor en un
cliente HTTP que va donde le digan. Y si algo falla, el PDF sale igual con el
nombre de la empresa: un adorno no puede impedir que alguien descargue su
procedimiento.

Detalle: `QUALITY_03_1_PDF_IDENTITY.md`.

---

## 5 · Dos regresiones propias, encontradas y corregidas

Las anoto porque son la parte honesta del informe:

1. **Mi reescritura del barrido divergía del original.** Lo reescribí de
   memoria y perdí el estado de las alertas y la clave de deduplicación. Lo
   cazó la suite de base real. Se reconstruyó copiando el cuerpo de 0117 y
   cambiando **una línea**, y la prueba `M4` compara ambos cuerpos y falla si
   difieren en más de una.

2. **El disparador responde antes que la clave foránea.** `removeQualityPosition`
   contemplaba solo `23503`, así que la carrera entre leer el uso y borrar
   dejaba de desactivar. Ahora contempla las dos barreras.

Y dos defectos de copy que solo se vieron en el navegador: «1 metas
históricas», y «Tiene 1 salió del borrador (estado «in_review»)» —que ni
concuerda ni debe enseñar un código interno—.

## 6 · Lo que NO se hizo, y por qué

| | |
|---|---|
| **Horizonte del objetivo como límite temporal** | ninguna decisión OI lo establece, y un indicador puede no tener objetivo (OI-25). Implementarlo habría sido inventar una regla |
| **Eliminación de procesos en borrador** | hoy no existe política de DELETE sobre `quality_processes`. Habilitarla requiere política, dictamen, interfaz y pruebas: queda declarada como brecha |
| **Generalizar D-04 a otros identificadores** | solo D-04 congela esa regla (§30 del encargo) |
| **Políticas de ciclo de vida para dominios futuros** | No Conformidades, Hallazgos, Riesgos, Auditorías: QUALITY-04 y posteriores **consumen** este patrón, no se construyen aquí |
| **Soporte de WebP en el PDF** | no hay decodificador en la plataforma; el respaldo lo cubre |

## 7 · Entregables

| Documento | Qué contiene |
|---|---|
| `QUALITY_03_1_IMPLEMENTATION_REPORT.md` | este documento |
| `QUALITY_03_1_TEMPORAL_RULES.md` | la causa de julio, la regla definitiva y los cinco casos |
| `QUALITY_03_1_LIFECYCLE_MATRIX.md` | la matriz verificada, la auditoría de borrados y los mensajes |
| `QUALITY_03_1_PDF_IDENTITY.md` | el logo, la seguridad del Storage y el respaldo |
| `QUALITY_03_1_RLS_SECURITY.md` | la puerta, el enmascaramiento y los privilegios retirados |
| `QUALITY_03_1_TEST_MATRIX.md` | las 63 pruebas propias y la regresión |
| `QUALITY_03_1_STAGING_VALIDATION.md` | despliegue, Preview, navegador y Production |
| `QUALITY_03_1_ROLLBACK.md` | cuatro niveles de reversión |
