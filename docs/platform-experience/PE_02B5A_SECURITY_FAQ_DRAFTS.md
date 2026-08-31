# PE-02B5A · Las quince respuestas de seguridad

**Todas en BORRADOR.** Ninguna tiene revisión publicada, ninguna aparece en
`/faq`, y la categoría «Seguridad y privacidad» sigue sin ofrecerse.

En Local y en Staging. Se revisan en `/platform/faq` filtrando por esa categoría.

---

## 1 · Las quince

| # | Identificador | Pregunta | Estado de verificación |
|---|---|---|---|
| 1 | `seguridad_como_protege` | ¿Cómo protege Trazaloop la información de mi empresa? | verificada |
| 2 | `seguridad_otra_empresa` | ¿Puede otra empresa ver mi información? | verificada |
| 3 | `seguridad_como_separa` | ¿Cómo separa Trazaloop la información entre empresas? | verificada |
| 4 | `seguridad_equipo_trazaloop` | ¿Puede el equipo de Trazaloop acceder a los datos de mi empresa? | **con salvedad** |
| 5 | `seguridad_archivos` | ¿Cómo protege Trazaloop mis archivos y evidencias? | verificada |
| 6 | `seguridad_permisos` | ¿Cómo se controlan los permisos de las personas? | verificada |
| 7 | `seguridad_intelligence` | ¿Cómo protege Trazaloop Intelligence la información de mi empresa? | verificada |
| 8 | `seguridad_ia_otras_empresas` | ¿La IA utiliza información de otras empresas para responderme? | verificada |
| 9 | `seguridad_que_recibe_proveedor` | ¿Qué información recibe el proveedor de IA? | verificada |
| 10 | `seguridad_entrenamiento_modelos` | ¿Mis datos se utilizan para entrenar modelos? | **externa pendiente** |
| 11 | `seguridad_retencion_proveedor` | ¿Cuánto puede conservar el proveedor la información de una consulta? | **externa pendiente** |
| 12 | `seguridad_modelo_sin_base` | ¿El modelo puede acceder directamente a la base de datos? | verificada |
| 13 | `seguridad_ia_no_decide` | ¿Puede Intelligence modificar o aprobar información por su cuenta? | verificada |
| 14 | `seguridad_anonimato` | ¿Cómo se protege la identidad en las respuestas anónimas? | verificada |
| 15 | `seguridad_publicar` | ¿Qué información puede hacerse pública en Trazaloop? | verificada |

**Trece publicables.** Dos bloqueadas por la base hasta que una persona confirme
lo que el repositorio no puede saber — y bloqueadas de verdad: el intento de
publicarlas está probado y falla.

> **Actualización del 31 de agosto de 2026 (PE-02B6).** Las dos confirmaciones
> llegaron, las dos negativas, y las dos respuestas pasaron a
> `verified_with_qualifier`. **Ya no están bloqueadas**: las quince podrían
> publicarse. Siguen en borrador porque publicar es de B5B y depende de la
> aprobación editorial. Ver [`PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md`](PE_02B6_1_HUMAN_EDITORIAL_REVIEW.md).

Diez públicas y cinco con sesión. Las públicas son las que alguien consulta
**antes** de decidir si confía; las de sesión hablan del uso diario.

---

## 2 · La número 1 · la respuesta bandera

Resume **ocho capas verificadas**: sesión obligatoria, aislamiento en la base,
integridad acotada a la empresa, papeles, almacenamiento privado con enlaces
firmados, contexto de Intelligence compuesto en el servidor, historia
inmutable donde importa, y cifrado en tránsito.

Y termina diciendo lo que no hay:

> Ninguna medida elimina el riesgo por completo, y no afirmamos lo contrario.
> Tampoco tenemos certificaciones de seguridad propias: el cifrado en reposo y la
> infraestructura los aportan nuestros proveedores.

Un párrafo así al final de una respuesta de seguridad hace más por la confianza
que otro adjetivo.

---

## 3 · La número 4 · la más difícil de escribir

Dice, en este orden:

1. **En la operación normal, no** — y qué sí ve: plan, consumo, miembros, tickets.
2. **Sin suplantación y sin auto-alta**: no hay función para entrar como tú ni
   para añadirse a tu empresa.
3. **La salvedad**: como en cualquier servicio alojado, administrar la
   infraestructura implica acceso a los sistemas, y los respaldos contienen todo.
4. **Y lo dice explícitamente**: «no afirmamos que ese acceso sea imposible,
   porque no lo es en ningún servicio gestionado».
5. **Sobre el registro**: las operaciones de la plataforma quedan registradas;
   los accesos de infraestructura los registra el proveedor, y eso no lo controla
   Trazaloop.

El punto 3 **no se puede quitar**: sin él la respuesta es falsa. Está marcada
`verified_with_qualifier` y la salvedad va escrita en su metadato, así que la
base rechazaría publicarla sin ella. Y hay una prueba que falla si desaparece.

El punto 5 tampoco se puede mejorar: decir «todo acceso excepcional queda
auditado» sería afirmar algo que **no está verificado**.

---

## 4 · Las números 10 y 11 · lo que depende de un tercero

**10 · Entrenamiento.** Separa tres cosas: lo que hace Trazaloop (no entrena
modelos propios), lo que dice la política del proveedor (no se usa por defecto,
salvo autorización expresa) y lo que Trazaloop pide en cada consulta (que no
almacene). Y aclara que eso último **no es** retención cero.

**No dice** «Trazaloop no ha activado el uso para entrenamiento», porque eso es
un ajuste de cuenta y no consta.

**11 · Conservación.** Dice **«hasta 30 días»** con sus dos excepciones citadas.
No promete borrado inmediato, no confunde `store:false` con retención cero, y no
afirma que ninguna persona del proveedor acceda nunca a contenido almacenado.

Las dos llevan la fuente oficial y la fecha de consulta en su metadato.

---

## 5 · Las respuestas incómodas que se dicen igual

- **La 2 y la 15** admiten que lo que tu empresa publica deja de ser privado. No
  se presenta como fallo: es una función, y quien la usa debe saberlo.
- **La 14** acota el anonimato al **modo anónimo de campaña**. Dejar creer que
  toda encuesta es anónima sería peor que no decir nada.
- **La 5** dice que el cifrado en reposo es del proveedor, no de Trazaloop.
- **La 13** dice lo que Intelligence **no** hace, que es más útil que lo que hace.

---

## 6 · Lo que ninguna dice

`100 % seguro` · `inviolable` · `imposible de vulnerar` · `riesgo cero` ·
`grado militar` · `cifrado de extremo a extremo` · `conocimiento cero` ·
`privacidad absoluta` · `SOC 2` · `ISO 27001` · `segundo factor` ·
`nadie puede acceder nunca` · `borrado inmediato` · `retención cero contratada`.

Hay una prueba por cada familia, y admite la forma **negada** —«no afirmamos
cifrado de extremo a extremo» está bien; prometerlo, no—.

---

## 7 · Cómo revisarlas

En Staging: `/platform/faq` → filtro **Categoría: Seguridad y privacidad**.

Aparecen las quince como **Borrador**. Al abrir una:

- arriba: no hay nada publicado, y la vista previa muestra el borrador;
- debajo: el bloque de **procedencia**, con en qué se apoya, el estado de
  verificación y —en las dos externas— la fuente y la fecha;
- en las dos bloqueadas, el aviso de por qué **todavía no se puede publicar**.

**No pulsar publicar** en las trece verificadas: eso es B5B, tras aprobación.
Las dos bloqueadas lo rechazarán solas.
