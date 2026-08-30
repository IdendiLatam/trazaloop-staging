# QUALITY-13A · ESTRATEGIA DE PRUEBAS

Qué habría que comprobar en QUALITY-13, y —más importante— **qué tipo de prueba** sirve
para cada cosa. La lección de los tres sprints anteriores es que las tres capas se
necesitan y ninguna sustituye a otra.

---

## 1 · Las tres capas, y qué encuentra cada una

| Capa | Encuentra | No encuentra |
|---|---|---|
| **Estática** (lee el código) | separaciones rotas, vocabularios divergentes, lecturas sin acotar, cadenas de rol en la interfaz | nada sobre lo que ocurre al ejecutar |
| **Contra base real** (cliente de sesión) | RLS, CHECK, disparadores, aislamiento, idempotencia, `as_of` | cableado de pantalla |
| **De recorrido** (HTTP contra el build) | que el botón envía, con qué, y qué queda guardado | juicio visual |

**El defecto de B3A** —el formulario que no llevaba el análisis— lo encontró un navegador
después de 49 comprobaciones verdes de las dos primeras capas. **El defecto del guardián
de historia** lo encontró la segunda capa contra una comprobación que la primera no
podía ver. Las dos lecciones valen aquí.

---

## 2 · Por tramo

### B1 · Primitivas

- **estática, nueva en 13A.1:** recontar la matriz de integración desde el archivo y
  compararla con su bloque de resumen. Deriva **las dos** cifras del mismo documento, así
  que no es frágil: no hay número escrito a mano en la prueba. Es la comprobación que
  habría evitado el «130 celdas» de 13A.


- **base real:** cada propietario nuevo de `work_references` acepta lo que debe y
  **rechaza** las parejas que ya tienen tabla propia —una por una, no en bloque—;
- **base real:** una referencia a otra empresa se rechaza; la RLS no devuelve nada
  cruzado;
- **base real:** el cargador de proceso devuelve los recuentos correctos en los siete
  ejes, y **cero** en un proceso vacío;
- **estática:** ningún componente importa funciones de `lib/db`.

### B2 · Mirador

- **estática:** cada sección tiene tope de filas; ninguna consulta sin `limit`, `range`
  o `head: true`;
- **recorrido:** con datos en los siete ejes se ven los siete; sin datos, estados vacíos
  con texto, no ceros;
- **recorrido:** cada sección enlaza a su dominio y el enlace abre lo que dice;
- **base real:** un proceso de otra empresa da 404 y no filtra ni un recuento;
- **rendimiento, medido:** número de consultas **constante** con el tamaño del dominio.
  Es la prueba que impide el N+1 que se cuela solo.

### B3 · Convergencia — el tramo que más pruebas necesita

- **base real:** adoptar la plantilla que releva a un barrido hace que ese barrido
  **deje de emitir** para esa empresa;
- **base real:** el mismo problema aparece **una vez** aunque lo conozcan dos dominios
  (deduplicación por sujeto);
- **base real:** una empresa que no adopta nada recibe **exactamente lo mismo** que
  antes. Ninguna migración puede cambiar la bandeja de quien no pidió nada;
- **base real:** la fuente de proceso materializa hechos correctos y **no** observa
  procesos retirados;
- **base real:** corregir la condición resuelve la señal sola, como ya se comprueba en
  12.3B3B.

### B4 · Portada

- **base real:** ninguna cifra sale de las filas cargadas —se comparan contra la base—;
- **recorrido:** cada línea enlaza a la fila concreta, no al módulo;
- **estática:** la palabra «desempeño» no aparece en el bloque de atención;
- **recorrido:** una empresa recién creada ve una portada que lo dice, no doce ceros;
- **base real:** dos empresas, y ninguna ve una línea de la otra.

### B5 · Intelligence

- **base real:** una pregunta que cruza dominios devuelve hechos **citables** con
  identificador y enlace;
- **base real:** quien no puede ver un dominio **no lo recibe** en el contexto, ni
  resumido;
- **base real:** `as_of` no mezcla el presente;
- **estática:** toda pantalla integrada declara si presenta CURRENT, AS_OF o PERIOD
  (QI-29);
- **base real:** texto con aspecto de instrucción sigue llegando **como dato**;
- **base real:** cero llamadas a proveedor en las pruebas.

---

## 3 · Regresión obligatoria en cada tramo

Las **225 comprobaciones** ya existentes del área de Quality, más `test:all`, typecheck,
lint y build. **PASS solo con EXIT=0**, nunca leyendo símbolos.

Y dos que importan especialmente aquí:

- **independencia de módulo**: ninguna pantalla nueva enlaza a `/traceability` ni
  `/textiles`;
- **frontera de `work_references`**: en los dos sentidos, cada vez que se amplíe el
  vocabulario.

---

## 4 · Lo que NO hay que probar automáticamente

- Si el mirador **se lee bien** con veinte riesgos: eso es juicio humano.
- Si el orden de la portada es el orden en que la gente piensa.
- Si una ayuda ayuda.

Para eso, la matriz P1…Pn del sprint correspondiente, ejecutada como en 12.3B3A: la
máquina cubre lo mecánico y la persona mira lo que solo se ve mirando.

---

## 5 · Nombres previstos

`quality13b1-links` · `quality13b2-process-cockpit` · `quality13b3-attention` ·
`quality13b4-home` · `quality13b5-intelligence`, más el recorrido
`quality13-e2e`. Las estáticas entran en `test:all`; las de base real y recorrido se
corren aparte, como sus pares.
