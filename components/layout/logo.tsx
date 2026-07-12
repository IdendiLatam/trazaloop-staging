/**
 * Marca Trazaloop: glifo "loop" (lazo de trazabilidad que se cierra) +
 * wordmark. El glifo es la firma visual del producto.
 */
export function LoopMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* lazo abierto */}
      <path
        d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* punta que cierra el lazo: la trazabilidad vuelve al origen */}
      <path
        d="M16.6 7.2 20.9 8l-.8-4.3"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.1" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-semibold tracking-tight ${
        inverted ? "text-white" : "text-ink"
      }`}
    >
      <LoopMark className={`h-5 w-5 ${inverted ? "text-white" : "text-loop"}`} />
      <span className="text-lg">
        Traza<span className={inverted ? "text-emerald-200" : "text-loop"}>loop</span>
      </span>
    </span>
  );
}
