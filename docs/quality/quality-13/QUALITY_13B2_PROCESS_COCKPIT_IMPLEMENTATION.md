# QUALITY-13B2 · MIRADOR DE PROCESO

Lo entregado, y por qué está donde está.

---

## 1 · El hueco que cierra

QUALITY-13A encontró trece dominios completos y desintegrados por el eje que los une.
B1 construyó el contrato y el cargador; **no tenían pantalla**. Este tramo se la pone.

La ficha de proceso ya respondía «¿qué es este proceso?». Ahora responde también:

> ¿qué significa dentro del sistema de gestión, y qué requiere atención a su alrededor?

Sin reconstruir un solo dominio dentro de Procesos.

---

## 2 · Tres archivos, tres responsabilidades que no se mezclan

| Archivo | Qué hace | Qué NO hace |
|---|---|---|
| `lib/domain/quality-process-cockpit.ts` | Las decisiones: orden, textos, atención, aviso temporal, vocabulario | No consulta |
| `lib/db/quality-process-cockpit.ts` | Los datos: compone B1, enriquece requisitos, deriva | No pinta, no escribe |
| `components/domain/quality/process-cockpit.tsx` | Pinta lo que recibe | No decide, no consulta, no edita |

La separación no es estética. §2 del encargo la exige, y la razón es la de siempre: una
decisión escrita dentro de un componente solo se puede probar montando un DOM, así que
se prueba poco y se cambia sin darse cuenta.

**El mirador es un componente de SERVIDOR** que la página compone y le pasa a la ficha
—que sí es de cliente— como nodo ya pintado. Dos consecuencias: no entra una línea de su
código en el paquete del navegador, y la pantalla **no puede** consultar por su cuenta.

---

## 3 · El orden, que es el de gestión y no el del cargador

B1 devuelve las nueve secciones en el orden que le convino leerlas. El mirador las
reagrupa en siete bloques siguiendo el recorrido real de un proceso:

| Bloque | Secciones |
|---|---|
| Qué se le exige | requisitos de partes interesadas |
| Qué puede pasar | riesgos · oportunidades |
| Qué se espera y cómo se mide | objetivos · indicadores |
| Con qué se opera | competencias requeridas |
| Con qué se gobierna y qué lo evidencia | documentos |
| Qué ha encontrado la verificación | hallazgos de auditoría |
| Qué se está atendiendo | casos y acciones |

**Objetivo e indicador comparten bloque y no se funden.** 13A los dejó como dos filas de
la matriz a propósito: su capacidad temporal y su automatización son distintas, y
llamarlos «métricas» borraría esa diferencia. La prueba B4 lo vigila.

Y el mirador va **después** de la definición del proceso —identidad, propósito, entradas
y salidas, relaciones— y **antes** de sus documentos e historial. Al revés se leería el
contexto de algo que todavía no se sabe qué es.

---

## 4 · Lo que B2 añadió sobre B1, y por qué no estaba ya

**De quién viene cada requisito.** La sección de B1 trae el requisito; la parte
interesada está un salto más allá, a través de su análisis. Y esa es la única forma de
enseñarla: la relación parte→proceso **no se guarda** —0149 lo dice en su propio
comentario— y guardarla serían dos verdades. Se enriquecen **solo los cuatro de la
muestra**: pedirlo para los doscientos requisitos de una empresa para enseñar cuatro
sería el N+1 que B1 se cuidó de no tener.

**La dirección inversa de lo derivado.** B1 sabía ir de un proveedor a sus procesos; el
mirador necesita ir del proceso a sus proveedores. Misma verdad recorrida al revés, por
los mismos dos caminos —el caso abierto desde un incidente, y la referencia periférica
declarada— y **sin persistir nada** (QI-23).

Un detalle que solo aparece escribiendo el código: cuando la referencia cuelga de un
**alcance** y no del perfil, hay que subir hasta su proveedor. Tratar las dos clases
igual habría enseñado alcances como si fueran proveedores.

---

## 5 · El defecto que encontró la aceptación

`deepLink("trazadoc_document", id)` lleva a `/quality/documents/{id}`. Correcto para un
documento de Quality; **404** para uno de PCR o de Textiles.

Y un proceso de Quality **sí** puede referenciar documentos de otro módulo: la pantalla
de vinculación ofrece los de cualquier módulo de la empresa, y eso es correcto. La ficha
vieja ya lo sabía —usa `trazadocDocumentHref(moduleKey, id)` por esa razón exacta—; el
mirador no.

Se arregló donde tenía que arreglarse, en el cargador: `ContextItem` gana
`linksToDetail`, la sección de documentos lee `module_key`, y la fila de un documento
ajeno se enseña **con el módulo del que es** y **sin enlace**.

No se enlaza al módulo dueño: una empresa que solo tiene Quality no puede entrar allí, y
sería la puerta rota de siempre.

Lo encontró P8.1, que abre **todos** los destinos que el mirador ofrece y comprueba que
responden 200. Ninguna prueba de código fuente lo habría visto.

---

## 6 · Lo que el mirador no hace, y no va a hacer

- **No edita.** Ni un formulario, ni un botón, ni una acción de servidor. Nueve enlaces
  «Ver…» y ninguno «Crear».
- **No inventa una puntuación de Quality.** Comparar en una escala propia un riesgo alto,
  un hallazgo sin evaluar y una competencia por caducar es comparar cosas que no se
  comparan.
- **No traduce a su propio vocabulario.** «Activo» en un riesgo lo dice Riesgos;
  «Aprobado» en un documento lo dice TrazaDocs. Un estado sin etiquetar se enseña tal
  cual: es feo, se nota, y por eso se arregla.
- **No convierte un hallazgo en no conformidad** ni un indicador fuera de meta en un
  incumplimiento. Las dos traducciones son de sus dominios.
- **No convierte tareas propias de dominio en acciones** (QI-24). Ni las lee.

---

## 7 · Sin esquema

Cabecera **0152**, la misma con la que empezó el tramo. No se creó ninguna tabla, ninguna
vista y ninguna columna. `ContextItem.linksToDetail` es un campo del contrato de
aplicación, no del esquema.

---

## 8 · Lo que sigue siendo de otro tramo

- **B3** · convergencia global de atención y relevo de observadores. El mirador enseña
  atención **de un proceso** y con el recuento del propio dominio; no deduplica entre
  dominios ni releva ningún barrido.
- **B4** · la portada de Quality.
- **B5** · Intelligence entre dominios.

---

## 9 · El reparto de responsabilidades, dicho explícitamente

Para que no haya duda de qué NO entró aquí:

| Tramo | De qué sigue siendo responsable |
|---|---|
| **B3** | La convergencia **global** de la atención y el relevo de observadores: las plantillas que sustituyen a los diez barridos, `supersedes_observer`, y la deduplicación entre dominios. B2 enseña atención **de un proceso**, con el recuento del propio dominio, sin deduplicar nada y sin relevar ningún barrido. |
| **B4** | La **portada de Quality**: la puerta de entrada reconstruida sobre el contrato de B3, ordenada por urgencia y no por dominio. B2 no toca la portada. |
| **B5** | **Intelligence entre dominios**: el adaptador de proceso enriquecido y la composición de servidor que conserva procedencia, privacidad y frontera de permiso. B2 no toca Intelligence. |

Y fuera de los tres: ayuda global, tutoriales, vídeo de bienvenida, FAQ, planes, pagos y
el selector global de módulos siguen aplazados al sprint transversal.
