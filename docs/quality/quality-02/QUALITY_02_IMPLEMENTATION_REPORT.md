# QUALITY-02 · Informe de implementación

**Sprint:** Control documental, aprobaciones, Lista Maestra y PDF
**Rama:** `feature/quality-02-document-control` (desde `4200d59`, baseline de QUALITY-01.2)
**Migración:** `0116_document_control_revisions_workflow_and_tasks.sql`
**Fecha:** 2026-08-21
**Veredicto:** **QUALITY-02 READY FOR USER TESTING** (con dos brechas menores declaradas en §12)

---

## 1. Qué se corrigió

La prueba humana encontró cuatro cosas. La tercera era la importante:

> «El sistema actual maneja incorrectamente la versión/revisión documental: un
> documento recién creado puede terminar mostrando versiones >1 por simples
> cambios de estado.»

Era exactamente eso, y la causa estaba a la vista: `change_trazadoc_document_status`
(0046, corregida en 0047) hacía `current_version = current_version + 1` en
**cada** transición. Crear, enviar, rechazar, corregir y aprobar producían
«v5» sin que el contenido hubiera cambiado nunca de revisión.

Lo que se implementó no es un parche a ese contador: es la separación de los
tres conceptos que estaban mezclados.

```
IDENTIDAD DEL DOCUMENTO   ≠   REVISIÓN DOCUMENTAL   ≠   ESTADO DEL WORKFLOW
```

Detalle completo en `QUALITY_02_DOCUMENT_MODEL.md`.

---

## 2. Auditoría del motor TrazaDocs (Parte 1)

| Clasificación | Qué |
|---|---|
| **REUTILIZAR** | `trazadoc_documents` (identidad) · `trazadoc_document_sections` (contenido vivo) · `trazadoc_blueprints` · `trazadoc_status_history` · el aislamiento por `module_key` · `SectionEditor` · `is_org_member` / `has_org_role` · `quality_positions` y sus asignaciones · `quality_process_documents` (Proceso ↔ Documento y E/S ↔ Documento) |
| **EVOLUCIONAR** | `trazadoc_documents`, con siete columnas aditivas · `updateDocumentMetadata` e `insertDocument`, con parámetros opcionales que PCR y Textiles no envían · el shell (`min-w-0`) |
| **CREAR** | `trazadoc_document_revisions` · `trazadoc_document_workflow_participants` · `trazadoc_document_decisions` · `work_tasks` · `work_alerts` · `v_trazadoc_document_control` · ocho RPC · `lib/pdf/` |
| **NO TOCAR** | `change_trazadoc_document_status` · `trazadoc_document_versions` · `v_trazadoc_document_summary` · `v_trazadoc_document_master` · `trazadoc_file_documents` · todas las migraciones anteriores |

**No se creó un segundo motor documental.** Quality tiene su propia
*experiencia* sobre el motor transversal, que era lo que el encargo pedía.

---

## 3. Commits

```
9b5bf11  feat(quality): QUALITY-02 · motor de control documental (base)
9fe8faa  feat(quality): QUALITY-02 · experiencia documental completa sobre TrazaDocs
3c33012  test(quality): QUALITY-02 · pruebas puras, de base real y recorrido humano
d0ca41b  test(quality): QUALITY-02 · regresión completa en verde
0f40d2b  docs(quality): QUALITY-02 · modelo documental, workflow, RLS, pruebas y PDF
0cf6486  docs(quality): QUALITY-02 · informe de implementación y despliegue en Staging
```

61 archivos, +10 900 / −404. El último cambio de CÓDIGO es `d0ca41b`: los dos
commits posteriores son solo documentación, así que los resultados de las suites
registrados en §7 corresponden al árbol final.

---

## 4. La garantía central, y dónde vive

```sql
if old.revision_model = 'controlled'
   and new.current_version is distinct from old.current_version
   and coalesce(current_setting('trazaloop.revision_bump', true), 'off') <> 'on' then
  raise exception 'Un cambio de estado no altera la revisión del documento. …';
end if;
```

La marca `trazaloop.revision_bump` es local a la transacción y **la pone una sola
función**: `trazadoc_create_document_revision`. Consecuencia deliberada: llamar
a la RPC histórica sobre un documento controlado **falla**.

