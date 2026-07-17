# Trazaloop · Checklist QA manual (pre-piloto)

Recorrido manual completo antes de sentar a la empresa piloto. Marcar cada
punto en staging con un usuario real.

```text
[ ] Registro e inicio de sesión funcionan (correo de confirmación si aplica)
[ ] Crear organización y verla como empresa activa en el shell
[ ] Crear proveedor / material / producto (con % declarado opcional)
[ ] Subir evidencia (archivo al bucket privado) y validarla (admin/calidad)
[ ] Asociar evidencia como "Soporte de origen del material" y ver el badge
    "Soporte válido" en Catálogos → Materiales
[ ] Crear lote de entrada
[ ] Crear orden / corrida de producción
[ ] Registrar consumo (conecta lote de entrada con la orden/corrida)
[ ] Crear lote producido y registrar composición (consumo = composición
    = cantidad producida para una corrida limpia)
[ ] Calcular contenido reciclado y revisar componentes explicados
[ ] Verificar nivel de defendibilidad correcto (Caso A 100% defendible,
    Caso C 0% preliminar; ver docs/DEMO_FLOW.md)
[ ] Ver dossier técnico e imprimir / guardar como PDF desde /print
[ ] Verificar aislamiento multiempresa: con una segunda organización, los
    datos de la primera NO se ven (catálogos, lotes, cálculos, dossiers)
[ ] Abrir /implementation y verificar que las tarjetas muestran conteos
    reales (nunca datos inventados) y que el checklist de 17 pasos refleja
    el estado real de la empresa
[ ] Crear un ticket de soporte de prueba en /support, filtrarlo por
    estado/categoría/prioridad, responderlo y confirmar que una segunda
    organización NO lo ve
[ ] Confirmar que ningún texto de /implementation promete certificación ni
    nombra organismos certificadores (ver npm run test:compliance)
```

Notas:

- Si un material reciclado da 0 %: revisar que la evidencia de origen esté
  asociada COMO SOPORTE (no solo como enlace general) y VALIDADA.
- Recalcular siempre crea un snapshot nuevo; el historial se conserva.
- Cualquier fallo de esta lista bloquea el piloto hasta corregirse.
- `/implementation` es para probar con datos REALES; el caso de demostración
  de este documento vive aparte en `docs/DEMO_FLOW.md`.
