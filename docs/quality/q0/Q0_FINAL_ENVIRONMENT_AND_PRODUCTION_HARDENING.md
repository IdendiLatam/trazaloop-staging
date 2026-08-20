# Q0_FINAL_ENVIRONMENT_AND_PRODUCTION_HARDENING

**Cierre de infraestructura pre-Quality**
**Fecha:** 2026-08-19
**Rama:** `chore/quality-q0-platform-hardening`
**Veredicto:** **TRAZALOOP PLATFORM READY FOR QUALITY WITH GAPS**

---

## 0. Cadena oficial de entornos

```text
LOCAL (Docker · trazaloop-local)
        ↓
STAGING · qchzkxbnbqeyuxinipln · trazaloop-staging-qa · us-west-2
        ↓
PRODUCTION · mvmpadeixomwkpxbnhky · trazaloop-production · us-west-2
```

**Fuera de la cadena:**

```text
dtrxxqmdweykzncfmahc · trazaloop-staging · ca-central-1 · PAUSADO
LEGACY STAGING — DO NOT USE
```

---

## 1. Local — estado final

| Dato | Valor |
|---|---|
| Identidad | `trazaloop-local` (Docker) |
| PostgreSQL | 17.6 |
| Migraciones | **103** |
| Esquema | 87 tablas · 33 vistas · 146 funciones · 295 triggers · 253 políticas |
| RLS | **87 / 87** |
| Privilegios | 108 / 118 / 120 · `TRUNCATE` cliente = 0 |
| Storage | 3 buckets privados · 9 políticas |
| Pruebas | `tsc` limpio · `test:rls` **110/110** · compliance limpio · ESLint 1 warning preexistente |

## 2. Staging oficial

| Dato | Valor |
|---|---|
| Project ref | **`qchzkxbnbqeyuxinipln`** |
| Nombre | `trazaloop-staging-qa` |
| Organización | `mjrmschzqbrvjvecvtfv` (Idendi Latam) |
| Región | `us-west-2` — la misma que producción |
| PostgreSQL | 17.6.1.155 |
| Estado | `ACTIVE_HEALTHY` |
| Migraciones | **103** |
| Esquema | idéntico a local |
| Privilegios | 108 / 118 / 120 · `TRUNCATE`/`REFERENCES`/`TRIGGER` cliente = 0 |
| Datos | **solo sintéticos** — nunca copia de producción |

## 3. Staging legacy — **DO NOT USE**

| Dato | Valor |
|---|---|
| Project ref | `dtrxxqmdweykzncfmahc` |
| Nombre | `trazaloop-staging` |
| Región | `ca-central-1` |
| Estado | **PAUSADO** |
| Situación | **LEGACY — NO USAR, NO REACTIVAR, NO BORRAR** |

No forma parte de la cadena oficial. Ninguna configuración de este repositorio lo referencia.
Fue el destino del antiguo `.env.local` y el origen de la confusión documentada en Q0.4 §0 —
donde se corrigió la conclusión errónea de Q0.1 que lo daba por eliminado cuando solo estaba
pausado. **No se inspeccionaron sus datos.**

## 4. Vercel Preview

Siete variables creadas en el entorno **Preview**, apuntando **exclusivamente** a Staging:

```text
NEXT_PUBLIC_SUPABASE_URL              → https://qchzkxbnbqeyuxinipln.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  → clave anónima de Staging
SUPABASE_SECRET_KEY                   → clave secreta de Staging (server-only)
ACTIVE_ORG_COOKIE_SECRET              → NUEVO, exclusivo de Staging
NEXT_PUBLIC_SITE_URL                  → URL del despliegue Preview
TEXTILES_MODULE_ENABLED               → true
PUBLIC_REGISTRATION_ENABLED           → true
NEXT_TELEMETRY_DISABLED               → 1
```

