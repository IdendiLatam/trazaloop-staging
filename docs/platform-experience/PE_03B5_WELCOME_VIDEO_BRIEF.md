# PE-03B5 · Guion de producción del vídeo de bienvenida

> **Esto es un encargo, no un vídeo.** No se ha generado ningún medio.

---

## 1 · Para qué existe

Para que quien entra por primera vez sepa **qué es Trazaloop** antes de que le
pidan que registre algo.

No es un tutorial de pantalla. Los tutoriales explican *cómo se hace esto*; la
bienvenida explica *dónde estoy y qué me van a pedir*. Si los confundimos, la
bienvenida se convierte en un curso y nadie la termina.

---

## 2 · Duración recomendada: 90 segundos

Entre 60 y 120. Ni uno más.

Trazaloop **no impone duración máxima** —eso es una decisión de producto que se
revocó a propósito— y precisamente por eso hay que decidir una editorialmente. Es
lo primero que ve alguien que todavía no sabe si esto le va a servir: a los dos
minutos, la paciencia es prestada.

Y hay una razón concreta: el diálogo tiene un botón que dice «No volver a
mostrar». Un vídeo largo lo convierte en el botón más pulsado del producto.

---

## 3 · Los cuatro mensajes, en este orden

**1 · Trazaloop es una plataforma con módulos.** Quality, PCR, Textiles y
Construcción. Su empresa tiene los que tiene, y eso está bien: no se entra a lo
que no se contrató, y la puerta lo dice sin letra pequeña.

**2 · Lo que se registra una vez, sirve muchas.** Es la idea que ahorra más
trabajo y la que menos se entiende sola. Un proceso alimenta el mapa; una
evidencia sostiene un cálculo; un lote produce trazabilidad. No hay que
mantener nada dos veces.

**3 · Trazaloop no certifica.** Prepara, ordena y demuestra. Quien certifica es
un organismo externo. Decirlo aquí evita una decepción cara más adelante — y es
coherente con lo que ya dice la ayuda pública.

**4 · Dónde pedir ayuda.** «Ayuda» y «Ver video tutorial» están arriba en todas
las pantallas. Enseñarlos una vez vale más que repetirlos en cada tutorial.

Cierre: **«Empiece por su módulo.»** Y el diálogo se cierra sobre la puerta,
que ya está debajo.

---

## 4 · Qué NO incluir

| | Por qué |
|---|---|
| Precios, planes o límites | La bienvenida no vende. Y lo comercial cambia más rápido que un vídeo |
| Nombres de proveedores de infraestructura | Ni Supabase, ni Vercel, ni el modelo de IA de turno |
| Cifras de capacidad | «Hasta N GB» es del proveedor, no de Trazaloop, y caduca |
| Numerales de la norma | «Cláusula 4.2» le dice algo a un auditor y a nadie más |
| Un recorrido pantalla por pantalla | Eso son los tutoriales. Aquí se sitúa, no se enseña |
| Datos reales de un cliente | Se graba sobre datos de demostración. Siempre |
| Fechas, versiones o «novedades» | Un vídeo con fecha nace caducando |
| Voz que dé por hecho el módulo | «Su panel de Quality» no vale para quien solo tiene PCR |

---

## 5 · Forma

- **Con voz y con texto en pantalla.** Se ve en oficinas y sin sonido.
- **Sin música que tape la voz.** Y sin música si no aporta.
- **Sin reproducción automática** — el producto ya lo garantiza, pero conviene
  que el primer segundo no dependa de que suene.
- **MP4 o WebM.** Son los dos que un navegador reproduce sin ayuda.
- Legible en móvil: el diálogo se usa ahí también.

---

## 6 · Subtítulos

**Recomendados, y todavía no obligatorios.** La arquitectura los admite —la
versión guarda metadatos y el objeto es inmutable, así que una pista de
subtítulos entra como un campo más sin tocar el modelo—, pero PE-03 no los
implementó.

Está anotado como pendiente de accesibilidad en
[PE_03_FINAL_CLOSURE.md](PE_03_FINAL_CLOSURE.md), no como bloqueante. Mientras
tanto, **el texto en pantalla es lo más cerca que se puede estar**, y por eso
está en §5.

---

## 7 · Cómo se publica

1. `/platform/tutorials` → «Bienvenida a Trazaloop».
2. Subir. **Subir no publica**: la versión queda lista para revisar.
3. Verla en la vista previa.
4. Publicar.

Aparece sin desplegar. Y quien ya pulsó «No volver a mostrar» **no la verá**,
aunque sea la primera versión que se publica para él — es una decisión de esa
persona y no se revierte publicando.

---

## 8 · Cuando haya una versión nueva

Se sube y se publica igual. La anterior queda archivada con su periodo cerrado y
su vídeo intacto, y se puede reponer.

Lo que **no** pasa: nadie vuelve a ver la bienvenida por haberse publicado una
versión nueva si pidió no volver a verla. Eso está congelado y sostenido por la
base, no por una decisión de pantalla.
