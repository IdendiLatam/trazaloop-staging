# QUALITY-12.1 · Lo que cuesta, y cómo se ve

## Lo que se mide

Por cada consulta, `quality_ai_runs` guarda lo que el proveedor informe:

| Campo | Qué es |
|---|---|
| `input_tokens` | lo que se envió |
| `cached_input_tokens` | la parte de la entrada que el proveedor sirvió desde su caché **y factura distinto** |
| `output_tokens` | lo que se devolvió |
| `reasoning_tokens` | lo que el modelo gastó **pensando**, antes de responder |
| `total_tokens` | el total según el proveedor |

Dos advertencias que hacen falta para leer esto sin equivocarse:

**El total no es la suma.** Es lo que dice el proveedor, que es lo que se
factura. Si no coincide con sumar los demás, manda el suyo.

**Un hueco no es un cero.** Un proveedor que no informa el razonamiento deja el
campo en `null`, y la pantalla no muestra ese número. Poner cero diría «razonó
gratis», que es distinto de «no lo sabemos».

## Los tokens de razonamiento importan más de lo que parecen

No aparecen en la respuesta —el modelo los gasta antes de escribir— pero **se
cobran como salida**. Una consulta con `reasoning.effort` alto puede gastar
varias veces más de lo que la respuesta visible sugiere.

Es la razón de que el esfuerzo esté en `low` por omisión, y de que se guarde
aparte: sin ese número, la factura no cuadraría con lo que la aplicación cree
haber gastado y nadie sabría por qué.

## Dónde se ve

**Calidad → Copilot → Consumo**, para toda la empresa y el mes en curso:
consultas hechas y su tope, consultas propias de hoy y su tope, tokens de
entrada —con la parte en caché, si la hay—, y fallos del mes. Si hubo
razonamiento o total informado, aparece una segunda fila con la salida, la
parte razonada y el total del proveedor.

## Los topes siguen siendo los de QUALITY-12

`monthly_run_limit` por empresa y `daily_user_limit` por persona, comprobados
**antes** de llamar (§147). Un tope que se comprueba después de gastar no es un
tope.

Este sprint **no** cambió ningún tope ni inventó una decisión comercial sobre si
la IA se cobra aparte: §79 de QUALITY-12 pedía explícitamente no inventarla, y
sigue sin inventarse.

## Qué hacer si el consumo se dispara

Por orden de brusquedad:

1. **Bajar los topes** en Ajustes del Copilot. Efecto inmediato, sin desplegar.
2. **Apagar un uso**: `allow_customer` o `allow_people`.
3. **Apagar el Copilot** para esa empresa: `is_enabled = false`.
4. **Quitar la credencial** en Vercel: el Copilot pasa al doble determinístico
   en todas las empresas y lo dice en pantalla.

Ninguna de las cuatro pierde lo ya guardado.
