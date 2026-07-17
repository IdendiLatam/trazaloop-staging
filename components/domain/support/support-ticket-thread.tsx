import type { SupportMessageRow } from "@/lib/db/support";

/** Hilo de conversación — is_internal_note ya viene filtrado desde la
 *  capa de datos (RLS): un usuario de empresa nunca recibe notas
 *  internas en absoluto, así que esta vista no necesita volver a
 *  filtrar, solo distinguir visualmente cuando el que la ve SÍ puede
 *  verlas (plataforma). */
export function SupportTicketThread({ messages }: { messages: SupportMessageRow[] }) {
  if (messages.length === 0) {
    return <p className="text-sm text-ink-soft">Todavía no hay mensajes en este ticket.</p>;
  }

  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`rounded-lg border p-3 ${
            m.isInternalNote
              ? "border-amber/40 bg-amber/10"
              : m.authorType === "platform"
                ? "border-loop/30 bg-loop/5"
                : "border-hairline bg-surface"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-soft">
            <span className="font-medium text-ink">
              {m.authorName ?? (m.authorType === "platform" ? "Equipo de soporte" : "Empresa")}
              {m.isInternalNote ? " · Nota interna" : ""}
            </span>
            <span>{new Date(m.createdAt).toLocaleString("es-CO")}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
        </div>
      ))}
    </div>
  );
}
