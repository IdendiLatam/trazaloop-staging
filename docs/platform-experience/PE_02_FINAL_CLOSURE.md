# PE-02 · Cierre

Ayuda y autoservicio. Ocho tramos, cuatro migraciones, y una publicación que
esperó a que una persona la aprobara.

*Cerrado en Staging el 31 de agosto de 2026.*

---

## Lo que había antes

Trazaloop no tenía ayuda. Ni una FAQ, ni un texto que explicara un campo, ni una
respuesta que enviarle a un cliente que pregunta por seguridad. La política de
privacidad vigente eran cinco párrafos que hablaban solo de CPR y se declaraban
preliminares — y existía, aprobado y **nunca publicado**, un paquete jurídico
completo del 27 de julio.

## Lo que hay ahora

Treinta y nueve respuestas publicadas, once ayudas contextuales administradas
desde la base, una consola para editarlas sin tocar el código, una política de
privacidad que cubre los cuatro módulos y el proveedor de IA, y una entrada
«Ayuda» en todas las pantallas.

---

## Los tramos

| Tramo | Qué hizo | Migración |
|---|---|---|
| **PE-02A** | Descubrimiento, arquitectura y **auditoría de afirmaciones de seguridad** | — |
| **PE-02B1** | Los cimientos: identidad estable, revisiones inmutables, barrera de verificación | 0155 |
| **PE-02B2** | La consola de contenido y el endurecimiento del versionado legal | 0156 |
| **PE-02B3** | La FAQ que ve el cliente · 24 respuestas | 0157 |
| **PE-02B4** | La ayuda contextual · el botón «i» · 11 ayudas | 0158 |
| **PE-02B5A** | Los borradores de seguridad, privacidad e IA | — |
| **PE-02B6** | Consolidación · las dos confirmaciones de la dirección | — |
| **PE-02B6.1** | El paquete editorial, para revisar sin entrar a la consola | — |
| **PE-02B6.2** | Correcciones editoriales y el intérprete de texto legal | — |
| **PE-02B5B** | **La publicación** | — |

Cuatro migraciones para ocho tramos. Las cuatro últimas no tocaron el esquema:
lo que faltaba era contenido y decisiones, no tablas.

---

## Lo que resultó difícil, y cómo se resolvió

### Sembrar contenido sin saltarse la barrera

0155 puso una barrera: no se publica lo que no está verificado. Pero las
migraciones que traen contenido inicial se ejecutan sin nadie autenticado, así
que no pueden llamar a la función de publicar.

La salida fácil habría sido insertar las revisiones a mano desde la migración —y
saltarse la barrera exactamente donde más importa—. Se hizo lo contrario:
**separar la autorización de la verificación**. `faq_publish_entry_internal` hace
todas las comprobaciones de contenido y no comprueba quién llama; el envoltorio
público comprueba quién llama y delega. La migración usa el interno, y la barrera
se ejecuta igual.

### Que la ayuda no tuviera dos verdades

La ayuda de partes interesadas existía como constante en el código. Al llevarla a
la base podía quedar duplicada. Se resolvió con una precedencia explícita: manda
la base, y si no hay, el texto de siempre. Y 0158 sembró las once **copiando** la
constante, así que estrenar la ayuda administrada no cambió una palabra de lo que
ya se leía.

El respaldo no sobra: es lo que evita que una avería de lectura se lea como «esta
pantalla no tiene ayuda». **Sin dato no es cero.**

### Afirmar sobre seguridad sin mentir

La tentación de una FAQ de seguridad es prometer. Se midió el esquema en vez de
citar informes: 289 tablas, 282 con control por fila, 0 de 321 columnas
`organization_id` sin él, 409 de 409 claves compuestas acotadas, 3 de 3 cubos
privados.

Y se declaró lo que **no** hay: sin segundo factor, sin inicio de sesión único,
sin cifrado propio, sin certificaciones propias, y con acceso de infraestructura
posible como en cualquier servicio gestionado. Esa última salvedad es la que hace
creíble el resto, y hay una prueba que falla si alguien la borra.

