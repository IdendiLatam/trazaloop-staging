# PE-03B5 · Los residuos de QA, inventariados y clasificados

El encargo dice una cosa y su contraria a la vez, y las dos son correctas:
**limpia** los residuos, y **no borres a ciegas**. La forma de cumplir las dos es
clasificar antes de tocar nada.

---

## 1 · Las cinco clases

| Clase | Qué es | Qué se hace |
|---|---|---|
| `HISTORICO_SEGURO` | Se publicó alguna vez | **Se conserva. Siempre.** |
| `QA_ACTIVO_SEGURO` | De QA, en servicio y a propósito | Se deja, y se documenta por qué |
| `TEMPORAL_RETIRABLE` | Nunca publicado, sin referencias, sin reserva viva | Candidato — lo decide una persona |
| `RIESGO_SEGURIDAD` | Una cuenta con papel activo que no debería tenerlo | Se corrige |
| `HISTORIA_INCONSISTENTE` | Publicado, y sus bytes no están | **No se corrige inventando** |

`scripts/pe03b5/inventario-residuos.ts` produce esta clasificación. **No borra
nada, no escribe nada**, y no es por prudencia estilística: la limpieza de QA de
PE-03B1 borró el objeto de una versión publicada y dejó en Staging una
inconsistencia que ya no se puede deshacer. La única forma de no repetirlo es
que la herramienta no sepa borrar.

---

## 2 · El defecto que encontró el inventario

**Cuatro suites de PE-03 creaban superadministradores de plataforma y no los
retiraban nunca.**

`pe03b1-tutorials`, `pe03b1-upload-security`, `pe03b1-playback` y
`pe03b2-tutorial-admin` limpiaban sus tutoriales y sus objetos con cuidado, y
dejaban vivas las cuentas privilegiadas que habían creado para hacerlo.

Contra la base local eso es ruido que se acumula. Contra un entorno compartido
es **exactamente lo que pasó en Staging** con la sonda de PE-03B1: una cuenta de
QA con papel de plataforma vivo que nadie recordaba haber creado.

Corregido: las cuatro anotan a quien crean y lo retiran al terminar, en el mismo
`finally` donde ya limpiaban lo demás.

> **La regla:** quien crea un acceso privilegiado lo cierra. Y el que se olvida
> no se ve hasta que alguien lo inventaría.

---

## 3 · Qué se comprueba, y contra qué

`tests/rls/pe03b5-residues.test.ts` — 17 comprobaciones, contra la base local.

### El inventario sabe inventariar

Suena tautológico y no lo es. La primera versión de este recuento **bajaba dos
niveles del cubo** y las rutas tienen tres —`<tutorial>/<versión>/<archivo>`—,
así que no encontró ni un archivo y declaró que las doce versiones estaban
rotas.

Un inventario que se equivoca al leer produce un informe de catástrofe. Ahora:

- se comprueba que toda ruta del cubo tiene **exactamente tres segmentos**;
- se **fabrica un huérfano de verdad** —un objeto sin fila— y se comprueba que
  el cruce lo señala, en vez de fiarse de que sabría hacerlo.

### La anomalía histórica es inalcanzable POR CONSTRUCCIÓN

Es la parte que importa, y la razón de que esta suite exista.

El informe del incidente afirma que la versión publicada sin archivo «no tiene
riesgo real, porque su clave no está en el registro». Eso es un razonamiento
correcto y **sin comprobar**. Aquí se comprueba: se reproduce la misma forma —un
tutorial con clave de QA, retirado, con una versión publicada cuyo objeto se
borra— y se recorren las tres barreras.

| Barrera | Qué impide |
|---|---|
| El registro no tiene la clave | Ninguna dirección del producto la resuelve |
| La acción exige `isKnownPageKey` | Fabricar la clave a mano tampoco sirve |
| La vista exige `status = 'active'` | Un tutorial retirado no sale |

