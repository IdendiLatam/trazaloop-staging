# Q0_3H_PLATFORM_REPRODUCIBILITY_HARDENING

**Sprint:** Q0.3H — Platform Reproducibility Hardening
**Fecha:** 2026-08-19
**Rama:** `chore/quality-q0-platform-hardening`
**Veredicto:** **PLATFORM BASELINE READY FOR STAGING**

**Decisiones aplicadas:** DR-21 (versionar `supabase/config.toml`) · DR-22 (migración de privilegios
reproducible) · DR-23 (sincronizar `test:rls`) · DR-24 (compliance) · DR-25 (ignores).

---

## 1. Qué resuelve este sprint

Q0.3 descubrió que **las 102 migraciones no eran suficientes para levantar un proyecto
funcional**. El esquema salía perfecto —87 tablas, 33 vistas, RLS al 100 %— pero la aplicación
respondía `42501 permission denied` en casi cada consulta: los privilegios de tabla de
`anon` / `authenticated` / `service_role` nunca los concedió ninguna migración. En producción
existen porque el *bootstrap* de Supabase, permisivo cuando se creó ese proyecto, los otorgó fuera
del repositorio: **119 sentencias `GRANT` verificadas en el esquema desplegado, ninguna
proveniente de una migración**.

Prueba de que las migraciones **asumían** esos privilegios: la 0028 ejecuta
`revoke insert, update, delete ... from anon, authenticated`. Un `revoke` solo tiene sentido si el
privilegio existía.

Consecuencia directa para DR-14: **un proyecto de Staging creado hoy habría nacido roto.**

Ahora se cumple, sin ningún paso manual:

```text
PROYECTO NUEVO + MIGRACIONES DESDE CERO = PRIVILEGIOS CORRECTOS
```

---

## 2. Rama

`chore/quality-q0-platform-hardening`, creada desde `0289a8d`
(`hotfix/auth-01-password-recovery`), que es el estado funcional más reciente y correcto: contiene
todo lo de `main` (`4cd7b69`, idéntico a `origin/main`) más la corrección completa de recuperación
de contraseña con su propia prueba. Las 102 migraciones son idénticas en `main`, `origin/main`,
el hotfix y `origin/production/baseline-0110`.

El trabajo de Q0.3H **no se mezcló** con la rama del hotfix. Todos los entregables de Q0 y los
documentos de arquitectura se conservaron intactos al cambiar de rama (eran archivos sin
registrar y ninguna rama los tiene en su árbol).

---

## 3. La migración nueva: `0111_platform_role_privileges.sql`

464 líneas, aditiva, sin tocar ninguna migración histórica.

### Criterios de diseño (DR-22) y cómo se cumplen

| Criterio | Cómo se cumple |
|---|---|
| Privilegios explícitos | Solo `SELECT, INSERT, UPDATE, DELETE`. **Cero usos ejecutables de `GRANT ALL`** |
| Sin `GRANT ALL` indiscriminado | Los 120 objetos se enumeran **uno a uno**; no se usa `ON ALL TABLES IN SCHEMA` en ninguna sentencia ejecutable |
| Sin `ALTER DEFAULT PRIVILEGES` permisivo | **Ninguno.** Deliberado: toda tabla futura de Quality deberá declarar sus `GRANT` en su propia migración. Nada queda accesible por omisión |
| Preservar los `REVOKE` existentes | Las dos tablas endurecidas por 0028 se vuelven a cerrar al final (esta migración corre después y las habría reabierto) |
| Tablas server-only | `storage_upload_intents` y `storage_orphan_candidates` quedan **fuera de todo grant** a `anon`/`authenticated` |

### Endurecimiento añadido sobre el estado heredado

`TRUNCATE`, `REFERENCES` y `TRIGGER` **no** los concede esta migración: los concedía el entorno.
Los privilegios por defecto del rol `postgres` otorgan `Dxtm` a `anon` y `authenticated` en cada
tabla creada; en producción llegaron por la vía distinta del `GRANT ALL` del bootstrap. El
resultado medido antes de corregirlo: **108 objetos con `TRUNCATE` para `anon`**.

`TRUNCATE` **bypasea RLS por completo** — ninguna política de fila lo detiene. La superficie de
explotación es hoy baja (PostgREST no lo expone y un cliente no abre conexiones Postgres
directas), pero es un privilegio que un rol de cliente no tiene ninguna razón para poseer.
`REFERENCES` y `TRIGGER` son de DDL y la aplicación nunca los ejerce.

