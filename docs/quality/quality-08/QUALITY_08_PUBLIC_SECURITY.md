# QUALITY-08 · La superficie pública

> **§25, §26, §27, §66, §67, §68, §89, §93, §94, §95, §103**

## 1 · Por qué existe

Quien responde una encuesta de satisfacción es un cliente, no un usuario de
Trazaloop. Obligarle a crear una cuenta para contestar tres preguntas garantiza
una cosa: que no conteste.

Así que hay una ruta pública —`/survey/[token]`— y **exactamente dos** funciones
que la sostienen.

## 2 · La frontera

```
app/survey/[token]/page.tsx          ← fuera de app/(app), sin guard de sesión
  └── lib/db/quality-survey-public.ts ← cliente ANÓNIMO, dos llamadas
        ├── quality_resolve_survey_token(text)   → la estructura
        └── quality_submit_survey_response(text, jsonb) → el envío
```

`lib/db/quality-survey-public.ts` vive en su propio archivo por una razón que no
es estética: todo lo que hay ahí corre **sin sesión**. Mezclarlo con la capa
autenticada haría que un día alguien reutilizara una función de aquí desde
dentro y no lo notara.

No hay ninguna consulta a tabla en ese archivo, y no podría haberla: `anon` no
tiene privilegios sobre ninguna tabla del dominio.

## 3 · §26 · El token resuelve el contexto

**La ruta pública NO acepta `organization_id`.** No llega desde el navegador, y
si llegara no se usaría: ni la capa pública ni la acción ni las dos RPC lo
mencionan. La empresa sale del token, que sale de la invitación, que sale de la
campaña.

Una prueba estática comprueba que la palabra `organization_id` no aparece en
ninguno de los tres archivos.

## 4 · §66 · El token nunca se guarda en claro

```
quality_issue_survey_invitation()
  v_token := encode(extensions.gen_random_bytes(32), 'hex')   ← 32 bytes del servidor
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex')
  insert … token_hash = v_hash, token_prefix = left(v_token, 8)
  return jsonb_build_object('token', v_token)                 ← UNA vez
```

El secreto sale una sola vez, hacia quien lo pidió, y la base ya no lo puede
reconstruir. Si se pierde, se emite otro.

Y el hash **no se concede a nadie**: el `grant` sobre
`quality_survey_invitations` es por columnas y `token_hash` no está entre ellas.
Ni quien administra la empresa puede leerlo. La suite lo comprueba pidiéndolo y
recibiendo un error.

> **El defecto que ya había ocurrido una vez.** `pgcrypto` vive en el esquema
> `extensions`, y con `set search_path = public` una llamada sin calificar falla
> **en ejecución**. Le pasó a la RPC del pasaporte textil en 0092 y lo corrigió
> 0095. Aquí volvió a pasar, y lo encontró la suite contra base real —ninguna
> prueba estática podía verlo—. Ver `QUALITY_08_TEST_MATRIX.md` §5.

## 5 · §89 · Falla cerrada, y siempre igual

`quality_resolve_survey_token` devuelve `not_available` para **todos** estos
casos, sin distinguirlos:

| Situación | Respuesta |
|---|---|
| token inventado | `not_available` |
| token de menos de 32 caracteres | `not_available` (sin tocar la base) |
| token caducado | `not_available` |
| token revocado | `not_available` |
| token ya usado | `not_available` |
| campaña en borrador | `not_available` |
| campaña cerrada o cancelada | `not_available` |
| fuera de la ventana de respuesta | `not_available` |
| versión de encuesta sin publicar | `not_available` |

Distinguirlos le diría a quien prueba tokens si acertó con uno, y eso ya es
información. La prueba H3 cuenta los motivos declarados en el cuerpo de la
función y exige que sean todos el mismo.

## 6 · §67 · El reloj es del servidor

La ventana se comprueba con `current_date` dentro de la RPC. Ninguna función
recibe una fecha del cliente, y una prueba comprueba que no exista ningún
parámetro `p_now` ni `p_today`.

