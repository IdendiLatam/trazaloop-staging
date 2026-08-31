# PE-02A · Estrategia de pruebas

Lo que PE-02B tendrá que demostrar. No se escribe ninguna prueba en PE-02A: se
escribe **qué tendría que fallar** para que la ayuda y la FAQ no valgan.

---

## 1 · Las cuatro suites

| Suite | Naturaleza | Qué solo ella puede probar |
|---|---|---|
| `pe02-help` | estática | contratos, claves declaradas, estilo, fronteras editoriales |
| `pe02-help-ui` | jsdom | que el botón «i» siga siendo accesible y que un borrador no llegue al HTML |
| `pe02-faq-access` | **base real** | quién lee qué: anónimo, miembro, admin de empresa, `support`, `superadmin` |
| `pe02-faq-e2e` | **HTTP** | que la FAQ pública se lea **sin cookie** y que ningún enlace muera |

Las dos puras entran en `test:all`; las dos que necesitan base o servidor se
corren aparte, como el resto del repositorio.

---

## 2 · Aislamiento y visibilidad · la parte que no se puede fallar

| # | Escenario | Exigencia |
|---|---|---|
| **S1** | Sin sesión, se pide la FAQ | Solo entradas `published` **y** `public`. Nada más |
| **S2** | Sin sesión, se pide una entrada `authenticated` por su identificador | No se devuelve |
| **S3** | Sin sesión, se pide un **borrador** | No se devuelve — ni su pregunta |
| **S4** | Sin sesión, se pide una entrada **despublicada** | No se devuelve |
| **S5** | Sin sesión, se piden las **revisiones** | No se devuelven: la historia es de plataforma |
| **S6** | Sin sesión, se piden columnas internas (autor, nota de cambio, notas internas) | No se devuelven |
| **S7** | Miembro con sesión | Ve `public` + `authenticated` publicadas; ni borradores ni historia |
| **S8** | Miembro de la empresa A y miembro de la empresa B | **Ven exactamente lo mismo**: la FAQ es catálogo, no dato de empresa |
| **S9** | La tabla de FAQ | **No tiene `organization_id`**. Comprobación estructural, no de comportamiento |
| **S10** | `support` de plataforma | Ve todo, incluida la historia. **No** puede escribir |
| **S11** | `superadmin` | Escribe |
| **S12** | Administrador de una **empresa** | **No** puede crear, editar ni publicar ninguna entrada global |
| **S13** | Una entrada que habla de un módulo **no contratado** | Se lee igual: visibilidad ≠ derecho de módulo (PEH-05) |
| **S14** | Ninguna ruta de FAQ usa el cliente administrativo | Comprobación estática sobre los archivos nuevos (§32) |

**S3, S12 y S14 son las tres que justifican la suite contra base real.** Las
otras se pueden aproximar; estas tres solo se demuestran con RLS puesta.

---

## 3 · Publicación e historia

| # | Escenario | Exigencia |
|---|---|---|
| P1 | Publicar dos veces seguidas | Nace la revisión 2 y se **cierra** la 1, con su fin de vigencia |
| P2 | Una entrada tiene siempre **una** revisión vigente | Índice único; dos abiertas es imposible |
| P3 | Editar una revisión publicada | **Rechazado**. Solo se puede cerrar, y una sola vez |
| P4 | Borrar una revisión | **Rechazado** |
| P5 | Restaurar contenido antiguo | Se puede: publicar de nuevo ese texto **crea** una revisión, no borra historia |
| P6 | Publicar con `verification_state = external_pending` | **Rechazado** (PEH-11) |
| P7 | Publicar sin texto | Rechazado, con mensaje claro |
| P8 | Cada revisión registra **quién** y **cuándo** | Comprobado tras publicar |
| P9 | Reclasificar `normative_class` | Crea revisión; no es una edición |

Nueve exigencias que son, salvo P6, **exactamente** las que 0136 ya cumple para
la guía de autoría. Si PE-02B se aparta de ese patrón, estas pruebas lo dirán.

---

## 4 · Afirmaciones de seguridad · procedencia

Esto es lo que impide que la FAQ envejezca mintiendo.

| # | Exigencia |
|---|---|
| **Q1** | Toda entrada de la categoría *Seguridad y privacidad* tiene `evidence_basis` no vacío |
| **Q2** | Ninguna entrada publicada tiene `verification_state = external_pending` |
| **Q3** | Ninguna respuesta publicada contiene: `SOC 2`, `ISO 27001`, `certificad`, `cifrado de extremo a extremo`, `zero-knowledge`, `conocimiento cero`, `pentest`, `residencia de datos` — salvo para **negarlos** |
| **Q4** | La respuesta sobre acceso del personal de Trazaloop **conserva su salvedad**: si desaparece el párrafo de administración de infraestructura, la prueba falla |
| **Q5** | La respuesta sobre entrenamiento de modelos **no está publicada** mientras su estado sea externo |
| **Q6** | Ninguna respuesta escribe un precio, un límite ni una cuota en cifras (PEH-16) |
| **Q7** | Ninguna respuesta de FAQ ni de ayuda afirma conformidad o certificación normativa |

