# PE-03B5 · La cobertura, recontada antes de cerrar

El encargo de cierre daba unos números y una instrucción: **«no los creas a
ciegas; recalcula desde el repositorio real»**. Esto es el recuento.

---

## 1 · Lo que salió

| | Esperado | **Medido** |
|---|---|---|
| Páginas en el repositorio | 187 | **187** |
| Rutas registradas | 150 | **150** |
| Claves de tutorial | 152 | **152** |
| Exclusiones con motivo | 37 | **37** |
| Sin clasificar | 0 | **0** |

| Módulo | Esperado | **Medido** |
|---|---|---|
| Trazaloop Quality | 67 | **67** |
| Trazaloop PCR | 44 | **44** |
| Trazaloop Textiles | 33 | **33** |
| Transversal | 8 | **8** |

Coinciden. Y coinciden **porque se contaron**, no porque se copiaran: la suite
`pe03b5-coverage` no importa ninguna cifra de ningún documento — recorre `app/`,
resuelve la dirección real de cada `page.tsx` quitando los grupos de rutas de
Next, y compara con lo que el registro dice de sí mismo.

Las dos claves de más sobre las 150 rutas son las pestañas que comparten
dirección. Ver §4.

---

## 2 · El invariante, comprobado en las dos direcciones

Cada pantalla del producto está **exactamente** en una de las dos listas.

Se comprueba de tres formas, porque cada una encuentra un error distinto:

| Comprobación | Qué error encuentra |
|---|---|
| Ninguna página sin clasificar | Una pantalla nueva que nadie registró |
| Ninguna en las dos listas | Una clasificación contradictoria |
| **registradas + excluidas = páginas** | Una contada dos veces, o ninguna |

La tercera es la que cierra el círculo: sin ella, dos errores que se compensan
—una pantalla contada dos veces y otra que falta— pasarían las dos primeras.

Y en la otra dirección: **ninguna clave y ninguna exclusión apunta a una
pantalla que ya no existe**. Una lista puede quedarse vieja por los dos lados.

---

## 3 · Unicidad

| | Resultado |
|---|---|
| Claves repetidas | **0** |
| Pantallas con dos claves | solo las 2 pestañas declaradas, y cada una con su parámetro |
| Alias por errata (dos claves a una letra) | **0** |
| Claves que no empiezan por su módulo | **0** |
| Rutas reclamadas por dos módulos | **0** |
| Rutas de Quality o Textiles caídas en `cpr` | **0** |

La última merece explicación. PCR era el módulo **por defecto** del shell:
cualquier ruta que se olvidara de declarar resolvía a PCR igualmente, y el
olvido no se notaba. Se comprueba explícitamente que ninguna ruta bajo
`/quality` o `/textiles` se atribuye a `cpr`.

---

## 4 · Rutas dinámicas

**Una clave por tipo de pantalla, nunca por registro.** Comprobado con dos
identificadores distintos en seis pantallas de los tres módulos:

```
/quality/processes/AAA          ┐
/quality/processes/BBB          ┴→  quality.processes.detail
/traceability/production-orders/AAA ┐
/traceability/production-orders/BBB ┴→  cpr.traceability.production_orders.detail
/textiles/passports/AAA         ┐
/textiles/passports/BBB         ┴→  textiles.passports.detail
```

Y ninguna clave resuelta contiene el identificador: se comprueba pasando un
UUID completo y verificando que no aparece en la clave que sale.

Las fichas **anidadas** también resuelven a la suya:
`/quality/suppliers/AAA/sites/BBB` → `quality.suppliers.sites.detail`, no la del
proveedor.

---

## 5 · Pestañas en la misma dirección

Siguen siendo **dos**, y se rebuscó por si había nacido alguna más.

| Pantalla | Parámetro |
|---|---|
| `/quality/risks?vista=oportunidades` | `quality.risks.opportunities` |
| `/traceability/inventory?vista=productos` | `cpr.traceability.inventory.products` |

### Cómo se buscaron las nuevas

Se enumeraron **todos** los `searchParams` declarados en las páginas del shell:

```
q · page · focus · created · updated · edit · version · lote_q · estado ·
vista · type · status · revision · proceso · output · notice · map · iq ·
input · from_indicator · dominio · category · bq · batch
```

De los veinticuatro, **`vista` es el único que cambia de superficie
funcional**. El resto selecciona un registro (`edit`, `batch`, `version`,
`map`), filtra una lista (`q`, `estado`, `category`, `status`, `type`,
`dominio`) o pagina (`page`).

Una prueba lo fija: pasar `?q=`, `?edit=`, `?page=` o `?version=` a una pantalla
**no cambia su clave**. Si alguien convirtiera un filtro en pestaña, esa prueba
seguiría en verde — pero la de cobertura pediría clasificarla, que es donde debe
saltar.

### Y las «pestañas» que no lo eran

Auditorías, Proveedores, Voz del cliente, Automatización, Revisión por la
dirección y Partes interesadas **se pintan como pestañas y son rutas de
verdad**, cada una con su dirección. Ahí `usePathname()` basta, y cada una tiene
su clave desde PE-03B4.

---

## 6 · Gana la más específica

Comprobado en tres formas distintas:

1. **Siete pares listado/ficha** de los tres módulos: ninguna ficha hereda el
   tutorial de su listado.
2. **Ocho rutas literales** que compiten con una de comodín de la misma
   longitud —`/textiles/circularity/assessments/new` contra
   `/textiles/circularity/assessments/[id]`—: gana la literal en las ocho.
3. **Las 152 claves** resuelven a sí mismas.

Y en el otro sentido: **las 37 excluidas resuelven a `null`**. Ninguna se cuela
por parecerse a una registrada.

---

## 7 · Las etiquetas son para personas

Se revisaron las 152 buscando jerga de desarrollo:

| | Resultado |
|---|---|
| Etiquetas que son una ruta | **0** |
| Con guion bajo o corchetes | **0** |
| Iguales a su clave | **0** |
| En minúscula inicial | **0** |
| Repetidas | **0** |
| Con nomenclatura retirada por RH-01.3 | **0** |

La última se ganó a golpes: tres etiquetas de PE-03B4 decían «lote de salida» y
«orden de producción», y el guardián de RH-01.3 las señaló por nombre y línea.
Ahora la prueba de cobertura lo comprueba también, para que no vuelva a colarse
por el camino de las etiquetas.

**Ninguna clave se renombró para mejorar una etiqueta.** Son dos cosas
independientes a propósito: la etiqueta se puede mejorar cuando se quiera; la
clave, no.

---

## 8 · La prueba, y lo que le pasa cuando nace una pantalla

`tests/unit/pe03b5-coverage.test.ts` — 26 comprobaciones.

Se verificó en PE-03B4 creando una pantalla real: la suite de cobertura pasa de
verde a rojo y la nombra. Ese comportamiento no cambió.
