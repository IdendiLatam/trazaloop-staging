import Link from "next/link";

/**
 * QUALITY-12.3B3A · Subnavegación de partes interesadas.
 *
 * Dos entradas. Las categorías son configuración del dominio y no merecen
 * sitio en el menú lateral, pero sí tienen que ser encontrables: quien entra a
 * clasificar partes interesadas necesita poder crear la categoría que le
 * falta sin salir a buscarla por Ajustes.
 */
const TABS = [
  { key: "parties", href: "/quality/context/interested-parties", label: "Partes interesadas" },
  { key: "categories", href: "/quality/context/interested-parties/categories", label: "Categorías" },
] as const;

export function InterestedPartiesSubnav({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex flex-wrap gap-1 border-b border-hairline pb-2">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={
            "rounded-md px-3 py-1.5 text-sm "
            + (t.key === current
              ? "bg-canvas font-medium text-ink"
              : "text-ink-soft hover:text-ink")
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
