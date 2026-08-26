# EXPORT-01 · Seguridad

## Lo que el cliente puede decir

Exactamente tres cosas:

1. una **clave** de la lista cerrada;
2. un **identificador** de entidad;
3. **filtros declarados por esa exportación**.

Nada más llega al cargador. La empresa sale de la sesión.

## Lo que NO puede decir

| Prohibido | Qué pasaría si se aceptara |
|---|---|
| Nombre de tabla / SQL | El PDF sería un motor de consultas arbitrarias |
| HTML | Inyección en el documento |
| **Cualquier URL, incluida la del logo** | SSRF: el servidor iría a la red interna o al bucket de otra empresa |
| `organization_id` | Cambiar de empresa manipulando la URL |

## Las cuatro puertas, en orden

```
1. ¿La clave existe en el registro?      no → 404
2. ¿La empresa tiene el módulo?          no → 403     (entitlement)
3. ¿El rol alcanza?                      no → 403     (autorización)
4. ¿La entidad es de esta empresa?       no → 404     (RLS, en la consulta)
```

Entitlement y autorización son capas **distintas** (§51): conocer el
identificador de un lote de PCR no da acceso a PCR si la empresa no tiene ese
módulo.

## Un PDF no concede permisos nuevos

Los adaptadores leen con la **sesión del usuario**, nunca con `service_role`.
La RLS vuelve a decidir cada fila. Si alguien ve un subconjunto, su PDF trae ese
subconjunto.

## Respuestas indistinguibles

Una clave inventada, una entidad inexistente y una entidad de otra empresa
responden **igual**: 404 con el mismo texto. Un fallo al cargar responde 500
genérico. No se confirma ni se niega qué existe.

## Ataques probados, con sesión real

| Intento | Resultado | Comprobado |
|---|---|---|
| Clave inventada | 404 | navegador |
| Nombre de tabla como clave | 404 | navegador |
| Travesía de ruta en la clave | 404 | navegador |
| SQL en la clave | 404 | navegador |
| `organization_id` manipulado | **ignorado** — el PDF es de la empresa propia | navegador, leyendo el PDF |
| `logoUrl` apuntando a metadatos de la nube | **ignorado** — no hay ningún `fetch` | navegador + prueba estática |
| `<script>` en un filtro de texto | **saneado** — no aparece en el PDF | navegador, leyendo el PDF |
| Valor fuera del catálogo de un filtro | **descartado** — no aparece | navegador, leyendo el PDF |
| Identificador de otra empresa | 404 | navegador |
| Identificador que no es un uuid | 404 | navegador |

Cuatro de ellos devuelven **200 con un PDF**, y eso es lo correcto: el
parámetro hostil se neutralizó y el usuario recibió su propio documento. La
diferencia entre «neutralizado» y «obedecido» se comprobó **abriendo el PDF**,
no mirando el código de respuesta.

## Cabeceras

```
Content-Type: application/pdf
Content-Disposition: attachment; filename="…"; filename*=UTF-8''…
Cache-Control: private, no-store, max-age=0, must-revalidate
X-Content-Type-Options: nosniff
```

`no-store` no es exceso de celo: un PDF lleva datos de UNA empresa, y una caché
compartida —un proxy corporativo, una CDN mal configurada— podría servírselo a
otra.

## Nombres de archivo

Se componen en un solo sitio y se sanean **dos veces**: al construirlos y al
ponerlos en la cabecera. La segunda no confía en la primera porque es la última
puerta antes de la red.

`../../etc/passwd` produce `Riesgo_etc-passwd_R-1.pdf`: sin barras, sin puntos
dobles, sin saltos de línea.

## El logo (§52)

Se resuelve con el resolutor de QUALITY-03.1: parte del `organizationId` ya
validado, lee la ruta guardada en la **fila de la empresa**, comprueba que esa
ruta empieza por el identificador de la empresa, y descarga del bucket privado
con la sesión del usuario —de modo que la RLS del Storage vuelve a comprobarlo—.
En ningún punto de la cadena hay un valor que venga del cliente.

Si algo falla, `null`, y el PDF sale con el nombre de la empresa. Un adorno no
puede impedir que alguien descargue su procedimiento.

## WebP: el hueco que se cerró (§19)

`ALLOWED_LOGO_TYPES` acepta `image/png`, `image/jpeg` **e `image/webp`**. El
escritor de PDF solo incrusta los dos primeros. Una empresa podía subir un logo
perfectamente válido según la plataforma y encontrarse con que sus PDF salían
sin él, sin que nadie le dijera por qué.

**Aceptar un formato y luego ignorarlo es peor que no aceptarlo.**

`lib/pdf/convert.ts` convierte WebP a PNG en servidor —a PNG y no a JPEG,
porque los logos suelen llevar transparencia y aplanarla contra blanco deja un
recuadro visible sobre cualquier fondo—.

`sharp` ya venía instalado como dependencia **opcional** de Next. Depender de
algo que está ahí «de rebote» es frágil, así que se declaró de forma explícita
en `package.json`. Aun así se importa dinámicamente y con red de seguridad: si
un día no estuviera, el PDF sigue saliendo con el nombre como identidad.

Una prueba compara `ALLOWED_LOGO_TYPES` con lo que el conversor sabe resolver:
si alguien añade un formato al subir sin añadirlo aquí, la suite falla.
