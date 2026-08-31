# PE-02B5A · Matriz de pruebas

**Tres suites, 60 comprobaciones, 0 en rojo.**

| Suite | Naturaleza | Comprobaciones | Comando |
|---|---|---:|---|
| `tests/unit/pe02b5a-claims.test.ts` | estática · **redacción** | **27** | `npm run test:pe02b5a-claims` |
| `tests/rls/pe02b5a-security-audit.test.ts` | **base real** · invariantes | **20** | `npm run test:pe02b5a-security-audit` |
| `tests/rls/pe02b5a-drafts.test.ts` | **base real** · gobierno | **13** | `npm run test:pe02b5a-drafts` |

La estática entra en `test:all`.

---

## 1 · La matriz A–T del encargo

| | Qué | Dónde |
|---|---|---|
| A | La afirmación de aislamiento coincide con la RLS real | auditoría · A1–A4 |
| B | La salvedad de lo que se publica existe | redacción · B4 |
| C | La respuesta del personal lleva su salvedad de infraestructura | redacción · B1 · borradores · B2 |
| D | Ningún absoluto «nunca pueden acceder» | redacción · B2 |
| E | El contexto de IA está acotado a la empresa | auditoría · E1 |
| F | El modelo no accede a la base | auditoría · E2 · redacción · D1 |
| G | No hay contexto entre empresas | auditoría · E1, E2 |
| H | El anonimato es estructural | auditoría · F1, F2 · redacción · D3 |
| I | La afirmación de entrenamiento lleva fuente y fecha | redacción · C3, C4 · borradores · B4 |
| J | La conservación dice «hasta» y conserva sus excepciones | redacción · C1 |
| K | `store:false` **no** se describe como retención cero | redacción · C2 |
| L | El ajuste real de la cuenta **no se inventa** | redacción · C3 |
| M | El borrador legal es una versión nueva | borradores · C2 |
| N | La política vigente **no cambió** | borradores · C1 |
| O | **Nadie tiene que volver a aceptar** | borradores · C4 |
| P | Las respuestas de seguridad siguen en borrador | borradores · A1, A2 |
| Q | Ninguna aparece en `/faq` | borradores · A3, A4 |
| R | La procedencia está completa | borradores · B3, B4 · redacción · F1 |
| S | Sin afirmar cifrado, respaldos ni segundo factor | redacción · A1–A3 · auditoría · G1, G2 |
| T | `service_role` sin cambios | auditoría · E1 (contexto) · suites de B1–B4 |

---

## 2 · Las invariantes que sostienen lo publicable · 20

Se vuelven a medir, no se citan:

**A · Aislamiento** — ninguna tabla con `organization_id` sin control por fila;
las siete sin él son catálogos y ninguna se concede al anónimo; ninguna lectura
abierta; toda clave compuesta acotada en los dos lados.

**B · El visitante** — solo alcanza `legal_documents` por política; **una vista
con `organization_id` concedida al anónimo debe respetar la RLS de quien
pregunta**; y empíricamente no lee ni una fila de siete tablas de empresa.

**C · La plataforma** — solo siete tablas de empresa, y son las administrativas y
de soporte de siempre: si aparece una nueva, la prueba falla y la respuesta
publicada dejaría de ser cierta. Sin auto-alta en `memberships`. Sin
suplantación en todo el árbol.

**D · Archivos** — tres cubos, los tres privados; toda lectura acotada por
`is_org_member`.

**E · Intelligence** — cero clientes administrativos en el constructor de
contexto; ninguna herramienta de web, ficheros o código para el modelo;
`store: false` sigue puesto; todas las fuentes con clase de privacidad.

**F · Anonimato** — el guardián protege los cinco campos de identidad; las
fuentes anónimas están marcadas.

**G · Lo que no existe** — no hay autenticación reforzada implementada, y ninguna
respuesta publicada la menciona.

### Una que merece explicación

**B2** empezó siendo «ninguna vista con datos de empresa se concede al anónimo» y
fallaba con treinta vistas legítimas. La regla correcta —la que documentó 0141—
es que una vista **con `security_invoker`** evalúa la RLS de quien pregunta y le
devuelve cero filas; una **sin él** la evalúa su propietario y sí sería un
agujero. Las treinta lo declaran. La prueba dice ahora eso.

Antes de eso, la misma comprobación falló por confundir un **grant** con
**acceso**: Supabase concede por defecto sobre `public`, y la RLS es la que
niega. La versión final comprueba las dos cosas: la estructura de las vistas y,
empíricamente, que el anónimo no lee nada.

---

## 3 · Las pruebas de redacción · 27

Raras, y aquí justificadas: quince respuestas y una política son afirmaciones
públicas sobre seguridad. Si alguien «mejora» una quitándole una salvedad, la
convierte en falsa, y eso no lo detecta ninguna otra prueba.

**Todas admiten la forma negada.** «No afirmamos cifrado de extremo a extremo»
está bien; prometerlo, no. Es la lección de dos falsos positivos propios: uno
marcó `cifrado de extremo a extremo` dentro de su propia negación, y antes, en
B3, `te certifica` apareció dentro de «no emi**te certifica**ciones».

| Grupo | Qué protege |
|---|---|
| A | Sin ficción de marketing, sin certificaciones inexistentes, sin autenticación que no hay |
| B | Las salvedades que no se pueden quitar; sin absolutos; sin prometer auditoría de accesos; la excepción de lo publicado |
| C | «Hasta 30 días» con excepciones; `store:false` ≠ ZDR; el entrenamiento atribuido al proveedor; fuente oficial y fecha; lo que no se pudo comprobar |
| D | El modelo no accede a la base; no decide nada formal; el anonimato acotado |
| E | La sucesora es borrador; hereda identidad; cubre los módulos que existen y no los que no; separa las tres capas de la IA; nombra al proveedor entre los encargados; dice lo que no hay; admite lo público |
| F | Cada respuesta con su base; la auditoría clasifica; se volvió a medir; **el guion no publica nada**; las confirmaciones humanas están listadas |

---

## 4 · El gobierno de los borradores · 13

Quince entradas, todas `draft`, **cero revisiones**, invisibles sin sesión y con
ella, y no aparecen buscando su contenido.

Las dos que dependen del proveedor **se intenta publicarlas y la base las
rechaza**. La del personal lleva su salvedad escrita y marcada. Las trece
verificadas podrían publicarse — se comprueba que la barrera no las bloquearía,
sin publicarlas.

Y la parte más importante, que es la más aburrida: **la política vigente sigue
siendo `v1`**, el visitante no ve el borrador, y una persona que acepta hoy
acepta `v1` — nadie va a tener que volver a aceptar nada por este tramo.

---

## 5 · Regresión

| | Resultado |
|---|---|
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | **EXIT=0** |
| `npm run lint` | 0 errores · 66 avisos (línea base) |
| `npm run build` | **EXIT=0** |
| Suites de B1, B2, B3 y B4 | todas en verde |
| Cabecera de migraciones | **0158, sin cambios** |
