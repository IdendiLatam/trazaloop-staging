// Ruta protegida (el guard corre en el layout del namespace /textiles).
export const dynamic = "force-dynamic";

// Trazaloop · Sprint T1 (Textil) · Inicio PRIVADO del módulo.
// Sprint T9E: T1–T9D dejaron funcionales todas las secciones — el inicio
// deja de comunicar "módulo en preparación" y presenta el módulo completo.
// Nada aquí muestra datos falsos ni promete certificación o cumplimiento.

import Link from "next/link";

export default function TextilesHomePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Módulos · Trazaloop Textiles</p>
        <h1 className="text-2xl font-semibold tracking-tight">Trazaloop Textiles</h1>
        <p className="text-sm text-ink-soft">
          Trazabilidad de productos de confección, composición de fibras, evidencias,
          circularidad y pasaporte técnico textil, con aislamiento por organización.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Secciones disponibles</h2>
        <Link
          href="/textiles/diagnostic"
          className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
        >
          <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Disponible
          </span>
          <span className="text-sm font-semibold">Diagnóstico Textil</span>
          <span className="text-xs text-ink-soft">
            Evaluación interna de preparación en 12 dimensiones del sector confección:
            nivel de madurez, puntaje por dimensión y brechas priorizadas.
          </span>
          <span className="text-sm font-medium text-loop">Ir al diagnóstico →</span>
        </Link>
        <Link
          href="/textiles/catalogs"
          className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
        >
          <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Disponible
          </span>
          <span className="text-sm font-semibold">Catálogos textiles</span>
          <span className="text-xs text-ink-soft">
            Proveedores, fibras, materiales e insumos, avíos/componentes y procesos —
            la base que alimentará productos, evidencias, circularidad y pasaporte.
          </span>
          <span className="text-sm font-medium text-loop">Ir a los catálogos →</span>
        </Link>
        <Link
          href="/textiles/products"
          className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
        >
          <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Disponible
          </span>
          <span className="text-sm font-semibold">Productos textiles</span>
          <span className="text-xs text-ink-soft">
            Colecciones, productos, referencias/SKU y composición estructurada de fibras —
            la base de trazabilidad, evidencias y pasaporte técnico.
          </span>
          <span className="text-sm font-medium text-loop">Ir a productos →</span>
        </Link>
        <Link
          href="/textiles/evidences"
          className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
        >
          <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Disponible
          </span>
          <span className="text-sm font-semibold">Evidencias textiles</span>
          <span className="text-xs text-ink-soft">
            Soportes documentales de composición, origen, proveedores, procesos y
            declaraciones preliminares, vinculados a tus entidades textiles.
          </span>
          <span className="text-sm font-medium text-loop">Ir a evidencias →</span>
        </Link>
        <Link
          href="/textiles/traceability"
          className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
        >
          <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Disponible
          </span>
          <span className="text-sm font-semibold">Trazabilidad textil</span>
          <span className="text-xs text-ink-soft">
            Órdenes/corridas de confección, lotes de entrada, consumos y lotes
            producidos/finales con sus brechas documentales.
          </span>
          <span className="text-sm font-medium text-loop">Ir a trazabilidad →</span>
        </Link>
        <Link
          href="/textiles/circularity"
          className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
        >
          <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Disponible
          </span>
          <span className="text-sm font-semibold">Evaluación de circularidad textil</span>
          <span className="text-xs text-ink-soft">
            Evaluación técnica interna de preparación circular por referencia/SKU y lote:
            composición, evidencias, separabilidad, reutilización y reciclabilidad. No es
            certificación ni pasaporte.
          </span>
          <span className="text-sm font-medium text-loop">Ir a circularidad →</span>
        </Link>
        <Link
          href="/textiles/trazadocs"
          className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
        >
          <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Disponible
          </span>
          <span className="text-sm font-semibold">TrazaDocs Textil</span>
          <span className="text-xs text-ink-soft">
            Documentación técnica de trazabilidad, evidencias, declaraciones ambientales y
            preparación circular: 12 estructuras base con secciones, tips y control de
            versiones. Herramienta de preparación documental, no de certificación.
          </span>
          <span className="text-sm font-medium text-loop">Ir a TrazaDocs Textil →</span>
        </Link>
        <Link
          href="/textiles/passports"
          className="flex flex-col gap-1 rounded-lg border border-loop/30 bg-loop/5 p-4 transition-colors hover:border-loop"
        >
          <span className="inline-flex w-fit rounded-full border border-loop/30 bg-surface px-2 py-0.5 text-[11px] font-medium text-loop-deep">
            Disponible
          </span>
          <span className="text-sm font-semibold">Pasaporte técnico textil</span>
          <span className="text-xs text-ink-soft">
            Consolida en un pasaporte técnico —por referencia/SKU y lote opcional— la
            composición, materiales, proveedores, evidencias, trazabilidad, circularidad y
            TrazaDocs, con brechas y advertencias. Herramienta interna de preparación
            documental, no certificación ni pasaporte oficial.
          </span>
          <span className="text-sm font-medium text-loop">Ir a pasaportes técnicos →</span>
        </Link>
      </section>

      <p className="max-w-2xl text-xs text-ink-soft">
        Trazaloop Textiles organiza información, evidencias y brechas como preparación y
        soporte documental. No certifica productos ni procesos, no verifica como tercera
        parte ni garantiza cumplimiento regulatorio.
      </p>
    </div>
  );
}
