# Q0_4_STAGING_ENVIRONMENT_VALIDATION

**Sprint:** Q0.4 — Supabase Staging Creation & Managed-Environment Validation
**Fecha:** 2026-08-19
**Rama:** `chore/quality-q0-platform-hardening`
**Veredicto:** **STAGING READY WITH GAPS**

---

## 0. Corrección de un hallazgo anterior

Antes de nada, una rectificación que afecta a tres documentos previos.

En Q0.1 concluí que el proyecto `dtrxxqmdweykzncfmahc` —al que apuntaba `.env.local`— **no
existía**, porque no tenía ningún registro DNS ni respondía su API. Esa inferencia era
**incorrecta**.

El proyecto existe. Es `trazaloop-staging`, en estado **`INACTIVE`** (pausado), región
`ca-central-1`, PostgreSQL 17.6.1.141. Supabase pausa por inactividad los proyectos del plan
gratuito y les retira el DNS, que es exactamente lo que observé. Interpreté un proyecto **pausado**
como un proyecto **eliminado**.

Lo que **no** cambia: `.env.local` apuntaba a un proyecto no operativo y el desarrollo local estaba
efectivamente roto. La conclusión práctica se sostiene; la causa estaba mal identificada.

Lo que **sí** cambia: existía ya un proyecto de staging que podría haberse reactivado, y la
organización tenía tres proyectos, no dos. Ver §19 y §21.

Documentos afectados: `Q0_1_REMOTE_VERIFICATION.md` §3, `Q0_2_ENVIRONMENT_SAFETY_PLAN.md` §1.1 y
§2, `Q0_3_LOCAL_ENVIRONMENT_IMPLEMENTATION.md` (P-2). Se añade addendum a Q0.2.

---

## 1. Staging project ref

```text
qchzkxbnbqeyuxinipln
```

## 2. Organización y región

| Dato | Valor |
|---|---|
| Nombre | `trazaloop-staging-qa` |
| Organización | `mjrmschzqbrvjvecvtfv` (Idendi Latam) |
| Región | `us-west-2` — **la misma que producción** |
| PostgreSQL | 17.6.1.155 |
| Estado | `ACTIVE_HEALTHY` |
| Host | `db.qchzkxbnbqeyuxinipln.supabase.co` |

**Sobre el nombre.** Se eligió `trazaloop-staging-qa` y no `trazaloop-staging` porque **ese nombre
ya está ocupado** por el proyecto pausado (§0). Dos proyectos con el mismo nombre en la misma
organización son exactamente el tipo de ambigüedad que originó el problema de `.env.local`.

## 3. Procedimiento de creación

```bash
supabase projects create "trazaloop-staging-qa" \
  --org-id mjrmschzqbrvjvecvtfv \
  --region us-west-2 \
  --db-password "$(cat ~/.trazaloop-staging-db-password.secret)"
```

Contraseña generada con `openssl rand`, 32 caracteres, **exclusiva de staging**, guardada **fuera
del repositorio** con permisos `600`. Nunca se imprimió, ni se escribió en documentación, ni entró
en ningún commit.

El CLI no ofrece subcomando de restauración, de modo que reactivar el proyecto pausado habría
exigido el panel: una acción humana. Crear uno nuevo era además lo correcto por región
(`ca-central-1` → `us-west-2`) y por el requisito de que staging **naciera sin datos**.

## 4. Migration history

| Momento | Locales | Remotas aplicadas |
|---|---|---|
| Antes del push | 103 | **0** |
| Después del push | 103 | **103** |

El proyecto nació sin migraciones y sin datos empresariales. **No se copió nada de producción.**

## 5. Resultado de las 103 migraciones

`supabase db push --include-all` → **exit 0**. Las 103 se aplicaron en orden:
`0001`–`0006`, `0015`–`0110` y `0111_platform_role_privileges.sql`.

**Ninguna falló. No se usó `migration repair`. Ninguna migración se marcó como aplicada sin
ejecutarse. No se modificó ninguna migración histórica.**

## 6. Diferencias managed / local

Las esperadas y ninguna relevante:

| Aspecto | Local | Staging (gestionado) |
|---|---|---|
| PostgreSQL | 17.6 | 17.6.1.155 |
| Propiedad del esquema `storage` | superusuario local | del proveedor |
| Conexión | directa `127.0.0.1:54322` | *pooler* `aws-0-us-west-2` |
| Correo | Mailpit local | sin SMTP configurado (§12) |

