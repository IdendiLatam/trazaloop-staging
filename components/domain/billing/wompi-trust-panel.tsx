/**
 * Trazaloop · PE-05B2W4.1 · Por qué se puede escribir aquí una tarjeta.
 *
 * Nadie teclea dieciséis dígitos en una pantalla en la que no confía, y la
 * confianza no se pide: se explica. Este panel dice tres cosas y ninguna más:
 * quién cobra, qué NO llega a Trazaloop, y qué se queda guardado después.
 *
 * SOBRE LO QUE SE AFIRMA
 *
 * Cada frase es comprobable. «Trazaloop no recibe el número ni el CVC» es el
 * resultado de W4, no una promesa: hay una prueba que recorre todo el servidor
 * y falla si aparece un campo de tarjeta. Y la certificación se enuncia como lo
 * que es —de la pasarela, y en sus propias palabras— sin inventar insignias ni
 * añadir un nivel que su frase no dice.
 *
 * Lo que NO se dice, a propósito: «100 % seguro», «imposible de hackear»,
 * «seguridad de nivel bancario». Ninguna de las tres es cierta de nada, y una
 * promesa absoluta convierte un panel de confianza en publicidad.
 *
 * Y no hay iconos: el repositorio no usa librería de iconos, y meter una para
 * decorar cuatro frases sería pagar un paquete entero por adorno. Cada punto
 * lleva la misma marca discreta que ya usan las insignias del producto —que es
 * decorativa— porque lo que informa es el texto.
 */

const PUNTOS = [
  "Los datos de tu tarjeta viajan directamente a Wompi.",
  "Trazaloop no recibe ni almacena el número completo de tu tarjeta ni el CVC.",
  "Wompi cuenta con certificación PCI DSS para el procesamiento seguro de "
  + "pagos con tarjeta.",
  "Después del pago, Trazaloop conserva únicamente un identificador seguro del "
  + "medio de pago para gestionar futuras renovaciones.",
];

export function WompiTrustPanel() {
  return (
    <aside
      aria-labelledby="pago-seguro-titulo"
      className="space-y-4 rounded-lg border border-hairline bg-canvas p-4"
    >
      <div className="space-y-1">
        <p id="pago-seguro-titulo" className="eyebrow">Pago seguro con</p>
        {/*
          El logotipo oficial de Wompi todavía no está en el repositorio. Aquí
          va su nombre como texto —que es exacto y no falsifica nada— hasta que
          se incorpore la marca oficial. Dibujarla a mano sería inventarla.
        */}
        <p className="text-xl font-semibold tracking-tight">Wompi</p>
      </div>

      <p className="text-sm text-ink-soft">
        Estás pagando dentro de Trazaloop a través de Wompi, nuestra pasarela
        de pagos.
      </p>

      <ul className="space-y-3">
        {PUNTOS.map((texto) => (
          <li key={texto} className="flex gap-2 text-sm">
            {/* Decorativo: lo que informa es el texto, nunca la marca ni el color. */}
            <span aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-loop" />
            <span>{texto}</span>
          </li>
        ))}
      </ul>

      <p className="border-t border-hairline pt-3 text-xs text-ink-soft">
        Trazaloop define el plan y su precio y activa tu suscripción cuando el
        pago se confirma. Wompi recibe y procesa los datos de la tarjeta.
      </p>
    </aside>
  );
}