Y la comprobación que convierte la fotografía en invariante: **se reactiva el
tutorial** y se vuelve a mirar. La vista pasa a devolverlo —el dato está ahí— y
el producto **sigue sin poder llegar**, porque la clave no está en el registro y
ninguna ruta la resuelve. Ni siquiera un superadministrador consigue firmar la
reproducción.

Eso es lo que hacía falta demostrar: que la seguridad no depende de que el
tutorial siga retirado.

### La historia no se falsifica para limpiar

Comprobado contra la base: una versión publicada **no se puede borrar**, y no se
le puede cambiar el resumen, la ruta, quién la subió ni quién la publicó. Y el
tutorial que publicó algo tampoco se puede eliminar.

Cuatro intentos, cuatro rechazos, y después se relee la fila para confirmar que
sigue igual — porque un `update` que «falla» y escribe a medias sería peor que
uno que funciona.

### Viejo no es lo mismo que abandonado

Una reserva con horizonte de **una semana para 8 GB** es legítima: puede ser una
subida larga en curso. PE-03B3 sacó el reloj del predicado que autoriza escribir
justamente para eso, y clasificar por antigüedad lo reintroduciría por la puerta
de atrás.

Lo que sí distingue una reserva viva de una muerta es su **estado**: una marcada
como fallida deja de autorizar inmediatamente. Comprobado en las dos
direcciones.

---

## 4 · Lo que este agente no pudo mirar, y por qué

**El inventario de datos de Staging no se ejecutó.**

Las credenciales de Staging no viven en el repositorio ni en `.env.local`, a
propósito: las pone quien ejecuta. En este entorno no están, y sigue vigente la
instrucción permanente de PE-03B3 — no buscar contraseñas en ficheros, no leer
secretos de Vercel, no volcar variables de entorno, no leer claves ni
credenciales. Rescatarlas de un registro de sesión anterior habría sido
desobedecerla por comodidad.

Lo que sí se puede afirmar sin credenciales, y se afirma:

- **Las propiedades del esquema son las mismas en los dos entornos**, porque las
  pone la misma migración y Staging está en 0161.
- **La anomalía histórica es inalcanzable por construcción**, y eso depende del
  código y del registro, no de los datos de un entorno.
- **Las suites corregidas** dejarán de acumular cuentas privilegiadas allí donde
  se corran.

Lo que hace falta una persona para saber:

```
STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... \
  npx tsx scripts/pe03b5/inventario-residuos.ts
```

Imprime el inventario completo y la clasificación. **No escribe nada.**

---

## 5 · Las cuentas conocidas de Staging

| Cuenta | Estado esperado | Clase |
|---|---|---|
| `idendilatam@gmail.com` | `superadmin` / `active` | `QA_ACTIVO_SEGURO` |
| `qa-a@trazaloop-staging.local` | `superadmin` / `active` | `QA_ACTIVO_SEGURO` — **a propósito** |
| Sonda `pe03b1-probe-…` | revocada, baneada, 0 sesiones | `HISTORICO_SEGURO` |

`qa-a` **no se retira en PE-03B5**. Su retirada se aplazó al corte de
producción por decisión del propietario del producto, y está escrita en
[PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md](PE_03_PRODUCTION_CUTOVER_CARRYOVERS.md)
para que aparezca en la lista de verificación de publicación de PE-06.

La sonda conserva su atribución. Retirar un acceso no es borrar a quien hizo
algo.

---

## 6 · Huérfanos: qué se puede retirar y qué no

Un objeto solo es candidato a retirarse si se cumplen **las cuatro**:

1. ninguna versión lo referencia;
2. nunca se publicó;
3. no hay una reserva viva que lo espere;
4. está fuera del margen de gracia.

Si falta una, no se toca. Y si no hay ninguno que cumpla las cuatro, **no se
hace nada** — que es un resultado, no un fracaso.

`removeDiscardedTutorialObject` ya implementa la comprobación de referencias
antes de borrar, y hay una razón concreta que no es paranoia: **una versión
repuesta comparte objeto con la original**. Borrar el objeto de una candidata
repuesta se llevaría por delante el vídeo de una versión publicada.
