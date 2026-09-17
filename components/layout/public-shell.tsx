import Link from "next/link";
import { Wordmark } from "@/components/layout/logo";
import { PublicMobileNav } from "@/components/layout/public-mobile-nav";

/**
 * Trazaloop · COMMERCIAL-UX-01C · La cáscara de lo público.
 *
 *
 * EL DEFECTO QUE ESTO CIERRA
 *
 * Había cuatro páginas públicas —la portada, la FAQ, los términos y la
 * privacidad— y cuatro cabeceras distintas escritas a mano. La portada llevaba
 * «Ayuda · Iniciar sesión», la FAQ otra cosa, y términos y privacidad solo el
 * logotipo, sin forma de volver ni de entrar.
 *
 * No es un problema estético. Significa que añadir un enlace —«Planes y
 * precios», sin ir más lejos— obliga a acordarse de cuatro sitios, y que el
 * cuarto que se olvide deja a alguien sin camino. La navegación de un producto
 * no puede depender de la memoria de quien edita.
 *
 *
 * QUÉ ENTRA Y QUÉ NO
 *
 * Entra lo que toda página pública necesita: marca, navegación, entrada a la
 * plataforma y pie legal. No entra nada de sesión: esta cáscara NO lee al
 * usuario ni redirige. Quien quiera cambiar el destino del botón de entrada lo
 * pasa por parámetro, que es lo que ya hacía la portada.
 *
 * Es deliberado: si la cáscara leyera la sesión, cualquier página que la use
 * heredaría una dependencia de autenticación sin pedirla, y el día que alguien
 * se equivocara al leerla convertiría en privada una página que no lo es.
 *
 *
 * NO SE MIGRAN LAS CUATRO RUTAS EN ESTE TRAMO
 *
 * Se construye la cáscara y se usa donde aporta sin riesgo. Reescribir cuatro
 * páginas públicas que hoy funcionan, en el mismo tramo en que nace el
 * componente, sería cambiar dos cosas a la vez y no saber cuál rompió qué.
 */

export type PublicNavItem = {
  href: string;
  label: string;
  /** Marca el destino actual para lectores de pantalla y para el ojo. */
  current?: boolean;
};

/**
 * La navegación pública canónica.
 *
 * UNA lista. Que sea una sola es justamente el arreglo: añadir un destino se
 * hace aquí y aparece en todas las páginas que usen la cáscara.
 */
export const PUBLIC_NAV_ITEMS: readonly PublicNavItem[] = [
  { href: "/", label: "Inicio" },
  { href: "/planes", label: "Planes y precios" },
  // «Preguntas frecuentes», no «Ayuda». PE-02B6 fijó los dos nombres: dentro
  // del producto la entrada global se llama «Ayuda», y desde fuera se llama
  // «Preguntas frecuentes», que es por lo que la busca quien todavía no es
  // cliente. Una prueba se pone roja si se cruzan.
  { href: "/faq", label: "Preguntas frecuentes" },
];

export const PUBLIC_FOOTER_ITEMS: readonly PublicNavItem[] = [
  { href: "/faq", label: "Preguntas frecuentes" },
  { href: "/legal", label: "Acerca de Trazaloop" },
  { href: "/terms", label: "Términos de uso" },
  { href: "/privacy", label: "Política de privacidad" },
];

export function PublicHeader({
  currentPath,
  entryHref = "/login",
  entryLabel = "Iniciar sesión",
  action,
}: {
  currentPath?: string;
  /** A dónde lleva entrar. La portada ya calcula esto según haya sesión. */
  entryHref?: string;
  entryLabel?: string;
  /**
   * Una llamada a la acción propia de la página. La portada trae la suya
   * —«Crear cuenta Demo», o «Solicitar acceso» con el registro cerrado— y esa
   * decisión depende de un interruptor de servidor que la cáscara no debe
   * conocer. Se recibe hecha en vez de replicar aquí la condición.
   */
  action?: React.ReactNode;
}) {
  const items = PUBLIC_NAV_ITEMS.map((i) => ({
    ...i,
    current: currentPath !== undefined && i.href === currentPath,
  }));

  return (
    // `banner` y `navigation` son los puntos de referencia por los que un
    // lector de pantalla salta directamente. Sin ellos hay que recorrer la
    // página entera para encontrar el menú.
    <header className="border-b border-hairline bg-paper">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/"
          aria-label="Trazaloop · ir al inicio"
          className="rounded-md focus-visible:outline focus-visible:outline-2
                     focus-visible:outline-offset-2 focus-visible:outline-loop"
        >
          <Wordmark />
        </Link>

        {/* En móvil se esconde esta navegación y sale la del botón. Se
            esconde con `hidden`, no con ancho cero: un enlace invisible pero
            enfocable deja el tabulador cayendo en sitios que no se ven. */}
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={i.current ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm transition-colors
                          focus-visible:outline focus-visible:outline-2
                          focus-visible:outline-offset-2 focus-visible:outline-loop
                          ${i.current
                            ? "font-semibold text-loop"
                            : "text-ink-soft hover:text-loop"}`}
            >
              {i.label}
            </Link>
          ))}
          <Link
            href={entryHref}
            className="ml-2 rounded-md bg-loop px-4 py-2 text-sm font-semibold
                       text-white hover:bg-loop-deep focus-visible:outline
                       focus-visible:outline-2 focus-visible:outline-offset-2
                       focus-visible:outline-loop"
          >
            {entryLabel}
          </Link>
          {action}
        </nav>

        <PublicMobileNav
          items={items}
          entryHref={entryHref}
          entryLabel={entryLabel}
        />
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-hairline">
      <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-ink-soft">
        <nav aria-label="Enlaces legales y de ayuda">
          <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {PUBLIC_FOOTER_ITEMS.map((i, n) => (
              <li key={i.href} className="flex items-center gap-2">
                {n > 0 ? <span aria-hidden="true">·</span> : null}
                <Link
                  href={i.href}
                  className="text-loop hover:underline focus-visible:outline
                             focus-visible:outline-2 focus-visible:outline-offset-2
                             focus-visible:outline-loop"
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

/**
 * La página pública entera: cabecera, contenido y pie.
 *
 * `main` con `id` para que el salto de teclado tenga a dónde ir, y la columna
 * en `flex` para que el pie se quede abajo también en páginas cortas —términos
 * y privacidad lo son— sin recurrir a alturas fijas.
 */
export function PublicShell({
  children,
  currentPath,
  entryHref,
  entryLabel,
  action,
}: {
  children: React.ReactNode;
  currentPath?: string;
  entryHref?: string;
  entryLabel?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Lo primero que recibe el foco. Para quien navega con teclado, la
          diferencia entre entrar al contenido y recorrer toda la navegación en
          cada página. Invisible hasta que se enfoca. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4
                   focus:z-50 focus:rounded-md focus:bg-loop focus:px-4 focus:py-2
                   focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>
      <PublicHeader
        currentPath={currentPath}
        entryHref={entryHref}
        entryLabel={entryLabel}
        action={action}
      />
      <main id="contenido" className="flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
