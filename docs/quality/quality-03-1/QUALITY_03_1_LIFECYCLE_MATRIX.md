# QUALITY-03.1 · Matriz de ciclo de vida

## 1. El principio

> Un objeto puede eliminarse **mientras no haya adquirido valor histórico,
> probatorio o referencial**. Cuando lo adquiere, no se destruye: se retira, se
> desactiva o se corrige, según lo que signifique en su dominio.

Ni «en Quality nunca se borra nada» —que convierte cada tecleo en piedra y
llena el sistema de basura que nadie puede quitar— ni «el administrador borra
lo que quiera» —que hace de la historia una cortesía—.

**Administrar es decidir quién opera, no poder destruir lo ocurrido** (§24).

## 2. Dónde vive la verdad

No en React. La decide `quality_deletion_eligibility(entidad, id)` en la base y
la **hace cumplir** un disparador `BEFORE DELETE` que consulta **el mismo
dictamen**. Compartir función tiene dos consecuencias que se notan:

- el mensaje del aviso y el motivo del rechazo **no pueden discrepar**;
- la ventana entre «se mostró el aviso» y «se confirmó» **no es aprovechable**:
  si en ese rato alguien registra una medición, el borrado falla (prueba `L17`).

No hay una tabla universal de ciclo de vida ni un motor abstracto: hay una
función por entidad, con las preguntas de **su** dominio, detrás de una
interfaz común. La forma compartida es lo que permite una UX coherente; la
lógica específica es lo que permite entenderla.

```
{ can_hard_delete, reason_code, reason,
  blocking: [{ label, count }], alternative, alternative_label }
```

## 3. La matriz, verificada contra el modelo real

| Entidad | ¿Hard delete? | ¿Cuándo? | Qué la vuelve histórica | Qué hacer después | Quién | Qué lo impide |
|---|---|---|---|---|---|---|
| **Cargo** | **Sí** | sin nada asociado | un proceso, un titular, un indicador, un objetivo o un documento a su cargo | **desactivar** | admin / calidad | 5 FK `RESTRICT` + disparador |
| **Proceso** | **No** (hoy) | — | — | nueva revisión / retiro | — | sin política de DELETE — ver §5 |
| **Revisión de proceso** | **No** | — | existe | nueva revisión | — | sin política; privilegio retirado |
| **Entrada / Salida** | **Sí** | dentro de una revisión en **borrador** | publicar la revisión | nueva revisión | admin / calidad | disparador `io_revision_must_be_draft` |
| **Interacción** | **Sí** | íd. | íd. | íd. | admin / calidad | íd. |
| **Nodo del mapa** | **Sí** | versión del mapa en **borrador** | publicar la versión | nueva versión | admin / calidad | `map_node_version_must_be_draft` |
| **Versión publicada del mapa** | **No** | — | publicarla | nueva versión | — | sin política; privilegio retirado |
| **Documento** | **Sí** | borrador que **nunca** entró en revisión | enviar a revisión, aprobar, entrar en vigencia, ser referenciado | **retirar** | administrador | `trazadoc_delete_document_safely` + disparador |
| **Revisión de documento** | **No** | — | existe | nueva revisión | — | sin política; privilegio retirado |
| **Decisión de workflow** | **No** | — | registrarse (D-20) | — | — | sin política; `update`/`delete` revocados |
| **Objetivo** | **Sí** | borrador, sin resultados de sus indicadores y sin hijos | activarlo, o que sus indicadores midan | **cerrar** | admin / calidad | disparador |
| **Indicador** | **Sí** | sin medición, cálculo, evento ni segunda meta | producir un **resultado** | **retirar** | admin / calidad | disparador (la cascada sigue, la puerta la gobierna) |
| **Configuración de indicador** | **No** | — | publicarse | publicar una nueva (cierra la anterior) | — | sin política; 0118 revocó el DML |
| **Medición** | **No** | — | registrarse | **corregir** (conserva el original) | — | sin política; 0118 revocó el DML |
| **Ejecución de cálculo** | **No** | — | existir | — | — | íd. |
| **Cierre de periodo** | **No** | — | existir | **reabrir con motivo** | administrador | íd. |
| **Tarea / Alerta** | no aplica | — | — | resolver / descartar | asignatario | son estado, no historia |
| **Evento (bitácora)** | **No** | — | existir (AT-03) | — | — | append-only + privilegio revocado |

## 4. La frontera histórica de un indicador NO es tener configuración

Crear un indicador **publica su primera configuración en el mismo gesto** —un
indicador sin meta no mide nada—. Tomar la configuración como frontera dejaría
todo indicador indeleble desde el segundo cero, que es precisamente la queja
que este sprint viene a resolver.

La frontera es **haber producido un resultado**:

- una medición (de cualquier estado);
- una ejecución de cálculo;
- un hecho en la bitácora;
- una **segunda** versión de configuración — eso ya es una serie histórica de
  metas (OI-07);
- que un indicador retirado lo señale como sucesor (OI-32).

## 5. Diferencias con la matriz hipotética del encargo

El encargo pedía verificar la matriz contra el modelo real y documentar las
diferencias. Hay una:

