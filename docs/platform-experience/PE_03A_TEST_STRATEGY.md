# PE-03A · Cómo se comprobará PE-03B

Las 23 comprobaciones que el encargo pide, más lo que la arquitectura añade, con
el nivel al que hay que hacer cada una. El nivel importa: media docena de estas
son verdes por accidente si se hacen contra la tabla equivocada.

---

## PET-43 · Los cinco tramos

| | Qué hace | Migración |
|---|---|---|
| **B1** | Datos, cubo y RLS · el motor, sin pantalla | 1 |
| **B2** | La consola: subir, previsualizar, publicar, historia, reponer | — |
| **B3** | El botón en la barra y el reproductor | — |
| **B4** | Bienvenida y preferencia por persona | 1 |
| **B5** | Cobertura de la primera ola y endurecimiento | — |

**Dos migraciones.** Podrían ser una, pero B4 introduce el primer resorte de
preferencias de la plataforma y merece ir sola: se revisa distinto una tabla de
contenido que una que guarda lo que cada persona pidió.

El orden no es negociable: B3 no puede probarse sin B1, y B4 no puede
comprobar la regla de PET-31 sin el motor de versiones de B1.

---

## PET-44 · Qué se comprueba, y a qué nivel

### El motor y los permisos · base real

| | Qué demuestra | Nivel |
|---|---|---|
| **A** | Un superadministrador sube y la versión nace | base |
| **B** | Una persona normal **no** puede subir · ni reservar, ni escribir en el cubo | base + Storage |
| **C** | Una candidata **no se ve** por la vía normal | base + HTTP |
| **D** | La publicada se reproduce | HTTP |
| **E** | Publicar una versión nueva **no toca los bytes** de la anterior | base + Storage |
| **F** | La historia se conserva entera | base |
| **G** | Reponer crea cronología nueva, **sin reabrir** el periodo viejo | base |
| **U** | Ni borradores ni históricas son accesibles a una persona normal | Storage |
| **V** | Una subida fallida no produce tutorial visible | base |
| **W** | El almacenamiento de tutoriales **no cuenta** en la cuota de ninguna empresa | base |

**La E es la que más fácil sale verde por accidente.** Comprobar que la fila
antigua sigue ahí no demuestra nada: hay que comprobar que **el objeto** de la
versión anterior conserva su resumen SHA-256 y su tamaño. Si alguien sobrescribe
la ruta, la fila no se entera.

**La G tiene la misma trampa.** Hay que asertar que el `effective_to` de la
versión repuesta **no cambió**, no solo que existe una versión nueva. Reabrir el
periodo antiguo es exactamente el error que PET-20 prohíbe, y produce una historia
que se lee bien y miente.

**La W no se comprueba con una promesa**, se comprueba con la consulta real de
`v_module_usage` antes y después de subir un tutorial: el número tiene que ser el
mismo.

### La pantalla · HTTP y DOM

| | Qué demuestra | Nivel |
|---|---|---|
| **H** | Sin vídeo, el botón dice «en actualización» y **no** pinta un reproductor | HTTP |
| **I** | El botón se resuelve por `page_key`, no por la ruta | unidad + HTTP |
| **J** | Cambiar la ruta de una pantalla **no** cambia la identidad del tutorial | unidad |
| **K** | Quality, PCR y Textiles son independientes · sin respaldo entre módulos | HTTP |
| **L** | Una cuenta Demo/Free ve el tutorial de una pantalla a la que entra | HTTP |
| **S** | Se reproduce en escritorio y en móvil | humano |
| **T** | Adelantar funciona · `206` y rango correcto | HTTP |

**La J se prueba sin tocar el código de las páginas:** se cambia el `route` de una
entrada del registro y se comprueba que el tutorial sigue siendo el mismo. Si la
identidad dependiera de la ruta, esa prueba fallaría, y es la única forma de
demostrar que no depende.

**La T no se delega al navegador.** Se pide la URL firmada con una cabecera
`Range` y se comprueba `206` y `content-range`, como hizo la sonda de PE-03A.

### La bienvenida · base y HTTP

