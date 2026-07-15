// Ruta protegida: depende de cookies/sesión/Supabase → nunca se
// prerenderiza en build (Sprint 3.1). Fuera del shell de empresa.
export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlatformTrazadocBlueprintDetailAction } from "@/server/actions/trazadocs";
import { BlueprintDetailEditor } from "@/components/domain/trazadocs/blueprint-detail-editor";

export default async function PlatformTrazaDocBlueprintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: blueprint, canManage } = await getPlatformTrazadocBlueprintDetailAction(id);
  if (!blueprint) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="eyebrow">
          <Link href="/platform/trazadocs" className="hover:underline">
            Estructuras TrazaDocs
          </Link>
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{blueprint.name}</h1>
      </header>

      <BlueprintDetailEditor blueprint={blueprint} canManage={canManage} />
    </div>
  );
}
