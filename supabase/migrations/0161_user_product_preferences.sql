-- ============================================================================
-- Trazaloop · PE-03B4 · LAS PREFERENCIAS DE UNA PERSONA
-- ----------------------------------------------------------------------------
-- «No volver a mostrar» necesita un sitio donde vivir, y PE-03A dejó escrito
-- que en este repositorio no existía ninguno: no hay sistema de preferencias
-- por persona.
--
--
-- POR QUÉ NO UNA COLUMNA EN `profiles`
--
-- Porque la siguiente preferencia pediría otra columna, y la siguiente otra.
-- `profiles` es la identidad de una persona —quién es—, no el cajón de lo que
-- ha ido eligiendo. Mezclarlas convierte cada preferencia nueva en una
-- migración sobre la tabla más consultada del producto.
--
--
-- POR QUÉ NO CUELGA DE UNA EMPRESA
--
-- Una preferencia es de la PERSONA. Quien trabaja con tres empresas —el caso
-- del consultor, que este producto tiene— no quiere decir tres veces que no le
-- vuelvan a enseñar el vídeo de bienvenida. Aquí no hay `organization_id`, y no
-- es un olvido: es la decisión.
--
--
-- LA FORMA: UNA FILA ES UN HECHO, NO UN VALOR
--
-- La tabla guarda «esta persona dijo esto, este día». Para «no volver a
-- mostrar», la existencia de la fila ES la preferencia: no hace falta guardar
-- `true`, porque un `false` no significaría nada distinto de no haberlo dicho.
--
-- `value` existe para las preferencias que sí tengan un valor —un módulo
-- preferido, un idioma— y es nulo cuando el hecho se basta solo. Es lo mínimo
-- que sirve para las dos formas sin inventar un motor de configuración.
--
-- El vocabulario es CERRADO. `preference_key` tiene su lista, igual que la
-- tienen las claves de pantalla y las de módulo: una preferencia mal escrita
-- que se guarda en silencio es una preferencia que nadie lee nunca.
--
--
-- LO QUE NO SE PUEDE HACER, Y ES A PROPÓSITO
--
-- No hay política de DELETE. La decisión congelada dice que «no volver a
-- mostrar» no se deshace: ni publicando una versión nueva del vídeo, ni con un
-- reinicio masivo desde la consola. Sin política, `delete` no lo puede hacer
-- nadie por RLS — tampoco un superadministrador de plataforma, que para esto no
-- tiene ningún privilegio especial.
--
-- Si algún día hay que poder deshacerlo, será con una pantalla que lo diga y
-- una política que lo permita, no con una puerta que ya estaba abierta.
-- ============================================================================


-- ============================================================================
-- 1 · LA TABLA
-- ============================================================================

create table public.user_preferences (
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  preference_key  text        not null,
  -- Nulo cuando el hecho se basta solo. Ver la cabecera.
  value           text,
  set_at          timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  primary key (user_id, preference_key),

  constraint user_preferences_key_check check (
    preference_key in (
      -- PE-03B4 · «No volver a mostrar» el vídeo de bienvenida.
      'welcome_video_suppressed'
    )
  )
);

comment on table public.user_preferences is
  'PE-03B4 · Lo que una persona ha elegido, por persona y NUNCA por empresa. Una fila es un hecho: para las preferencias de si/no, su existencia ES la preferencia. Vocabulario cerrado en user_preferences_key_check.';

comment on column public.user_preferences.value is
  'PE-03B4 · Nulo cuando el hecho se basta solo (por ejemplo welcome_video_suppressed). Para una preferencia con valor —un modulo preferido, un idioma— aqui va ese valor.';

-- Se consulta siempre por persona, y la clave primaria ya empieza por
-- `user_id`, asi que no hace falta ningun indice mas.


-- ============================================================================
-- 2 · QUIÉN PUEDE LEER Y ESCRIBIR
-- ----------------------------------------------------------------------------
-- Cada quien, lo suyo. Ni una linea mas.
--
-- Las cuatro politicas repiten `user_id = auth.uid()` a proposito: en INSERT y
-- UPDATE va tambien en el `with check`, que es lo que impide escribir una fila
-- a nombre de otra persona. Sin el, `insert ... values (otro_uuid, ...)` pasaria
-- la comprobacion de lectura y escribiria la preferencia de un tercero.
-- ============================================================================

alter table public.user_preferences enable row level security;

create policy user_preferences_select_own on public.user_preferences
  for select to authenticated
  using (user_id = auth.uid());

create policy user_preferences_insert_own on public.user_preferences
  for insert to authenticated
  with check (user_id = auth.uid());

create policy user_preferences_update_own on public.user_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Sin politica de DELETE. Ver la cabecera: no es un olvido.

revoke all on public.user_preferences from public, anon;
grant select, insert, update on public.user_preferences to authenticated;


-- ============================================================================
-- 3 · GUARDARLA, POR LA PUERTA CANÓNICA
-- ----------------------------------------------------------------------------
-- La escribe la persona con SU sesion, asi que la politica se ejerce igual. La
-- funcion existe por otras dos razones:
--
--   · escribir `auth.uid()` en el servidor y no aceptarlo de quien llama, que
--     es la diferencia entre «guarda lo mio» y «guarda lo de este uuid»;
--   · ser idempotente. Pulsar dos veces «No volver a mostrar» no puede fallar
--     por clave duplicada, y volver a pulsarlo NO cambia el dia en que se dijo:
--     `set_at` es cuando se decidio, y eso ya paso.
-- ============================================================================

create or replace function public.set_user_preference(
  p_key text,
  p_value text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  insert into public.user_preferences (user_id, preference_key, value)
  values (auth.uid(), p_key, p_value)
  on conflict (user_id, preference_key) do update
    set value = excluded.value,
        updated_at = now();
end;
$$;

comment on function public.set_user_preference(text, text) is
  'PE-03B4 · Guarda una preferencia de QUIEN LLAMA. No acepta un user_id: lo pone el servidor con auth.uid(). Idempotente, y no reescribe set_at — el dia en que se decidio ya paso.';

revoke all on function public.set_user_preference(text, text) from public, anon;
grant execute on function public.set_user_preference(text, text) to authenticated;
