# QUALITY-10 · Cobertura documental

**Ocho claves nuevas por el registro cerrado.** Ninguna tiene endpoint propio:
el navegador solo puede nombrar una clave de la lista, y todo lo demás lo decide
el servidor.

## 1 · Las ocho

| Clave | Documento | Eje | Temporalidad |
|---|---|---|---|
| `quality.management-review.list` | Listado de revisiones por la dirección | list | current |
| `quality.management-review.detail` | Ficha de revisión por la dirección | detail | current |
| `quality.management-review-agenda.detail` | Agenda de revisión por la dirección | detail | current |
| `quality.management-review-inputs.detail` | Paquete de entradas de revisión | detail | current |
| `quality.management-review-decision.list` | Listado de decisiones de la revisión | list | current |
| `quality.management-review-report.detail` | **Informe de revisión por la dirección** | detail | current |
| `quality.management-review-minutes.detail` | **Acta de revisión por la dirección** | historical | **historical** |
| `quality.management-review-followup.list` | Reporte de seguimiento de la revisión | list | current |

Gramática respetada: `modulo.entidad.{detail|list|historical}`. Los tres
listados empiezan por «Listado» o «Reporte».

## 2 · Las cuatro reglas que atraviesan los ocho

1. **§75 · El acta se imprime desde su instantánea.** La revisión de 2027
   reimpresa en 2029 devuelve 2027: las entradas tal como se revisaron, el
   análisis tal como se escribió y los participantes con el cargo de entonces.
2. **§41 · Ninguno confunde decisión con acción.** Las dos columnas van
   separadas y el papel explica por qué los números no coinciden.
3. **§36 · Ninguno escribe cero donde no hubo medición.**
4. **§63 · Ninguno rompe el anonimato**, porque lo único que este dominio
   guarda de los clientes son agregados.

## 3 · El informe principal — §74

`quality.management-review-report.detail` tiene diez secciones numeradas:

```
1 Identificación            6 Conclusiones de la dirección
2 Periodo revisado          7 Decisiones y salidas
3 Participantes             8 Acciones y seguimiento
4 Agenda                    9 Notas de la sesión
5 Entradas, datos y        10 Cierre y próxima revisión
  análisis (una subsección
  por cada una de las 14)
```

El **acta** repite esa estructura pero leyendo `snapshot`, y añade el linaje de
cada dato tal como se registró.

## 4 · El inventario

Once entidades nuevas clasificadas. Los nombres llevan apellido: «Decisión» a
secas ya existe en el motor de casos, y «Acta» sola no diría de qué.

| Entidad | detail | list | historical |
|---|---|---|---|
| Revisión por la dirección | AVAILABLE | AVAILABLE | AVAILABLE (su acta) |
| Entrada de la revisión | EMBEDDED | EMBEDDED | EMBEDDED (acta) |
| Paquete de entradas | AVAILABLE | EMBEDDED | AVAILABLE (acta) |
| Aportación manual de la dirección | EMBEDDED | EMBEDDED | EMBEDDED (acta) |
| Participante de la revisión | EMBEDDED | EMBEDDED | EMBEDDED (acta) |
| Agenda de la revisión | AVAILABLE | EMBEDDED | EMBEDDED (acta) |
| Decisión de la revisión | EMBEDDED | AVAILABLE | EMBEDDED (acta) |
| Informe de revisión | AVAILABLE | EMBEDDED | AVAILABLE (acta) |
| Acta de revisión | AVAILABLE | EMBEDDED | AVAILABLE |
| Nota de la revisión | EMBEDDED | EMBEDDED | EMBEDDED (acta) |
| Seguimiento de la revisión | EMBEDDED | AVAILABLE | sin histórico, con motivo |

Inventario total tras QUALITY-10: **189 entidades · 158 claves prometidas**.

**Q10_EXPORT_PENDING = 0.**

## 5 · Alcanzables desde la pantalla

`test:export01` H1 comprueba que **toda** clave del registro se ofrece en alguna
pantalla. Las ocho tienen su botón:

| Dónde | Qué se descarga |
|---|---|
| Listado de revisiones | listado · ficha por fila |
| Ficha · cabecera | ficha de la revisión |
| Ficha · preparación | paquete de entradas · agenda |
| Ficha · decisiones | listado de decisiones |
| Ficha · acta | informe · acta por versión |
| Ficha · seguimiento | reporte de seguimiento |
| Seguimiento transversal | reporte de seguimiento |

## 6 · Suites en verde

```
test:export01   → 54 conformes, 0 fallos
test:export011  → 31 conformes, 0 fallos
test:export012  → 28 conformes, 0 fallos
test:export013  → 34 conformes, 0 fallos
```