Se retiran con un `revoke ... on all tables in schema public`. La asimetría con los `grant`
enumerados es intencionada y está documentada en la migración: **conceder en bloque es peligroso
porque abre lo que no se ha revisado; revocar en bloque es seguro porque solo cierra.** Así el
estado final deja de depender de los privilegios por defecto del entorno.

`service_role` los conserva: es server-only y las herramientas administrativas pueden
necesitarlos.

---

## 4. Privilegios: antes y después

Medido sobre una base local reconstruida desde cero, **sin ninguna intervención manual**.

| Rol | Antes de 0111 (proyecto nuevo) | Después de 0111 | Producción (Q0.1) |
|---|---|---|---|
| `anon` — objetos con SELECT | **0** | **108** | 108 |
| `authenticated` — objetos con SELECT | **10** (solo vistas con `grant` explícito en migraciones) | **118** | 118 |
| `service_role` — objetos con SELECT | **0** | **120** | 120 |
| `TRUNCATE` para roles de cliente | 226 (por defecto del entorno) | **0** | 108 (heredado) |
| Tablas server-only accesibles por cliente | 0 | **0** | 0 |
| `calculation_methodologies` para `authenticated` | — | **solo SELECT** | solo SELECT |
| `recycled_content_calculations` para `authenticated` | — | **solo SELECT** | solo SELECT |

**Paridad exacta con producción en los tres roles**, y estrictamente más restrictivo en
`TRUNCATE`.

---

## 5. Validación completa desde cero

`supabase db reset` limpio, seguido de la cadena entera. **En ningún momento se aplicó el
workaround manual de Q0.3.**

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Supabase local sano | 12 contenedores · PostgreSQL 17.6 |
| 2 | `db reset` desde cero | `{"target":"local"}` |
| 3 | Migraciones aplicadas | **103** (102 históricas + 0111) |
| 4 | Esquema | 87 tablas · 33 vistas · **0 sin RLS** |
| 5 | Privilegios sin workaround | 108 / 118 / 120 · `TRUNCATE` cliente = 0 |
| 6 | Storage | 3 buckets **privados** · 9 políticas en `storage.objects` |
| 7 | Auth | signup → trigger `handle_new_user` → perfil creado |
| 8 | Organización | `create_organization` + membresía `admin` + 3 módulos (core `full`, PCR y Textiles en Demo 48 h) |
| 9 | Superadministrador | creado por SQL local (única vía, por diseño de 0040) |
| 10 | `seed-demo.ts` | cadena completa → **cálculo 70,00 % · defensible** |
| 11 | Next.js | `/login` `/register` `/terms` `/privacy` → **HTTP 200**, 0 errores en log |
| 12 | `smoke-staging.ts` | **8 / 8 en verde** |
| 13 | Aislamiento multiempresa | usuario sin privilegios de plataforma: **0 filas** en 7 tablas de otra empresa |
| 14 | Tablas server-only | acceso de cliente → **42501** |

---

## 6. Pruebas

| Suite | Antes de Q0.3H | Después |
|---|---|---|
| `tsc --noEmit` | ✅ | ✅ |
| **`test:rls`** (aislamiento) | 89 verde / 21 rojo | **110 verde / 0 rojo** |
| Batería completa (92 suites) | — | **91 verde / 1 rojo** |
| `test:compliance` | 2 fallos | ✅ 629 archivos, limpio |
| `eslint` | 187 problemas | **1 warning** (deuda ajena al sprint) |
| `test:t9f5-adversarial` | «fallo» | **19 / 19 PASS** — solo exigía el gate `T9F5_QA_CONFIRM=yes` |

### 6.1 `test:rls` — qué se corrigió y por qué (DR-23)

Ninguna corrección relajó una expectativa de seguridad. Las cuatro causas:

**a) Expectativa de módulos obsoleta.** La prueba 9 exigía `["core","docs","traceability_6632"]`.
La **0042** retiró `docs` de los módulos que se activan al crear una empresa y la **0100** lo
sustituyó por `provision_new_organization_modules`, que asigna `core` más todos los `is_functional`
—hoy `traceability_6632` y `textiles`—. Actualizada al comportamiento real.

