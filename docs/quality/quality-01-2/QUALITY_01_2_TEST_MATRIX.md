# QUALITY-01.2 · Matriz de pruebas

**Rama:** `fix/quality-01-2-process-relations-docs-map` · **Migraciones:** `0114`, `0115`

**93 comprobaciones propias de QUALITY-01.2**, sobre las 98 de QUALITY-01 y las
81 de QUALITY-01.1.

| Suite | Comando | Nº | Qué comprueba |
|---|---|---|---|
| Puras y estáticas | `test:quality012` | 44 | Invitaciones, disposición del mapa, causa del crash de documentos, auditoría de módulos, convenciones de 0114/0115 |
| Base real | `test:quality012-rls` | 33 | Relaciones, documentos de E/S, snapshot del mapa, revisiones, aislamiento, privilegios |
| Recorrido humano por HTTP | `test:quality012-ui` | 16 | El recorrido del encargo, de extremo a extremo |

La suite HTTP **no escribe una sola URL interna a mano**: cada destino sale del
`href` que renderiza la pantalla anterior, y la aceptación de la invitación se
envía como el propio formulario de la página —con los campos que Next genera
para identificar la acción de servidor—, no llamando a la acción por dentro.

---

# A · Invitaciones: eliminar el sesgo hacia PCR

*`test:quality012` · grupo A · 8 comprobaciones*

| # | Comprobación | Resultado |
|---|---|---|
| A1 | Sin contexto se aterriza en el **selector de módulos**, jamás en `/dashboard` | ✔ |
| A2 | Invitando desde PCR, Textiles, Quality o un área transversal: el mismo destino neutro | ✔ |
| A3 | Un `return_to` válido —ruta de inicio de un módulo entrable— se conserva | ✔ |
| A4 | Un módulo al que la empresa **no** puede entrar cae al selector | ✔ |
| A5 | Once formas hostiles de `return_to` se ignoran todas | ✔ |
| A6 | La action redirige al destino resuelto **en servidor**, no a `/dashboard` | ✔ |
| A7 | Elegir empresa tampoco desemboca en PCR | ✔ |
| A8 | El constructor del enlace no inyecta un módulo por su cuenta | ✔ |

**Casos hostiles de A5, uno por uno:** `https://evil.example.com`,
`//evil.example.com`, `///evil.example.com`, `http://localhost:3000/dashboard`,
`/quality/../../etc/passwd`, `javascript:alert(1)`, `/platform`,
`/quality/documents`, `"  /quality  extra"`, cadena vacía, solo espacios,
`quality` (sin barra inicial).

Los ocho casos del encargo (A–J) se cubren entre A1–A8 y el recorrido HTTP 16;
los de token inválido, expirado y reutilizado los cubre ya
`test:quality011-rls`, sin cambios: `accept_team_invitation` no se tocó.

---

# B · Relaciones entre procesos

*`test:quality012` grupo B (4) + `test:quality012-rls` grupo B (12)*

## Puras

| # | Comprobación | Resultado |
|---|---|---|
| B1 | La misma fila es «entrega a» en un proceso y «recibe de» en el otro | ✔ |
| B2 | Los cuatro extremos llegan a la pantalla sin perderse al separar | ✔ |
| B3 | La ficha ofrece las dos vistas y los dos formularios de creación | ✔ |
| B4 | Ambos puntos de vista escriben exactamente la misma estructura | ✔ |

## Base real

| # | Comprobación | Resultado |
|---|---|---|
| B1 | Crear desde el extremo **emisor** | ✔ |
| B2 | Crear desde el extremo **receptor** produce la misma estructura | ✔ |
| B3 | Una sola fila, leída como saliente y entrante según el proceso | ✔ |
| B4 | Dos flujos **distintos** entre el mismo par son legítimos | ✔ |
| B5 | El duplicado **exacto** se rechaza (`23505`) | ✔ |
| B6 | La salida debe pertenecer al proceso origen | ✔ |
| B7 | La entrada debe pertenecer al proceso destino | ✔ |
| B8 | Una salida no puede usarse como entrada | ✔ |
| B9 | La autorrelación se rechaza | ✔ |
| B10 | No se registran relaciones nuevas con un proceso retirado | ✔ |
| B11 | Las que ya existían **se conservan** al retirar | ✔ |
| B12 | Cross-tenant: otra empresa no ve ni crea relaciones ajenas | ✔ |