**Ninguna variable de Production fue modificada.** Ningún secreto de Production se reutilizó.
Se usaron los **nombres vigentes** (`SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`),
que son los que Production ya emplea — corrigiendo la suposición de Q0.2 §6 de que Production
usaba los nombres heredados.

Despliegue Preview generado y `Ready`. La rama se publicó en `origin` para habilitar el flujo de
Preview; **sin force push, sin tocar otras ramas**.

### Protección de despliegue

Los despliegues Preview están tras la **autenticación SSO de Vercel**: todas las rutas devuelven
302 hacia `vercel.com/sso-api` para un visitante no autenticado. Es una postura de seguridad
deliberada del proyecto.

**No se desactivó ni se añadió un secreto de bypass**, porque ese ajuste es de nivel de proyecto y
se comparte con Production. La validación de la capa de aplicación se hizo levantando la
aplicación **en local apuntando a Staging**, que cubre exactamente lo mismo sin alterar la
seguridad del proyecto.

## 5. Auth de Staging

Configurado con `supabase config push --project-ref qchzkxbnbqeyuxinipln` — **ref explícito, sin
vincular el repositorio**. El `config.toml` local se restauró desde Git inmediatamente después y
quedó idéntico al commit.

| Ajuste | Valor |
|---|---|
| `site_url` | URL del despliegue Preview |
| `additional_redirect_urls` | Preview (exacta y comodín) + `localhost:3000` |
| **Confirm email** | **habilitado** — aproxima el comportamiento a Production |

Flujos validados con identidades QA sintéticas (`@trazaloop-staging.local`):

| Flujo | Resultado |
|---|---|
| Alta de usuario | HTTP 200 |
| Login | HTTP 200, sesión emitida |
| Usuario autenticado | HTTP 200 |
| Logout | HTTP 204 |
| Enlace de recuperación | HTTP 200, con el Preview como `redirect_to` **aceptado** |
| Re-login tras logout | HTTP 200 |
| Signup sin confirmar | **sin sesión inmediata** — la confirmación está activa, como en Production |

**Auth de Production no fue tocado.**

## 6. SMTP de Staging — G-3, NON-BLOCKING

Staging usa el servicio de correo integrado de Supabase, que solo entrega a direcciones de
miembros del proyecto. Las identidades QA usan un dominio ficticio, de modo que **el correo real
no se entrega** — y eso es deseable: **cero riesgo de escribir a un cliente real**.

Los flujos que dependen del correo se validaron por la vía de administración
(`admin/generate_link`), que devuelve el enlace directamente sin necesidad de entrega.

Configurar un SMTP propio de staging es una decisión externa que **no bloquea** el inicio de
Quality. Se documenta como **G-3 · NON-BLOCKING**.

## 7. Smoke de Staging

**Capa de datos** (`smoke-staging.ts`): **8 / 8 en verde**.

**Capa de aplicación** (Next.js local → Supabase Staging):

| Ruta | Resultado |
|---|---|
| `/login` `/register` `/terms` `/privacy` | **HTTP 200** |
| `/dashboard` `/textiles` `/trazadocs` `/platform` | **HTTP 307** (redirige sin sesión — fail-closed) |

**Datos y aislamiento** (validado en Q0.4 y reconfirmado): organización, membresías, acceso
modular con Demo de 48 h, PCR con cadena completa hasta **cálculo 70,00 % · defensible**,
TrazaDocs, evidencias, Storage con escritura sin *intent* denegada y aislamiento entre empresas
con **0 filas** cruzadas.

**Quality en Staging:** `is_available=false`, `is_functional=false`, **0 tablas `quality_*`**, y un
tenant que intenta activarlo recibe *«Solo un superadministrador…»*.

## 8. DR-02 — **CERRADA**

```text
ACTIVE_ORG_COOKIE_SECRET · Vercel Production → EXISTS
```

Verificado con `vercel env ls`, que muestra nombre, tipo y entorno pero **no el valor**. Aparece
como *Sensitive · Hidden · Production*. **El valor nunca se leyó, mostró ni descargó.**

