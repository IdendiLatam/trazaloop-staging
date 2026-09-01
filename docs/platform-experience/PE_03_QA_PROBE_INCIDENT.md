# PE-03 · El incidente de la sonda de QA

Una sonda de PE-03B1 se ejecutó contra Staging y dejó tres residuos. Dos se han
corregido; el tercero se documenta aquí y **no se toca**, porque tocarlo sería
falsificar historia para dejar la base bonita.

*31 de agosto de 2026 · solo Staging · Producción intacta en 0111.*

---

## 1 · Qué pasó

`scripts/pe03a-spike/staging-probe.ts` reservaba, subía, verificaba y publicaba
una versión de tutorial, y en su `finally` hacía:

```ts
await admin.from("platform_tutorials").update({ status: "retired" }).eq("id", tutorialId);
if (ruta) await admin.storage.from(BUCKET).remove([ruta]);
```

Dos errores en tres líneas.

**El primero:** `remove` no preguntaba nada. Para cuando se ejecutaba, la sonda
ya había publicado esa versión, y borró sus bytes.

**El segundo:** poner `status = 'retired'` a mano **no cierra el periodo de la
versión vigente**. La primitiva canónica `tutorial_unpublish` sí lo hace, y no se
usó.

Y había un tercero, de otra naturaleza: la sonda creaba dos cuentas QA con una
contraseña estática escrita en el repositorio, y no las borraba. Una de ellas
tenía rol de superadministrador.

---

## 2 · Lo que quedó, y su clasificación

### Cuenta con privilegio · **corregido**

`pe03b1-probe-1788215818207@test.trazaloop.dev` quedó como
`platform_staff = superadmin / active`. Durante nueve días Staging tuvo **dos**
superadministradores, y el segundo no debía existir.

Ahora: rol `revoked`, cuenta `banned_until = infinity`, sesión cerrada y testigo
de refresco revocado.

**No se puede borrar**, y eso es correcto: `platform_tutorial_versions` la
referencia dos veces —`uploaded_by` y `published_by`— con `ON DELETE NO ACTION`.
Su identidad es el ancla de una atribución real. Se conserva deshabilitada.

### Cuenta hermana · **eliminada**

`pe03b1-probe-lector-1788215818207@test.trazaloop.dev` tenía tres referencias,
las tres de infraestructura y las tres `CASCADE`: identidad de Auth, sesión y
perfil. **Cero** referencias de negocio. Se eliminó por la cascada declarada, sin
tocar `profiles`, `identities` ni `sessions` por separado.

### Versión publicada sin archivo · **PROBE-CREATED INCONSISTENCY**

Es lo que se documenta y no se toca.

| | |
|---|---|
| Tutorial | `PE03 QA sonda 1788215818207` · `d835db37-…` |
| Clave de pantalla | `quality.qa_pe03b1_probe_1788215818207` — **no está en el registro del código** |
| `status` | `retired` |
| Versión | 1 · `file_state = verified` |
| `effective_from` | 2026-08-31 22:37:05 |
| `effective_to` | **abierto** |
| `content_hash` | `c2a92630d963ad7c…` |
| `real_size_bytes` | 262 144 |
| Objeto en el cubo | **no existe** |
| `v_tutorial_current` lo devuelve | **no** |

---

## 3 · Qué es exactamente una inconsistencia aquí, y qué no

Conviene separar dos cosas que a primera vista parecen el mismo problema.

### `status = 'retired'` con el periodo abierto · **EXPECTED MODEL**

No viola ningún invariante. El índice único de versión vigente se cumple, y
`v_tutorial_current` no la devuelve porque exige `t.status = 'active'`.

Y en el modelo canónico son **dos cosas distintas**: `tutorial_unpublish` cierra
el periodo y no toca el estado; `status` dice si la identidad está en servicio.
Un tutorial retirado que conserva su versión abierta es un estado defendible —
volver a activarlo restituiría el vídeo de inmediato.

Lo que la sonda hizo mal no fue producir ese estado, sino **saltarse la
primitiva** que habría cerrado el periodo. Corregido en el guion.