### Publicar un documento escrito en Markdown

Se descubrió tarde y por poco: `/privacy` pintaba el contenido como texto plano y
no había ningún intérprete de Markdown en el repositorio. Publicar la sucesora
habría enseñado al cliente los `##`, los `**` y las tuberías de sus seis tablas.

Se escribió un intérprete propio, sin dependencias nuevas, que **no produce HTML**
—devuelve datos, y React los pinta—, así que un `<script>` dentro de un documento
se ve en vez de ejecutarse.

---

## Las versiones legales

| | |
|---|---|
| `privacy v1` | archivada el 2026-08-31 · **texto intacto** · 153 aceptaciones conservadas |
| `privacy v1.1` | **vigente** desde el 2026-08-31 · sucede a la v1 |
| `terms v1` | vigente, sin cambios |

La v1.1 no se escribió de cero: es el paquete aprobado el 27 de julio con
Quality, Intelligence y el proveedor de IA añadidos, más un artículo 18 nuevo en
tres capas y un artículo 19 sobre lo que una empresa decide publicar.

**Producción sigue con su propio estado y no se tocó.**

---

## Las afirmaciones sobre seguridad

Dos confirmaciones que solo podía dar una persona, recibidas el 31 de agosto y
las dos negativas:

- **no hay** autorización activada de uso de datos para entrenamiento;
- **no hay** acuerdo de retención cero contratado.

Las dos respuestas que dependían de ellas pasaron de bloqueadas a publicables, y
las dos viajaron con su salvedad escrita: la política del proveedor está
verificada en su documentación; nuestra configuración la confirmó una persona.

El proveedor del entorno desplegado se verificó **sin tocar una credencial**,
leyendo el propio libro de ejecuciones de la plataforma: OpenAI. En Producción
**no hay proveedor configurado**, y por eso la política describe ese tratamiento
en condicional.

---

## Los entornos

| | |
|---|---|
| Local | migración 0158 · publicado |
| Staging | migración 0158 · publicado |
| **Producción** | migración **0111** · **sin tocar** · sin Quality, sin Intelligence, sin FAQ |

---

## Qué falta

### Revisión jurídica, antes de Producción

Nada de lo hecho es aprobación legal. Que las pruebas estén en verde significa
que lo que el documento afirma coincide con lo que la plataforma hace.

Pendiente para un abogado:
- la calificación responsable/encargado del artículo 5;
- si nombrar a la autoridad de vigilancia en el artículo 15;
- si la retención del artículo 17 basta sin plazos concretos;
- la transmisión internacional del artículo 12.

### Decisiones de negocio

- ¿Se nombra al proveedor de IA en el texto público?
- ¿Se corrige el paquete jurídico v1.0? Menciona a Resend, que no tiene
  integración, y cuatro de sus seis documentos no mencionan Intelligence.
- El canal alterno de privacidad es postal: ¿se confirma o se añade el teléfono?
- Tres dominios —`idendi.org`, `cirquiloconsultores.com`, `trazaloop.com`— sin
  explicar su relación.

### Ayuda contextual aplazada

Siete familias de pantalla sin ayuda administrada, en
[`PE_02B6_DEFERRED_HELP_BACKLOG.md`](PE_02B6_DEFERRED_HELP_BACKLOG.md). No es
deuda: es lo que se acotó para no inventar contenido. **No se inventó nada.**

### Una palabra que falta

Buscar «inteligencia artificial» no encuentra la respuesta 8, porque usa «IA».
Corrección de una línea, decisión de quien aprobó el texto.

### Producción

Llevar PE-02 a Producción es un tramo aparte que empieza por aplicar 47
migraciones. No es parte de este cierre.

---

## Lo que queda escrito

Cuarenta y nueve documentos en `docs/platform-experience/`, y un índice en
[`PE_STATUS.md`](PE_STATUS.md).

**PE-03 no ha empezado.** Reutilizará `PAGE_KEYS`, que por eso vive en
`lib/modules/` y no dentro de la ayuda.
