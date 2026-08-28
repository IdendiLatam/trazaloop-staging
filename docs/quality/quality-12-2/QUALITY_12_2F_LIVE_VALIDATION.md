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

## Las cinco pruebas · TODAS PASS

Preview usado tras el arreglo de la 0141:
`trazaloop-production-74g3kfjsy-…`, con la cuenta temporal
`qa-platform-intelligence@trazaloop-staging.local` en rol `support`.

**Sin una sola llamada a OpenAI.**

### 1 · Consola de plataforma — PASS

**66 operaciones · $0,033 estimados · media $0,0082 · 4 empresas con actividad.**

Por empresa, entre otras: «QUALITY-12.1 en vivo 41721770» con 30 operaciones,
29 llamadas, 54 759 de entrada, 13 309 de salida, 7 068 ms de latencia media.

Por capacidad: Pregunta a Intelligence 48 · Revisión contextual 6 · Mejora de
redacción 6 · Temas de la voz del cliente 5 · Hipótesis de causa raíz 1.

Previsión, separada. Ni un prompt, ni una respuesta, ni texto documental.

### 2 · Administrador de empresa — PASS

**30 de 10 000 operaciones · «Uso normal»**, con el desglose por capacidad y el
copy que dice que es un límite técnico de seguridad.

Sin dólares, sin tokens, sin razonamiento, sin clases de coste, sin economía
del proveedor. Nada de eso le sirve a quien compra Trazaloop.

### 3 · Umbral blando — PASS

Con la excepción de QA: **30 de 36 ≈ 83 %**. La tarjeta pasó a ámbar con «Cerca
del máximo de este mes» y avisó de la ampliación activa.

Y después una operación de Intelligence **respondió con normalidad**. Avisa, no
bloquea: es la mitad que se puede romper sin que nadie lo note.

### 4 · Tope duro — PASS

Con el techo igual al consumo, el intento devolvió:

> Tu empresa ha alcanzado el máximo mensual de operaciones de Intelligence.
> Escríbenos si necesitas ampliarlo.

Sin propuesta, sin llamada al proveedor, sin tocar el borrador.

### 5 · Full y Extra — PASS

Idénticos. El script está escrito para fallar ruidosamente si difieren.

---

## El blóquer de la prueba 1, contado entero

La **primera** ejecución de `/platform/intelligence` mostró **0 operaciones y
$0** con 282 runs en la base.

**No era un fallo de permisos: era su contrario.** La ruta autorizaba
—`is_platform_staff()` devolvía `true`— y la base devolvía cero. Las cuatro
vistas de 0140 se crearon con `security_invoker = true`, así que la RLS de
`quality_ai_runs` se evaluaba con la identidad de quien pregunta, y esa
política exige `is_org_member(organization_id)`. **Una persona de plataforma no
pertenece a ninguna empresa**, por diseño desde 0040.

Consulta exitosa. Cero filas. Sin error.

Y lo peligroso no fue el cero: fue que **no había forma de distinguirlo de «no
hay datos»**. Una consola de observabilidad que convierte una lectura denegada
en «no hay consumo» es peor que una que se cae, porque la primera se cree.

Se reprodujo antes de tocar nada, con un `support` real: `is_platform_staff()`
true, 282 runs, tres vistas devolviendo 0 sin error.

**El arreglo —0141— ya tenía precedente aquí**: la 0055 resolvió esto mismo
para `v_platform_organizations`. Vistas sin `security_invoker`, propiedad de
`postgres`, con `is_platform_staff()` dentro. Solo las de plataforma; las de
empresa siguen igual, porque ahí la RLS que devolvía cero es la que impide que
una empresa vea a otra.

Y `UsageRead<T>`: la lectura devuelve `{ok:true, rows}` o `{ok:false, error}`,
y la consola pinta «lo que se ve abajo **no es cero consumo**: es una lectura
que falló».

---

## La regresión que faltaba

La suite anterior comprobaba que una empresa **no** ve la consola. Eso se
cumple igual de bien cuando la vista devuelve cero a **todo el mundo**.

`test:quality122f-platform` prueba lo contrario: un `support` real, un
`superadmin`, un revocado, dos empresas con consumo, y exige que se vean los
datos. Verificado que **falla** —cinco comprobaciones en rojo— si se revierte la
vista al estado de 0140.

---

## Una regresión de identidad, también encontrada mirando

Durante la prueba del tope duro apareció un botón que decía **«Revisar contra
Trazaloop»**. Describe bien lo que hace y no es como se llama la capacidad
desde que 12.2E congeló la identidad.

Se escapó porque la comprobación de 12.2E solo miraba la etiqueta que sí se
había cambiado. Corregidas tres apariciones en runtime —el botón y dos mensajes
de error visibles—, todas desde la identidad compartida, y añadida `D2b`, que
mira **todas** las cadenas visibles de los dos paneles y prohíbe cualquier otra
forma de nombrar la capacidad. Comprobado que detecta la reaparición.

Sin migración: una etiqueta no justifica tocar la base.

---

## Limpieza

| | |
|---|---|
| Excepción de QA | revocada · el rastro histórico se conserva |
| Cuenta temporal de plataforma | `status = 'revoked'`, no `DELETE` |
| Plan de la empresa QA | restaurado por el propio script |
| Defaults globales | nunca se tocaron |

La verificación de los cuatro puntos está en
`qa/12_2F_QA_06_cierre.sql`.
