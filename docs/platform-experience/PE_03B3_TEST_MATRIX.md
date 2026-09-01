# PE-03B3 · Qué se comprobó

**48 comprobaciones**, dos suites. El nivel importa más que el número: nueve de
estas salen verdes sin demostrar nada si se hacen contra la capa equivocada.

| Suite | Nivel | Checks |
|---|---|---|
| `pe03b3-page-tutorial` | puro · en `test:all` | 35 |
| `pe03b3-large-media` | base real + Storage real | 13 |

```
npm run test:pe03b3          # las 35 estáticas
npm run test:pe03b3-media    # las 13 contra la base y el almacenamiento
```

---

## 1 · Qué prueba cada nivel, y por qué hacen falta los dos

Hay afirmaciones de este tramo que **solo** se pueden demostrar contra el
servicio real, y afirmaciones que **solo** se pueden vigilar leyendo el código.

| Afirmación | Dónde se prueba | Por qué ahí |
|---|---|---|
| «La base ya no rechaza un archivo grande» | base real | Un `check` de Postgres no se comprueba leyendo el `.sql`: se comprueba intentándolo. |
| «El pico de memoria es un trozo» | base real, **medido** | Afirmar que un flujo no acumula es fácil; el número sale de leer un archivo de verdad. |
| «El servicio admite TUS y su techo es X» | servicio real | Es un hecho del proveedor. Escribirlo en un documento no lo hace cierto. |
| «No se consulta ningún plan» | estática | Es una **ausencia**. Una ausencia no se demuestra ejecutando: se vigila leyendo. |
| «El botón está en la barra y no en 147 cabeceras» | estática | Es una decisión de arquitectura, no un comportamiento. |
| «El tope no vuelve por otra puerta» | estática | Lo que hay que impedir es que alguien lo reintroduzca mañana. |

---

## 2 · `pe03b3-page-tutorial` · 35 estáticas

### A · El tope de 200 MB no vuelve por ninguna puerta (5)

| | |
|---|---|
| A1 | Ningún archivo se rechaza por grande |
| A2 | No queda ningún tope de aplicación en el código vivo |
| A3 | Ni la migración 0160 lo sustituye por otro número |
| A4 | Y la copia no promete «ilimitado», que sería falso |
| A5 | Y no hay ninguna validación de duración |

A3 es la que más vale a largo plazo: comprueba que 0160 no cambió `200 MB` por
`500 MB`. La instrucción del propietario del producto fue **revocar sin
sustituir**, y un número nuevo sería desobedecerla con apariencia de cumplirla.

### B · La memoria no crece con el vídeo (4)

| | |
|---|---|
| B1 | La verificación lee en flujo, no en un búfer |
| B2 | Y quien la llama tampoco carga el archivo |
| B3 | El pico está acotado por el trozo, y el trozo es pequeño |
| B4 | El navegador tampoco lee el vídeo entero |

B2 existe porque el fallo real de PE-03B1 no estaba en el resumen sino en quien
lo llamaba: `.download()` devolvía un `Blob` ya entero en memoria. Vigilar solo
la función nueva habría dejado el problema donde estaba.

### C · El transporte reanudable, y su frontera (5)

| | |
|---|---|
| C1 | Se usa el extremo reanudable, no una sola petición |
| C2 | El desplazamiento lo dice el SERVIDOR, no la cuenta local |
| C3 | Se autentica con la sesión, no con una credencial de servicio |
| C4 | Y la reserva sigue siendo la frontera |
| C5 | Y la caducidad de la reserva ya no es un plazo de subida |

### D · De una ruta a su clave (5)

| | |
|---|---|
| D1 | Cada pantalla registrada se resuelve a SU clave |
| D2 | Un listado y su ficha NO comparten tutorial |
| D3 | Una pantalla sin clave no admite tutorial · y eso no es un fallo |
| D4 | Los módulos no se contagian entre sí |
| D5 | Y no se creó una segunda familia de claves |

### E · El botón, donde tiene que estar (6)

| | |
|---|---|
| E1 | En la barra del shell, no en 147 cabeceras |
| E2 | Se llama «Ver video tutorial» |
| E3 | En una pantalla sin clave el botón NO se pinta |
| E4 | Y no se firma nada al pintar la pantalla |
| E5 | Cambiar de pantalla cierra el diálogo |
| E6 | Y «Ayuda» sigue donde estaba, sin convertirse en un menú |

### F · Lo que se muestra, y lo que no (4)

| | |
|---|---|
| F1 | Sin vídeo se dice la copia congelada, y no se pinta reproductor |
| F2 | Una avería NO se presenta como ausencia de tutorial |
| F3 | No se enseña ningún dato interno |
| F4 | Sin reproducción automática, y con teclado |

### G · Renovar no es alargar (4)

| | |
|---|---|
| G1 | Hay renovación, y conserva el segundo en el que iba |
| G2 | Y el plazo NO se subió a un número enorme |
| G3 | Se renueva ANTES de vencer, no al fallar |
| G4 | Y la renovación firma la MISMA versión vigente |

