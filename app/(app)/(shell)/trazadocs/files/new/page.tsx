// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { UploadFileDocumentForm } from "@/components/domain/trazadocs/upload-file-document-form";

export default function NewFileDocumentPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/trazadocs/master" className="hover:underline">
            Maestro de documentos
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Agregar documento descargable</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Para procedimientos o formatos que se diligencian dentro de Trazaloop, usa{" "}
          <Link href="/trazadocs/new" className="text-loop hover:underline">
            crear documento TrazaDocs
          </Link>{" "}
          en su lugar. Esto es para archivos externos controlados (PDF, Word, Excel, imágenes) que
          la empresa sube tal cual y versiona aquí.
        </p>
      </header>

      <UploadFileDocumentForm />
    </div>
  );
}