## 7. Resultado del riesgo de ownership en Storage

**El riesgo no se materializó.**

Q0.2 §4.5 identificó como principal incógnita que las migraciones que crean políticas sobre
`storage.objects` —0016, 0049, 0058, 0076, 0099, 0101— pudieran fallar en un proyecto gestionado
por pertenecer ese esquema al proveedor, con el error `must be owner of relation objects`.

En Staging **se aplicaron sin un solo error**. El resultado son las **9 políticas** esperadas, con
los mismos nombres y operaciones que en local y en producción. Las propias migraciones 0099 y 0101
ya habían previsto la limitación omitiendo los `comment on policy`, que era la única sentencia
realmente bloqueada.

**Q0.4 cierra la incógnita técnica que motivó exigir un entorno de staging.**

## 8. Inventario de esquema

| Objeto | Staging | Local | Esperado |
|---|---|---|---|
| Migraciones | **103** | 103 | 103 |
| Tablas `public` | **87** | 87 | 87 |
| Vistas | **33** | 33 | 33 |
| Funciones | **146** | 146 | 146 |
| Triggers | **295** | 295 | 295 |
| Políticas `public` | **253** | 253 | 253 |

Paridad exacta.

## 9. RLS

**87 / 87 tablas con RLS activa. Cero tablas tenant-owned expuestas.**
`storage.objects` con `relrowsecurity = true`.

## 10. Matriz de privilegios (0111)

| Métrica | Staging | Esperado |
|---|---|---|
| `anon` — objetos con SELECT | **108** | 108 |
| `authenticated` | **118** | 118 |
| `service_role` | **120** | 120 |
| `TRUNCATE` para roles de cliente | **0** | 0 |
| `REFERENCES` para roles de cliente | **0** | 0 |
| `TRIGGER` para roles de cliente | **0** | 0 |
| `TRUNCATE` para `service_role` | 120 | conservado |

Verificaciones **semánticas**, no solo de conteo:

- `storage_upload_intents` y `storage_orphan_candidates`: **sin ningún privilegio de cliente**.
- `calculation_methodologies` y `recycled_content_calculations`: **solo `SELECT`** para
  `authenticated` — el endurecimiento de 0028 sobrevive a 0111.
- `memberships` para `authenticated`: `SELECT, INSERT, UPDATE, DELETE` — RLS decide las filas.
- Las **10** vistas de plataforma e inventario permanecen ocultas a `anon`.

## 11. Storage

3 buckets, **los tres privados**: `evidences`, `organization-assets`, `trazadocs-documents`.
9 políticas sobre `storage.objects`: 4 INSERT, 3 SELECT, 1 UPDATE, 1 DELETE — todas del bucket de
activos salvo las de lectura y las ligadas a *intent*.

Pruebas funcionales reales contra Staging:

| Prueba | Resultado |
|---|---|
| Escritura en `evidences` **sin intent** | **denegada** |
| Escritura en `trazadocs-documents` **sin intent** | **denegada** |
| Escritura en `organization-assets` de la propia empresa | permitida |
| Escritura en la carpeta de **otra** empresa | **denegada** |
| Lectura del objeto propio | permitida |
| `DELETE` directo en `evidences` | **denegado** (sin política) |
| URL firmada | **emitida correctamente** |

## 12. Auth

Se creó lo mínimo para validar, **sin copiar ningún secreto de producción**: dos identidades QA
propias (`qa-a@` y `qa-b@trazaloop-staging.local`) mediante la API de administración con
`email_confirm: true`, ya que staging todavía no tiene SMTP.

**Deliberadamente NO ejecutado: `supabase config push`.** Nuestro `config.toml` es la configuración
del stack **local** (`site_url = http://localhost:3000`, confirmación de correo desactivada).
Aplicarlo a Staging habría dejado el proyecto apuntando a `localhost` y sin confirmación de correo
—peor que no configurarlo—.

**Pendiente cuando exista la URL de Vercel Preview** (§20):
*Site URL*, *Additional Redirect URLs*, y **Confirm email = enabled**, que es crítico porque
Trazaloop no implementa confirmación propia.

## 13. Seed

