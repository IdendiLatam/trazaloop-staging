# QUALITY-12.3B3A · VALIDACIÓN HUMANA

**Estado: preparada, NO ejecutada.** Nada de lo que sigue está dado por bueno: son las
diez cosas que hay que mirar con los ojos, en Preview, antes de declarar nada.

---

## 0 · Antes de empezar

1. Abre el **Preview**:
   `https://trazaloop-production-64ygj26gk-idendi-latam-s-projects.vercel.app` Usa una empresa de Staging con
   **Quality** habilitado. Vercel SSO sigue activo: la primera vez pedirá acceso.
2. Ve a **Quality → Contexto → Partes interesadas → Categorías** y pulsa
   **«Sembrar las categorías iniciales»**. Es el primer paso de la validación y además
   lo que necesita el archivo de datos.
3. Aplica `docs/quality/quality-12.3/qa/QA_Q123_FIXTURES.sql` en el editor SQL de
   Staging, cambiando la única línea marcada por el nombre de esa empresa.

Los datos de prueba montan cuatro partes interesadas, cuatro entradas, dos estrategias
—una general y una específica—, una revisión sin cambios y una sucesión de análisis.
Todo prefijado `QA Q123`. El archivo trae al final las instrucciones para borrarlo.

---

## P1 · Navegación y resumen

- [ ] El menú de Quality tiene **Contexto** y va primero.
- [ ] Dentro está **Partes interesadas** y abre.
- [ ] El título y la descripción se entienden sin haber leído la norma.
- [ ] El botón **«i»** del título abre, se lee y se cierra con Escape.
- [ ] Las seis tarjetas cuadran con lo que hay: 2 pertinentes, 1 en evaluación,
      2 requisitos, 2 estrategias, 0 vencidas, 0 pertinentes sin estrategia.
- [ ] Al pulsar una tarjeta, la lista queda filtrada por ella.
- [ ] Ninguna cifra se presenta como «desempeño» ni promete conformidad.

## P2 · Listado, búsqueda y filtros

- [ ] Aparecen juntos la entidad externa y el colectivo, distinguidos por su insignia.
- [ ] Buscar «Empaques» encuentra la fila.
- [ ] Filtrar por **Pertinencia → No pertinente** deja solo la fundación, y se ve su
      justificación al abrirla.
- [ ] Filtrar por **Estado de revisión → Sin estrategia** deja las que no tienen.
- [ ] Con pocos datos no aparece el paginador; **crea una decena de análisis** y
      comprueba que aparece, que la segunda página trae filas distintas y que **buscar
      encuentra una fila que no estaba en la primera página**.
- [ ] «Quitar filtros» devuelve la lista completa.

## P3 · Análisis y pertinencia

- [ ] Registrar una parte nueva: el selector muestra entidades que ya existen y avisa de
      cuáles son ya cliente o proveedor.
- [ ] Marcar **No pertinente** hace obligatoria la justificación; sin ella no deja.
- [ ] Poner una puntuación sin decir en qué se apoya es rechazado con un mensaje
      entendible (nada de nombres de restricción ni SQL).
- [ ] En la ficha, **Sustituir análisis** pide confirmación y la confirmación dice que
      el anterior se conserva.
- [ ] Tras sustituir, el anterior sigue en **Historia** y no se puede editar.

## P4 · Necesidades, expectativas y requisitos

- [ ] Los tres tipos se distinguen y cada uno explica qué es.
- [ ] Elegir **Requisito** obliga a un subtipo; elegir necesidad o expectativa no lo pide.
- [ ] **Convertir** una necesidad exige motivo, confirma, y después **la necesidad sigue
      ahí** y el requisito nuevo dice de dónde viene.
- [ ] Retirar una entrada la marca como retirada y aparece en Historia; no desaparece.

## P5 · Procesos

- [ ] Los procesos se relacionan **dentro de un requisito**, no desde la parte.
- [ ] Se ve el proceso, el tipo de relación y **desde cuándo**.
- [ ] «Terminar vínculo» lo cierra y sigue constando.
- [ ] Una necesidad no ofrece relacionar procesos.

## P6 · Estrategias

- [ ] Crear una **general**: no pide requisitos y queda marcada como general.
- [ ] Crear una **específica** con dos requisitos: queda como «Atiende varios
      requisitos (2)».
- [ ] El responsable solo se puede elegir entre **cargos**; no hay campo de texto ni de
      persona.
- [ ] El método de seguimiento ofrece los once mecanismos y no presupone encuesta.
- [ ] Sin cadencia y sin fecha prevista, **no** aparece «Revisión vencida».
- [ ] Activar y cerrar funcionan; cerrar pide confirmación y explica que se conserva.

## P7 · Seguimiento y relacionado

- [ ] En una parte que además es cliente, aparece el bloque de **Voz del cliente** con
      su enlace, y el enlace abre la ficha correcta.
- [ ] Lo mismo con **Proveedores** en la que es proveedor.
- [ ] Ninguno de los dos bloques reproduce métricas: solo contexto y enlace.
- [ ] **Relacionar** ofrece indicador, objetivo, riesgo, acción, documento… en lenguaje
      de producto. En ningún sitio aparece `owner_kind`, `ref_kind` ni un UUID.
- [ ] **No** se ofrece relacionar un proceso a un requisito ni un requisito a una
      estrategia por esta vía: eso vive en sus secciones.

## P8 · Revisiones e historia

- [ ] Registrar **«Revisado, sin cambios»** deja constancia y **no** crea un análisis
      nuevo.
- [ ] Registrar **«Se requieren cambios»** queda registrado como tal.
- [ ] **Escalado** exige nota.
- [ ] La estrategia revisada pasa a «Al día» y muestra su última revisión.
- [ ] Historia distingue **Vigente / Sucedido / Cerrado** y nada de eso ofrece editarse.

## P9 · Estado en fecha

- [ ] En el colectivo *QA Q123 · Trabajadores*, elegir una fecha de hace tres meses
      muestra la **primera** lectura, no la de hoy.
- [ ] Aparece el aviso «Estás viendo el estado del …» y la insignia correspondiente.
- [ ] En ese modo **no hay un solo botón que escriba**; los de buscar y volver sí
      funcionan.
- [ ] Los requisitos y las estrategias mostrados son los de esa fecha, no los de hoy.
- [ ] «Volver al estado actual» devuelve la ficha normal.

## P10 · Independencia y móvil

- [ ] En una empresa con **Quality y sin PCR/Textiles**, todo lo anterior funciona igual.
- [ ] En un teléfono la lista se ve como tarjetas legibles, no como una tabla cortada.
- [ ] La ficha se recorre con el índice de secciones y ninguna queda ilegible.
- [ ] Con el teclado se puede llegar a los botones, abrir un diálogo, moverse por él y
      cerrarlo con Escape.
- [ ] Las insignias se entienden **sin depender del color** (léelas en escala de grises).

---

## Qué hacer con lo que salga

Anota cada hallazgo con la pantalla, lo que esperabas y lo que pasó. Si algo obliga a
tocar el esquema, **para y dilo**: B3A es interfaz sobre 0149/0150 y no debe nacer una
0151 para acomodar una pantalla.

Los defectos de la propia interfaz se corrigen en un B3A.1; lo que sea decisión de
producto —qué reglas de automatización, qué contexto de Intelligence, qué lleva el
PDF— es B3B.