> **PROCESO.** La hipótesis dice «borrador aislado → delete posible». En el
> modelo real **no existe política de DELETE** sobre `quality_processes`, así
> que hoy un proceso no se puede eliminar ni siquiera recién creado.
>
> Peor: hasta 0119, `authenticated` conservaba el privilegio sin política, de
> modo que el intento **no daba error**: afectaba a cero filas y devolvía 204.
> 0119 retira el privilegio, con lo que ahora al menos falla de forma honesta.
>
> **Habilitar la eliminación de un proceso en borrador queda declarada como
> brecha** (G-1). Requiere política, dictamen, interfaz y pruebas propias, y el
> encargo prohíbe expandir el sprint.

## 6. Lo que se descubrió al auditar

**`quality_measurements.indicator_id` era `ON DELETE CASCADE`**, y la política
permitía a admin/quality borrar cualquier indicador. Borrar uno **destruía en
silencio** sus mediciones, sus configuraciones históricas y su linaje de
cálculo. Contra 2.5 «Historical truth matters», OI-24, OI-28 y MDR-49.

La cascada **no se retira**: sigue siendo correcta cuando el indicador sí es
desechable —borrar uno recién creado debe llevarse su única configuración, que
no es historia de nadie—. Lo que se añade es la puerta.

## 7. Auditoría de los borrados existentes (§41)

| Sitio | Qué borra | Veredicto |
|---|---|---|
| `quality_process_io` | entradas/salidas de una revisión en borrador | **SAFE** — disparador exige borrador |
| `quality_process_interactions` | íd. | **SAFE** |
| `quality_process_map_nodes` | nodos de una versión en borrador | **SAFE** |
| `quality_process_documents` | **solo la relación**; el documento queda intacto (T-03) | **SAFE** |
| `quality_positions` (`removeQualityPosition`) | cargo sin uso; si hay uso, desactiva | **SAFE**, corregido: contaba 2 de 5 referencias |
| `quality_objective_processes` / `_indicators` | asociaciones | **SAFE** — son enlaces, no historia |
| `trazadoc_delete_document_safely` | borrador sin historial | **SAFE** — ya era correcto en 0116 |
| `quality_indicators` (nuevo) | indicador sin resultados | **NEEDS GUARD → corregido** en 0119 |
| `quality_objectives` (nuevo) | objetivo en borrador | **NEEDS GUARD → corregido** en 0119 |
| PCR / Textiles | fuera de Quality | **OUT OF SCOPE** — su política es propia |

## 8. Códigos documentales (D-04)

En la base **no había ninguna restricción** sobre `trazadoc_documents.code`: ni
unicidad ni reserva. Dos documentos vivos podían compartir `PR-QA-007`, y
borrar un borrador liberaba su código.

`trazadoc_document_codes` es una **lápida**: al asignar un código se reserva, y
la reserva sobrevive al borrado del documento (`document_id` queda en `null`).

- No se conserva un documento fantasma visible — eso contradiría el borrado que
  sí es legítimo.
- La reserva es **por empresa**: que `PR-QA-007` esté ocupado en una no impide
  que otra lo use (`L12`).
- El rechazo se explica: «El código PR-QA-007 ya se usó antes en esta empresa y
  no puede reutilizarse. Los códigos documentales no se reciclan.»

**No se generalizó** a otras entidades: solo D-04 congela esta regla, y
extenderla por analogía habría sido inventar decisiones (§30).

## 9. Los mensajes

Nunca «No se puede eliminar» a secas. El dictamen produce el porqué **con
números** y la salida:

> **Este indicador ya no puede eliminarse.**
> Este indicador ya produjo resultados y su histórico debe conservarse.
> Tiene 1 medición registrada.
> Retirarlo conservando su histórico.

> **Este documento no se elimina.** Este documento ya salió del borrador (en
> revisión) y su historial debe conservarse. Tiene 1 decisión de revisión o
> aprobación. Retirarlo conservando su trazabilidad.

Nótese que el estado se dice **en español**: `in_review` es un código interno y
no se le enseña a nadie. Y que el estado no se cuenta —«1 salió del borrador»
no se puede leer—: va en el motivo, no en la lista de bloqueos.

## 10. Las confirmaciones

| Situación | Qué se muestra |
|---|---|
| Objeto **todavía** desechable | ayuda discreta: «Podrás eliminar este indicador mientras no haya producido resultados. Después podrás retirarlo, conservando su histórico.» |
| Se va a **eliminar** de verdad | confirmación que **nombra** el objeto: «Esta acción eliminará definitivamente el indicador «Cumplimiento de entregas». No se puede deshacer.» |
| Se va a **cruzar** la frontera | aviso previo: «Esta acción inicia el historial formal del documento…», «La medición quedará en el histórico…», «Esta versión del mapa queda como registro histórico…» |
| Ya tiene historia | el porqué con números + la alternativa |

Lo que **no** se hace: anunciar «nunca podrá borrarse» al crear algo que sí es
desechable durante días. Un aviso falso enseña a cerrar los avisos sin leerlos,
y entonces el que sí importaba tampoco se lee. Una prueba (`D7`) exige que
ninguna ayuda de objeto desechable contenga la palabra «nunca».
