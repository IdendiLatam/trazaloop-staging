# PE-04B5 · Matriz de pruebas

## Contra la base real · `npm run test:pe04b5-support` · **37 en verde**

### A · Reportar una avería está en los tres planes
| | |
|---|---|
| A/B/C | Free, Full y Extra pueden reportar un problema técnico |
| D | **Cinco reportes técnicos consumen CERO casos** funcionales |
| — | Y sigue disponible **aunque el plan no se pueda resolver**: enterarse de que el producto está roto no puede depender de leer un plan |

### B · Orientación funcional
| | |
|---|---|
| E | Free: denegada, con `FUNCTIONAL_SUPPORT_NOT_INCLUDED` |
| F | Full: tampoco · USD 40 no incluyen acceso a una persona |
| G/H | Extra: incluida, 2 al mes, con prioridad comercial; el tercero da `FUNCTIONAL_SUPPORT_LIMIT_REACHED` |
| J | La prueba de Full **no** trae los casos de Extra; el reporte técnico sí |

### C · Concurrencia y ámbito
| | |
|---|---|
| **K** | **Con un caso libre, dos envíos simultáneos: pasa uno** |
| L | Dos personas comparten la misma bolsa de empresa |
| M | Extra en **dos** módulos sigue dando **2** casos, no 4 |

### D · Cambios de plan
| | |
|---|---|
| N/O | Subir a Extra a mitad de mes da el cupo; lo técnico previo no cuenta |
| **P/Q** | **Bajar no cierra el caso abierto** —sigue vivo y conserva su periodo— pero no deja abrir otro |
| R | Ir y volver a Extra el mismo mes deja el consumo en **2/2** |
| I | El consumo del mes anterior no resta al nuevo |

### E · La cola
| | |
|---|---|
| **S/T** | **Un incidente crítico de una empresa Free adelanta a una consulta prioritaria de una Extra** |
| U | «1 día hábil» es objetivo de primera respuesta: hay `first_response_target_at` y **no** una fecha de resolución comprometida |

### F · Reclasificación
| | |
|---|---|
| V | Técnico → funcional **no** se salta el derecho: sin cupo queda `not_covered` y no consume |
| W | Ida y vuelta consume **una sola vez** |
| — | Una devolución **explícita** sí libera: era un defecto nuestro |
| X | La historia se conserva, y cada entrada dice por qué |
| — | Reclasificar es de soporte: el cliente no puede reetiquetar para no gastar |
| Y | Marcar fuera de alcance no convierte el caso en consultoría incluida ni borra su consumo |

### G · La consola comercial
| | |
|---|---|
| Z/AA/AB | Soporte, cliente y ajeno **no** asignan planes; la administración de plataforma sí |
| AH | La asignación manual deja historia con el **plan anterior** y el motivo |
| AI | `core` no puede recibir plan comercial |
| AC | Una revisión **publicada** no se edita |
| AD/AE | Un borrador sí, y publicarlo **cierra y retira** la anterior |
| AG | Publicar **no** mueve a las empresas ya asignadas |
| AF | La historia de revisiones se conserva, incluida la 1 |

### H · Seguridad
| | |
|---|---|
| AP | Un ticket de otra empresa no se lee |
| — | Ni el derecho de soporte de otra empresa |
| AR/AS | Ni soporte ni el cliente cambian el catálogo comercial — comprobado por **efecto**, no por error |
| AA | Soporte **sí** lee catálogo y derecho: lo necesita para atender |
| AT | Cero tablas de `public` sin RLS |
| — | Nadie escribe a mano la historia comercial ni las reclasificaciones |

## Estático · `npm run test:pe04b5-static` · **23 en verde**

Una sola puerta de envío (`insertSupportTicket` retirada, ningún `insert` directo
a `support_tickets`) · el derecho **no** se deduce de la categoría · el reporte
técnico siempre permitido incluso sin plan resoluble · solo lo funcional fija
periodo, y bajo candado · la UX enseña los dos ejes por separado y dice que lo
técnico no consume · no se promete plazo de resolución · la severidad se evalúa
**antes** que lo comercial · todas las escrituras de la consola exigen
administración de plataforma · publicar y asignar piden confirmación escrita y
resumen en palabras · `core` fuera, en la base y en la pantalla · etiquetas
humanas y precios antes de impuestos · «sin configurar» no se pinta como cero ·
la cola de plataforma enseña el plan canónico · la consola no lee nada legacy ·
ni Demo ni Advisor como planes · configurado y efectivo separados · la bajada
avisa y promete que no se borra nada · las tablas nuevas nacen con RLS, política
y revocación · `/support` sigue fuera del reloj y de la puerta de mutación.

## Lo que los guardias heredados atraparon

**El guardia de cobertura de mutaciones de PE-04B4 se puso rojo** al aparecer las
cinco acciones de la consola comercial. Es exactamente su trabajo: quedaron
declaradas con su motivo —administrar el catálogo o mover a una empresa de plan
no puede depender del cupo de esa empresa, o sería imposible reactivar
precisamente a quien lo agotó—.

**El guardia de cobertura de pantallas de PE-03** se puso rojo al nacer
`/platform/plans`, y quedó clasificada como consola interna.

**El estático de PE-04B1** afirmaba que *nadie* consumía el modelo canónico. Era
cierto en B1, donde se construía en paralelo, y dejó de serlo a propósito en B2.
Se reescribió al invariante que sí sigue vivo: el producto pregunta por los
resolutores y no arma su aritmética leyendo filas del catálogo, con la consola
comercial como única excepción declarada —administrar un catálogo es leer sus
filas— y con la comprobación añadida de que todas sus escrituras exigen
administración de plataforma.

## Reejecución y regresión

- `bash scripts/replay-local.sh` — **159 migraciones, 0 fallos, cabecera 0167**.
- Tablas de `public` sin RLS tras el replay: **0**.
- `npm run test:all` — **en verde**; lint 0 errores y **68 avisos heredados**.
- `npm run build` — correcto.
- SEC-01 (19 ✔), PE-04B1 (38 ✔ estático · 30 ✔ ejecución), B2 (29 ✔), B3 (22 ✔),
  B4 (43 ✔ · 18 ✔), PE-03 y PE-02 en verde sobre la base reejecutada.

## Autorización de la migración

`0167_support_entitlements_and_commercial_admin.sql` añadida a las listas blancas
de las **16** suites que las mantienen.
