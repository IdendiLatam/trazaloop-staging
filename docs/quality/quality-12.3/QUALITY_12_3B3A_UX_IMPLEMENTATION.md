# QUALITY-12.3B3A · Partes interesadas · EXPERIENCIA

**Sobre:** B1 (`0149`) y B2 (`0150`), sin reabrir arquitectura.
**Migraciones nuevas:** ninguna. **Local** 0150 · **Staging** 0150 · **Production** 0111, sin tocar.

Menú **Quality → Contexto → Partes interesadas**.

---

## 1 · Lo que se construyó

| Ruta | Qué es |
|---|---|
| `/quality/context/interested-parties` | resumen, listado, búsqueda, filtros y alta |
| `/quality/context/interested-parties/[assessmentId]` | la ficha completa, con modo histórico |
| `/quality/context/interested-parties/categories` | administración de categorías |

Nueve componentes en `components/domain/quality/interested-parties/`, una acción de
servidor nueva (`createExternalPartyAction`) y tres lecturas acotadas más en
`lib/db` para los selectores. **Ninguna migración.**

---

## 2 · La regla que gobierna todo el sprint

> La interfaz es **consumidora** del dominio. No decide nada.

Temporalidad, `as_of`, estado de revisión, priorización, validaciones, aislamiento por
empresa e inmutabilidad viven en `lib/domain` y `lib/db` desde B2. La pantalla llama
y pinta. Hay tres pruebas que lo comprueban leyendo el código: ningún componente crea
un cliente de base de datos, ninguno importa funciones de `lib/db` (solo tipos), y
ninguno hace aritmética de fechas.

Cuando la pantalla necesitó vocabulario —«Entidad externa», «Atiende varios
requisitos», «Al día»— ese vocabulario se añadió **al dominio**, no a los componentes.
Si cada pantalla escribe sus propias etiquetas, dentro de tres sprints la misma cosa se
llama de dos maneras según por dónde se entre.

---

## 3 · Decisiones de producto que se ven en pantalla

**Una sola lista, no dos pestañas.** Entidades externas y colectivos conviven con una
insignia que los distingue. La pregunta de la 4.2 es «quién importa», no «quién importa
de los que facturan».

**La identidad se elige; no se recrea.** El selector muestra las entidades que ya
existen y avisa de cuáles son ya proveedor o cliente —y de cuáles ya tienen análisis
vigente, que el índice único rechazaría—. Registrar una entidad nueva es posible y sale
con una advertencia: si es cliente o proveedor, se da de alta en su módulo para que
nazca con su ficha.

**No hay botón de editar el análisis.** Solo sustituir, con confirmación que dice
exactamente qué va a pasar. Un histórico que se puede corregir deja de responder «qué
decíais entonces».

**Los tres tipos de entrada se llaman por su nombre.** Necesidad, expectativa y
requisito, con su explicación al lado. Solo el requisito pide subtipo, y convertir exige
motivo y confirma que la entrada de origen se conserva.

**El alcance de una estrategia se cuenta, no se declara.** Cero vínculos es general, uno
específica, varios multi-requisito. No hay un campo «tipo de estrategia» que pueda
contradecir a los vínculos reales.

**El responsable es un cargo.** No una persona, no texto libre.

**«Revisado, sin cambios» es una opción de primera clase**, y no fabrica un análisis
nuevo. Sin ella, un análisis desatendido y uno comprobado el mes pasado se ven iguales.

**El modo histórico apaga la escritura entera.** Una sola regla del dominio
—`canMutate({ canManage, asOf })`— gobierna las seis secciones a la vez, para que no
haya una que respete el pasado y otra que se despiste.

---

## 4 · Lo que la interfaz NO ofrece, a propósito

- **Requisito→proceso y estrategia→requisito no aparecen en «Relacionar».** Son las dos
  relaciones centrales: tienen tabla propia porque tienen vigencia, y se registran en su
  sección. La base también las rechaza desde 0150, pero una interfaz que ofrece algo que
  la base va a rechazar es una interfaz que miente.
- **Unidades organizativas como parte interesada.** Un área interna no lo es; las
  personas que trabajan en ella sí, y para eso está el colectivo.
- **Borrar.** Categorías, requisitos, vínculos y estrategias se desactivan o se cierran.
- **Afirmaciones de conformidad.** Ni «cumplimiento garantizado», ni «certificado», ni
  «conforme a ISO». Lo que se registra es lo que la empresa decidió y por qué.

