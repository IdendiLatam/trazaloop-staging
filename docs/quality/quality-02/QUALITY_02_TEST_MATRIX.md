# QUALITY-02 · Matriz de pruebas

| Suite | Comando | Comprobaciones | Estado |
|---|---|---|---|
| Puras y estáticas | `npm run test:quality02` | 70 | ✅ 0 fallos |
| Base real (RLS, workflow, ataques) | `npm run test:quality02-rls` | 58 | ✅ 0 fallos |
| Recorrido humano HTTP + PDF | `npm run test:quality02-ui` | 26 | ✅ 0 fallos |
| **QUALITY-02** | | **154** | **✅** |
| Regresión completa | `npm run test:all` | 1 862 | ✅ salida 0 |
| Quality 01 / 01.1 / 01.2 · RLS | `test:quality01-rls`, `-011-`, `-012-` | 56 + 41 + 33 | ✅ |
| Quality 01 / 01.1 / 01.2 · recorrido | `test:quality01-ui`, `-011-`, `-012-` | 15 + 16 + 16 | ✅ |

---

## 1. Creación de documentos

| Qué exige el encargo | Dónde se comprueba |
|---|---|
| La revisión empieza en 1 | `unit A1`, `rls A1`, `ui 4` |
| Agregar secciones | `rls A3`, `ui 6` |
| Guardar y recargar | `rls A2`, `ui 7` |
| Eliminar y reordenar secciones | `rls A3`, `ui 5` (la pantalla lo ofrece) |
| Una sola revisión abierta a la vez | `rls A4` |

## 2. Workflow

| Qué exige el encargo | Dónde |
|---|---|
| Enviar a revisión | `rls B1`, `ui 8` |
| Revisor seleccionado | `rls B1`, `ui 8` (sale del desplegable de la pantalla) |
| Tarea generada | `rls B3`, `ui 9` |
| Aceptar la revisión | `rls B11`, `ui 14` |
| Devolver con motivo OBLIGATORIO | `rls B5`, `unit M9`, `ui 11` |
| El creador recibe alerta con el motivo | `rls B7`, `ui 12` |
| Reenviar | `rls B9`, `ui 13` |
| Tarea del aprobador | `rls B12`, `ui 15` |
| Aprobación | `rls B14`, `ui 15` |
| Ninguna decisión cambia en silencio | `rls B10` (el rechazo sobrevive al reenvío), `rls C3` |
| El aprobador no decide en la etapa de revisión | `rls B4` |
| El revisor no aprueba en lugar del aprobador | `rls B13` |
| Sin aprobador no se envía | `rls B2`, `unit C7` |

## 3. Revisiones

| Qué exige el encargo | Dónde |
|---|---|
| Los cambios de estado NO incrementan la revisión | `rls B1, B6, B9, B11, B14` · `unit A2` · `ui 16` |
| La revisión nueva incrementa explícitamente | `rls C2`, `ui 23` |
| La revisión anterior es inmutable | `rls C3`, `unit M8` |
| Consulta de la revisión histórica | `rls D3` |
| La RPC histórica no puede mover una revisión controlada | `rls H6`, `unit M3`, `unit M4` |

## 4. Vigencia

| Qué exige el encargo | Dónde |
|---|---|
| Aprobado ≠ vigente | `unit B1, B2`, `rls D1`, `ui 16` |
| `effective_from` | `unit B3, B6`, `rls D2` |
| Resolución histórica | `rls D3` |
| Revisión vencida NO obsoleta el documento (D-09) | `unit B7`, `rls D2` |

## 5. Lista Maestra

| Qué exige el encargo | Dónde |
|---|---|
| Revisión vigente | `unit E3`, `ui 17` |
| Estado | `unit E1`, `ui 17` |
| Revisor y aprobador | `rls F1`, `ui 17` |
| Fechas | `unit E1`, `ui 17` |
| Proceso | `unit E1` |
| Filtros | `unit E4`, `ui 18` |
| Cross-tenant | `rls F2` |
| Es una proyección, no una tabla | `unit M10`, `rls F3` |
| Vacío no es cero | `unit E2` |

