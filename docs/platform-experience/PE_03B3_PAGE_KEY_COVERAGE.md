# PE-03B3 · Qué pantallas tienen tutorial, y qué pasa con las demás

El registro de claves tiene **once entradas**. El shell tiene **147 pantallas**.
Ese hueco no es un descuido: es la decisión, y este documento la explica.

---

## 1 · El registro, hoy

| Clave | Pantalla | Ruta de hoy |
|---|---|---|
| `quality.context.interested_parties` | Quality · Partes interesadas | `/quality/context/interested-parties` |
| `quality.processes` | Quality · Procesos | `/quality/processes` |
| `quality.processes.detail` | Quality · Ficha de proceso | `/quality/processes/[id]` |
| `quality.risks` | Quality · Riesgos | `/quality/risks` |
| `quality.indicators` | Quality · Indicadores y objetivos | `/quality/indicators` |
| `quality.documents` | Quality · Documentos | `/quality/documents` |
| `quality.cases` | Quality · Casos y acciones | `/quality/cases` |
| `cpr.recycled_content` | PCR · Contenido reciclado | `/recycled-content` |
| `cpr.traceability.inventory` | PCR · Inventario | `/traceability/inventory` |
| `textiles.passports` | Textiles · Pasaportes | `/textiles/passports` |
| `platform.modules` | Plataforma · Puerta de módulos | `/modules` |

Siete de Quality, dos de PCR, una de Textiles y una transversal.

**Es el mismo registro que la ayuda contextual de PE-02B4.** No se creó una
segunda familia de claves para los vídeos, y una prueba lo vigila (D5). Dos
registros paralelos para la misma pantalla se desincronizan el día que alguien
añade una clave en uno y se olvida del otro.

---

## 2 · Por qué once y no ciento cuarenta y siete

Porque una clave sin contenido no sirve a nadie.

El registro empezó por lo que la ayuda administrable necesitaba, y crece cuando
alguien necesita una entrada más. Un registro con 147 claves vacías haría más
difícil encontrar las 11 que sí tienen algo, y convertiría la consola de
tutoriales en una lista de pantallas sin vídeo.

La consecuencia práctica: **en las otras 136 pantallas el botón no se pinta**.
No aparece apagado ni escondido con CSS. No existe. Un botón deshabilitado
invita a preguntarse qué se hizo mal, y no se hizo nada mal.

---

## 3 · De una ruta a su clave

`resolvePageKeyForPath()` compara **segmento a segmento**, no por prefijo, y gana
la ruta más específica que encaja.

La razón es concreta:

```
/quality/processes        →  quality.processes
/quality/processes/8f2c…  →  quality.processes.detail
```

Con una comparación por prefijo a secas, la ficha de un proceso recibiría el
tutorial del listado — un vídeo **de otra pantalla**, que es peor que ninguno. Un
tutorial equivocado se ve entero antes de que alguien se dé cuenta de que no era
ese.

Las reglas, en orden:

1. El número de segmentos tiene que coincidir. `/quality/processes` no encaja en
   `/quality/processes/[id]`.
2. Un segmento `[algo]` casa con cualquier cosa; el resto tiene que ser literal.
3. A igualdad de longitud gana la que tiene **menos comodines**: una ruta
   literal describe la pantalla mejor que una con parámetros.
4. Si ninguna encaja del todo, se devuelve `null`. Una pantalla sin clave no
   admite tutorial, y eso es **una respuesta, no un fallo**.

Las once entradas se resuelven a su propia clave, comprobado una por una (D1).

---

## 4 · Y esto no convierte la ruta en la identidad

Es la distinción que PE-02 congeló, y aquí conviene repetirla porque el código
parece decir lo contrario.

La función mira dónde está la persona **ahora**. Lo que devuelve es la clave, y
la clave es la identidad. Si mañana `/quality/risks` se muda a
`/quality/risk-register`, se corrige la `route` en el registro y **nada más**: el
tutorial conserva su clave, sus versiones, su historia de publicación y la ayuda
contextual que cuelga de esa misma clave.

Lo contrario —guardar la ruta en la base y buscar por ella— habría hecho que
cambiar una dirección rompiera silenciosamente el tutorial de esa pantalla.

---

## 5 · Cómo se amplía

1. Añadir la entrada en `PAGE_KEYS` (`lib/modules/page-keys.ts`) con su clave,
   su etiqueta, su módulo y su ruta de hoy.
2. Crear el tutorial en `/platform/tutorials`, que solo ofrece claves del
   registro.
3. Subir una versión y publicarla.

No hace falta tocar la pantalla. El botón aparece solo, porque vive en la barra
del shell y resuelve la clave por su cuenta.

---

## 6 · Lo que queda pendiente

Las 136 pantallas restantes no tienen clave y por tanto no admiten tutorial. Eso
es un backlog de contenido, no una deuda técnica: cada una entra el día que
alguien tenga algo que enseñar en ella.

El repaso de cobertura —decidir cuáles merecen vídeo y en qué orden— es de
PE-03B5.