| | Qué demuestra | Nivel |
|---|---|---|
| **M** | Aparece en `/modules`, no antes | HTTP |
| **N** | **Nunca** estorba la aceptación legal | HTTP |
| **O** | Cerrar la oculta en esta sesión | DOM |
| **P** | «No volver a mostrar» persiste entre sesiones | base + HTTP |
| **Q** | La preferencia de una persona no afecta a otra | base |
| **R** | Publicar la v2 **no resucita** la bienvenida a quien dijo que no | base |

**La N es la más importante de las seis**, y se prueba como se probó la
reaceptación en PE-02B5B: con una cuenta que aún no ha aceptado, pidiendo
`/modules` y comprobando que redirige a `/legal/accept` — y que en el cuerpo de
esa pantalla **no hay ni rastro** del diálogo de bienvenida.

**La R no se comprueba mirando la pantalla.** Se comprueba contando filas: se
publica la v2 y se aserta que **ninguna** fila de preferencias cambió. Es la
única forma de demostrar que no se reinició nada, porque una preferencia
reiniciada y una preferencia que nunca existió se ven igual desde fuera.

**La Q necesita dos personas de verdad**, no una con dos sesiones.

---

## PET-45 · Lo que la arquitectura añade a la lista

Cinco comprobaciones que el encargo no pide y que este diseño necesita:

| | Qué demuestra |
|---|---|
| **X** | Lo declarado al reservar y lo real del objeto **coinciden**, o no nace la versión |
| **Y** | Un archivo que no es `mp4` ni `webm` se rechaza · por extensión, por tipo **y por firma binaria** |
| **Z** | Solo una versión publicada por tutorial · garantizado por índice, no por función |
| **AA** | Retirar un objeto **jamás** alcanza a uno que alguna versión referencie |
| **AB** | La URL firmada caduca, y una caducada no sirve el vídeo |

**La Z se prueba con concurrencia**, no con dos llamadas seguidas. Dos
publicaciones simultáneas del mismo tutorial: una gana, la otra falla. Una
función se puede llamar dos veces a la vez; un índice único no se puede violar
dos veces.

**La Y necesita un archivo mentiroso**: extensión `.mp4`, tipo declarado
`video/mp4`, y bytes que no son vídeo. Comprobar solo lo declarado es comprobar
lo que dijo quien sube.

---

## PET-46 · Las cuentas de prueba

Se reutiliza lo que ya existe. Ninguna permanente, ninguna con datos de cliente.

| | Para qué |
|---|---|
| superadministrador de plataforma | subir, publicar, historia |
| soporte | ver la historia y **no** poder publicar |
| persona normal con Quality | ver el tutorial, no poder subir |
| persona con acceso Demo | la comprobación **L** |
| persona en otra empresa | la comprobación **Q** |
| visitante sin sesión | que no llegue a ningún vídeo |

Las suites de PE-02 ya crean estas cuentas al vuelo con la API administrativa y
las dejan; se sigue el mismo patrón.

**Y las suites tienen que ser repetibles.** PE-02B4 aprendió esto por las malas:
dos suites dejaron la base sucia al fallar y hubo que añadirles reparación al
arrancar. Una suite que sube archivos tiene el mismo riesgo multiplicado, así que
cada una retira sus objetos en un `finally`, no al final del camino feliz.

---

## PET-47 · Y la trampa de este sprint

Cada sprint tiene una comprobación que sale verde sin demostrar nada. En PE-03 son
dos, y conviene escribirlas antes de caer:

**Comprobar que «el vídeo se reproduce» pidiendo la URL firmada y mirando que
devuelve 200.** Eso demuestra que el objeto existe. No demuestra que se pueda
adelantar, que es lo que hace usable un tutorial de cuatro minutos. Hay que pedir
un rango.

**Comprobar que «la versión anterior se conserva» contando filas.** Las filas se
conservan casi siempre; lo que se puede perder son los bytes. Hay que comparar el
resumen del objeto.

---

## PET-48 · Lo que hará falta a mano

Cinco cosas que ninguna prueba juzga:

1. si el vídeo **se ve bien** en un teléfono;
2. si el botón **se encuentra** sin que nadie lo señale;
3. si la bienvenida **molesta**;
4. si «Este tutorial está en actualización» suena a promesa o a excusa;
5. si el diálogo de bienvenida **se cierra fácil** — con `Esc`, con el ratón, y
   sin dejar el foco perdido.
