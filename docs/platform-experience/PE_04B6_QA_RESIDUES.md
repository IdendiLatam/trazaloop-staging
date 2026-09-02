# PE-04B6 · Residuos de QA

Inventariados sobre la base local después de correr toda la regresión. **En
Staging no se han ejecutado suites**: solo se han aplicado migraciones, así que
no hay empresas ni tickets sintéticos allí.

## Lo que dejaban las suites

| Artefacto | Clasificación | Qué se hizo |
|---|---|---|
| **7 empresas sintéticas** (`SEC01…`, `B4…`, `B5…`, `B6…`) | **contaminación tipo cliente** | retiradas · las suites ahora también retiran membresías, y hay un script para el resto |
| 18 cuentas `@test.trazaloop.dev` | **QA segura** | las suites las borran al terminar; las que quedan son de ejecuciones interrumpidas |
| `platform_staff` activos | — | **0** · ninguna suite deja privilegios vivos |
| Libro de créditos, minutos, concesiones, tickets | **temporal retirable** | **0** tras la regresión |
| Revisiones de plan de la prueba de publicación | **historia segura** | ver abajo |

## Por qué las empresas sobrevivían

`organizations` está referenciada por una veintena de tablas con
`on delete restrict`. El `finally` de cada suite borraba lo que ella misma había
creado y después la empresa — y el borrado fallaba **en silencio** por
`memberships`, `organization_modules` y compañía.

Dos correcciones:

1. Las cuatro suites retiran ahora también las membresías y **avisan** si el
   borrado de la empresa falla, en vez de callarlo.
2. `scripts/pe04b6/limpiar-qa.sql` recorre todas las tablas de `public` con
   `organization_id`, las vacía en varias pasadas —unas dependen de otras— y
   retira la empresa. **Solo** actúa sobre nombres con prefijo de QA
   (`B4…`, `SEC01…`, `DBG…`, `QA …`): nunca puede tocar una empresa de cliente.

Local quedó en **0 empresas**.

## La revisión sintética publicada · corregida

La prueba de publicación de PE-04B5 creaba una revisión de Full en borrador, la
publicaba —lo que **retira** la vigente— y la dejaba ahí. Efecto: el catálogo
local pasaba a ofrecer Full a **USD 45**, con una revisión de QA como oferta
vigente. Y una revisión publicada **no se puede borrar**: es historia comercial.

Una segunda ejecución empeoraba lo anterior, porque restituía desde la revisión
ya contaminada.

La corrección usa el camino del propio producto: tras comprobar que publicar
funciona, la prueba **publica una sucesora que restituye los valores
congelados**. El catálogo termina con dos revisiones más —ocurrieron, y eso es
cierto— y con la oferta vigente correcta: **USD 40 / 400**. Verificado tras un
replay limpio y una regresión completa.

Esto es además lo que exige el encargo: *no dejar una revisión sintética
publicada en Staging*. Como las suites no corren contra Staging, allí el catálogo
sigue con las revisiones de 0162/0163 y nada más.

## Lo que NO se borra

- **Revisiones retiradas**: son la verdad comercial pasada. Hubo empresas que
  contrataron bajo ellas.
- **Eventos comerciales y reclasificaciones de soporte**: explican por qué una
  empresa tuvo lo que tuvo y por qué se le contó (o no) un caso.
- **`quality_ai_runs`**: tokens y coste reales. No se reescriben nunca.

## Cuentas privilegiadas

`platform_staff` activo en local: **0**. Ninguna suite de PE-04 deja un
superadministrador vivo — la lección del incidente de PE-03 en Staging, aplicada
desde entonces con `personasCreadas` y su retirada en el `finally`.

`qa-a@trazaloop-staging.local` sigue **activo a propósito** en Staging y se
retira en el corte de producción, no antes.
