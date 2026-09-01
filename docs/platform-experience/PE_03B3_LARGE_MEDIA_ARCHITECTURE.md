# PE-03B3 · Vídeos sin tope, y qué significa eso de verdad

> **Decisión del propietario del producto · 31 de agosto de 2026.**
> El tope de **200 MB por archivo** que PE-03B1 congeló queda **revocado**, y no
> se sustituye por otro número. Trazaloop tampoco impone una **duración máxima**.

Esta es la migración **0160**. Lo que sigue explica por qué retirar un número de
un `check` no bastaba, y qué había que cambiar además para que «sin tope»
significara algo.

---

## 1 · Por qué se retira, y por qué no se pone otro

El tope de 200 MB nació de una premisa razonable y equivocada: «un tutorial dura
tres minutos». Resultó no ser una regla del producto sino una suposición sobre
cómo se usaría, y las suposiciones sobre el uso ajeno no se meten en un `check`
de la base.

Poner 500 MB, 1 GB o 2 GB en su lugar sería el mismo error con otro número.
Cualquiera de ellos volvería a rechazar un vídeo legítimo el día que alguien
grabe una formación larga, y volvería a hacerlo sin nadie a quien preguntar.

Lo que sí existe es un techo, y **no es de Trazaloop**:

| Camino | Quién pone el techo | Cuánto |
|---|---|---|
| Subida estándar (una petición) | `file_size_limit` global del proyecto Supabase | 50 MiB en el stack local |
| Subida reanudable (TUS) | El servicio, anunciado en `tus-max-size` | 52 428 800 000 bytes · ≈ 48,8 GiB |
| Cubo `tutorial-media` | **nadie** — `file_size_limit = null` | — |

La copia que ve quien sube lo dice con esas palabras y no promete «ilimitado»,
que sería falso:

> No hay un límite de tamaño definido por Trazaloop. La carga está sujeta a la
> capacidad técnica del servicio de almacenamiento.

---

## 2 · Los cuatro sitios donde vivía el número

Retirar un tope no es una línea. El 200 MB estaba escrito cuatro veces, y dejar
una habría hecho que el producto siguiera rechazando por una regla que ya no
existía.

1. **`tutorial_versions_size_check`** — el tamaño declarado al reservar.
   Ahora solo exige `> 0`.
2. **`tutorial_versions_real_size_check`** — el tamaño real medido al verificar.
   Igual.
3. **`tutorial_reserve_upload`** — la validación dentro de la función.
   Ahora solo rechaza vacío o negativo: *«El archivo parece vacío.»*
4. **`storage.buckets.file_size_limit`** — el cubo declaraba su propio tope.
   Ahora es `null`, como los otros tres cubos del proyecto.

Los formatos **se conservan**: MP4 y WebM. No son un tope, son lo que un
navegador puede reproducir sin ayuda.

---

## 3 · El cambio menos visible, y el que más importa

El predicado que autoriza escribir en el cubo miraba el reloj de la reserva:

```sql
-- antes
where v.object_path = p_name
  and v.file_state in ('reserved', 'uploaded')
  and v.upload_expires_at > now()      -- ← esto
```

Con archivos de 200 MB eso era inocuo. Sin tope es una trampa: una subida de dos
horas cruzaría su propia caducidad **a mitad de camino** y el almacenamiento
empezaría a rechazar trozos de una subida que iba bien. El vídeo se perdería por
un reloj, no por un problema.

```sql
-- ahora
where v.object_path = p_name
  and v.file_state in ('reserved', 'uploaded')
```

**La reserva sigue siendo la frontera.** Sin una fila en `reserved` o `uploaded`
para esa ruta exacta, no se escribe: eso no se relajó. Lo que se quitó es que el
reloj forme parte de la autorización.

El horizonte de la reserva sigue existiendo —ahora entre **1 hora y 7 días**, por
defecto 24 horas— y sigue sirviendo para lo que sirve: saber qué reservas quedaron
huérfanas y limpiarlas. Se llama `TUTORIAL_UPLOAD_HORIZON_SECONDS`, y no
`_TTL_`, porque no es un plazo de subida.

---

## 4 · El transporte: reanudable, por trozos

