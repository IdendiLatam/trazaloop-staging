# PE-02B3 · El contenido inicial de la FAQ

**Migración:** `0157_platform_faq_initial_content.sql` — 24 respuestas, 9 temas.
**No crea esquema.** Ni una tabla, ni una columna, ni una política.

---

## 1 · Por qué una migración y no un guion

El contenido de la FAQ es catálogo del producto, igual que las categorías que
sembró 0155 o las fuentes de IA que sembró 0154. Tiene que llegar a cada entorno
por el mismo camino que el resto del catálogo: en un guion que alguien ejecuta a
mano, Staging y Local dirían cosas distintas y nadie sabría cuál es la buena.

Además Preview lee de Staging: sin migración, la validación humana habría
encontrado una FAQ vacía.

---

## 2 · El problema de autorización, y cómo se resolvió sin debilitar nada

`faq_publish_entry` exige `is_platform_superadmin()`. Una migración corre sin
sesión, así que `auth.uid()` es nulo y esa comprobación falla. Tres salidas, dos
malas:

1. **Insertar las revisiones a mano.** Saltaría la barrera de verificación — la
   que impide publicar una afirmación sin comprobar. Es lo que el encargo
   prohíbe.
2. **Relajar la comprobación de `faq_publish_entry`.** Debilitar el guardián por
   comodidad de la siembra.
3. **Separar las dos cosas que esa función hacía:** comprobar *quién* publica, y
   comprobar *qué* se puede publicar.

Se hizo la tercera:

```
faq_publish_entry_internal(entry, idioma, nota, actor)
    · toda la sucesión y TODA la barrera de verificación
    · revocada para public, anon y authenticated: nadie de la aplicación llega

faq_publish_entry(entry, idioma, nota)
    · comprueba is_platform_superadmin()
    · delega en la interna con auth.uid()
    · su promesa no cambia ni una palabra
```

La barrera **se aplica también a la siembra**: si alguna de estas respuestas
llegara sin comprobar, la migración fallaría. Hay dos pruebas de ello —una
estática que verifica que la migración no inserta revisiones a mano, y una
contra base que rompe una respuesta sembrada y comprueba que deja de poder
publicarse.

La herramienta de siembra (`faq_seed_entry`) **se borra al final del archivo**:
existió para esto y dejarla sería dejar una puerta que crea y publica sin
comprobar quién llama.

Y es **idempotente**: el replay completo se ejecuta cada sprint, y volver a
aplicarla no duplica entradas ni crea revisiones si el texto no cambió.

---

## 3 · Lo que se publicó · 24 respuestas

| Tema | Cuántas | Públicas |
|---|---:|---:|
| Primeros pasos | 4 | 2 |
| Cuenta y empresa | 4 | 1 |
| Trazaloop Quality | 4 | 2 |
| Trazaloop PCR | 4 | 0 |
| Trazaloop Textiles | 1 | 1 |
| Documentos y evidencias | 3 | 1 |
| Trazaloop Intelligence | 1 | 0 |
| Planes | 1 | 0 |
| Soporte | 2 | 1 |

Ocho de las diez preguntas de `docs/FAQ_PILOT.md` se trasladaron, algunas
reescritas para hablar del producto entero y no solo de la beta de CPR.

**Por qué tantas exigen sesión:** las respuestas operativas —«¿por qué mi cálculo
salió 0 %?», «¿por qué la portada me muestra esto?»— hablan del uso diario y no
significan gran cosa para quien todavía no ha entrado. Las conceptuales —qué es
Trazaloop, si certifica, qué pasa con los datos al cambiar de plan— son públicas.

La consecuencia visible: **un visitante ve menos temas**, porque los vacíos para
él no se ofrecen. Es deliberado y está comprobado.

---

## 4 · Lo que NO se publicó, y por qué

| Qué | Por qué | Cuándo |
|---|---|---|
| Las diez de **Seguridad y privacidad** | su redacción depende de que la política de privacidad deje de ser preliminar y mencione al proveedor de IA | **B5** |
| «¿Mis datos se utilizan para entrenar modelos?» | depende de una política externa; la comprobación de OpenAI ya está registrada, la redacción es de B5 | **B5** |
| Cualquier cifra de precio, límite o cuota | la configuración comercial canónica llega en PE-04/05 y la FAQ no la duplica | **PE-04/05** |
| «¿Puedo dejar de compartir un pasaporte ya compartido?» | PE-02A la dejó sin comprobar, y sigue sin comprobarse | cuando se compruebe |

La categoría de seguridad **existe** en la base y **no se ofrece** en la
pantalla, porque no tiene contenido. Hay una prueba que verifica que la siembra
no publicó nada en ella.

---

## 5 · La disciplina editorial, aplicada

Cada respuesta lleva `verification_status = 'verified'` y su `source_basis`: la
migración, la política, el archivo o la medición donde se comprobó. Quien lea una
respuesta dentro de un año puede saber en qué se apoyaba.

Ninguna afirma cumplimiento ni certificación. La de ISO va clasificada
`normative_reference`, y dice lo contrario de lo que se teme:

> No. Trazaloop no emite certificaciones ni declara conformidad. Organiza tu
> información con criterios de las normas técnicas y te prepara para una
> auditoría; quien certifica es un organismo certificador.

Hay una comprobación que recorre todo lo sembrado y rechaza cifras comerciales,
afirmaciones de cumplimiento y contenido de las categorías aplazadas.

---

## 6 · Un hallazgo del camino

Al pasar la portada pública a leer del catálogo (PEH-19) se descubrió que **las
normas NTC 6632 y UNE-EN 15343 habían desaparecido** de la frase de PCR: PE-01B
las quitó por brevedad y en la portada seguían solo porque allí el texto estaba
escrito a mano. Se devolvieron a `ENTRY_COPY.cpr`, que es de donde ahora lee todo
el mundo. Quien busca trazabilidad de contenido reciclado busca por el número de
la norma.

Lo detectó una prueba de PCR-01 que exigía las normas en la portada. Estaba
haciendo su trabajo.

---

## 7 · `docs/FAQ_PILOT.md`

**No se borró.** Lleva ahora una cabecera que dice que está **sustituido**, que
la FAQ canónica se administra en `/platform/faq` y se lee en `/faq`, y que este
archivo no debe editarse: corregir allí no cambia lo que lee nadie.

Se conserva como registro de lo que se respondía a las empresas piloto.
