# PE-04B4 · Las puertas comerciales y su cobertura

## Las dos puertas

- `checkOrganizationCanMutate(intención)` — recursos transversales de la empresa
  (equipo, datos de empresa, logo).
- `checkModuleCanMutate(módulo, intención)` — PCR, Textiles y Quality, con sus
  tres envolturas.

Ambas combinan **tres ejes independientes**:

1. **Administrativo** — `suspended`/`cancelled` deja en solo lectura. No bloquea
   ante un fallo de lectura de la vista legacy: ese eje no es el comercial.
2. **Comercial** — el modo consulta, por intención.
3. **Autorización** — rol y RLS, que se aplican aparte y siempre.

## Cobertura de mutaciones

De **192** acciones exportadas que escriben (detectadas por `revalidatePath`),
**176** pasan por una puerta, directamente o a través de un ayudante local que la
llama —así lo tiene montado Quality, con un `gate()` compartido por decenas de
acciones—.

Las **16** restantes están declaradas una a una con su motivo en
`ESCRITURAS_SIN_PUERTA`:

| Motivo | Acciones |
|---|---|
| Cierra un flujo ya reservado; bloquearlo dejaría bytes reservados y un archivo sin fila | `finalizeEvidenceUploadAction` |
| Cancela y **libera** | `cancelEvidenceUploadAction` |
| Operación esencial de cuenta | `updateMyProfileAction` |
| Son **lecturas** que revalidan ruta | `listPlatformStaffAction`, `getPostAuthDestinationAction` |
| Consola de **plataforma** — no puede depender del cupo del cliente, o sería imposible reactivar a quien lo agotó | `changeOrganizationPlanAction`, `setOrganizationModuleAccessAction` |
| Contenido de **plataforma** | 2 de FAQ, 7 de plantillas TrazaDocs |

El guardia comprueba las dos direcciones: que no aparezca una escritura nueva sin
declarar, **y** que la lista no acumule entradas que ya pasan por la puerta o que
ya no existen.

## Lo que se cableó en este tramo

`commitImportAction` (en sus dos archivos) — confirmar una importación crea filas
de negocio en bloque. `saveSuggestionAction` — aceptar una sugerencia crea estado
de negocio. `rejectSuggestionAction` — retira, se declara reducción.
`updateAiSettingsAction` — configura el sistema de gestión.

`gate()` de Quality pasa a aceptar una intención **opcional**: solo las acciones
que mutan piden la puerta comercial. Preguntar y leer no la necesitan, y la
ejecución de Intelligence tiene la suya en la propia reserva de créditos.

## Cobertura de Intelligence

Tres caminos declarados, y el guardia exige de cada uno:

- que **reserve antes** de llamar al proveedor (comprobando el orden en el
  código, no solo la presencia);
- que **confirme** con resultado;
- que **libere** en al menos tres salidas sin resultado utilizable.

Un archivo nuevo con `generateStructured(` sin declarar pone la suite en rojo.
**Probado**: se creó uno y lo señaló por nombre; se retiró y volvió a verde.
Igual con una acción de escritura nueva sin puerta.

## El puente free→demo, retirado

B3 lo sacó del almacenamiento y dejó dos usos: límites de conteo y funciones
habilitadas. B4 los pasa al catálogo canónico (`organization_plan_limit`, 0166),
de modo que **`commercialTierToLegacyPlanCode` ya no tiene ningún llamante y se
retira**, igual que `resolveEffectiveStorageLimitBytes`.

Los trece límites funcionales se copiaron byte a byte en 0162/0163 —verificado
comparando las dos tablas—, así que el comportamiento no cambia; cambia de dónde
se lee. Y cambia algo más: un límite **sin configurar** ahora **niega**, en vez
de leerse como «no hay límite», que era el hueco que dejaba `if (!limit) return
{ allowed: true }`.

La consola de plataforma también pasa a enseñar los límites canónicos: mientras
los leyera del catálogo legacy podía **enseñar unos números y el producto exigir
otros**.

`plan_limits` y `plan_definitions` no se borran —son historia y respaldo—; lo que
se retira es su autoridad, y queda escrito en un `comment on` de cada tabla.
