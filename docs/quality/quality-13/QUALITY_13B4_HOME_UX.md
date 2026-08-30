# QUALITY-13B4 · CÓMO SE LEE LA PORTADA

---

## 1 · La jerarquía

Lo primero que se ve es **qué requiere atención**, con su total. Los recuentos
administrativos van debajo y en pequeño. Un total de registros no es una señal, y una
portada que los pone al mismo nivel enseña a mirar el número equivocado.

Y ya no hay ningún bloque llamado «Desempeño»: esa palabra es de Personas (QI-25), y
llamar así a la completitud administrativa era el cuarto hallazgo de 13A.

---

## 2 · Los tres grupos, y por qué solo tres

| Grupo | Qué contiene |
|---|---|
| **Vencido** | la condición habla de una fecha que ya pasó |
| **Se acerca** | habla de una que llega |
| **Por su estado** | no habla de fechas: es cómo está la cosa ahora |

Quién cae en cuál lo dice B3, **observador por observador y declarado a mano**. No se
adivina por el nombre de la condición: un resumen que cuenta «vencidos» porque el código
termina en `_overdue` se equivoca el día que alguien nombre distinto una condición.

Y hay un cuarto contador, «sin fecha clara», para el caso que no se puede clasificar sin
mirar el aviso concreto. Contarlo como vencido sería contar como vencido lo que aún no lo
está.

**No hay alta / media / baja.** Trece dominios gradúan distinto y compararlos en una
escala inventada es comparar cosas que no se comparan.

---

## 3 · Cada línea

```
Revisión vencida: R-014
Riesgos y oportunidades · Riesgo activo cuya revisión prevista ya pasó · warning
Estado actual
```

Qué, de qué dominio, por qué, con qué gravedad —la del dominio, si la tiene— y de qué
momento habla. El enlace lleva a la causa.

**No dice quién lo observó.** Que lo haya visto un barrido, una regla de la empresa o el
estado del propio dominio es cierto y está guardado, pero no es asunto de quien entra a
trabajar.

Y cuando la condición se presta a leerse como una no conformidad, lo aclara **en la
línea**, no en un pie de página:

- «Estar fuera de meta no es por sí mismo una no conformidad.»
- «Un hallazgo no es una no conformidad hasta que la auditoría lo evalúa.»
- «Una queja sin revisar no es una no conformidad: alguien decide si abre un caso.»

---

## 4 · Cuando no hay nada, y cuando parece que no hay nada

| Situación | Qué se dice |
|---|---|
| todo leído · 0 asuntos | «No hay asuntos que requieran atención **según la información observada ahora mismo**.» |
| falta una fuente · 0 asuntos | «No hay asuntos a la vista, pero falta información por leer: **esto no es un “todo en orden”**.» |
| falta una fuente · con asuntos | el aviso va **arriba**, antes de los números |
| un bloque denegado | «Tu rol no da acceso a este dominio», sin recuento |
| un bloque roto | «No fue posible cargar esta información», sin recuento |

Ninguno de los dos últimos enseña un cero. Y el motivo técnico no se pinta jamás: quien
mira la pantalla no puede hacer nada con «PGRST301».

**La avería del motor de automatización se dice aparte**, y se dice que es una avería
técnica y no una condición de calidad — pero también que mientras dure puede faltar
información.

---

## 5 · Los filtros

Enlaces, no botones: se resuelven **en servidor** con los parámetros de B3. Filtrar en el
navegador sobre las ocho líneas visibles daría un total que no es un total.

- **Por dominio**, con el vocabulario de producto: Contexto, Procesos, Riesgos y
  oportunidades… nunca el nombre de una tabla.
- **Por proceso**, y entonces se ofrece **«Ver mirador del proceso»**, que lleva al
  mirador de B2 en vez de duplicarlo aquí.

Un dominio que no existe —una URL mal copiada— **se ignora** en vez de vaciar la portada:
un filtro roto no puede parecer «no hay nada».

Cambiar de dominio conserva el proceso, y al revés.

---

## 6 · Dónde entrar

Doce baldosas en el orden del menú, cada una con dos cosas distinguidas: **cuánto hay**
—contexto administrativo— y **cuántos asuntos que atender** —del resumen deduplicado—.

Contexto entra por fin: partes pertinentes y requisitos, con su enlace a Partes
interesadas.

Y la de Objetivos e indicadores conserva algo que la portada vieja daba y que se habría
perdido sin decirlo: **cuántos indicadores están en zona de atención**. Ningún observador
lo ve —no hay aviso para eso— y solo lo sabe su dominio, así que se enseña ahí y no en la
atención.

---

## 7 · «Asignado a ti», y por qué no es «Mi atención»

Lo que tiene asignado quien mira va en su propia franja, y dice explícitamente que **ya
está contado arriba**: es un subconjunto de lo de la empresa, no un total aparte.

Se evaluó ofrecer un filtro «Mi atención» por cargo (§19) y **se aplaza**. La asignación
de una tarea es un dato real —`assignee_profile_id`—, pero la propiedad en este sistema es
del **cargo**, no de la persona (QI-12). Filtrar por «mis cargos» exige resolver
usuario → cargos vigentes → sujetos de esos cargos, y hacerlo mal convertiría el
identificador de usuario en semántica de propiedad, que es justo lo que la decisión
congelada prohíbe. Se hará cuando esa resolución exista de verdad.

---

## 8 · Pantalla pequeña y accesibilidad

- La atención primero, siempre. En un teléfono es lo único que se ve sin desplazar.
- Baldosas en rejilla desde `sm`, apiladas debajo. **Ninguna tabla.**
- `h1` de la página → `h2` de cada zona → `h3` de cada grupo, sin saltos.
- Cada región con nombre accesible; la zona de filtros es un `nav` con su etiqueta.
- El estado nunca se dice solo con color: el distintivo ámbar lleva el número dentro.
- El filtro activo se marca con `aria-current`.

---

## 9 · Lo que la portada NO promete

No dice que la empresa cumpla nada. No hay puntuación de calidad, ni semáforo global, ni
«sistema conforme». Dice qué hay registrado hoy y qué se observó; el juicio es de quien
audita, no de una pantalla.
