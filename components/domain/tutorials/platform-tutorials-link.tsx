import Link from "next/link";

/**
 * Trazaloop · PE-03B4 · GAP 1 · «Tutoriales», sin salir de la empresa.
 *
 *
 * QUÉ SE OBSERVÓ
 *
 * La revisión humana del Preview encontró que al entrar a una empresa se
 * perdía el acceso a la administración de tutoriales. Y era cierto por dos
 * caminos distintos:
 *
 *   · la consola de plataforma NO nombraba «Tutoriales» en su propio menú
 *     —PE-03B2 lo añadió al menú del shell y se olvidó de este—, así que
 *     estando en `/platform` había que escribir la dirección;
 *
 *   · dentro de una empresa sí estaba, pero al fondo de la barra lateral,
 *     dentro de un grupo plegable llamado «Plataforma», detrás de trece
 *     entradas de módulo. Existía y no se encontraba, que para quien busca es
 *     lo mismo que no existir.
 *
 * Esto arregla el segundo. El primero se arregló en el propio menú.
 *
 *
 * POR QUÉ EN LA BARRA SUPERIOR
 *
 * Porque es donde ya viven las dos cosas que se buscan cuando uno se atasca:
 * «Ayuda» y «Ver video tutorial». Y porque la barra superior no cambia al
 * navegar entre pantallas del módulo: eso es lo que hace que el acceso sea
 * PERSISTENTE y no un enlace que aparece en algunas pantallas.
 *
 *
 * NO CONTAMINA LA NAVEGACIÓN DE LA EMPRESA
 *
 * Solo se pinta si quien mira es personal de plataforma. Para una persona
 * normal de una empresa este componente no devuelve nada: no está oculto por
 * CSS ni deshabilitado, no se pinta.
 *
 * Y va marcado como herramienta interna —el punto ámbar y el `title`— para que
 * un superadministrador que esté acompañando a un cliente sepa, de un vistazo,
 * que eso que ve en su pantalla no lo ve el cliente.
 *
 *
 * SON DOS COSAS DISTINTAS, Y SE LLAMAN DISTINTO
 *
 *   «Ver video tutorial»  →  ver el vídeo DE ESTA PANTALLA. Lo usa cualquiera.
 *   «Tutoriales»          →  ADMINISTRAR los vídeos. Solo personal de plataforma.
 *
 * Un superadministrador ve las dos, y por eso no pueden llamarse igual.
 */
export function PlatformTutorialsLink({ isStaff }: { isStaff: boolean }) {
  if (!isStaff) return null;

  return (
    <Link
      href="/platform/tutorials"
      title="Administrar los vídeos tutoriales · herramienta de plataforma"
      className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-2.5 py-0.5 text-xs font-medium text-amber hover:border-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden="true" />
      Tutoriales
    </Link>
  );
}