---

# C · Documentos en entradas y salidas

*`test:quality012-rls` grupo C · 10 comprobaciones*

| # | Comprobación | Resultado |
|---|---|---|
| C1 | Una **entrada** vincula un documento existente | ✔ |
| C2 | Una **salida** vincula un documento existente | ✔ |
| C3 | No se duplica el documento: solo se crea la relación | ✔ |
| C4 | El mismo documento puede definir dos entradas distintas | ✔ |
| C5 | El duplicado exacto sobre la misma entrada se rechaza | ✔ |
| C6 | La entrada debe pertenecer a **ese** proceso | ✔ |
| C7 | Un documento de otra empresa jamás puede vincularse | ✔ |
| C8 | La relación a nivel de proceso (0112) sigue igual | ✔ |
| C9 | Desvincular **no** borra el documento | ✔ |
| C10 | Cross-tenant: otra empresa no ve las relaciones documentales | ✔ |

---

# D · El mapa

*`test:quality012` grupo D (12) + `test:quality012-rls` grupo D (6)*

## Disposición y dibujo (puras, sin navegador)

| # | Comprobación | Resultado |
|---|---|---|
| D1 | Compras → Producción → Despachos con la dirección correcta | ✔ |
| D2 | Cada flecha nace y muere en el borde de su bloque | ✔ |
| D3 | Dos relaciones entre el mismo par no se superponen | ✔ |
| D4 | Una relación con un extremo fuera del mapa se **cuenta**, no se pierde | ✔ |
| D5 | Las bandas por categoría se conservan y no se solapan | ✔ |
| D6 | Con muchas relaciones las etiquetas dejan de mostrarse todas | ✔ |
| D7 | La etiqueta degrada bien cuando falta un extremo | ✔ |
| D8 | El mapa no ofrece dibujar conexiones a mano | ✔ |
| D9 | Los bloques se ordenan por **flujo**, no alfabéticamente | ✔ |
| D10 | Un ciclo entre procesos no rompe el mapa | ✔ |
| D11 | Ninguna etiqueta acaba encima de un bloque | ✔ |
| D12 | Las etiquetas se pintan **después** de los bloques | ✔ |

## Snapshot (base real)

| # | Comprobación | Resultado |
|---|---|---|
| D1 | Publicar **congela** las relaciones vigentes | ✔ |
| D2 | Cambiar una relación después **no** altera la versión publicada | ✔ |
| D3 | Una versión nueva refleja el estado actual sin tocar la anterior | ✔ |
| D4 | Nadie escribe el snapshot a mano: ni INSERT, ni UPDATE, ni DELETE | ✔ |
| D5 | Solo se congelan las relaciones con sus dos extremos en el mapa | ✔ |
| D6 | Cross-tenant: otra empresa no lee el snapshot | ✔ |

---

# E · Quality → Documentos → Crear documento

*`test:quality012` grupo E · 5 comprobaciones*

| # | Comprobación | Resultado |
|---|---|---|
| E1 | Las categorías son un array de verdad, recorrible | ✔ |
| E2 | La constante vive en el dominio; el formulario la importa de ahí | ✔ |
| E3 | **Invariante:** ningún módulo `"use server"` exporta valores | ✔ |
| E4 | **Invariante:** no se navega durante el render | ✔ |
| E5 | `module_key` se fija en servidor y el cliente no lo elige | ✔ |

**E3 y E4 barren todo el código ejecutable** (`app`, `components`, `lib`,
`server`), no solo Quality: son la clase de defecto, no el defecto.