---

## 5 · Resumen, búsqueda y filtros

Las seis cifras del resumen las cuenta la base (`getSummary`), incluidas dos nuevas:
**en evaluación** y **pertinentes sin estrategia**. Ninguna sale de las filas cargadas;
con una segunda página esa cuenta sería falsa. Las tarjetas son enlaces que aplican el
filtro correspondiente.

`relevantWithoutStrategy` es una diferencia de conjuntos entre dos tablas y PostgREST no
sabe hacer `not exists`: se resuelve leyendo **solo identificadores** con
`readAllStrict` y restando. La alternativa era una vista, y una vista es una migración;
añadir esquema para una tarjeta habría sido mover la base por comodidad de una pantalla.

El **filtro por estado de revisión** también se resuelve antes de pedir la página: el
estado de una parte es el peor de sus estrategias vigentes, calculado con la misma
función del dominio que pinta la insignia. Filtrar la página ya cargada daría resultados
distintos según en cuál estuvieras.

---

## 6 · Accesibilidad y móvil

Etiquetas reales en todos los campos —el `placeholder` nunca hace de etiqueta—, tabla
con `<caption>` y `scope="col"`, diálogos con `role="dialog"`, foco inicial y cierre con
Escape (componente compartido), aviso del modo histórico con `role="status"`, y ninguna
insignia que comunique solo con color.

En móvil la lista se convierte en tarjetas (`md:hidden`) y la tabla desaparece; la
navegación de secciones de la ficha usa `flex-wrap`. Las secciones van apiladas con un
índice que salta a cada una: seis pestañas no caben en un teléfono, y además así el
navegador puede buscar dentro con Ctrl+F.

---

## 7 · Independencia de módulo

La pantalla no importa nada de PCR ni de Textiles y no tiene ningún camino que pase por
ellos. Una empresa con Quality y sin PCR la abre igual. Hay una prueba que lo verifica
por texto.

---

## 8 · Ayuda contextual

Se reutiliza el botón «i» compartido (`SectionHint`) con cuatro textos de producto que
viven en el dominio. **No** se conectó a la infraestructura de guías administradas de
TrazaDocs: aquel contenido lo escribe la plataforma, se guarda en la base y está sujeto
a la regla comercial de Demo; explicar qué es una expectativa no es parte de lo que se
paga.

El endurecimiento global de la ayuda —ejemplos, respaldo normativo, tutoriales— es un
sprint transversal posterior y queda fuera de B3A.

---

## 9 · Diferido a B3B

- Fuentes y contratos de automatización (`quality_automation_sources`), y la superficie
  de autoría de reglas. Los cinco eventos de B2 siguen catalogados y sin contratos.
- La superficie contextual de Trazaloop Intelligence. Los cargadores de B2 permanecen y
  **no se llama a ningún proveedor** desde B3A.
- PDF y exportación del dominio. Discovery rápido en el informe de pruebas: el motor
  universal puede consumir esta capa sin arquitectura nueva.
- Infraestructura global de ayuda y tutoriales, que es transversal a toda la plataforma.
- Contexto de la empresa (4.1), para el que el grupo «Contexto» ya está preparado y que
  este sprint deliberadamente no implementa.


---

## 10 · Despliegue de Preview · una nota que ahorra un susto

```bash
npx vercel deploy --target=preview --yes --scope idendi-latam-s-projects
```

**El `--scope` hace falta.** Sin él, el mismo comando responde
`{"status":"error","reason":"deploy_failed","message":"Not authorized"}` aunque
`vercel whoami` conteste correctamente y `vercel project ls` liste los proyectos: el
`orgId` guardado en `.vercel/project.json` no coincide con el ámbito que el CLI resuelve
por defecto. El mensaje sugiere un problema de credenciales y no lo es.

El destino va **explícito y en afirmativo**, siempre. Nunca `--prod=false`: eso costó un
incidente de producción el 27 de agosto de 2026 (`docs/releases/VERCEL_DEPLOY_SAFETY.md`).

Preview verificado: **Ready**, con Vercel SSO activo —responde 302 a `vercel.com/sso-api`
sin sesión— y **sin tocar una sola variable de entorno**. Production siguió con su
despliegue de hacía dos días.