**b) `produced_quantity_kg` obligatoria desde 0105.** Ocho inserciones en `output_batches` no la
enviaban. Se añadió, y en el helper `makeChain` con el valor **semánticamente correcto**: la masa
consumida, no una constante. La 0104 marca `mass_balance_warning` si producido y composición
difieren más de un 5 %, y esa advertencia degrada el cálculo de `defensible` a `with_warnings`;
un valor arbitrario habría hecho pasar la prueba describiendo mal el sistema.

**c) Fixture de aislamiento invalidado por el propio suite.** La prueba **22** añade
deliberadamente a `userC` en la empresa B para validar `prevent_organization_id_change`. Desde ese
punto C es un **consultor multiempresa legítimo** y ver los datos de B es correcto. Cinco pruebas
posteriores seguían usándolo como «miembro de A que no debe ver B» y reportaban como fuga el
comportamiento correcto. Se creó `userD`, miembro solo de la empresa A, para esas aserciones. En
la prueba 83 el forastero correcto es `userB`, porque el documento pertenece a la empresa A.

**Un control independiente, fuera del suite, confirmó que el aislamiento nunca estuvo roto.**

**d) Dos pruebas que pasaban por el motivo equivocado.** Son las más relevantes:

- **Prueba 100** afirmaba que un `UPDATE` sobre `legal_documents` debía **devolver error**. Eso
  solo ocurría porque `authenticated` carecía del privilegio de tabla y PostgREST respondía
  `42501`. RLS no lanza error en un `UPDATE`: el `USING` filtra las filas y la sentencia no afecta
  a ninguna. **Contra producción, que sí tiene el privilegio, esta prueba habría fallado.** Ahora
  comprueba la propiedad real: que el documento **no cambie**.
- **Prueba 80** esperaba que bajar `organization_subscriptions.plan_code` bloqueara aceptar una
  invitación. Dejó de ser cierto con la **0103** (PCR-01), que trasladó la autoridad comercial a
  `organization_modules.access_mode`; `accept_team_invitation` resuelve el plan con
  `organization_effective_plan_code()`. Como el fixture eleva los módulos a `extra`, el plan
  efectivo seguía siendo extra. Ahora la prueba baja **los módulos**, que es la autoridad vigente.

### 6.2 Guardas de rango de migraciones

Trece suites mantenían candados de alcance por sprint del tipo *«0110 es la última migración»* o
*«no existe 0111 ni posterior»*. Su intención —que ese sprint no añadió migraciones— es legítima,
pero estaban escritas como afirmaciones absolutas sobre el repositorio, de modo que **cualquier
migración futura las rompía**.

Se conservó la intención con el patrón que el propio repositorio ya usaba: una **lista blanca
explícita** de posteriores autorizadas, y donde la aserción era un conteo o un «último», se acotó
al **rango del sprint** (`<= 110`). Ningún sprint futuro volverá a romperlas por el solo hecho de
existir.

### 6.3 `test:compliance` (DR-24)

Dos correcciones, ambas conservando la protección del contenido público:

- **Exclusión de `docs/architecture/**`.** Son los documentos rectores incorporados en Q0, no
  contenido de producto. Reescribir su redacción para satisfacer al escáner falsearía un documento
  aprobado. El resto de `docs/` —incluidas las guías que sí ve un cliente— se sigue escaneando.
- **Regex del certificador alemán, con límites correctos.** El patrón era `/t[üu]v/i`, **sin límites de palabra**, a
  diferencia de todos sus hermanos (`\bicontec\b`, `\baenor\b`, `\bsgs\b`). Cualquier texto en
  español con *tuvo, estuvo, obtuvo, obtuvieron, mantuvo, sostuvo* lo disparaba como si fuera el
  nombre de una certificadora. Estaba latente porque las rutas escaneadas no contenían esas
  palabras.

  **No se usó `\b`**: es ASCII y la diéresis del nombre no es carácter de palabra, así que
  añadir `\b` a ambos lados habría dejado de reconocer el nombre real que se quiere prohibir. Se usan *lookarounds* Unicode
  —`(?<!\p{L})t[üu]v(?!\p{L})`— que exigen que no haya una letra pegada a ninguno de los dos
  lados: el nombre real, con diéresis o sin ella, sigue detectándose; «obtuvieron» no.

