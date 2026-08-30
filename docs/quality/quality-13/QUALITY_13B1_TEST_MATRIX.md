# QUALITY-13B1 · MATRIZ DE PRUEBAS

Cuatro suites, **49 comprobaciones**, todas por código de salida.

| Suite | Comando | Qué prueba | Dónde |
|---|---|---|---|
| Contrato | `npm run test:quality13b1-integration` | 16 | estática y pura |
| Atención | `npm run test:quality13b1-attention` | 9 | pura |
| Contexto de proceso | `npm run test:quality13b1-process-context` | 9 | base real |
| Aislamiento | `npm run test:quality13b1-rls` | 9 | base real, tres identidades |

Las dos primeras entran en `test:all`; las dos de base real se corren aparte, como sus
pares.

---

## 1 · Cobertura de lo que pedía el encargo

| | Qué se comprobó | Dónde |
|---|---|---|
| **A** aritmética de la matriz derivada del documento | A1 · A2 · A3 |
| **B** temporal CURRENT | B |
| **C** temporal AS_OF | C |
| **D** temporal PERIOD | D |
| **E** enlace estable, y cada ruta declarada **existe** | E · E2 |
| **F** sin caída a PCR ni Textiles | F |
| **G** el contexto devuelve los dominios reales | G · G2 |
| **H** otra empresa no obtiene nada | H · RLS-1 · RLS-2 · RLS-4 |
| **I** proveedor→proceso derivado, no persistido | I |
| **J** queja→proceso derivada, no persistida | J |
| **K** contexto de cargo | K |
| **L** la tarea propia sigue siendo propia | L |
| **M** la acción transversal sigue siendo transversal | M |
| **N** clave de atención determinista | N |
| **O** dos observadores del mismo problema convergen | O |
| **P** dos problemas del mismo sujeto no se funden | P · P2 |
| **Q** un fallo NO es cero | Q |
| **R** una denegación NO es cero | R |
| **S** sin N+1 | S–T |
| **T** número de consultas acotado y constante | S–T |
| **U** sin `service_role` | U |
| **V** sin tabla nueva de integración | V · V2 · V3 |
| **W** fuente de automatización de proceso | W · RLS-6 · RLS-7 · RLS-8 |

---

## 2 · Las tres comprobaciones que más valen

**A2 · el resumen de la matriz coincide con la tabla.** Recuenta el archivo y compara con
su propio bloque de resumen. **Las dos cifras salen del mismo documento**, así que no hay
ni un número escrito a mano en la prueba y no puede quedarse obsoleta. Es la comprobación
que habría evitado el «130 celdas» de 13A, y la que el encargo pedía sin que se volviera
frágil.

**S–T · el coste no crece con las filas.** Envuelve el cliente en un contador, compone el
contexto con un riesgo, añade cuarenta, y vuelve a componer. **El número de consultas
tiene que ser el mismo.** Contar es la única forma honesta de comprobarlo; leer el código
y decidir que «parece eficiente» es como se cuela un N+1.

**Q y R · un fallo y una denegación no son cero.** Se rompe **una** lectura y se comprueba
que llega como `unavailable` con su motivo, que su recuento es `null`, y que las otras
ocho secciones siguen. Después se deniega **una** y se comprueba que llega como
`not_visible`. Es el defecto de QUALITY-12.2F convertido en prueba.

---

## 3 · Una comprobación que hubo que reescribir

**RLS-9** intentaba verificar que el CHECK de sujeto admite `quality_process` insertando
una tarea, y la RLS lo rechazó —**correctamente**: `work_tasks` no tiene política de
escritura para personas; las salidas las emite el ejecutor—.

Se reescribió en dos: la suite de base real comprueba ahora lo que esta capa sí debe
garantizar —que **nadie escribe una tarea a mano**— y la ampliación del CHECK se verifica
leyendo la migración, en la suite estática. La prueba fallida enseñó algo cierto sobre el
sistema, y por eso se conserva su lección escrita en el propio archivo.

---

## 4 · Regresión

| Comprobación | Resultado |
|---|---|
| `npm run test:all` | **EXIT=0** |
| `typecheck` · `lint` · `build` | 0 · 0 errores · 0 |
| QUALITY-11 automatización | 0 |
| QUALITY-12.3 (once suites del dominio) | 0 |
| `quality123b3b-automation` · `-intelligence` | 0 · 0 |
| `quality123b3a-e2e` (P1–P10) | **0** |
| Replay limpio 0001 → 0152 | cabecera 0152 · 144 en disco · 144 registradas · 0 fallos |