**Q4 merece defensa.** Es rara —una prueba que exige que un texto siga
diciendo algo incómodo— y es la más valiosa de las siete: el día que alguien
«mejore» esa respuesta quitándole la salvedad, la habrá convertido en falsa. La
prueba es el único sitio donde eso queda anotado.

---

## 5 · Medidas de aislamiento · que no se degraden en silencio

La auditoría midió el esquema. Esas medidas deberían **convertirse en pruebas**,
porque son las que sostienen la respuesta C1:

| # | Exigencia | Hoy |
|---|---|---|
| R1 | Ninguna tabla con `organization_id` sin control de acceso por fila | 0 de 321 |
| R2 | Ninguna política de lectura sobre tabla de empresa con condición `true` | 0 |
| R3 | Ninguna política nueva alcanza al rol anónimo salvo la lista conocida | 1: documentos legales · +1 con la FAQ pública |
| R4 | Toda clave foránea compuesta que incluya `organization_id` lo lleva **en los dos lados** | 409 de 409 |
| R5 | `platform_staff` no aparece en ninguna política de tabla de **contenido** | 7 tablas, todas administrativas o de soporte |

Ya existe `tests/rls/check-rls-enabled.sql`; R1 probablemente esté cubierta. R2,
R4 y R5 son nuevas y son baratas: una consulta cada una.

**Por qué importa:** la respuesta C1 es la afirmación pública más fuerte del
producto. Si una migración futura la vuelve falsa, hay que enterarse por una
prueba en rojo, no por un cliente.

---

## 6 · Ayuda contextual

| # | Exigencia |
|---|---|
| H1 | Toda clave de página referenciada por una ayuda **existe** en el catálogo declarado en el código |
| H2 | Sin contenido, el botón «i» **no se pinta**: ni botón, ni panel vacío |
| H3 | El panel sigue siendo accesible: `aria-expanded`, `aria-label`, Escape, foco devuelto |
| H4 | El contenido **nunca** se interpreta como HTML |
| H5 | Un borrador de ayuda **no** llega al HTML de una página de producto |
| H6 | La ayuda no contiene datos de ninguna empresa: su tabla no tiene `organization_id` |
| H7 | La puerta comercial de la guía de TrazaDocs **no cambia**: en Demo el texto administrado sigue sin salir de la base |

**H7 es una prueba de regresión, no de la funcionalidad nueva.** Es la promesa de
QUALITY-12.2A, y PE-02 pasa cerca de ella.

---

## 7 · Búsqueda

| # | Exigencia |
|---|---|
| B1 | Buscar devuelve solo entradas visibles para quien busca (se hereda de S1–S7) |
| B2 | Buscar **sin sesión** no puede devolver una entrada `authenticated`, aunque el término coincida |
| B3 | Buscar no filtra el texto de un borrador en un fragmento de resultado |
| B4 | Sin resultados se dice que no hay, no se muestra una lista vacía sin explicación |
| B5 | No hay ninguna llamada a un servicio externo ni al proveedor de IA (comprobación estática) |

**B2 y B3 son las que importan**: una búsqueda es la vía habitual por la que se
escapa contenido que la pantalla no enseñaba.

---

## 8 · Recorridos por HTTP

Contra el build de producción, como el resto del repositorio.

| | Recorrido |
|---|---|
| E1 | `/faq` responde **sin cookie**, con las públicas y solo con ellas |
| E2 | Con sesión aparecen además las autenticadas |
| E3 | Filtrar por categoría y buscar funcionan sin sesión |
| E4 | Una entrada despublicada devuelve «no existe», no un 500 |
| E5 | **Ningún enlace de la FAQ da 404 ni 500** — en las dos formas de visitante |
| E6 | La FAQ es alcanzable desde el pie público y desde la ayuda dentro del producto |
| E7 | El superadministrador publica, y el cambio se ve en la vista pública |
| E8 | Una persona sin papel de plataforma que abre la consola de FAQ **vuelve a la puerta** (regresión PE-D2) |

---

## 9 · Lo que estas pruebas NO deben hacer

- **No** llamar a ningún proveedor de IA.
- **No** escribir en Staging ni en Producción.
- **No** dar por buena una pantalla porque devuelva 200: en E5 se abre cada
  enlace.
- **No** comprobar la redacción palabra por palabra. Las pruebas de contenido
  (Q3–Q7) buscan lo **prohibido**, no lo exacto: una FAQ que no se puede
  reescribir sin romper una prueba es una FAQ que nadie va a mantener. Las dos
  excepciones son la frase congelada de Quality y la salvedad de C3, y las dos
  están anotadas como tales.