E4 no usa una heurística de proximidad —da falsos positivos— sino un conteo de
profundidad de funciones sobre el archivo sin comentarios ni cadenas: una
llamada dentro de una función anidada corre después del render; una suelta en
el cuerpo del componente, durante. **La prueba se comprueba a sí misma:** antes
de barrer el repositorio verifica que marca el código exacto que fallaba y que
no marca el corregido. Un invariante que no puede fallar no protege de nada.

---

# F · Auditoría de listas de módulos

*`test:quality012` grupo F · 7 comprobaciones*

| # | Comprobación | Resultado |
|---|---|---|
| F1 | Todo módulo funcional tiene shell, ruta y **página real en disco** | ✔ |
| F2 | El registro y sus claves no pueden separarse | ✔ |
| F3 | Un documento se abre en **su** módulo, nunca en la ruta de PCR | ✔ |
| F4 | Ninguna pantalla de Quality enlaza a `/trazadocs/…` | ✔ |
| F5 | El nombre del módulo sale del registro, no de mapas repetidos | ✔ |
| F6 | Los módulos de TrazaDocs se **derivan** del registro, y la CHECK de la base los admite | ✔ |
| F7 | Una pantalla transversal no ofrece atajos de un solo módulo | ✔ |

F6 es la que impide el fallo silencioso del próximo módulo: si alguien lo añade
al registro sin ampliar la restricción de la base, **la prueba falla antes que
la aplicación**.

---

# M · Migraciones 0114 y 0115

*`test:quality012` grupo M · 7 comprobaciones*

| # | Comprobación | Resultado |
|---|---|---|
| M1 | Append-only: 0114 existe, sin renumerar ni duplicar prefijos | ✔ |
| M2 | No se toca ninguna migración anterior; sin `GRANT ALL` | ✔ |
| M3 | La tabla nueva declara RLS, aislamiento y privilegios explícitos | ✔ |
| M4 | El snapshot tiene **una sola** política, de lectura | ✔ |
| M5 | Las invariantes están en la base, no solo en la interfaz | ✔ |
| M6 | Publicar conserva los **nombres**, y es idempotente | ✔ |
| M7 | El snapshot es de solo lectura también donde el entorno concede de más | ✔ |
| M8 | Toda migración nueva está declarada en las **listas blancas** de las suites | ✔ |

**M8 nació de un error propio de este sprint.** Dieciséis suites llevan una
lista blanca de migraciones «autorizadas»; QUALITY-01.2 añadió dos y no las
declaró, así que `test:all` salía con **código 1**. El fallo estaba enterrado
entre ~1.400 comprobaciones verdes y se pasó por alto en dos ejecuciones
seguidas, hasta que se comprobó el código de salida de verdad en lugar de leer
el final del registro.

Esas listas **no se derivan a propósito**: su valor es que alguien tenga que
declarar cada migración. Lo que M8 arregla es que el olvido salga con nombre y
apellidos, en la suite del sprint, en vez de como una línea perdida.

La regla es la mínima que sirve —cada lista cubre un rango distinto, unas desde
0091 y otras desde 0101—: se exige que contengan lo que viene **después** de la
última que ya declaran, que es exactamente lo que un sprint nuevo añade. Y la
propia comprobación se protege por partida doble: falla si deja de encontrar
las listas (por si el marcador cambia de forma) y **se verificó quitando a mano
una entrada**, para confirmar que detecta la omisión.

---

# S · Privilegios (SQL directo)

*`test:quality012-rls` grupo S · 3 comprobaciones*

Solo corren cuando hay `SUPABASE_DB_URL`: los privilegios no se consultan por
PostgREST. Son las que descubrieron el defecto que 0115 corrige.

| # | Comprobación | Local | Staging |
|---|---|---|---|
| S1 | `authenticated` solo puede **leer** el snapshot | ✔ | ✔ |
| S2 | `anon` no conserva ningún privilegio | ✔ | ✔ |
| S3 | El snapshot no tiene política de escritura de ningún tipo | ✔ | ✔ |

---

# R · Revisiones: continuidad del modelo

*`test:quality012-rls` grupo R · 2 comprobaciones*