## 7 · §68 · El replay, resuelto sin carrera

El token se consume con un `update` **condicional**:

```sql
update quality_survey_invitations
   set status = 'used', used_at = now()
 where token_hash = v_hash
   and status = 'pending'          -- ← aquí está la protección
   and revoked_at is null
   and (expires_at is null or expires_at > now())
returning * into v_inv;

if v_inv.id is null then
  return jsonb_build_object('ok', false, 'reason', 'not_available');
end if;
```

Dos envíos simultáneos con el mismo enlace no pueden ganar los dos: el segundo
no encuentra ninguna fila `pending` que actualizar. Es protección contra TOCTOU
por construcción, y no depende de que la aplicación compruebe antes.

## 8 · §27 · Superficie de abuso

No se construyó un anti-bot de empresa. Lo que sí hay:

| Vector | Límite |
|---|---|
| tamaño del cuerpo | 200 000 caracteres en la acción · 200 respuestas en la RPC |
| texto libre por respuesta | 4 000 caracteres, recortado en el servidor |
| pregunta de otra encuesta | rechazada: tiene que ser de la versión de esta campaña |
| desenlace inventado | rechazado |
| «no aplica» donde no se permite | se degrada a «sin responder», no se rechaza el envío |
| tokens | un uso, con caducidad y revocación |

Lo que **no** hay, y se declara: no hay CAPTCHA, no hay límite por IP y no hay
detección de comportamiento. Una campaña con enlaces filtrados puede recibir
respuestas basura hasta que se revoquen los enlaces. El diseño acota el daño
—una respuesta por enlace— pero no lo elimina.

## 9 · §93 · La identidad de quien pregunta

La página muestra el **nombre de la empresa**, que sale de la RPC junto con la
estructura.

**No muestra el logo**, y es deliberado: el logo vive en un bucket privado que
requiere sesión (`organization-assets`), y las dos alternativas para enseñarlo
en una página anónima serían abrirlo a `anon` o descargarlo con la clave de
servicio. Ninguna de las dos vale la pena por un adorno, y las dos abren una
superficie que hoy no existe.

Queda declarado como limitación consciente. Si en el futuro hiciera falta, el
camino correcto es un derivado público del logo —no abrir el privado.

## 10 · §94, §95 · Accesible y usable en un móvil

- Cada pregunta es un `<fieldset>` con su `<legend>`.
- Lo obligatorio se dice **con palabras** —«(obligatoria)» / «(opcional)»—, no
  con un asterisco de color.
- Los errores se anuncian con `role="alert"`.
- Los controles sin etiqueta visible llevan una `sr-only`.
- Ninguna información depende únicamente del color.
- El diseño es de una columna, con objetivos táctiles de 44 px en la escala y
  el botón a ancho completo en pantallas pequeñas.

## 11 · §103 · Probado contra Staging, de verdad

La suite RLS corre el flujo público **entero** contra el proyecto de Staging con
el cliente anónimo: emite un enlace real, resuelve la estructura, envía la
respuesta, la reutiliza y comprueba que la segunda vez se deniega. 60/60.

Y la PÁGINA se verificó sirviendo la compilación de producción y pidiéndola con
un token real y con uno inventado:

```
/survey/<token válido>    → 200 · nombre de empresa, aviso de anonimato,
                                  escala 0–10, «(obligatoria)», «No aplica en mi caso»
/survey/000…0 (inventado) → 200 · «Este enlace no está disponible»
                                  · 0 menciones de la empresa
```

## 12 · §105 · Y por qué no se probó en el Preview

La protección de despliegue de Vercel intercepta **todas** las rutas del
despliegue Preview, incluida la pública: `/survey/abc123` responde 302 como el
resto. Desactivar la protección global para probar una ruta sería exponer el
resto de la aplicación, así que **no se desactivó**.

La verificación equivalente se hizo en los dos entornos que sí lo permiten: la
RPC completa contra Staging y la página completa contra la compilación de
producción local. Lo que queda sin probar en Preview es el reparto de estáticos,
que no tiene nada específico de este dominio.
