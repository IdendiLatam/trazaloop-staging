// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1).
export const dynamic = "force-dynamic";

import Link from "next/link";
import { listTrazadocBlueprintsAction } from "@/server/actions/trazadocs";
import { BlueprintPicker } from "@/components/domain/trazadocs/blueprint-picker";

export default async function NewTrazaDocPage() {
  const blueprints = await listTrazadocBlueprintsAction();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/trazadocs" className="hover:underline">
            TrazaDocs
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Nuevo documento</h1>
        <p className="max-w-2xl text-sm text-ink-soft">
          Elige una estructura sugerida para empezar con secciones ya definidas, o crea un
          documento libre con el nombre que quieras.
        </p>
      </header>

      <BlueprintPicker blueprints={blueprints} />
    </div>
  );
}
