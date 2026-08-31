# PE-02B1 · Matriz de pruebas

**Cuatro suites, 81 comprobaciones, 0 en rojo.**

| Suite | Naturaleza | Comprobaciones | Comando |
|---|---|---:|---|
| `tests/unit/pe02b1-faq.test.ts` | estática | **35** | `npm run test:pe02b1-faq` |
| `tests/rls/pe02b1-faq-rls.test.ts` | **base real** | **17** | `npm run test:pe02b1-faq-rls` |
| `tests/rls/pe02b1-faq-history.test.ts` | **base real** | **13** | `npm run test:pe02b1-faq-history` |
| `tests/rls/pe02b1-security-claims.test.ts` | **base real** | **16** | `npm run test:pe02b1-security-claims` |

La estática entra en `test:all`. Las tres contra base se corren aparte, como el
resto del repositorio.

---

## 1 · La matriz A–O del encargo

| | Escenario | Dónde | Qué se afirma |
|---|---|---|---|
| **A** | El anónimo lee lo público, publicado y vigente | rls · A | llega **la vigente**, con su categoría |
| **B** | El anónimo no lee lo que exige sesión | rls · B | ni por la vista pública ni por la de sesión |
| **C** | El anónimo no lee un borrador | rls · C | por `slug`, **buscando su texto**, y pidiendo la tabla |
| **D** | El anónimo no lee lo retirado | rls · D | |
| **E** | El anónimo no lee la historia | rls · E | ni revisiones, ni tablas; la vista devuelve **una** versión |
| **F** | Con sesión se lee lo público | rls · F | |
| **G** | Con sesión se lee lo autenticado | rls · G, G2 | y **no** la historia ni los borradores |
| **H** | Un administrador de **empresa** no toca la FAQ global | rls · H | crear, modificar, publicar y crear categoría: los cuatro rechazados |
| **I** | El superadministrador administra | rls · I | lee, destaca, ve las diez categorías |
| **J** | `support` ve y no escribe | rls · J | ve borradores y las dos revisiones; no modifica ni publica |
| **K** | Publicar cierra la anterior | history · K1–K6 | numeración, enlace, sin huecos de vigencia, retirar y republicar |
| **L** | Una revisión publicada es inmutable | history · L1–L4 | **incluida la clave de servicio** |
| **M** | Restaurar crea revisión nueva | history · M1–M3 | y no toca la historia |
| **N** | Aplicabilidad ≠ derecho de acceso | rls · N, N2 | una empresa sin Textiles lee sobre Textiles |
| **O** | La procedencia interna no se filtra | rls · O | comprobado con `select *` desde las dos puertas |

---

## 2 · La barrera de publicación · §9, §11

| | Qué se intenta | Resultado |
|---|---|---|
| P1 | Publicar `external_policy_verification_required` | **rechazado**, y la entrada sigue en `draft` |
| P2 | Publicar `not_verified` | rechazado |
| P3 | Publicar `must_not_claim` | rechazado |
| P4 | Publicar `verified` | **publicado**, con base, fecha, autor y nota |
| P5 | Publicar «con salvedad» sin escribir la salvedad | rechazado; con la salvedad, publicado |
| P6 | Publicar una fuente externa sin fecha | rechazado; con fecha, publicado y la fecha viaja a la revisión |
| **P7** | **Escribir una revisión a mano, saltándose la publicación** | **rechazado** — no hay permiso de escritura |

**P7 es la que sostiene a las demás.** Sin ella, las seis anteriores solo
demostrarían que la puerta principal está cerrada.

---

## 3 · Las invariantes de aislamiento · §24

Comprobadas como invariantes, no como fotografías: si mañana nacen quince tablas
nuevas, estas pruebas siguen valiendo.

| | Invariante |
|---|---|
| R1 | Ninguna tabla con `organization_id` sin control de acceso por fila |
| R2 | Ninguna política de lectura `true` sobre datos de empresa |
| R3 | Toda clave compuesta con empresa la lleva en los dos lados |
| R4 | El rol anónimo solo alcanza `legal_documents` por política |
| S1 | La FAQ **no** tiene `organization_id`, y sus cuatro tablas llevan RLS |
| S2 | El anónimo no tiene permiso sobre ninguna tabla de FAQ; sobre las vistas, solo `SELECT` |
| S3 | Las cuatro funciones: `security definer`, `search_path` fijo, retorno estrecho, sin ejecución para el anónimo |
| S4 | Ninguna vista proyecta procedencia interna |
| S5 | La aplicabilidad usa el catálogo canónico y **solo** ese vocabulario |

---

## 4 · Lo que la suite estática protege

35 comprobaciones en ocho grupos:

| Grupo | Qué |
|---|---|
| A | PE-02B1 aportó **una** migración y es la 0155, no creó la de ayuda contextual, no toca migraciones históricas, y está autorizada en las listas blancas |
| B | La forma de PEH-02: cuatro tablas, la identidad sin texto, vigencia y huella en la revisión, el idioma fuera de la identidad, el borrador aparte, inmutabilidad por disparador |
| C | Los tres estados; publicar exige superadministrador; se cierra antes de abrir; retirar no borra; restaurar escribe en el borrador |
| D | Los cinco estados de verificación; el rechazo es una excepción; la política externa se fecha y **no** está escrita en el código; la clasificación normativa es la de 0136 |
| E | Un solo vocabulario de módulos; sin el de tickets ni el de estructuras; alcance sin ambigüedad |
| F | Tres vistas con el filtro dentro, sin `security_invoker`, sin procedencia, sin permiso para el anónimo; revisiones sin escritura |
| G | **Lo que no se hizo**: sin capa de datos, sin pantallas, sin tabla de vídeos, sin precios, sin preguntas sembradas, sin tocar `legal_documents` |

---

## 5 · Dos pruebas ajenas que había que corregir

Las dos afirmaban **una fotografía** donde querían afirmar **una promesa**, y
las dos se rompieron al llegar 0155 sin que su tramo hubiera cambiado en nada.

| Suite | Decía | Dice ahora |
|---|---|---|
| `quality-13b5-intelligence` H1 | «la cabecera del repositorio es 154» | «B5 añadió una migración y es una siembra de catálogo» |
| `pe01-modules` H4 | «la cabecera sigue en 0154» | «PE-01B no añadió ninguna migración» |

Es el mismo aviso que §24 da para las pruebas nuevas, aplicado a dos viejas. Se
corrigieron dejando escrito **por qué**, no en silencio.

---

## 6 · Regresión completa

| | Resultado |
|---|---|
| Replay `0001 → 0155` | **0 FAIL** · 51 migraciones aplicadas en el segundo paso |
| `npm run test:all` | **EXIT=0** |
| `npm run typecheck` | **EXIT=0** |
| `npm run lint` | 0 errores · 66 avisos (línea base) |
| `npm run build` | **EXIT=0** |
| `isolation` | 110 en verde |
| `deploy-safety`, `platform`, `launch`, `t9f-module-access`, `module-access-isolation` | EXIT=0 |

---

## 7 · Lo que estas pruebas NO hacen

- **No** escriben en Staging ni en Producción: todo contra el stack local.
- **No** llaman a ningún proveedor de IA.
- **No** dejan fixtures permanentes: cada suite crea su material con prefijo
  `qa_…` y sello de tiempo.
- **No** comprueban redacción. La única excepción es la **existencia** de la
  salvedad en «verificada con salvedad», que es una regla, no un texto.