### El objeto ausente · **PROBE-CREATED INCONSISTENCY**

Esto sí lo es. Una versión declara estar publicada, con su resumen y su tamaño, y
sus bytes no existen. Ninguna primitiva del producto puede producir ese estado:
lo produjo un `remove` de QA.

**Riesgo real: ninguno.** Su clave de pantalla —`quality.qa_pe03b1_probe_…`— no
está en `lib/modules/page-keys.ts`, así que ninguna pantalla del producto la
resuelve. Aunque alguien reactivara el tutorial, no habría por dónde llegar.

---

## 4 · Por qué no se corrige el dato

Se consideraron tres formas de «arreglarlo». Las tres se descartan:

| | Por qué no |
|---|---|
| Borrar la versión | Es historia. Y el disparador de 0159 lo impide, que es la promesa del tramo funcionando |
| Vaciar `uploaded_by` / `published_by` | Sería desatribuir para poder limpiar. La atribución es cierta |
| Recrear los bytes | Serían bytes inventados con un resumen que dice ser otra cosa. Peor que la ausencia |

Queda una cuarta, **canónica y no destructiva**: cerrar el periodo con
`tutorial_unpublish`. No reescribe nada — registra que dejó de ser la vigente
ahora, que es verdad. La dejo **propuesta y sin ejecutar**, porque este encargo
prefiere documentar y no tocar la fila, y porque el riesgo que evitaría es nulo.

**No se creó esquema nuevo.** Un campo de «archivo ausente» sería una columna que
en producción no usaría nadie, para registrar un accidente de QA.

---

## 5 · Lo que se corrigió en el código

### La contraseña ya no está en el repositorio

`lib/qa/probe-safety.ts` genera una **efímera** de 32 bytes aleatorios en cada
ejecución. Vive en memoria, no se imprime, no se guarda y no se documenta.

Las suites siguen usando `Trazaloop-Test-1234` y está bien: corren contra la base
local, que se replaya entera. Contra un entorno compartido no lo está.

### La limpieza le pregunta a la base

```
objeto → ¿alguna versión que lo referencia llegó a publicarse?
           sí            → SE CONSERVA
           no se sabe    → SE CONSERVA
           no, y solo la referencia una → se retira
```

La regla vive en `decideObjectCleanup`, y `unknown_state` **no borra**. Ante la
duda, un objeto de más ocupa unos megas; uno de menos rompe una versión
publicada.

El fallo original no fue olvidar una comprobación: fue **confiar en el flujo
local en vez de en la base**. La sonda «sabía» que no había publicado porque su
variable era de antes de publicar.

### El contenido se retira por la primitiva canónica

`tutorial_unpublish`, con la sesión del superadministrador, antes de revocar las
cuentas. No un `update` de estado a mano.

### Y al terminar se comprueba que no queda un privilegio suelto

`checkPlatformResidue` compara **identidades contra una lista**, no cuenta.
Contar deja pasar el caso en que el superadministrador que hay es el equivocado
—que es exactamente lo que ocurrió— y también el caso de quedarse sin ninguno.

---

## 6 · La prueba que lo demuestra

`tests/rls/pe03-probe-cleanup.test.ts`, 11 comprobaciones.

**Reproduce el fallo real** y comprueba el **objeto y su SHA-256 en Storage**, no
que exista una fila. Se verificó que detecta la implementación antigua: con ella
falla en cuatro comprobaciones, incluida la de bytes.

Cubre los dos lados de la regla: lo publicado sobrevive, lo que nunca se publicó
se puede retirar sin dejar huérfanos. Y el caso que solo aparece con reposición:
un objeto compartido por dos versiones no se toca.

---

## 7 · Estado final de Staging

| | |
|---|---|
| Superadministradores activos | **1** · `qa-a@trazaloop-staging.local` |
| Cuenta con atribución | conservada, revocada y deshabilitada |
| Cuenta hermana | eliminada |
| Contraseña de `qa-a@` | **sin tocar** |
| Migración | 0159 |
| Producción | 0111, sin tocar |
