# AUTH-MAGIC-01 · Un enlace mágico no deja sesión en esta aplicación

**Estado:** deuda registrada, sin corregir. No se construyó ninguna ruta nueva
en PROD-LAUNCH-01B.9.

## El defecto

Un enlace de Supabase de tipo `magiclink` verifica correctamente —GoTrue
registra el acceso— pero **la aplicación sigue con la sesión anterior, o sin
ninguna**.

La causa es una incompatibilidad de flujos:

- `/auth/v1/verify?token=…&type=magiclink` redirige con la sesión en el
  **fragmento** de la URL (`#access_token=…&refresh_token=…`). Un fragmento
  nunca viaja al servidor.
- Esta aplicación guarda la sesión en **cookies de servidor**
  (`@supabase/ssr`, flujo PKCE). Las páginas de aterrizaje son componentes de
  servidor.
- Para que el fragmento se consuma, alguna página tiene que montar un cliente
  de navegador con `detectSessionInUrl`. Se buscó: `createBrowserClient` solo
  se usa en `components/domain/tutorials/tutorial-upload.tsx` y
  `lib/storage/direct-upload.ts`. **Ninguna página de aterrizaje lo monta.**

Resultado: el fragmento se descarta silenciosamente.

## Cómo se descubrió

Durante PROD-LAUNCH-01B.5. Se emitió un enlace para la administradora de
`QA Empresa A` (`c74b82bf-…`). GoTrue registró su acceso a las 18:32:56, pero
la aplicación siguió renderizando para `2b27d90e-…` —cuyo último acceso es de
las 18:34:56— y esa cuenta veía sus propias dos empresas, no la del enlace.

El diagnóstico se cerró comparando membresías: la cuenta del enlace tiene una
sola; la que se veía en pantalla, exactamente las dos que aparecían.

## Alcance

| Flujo | ¿Afectado? | Por qué |
|---|---|---|
| Enlace mágico (`type=magiclink`) | **Sí** | Devuelve la sesión en el fragmento |
| Invitación (`type=invite`) | **Probablemente** | Mismo mecanismo de verificación; no se ejecutó |
| Recuperación de contraseña | **No** | Usa el flujo PKCE con `code` |

La recuperación de contraseña pide el enlace desde el cliente de **servidor**
(`server/actions/auth.ts`), con `redirectTo` a
`/auth/callback?next=/reset-password`. Ese callback llama a
`exchangeCodeForSession(code)`, que sí establece la cookie. Es un camino
distinto y funciona.

Con una salvedad que no es este defecto pero conviene conocer: PKCE guarda el
verificador en una cookie del navegador que **pidió** el restablecimiento. Si
alguien abre el correo en otro navegador o dispositivo, el intercambio falla.
Es una limitación conocida de PKCE, no de esta implementación.

## La corrección, cuando se aborde

El camino que recomienda Supabase para aplicaciones de servidor es una ruta de
confirmación que acepte `token_hash`:

```
/auth/confirm?token_hash=<hash>&type=<tipo>&next=<destino>
   → supabase.auth.verifyOtp({ type, token_hash })
   → la cookie queda en el dominio de la aplicación
   → redirección a <destino>
```

Ventajas sobre lo actual: no depende de la lista de redirecciones de GoTrue
—el destino lo valida la propia aplicación— y sirve igual para invitaciones.

Dos cosas a cuidar cuando se construya:

1. `next` **no** puede ser una URL arbitraria. El `/auth/callback` que ya
   existe lo resuelve bien: solo admite dos destinos fijos y lo dice en un
   comentario. La ruta nueva debería mantener esa disciplina, con una lista
   cerrada de destinos.
2. Es una superficie de autenticación. Merece su propio tramo, con pruebas de
   testigo caducado, testigo reutilizado, tipo incorrecto y destino no
   permitido.

## Rodeo usado mientras tanto

Para desbloquear el ensayo se añadió una membresía temporal en Staging
(`22b3cfe6-2d82-43d9-bb53-af71748b7001`), ya retirada en PROD-LAUNCH-01B.9.
No es una solución: es lo que se hizo para no cambiar contraseñas ni construir
una ruta de autenticación a medias.
