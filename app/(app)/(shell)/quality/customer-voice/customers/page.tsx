export const dynamic = "force-dynamic";

// Trazaloop Quality · QUALITY-08 · Clientes.

import { requireQualityModule } from "@/lib/auth/require-quality-module";
import {
  listCustomerOverview, listPartiesWithoutCustomerRole,
} from "@/lib/db/quality-customer-voice";
import { listQualityPositions } from "@/lib/db/quality-processes";
import { canManageCustomerVoice } from "@/lib/domain/quality-customer-voice";
import { CustomerDirectory } from "@/components/domain/quality/customer-voice/customers";
import { VoiceSubnav } from "@/components/domain/quality/customer-voice/shared";

export const metadata = { title: "Clientes" };

export default async function CustomerVoiceCustomersPage() {
  const org = await requireQualityModule();
  const [customers, adoptable, positions] = await Promise.all([
    listCustomerOverview(org.organizationId, {}),
    listPartiesWithoutCustomerRole(org.organizationId),
    listQualityPositions(org.organizationId),
  ]);

  return (
    <div className="max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Trazaloop Quality</p>
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <p className="text-sm text-ink-soft">
          Un cliente es un papel de una empresa externa. La misma empresa puede ser
          cliente y proveedor a la vez, con una sola identidad.
        </p>
      </header>

      <VoiceSubnav current="customers" />

      <CustomerDirectory
        customers={customers}
        adoptable={adoptable}
        positions={positions.filter((p) => p.isActive).map((p) => ({ id: p.id, name: p.name }))}
        canManage={canManageCustomerVoice(org.roleCode)}
      />
    </div>
  );
}
