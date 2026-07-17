// Página pública: no requiere sesión (legal_documents_select_public,
// 0066, permite lectura a `anon`). Ver también app/legal/page.tsx (el
// "acerca de", una página distinta).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveLegalDocumentByType } from "@/lib/db/legal";
import { Wordmark } from "@/components/layout/logo";

export const metadata = { title: "Términos de uso — Trazaloop" };

export default async function TermsPage() {
  const doc = await getActiveLegalDocumentByType("terms");
  if (!doc) notFound();

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Wordmark />
      <p className="eyebrow mt-6">{doc.version}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{doc.title}</h1>
      <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-ink">{doc.content}</div>
      <footer className="mt-10 border-t border-hairline pt-4 text-xs text-ink-soft">
        <p>
          <Link href="/privacy" className="text-loop hover:underline">
            Ver política de privacidad
          </Link>
          {" · "}
          <Link href="/" className="text-loop hover:underline">
            Volver al inicio
          </Link>
        </p>
      </footer>
    </main>
  );
}