G2 es el par de G1: sin ella, la forma barata de pasar G1 sería poner el plazo
en 24 horas y no renovar nunca.

### H · Ni un plan por el camino (2)

| | |
|---|---|
| H1 | Ver un tutorial no consulta ningún plan |
| H2 | Solo la versión VIGENTE sale por esta vía |

---

## 3 · `pe03b3-large-media` · 13 contra el servicio real

### A · La base ya no rechaza por tamaño (4)

`A1` reserva 250 MB, `A2` reserva 2 GB y 20 GB, `A3` comprueba que vacío sigue
sin ser un vídeo, `A4` lee el cubo por la API de Storage y comprueba que
`file_size_limit === null`.

**Se reserva por el metadato, no subiendo 20 GB.** La comprobación de tamaño
ocurre al reservar; subir los bytes probaría el ancho de banda de la máquina, no
la regla.

### B · Verificar no carga el vídeo en memoria (3)

`B1` **mide** el pico real leyendo un archivo de verdad: **64 KB sobre 4 MB**.
`B2` compara el resumen incremental con el de una sola pasada sobre el búfer
completo — el mismo número, hexadecimal a hexadecimal. `B3` comprueba que un
archivo que miente sobre lo que es sigue cayendo.

### C · El transporte reanudable, contra el servicio real (3)

`C1` interroga el extremo y lee sus cabeceras: `tus-resumable: 1.0.0`,
`tus-max-size: 52428800000` (≈ 48,8 GiB). `C2` **sube de verdad**, en dos trozos,
con recuperación de desplazamiento por `HEAD`. `C3` comprueba que una persona
normal no consigue crear una subida reanudable.

### D · Renovar, sin que el tutorial se acabe (3)

`D1` firma con un plazo corto, espera a que caduque y comprueba que renovar
devuelve un enlace vivo. `D2` pide un rango de bytes después de renovar —
adelantar el vídeo tiene que seguir funcionando. `D3` comprueba que la
renovación firma la versión vigente y no una que se le pida.

---

## 4 · Lo que estas pruebas NO cubren

- **Que el vídeo se vea bien.** Ningún test reproduce un MP4. Eso es la prueba
  humana.
- **Un archivo de 20 GB subido de verdad.** Se prueba la regla, no el ancho de
  banda.
- **El techo del proveedor en el entorno alojado.** El `tus-max-size` medido es
  el del stack local; el del proyecto alojado se configura en su panel y no se
  ve desde la base.
- **La bienvenida y la preferencia por persona.** No existen todavía: son
  PE-03B4.

---

## 5 · Regresión

| Comprobación | Resultado |
|---|---|
| `npm run test:all` | **EXIT 0** |
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run lint` | **0 errores** (68 avisos heredados, ninguno nuevo) |
| `npm run build` | **EXIT 0** |
| Reejecución limpia `0001 → 0160` | **0 fallos**, cabecera 0160, 152 migraciones |
| Suites de base de PE-03B1 · B2 · B3 | 15 + 15 + 15 + 18 + 10 + 11 + 13 en verde |
| Suites de PE-02B5B tras la reejecución | 22 + 14 en verde |

### Tres suites anteriores hubo que corregirlas, y por qué

No fueron fallos del producto: fueron pruebas que defendían reglas que este
tramo revocó por decisión del propietario del producto. Se dejan anotadas porque
cambiar una prueba para que pase es exactamente lo que no se debe hacer sin
explicarlo.

| Prueba | Qué exigía | Qué exige ahora |
|---|---|---|
| `pe03b1-upload-security` **E** | «200 MB justos se aceptan, uno más no» | Vacío y negativo se rechazan; 200 MB + 1 y 8 GB **se aceptan** |
| `pe03b2-tutorial-console` **B1** | El transporte es `uploadToSignedUrl` | El transporte es directo a Storage — firmado **o** reanudable |
| `pe03b2-tutorial-console` **F3** | El navegador usa `reserva.token` | El navegador usa una autorización acotada: el testigo **o** su sesión |
| `pe03b2-tutorial-console` **I1** | «Payload too large» menciona 200 MB | Menciona de quién es el límite, y **ningún mensaje inventa un tope** |
| `pe03b2-tutorial-console` **J1** | El shell NO tiene botón de tutorial | La consola no pinta el botón, y el shell lo ofrece con **un** componente |
| `pe01-modules` **H3** | La puerta no nombra «tutorial» | La puerta no anuncia nada como futuro, y lo que ofrece **existe** |

En los seis casos la prueba nueva es igual de exigente o más: `I1` ganó una
comprobación que antes no había (que ningún mensaje anuncie un tope en megas o
gigas), y `J1` pasó de vigilar una ausencia a vigilar que no haya copias del
botón repartidas por la consola.

Las reservas de las suites de PE-03B1 y PE-03B2 pasaron de `p_ttl_seconds: 900`
a `3600` en 18 llamadas: 0160 subió el horizonte mínimo de una reserva a una
hora, porque quince minutos era un horizonte razonable para 200 MB y no lo es
para un archivo sin tope.
