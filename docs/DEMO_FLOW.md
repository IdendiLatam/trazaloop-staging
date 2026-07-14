# Trazaloop · Flujo demo (piloto)

> **Nota (Sprint 6):** esta guía usa datos de **demostración** (caso ficticio,
> con o sin script `seed:demo`) para mostrar Trazaloop de punta a punta. Para
> probar Trazaloop con una empresa y **datos reales**, usa en cambio
> `docs/COMPANY_TESTING_GUIDE.md` y la sección `/implementation`. No mezcles
> ambos flujos en la misma organización: `/implementation` nunca crea datos
> de demostración, solo lee lo que la empresa realmente registró.

Guion para demostrar Trazaloop de punta a punta con una empresa piloto de
plásticos. Los números de los casos están calculados para que el resultado
salga exacto y sin advertencias de balance.

> **Nota de balance:** el motor compara el consumo de la orden/corrida contra
> la composición de cada lote producido (tolerancia 5 %), y la cantidad
> producida contra la composición. Para una demo limpia: **consumo =
> composición = cantidad producida**. El porcentaje SIEMPRE se calcula sobre
> la masa de la composición; la cantidad producida no es denominador.

## Pasos

1. **Crear cuenta** en `/register` (confirmar correo si aplica) e iniciar sesión.
2. **Crear organización** (p. ej. *Piloto Plásticos*) y verificar que queda
   como empresa activa.
3. **Crear proveedor** (Catálogos → Proveedores), p. ej. *Recicladora Piloto*.
4. **Crear material reciclado** (Catálogos → Materiales): *PCR Piloto*,
   clasificación **Postconsumo válido**.
5. **Subir evidencia de origen** (Evidencias → crear, con archivo si se
   quiere mostrar el bucket privado).
6. **Validar la evidencia** (admin o calidad): estado `valid`. Sin este paso,
   el material no contará.
7. **Asociarla como soporte de origen del material**: Evidencias → Asociar
   evidencia → destino *Material* → tipo de vínculo **Soporte de origen del
   material**. El material debe quedar con badge **Soporte válido** en
   Catálogos → Materiales.
8. **Crear lote de entrada** (Trazabilidad): *PIL-LE-001*, proveedor y
   material anteriores, 40 kg recibidos.
9. **Crear orden / corrida de producción**: *PIL-OP-001*.
10. **Registrar consumo**: 20 kg de *PIL-LE-001* en *PIL-OP-001*.
11. **Crear lote producido**: *PIL-LS-001* sobre *PIL-OP-001*, cantidad
    producida 20 kg, y **registrar composición** según el caso elegido
    (abajo).
12. **Calcular contenido reciclado** (Contenido reciclado → Calcular por
    lote, o desde el Flujo guiado). Revisar porcentaje, nivel de
    defendibilidad y componentes explicados.
13. **Ver dossier técnico** (Soporte técnico → Ver dossier) e **imprimir /
    guardar como PDF** desde la vista imprimible.

Para recorrerlo sin perderse: la sección **Flujo guiado** muestra en todo
momento el siguiente paso del lote.

## Casos demo

### Caso A — 100 % defendible

- Consumo: 20 kg de *PIL-LE-001*.
- Composición de *PIL-LS-001*: **20 kg de PCR Piloto** (soporte válido).
- Cantidad producida: 20 kg.
- Resultado esperado: **100,00 %**, nivel **Defendible**, componente contado.

### Caso B — 90 % defendible

- Crear además el material *Resina virgen Piloto* (clasificación **Virgen**).
- Consumo: 20 kg.
- Composición: **18 kg de PCR Piloto + 2 kg de resina virgen** (total 20 kg).
- Cantidad producida: 20 kg.
- Resultado esperado: **90,00 %**, nivel **Defendible**; la resina virgen
  aparece excluida como *material no reciclado*.

### Caso C — 0 % preliminar (sin evidencia válida)

- Crear el material *PCR sin soporte* (Postconsumo válido) **sin** asociarle
  evidencia de origen, o con una evidencia **pendiente** de validar.
- Consumo: 20 kg. Composición: **20 kg de PCR sin soporte**. Producido: 20 kg.
- Resultado esperado: **0,00 %**, nivel **Preliminar**; el componente aparece
  excluido por *sin evidencia de soporte de origen* (o *soporte no validado*
  si la evidencia está pendiente), con la brecha y la acción sugerida en
  Soporte técnico.
- Remate de la demo: validar/asociar la evidencia, **recalcular** (snapshot
  nuevo; el anterior se conserva) y mostrar cómo pasa a **100 % defendible**.

## Alternativa por script

`npm run seed:demo` siembra un caso completo (declara 60 %, calcula 70 %) en
una organización explícita; ver `docs/STAGING_DEPLOYMENT.md` §15.
