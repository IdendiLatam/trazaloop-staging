import { Wordmark } from "@/components/layout/logo";

/**
 * Layout de autenticación: riel de marca a la izquierda (desktop) y tarjeta
 * centrada. El riel enuncia el trabajo del producto en una sola frase.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[2fr_3fr]">
      <aside className="hidden flex-col justify-between bg-loop-deep p-10 text-white lg:flex">
        <Wordmark inverted />
        <div className="space-y-3">
          <p className="eyebrow !text-emerald-200/80">
            NTC 6632 · UNE-EN 15343
          </p>
          <h1 className="max-w-sm text-3xl font-semibold leading-snug tracking-tight">
            Pasa de declarar contenido reciclado a poder demostrarlo.
          </h1>
          <p className="max-w-sm text-sm leading-relaxed text-emerald-100/80">
            Trazabilidad lote a lote, evidencias y cálculo defendible para
            prepararte frente a auditorías y revisión de cumplimiento normativo.
          </p>
        </div>
        <p className="code text-xs text-emerald-200/60">
          trazaloop · núcleo v0.1
        </p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
