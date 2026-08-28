# QUALITY-12.2F · Validación

> **Estado: pendiente de la validación humana.** Cinco comprobaciones visuales,
> **sin gastar una sola llamada al proveedor**.

---

## Por qué este sprint no necesita OpenAI

Lo que se construye es medición, límites y coste. Los límites se prueban con el
doble determinístico igual de bien que con el proveedor real —lo que se cuenta
son operaciones, no tokens—, y la fórmula de coste se comprueba con números
redondos que no requieren llamar a nadie.

Las 94 comprobaciones automáticas corren sin proveedor. Y el Preview de esta
rama **resuelve al doble**: recibe la credencial pero no `QUALITY_AI_PROVIDER`,
así que pulsar no cuesta dinero.

Si en algún momento quieres confirmar la contabilidad con una llamada real,
basta **una**: se verá aparecer con sus tokens y su coste en la consola.

---

## El entorno

| | |
|---|---|
| Rama | `feature/quality-12-2f-intelligence-usage-and-cost` |
| Local · Staging · **Production** | **0140 · 0140 · 0111 sin tocar** |
| Proveedor en el Preview | doble determinístico · **sin consumo** |

---

## Las cinco comprobaciones

### 1 · Consola de plataforma

**Dónde:** `/platform/intelligence`

Debe verse: tres bloques con títulos distintos —**Observado por empresa**,
**Observado por capacidad** y **Previsión · lo que costaría, no lo que
costó**—, y la tabla de previsión con los cinco tamaños de flota.

**Lo que hay que mirar con lupa:** que la previsión **no se pueda confundir** con
consumo. Va con borde discontinuo, con su advertencia debajo, y dice que las
columnas son empresas y no personas usándolo a la vez.

**Lo que no puede aparecer:** ni una letra de una pregunta o de una respuesta.

### 2 · Vista del administrador de empresa

**Dónde:** Configuración › Datos de empresa, al final.

Debe verse: **Uso de Trazaloop Intelligence**, las operaciones del mes, una
barra, el desglose por capacidad y la frase de que es un límite técnico de
seguridad.

**Lo que NO puede aparecer:** ningún dólar, ningún token, ninguna clase de
coste. Una empresa compra Trazaloop, no tokens de un proveedor.

### 3 · Estado de umbral

**Dónde:** la misma tarjeta.

Con uso normal, la barra va en azul y dice «Uso normal». Para ver los otros
estados hace falta acercarse al tope; si quieres verlo sin operar, pídeme que
baje el límite de la empresa de pruebas y la barra pasará a ámbar con «Cerca del
máximo de este mes».

### 4 · Límite alcanzado

Con el límite de la empresa de pruebas puesto por debajo de su consumo, cualquier
operación de Intelligence debe decir:

> Tu empresa ha alcanzado el máximo mensual de operaciones de Intelligence.
> Escríbenos si necesitas ampliarlo.

Y **no** debe llamar al proveedor: la decisión se toma antes.

### 5 · Full y Extra, iguales

Cambia el módulo de la empresa de pruebas de Full a Extra. **No debe cambiar
nada**: ni los límites, ni lo que se puede hacer, ni lo que dice la tarjeta.

Es la comprobación que impide que este sprint se convierta, sin querer, en un
plan comercial nuevo.

---

## Lo que ya está comprobado y no necesitas repetir

| | |
|---|---|
| Cincuenta peticiones simultáneas con límite de cinco | pasan exactamente cinco |
| Un run colgado de hace una hora | no bloquea a la empresa |
| Demo con presupuesto de sobra | sigue sin acceso |
| Un administrador intentando subirse el techo | no lo mueve |
| Una empresa mirando el consumo de otra | cero filas |
| La fórmula de coste | exacta con números redondos, y coincide en SQL y TypeScript |
| Un fallo del proveedor | no se cobra, pero cuenta como intento |
| El aviso de umbral | se emite una vez por mes y no lleva contenido |

---

## Lo que se rellenará después

<!-- Tras la validación humana. -->

- confirmación de las cinco comprobaciones;
- si se hace la llamada real opcional: su run, sus tokens y su coste tal como
  aparecen en la consola;
- cualquier ajuste que salga de mirarlo con ojos de persona.