De paso se confirmó que Production tiene 7 variables, todas de ámbito Production, y que **no
existía ninguna variable en Preview ni Development** antes de este trabajo.

## 9. Precheck de Production

| Comprobación | Resultado |
|---|---|
| Project ref | `mvmpadeixomwkpxbnhky` — verificado carácter a carácter |
| Migraciones remotas | 102 aplicadas |
| **Pendientes** | **exactamente 1 — la 0111** |
| Remotas ausentes en local | **0** |
| Esquema | 87 tablas · 33 vistas · 146 funciones · 295 triggers · 253 políticas |
| RLS | 87 / 87 |
| Privilegios | 108 / 118 / 120 objetos, con `GRANT ALL` heredado |
| Sitio | `www.trazaloop.com` → HTTP 200 |

### Propiedades de 0111 verificadas antes de escribir

| Propiedad | Comprobación |
|---|---|
| No modifica datos | Solo `GRANT` / `REVOKE`; ningún `INSERT`/`UPDATE`/`DELETE` |
| No modifica estructura | Ningún `CREATE`/`ALTER`/`DROP TABLE` |
| No modifica RLS | Ningún `ENABLE/DISABLE ROW LEVEL SECURITY` |
| No modifica políticas | Ningún `CREATE`/`DROP POLICY` |
| Idempotente | `GRANT`/`REVOKE` son idempotentes por naturaleza |
| Rollback | Documentado en la cabecera de la migración y respaldado (§13) |

## 10. Promoción de 0111 a Production

```bash
supabase db push --project-ref mvmpadeixomwkpxbnhky --include-all
# → Applying migration 0111_platform_role_privileges.sql...
# → exit 0 · migrations: ["0111_platform_role_privileges.sql"]
```

**Única escritura ejecutada en Production durante todo este trabajo.** Precedida de una guarda que
compara el ref de destino carácter a carácter y aborta si no coincide.

Resultado: **103 migraciones aplicadas, 0 pendientes**, última `0111`.

## 11. Privilegios de Production — antes y después

| Métrica | Antes | Después | Objetivo |
|---|---|---|---|
| `anon` · objetos con GRANT | 108 | **108** | 108 |
| `authenticated` | 118 | **118** | 118 |
| `service_role` | 120 | **120** | 120 |
| `GRANT ALL` a `anon` | **106** | **0** | 0 |
| `GRANT ALL` a `authenticated` | **116** | **0** | 0 |
| `TRUNCATE` a roles cliente | presente | **0** | 0 |
| `REFERENCES` a roles cliente | presente | **0** | 0 |
| `TRIGGER` a roles cliente | presente | **0** | 0 |
| Tablas server-only con acceso cliente | 0 | **0** | 0 |
| `calculation_methodologies` / `recycled_content_calculations` | solo lectura | **solo lectura** | preservado |

Los roles de cliente pasan de `GRANT ALL` a `SELECT, INSERT, UPDATE, DELETE, MAINTAIN` en 116
objetos, y a `SELECT, MAINTAIN` en los 2 endurecidos por 0028. **`TRUNCATE` — que bypasea RLS por
completo — desaparece de los roles de cliente en producción.**

### Prueba de que 0111 no tocó nada más

Se compararon los volcados de esquema anterior y posterior **excluyendo las líneas
`GRANT`/`REVOKE`**:

```text
✅ IDÉNTICOS — 0111 no tocó estructura, RLS, políticas, funciones ni triggers
```

87 tablas, 33 vistas, 146 funciones, 295 triggers, 253 políticas y 87 `ENABLE ROW LEVEL SECURITY`
antes y después. Sin una sola diferencia.

## 12. Smoke de Production