## 6. Eliminar y retirar

| Qué exige el encargo | Dónde |
|---|---|
| Borrador sin uso: eliminación por administrador | `rls G1`, `unit D1` |
| Usado/aprobado: NO se puede destruir | `rls G2, G3`, `unit D2, D3` |
| El retiro conserva la historia | `rls G5`, `unit D5` |
| La interfaz explica POR QUÉ no se elimina | `unit D6`, `ui 25` |
| Solo el administrador elimina | `rls G4`, `unit C6` |
| Retirar exige motivo | `rls G7`, `unit M9` |

## 7. PDF

| Qué exige el encargo | Dónde |
|---|---|
| PDF de documento | `unit G1–G7`, `ui 19` |
| PDF de Lista Maestra | `unit G8, G9`, `ui 20` |
| Organización correcta | `unit G3`, `ui 19, 20` |
| Revisión correcta | `unit G3`, `ui 19` |
| No autorizado → denegado | `rls` (guard) · `unit N6` (el guard existe en los 3 endpoints) |

### 7.1 Validación real del archivo (Parte 22)

No se acepta un HTTP 200. Se comprueba, sobre los bytes devueltos por la app:

- `content-type: application/pdf` y `content-disposition: attachment`
- Tamaño mínimo razonable (> 3 000 bytes el documento, > 2 000 la lista)
- Cabecera `%PDF-1.7`, catálogo, árbol de páginas, `startxref` y `%%EOF`
- **Las posiciones de la tabla xref apuntan de verdad a cada objeto** (`unit G2`)
- Número de páginas y presencia de «Página N de M»
- Texto esperado dentro del archivo: código, título, revisión, organización,
  revisor, aprobador, contenido, y el motivo de la devolución
- Que **no** se filtre ningún UUID ni nombre de tabla (`unit G5`, `ui 19`)
- Que los acentos del español sobrevivan a la codificación WinAnsi (`unit G11`)

## 8. Tareas y alertas

| Qué exige el encargo | Dónde |
|---|---|
| Destinatario correcto | `rls B3, B7, B12` |
| Sin fuga entre empresas | `rls E1, E2` |
| Resolución | `rls E3`, `rls B8` |
| Motivo del rechazo | `rls B7`, `ui 12` |
| No se duplican al reenviar | `rls E5`, `unit M11` |

## 9. Regresión

| Qué | Dónde |
|---|---|
| Un documento legacy conserva su comportamiento | `rls Z1` |
| No se convierte en controlado por la puerta de atrás | `rls Z2` |
| Las vistas históricas de TrazaDocs responden | `rls Z3` |
| Los módulos no se mezclan | `rls Z4` |
| PCR / Textiles / TrazaDocs completos | `npm run test:all` — 1 862 ✅ |
| Quality-only funciona sin PCR ni Textiles | `ui 26`, y toda la suite `rls` corre sobre una organización quality-only |

---

## 10. Defectos que las pruebas encontraron

Ninguno de estos apareció al compilar. Aparecieron al **mirar lo que el sistema
produce**:

| # | Defecto | Cómo se encontró |
|---|---|---|
| 1 | Los encabezados de la Lista Maestra en PDF se recortaban («Revisión vi…») | Abriendo el PDF generado |
| 2 | Un aprobado con vigencia futura imprimía «empieza a regir el —» | Abriendo el PDF generado |
| 3 | La última decisión salía como `approved`, la clave interna | Abriendo el PDF generado |
| 4 | El código del documento se partía en dos líneas | `ui 20` |
| 5 | La tabla de 16 columnas empujaba el shell entero fuera de la ventana | Abriendo la pantalla en un navegador |
| 6 | El distintivo de estado se deformaba en un óvalo de tres líneas | Abriendo la pantalla en un navegador |
| 7 | El formulario de creación no existía sin JavaScript | `ui 4` |
| 8 | La ficha duplicaba el editor de secciones en vez de reutilizarlo | Invariante `E4` de QUALITY-01.1 |

Los ocho están corregidos, y del 1 al 3 tienen ahora una comprobación propia
(`unit G8`, `unit E8`, `unit E9`) para que no vuelvan.
