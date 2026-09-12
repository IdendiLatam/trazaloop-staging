# Revisión manual de Auth en Producción

**Motivo:** durante PROD-LAUNCH-01B.5 la configuración de
`Authentication → URL Configuration` se editó por accidente en el proyecto de
**Producción** (`mvmpadeixomwkpxbnhky`) creyendo que era Staging
(`qchzkxbnbqeyuxinipln`).

**Alcance de esta revisión:** inspección manual. No se cambió nada de
Producción desde código, y este documento **no propone valores**: no sé cuáles
había antes y no los voy a inventar.

**Impacto potencial si quedó mal:** los correos de recuperación de contraseña
de clientes reales llevarían a un despliegue de pruebas, o fallarían. Es un
efecto sobre personas, no sobre el ensayo.

---

## Dónde mirar

Panel de Supabase → proyecto **`mvmpadeixomwkpxbnhky`** → *Authentication* →
*URL Configuration*.

Confirma primero que la URL del panel contiene ese identificador. Hay tres
proyectos con nombres parecidos y es justo lo que provocó el enredo:

| Proyecto | Ref | Qué es |
|---|---|---|
| trazaloop-production | `mvmpadeixomwkpxbnhky` | **Producción** |
| trazaloop-staging-qa | `qchzkxbnbqeyuxinipln` | Staging (el del ensayo) |
| trazaloop-staging | `dtrxxqmdweykzncfmahc` | Staging antiguo, inactivo |

---

## Qué revisar

### 1 · Site URL

- [ ] ¿Apunta al dominio productivo (`www.trazaloop.com` o el que corresponda)?
- [ ] **Anomalía si** contiene `vercel.app`, `-git-`, o un identificador de
      despliegue como `evbxval3u`, `ekh6gc3gx`, `git-feature-6258ee`.

El Site URL es el destino al que cae cualquier enlace de Auth cuyo `redirect_to`
no esté permitido. Si apunta a una Preview, los correos de Producción aterrizan
en un despliegue de pruebas.

### 2 · Redirect URLs

- [ ] Revisa la lista entera, no solo la primera entrada.
- [ ] **Anomalía si** aparece cualquier entrada con `vercel.app`, con `-git-`,
      con un comodín tipo `trazaloop-production-*-idendi-latam-s-projects…`, o
      con las rutas que se usaron en el ensayo
      (`/settings/billing`, `/settings/billing/**`).
- [ ] Comprueba también que **siguen** las entradas legítimas de Producción:
      quitar una por error rompería la recuperación de contraseña igual de bien
      que añadir una de más.

### 3 · Destino de la recuperación de contraseña

La aplicación construye el destino como
`${NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`
(`server/actions/auth.ts`).

- [ ] Que `NEXT_PUBLIC_SITE_URL` en el proyecto de Vercel, entorno
      **production**, sea el dominio productivo.
- [ ] Que `<dominio productivo>/auth/callback` esté permitido en Redirect URLs.
- [ ] Prueba de humo, si quieres certeza: pide un restablecimiento con una
      cuenta de Producción que controles y comprueba que el correo lleva a
      `www.trazaloop.com/auth/callback…` y **no** a un `vercel.app`.

---

## Qué NO hacer

- No copiar aquí la configuración de Staging. Los dos entornos no comparten
  dominios y confundirlos otra vez es exactamente el fallo que se está
  corrigiendo.
- No añadir comodines de Preview a Producción. En Staging tampoco funcionaron:
  hubo que poner la URL exacta.