`scripts/seed-demo.ts`, el mecanismo existente, ejecutado contra Staging con
`DEMO_ORGANIZATION_ID` explícito. **No se creó ningún segundo mecanismo de seed y no hizo falta
adaptarlo**: ya exige organización explícita, verifica la membresía y opera con la clave anónima
bajo RLS, sin `service_role`.

Resultado: cadena completa proveedor → evidencia validada → materiales → familia → producto →
lote de entrada → orden → consumo → lote de salida → composición → **cálculo 70,00 % ·
defensible**. Solo datos sintéticos.

## 14. Smoke

`scripts/smoke-staging.ts` contra Staging: **8 / 8 en verde** — variables, conexión, migraciones,
RLS conductual, bucket privado, metodología activa, 52 preguntas de diagnóstico y 10
clasificaciones de material.

## 15. Seguridad multiempresa

Ejecutado con un usuario **sin privilegios de plataforma**:

| Comprobación | Resultado |
|---|---|
| Empresa B no ve datos de A (9 tablas) | **0 filas en todas** |
| Usuario común lee `platform_staff` | **0 filas** |
| Usuario común lee `v_platform_organizations` | **0 filas** |
| `storage_upload_intents` desde cliente | **42501** |
| `storage_orphan_candidates` desde cliente | **42501** |
| Empresa se auto-asigna plan `extra` | **sin efecto** — siguió en `demo` |
| Tenant activa el módulo Quality | **rechazado**: *«Solo un superadministrador…»* |
| Quality en catálogo | `is_available=false`, `is_functional=false` |
| Tablas `quality_*` | **0** |

## 16. Comparación LOCAL / STAGING / PRODUCTION

| | LOCAL | STAGING | PRODUCTION |
|---|---|---|---|
| Project ref | `trazaloop-local` | `qchzkxbnbqeyuxinipln` | `mvmpadeixomwkpxbnhky` |
| Región | Docker | us-west-2 | us-west-2 |
| PostgreSQL | 17.6 | 17.6.1.155 | 17.6.1.147 |
| **Migraciones** | **103** | **103** | **102** |
| Tablas | 87 | 87 | 87 |
| Vistas | 33 | 33 | 33 |
| Funciones | 146 | 146 | 146 |
| Triggers | 295 | 295 | 295 |
| Políticas `public` | 253 | 253 | 253 |
| Tablas con RLS | 87/87 | 87/87 | 87/87 |
| Buckets privados | 3 | 3 | 3 |
| Políticas Storage | 9 | 9 | 9 |
| `anon` / `auth` / `service_role` | 108/118/120 | 108/118/120 | 108/118/120 |
| **`TRUNCATE` cliente** | **0** | **0** | **108** |
| **`REFERENCES` / `TRIGGER` cliente** | **0** | **0** | presentes |
| Datos | sintéticos | sintéticos | reales |

## 17. Análisis de drift

**Cero drift.** Las dos únicas diferencias son **intencionales y documentadas**:

**I-1 · Producción tiene 102 migraciones; Local y Staging tienen 103.**
La diferencia es exactamente `0111_platform_role_privileges.sql`. Producción no la necesita para
funcionar —sus privilegios existen desde el bootstrap— pero sí para ser *reproducible*. Su
promoción es una decisión aparte, sujeta a DR-19.

**I-2 · Producción conserva `TRUNCATE`, `REFERENCES` y `TRIGGER` en roles de cliente.**
Heredado del `GRANT ALL` de su bootstrap. 0111 no los concede y los retira explícitamente, de modo
que Local y Staging quedan **más restrictivos**. `TRUNCATE` bypasea RLS: es un endurecimiento real,
no una divergencia accidental. **Staging no es incorrecto por diferir de producción aquí; es el
comportamiento objetivo.**

Ninguna de las dos es drift: son el estado objetivo aprobado en DR-22, pendiente de promoción
controlada a producción.

**Producción no fue tocada en ningún momento de Q0.4.**

## 18. Manejo de secretos