Con el tope retirado, `uploadToSignedUrl` —una sola petición— dejó de servir por
dos motivos distintos:

1. La subida estándar está acotada por el `file_size_limit` **global** del
   proyecto. Con él puesto, «sin límite de Trazaloop» sería una frase vacía.
2. Una sola petición que falla al 90 % vuelve a empezar. En tres minutos de
   vídeo es molesto; en dos horas por una red de oficina es la diferencia entre
   poder subirlo y no.

`lib/storage/resumable-upload.ts` habla el subconjunto de TUS que hace falta:
crear la subida, enviar trozos de 6 MB, y preguntar por dónde iba.

**El desplazamiento lo dice el servidor.** Cuando un trozo falla, no se reintenta
desde la cuenta local: se hace `HEAD` y se lee el `upload-offset` real. Es el
mismo principio que arregló la sonda de QA —la verdad la tiene la base, no el
flujo— aplicado a una subida.

No se instaló `tus-js-client`. Por lo mismo que este repositorio no instaló un
intérprete de Markdown para pintar un documento legal: hacía falta un subconjunto
cerrado, y lo delicado no es el protocolo sino de dónde sale el desplazamiento.

### Y la autorización se refuerza, no se relaja

TUS **no admite** el testigo de una URL de subida firmada: se autentica con el
JWT de la sesión. Así que, a diferencia del transporte de PE-03B1 —que 0099
demostró que **se salta** la política INSERT del cubo—, aquí la política sí se
ejerce:

```sql
bucket_id = 'tutorial-media'
and is_platform_superadmin()
and tutorial_media_has_reservation(name)
```

Ninguna credencial de servicio baja al navegador. Lo que viaja es la sesión de
la propia persona, que ya tenía. Una prueba comprueba contra el servicio real
que **una persona normal no consigue crear una subida reanudable** (C3).

---

## 5 · Verificar sin cargar el vídeo en memoria

PE-03B1 calculaba el resumen así, y lo documentó como el techo de aquella
implementación:

```ts
const { data } = await supabase.storage.from(…).download(path);
const bytes = new Uint8Array(await data.arrayBuffer());   // ← el archivo entero
await crypto.subtle.digest("SHA-256", bytes);
```

Con 200 MB era caro pero acotado. Sin tope pasó de caro a **inaceptable**: dos
verificaciones simultáneas de un vídeo de un giga tumbarían el servidor, y ahora
un vídeo de un giga es perfectamente legítimo.

`lib/db/tutorial-integrity.ts` lee **en flujo** y alimenta el resumen trozo a
trozo. `crypto.createHash` de Node es incremental por diseño, así que no hizo
falta ninguna dependencia — ni criptografía escrita a mano, que era la otra forma
de equivocarse.

Se usa `fetch` sobre una URL firmada y no `.download()`, porque `.download()`
devuelve un `Blob` y un `Blob` ya está entero en memoria antes de que uno pueda
mirarlo: habría dejado el problema donde estaba.

**Medido, no afirmado:** el pico observado es de **64 KB sobre un archivo de
4 MB** (B1 de la suite de medios). Y el resumen incremental da **el mismo
número** que el de una sola pasada sobre el búfer completo (B2), porque
«SHA-256 sigue siendo SHA-256» es algo que hay que poder demostrar.

Las tres cosas —resumen, tamaño real y firma binaria— salen de **una sola
pasada**. Leer dos veces duplicaría el tráfico contra el almacenamiento, y en un
archivo grande eso se nota en la factura antes que en el reloj.

---

## 6 · La duración

No había ninguna comprobación de duración que retirar, y 0160 no añade ninguna.
Se deja escrito para que nadie la añada creyendo que falta.

`duration_seconds` sigue siendo **informativa y opcional**. Nunca decide si algo
se publica. Si no se pudo leer, se guarda nula — jamás se inventa, porque se
muestra junto al vídeo y la gente la cree.

---

## 7 · Lo que 0160 NO hace

- No crea ni borra ninguna tabla.
- No toca ninguna versión ni ningún objeto existente.
- No cambia quién puede subir ni quién puede publicar.
- No relaja la política del cubo: la refuerza, al mover el transporte a un
  camino donde la política se ejerce.