| Comprobación | Resultado |
|---|---|
| `www.trazaloop.com` | **HTTP 200** |
| `/login` `/register` `/terms` `/privacy` | **HTTP 200** |
| `/dashboard` `/textiles` `/trazadocs` `/platform` `/evidences` | **HTTP 307** — redirigen sin sesión |
| **Lectura real de base de datos** | `/terms` renderiza el documento legal desde `legal_documents` con el rol anónimo: *«Términos de uso de Trazaloop v1.0 · Estado: VIGENTE · Fecha de aprobación: 27 de julio»* |
| Quality | **0 tablas `quality_*`**, sigue no funcional |

La página `/terms` es la prueba de extremo a extremo más valiosa: es una lectura de la base
ejecutada por el rol `anon` **después** del cambio de privilegios. Si 0111 hubiera roto algo,
esa página fallaría. **Sin regresión.**

## 13. Preparación de rollback

Antes de escribir se preservó la matriz completa de privilegios de Production:

```text
~/trazaloop-prod-privileges-before-0111-20260819-204632.sql
700 sentencias GRANT/REVOKE · permisos 600 · fuera del repositorio
```

Contiene **solo** privilegios: ningún dato de negocio. Reaplicarlo restaura el estado previo.

Rollback adicional documentado en la cabecera de la propia migración. **No fue necesario:** no se
detectó ninguna regresión.

## 14. Paridad de migraciones

| Entorno | Migraciones | Estado |
|---|---|---|
| LOCAL | **103** | alineado |
| STAGING | **103** | alineado |
| PRODUCTION | **103** | **alineado** |

**Los tres entornos están ahora en el mismo punto.** La divergencia intencional que Q0.4 §17
documentaba (102 vs 103) queda **cerrada**: producción es por fin reproducible desde el
repositorio.

## 15. Gaps restantes

| # | Gap | Severidad | Bloquea Quality |
|---|---|---|---|
| **G-1** | `NEXT_PUBLIC_SITE_URL` de Preview apunta a la URL de un despliegue concreto, no a un alias estable | Baja | No |
| **G-2** | Los despliegues Preview están tras SSO de Vercel: no navegables sin cuenta del equipo | Baja | No |
| **G-3** | Sin SMTP propio en Staging | Baja | **No** — decisión externa |
| **G-4** | Proyecto legacy pausado con nombre casi idéntico | Baja | No |
| **G-5** | `test:t9f3-rls` deja 2 residuos en la limpieza | Baja | No — preexistente |
| **G-6** | ESLint: 1 variable sin usar en un test | Trivial | No — preexistente |

Ninguno afecta al esquema, los privilegios, RLS, Storage ni a la corrección de los tres entornos.

## 16. Estado de Git

```text
rama: chore/quality-q0-platform-hardening
3c354d2 docs(quality): validate managed Supabase staging environment (Q0.4)
8111eef chore(platform): harden reproducible Supabase baseline for Quality
0289a8d fix(auth): complete password recovery flow
```

Rama publicada en `origin` para habilitar Preview. **Sin force push. Sin mezclar otras ramas.**
Ningún secreto versionado: contraseñas, claves API y el respaldo de privilegios viven fuera del
repositorio con permisos `600`.

**Vinculación del repositorio: DESVINCULADO.** Toda operación remota exige `--project-ref`
explícito.

## 17. Cadena oficial de entornos — resumen operativo

| | LOCAL | STAGING | PRODUCTION |
|---|---|---|---|
| Ref | `trazaloop-local` | `qchzkxbnbqeyuxinipln` | `mvmpadeixomwkpxbnhky` |
| Vercel | — | Preview | Production |
| Migraciones | 103 | 103 | 103 |
| RLS | 87/87 | 87/87 | 87/87 |
| Privilegios | 108/118/120 | 108/118/120 | 108/118/120 |
| `TRUNCATE` cliente | 0 | 0 | **0** |
| Datos | sintéticos | sintéticos | reales |
| Escritura | libre | libre | **solo procedimiento aprobado (DR-19)** |

Regla de promoción: **local → staging → production**, sin saltos, con aprobación humana explícita
en el último tramo.