No es una comprobación de la aplicación. `change_trazadoc_document_status` es
`SECURITY DEFINER` y ninguna RLS la detendría; la marca de transacción es lo
único que distingue la vía autorizada de todas las demás.

---

## 5. Compatibilidad histórica

`revision_model` nace en `'legacy'` para **todas** las filas existentes. PCR,
Textiles y los documentos de Quality anteriores conservan su comportamiento sin
una sola diferencia observable (`rls Z1`–`Z4`).

**No se reinterpretó ningún `current_version` heredado como revisión de
negocio.** Un legacy con `current_version = 4` se presenta como `v4 (histórico)`,
nunca como «Revisión 4», y la vista lo marca con `legacy_revision_uncertain`.
Reconstruir revisiones a partir de `trazadoc_document_versions` habría sido
posible mecánicamente y falso materialmente: esas filas registran transiciones de
estado, y no hay dato que diga cuáles eran cambios reales de revisión.

Un documento no puede cambiar de modelo después de creado (`rls Z2`).

---

## 6. Lo que ahora existe

| Parte del encargo | Estado |
|---|---|
| 2 · Crear y editar documentos con la experiencia completa | ✅ Editor por secciones del motor, agregar / eliminar / reordenar, guardar borrador, continuar después |
| 3 · Modelo correcto de revisiones | ✅ Aditivo, con garantía en la base |
| 4 · Workflow documental real | ✅ Borrador → revisión → devolución → corrección → reenvío → aprobación |
| 5 · Selección de revisor y aprobador | ✅ Por cargo (preferido) o por persona; 1..N; secuencial o paralelo |
| 6 · Revisión con «Mis tareas» | ✅ |
| 6 · Rechazo con motivo obligatorio | ✅ Exigido por `CHECK` en la base |
| 7 · Aprobación inmutable y auditada | ✅ |
| 8 · Tasks / Alerts como primitiva transversal | ✅ `work_tasks` / `work_alerts`, acopladas por contrato |
| 9 · Lista Maestra derivada | ✅ Vista, 16 columnas, 9 filtros |
| 10 · PDF del documento | ✅ Descarga real |
| 11 · PDF de la Lista Maestra | ✅ Con filtros declarados; CSV preservado |
| 12 · Eliminar / retirar | ✅ Con el motivo explicado en pantalla |
| 13 · Vigencia | ✅ Aprobado ≠ vigente, derivado por fecha |
| 14 · Revisión programada | ✅ Genera atención, no obsolescencia |
| 15 · Quality-only | ✅ Toda la suite corre sobre una organización sin PCR ni Textiles |
| 16 · Sin romper TrazaDocs | ✅ `test:all` en verde |
| 17 · Procesos | ✅ Las relaciones apuntan a la IDENTIDAD del documento |
| 24 · Resumen en la portada | ✅ Mínimo, y solo si hay algo pendiente |

### 6.1 · Procesos: identidad o revisión (Parte 17)

`quality_process_documents` apunta a la **identidad** del documento, no a una
revisión. Es la semántica correcta del baseline para una relación conceptual:
«este proceso se rige por el Procedimiento de compras», no «por la revisión 1
del Procedimiento de compras». Cuando se emite la revisión 2, la relación sigue
siendo válida sin tocar una sola fila, y la Lista Maestra muestra cuál rige hoy.

La evidencia histórica —«qué revisión regía cuando ocurrió este hecho»— se
resuelve por fecha contra `effective_from` / `effective_to`, sin necesidad de
una FK a revisión. Cuando exista un dominio que deba congelar la revisión
exacta (registros generados desde una plantilla, MDR-15), esa FK se añadirá
allí, que es donde tiene sentido.

---

## 7. Pruebas

| Suite | Local | Staging |
|---|---|---|
| Puras y estáticas (70) | ✅ | n/a |
| Base real (58) | ✅ | ✅ 58/58 |
| Recorrido humano + PDF (26) | ✅ | ✅ 26/26 |
| `test:all` (1 862) | ✅ salida 0 | n/a |
| Quality 01 / 01.1 / 01.2 · base real | ✅ 56 + 41 + 33 | ✅ 51 + 37 + 30 |
| Quality 01 / 01.1 / 01.2 · recorrido | ✅ 15 + 16 + 16 | n/a |

Detalle en `QUALITY_02_TEST_MATRIX.md`.

---

## 8. Defectos encontrados por las pruebas