También se reescribió el texto de `Q0_3_LOCAL_ENVIRONMENT_IMPLEMENTATION.md` donde yo mismo citaba
los términos al documentar el hallazgo, en lugar de ampliar las exclusiones.

### 6.4 ESLint (DR-25)

`supabase/.temp/**` y `supabase/.branches/**` ignorados: son artefactos que **genera** el stack
local (`supabase start` / `db reset`), no código del proyecto. Producían 186 de los 187 problemas
y ocultaban el único hallazgo real. **No se ignoran** `supabase/migrations/**` ni
`supabase/config.toml`. `supabase/.branches/` añadido a `.gitignore`.

---

## 7. Deuda real restante

| # | Asunto | Naturaleza | Estado |
|---|---|---|---|
| D-1 | `test:t9f3-rls` termina con «limpieza INCOMPLETA: 2 residuos» | **PREEXISTING**, ajena al sprint | No corregida |
| D-2 | `eslint`: variable sin usar en `tests/evidences/textiles-evidences-hardening.test.ts:40` | **PREEXISTING** | No corregida |

**D-1 en detalle.** El suite retiene deliberadamente una organización QA («conservada por intent
consumed inmutable») y después intenta borrar al usuario que la creó. No puede: todas las claves
foráneas `created_by` hacia `profiles` son `NO ACTION`, de modo que una fila retenida impide
borrar el perfil, y el borrado del usuario de Auth cascada al perfil. Es una limitación del arnés
de limpieza, no del producto: las 25 áreas funcionales del suite pasan y solo falla la
verificación final de residuo cero. Es determinista y no depende de 0111 (`service_role` conserva
todos sus privilegios). Se documenta sin convertirla en bloqueo artificial, conforme al encargo.

---

## 8. Archivos

**Creados**

| Archivo | Qué es |
|---|---|
| `supabase/migrations/0111_platform_role_privileges.sql` | La migración de privilegios |
| `supabase/config.toml` | Configuración del stack local, versionada (DR-21) |
| `docs/quality/q0/Q0_3H_PLATFORM_REPRODUCIBILITY_HARDENING.md` | Este documento |

**Modificados (20 archivos versionados, +245 / −43)**

| Archivo | Cambio |
|---|---|
| `.gitignore` | `supabase/.branches/` |
| `eslint.config.mjs` | Ignora artefactos generados por el stack local |
| `tests/compliance/no-certifier-names.test.ts` | Exclusión de `docs/architecture/**` + límites de palabra en el patrón del certificador alemán |
| `tests/rls/isolation.test.ts` | `userD`, `produced_quantity_kg`, módulos, pruebas 80 y 100 |
| 16 suites con candados de rango | Lista blanca de 0111 o acotación al rango del sprint |
| `docs/quality/q0/Q0_3_LOCAL_ENVIRONMENT_IMPLEMENTATION.md` | Addendum + reescritura de dos frases |

---

## 9. Restricciones respetadas

- **Cero** vínculos a Production; `supabase db push` sigue devolviendo `LegacyProjectNotLinkedError`.
- **Cero** `db push` remoto, `migration repair` remoto, SQL remoto, deploy, cambios en Vercel.
- **Cero** Staging creado.
- **Cero** implementación de Quality: siguen existiendo **0 tablas `quality_*`** y el módulo
  permanece `is_available=false`, `is_functional=false`.
- **Cero** migraciones históricas 0001–0110 modificadas.
- **Cero** commits, **cero** push.
- Todo el SQL se ejecutó **exclusivamente** contra `127.0.0.1:54322`.
- **Ninguna** expectativa de seguridad se relajó para hacer pasar una prueba.

---

## 10. Veredicto

### **PLATFORM BASELINE READY FOR STAGING**

Un proyecto Supabase nuevo, aplicando las 103 migraciones desde cero, obtiene esquema,
privilegios, RLS, Storage y semillas correctos **sin intervención manual**. Es exactamente la
precondición que faltaba para DR-14.

Con una salvedad honesta: esto está demostrado **en local**. La diferencia de propiedad del esquema
`storage` entre local y gestionado —documentada desde Q0.2 §4.5— sigue sin ejercerse en un
proyecto gestionado real. La primera creación de Staging continúa siendo el momento de la verdad,
y ahora parte de una base reproducible en lugar de una rota.