| Secreto | Tratamiento |
|---|---|
| Contraseña de BD de staging | `openssl rand`, 32 car., **exclusiva**; en `~/.trazaloop-staging-db-password.secret`, permisos `600`, **fuera del repositorio** |
| Claves API de staging | En el scratchpad de sesión con permisos `600`, fuera del repositorio |
| Contraseña de las identidades QA | Ídem |
| Impresión | **Ningún valor se imprimió**. Toda salida que pudiera contenerlos pasó por un filtro de redacción |
| Commits | **Ningún secreto versionado**. Verificado antes del commit |
| Producción | **No se reutilizó ninguna credencial de producción** |

## 19. Nota de coste y plan

`supabase projects create` **no solicitó ninguna confirmación económica** y devolvió
`ACTIVE_HEALTHY` de inmediato.

Antes de crear evalué el riesgo: dos de los tres proyectos de la organización estaban
**auto-pausados**, comportamiento propio del plan **gratuito** (los proyectos de pago no se pausan
solos). Con un único proyecto activo, uno más entra dentro del límite habitual de dos activos.

La organización queda ahora con **4 proyectos**: producción (activo), el nuevo staging (activo), y
dos pausados —`trazaloop-staging` y `extrusion-diagnostic-db`—. Conviene revisar si el proyecto
pausado `trazaloop-staging` debe eliminarse para evitar la ambigüedad de nombres (§21).

## 20. Gaps restantes

| # | Gap | Impacto |
|---|---|---|
| **G-1** | **Auth de staging sin configurar**: falta *Site URL*, *Redirect URLs* y **Confirm email = enabled** | Bloquea el uso real con navegador; no bloquea la validación de infraestructura. Requiere la URL de Vercel Preview |
| **G-2** | **Sin proyecto Vercel Preview conectado** a staging | Fuera del alcance de Q0.4 |
| **G-3** | **Sin SMTP** en staging | Registro público y recuperación de contraseña no ejercitables por correo |
| **G-4** | Proyecto pausado `trazaloop-staging` con el nombre casi idéntico | Ambigüedad operativa; ver §21 |
| **G-5** | `test:t9f3-rls` sigue con «limpieza INCOMPLETA» | Preexistente, documentado en Q0.3H |

Ninguno afecta a la corrección del esquema, los privilegios, RLS ni Storage.

## 21. Procedimiento de rollback / decomiso

**Staging es desechable por diseño.** No contiene datos reales.

```bash
# NO EJECUTADO — decomiso, si se decide
supabase projects delete qchzkxbnbqeyuxinipln
```

Alternativa no destructiva: `scripts/release/v1/cleanup-staging.ts`, que vacía datos empresariales
en modo *dry-run* por defecto y falla cerrado.

Para el proyecto pausado `dtrxxqmdweykzncfmahc` (`trazaloop-staging`) hay tres opciones, y es
**decisión humana**: eliminarlo, renombrarlo para deshacer la ambigüedad, o dejarlo pausado. Antes
de eliminar conviene comprobar desde el panel si conserva datos que alguien quiera conservar —está
pausado, no vacío.

**Rollback de la vinculación:** ninguno necesario. El repositorio quedó **desvinculado** (§22).

## 22. Estado de Git y vinculación

**Vinculación final: DESVINCULADO**, conforme a la preferencia expresada.

```text
supabase/.temp/project-ref  → AUSENTE
supabase db push --dry-run  → LegacyProjectNotLinkedError
```

Toda operación remota vuelve a exigir `--project-ref` explícito. Staging fue el **único** destino
remoto durante Q0.4, y cada escritura se precedió de una comprobación que aborta si el destino es
el ref de producción.

## 23. Recomendación para el siguiente paso

**No iniciar Q1 todavía.** Antes conviene cerrar dos cosas pequeñas y una decisión:

1. **Configurar Auth en staging** (G-1) en cuanto exista la URL de Vercel Preview, con
   *Confirm email* habilitado. Es el único gap que impide usar staging con navegador.
2. **Resolver la ambigüedad de nombres** (G-4): decidir qué hacer con el proyecto pausado.
3. **Decidir la promoción de 0111 a producción.** Producción funciona sin ella, pero mientras no
   se aplique, producción no es reproducible desde el repositorio y conserva `TRUNCATE` en roles de
   cliente. Es una migración aditiva de privilegios, sin cambios de esquema ni de datos, ya
   validada en dos entornos. Sujeta a DR-19: aprobación humana explícita.

Después de eso, el primer corte vertical de Quality tiene por fin dónde probarse antes de tocar
producción.
