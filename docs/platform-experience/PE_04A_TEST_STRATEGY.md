# PE-04A · Cómo se va a comprobar PE-04

Ninguna de estas pruebas se escribe en PE-04A. Esto es qué hay que demostrar y
**a qué nivel**, que es la parte que se decide antes de teclear.

---

## 1 · El nivel importa más que el número

| Afirmación | Dónde | Por qué ahí |
|---|---|---|
| «Free no puede subir más de N MB» | **base real** | Una cuota se comprueba intentándolo. Leer el `.sql` no prueba nada |
| «Dos subidas simultáneas no se cuelan» | **base real, concurrente** | Una carrera no se demuestra razonando |
| «Bajar de plan no borra datos» | **base real** | Se cuentan las filas antes y después |
| «Ningún precio está en el código» | **estática** | Es una ausencia. Se vigila leyendo |
| «La ayuda no consulta el plan» | **estática** | Ausencia |
| «La consola y la subida dicen el mismo número» | **base real** | Es una coherencia entre capas |
| «El resolutor no miente al fallar» | **base real, con fallo provocado** | Hay que romper algo a propósito |

---

## 2 · Los invariantes que no pueden caerse

Cada uno con la forma exacta de la prueba.

### I1 · Entitlement y autorización son ejes independientes

Cuatro casos, no dos:

| Plan | Rol | Resultado |
|---|---|---|
| Full | sin permiso | **RECHAZADO** — pagar no da permisos |
| Free | administrador | **RECHAZADO** — mandar no compra |
| Full | administrador | permitido |
| Free | sin permiso | rechazado, y **por las dos razones** |

El cuarto importa: hay que comprobar que se deniega con el motivo correcto y no
por casualidad.

### I2 · Un solo número

Para una empresa dada, el límite que devuelven **la consola**, **la tarjeta de
uso** y **el que aplicaría una subida** son el mismo. Es la prueba que hoy
fallaría: la consola diría 50 MB y la subida 500.

### I3 · No disponible ≠ Free

Se rompe la lectura del plan a propósito y se comprueba que:

- la capacidad de pago **se deniega**;
- la respuesta es `ENTITLEMENT_UNAVAILABLE`, **no** «eres Free»;
- ninguna pantalla enseña un nombre de plan.

### I4 · Bajar de plan no borra nada

Se cuentan documentos, evidencias y bytes antes; se baja el plan; se vuelven a
contar. **Iguales.** Y una subida nueva se rechaza.

### I5 · Concurrencia en el borde

Con `restante = 1`, dos operaciones simultáneas de verdad —`Promise.all`, no
secuenciales— y exactamente **una** pasa. Para almacenamiento, conteos y, cuando
exista, cuota de IA.

### I6 · La ayuda nunca se cobra

Estática: ninguna acción de FAQ, ayuda contextual o tutoriales importa el
resolutor de entitlements. Ya hay pruebas de PE-02 y PE-03 que lo vigilan y
**siguen valiendo**; PE-04 solo tiene que no romperlas.

### I7 · Ningún precio en el código

Estática: ningún literal de precio en `lib/`, `components/`, `app/`. Cambiar el
precio de Full **no puede** exigir tocar código, y la prueba lo demuestra
cambiando el valor en la base y comprobando que la pantalla cambia.

### I8 · La historia comercial no se reescribe

Se publica la revisión 2 de un plan y se comprueba que la 1 conserva su precio,
sus límites y sus fechas, y que una empresa asignada a la 1 **sigue** en la 1.

### I9 · Nadie pierde acceso en la migración

Para cada empresa y cada módulo: el acceso resuelto después ≥ antes. Se ejecuta
sobre una copia con las siete categorías representadas.

### I10 · La ventana se reinicia cuando se dice

Con la zona horaria de la empresa: si dice «se reinicia a las 00:00 de Bogotá»,
a las 23:00 de Bogotá el contador **no** se ha reiniciado.

### I11 · Los medios de plataforma no consumen cuota de nadie

Ya verificado en PE-03B5 contra la definición de la vista. Se conserva.

### I12 · Aislamiento entre empresas

El plan es compartido; la asignación y el uso, no. Una empresa no lee la
asignación ni el uso de otra, aunque tengan el mismo plan.

---

## 3 · Suites previstas

| Suite | Nivel | Qué cubre |
|---|---|---|
| `pe04-plan-catalog` | base | Catálogo, revisiones, inmutabilidad, publicación |
| `pe04-entitlement-resolver` | base | El resolutor: plan, sin derecho, no disponible |
| `pe04-assignment-migration` | base | Las siete categorías · I9 |
| `pe04-storage-quota` | base | I2, I4, I5 |
| `pe04-ai-limits` | base | Cuota comercial, guarda de coste, los cuatro fallos |
| `pe04-daily-use` | base | Ventanas, zona horaria, I10 |
| `pe04-support-entitlements` | base | Qué categoría puede abrir cada plan |
| `pe04-commercial-static` | **en `test:all`** | I6, I7, público/interno, sin PE-05 |
| `pe04-rls-isolation` | base | I12 |

---

## 4 · Lo que NO se prueba en PE-04

- Pasarela de pago, cupones, facturación, impuestos. **PE-05.**
- Que el precio sea el correcto comercialmente. Eso lo decide una persona.
- Que los límites sean los adecuados. Ídem — se prueba que se **aplican**, no
  que sean buenos.

---

## 5 · Las trampas que este repositorio ya conoce

Escritas porque volverían solas.

**Contar contra el catálogo, no contra el uso.** «Cuántas empresas tienen Full»
no prueba que Full funcione.

**Leer el texto de las migraciones en vez del estado.** Las migraciones son
acumulativas: su texto es la historia. Lo que rige lo dice `pg_constraint`.
PE-03B5 cayó en esto y hubo que corregirlo.

**Dos suites sobre la misma identidad.** Si dos suites publican revisiones del
mismo plan, la segunda ve las de la primera. Cada suite, su propio plan de
pruebas. También lección de PE-03B5.

**Suites que dejan cuentas privilegiadas.** Quien crea un acceso privilegiado lo
cierra. Lección del cierre de PE-03.

**Afirmar que algo es inalcanzable.** Se comprueba **por construcción**: no
«hoy no aparece», sino «no hay camino que lleve hasta ahí».

**Falsos positivos de subcadena.** Buscar `demo` encuentra `demonstration`;
buscar `plan` encuentra `quality_development_plans`. Palabra completa, y sin
comentarios.
