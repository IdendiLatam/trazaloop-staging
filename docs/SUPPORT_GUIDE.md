# Trazaloop · Guía de soporte (piloto)

Respuestas para el operador de soporte ante los reportes más frecuentes.
Herramienta central: `npm run diagnose:org -- --org <uuid>` (solo lectura;
requiere `SUPABASE_DB_URL`). El uuid de la organización está en la tabla
`organizations`.

## 1. «El cálculo me sale 0 %»

Causa casi segura: el material reciclado no tiene **evidencia de origen
asociada como soporte y validada** (un enlace general no basta).
**Dónde mirar:** Catálogos → Materiales (badge *Sin soporte / Soporte
pendiente / Soporte válido*) o el detalle del cálculo (componentes con su
razón de exclusión). **Remedio:** Evidencias → Asociar → tipo de vínculo
«Soporte de origen del material» → validar (admin/calidad) → **recalcular**.
`diagnose:org` lista los materiales elegibles sin soporte válido.

## 2. «El cálculo sale preliminar»

Falta trazabilidad hacia atrás (orden sin consumos), o ninguna masa contó
como reciclada. **Dónde mirar:** Soporte técnico → brechas del lote, o Flujo
guiado (semáforo y siguiente paso). El diagnóstico muestra órdenes sin
consumo.

## 3. «Sale con advertencias»

Balance de masa fuera de tolerancia (consumo vs composición vs producido,
±5 %), declarado por encima del calculado, o evidencia pendiente asociada.
**Dónde mirar:** el dossier técnico lista las advertencias exactas.

## 4. «Aparece riesgo declarado»

El % declarado del producto (Catálogos → Productos) supera al calculado.
Revisar el declarado o completar soportes y recalcular. Nunca editar el
snapshot: recalcular crea uno nuevo.

## 5. «No puedo calcular» (botón deshabilitado)

El lote no tiene composición registrada. **Dónde mirar:** Trazabilidad →
Lotes producidos → Composición, o el paso 4 del Flujo guiado.

## 6. «No veo mis datos»

Casi siempre es empresa activa o membresía: ¿seleccionó la organización
correcta? ¿su membresía está `active`? `diagnose:org` muestra miembros por
rol/estado. Si no hay miembros activos, nadie ve nada (RLS correcto).

## 7. «No puedo validar una evidencia»

Solo admin o calidad validan. Verificar el rol en la sección Miembros del
diagnóstico.

## 8. «Subí el archivo pero no aparece»

Verificar que la evidencia se creó (lista de Evidencias) y que hay sesión
activa. Si el bucket falla en staging/producción: `npm run verify:prod`
(chequea bucket privado).

## 9. «El % agregado no coincide con el promedio de mis lotes»

Correcto: los agregados se **ponderan por masa** (`Σ reciclada / Σ total`),
nunca se promedian porcentajes. Un agregado con lotes sin calcular se marca
preliminar.

## 10. «Recalculé y no cambió nada»

El cálculo lee el estado actual: si no se corrigió la causa (soporte,
consumo, composición), el resultado será el mismo. Corregir primero (el
dossier y las brechas dicen exactamente qué), luego recalcular. El historial
conserva todos los snapshots.

## Cuándo usar `diagnose:org`

Ante cualquier reporte de los anteriores que no se resuelva a la vista, o
cuando el usuario no sabe describir el estado: el script entrega miembros,
conteos, huecos de trazabilidad, materiales sin soporte, últimos cálculos,
brechas, semáforo y **causas probables**, sin modificar nada.