Ocho, ninguno visible al compilar. Tres los destapó **abrir el PDF generado**,
dos **abrir la pantalla en un navegador**, uno el recorrido sin JavaScript y uno
un invariante que ya existía. Listados en `QUALITY_02_TEST_MATRIX.md` §10.

Los tres del PDF tienen ahora una comprobación propia para que no vuelvan.

---

## 9. Deuda ajena que se limpió

Cuatro cosas que ya estaban rotas o eran frágiles antes de este sprint:

1. **`test:all` salía con código 1** por dos afirmaciones obsoletas desde
   QUALITY-01.2 y por dieciséis listas blancas de migraciones sin actualizar.
   Se comprobó en un árbol del baseline que los fallos ya existían.
2. El endurecimiento de secciones de TrazaDocs medía el código por **recortes de
   N caracteres**: documentar un parámetro nuevo bastaba para romperlo. Ahora
   lee el cuerpo completo de la función.
3. El invariante M8 de QUALITY-01.2 **se auditaba a sí mismo**.
4. El shell tenía un defecto de rejilla (`min-width: auto`) que dejaba que
   cualquier tabla ancha empujara la barra superior fuera de la ventana. Afecta
   a todos los módulos; corregido para todos.

---

## 10. Decisiones de diseño que conviene conocer

**Por qué el generador de PDF está escrito a mano.** Un motor de navegador sin
cabeza son cientos de MB en la ruta de despliegue; una librería de terceros, una
dependencia para un subconjunto de PDF pequeño y estable desde 1993. Escribirlo
deja además el resultado comprobable: los flujos van sin comprimir, así que una
prueba abre el archivo y verifica que el código, el título y la revisión están
realmente dentro. Detalle en `QUALITY_02_PDF_VALIDATION.md`.

**Por qué `work_tasks` y `work_alerts` no llevan prefijo.** AT-10 y MDR-46: una
sola bandeja transversal, acoplada al origen por contrato y no por FK a una
tabla de dominio (AT-04). Acciones correctivas, auditorías y riesgos las
reutilizarán sin crear tablas hermanas.

**Por qué el panel de estructura de secciones está separado del contenido.**
HTML no admite formularios anidados. Unos botones de «subir / bajar / eliminar»
dentro del formulario grande habrían enviado los campos de todas las secciones
a la vez y leído la dirección equivocada.

**Por qué crear un documento se abre con `<details>`.** Así el formulario está
en el documento aunque JavaScript no haya cargado —o falle—, y el recorrido de
aceptación puede ejercerlo como lo haría un navegador sin JS.

**Por qué el distintivo de estado de Quality no es el de TrazaDocs.** El del
motor solo conoce borrador / revisión / aprobado / obsoleto. Un sistema de
gestión necesita distinguir «aprobado» de «vigente» (D-06) y «devuelto» de
«borrador». Ambos leen sus etiquetas del dominio, nunca de una copia.

---

## 11. Alcance no incluido, a propósito

Documentos externos como objetos controlados (D-21) · registros y plantillas
como entidades propias (D-22, MDR-15) · análisis de impacto (D-07, D-25) ·
lectura obligatoria y formación derivadas de una revisión (D-12) · rutas
condicionales y delegación · motor de reglas, escalados y digests (AT-05) ·
notificación por correo · Objetivos e Indicadores · QUALITY-03.

---

## 12. Brechas conocidas

**G-1 · El logo de la empresa no se incrusta en el PDF.** El generador no
soporta imágenes; la identidad se imprime en texto (nombre, razón social, NIT).
El encargo lo condicionaba a «si el motor ya la soporta», y no lo soporta.
Requiere un objeto XObject de imagen y descargar el logo desde Storage al
generar.

**G-2 · La interfaz ofrece hasta tres revisores y tres aprobadores.** El modelo
de datos no tiene ese límite —es una tabla con `step_order`, no un par de
columnas— y ampliar la pantalla no toca la base. Es una decisión de UX MVP,
explícitamente permitida por el encargo.

**G-3 · Preview sigue tras el SSO de Vercel.** Limitación heredada desde
QUALITY-01.1: es una opción de proyecto compartida con Production y no se
desactivó. La prueba humana debe hacerse con una cuenta con acceso al equipo de
Vercel, o en local.

Ninguna de las tres bloquea la prueba humana.
