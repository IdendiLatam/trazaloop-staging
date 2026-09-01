# PE-03B4 · Las preferencias de una persona

Migración **0161**. Nace porque «No volver a mostrar» necesita un sitio donde
vivir, y PE-03A había dejado escrito que en este repositorio no existía ninguno.

---

## 1 · Por qué no una columna en `profiles`

Porque la siguiente preferencia pediría otra columna, y la siguiente otra.

`profiles` es la identidad de una persona —quién es—, no el cajón de lo que ha
ido eligiendo. Mezclarlas convierte cada preferencia nueva en una migración
sobre la tabla más consultada del producto, y a los seis meses hay ocho columnas
de banderas que nadie sabe quién lee.

---

## 2 · Por qué no cuelga de una empresa

Una preferencia es **de la persona**.

Quien trabaja con tres empresas —el caso del consultor, que este producto
tiene— no quiere decir tres veces que no le vuelvan a enseñar el vídeo de
bienvenida. Y si cambiara de empresa, la decisión que ya tomó no puede
deshacerse sola.

`user_preferences` **no tiene `organization_id`**, y no es un olvido: es la
decisión. Una prueba lo comprueba leyendo las columnas de la tabla.

---

## 3 · La forma: una fila es un hecho, no un valor

```sql
create table public.user_preferences (
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  preference_key  text        not null,
  value           text,
  set_at          timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, preference_key),
  constraint user_preferences_key_check check (
    preference_key in ('welcome_video_suppressed')
  )
);
```

Para una preferencia de sí/no, **la existencia de la fila ES la preferencia**.
No hace falta guardar `true`, porque un `false` no significaría nada distinto de
no haberlo dicho nunca.

`value` existe para las preferencias que sí tengan un valor —un módulo
preferido, un idioma— y es nulo cuando el hecho se basta solo. Es lo mínimo que
sirve para las dos formas sin inventar un motor de configuración.

**El vocabulario es cerrado.** `preference_key` tiene su lista, igual que la
tienen las claves de pantalla y las de módulo. Una preferencia mal escrita que
se guarda en silencio es una preferencia que nadie lee nunca — y la prueba lo
comprueba escribiendo `welcome_video_supressed`, con una sola «p».

---

## 4 · Quién puede leer y escribir

Cada quien, lo suyo. Ni una línea más.

| Operación | Política |
|---|---|
| `select` | `user_id = auth.uid()` |
| `insert` | `with check (user_id = auth.uid())` |
| `update` | `using` **y** `with check`, las dos con `user_id = auth.uid()` |
| `delete` | **ninguna** |

Las tres repiten la condición a propósito. En `insert` y `update` va también en
el `with check`, que es lo que impide escribir una fila a nombre de otra
persona: sin él, `insert ... values (otro_uuid, ...)` pasaría la comprobación de
lectura y escribiría la preferencia de un tercero.

Comprobado contra la base, no razonado: B pide la fila de A y recibe cero filas;
B intenta insertar a nombre de A y falla; B intenta mover la fila de A a su
nombre y no actualiza nada.

---

## 5 · Y un superadministrador tampoco es una excepción

Es la parte que más importa de 0161.

**No hay política de DELETE.** Nadie puede borrar una fila de esta tabla por
RLS: ni la persona a la que pertenece, ni un superadministrador de plataforma.
Es lo que hace que «no volver a mostrar» sea de verdad definitivo, y no una
promesa que depende de que nadie escriba la pantalla que lo deshaga.

La decisión congelada dice que publicar una versión nueva del vídeo no reinicia
la preferencia y que no hay reinicio masivo. Sostener eso solo con «no lo hemos
implementado» habría sido sostenerlo con nada.

Si algún día hay que poder deshacerlo, será con una pantalla que lo diga y una
política que lo permita, no con una puerta que ya estaba abierta.

Las pruebas ejercen las dos mitades: el superadministrador intenta borrar la
preferencia de otra persona y no borra nada, y la propia persona tampoco.

---

## 6 · Guardarla, por la puerta canónica

```sql
create or replace function public.set_user_preference(p_key text, p_value text default null)
```

La escribe la persona con **su** sesión, así que la política se ejerce igual. La
función existe por otras dos razones:

- **`auth.uid()` lo pone el servidor.** No acepta un identificador de persona de
  quien llama: es la diferencia entre «guarda lo mío» y «guarda lo de este
  uuid». Ni siquiera hay forma de pedir lo segundo.
- **Es idempotente, y no reescribe `set_at`.** Pulsar dos veces «No volver a
  mostrar» no puede fallar por clave duplicada, y volver a pulsarlo no cambia el
  día en que se decidió: eso ya pasó.

---

## 7 · Sin dato NO es cero

`hasUserPreference()` devuelve `true`, `false` o **`null`** — la tercera es «no
se pudo leer».

Quien llama decide qué hacer con la duda, y para la bienvenida está decidido:
**ante la duda, no se muestra**. Entre enseñarle el vídeo a quien pidió no
volver a verlo y no enseñárselo a quien lo habría visto, la segunda equivocación
es la barata.

En el código eso es literalmente `if (suprimida !== false) return { status: "none" }`.

---

## 8 · Para la próxima preferencia

1. Añadir la clave a `user_preferences_key_check` (una migración de una línea).
2. Añadirla a `USER_PREFERENCE_KEYS` en `lib/db/user-preferences.ts`.
3. Usar `hasUserPreference` / `setUserPreference`.

No hace falta tabla nueva, ni política nueva, ni pensar otra vez quién puede
leer qué. Eso es lo que se pedía cuando el encargo decía «la arquitectura de
preferencias más pequeña que sirva para las que vengan».