| # | Comprobación | Resultado |
|---|---|---|
| R1 | Abrir una revisión copia entradas, salidas **y sus documentos** | ✔ |
| R2 | Publicar reengancha las relaciones a las E/S vigentes | ✔ |

Ninguna de las dos estaba en el encargo. Aparecieron al perseguir el modelo:
sin R1 los documentos de una entrada se perderían en cada revisión, y sin R2
una relación seguiría apuntando a la revisión antigua después de publicar.

---

# Recorrido humano por HTTP

*`test:quality012-ui` · 16 comprobaciones*

Empresa **QUALITY-ONLY**: PCR y Textiles deshabilitados. Es el caso de la
decisión de producto, y garantiza que ningún enlace pueda apoyarse en ellos.

| # | Paso | Resultado |
|---|---|---|
| 1 | Selector: Quality ofrece «Entrar →» | ✔ |
| 2 | Entrar y tomar los destinos de la propia portada | ✔ |
| 3 | Los tres procesos en la lista; el detalle se abre desde ahí | ✔ |
| 4 | La ficha ofrece crear la relación desde sus dos extremos | ✔ |
| 5 | Registrar Compras→Producción y Producción→Despachos | ✔ |
| 6 | Producción muestra **de quién recibe**, con salida y entrada nombradas | ✔ |
| 7 | …y **a quién entrega**, en la misma ficha | ✔ |
| 8 | La misma relación se lee desde el otro extremo, sin duplicarse | ✔ |
| 9 | Documentos en una entrada y en una salida, enlazados a **Quality** | ✔ |
| 10 | Desvincular no borra el documento | ✔ |
| 11 | El mapa **dibuja** el flujo: flechas, puntas y etiquetas | ✔ |
| 12 | Publicar congela: cambiar una relación después no lo altera | ✔ |
| 13 | Documentos de Quality abre y ofrece crear | ✔ |
| 14 | «Crear documento» no revienta: las categorías **viajan al navegador** | ✔ |
| 15 | «Equipo» no saca a PCR y muestra el enlace de invitación | ✔ |
| 16 | Aceptar aterriza en el **selector de módulos** | ✔ |

**14 descarga el paquete de JavaScript** que el navegador recibe para esa
pantalla y comprueba que las categorías van dentro. Una prueba de servidor no
habría detectado el defecto: fallaba en el cliente.

**16 envía el formulario de verdad**, con los campos que Next renderiza para
identificar la acción, y comprueba el `Location` de la respuesta. Llamar a la
acción por dentro habría dado por bueno un redirect que el navegador nunca
hace.

---

# Regresión

| Suite | Nº | Resultado |
|---|---|---|
| `test:all` (~1.400 comprobaciones, 84 suites) | — | **exit 0**, verificado leyendo el código de salida |
| `test:rls` | 110 | ✔ |
| `test:quality01` | 41 | ✔ |
| `test:quality011` | 24 | ✔ |
| `test:quality01-rls` | 56 | ✔ |
| `test:quality011-rls` | 41 | ✔ |
| `test:quality01-ui` | 15 | ✔ |
| `test:quality011-ui` | 16 | ✔ |

## Pruebas ajustadas, ninguna debilitada

| Prueba | Antes | Ahora | Por qué |
|---|---|---|---|
| `quality-01-1-acceptance` M1 | «la última migración es 113» | 0113 existe y la cola **no retrocede** | El repositorio es append-only: fijar el número convertía cada sprint futuro en un fallo. Es el criterio que ya usaba QUALITY-01 |
| `quality-01-process-foundation` 50 | «hay exactamente 11 tablas» | ninguna tabla de Quality sin RLS, y **al menos** las 11 | Lo que protege es que ninguna quede sin RLS —eso no cambió—, no el número |
| `textiles-trazadocs` 12 | el tipo escrito literalmente | el tipo derivado **más** que el registro incluya los tres módulos | La exigencia es más fuerte: antes solo miraba el texto |
| 16 listas de migraciones | declaraban hasta 0113 | declaran también 0114 y 0115 | Son listas blancas: una migración nueva **tiene** que declararse. Ahora M8 avisa si se olvida |
