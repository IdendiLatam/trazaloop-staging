# PE-04B6 · Preparación para el corte

## Estado técnico

| | |
|---|---|
| Replay `0001 → 0168` | **160 migraciones, 0 fallos** |
| Tablas de `public` sin RLS tras el replay | **0** |
| `npm run typecheck` | **exit 0** |
| `npm run lint` | **0 errores**, 68 avisos heredados |
| `npm run build` | **exit 0** |
| `npm run test:all` | **exit 0** |

El defecto de la bajada de plan que bloqueaba este tramo quedó resuelto en
**0168** (ver `PE_04B6_PLAN_TRANSITION_FIX.md`). La comprobación que lo descubrió
pasa ahora con el comportamiento real, sin relajarse.

## Suites de cierre

| Suite | Resultado |
|---|---|
| `pe04b6-lifecycle` | **30/30** |
| `pe04b6-transitions` | **18/18** |
| `pe04b6-readiness` | **15/15** |

Y las heredadas, sobre la base reejecutada: SEC-01 19 ✔ · B1 38+30 ✔ ·
B2 29 ✔ · B3 22+16+6 ✔ · B4 43+18 ✔ · B5 37+23 ✔ · PE-03, PE-02, PCR, Textiles,
Quality, TrazaDocs y acceso a módulos en verde.

## Rendimiento de las comprobaciones comerciales

El **shell** —que se pinta en cada pantalla— no resuelve almacenamiento, IA,
tiempo ni soporte: una prueba lo impide explícitamente. Si lo hiciera, cada clic
costaría cuatro consultas comerciales.

El detalle de consumo se resuelve **donde se pregunta por él**: la puerta
(`/modules`) y el centro de soporte. El latido solo late en superficies medidas y
con cadencia acotada a 30 s.

Las escrituras pagan lo que tienen que pagar: una resolución de plan por
operación, dentro de la misma transacción que reserva.

## Lo que queda para PE-05

Cobro, Mercado Pago, suscripciones, cupones, descuento de gremio, cálculo de IVA,
facturación y la alerta interna de coste de IA sobre ingresos netos. Nada de eso
existe en PE-04, y hay una prueba que lo comprueba por nombre.

El **Acompañamiento especializado** sigue siendo un servicio aparte: no hay plan
`advisor`, no hay motor de horas y el catálogo de planes está cerrado a Free,
Full y Extra.

## Prueba humana · corta

La automatización ya demuestra la aritmética de los bordes. Lo que queda para una
persona es **comprensión**, no medición, y no debería llevar más de veinte
minutos:

1. **Puerta** (`/modules`) · ¿se entiende el plan, los créditos y —si aplica— el
   tiempo? ¿Se distinguen los créditos de la prueba de los del mes?
2. **Modo consulta** · con el cupo agotado por fixture: ¿queda claro qué se puede
   seguir haciendo? ¿Se puede leer, descargar y borrar?
3. **Soporte** (`/support`) · ¿se entiende que reportar una avería **no gasta**
   casos? ¿Y que la orientación funcional es de Extra sin que parezca un anuncio?
4. **Full y Extra** · ¿ninguna pantalla muestra una cuenta atrás de tiempo?
5. **Consola** (`/platform/plans`) · ¿se leen las condiciones sin abrir el
   esquema? ¿El resumen antes de publicar dice de verdad qué cambia?

No hace falta esperar 30 minutos, 48 horas ni un cambio de mes: los estados se
preparan con datos, igual que en las suites.
