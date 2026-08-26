export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-07 · Ficha del proveedor.

import { notFound } from "next/navigation";
import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  getSupplierFile, listSupplierCategories, listSupplierTemplates, supplierRequirementsOn,
  todayIso,
} from "@/lib/db/quality-suppliers";
import { getDeletionEligibility } from "@/lib/db/lifecycle";
import { listMethodologies } from "@/lib/db/risks";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canDecideSupplierApproval, canManageSuppliers } from "@/lib/domain/quality-suppliers";
import { SupplierFileView } from "@/components/domain/quality/suppliers/supplier-file";

export const metadata = { title: "Ficha de proveedor" };

export default async function QualitySupplierFilePage(
  { params }: { params: Promise<{ profileId: string }> }
) {
  const { profileId } = await params;
  const org = await requireQualityModule();

  // Si RLS no entrega la ficha, la respuesta es la misma que si no existiera.
  const file = await getSupplierFile(org.organizationId, profileId);
  if (!file) notFound();

  const today = todayIso();
  const [categories, templates, methodologies, positions, eligibility, requirementsByScope] =
    await Promise.all([
      listSupplierCategories(org.organizationId),
      listSupplierTemplates(org.organizationId),
      listMethodologies(org.organizationId, "supplier_criticality"),
      listQualityPositions(org.organizationId),
      getDeletionEligibility("supplier", profileId),
      Promise.all(file.scopes.map(async (s) => ({
        scopeId: s.scopeId,
        items: await supplierRequirementsOn(org.organizationId, s.scopeId, today),
      }))),
    ]);

  return (
    <div className="max-w-5xl">
      <SupplierFileView
        file={file}
        categories={categories.filter((c) => c.isActive)}
        templates={templates.filter((t) => t.isActive)}
        methodologies={methodologies.filter((m) => m.isActive)}
        requirementsByScope={requirementsByScope.filter((r) => r.items.length > 0)}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        eligibility={eligibility}
        canManage={canManageSuppliers(org.roleCode)}
        canDecide={canDecideSupplierApproval(org.roleCode)}
        today={today}
      />
    </div>
  );
}
