import Link from "next/link";

/**
 * Trazaloop Quality · QUALITY-07 · Subnavegación de proveedores.
 *
 * Cuatro entradas, no quince. Categorías, plantillas y requisitos son
 * configuración del dominio, no destinos de primer nivel: quien entra a
 * Proveedores viene a mirar proveedores.
 */
const TABS = [
  { key: "suppliers", href: "/quality/suppliers", label: "Proveedores" },
  { key: "categories", href: "/quality/suppliers/categories", label: "Categorías" },
  { key: "evaluations", href: "/quality/suppliers/evaluations", label: "Evaluaciones" },
  { key: "reevaluations", href: "/quality/suppliers/reevaluations", label: "Reevaluaciones" },
] as const;

export function SupplierSubnav({ current }: { current: (typeof TABS)[number]["key"] }) {
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
